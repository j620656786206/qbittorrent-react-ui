import { environmentManager } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '#/lib/app-error'
import { OPERATION_FAILURE_CODES } from '#/lib/error-text'
import type { ErrorCode } from '#/shared/errors'
import { clearConnectionErrors, getConnectionErrors } from '#/state/connection'
import { clearLoginRequired } from '#/state/login-required'
import { createQueryClient } from '#/state/query-client'
import { sendOp } from '#/state/tracked-op'
import type { TrackedOp } from '#/state/tracked-op'

// Story 3.1: `sendOp` lets an op name its own failure codes; without them
// the operation codes (qbit_rejected, timeout, invalid_input) show the
// toast. Connection codes always stay with the global handler.

const toastCalls = vi.hoisted(() => ({
  failures: [] as Array<{ text: string; onRetry: () => void }>,
}))
vi.mock('#/lib/toast', () => ({
  toast: {
    failure: (text: string, options: { onRetry: () => void }) =>
      toastCalls.failures.push({ text, onRetry: options.onRetry }),
    dismissFor: () => {},
  },
}))

beforeEach(() => {
  vi.stubGlobal('window', { location: { pathname: '/', search: '', hash: '' } })
  environmentManager.setIsServer(() => false)
  clearLoginRequired()
  clearConnectionErrors()
  toastCalls.failures.length = 0
})

afterEach(() => {
  environmentManager.setIsServer(() => typeof window === 'undefined')
  clearLoginRequired()
  clearConnectionErrors()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

async function failWith(
  code: ErrorCode,
  failureCodes: ReadonlyArray<ErrorCode> = OPERATION_FAILURE_CODES,
) {
  const client = createQueryClient({ currentPath: () => '/' })
  const op: TrackedOp<{ id: string }, ErrorCode> = {
    name: 'test-op',
    call: () => Promise.reject(new AppError(code)),
    keysOf: ({ id }) => [id],
    failureCodes,
    failureText: (_variables, failed) => `failed: ${failed}`,
  }
  sendOp(op, client, { id: 'k' })
  await flush()
  await flush()
  return toastCalls.failures.map((call) => call.text)
}

describe('sendOp failure codes', () => {
  it.each([['qbit_rejected'], ['timeout'], ['invalid_input']] as const)(
    'torrent operation codes: %s shows the toast',
    async (code) => {
      expect(await failWith(code)).toEqual([`failed: ${code}`])
    },
  )

  it('torrent operation codes: settings_write_failed shows none', async () => {
    expect(await failWith('settings_write_failed')).toEqual([])
  })

  it('an op naming its own codes: only those show the toast', async () => {
    const codes = ['settings_write_failed', 'timeout'] as const
    expect(await failWith('settings_write_failed', codes)).toEqual([
      'failed: settings_write_failed',
    ])
    toastCalls.failures.length = 0
    expect(await failWith('qbit_rejected', codes)).toEqual([])
  })

  it('a connection code shows no toast; the global handler records it', async () => {
    expect(await failWith('home_unreachable')).toEqual([])
    expect(getConnectionErrors()).toEqual(['home_unreachable'])
  })

  it('onSuccess receives the answer', async () => {
    const client = createQueryClient({ currentPath: () => '/' })
    const onSuccess = vi.fn()
    sendOp(
      {
        name: 'answer-op',
        call: () => Promise.resolve({ value: 7 }),
        keysOf: () => [],
        failureCodes: OPERATION_FAILURE_CODES,
        failureText: () => '',
        onSuccess,
      },
      client,
      { id: 'k' },
    )
    await flush()
    expect(onSuccess).toHaveBeenCalledWith(client, { id: 'k' }, { value: 7 })
  })
})
