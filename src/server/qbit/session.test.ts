import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetEnvCache } from '#/server/env'
import {
  QBIT_DEADLINE_MS,
  RELOGIN_COOLDOWN_MS,
  createQbitSession,
} from '#/server/qbit/session'
import {
  FAKE_PASSWORD,
  FAKE_QBIT_ORIGIN,
  FAKE_RESOLVED_ADDRESS,
  FAKE_USERNAME,
  captureStdout,
  deferred,
  fakeQbit,
  fetchFailed,
  jsonResponse,
  loginOk,
} from '#/server/qbit/testing'
import type { FakeQbitRoutes } from '#/server/qbit/testing'

// Spec 1.5 rows Q1 to Q9 plus the review fixes (one deadline per send, the
// re-login cooldown, login 401, the login's own deadline, no redirects): the
// in-memory qBittorrent session.

const LOGIN = '/api/v2/auth/login'
const MAINDATA = '/api/v2/sync/maindata'
const OLD = 'QBT_SID_8080=old'
const NEW = 'QBT_SID_8080=new'

const forbidden = () => new Response('Forbidden', { status: 403 })
const okBody = () => jsonResponse({ rid: 1 })

function setup(routes: FakeQbitRoutes = {}) {
  const qbit = fakeQbit(routes)
  let clock = 0
  const session = createQbitSession({
    baseUrl: FAKE_QBIT_ORIGIN,
    username: FAKE_USERNAME,
    password: FAKE_PASSWORD,
    fetch: qbit.fetch,
    now: () => clock,
  })
  const advance = (ms: number) => {
    clock += ms
  }
  const sync = () =>
    session.send(MAINDATA, {
      method: 'GET',
      query: new URLSearchParams({ rid: '0' }),
    })
  return { ...qbit, session, sync, advance }
}

/** Login answers OLD first, then NEW (or what `later` returns). */
function loginSequence(
  later: () => Response | Promise<Response> = () => loginOk(NEW),
) {
  let logins = 0
  return () => {
    logins += 1
    return logins === 1 ? loginOk(OLD) : later()
  }
}

const failure = (code: string) =>
  expect.objectContaining({ name: 'ServerFailure', code })

let out: ReturnType<typeof captureStdout>

beforeEach(() => {
  vi.stubEnv('QBIT_URL', FAKE_QBIT_ORIGIN)
  vi.stubEnv('QBIT_PASSWORD', FAKE_PASSWORD)
  resetEnvCache()
  out = captureStdout()
})

afterEach(() => {
  // AD-16: no line ever names the qBittorrent host, the password or a cookie.
  for (const line of out.lines) {
    expect(line).not.toContain('qbit.test.invalid')
    expect(line).not.toContain(FAKE_PASSWORD)
    expect(line).not.toContain('QBT_SID')
    expect(line).not.toContain(FAKE_RESOLVED_ADDRESS)
  }
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  resetEnvCache()
})

describe('qBittorrent session', () => {
  it('Q1 first login: form body, then the cookie, Origin and Referer on maindata', async () => {
    const { sync, calls } = setup({ maindata: okBody })
    const response = await sync()
    expect(response.status).toBe(200)
    expect(calls.map((call) => [call.method, call.path])).toEqual([
      ['POST', LOGIN],
      ['GET', MAINDATA],
    ])
    const [login, maindata] = calls
    expect(login.body).toBe(
      new URLSearchParams({
        username: FAKE_USERNAME,
        password: FAKE_PASSWORD,
      }).toString(),
    )
    expect([...new URLSearchParams(login.body).keys()]).toEqual([
      'username',
      'password',
    ])
    expect(login.headers.get('cookie')).toBeNull()
    expect(maindata.headers.get('cookie')).toBe('QBT_SID_8080=abc')
    expect([...maindata.query.keys()]).toEqual(['rid'])
    for (const call of calls) {
      expect(call.headers.get('origin')).toBe(FAKE_QBIT_ORIGIN)
      expect(call.headers.get('referer')).toBe(`${FAKE_QBIT_ORIGIN}/`)
    }
    expect(out.events('qbit_login')).toEqual([
      expect.objectContaining({ level: 'info', reason: 'initial' }),
    ])
  })

  it('Q1 keeps a non-default cookie name as qBittorrent sent it', async () => {
    const { sync, calls } = setup({
      login: () => loginOk('MY_COOKIE=v=1'),
      maindata: okBody,
    })
    await sync()
    expect(calls[1].headers.get('cookie')).toBe('MY_COOKIE=v=1')
  })

  it('Q1 later calls reuse the cookie without logging in again', async () => {
    const { sync, count } = setup({ maindata: okBody })
    await sync()
    await sync()
    expect(count(LOGIN)).toBe(1)
    expect(count(MAINDATA)).toBe(2)
  })

  it('Q2 Ok. without Set-Cookie: qbit_rejected, breaker stays closed', async () => {
    const { sync, count } = setup({
      login: () => new Response('Ok.'),
      maindata: okBody,
    })
    await expect(sync()).rejects.toEqual(failure('qbit_rejected'))
    expect(out.events('qbit_login_no_cookie')).toHaveLength(1)
    expect(out.events('qbit_breaker_open')).toHaveLength(0)
    await expect(sync()).rejects.toEqual(failure('qbit_rejected'))
    expect(count(LOGIN)).toBe(2)
    expect(count(MAINDATA)).toBe(0)
  })

  it('login answered 401 (Origin, Referer or Host check failed): breaker opens as login_unauthorized', async () => {
    const { sync, count } = setup({
      login: () => new Response('Unauthorized', { status: 401 }),
      maindata: okBody,
    })
    await expect(sync()).rejects.toEqual(failure('qbit_auth_failed'))
    expect(out.events('qbit_breaker_open')).toEqual([
      expect.objectContaining({ level: 'error', reason: 'login_unauthorized' }),
    ])
    await expect(sync()).rejects.toEqual(failure('qbit_auth_failed'))
    expect(count(LOGIN)).toBe(1)
  })

  it.each([
    ['502', () => new Response('Bad Gateway', { status: 502 }), 502],
    ['an unexpected 2xx body', () => new Response('Hmm.'), 200],
  ])('login answered %s', async (_name, answer, status) => {
    const { sync, count } = setup({ login: answer, maindata: okBody })
    await expect(sync()).rejects.toEqual(failure('qbit_rejected'))
    expect(out.events('qbit_breaker_open')).toHaveLength(0)
    expect(out.events('qbit_bad_response')).toEqual([
      expect.objectContaining({ path: LOGIN, status }),
    ])
    await expect(sync()).rejects.toEqual(failure('qbit_rejected'))
    expect(count(LOGIN)).toBe(2)
    expect(count(MAINDATA)).toBe(0)
  })

  it('Q3 ten concurrent 403s share one re-login and each resends once', async () => {
    const relogin = deferred<Response>()
    let valid = OLD
    const { sync, count, calls } = setup({
      login: loginSequence(() => relogin.promise),
      maindata: (call) =>
        call.headers.get('cookie') === valid ? okBody() : forbidden(),
    })
    await sync() // stores OLD
    valid = NEW // qBittorrent forgets OLD
    const before = out.events('qbit_login').length

    const results = Array.from({ length: 10 }, () => sync())
    await vi.waitFor(() => {
      expect(count(MAINDATA)).toBe(11)
      expect(count(LOGIN)).toBe(2)
    })
    relogin.resolve(loginOk(NEW))
    const settled = await Promise.allSettled(results)
    expect(settled.map((result) => result.status)).toEqual(
      Array(10).fill('fulfilled'),
    )
    expect(count(LOGIN)).toBe(2)
    expect(count(MAINDATA)).toBe(21)
    const resends = calls.slice(-10)
    expect(resends.map((call) => call.headers.get('cookie'))).toEqual(
      Array(10).fill(NEW),
    )
    expect(out.events('qbit_login').slice(before)).toEqual([
      expect.objectContaining({ reason: 'expired' }),
    ])
  })

  it('Q4 a stale 403 resends with the newer cookie without logging in', async () => {
    let valid = OLD
    let holdNext = false
    const release = deferred<undefined>()
    const { sync, count, calls } = setup({
      login: loginSequence(),
      maindata: async (call) => {
        if (holdNext) {
          holdNext = false
          await release.promise
        }
        return call.headers.get('cookie') === valid ? okBody() : forbidden()
      },
    })
    await sync() // stores OLD
    valid = NEW
    holdNext = true
    const slow = sync() // sent with OLD, answer held
    await vi.waitFor(() => expect(count(MAINDATA)).toBe(2))
    await sync() // 403, re-login stores NEW, resend ok
    expect(count(LOGIN)).toBe(2)
    release.resolve(undefined) // the held answer is a 403 for OLD
    await expect(slow).resolves.toMatchObject({ status: 200 })
    expect(count(LOGIN)).toBe(2)
    expect(calls.at(-1)?.headers.get('cookie')).toBe(NEW)
  })

  it('Q5 403 again after a fresh re-login: qbit_rejected, no second login, breaker closed', async () => {
    let primed = false
    const { sync, count } = setup({
      login: loginSequence(),
      maindata: () => {
        if (!primed) {
          primed = true
          return okBody()
        }
        return forbidden()
      },
    })
    await sync()
    await expect(sync()).rejects.toEqual(failure('qbit_rejected'))
    expect(count(LOGIN)).toBe(2)
    expect(out.events('qbit_bad_response')).toEqual([
      expect.objectContaining({ path: MAINDATA, status: 403 }),
    ])
    expect(out.events('qbit_breaker_open')).toHaveLength(0)
    // The refused cookie is gone: inside the cooldown nothing is sent.
    const before = count(MAINDATA)
    await expect(sync()).rejects.toEqual(failure('qbit_rejected'))
    expect(count(MAINDATA)).toBe(before)
    expect(count(LOGIN)).toBe(2)
  })

  it('Q5 403 right after the initial login: qbit_rejected with one login', async () => {
    const { sync, count } = setup({ maindata: forbidden })
    await expect(sync()).rejects.toEqual(failure('qbit_rejected'))
    expect(count(LOGIN)).toBe(1)
  })

  it('after a 403 that follows a fresh login: the cookie is dropped, nothing is sent for 60 s, then one login', async () => {
    let primed = false
    let healed = false
    const { sync, count, calls, advance } = setup({
      login: loginSequence(() => loginOk(NEW)),
      maindata: (call) => {
        if (healed && call.headers.get('cookie') === NEW) return okBody()
        if (primed) return forbidden()
        primed = true
        return okBody()
      },
    })
    await sync() // stores OLD
    await expect(sync()).rejects.toEqual(failure('qbit_rejected')) // re-login, 403 again
    expect(count(LOGIN)).toBe(2)

    advance(RELOGIN_COOLDOWN_MS - 1)
    const maindataBefore = count(MAINDATA)
    await expect(sync()).rejects.toEqual(failure('qbit_rejected'))
    expect(count(LOGIN)).toBe(2)
    expect(count(MAINDATA)).toBe(maindataBefore)

    // After the cooldown: exactly one login, and its cookie is what is sent.
    advance(1)
    await expect(sync()).rejects.toEqual(failure('qbit_rejected'))
    expect(count(LOGIN)).toBe(3)
    expect(count(MAINDATA)).toBe(maindataBefore + 1)
    expect(out.events('qbit_breaker_open')).toHaveLength(0)

    // qBittorrent accepts again: after the next cooldown it recovers.
    healed = true
    advance(RELOGIN_COOLDOWN_MS)
    await expect(sync()).resolves.toMatchObject({ status: 200 })
    expect(count(LOGIN)).toBe(4)
    expect(calls.at(-1)?.headers.get('cookie')).toBe(NEW)
    await expect(sync()).resolves.toMatchObject({ status: 200 })
    expect(count(LOGIN)).toBe(4)
  })

  it('a 403 after a fresh login keeps a newer cookie another call stored', async () => {
    let holdNext = true
    const release = deferred<undefined>()
    const { sync, count } = setup({
      login: loginSequence(),
      maindata: async (call) => {
        if (holdNext) {
          holdNext = false
          await release.promise
        }
        // qBittorrent only knows NEW: OLD is refused from the start.
        return call.headers.get('cookie') === NEW ? okBody() : forbidden()
      },
    })
    const first = sync() // logs in (OLD), its answer is held
    await vi.waitFor(() => expect(count(MAINDATA)).toBe(1))
    await sync() // 403 for OLD, re-login stores NEW, resend ok
    expect(count(LOGIN)).toBe(2)
    release.resolve(undefined) // the held answer: 403 right after a login
    await expect(first).rejects.toEqual(failure('qbit_rejected'))
    // NEW survives the cooldown that started: it is still sent.
    await expect(sync()).resolves.toMatchObject({ status: 200 })
    expect(count(LOGIN)).toBe(2)
  })

  it.each([
    ['Q6 Fails.', () => new Response('Fails.'), 'login_failed'],
    ['Q7 login 403', forbidden, 'login_forbidden'],
  ])(
    '%s on the first login opens the breaker until a new instance',
    async (_name, answer, reason) => {
      const routes = { login: answer, maindata: okBody }
      const { sync, spy, count } = setup(routes)
      await expect(sync()).rejects.toEqual(failure('qbit_auth_failed'))
      for (let i = 0; i < 5; i += 1) {
        await expect(sync()).rejects.toEqual(failure('qbit_auth_failed'))
      }
      expect(spy).toHaveBeenCalledTimes(1)
      expect(count(LOGIN)).toBe(1)
      expect(out.events('qbit_breaker_open')).toEqual([
        expect.objectContaining({ level: 'error', reason }),
      ])

      const fresh = setup(routes)
      await expect(fresh.sync()).rejects.toEqual(failure('qbit_auth_failed'))
      expect(fresh.count(LOGIN)).toBe(1)
    },
  )

  it.each([
    ['Q6 Fails.', () => new Response('Fails.'), 'login_failed'],
    ['Q7 login 403', forbidden, 'login_forbidden'],
  ])('%s on a re-login opens the breaker', async (_name, answer, reason) => {
    let primed = false
    const { sync, spy } = setup({
      login: loginSequence(answer),
      maindata: () => {
        if (primed) return forbidden()
        primed = true
        return okBody()
      },
    })
    await sync()
    await expect(sync()).rejects.toEqual(failure('qbit_auth_failed'))
    const calls = spy.mock.calls.length
    for (let i = 0; i < 5; i += 1) {
      await expect(sync()).rejects.toEqual(failure('qbit_auth_failed'))
    }
    expect(spy).toHaveBeenCalledTimes(calls)
    expect(out.events('qbit_breaker_open')).toEqual([
      expect.objectContaining({ reason }),
    ])
  })

  it('Q6 every caller waiting on a failed login gets qbit_auth_failed, and no one logs in again', async () => {
    const answer = deferred<Response>()
    const { sync, count } = setup({ login: () => answer.promise })
    const waiting = Array.from({ length: 3 }, () => sync())
    answer.resolve(new Response('Fails.'))
    for (const result of await Promise.allSettled(waiting)) {
      expect(result).toEqual({
        status: 'rejected',
        reason: failure('qbit_auth_failed'),
      })
    }
    expect(count(LOGIN)).toBe(1)
    expect(out.events('qbit_breaker_open')).toHaveLength(1)
  })

  it.each([
    ['login', 'ECONNREFUSED'],
    ['login', 'ENOTFOUND'],
    ['maindata', 'ECONNREFUSED'],
    ['maindata', 'ENOTFOUND'],
  ] as const)(
    'Q8 %s unreachable (%s): qbit_unreachable, breaker unaffected',
    async (route, code) => {
      let down = true
      const reject = () => {
        if (down) return Promise.reject(fetchFailed(code))
        return route === 'login' ? loginOk() : okBody()
      }
      const { sync, count } = setup(
        route === 'login'
          ? { login: reject, maindata: okBody }
          : { maindata: reject },
      )
      await expect(sync()).rejects.toEqual(failure('qbit_unreachable'))
      const path = route === 'login' ? LOGIN : MAINDATA
      // The cause code only, never the cause message (it names the address).
      const lines = out.events('qbit_unreachable')
      expect(lines).toEqual([
        expect.objectContaining({ level: 'warn', path, cause: code }),
      ])
      expect(Object.keys(lines[0]).sort()).toEqual(
        ['cause', 'event', 'level', 'path', 'time'].sort(),
      )
      down = false
      await expect(sync()).resolves.toMatchObject({ status: 200 })
      expect(count(LOGIN)).toBe(route === 'login' ? 2 : 1)
    },
  )

  it.each(['login', 'maindata'] as const)(
    'Q9 %s never answers: timeout at the 25 s deadline, signal aborted, breaker unaffected',
    async (route) => {
      vi.useFakeTimers()
      let hang = true
      const signals: Array<AbortSignal> = []
      const answer =
        (normal: () => Response) => (call: { signal: AbortSignal | null }) => {
          if (!hang) return normal()
          const signal = call.signal as AbortSignal
          signals.push(signal)
          return new Promise<Response>((_resolve, reject) => {
            signal.addEventListener('abort', () =>
              reject(signal.reason as Error),
            )
          })
        }
      const { sync } = setup(
        route === 'login'
          ? { login: answer(() => loginOk()), maindata: okBody }
          : { maindata: answer(okBody) },
      )
      const pending = sync()
      const settled = pending.then(
        () => 'resolved',
        (error: unknown) => error,
      )
      await vi.advanceTimersByTimeAsync(QBIT_DEADLINE_MS - 1)
      expect(signals[0].aborted).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      expect(await settled).toEqual(failure('timeout'))
      expect(signals[0].aborted).toBe(true)
      expect(out.events('qbit_unreachable')).toHaveLength(0)
      hang = false
      await expect(sync()).resolves.toMatchObject({ status: 200 })
    },
  )

  it('one deadline per send: a slow login leaves the request only the rest', async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | null = null
    const { sync } = setup({
      login: () =>
        new Promise<Response>((resolve) => {
          setTimeout(() => resolve(loginOk()), 20_000)
        }),
      maindata: (call) => {
        signal = call.signal
        return new Promise<Response>((_resolve, reject) => {
          call.signal?.addEventListener('abort', () =>
            reject(new Error('aborted')),
          )
        })
      },
    })
    const settled = sync().then(
      () => 'resolved',
      (error: unknown) => error,
    )
    await vi.advanceTimersByTimeAsync(20_000)
    expect(signal).not.toBeNull()
    await vi.advanceTimersByTimeAsync(QBIT_DEADLINE_MS - 20_000 - 1)
    expect(signal!.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(await settled).toEqual(failure('timeout'))
    expect(signal!.aborted).toBe(true)
  })

  it('a caller joining a login still gives up at its own deadline', async () => {
    vi.useFakeTimers()
    const { sync } = setup({
      login: () => new Promise<Response>(() => undefined),
      maindata: okBody,
    })
    const first = sync().then(
      () => 'resolved',
      (error: unknown) => error,
    )
    await vi.advanceTimersByTimeAsync(10_000)
    const joined = sync().then(
      () => 'resolved',
      (error: unknown) => error,
    )
    await vi.advanceTimersByTimeAsync(QBIT_DEADLINE_MS - 10_000)
    expect(await first).toEqual(failure('timeout'))
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await joined).toEqual(failure('timeout'))
  })

  it('a re-login outlives the deadline of the caller that started it, and a joiner gets its cookie', async () => {
    vi.useFakeTimers()
    let valid = OLD
    let slowNext = false
    const { sync, count, calls } = setup({
      // Like a real fetch, the login gives up when its signal aborts.
      login: (call) => {
        if (count(LOGIN) === 1) return loginOk(OLD)
        return new Promise<Response>((resolve, reject) => {
          setTimeout(() => resolve(loginOk(NEW)), 10_000)
          call.signal?.addEventListener('abort', () =>
            reject(new Error('aborted')),
          )
        })
      },
      maindata: (call) => {
        const answer = () =>
          call.headers.get('cookie') === valid ? okBody() : forbidden()
        if (!slowNext) return answer()
        slowNext = false
        return new Promise<Response>((resolve) => {
          setTimeout(() => resolve(answer()), 20_000)
        })
      },
    })
    await sync() // stores OLD
    valid = NEW
    slowNext = true
    // The leader's request takes 20 s, then its 403 starts the re-login with
    // 5 s of its own deadline left. The login itself needs 10 s.
    const leader = sync().then(
      () => 'resolved',
      (error: unknown) => error,
    )
    await vi.advanceTimersByTimeAsync(21_000)
    expect(count(LOGIN)).toBe(2)
    const joiner = sync()
    await vi.advanceTimersByTimeAsync(QBIT_DEADLINE_MS - 21_000)
    expect(await leader).toEqual(failure('timeout'))
    await vi.advanceTimersByTimeAsync(5_000)
    await expect(joiner).resolves.toMatchObject({ status: 200 })
    expect(count(LOGIN)).toBe(2)
    expect(calls.at(-1)?.headers.get('cookie')).toBe(NEW)
  })

  it('a caller whose deadline passed before its re-login starts no login', async () => {
    vi.useFakeTimers()
    let primed = false
    const { sync, count } = setup({
      maindata: () => {
        if (!primed) {
          primed = true
          return okBody()
        }
        // Answers 403 only once the caller's deadline has fired.
        return new Promise<Response>((resolve) => {
          setTimeout(() => resolve(forbidden()), QBIT_DEADLINE_MS)
        })
      },
    })
    await sync()
    const settled = sync().then(
      () => 'resolved',
      (error: unknown) => error,
    )
    await vi.advanceTimersByTimeAsync(QBIT_DEADLINE_MS)
    expect(await settled).toEqual(failure('timeout'))
    expect(count(LOGIN)).toBe(1)
  })

  it.each([
    ['login', 307],
    ['login', 308],
    ['maindata', 302],
  ] as const)(
    '%s answered %i: not followed, qbit_rejected, breaker closed',
    async (route, status) => {
      const redirect = () =>
        new Response(null, {
          status,
          headers: { location: 'http://elsewhere.test.invalid/' },
        })
      const { sync, calls } = setup(
        route === 'login'
          ? { login: redirect, maindata: okBody }
          : { maindata: redirect },
      )
      await expect(sync()).rejects.toEqual(failure('qbit_rejected'))
      const path = route === 'login' ? LOGIN : MAINDATA
      expect(calls.at(-1)?.path).toBe(path)
      expect(calls.every((call) => call.redirect === 'manual')).toBe(true)
      const lines = out.events('qbit_bad_response')
      expect(lines).toEqual([
        expect.objectContaining({ path, status, reason: 'redirect' }),
      ])
      for (const line of out.lines) expect(line).not.toContain('elsewhere')
      expect(out.events('qbit_breaker_open')).toHaveLength(0)
    },
  )
})
