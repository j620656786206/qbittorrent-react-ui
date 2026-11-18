import { heroKindOf } from '#/lib/torrent-status'
import type { Maindata } from '#/lib/maindata-merge'
import type { SlimTorrent } from '#/shared/maindata'

// Story 2.10: the reason text of a torrent in qBittorrent's `error` state.
// qBittorrent 5.1.4 writes it only into its log (WARNING lines from
// SessionImpl::handleFileErrorAlert and SessionImpl::createTorrent), naming
// the torrent by name. Pure: parse one log line and pass its reason
// through an allow-list (a common OS error in Traditional Chinese, or plain
// English words; anything else is never shown). Sources:
// https://github.com/qbittorrent/qBittorrent/tree/release-5.1.4
// (src/base/bittorrent/sessionimpl.cpp, torrentimpl.cpp) and libtorrent
// 2.0.11 file_error_alert::message()
// (https://github.com/arvidn/libtorrent/blob/v2.0.11/src/alert.cpp).

/** The longest untranslated reason shown (Claude 代決); longer: none. */
export const ERROR_REASON_MAX_CHARS = 120

export interface ErrorLine {
  /** The torrent's name as qBittorrent wrote it. */
  name: string
  /**
   * The allowed or translated reason (never empty), or `null` when the line
   * is one of these but has nothing to show (the fixed text shows; it still
   * replaces an older reason).
   */
  reason: string | null
}

// qBittorrent writes these lines through tr(), so a qBittorrent set to
// Chinese writes them translated: English plus the 5.1.4 zh_TW, zh_HK and
// zh_CN strings (src/lang/qbittorrent_zh_*.ts at release-5.1.4). `s`: a
// name or reason may hold a line break. The name is the shortest match up
// to the next field, so a reason that quotes text cannot move it.
const FILE_ERRORS: ReadonlyArray<RegExp> = [
  /^File error alert\. Torrent: "(.*?)"\. File: "(.*?)"\. Reason: "(.*)"$/s,
  // zh_TW 原因, zh_HK 理由.
  /^檔案錯誤警告。Torrent：「(.*?)」。檔案：「(.*?)」。(?:原因|理由)：「(.*)」$/s,
  /^文件错误警报。Torrent：“(.*?)”。文件：“(.*?)”。原因：“(.*)”$/s,
]
const TORRENTS_ERRORED: ReadonlyArray<RegExp> = [
  /^Torrent errored\. Torrent: "(.*?)"\. Error: "(.*)"$/s,
  // zh_TW and zh_HK.
  /^Torrent 錯誤。Torrent：「(.*?)」。錯誤：「(.*)」$/s,
  /^Torrent 出错了。Torrent：“(.*?)”。错误：“(.*)”$/s,
]
const UPLOAD_ONLY: ReadonlyArray<RegExp> = [
  /^Couldn't write to file\. Reason: "(.*)"\. Torrent is now in "upload only" mode\.$/s,
  /^無法寫入檔案。原因：「(.*)」。Torrent 目前為「僅上傳」模式。$/s,
  /^無法寫入檔案。理由：「(.*)」。Torrent 目前處在「僅上傳」模式。$/s,
  /^无法写入文件。原因：“(.*)”。Torrent 目前处在 “仅上传” 模式。$/s,
]
/** libtorrent's file_error_alert ends with 「 error: <OS text>」 (English). */
const LIBTORRENT_ERROR = 'error: '

function firstMatch(
  patterns: ReadonlyArray<RegExp>,
  text: string,
): RegExpExecArray | null {
  for (const pattern of patterns) {
    const match = pattern.exec(text)
    if (match) return match
  }
  return null
}

/**
 * The raw reason of one log line (`null` raw: nothing safe to show), or
 * `null` for any other line.
 */
function rawReasonOf(
  message: string,
): { name: string; raw: string | null } | null {
  const file = firstMatch(FILE_ERRORS, message)
  if (file) {
    const reason = file[3]
    const at = reason.lastIndexOf(LIBTORRENT_ERROR)
    // Without the marker the reason is libtorrent's `<name> <op> (<file>)`
    // text: never shown.
    return {
      name: file[1],
      raw: at >= 0 ? reason.slice(at + LIBTORRENT_ERROR.length) : null,
    }
  }
  const errored = firstMatch(TORRENTS_ERRORED, message)
  if (errored) {
    const uploadOnly = firstMatch(UPLOAD_ONLY, errored[2])
    return { name: errored[1], raw: uploadOnly ? uploadOnly[1] : errored[2] }
  }
  return null
}

/**
 * The torrent name and shown reason of a qBittorrent log line that
 * explains an `error` state, or `null` for any other line. A recognised
 * line with nothing to show has `reason: null`.
 */
export function parseErrorLine(message: string): ErrorLine | null {
  const found = rawReasonOf(message)
  if (!found) return null
  return {
    name: found.name,
    reason: found.raw === null ? null : errorReasonText(found.raw),
  }
}

/** Known OS texts (the whole reason, any case), Claude 代決. */
const TRANSLATIONS: ReadonlyMap<string, string> = new Map([
  ['no such file or directory', '找不到檔案或資料夾'],
  ['no space left on device', '磁碟空間不足'],
  ['permission denied', '沒有權限'],
  ['operation not permitted', '沒有權限'],
  ['read-only file system', '磁碟是唯讀的'],
  ['input/output error', '磁碟讀寫錯誤'],
  ['i/o error', '磁碟讀寫錯誤'],
  ['file too large', '檔案太大'],
  ['transport endpoint is not connected', '磁碟連線中斷'],
  ['stale file handle', '檔案連結已失效'],
  ['disk quota exceeded', '超過磁碟配額'],
  ['too many open files', '開啟的檔案太多'],
  ['file name too long', '檔名太長'],
  ['is a directory', '這是資料夾，不是檔案'],
  ['not a directory', '路徑裡有一段不是資料夾'],
])

/**
 * An untranslated reason shown as written: English words, spaces and
 * `, ' -` only, at most ERROR_REASON_MAX_CHARS. No digit, dot, slash, `@`,
 * colon, bracket or non-ASCII letter, so no path, file name, address or
 * account can pass (Alex 2026-11-18, option A).
 */
const SAFE_REASON = new RegExp(
  `^[a-z][a-z ,'-]{0,${ERROR_REASON_MAX_CHARS - 1}}$`,
  'i',
)

/**
 * A raw reason as shown, or `null` (the fixed text shows). An allow-list:
 * a known OS error reads in Traditional Chinese, a reason of plain English
 * words stays as written, anything else is never shown. qBittorrent 5.1.4
 * fills these reasons from libtorrent error_code messages, which carry no
 * path, but its other log lines do carry whole paths, so nothing outside
 * the list leaves the container.
 */
export function errorReasonText(raw: string): string | null {
  const text = raw.replace(/\s+/g, ' ').trim()
  const translated = TRANSLATIONS.get(text.toLowerCase())
  if (translated) return translated
  return SAFE_REASON.test(text) ? text : null
}

/**
 * The torrent reads as qBittorrent's `error` state (the hero row
 * `error`, never missing files or an unknown code). A move keeps the row
 * it had before.
 */
export function isErroredTorrent(
  torrent: SlimTorrent,
  stateBeforeMove: Readonly<Record<string, string>>,
): boolean {
  return heroKindOf(torrent, stateBeforeMove) === 'error'
}

/** One scan per maindata snapshot, however many observers ask. */
const erroredBySnapshot = new WeakMap<object, boolean>()

/** `['maindata']` holds at least one torrent in the `error` state. */
export function hasErroredTorrent(
  maindata: Pick<Maindata, 'torrents' | 'stateBeforeMove'>,
): boolean {
  const cached = erroredBySnapshot.get(maindata)
  if (cached !== undefined) return cached
  let found = false
  for (const torrent of Object.values(maindata.torrents)) {
    if (isErroredTorrent(torrent, maindata.stateBeforeMove)) {
      found = true
      break
    }
  }
  erroredBySnapshot.set(maindata, found)
  return found
}

/** One torrent's reason from a hash-to-reason map, if it has one. */
export function reasonOf(
  reasons: Readonly<Record<string, string>> | undefined,
  hash: string,
): string | undefined {
  return reasons && Object.hasOwn(reasons, hash) ? reasons[hash] : undefined
}
