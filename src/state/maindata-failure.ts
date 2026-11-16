import { createStore, useSelector } from '@tanstack/react-store'

// Spec 1.8 V2 / H1: the last `['maindata']` failure, kept until the next
// maindata success. Query resets a query to `{ status: 'pending', error:
// null }` whenever a fetch starts, so with no data its `error` blinks away
// on every poll; screens read this sticky value instead (through
// `isFirstLoadError` in src/lib/app-error.ts). Fed by the global
// `onError` / `onSuccess` in query-client.ts.

interface MaindataFailureState {
  /** The last failure's error; `null` after a success. */
  error: unknown
}

export const maindataFailureStore = createStore<MaindataFailureState>({
  error: null,
})

/** A no-op on the server: this module-level store would leak across requests. */
export function markMaindataFailure(error: unknown): void {
  if (typeof window === 'undefined') return
  if (maindataFailureStore.state.error === error) return
  maindataFailureStore.setState(() => ({ error }))
}

export function clearMaindataFailure(): void {
  if (maindataFailureStore.state.error === null) return
  maindataFailureStore.setState(() => ({ error: null }))
}

export function useMaindataFailure(): unknown {
  return useSelector(maindataFailureStore, (state) => state.error)
}
