import type { ReactNode } from 'react'
import type { TorrentStatusId } from '#/lib/torrent-status'
import {
  RING_CIRCUMFERENCE,
  RING_RADIUS,
  ringOffset,
} from '#/features/list/list-model'

// DESIGN status-circle, row size (36px; mockups S01-list-mode-desktop,
// S02-list-mode-phone). A progress ring drawn with SVG stroke-dashoffset
// over a `track` ring for downloading, paused and stalled; a full ring in
// the status color otherwise. Inner circle at 80% filled with the status
// color, the mockup's icon (42%) in `status-icon`. Display only: not
// clickable, labelled for screen readers (「停滯，87%」). No spin-in in Epic 1.

/** Tailwind needs whole class names; every status maps to its tokens. */
const COLORS: Readonly<
  Record<TorrentStatusId, { stroke: string; fill: string }>
> = {
  downloading: {
    stroke: 'stroke-status-downloading',
    fill: 'fill-status-downloading',
  },
  seeding: { stroke: 'stroke-status-seeding', fill: 'fill-status-seeding' },
  done: { stroke: 'stroke-status-done', fill: 'fill-status-done' },
  paused: { stroke: 'stroke-status-paused', fill: 'fill-status-paused' },
  stalled: { stroke: 'stroke-status-stalled', fill: 'fill-status-stalled' },
  error: { stroke: 'stroke-status-error', fill: 'fill-status-error' },
  archived: { stroke: 'stroke-status-archived', fill: 'fill-status-archived' },
}

/** The mockups' icon path data (24 x 24 view box). */
const ICONS: Readonly<Record<TorrentStatusId, ReactNode>> = {
  downloading: (
    <>
      <path d="M12 5v13" />
      <path d="m6 12 6 6 6-6" />
    </>
  ),
  seeding: (
    <>
      <path d="M12 19V6" />
      <path d="m6 12 6-6 6 6" />
    </>
  ),
  done: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  paused: (
    <>
      <path d="M9 6v12" />
      <path d="M15 6v12" />
    </>
  ),
  stalled: (
    <>
      <path d="M7 4h10" />
      <path d="M7 20h10" />
      <path d="M8 4c0 5 8 6 8 16" />
      <path d="M16 4c0 5-8 6-8 16" />
    </>
  ),
  error: (
    <>
      <path d="M12 6v8" />
      <path d="M12 18.2v.1" />
    </>
  ),
  archived: (
    <>
      <rect x="3" y="4" width="18" height="4.5" rx="1" />
      <path d="M5 8.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8.5" />
      <path d="M10 12.5h4" />
    </>
  ),
}

export interface StatusCircleProps {
  status: TorrentStatusId
  label: string
  /** 0 to 1: progress ring; `null`: full ring. */
  arcFraction: number | null
}

export function StatusCircle({
  status,
  label,
  arcFraction,
}: StatusCircleProps) {
  const color = COLORS[status]
  return (
    <svg
      width="36"
      height="36"
      viewBox="0 0 36 36"
      role="img"
      aria-label={label}
      className="block flex-none"
    >
      {arcFraction === null ? (
        <circle
          cx="18"
          cy="18"
          r={RING_RADIUS}
          fill="none"
          strokeWidth="3"
          className={color.stroke}
        />
      ) : (
        <>
          <circle
            cx="18"
            cy="18"
            r={RING_RADIUS}
            fill="none"
            strokeWidth="3"
            className="stroke-track"
          />
          {/* Progress 0 draws no arc: a round cap would show a dot. */}
          {arcFraction > 0 && (
            <circle
              cx="18"
              cy="18"
              r={RING_RADIUS}
              fill="none"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={ringOffset(arcFraction)}
              transform="rotate(-90 18 18)"
              className={color.stroke}
            />
          )}
        </>
      )}
      <circle cx="18" cy="18" r="14.4" className={color.fill} />
      <svg
        x="10.5"
        y="10.5"
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-status-icon"
      >
        {ICONS[status]}
      </svg>
    </svg>
  )
}
