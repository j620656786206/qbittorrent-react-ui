import { createContext, useCallback, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { isFirstLoadError } from '#/lib/app-error'
import { runBarAction } from '#/lib/connection-alert'
import type { BarAction } from '#/lib/connection-alert'
import { countAll } from '#/lib/visible-torrents'
import { useConnectionAlert } from '#/state/connection-alert'
import {
  refreshMaindata,
  selectServerState,
  useMaindata,
} from '#/state/maindata'
import { useMaindataFailure } from '#/state/maindata-failure'
import { headerModel } from '#/features/header/header-model'
import type { HeaderModel } from '#/features/header/header-model'
import { createRetryGuard } from '#/features/header/retry-guard'

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
  const queryClient = useQueryClient()
  const [retrying, setRetrying] = useState(false)
  const [guard] = useState(() => createRetryGuard(setRetrying))

  const onBarAction = useCallback(
    (action: BarAction) =>
      runBarAction(action, {
        retry: () => guard(() => refreshMaindata(queryClient)),
        reload: () => window.location.reload(),
      }),
    [guard, queryClient],
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
