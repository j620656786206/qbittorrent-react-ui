import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import {
  SESSION_QUERY_KEY,
  sessionQueryOptions,
  sessionStaleTime,
} from '#/features/login/session-query'

const T0 = Date.UTC(2026, 10, 16, 1, 0, 0)
const EXP = T0 / 1000 + 60

afterEach(() => {
  vi.useRealTimers()
})

describe('session staleTime', () => {
  it('fresh until exp, stale from exp on, stale with no data', () => {
    vi.useFakeTimers({ now: T0 })
    expect(sessionStaleTime({ exp: EXP })).toBe(Infinity)
    vi.setSystemTime(EXP * 1000 - 1)
    expect(sessionStaleTime({ exp: EXP })).toBe(Infinity)
    vi.setSystemTime(EXP * 1000)
    expect(sessionStaleTime({ exp: EXP })).toBe(0)
    expect(sessionStaleTime(undefined)).toBe(0)
  })

  it('fetchQuery reuses an unexpired session and asks again after exp', async () => {
    vi.useFakeTimers({ now: T0 })
    const client = new QueryClient()
    client.setQueryData(SESSION_QUERY_KEY, { exp: EXP })
    const queryFn = vi.fn(async () => ({ exp: EXP + 3600 }))
    const options = { ...sessionQueryOptions(), queryFn }

    expect(await client.fetchQuery(options)).toEqual({ exp: EXP })
    expect(queryFn).not.toHaveBeenCalled()

    vi.setSystemTime(EXP * 1000)
    expect(await client.fetchQuery(options)).toEqual({ exp: EXP + 3600 })
    expect(queryFn).toHaveBeenCalledTimes(1)
  })
})
