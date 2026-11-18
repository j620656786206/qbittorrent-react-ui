import { randomUUID } from 'node:crypto'
import { chmod, mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { log as defaultLog } from '#/server/log'
import type { Logger } from '#/server/log'
import { migrateSettings } from '#/server/settings/migrations'
import type { RawSettings } from '#/server/settings/migrations'
import { isUnderSaveRoot } from '#/server/settings/save-roots'
import {
  categoryKeySchema,
  categoryOrderEntrySchema,
} from '#/shared/categories'
import {
  MAX_COMMON_PATHS,
  MAX_SETTINGS_BYTES,
  SETTINGS_VERSION,
  commonPathSchema,
  defaultSettings,
  settingsSchema,
  sortChoiceSchema,
} from '#/shared/settings'
import type { CommonPath, Settings, SortChoice } from '#/shared/settings'

// AD-8, story 3.1: the one module that owns `${CONFIG_DIR}/settings.json`.
// - Missing file: defaults are written (mode 600).
// - Missing section: its default is filled in, the others kept; one bad
//   entry inside a section is dropped and logged, not treated as corruption;
//   a repaired file is written back on that read (the documented first-read
//   repair, the only write a read does besides creating the file).
// - Unparseable JSON or not an object: the old file is kept as
//   `settings.json.broken-<UTC timestamp>` (Claude 代決), defaults written.
// - `version` newer than this code: the file is left alone, defaults are
//   served and every write fails (`settings_write_failed`), logged once per
//   start.
// - Every read and every read-modify-write runs on one in-process queue;
//   a write goes to a temp file in the same folder (written, `fsync`ed,
//   closed), then `rename`, then the folder is `fsync`ed where the platform
//   allows, so a power cut leaves the old file or the new one. A file over
//   256 KB is refused.
// - A top-level key this code does not know (a section a later image
//   added without a new `version`, spine AD-8) is kept as it is through
//   every write and never served or counted as a repair, so running an
//   older image never erases it.
// - A common path outside `SAVE_ROOTS` stays in the file (a boot with a
//   wrong `SAVE_ROOTS` must not erase it) and is only left out of what is
//   served.
// - A file that cannot be read (EACCES): defaults are served, the file is
//   left alone, every write fails; logged once per start. A read's repair
//   write that fails is also logged once per start.
// AR-36: log lines carry the file name, section names, counts and errno
// codes only: never content (category names may be private) and never a
// path beyond the file name.
// Node fs/promises `open` (mode), `FileHandle.sync`, `chmod`, `rename`:
// https://nodejs.org/docs/latest-v26.x/api/fs.html

export const SETTINGS_FILE = 'settings.json'
const MODE = 0o600

export interface SettingsStoreOptions {
  /** `CONFIG_DIR`. */
  dir: string
  /** The env's parsed `SAVE_ROOTS`: a common path outside them is not served. */
  saveRoots: ReadonlyArray<string>
  logger?: Logger
  now?: () => Date
}

export type SettingsWrite = { ok: true; settings: Settings } | { ok: false }

export interface SettingsStore {
  /**
   * The settings as the file holds them, repaired, without common paths
   * outside `SAVE_ROOTS`; defaults when unusable.
   */
  read: () => Promise<Settings>
  /**
   * Applies `change` to the settings the file holds (common paths outside
   * `SAVE_ROOTS` included, so they survive) and writes the result; answers
   * it as served. An unchanged result is not written again (the call stays
   * idempotent).
   */
  update: (change: (current: Settings) => Settings) => Promise<SettingsWrite>
}

/** Top-level keys this code does not know, kept as the file had them. */
type Unknown = Readonly<Record<string, unknown>>

const KNOWN_KEYS: ReadonlySet<string> = new Set(
  Object.keys(settingsSchema.shape),
)

type Loaded =
  | { kind: 'ok'; settings: Settings; unknown: Unknown; repaired: boolean }
  | { kind: 'missing' }
  | { kind: 'broken' }
  | { kind: 'newer'; version: number }
  | { kind: 'unreadable'; code: string }

function errnoCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code
  return typeof code === 'string' ? code : 'unknown'
}

function isPlainObject(value: unknown): value is RawSettings {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const proto: unknown = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function serialize(settings: Settings): string {
  return `${JSON.stringify(settings, null, 2)}\n`
}

export function createSettingsStore(
  options: SettingsStoreOptions,
): SettingsStore {
  const { dir, saveRoots } = options
  const logger = options.logger ?? defaultLog
  const now = options.now ?? (() => new Date())
  const file = join(dir, SETTINGS_FILE)
  let newerLogged = false
  let unreadableLogged = false
  let repairFailLogged = false
  let tail: Promise<unknown> = Promise.resolve()

  /** Runs `task` after every earlier one settled. */
  function locked<T>(task: () => Promise<T>): Promise<T> {
    const run = tail.then(task, task)
    tail = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  function writeFailed(reason: string, fields: Record<string, unknown> = {}) {
    logger.error('settings_write_failed', {
      file: SETTINGS_FILE,
      reason,
      ...fields,
    })
  }

  /**
   * The repaired settings, the unknown top-level keys, and whether anything
   * had to change.
   */
  function repair(raw: RawSettings): {
    settings: Settings
    unknown: Unknown
    repaired: boolean
  } {
    let repaired = false
    const dropped = (section: string, count: number) => {
      if (count === 0) return
      repaired = true
      logger.warn('settings_entries_dropped', {
        file: SETTINGS_FILE,
        section,
        count,
      })
    }
    /** The section's raw value, or `undefined` (default filled) when unusable. */
    const section = <T>(
      name: string,
      isShape: (value: unknown) => value is T,
    ): T | undefined => {
      const value = raw[name]
      if (value === undefined) {
        repaired = true
        logger.info('settings_section_filled', {
          file: SETTINGS_FILE,
          section: name,
        })
        return undefined
      }
      if (!isShape(value)) {
        repaired = true
        logger.warn('settings_section_invalid', {
          file: SETTINGS_FILE,
          section: name,
        })
        return undefined
      }
      return value
    }

    const unknown = Object.fromEntries(
      Object.entries(raw).filter(([key]) => !KNOWN_KEYS.has(key)),
    )
    if (raw.version == null) repaired = true

    const sortRaw = section('categorySort', isPlainObject) ?? {}
    const sortEntries: Array<[string, SortChoice]> = []
    for (const [key, value] of Object.entries(sortRaw)) {
      const keyOk = categoryKeySchema.safeParse(key).success
      const choice = sortChoiceSchema.safeParse(value)
      if (keyOk && choice.success) sortEntries.push([key, choice.data])
    }
    dropped('categorySort', Object.keys(sortRaw).length - sortEntries.length)

    const orderRaw = section('categoryOrder', Array.isArray) ?? []
    const order: Array<string> = []
    for (const entry of orderRaw as Array<unknown>) {
      const parsed = categoryOrderEntrySchema.safeParse(entry)
      if (parsed.success && !order.includes(parsed.data))
        order.push(parsed.data)
    }
    dropped('categoryOrder', orderRaw.length - order.length)

    const pathsRaw = section('commonPaths', Array.isArray) ?? []
    const paths: Array<CommonPath> = []
    for (const entry of pathsRaw as Array<unknown>) {
      if (paths.length >= MAX_COMMON_PATHS) break
      const parsed = commonPathSchema.safeParse(entry)
      if (
        parsed.success &&
        !paths.some((kept) => kept.path === parsed.data.path)
      ) {
        if (parsed.data.path !== (entry as { path: string }).path) {
          // Kept, but stored normalized from now on.
          repaired = true
        }
        paths.push(parsed.data)
      }
    }
    dropped('commonPaths', pathsRaw.length - paths.length)

    return {
      settings: {
        version: SETTINGS_VERSION,
        // Own properties only, whatever the key (Object.fromEntries).
        categorySort: Object.fromEntries(sortEntries),
        categoryOrder: order,
        commonPaths: paths,
      },
      unknown,
      repaired,
    }
  }

  async function load(): Promise<Loaded> {
    let text: string
    try {
      text = await readFile(file, 'utf8')
    } catch (error) {
      const code = errnoCode(error)
      return code === 'ENOENT'
        ? { kind: 'missing' }
        : { kind: 'unreadable', code }
    }
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch {
      return { kind: 'broken' }
    }
    if (!isPlainObject(raw)) return { kind: 'broken' }
    // A file without `version` (or `null`) is read as version 1 and
    // repaired, like a missing section.
    const version = raw.version ?? SETTINGS_VERSION
    if (
      typeof version !== 'number' ||
      !Number.isInteger(version) ||
      version < 1
    ) {
      return { kind: 'broken' }
    }
    if (version > SETTINGS_VERSION) return { kind: 'newer', version }
    const migrated = migrateSettings(raw, version)
    if (migrated === null) return { kind: 'broken' }
    const { settings, unknown, repaired } = repair(migrated)
    return {
      kind: 'ok',
      settings,
      unknown,
      repaired: repaired || version < SETTINGS_VERSION,
    }
  }

  async function writeFileAtomically(text: string): Promise<void> {
    await mkdir(dir, { recursive: true })
    const temp = join(dir, `.${SETTINGS_FILE}.${randomUUID()}.tmp`)
    try {
      const handle = await open(temp, 'wx', MODE)
      try {
        await handle.writeFile(text, 'utf8')
        await handle.sync()
      } finally {
        await handle.close()
      }
      // `mode` is masked by the umask; 600 whatever the umask.
      await chmod(temp, MODE)
      await rename(temp, file)
    } catch (error) {
      await rm(temp, { force: true }).catch(() => undefined)
      throw error
    }
    await syncFolder()
  }

  /** Makes the rename durable; some platforms cannot fsync a folder. */
  async function syncFolder(): Promise<void> {
    let handle
    try {
      handle = await open(dir, 'r')
      await handle.sync()
    } catch (error) {
      const code = errnoCode(error)
      if (code !== 'EINVAL' && code !== 'EISDIR') {
        logger.warn('settings_folder_sync_failed', {
          file: SETTINGS_FILE,
          code,
        })
      }
    } finally {
      await handle?.close().catch(() => undefined)
    }
  }

  /**
   * Writes `settings` as the schema parses it (paths normalized), with the
   * file's unknown top-level keys kept, and answers the settings written;
   * `null` (logged through `fail`) when refused or failed.
   */
  async function write(
    settings: Settings,
    unknown: Unknown,
    fail: typeof writeFailed = writeFailed,
  ): Promise<Settings | null> {
    const checked = settingsSchema.safeParse(settings)
    if (!checked.success) {
      fail('invalid')
      return null
    }
    const text = `${JSON.stringify({ ...unknown, ...checked.data }, null, 2)}\n`
    const bytes = Buffer.byteLength(text, 'utf8')
    if (bytes > MAX_SETTINGS_BYTES) {
      fail('too_large', { bytes, maxBytes: MAX_SETTINGS_BYTES })
      return null
    }
    try {
      await writeFileAtomically(text)
      return checked.data
    } catch (error) {
      fail('io', { code: errnoCode(error) })
      return null
    }
  }

  /**
   * A read's repair write that fails (a read-only CONFIG_DIR) would fail
   * on every focus: logged once per start.
   */
  function repairWriteFailed(
    reason: string,
    fields: Record<string, unknown> = {},
  ) {
    if (repairFailLogged) return
    repairFailLogged = true
    writeFailed(reason, { ...fields, repair: true })
  }

  /** Keeps the broken file under a new name; `false` (logged) on failure. */
  async function keepBroken(): Promise<boolean> {
    const stamp = now().toISOString().replace(/[-:]/g, '')
    const keptAs = `${SETTINGS_FILE}.broken-${stamp}`
    try {
      await rename(file, join(dir, keptAs))
    } catch (error) {
      writeFailed('keep_broken', { code: errnoCode(error) })
      return false
    }
    // The kept copy may hold private names: 600 like the file itself.
    await chmod(join(dir, keptAs), MODE).catch(() => undefined)
    logger.warn('settings_file_broken', { file: SETTINGS_FILE, keptAs })
    return true
  }

  function noteNewer(version: number) {
    if (newerLogged) return
    newerLogged = true
    logger.error('settings_version_newer', {
      file: SETTINGS_FILE,
      version,
      knownVersion: SETTINGS_VERSION,
    })
  }

  function noteUnreadable(code: string) {
    if (unreadableLogged) return
    unreadableLogged = true
    logger.error('settings_read_failed', { file: SETTINGS_FILE, code })
  }

  /** What is served: common paths outside `SAVE_ROOTS` are left out. */
  function served(settings: Settings): Settings {
    const commonPaths = settings.commonPaths.filter((entry) =>
      isUnderSaveRoot(entry.path, saveRoots),
    )
    return commonPaths.length === settings.commonPaths.length
      ? settings
      : { ...settings, commonPaths }
  }

  /**
   * The current settings for a read-modify-write, or `null` (logged) when
   * the file must not be written. Missing and broken files start from the
   * defaults (a broken one is kept first).
   */
  async function current(): Promise<{
    settings: Settings
    unknown: Unknown
    mustWrite: boolean
  } | null> {
    const loaded = await load()
    switch (loaded.kind) {
      case 'ok':
        return {
          settings: loaded.settings,
          unknown: loaded.unknown,
          mustWrite: loaded.repaired,
        }
      case 'missing':
        return { settings: defaultSettings(), unknown: {}, mustWrite: true }
      case 'broken':
        return (await keepBroken())
          ? { settings: defaultSettings(), unknown: {}, mustWrite: true }
          : null
      case 'newer':
        noteNewer(loaded.version)
        return null
      case 'unreadable':
        noteUnreadable(loaded.code)
        return null
    }
  }

  return {
    read: () =>
      locked(async () => {
        const state = await current()
        if (state === null) return defaultSettings()
        if (state.mustWrite) {
          await write(state.settings, state.unknown, repairWriteFailed)
        }
        return served(state.settings)
      }),
    update: (change) =>
      locked(async () => {
        const state = await current()
        if (state === null) {
          writeFailed('not_writable')
          return { ok: false }
        }
        const next = change(state.settings)
        const unchanged = serialize(next) === serialize(state.settings)
        if (unchanged && !state.mustWrite) {
          return { ok: true, settings: served(next) }
        }
        const written = await write(next, state.unknown)
        return written ? { ok: true, settings: served(written) } : { ok: false }
      }),
  }
}
