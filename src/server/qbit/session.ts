import { ServerFailure } from '#/server/errors/server-failure'
import { log as defaultLog } from '#/server/log'
import type { Logger } from '#/server/log'
import { QBIT_PATHS } from '#/server/qbit/paths'
import type { QbitPath } from '#/server/qbit/paths'

// AD-4 / AR-19 / AR-20: the container's only qBittorrent session.
// - The cookie lives in memory only. Its name and value come from the first
//   `Set-Cookie` of a successful login as is (qBittorrent's name is a
//   preference, `SID` by default), and neither is ever logged.
// - One login at a time: every caller that needs one waits on the same
//   promise, so a burst of 403s costs qBittorrent exactly one login. That
//   login runs on its own 25 s deadline, not on the caller's that started it,
//   so a caller that joins later is not failed by an earlier one's deadline.
// - A login answered `Fails.`, 403 or 401 opens the breaker: from then on
//   every call fails with `qbit_auth_failed` before any fetch, until the
//   container restarts. Retrying a wrong password is exactly what gets the
//   container IP banned. qBittorrent 5.1.4 answers 401 when its Origin,
//   Referer or Host check fails, so that one is logged `login_unauthorized`:
//   QBIT_URL does not match what qBittorrent sees, the password may be fine.
// - No redirects are followed (`redirect: 'manual'`). The qBittorrent API never
//   redirects; a 3xx means a wrong QBIT_URL or something in between, and
//   following a 307/308 would resend the login form somewhere else. It is
//   answered `qbit_rejected`.
// - Every request sends `Origin` and `Referer` of QBIT_URL (qBittorrent's CSRF
//   check wants them to match the Host it sees) and never asks qBittorrent to
//   relax CSRF, Host checks, bans or auth.
// - One deadline per `send()`: waiting for a login, the request, the re-login
//   and the resend share it, each step getting what is left. It is shorter
//   than the factory's 30 s (`src/server/*` may not import that constant), so
//   a shared pull fails with `timeout` and frees the syncer before any caller
//   gives up on it.
// - When a 403 follows a login that was just accepted, logging in again would
//   only open a new qBittorrent session per poll: the cookie is dropped and
//   for 60 s every call is answered `qbit_rejected` without a login; after
//   that the next call logs in once more.
// Imported only by `src/server/qbit/*` (lint enforced); the rest of the app
// uses the client's named methods.

export const QBIT_DEADLINE_MS = 25_000
export const RELOGIN_COOLDOWN_MS = 60_000
const LOGIN_PATH = QBIT_PATHS.login

export interface QbitSessionOptions {
  /** QBIT_URL as an origin, e.g. `http://qbit.test.invalid:8080`. */
  baseUrl: string
  username: string
  password: string
  /** Defaults to `globalThis.fetch`, looked up on every request. */
  fetch?: typeof fetch
  logger?: Logger
  /** Monotonic milliseconds for the re-login cooldown; `performance.now`. */
  now?: () => number
}

export interface SendOptions {
  method: 'GET' | 'POST'
  query?: URLSearchParams
  /**
   * The body: URL-encoded, or multipart (story 4.7: `torrents/add` with a
   * .torrent file). fetch sets the content type for either; a resend after
   * a 403 sends the same form again.
   */
  form?: URLSearchParams | FormData
  /**
   * Non-2xx statuses that are an answer for the caller to read, not
   * `qbit_rejected` (story 4.7: 415 from `torrents/add`). Never 403.
   */
  accept?: ReadonlyArray<number>
  /**
   * Story 5.2, AD-4 (2026-11-21): this endpoint also answers 403 for a
   * refusal of its own (`torrents/setLocation`: "Cannot write to
   * directory"). After its first 403 the session reads `app/version` with
   * the same cookie: a 2xx means the session is live, so the 403 is a plain
   * `qbit_rejected` with no login and no resend. Otherwise it logs in once
   * and resends as usual, and a 403 after that login is also a plain
   * `qbit_rejected` for this call only: no cooldown, the cookie kept.
   */
  forbiddenMayBeRefusal?: boolean
}

/** A 2xx answer (or an `accept`ed status), body read inside the deadline. */
export interface QbitResponse {
  status: number
  body: string
}

export interface QbitSession {
  send: (path: QbitPath, options: SendOptions) => Promise<QbitResponse>
}

type LoginReason = 'initial' | 'expired'

/** `cause.code` of a fetch rejection (`ECONNREFUSED`, `ENOTFOUND`, ...). */
function causeCode(error: unknown): string {
  const cause = error instanceof Error ? error.cause : undefined
  const code =
    typeof cause === 'object' && cause !== null && 'code' in cause
      ? cause.code
      : undefined
  return typeof code === 'string' && /^[A-Z0-9_]{1,40}$/.test(code)
    ? code
    : 'unknown'
}

function timeoutFailure(path: string): ServerFailure {
  return new ServerFailure('timeout', `qbit ${path}: deadline passed`)
}

/** `name=value` of the first Set-Cookie, or null when there is none. */
function readCookie(headers: Headers): string | null {
  const first = headers.getSetCookie().at(0)
  if (first === undefined) return null
  const pair = first.split(';', 1)[0]
  const at = pair.indexOf('=')
  if (at <= 0) return null
  const name = pair.slice(0, at).trim()
  const value = pair.slice(at + 1).trim()
  return name === '' ? null : `${name}=${value}`
}

export function createQbitSession(options: QbitSessionOptions): QbitSession {
  const origin = new URL(options.baseUrl).origin
  const fetchImpl: typeof fetch =
    options.fetch ?? ((input, init) => globalThis.fetch(input, init))
  const logger = options.logger ?? defaultLog
  const now = options.now ?? (() => performance.now())

  let reloginBlockedUntil = Number.NEGATIVE_INFINITY
  let cookie: string | null = null
  let pendingLogin: Promise<string> | null = null
  let breakerOpen = false

  async function request(
    path: QbitPath,
    { method, query, form }: SendOptions,
    withCookie: string | null,
    signal: AbortSignal,
  ): Promise<{ status: number; headers: Headers; body: string }> {
    // An already aborted signal makes fetch reject at once: `timeout` below.
    const url = new URL(path, origin)
    if (query) url.search = query.toString()
    const headers = new Headers({ Origin: origin, Referer: `${origin}/` })
    if (withCookie !== null) headers.set('Cookie', withCookie)
    let response: Response
    let body: string
    try {
      response = await fetchImpl(url, {
        method,
        headers,
        body: form,
        signal,
        redirect: 'manual',
      })
      // Read the body inside the deadline: a stalled body is no answer.
      body = await response.text()
    } catch (error) {
      // Decided by our own deadline, not by the rejection's type (Node
      // rejects an abort with whatever reason it was given).
      if (signal.aborted) throw timeoutFailure(path)
      // The code only: undici's cause message carries the resolved address
      // (`connect ECONNREFUSED <ip>:<port>`), which no scrubbing knows.
      logger.warn('qbit_unreachable', { path, cause: causeCode(error) })
      throw new ServerFailure('qbit_unreachable', `qbit ${path} unreachable`)
    }
    if (response.status >= 300 && response.status <= 399) {
      // The status only: `Location` may name a host.
      logger.warn('qbit_bad_response', {
        path,
        status: response.status,
        reason: 'redirect',
      })
      throw new ServerFailure('qbit_rejected', `qbit ${path}: redirect`)
    }
    return { status: response.status, headers: response.headers, body }
  }

  function openBreaker(
    reason: 'login_failed' | 'login_forbidden' | 'login_unauthorized',
  ): never {
    if (!breakerOpen) {
      breakerOpen = true
      logger.error('qbit_breaker_open', { reason })
    }
    throw new ServerFailure('qbit_auth_failed', `qbit login: ${reason}`)
  }

  async function doLogin(
    reason: LoginReason,
    signal: AbortSignal,
  ): Promise<string> {
    const form = new URLSearchParams()
    form.set('username', options.username)
    form.set('password', options.password)
    // Never sends the old cookie.
    const response = await request(
      LOGIN_PATH,
      { method: 'POST', form },
      null,
      signal,
    )
    if (response.status === 403) openBreaker('login_forbidden')
    // Origin, Referer or Host check failed: see the header comment.
    if (response.status === 401) openBreaker('login_unauthorized')
    if (response.status < 200 || response.status > 299) {
      logger.warn('qbit_bad_response', {
        path: LOGIN_PATH,
        status: response.status,
      })
      throw new ServerFailure('qbit_rejected', 'qbit login: bad status')
    }
    const text = response.body.trim()
    if (text === 'Fails.') openBreaker('login_failed')
    if (text !== 'Ok.') {
      logger.warn('qbit_bad_response', {
        path: LOGIN_PATH,
        status: response.status,
      })
      throw new ServerFailure('qbit_rejected', 'qbit login: unexpected body')
    }
    const fresh = readCookie(response.headers)
    if (fresh === null) {
      // Auth bypass on qBittorrent's side (AD-4 forbids it) or a proxy that
      // drops cookies. Not a credentials problem, so the breaker stays shut.
      logger.warn('qbit_login_no_cookie')
      throw new ServerFailure('qbit_rejected', 'qbit login: no cookie')
    }
    cookie = fresh
    logger.info('qbit_login', { reason })
    return fresh
  }

  /** Rejects with `timeout` once `signal` aborts, whatever `promise` does. */
  function withinDeadline<T>(
    promise: Promise<T>,
    signal: AbortSignal,
    path: QbitPath,
  ): Promise<T> {
    if (signal.aborted) return Promise.reject(timeoutFailure(path))
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => reject(timeoutFailure(path))
      signal.addEventListener('abort', onAbort, { once: true })
      promise.then(resolve, reject).finally(() => {
        signal.removeEventListener('abort', onAbort)
      })
    })
  }

  /**
   * Single flight: joins the login in progress, if any. The login has its own
   * deadline; every caller, the one that started it included, gives up at
   * its own.
   */
  function login(reason: LoginReason, signal: AbortSignal): Promise<string> {
    // A call that was already past the check in send() when the breaker
    // opened must not log in again.
    if (breakerOpen) {
      return Promise.reject(
        new ServerFailure('qbit_auth_failed', 'qbit breaker open'),
      )
    }
    // A caller already out of time starts nothing.
    if (signal.aborted) return Promise.reject(timeoutFailure(LOGIN_PATH))
    if (pendingLogin === null) {
      const deadline = new AbortController()
      const timer = setTimeout(() => deadline.abort(), QBIT_DEADLINE_MS)
      pendingLogin = doLogin(reason, deadline.signal).finally(() => {
        clearTimeout(timer)
        pendingLogin = null
      })
    }
    return withinDeadline(pendingLogin, signal, LOGIN_PATH)
  }

  function expectOk(
    path: QbitPath,
    response: { status: number; body: string },
    accept: ReadonlyArray<number> = [],
  ): QbitResponse {
    const ok = response.status >= 200 && response.status <= 299
    if (ok || accept.includes(response.status)) {
      return { status: response.status, body: response.body }
    }
    logger.warn('qbit_bad_response', { path, status: response.status })
    throw new ServerFailure('qbit_rejected', `qbit ${path}: bad status`)
  }

  /** A 403 although the credentials were just accepted (Q5). */
  function rejectedAfterLogin(
    path: QbitPath,
    response: { status: number; body: string },
    used: string,
  ): never {
    reloginBlockedUntil = now() + RELOGIN_COOLDOWN_MS
    // Drop the cookie qBittorrent refused, not a newer one another call got.
    if (cookie === used) cookie = null
    logger.warn('qbit_bad_response', { path, status: response.status })
    throw new ServerFailure('qbit_rejected', `qbit ${path}: 403 after login`)
  }

  async function exchange(
    path: QbitPath,
    sendOptions: SendOptions,
    signal: AbortSignal,
  ): Promise<QbitResponse> {
    // Did this call already wait on a login? Then a 403 is not an expired
    // session: the credentials were just accepted.
    let loggedIn = false
    let used = cookie
    if (used === null) {
      // Cooling down after a 403 that followed a login: no cookie to send
      // and no login yet, already logged when the cooldown began.
      if (now() < reloginBlockedUntil) {
        throw new ServerFailure('qbit_rejected', `qbit ${path}: cooling down`)
      }
      used = await login('initial', signal)
      loggedIn = true
    }
    const afterLogin = (
      response: { status: number; body: string },
      refused: string,
    ) =>
      sendOptions.forbiddenMayBeRefusal
        ? expectOk(path, response)
        : rejectedAfterLogin(path, response, refused)
    const first = await request(path, sendOptions, used, signal)
    if (first.status !== 403) return expectOk(path, first, sendOptions.accept)
    if (loggedIn) return afterLogin(first, used)
    if (now() < reloginBlockedUntil) return expectOk(path, first)
    if (sendOptions.forbiddenMayBeRefusal) {
      const probe = await request(
        QBIT_PATHS.appVersion,
        { method: 'GET' },
        used,
        signal,
      )
      // The session is live: the 403 was this endpoint's own refusal.
      if (probe.status >= 200 && probe.status <= 299) {
        return expectOk(path, first)
      }
    }

    if (cookie !== null && cookie !== used) {
      // Stale: another call already stored a newer cookie (Q4).
      used = cookie
    } else {
      used = await login(cookie === null ? 'initial' : 'expired', signal)
    }
    // Exactly one resend; a second 403 is qbit_rejected, not the breaker.
    const resent = await request(path, sendOptions, used, signal)
    if (resent.status === 403) return afterLogin(resent, used)
    return expectOk(path, resent, sendOptions.accept)
  }

  async function send(
    path: QbitPath,
    sendOptions: SendOptions,
  ): Promise<QbitResponse> {
    if (breakerOpen) {
      throw new ServerFailure('qbit_auth_failed', 'qbit breaker open')
    }
    const deadline = new AbortController()
    const timer = setTimeout(() => deadline.abort(), QBIT_DEADLINE_MS)
    try {
      return await exchange(path, sendOptions, deadline.signal)
    } finally {
      clearTimeout(timer)
    }
  }

  return { send }
}
