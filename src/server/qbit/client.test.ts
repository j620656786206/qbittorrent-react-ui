import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetEnvCache } from '#/server/env'
import { BadMaindata } from '#/server/qbit/bad-maindata'
import { AddRefused, QBIT_PATHS, createQbitClient } from '#/server/qbit/client'
import {
  FAKE_PASSWORD,
  FAKE_QBIT_ORIGIN,
  FAKE_USERNAME,
  HASH_A,
  HASH_B,
  LEAK_MARKERS,
  SORT_KEY_ONLY_MARKERS,
  captureStdout,
  fakeQbit,
  fullMaindata,
  jsonResponse,
  rawFile,
} from '#/server/qbit/testing'
import type { FakeCall, FakeQbitRoutes } from '#/server/qbit/testing'

// Spec 1.5 rows Q10 and Q11: the named-method client.

const MAINDATA = '/api/v2/sync/maindata'
const FILES = '/api/v2/torrents/files'
const FILE_PRIO = '/api/v2/torrents/filePrio'
const LOG_MAIN = '/api/v2/log/main'

function setup(routes: FakeQbitRoutes = {}) {
  const qbit = fakeQbit(routes)
  const client = createQbitClient({
    baseUrl: FAKE_QBIT_ORIGIN,
    username: FAKE_USERNAME,
    password: FAKE_PASSWORD,
    fetch: qbit.fetch,
  })
  return { ...qbit, client }
}

const failure = (code: string) =>
  expect.objectContaining({ name: 'ServerFailure', code })

let out: ReturnType<typeof captureStdout>

beforeEach(() => {
  vi.stubEnv('QBIT_URL', FAKE_QBIT_ORIGIN)
  resetEnvCache()
  out = captureStdout()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  resetEnvCache()
})

describe('qBittorrent client', () => {
  it('syncMaindata sends exactly rid and returns the stripped answer', async () => {
    const upper = HASH_A.toUpperCase()
    const { client, calls } = setup({
      maindata: () =>
        jsonResponse(
          fullMaindata({
            torrents: {
              [upper]: { name: 'A', ...LEAK_MARKERS, private: true },
            },
          }),
        ),
    })
    const raw = await client.syncMaindata(7)
    const call = calls.find((c) => c.path === MAINDATA)
    expect(call?.method).toBe('GET')
    expect([...(call?.query.entries() ?? [])]).toEqual([['rid', '7']])
    expect(Object.keys(raw.torrents ?? {})).toEqual([HASH_A])
    // The sort extras stay (story 2.1); the tracker only as its hostname,
    // renamed tracker_domain; the magnet, download path and external
    // addresses not at all.
    expect(raw.torrents?.[HASH_A]).toEqual({
      name: 'A',
      private: true,
      comment: LEAK_MARKERS.comment,
      content_path: LEAK_MARKERS.content_path,
      root_path: LEAK_MARKERS.root_path,
      infohash_v1: LEAK_MARKERS.infohash_v1,
      infohash_v2: LEAK_MARKERS.infohash_v2,
      tracker_domain: 'fake-tracker-marker.invalid',
    })
    expect(Object.keys(raw.server_state ?? {}).sort()).toEqual(
      [
        'connection_status',
        'dl_info_speed',
        'dl_rate_limit',
        'up_info_speed',
        'up_rate_limit',
        'use_alt_speed_limits',
      ].sort(),
    )
    const text = JSON.stringify(raw)
    const extras: ReadonlySet<string> = new Set(
      Object.values(SORT_KEY_ONLY_MARKERS),
    )
    for (const marker of Object.values(LEAK_MARKERS)) {
      if (!extras.has(marker)) expect(text).not.toContain(marker)
    }
  })

  it('Q10 HTTP 500: qbit_rejected, logged with path and status only', async () => {
    const { client } = setup({
      maindata: () => new Response('boom', { status: 500 }),
    })
    await expect(client.syncMaindata(0)).rejects.toEqual(
      failure('qbit_rejected'),
    )
    const lines = out.events('qbit_bad_response')
    expect(lines).toHaveLength(1)
    expect(Object.keys(lines[0]).sort()).toEqual(
      ['event', 'level', 'path', 'status', 'time'].sort(),
    )
    expect(lines[0]).toMatchObject({ path: MAINDATA, status: 500 })
    for (const line of out.lines) expect(line).not.toContain('boom')
  })

  it.each([
    [
      'a non-JSON body',
      () => new Response('<html>nope</html>'),
      'not_json',
      [],
    ],
    [
      'JSON failing the schema',
      () => jsonResponse({ rid: 'one' }),
      'schema',
      ['rid'],
    ],
    [
      'a key that is not a torrent hash',
      () => jsonResponse({ rid: 2, torrents: { 'not-a-hash': {} } }),
      'schema',
      ['torrents.*'],
    ],
    [
      'a removed key that is not a torrent hash',
      () => jsonResponse({ rid: 2, torrents_removed: ['all'] }),
      'schema',
      ['torrents_removed.0'],
    ],
    [
      'a category with a wrong type',
      () => jsonResponse({ rid: 2, categories: { X: { savePath: 5 } } }),
      'schema',
      ['categories.*.savePath'],
    ],
  ])(
    'Q10 %s: qbit_rejected as BadMaindata with field paths, no values',
    async (_name, answer, reason, issues) => {
      const { client } = setup({ maindata: answer })
      const error: unknown = await client.syncMaindata(0).catch((e) => e)
      expect(error).toBeInstanceOf(BadMaindata)
      expect(error).toMatchObject({ code: 'qbit_rejected', reason, issues })
      // The syncer logs it (it also resets rid); the client logs nothing.
      expect(out.parsed().map((line) => line.event)).toEqual(['qbit_login'])
    },
  )

  it('an unknown connection_status reads as disconnected, logged once without the value', async () => {
    const { client } = setup({
      maindata: () =>
        jsonResponse(
          fullMaindata({
            server_state: { connection_status: 'fake-new-status' },
          }),
        ),
    })
    const first = await client.syncMaindata(0)
    expect(first.server_state?.connection_status).toBe('disconnected')
    await client.syncMaindata(1)
    expect(out.events('qbit_unknown_connection_status')).toEqual([
      expect.objectContaining({ level: 'warn' }),
    ])
    for (const line of out.lines) expect(line).not.toContain('fake-new-status')
  })

  it.each(['connected', 'firewalled', 'disconnected'])(
    'a known connection_status (%s) is kept and not logged',
    async (status) => {
      const { client } = setup({
        maindata: () =>
          jsonResponse(
            fullMaindata({ server_state: { connection_status: status } }),
          ),
      })
      const raw = await client.syncMaindata(0)
      expect(raw.server_state?.connection_status).toBe(status)
      expect(out.events('qbit_unknown_connection_status')).toEqual([])
    },
  )

  it('a delta without connection_status leaves it out', async () => {
    const { client } = setup({
      maindata: () =>
        jsonResponse({ rid: 2, server_state: { dl_info_speed: 1 } }),
    })
    const raw = await client.syncMaindata(1)
    expect(raw.server_state).toEqual({ dl_info_speed: 1 })
  })

  it('Q11 the client exposes its named methods only, frozen', () => {
    const { client } = setup()
    expect(Object.keys(client)).toEqual([
      'syncMaindata',
      'stopTorrents',
      'startTorrents',
      'deleteTorrents',
      'setLocation',
      'addTorrent',
      'torrentFiles',
      'setFilePriority',
      'logMain',
    ])
    expect(Object.isFrozen(client)).toBe(true)
  })

  it('Q11 QBIT_PATHS holds only app/version, login, sync/maindata, torrents/stop, start, delete, setLocation, add, files, filePrio and log/main', () => {
    expect(Object.values(QBIT_PATHS).sort()).toEqual([
      '/api/v2/app/version',
      '/api/v2/auth/login',
      '/api/v2/log/main',
      '/api/v2/sync/maindata',
      '/api/v2/torrents/add',
      '/api/v2/torrents/delete',
      '/api/v2/torrents/filePrio',
      '/api/v2/torrents/files',
      '/api/v2/torrents/setLocation',
      '/api/v2/torrents/start',
      '/api/v2/torrents/stop',
    ])
    expect(Object.isFrozen(QBIT_PATHS)).toBe(true)
  })

  describe('addTorrent (spec 4.7)', () => {
    const ADD = '/api/v2/torrents/add'
    const addCalls = (calls: ReadonlyArray<FakeCall>) =>
      calls.filter((call) => call.path === ADD)

    it('a magnet: one multipart POST with urls, category and autoTMM=true only', async () => {
      const { client, calls } = setup()
      await client.addTorrent(
        { kind: 'magnet', url: 'magnet:?xt=urn:btih:x' },
        'movies',
      )
      const [call] = addCalls(calls)
      expect(call.method).toBe('POST')
      expect(call.body).toBe('')
      expect([...(call.form?.entries() ?? [])]).toEqual([
        ['urls', 'magnet:?xt=urn:btih:x'],
        ['category', 'movies'],
        ['autoTMM', 'true'],
      ])
    })

    it('a file: torrents with the bytes and the name', async () => {
      const { client, calls } = setup()
      const bytes = new TextEncoder().encode('d4:infod4:name1:aee')
      await client.addTorrent({ kind: 'file', bytes, name: 'a.torrent' }, 'tv')
      const [call] = addCalls(calls)
      expect([...(call.form?.keys() ?? [])]).toEqual([
        'torrents',
        'category',
        'autoTMM',
      ])
      const file = call.form?.get('torrents') as File
      expect(file.name).toBe('a.torrent')
      expect(new Uint8Array(await file.arrayBuffer())).toEqual(bytes)
    })

    it('a 403 logs in again and resends the same multipart form', async () => {
      let n = 0
      const { client, calls } = setup({
        add: () => {
          n += 1
          return n === 1
            ? new Response('Forbidden', { status: 403 })
            : new Response('Ok.')
        },
      })
      // Logged in once already, so the 403 reads as an expired session.
      await client.syncMaindata(0)
      await client.addTorrent({ kind: 'magnet', url: 'magnet:?x' }, 'movies')
      const sent = addCalls(calls)
      expect(sent).toHaveLength(2)
      expect(sent[1].form?.get('urls')).toBe('magnet:?x')
    })

    it.each([
      ['415', () => new Response('Torrent file is not valid', { status: 415 })],
      ['Fails.', () => new Response('Fails.')],
      [
        'JSON with only failure_count',
        () => jsonResponse({ failure_count: 1 }),
      ],
      [
        'JSON with only a pending count',
        () =>
          jsonResponse({
            success_count: 0,
            failure_count: 0,
            pending_count: 1,
          }),
      ],
      [
        'JSON with nothing added',
        () =>
          jsonResponse({
            success_count: 0,
            failure_count: 2,
            pending_count: 0,
          }),
      ],
    ])('%s is AddRefused (this entry, qbit_rejected)', async (_name, add) => {
      const { client } = setup({ add })
      const sent = client.addTorrent(
        { kind: 'magnet', url: 'magnet:?x' },
        'movies',
      )
      await expect(sent).rejects.toBeInstanceOf(AddRefused)
      await expect(sent).rejects.toEqual(failure('qbit_rejected'))
    })

    it.each([
      ['JSON that does not parse', () => new Response('{oops')],
      ['an empty body', () => new Response('')],
      ['an HTML page', () => new Response('<html><body>hi</body></html>')],
      ['other text', () => new Response('Something else')],
      ['a JSON array body', () => new Response('[1]')],
      ['a 502', () => new Response('Bad Gateway', { status: 502 })],
      ['a 409', () => new Response('Conflict', { status: 409 })],
    ])(
      '%s is a plain qbit_rejected, not about this entry',
      async (_name, add) => {
        const { client } = setup({ add })
        const sent = client.addTorrent(
          { kind: 'magnet', url: 'magnet:?x' },
          'movies',
        )
        await expect(sent).rejects.toEqual(failure('qbit_rejected'))
        await expect(sent).rejects.not.toBeInstanceOf(AddRefused)
      },
    )

    it('a 200 body that is not an answer logs qbit_bad_response, without the body', async () => {
      const { client } = setup({
        add: () => new Response('<html>LEAK_BODY</html>'),
      })
      await expect(
        client.addTorrent({ kind: 'magnet', url: 'magnet:?x' }, 'movies'),
      ).rejects.toEqual(failure('qbit_rejected'))
      expect(out.events('qbit_bad_response')).toEqual([
        expect.objectContaining({
          path: '/api/v2/torrents/add',
          reason: 'unexpected_body',
        }),
      ])
      expect(out.lines.join('')).not.toContain('LEAK_BODY')
    })

    it.each([
      ['Ok.', () => new Response('Ok.')],
      [
        'JSON with only success_count 1',
        () => jsonResponse({ success_count: 1 }),
      ],
      [
        'JSON with one added',
        () =>
          jsonResponse({
            success_count: 1,
            failure_count: 0,
            pending_count: 0,
          }),
      ],
    ])('%s counts as accepted', async (_name, add) => {
      const { client } = setup({ add })
      await expect(
        client.addTorrent({ kind: 'magnet', url: 'magnet:?x' }, 'movies'),
      ).resolves.toBeUndefined()
    })
  })

  it.each([
    ['stopTorrents', '/api/v2/torrents/stop'],
    ['startTorrents', '/api/v2/torrents/start'],
  ] as const)(
    'story 2.6 %s POSTs exactly the hashes form field, joined with |',
    async (method, path) => {
      const { client, calls } = setup()
      await client[method]([HASH_A, HASH_B])
      const sent = calls.filter((call) => call.path === path)
      expect(sent).toHaveLength(1)
      expect(sent[0].method).toBe('POST')
      expect([...sent[0].query.keys()]).toEqual([])
      expect([...new URLSearchParams(sent[0].body).entries()]).toEqual([
        ['hashes', `${HASH_A}|${HASH_B}`],
      ])
      // Logged in first; the cookie went along.
      expect(sent[0].headers.get('cookie')).toContain('QBT_SID_8080=abc')
    },
  )

  it.each([400, 409, 500])(
    'story 2.6 stopTorrents answered %s: qbit_rejected',
    async (status) => {
      const { client } = setup({
        stop: () => new Response('nope', { status }),
      })
      await expect(client.stopTorrents([HASH_A])).rejects.toEqual(
        failure('qbit_rejected'),
      )
    },
  )

  it.each([true, false])(
    'story 4.3 deleteTorrents POSTs hashes joined with | and deleteFiles=%s',
    async (deleteFiles) => {
      const { client, calls } = setup()
      await client.deleteTorrents([HASH_A, HASH_B], deleteFiles)
      const sent = calls.filter(
        (call) => call.path === '/api/v2/torrents/delete',
      )
      expect(sent).toHaveLength(1)
      expect(sent[0].method).toBe('POST')
      expect([...sent[0].query.keys()]).toEqual([])
      expect([...new URLSearchParams(sent[0].body).entries()]).toEqual([
        ['hashes', `${HASH_A}|${HASH_B}`],
        ['deleteFiles', String(deleteFiles)],
      ])
    },
  )

  it.each([400, 409, 500])(
    'story 4.3 deleteTorrents answered %s: qbit_rejected',
    async (status) => {
      const { client } = setup({
        delete: () => new Response('nope', { status }),
      })
      await expect(client.deleteTorrents([HASH_A], true)).rejects.toEqual(
        failure('qbit_rejected'),
      )
    },
  )

  it('story 5.2 setLocation POSTs hashes joined with | and location only', async () => {
    const { client, calls } = setup()
    await client.setLocation([HASH_A, HASH_B], '/downloads/media/tv')
    const sent = calls.filter(
      (call) => call.path === '/api/v2/torrents/setLocation',
    )
    expect(sent).toHaveLength(1)
    expect(sent[0].method).toBe('POST')
    expect([...sent[0].query.keys()]).toEqual([])
    expect([...new URLSearchParams(sent[0].body).entries()]).toEqual([
      ['hashes', `${HASH_A}|${HASH_B}`],
      ['location', '/downloads/media/tv'],
    ])
  })

  it('story 5.2 setLocation answered 403 with a live session (a folder it cannot write): qbit_rejected after one app/version read, no resend, maindata still works', async () => {
    const { client, calls } = setup({
      setLocation: () =>
        new Response('Cannot write to directory', { status: 403 }),
    })
    await client.syncMaindata(0)
    await expect(client.setLocation([HASH_A], '/downloads/ro')).rejects.toEqual(
      failure('qbit_rejected'),
    )
    expect(
      calls.filter((call) => call.path === '/api/v2/torrents/setLocation'),
    ).toHaveLength(1)
    expect(
      calls.filter((call) => call.path === '/api/v2/app/version'),
    ).toHaveLength(1)
    await expect(client.syncMaindata(1)).resolves.toBeDefined()
  })

  it.each([400, 409, 500])(
    'story 5.2 setLocation answered %s: qbit_rejected',
    async (status) => {
      const { client } = setup({
        setLocation: () => new Response('nope', { status }),
      })
      await expect(
        client.setLocation([HASH_A], '/downloads/tv'),
      ).rejects.toEqual(failure('qbit_rejected'))
    },
  )

  it('story 2.7 torrentFiles GETs exactly hash and keeps five fields per file, in order', async () => {
    const { client, calls } = setup({
      files: () =>
        jsonResponse([
          rawFile({ index: 3, name: 'b.mkv', priority: 0 }),
          rawFile({ index: 1, name: 'a.mkv', priority: 6, progress: 1 }),
        ]),
    })
    expect(await client.torrentFiles(HASH_A)).toEqual([
      {
        index: 3,
        name: 'b.mkv',
        size: 1_073_741_824,
        progress: 0.5,
        priority: 0,
      },
      {
        index: 1,
        name: 'a.mkv',
        size: 1_073_741_824,
        progress: 1,
        priority: 6,
      },
    ])
    const sent = calls.filter((call) => call.path === FILES)
    expect(sent).toHaveLength(1)
    expect(sent[0].method).toBe('GET')
    expect([...sent[0].query.entries()]).toEqual([['hash', HASH_A]])
  })

  it.each([
    ['not JSON', () => new Response('<html>')],
    ['not a list', () => jsonResponse({ files: [] })],
    ['a file without index', () => jsonResponse([{ name: 'x', size: 1 }])],
    ['a negative index', () => jsonResponse([rawFile({ index: -1 })])],
    [
      'qBittorrent 404 (unknown torrent)',
      () => new Response('', { status: 404 }),
    ],
  ])(
    'story 2.7 torrentFiles answered %s: qbit_rejected',
    async (_name, files) => {
      const { client } = setup({ files })
      await expect(client.torrentFiles(HASH_A)).rejects.toEqual(
        failure('qbit_rejected'),
      )
      // Never a file name in the log.
      expect(out.lines.join('')).not.toContain('Fake.Show')
    },
  )

  it('story 2.7 setFilePriority POSTs exactly hash, id joined with | and priority', async () => {
    const { client, calls } = setup()
    await client.setFilePriority(HASH_A, [3, 1], 6)
    const sent = calls.filter((call) => call.path === FILE_PRIO)
    expect(sent).toHaveLength(1)
    expect(sent[0].method).toBe('POST')
    expect([...sent[0].query.keys()]).toEqual([])
    expect([...new URLSearchParams(sent[0].body).entries()]).toEqual([
      ['hash', HASH_A],
      ['id', '3|1'],
      ['priority', '6'],
    ])
  })

  it.each([400, 404, 409])(
    'story 2.7 setFilePriority answered %s: qbit_rejected',
    async (status) => {
      const { client } = setup({
        filePrio: () => new Response('nope', { status }),
      })
      await expect(client.setFilePriority(HASH_A, [0], 0)).rejects.toEqual(
        failure('qbit_rejected'),
      )
    },
  )

  it('story 2.10 logMain GETs warning lines newer than last_known_id and keeps four fields', async () => {
    const { client, calls } = setup({
      log: () =>
        jsonResponse([
          { id: 4, message: 'one', timestamp: 1_790_000_000, type: 4, x: 1 },
          { id: 5, message: 'two', timestamp: 1_790_000_001, type: 4 },
        ]),
    })
    expect(await client.logMain(3)).toEqual([
      { id: 4, message: 'one', timestamp: 1_790_000_000, type: 4 },
      { id: 5, message: 'two', timestamp: 1_790_000_001, type: 4 },
    ])
    const sent = calls.filter((call) => call.path === LOG_MAIN)
    expect(sent).toHaveLength(1)
    expect(sent[0].method).toBe('GET')
    expect([...sent[0].query.entries()]).toEqual([
      ['normal', 'false'],
      ['info', 'false'],
      ['warning', 'true'],
      ['critical', 'false'],
      ['last_known_id', '3'],
    ])
  })

  it('story 2.10 logMain(-1) asks for the whole buffer', async () => {
    const { client, calls } = setup()
    expect(await client.logMain(-1)).toEqual([])
    const sent = calls.find((call) => call.path === LOG_MAIN)
    expect(sent?.query.get('last_known_id')).toBe('-1')
  })

  it.each([
    ['not JSON', () => new Response('<html>')],
    ['not a list', () => jsonResponse({ lines: [] })],
    [
      'a line without an id',
      () => jsonResponse([{ message: 'File error alert. Torrent: "X"' }]),
    ],
    [
      'a fractional id',
      () => jsonResponse([{ id: 1.5, message: 'm', timestamp: 1, type: 4 }]),
    ],
    ['HTTP 500', () => new Response('', { status: 500 })],
  ])(
    'story 2.10 logMain answered %s: qbit_rejected, no log text logged',
    async (_name, log) => {
      const { client } = setup({ log })
      await expect(client.logMain(-1)).rejects.toEqual(failure('qbit_rejected'))
      expect(out.lines.join('')).not.toContain('File error alert')
    },
  )

  it('Q11 no server source names setPreferences or builds an /api/v2 path from a value', () => {
    const root = join(import.meta.dirname, '..')
    const sources = readdirSync(root, { recursive: true, encoding: 'utf8' })
      .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
      .map((file) => [file, readFileSync(join(root, file), 'utf8')] as const)
    expect(sources.length).toBeGreaterThan(10)
    const templatePath = '`/api/v2/$' + '{'
    const offenders = sources
      .filter(
        ([, text]) =>
          text.includes('setPreferences') || text.includes(templatePath),
      )
      .map(([file]) => file)
    expect(offenders).toEqual([])
  })
})
