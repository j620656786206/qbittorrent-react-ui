// AD-9 error contract. Adding a code means changing the architecture spine first.

export const ERROR_CODES = [
  'not_logged_in',
  'login_failed',
  'login_locked',
  'cloudflare_expired',
  'home_unreachable',
  'qbit_unreachable',
  'qbit_auth_failed',
  'qbit_rejected',
  'timeout',
  'invalid_input',
  'settings_write_failed',
  'bad_origin',
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

// The only text a server function may put in `message`. Screen text comes from
// `src/lib/error-text.ts`; these strings must equal it (UX-DR96 wording,
// enforced by src/lib/error-text.test.ts).
export const ERROR_MESSAGES: Readonly<Record<ErrorCode, string>> = {
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

export type Success<T> = { ok: true; data: T }
export type Failure = { ok: false; error: { code: ErrorCode; message: string } }
export type Result<T> = Success<T> | Failure

export function ok<T>(data: T): Success<T> {
  return { ok: true, data }
}

export function fail(code: ErrorCode): Failure {
  return { ok: false, error: { code, message: ERROR_MESSAGES[code] } }
}

export function isErrorCode(value: unknown): value is ErrorCode {
  return (ERROR_CODES as ReadonlyArray<unknown>).includes(value)
}
