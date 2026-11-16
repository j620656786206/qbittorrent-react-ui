import type { ErrorCode } from '#/shared/errors'

// AR-33, UX-DR96: the only place screen text for an error code comes from.
// Later stories add per-operation text here.
export const ERROR_TEXT: Readonly<Record<ErrorCode, string>> = {
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

export function errorText(code: ErrorCode): string {
  return ERROR_TEXT[code]
}
