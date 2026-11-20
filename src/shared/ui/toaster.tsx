import { useSelector } from '@tanstack/react-store'
import { X } from 'lucide-react'
import { dismissToast, toastStore } from '#/shared/toast-store'
import type { ShownToast } from '#/shared/toast-store'
import { TOAST_LIFT_CLASS } from '#/shared/ui/selection-bar-geometry'

// Story 2.6, DESIGN toast (mockups S06-add-success-desktop, S08-done-desktop),
// EXPERIENCE toast: the 「底層 toast」. Features call src/lib/toast.ts,
// which writes src/shared/toast-store.ts; the root mounts <Toaster /> once.
// No toast package (spine: no animation packages; Claude 代決 in spec 2.6).
//
// - One toast at a time; a new one replaces the old and replays the
//   entrance (keyed by id).
// - A failure stays until ✕ or 「重試」 (a 32px outline pill, which closes
//   the toast, then runs its callback).
// - Story 4.3: a plain toast is the same card with only ✕; the store closes
//   it after 4 s. It renders in a polite `status` region (a success is not
//   an alert).
// - Desktop (>= 1024px): bottom right, 24px in, 356px wide. Phone: at the
//   top, 16px in (plus the safe area), above the bottom sheet and its scrim
//   (z-index over `z-50`).
// - Story 4.1: while the desktop selection bar shows (`lifted`, set through
//   `toast.setLift`), the region moves up 68px, 16px above the 52px bar
//   (24 + 52 + 16 = 92px from the bottom). Only `transform` moves (0.3s,
//   the repo's curve), at once under reduced motion.
// - The failure renders inside an always-mounted `role="alert"` region, so
//   the change is announced
//   (https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/alert_role).
// - The region is marked TOAST_REGION_ATTR: an open bottom sheet leaves it
//   out of its modal session (src/shared/ui/sheet-session.ts).
// CSP (AD-10, no style-src): this renders in the server shell, so nothing
// here carries a `style` attribute.

export const TOAST_REGION_ATTR = 'data-toast-region'

/** The node is the toast region or inside it. */
export function isInToastRegion(node: Node | null): boolean {
  const element = node instanceof Element ? node : (node?.parentElement ?? null)
  return element?.closest(`[${TOAST_REGION_ATTR}]`) != null
}

function ToastCard({ toast }: { toast: ShownToast }) {
  return (
    <div
      data-slot="toast"
      className="pointer-events-auto flex w-full animate-rise items-center gap-3 rounded-card border bg-surface py-3 pr-2 pl-[18px] text-text shadow-float"
    >
      <p className="m-0 min-w-0 flex-1 text-[13px] leading-[1.4] font-semibold [overflow-wrap:anywhere]">
        {toast.text}
      </p>
      {toast.kind === 'failure' && (
        <button
          type="button"
          onClick={() => {
            dismissToast(toast.id)
            toast.retry()
          }}
          className="h-8 flex-none rounded-full border bg-surface px-3.5 text-[13px] font-semibold whitespace-nowrap text-text hover-outline"
        >
          重試
        </button>
      )}
      <button
        type="button"
        aria-label="關閉"
        onClick={() => dismissToast(toast.id)}
        className="inline-flex size-7 flex-none items-center justify-center rounded-full text-text-muted hover-row"
      >
        <X size={14} strokeWidth={2.4} aria-hidden="true" />
      </button>
    </div>
  )
}

const REGION_CLASS =
  'pointer-events-none fixed inset-x-4 top-[calc(16px+env(safe-area-inset-top))] z-[60] flex flex-col lg:top-auto lg:right-6 lg:bottom-6 lg:left-auto lg:w-[356px] lg:transition-transform lg:duration-300 lg:ease-[cubic-bezier(0.2,0.8,0.2,1)] lg:motion-reduce:transition-none'

export function Toaster() {
  const toast = useSelector(toastStore, (state) => state.toast)
  const lifted = useSelector(toastStore, (state) => state.lifted)
  return (
    <div
      {...{ [TOAST_REGION_ATTR]: '' }}
      className={lifted ? `${REGION_CLASS} ${TOAST_LIFT_CLASS}` : REGION_CLASS}
    >
      <div role="status">
        {toast?.kind === 'plain' && <ToastCard key={toast.id} toast={toast} />}
      </div>
      <div role="alert">
        {toast?.kind === 'failure' && (
          <ToastCard key={toast.id} toast={toast} />
        )}
      </div>
    </div>
  )
}
