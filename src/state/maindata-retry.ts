import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { refreshMaindata } from '#/state/maindata'

// 「重試」 while a retry is in flight: further presses are ignored (another
// press would cancel the running refresh), and `onBusyChange` drives
// `aria-busy` until the run settles, success or failure. The header's bar
// and the list's load-error block both retry through `useMaindataRetry`.

export function createRetryGuard(
  onBusyChange: (busy: boolean) => void,
): (run: () => Promise<unknown>) => void {
  let inFlight = false
  return (run) => {
    if (inFlight) return
    inFlight = true
    onBusyChange(true)
    const settle = () => {
      inFlight = false
      onBusyChange(false)
    }
    let pending: Promise<unknown>
    try {
      pending = run()
    } catch (error) {
      pending = Promise.reject(error)
    }
    pending.then(settle, settle)
  }
}

/** One `refreshMaindata` at a time; `retrying` is the button's `aria-busy`. */
export function useMaindataRetry(): { retry: () => void; retrying: boolean } {
  const queryClient = useQueryClient()
  const [retrying, setRetrying] = useState(false)
  const [guard] = useState(() => createRetryGuard(setRetrying))
  const retry = useCallback(
    () => guard(() => refreshMaindata(queryClient)),
    [guard, queryClient],
  )
  return { retry, retrying }
}
