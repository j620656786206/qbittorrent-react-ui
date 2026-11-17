import { MutationObserver, useMutationState } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { isAppError } from '#/lib/app-error'
import { isOperationFailureCode } from '#/lib/error-text'
import type { OperationFailureCode } from '#/lib/error-text'
import { toast } from '#/lib/toast'

// Stories 2.6 and 2.7: one operation call with the failure toast. Every
// operation a screen sends (pause and resume, a file's priority; later
// delete, move, rename) goes through `sendOp`:
// - sending closes the failure toast about the same things (`keysOf`), so
//   an old 重試 never resends an operation Alex has since replaced;
// - `qbit_rejected`, `timeout` and `invalid_input` show a failure toast with
//   「重試」, which sends the same call again; connection codes and
//   `bad_origin` are the global `onError`'s (no toast);
// - the call is a MutationObserver of its own, so its callbacks (and 重試)
//   run even after the screen that sent it closed; it is detached once
//   settled, so the cache can collect the finished mutation;
// - `useOpsInFlight` lists the calls still running (`onSuccess` is awaited,
//   so a call counts until what it awaits settles).
// query-core 5.107.1: `mutate` builds a mutation from the observer's
// options and returns its promise.
// https://github.com/TanStack/query/blob/@tanstack/query-core@5.107.1/packages/query-core/src/mutationObserver.ts
// https://tanstack.com/query/v5/docs/framework/react/reference/useMutationState

export interface TrackedOp<TVariables> {
  /** Names this operation's calls (the mutation key). */
  name: string
  call: (variables: TVariables) => Promise<unknown>
  /** What a call is about (a torrent hash, a file key). */
  keysOf: (variables: TVariables) => ReadonlyArray<string>
  failureText: (variables: TVariables, code: OperationFailureCode) => string
  onSend?: (variables: TVariables) => void
  onSuccess?: (
    client: QueryClient,
    variables: TVariables,
  ) => Promise<unknown> | void
  /** Any failure, toast or not. */
  onFailure?: (variables: TVariables) => void
}

/** Sends one call of `op`, whether or not the screen is still mounted. */
export function sendOp<TVariables>(
  op: TrackedOp<TVariables>,
  client: QueryClient,
  variables: TVariables,
): void {
  const observer = new MutationObserver<unknown, Error, TVariables>(client, {
    mutationKey: [op.name],
    mutationFn: op.call,
    onMutate: (sent) => {
      for (const key of op.keysOf(sent)) toast.dismissFor(key)
      op.onSend?.(sent)
    },
    onSuccess: (_data, sent) => op.onSuccess?.(client, sent),
    onError: (error, sent) => {
      op.onFailure?.(sent)
      if (!isAppError(error) || !isOperationFailureCode(error.code)) return
      toast.failure(op.failureText(sent, error.code), {
        keys: op.keysOf(sent),
        onRetry: () => sendOp(op, client, sent),
      })
    },
  })
  // The failure path already ran in onError.
  observer
    .mutate(variables)
    .catch(() => undefined)
    .finally(() => observer.reset())
}

/** The variables of `op`'s calls still running. */
export function useOpsInFlight<TVariables>(
  op: TrackedOp<TVariables>,
): Array<TVariables> {
  return useMutationState({
    filters: { mutationKey: [op.name], status: 'pending' },
    select: (mutation) => mutation.state.variables as TVariables,
  })
}
