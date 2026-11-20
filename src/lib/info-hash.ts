import {
  decodeBencode,
  dictEntries,
  dictValue,
  isByteStringList,
  listItems,
  readBytes,
  readInteger,
} from '#/lib/bencode'
import type { BSpan } from '#/lib/bencode'
import { createSha1 } from '#/lib/sha1'
import {
  ADD_FORM_ENTRY_ALLOWANCE,
  MAX_TORRENT_FILE_BYTES,
  magnetSendText,
} from '#/shared/torrent-add'

// AR-41, story 4.5: the only place info hashes are worked out. A .torrent's
// hash is the SHA-1 of the exact raw bytes of its top-level `info` value
// (BEP 3), never a re-encoding; a magnet's is its `xt=urn:btih:` (BEP 9, 40
// hex or 32 base32). Both come out as lowercase 40-char hex, the form every
// comparison uses. v2-only torrents (BEP 52, no v1 `pieces`) and magnets
// with only `btmh` are unreadable for now (epics.md). Names are plain
// strings for text rendering.

export interface TorrentFileInfo {
  kind: 'file'
  hash: string
  /**
   * `name.utf-8`, else `name` (a torrent with neither is unreadable), UTF-8
   * decoded with replacement characters.
   */
  name: string
  /** What the torrent downloads (padding files left out). */
  contentBytes: number
  /** The .torrent file itself, for batching. */
  fileBytes: number
}

export interface MagnetInfo {
  kind: 'magnet'
  hash: string
  /** The magnet's `dn`, or `null` when it has none. */
  name: string | null
  /** The link's UTF-8 length: what it adds to an add request's form. */
  linkBytes: number
}

export type TorrentInfo = TorrentFileInfo | MagnetInfo

export type UnreadableReason = 'link' | 'file' | 'too-large'

export interface Unreadable {
  kind: 'unreadable'
  reason: UnreadableReason
}

export type ReadResult = TorrentInfo | Unreadable

/** What `readTorrentFile` reads; a browser `File` or `Blob` fits as is. */
export interface TorrentFileSource {
  readonly size: number
  arrayBuffer: () => Promise<ArrayBuffer>
}

export interface ReadTorrentOptions {
  /**
   * Gives the main thread back; awaited between hashing chunks and between
   * files. The caller injects it (src/lib has no timer or DOM APIs).
   */
  yieldToMain: () => Promise<void>
}

/** The most `info` bytes hashed between two yields. */
export const HASH_CHUNK_BYTES = 1024 * 1024

const unreadable = (reason: UnreadableReason): Readonly<Unreadable> =>
  Object.freeze({ kind: 'unreadable', reason })
const UNREADABLE_FILE = unreadable('file')
const TOO_LARGE = unreadable('too-large')
const UNREADABLE_LINK = unreadable('link')

const utf8 = new TextDecoder('utf-8', { fatal: false })
const utf8Encoder = new TextEncoder()

/**
 * Reads one .torrent. Over 10 MB is judged from `size` alone and the bytes
 * are never read. Never throws: a file that cannot be read or parsed is
 * 看不懂這個檔案.
 */
export async function readTorrentFile(
  file: TorrentFileSource,
  options: ReadTorrentOptions,
): Promise<TorrentFileInfo | Unreadable> {
  if (file.size > MAX_TORRENT_FILE_BYTES) return TOO_LARGE
  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await file.arrayBuffer())
  } catch {
    return UNREADABLE_FILE
  }
  if (bytes.length > MAX_TORRENT_FILE_BYTES) return TOO_LARGE

  // Checking the whole file and reading the `info` fields each walk every
  // value once; a yield between them keeps a file with a huge `files` list
  // from becoming one long slice.
  const decoded = decodeBencode(bytes)
  if (!decoded.ok) return UNREADABLE_FILE
  await options.yieldToMain()
  const parsed = await parseTorrent(bytes, decoded.root, options.yieldToMain)
  if (parsed === null) return UNREADABLE_FILE

  const sha1 = createSha1()
  const info = bytes.subarray(parsed.infoStart, parsed.infoEnd)
  for (let offset = 0; offset < info.length; offset += HASH_CHUNK_BYTES) {
    await options.yieldToMain()
    sha1.update(info.subarray(offset, offset + HASH_CHUNK_BYTES))
  }
  return {
    kind: 'file',
    hash: sha1.digestHex(),
    name: parsed.name,
    contentBytes: parsed.contentBytes,
    fileBytes: bytes.length,
  }
}

/** Reads several .torrent files in order, yielding between files. */
export async function readTorrentFiles(
  files: ReadonlyArray<TorrentFileSource>,
  options: ReadTorrentOptions,
): Promise<Array<TorrentFileInfo | Unreadable>> {
  const results: Array<TorrentFileInfo | Unreadable> = []
  for (const [index, file] of files.entries()) {
    if (index > 0) await options.yieldToMain()
    results.push(await readTorrentFile(file, options))
  }
  return results
}

interface ParsedTorrent {
  infoStart: number
  infoEnd: number
  name: string
  contentBytes: number
}

/** libtorrent keeps `piece length` in a signed 32-bit int. */
const MAX_PIECE_LENGTH = 0x7fffffff

/**
 * The `info` span, name and content size of a v1 or hybrid torrent, or
 * `null` for these cases libtorrent also refuses: no usable name, a `piece
 * length` outside 1 to 2^31 - 1, `pieces` that do not match the size, or a
 * size that is neither a valid `files` nor a valid single-file `length`.
 */
async function parseTorrent(
  bytes: Uint8Array,
  root: BSpan,
  yieldToMain: () => Promise<void>,
): Promise<ParsedTorrent | null> {
  const infoSpan = dictEntries(bytes, root)?.get('info')
  if (infoSpan === undefined) return null
  const info = dictEntries(bytes, infoSpan)
  if (info === null) return null

  const name = nameOf(bytes, info)
  if (name === null) return null
  const pieceLength = readInteger(bytes, info.get('piece length'))
  if (
    pieceLength === null ||
    !Number.isSafeInteger(pieceLength) ||
    pieceLength <= 0 ||
    pieceLength > MAX_PIECE_LENGTH
  ) {
    return null
  }
  const sizes = await v1Sizes(bytes, info, yieldToMain)
  if (sizes === null) return null
  // v1 needs `pieces` (a hybrid has it too); v2-only has none. One 20-byte
  // hash per piece, the last piece possibly short.
  const pieces = readBytes(bytes, info.get('pieces'))
  if (
    pieces === null ||
    pieces.length === 0 ||
    pieces.length !== Math.ceil(sizes.total / pieceLength) * 20
  ) {
    return null
  }
  return {
    infoStart: infoSpan.start,
    infoEnd: infoSpan.end,
    name,
    contentBytes: sizes.content,
  }
}

function lengthOf(
  bytes: Uint8Array,
  span: BSpan | null | undefined,
): number | null {
  const value = readInteger(bytes, span)
  return value !== null && Number.isSafeInteger(value) && value >= 0
    ? value
    : null
}

/** Files checked between two yields in a multi-file `info`. */
const FILES_PER_SLICE = 5000

const PADDING_ATTR = 0x70 // `p` in a file's `attr` (BEP 47)

interface V1Sizes {
  /** Every byte the pieces cover, padding files included. */
  total: number
  /** What the torrent downloads, padding files left out. */
  content: number
}

/**
 * With `files` (libtorrent then ignores `length`), a multi-file info: a
 * non-empty list, each file with a valid `length` and a `path` of byte
 * strings. Without `files`, a single-file info with a valid `length`.
 * Anything else, or a total past 2^53, is `null`.
 */
async function v1Sizes(
  bytes: Uint8Array,
  info: ReadonlyMap<string, BSpan>,
  yieldToMain: () => Promise<void>,
): Promise<V1Sizes | null> {
  const filesSpan = info.get('files')
  if (filesSpan === undefined) {
    const length = lengthOf(bytes, info.get('length'))
    return length === null ? null : { total: length, content: length }
  }
  const files = listItems(bytes, filesSpan)
  if (files === null || files.length === 0) return null
  let total = 0
  let content = 0
  for (const [index, file] of files.entries()) {
    // A torrent with a huge `files` list checks it in parts, so a slow CPU
    // (a phone, a shared CI runner) never runs one long slice.
    if (index > 0 && index % FILES_PER_SLICE === 0) await yieldToMain()
    const fileLength = lengthOf(bytes, dictValue(bytes, file, 'length'))
    if (fileLength === null) return null
    if (!isByteStringList(bytes, dictValue(bytes, file, 'path'))) return null
    total += fileLength
    const attr = readBytes(bytes, dictValue(bytes, file, 'attr'))
    if (!attr?.includes(PADDING_ATTR)) content += fileLength
  }
  return Number.isSafeInteger(total) ? { total, content } : null
}

/** `name.utf-8`, else `name`; `null` when neither is a non-empty string. */
function nameOf(
  bytes: Uint8Array,
  info: ReadonlyMap<string, BSpan>,
): string | null {
  for (const key of ['name.utf-8', 'name']) {
    const name = readBytes(bytes, info.get(key))
    if (name !== null && name.length > 0) return utf8.decode(name)
  }
  return null
}

/**
 * A magnet link's btih as lowercase hex, plus its `dn` and byte length.
 * Anything else (http links, plain words, `btmh` only, no btih that
 * converts, a link longer than `ADD_FORM_ENTRY_ALLOWANCE` bytes, which could
 * not fit an add request alone) is 看不懂這個連結.
 * Never fetches anything.
 */
export function parseMagnet(text: string): MagnetInfo | Unreadable {
  const trimmed = text.trim()
  if (!/^magnet:\?/i.test(trimmed)) return UNREADABLE_LINK
  // Story 4.7: measured as sent (spaces as `%20`), so the cap holds there.
  const linkBytes = utf8Encoder.encode(magnetSendText(trimmed)).length
  if (linkBytes > ADD_FORM_ENTRY_ALLOWANCE) return UNREADABLE_LINK
  const params = new URLSearchParams(trimmed.slice('magnet:?'.length))
  let hash: string | null = null
  // `xt`, or numbered `xt.1`, `xt.2` (BEP 9); the first btih that converts.
  for (const [key, value] of params) {
    if (!/^xt(\.\d+)?$/.test(key)) continue
    const match = /^urn:btih:(.*)$/i.exec(value)
    hash = match ? btihToHex(match[1]) : null
    if (hash !== null) break
  }
  if (hash === null) return UNREADABLE_LINK
  const dn = params.get('dn')
  return {
    kind: 'magnet',
    hash,
    name: dn === null || dn === '' ? null : dn,
    linkBytes,
  }
}

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** 40 hex or 32 base32 (RFC 4648, any case) to lowercase hex, else null. */
export function btihToHex(btih: string): string | null {
  if (/^[0-9a-f]{40}$/i.test(btih)) return btih.toLowerCase()
  // ASCII only: `toUpperCase()` maps letters like ſ, ı and ß into A-Z.
  if (!/^[A-Za-z2-7]{32}$/.test(btih)) return null
  let hex = ''
  let bits = 0
  let value = 0
  for (const char of btih.toUpperCase()) {
    const digit = BASE32_ALPHABET.indexOf(char)
    if (digit < 0) return null
    // Only the bits not yet written matter (at most 12).
    value = ((value << 5) | digit) & 0xfff
    bits += 5
    if (bits >= 8) {
      bits -= 8
      hex += ((value >>> bits) & 0xff).toString(16).padStart(2, '0')
    }
  }
  return hex
}
