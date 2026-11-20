import {
  QueryObserver,
  environmentManager,
  focusManager,
} from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '#/lib/app-error'
import { fakeHash, fakeResponse, t } from '#/lib/testing'
import { ALL } from '#/shared/categories'
import { MAX_COMMON_PATHS, defaultSettings } from '#/shared/settings'
import type {
  AddCommonPathInput,
  SetCategoryOrderInput,
  SetCategorySortInput,
  Settings,
} from '#/shared/settings'
import { clearConnectionErrors, getConnectionErrors } from '#/state/connection'
import { clearLoginRequired, markLoginRequired } from '#/state/login-required'
import { MAINDATA_KEY } from '#/state/maindata'
import { createQueryClient } from '#/state/query-client'
import {
  SETTINGS_KEY,
  addCommonPathOp,
  applySettings,
  ORDER_SAVE_OP,
  bindFetchSettings,
  categoryOrderOp,
  categorySortOp,
  isSavingSort,
  refreshSettings,
} from '#/state/settings'
import type { FetchSettings, GetSettingsFn } from '#/state/settings'
import { sendOp } from '#/state/tracked-op'

// Story 3.1: `['settings']` (read on first use and on window focus, never
// polled, no retry) and the sort-saving op (its answer becomes
// `['settings']`, its failures show 「排序沒記住：…」 with 重試).

const toastCalls = vi.hoisted(() => ({
  failures: [] as Array<{
    text: string
    keys: ReadonlyArray<string>
    onRetry: () => void
  }>,
  dismissed: [] as Array<string>,
}))
vi.mock('#/lib/toast', () => ({
  toast: {
    failure: (
      text: string,
      options: { keys: ReadonlyArray<string>; onRetry: () => void },
    ) => toastCalls.failures.push({ text, ...options }),
    dismissFor: (key: string) => toastCalls.dismissed.push(key),
  },
}))

const withSort = (sort: 'ratio' | 'seeding_time'): Settings => ({
  ...defaultSettings(),
  categorySort: { [ALL]: { sort, dir: 'desc' } },
})

let cleanups: Array<() => void> = []

beforeEach(() => {
  vi.stubGlobal('window', { location: { pathname: '/', search: '', hash: '' } })
  environmentManager.setIsServer(() => false)
  clearLoginRequired()
  clearConnectionErrors()
  toastCalls.failures.length = 0
  toastCalls.dismissed.length = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  for (const cleanup of cleanups) cleanup()
  cleanups = []
  focusManager.setFocused(undefined)
  environmentManager.setIsServer(() => typeof window === 'undefined')
  clearLoginRequired()
  clearConnectionErrors()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function setup(fetchSettings: FetchSettings) {
  const client = createQueryClient({ currentPath: () => '/', fetchSettings })
  client.mount()
  const observer = new QueryObserver<Settings>(client, {
    queryKey: SETTINGS_KEY,
  })
  const unsubscribe = observer.subscribe(() => {})
  cleanups.push(() => {
    unsubscribe()
    client.unmount()
    client.clear()
  })
  return { client, observer }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

async function focusAgain() {
  focusManager.setFocused(false)
  focusManager.setFocused(true)
  await flush()
}

describe('bindFetchSettings', () => {
  it('calls getSettings with no input and answers its data', async () => {
    const getSettings = vi.fn<GetSettingsFn>(async () => ({
      ok: true,
      data: withSort('ratio'),
    }))
    const signal = new AbortController().signal
    expect(await bindFetchSettings(getSettings)(signal)).toEqual(
      withSort('ratio'),
    )
    expect(getSettings).toHaveBeenCalledTimes(1)
    expect(getSettings.mock.calls[0][0].data).toBeUndefined()
  })
})

describe('the settings query', () => {
  it('reads once, never polls, and again on every window focus', async () => {
    const fetchSettings = vi
      .fn<FetchSettings>()
      .mockResolvedValueOnce(withSort('ratio'))
      .mockResolvedValue(withSort('seeding_time'))
    const { client, observer } = setup(fetchSettings)
    await flush()
    expect(observer.getCurrentResult().data).toEqual(withSort('ratio'))
    // A second reader mounting does not fetch again.
    const second = new QueryObserver<Settings>(client, {
      queryKey: SETTINGS_KEY,
    })
    const unsubscribe = second.subscribe(() => {})
    await flush()
    unsubscribe()
    expect(fetchSettings).toHaveBeenCalledTimes(1)
    await focusAgain()
    expect(fetchSettings).toHaveBeenCalledTimes(2)
    expect(observer.getCurrentResult().data).toEqual(withSort('seeding_time'))
  })

  it('no retry: a failed read settles at once and the next focus retries', async () => {
    const fetchSettings = vi
      .fn<FetchSettings>()
      .mockRejectedValueOnce(new AppError('home_unreachable'))
      .mockResolvedValue(withSort('ratio'))
    const { observer } = setup(fetchSettings)
    await flush()
    expect(fetchSettings).toHaveBeenCalledTimes(1)
    expect(observer.getCurrentResult().errorUpdateCount).toBe(1)
    // A connection code goes to the global handler (the alert).
    expect(getConnectionErrors()).toEqual(['home_unreachable'])
    await focusAgain()
    expect(fetchSettings).toHaveBeenCalledTimes(2)
    expect(observer.getCurrentResult().data).toEqual(withSort('ratio'))
  })

  it('while the login screen is needed, a focus does not read', async () => {
    const fetchSettings = vi.fn<FetchSettings>(async () => defaultSettings())
    setup(fetchSettings)
    await flush()
    markLoginRequired('not_logged_in', '/')
    await focusAgain()
    expect(fetchSettings).toHaveBeenCalledTimes(1)
  })
})

describe('applySettings', () => {
  it('cancels a read in flight, so an older answer cannot land after the write', async () => {
    let resolveRead: (value: Settings) => void = () => {}
    const fetchSettings = vi
      .fn<FetchSettings>()
      .mockResolvedValueOnce(withSort('ratio'))
      .mockImplementationOnce(
        () =>
          new Promise<Settings>((resolve) => {
            resolveRead = resolve
          }),
      )
    const { client, observer } = setup(fetchSettings)
    await flush()
    void client.refetchQueries({ queryKey: SETTINGS_KEY })
    await flush()
    await applySettings(client, withSort('seeding_time'))
    resolveRead(withSort('ratio'))
    await flush()
    expect(observer.getCurrentResult().data).toEqual(withSort('seeding_time'))
  })
})

describe('categorySortOp', () => {
  const input: SetCategorySortInput = {
    category: ALL,
    sort: 'seeding_time',
    dir: 'desc',
  }

  function sortClient(): QueryClient {
    return setup(async () => withSort('ratio')).client
  }

  it('success: the answer becomes ["settings"]; saving until it settles', async () => {
    const client = sortClient()
    await flush()
    let answer: (value: Settings) => void = () => {}
    const call = vi.fn(
      (_values: SetCategorySortInput) =>
        new Promise<Settings>((resolve) => {
          answer = resolve
        }),
    )
    sendOp(categorySortOp(call), client, input)
    await flush()
    expect(call.mock.calls[0][0]).toEqual(input)
    expect(isSavingSort(client, ALL)).toBe(true)
    // Story 3.2: only that category's saves count.
    expect(isSavingSort(client, 'mteam-X')).toBe(false)
    // A newer pick closes the toast of an older one.
    expect(toastCalls.dismissed).toEqual([`settings:sort:${ALL}`])
    answer(withSort('seeding_time'))
    await flush()
    await flush()
    expect(client.getQueryData(SETTINGS_KEY)).toEqual(withSort('seeding_time'))
    expect(isSavingSort(client, ALL)).toBe(false)
    expect(toastCalls.failures).toEqual([])
  })

  it('two saves of one category run one after another', async () => {
    const client = sortClient()
    await flush()
    const answers: Array<(value: Settings) => void> = []
    const call = vi.fn(
      (_values: SetCategorySortInput) =>
        new Promise<Settings>((resolve) => {
          answers.push(resolve)
        }),
    )
    const op = categorySortOp(call)
    sendOp(op, client, { category: ALL, sort: 'ratio', dir: 'desc' })
    sendOp(op, client, { category: ALL, sort: 'seeding_time', dir: 'desc' })
    await flush()
    // The second waits for the first to settle.
    expect(call).toHaveBeenCalledTimes(1)
    answers[0](withSort('ratio'))
    await flush()
    await flush()
    expect(call).toHaveBeenCalledTimes(2)
    expect(call.mock.calls[1][0]).toMatchObject({ sort: 'seeding_time' })
    answers[1](withSort('seeding_time'))
    await flush()
    await flush()
    expect(client.getQueryData(SETTINGS_KEY)).toEqual(withSort('seeding_time'))
  })

  it('saves of different categories also run one after another', async () => {
    const client = sortClient()
    await flush()
    const answers: Array<(value: Settings) => void> = []
    const call = vi.fn(
      (_values: SetCategorySortInput) =>
        new Promise<Settings>((resolve) => {
          answers.push(resolve)
        }),
    )
    const op = categorySortOp(call)
    sendOp(op, client, { category: ALL, sort: 'ratio', dir: 'desc' })
    sendOp(op, client, { category: 'X', sort: 'ratio', dir: 'asc' })
    await flush()
    // One settings write queue: the container writes them in send order.
    expect(call).toHaveBeenCalledTimes(1)
    // Each category's own save counts, queued or sent.
    expect(isSavingSort(client, ALL)).toBe(true)
    expect(isSavingSort(client, 'X')).toBe(true)
    answers[0](withSort('ratio'))
    await flush()
    await flush()
    expect(call).toHaveBeenCalledTimes(2)
    expect(isSavingSort(client, ALL)).toBe(false)
    expect(isSavingSort(client, 'X')).toBe(true)
  })

  it.each([
    ['settings_write_failed', '排序沒記住：設定檔寫不進去'],
    ['timeout', '排序沒記住：容器沒有回應，請再試一次'],
    ['invalid_input', '排序沒記住：送出的資料格式不對'],
  ] as const)(
    '%s: the failure toast with 重試, which sends the same call',
    async (code, text) => {
      const client = sortClient()
      await flush()
      const call = vi
        .fn<(values: SetCategorySortInput) => Promise<Settings>>()
        .mockRejectedValueOnce(new AppError(code))
        .mockResolvedValue(withSort('seeding_time'))
      sendOp(categorySortOp(call), client, input)
      await flush()
      await flush()
      expect(toastCalls.failures).toHaveLength(1)
      expect(toastCalls.failures[0].text).toBe(text)
      expect(toastCalls.failures[0].keys).toEqual([`settings:sort:${ALL}`])
      // The settings stay what they were.
      expect(client.getQueryData(SETTINGS_KEY)).toEqual(withSort('ratio'))
      toastCalls.failures[0].onRetry()
      await flush()
      await flush()
      expect(call).toHaveBeenCalledTimes(2)
      expect(call.mock.calls[1][0]).toEqual(input)
      expect(client.getQueryData(SETTINGS_KEY)).toEqual(
        withSort('seeding_time'),
      )
    },
  )

  it.each([
    ['qbit_rejected'],
    ['home_unreachable'],
    ['not_logged_in'],
  ] as const)(
    '%s: no toast (not a settings write failure, or the global handler)',
    async (code) => {
      const client = sortClient()
      await flush()
      const call = vi.fn(() => Promise.reject(new AppError(code)))
      sendOp(categorySortOp(call), client, input)
      await flush()
      await flush()
      expect(toastCalls.failures).toEqual([])
    },
  )
})

describe('categoryOrderOp (story 3.3)', () => {
  const withOrder = (...order: Array<string>): Settings => ({
    ...withSort('ratio'),
    categoryOrder: order,
  })

  /** Categories a, b, c (torrents) and d (none), like the matrix. */
  const maindata = fakeResponse({
    changed: ['a', 'b', 'c'].map((category, i) =>
      t({ hash: fakeHash(i + 1), category }),
    ),
    categories: Object.fromEntries(
      ['a', 'b', 'c', 'd'].map((name) => [name, { name, savePath: '/data' }]),
    ),
  })

  /** A client whose settings say `categoryOrder: ['b']`, maindata loaded. */
  async function orderClient(settings = withOrder('b')): Promise<QueryClient> {
    const client = createQueryClient({
      currentPath: () => '/',
      fetchSettings: async () => settings,
      fetchMaindata: async () => maindata,
    })
    client.mount()
    cleanups.push(() => {
      client.unmount()
      client.clear()
    })
    await client.fetchQuery({ queryKey: SETTINGS_KEY })
    await client.fetchQuery({ queryKey: MAINDATA_KEY })
    return client
  }

  function deferredCall() {
    const answers: Array<(value: Settings) => void> = []
    const call = vi.fn(
      (_values: SetCategoryOrderInput) =>
        new Promise<Settings>((resolve) => {
          answers.push(resolve)
        }),
    )
    return { call, answers }
  }

  const pending = (client: QueryClient) =>
    client.isMutating({ mutationKey: [ORDER_SAVE_OP] })

  it('carries the move and sends the whole order built from the current settings', async () => {
    const client = await orderClient()
    const { call, answers } = deferredCall()
    sendOp(categoryOrderOp(call, client), client, { key: 'c', direction: -1 })
    await flush()
    // Matrix "Move up": b, a, c, d with c up.
    expect(call.mock.calls[0][0]).toEqual({ order: ['b', 'c', 'a', 'd'] })
    expect(pending(client)).toBe(1)
    // No optimistic move: the settings stay until the answer.
    expect(client.getQueryData(SETTINGS_KEY)).toEqual(withOrder('b'))
    expect(toastCalls.dismissed).toEqual(['settings:order'])
    answers[0](withOrder('b', 'c', 'a', 'd'))
    await flush()
    await flush()
    expect(client.getQueryData(SETTINGS_KEY)).toEqual(
      withOrder('b', 'c', 'a', 'd'),
    )
    expect(pending(client)).toBe(0)
    expect(toastCalls.failures).toEqual([])
  })

  it('keeps saved entries that are not listed now', async () => {
    // 未分類 is saved but no torrent is uncategorized; 'gone' is missing.
    const client = await orderClient(withOrder('b', '', 'gone'))
    const { call } = deferredCall()
    sendOp(categoryOrderOp(call, client), client, { key: 'd', direction: -1 })
    await flush()
    expect(call.mock.calls[0][0]).toEqual({
      order: ['b', '', 'gone', 'a', 'd', 'c'],
    })
  })

  it('a queued press applies its move to the order the first answer saved', async () => {
    const client = await orderClient()
    const { call, answers } = deferredCall()
    const op = categoryOrderOp(call, client)
    sendOp(op, client, { key: 'c', direction: -1 })
    sendOp(op, client, { key: 'd', direction: -1 })
    await flush()
    // The second waits for the first to settle.
    expect(call).toHaveBeenCalledTimes(1)
    answers[0](withOrder('b', 'c', 'a', 'd'))
    await flush()
    await flush()
    expect(call).toHaveBeenCalledTimes(2)
    expect(call.mock.calls[1][0]).toEqual({ order: ['b', 'c', 'd', 'a'] })
  })

  it('nothing is sent when the category cannot move that way (any more)', async () => {
    const client = await orderClient()
    const { call } = deferredCall()
    sendOp(categoryOrderOp(call, client), client, { key: 'b', direction: -1 })
    await flush()
    await flush()
    expect(call).not.toHaveBeenCalled()
    expect(pending(client)).toBe(0)
    expect(client.getQueryData(SETTINGS_KEY)).toEqual(withOrder('b'))
  })

  it.each([
    ['settings_write_failed', '順序沒存到：設定檔寫不進去'],
    ['timeout', '順序沒存到：容器沒有回應，請再試一次'],
    ['invalid_input', '順序沒存到：送出的資料格式不對'],
  ] as const)(
    '%s: the failure toast with 重試, the order unchanged',
    async (code, text) => {
      const client = await orderClient()
      const call = vi
        .fn<(values: SetCategoryOrderInput) => Promise<Settings>>()
        .mockRejectedValueOnce(new AppError(code))
        .mockResolvedValue(withOrder('b', 'c', 'a', 'd'))
      sendOp(categoryOrderOp(call, client), client, {
        key: 'c',
        direction: -1,
      })
      await flush()
      await flush()
      expect(toastCalls.failures).toHaveLength(1)
      expect(toastCalls.failures[0].text).toBe(text)
      expect(toastCalls.failures[0].keys).toEqual(['settings:order'])
      expect(client.getQueryData(SETTINGS_KEY)).toEqual(withOrder('b'))
      toastCalls.failures[0].onRetry()
      await flush()
      await flush()
      expect(call).toHaveBeenCalledTimes(2)
      expect(call.mock.calls[1][0]).toEqual({ order: ['b', 'c', 'a', 'd'] })
      expect(client.getQueryData(SETTINGS_KEY)).toEqual(
        withOrder('b', 'c', 'a', 'd'),
      )
    },
  )

  it('重試 after the settings changed elsewhere reapplies the move to the new order', async () => {
    const client = await orderClient()
    const call = vi
      .fn<(values: SetCategoryOrderInput) => Promise<Settings>>()
      .mockRejectedValueOnce(new AppError('settings_write_failed'))
      .mockImplementation(async ({ order }) => withOrder(...order))
    sendOp(categoryOrderOp(call, client), client, { key: 'c', direction: -1 })
    await flush()
    await flush()
    expect(call.mock.calls[0][0]).toEqual({ order: ['b', 'c', 'a', 'd'] })
    // Another device saved a new order; this page read it (focus, mount).
    await applySettings(client, withOrder('d', 'a', 'c', 'b'))
    toastCalls.failures[0].onRetry()
    await flush()
    await flush()
    // c up in d, a, c, b, not the old snapshot.
    expect(call.mock.calls[1][0]).toEqual({ order: ['d', 'c', 'a', 'b'] })
    expect(client.getQueryData(SETTINGS_KEY)).toEqual(
      withOrder('d', 'c', 'a', 'b'),
    )
  })

  it.each([
    ['home_unreachable'],
    ['not_logged_in'],
    ['qbit_rejected'],
  ] as const)(
    '%s: no toast (the global handler, or not a settings write failure)',
    async (code) => {
      const client = await orderClient()
      const call = vi.fn(() => Promise.reject(new AppError(code)))
      sendOp(categoryOrderOp(call, client), client, {
        key: 'c',
        direction: -1,
      })
      await flush()
      await flush()
      expect(toastCalls.failures).toEqual([])
      expect(client.getQueryData(SETTINGS_KEY)).toEqual(withOrder('b'))
    },
  )

  it('an order save waits for a sort save sent before it, then builds on its answer', async () => {
    const client = await orderClient()
    let answerSort: (value: Settings) => void = () => {}
    const sortOp = categorySortOp(
      () =>
        new Promise<Settings>((resolve) => {
          answerSort = resolve
        }),
    )
    const { call, answers } = deferredCall()
    sendOp(sortOp, client, { category: 'a', sort: 'ratio', dir: 'asc' })
    await flush()
    sendOp(categoryOrderOp(call, client), client, { key: 'c', direction: -1 })
    await flush()
    // Queued behind the sort save: nothing sent yet.
    expect(call).not.toHaveBeenCalled()
    const sortWritten: Settings = {
      ...withOrder('b'),
      categorySort: {
        ...withOrder('b').categorySort,
        a: { sort: 'ratio', dir: 'asc' },
      },
    }
    answerSort(sortWritten)
    await flush()
    await flush()
    expect(call).toHaveBeenCalledTimes(1)
    const orderWritten: Settings = {
      ...sortWritten,
      categoryOrder: ['b', 'c', 'a', 'd'],
    }
    answers[0](orderWritten)
    await flush()
    await flush()
    // The last answer holds both writes.
    expect(client.getQueryData(SETTINGS_KEY)).toEqual(orderWritten)
  })

  it('refreshSettings reads the settings again', async () => {
    const fetchSettings = vi.fn<FetchSettings>(async () => withOrder('b'))
    const { client } = setup(fetchSettings)
    await flush()
    expect(fetchSettings).toHaveBeenCalledTimes(1)
    await refreshSettings(client)
    expect(fetchSettings).toHaveBeenCalledTimes(2)
  })
})

describe('addCommonPathOp (spec 5.2)', () => {
  const input: AddCommonPathInput = {
    path: '/data/media/anime',
    name: 'media/anime',
    mediaLibrary: false,
  }
  const withPaths = (count: number): Settings => ({
    ...defaultSettings(),
    commonPaths: Array.from({ length: count }, (_, index) => ({
      path: `/data/p${index}`,
      name: `p${index}`,
      mediaLibrary: false,
    })),
  })

  it('success: the answer becomes ["settings"], in the settings write queue', async () => {
    const client = setup(async () => withPaths(1)).client
    await flush()
    const answer = {
      ...withPaths(1),
      commonPaths: [...withPaths(1).commonPaths, { ...input }],
    }
    const call = vi.fn((_values: AddCommonPathInput) => Promise.resolve(answer))
    const op = addCommonPathOp(call, client)
    expect(op.scopeOf?.(input)).toBe('settings-write')
    sendOp(op, client, input)
    await flush()
    await flush()
    expect(call.mock.calls[0][0]).toEqual(input)
    expect(client.getQueryData(SETTINGS_KEY)).toEqual(answer)
    expect(toastCalls.dismissed).toEqual([
      'settings:common-path:/data/media/anime',
    ])
    expect(toastCalls.failures).toEqual([])
  })

  it.each([
    ['invalid_input', MAX_COMMON_PATHS, '常用路徑最多 50 個'],
    ['invalid_input', 3, '沒加到常用：這個路徑不在允許的下載資料夾底下'],
    ['settings_write_failed', MAX_COMMON_PATHS, '沒加到常用：設定檔寫不進去'],
    ['timeout', 0, '沒加到常用：容器沒有回應，請再試一次'],
  ] as const)(
    '%s with %i listed: the failure toast reads %s, 重試 sends the same call',
    async (code, listed, text) => {
      const client = setup(async () => withPaths(listed)).client
      await flush()
      const call = vi
        .fn<(values: AddCommonPathInput) => Promise<Settings>>()
        .mockRejectedValueOnce(new AppError(code))
        .mockResolvedValue(withPaths(listed))
      sendOp(addCommonPathOp(call, client), client, input)
      await flush()
      await flush()
      expect(toastCalls.failures).toHaveLength(1)
      expect(toastCalls.failures[0].text).toBe(text)
      toastCalls.failures[0].onRetry()
      await flush()
      await flush()
      expect(call).toHaveBeenCalledTimes(2)
      expect(call.mock.calls[1][0]).toEqual(input)
    },
  )

  it('a connection code: no toast (the global handler)', async () => {
    const client = setup(async () => withPaths(0)).client
    await flush()
    const call = vi.fn(() => Promise.reject(new AppError('home_unreachable')))
    sendOp(addCommonPathOp(call, client), client, input)
    await flush()
    await flush()
    expect(toastCalls.failures).toEqual([])
  })
})
