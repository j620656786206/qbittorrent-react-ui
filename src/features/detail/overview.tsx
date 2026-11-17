import { Fragment, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { detailHero } from '#/lib/detail-hero'
import type { DetailHero } from '#/lib/detail-hero'
import { locationLabel } from '#/lib/paths'
import { getTorrentDetail } from '#/server/functions/get-torrent-detail'
import type { SlimTorrent } from '#/shared/maindata'
import type { TorrentDetail } from '#/shared/torrent-detail'
import type { TorrentStatusId } from '#/shared/torrent-status'
import { cn } from '#/shared/ui/cn'
import { copyText } from '#/shared/ui/copy-text'
import { StatusCircle } from '#/shared/ui/status-circle'
import { selectStateBeforeMove, useMaindata } from '#/state/maindata'
import { useDayClock } from '#/state/now'
import {
  bindFetchTorrentDetail,
  useTorrentDetail,
} from '#/state/torrent-detail'
import { infoRows, statTiles } from '#/features/detail/detail-model'
import type { StatTile } from '#/features/detail/detail-model'

// Story 2.5, DESIGN 詳情由上到下 (mockups S04-overview-desktop,
// S05-overview-phone): the overview tab, top to bottom: the status hero
// (64px circle, 28px headline in the status colour, one muted summary
// line), three stat tiles in one row, the save-path block and the info
// list (story 2.4). The same in the list panel, the board's narrow panel
// and the phone sheet; nothing in it may scroll sideways, so long values
// wrap. Names, paths and categories are JSX text, never HTML or links.

const fetchTorrentDetail = bindFetchTorrentDetail(getTorrentDetail)

/** Tailwind needs whole class names. */
const HERO_COLORS: Readonly<Record<TorrentStatusId, string>> = {
  downloading: 'text-status-downloading',
  seeding: 'text-status-seeding',
  done: 'text-status-done',
  paused: 'text-status-paused',
  stalled: 'text-status-stalled',
  error: 'text-status-error',
  archived: 'text-status-archived',
}

export function Overview({
  torrent,
  phone,
}: {
  torrent: SlimTorrent
  phone: boolean
}) {
  const clock = useDayClock()
  const { data: stateBeforeMove } = useMaindata(selectStateBeforeMove)
  // One observer for the hero, the tiles and the info list: polls every 5 s
  // while this detail shows, for this hash only (AD-6).
  const { data, isError } = useTorrentDetail(torrent.hash, fetchTorrentDetail)
  // The first call failed: 「沒有」 instead of 「…」 until a poll answers. An
  // answer of `detail: null` (unknown torrent) stays 「沒有」 too.
  const detail = data ? data.detail : isError ? null : undefined
  const options = {
    now: clock.today,
    stateBeforeMove: stateBeforeMove ?? {},
  }
  const hero = detailHero(torrent, {
    ...options,
    uploaded: detail === undefined ? undefined : (detail?.uploaded ?? null),
  })
  return (
    <div className="flex flex-col gap-3.5">
      <HeroBlock hero={hero} />
      <StatTiles
        tiles={statTiles(torrent, hero.status, clock, detail)}
        phone={phone}
      />
      {/* Keyed by hash: the copy label and the expanded path never carry
          over to the next torrent. */}
      <SavePathBlock
        key={torrent.hash}
        path={torrent.save_path}
        phone={phone}
      />
      <InfoList torrent={torrent} today={clock.today} detail={detail} />
    </div>
  )
}

/** DESIGN detail-hero. */
function HeroBlock({ hero }: { hero: DetailHero }) {
  return (
    <div className="flex items-center gap-3.5">
      <StatusCircle {...hero.circle} size={64} />
      <div className="flex min-w-0 flex-col gap-1">
        <p
          className={cn(
            'm-0 text-detail-hero tabular-nums [overflow-wrap:anywhere]',
            HERO_COLORS[hero.status],
          )}
        >
          {hero.headline}
        </p>
        {/* Each part is one box, so a narrow panel wraps between parts
            (「85 GB」 never splits); a part longer than the line still
            wraps inside. */}
        <p className="m-0 text-body text-text-muted tabular-nums">
          {hero.summaryParts.map((part, index) => (
            <Fragment key={index}>
              {index > 0 && ' · '}
              <span className="inline-block max-w-full [overflow-wrap:anywhere]">
                {part}
              </span>
            </Fragment>
          ))}
        </p>
      </div>
    </div>
  )
}

/** DESIGN stat-tile: 3 in a row; a long value wraps instead of overflowing. */
function StatTiles({
  tiles,
  phone,
}: {
  tiles: Array<StatTile>
  phone: boolean
}) {
  return (
    <div
      className={cn('grid grid-cols-3', phone ? 'gap-2' : 'gap-2.5')}
      data-slot="stat-tiles"
    >
      {tiles.map((tile) => (
        <div
          key={tile.title}
          className="flex min-w-0 flex-col gap-1 rounded-card bg-surface-muted p-card-padding"
        >
          <span className="text-meta text-text-muted">{tile.title}</span>
          <span
            className={cn(
              'text-stat-value tabular-nums [overflow-wrap:anywhere]',
              tile.muted && 'text-text-muted',
            )}
          >
            {tile.value}
          </span>
        </div>
      ))}
    </div>
  )
}

/** How long 「已複製」 or 「複製失敗」 replaces 「複製」. */
export const COPY_LABEL_MS = 1500

type CopyState = 'idle' | 'copied' | 'failed'

const COPY_LABELS: Readonly<Record<CopyState, string>> = {
  idle: '複製',
  copied: '已複製',
  failed: '複製失敗',
}

/**
 * 複製 copies the full path; the label says how it went for 1.5 s (no
 * toast). Pressing again restarts the 1.5 s.
 */
function useCopyButton(path: string, hostRef: RefObject<HTMLElement | null>) {
  const [state, setState] = useState<CopyState>('idle')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    },
    [],
  )
  const copy = async () => {
    const copied = await copyText(path, hostRef.current ?? undefined)
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    setState(copied ? 'copied' : 'failed')
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      setState('idle')
    }, COPY_LABEL_MS)
  }
  return { label: COPY_LABELS[state], copy }
}

const PILL = 'flex-none rounded-full border px-3.5 whitespace-nowrap'
const PILL_OUTLINE = 'border-border bg-surface text-text hover-outline'

/**
 * DESIGN save-path-block: 「儲存位置」 with the location tag, the full path
 * on one line cut at the front (an RTL box around an LTR isolate keeps
 * 「…media/tv/牧神記」 in order, https://developer.mozilla.org/en-US/docs/Web/HTML/Element/bdi),
 * then 複製, 「☆ 加到常用」, 改路徑 (the only solid one) and 改檔名. The
 * last three wait for Epic 5: native `disabled` (50%, not-allowed, no
 * hover, not focusable). Desktop: the path's `title` is the full path;
 * phone: tapping the path wraps it, tapping again cuts it again.
 */
function SavePathBlock({ path, phone }: { path: string; phone: boolean }) {
  const sectionRef = useRef<HTMLElement>(null)
  const [expanded, setExpanded] = useState(false)
  const { label, copy } = useCopyButton(path, sectionRef)
  const size = phone ? 'h-11 text-[13px]' : 'h-[34px] text-[12px]'
  const cut = (
    <span
      dir="rtl"
      className="block min-w-0 flex-1 truncate text-left font-mono text-path"
    >
      <bdi dir="ltr">{path}</bdi>
    </span>
  )
  return (
    <section
      ref={sectionRef}
      aria-label="儲存位置"
      className={cn(
        'flex flex-col rounded-card bg-surface-muted p-3.5',
        phone ? 'gap-3' : 'gap-2',
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex-none text-meta font-semibold">儲存位置</span>
        <span className="inline-flex min-w-0 items-center gap-1 rounded-full border px-2 py-px text-tag whitespace-nowrap text-text-muted">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="flex-none"
          >
            <path d="M3 7h6l2 2h10v10H3z" />
          </svg>
          <span className="min-w-0 truncate">{locationLabel(path)}</span>
        </span>
      </div>
      {phone ? (
        // 44px tall to tap, without adding the height to the block.
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="-my-3 flex min-h-11 w-full min-w-0 items-center text-left text-text"
        >
          {expanded ? (
            <span className="block min-w-0 flex-1 font-mono text-path [overflow-wrap:anywhere]">
              {path}
            </span>
          ) : (
            cut
          )}
        </button>
      ) : (
        <div title={path} className="flex min-w-0">
          {cut}
        </div>
      )}
      <div
        className={cn(
          phone ? 'grid grid-cols-2 gap-2' : 'flex flex-wrap gap-2',
        )}
      >
        <button
          type="button"
          onClick={() => void copy()}
          className={cn(PILL, PILL_OUTLINE, size)}
        >
          {label}
        </button>
        <button type="button" disabled className={cn(PILL, PILL_OUTLINE, size)}>
          ☆ 加到常用
        </button>
        <button
          type="button"
          disabled
          className={cn(
            PILL,
            'border-primary bg-primary font-bold text-primary-foreground hover-solid',
            size,
          )}
        >
          改路徑
        </button>
        <button type="button" disabled className={cn(PILL, PILL_OUTLINE, size)}>
          改檔名
        </button>
      </div>
    </section>
  )
}

/** UX-DR46: label on the left in `text-muted`, the value right after it. */
function InfoList({
  torrent,
  today,
  detail,
}: {
  torrent: SlimTorrent
  today: number
  detail: TorrentDetail | null | undefined
}) {
  return (
    <dl className="m-0 grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px] leading-[1.4] tabular-nums">
      {infoRows(torrent, today, detail).map((row) => (
        <div key={row.label} className="contents">
          <dt className="text-text-muted">{row.label}</dt>
          <dd
            className={cn(
              'm-0 min-w-0 [overflow-wrap:anywhere]',
              row.muted && 'text-text-muted',
            )}
          >
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}
