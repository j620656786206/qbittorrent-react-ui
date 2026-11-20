import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ADD_FILE_REJECTED,
  ADD_LINK_REJECTED,
  ADD_NOT_SENT,
  ERROR_TEXT,
  FILES_LOAD_FAILED,
  LIST_LOAD_FAILED,
  OPERATION_FAILURE_CODES,
  SETTINGS_WRITE_FAILURE_CODES,
  COMMON_PATHS_FULL,
  SAVE_PATH_REASONS,
  addCommonPathFailureText,
  addFailureText,
  addItemFailureText,
  errorText,
  fileActionFailureText,
  orderSaveFailureText,
  pauseActionFailureText,
  savePathFormatReason,
  setLocationFailureText,
  sortSaveFailureText,
} from '#/lib/error-text'
import { ERROR_CODES } from '#/shared/errors'
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
  bad_origin: '請求來源不對，要檢查容器的 APP_ORIGINS 設定',
}

const FAKE_URL = 'http://qbit.test.invalid:8080'
const EM_DASH = String.fromCharCode(0x2014)

beforeEach(() => vi.stubEnv('QBIT_URL', FAKE_URL))
afterEach(() => vi.unstubAllEnvs())

describe('errorText', () => {
  it('covers exactly the 12 error codes', () => {
    expect(Object.keys(ERROR_TEXT).sort()).toEqual([...ERROR_CODES].sort())
  })

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

describe('LIST_LOAD_FAILED (spec 1.8 V2)', () => {
  it('is the option A wording, plain Chinese, no dash', () => {
    expect(LIST_LOAD_FAILED).toBe('讀不到種子清單')
    expect(LIST_LOAD_FAILED).not.toContain(EM_DASH)
  })
})

describe('pause and resume failure text (spec 2.6 F1)', () => {
  it('handles exactly qbit_rejected, timeout and invalid_input', () => {
    expect([...OPERATION_FAILURE_CODES]).toEqual([
      'qbit_rejected',
      'timeout',
      'invalid_input',
    ])
  })

  it.each([
    ['stop', 'qbit_rejected', '暫停失敗：qBittorrent 拒絕這個操作'],
    ['stop', 'timeout', '暫停失敗：qBittorrent 沒有回應，請再試一次'],
    ['stop', 'invalid_input', '暫停失敗：送出的資料格式不對'],
    ['start', 'qbit_rejected', '繼續失敗：qBittorrent 拒絕這個操作'],
    ['start', 'timeout', '繼續失敗：qBittorrent 沒有回應，請再試一次'],
    ['start', 'invalid_input', '繼續失敗：送出的資料格式不對'],
  ] as const)('%s %s', (action, code, text) => {
    expect(pauseActionFailureText(action, code)).toBe(text)
    expect(text).not.toContain(EM_DASH)
  })

  it.each([
    ['qbit_rejected', '改檔案設定失敗：qBittorrent 拒絕這個操作'],
    ['timeout', '改檔案設定失敗：qBittorrent 沒有回應，請再試一次'],
    ['invalid_input', '改檔案設定失敗：送出的資料格式不對'],
  ] as const)('story 2.7 files tab %s', (code, text) => {
    expect(fileActionFailureText(code)).toBe(text)
    expect(text).not.toContain(EM_DASH)
  })

  it('story 2.7 the files tab load failure reads 讀不到檔案清單', () => {
    expect(FILES_LOAD_FAILED).toBe('讀不到檔案清單')
  })
})

describe('sort save failure text (story 3.1)', () => {
  it('a settings write handles settings_write_failed, timeout and invalid_input', () => {
    expect([...SETTINGS_WRITE_FAILURE_CODES]).toEqual([
      'settings_write_failed',
      'timeout',
      'invalid_input',
    ])
  })

  it.each([
    ['settings_write_failed', '排序沒記住：設定檔寫不進去'],
    ['timeout', '排序沒記住：容器沒有回應，請再試一次'],
    ['invalid_input', '排序沒記住：送出的資料格式不對'],
  ] as const)('%s', (code, text) => {
    expect(sortSaveFailureText(code)).toBe(text)
    expect(text).not.toContain(EM_DASH)
  })
})

describe('order save failure text (story 3.3)', () => {
  it.each([
    ['settings_write_failed', '順序沒存到：設定檔寫不進去'],
    ['timeout', '順序沒存到：容器沒有回應，請再試一次'],
    ['invalid_input', '順序沒存到：送出的資料格式不對'],
  ] as const)('%s', (code, text) => {
    expect(orderSaveFailureText(code)).toBe(text)
    expect(text).not.toContain(EM_DASH)
  })
})

describe('add failure text (spec 4.7)', () => {
  it('the whole-request toast reads 新增失敗：<reason>', () => {
    expect(addFailureText('qbit_rejected')).toBe(
      '新增失敗：qBittorrent 拒絕這個操作',
    )
    expect(addFailureText('timeout')).toBe(
      '新增失敗：qBittorrent 沒有回應，請再試一次',
    )
    expect(addFailureText('invalid_input')).toBe('新增失敗：送出的資料格式不對')
  })

  it('a row reason names the rejected file or link; other codes keep their text', () => {
    expect(ADD_FILE_REJECTED).toBe('qBittorrent 讀不了這個檔案')
    expect(ADD_LINK_REJECTED).toBe('qBittorrent 拒絕這個連結')
    expect(ADD_NOT_SENT).toBe('沒有送出，請再試一次')
    expect(addItemFailureText('qbit_rejected', 'file')).toBe(ADD_FILE_REJECTED)
    expect(addItemFailureText('qbit_rejected', 'magnet')).toBe(
      ADD_LINK_REJECTED,
    )
    for (const kind of ['file', 'magnet'] as const) {
      expect(addItemFailureText('timeout', kind)).toBe(
        'qBittorrent 沒有回應，請再試一次',
      )
      expect(addItemFailureText('qbit_unreachable', kind)).toBe(
        '家裡的 qBittorrent 沒有回應',
      )
    }
  })
})

describe('change path texts (spec 5.2)', () => {
  it('the move failure toast reads 改路徑失敗：<reason>; invalid_input names the download folders', () => {
    expect(setLocationFailureText('qbit_rejected')).toBe(
      '改路徑失敗：qBittorrent 拒絕這個操作',
    )
    expect(setLocationFailureText('timeout')).toBe(
      '改路徑失敗：qBittorrent 沒有回應，請再試一次',
    )
    expect(setLocationFailureText('invalid_input')).toBe(
      '改路徑失敗：這個路徑不在允許的下載資料夾底下',
    )
  })

  it('加到常用: full list only for invalid_input with 50 listed; else the settings-write reason', () => {
    expect(COMMON_PATHS_FULL).toBe('常用路徑最多 50 個')
    expect(addCommonPathFailureText('invalid_input', true)).toBe(
      COMMON_PATHS_FULL,
    )
    // The name is built by the client: a refused input is the path.
    expect(addCommonPathFailureText('invalid_input', false)).toBe(
      '沒加到常用：這個路徑不在允許的下載資料夾底下',
    )
    expect(addCommonPathFailureText('settings_write_failed', true)).toBe(
      '沒加到常用：設定檔寫不進去',
    )
    expect(addCommonPathFailureText('timeout', false)).toBe(
      '沒加到常用：容器沒有回應，請再試一次',
    )
  })

  it.each([
    ['/data/media/tv', null],
    ['/data/media/tv/', null],
    ['/', null],
    ['', SAVE_PATH_REASONS.relative],
    ['data/tv', SAVE_PATH_REASONS.relative],
    ['/data/../x', SAVE_PATH_REASONS.dotDot],
    ['data/../x', SAVE_PATH_REASONS.relative],
    [`/${'x'.repeat(1024)}`, SAVE_PATH_REASONS.tooLong],
    [`/${'x'.repeat(1023)}`, null],
    [`/${'x'.repeat(1023)}/`, null],
    ['/data/a\\b', SAVE_PATH_REASONS.badCharacter],
    ['/data/a\tb', SAVE_PATH_REASONS.badCharacter],
  ])('the 會搬到 reason for %j', (text, reason) => {
    expect(savePathFormatReason(text)).toBe(reason)
  })

  it('the box reasons read as the spec says', () => {
    expect(SAVE_PATH_REASONS).toEqual({
      relative: '路徑要從 / 開頭',
      dotDot: '路徑不能有 ..',
      tooLong: '路徑太長',
      badCharacter: '路徑不能有反斜線或控制字元',
    })
  })
})
