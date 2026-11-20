// @vitest-environment happy-dom
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fakeHash, t } from '#/lib/testing'
import { STILL_WAITING_TEXT } from '#/shared/ui/confirm-shell'
import { addCallTimeoutMs } from '#/shared/torrent-add'
import { addOpenStore, closeAdd, openAdd } from '#/state/add-open'
import { callFn } from '#/state/call-fn'
import type * as CallFnModule from '#/state/call-fn'
import { connectionStore } from '#/state/connection'
import { loginStore } from '#/state/login-required'
import { MAINDATA_KEY } from '#/state/maindata'
import { openWhenAdded, openWhenAddedStore } from '#/state/open-when-added'
import {
  NEW_A,
  NEW_B,
  NEW_C,
  base32,
  baseTorrents,
  buttonNamed,
  click,
  env,
  open,
  paste,
  pick,
  press,
  render,
  rowNames,
  rowStatuses,
  rows,
  screen,
  select,
  settle,
  settleReads,
  setDesktop,
  submit,
  pathLine,
  torrentFile,
  infoHashOf,
} from '#/features/add/add-screen-testing'

// Spec 4.7 C1 to C10: submitting the add screen in a DOM. `addTorrents`
// and the toast API are faked (AD-15); maindata comes from the harness.

interface SentForm {
  magnets: Array<string>
  files: Array<string>
  category: string
}

type Answer = (sent: SentForm, call: number) => Promise<unknown>

const addCalls = vi.hoisted(() => ({
  sent: [] as Array<SentForm>,
  answer: null as null | ((sent: SentForm, call: number) => Promise<unknown>),
}))
vi.mock('#/server/functions/add-torrents', () => ({
  addTorrents: (options: { data: FormData }) => {
    const form = options.data
    const sent: SentForm = {
      magnets: form.getAll('magnet') as Array<string>,
      files: (form.getAll('torrent') as Array<File>).map((file) => file.name),
      category: String(form.get('category')),
    }
    addCalls.sent.push(sent)
    const index = addCalls.sent.length - 1
    if (addCalls.answer) return addCalls.answer(sent, index)
    return Promise.resolve(allOk(sent))
  },
}))

const toastCalls = vi.hoisted(() => ({
  plain: vi.fn((_text: string) => {}),
  action: vi.fn(
    (_text: string, _options: { label: string; run: () => void }) => {},
  ),
  failure: vi.fn(
    (
      _text: string,
      _options: { keys: ReadonlyArray<string>; onRetry: () => void },
    ) => {},
  ),
  dismissFor: vi.fn((_key: string) => {}),
  setLift: vi.fn((_on: boolean) => {}),
}))
vi.mock('#/lib/toast', () => ({ toast: toastCalls }))

// The real callFn, watched: its options (the add's own timeout) are checked.
vi.mock('#/state/call-fn', async (importOriginal) => {
  const actual = await importOriginal<typeof CallFnModule>()
  return { ...actual, callFn: vi.fn(actual.callFn) }
})

function allOk(sent: SentForm) {
  const count = sent.magnets.length + sent.files.length
  return {
    ok: true,
    data: {
      items: Array.from({ length: count }, (_, key) => ({
        key: String(key),
        ok: true,
      })),
    },
  }
}

const failed = (code: string) => ({
  ok: false,
  error: { code, message: 'x' },
})

const magnet = (hash: string, name?: string) =>
  name === undefined
    ? `magnet:?xt=urn:btih:${hash}`
    : `magnet:?xt=urn:btih:${hash}&dn=${name}`

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

async function start(answer: Answer | null = null) {
  addCalls.sent.length = 0
  addCalls.answer = answer
  toastCalls.action.mockClear()
  toastCalls.plain.mockClear()
  toastCalls.failure.mockClear()
  toastCalls.dismissFor.mockClear()
  vi.mocked(callFn).mockClear()
  env.viewCategory = 'X'
  await render()
  await open()
}

const resultLine = () =>
  screen().querySelector('[data-add-result]')?.textContent ?? null
const reasons = () =>
  [...screen().querySelectorAll('[data-add-label="failed"]')].map(
    (label) => label.textContent,
  )

describe('C4 all ok', () => {
  it('sends the addable entries with the category, closes, refreshes and shows 已新增 N 個種子 with 去看 (8 s)', async () => {
    await start()
    await paste([magnet(NEW_A, 'Fake.A'), magnet(NEW_B)].join('\n'))
    const fetchesBefore = env.maindataFetches
    await click(submit())
    await settle()
    expect(addCalls.sent).toEqual([
      {
        magnets: [magnet(NEW_A, 'Fake.A'), magnet(NEW_B)],
        files: [],
        category: 'X',
      },
    ])
    expect(addOpenStore.state.open).toBe(false)
    expect(env.maindataFetches).toBeGreaterThan(fetchesBefore)
    expect(toastCalls.action).toHaveBeenCalledOnce()
    const [text, options] = toastCalls.action.mock.calls[0]
    expect(text).toBe('已新增 2 個種子')
    expect(options.label).toBe('去看')
    expect(env.setHash).not.toHaveBeenCalled()
    expect(env.selectCategory).not.toHaveBeenCalled()
  })

  it('a picked file is sent with its bytes as torrent, after the magnets', async () => {
    await start()
    const { file } = torrentFile('Fake.File')
    await pick([file])
    await settleReads()
    await paste(magnet(NEW_A))
    await click(submit())
    await settle()
    expect(addCalls.sent).toEqual([
      {
        magnets: [magnet(NEW_A)],
        files: ['Fake.File.torrent'],
        category: 'X',
      },
    ])
  })
})

describe('C5 去看', () => {
  it('several: switches to the add category, no detail wish', async () => {
    await start()
    await paste([magnet(NEW_A), magnet(NEW_B)].join('\n'))
    await click(submit())
    await settle()
    const [, options] = toastCalls.action.mock.calls[0]
    await act(async () => options.run())
    expect(env.selectCategory).toHaveBeenCalledExactlyOnceWith('X')
    expect(openWhenAddedStore.state).toBeNull()
  })

  it('one: also asks for its detail once it appears (by the info hash)', async () => {
    await start()
    const { file } = torrentFile('Fake.One')
    await pick([file])
    await settleReads()
    await click(submit())
    await settle()
    expect(toastCalls.action.mock.calls[0][0]).toBe('已新增 1 個種子')
    const [, options] = toastCalls.action.mock.calls[0]
    await act(async () => options.run())
    expect(env.selectCategory).toHaveBeenCalledExactlyOnceWith('X')
    expect(openWhenAddedStore.state).toMatchObject({
      hash: infoHashOf('Fake.One'),
      category: 'X',
    })
  })
})

describe('C1 judged again at the press', () => {
  it('a row that reached maindata after the paste is not sent and shows 以前下載過', async () => {
    await start()
    await paste([magnet(NEW_A), magnet(NEW_B)].join('\n'))
    expect(rowStatuses()).toEqual(['addable', 'addable'])
    env.torrents = [...baseTorrents(), t({ hash: NEW_A, name: 'Fake.A' })]
    // Into the cache without a render: only the press's judging sees it.
    await env.client.refetchQueries({ queryKey: MAINDATA_KEY })
    await click(submit())
    await settle()
    expect(addCalls.sent[0].magnets).toEqual([magnet(NEW_B)])
    expect(toastCalls.action.mock.calls[0][0]).toBe('已新增 1 個種子')
  })

  it('every row already there: nothing is sent and the screen stays', async () => {
    await start()
    await paste(magnet(NEW_A))
    env.torrents = [...baseTorrents(), t({ hash: NEW_A, name: 'Fake.A' })]
    await env.client.refetchQueries({ queryKey: MAINDATA_KEY })
    await click(submit())
    await settle()
    expect(addCalls.sent).toEqual([])
    expect(screen()).not.toBeNull()
    expect(rowStatuses()).toEqual(['existing'])
  })
})

describe('C2 batches', () => {
  it('25 addable entries go as two requests in order (20 + 5); the answers are merged', async () => {
    await start()
    const hashes = Array.from({ length: 25 }, (_, i) => fakeHash(0x100 + i))
    await paste(hashes.map((hash) => magnet(hash)).join('\n'))
    expect(submit().textContent).toBe('新增 25 個')
    await click(submit())
    await settle()
    expect(addCalls.sent.map((sent) => sent.magnets.length)).toEqual([20, 5])
    expect(addCalls.sent[0].magnets[0]).toBe(magnet(hashes[0]))
    expect(addCalls.sent[1].magnets[4]).toBe(magnet(hashes[24]))
    expect(toastCalls.action.mock.calls[0][0]).toBe('已新增 25 個種子')
  })

  it('the second request failing as a whole fails only its own entries', async () => {
    await start((sent, call) =>
      Promise.resolve(call === 1 ? failed('timeout') : allOk(sent)),
    )
    const hashes = Array.from({ length: 22 }, (_, i) => fakeHash(0x200 + i))
    await paste(hashes.map((hash) => magnet(hash)).join('\n'))
    await click(submit())
    await settle()
    expect(addCalls.sent).toHaveLength(2)
    expect(rows()).toHaveLength(2)
    expect(resultLine()).toBe('20 個加好了，2 個失敗')
    expect(reasons()).toEqual([
      'qBittorrent 沒有回應，請再試一次',
      'qBittorrent 沒有回應，請再試一次',
    ])
    expect(toastCalls.failure).not.toHaveBeenCalled()
  })
})

describe('C3 sending', () => {
  it('新增中…, 還在等 NAS 回應 after 10 s, and 取消, ✕ and Esc do nothing until it ends', async () => {
    const answer = deferred<unknown>()
    await start(() => answer.promise)
    await paste(magnet(NEW_A))
    vi.useFakeTimers()
    try {
      await act(async () => submit().click())
      expect(submit().textContent).toBe('新增中…')
      expect(submit().getAttribute('aria-disabled')).toBe('true')
      expect(submit().hasAttribute('data-sending')).toBe(true)
      const waiting = () =>
        screen().querySelector('[data-add-waiting]')?.textContent
      expect(waiting()).toBe('')
      await act(async () => vi.advanceTimersByTime(9_999))
      expect(waiting()).toBe('')
      await act(async () => vi.advanceTimersByTime(1))
      expect(waiting()).toBe(STILL_WAITING_TEXT)
      // A second press sends nothing more.
      await act(async () => submit().click())
      await act(async () => buttonNamed('取消').click())
      await act(async () => buttonNamed('關閉').click())
      await press('Escape', document.body)
      expect(addOpenStore.state.open).toBe(true)
      expect(screen()).not.toBeNull()
      expect(addCalls.sent).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
    await act(async () => answer.resolve(failed('qbit_unreachable')))
    await settle()
    expect(submit().textContent).toBe('新增 1 個')
    expect(screen().querySelector('[data-add-waiting]')?.textContent).toBe('')
    await click(buttonNamed('取消'))
    expect(addOpenStore.state.open).toBe(false)
  })

  it('打開 on an existing row does nothing while sending', async () => {
    const answer = deferred<unknown>()
    await start(() => answer.promise)
    await paste([magnet(NEW_A), magnet(fakeHash(1))].join('\n'))
    await click(submit())
    await click(buttonNamed(`打開 ${magnet(fakeHash(1))}`))
    expect(env.setHash).not.toHaveBeenCalled()
    expect(addOpenStore.state.open).toBe(true)
    await act(async () => answer.resolve(failed('qbit_unreachable')))
    await settle()
  })

  it('phone: the sheet ✕ does nothing while sending', async () => {
    const answer = deferred<unknown>()
    setDesktop(false)
    await start(() => answer.promise)
    await paste(magnet(NEW_A))
    await click(submit())
    const close = buttonNamed('關閉')
    expect(close.getAttribute('aria-disabled')).toBe('true')
    await click(close)
    expect(addOpenStore.state.open).toBe(true)
    await act(async () =>
      answer.resolve(allOk({ magnets: ['x'], files: [], category: 'X' })),
    )
    await settle()
    expect(addOpenStore.state.open).toBe(false)
  })
})

describe('C6 some rejected', () => {
  const partial: Answer = (sent) =>
    Promise.resolve({
      ok: true,
      data: {
        items: [
          ...sent.magnets.map((_, i) => ({ key: String(i), ok: true })),
          ...sent.files.map((_, i) => ({
            key: String(sent.magnets.length + i),
            ok: false,
            code: 'qbit_rejected',
            message: 'x',
          })),
        ],
      },
    })

  it('the added rows leave, the failed ones stay with reasons; the top line; pressing again sends only those', async () => {
    await start(partial)
    const one = torrentFile('Fake.Bad.One')
    const two = torrentFile('Fake.Bad.Two')
    await pick([one.file, two.file])
    await settleReads()
    await paste(
      [magnet(NEW_A, 'A'), magnet(NEW_B, 'B'), magnet(NEW_C, 'C')].join('\n'),
    )
    expect(submit().textContent).toBe('新增 5 個')
    await click(submit())
    await settle()
    expect(screen()).not.toBeNull()
    expect(rowNames()).toEqual(['Fake.Bad.One', 'Fake.Bad.Two'])
    expect(reasons()).toEqual([
      'qBittorrent 讀不了這個檔案',
      'qBittorrent 讀不了這個檔案',
    ])
    const line = screen().querySelector('[data-add-result]') as HTMLElement
    expect(line.textContent).toBe('3 個加好了，2 個失敗')
    expect(line.className).toContain('text-status-error')
    expect(line.className).toContain('border-b')
    expect(line.querySelector('svg')).not.toBeNull()
    expect(submit().textContent).toBe('新增 2 個')
    expect(toastCalls.action).not.toHaveBeenCalled()
    expect(toastCalls.failure).not.toHaveBeenCalled()

    addCalls.answer = null
    await click(submit())
    await settle()
    expect(addCalls.sent[1]).toEqual({
      magnets: [],
      files: ['Fake.Bad.One.torrent', 'Fake.Bad.Two.torrent'],
      category: 'X',
    })
    expect(addOpenStore.state.open).toBe(false)
    expect(toastCalls.action.mock.calls[0][0]).toBe('已新增 2 個種子')
  })

  it('a rejected magnet reads qBittorrent 拒絕這個連結; removing the failed rows drops the top line', async () => {
    await start((sent) =>
      Promise.resolve({
        ok: true,
        data: {
          items: sent.magnets.map((_, i) =>
            i === 1
              ? { key: '1', ok: false, code: 'qbit_rejected', message: 'x' }
              : { key: String(i), ok: true },
          ),
        },
      }),
    )
    await paste([magnet(NEW_A, 'A'), magnet(NEW_B, 'B')].join('\n'))
    await click(submit())
    await settle()
    expect(rowNames()).toEqual(['B'])
    expect(reasons()).toEqual(['qBittorrent 拒絕這個連結'])
    expect(resultLine()).toBe('1 個加好了，1 個失敗')
    await click(buttonNamed('拿掉 B'))
    expect(resultLine()).toBeNull()
  })
})

describe('C7 whole failure', () => {
  it.each([
    ['qbit_rejected', '新增失敗：qBittorrent 拒絕這個操作'],
    ['timeout', '新增失敗：qBittorrent 沒有回應，請再試一次'],
    ['invalid_input', '新增失敗：送出的資料格式不對'],
  ])(
    '%s: the failure toast with 重試, list and category stay; 重試 resends the same content',
    async (code, text) => {
      await start((_sent, call) =>
        Promise.resolve(call === 0 ? failed(code) : allOk(_sent)),
      )
      await paste([magnet(NEW_A), magnet(NEW_B)].join('\n'))
      await click(submit())
      await settle()
      expect(toastCalls.failure).toHaveBeenCalledOnce()
      const [shown, options] = toastCalls.failure.mock.calls[0]
      expect(shown).toBe(text)
      expect(options.keys).toEqual(['add-torrents'])
      expect(screen()).not.toBeNull()
      expect(rows()).toHaveLength(2)
      expect(select().value).toBe('X')
      expect(submit().textContent).toBe('新增 2 個')
      expect(reasons()).toEqual([])

      await act(async () => options.onRetry())
      await settle()
      expect(addCalls.sent[1]).toEqual(addCalls.sent[0])
      expect(addOpenStore.state.open).toBe(false)
      expect(toastCalls.action.mock.calls[0][0]).toBe('已新增 2 個種子')
    },
  )

  it('removing a row, changing the category or closing closes the failure toast', async () => {
    await start(() => Promise.resolve(failed('qbit_rejected')))
    await paste([magnet(NEW_A, 'A'), magnet(NEW_B, 'B')].join('\n'))
    await click(submit())
    await settle()
    toastCalls.dismissFor.mockClear()
    await click(buttonNamed('拿掉 A'))
    expect(toastCalls.dismissFor).toHaveBeenCalledWith('add-torrents')
    toastCalls.dismissFor.mockClear()
    await act(async () => {
      select().value = 'mteam-X'
      select().dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(toastCalls.dismissFor).toHaveBeenCalledWith('add-torrents')
    toastCalls.dismissFor.mockClear()
    await click(buttonNamed('取消'))
    expect(toastCalls.dismissFor).toHaveBeenCalledWith('add-torrents')
  })
})

describe('C8 connection codes', () => {
  it('only the global handler; the list stays and the button works again', async () => {
    await start(() => Promise.resolve(failed('qbit_unreachable')))
    await paste(magnet(NEW_A))
    // The refresh that follows may clear it again: watch every change.
    const marked: Array<ReadonlyArray<string>> = []
    const watch = connectionStore.subscribe(() =>
      marked.push(connectionStore.state.errors),
    )
    await click(submit())
    await settle()
    watch.unsubscribe()
    expect(toastCalls.failure).not.toHaveBeenCalled()
    expect(marked.some((errors) => errors.includes('qbit_unreachable'))).toBe(
      true,
    )
    expect(rows()).toHaveLength(1)
    expect(submit().hasAttribute('aria-disabled')).toBe(false)
    addCalls.answer = null
    await click(submit())
    await settle()
    expect(addCalls.sent).toHaveLength(2)
  })
})

describe('C9 logged out', () => {
  it('not_logged_in discards the list', async () => {
    await start(() => Promise.resolve(failed('not_logged_in')))
    await paste(magnet(NEW_A))
    await click(submit())
    await settle()
    expect(addOpenStore.state.open).toBe(false)
    expect(toastCalls.failure).not.toHaveBeenCalled()
  })
})

describe('C10 no categories', () => {
  it('says qBittorrent 還沒有分類 under the menu and keeps 新增 disabled', async () => {
    env.categories = {}
    await start()
    await paste(magnet(NEW_A))
    expect(pathLine()).toBe('qBittorrent 還沒有分類')
    expect(submit().getAttribute('aria-disabled')).toBe('true')
    await click(submit())
    expect(addCalls.sent).toEqual([])
  })

  it('with categories the line is not there', async () => {
    await start()
    expect(pathLine()).toBe('會存到 /data/media/X')
  })
})

describe('review fixes (spec 4.7)', () => {
  const rejectFiles: Answer = (sent) =>
    Promise.resolve({
      ok: true,
      data: {
        items: [
          ...sent.magnets.map((_, i) => ({ key: String(i), ok: true })),
          ...sent.files.map((_, i) => ({
            key: String(sent.magnets.length + i),
            ok: false,
            code: 'qbit_rejected',
            message: 'x',
          })),
        ],
      },
    })

  it('while sending, paste, 選檔案, 拿掉 and the category change nothing; a drop waits and joins after', async () => {
    const answer = deferred<unknown>()
    await start(() => answer.promise)
    await paste(magnet(NEW_A, 'A'))
    await click(submit())
    expect(select().disabled).toBe(true)
    await paste(magnet(NEW_B, 'B'))
    await pick([torrentFile('Fake.Late').file])
    await act(async () => openAdd([torrentFile('Fake.Dropped').file]))
    await settleReads()
    await click(buttonNamed('拿掉 A'))
    await act(async () => {
      select().value = 'mteam-X'
      select().dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(rowNames()).toEqual(['A'])
    expect(addOpenStore.state.queued).toHaveLength(1)
    await act(async () => answer.resolve(failed('qbit_unreachable')))
    await settle()
    await settleReads()
    expect(addOpenStore.state.queued).toEqual([])
    expect(rowNames()).toEqual(['A', 'Fake.Dropped'])
    expect(select().disabled).toBe(false)
    expect(select().value).toBe('X')
  })

  it('新增 stays disabled while picked files are still being read', async () => {
    await start()
    await paste(magnet(NEW_A))
    await pick([torrentFile('Fake.Reading').file])
    expect(submit().getAttribute('aria-disabled')).toBe('true')
    await click(submit())
    expect(addCalls.sent).toEqual([])
    await settleReads()
    expect(submit().textContent).toBe('新增 2 個')
    expect(submit().hasAttribute('aria-disabled')).toBe(false)
  })

  it('重試 judges the rows again: one that reached maindata meanwhile is not sent', async () => {
    await start((sent, call) =>
      Promise.resolve(call === 0 ? failed('timeout') : allOk(sent)),
    )
    await paste([magnet(NEW_A, 'A'), magnet(NEW_B, 'B')].join('\n'))
    await click(submit())
    await settle()
    const [, options] = toastCalls.failure.mock.calls[0]
    env.torrents = [...baseTorrents(), t({ hash: NEW_A, name: 'A' })]
    await act(async () => {
      await env.client.refetchQueries({ queryKey: MAINDATA_KEY })
    })
    await act(async () => options.onRetry())
    await settle()
    expect(addCalls.sent[1].magnets).toEqual([magnet(NEW_B, 'B')])
    expect(toastCalls.action.mock.calls[0][0]).toBe('已新增 1 個種子')
  })

  it('a paste or a pick after a whole failure closes its toast', async () => {
    await start(() => Promise.resolve(failed('qbit_rejected')))
    await paste(magnet(NEW_A))
    await click(submit())
    await settle()
    toastCalls.dismissFor.mockClear()
    await paste(magnet(NEW_B))
    expect(toastCalls.dismissFor).toHaveBeenCalledWith('add-torrents')
    toastCalls.dismissFor.mockClear()
    await pick([torrentFile('Fake.More').file])
    expect(toastCalls.dismissFor).toHaveBeenCalledWith('add-torrents')
    await settleReads()
  })

  it('each request gets its own timeout from its bytes', async () => {
    await start()
    const { file, bytes } = torrentFile('Fake.Timed')
    await pick([file])
    await settleReads()
    await click(submit())
    await settle()
    expect(vi.mocked(callFn)).toHaveBeenCalledOnce()
    const options = vi.mocked(callFn).mock.calls[0][2]
    // The allowance for one entry plus the file itself.
    expect(options?.timeoutMs).toBe(
      addCallTimeoutMs(64 * 1024 + 64 * 1024 + bytes.length),
    )
  })

  it('batch 2 not_logged_in after batch 1 went: the added rows leave, the toast says so, the list goes', async () => {
    await start((sent, call) =>
      Promise.resolve(call === 1 ? failed('not_logged_in') : allOk(sent)),
    )
    const hashes = Array.from({ length: 22 }, (_, i) => fakeHash(0x300 + i))
    await paste(hashes.map((hash) => magnet(hash)).join('\n'))
    await click(submit())
    await settle()
    expect(addCalls.sent).toHaveLength(2)
    expect(toastCalls.plain).toHaveBeenCalledExactlyOnceWith('已新增 20 個種子')
    expect(addOpenStore.state.open).toBe(false)
  })

  it('batch 2 failing in the browser before any answer: its rows say 沒有送出, not a refusal', async () => {
    await start()
    const real = vi.mocked(callFn).getMockImplementation()
    if (!real) throw new Error('callFn is not wrapped')
    vi.mocked(callFn)
      .mockImplementationOnce(real)
      .mockImplementationOnce(() => Promise.reject(new Error('boom')))
    const hashes = Array.from({ length: 22 }, (_, i) => fakeHash(0x400 + i))
    await paste(hashes.map((hash) => magnet(hash)).join('\n'))
    await click(submit())
    await settle()
    expect(rows()).toHaveLength(2)
    expect(resultLine()).toBe('20 個加好了，2 個失敗')
    expect(reasons()).toEqual(['沒有送出，請再試一次', '沒有送出，請再試一次'])
  })

  it('3 batches, batch 2 unreachable: batch 3 is not sent, its rows fail with that code', async () => {
    await start((sent, call) =>
      Promise.resolve(call === 1 ? failed('qbit_unreachable') : allOk(sent)),
    )
    const hashes = Array.from({ length: 45 }, (_, i) => fakeHash(0x500 + i))
    await paste(hashes.map((hash) => magnet(hash)).join('\n'))
    await click(submit())
    await settle()
    expect(addCalls.sent).toHaveLength(2)
    expect(rows()).toHaveLength(25)
    expect(resultLine()).toBe('20 個加好了，25 個失敗')
    expect(new Set(reasons())).toEqual(new Set(['家裡的 qBittorrent 沒有回應']))
  })

  it('3 batches, batch 2 unreachable: the connection error is marked, like a first-batch failure', async () => {
    await start((sent, call) =>
      Promise.resolve(call === 1 ? failed('qbit_unreachable') : allOk(sent)),
    )
    const hashes = Array.from({ length: 45 }, (_, i) => fakeHash(0x580 + i))
    await paste(hashes.map((hash) => magnet(hash)).join('\n'))
    // The refresh that follows may clear it again: watch every change.
    const marked: Array<ReadonlyArray<string>> = []
    const watch = connectionStore.subscribe(() =>
      marked.push(connectionStore.state.errors),
    )
    await click(submit())
    await settle()
    watch.unsubscribe()
    expect(addCalls.sent).toHaveLength(2)
    expect(marked.some((errors) => errors.includes('qbit_unreachable'))).toBe(
      true,
    )
    expect(toastCalls.failure).not.toHaveBeenCalled()
  })

  it('3 batches, batch 2 qbit_auth_failed: batch 3 is not sent, the added rows leave, login is required', async () => {
    await start((sent, call) =>
      Promise.resolve(call === 1 ? failed('qbit_auth_failed') : allOk(sent)),
    )
    const hashes = Array.from({ length: 45 }, (_, i) => fakeHash(0x600 + i))
    await paste(hashes.map((hash) => magnet(hash)).join('\n'))
    await click(submit())
    await settle()
    expect(addCalls.sent).toHaveLength(2)
    expect(loginStore.state.loginRequired?.reason).toBe('qbit_auth_failed')
    expect(rows()).toHaveLength(25)
    expect(resultLine()).toBe('20 個加好了，25 個失敗')
    expect(toastCalls.failure).not.toHaveBeenCalled()
  })

  it("the add's own browser timeout is the add failure toast, not a lost connection", async () => {
    await start(() => new Promise<unknown>(() => {}))
    const real = vi.mocked(callFn).getMockImplementation()
    if (!real) throw new Error('callFn is not wrapped')
    // The real callFn with the options the add passes, on a short clock.
    vi.mocked(callFn).mockImplementationOnce((fn, input, options) =>
      real(fn, input, { ...options, timeoutMs: 1 }),
    )
    await paste(magnet(NEW_A))
    const marked: Array<ReadonlyArray<string>> = []
    const watch = connectionStore.subscribe(() =>
      marked.push(connectionStore.state.errors),
    )
    await click(submit())
    await settle()
    watch.unsubscribe()
    expect(marked.flat()).toEqual([])
    expect(toastCalls.failure).toHaveBeenCalledOnce()
    expect(toastCalls.failure.mock.calls[0][0]).toBe(
      '新增失敗：qBittorrent 沒有回應，請再試一次',
    )
    expect(rows()).toHaveLength(1)
  })

  it.each(['home_unreachable', 'timeout'])(
    'a whole %s refreshes maindata by itself',
    async (code) => {
      await start(() => Promise.resolve(failed(code)))
      await paste(magnet(NEW_A))
      const before = env.maindataFetches
      await click(submit())
      await settle()
      expect(env.maindataFetches).toBeGreaterThan(before)
    },
  )

  it('重試 after a deleted category: the refresh empties the menu, 重試 sends nothing and closes the toast', async () => {
    await start(() => Promise.resolve(failed('invalid_input')))
    await paste(magnet(NEW_A))
    env.categories = { 'mteam-X': { name: 'mteam-X', savePath: '/data/x' } }
    await click(submit())
    await settle()
    expect(select().value).toBe('')
    const [, options] = toastCalls.failure.mock.calls[0]
    toastCalls.dismissFor.mockClear()
    await act(async () => options.onRetry())
    await settle()
    expect(addCalls.sent).toHaveLength(1)
    expect(toastCalls.dismissFor).toHaveBeenCalledWith('add-torrents')
  })

  it('an answer that arrives after the screen closed and opened again is dropped', async () => {
    const answer = deferred<unknown>()
    await start(() => answer.promise)
    await paste(magnet(NEW_A))
    await click(submit())
    await act(async () => closeAdd())
    await open()
    await act(async () =>
      answer.resolve(allOk({ magnets: ['x'], files: [], category: 'X' })),
    )
    await settle()
    expect(toastCalls.action).not.toHaveBeenCalled()
    expect(addOpenStore.state.open).toBe(true)
    expect(rows()).toHaveLength(0)
  })

  it('a whole invalid_input refreshes maindata (a deleted category leaves the menu)', async () => {
    await start(() => Promise.resolve(failed('invalid_input')))
    await paste(magnet(NEW_A))
    const before = env.maindataFetches
    env.categories = { 'mteam-X': { name: 'mteam-X', savePath: '/data/x' } }
    await click(submit())
    await settle()
    expect(env.maindataFetches).toBeGreaterThan(before)
    expect(select().value).toBe('')
    expect(submit().getAttribute('aria-disabled')).toBe('true')
  })

  it('removing one of two failed rows counts only the one left', async () => {
    await start(rejectFiles)
    await pick([
      torrentFile('Fake.Bad.One').file,
      torrentFile('Fake.Bad.Two').file,
    ])
    await settleReads()
    await paste(
      [magnet(NEW_A, 'A'), magnet(NEW_B, 'B'), magnet(NEW_C, 'C')].join('\n'),
    )
    await click(submit())
    await settle()
    expect(resultLine()).toBe('3 個加好了，2 個失敗')
    await click(buttonNamed('拿掉 Fake.Bad.One'))
    expect(resultLine()).toBe('3 個加好了，1 個失敗')
    const region = screen().querySelector('[data-add-result]')?.parentElement
    expect(region?.getAttribute('role')).toBe('status')
  })

  it('(a) a failed entry that reaches maindata shows 以前下載過, no reason, and the top line goes', async () => {
    await start(rejectFiles)
    const bad = torrentFile('Fake.Bad.Late')
    await pick([bad.file])
    await settleReads()
    await paste(magnet(NEW_A, 'A'))
    await click(submit())
    await settle()
    expect(resultLine()).toBe('1 個加好了，1 個失敗')
    env.torrents = [
      ...baseTorrents(),
      t({ hash: infoHashOf('Fake.Bad.Late'), name: 'Fake.Bad.Late' }),
    ]
    await act(async () => {
      await env.client.refetchQueries({ queryKey: MAINDATA_KEY })
    })
    expect(rowStatuses()).toEqual(['existing'])
    expect(reasons()).toEqual([])
    expect(resultLine()).toBeNull()
    // The status region stays mounted for the next result.
    expect(
      screen().querySelector('[data-add-frame] [role="status"]'),
    ).not.toBeNull()
  })

  it('(b) a new press ends a pending 去看 wish', async () => {
    await start()
    await act(async () => openWhenAdded(NEW_C, 'X'))
    await paste(magnet(NEW_A))
    await click(submit())
    expect(openWhenAddedStore.state).toBeNull()
  })

  it('(c) a magnet as hex and base32 (one row) next to a rejected file: only the file row is left', async () => {
    await start(rejectFiles)
    await pick([torrentFile('Fake.Bad.C').file])
    await settleReads()
    await paste([magnet(NEW_A, 'A'), magnet(base32(NEW_A))].join('\n'))
    expect(rows()).toHaveLength(2)
    await click(submit())
    await settle()
    expect(addCalls.sent[0].magnets).toEqual([magnet(NEW_A, 'A')])
    expect(rowNames()).toEqual(['Fake.Bad.C'])
  })
})
