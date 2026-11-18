import { useEffect, useLayoutEffect, useState } from 'react'
import {
  BoardCollapseController,
  NORMAL_VIEW,
} from '#/features/board/board-collapse-controller'
import type { CollapseView } from '#/features/board/board-collapse-controller'

// Story 2.8: the desktop board's collapse controller. Story 3.3: the board
// reads the auto-collapse pref with useAutoCollapse (src/state/
// auto-collapse.ts), so the settings page's switch (same tab) and another
// tab's change (the `storage` event) both reach a mounted board without a
// reload.

export interface BoardCollapse {
  view: CollapseView
  controller: BoardCollapseController
}

/**
 * The controller lives as long as the desktop board. Each committed view
 * runs the FLIP's second half in a layout effect (before paint); turning
 * the pref off restores the board; unmounting ends any transition and
 * releases the order freeze.
 */
export function useBoardCollapse(enabled: boolean): BoardCollapse {
  const [view, setView] = useState<CollapseView>(NORMAL_VIEW)
  const [controller] = useState(() => new BoardCollapseController(setView))
  useLayoutEffect(() => {
    controller.view = view
    controller.runPending()
  }, [controller, view])
  useLayoutEffect(() => {
    controller.enabled = enabled
    if (!enabled) controller.disable()
  }, [controller, enabled])
  useEffect(() => controller.attach(), [controller])
  return { view, controller }
}
