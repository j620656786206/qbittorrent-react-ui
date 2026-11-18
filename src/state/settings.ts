import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import {
  SETTINGS_WRITE_FAILURE_CODES,
  orderSaveFailureText,
  sortSaveFailureText,
} from '#/lib/error-text'
import type { SettingsWriteFailureCode } from '#/lib/error-text'
import { categoryOrderRowsOf, orderAfterMove } from '#/lib/category-order'
import type { Maindata } from '#/lib/maindata-merge'
import type {
  GetSettingsInput,
  SetCategoryOrderInput,
  SetCategorySortInput,
  Settings,
} from '#/shared/settings'
import { callFn } from '#/state/call-fn'
import { isLoginRequired, unlessLoginRequired } from '#/state/login-required'
import type { TrackedOp } from '#/state/tracked-op'
import { MAINDATA_KEY } from '#/state/maindata'

// AD-8, story 3.1: `['settings']`, the settings file on the NAS (getSettings).
// Not polled: read once, then again whenever the window regains focus, so
// another device's change shows up when Alex comes back. No retry: a failed
// read counts as answered (the screen uses the defaults and never sticks on
// the skeleton, Claude 代決) and the next focus is the retry. A settings
// write answers the whole new settings, which `applySettings` writes into
// the key (no optimistic update, AD-7). src/state may not import server
// functions: src/router.tsx passes `bindFetchSettings(getSettings)` to
// createQueryClient, like maindata, and the `_authed` layout builds the
// sort-saving op with the bound `setCategorySort` call.
// https://tanstack.com/query/v5/docs/framework/react/reference/useQuery
// https://tanstack.com/query/v5/docs/reference/QueryClient#queryclientsetquerydata

export const SETTINGS_KEY = ['settings'] as const

export type FetchSettings = (signal: AbortSignal) => Promise<Settings>

/** The client half of the `getSettings` server function. */
export type GetSettingsFn = (options: {
  data?: GetSettingsInput
  headers?: HeadersInit
  signal?: AbortSignal
}) => Promise<
  | { ok: true; data: Settings }
  | { ok: false; error: { code: string; message: string } }
>

export function bindFetchSettings(getSettings: GetSettingsFn): FetchSettings {
  return (signal) => callFn(getSettings, undefined, { signal })
}

/** Registered on the client by createQueryClient({ fetchSettings }). */
export function settingsQueryDefaults(fetchSettings: FetchSettings) {
  return {
    queryFn: ({ signal }: { signal: AbortSignal }) => fetchSettings(signal),
    // Only a focus (or a write's answer) brings new settings; a second
    // reader mounting does not refetch.
    staleTime: Infinity,
    refetchOnWindowFocus: () => (isLoginRequired() ? false : 'always'),
    enabled: unlessLoginRequired,
    retry: false,
    networkMode: 'always',
  } as const
}

function assertSettingsRegistered(client: QueryClient): void {
  if (client.getQueryDefaults(SETTINGS_KEY).queryFn) return
  throw new Error(
    "['settings'] has no query function: build the QueryClient with createQueryClient({ fetchSettings }) (src/router.tsx does).",
  )
}

export interface SettingsState {
  /** The last answer; `undefined` before the first (or after failures only). */
  settings: Settings | undefined
  /**
   * The first read has answered, with data or an error. Sticky: Query
   * resets a data-less query to `pending` on every refetch, while
   * `errorUpdateCount` only grows.
   */
  ready: boolean
  /**
   * The latest read failed: `settings` (if any) is an older answer that
   * may no longer match the file. Clears once a read answers again.
   */
  readFailed: boolean
}

export function useSettings(): SettingsState {
  assertSettingsRegistered(useQueryClient())
  const query = useQuery<Settings>({ queryKey: SETTINGS_KEY })
  return {
    settings: query.data,
    ready: query.data !== undefined || query.errorUpdateCount > 0,
    readFailed: query.isError,
  }
}

/**
 * A settings write's answer becomes `['settings']`. A read still in flight
 * is cancelled first: it may have read the file before this write, and
 * landing after it would look like a change from another device.
 */
export async function applySettings(
  client: QueryClient,
  settings: Settings,
): Promise<void> {
  await client.cancelQueries({ queryKey: SETTINGS_KEY, exact: true })
  client.setQueryData(SETTINGS_KEY, settings)
}

export const SORT_SAVE_OP = 'save-category-sort'

/**
 * Every settings write (sort and order saves) shares this mutation `scope`,
 * so a write is sent only once the one before it settled, its awaited
 * `onSuccess` (applySettings) included. The container then writes them in
 * send order and every answer, the whole file, is newer than the one
 * applied before it: no answer can revert another write in the cache.
 * https://tanstack.com/query/v5/docs/framework/react/guides/mutations#mutation-scopes
 */
export const SETTINGS_WRITE_SCOPE = 'settings-write'

export type SetCategorySortCall = (
  input: SetCategorySortInput,
) => Promise<Settings>

/**
 * Story 3.1: saving a manual sort pick (`setCategorySort`) through `sendOp`.
 * Its failure codes are a settings write's (`settings_write_failed`,
 * `timeout`, `invalid_input`): the toast 「排序沒記住：…」 with 「重試」,
 * which sends the same call. A newer pick closes the toast of an older one.
 * It runs in the settings write queue (SETTINGS_WRITE_SCOPE), so the file
 * ends on the last pick.
 */
export function categorySortOp(
  call: SetCategorySortCall,
): TrackedOp<SetCategorySortInput, SettingsWriteFailureCode, Settings> {
  return {
    name: SORT_SAVE_OP,
    call,
    keysOf: ({ category }) => [`settings:sort:${category}`],
    scopeOf: () => SETTINGS_WRITE_SCOPE,
    failureCodes: SETTINGS_WRITE_FAILURE_CODES,
    failureText: (_variables, code) => sortSaveFailureText(code),
    onSuccess: (client, _variables, settings) =>
      applySettings(client, settings),
  }
}

/**
 * One of this tab's sort saves of `category` is still in flight (story
 * 3.2: a save of another category never holds this one's follow rule).
 */
export function isSavingSort(client: QueryClient, category: string): boolean {
  return (
    client.isMutating({
      mutationKey: [SORT_SAVE_OP],
      predicate: (mutation) =>
        (mutation.state.variables as SetCategorySortInput | undefined)
          ?.category === category,
    }) > 0
  )
}

export const ORDER_SAVE_OP = 'save-category-order'

export type SetCategoryOrderCall = (
  input: SetCategoryOrderInput,
) => Promise<Settings>

/** One arrow press on the settings page: which category, which way. */
export interface CategoryOrderSave {
  /** The category whose arrow was pressed (its row waits for the answer). */
  key: string
  /** `-1` up, `1` down. */
  direction: -1 | 1
}

/**
 * Story 3.3: saving a move in the category tab order (`setCategoryOrder`)
 * through `sendOp`. The op carries the move, not an order: when the call
 * runs it builds the whole new order from the current `['settings']` and
 * `['maindata']` (orderAfterMove, which keeps saved entries not listed
 * now), so a page left open, a press queued behind another or a later
 * 「重試」 applies the same move to the newest order instead of resending an
 * old snapshot. The input sent is still the whole order (idempotent on the
 * container). Nothing is sent when the settings or maindata are unknown
 * or the category cannot move that way any more (the answer is `null`).
 * No optimistic move (AD-7): the list and the tabs take the order from the
 * answer, which `applySettings` writes into `['settings']`. Its failure
 * codes are a settings write's: the toast 「順序沒存到：…」 with 「重試」; a
 * newer press closes the toast of an older one. Like every settings write
 * it runs in the write queue (SETTINGS_WRITE_SCOPE), so it starts after the
 * write before it has settled and its answer was applied.
 */
export function categoryOrderOp(
  call: SetCategoryOrderCall,
  client: QueryClient,
): TrackedOp<CategoryOrderSave, SettingsWriteFailureCode, Settings | null> {
  return {
    name: ORDER_SAVE_OP,
    call: async (variables) => {
      const { key, direction } = variables
      const settings = client.getQueryData<Settings>(SETTINGS_KEY)
      const maindata = client.getQueryData<Maindata>(MAINDATA_KEY)
      if (settings === undefined || maindata === undefined) return null
      const stored = settings.categoryOrder
      const order = orderAfterMove({
        stored,
        listed: categoryOrderRowsOf(maindata, stored).map((row) => row.key),
        key,
        delta: direction,
      })
      if (order === null) return null
      return call({ order })
    },
    keysOf: () => ['settings:order'],
    scopeOf: () => SETTINGS_WRITE_SCOPE,
    failureCodes: SETTINGS_WRITE_FAILURE_CODES,
    failureText: (_variables, code) => orderSaveFailureText(code),
    onSuccess: (queryClient, _variables, settings) =>
      settings === null ? undefined : applySettings(queryClient, settings),
  }
}

/**
 * Story 3.3: reads `['settings']` again now (the settings page on mount),
 * so its arrows start from the file as it is, not an old answer.
 */
export function refreshSettings(client: QueryClient): Promise<void> {
  if (isLoginRequired()) return Promise.resolve()
  return client.refetchQueries({ queryKey: SETTINGS_KEY, exact: true })
}
