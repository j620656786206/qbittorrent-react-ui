import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { completeLogin } from '#/features/login/complete-login'
import { SESSION_QUERY_KEY } from '#/features/login/session-query'
import {
  clearLoginRequired,
  loginStore,
  markLoginRequired,
} from '#/state/login-required'
import { createQueryClient } from '#/state/query-client'

beforeEach(() => {
  vi.stubGlobal('window', {})
  clearLoginRequired()
})

afterEach(() => {
  clearLoginRequired()
  vi.unstubAllGlobals()
})

describe('completeLogin', () => {
  it.each([
    ['/?view=list', '/?view=list'],
    ['//evil.example', '/'],
    [undefined, '/'],
  ])(
    'redirect %s: clears the store, caches the session, goes to %s',
    (redirect, target) => {
      const queryClient = createQueryClient()
      markLoginRequired('qbit_auth_failed', '/?view=list')
      const navigate = vi.fn()
      expect(
        completeLogin({ data: { exp: 123 }, redirect, queryClient, navigate }),
      ).toBe(target)
      expect(loginStore.state.loginRequired).toBeNull()
      expect(queryClient.getQueryData(SESSION_QUERY_KEY)).toEqual({ exp: 123 })
      expect(navigate).toHaveBeenCalledTimes(1)
      expect(navigate).toHaveBeenCalledWith(target)
    },
  )

  it('invalidates every query except the seeded session', () => {
    const queryClient = createQueryClient()
    queryClient.setQueryData(['torrent-files'], { files: 1 })
    queryClient.setQueryData(SESSION_QUERY_KEY, { exp: 1 })
    completeLogin({
      data: { exp: 123 },
      redirect: '/',
      queryClient,
      navigate: () => {},
    })
    expect(queryClient.getQueryState(['torrent-files'])?.isInvalidated).toBe(
      true,
    )
    expect(queryClient.getQueryState(SESSION_QUERY_KEY)?.isInvalidated).toBe(
      false,
    )
    expect(queryClient.getQueryData(SESSION_QUERY_KEY)).toEqual({ exp: 123 })
  })

  it('the store is clear before navigating (no login loop)', () => {
    markLoginRequired('not_logged_in', '/')
    let storeAtNavigate: unknown = 'unset'
    completeLogin({
      data: { exp: 1 },
      redirect: '/',
      queryClient: createQueryClient(),
      navigate: () => (storeAtNavigate = loginStore.state.loginRequired),
    })
    expect(storeAtNavigate).toBeNull()
  })
})
