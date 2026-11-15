import { describe, expect, it } from 'vitest'
import {
  MASKED,
  OMITTED,
  createLogger,
  envSecrets,
  isSensitiveKey,
} from './index'

function capture(secrets: Array<string> = []) {
  const lines: Array<string> = []
  const logger = createLogger({
    write: (line) => lines.push(line),
    secrets: () => secrets,
  })
  const parsed = () =>
    lines.map((line) => JSON.parse(line) as Record<string, unknown>)
  return { logger, lines, parsed }
}

describe('log (AR-36)', () => {
  it('writes one JSON line with time, level and event', () => {
    const { logger, lines, parsed } = capture()
    logger.info('hello', { count: 2 })
    expect(lines).toHaveLength(1)
    expect(lines[0].endsWith('\n')).toBe(true)
    expect(lines[0].trimEnd()).not.toContain('\n')
    const [line] = parsed()
    expect(line.level).toBe('info')
    expect(line.event).toBe('hello')
    expect(line.count).toBe(2)
    expect(new Date(line.time as string).toISOString()).toBe(line.time)
  })

  it.each(['info', 'warn', 'error'] as const)('level %s', (level) => {
    const { logger, parsed } = capture()
    logger[level]('x')
    expect(parsed()[0].level).toBe(level)
  })

  it('masks every sensitive key, recursively and case-insensitively', () => {
    const { logger, lines, parsed } = capture()
    logger.info('x', {
      password: 'pw-1',
      cookie: 'c-1',
      'set-cookie': 'sc-1',
      sid: 'sid-1',
      session: { iat: 1 },
      rt_session: 'rt-1',
      QBIT_URL: 'http://u-1',
      QBIT_PASSWORD: 'qp-1',
      SESSION_SECRET: 'ss-1',
      nested: { password: 'pw-2', list: [{ Cookie: 'c-2' }] },
      accessToken: 't-1',
      kept: 'visible',
    })
    const [line] = parsed()
    for (const key of [
      'password',
      'cookie',
      'set-cookie',
      'sid',
      'session',
      'rt_session',
      'QBIT_URL',
      'QBIT_PASSWORD',
      'SESSION_SECRET',
      'accessToken',
    ]) {
      expect(line[key]).toBe(MASKED)
    }
    expect(line.nested).toEqual({
      password: MASKED,
      list: [{ Cookie: MASKED }],
    })
    expect(line.kept).toBe('visible')
    for (const raw of [
      'pw-1',
      'pw-2',
      'c-1',
      'c-2',
      'sc-1',
      'sid-1',
      'rt-1',
      'u-1',
      'qp-1',
      'ss-1',
      't-1',
    ]) {
      expect(lines[0]).not.toContain(raw)
    }
  })

  it('omits Headers, Request and Response objects', () => {
    const { logger, lines, parsed } = capture()
    const request = new Request('http://x.test/', {
      headers: { cookie: 'c=1' },
    })
    logger.warn('x', {
      headers: new Headers({ cookie: 'secret-cookie' }),
      request,
      response: new Response('body-text'),
    })
    const [line] = parsed()
    expect(line.headers).toBe(OMITTED)
    expect(line.request).toBe(OMITTED)
    expect(line.response).toBe(OMITTED)
    expect(lines[0]).not.toContain('secret-cookie')
    expect(lines[0]).not.toContain('body-text')
  })

  it('scrubs secret values from strings and error messages', () => {
    const secrets = envSecrets({
      QBIT_URL: 'http://qbit.test.invalid:8080',
      QBIT_PASSWORD: 'hunter22',
      SESSION_SECRET: 'abcdefghijklmnopqrstuvwxyz012345',
    })
    const { logger, lines, parsed } = capture(secrets)
    logger.error('x', {
      detail: 'login with hunter22 to http://qbit.test.invalid:8080/api',
      error: new Error('connect ECONNREFUSED http://qbit.test.invalid:8080'),
      other: 'key abcdefghijklmnopqrstuvwxyz012345',
      host: 'getaddrinfo ENOTFOUND qbit.test.invalid',
    })
    expect(lines[0]).not.toContain('hunter22')
    expect(lines[0]).not.toContain('qbit.test.invalid')
    expect(lines[0]).not.toContain('abcdefghijklmnopqrstuvwxyz012345')
    const [line] = parsed()
    expect(line.error).toEqual({
      name: 'Error',
      message: `connect ECONNREFUSED ${MASKED}`,
    })
  })

  it('does not let fields overwrite time, level or event', () => {
    const { logger, parsed } = capture()
    logger.info('real', { event: 'fake', level: 'fake', time: 'fake' })
    const [line] = parsed()
    expect(line.event).toBe('real')
    expect(line.level).toBe('info')
    expect(line.time).not.toBe('fake')
  })

  it('survives circular objects', () => {
    const { logger, parsed } = capture()
    const a: Record<string, unknown> = { name: 'a' }
    a.self = a
    logger.info('x', { a })
    expect(parsed()[0].a).toEqual({ name: 'a', self: '[circular]' })
  })

  it('isSensitiveKey', () => {
    expect(isSensitiveKey('Set-Cookie')).toBe(true)
    expect(isSensitiveKey('qbit_anything')).toBe(true)
    expect(isSensitiveKey('SID')).toBe(true)
    expect(isSensitiveKey('side')).toBe(false)
    expect(isSensitiveKey('version')).toBe(false)
  })
})

describe('log hardening', () => {
  it('keeps a sanitized Error.cause, recursively and depth-limited', () => {
    const secrets = envSecrets({ QBIT_URL: 'http://qbit.test.invalid:8080' })
    const { logger, lines, parsed } = capture(secrets)
    const root = new Error('connect ECONNREFUSED qbit.test.invalid:8080')
    const error = new TypeError('fetch failed', {
      cause: new Error('wrapped', { cause: root }),
    })
    logger.error('x', { error })
    expect(parsed()[0].error).toEqual({
      name: 'TypeError',
      message: 'fetch failed',
      cause: {
        name: 'Error',
        message: 'wrapped',
        cause: { name: 'Error', message: `connect ECONNREFUSED ${MASKED}` },
      },
    })
    expect(lines[0]).not.toContain('qbit.test.invalid')
  })

  it('stops at the depth limit and on a cause cycle', () => {
    const { logger, parsed } = capture()
    let deep = new Error('e0')
    for (let i = 1; i < 20; i += 1) deep = new Error(`e${i}`, { cause: deep })
    const cyclic = new Error('a')
    cyclic.cause = cyclic
    logger.error('x', { deep, cyclic })
    const line = parsed()[0]
    expect(JSON.stringify(line.deep)).toContain(OMITTED)
    expect(line.cyclic).toEqual({
      name: 'Error',
      message: 'a',
      cause: '[circular]',
    })
  })

  it.each([
    'authorization',
    'Authorization',
    'apiKey',
    'api_key',
    'x-api-key',
    'credential',
    'qbitCredentials',
  ])('masks key %s', (key) => {
    const { logger, lines, parsed } = capture()
    logger.info('x', { [key]: 'value-123' })
    expect(parsed()[0][key]).toBe(MASKED)
    expect(lines[0]).not.toContain('value-123')
  })

  it('does not substring-scrub the username but still masks it by key', () => {
    const env = {
      QBIT_URL: 'http://qbit.test.invalid:8080',
      QBIT_USERNAME: 'admin',
      QBIT_PASSWORD: 'hunter22',
    }
    expect(envSecrets(env)).not.toContain('admin')
    const { logger, parsed } = capture(envSecrets(env))
    logger.info('x', { note: 'administrator panel', QBIT_USERNAME: 'admin' })
    expect(parsed()[0]).toMatchObject({
      note: 'administrator panel',
      QBIT_USERNAME: MASKED,
    })
  })

  it('scrubs longer secrets first', () => {
    // If the host went first, the URL would leave "http://[masked]:8080".
    const { logger, parsed } = capture([
      'qbit.test.invalid',
      'http://qbit.test.invalid:8080',
    ])
    logger.info('x', { detail: 'GET http://qbit.test.invalid:8080/api' })
    expect(parsed()[0].detail).toBe(`GET ${MASKED}/api`)
  })
})
