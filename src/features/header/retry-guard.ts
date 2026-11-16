// 「重試」 while a retry is in flight: further presses are ignored (another
// press would cancel the running refresh), and `onBusyChange` drives
// `aria-busy` until the run settles, success or failure.

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
    run().then(settle, settle)
  }
}
