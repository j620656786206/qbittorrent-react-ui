import { createHmac, timingSafeEqual } from 'node:crypto'
import { getRequestProtocol, setCookie } from '@tanstack/react-start/server'
import { markVerified } from '#/server/auth/verified'
import type { SessionPayload } from '#/server/auth/verified'
import { getEnv } from '#/server/env'

// AD-2 / AR-22: `rt_session` = base64url(JSON {v, iat, exp}) + "." +
// base64url(HMAC-SHA256(SESSION_SECRET, payloadPart)). Times are Unix seconds;
// a token is valid while now < exp. Rotating SESSION_SECRET logs everyone out.

export const SESSION_COOKIE = 'rt_session'
export const REMEMBER_SECONDS = 90 * 24 * 60 * 60
export const SHORT_SECONDS = 12 * 60 * 60

export type { SessionPayload }

interface SessionClock {
  /** Unix seconds; defaults to the current time. */
  now?: number
  /** Defaults to `SESSION_SECRET` from the parsed env. */
  secret?: string
}

const nowSeconds = () => Math.floor(Date.now() / 1000)

function sign(payloadPart: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(payloadPart).digest()
}

export function issueSession(options: { remember: boolean } & SessionClock): {
  token: string
  maxAge: number
} {
  const iat = options.now ?? nowSeconds()
  const maxAge = options.remember ? REMEMBER_SECONDS : SHORT_SECONDS
  const secret = options.secret ?? getEnv().sessionSecret
  const payloadPart = Buffer.from(
    JSON.stringify({ v: 1, iat, exp: iat + maxAge }),
  ).toString('base64url')
  const signature = sign(payloadPart, secret).toString('base64url')
  return { token: `${payloadPart}.${signature}`, maxAge }
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value)
}

/** Payload of a valid, unexpired token; `null` for anything else. */
export function verifySession(
  token: string | null | undefined,
  options: SessionClock = {},
): SessionPayload | null {
  if (typeof token !== 'string' || token.length > 512) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [payloadPart, signaturePart] = parts
  if (!/^[\w-]+$/.test(payloadPart) || !/^[\w-]+$/.test(signaturePart)) {
    return null
  }

  const secret = options.secret ?? getEnv().sessionSecret
  const expected = sign(payloadPart, secret)
  const given = Buffer.from(signaturePart, 'base64url')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return null
  }

  let payload: unknown
  try {
    payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (typeof payload !== 'object' || payload === null) return null
  const { v, iat, exp } = payload as Record<string, unknown>
  if (v !== 1 || !isInteger(iat) || !isInteger(exp)) return null
  const now = options.now ?? nowSeconds()
  if (now >= exp) return null
  return markVerified({ iat, exp })
}

/** Value of `rt_session` in a `Cookie` request header, if any. */
export function readSessionCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null
  for (const pair of cookieHeader.split(';')) {
    const index = pair.indexOf('=')
    if (index === -1) continue
    if (pair.slice(0, index).trim() === SESSION_COOKIE) {
      return pair.slice(index + 1).trim()
    }
  }
  return null
}

export function sessionCookieOptions(options: {
  maxAge: number
  protocol: string
}) {
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    path: '/',
    maxAge: options.maxAge,
    secure: options.protocol === 'https',
  }
}

/** Story 1.4: call after `issueSession` inside the login server function. */
export function setSessionCookie(token: string, maxAge: number): void {
  setCookie(
    SESSION_COOKIE,
    token,
    sessionCookieOptions({ maxAge, protocol: getRequestProtocol() }),
  )
}
