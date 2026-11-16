import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ERROR_TEXT, errorText } from '#/lib/error-text'
import { ERROR_CODES, ERROR_MESSAGES } from '#/shared/errors'
import type { ErrorCode } from '#/shared/errors'

// Spec 1.3 matrix row 17: the screen text table from the spec's Design Notes.
const EXPECTED: Record<ErrorCode, string> = {
  not_logged_in: '請先登入',
  login_failed: '帳號或密碼不對',
  login_locked: '錯太多次了，15 分鐘後再試',
  cloudflare_expired: 'Cloudflare 登入過期了',
  home_unreachable: '連不到家裡的 NAS',
  qbit_unreachable: '家裡的 qBittorrent 沒有回應',
  qbit_auth_failed: '容器裡的 qBittorrent 密碼不對，要改 NAS 上的容器設定',
  qbit_rejected: 'qBittorrent 拒絕這個操作',
  timeout: 'qBittorrent 沒有回應，請再試一次',
  invalid_input: '送出的資料格式不對',
  settings_write_failed: '設定檔寫不進去',
  bad_origin: '請求來源不對',
}

const FAKE_URL = 'http://qbit.test.invalid:8080'
const EM_DASH = String.fromCharCode(0x2014)

beforeEach(() => vi.stubEnv('QBIT_URL', FAKE_URL))
afterEach(() => vi.unstubAllEnvs())

describe('errorText', () => {
  it('covers exactly the 12 error codes', () => {
    expect(Object.keys(ERROR_TEXT).sort()).toEqual([...ERROR_CODES].sort())
  })

  it.each(ERROR_CODES.map((code) => [code]))(
    'ERROR_MESSAGES.%s matches the screen text',
    (code) => {
      expect(ERROR_MESSAGES[code]).toBe(errorText(code))
    },
  )

  it.each(ERROR_CODES.map((code) => [code]))('%s', (code) => {
    const text = errorText(code)
    expect(text).toBe(EXPECTED[code])
    expect(text.length).toBeGreaterThan(0)
    expect(text).toMatch(/[一-鿿]/)
    expect(text).not.toContain(EM_DASH)
    expect(text).not.toContain('http')
    expect(text).not.toContain('qbit.test.invalid')
    expect(text).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/)
  })
})
