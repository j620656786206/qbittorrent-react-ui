import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLogger } from '#/server/log'
import {
  DEFAULT_CONFIG_DIR,
  INVALID_ENV_MESSAGE,
  REQUIRED_ENV,
  SESSION_SECRET_PLACEHOLDER,
  getEnv,
  parseEnv,
  resetEnvCache,
  runStartupCheck,
} from './index'
import type { EnvSource } from './index'

const SECRET = 'a'.repeat(44)
const VALID: EnvSource = {
  QBIT_URL: 'http://qbit.test.invalid:8080',
  QBIT_USERNAME: 'fake-user',
  QBIT_PASSWORD: 'fake-password-1',
  SESSION_SECRET: SECRET,
  APP_ORIGINS: 'http://nas.example:3000, https://torrent.example.com',
  SAVE_ROOTS: '/downloads,/media/tv/',
}

function startup(
  source: EnvSource,
  extra: { isDev?: boolean; isPrerender?: boolean } = {},
) {
  const lines: Array<string> = []
  const exit = vi.fn()
  const result = runStartupCheck({
    source,
    exit,
    version: '0.1.0',
    commit: 'unknown',
    isPrerender: extra.isPrerender ?? false,
    isDev: extra.isDev ?? false,
    logger: createLogger({
      write: (line) => lines.push(line),
      secrets: () => [],
    }),
  })
  return { result, exit, lines, output: lines.join('') }
}

function expectNoValues(output: string, source: EnvSource) {
  for (const value of Object.values(source)) {
    if (value && value.length >= 3) expect(output).not.toContain(value)
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
  resetEnvCache()
})

describe('parseEnv', () => {
  it('parses a valid env and defaults CONFIG_DIR to /config', () => {
    const result = parseEnv(VALID)
    if (!result.ok) throw new Error(result.problems.join())
    expect(result.env.appOrigins).toEqual([
      'http://nas.example:3000',
      'https://torrent.example.com',
    ])
    expect(result.env.allowedHosts).toEqual([
      'nas.example:3000',
      'torrent.example.com',
    ])
    expect(result.env.saveRoots).toEqual(['/downloads', '/media/tv'])
    expect(result.env.configDir).toBe(DEFAULT_CONFIG_DIR)
    expect(result.env.sessionSecret).toBe(SECRET)
  })

  it('keeps a given CONFIG_DIR', () => {
    const result = parseEnv({ ...VALID, CONFIG_DIR: './config' })
    expect(result.ok && result.env.configDir).toBe('./config')
  })

  it.each(
    REQUIRED_ENV.flatMap(
      (name) =>
        [
          [name, undefined],
          [name, '  '],
        ] as const,
    ),
  )('refuses %s = %j', (name, value) => {
    const result = parseEnv({ ...VALID, [name]: value })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.problems.join('\n')).toContain(name)
  })

  it.each([
    ['too short', 'b'.repeat(31), 'under 32 bytes'],
    ['placeholder', SESSION_SECRET_PLACEHOLDER, 'placeholder'],
  ])('refuses a %s SESSION_SECRET', (_name, value, reason) => {
    const result = parseEnv({ ...VALID, SESSION_SECRET: value })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.problems).toHaveLength(1)
      expect(result.problems[0]).toContain('SESSION_SECRET')
      expect(result.problems[0]).toContain(reason)
      expect(result.problems[0]).not.toContain(value)
    }
  })

  it('counts SESSION_SECRET in UTF-8 bytes', () => {
    // 11 three-byte characters = 33 bytes.
    expect(parseEnv({ ...VALID, SESSION_SECRET: '密'.repeat(11) }).ok).toBe(
      true,
    )
  })

  it.each([
    ['APP_ORIGINS', 'http://nas.example:3000/path'],
    ['APP_ORIGINS', 'nas.example:3000'],
    ['APP_ORIGINS', 'not a url'],
    ['APP_ORIGINS', 'ftp://nas.example'],
    ['SAVE_ROOTS', 'downloads'],
    ['SAVE_ROOTS', '/'],
    ['SAVE_ROOTS', '/downloads/../etc'],
    ['SAVE_ROOTS', '/downloads/./tv'],
    ['SAVE_ROOTS', '/downloads//tv'],
    ['SAVE_ROOTS', '/.'],
    ['APP_ORIGINS', 'http://user:pw@nas.example:3000'],
    ['APP_ORIGINS', 'http://nas.example:3000?x=1'],
    ['APP_ORIGINS', 'http://nas.example:3000#x'],
    ['QBIT_URL', 'qbit.test.invalid'],
    ['QBIT_URL', 'http://user:pw@qbit.test.invalid:8080'],
    ['QBIT_URL', 'http://qbit.test.invalid:8080/api'],
    ['QBIT_URL', 'http://qbit.test.invalid:8080?a=1'],
    ['QBIT_URL', 'http://qbit.test.invalid:8080#frag'],
  ])('refuses %s entry %j', (name, value) => {
    const result = parseEnv({ ...VALID, [name]: value })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.problems.join('\n')).toContain(name)
      if (value.length > 2)
        expect(result.problems.join('\n')).not.toContain(value)
    }
  })
})

describe('parseEnv normalisation', () => {
  it.each([
    ['APP_ORIGINS', ' , ,'],
    ['SAVE_ROOTS', ','],
  ])('%s made only of commas has no entries', (name, value) => {
    const result = parseEnv({ ...VALID, [name]: value })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.problems).toContain(`${name} has no entries`)
  })

  it('trims SESSION_SECRET once and measures the trimmed value', () => {
    const short = parseEnv({
      ...VALID,
      SESSION_SECRET: `  ${'d'.repeat(31)}  `,
    })
    expect(short.ok).toBe(false)
    const placeholder = parseEnv({
      ...VALID,
      SESSION_SECRET: ` ${SESSION_SECRET_PLACEHOLDER}\n`,
    })
    expect(placeholder.ok).toBe(false)
    const padded = parseEnv({ ...VALID, SESSION_SECRET: `  ${SECRET}\n` })
    expect(padded.ok && padded.env.sessionSecret).toBe(SECRET)
  })

  it('stores QBIT_URL without a trailing slash', () => {
    const result = parseEnv({
      ...VALID,
      QBIT_URL: 'http://qbit.test.invalid:8080/',
    })
    expect(result.ok && result.env.qbitUrl).toBe(
      'http://qbit.test.invalid:8080',
    )
  })

  it('accepts non-canonical origins and stores url.origin', () => {
    const result = parseEnv({
      ...VALID,
      APP_ORIGINS:
        'HTTP://NAS.Example:80, https://torrent.example.com:443/, http://nas.example:3000/',
    })
    if (!result.ok) throw new Error(result.problems.join())
    expect(result.env.appOrigins).toEqual([
      'http://nas.example',
      'https://torrent.example.com',
      'http://nas.example:3000',
    ])
    expect(result.env.allowedHosts).toEqual([
      'nas.example',
      'torrent.example.com',
      'nas.example:3000',
    ])
  })
})

describe('getEnv', () => {
  it('parses process.env once', () => {
    for (const [key, value] of Object.entries(VALID))
      vi.stubEnv(key, value ?? '')
    expect(getEnv().qbitUsername).toBe('fake-user')
    vi.stubEnv('QBIT_USERNAME', 'changed')
    expect(getEnv().qbitUsername).toBe('fake-user')
  })

  it('throws a fixed message without values when invalid', () => {
    for (const [key, value] of Object.entries(VALID))
      vi.stubEnv(key, value ?? '')
    vi.stubEnv('SESSION_SECRET', 'short')
    expect(() => getEnv()).toThrow(INVALID_ENV_MESSAGE)
  })
})

describe('runStartupCheck', () => {
  it('logs startup with version and commit on a valid env', () => {
    const { exit, lines } = startup(VALID)
    expect(exit).not.toHaveBeenCalled()
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0])).toMatchObject({
      level: 'info',
      event: 'startup',
      version: '0.1.0',
      commit: 'unknown',
    })
  })

  it.each(REQUIRED_ENV)(
    'missing %s: one error line naming it, exit(1), no values',
    (name) => {
      const source = { ...VALID, [name]: '' }
      const { exit, lines, output } = startup(source)
      expect(exit).toHaveBeenCalledWith(1)
      expect(lines).toHaveLength(1)
      const line = JSON.parse(lines[0]) as {
        level: string
        problems: Array<string>
      }
      expect(line.level).toBe('error')
      expect(line.problems.join()).toContain(name)
      expectNoValues(output, source)
    },
  )

  it.each([
    ['too short', 'c'.repeat(20), 'under 32 bytes'],
    ['placeholder', SESSION_SECRET_PLACEHOLDER, 'placeholder'],
  ])('weak secret (%s): exit(1) with the reason', (_name, value, reason) => {
    const source = { ...VALID, SESSION_SECRET: value }
    const { exit, output } = startup(source)
    expect(exit).toHaveBeenCalledWith(1)
    expect(output).toContain('SESSION_SECRET')
    expect(output).toContain(reason)
    expectNoValues(output, source)
  })

  it('bad list format: exit(1), no values', () => {
    const source = {
      ...VALID,
      APP_ORIGINS: 'http://nas.example:3000/x',
      SAVE_ROOTS: '/a/../b',
    }
    const { exit, output } = startup(source)
    expect(exit).toHaveBeenCalledWith(1)
    expect(output).toContain('APP_ORIGINS')
    expect(output).toContain('SAVE_ROOTS')
    expectNoValues(output, source)
  })

  it('skips the check during the build prerender', () => {
    const { result, exit, lines } = startup({}, { isPrerender: true })
    expect(result).toBeNull()
    expect(exit).not.toHaveBeenCalled()
    expect(lines).toHaveLength(0)
  })

  it('in dev logs problems but does not exit', () => {
    const { exit, output } = startup(
      { ...VALID, QBIT_URL: '' },
      { isDev: true },
    )
    expect(exit).not.toHaveBeenCalled()
    expect(output).toContain('QBIT_URL')
  })
})
