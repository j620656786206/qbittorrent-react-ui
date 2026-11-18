import { useId, useState } from 'react'
import { cn } from '#/shared/ui/cn'
import { useIsDesktop } from '#/shared/ui/breakpoint'
import { setAutoCollapse, useAutoCollapse } from '#/state/auto-collapse'

// Story 3.3: the 「捲動時自動收合其他欄」 switch on the story 2.8 pref
// (default on, this device only, src/state/auto-collapse.ts). A plain
// `button` with `role="switch"` and `aria-checked` (WAI-ARIA switch
// pattern, no new dependency): a click or Space (a button's own key)
// toggles it, and the change reaches the board at once. The phone shows it
// too, with the muted line 「只在電腦版有用」 (the board only collapses on
// desktop). A write the storage refused leaves the switch as it was, with
// the muted line 「這台裝置存不了這個設定」. The thumb moves with `transform` only, still for reduced motion.
// https://www.w3.org/WAI/ARIA/apg/patterns/switch/

export function AutoCollapseSwitch() {
  const on = useAutoCollapse()
  const desktop = useIsDesktop()
  const labelId = useId()
  const noteId = useId()
  const refusedId = useId()
  const [refused, setRefused] = useState(false)
  return (
    <section
      aria-labelledby={labelId}
      className="flex items-center justify-between gap-4 rounded-panel bg-surface px-4 py-3 shadow-card lg:px-[22px] lg:py-3.5"
    >
      <div className="min-w-0">
        <h3 id={labelId} className="text-column-title">
          捲動時自動收合其他欄
        </h3>
        {!desktop && (
          <p id={noteId} className="mt-1 text-meta text-text-muted">
            只在電腦版有用
          </p>
        )}
        {refused && (
          <p id={refusedId} className="mt-1 text-meta text-text-muted">
            這台裝置存不了這個設定
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby={labelId}
        aria-describedby={
          [desktop ? null : noteId, refused ? refusedId : null]
            .filter((id) => id !== null)
            .join(' ') || undefined
        }
        onClick={() => setRefused(!setAutoCollapse(!on))}
        // 44px tall on the phone (touch target), the visible track inside.
        className="group/switch inline-flex h-11 w-[52px] flex-none items-center justify-center rounded-full lg:h-9"
      >
        <span
          aria-hidden="true"
          className={cn(
            'relative inline-flex h-6 w-11 items-center rounded-full p-0.5',
            on ? 'bg-primary' : 'bg-track',
          )}
        >
          <span
            className={cn(
              'size-5 rounded-full bg-white shadow-card transition-transform duration-150 motion-reduce:transition-none',
              on && 'translate-x-5',
            )}
          />
        </span>
      </button>
    </section>
  )
}
