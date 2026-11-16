import type {
  Category,
  MaindataResponse,
  ServerState,
  SlimTorrent,
} from '#/shared/maindata'

// Test-only fixtures for the browser side: fake hashes, the code-name
// categories (X, mteam-X, mteam-tv) and paths like /data/media/X/incompleted.

/** A fake 40-hex hash from a small number or letter. */
export function fakeHash(seed: number | string): string {
  const hex =
    typeof seed === 'number' ? seed.toString(16) : seed.repeat(40).slice(0, 40)
  return hex.padStart(40, '0')
}

/** A fake slim torrent (`t(...)` in the spec). */
export function t(overrides: Partial<SlimTorrent> = {}): SlimTorrent {
  return {
    hash: fakeHash('a'),
    name: 'Fake.Show.S01E01.1080p',
    state: 'downloading',
    progress: 0.5,
    size: 85 * 1024 ** 3,
    dlspeed: 0,
    upspeed: 0,
    eta: 8_640_000,
    ratio: 0,
    added_on: 1_790_000_000,
    completion_on: -1,
    seeding_time: 0,
    last_activity: 0,
    save_path: '/data/media/X/incompleted',
    category: 'X',
    private: false,
    ...overrides,
  }
}

export function fakeServerState(
  overrides: Partial<ServerState> = {},
): ServerState {
  return {
    dl_info_speed: 0,
    up_info_speed: 0,
    dl_rate_limit: 0,
    up_rate_limit: 0,
    use_alt_speed_limits: false,
    connection_status: 'connected',
    ...overrides,
  }
}

export function fakeCategories(): Record<string, Category> {
  return {
    X: { name: 'X', savePath: '/data/media/X' },
    'mteam-X': { name: 'mteam-X', savePath: '/data/torrent/mteam-seed' },
    'mteam-tv': { name: 'mteam-tv', savePath: '/data/torrent/mteam-seed' },
  }
}

export function fakeResponse(
  overrides: Partial<MaindataResponse> = {},
): MaindataResponse {
  return {
    version: 'abcdef12.1',
    full: true,
    changed: [],
    removed: [],
    serverState: fakeServerState(),
    categories: fakeCategories(),
    ...overrides,
  }
}
