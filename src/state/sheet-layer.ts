import { useEscapeLayer } from '#/state/shortcuts'
import { useSheetOrderHold } from '#/state/order-freeze'

// Story 2.4: what every bottom sheet needs from src/state while it is open,
// which src/shared/ui/bottom-sheet.tsx may not import itself: the list
// behind keeps its order (`sheetOpen`, story 2.2), and `Esc` closes it
// through the shortcut registry (it used to listen on `document` itself).
// Each feature that opens a sheet calls this next to its `<BottomSheet>`.

export function useSheetLayer(open: boolean, close: () => void): void {
  useSheetOrderHold(open)
  useEscapeLayer(open, close)
}
