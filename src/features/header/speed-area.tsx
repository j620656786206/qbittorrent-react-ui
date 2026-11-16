import { ArrowDown, ArrowUp, TriangleAlert } from 'lucide-react'
import { NO_VALUE } from '#/lib/format'
import { AlertBar } from '#/shared/ui/alert-bar'
import { cn } from '#/shared/ui/cn'
import { focusMain } from '#/shared/ui/main-scroll'
import { Skeleton } from '#/shared/ui/skeleton'
import { useHeader } from '#/features/header/header-context'
import type { SpeedGroup } from '#/features/header/header-model'

// The speed area (mockups S01-list-mode-desktop, S01-loading-desktop,
// S02-list-mode-phone, S02-loading-phone, S02-offline-phone): desktop pills
// in the header row, the phone's second row. Small leaves: they read the
// header context, which changes every second.
//
// Screen readers get one sentence per group with the unit
// (「上傳 2.38 MB/s，上限 32.7 MB/s」); the visible parts are hidden from them.
// While there is no data yet the area is `aria-busy`; when the first load
// failed (spec 1.8 option A) each group reads 「沒有」 instead.

const ARROWS = {
  down: { Icon: ArrowDown, label: '下載', color: 'text-status-downloading' },
  up: { Icon: ArrowUp, label: '上傳', color: 'text-status-seeding' },
} as const

type Direction = keyof typeof ARROWS

/** Skeleton bar sizes, [desktop pill, phone line]. */
const SKELETON: Record<Direction, [string, string]> = {
  down: ['h-3 w-[92px] rounded-[6px]', 'h-2.5 w-24 rounded-[5px]'],
  up: ['h-3 w-[100px] rounded-[6px]', 'h-2.5 w-[104px] rounded-[5px]'],
}

function Arrow({ direction, size }: { direction: Direction; size: number }) {
  const { Icon, color } = ARROWS[direction]
  return (
    <Icon
      size={size}
      strokeWidth={2.6}
      aria-hidden="true"
      className={cn('flex-none', color)}
    />
  )
}

/**
 * The visible speed and limit, plus the spoken sentence; before data the
 * skeleton, or 「沒有」 once the first load failed.
 */
function GroupContent({
  direction,
  group,
  loading,
  skeleton,
}: {
  direction: Direction
  group: SpeedGroup | null
  loading: boolean
  skeleton: string
}) {
  if (!group && loading) {
    return (
      <>
        <Skeleton className={skeleton} />
        <span className="sr-only">{ARROWS[direction].label}</span>
      </>
    )
  }
  if (!group) {
    return (
      <>
        <span aria-hidden="true" className="text-text-muted">
          {NO_VALUE}
        </span>
        <span className="sr-only">{`${ARROWS[direction].label} ${NO_VALUE}`}</span>
      </>
    )
  }
  return (
    <>
      <span aria-hidden="true">{group.speed}</span>
      <span aria-hidden="true" className="text-text-muted">
        {group.limit}
      </span>
      <span className="sr-only">{group.spoken}</span>
    </>
  )
}

function SpeedPill({
  direction,
  group,
  loading,
}: {
  direction: Direction
  group: SpeedGroup | null
  loading: boolean
}) {
  return (
    <span
      aria-busy={!group && loading ? true : undefined}
      className="inline-flex flex-none items-center gap-1.5 rounded-full border bg-surface px-3.5 py-[7px] whitespace-nowrap tabular-nums"
    >
      <Arrow direction={direction} size={14} />
      <GroupContent
        direction={direction}
        group={group}
        loading={loading}
        skeleton={SKELETON[direction][0]}
      />
    </span>
  )
}

/** Desktop: two speed pills or one warning pill, then the stale text. */
export function DesktopSpeed() {
  const { model } = useHeader()
  return (
    <>
      {model.warning ? (
        <span className="inline-flex flex-none items-center gap-1.5 rounded-full border border-status-stalled bg-surface px-3.5 py-[7px] whitespace-nowrap text-text">
          <TriangleAlert
            size={14}
            strokeWidth={2.2}
            aria-hidden="true"
            className="flex-none text-status-stalled"
          />
          {model.warning}
        </span>
      ) : (
        <>
          <SpeedPill
            direction="down"
            group={model.speeds?.down ?? null}
            loading={model.loading}
          />
          <SpeedPill
            direction="up"
            group={model.speeds?.up ?? null}
            loading={model.loading}
          />
        </>
      )}
      {model.staleText && (
        <span className="text-[13px] whitespace-nowrap text-text-muted">
          {model.staleText}
        </span>
      )}
    </>
  )
}

function PhoneGroup({
  direction,
  group,
  loading,
}: {
  direction: Direction
  group: SpeedGroup | null
  loading: boolean
}) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <Arrow direction={direction} size={12} />
      <GroupContent
        direction={direction}
        group={group}
        loading={loading}
        skeleton={SKELETON[direction][1]}
      />
    </span>
  )
}

/**
 * Phone second row: the speed line (it may wrap between groups, never inside
 * one), the warning line, or the alert bar in its place.
 */
export function PhoneLine() {
  const { model, retrying, onBarAction } = useHeader()
  if (model.phoneLine === 'bar' && model.bar) {
    const { bar } = model
    return (
      <AlertBar
        text={bar.text}
        detail={bar.detail}
        icon={bar.icon}
        actionLabel={bar.actionLabel}
        onAction={() => onBarAction(bar.action)}
        busy={retrying}
        restoreFocusTo={focusMain}
      />
    )
  }
  if (model.phoneLine === 'warning' && model.warning) {
    return (
      <p className="m-0 flex items-center gap-1 text-[12px] leading-[1.4] text-text">
        <TriangleAlert
          size={12}
          strokeWidth={2.2}
          aria-hidden="true"
          className="flex-none text-status-stalled"
        />
        {model.warning}
      </p>
    )
  }
  return (
    <p
      aria-busy={!model.speeds && model.loading ? true : undefined}
      className="m-0 flex flex-wrap items-center gap-x-3 text-[12px] leading-[1.4] tabular-nums"
    >
      <PhoneGroup
        direction="down"
        group={model.speeds?.down ?? null}
        loading={model.loading}
      />
      <PhoneGroup
        direction="up"
        group={model.speeds?.up ?? null}
        loading={model.loading}
      />
      {model.staleText && (
        <span className="whitespace-nowrap text-text-muted">
          {model.staleText}
        </span>
      )}
    </p>
  )
}
