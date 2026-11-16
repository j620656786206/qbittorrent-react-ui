// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { QueryClientProvider, notifyManager } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '@tanstack/react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { errorText } from '#/lib/error-text'
import { login } from '#/server/functions/login'
import { clearConnectionErrors } from '#/state/connection'
import { clearLoginRequired } from '#/state/login-required'
import { createQueryClient } from '#/state/query-client'
import { LoginScreen } from '#/features/login/login-screen'
import {
  SLOW_HINT_MS,
  WRONG_CREDENTIAL_CODES,
} from '#/features/login/login-form-model'

// Story 2.0 rows W1, W2 (Epic 1 retro A7): the login form's DOM wiring,
// which the pure tests of login-form-model cannot reach. The real
// LoginScreen and callFn; only the server function is replaced, so nothing
// is sent anywhere.

vi.mock('#/server/functions/login', () => ({ login: vi.fn() }))
const loginFn = vi.mocked(login)

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

let container: HTMLDivElement
let root: Root
let client: QueryClient

async function render() {
  client = createQueryClient({ currentPath: () => '/login' })
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => <LoginScreen redirect={undefined} />,
    }),
    history: createMemoryHistory({ initialEntries: ['/login'] }),
  })
  await router.load()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  })
}

const field = (name: string) =>
  container.querySelector<HTMLInputElement>(`input[name="${name}"]`)!
const submitButton = () =>
  container.querySelector<HTMLButtonElement>('button[type="submit"]')!

/** Types like a user: React listens for `input` on the native setter. */
function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

async function fillAndSubmit() {
  await act(async () => {
    type(field('username'), 'someone')
    type(field('password'), 'not-the-password')
  })
  await act(async () => submitButton().click())
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  notifyManager.setScheduler((callback) => callback())
  loginFn.mockReset()
  clearLoginRequired()
  clearConnectionErrors()
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  client.clear()
  vi.useRealTimers()
  notifyManager.setScheduler((callback) => setTimeout(callback, 0))
  clearLoginRequired()
  clearConnectionErrors()
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
})

describe('W1 wrong password', () => {
  it.each(WRONG_CREDENTIAL_CODES)(
    '%s: empties and focuses the password and shows the alert',
    async (code) => {
      loginFn.mockResolvedValue({
        ok: false,
        error: { code, message: errorText(code) },
      } as never)
      await render()
      await fillAndSubmit()

      expect(loginFn).toHaveBeenCalledTimes(1)
      const password = field('password')
      expect(password.value).toBe('')
      expect(document.activeElement).toBe(password)
      expect(password.getAttribute('aria-invalid')).toBe('true')
      const alert = container.querySelector('[role="alert"]')
      expect(alert?.textContent).toBe(errorText(code))
      // The username is kept.
      expect(field('username').value).toBe('someone')
    },
  )
})

describe('W2 pending', () => {
  it('shows 登入中… at once and 還在等 NAS 回應 after 10 s, not before', async () => {
    loginFn.mockReturnValue(new Promise(() => {}) as never)
    await render()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await fillAndSubmit()

    expect(submitButton().textContent).toBe('登入中…')
    expect(submitButton().getAttribute('aria-busy')).toBe('true')
    expect(container.textContent).not.toContain('還在等 NAS 回應')

    await act(async () => vi.advanceTimersByTime(SLOW_HINT_MS - 1))
    expect(container.textContent).not.toContain('還在等 NAS 回應')

    await act(async () => vi.advanceTimersByTime(1))
    const hint = container.querySelector('[role="status"]')
    expect(hint?.textContent).toBe('還在等 NAS 回應')
    expect(submitButton().textContent).toBe('登入中…')
  })
})
