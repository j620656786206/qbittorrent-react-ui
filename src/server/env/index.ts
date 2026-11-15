import { createLogger, envSecrets } from '#/server/log'
import type { Logger } from '#/server/log'

// AD-16 / AR-17: required env, checked at boot. Problems name the variable and
// the reason only, never the value.

export const REQUIRED_ENV = [
  'QBIT_URL',
  'QBIT_USERNAME',
  'QBIT_PASSWORD',
  'SESSION_SECRET',
  'APP_ORIGINS',
  'SAVE_ROOTS',
] as const

export const SESSION_SECRET_PLACEHOLDER = 'replace-with-openssl-rand-base64-32'
export const MIN_SECRET_BYTES = 32
export const DEFAULT_CONFIG_DIR = '/config'

export interface Env {
  qbitUrl: string
  qbitUsername: string
  qbitPassword: string
  sessionSecret: string
  /** Normalised origins, e.g. `http://nas.example:3000`. */
  appOrigins: Array<string>
  /** `host` of each origin (hostname plus non-default port). */
  allowedHosts: Array<string>
  saveRoots: Array<string>
  configDir: string
}

export type EnvSource = Record<string, string | undefined>
export type ParseEnvResult =
  { ok: true; env: Env } | { ok: false; problems: Array<string> }

function listEntries(value: string): Array<string> {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
}

/**
 * `url.origin` of an http(s) URL with no credentials, query, hash or path
 * other than `/`; otherwise `null`. Uppercase hosts and default ports are fine.
 */
function parseOrigin(entry: string): string | null {
  let url: URL
  try {
    url = new URL(entry)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (url.username || url.password || url.search || url.hash) return null
  if (url.pathname !== '/') return null
  return url.origin
}

/** Absolute, not `/` alone, no empty, `.` or `..` segments; trailing `/` dropped. */
function parseSaveRoot(entry: string): string | null {
  if (!entry.startsWith('/')) return null
  const path = entry.replace(/\/+$/, '')
  const segments = path.split('/').slice(1)
  if (segments.length === 0) return null
  const bad = segments.some(
    (part) => part === '' || part === '.' || part === '..',
  )
  return bad ? null : path
}

export function parseEnv(source: EnvSource): ParseEnvResult {
  const problems: Array<string> = []
  const value = (name: string): string => source[name] ?? ''

  for (const name of REQUIRED_ENV) {
    if (value(name).trim() === '') problems.push(`${name} is missing or empty`)
  }

  // Stored as the origin: no trailing slash, credentials, query or path.
  let qbitUrl = ''
  if (value('QBIT_URL').trim() !== '') {
    const origin = parseOrigin(value('QBIT_URL').trim())
    if (origin) qbitUrl = origin
    else {
      problems.push(
        'QBIT_URL is not an http(s) URL without credentials, path, query or hash',
      )
    }
  }

  // Trimmed once; the trimmed value is measured and used as the HMAC key.
  const sessionSecret = value('SESSION_SECRET').trim()
  if (sessionSecret !== '') {
    if (sessionSecret === SESSION_SECRET_PLACEHOLDER) {
      problems.push('SESSION_SECRET is the .env.example placeholder')
    } else if (Buffer.byteLength(sessionSecret, 'utf8') < MIN_SECRET_BYTES) {
      problems.push(`SESSION_SECRET is under ${MIN_SECRET_BYTES} bytes`)
    }
  }

  const appOrigins: Array<string> = []
  if (value('APP_ORIGINS').trim() !== '') {
    const entries = listEntries(value('APP_ORIGINS'))
    if (entries.length === 0) problems.push('APP_ORIGINS has no entries')
    entries.forEach((entry, index) => {
      const origin = parseOrigin(entry)
      if (origin) appOrigins.push(origin)
      else {
        problems.push(
          `APP_ORIGINS entry ${index + 1} is not an origin (http(s)://host[:port], no credentials, path, query or hash)`,
        )
      }
    })
  }

  const saveRoots: Array<string> = []
  if (value('SAVE_ROOTS').trim() !== '') {
    const entries = listEntries(value('SAVE_ROOTS'))
    if (entries.length === 0) problems.push('SAVE_ROOTS has no entries')
    entries.forEach((entry, index) => {
      const root = parseSaveRoot(entry)
      if (root) saveRoots.push(root)
      else {
        problems.push(
          `SAVE_ROOTS entry ${index + 1} is not an absolute path below / without empty, "." or ".." segments`,
        )
      }
    })
  }

  if (problems.length > 0) return { ok: false, problems }

  const configDir = value('CONFIG_DIR').trim()
  return {
    ok: true,
    env: {
      qbitUrl,
      qbitUsername: value('QBIT_USERNAME'),
      qbitPassword: value('QBIT_PASSWORD'),
      sessionSecret,
      appOrigins,
      allowedHosts: [
        ...new Set(appOrigins.map((origin) => new URL(origin).host)),
      ],
      saveRoots,
      configDir: configDir === '' ? DEFAULT_CONFIG_DIR : configDir,
    },
  }
}

export const INVALID_ENV_MESSAGE =
  'Environment is invalid; see the startup log for which variable.'

let cached: ParseEnvResult | undefined

/** Parsed `process.env`, read once. Throws a fixed message when invalid. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env)
  if (!cached.ok) throw new Error(INVALID_ENV_MESSAGE)
  return cached.env
}

/** Tests only: forget the cached parse so a stubbed env is read again. */
export function resetEnvCache(): void {
  cached = undefined
}

export interface StartupCheckOptions {
  source: EnvSource
  exit: (code: number) => void
  version: string
  commit: string
  isPrerender: boolean
  isDev: boolean
  logger?: Logger
}

export function runStartupCheck(
  options: StartupCheckOptions,
): ParseEnvResult | null {
  // The build's SPA prerender boots the server without app env.
  if (options.isPrerender) return null
  const logger =
    options.logger ??
    createLogger({ secrets: () => envSecrets(options.source) })
  const result = parseEnv(options.source)
  if (!result.ok) {
    logger.error('startup_env_invalid', { problems: result.problems })
    // In dev, exiting makes Nitro restart its worker in a loop; log only.
    if (!options.isDev) options.exit(1)
    return result
  }
  logger.info('startup', { version: options.version, commit: options.commit })
  return result
}
