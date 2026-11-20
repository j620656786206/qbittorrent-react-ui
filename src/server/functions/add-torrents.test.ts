import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { testSession } from '#/server/auth/testing'
import { resetEnvCache } from '#/server/env'
import { ADD_DEADLINE_MS } from '#/server/functions/_add-entries'
import { addTorrents } from '#/server/functions/add-torrents'
import { GUARDED, formInput } from '#/server/functions/_define'
import type { Guarded } from '#/server/functions/_define'
import { UPLOAD_BODY_LIMIT } from '#/server/gate/body-limit'
import { stubTestEnv } from '#/server/gate/testing'
import { resetQbitClientForTests } from '#/server/qbit'
import {
  captureStdout,
  fakeQbit,
  fetchFailed,
  jsonResponse,
} from '#/server/qbit/testing'
import type { FakeCall } from '#/server/qbit/testing'
import { resetSyncerForTests } from '#/server/sync'
import { ERROR_MESSAGES } from '#/shared/errors'
import type { Result } from '#/shared/errors'
import {
  ADD_FORM_ENTRY_ALLOWANCE,
  MAX_ADD_ENTRIES,
  MAX_TORRENT_FILE_BYTES,
  addTorrentsFormSchema,
} from '#/shared/torrent-add'
import type { BatchResult } from '#/shared/torrent-ops'

// Spec 4.7 rows S1 to S7, S9 and S10 through the real factory, with a fake
// qBittorrent behind the global fetch (AD-15). S8 and S11 (the request
// size before the body is read) are the gate's: body-limit.test.ts.
// The fake maindata has the categories `movies` and `tv`.

const guarded = (addTorrents as unknown as Record<symbol, Guarded>)[GUARDED]
const MAGNET_A = `magnet:?xt=urn:btih:${'a'.repeat(40)}&dn=Fake.A`
const MAGNET_B = `magnet:?xt=urn:btih:${'b'.repeat(40)}`

function run(
  value: unknown,
  {
    session = testSession(),
    bodyBytes = 0,
  }: {
    session?: ReturnType<typeof testSession> | null
    bodyBytes?: number
  } = {},
) {
  return guarded.run({
    data: formInput(addTorrentsFormSchema)(value as FormData),
    context: { session, bodyBytes },
  }) as Promise<Result<BatchResult>>
}

/** A small .torrent-shaped file: a bencode dictionary (enough for the server). */
function torrentFile(name: string): File {
  const text = `d4:infod6:lengthi1e4:name${name.length}:${name}ee`
  return new File([new TextEncoder().encode(text)], `${name}.torrent`)
}

/** A magnet of exactly `bytes` UTF-8 bytes: 中 is 3 bytes, the rest ASCII. */
function cjkMagnet(bytes: number): string {
  const head = `magnet:?xt=urn:btih:${'c'.repeat(40)}&dn=`
  const left = bytes - head.length
  return head + '中'.repeat(Math.floor(left / 3)) + 'x'.repeat(left % 3)
}

function form(
  {
    magnets = [],
    files = [],
    category = 'movies',
  }: { magnets?: Array<string>; files?: Array<Blob>; category?: string } = {},
  extra: Array<[string, string]> = [],
): FormData {
  const data = new FormData()
  for (const magnet of magnets) data.append('magnet', magnet)
  for (const file of files) data.append('torrent', file)
  data.append('category', category)
  for (const [name, value] of extra) data.append(name, value)
  return data
}

let qbit: ReturnType<typeof fakeQbit>
let addAnswer: (call: FakeCall) => Response | Promise<Response>

const addCalls = () =>
  qbit.calls.filter((call) => call.path === '/api/v2/torrents/add')

beforeEach(() => {
  stubTestEnv()
  resetEnvCache()
  captureStdout()
  addAnswer = () => new Response('Ok.')
  qbit = fakeQbit({ add: (call) => addAnswer(call) })
  vi.stubGlobal('fetch', qbit.fetch)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  resetEnvCache()
  resetQbitClientForTests()
  resetSyncerForTests()
})

const invalid = {
  ok: false,
  error: { code: 'invalid_input', message: ERROR_MESSAGES.invalid_input },
}

describe('addTorrents server function (spec 4.7)', () => {
  it('is a gated POST function with the upload body limit', () => {
    expect(guarded.spec.auth).toBeUndefined()
    expect(guarded.spec.name).toBe('addTorrents')
    expect(guarded.spec.bodyLimit).toBe(UPLOAD_BODY_LIMIT)
    expect((addTorrents as unknown as { method: string }).method).toBe('POST')
  })

  it('S1 sends 2 magnets then 1 file, one call each, category and autoTMM; keys 0..2 ok', async () => {
    const file = torrentFile('Fake.File')
    const result = await run(
      form({ magnets: [MAGNET_A, MAGNET_B], files: [file] }),
    )
    expect(result).toEqual({
      ok: true,
      data: {
        items: [
          { key: '0', ok: true },
          { key: '1', ok: true },
          { key: '2', ok: true },
        ],
      },
    })
    const calls = addCalls()
    expect(calls).toHaveLength(3)
    const fields = (call: FakeCall) => [...(call.form?.keys() ?? [])].sort()
    expect(calls.map((call) => call.method)).toEqual(['POST', 'POST', 'POST'])
    expect(fields(calls[0])).toEqual(['autoTMM', 'category', 'urls'])
    expect(calls[0].form?.get('urls')).toBe(MAGNET_A)
    expect(calls[1].form?.get('urls')).toBe(MAGNET_B)
    expect(fields(calls[2])).toEqual(['autoTMM', 'category', 'torrents'])
    const sent = calls[2].form?.get('torrents') as File
    expect(sent.name).toBe('Fake.File.torrent')
    expect(new Uint8Array(await sent.arrayBuffer())).toEqual(
      new Uint8Array(await file.arrayBuffer()),
    )
    for (const call of calls) {
      expect(call.form?.get('category')).toBe('movies')
      expect(call.form?.get('autoTMM')).toBe('true')
      expect(call.form?.has('savepath')).toBe(false)
      expect(call.form?.has('cookie')).toBe(false)
    }
  })

  it.each([
    [
      'S2 an https link',
      form({ magnets: ['https://example.invalid/a.torrent'] }),
    ],
    [
      'S2 a magnet with a second line',
      form({ magnets: [`${MAGNET_A}\nhttps://example.invalid/x`] }),
    ],
    [
      'S2 a magnet with a carriage return',
      form({ magnets: [`${MAGNET_A}\rx`] }),
    ],
    ['a magnet with \\x01', form({ magnets: [`${MAGNET_A}\x01b`] })],
    [
      'magnet: without ?',
      form({ magnets: [`magnet:xt=urn:btih:${'a'.repeat(40)}`] }),
    ],
    [
      'a CJK magnet one UTF-8 byte over the allowance',
      form({ magnets: [cjkMagnet(ADD_FORM_ENTRY_ALLOWANCE + 1)] }),
    ],
    [
      'S2 a file sent as a magnet',
      form({ magnets: [] }, [['magnet', 'notmagnet']]),
    ],
    [
      'S3 a savepath field',
      form({ magnets: [MAGNET_A] }, [['savepath', '/data']]),
    ],
    ['S3 a cookie field', form({ magnets: [MAGNET_A] }, [['cookie', 'a=b']])],
    ['S3 a urls field', form({ magnets: [MAGNET_A] }, [['urls', MAGNET_B]])],
    ['two categories', form({ magnets: [MAGNET_A] }, [['category', 'tv']])],
    ['no entry', form()],
    ['an empty category', form({ magnets: [MAGNET_A], category: '' })],
    ['a text torrent field', form({ magnets: [] }, [['torrent', 'd4:infoe']])],
    [
      'S7 21 entries',
      form({ magnets: Array.from({ length: 21 }, () => MAGNET_A) }),
    ],
    [
      'S7 11 magnets and 10 files',
      form({
        magnets: Array.from({ length: 11 }, () => MAGNET_A),
        files: Array.from({ length: 10 }, (_, i) => torrentFile(`F${i}`)),
      }),
    ],
    [
      'S6 a 10,485,761-byte file',
      form({
        files: [
          new File(
            [new Uint8Array(MAX_TORRENT_FILE_BYTES + 1).fill(0x64)],
            'big.torrent',
          ),
        ],
      }),
    ],
    ['not a form', { magnet: [MAGNET_A], category: ['movies'] }],
    ['nothing', undefined],
  ])('%s: invalid_input with no qBittorrent call', async (_name, value) => {
    expect(await run(value)).toEqual(invalid)
    expect(addCalls()).toHaveLength(0)
  })

  it('a CJK magnet of exactly the allowance in UTF-8 bytes is accepted', async () => {
    const link = cjkMagnet(ADD_FORM_ENTRY_ALLOWANCE)
    // Far fewer UTF-16 units than bytes: the byte count is what is checked.
    expect(link.length).toBeLessThan(ADD_FORM_ENTRY_ALLOWANCE / 2)
    expect((await run(form({ magnets: [link] }))).ok).toBe(true)
    expect(addCalls()).toHaveLength(1)
  })

  it('a refusing qBittorrent login: the whole request is qbit_auth_failed, no add call', async () => {
    qbit = fakeQbit({ login: () => new Response('Fails.') })
    vi.stubGlobal('fetch', qbit.fetch)
    expect(await run(form({ magnets: [MAGNET_A, MAGNET_B] }))).toMatchObject({
      ok: false,
      error: { code: 'qbit_auth_failed' },
    })
    expect(addCalls()).toHaveLength(0)
  })

  it('S7 accepts exactly 20 entries', async () => {
    const result = await run(
      form({
        magnets: Array.from({ length: 10 }, () => MAGNET_A),
        files: Array.from({ length: 10 }, (_, i) => torrentFile(`F${i}`)),
      }),
    )
    expect(result.ok && result.data.items).toHaveLength(MAX_ADD_ENTRIES)
    expect(addCalls()).toHaveLength(MAX_ADD_ENTRIES)
  })

  it('S6 accepts a file of exactly 10 MB that starts as a dictionary', async () => {
    const bytes = new Uint8Array(MAX_TORRENT_FILE_BYTES).fill(0x30)
    bytes[0] = 0x64
    const result = await run(
      form({ files: [new File([bytes], 'big.torrent')] }),
    )
    expect(result.ok).toBe(true)
    expect(addCalls()).toHaveLength(1)
  })

  it('S4 a category qBittorrent does not have: invalid_input, no add call', async () => {
    expect(await run(form({ magnets: [MAGNET_A], category: 'X' }))).toEqual(
      invalid,
    )
    expect(addCalls()).toHaveLength(0)
  })

  it('S5 a file not starting with d: invalid_input, no add call (even for the magnets before it)', async () => {
    const result = await run(
      form({
        magnets: [MAGNET_A],
        files: [torrentFile('Good'), new File(['l4:spame'], 'list.torrent')],
      }),
    )
    expect(result).toEqual(invalid)
    expect(addCalls()).toHaveLength(0)
  })

  it('S9 qBittorrent rejects entry 1 of 3: that item fails, the others are ok', async () => {
    let n = 0
    addAnswer = () => {
      n += 1
      return n === 2
        ? new Response('Torrent file is not valid', { status: 415 })
        : new Response('Ok.')
    }
    const result = await run(
      form({
        magnets: [MAGNET_A],
        files: [torrentFile('Bad'), torrentFile('C')],
      }),
    )
    expect(result).toEqual({
      ok: true,
      data: {
        items: [
          { key: '0', ok: true },
          {
            key: '1',
            ok: false,
            code: 'qbit_rejected',
            message: ERROR_MESSAGES.qbit_rejected,
          },
          { key: '2', ok: true },
        ],
      },
    })
    expect(addCalls()).toHaveLength(3)
  })

  it.each([
    ['Fails.', () => new Response('Fails.')],
    [
      'a JSON answer with nothing added',
      () =>
        jsonResponse({ success_count: 0, failure_count: 1, pending_count: 0 }),
    ],
    ['a 415', () => new Response('Torrent file is not valid', { status: 415 })],
  ])('an answer of %s is a rejected item', async (_name, answer) => {
    addAnswer = answer
    const result = await run(form({ magnets: [MAGNET_A] }))
    expect(result).toEqual({
      ok: true,
      data: {
        items: [
          {
            key: '0',
            ok: false,
            code: 'qbit_rejected',
            message: ERROR_MESSAGES.qbit_rejected,
          },
        ],
      },
    })
  })

  it('Fails. on entry 1 of 3: only entry 1 fails and entry 2 is still sent', async () => {
    let n = 0
    addAnswer = () => {
      n += 1
      return new Response(n === 2 ? 'Fails.' : 'Ok.')
    }
    const result = await run(form({ magnets: [MAGNET_A, MAGNET_B, MAGNET_A] }))
    expect(result.ok && result.data.items).toEqual([
      { key: '0', ok: true },
      {
        key: '1',
        ok: false,
        code: 'qbit_rejected',
        message: ERROR_MESSAGES.qbit_rejected,
      },
      { key: '2', ok: true },
    ])
    expect(addCalls()).toHaveLength(3)
  })

  it.each([
    ['a 502', () => new Response('Bad Gateway', { status: 502 })],
    ['a 409', () => new Response('Conflict', { status: 409 })],
    ['a redirect', () => new Response(null, { status: 302 })],
    ['an HTML page', () => new Response('<html>proxy</html>')],
  ])(
    '%s on entry 0: the whole request is qbit_rejected, nothing more is sent',
    async (_name, answer) => {
      addAnswer = answer
      expect(
        await run(form({ magnets: [MAGNET_A, MAGNET_B, MAGNET_A] })),
      ).toMatchObject({ ok: false, error: { code: 'qbit_rejected' } })
      expect(addCalls()).toHaveLength(1)
    },
  )

  it('a 502 after one was added: entry 0 ok, it and the rest failed, nothing more is sent', async () => {
    let n = 0
    addAnswer = () => {
      n += 1
      return n === 1
        ? new Response('Ok.')
        : new Response('Bad Gateway', { status: 502 })
    }
    const result = await run(form({ magnets: [MAGNET_A, MAGNET_B, MAGNET_A] }))
    const rejected = {
      ok: false,
      code: 'qbit_rejected',
      message: ERROR_MESSAGES.qbit_rejected,
    }
    expect(result.ok && result.data.items).toEqual([
      { key: '0', ok: true },
      { key: '1', ...rejected },
      { key: '2', ...rejected },
    ])
    expect(addCalls()).toHaveLength(2)
  })

  it('a 403 after a fresh login on entry 0 (the cooldown starts): the whole request is qbit_rejected, nothing more is sent', async () => {
    // Entry 0: a 403, a fresh login, the one resend, a 403 again: that
    // starts the cooldown, in which every later entry would be refused
    // without a call.
    addAnswer = () => new Response('Forbidden', { status: 403 })
    expect(
      await run(form({ magnets: [MAGNET_A, MAGNET_B, MAGNET_A] })),
    ).toMatchObject({ ok: false, error: { code: 'qbit_rejected' } })
    expect(addCalls().map((call) => call.form?.get('urls'))).toEqual([
      MAGNET_A,
      MAGNET_A,
    ])
  })

  it('S10 no session: not_logged_in, no qBittorrent call at all', async () => {
    expect(
      await run(form({ magnets: [MAGNET_A] }), { session: null }),
    ).toMatchObject({ ok: false, error: { code: 'not_logged_in' } })
    expect(qbit.spy).not.toHaveBeenCalled()
  })

  it('a body over the upload limit: invalid_input, no qBittorrent call', async () => {
    expect(
      await run(form({ magnets: [MAGNET_A] }), {
        bodyBytes: UPLOAD_BODY_LIMIT + 1,
      }),
    ).toEqual(invalid)
    expect(qbit.spy).not.toHaveBeenCalled()
  })

  it('qBittorrent unreachable at the first entry: the whole request fails with qbit_unreachable', async () => {
    addAnswer = () => {
      throw fetchFailed('ECONNREFUSED')
    }
    expect(await run(form({ magnets: [MAGNET_A, MAGNET_B] }))).toMatchObject({
      ok: false,
      error: { code: 'qbit_unreachable' },
    })
    expect(addCalls()).toHaveLength(1)
  })

  it('unreachable after one was added: it and the rest are failed items, nothing more is sent', async () => {
    let n = 0
    addAnswer = () => {
      n += 1
      if (n === 2) throw fetchFailed('ECONNREFUSED')
      return new Response('Ok.')
    }
    const result = await run(form({ magnets: [MAGNET_A, MAGNET_B, MAGNET_A] }))
    expect(result.ok && result.data.items).toEqual([
      { key: '0', ok: true },
      {
        key: '1',
        ok: false,
        code: 'qbit_unreachable',
        message: ERROR_MESSAGES.qbit_unreachable,
      },
      {
        key: '2',
        ok: false,
        code: 'qbit_unreachable',
        message: ERROR_MESSAGES.qbit_unreachable,
      },
    ])
    expect(addCalls()).toHaveLength(2)
  })

  it('an entry still waiting at the deadline and the ones after it are timeout items', async () => {
    vi.useFakeTimers()
    let n = 0
    addAnswer = () => {
      n += 1
      // The second add never answers within the deadline.
      if (n === 2) return new Promise<Response>(() => {})
      return new Response('Ok.')
    }
    const pending = run(form({ magnets: [MAGNET_A, MAGNET_B, MAGNET_A] }))
    await vi.advanceTimersByTimeAsync(ADD_DEADLINE_MS + 10)
    const result = await pending
    const timeout = {
      ok: false,
      code: 'timeout',
      message: ERROR_MESSAGES.timeout,
    }
    expect(result.ok && result.data.items).toEqual([
      { key: '0', ok: true },
      { key: '1', ...timeout },
      { key: '2', ...timeout },
    ])
    expect(addCalls()).toHaveLength(2)
  })

  it('the category read failing is a whole-request error with no add call', async () => {
    qbit = fakeQbit({
      maindata: () => new Response('Bad Gateway', { status: 502 }),
    })
    vi.stubGlobal('fetch', qbit.fetch)
    expect(await run(form({ magnets: [MAGNET_A] }))).toMatchObject({
      ok: false,
      error: { code: 'qbit_rejected' },
    })
    expect(addCalls()).toHaveLength(0)
  })
})

describe('formInput()', () => {
  it("turns a form into each name's values in order and parses it", async () => {
    const data = form({ magnets: [MAGNET_B, MAGNET_A], category: 'tv' })
    const handle = formInput(addTorrentsFormSchema)(data)
    const result = await guarded.run({
      data: handle,
      context: { session: testSession() },
    })
    expect(result.ok).toBe(true)
    expect(addCalls().map((call) => call.form?.get('urls'))).toEqual([
      MAGNET_B,
      MAGNET_A,
    ])
  })
})
