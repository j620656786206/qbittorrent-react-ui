import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { addBatches, judgeEntries } from '#/lib/add-entries'
import {
  AppError,
  isAppError,
  isConnectionCode,
  isLoginStopCode,
} from '#/lib/app-error'
import type { ConnectionCode, LoginStopReason } from '#/lib/app-error'
import { OPERATION_FAILURE_CODES, addFailureText } from '#/lib/error-text'
import type { Maindata } from '#/lib/maindata-merge'
import { toast } from '#/lib/toast'
import { addTorrents } from '#/server/functions/add-torrents'
import { addOpenStore, closeAdd } from '#/state/add-open'
import { callFn } from '#/state/call-fn'
import { MAINDATA_KEY, refreshMaindata } from '#/state/maindata'
import { cancelOpenWhenAdded, openWhenAdded } from '#/state/open-when-added'
import { addCallTimeoutMs } from '#/shared/torrent-add'
import { sendOp, useOpsInFlight } from '#/state/tracked-op'
import type { TrackedOp } from '#/state/tracked-op'
import {
  GO_SEE_LABEL,
  addFailureReason,
  addFormOf,
  addedToastText,
  outcomeOf,
} from '#/features/add/add-model'
import type { AddFailure, AddItem, AddOutcome } from '#/features/add/add-model'
import type { AddEntries } from '#/features/add/use-add-entries'

// Story 4.7 (EXPERIENCE add results, 送出中): submitting the add screen.
// The press judges every entry again against the `['maindata']` in the
// cache (a pasted torrent added elsewhere since is 以前下載過 and stays
// out), then sends the addable ones as 4.5's batches, one request after
// another, as ONE tracked op. 「重試」 is a press again: the rows on screen
// judged against the latest maindata (after a timeout some may be there
// already). Each request gets its own timeout, longer by its upload
// (`addCallTimeoutMs`). What came back:
// - every entry added: the screen closes when it still shows only what
//   the press saw (the current screen and category stay), maindata
//   refreshes (never edited here), and the 8 s toast
//   「已新增 N 個種子」 offers 「去看」: the add category like a tab press,
//   and with exactly one torrent its detail once it shows up
//   (src/state/open-when-added.ts);
// - some rejected: the added rows leave, each failed row keeps a reason,
//   the list frame's top line counts both, the dialog stays and a press
//   sends only what is left;
// - the first request failed as a whole (nothing was done): `qbit_rejected`,
//   `timeout` and `invalid_input` show 「新增失敗：…」 with 「重試」
//   (sendOp), connection codes are the global handler's; the list and the
//   category stay either way. `not_logged_in` discards the list (AD-9).
//   Every whole failure but `not_logged_in` refreshes maindata too (a
//   deleted category leaves the menu; a timeout or a lost connection may
//   still have added some). The add's own browser timeout is `timeout`
//   (the NAS may still be adding), not a lost connection.
// - a stop after something was added: a later request failing as a whole
//   (any code; `not_sent` when the browser failed before any answer), or
//   an answer with an entry failed by a timeout, a login-stop or a
//   connection code (the server stops at those, _add-entries.ts). The rest
//   is not sent and fails with that code, like the server's own rule: only
//   qBittorrent refusing one entry lets the next go. A login-stop or
//   connection code also reaches the global handler (login, the connection
//   alert), even in the first answer: `not_logged_in` shows what was added
//   before the list goes, the others leave the added rows and keep the
//   failed ones with their reasons, like a partial failure.
//   重試 uses the screen's current category, and does nothing (closing
//   the toast) when 新增 would be disabled.
// While the add is out (the press, or a 重試) the screen is `sending`: it
// ignores every close path and every change to the list or the category.
// Closing it, adding or removing a row or changing the category closes
// the failure toast, so a 重試 never runs for a list the screen no longer
// shows.

/** The add's failure toast is about this (one add screen at a time). */
export const ADD_TOAST_KEY = 'add-torrents'

export interface AddVariables {
  entries: ReadonlyArray<AddItem>
  category: string
}

/**
 * A login-stop or connection code once some were added (an entry of an
 * answer, or a later request): the global handler sees the code (login,
 * the connection alert), the screen sees what was done.
 */
export class AddInterrupted extends AppError {
  readonly outcome: AddOutcome

  constructor(code: LoginStopReason | ConnectionCode, outcome: AddOutcome) {
    super(code)
    this.outcome = outcome
  }
}

/** An answer's entry that stops the rest: the server stopped there too. */
function stopIn(part: AddOutcome): AddFailure['code'] | null {
  const stop = part.failed.find(
    ({ code }) =>
      code === 'timeout' ||
      (code !== 'not_sent' &&
        (isLoginStopCode(code) || isConnectionCode(code))),
  )
  return stop === undefined ? null : stop.code
}

/** Sends the batches in order and merges the answers (see the top). */
async function sendAdd({ entries, category }: AddVariables) {
  const outcome: AddOutcome = { added: [], failed: [] }
  const batches = addBatches(entries)
  for (const [index, batch] of batches.entries()) {
    const { form, order, bytes } = addFormOf(batch, category)
    let stop: AddFailure['code'] | null
    try {
      const result = await callFn(addTorrents, form, {
        timeoutMs: addCallTimeoutMs(bytes),
        timeoutCode: 'timeout',
      })
      const part = outcomeOf(order, result)
      outcome.added.push(...part.added)
      outcome.failed.push(...part.failed)
      stop = stopIn(part)
    } catch (error) {
      if (index === 0) throw error
      stop = isAppError(error) ? error.code : 'not_sent'
      for (const item of batch) outcome.failed.push({ item, code: stop })
    }
    if (stop === null) continue
    for (const item of batches.slice(index + 1).flat()) {
      outcome.failed.push({ item, code: stop })
    }
    if (
      stop !== 'not_sent' &&
      (isLoginStopCode(stop) || isConnectionCode(stop))
    ) {
      throw new AddInterrupted(stop, outcome)
    }
    break
  }
  return outcome
}

export const addTorrentsOp: TrackedOp<
  AddVariables,
  (typeof OPERATION_FAILURE_CODES)[number],
  AddOutcome
> = {
  name: 'add-torrents',
  call: sendAdd,
  keysOf: () => [ADD_TOAST_KEY],
  failureCodes: OPERATION_FAILURE_CODES,
  failureText: (_variables, code) => addFailureText(code),
}

const NO_FAILURES: ReadonlyMap<number, string> = new Map()

export interface AddResultSummary {
  /** How many the last partial failure added (the failed are counted live). */
  added: number
}

export interface AddSubmit {
  /** A send (the press or a 重試) is out: nothing closes, nothing sends. */
  sending: boolean
  /** Read in event handlers, which may run before a re-render. */
  isSending: () => boolean
  /** The reason under each failed row, by entry id. */
  failures: ReadonlyMap<number, string>
  /** The last partial failure's counts, until the next press or open. */
  summary: AddResultSummary | null
  submit: (category: string) => void
}

export function useAddSubmit(
  open: boolean,
  entries: AddEntries,
  selectCategory: (category: string) => void,
  /** The screen's category now and whether 新增 is disabled (for 重試). */
  screen: { category: string; disabled: boolean },
): AddSubmit {
  const client = useQueryClient()
  const { items, reading, removeAdded } = entries
  const [failures, setFailures] = useState(NO_FAILURES)
  const [summary, setSummary] = useState<AddResultSummary | null>(null)
  const [wasOpen, setWasOpen] = useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setFailures(NO_FAILURES)
      setSummary(null)
    }
  }
  /** Bumped on every open and close: an answer for an older one is dropped. */
  const generationRef = useRef(0)
  useLayoutEffect(() => {
    generationRef.current += 1
  }, [open])

  // Set on press, before the in-flight state shows (the same tick).
  const pressedRef = useRef(false)
  const [pressed, setPressed] = useState(false)
  const inFlight = useOpsInFlight(addTorrentsOp)
  const sending = pressed || inFlight.length > 0
  const sendingRef = useRef(sending)
  const isSending = useCallback(
    () => pressedRef.current || sendingRef.current,
    [],
  )
  // Kept current for an answer, or a 重試, that comes renders later.
  const latestRef = useRef({
    items,
    reading,
    removeAdded,
    selectCategory,
    screen,
    submit: (_category: string) => {},
  })

  const submit = (category: string) => {
    if (isSending() || category === '' || reading > 0) return
    const torrents = client.getQueryData<Maindata>(MAINDATA_KEY)?.torrents
    if (torrents === undefined) return
    const addable = judgeEntries(items, new Set(Object.keys(torrents)))
      .filter((row) => row.status === 'addable')
      .map((row) => row.entry)
    if (addable.length === 0) return
    cancelOpenWhenAdded()
    setFailures(NO_FAILURES)
    setSummary(null)
    pressedRef.current = true
    setPressed(true)
    const generation = generationRef.current
    const live = () => generation === generationRef.current
    /** What the press saw: the screen closes only if it still shows no more. */
    const seen = new Set(items.map((item) => item.id))

    const showAdded = (added: AddOutcome['added'], sentCategory: string) => {
      const single = added.length === 1 ? added[0].result : null
      toast.action(addedToastText(added.length), {
        label: GO_SEE_LABEL,
        run: () => {
          latestRef.current.selectCategory(sentCategory)
          if (single !== null && single.kind !== 'unreadable') {
            openWhenAdded(single.hash, sentCategory)
          }
        },
      })
    }

    /** Some failed: the added rows leave, the failed keep their reasons. */
    const showFailed = (outcome: AddOutcome) => {
      latestRef.current.removeAdded(outcome.added.map((item) => item.id))
      setFailures(
        new Map(
          outcome.failed.map((failure) => [
            failure.item.id,
            addFailureReason(failure),
          ]),
        ),
      )
      setSummary({ added: outcome.added.length })
    }

    const op: typeof addTorrentsOp = {
      ...addTorrentsOp,
      // A press again, with the screen's category now: a deleted one is
      // gone from the menu, so 新增 is disabled and 重試 does nothing.
      retry: () => {
        const latest = latestRef.current
        if (latest.screen.category === '' || latest.screen.disabled) {
          dismissAddFailure()
          return
        }
        latest.submit(latest.screen.category)
      },
      onSuccess: (sentClient, sent, outcome) => {
        void refreshMaindata(sentClient)
        if (!live()) return
        if (outcome.failed.length > 0) {
          showFailed(outcome)
          return
        }
        const latest = latestRef.current
        latest.removeAdded(outcome.added.map((item) => item.id))
        showAdded(outcome.added, sent.category)
        const unchanged =
          latest.reading === 0 &&
          addOpenStore.state.queued.length === 0 &&
          latest.items.every((item) => seen.has(item.id))
        if (unchanged) closeAdd()
      },
      onFailure: (_sent, code, error) => {
        if (error instanceof AddInterrupted && error.code !== 'not_logged_in') {
          // The global handler has the code; the screen keeps what failed.
          void refreshMaindata(client)
          if (live()) showFailed(error.outcome)
          return
        }
        if (error instanceof AddInterrupted) {
          if (!live()) return
          latestRef.current.removeAdded(
            error.outcome.added.map((item) => item.id),
          )
          if (error.outcome.added.length > 0) {
            toast.plain(addedToastText(error.outcome.added.length))
          }
          closeAdd()
          return
        }
        if (code === 'not_logged_in') {
          if (live()) closeAdd()
          return
        }
        // A deleted category leaves the menu; a timeout (the add's own
        // browser timeout included) or a lost connection may still have
        // added some.
        void refreshMaindata(client)
      },
    }
    void sendOp(op, client, { entries: addable, category }).then(() => {
      pressedRef.current = false
      setPressed(false)
    })
  }

  useLayoutEffect(() => {
    sendingRef.current = sending
    latestRef.current = {
      items,
      reading,
      removeAdded,
      selectCategory,
      screen,
      submit,
    }
  })

  return { sending, isSending, failures, summary, submit }
}

/** Closes the add's failure toast (its 重試 would send the old list). */
export function dismissAddFailure(): void {
  toast.dismissFor(ADD_TOAST_KEY)
}
