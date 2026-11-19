import { Search, X } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import type { ReactNode, RefObject } from 'react'
import { formatCount } from '#/lib/format'
import { noResultText } from '#/lib/name-search'
import { MAX_QUERY_LENGTH } from '#/shared/list-search'
import { useIsDesktop } from '#/shared/ui/breakpoint'
import { useListView } from '#/state/list-view'
import type { ListView } from '#/state/list-view'
import { useMatchCount } from '#/state/maindata'
import {
  titleWithShortcut,
  useEscapeLayer,
  useShortcutAction,
} from '#/state/shortcuts'
import { IconButton } from '#/features/header/icon-button'

// Story 3.5 (DESIGN search-box, EXPERIENCE search-box; mockups
// S03-search-desktop, S02-no-result-phone): the header's in-list search.
// Usually only the magnifier. Desktop: the magnifier, or `/` (the shortcut
// registry; only the desktop box provides it), turns in place into a
// 240 x 36px pill (`surface`, `border`): magnifier icon, the field 「找名字」,
// ✕; it grows over the header's empty middle, so no other button moves.
// Phone: the field covers the first row, full width and 44px tall, text
// 16px (no iOS zoom on focus), with a 「取消」 text button on the right; the
// speed line below stays. Opening moves focus into the field; ✕, 「取消」
// and `Esc` (a `search` layer: after a dialog, before the detail) clear
// the keyword and close it, and focus goes back to the magnifier when it
// was inside the box. Both the desktop and the phone trees are rendered
// (the shell hides one with CSS): only the one for the current width takes
// focus, `Esc` and `/`. Story 3.7: the desktop magnifier's tooltip names
// `/` (「搜尋（/）」, from the registry); the phone's has none.
//
// The field keeps what Alex typed (spaces included); the URL's `q` gets it
// trimmed (`setQuery`). A keystroke inside an IME composition is not
// written until the composition ends, so half-typed Zhuyin never filters.
// Enter (not while composing) leaves the field, so the phone keyboard's
// 「搜尋」 key puts the keyboard away. The phone keeps 「種子」 as a visually
// hidden `h1` while the field covers the title.
// https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/search
// https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/isComposing

interface SearchControl {
  open: boolean
  magnifierRef: RefObject<HTMLButtonElement | null>
  inputRef: RefObject<HTMLInputElement | null>
  boxRef: RefObject<HTMLDivElement | null>
  /** The magnifier (or `/`): open with focus in the field. */
  start: () => boolean
  /** ✕, 「取消」, `Esc`: clear and close. */
  finish: () => void
}

function useSearchControl(phone: boolean): SearchControl {
  const { searchOpen, openSearch, closeSearch } = useListView()
  const desktop = useIsDesktop()
  const current = desktop !== phone
  const magnifierRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  // Where focus goes once the box has opened or closed.
  const focusNextRef = useRef<'field' | 'magnifier' | null>(null)

  useLayoutEffect(() => {
    const next = focusNextRef.current
    if (next === 'field' && searchOpen) {
      focusNextRef.current = null
      inputRef.current?.focus()
    } else if (next === 'magnifier' && !searchOpen) {
      focusNextRef.current = null
      magnifierRef.current?.focus()
    }
  }, [searchOpen])

  const start = useCallback(() => {
    if (searchOpen) {
      inputRef.current?.focus()
      return true
    }
    focusNextRef.current = 'field'
    openSearch()
    return true
  }, [searchOpen, openSearch])

  const finish = useCallback(() => {
    const active = document.activeElement
    const box = boxRef.current
    // Focus inside the box would drop to `body` when it goes.
    const focusInside =
      box !== null && active instanceof Node && box.contains(active)
    if (focusInside) focusNextRef.current = 'magnifier'
    closeSearch()
  }, [closeSearch])

  useEscapeLayer(searchOpen && current, finish, 'search')
  useShortcutAction('openSearch', !phone && current ? start : null)

  return { open: searchOpen, magnifierRef, inputRef, boxRef, start, finish }
}

/** The field; mounted only while the box is open. */
function SearchField({
  inputRef,
  phone,
}: {
  inputRef: RefObject<HTMLInputElement | null>
  phone: boolean
}) {
  const { view, setQuery } = useListView()
  const query = view.query
  const [draft, setDraft] = useState(query)
  // Keywords written and not yet back from the URL, oldest first: their
  // echoes never overwrite what was typed since.
  const writtenRef = useRef<Array<string>>([])
  const queryRef = useRef(query)

  useLayoutEffect(() => {
    queryRef.current = query
    const written = writtenRef.current
    // The newest match: the router may skip echoes, and an older equal
    // entry (`a`, `ab`, `a`) must not leave `ab` waiting.
    const index = written.lastIndexOf(query)
    if (index !== -1) {
      written.splice(0, index + 1)
      return
    }
    // Changed from elsewhere (the other width's field, a reload).
    written.length = 0
    setDraft((typed) => (typed.trim() === query ? typed : query))
  }, [query])

  const write = (text: string) => {
    const trimmed = text.trim()
    const written = writtenRef.current
    if (trimmed !== (written.at(-1) ?? queryRef.current)) written.push(trimmed)
    setQuery(text)
  }

  return (
    <input
      ref={inputRef}
      type="search"
      aria-label="找名字"
      placeholder="找名字"
      value={draft}
      maxLength={MAX_QUERY_LENGTH}
      enterKeyHint="search"
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      onChange={(event) => {
        const text = event.target.value
        setDraft(text)
        if (!(event.nativeEvent as InputEvent).isComposing) write(text)
      }}
      onCompositionEnd={(event) => write(event.currentTarget.value)}
      onKeyDown={(event) => {
        const native = event.nativeEvent
        if (event.key !== 'Enter' || native.isComposing) return
        if (native.keyCode === 229) return
        event.preventDefault()
        event.currentTarget.blur()
      }}
      className={
        phone
          ? `${FIELD_CLASS} text-[16px] leading-[1.2]`
          : `${FIELD_CLASS} text-[13px] leading-[1.4]`
      }
    />
  )
}

/** No outline of its own (the pill shows it), no native ✕. */
const FIELD_CLASS =
  'min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 text-text outline-none placeholder:text-text-muted [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none'

/** The pill shows the field's keyboard focus ring. */
const BOX_FOCUS_CLASS =
  'has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-ring has-[input:focus-visible]:outline-solid'

function Magnifier({
  control,
  phone,
}: {
  control: SearchControl
  phone: boolean
}) {
  return (
    <IconButton
      label="搜尋"
      phone={phone}
      title={phone ? undefined : titleWithShortcut('搜尋', 'search')}
      onClick={control.start}
      buttonRef={control.magnifierRef}
    >
      <Search size={20} strokeWidth={2.2} aria-hidden="true" />
    </IconButton>
  )
}

/** The magnifier icon and the field; a click anywhere on it focuses the field. */
function FieldLabel({
  control,
  phone,
}: {
  control: SearchControl
  phone: boolean
}) {
  return (
    <label className="flex min-w-0 flex-1 items-center gap-2 self-stretch">
      <Search
        size={18}
        strokeWidth={2.2}
        aria-hidden="true"
        className="flex-none text-text-muted"
      />
      <SearchField inputRef={control.inputRef} phone={phone} />
    </label>
  )
}

/** Desktop: the magnifier, or the 240 x 36px pill in its place. */
export function DesktopSearch() {
  const control = useSearchControl(false)
  if (!control.open) return <Magnifier control={control} phone={false} />
  return (
    <div
      ref={control.boxRef}
      role="search"
      className={`box-border flex h-9 w-60 flex-none items-center gap-2 rounded-full border bg-surface pr-1 pl-3 ${BOX_FOCUS_CLASS}`}
    >
      <FieldLabel control={control} phone={false} />
      <button
        type="button"
        aria-label="清除搜尋"
        onClick={control.finish}
        className="inline-flex size-7 flex-none items-center justify-center rounded-full text-text-muted hover-row"
      >
        <X size={16} strokeWidth={2.4} aria-hidden="true" />
      </button>
    </div>
  )
}

/**
 * Phone: the header's first row, the title with the magnifier and `add`,
 * or the field over the whole row with 「取消」.
 */
export function PhoneSearchHeader({ add }: { add: ReactNode }) {
  const control = useSearchControl(true)
  if (!control.open) {
    return (
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-page-title">種子</h1>
        <div className="flex gap-2">
          <Magnifier control={control} phone />
          {add}
        </div>
      </header>
    )
  }
  return (
    <header>
      <h1 className="sr-only">種子</h1>
      <div
        ref={control.boxRef}
        role="search"
        className="flex items-center gap-2"
      >
        <div
          className={`box-border flex h-11 min-w-0 flex-1 items-center rounded-full border bg-surface px-3.5 ${BOX_FOCUS_CLASS}`}
        >
          <FieldLabel control={control} phone />
        </div>
        <button
          type="button"
          onClick={control.finish}
          className="h-11 flex-none rounded-full px-1 text-[15px] font-semibold text-text"
        >
          取消
        </button>
      </div>
    </header>
  )
}

/** How long the keyword rests before the result is announced. */
export const SEARCH_STATUS_DELAY_MS = 400

/**
 * Story 3.5: one visually hidden polite live region, always mounted (the
 * shell renders it once), that says the result after the keyword or the
 * category changes: 「找到 N 個」 (what the list or board shows: archived
 * torrents only on the desktop board), or the no-result line. Empty
 * without a keyword. The visible no-result block mounts already filled,
 * which screen readers do not announce.
 */
export function SearchStatus() {
  const { view } = useListView()
  return (
    <p role="status" aria-live="polite" className="sr-only">
      {view.query !== '' && <SearchStatusText view={view} />}
    </p>
  )
}

function SearchStatusText({ view }: { view: ListView }) {
  const desktop = useIsDesktop()
  const withArchived = view.sort === 'state' && desktop
  const { data: count } = useMatchCount(view.category, view.query, withArchived)
  const { data: size } = useMatchCount(view.category, '', withArchived)
  const text =
    count === undefined
      ? ''
      : count > 0
        ? `找到 ${formatCount(count)} 個`
        : size === 0
          ? '這個分類沒有種子'
          : noResultText(view.query, view.category)
  const textRef = useRef(text)
  useLayoutEffect(() => {
    textRef.current = text
  })
  const [said, setSaid] = useState('')
  // Announced once the keyword rests, not on every poll.
  useEffect(() => {
    const timer = setTimeout(
      () => setSaid(textRef.current),
      SEARCH_STATUS_DELAY_MS,
    )
    return () => clearTimeout(timer)
  }, [view.query, view.category, text === ''])
  return said
}
