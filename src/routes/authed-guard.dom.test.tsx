// @vitest-environment happy-dom
import { createMemoryHistory, createRouter } from '@tanstack/react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { routeTree } from '#/routeTree.gen'
import { getSession } from '#/server/functions/get-session'
import { clearConnectionErrors } from '#/state/connection'
import { clearLoginRequired } from '#/state/login-required'
import { createQueryClient } from '#/state/query-client'

// Story 2.0 row W3 (Epic 1 retro A7): the real `_authed` route's beforeLoad
// in a real router. Only the session server function is replaced; it says
// not_logged_in, so opening `/` must land on the login screen with the
// original href to come back to.
// https://tanstack.com/router/latest/docs/framework/react/guide/history-types

vi.mock('#/server/functions/get-session', () => ({ getSession: vi.fn() }))
const getSessionFn = vi.mocked(getSession)

beforeEach(() => {
  getSessionFn.mockReset()
  getSessionFn.mockResolvedValue({
    ok: false,
    error: { code: 'not_logged_in', message: '請先登入' },
  } as never)
  clearLoginRequired()
  clearConnectionErrors()
})

afterEach(() => {
  clearLoginRequired()
  clearConnectionErrors()
})

function guardedRouter(initial: string) {
  const queryClient = createQueryClient({ currentPath: () => initial })
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [initial] }),
  })
  return { router, queryClient }
}

describe('W3 the _authed guard', () => {
  it.each([
    ['/', '/login?redirect=%2F'],
    // The full href, search included, not only the pathname.
    ['/?sort=ratio', '/login?redirect=%2F%3Fsort%3Dratio'],
  ])('not logged in: %s goes to %s', async (initial, expected) => {
    const { router, queryClient } = guardedRouter(initial)
    await router.load()
    expect(getSessionFn).toHaveBeenCalledTimes(1)
    expect(router.state.location.pathname).toBe('/login')
    expect(router.state.location.search).toEqual({ redirect: initial })
    expect(router.state.location.href).toBe(expected)
    queryClient.clear()
  })
})
