import { MutationObserver, useMutationState } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { isAppError } from '#/lib/app-error'
import type { OperationFailureCode } from '#/lib/error-text'
import { toast } from '#/lib/toast'
import type { ErrorCode } from '#/shared/errors'

// Stories 2.6 and 2.7: one operation call with the failure toast. Every
// operation a screen sends (pause and resume, a file's priority; later
// delete, move, rename) goes through `sendOp`:
// - sending closes the failure toast about the same things (`keysOf`), so
//   an old 重試 never resends an operation Alex has since replaced;
// - `qbit_rejected`, `timeout` and `invalid_input` show a failure toast with
//   「重試」, which sends the same call again; an op can name its own codes
//   instead (story 3.1: a settings write's `settings_write_failed`,
//   `timeout`, `invalid_input`); connection codes and `bad_origin` are the
//   global `onError`'s (no toast);
// - the call is a MutationObserver of its own, so its callbacks (and 重試)
//   run even after the screen that sent it closed; it is detached once
//   settled, so the cache can collect the finished mutation;
// - `useOpsInFlight` lists the calls still running (`onSuccess` is awaited,
//   so a call counts until what it awaits settles);
// - `networkMode: 'always'`, like every query: offline, the call fails
//   through `callFn` instead of pausing and firing on reconnect (a delete
//   Alex could no longer back out of, behind a dialog locked meanwhile).
// https://tanstack.com/query/v5/docs/framework/react/guides/network-mode
// query-core 5.107.1: `mutate` builds a mutation from the observer's
// options and returns its promise.
// https://github.com/TanStack/query/blob/@tanstack/query-core@5.107.1/packages/query-core/src/mutationObserver.ts
// https://tanstack.com/query/v5/docs/framework/react/reference/useMutationState

export interface TrackedOp<
  TVariables,
  TCode extends ErrorCode = OperationFailureCode,
  TData = unknown,
> {
  /** Names this operation's calls (the mutation key). */
  name: string
  call: (variables: TVariables) => Promise<TData>
  /** What a call is about (a torrent hash, a file key). */
  keysOf: (variables: TVariables) => ReadonlyArray<string>
  /**
   * Calls with the same scope run one after another (TanStack Query's
   * mutation `scope`): a later one starts once the earlier one settled.
   */
  scopeOf?: (variables: TVariables) => string
  /**
   * The codes that show the failure toast (a torrent operation's are
   * OPERATION_FAILURE_CODES). Required, so the list always matches `TCode`
   * and `failureText` only sees codes it knows. Never a connection code.
   */
  failureCodes: ReadonlyArray<TCode>
  /** `error` is what the call threw (story 5.2: which check refused it). */
  failureText: (variables: TVariables, code: TCode, error: unknown) => string
  onSend?: (variables: TVariables) => void
  /** `data` is the call's answer. */
  onSuccess?: (
    client: QueryClient,
    variables: TVariables,
    data: TData,
  ) => Promise<unknown> | void
  /**
   * Any failure, toast or not; `code` is the AppError's (story 4.7: an add
   * discards its list on `not_logged_in`), absent for anything else, and
   * `error` what the call threw.
   */
  onFailure?: (variables: TVariables, code?: ErrorCode, error?: unknown) => void
  /**
   * Story 4.7: what 「重試」 does instead of sending the same variables
   * again (an add judges its current rows again, like a press).
   */
  retry?: (variables: TVariables) => void
}

/**
 * Sends one call of `op`, whether or not the screen is still mounted. The
 * promise settles (never rejects) once the call and its callbacks are done.
 */
export function sendOp<TVariables, TCode extends ErrorCode, TData>(
  op: TrackedOp<TVariables, TCode, TData>,
  client: QueryClient,
  variables: TVariables,
): Promise<void> {
  const codes: ReadonlyArray<ErrorCode> = op.failureCodes
  const isFailureCode = (code: ErrorCode): code is TCode => codes.includes(code)
  const observer = new MutationObserver<TData, Error, TVariables>(client, {
    mutationKey: [op.name],
    mutationFn: op.call,
    networkMode: 'always',
    ...(op.scopeOf ? { scope: { id: op.scopeOf(variables) } } : {}),
    onMutate: (sent) => {
      for (const key of op.keysOf(sent)) toast.dismissFor(key)
      op.onSend?.(sent)
    },
    onSuccess: (data, sent) => op.onSuccess?.(client, sent, data),
    onError: (error, sent) => {
      op.onFailure?.(sent, isAppError(error) ? error.code : undefined, error)
      if (!isAppError(error) || !isFailureCode(error.code)) return
      toast.failure(op.failureText(sent, error.code, error), {
        keys: op.keysOf(sent),
        onRetry: () => {
          if (op.retry) op.retry(sent)
          else void sendOp(op, client, sent)
        },
      })
    },
  })
  // The failure path already ran in onError.
  return observer
    .mutate(variables)
    .then(
      () => undefined,
      () => undefined,
    )
    .finally(() => observer.reset())
}

/** The variables of `op`'s calls still running. */
export function useOpsInFlight<TVariables, TCode extends ErrorCode, TData>(
  op: TrackedOp<TVariables, TCode, TData>,
): Array<TVariables> {
  return useMutationState({
    filters: { mutationKey: [op.name], status: 'pending' },
    select: (mutation) => mutation.state.variables as TVariables,
  })
}
