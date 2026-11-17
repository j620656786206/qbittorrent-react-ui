import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetEnvCache } from '#/server/env'
import { BadMaindata } from '#/server/qbit/bad-maindata'
import { QBIT_PATHS, createQbitClient } from '#/server/qbit/client'
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
import type { FakeQbitRoutes } from '#/server/qbit/testing'

// Spec 1.5 rows Q10 and Q11: the named-method client.

const MAINDATA = '/api/v2/sync/maindata'
const FILES = '/api/v2/torrents/files'
const FILE_PRIO = '/api/v2/torrents/filePrio'

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
      'torrentFiles',
      'setFilePriority',
    ])
    expect(Object.isFrozen(client)).toBe(true)
  })

  it('Q11 QBIT_PATHS holds only login, sync/maindata, torrents/stop, start, files and filePrio', () => {
    expect(Object.values(QBIT_PATHS).sort()).toEqual([
      '/api/v2/auth/login',
      '/api/v2/sync/maindata',
      '/api/v2/torrents/filePrio',
      '/api/v2/torrents/files',
      '/api/v2/torrents/start',
      '/api/v2/torrents/stop',
    ])
    expect(Object.isFrozen(QBIT_PATHS)).toBe(true)
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
