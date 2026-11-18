import { useIsFetching, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { categoryOrderRows } from '#/lib/category-order'
import type { OrderRow } from '#/lib/category-order'
import { categoryLabel } from '#/lib/category-tabs'
import { setCategoryOrder } from '#/server/functions/set-category-order'
import { ALL } from '#/shared/categories'
import { Skeleton } from '#/shared/ui/skeleton'
import { callFn } from '#/state/call-fn'
import {
  selectCategories,
  useCategoryCounts,
  useMaindata,
} from '#/state/maindata'
import {
  SETTINGS_KEY,
  categoryOrderOp,
  refreshSettings,
  useSettings,
} from '#/state/settings'
import { sendOp, useOpsInFlight } from '#/state/tracked-op'

// Story 3.3: the category tab order. 「全部」 is fixed first with no arrows;
// below it every category (categoryOrderRows: qBittorrent's map plus those
// torrents use, uncategorized when used) in the tabs' order. Each row has
// up and down arrows; the first row's up and the last row's down are
// disabled. A press sends the move (categoryOrderOp, which builds the
// whole new order from the current settings when the call runs) and moves
// nothing itself (AD-7): the list and the tab row take their order from
// the answer written into `['settings']`. While its save is in flight that
// row's arrows wait (`aria-disabled`, so the pressed one keeps focus), and
// every arrow waits while the settings are being read. A
// failure shows 「順序沒存到：…」 with 「重試」 and the list keeps its order.
// After the answer, focus follows the moved row's arrow (its other arrow
// once the pressed one is disabled at the top or bottom) and a polite live
// region says where it went. The page reads the settings again on mount;
// while the latest read failed (settings unknown, or only an older answer
// that may predate another device's change) the list is read-only, so a
// press can never overwrite the saved order with the name order or an
// older one.

type Delta = -1 | 1

const ARROW_CLASS =
  'inline-flex size-11 flex-none items-center justify-center rounded-full border bg-surface text-text hover-outline lg:size-9'

export function CategoryOrderList({ labelledBy }: { labelledBy: string }) {
  const client = useQueryClient()
  const op = useMemo(
    () => categoryOrderOp((input) => callFn(setCategoryOrder, input), client),
    [client],
  )
  const { settings, ready, readFailed } = useSettings()
  const { data: categories, isError: categoriesFailed } =
    useMaindata(selectCategories)
  const { data: counts } = useCategoryCounts()
  const inFlight = useOpsInFlight(op)
  const saving = inFlight.length > 0
  const waitingKeys = new Set(inFlight.map((save) => save.key))
  // A settings read in flight (the mount's refresh, a focus): every arrow
  // waits for it, so no press builds its order from an older answer.
  const reading = useIsFetching({ queryKey: SETTINGS_KEY, exact: true }) > 0
  const waits = (key: string) => reading || waitingKeys.has(key)
  const readOnly = ready && (settings === undefined || readFailed)
  const categoryOrder = settings?.categoryOrder
  const rows = useMemo(
    () =>
      categories === undefined || counts === undefined || !ready
        ? undefined
        : categoryOrderRows({
            categories,
            counts,
            categoryOrder: categoryOrder ?? [],
          }),
    [categories, counts, ready, categoryOrder],
  )
  const [announcement, setAnnouncement] = useState('')

  useEffect(() => {
    void refreshSettings(client)
  }, [client])

  const listRef = useRef<HTMLOListElement>(null)
  const arrowsRef = useRef(new Map<string, HTMLButtonElement>())
  const pressedRef = useRef<{
    key: string
    label: string
    delta: Delta
    from: number
  } | null>(null)

  // Once the answer came: announce the move, and focus follows the row.
  useLayoutEffect(() => {
    const pressed = pressedRef.current
    if (pressed === null || saving || rows === undefined) return
    pressedRef.current = null
    const at = rows.findIndex((row) => row.key === pressed.key)
    if (at >= 0 && at !== pressed.from) {
      // Counted like the list items on screen: 「全部」 is the first.
      setAnnouncement(`${pressed.label} 移到第 ${at + 2} 個`)
    }
    const active = document.activeElement
    const focusInList =
      active === null ||
      active === document.body ||
      (listRef.current?.contains(active) ?? false)
    if (!focusInList) return
    const arrows = arrowsRef.current
    const same = arrows.get(arrowKey(pressed.key, pressed.delta))
    const other = arrows.get(
      arrowKey(pressed.key, pressed.delta === -1 ? 1 : -1),
    )
    const target = same && !same.disabled ? same : other
    if (target && !target.disabled && target !== active) target.focus()
  }, [rows, saving])

  if (rows === undefined) {
    if (categoriesFailed) {
      return <p className="text-body text-text-muted">讀不到分類清單</p>
    }
    return (
      <div aria-busy="true" aria-label="分類載入中" className="flex flex-col">
        {[0, 1, 2].map((index) => (
          <div key={index} className="flex h-11 items-center lg:h-10">
            <Skeleton className="h-3 w-24 rounded-[6px]" />
          </div>
        ))}
      </div>
    )
  }

  const press = (row: OrderRow, index: number, delta: Delta) => {
    if (readOnly || waits(row.key)) return
    const to = index + delta
    if (to < 0 || to >= rows.length) return
    pressedRef.current = { key: row.key, label: row.label, delta, from: index }
    sendOp(op, client, { key: row.key, direction: delta })
  }
  const bindArrow =
    (key: string, delta: Delta) => (node: HTMLButtonElement | null) => {
      if (node) arrowsRef.current.set(arrowKey(key, delta), node)
      else arrowsRef.current.delete(arrowKey(key, delta))
    }

  return (
    <>
      {readOnly && (
        <p className="mb-2 text-meta text-text-muted">
          讀不到設定，暫時不能排順序
        </p>
      )}
      <ol
        ref={listRef}
        aria-labelledby={labelledBy}
        className="flex flex-col divide-y"
      >
        <Row label={categoryLabel(ALL)}>
          <span className="text-meta text-text-muted">固定第一個</span>
        </Row>
        {rows.map((row, index) => (
          <Row key={row.key} label={row.label}>
            {!readOnly && (
              <>
                <Arrow
                  label={`把 ${row.label} 往上移`}
                  edge={index === 0}
                  waiting={waits(row.key)}
                  onPress={() => press(row, index, -1)}
                  buttonRef={bindArrow(row.key, -1)}
                >
                  <ChevronUp size={20} strokeWidth={2.2} aria-hidden="true" />
                </Arrow>
                <Arrow
                  label={`把 ${row.label} 往下移`}
                  edge={index === rows.length - 1}
                  waiting={waits(row.key)}
                  onPress={() => press(row, index, 1)}
                  buttonRef={bindArrow(row.key, 1)}
                >
                  <ChevronDown size={20} strokeWidth={2.2} aria-hidden="true" />
                </Arrow>
              </>
            )}
          </Row>
        ))}
        {rows.length === 0 && (
          <li className="py-3 text-body text-text-muted">還沒有其他分類</li>
        )}
      </ol>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </>
  )
}

function arrowKey(key: string, delta: Delta): string {
  return `${delta}:${key}`
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <li className="flex min-h-14 items-center justify-between gap-3 py-1.5 lg:min-h-12">
      {/* Plain text (AD-10). */}
      <span className="min-w-0 truncate text-body">{label}</span>
      <span className="flex flex-none items-center gap-2">{children}</span>
    </li>
  )
}

function Arrow({
  label,
  edge,
  waiting,
  onPress,
  buttonRef,
  children,
}: {
  label: string
  /** The first row's up or the last row's down: it can never move. */
  edge: boolean
  /** A save is in flight: the arrow waits but keeps its focus. */
  waiting: boolean
  onPress: () => void
  buttonRef: (node: HTMLButtonElement | null) => void
  children: ReactNode
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={label}
      disabled={edge}
      aria-disabled={!edge && waiting ? true : undefined}
      onClick={onPress}
      className={ARROW_CLASS}
    >
      {children}
    </button>
  )
}
