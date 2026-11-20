import { z } from '#/shared/zod'

// AD-12, story 4.5: the add limits. The client judges and batches with these
// numbers and 4.7's `addTorrents` checks the same ones, so a batch the client
// builds always passes the server. Megabytes are binary (1 MB = 1,048,576
// bytes), the way format.ts shows sizes.

/** A .torrent file larger than this is 「檔案超過 10 MB」 and is never read. */
export const MAX_TORRENT_FILE_BYTES = 10_485_760

/** Entries per request, magnet links and .torrent files together. */
export const MAX_ADD_ENTRIES = 20

/** One request's body, form overhead included. */
export const MAX_ADD_REQUEST_BYTES = 52_428_800

/**
 * What the multipart form adds besides the entries' own bytes (a .torrent
 * file's bytes, a magnet link's UTF-8 bytes, both counted separately),
 * reserved by the client so its batches stay under `MAX_ADD_REQUEST_BYTES`.
 * The base covers the category field and the closing boundary. Each entry
 * covers its part headers and a file name of up to 255 characters in UTF-8.
 * Generous on purpose: 20 entries reserve about 1.3 MB of the 50 MB.
 */
export const ADD_FORM_BASE_ALLOWANCE = 64 * 1024
export const ADD_FORM_ENTRY_ALLOWANCE = 64 * 1024

/** The bytes reserved for the form around `entries` entries. */
export function addFormAllowance(entries: number): number {
  return ADD_FORM_BASE_ALLOWANCE + entries * ADD_FORM_ENTRY_ALLOWANCE
}

/**
 * Story 4.7: a magnet link exactly as the form sends it: trimmed, and a
 * space a chat app left in its name as `%20` (the link stays one URL).
 * `parseMagnet` measures this text, so its size cap is what the server
 * receives.
 */
export function magnetSendText(link: string): string {
  return link.trim().replaceAll(' ', '%20')
}

/**
 * Story 4.7: the browser's timeout for one `addTorrents` request. The
 * usual 35 s (`CALL_TIMEOUT_MS`) covers the server's add deadline
 * (`ADD_DEADLINE_MS`, 27 s, which starts only once the body is in); the
 * upload comes on top, allowed at 256 KB/s (a slow tunnel), capped at
 * 4 minutes (50 MB at that speed is about 3.3 minutes).
 */
export const ADD_CALL_BASE_TIMEOUT_MS = 35_000
export const ADD_UPLOAD_BYTES_PER_SECOND = 262_144
export const ADD_CALL_MAX_TIMEOUT_MS = 240_000

/** The timeout for a request whose body is about `bytes` long. */
export function addCallTimeoutMs(bytes: number): number {
  const upload = Math.ceil((bytes / ADD_UPLOAD_BYTES_PER_SECOND) * 1000)
  return Math.min(ADD_CALL_BASE_TIMEOUT_MS + upload, ADD_CALL_MAX_TIMEOUT_MS)
}

/** Story 4.7: the form field names of an `addTorrents` request. */
export const ADD_FIELDS = Object.freeze({
  magnet: 'magnet',
  torrent: 'torrent',
  category: 'category',
} as const)

/** A C0 control character or DEL anywhere in `text`. */
function hasControlCharacter(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    if (code < 0x20 || code === 0x7f) return true
  }
  return false
}

/**
 * A magnet link and nothing else: it starts with `magnet:` and has no line
 * break or other control character (qBittorrent splits `urls` on new
 * lines, so one would smuggle in a second URL, an http one included).
 */
const magnetField = z
  .string()
  .max(ADD_FORM_ENTRY_ALLOWANCE)
  .refine((text) => /^magnet:/i.test(text) && !hasControlCharacter(text))

/** A .torrent file of at most 10 MB; its first byte is checked on read. */
const torrentField = z
  .instanceof(Blob)
  .refine((file) => file.size <= MAX_TORRENT_FILE_BYTES)

/**
 * Story 4.7, AD-12: `addTorrents`' form, as `formInput()` hands it over
 * (each name's values as a list): zero or more `magnet`, zero or more
 * `torrent`, exactly one `category`, 1 to 20 entries together, and no other
 * field (never `savepath`, `cookie` or an http URL). Whether the category
 * exists and each file starts as a bencode dictionary is checked by the
 * server function. Entry `n` of the answer is `[...magnets, ...files][n]`.
 */
export const addTorrentsFormSchema = z
  .strictObject({
    [ADD_FIELDS.magnet]: z.array(magnetField).max(MAX_ADD_ENTRIES).optional(),
    [ADD_FIELDS.torrent]: z.array(torrentField).max(MAX_ADD_ENTRIES).optional(),
    [ADD_FIELDS.category]: z.array(z.string().min(1).max(1024)).length(1),
  })
  .transform((form) => ({
    magnets: form.magnet ?? [],
    files: form.torrent ?? [],
    category: form.category[0],
  }))
  .refine(({ magnets, files }) => {
    const count = magnets.length + files.length
    return count >= 1 && count <= MAX_ADD_ENTRIES
  })

export type AddTorrentsInput = z.output<typeof addTorrentsFormSchema>
