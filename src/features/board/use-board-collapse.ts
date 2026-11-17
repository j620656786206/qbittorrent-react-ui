import { useEffect, useLayoutEffect, useState } from 'react'
import { isPrefKey, readPref } from '#/lib/prefs'
import {
  BoardCollapseController,
  NORMAL_VIEW,
} from '#/features/board/board-collapse-controller'
import type { CollapseView } from '#/features/board/board-collapse-controller'

// Story 2.8: the auto-collapse pref (src/lib/prefs.ts, AD-13), read on
// mount and again on the `storage` event (the settings page in Epic 3, or
// another tab), and the desktop board's collapse controller.

export function useAutoCollapsePref(): boolean {
  const [on, setOn] = useState(() => readPref('autoCollapse'))
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (isPrefKey(event.key, 'autoCollapse')) {
        setOn(readPref('autoCollapse'))
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  return on
}

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
