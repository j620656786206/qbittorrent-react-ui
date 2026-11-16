import { isRedirect } from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '#/lib/app-error'
import { clearLoginRequired, loginStore } from '#/state/login-required'
import type { LoginRequired } from '#/state/login-required'
import { requireSession } from '#/features/login/require-session'

// Spec 1.4 rows G1 to G4.

afterEach(() => {
  clearLoginRequired()
})

function store(reason: LoginRequired['reason']): LoginRequired {
  const loginRequired = { reason, returnTo: '/?v=1' }
  loginStore.setState(() => ({ loginRequired }))
  return loginRequired
}

async function redirectOf(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    if (isRedirect(error)) return error.options
    throw error
  }
  return null
}

describe('requireSession', () => {
  it('G1 store qbit_auth_failed: redirect with its returnTo, session not fetched', async () => {
    const fetchSession = vi.fn()
    const options = await redirectOf(
      requireSession({
        location: { href: '/other' },
        loginRequired: store('qbit_auth_failed'),
        fetchSession,
      }),
    )
    expect(options).toMatchObject({
      to: '/login',
      search: { redirect: '/?v=1' },
    })
    expect(fetchSession).not.toHaveBeenCalled()
    expect(loginStore.state.loginRequired).not.toBeNull()
  })

  it('C2 store not_logged_in, server says the session is valid: store cleared, no redirect', async () => {
    const fetchSession = vi.fn(() => Promise.resolve({ exp: 1 }))
    await expect(
      requireSession({
        location: { href: '/other' },
        loginRequired: store('not_logged_in'),
        fetchSession,
      }),
    ).resolves.toBeUndefined()
    expect(fetchSession).toHaveBeenCalledTimes(1)
    expect(loginStore.state.loginRequired).toBeNull()
  })

  it.each([
    new AppError('not_logged_in'),
    new AppError('home_unreachable'),
    new Error('anything else'),
  ])(
    'C2 store not_logged_in, fetch rejects %s: redirect with its returnTo, store kept',
    async (error) => {
      const options = await redirectOf(
        requireSession({
          location: { href: '/other' },
          loginRequired: store('not_logged_in'),
          fetchSession: () => Promise.reject(error),
        }),
      )
      expect(options).toMatchObject({
        to: '/login',
        search: { redirect: '/?v=1' },
      })
      expect(loginStore.state.loginRequired).not.toBeNull()
    },
  )

  it.each(['not_logged_in', 'qbit_auth_failed'] as const)(
    'G2 fetch rejects %s: redirect back to the current location',
    async (code) => {
      const options = await redirectOf(
        requireSession({
          location: { href: '/x?y=1#z' },
          loginRequired: null,
          fetchSession: () => Promise.reject(new AppError(code)),
        }),
      )
      expect(options).toMatchObject({
        to: '/login',
        search: { redirect: '/x?y=1#z' },
      })
    },
  )

  it('G3 session ok: resolves without a redirect', async () => {
    await expect(
      requireSession({
        location: { href: '/' },
        loginRequired: null,
        fetchSession: () => Promise.resolve({ exp: 1 }),
      }),
    ).resolves.toBeUndefined()
  })

  it.each([
    new AppError('home_unreachable'),
    new AppError('cloudflare_expired'),
    new AppError('qbit_rejected'),
    new Error('anything else'),
  ])('G4 fetch rejects %s: resolves, no redirect', async (error) => {
    await expect(
      requireSession({
        location: { href: '/' },
        loginRequired: null,
        fetchSession: () => Promise.reject(error),
      }),
    ).resolves.toBeUndefined()
  })
})
