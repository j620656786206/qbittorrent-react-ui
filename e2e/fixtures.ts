import { test as base, expect } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'

// Story 2.0 row P3: every test records CSP violations, console errors and
// requests that leave loopback, and fails on any of them. A test that forces
// an HTTP status (P5 401, P6 502) allows only Chromium's own "Failed to load
// resource" line for that status.

export const FAKE_USER = 'fake-user'
export const FAKE_PASS = 'fake-pass'
export const MAIN_ID = 'rt-main'

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

declare global {
  interface Window {
    __rtCspViolation?: (text: string) => void
  }
}

export interface Watch {
  /**
   * Allow Chromium's "Failed to load resource" line for this status, and
   * only for a resource whose path starts with `pathPrefix`.
   */
  allowForcedStatus: (status: number, pathPrefix: string) => void
}

export const test = base.extend<{ watch: Watch }>({
  watch: [
    async ({ page }, use, testInfo) => {
      const violations: Array<string> = []
      const consoleErrors: Array<string> = []
      const consoleLog: Array<string> = []
      const offLoopback: Array<string> = []
      const allowed: Array<{ status: number; pathPrefix: string }> = []

      // The binding is added over the DevTools protocol, and the init script
      // is injected by the browser, so the page's CSP never blocks either.
      await page.exposeFunction('__rtCspViolation', (text: string) => {
        violations.push(text)
      })
      await page.addInitScript(() => {
        document.addEventListener('securitypolicyviolation', (event) => {
          window.__rtCspViolation?.(
            `${event.effectiveDirective} blocked ${event.blockedURI || '(inline)'}`,
          )
        })
      })

      page.on('console', (message) => {
        const text = message.text()
        consoleLog.push(`[${message.type()}] ${text}`)
        if (message.type() !== 'error') return
        if (text.includes('Content Security Policy')) {
          violations.push(text)
          return
        }
        const forced =
          /^Failed to load resource: the server responded with a status of (\d{3})\b/.exec(
            text,
          )
        if (forced) {
          const status = Number(forced[1])
          const path = new URL(message.location().url, 'http://x').pathname
          const isAllowed = allowed.some(
            (rule) =>
              rule.status === status && path.startsWith(rule.pathPrefix),
          )
          if (isAllowed) return
        }
        consoleErrors.push(text)
      })
      page.on('pageerror', (error) => {
        consoleLog.push(`[pageerror] ${error.message}`)
        consoleErrors.push(`pageerror: ${error.message}`)
      })
      page.on('request', (request) => {
        const url = new URL(request.url())
        if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) return
        if (!LOOPBACK_HOSTS.has(url.hostname)) offLoopback.push(url.origin)
      })

      await use({
        allowForcedStatus: (status, pathPrefix) =>
          allowed.push({ status, pathPrefix }),
      })

      if (consoleLog.length > 0) {
        await testInfo.attach('console', {
          body: consoleLog.join('\n'),
          contentType: 'text/plain',
        })
      }
      expect(violations, 'CSP violations').toEqual([])
      expect(consoleErrors, 'console errors').toEqual([])
      expect(offLoopback, 'requests that left loopback').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

export interface Modes {
  qbit?: 'normal' | 'down' | 'slow' | 'rejected'
  front?: 'normal' | 'down' | 'cloudflare'
  data?: 'sample' | 'many' | 'empty' | 'archived'
  grow?: '0' | '1'
}

export const DEFAULT_MODES: Required<Modes> = {
  qbit: 'normal',
  front: 'normal',
  data: 'sample',
  grow: '0',
}

/** Switches the fake server through its loopback-only control route. */
export async function setModes(request: APIRequestContext, modes: Modes) {
  const query = new URLSearchParams(Object.entries(modes)).toString()
  const response = await request.post(`/__fake/mode?${query}`)
  expect(response.ok(), await response.text()).toBe(true)
}

export async function login(page: Page) {
  await page.goto('/login')
  await page.getByLabel('帳號').fill(FAKE_USER)
  await page.getByLabel('密碼', { exact: true }).fill(FAKE_PASS)
  await page.getByRole('button', { name: '登入', exact: true }).click()
  await page.waitForURL('/')
  await expect(page.getByRole('listitem').first()).toBeVisible()
}
