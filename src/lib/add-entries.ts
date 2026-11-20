import type { ReadResult, UnreadableReason } from '#/lib/info-hash'
import {
  MAX_ADD_ENTRIES,
  MAX_ADD_REQUEST_BYTES,
  addFormAllowance,
} from '#/shared/torrent-add'

// Story 4.5 (FR-38, EXPERIENCE 〔新增種子〕 判斷和驗證): what the add screen
// (4.6) and submit (4.7) do with entries once they are read. Each entry is
// judged against every torrent in maindata (archived ones too), a repeated
// hash merges into its first occurrence, and the list puts problems first.
// Input order is the tie-break everywhere.

/** Whitespace, plus the zero-width characters chat apps leave in links. */
const PASTE_SPACE = /[\s\u200b-\u200d\u2060\ufeff]+/

/** A magnet whose last parameter is `dn=`: a space here is inside the name. */
const OPEN_DN = /^magnet:\?(?:.*&)?dn=[^&]*$/i

/**
 * Pasted text, one entry per line, and within a line one per token between
 * spaces or tabs. A token after a magnet that ends in `dn=…` joins it with a
 * space (an unencoded space in the name, as chat apps copy it), unless the
 * token starts with a URI scheme (another magnet, an https link).
 */
export function splitPaste(text: string): Array<string> {
  const entries: Array<string> = []
  for (const line of text.split(/\r\n|\r|\n/)) {
    let last: string | null = null
    for (const token of line.split(PASTE_SPACE)) {
      if (token === '') continue
      if (
        last !== null &&
        OPEN_DN.test(last) &&
        !/^[a-z][a-z0-9+.-]*:/i.test(token)
      ) {
        last = `${last} ${token}`
        entries[entries.length - 1] = last
        continue
      }
      last = token
      entries.push(token)
    }
  }
  return entries
}

/** What 4.6 and 4.7 keep per entry; they add their own fields (the source). */
export interface AddEntry {
  result: ReadResult
}

export type EntryStatus = 'unreadable' | 'existing' | 'addable'

export interface JudgedEntry<TEntry extends AddEntry> {
  entry: TEntry
  status: EntryStatus
  /** The row's marking, or `null` for an addable entry. */
  label: string | null
}

/** The only place the entry labels come from. */
export const ENTRY_LABELS: Readonly<
  Record<UnreadableReason | 'existing', string>
> = {
  link: '看不懂這個連結',
  file: '看不懂這個檔案',
  'too-large': '檔案超過 10 MB',
  existing: '以前下載過，已整理好',
}

const STATUS_ORDER: ReadonlyArray<EntryStatus> = [
  'unreadable',
  'existing',
  'addable',
]

/**
 * Labels and orders the entries: unreadable first, then already in
 * qBittorrent, then addable, input order inside each group (unreadable
 * links, files and too-large files are not sorted by reason). Two entries with one hash (a magnet's hex and base32, or a magnet
 * and its .torrent) become one row, the first. `existingHashes` is every
 * maindata hash, lowercase hex, archived included.
 */
export function judgeEntries<TEntry extends AddEntry>(
  entries: ReadonlyArray<TEntry>,
  existingHashes: ReadonlySet<string>,
): Array<JudgedEntry<TEntry>> {
  const seen = new Set<string>()
  const judged: Array<JudgedEntry<TEntry>> = []
  for (const entry of entries) {
    const { result } = entry
    if (result.kind === 'unreadable') {
      judged.push({
        entry,
        status: 'unreadable',
        label: ENTRY_LABELS[result.reason],
      })
      continue
    }
    if (seen.has(result.hash)) continue
    seen.add(result.hash)
    judged.push(
      existingHashes.has(result.hash)
        ? { entry, status: 'existing', label: ENTRY_LABELS.existing }
        : { entry, status: 'addable', label: null },
    )
  }
  return STATUS_ORDER.flatMap((status) =>
    judged.filter((item) => item.status === status),
  )
}

/** The bytes an entry puts in the form besides its allowance. */
function formBytes(entry: AddEntry): number {
  const { result } = entry
  if (result.kind === 'file') return result.fileBytes
  if (result.kind === 'magnet') return result.linkBytes
  return 0
}

/**
 * Splits the addable entries into `addTorrents` requests, in input order:
 * at most `MAX_ADD_ENTRIES` each (magnets and files together), and the
 * .torrent bytes, the magnet links' UTF-8 bytes and the form allowance
 * together never over `MAX_ADD_REQUEST_BYTES`.
 * A new batch starts before the entry that would cross either limit. Every
 * addable entry fits a batch alone: a .torrent is at most
 * `MAX_TORRENT_FILE_BYTES` and `parseMagnet` refuses links longer than
 * `ADD_FORM_ENTRY_ALLOWANCE`.
 */
export function addBatches<TEntry extends AddEntry>(
  addable: ReadonlyArray<TEntry>,
): Array<Array<TEntry>> {
  const batches: Array<Array<TEntry>> = []
  let batch: Array<TEntry> = []
  let bytes = 0
  for (const entry of addable) {
    const size = formBytes(entry)
    const fits =
      batch.length < MAX_ADD_ENTRIES &&
      bytes + size + addFormAllowance(batch.length + 1) <= MAX_ADD_REQUEST_BYTES
    if (!fits && batch.length > 0) {
      batches.push(batch)
      batch = []
      bytes = 0
    }
    batch.push(entry)
    bytes += size
  }
  if (batch.length > 0) batches.push(batch)
  return batches
}
