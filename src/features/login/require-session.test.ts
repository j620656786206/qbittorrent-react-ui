import { isRedirect } from '@tanstack/react-router'
import { describe, expect, it, vi } from 'vitest'
import { AppError } from '#/lib/app-error'
import { requireSession } from '#/features/login/require-session'

// Spec 1.4 rows G1 to G4.

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
  it('G1 store set: redirect with its returnTo, session not fetched', async () => {
    const fetchSession = vi.fn()
    const options = await redirectOf(
      requireSession({
        location: { href: '/other' },
        loginRequired: { reason: 'not_logged_in', returnTo: '/?v=1' },
        fetchSession,
      }),
    )
    expect(options).toMatchObject({
      to: '/login',
      search: { redirect: '/?v=1' },
    })
    expect(fetchSession).not.toHaveBeenCalled()
  })

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
