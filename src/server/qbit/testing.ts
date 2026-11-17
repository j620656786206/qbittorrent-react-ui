import { vi } from 'vitest'

// Test-only: a fake qBittorrent behind an injected `fetch`. Fake origin, fake
// credentials and marker strings only; never a real address.

export const FAKE_QBIT_ORIGIN = 'http://qbit.test.invalid:8080'
export const FAKE_USERNAME = 'fake-user'
export const FAKE_PASSWORD = 'fake-password-1'

export const HASH_A = 'a'.repeat(40)
export const HASH_B = 'b'.repeat(40)
export const HASH_C = 'c'.repeat(64)
export const HASH_D = 'd'.repeat(40)

/**
 * Values that must never leave the container through getMaindata. Through
 * getSortKeys: the tracker URL (its passkey), the magnet link and the
 * external addresses never; comment, content_path, root_path and the
 * infohashes only for their own field (`SORT_KEY_ONLY_MARKERS`);
 * download_path never (not one of the 51 sorts). The tracker's hostname
 * (`FAKE_TRACKER_DOMAIN`) may leave only as `tracker_domain`.
 */
export const LEAK_MARKERS = {
  last_external_address_v4: 'fake-external-v4',
  last_external_address_v6: 'fake-external-v6',
  magnet_uri: 'magnet:?xt=fake-magnet-marker',
  tracker:
    'http://fake-tracker-marker.invalid/announce?passkey=fake-passkey-marker',
  comment: 'fake-comment-marker',
  content_path: '/downloads/fake-content-path-marker',
  download_path: '/downloads/fake-download-path-marker',
  root_path: '/downloads/fake-root-path-marker',
  infohash_v1: 'fake-infohash-v1-marker',
  infohash_v2: 'fake-infohash-v2-marker',
} as const

/** The passkey inside the fake tracker URL. */
export const FAKE_PASSKEY = 'fake-passkey-marker'
export const FAKE_TRACKER_DOMAIN = 'fake-tracker-marker.invalid'

/** Markers getSortKeys may send, each only for the field named here. */
export const SORT_KEY_ONLY_MARKERS = {
  comment: LEAK_MARKERS.comment,
  content_path: LEAK_MARKERS.content_path,
  root_path: LEAK_MARKERS.root_path,
  infohash_v1: LEAK_MARKERS.infohash_v1,
  infohash_v2: LEAK_MARKERS.infohash_v2,
} as const

/** A complete raw maindata torrent (no `hash`: qBittorrent keys by it). */
export function rawTorrent(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Fake Torrent',
    state: 'downloading',
    progress: 0.5,
    size: 1_073_741_824,
    total_size: 2_147_483_648,
    dlspeed: 1024,
    upspeed: 0,
    eta: 3600,
    ratio: 0.25,
    added_on: 1_700_000_000,
    completion_on: -1,
    seeding_time: 0,
    save_path: '/downloads/movies/',
    category: 'movies',
    private: false,
    num_seeds: 3,
    num_leechs: 1,
    num_complete: 40,
    num_incomplete: 7,
    time_active: 7_250,
    last_activity: 1_700_003_645,
    seen_complete: 1_700_002_000,
    amount_left: 1_073_741_824,
    availability: 1.4567,
    downloaded: 1_073_741_824,
    uploaded: 268_435_456,
    downloaded_session: 1_048_576,
    uploaded_session: 524_288,
    popularity: 0.123,
    trackers_count: 2,
    dl_limit: -1,
    up_limit: 102_400,
    ratio_limit: -2,
    seeding_time_limit: -2,
    inactive_seeding_time_limit: -1,
    priority: 3,
    reannounce: 1_799,
    has_metadata: true,
    tags: 'fake-tag',
    magnet_uri: LEAK_MARKERS.magnet_uri,
    tracker: LEAK_MARKERS.tracker,
    comment: LEAK_MARKERS.comment,
    content_path: LEAK_MARKERS.content_path,
    download_path: LEAK_MARKERS.download_path,
    root_path: LEAK_MARKERS.root_path,
    infohash_v1: LEAK_MARKERS.infohash_v1,
    infohash_v2: LEAK_MARKERS.infohash_v2,
    ...overrides,
  }
}

export function rawServerState(overrides: Record<string, unknown> = {}) {
  return {
    dl_info_speed: 2048,
    up_info_speed: 512,
    dl_rate_limit: 0,
    up_rate_limit: 0,
    use_alt_speed_limits: false,
    connection_status: 'connected',
    dht_nodes: 300,
    last_external_address_v4: LEAK_MARKERS.last_external_address_v4,
    last_external_address_v6: LEAK_MARKERS.last_external_address_v6,
    ...overrides,
  }
}

export function fullMaindata(overrides: Record<string, unknown> = {}) {
  return {
    rid: 1,
    full_update: true,
    torrents: {
      [HASH_A]: rawTorrent({ name: 'A' }),
      [HASH_B]: rawTorrent({ name: 'B', private: true }),
      [HASH_C]: rawTorrent({ name: 'C', private: null }),
    },
    categories: {
      movies: { name: 'movies', savePath: '/downloads/movies' },
      tv: { name: 'tv', savePath: '/downloads/tv' },
    },
    server_state: rawServerState(),
    tags: ['fake-tag'],
    trackers: { [LEAK_MARKERS.tracker]: [HASH_A] },
    ...overrides,
  }
}

export function loginOk(cookie = 'QBT_SID_8080=abc'): Response {
  return new Response('Ok.', {
    headers: [['set-cookie', `${cookie}; HttpOnly; path=/`]],
  })
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export interface FakeCall {
  path: string
  method: string
  query: URLSearchParams
  headers: Headers
  body: string
  signal: AbortSignal | null
  redirect: RequestRedirect
}

type Handler = (call: FakeCall) => Response | Promise<Response>

export interface FakeQbitRoutes {
  login?: Handler
  maindata?: Handler
  /** `torrents/stop` and `torrents/start`; 200 with an empty body by default. */
  stop?: Handler
  start?: Handler
  /** Story 2.7: `torrents/files` (two fake files) and `torrents/filePrio`. */
  files?: Handler
  filePrio?: Handler
  /** Story 2.10: `log/main`; an empty list by default. */
  log?: Handler
}

/** Story 2.7: a raw `torrents/files` entry with qBittorrent's extra fields. */
export function rawFile(overrides: Record<string, unknown> = {}) {
  return {
    index: 0,
    name: 'Fake.Show/Fake.Show.E01.mkv',
    size: 1_073_741_824,
    progress: 0.5,
    priority: 1,
    is_seed: false,
    piece_range: [0, 255],
    availability: 0.75,
    ...overrides,
  }
}

/** A routing fake `fetch` that records every call. */
export function fakeQbit(routes: FakeQbitRoutes = {}) {
  const calls: Array<FakeCall> = []
  const handlers: Record<string, Handler | undefined> = {
    '/api/v2/auth/login': routes.login ?? (() => loginOk()),
    '/api/v2/sync/maindata':
      routes.maindata ?? (() => jsonResponse(fullMaindata())),
    '/api/v2/torrents/stop': routes.stop ?? (() => new Response('')),
    '/api/v2/torrents/start': routes.start ?? (() => new Response('')),
    '/api/v2/torrents/files':
      routes.files ??
      (() =>
        jsonResponse([
          rawFile(),
          rawFile({ index: 1, name: 'Fake.Show/Fake.Show.E02.mkv' }),
        ])),
    '/api/v2/torrents/filePrio': routes.filePrio ?? (() => new Response('')),
    '/api/v2/log/main': routes.log ?? (() => jsonResponse([])),
  }
  const fetch = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = new URL(String(input))
      const body = init?.body
      const call: FakeCall = {
        path: url.pathname,
        method: init?.method ?? 'GET',
        query: url.searchParams,
        headers: new Headers(init?.headers),
        body: body instanceof URLSearchParams ? body.toString() : '',
        signal: init?.signal ?? null,
        redirect: init?.redirect ?? 'follow',
      }
      calls.push(call)
      const handler = handlers[url.pathname]
      if (!handler) return new Response('Not Found', { status: 404 })
      return handler(call)
    },
  )
  const count = (path: string) =>
    calls.filter((call) => call.path === path).length
  return {
    fetch: fetch as unknown as typeof globalThis.fetch,
    spy: fetch,
    calls,
    count,
  }
}

/** A promise with its resolve exposed. */
export function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

/** Captures the default logger's stdout lines, parsed. */
export function captureStdout() {
  const lines: Array<string> = []
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    lines.push(String(chunk))
    return true
  })
  const parsed = () =>
    lines.map((line) => JSON.parse(line) as Record<string, unknown>)
  const events = (event: string) =>
    parsed().filter((line) => line.event === event)
  return { lines, parsed, events }
}

/** TEST-NET-1 (RFC 5737): stands in for the address DNS resolved to. */
export const FAKE_RESOLVED_ADDRESS = '192.0.2.10'

/**
 * Node's fetch (undici) rejection for a refused connection or a failed DNS
 * lookup: `TypeError('fetch failed')` whose cause message names the resolved
 * address or the host.
 */
export function fetchFailed(code: 'ECONNREFUSED' | 'ENOTFOUND'): TypeError {
  const cause =
    code === 'ECONNREFUSED'
      ? Object.assign(
          new Error(`connect ECONNREFUSED ${FAKE_RESOLVED_ADDRESS}:8080`),
          {
            code,
            errno: -61,
            syscall: 'connect',
            address: FAKE_RESOLVED_ADDRESS,
            port: 8080,
          },
        )
      : Object.assign(new Error('getaddrinfo ENOTFOUND qbit.test.invalid'), {
          code,
          errno: -3008,
          syscall: 'getaddrinfo',
          hostname: 'qbit.test.invalid',
        })
  return new TypeError('fetch failed', { cause })
}
