import type { ReactNode } from 'react'
import type { TorrentStatusId } from '#/shared/torrent-status'

// DESIGN status-circle (mockups S01-list-mode-desktop, S02-list-mode-phone,
// S01-list-desktop, S02-list-phone): 36px in list rows, 32px on board cards,
// 28px in board column headers, 64px in the detail hero (story 2.5,
// mockups S04-overview-desktop, S05-overview-phone). A progress ring drawn with SVG
// stroke-dashoffset over a `track` ring for downloading, paused and
// stalled; a full ring in the status color otherwise. Inner circle at 80%
// filled with the status color, the mockup's icon (about 42%) in
// `status-icon`. Display only: not clickable, labelled for screen readers
// (「停滯，87%」) or hidden when it only decorates a labelled box. Story
// 2.9: the arc carries `data-progress-arc`, so the entrance
// (src/state/entrance.ts) can turn it in from its `stroke-dasharray` (an
// empty ring) to its live offset. Shared: the list and the board both draw
// it (story 2.3 moved it out of features/list).

export type StatusCircleSize = 28 | 32 | 36 | 64

interface Geometry {
  /** Ring radius: the circle minus half the 3px stroke. */
  ring: number
  /** Inner filled circle: 80% of the size. */
  inner: number
  /** Icon box, px, and where it starts. */
  icon: number
  iconAt: number
}

/** The mockups' numbers per size. */
const GEOMETRY: Readonly<Record<StatusCircleSize, Geometry>> = {
  64: { ring: 30.5, inner: 25.6, icon: 27, iconAt: 18.5 },
  36: { ring: 16.5, inner: 14.4, icon: 15, iconAt: 10.5 },
  32: { ring: 14.5, inner: 12.8, icon: 13, iconAt: 9.5 },
  28: { ring: 12.5, inner: 11.2, icon: 12, iconAt: 8 },
}

/** The ring's circumference for a size. */
export function ringCircumference(size: StatusCircleSize = 36): number {
  return 2 * Math.PI * GEOMETRY[size].ring
}

/** The ring's `stroke-dashoffset` for a fraction: C x (1 - fraction). */
export function ringOffset(
  arcFraction: number,
  size: StatusCircleSize = 36,
): number {
  return ringCircumference(size) * (1 - arcFraction)
}

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
  /** Screen reader text; left out, the circle is decorative (`aria-hidden`). */
  label?: string
  /** 0 to 1: progress ring; `null`: full ring. */
  arcFraction: number | null
  size?: StatusCircleSize
}

export function StatusCircle({
  status,
  label,
  arcFraction,
  size = 36,
}: StatusCircleProps) {
  const color = COLORS[status]
  const { ring, inner, icon, iconAt } = GEOMETRY[size]
  const center = size / 2
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      {...(label === undefined
        ? { 'aria-hidden': true }
        : { role: 'img', 'aria-label': label })}
      className="block flex-none"
    >
      {arcFraction === null ? (
        <circle
          cx={center}
          cy={center}
          r={ring}
          fill="none"
          strokeWidth="3"
          className={color.stroke}
        />
      ) : (
        <>
          <circle
            cx={center}
            cy={center}
            r={ring}
            fill="none"
            strokeWidth="3"
            className="stroke-track"
          />
          {/* Progress 0 draws no arc: a round cap would show a dot. */}
          {arcFraction > 0 && (
            <circle
              cx={center}
              cy={center}
              r={ring}
              fill="none"
              strokeWidth="3"
              strokeLinecap="round"
              data-progress-arc=""
              strokeDasharray={ringCircumference(size)}
              strokeDashoffset={ringOffset(arcFraction, size)}
              transform={`rotate(-90 ${center} ${center})`}
              className={color.stroke}
            />
          )}
        </>
      )}
      <circle cx={center} cy={center} r={inner} className={color.fill} />
      <svg
        x={iconAt}
        y={iconAt}
        width={icon}
        height={icon}
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
