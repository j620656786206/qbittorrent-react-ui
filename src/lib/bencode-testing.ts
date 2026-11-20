// Test-only: a bencode encoder and generated .torrent files (story 4.5). No
// real torrent files, tracker URLs or private category names; names use the
// code names X and mteam-X only.

/** What the encoder takes. Objects keep their insertion order (not sorted). */
export type Bencodable =
  | number
  | string
  | Uint8Array
  | ReadonlyArray<Bencodable>
  | { readonly [key: string]: Bencodable }

const utf8 = new TextEncoder()

export function bencode(value: Bencodable): Uint8Array {
  const parts: Array<Uint8Array> = []
  const push = (text: string) => parts.push(utf8.encode(text))
  const encode = (item: Bencodable): void => {
    if (typeof item === 'number') {
      push(`i${item}e`)
    } else if (typeof item === 'string') {
      const bytes = utf8.encode(item)
      push(`${bytes.length}:`)
      parts.push(bytes)
    } else if (item instanceof Uint8Array) {
      push(`${item.length}:`)
      parts.push(item)
    } else if (Array.isArray(item)) {
      push('l')
      for (const child of item as ReadonlyArray<Bencodable>) encode(child)
      push('e')
    } else {
      push('d')
      for (const [key, child] of Object.entries(item)) {
        encode(key)
        encode(child)
      }
      push('e')
    }
  }
  encode(value)
  return concat(parts)
}

export function concat(parts: ReadonlyArray<Uint8Array>): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

/** `count` fake 20-byte piece hashes. */
export function fakePieces(count: number): Uint8Array {
  const pieces = new Uint8Array(count * 20)
  for (let i = 0; i < pieces.length; i++) pieces[i] = (i * 7 + 3) & 0xff
  return pieces
}

/** The piece hashes a valid torrent of `total` bytes needs. */
export function piecesFor(total: number, pieceLength: number): Uint8Array {
  return fakePieces(Math.ceil(total / pieceLength))
}

/**
 * A valid v1 single-file info dictionary, keys sorted as clients write them
 * (overrides included). Unless overridden, `pieces` matches `length` and
 * `piece length`.
 */
export function singleFileInfo(overrides: { [key: string]: Bencodable } = {}): {
  [key: string]: Bencodable
} {
  const merged: { [key: string]: Bencodable } = {
    length: 1_234_567,
    name: 'Fake.Show.S01E01.1080p.mkv',
    'piece length': 262_144,
    ...overrides,
  }
  const { length, 'piece length': pieceLength } = merged
  if (
    !('pieces' in overrides) &&
    typeof length === 'number' &&
    typeof pieceLength === 'number'
  ) {
    merged.pieces = piecesFor(length, pieceLength)
  }
  return Object.fromEntries(
    Object.entries(merged).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  )
}

/** A torrent around `info`, with an announce URL that resolves nowhere. */
export function torrentBytes(
  info: Bencodable,
  extra: { [key: string]: Bencodable } = {},
): Uint8Array {
  return bencode({
    announce: 'http://tracker.invalid/announce',
    'created by': 'react-torrent tests',
    ...extra,
    info,
  })
}

/**
 * A valid v1 torrent of exactly `size` bytes: the pieces fill most of it
 * and a top-level `comment` pads the rest. The `info` value is almost the
 * whole file, so hashing it is the worst case for that size.
 */
export function torrentOfSize(
  size: number,
  name = 'Fake.Show.S01',
): Uint8Array {
  const pieceLength = 262_144
  const base = (pieceCount: number, comment: string) =>
    torrentBytes(
      singleFileInfo({
        length: pieceCount * pieceLength,
        name,
        'piece length': pieceLength,
      }),
      { comment },
    )
  // Start a little under the size (the rest of the file is a few hundred
  // bytes) and step down until a comment length lands exactly.
  for (
    let pieceCount = Math.floor(Math.max(0, size - 400) / 20);
    pieceCount >= 0;
    pieceCount--
  ) {
    const empty = base(pieceCount, '').length
    if (empty <= size) {
      // `0:` grows to `<digits(c)>:<c bytes>`; find c that lands exactly.
      const need = size - empty
      for (let c = Math.max(0, need - 12); c <= need; c++) {
        if (String(c).length - 1 + c === need) {
          const bytes = base(pieceCount, 'x'.repeat(c))
          if (bytes.length === size) return bytes
        }
      }
    }
  }
  throw new Error(`torrentOfSize: cannot build ${size} bytes`)
}
