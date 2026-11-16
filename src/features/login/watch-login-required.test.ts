import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { watchLoginRequired } from '#/features/login/watch-login-required'
import { clearLoginRequired, markLoginRequired } from '#/state/login-required'

function fakeRouter(status: 'pending' | 'idle') {
  const listeners = new Set<() => void>()
  return {
    state: { status },
    invalidate: vi.fn(() => Promise.resolve()),
    subscribe: vi.fn((_event: 'onResolved', fn: () => void) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    }),
    resolve() {
      for (const fn of [...listeners]) fn()
    },
    listenerCount: () => listeners.size,
  }
}

beforeEach(() => {
  vi.stubGlobal('window', {})
  clearLoginRequired()
})

afterEach(() => {
  clearLoginRequired()
  vi.unstubAllGlobals()
})

describe('watchLoginRequired', () => {
  it('idle: invalidates as soon as login becomes required', () => {
    const router = fakeRouter('idle')
    const stop = watchLoginRequired(router)
    markLoginRequired('not_logged_in', '/')
    expect(router.invalidate).toHaveBeenCalledTimes(1)
    markLoginRequired('qbit_auth_failed', '/')
    expect(router.invalidate).toHaveBeenCalledTimes(1)
    stop()
  })

  it('pending: invalidates once the navigation resolves, if still required', () => {
    const router = fakeRouter('pending')
    const stop = watchLoginRequired(router)
    markLoginRequired('not_logged_in', '/')
    expect(router.invalidate).not.toHaveBeenCalled()
    expect(router.listenerCount()).toBe(1)
    router.state.status = 'idle'
    router.resolve()
    expect(router.invalidate).toHaveBeenCalledTimes(1)
    expect(router.listenerCount()).toBe(0)
    router.resolve()
    expect(router.invalidate).toHaveBeenCalledTimes(1)
    stop()
  })

  it('pending: no invalidate if login was cleared before the navigation resolved', () => {
    const router = fakeRouter('pending')
    const stop = watchLoginRequired(router)
    markLoginRequired('not_logged_in', '/')
    clearLoginRequired()
    router.resolve()
    expect(router.invalidate).not.toHaveBeenCalled()
    stop()
  })

  it('stop removes both the store and the pending router listener', () => {
    const router = fakeRouter('pending')
    const stop = watchLoginRequired(router)
    markLoginRequired('not_logged_in', '/')
    stop()
    expect(router.listenerCount()).toBe(0)
    clearLoginRequired()
    markLoginRequired('not_logged_in', '/')
    expect(router.subscribe).toHaveBeenCalledTimes(1)
  })
})
