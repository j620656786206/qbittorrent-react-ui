import {
  QueryObserver,
  environmentManager,
  focusManager,
} from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '#/lib/app-error'
import { ALL } from '#/shared/categories'
import { defaultSettings } from '#/shared/settings'
import type { SetCategorySortInput, Settings } from '#/shared/settings'
import { clearConnectionErrors, getConnectionErrors } from '#/state/connection'
import { clearLoginRequired, markLoginRequired } from '#/state/login-required'
import { createQueryClient } from '#/state/query-client'
import {
  SETTINGS_KEY,
  applySettings,
  bindFetchSettings,
  categorySortOp,
  isSavingSort,
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
    expect(isSavingSort(client)).toBe(true)
    // A newer pick closes the toast of an older one.
    expect(toastCalls.dismissed).toEqual([`settings:sort:${ALL}`])
    answer(withSort('seeding_time'))
    await flush()
    await flush()
    expect(client.getQueryData(SETTINGS_KEY)).toEqual(withSort('seeding_time'))
    expect(isSavingSort(client)).toBe(false)
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

  it('an answer of an older save is never applied over a newer one', async () => {
    const client = sortClient()
    await flush()
    const op = categorySortOp(() => Promise.resolve(defaultSettings()))
    const older: SetCategorySortInput = {
      category: ALL,
      sort: 'ratio',
      dir: 'desc',
    }
    const newer: SetCategorySortInput = {
      category: ALL,
      sort: 'seeding_time',
      dir: 'desc',
    }
    op.onSend?.(older)
    op.onSend?.(newer)
    await op.onSuccess?.(client, newer, withSort('seeding_time'))
    await op.onSuccess?.(client, older, withSort('ratio'))
    expect(client.getQueryData(SETTINGS_KEY)).toEqual(withSort('seeding_time'))
    // Another category is ordered on its own.
    const other: SetCategorySortInput = {
      category: 'X',
      sort: 'ratio',
      dir: 'asc',
    }
    op.onSend?.(other)
    await op.onSuccess?.(client, other, withSort('ratio'))
    expect(client.getQueryData(SETTINGS_KEY)).toEqual(withSort('ratio'))
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
