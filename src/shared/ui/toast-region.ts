// Story 2.6: marks the toast region (src/shared/ui/toaster.tsx). An open
// bottom sheet leaves this element out of its modal session
// (src/shared/ui/sheet-session.ts): not `inert`, no focus pull-back, so
// 「重試」 and ✕ work over the sheet. Its own file because only
// src/lib/toast.ts and the root may import the toaster.

export const TOAST_REGION_ATTR = 'data-toast-region'

/** The node is the toast region or inside it. */
export function isInToastRegion(node: Node | null): boolean {
  const element = node instanceof Element ? node : (node?.parentElement ?? null)
  return element?.closest(`[${TOAST_REGION_ATTR}]`) != null
}
