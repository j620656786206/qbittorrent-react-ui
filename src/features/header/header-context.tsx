import { createContext, useCallback, useContext } from 'react'
import type { ReactNode } from 'react'
import { isFirstLoadError } from '#/lib/app-error'
import type { BarAction } from '#/lib/connection-alert'
import { countAll } from '#/lib/visible-torrents'
import { useConnectionAlert } from '#/state/connection-alert'
import { selectServerState, useMaindata } from '#/state/maindata'
import { useMaindataFailure } from '#/state/maindata-failure'
import { useMaindataRetry } from '#/state/maindata-retry'
import { headerModel } from '#/features/header/header-model'
import type { HeaderModel } from '#/features/header/header-model'

// The header's live state, computed once per tick (the alert's 「最後更新 N
// 秒前」 re-reads every second) and handed to the small leaves through
// context. The provider's `children` (the shell layout and the page) keep
// their identity across ticks, so only the leaves that read this re-render.

export interface HeaderState {
  model: HeaderModel
  /** A 「重試」 is running: `aria-busy`, further presses ignored. */
  retrying: boolean
  onBarAction: (action: BarAction) => void
}

export const HeaderContext = createContext<HeaderState | null>(null)

export function useHeader(): HeaderState {
  const state = useContext(HeaderContext)
  if (!state) throw new Error('useHeader needs <HeaderProvider> (AppShell).')
  return state
}

export function HeaderProvider({ children }: { children: ReactNode }) {
  const alert = useConnectionAlert()
  const { data: serverState } = useMaindata(selectServerState)
  const failure = useMaindataFailure()
  const { data: allCount } = useMaindata(countAll)
  const { retry, retrying } = useMaindataRetry()

  const onBarAction = useCallback(
    (action: BarAction) => {
      if (action === 'retry') retry()
      else window.location.reload()
    },
    [retry],
  )

  const value: HeaderState = {
    model: headerModel({
      serverState,
      alert,
      allCount,
      loadFailed: serverState === undefined && isFirstLoadError(failure),
    }),
    retrying,
    onBarAction,
  }
  return <HeaderContext value={value}>{children}</HeaderContext>
}
