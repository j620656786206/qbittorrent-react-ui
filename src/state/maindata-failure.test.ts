import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '#/lib/app-error'
import { fakeResponse } from '#/lib/testing'
import type { MaindataResponse } from '#/shared/maindata'
import { clearConnectionErrors } from '#/state/connection'
import { clearLoginRequired } from '#/state/login-required'
import { MAINDATA_KEY } from '#/state/maindata'
import {
  clearMaindataFailure,
  maindataFailureStore,
  markMaindataFailure,
} from '#/state/maindata-failure'
import { createQueryClient } from '#/state/query-client'

// Spec 1.8 review: the last maindata failure stays while the next fetch
// runs (Query resets its own `error` when a fetch starts) and goes on the
// next maindata success.

const failure = () => maindataFailureStore.state.error

beforeEach(() => {
  // The store is a no-op without `window`.
  vi.stubGlobal('window', { location: { pathname: '/', search: '', hash: '' } })
  clearMaindataFailure()
  clearLoginRequired()
  clearConnectionErrors()
})

afterEach(() => {
  clearMaindataFailure()
  clearConnectionErrors()
  vi.unstubAllGlobals()
})

describe('the store', () => {
  it('mark keeps the error, clear drops it', () => {
    const error = new AppError('qbit_rejected')
    markMaindataFailure(error)
    expect(failure()).toBe(error)
    clearMaindataFailure()
    expect(failure()).toBeNull()
  })

  it('is a no-op on the server', () => {
    vi.unstubAllGlobals()
    markMaindataFailure(new AppError('qbit_rejected'))
    expect(failure()).toBeNull()
  })
})

describe('fed by the query client', () => {
  it('a maindata failure sticks through the next fetch; a success clears it', async () => {
    let release: (response: MaindataResponse) => void = () => {}
    let call = 0
    const client = createQueryClient({
      currentPath: () => '/',
      fetchMaindata: () => {
        call += 1
        if (call === 1) return Promise.reject(new AppError('qbit_rejected'))
        return new Promise<MaindataResponse>((resolve) => (release = resolve))
      },
    })
    await client.prefetchQuery({ queryKey: MAINDATA_KEY })
    expect(failure()).toEqual(new AppError('qbit_rejected'))

    const next = client.fetchQuery({ queryKey: MAINDATA_KEY })
    // Query has reset the query's own error for the running fetch.
    expect(client.getQueryState(MAINDATA_KEY)?.error).toBeNull()
    expect(failure()).toEqual(new AppError('qbit_rejected'))

    release(fakeResponse())
    await next
    expect(failure()).toBeNull()
    client.clear()
  })

  it('other queries do not touch it', async () => {
    const client = createQueryClient({ currentPath: () => '/' })
    await client.prefetchQuery({
      queryKey: ['other'],
      queryFn: () => Promise.reject(new AppError('qbit_rejected')),
    })
    expect(failure()).toBeNull()
    client.clear()
  })
})
