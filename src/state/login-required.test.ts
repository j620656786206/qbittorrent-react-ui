import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearLoginRequired,
  loginStore,
  markLoginRequired,
  onLoginRequired,
} from '#/state/login-required'

// Spec 1.4 row W1. `markLoginRequired` is a no-op without `window`.

beforeEach(() => {
  vi.stubGlobal('window', {})
  clearLoginRequired()
})

afterEach(() => {
  clearLoginRequired()
  vi.unstubAllGlobals()
})

describe('onLoginRequired (W1)', () => {
  it('fires once on null -> set, not on set -> set or set -> null', () => {
    const listener = vi.fn()
    const stop = onLoginRequired(listener)
    markLoginRequired('not_logged_in', '/a')
    expect(listener).toHaveBeenCalledTimes(1)
    markLoginRequired('qbit_auth_failed', '/b')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(loginStore.state.loginRequired).toEqual({
      reason: 'qbit_auth_failed',
      returnTo: '/a',
    })
    clearLoginRequired()
    expect(listener).toHaveBeenCalledTimes(1)
    stop()
  })

  it('fires again after a clear, and not after unsubscribing', () => {
    const listener = vi.fn()
    const stop = onLoginRequired(listener)
    markLoginRequired('not_logged_in', '/')
    clearLoginRequired()
    markLoginRequired('not_logged_in', '/')
    expect(listener).toHaveBeenCalledTimes(2)
    stop()
    clearLoginRequired()
    markLoginRequired('not_logged_in', '/')
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('subscribing while already set does not fire until the next start', () => {
    markLoginRequired('not_logged_in', '/')
    const listener = vi.fn()
    const stop = onLoginRequired(listener)
    markLoginRequired('qbit_auth_failed', '/')
    expect(listener).not.toHaveBeenCalled()
    stop()
  })
})
