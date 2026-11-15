// AD-16 / AR-36: the only logger. One JSON line per call on stdout.
// Never pass request bodies, full headers, Request/Response objects or env.

export type LogLevel = 'info' | 'warn' | 'error'
export type LogFields = Record<string, unknown>

export interface Logger {
  info: (event: string, fields?: LogFields) => void
  warn: (event: string, fields?: LogFields) => void
  error: (event: string, fields?: LogFields) => void
}

export interface LoggerOptions {
  /** Receives one finished line (with trailing newline). */
  write?: (line: string) => void
  /** Raw values to scrub from every string; read on each call. */
  secrets?: () => ReadonlyArray<string>
}

export const MASKED = '[masked]'
export const OMITTED = '[omitted]'

const MAX_DEPTH = 8
// Scrubbing a 1 to 3 character value would mangle every log line; such values
// are still masked by key.
const MIN_SCRUB_LENGTH = 4
const RESERVED_KEYS = new Set(['time', 'level', 'event'])

export function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase()
  const compact = k.replace(/[-_]/g, '')
  return (
    k === 'sid' ||
    k.startsWith('qbit_') ||
    k.includes('password') ||
    k.includes('cookie') ||
    k.includes('session') ||
    k.includes('secret') ||
    k.includes('token') ||
    k.includes('authorization') ||
    k.includes('credential') ||
    compact.includes('apikey')
  )
}

/**
 * Values of the current env that must never appear in a log line. The
 * username is masked by key only: scrubbing a value like `admin` as a
 * substring would mangle ordinary words.
 */
export function envSecrets(
  env: NodeJS.ProcessEnv = process.env,
): Array<string> {
  const values = [env.QBIT_PASSWORD, env.SESSION_SECRET]
  const url = env.QBIT_URL?.trim()
  if (url) {
    values.push(url, url.replace(/\/+$/, ''))
    try {
      const parsed = new URL(url)
      values.push(parsed.origin, parsed.host, parsed.hostname)
    } catch {
      // Not a URL: the raw value above is enough.
    }
  }
  return values.filter((value): value is string => typeof value === 'string')
}

function scrub(text: string, secrets: ReadonlyArray<string>): string {
  // Longest first, so a URL is masked whole before its host.
  const ordered = secrets
    .filter((secret) => secret.length >= MIN_SCRUB_LENGTH)
    .sort((a, b) => b.length - a.length)
  let out = text
  for (const secret of ordered) out = out.split(secret).join(MASKED)
  return out
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const proto: unknown = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function isOmittedObject(value: object): boolean {
  return (
    (typeof Headers !== 'undefined' && value instanceof Headers) ||
    (typeof Request !== 'undefined' && value instanceof Request) ||
    (typeof Response !== 'undefined' && value instanceof Response)
  )
}

function sanitize(
  value: unknown,
  secrets: ReadonlyArray<string>,
  depth: number,
  seen: WeakSet<object>,
): unknown {
  if (typeof value === 'string') return scrub(value, secrets)
  if (
    value === null ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }
  if (typeof value === 'bigint') return value.toString()
  if (typeof value !== 'object') return undefined
  if (isOmittedObject(value)) return OMITTED
  if (value instanceof Date) return value.toISOString()
  if (value instanceof URL) return scrub(value.href, secrets)
  if (depth >= MAX_DEPTH) return OMITTED
  if (seen.has(value)) return '[circular]'
  seen.add(value)
  if (value instanceof Error) {
    const error: Record<string, unknown> = {
      name: value.name,
      message: scrub(value.message, secrets),
    }
    if (value.cause !== undefined) {
      error.cause = sanitize(value.cause, secrets, depth + 1, seen)
    }
    return error
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item, secrets, depth + 1, seen))
  }
  if (!isPlainObject(value)) return OMITTED
  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    out[key] = isSensitiveKey(key)
      ? MASKED
      : sanitize(item, secrets, depth + 1, seen)
  }
  return out
}

export function formatLine(
  level: LogLevel,
  event: string,
  fields: LogFields | undefined,
  secrets: ReadonlyArray<string>,
  now: Date = new Date(),
): string {
  const line: Record<string, unknown> = {
    time: now.toISOString(),
    level,
    event: scrub(event, secrets),
  }
  if (fields) {
    const clean = sanitize(fields, secrets, 0, new WeakSet())
    if (clean && typeof clean === 'object' && !Array.isArray(clean)) {
      for (const [key, item] of Object.entries(clean)) {
        if (!RESERVED_KEYS.has(key)) line[key] = item
      }
    }
  }
  return `${JSON.stringify(line)}\n`
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const write =
    options.write ?? ((line: string) => void process.stdout.write(line))
  const secrets = options.secrets ?? (() => envSecrets())
  const emit = (level: LogLevel) => (event: string, fields?: LogFields) => {
    try {
      write(formatLine(level, event, fields, secrets()))
    } catch {
      // Logging must never break a request.
    }
  }
  return { info: emit('info'), warn: emit('warn'), error: emit('error') }
}

export const log: Logger = createLogger()
