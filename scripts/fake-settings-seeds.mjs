// Story 5.1: fake-qbit's common-path data, in its own module so a vitest
// (src/shared/fake-settings-seeds.test.ts) can parse every seed with the
// real settings schema without starting the fake server. Fake names and
// folders under /data only (the app serves common paths only under
// SAVE_ROOTS=/data). No dependencies.

/**
 * `paths=varied`: the n-th torrent of a data set gets its own folder under
 * the (n mod 50)-th parent, so `many` has 4165 distinct save paths.
 */
export const VARIED_PARENTS = [
  '/data/media/tv',
  '/data/torrent/mteam-seed',
  '/data/downloads',
  '/data/media/movies',
  '/data/torrents/tv',
  '/data/torrents/movies',
  ...Array.from(
    { length: 44 },
    (_, index) => `/data/pool/p${String(index + 6).padStart(2, '0')}`,
  ),
]

const LIBRARY = [
  { path: '/data/torrents/tv', name: '下載區（影集）', mediaLibrary: false },
  {
    path: '/data/torrents/movies',
    name: '下載區（電影）',
    mediaLibrary: false,
  },
  { path: '/data/torrent/mteam-seed', name: 'PT 做種', mediaLibrary: false },
  { path: '/data/media/tv', name: '影集媒體庫', mediaLibrary: true },
  { path: '/data/media/movies', name: '電影媒體庫', mediaLibrary: true },
]

/** A name near the 50-character limit, to check tags cut inside the box. */
export const LONG_NAME =
  'PT 做種：長期保種的資料夾，名字故意取得很長，確認標籤會在框裡切掉'

const fifty = (renamed) =>
  VARIED_PARENTS.map((path, index) => ({
    path,
    name: `${renamed ? '改名' : '常用'} ${String(index + 1).padStart(2, '0')}`,
    mediaLibrary: (index % 2 === 0) !== renamed,
  }))

const withEntry = (path, change) =>
  LIBRARY.map((entry) =>
    entry.path === path ? { ...entry, ...change } : entry,
  )

/**
 * `library` is EXPERIENCE.md's example table; `library-long` gives PT 做種
 * LONG_NAME; `library-renamed` renames 影集媒體庫 and unticks it (another
 * device's edit, R1); `fifty` gives every VARIED_PARENTS folder a common
 * path (every other one a media library), `fifty-renamed` renames all 50
 * and flips every 「媒體庫」, so every tag changes (the timing run).
 */
export const SETTINGS_SEEDS = {
  library: LIBRARY,
  'library-long': withEntry('/data/torrent/mteam-seed', { name: LONG_NAME }),
  'library-renamed': withEntry('/data/media/tv', {
    name: '影集（暫放）',
    mediaLibrary: false,
  }),
  fifty: fifty(false),
  'fifty-renamed': fifty(true),
}

/** The whole settings.json a seed writes. */
export function seedFile(commonPaths) {
  return { version: 1, categorySort: {}, categoryOrder: [], commonPaths }
}
