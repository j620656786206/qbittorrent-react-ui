import { useState, useSyncExternalStore } from 'react'
import { formatDayKey } from '#/lib/format'

// A ticking clock for small leaf components (「最後更新 N 秒前」). One timer
// per interval is shared by every subscriber, so all of them read the same
// `now` and tick together. Never call it in a component that renders a big
// subtree: each tick re-renders the caller.

export interface Clock {
  subscribe: (onTick: () => void) => () => void
  /** Epoch ms of the last tick; stable between ticks. */
  getSnapshot: () => number
}

/** Exported for tests; components use `useNow`. */
export function createClock(
  intervalMs: number,
  readTime: () => number = () => Date.now(),
): Clock {
  let now = readTime()
  let timer: ReturnType<typeof setInterval> | null = null
  const listeners = new Set<() => void>()

  const tick = () => {
    now = readTime()
    for (const listener of listeners) listener()
  }

  return {
    subscribe(onTick) {
      listeners.add(onTick)
      if (timer === null) {
        // The value may be up to an interval old after an idle stretch.
        now = readTime()
        timer = setInterval(tick, intervalMs)
      }
      return () => {
        listeners.delete(onTick)
        if (listeners.size === 0 && timer !== null) {
          clearInterval(timer)
          timer = null
        }
      }
    },
    getSnapshot() {
      // Before anyone subscribes (first render), refresh a value that is a
      // full interval off; otherwise keep it stable.
      if (timer === null) {
        const current = readTime()
        if (Math.abs(current - now) >= intervalMs) now = current
      }
      return now
    },
  }
}

const clocks = new Map<number, Clock>()

function clockFor(intervalMs: number): Clock {
  let clock = clocks.get(intervalMs)
  if (!clock) {
    clock = createClock(intervalMs)
    clocks.set(intervalMs, clock)
  }
  return clock
}

/** Epoch ms that re-renders the caller every `intervalMs`. */
export function useNow(intervalMs: number): number {
  const clock = clockFor(intervalMs)
  return useSyncExternalStore(
    clock.subscribe,
    clock.getSnapshot,
    clock.getSnapshot,
  )
}

/** Checks the local date once a minute; callers see it change at midnight. */
export const DAY_CHECK_MS = 60_000

/**
 * `today`: epoch ms that changes only when the local date does
 * (setState-in-render), so rows and cards showing dates do not re-render
 * every minute; `now`: the same minute tick, for 「3 小時前」. Call it in the
 * list or board, not in each row.
 */
export function useDayClock(): { today: number; now: number } {
  const now = useNow(DAY_CHECK_MS)
  const key = formatDayKey(now)
  const [today, setToday] = useState(() => ({ key, now }))
  if (today.key !== key) {
    setToday({ key, now })
    return { today: now, now }
  }
  return { today: today.now, now }
}
