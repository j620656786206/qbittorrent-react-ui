// Story 4.5: the smallest bencode reader the info hash needs (BEP 3). It is
// strict and never throws: integers have no leading zeros and no `-0`,
// string lengths stay inside the input, dictionary keys are byte strings,
// and nothing may follow the top value; any violation is `{ ok: false }`.
//
// Values are byte spans into the input, read only when asked for. A .torrent
// with 150,000 files then parses without building 150,000 dictionaries that
// live until the end (measured: the eager version paused for GC past 100 ms),
// and the `info` span is sliced and hashed exactly as it appears in the file.

/**
 * A value's bytes: `input.subarray(start, end)`. The readers below take only
 * spans that `decodeBencode` (or another reader) returned for the same input.
 */
export interface BSpan {
  start: number
  end: number
}

export type DecodeResult = { ok: true; root: BSpan } | { ok: false }

/** Lists and dictionaries nested deeper than this are a parse failure. */
export const MAX_BENCODE_DEPTH = 512

const CHAR_I = 0x69
const CHAR_L = 0x6c
const CHAR_D = 0x64
const CHAR_E = 0x65
const CHAR_COLON = 0x3a
const CHAR_MINUS = 0x2d
const CHAR_0 = 0x30
const CHAR_9 = 0x39

/** Thrown inside the reader only; callers get `ok: false` or `null`. */
const FAIL = new Error('bencode parse failure')

const isDigit = (byte: number | undefined) =>
  byte !== undefined && byte >= CHAR_0 && byte <= CHAR_9

// The helpers below return plain offsets (no tuples): a `files` list of
// 150,000 entries walks them millions of times.

/** Checks the digits at `pos` (a leading zero only alone); returns the end. */
function digitsEnd(bytes: Uint8Array, pos: number): number {
  let end = pos
  while (isDigit(bytes[end])) end++
  if (end === pos) throw FAIL
  if (bytes[pos] === CHAR_0 && end - pos > 1) throw FAIL
  return end
}

function digitsValue(bytes: Uint8Array, start: number, end: number): number {
  let value = 0
  for (let i = start; i < end; i++) value = value * 10 + (bytes[i] - CHAR_0)
  return value
}

/** The first content byte of the byte string at `pos`. */
function stringStart(bytes: Uint8Array, pos: number): number {
  const colon = digitsEnd(bytes, pos)
  if (bytes[colon] !== CHAR_COLON) throw FAIL
  return colon + 1
}

/** Checks the byte string at `pos`; returns the offset just past it. */
function stringEnd(bytes: Uint8Array, pos: number): number {
  const start = stringStart(bytes, pos)
  const length = digitsValue(bytes, pos, start - 1)
  if (length > bytes.length - start) throw FAIL
  return start + length
}

/** Checks the integer at `pos`; returns the offset just past it. */
function integerEnd(bytes: Uint8Array, pos: number): number {
  let at = pos + 1
  const negative = bytes[at] === CHAR_MINUS
  if (negative) at++
  const end = digitsEnd(bytes, at)
  if (negative && bytes[at] === CHAR_0) throw FAIL // `-0`
  if (bytes[end] !== CHAR_E) throw FAIL
  return end + 1
}

/** Checks the value at `pos` and returns the offset just past it. */
function skip(bytes: Uint8Array, pos: number, depth: number): number {
  const byte = bytes[pos]
  if (byte === CHAR_I) return integerEnd(bytes, pos)
  if (isDigit(byte)) return stringEnd(bytes, pos)
  if (byte !== CHAR_L && byte !== CHAR_D) throw FAIL
  if (depth >= MAX_BENCODE_DEPTH) throw FAIL
  let at = pos + 1
  while (bytes[at] !== CHAR_E) {
    if (at >= bytes.length) throw FAIL
    if (byte === CHAR_D) {
      if (!isDigit(bytes[at])) throw FAIL
      at = stringEnd(bytes, at)
    }
    at = skip(bytes, at, depth + 1)
  }
  return at + 1
}

function attempt<T>(read: () => T): T | null {
  try {
    return read()
  } catch (error) {
    if (error === FAIL) return null
    throw error
  }
}

/** Checks that `bytes` is exactly one well-formed value. */
export function decodeBencode(bytes: Uint8Array): DecodeResult {
  const end = attempt(() => skip(bytes, 0, 0))
  if (end === null || end !== bytes.length) return { ok: false }
  return { ok: true, root: { start: 0, end } }
}

/**
 * A dictionary's entries by key (the key bytes read as Latin-1, lossless),
 * or `null` when the span is not a dictionary. A repeated key keeps its
 * first value; keys may come in any order.
 */
export function dictEntries(
  bytes: Uint8Array,
  span: BSpan,
): Map<string, BSpan> | null {
  if (bytes[span.start] !== CHAR_D) return null
  return attempt(() => {
    const entries = new Map<string, BSpan>()
    let at = span.start + 1
    while (at < span.end - 1) {
      const keyStart = stringStart(bytes, at)
      const keyEnd = stringEnd(bytes, at)
      const end = skip(bytes, keyEnd, 0)
      const key = latin1(bytes, keyStart, keyEnd)
      if (!entries.has(key)) entries.set(key, { start: keyEnd, end })
      at = end
    }
    return entries
  })
}

/**
 * One dictionary value by key (ASCII), without building the whole map: the
 * cheap lookup for the many small dictionaries of a `files` list. `null`
 * when the span is not a dictionary or has no such key.
 */
export function dictValue(
  bytes: Uint8Array,
  span: BSpan,
  key: string,
): BSpan | null {
  if (bytes[span.start] !== CHAR_D) return null
  return attempt(() => {
    let at = span.start + 1
    while (at < span.end - 1) {
      const keyStart = stringStart(bytes, at)
      const keyEnd = stringEnd(bytes, at)
      const end = skip(bytes, keyEnd, 0)
      if (keyEnd - keyStart === key.length) {
        let same = true
        for (let i = 0; i < key.length && same; i++) {
          same = bytes[keyStart + i] === key.charCodeAt(i)
        }
        if (same) return { start: keyEnd, end }
      }
      at = end
    }
    return null
  })
}

/** A list's items, or `null` when the span is not a list. */
export function listItems(bytes: Uint8Array, span: BSpan): Array<BSpan> | null {
  if (bytes[span.start] !== CHAR_L) return null
  return attempt(() => {
    const items: Array<BSpan> = []
    let at = span.start + 1
    while (at < span.end - 1) {
      const end = skip(bytes, at, 0)
      items.push({ start: at, end })
      at = end
    }
    return items
  })
}

/**
 * A non-empty list whose items are all byte strings (a file's `path`),
 * checked without building the item list.
 */
export function isByteStringList(
  bytes: Uint8Array,
  span: BSpan | null | undefined,
): boolean {
  if (!span || bytes[span.start] !== CHAR_L) return false
  if (span.end - span.start === 2) return false // `le`
  return (
    attempt(() => {
      let at = span.start + 1
      while (at < span.end - 1) {
        if (!isDigit(bytes[at])) return false
        at = stringEnd(bytes, at)
      }
      return true
    }) ?? false
  )
}

/** An integer's value, or `null` when the span is not an integer. */
export function readInteger(
  bytes: Uint8Array,
  span: BSpan | null | undefined,
): number | null {
  if (!span || bytes[span.start] !== CHAR_I) return null
  return attempt(() => {
    const end = integerEnd(bytes, span.start)
    const negative = bytes[span.start + 1] === CHAR_MINUS
    const value = digitsValue(bytes, span.start + (negative ? 2 : 1), end - 1)
    return negative ? -value : value
  })
}

/** A byte string's content, or `null` when the span is not a string. */
export function readBytes(
  bytes: Uint8Array,
  span: BSpan | null | undefined,
): Uint8Array | null {
  if (!span || !isDigit(bytes[span.start])) return null
  return attempt(() =>
    bytes.subarray(
      stringStart(bytes, span.start),
      stringEnd(bytes, span.start),
    ),
  )
}

function latin1(bytes: Uint8Array, start: number, end: number): string {
  let text = ''
  for (let i = start; i < end; i++) text += String.fromCharCode(bytes[i])
  return text
}
