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
