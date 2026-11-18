import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import {
  SETTINGS_WRITE_FAILURE_CODES,
  sortSaveFailureText,
} from '#/lib/error-text'
import type { SettingsWriteFailureCode } from '#/lib/error-text'
import type {
  GetSettingsInput,
  SetCategorySortInput,
  Settings,
} from '#/shared/settings'
import { callFn } from '#/state/call-fn'
import { isLoginRequired, unlessLoginRequired } from '#/state/login-required'
import type { TrackedOp } from '#/state/tracked-op'

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
}

export function useSettings(): SettingsState {
  assertSettingsRegistered(useQueryClient())
  const query = useQuery<Settings>({ queryKey: SETTINGS_KEY })
  return {
    settings: query.data,
    ready: query.data !== undefined || query.errorUpdateCount > 0,
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

/** Send order of each save call (its variables object; 重試 resends it). */
let sendCount = 0
const sendOrder = new WeakMap<object, number>()
/** Per client and category: the send order of the last answer applied. */
const appliedOrder = new WeakMap<QueryClient, Map<string, number>>()

export type SetCategorySortCall = (
  input: SetCategorySortInput,
) => Promise<Settings>

/**
 * Story 3.1: saving a manual sort pick (`setCategorySort`) through `sendOp`.
 * Its failure codes are a settings write's (`settings_write_failed`,
 * `timeout`, `invalid_input`): the toast 「排序沒記住：…」 with 「重試」,
 * which sends the same call. A newer pick closes the toast of an older one.
 * The saves of one category run one after another (mutation `scope`), so
 * the file ends on the last pick; and an answer is only applied when no
 * answer of a later save of that category was applied before it.
 */
export function categorySortOp(
  call: SetCategorySortCall,
): TrackedOp<SetCategorySortInput, SettingsWriteFailureCode, Settings> {
  return {
    name: SORT_SAVE_OP,
    call,
    keysOf: ({ category }) => [`settings:sort:${category}`],
    scopeOf: ({ category }) => `${SORT_SAVE_OP}:${category}`,
    failureCodes: SETTINGS_WRITE_FAILURE_CODES,
    failureText: (_variables, code) => sortSaveFailureText(code),
    onSend: (variables) => {
      sendCount += 1
      sendOrder.set(variables, sendCount)
    },
    onSuccess: (client, variables, settings) => {
      const order = sendOrder.get(variables) ?? 0
      let applied = appliedOrder.get(client)
      if (applied === undefined) {
        applied = new Map()
        appliedOrder.set(client, applied)
      }
      if (order < (applied.get(variables.category) ?? 0)) return
      applied.set(variables.category, order)
      return applySettings(client, settings)
    },
  }
}

/**
 * One of this tab's sort saves of `category` is still in flight (story
 * 3.2: a save of another category never holds this one's follow rule).
 */
export function isSavingSort(client: QueryClient, category: string): boolean {
  const scope = `${SORT_SAVE_OP}:${category}`
  return (
    client.isMutating({
      mutationKey: [SORT_SAVE_OP],
      predicate: (mutation) => mutation.options.scope?.id === scope,
    }) > 0
  )
}
