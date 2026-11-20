import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { judgeEntries, splitPaste } from '#/lib/add-entries'
import { parseMagnet, readTorrentFile } from '#/lib/info-hash'
import { selectTorrents, useMaindata } from '#/state/maindata'
import type { AddItem, JudgedItem } from '#/features/add/add-model'

// Story 4.6: the add screen's entries. Pasted text becomes one entry per
// token (splitPaste, parseMagnet); files are read one at a time in the
// order given (readTorrentFile, the main thread given back between hashing
// chunks and between files), and each appears as soon as it is read. All
// entries are judged together against every maindata hash, archived ones
// included, and judged again whenever maindata changes (a pasted torrent
// added elsewhere turns 以前下載過). Every open starts empty; reads started
// before a close (or the previous open) are dropped when they finish, and
// each open gets its own read queue, so a new pick never waits behind them.
// The hash set is rebuilt only when its key (the sorted hashes joined)
// changes; the sort and join still run on every poll. Until maindata has
// loaded nothing can be judged as already downloaded, so `ready` is false.
// A read that throws counts as 看不懂這個檔案 and never stalls the queue.
// Removing a row removes the copies of its hash that judging merged into it.

/** Gives the main thread back (src/lib has no timers). */
export const yieldToMain = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 0))

const NO_ITEMS: ReadonlyArray<AddItem> = []

export interface AddEntries {
  rows: ReadonlyArray<JudgedItem>
  /** Maindata has loaded, so the judging is final. */
  ready: boolean
  /** Files given and not read yet. */
  reading: number
  addText: (text: string) => void
  addFiles: (files: ReadonlyArray<File>) => void
  remove: (id: number) => void
}

export function useAddEntries(open: boolean): AddEntries {
  const [items, setItems] = useState<ReadonlyArray<AddItem>>(NO_ITEMS)
  const [reading, setReading] = useState(0)
  const [wasOpen, setWasOpen] = useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    // A fresh open is empty; on close the list stays drawn while the sheet
    // slides out.
    if (open) {
      setItems(NO_ITEMS)
      setReading(0)
    }
  }
  /** Bumped on every open and close: a read of an older one is dropped. */
  const generationRef = useRef(0)
  const nextIdRef = useRef(1)
  /** Reads run one after another, so files land in the order given. */
  const chainRef = useRef<Promise<void>>(Promise.resolve())
  useLayoutEffect(() => {
    generationRef.current += 1
    // The old queue keeps running (its reads are dropped); nothing waits on it.
    chainRef.current = Promise.resolve()
    return () => {
      generationRef.current += 1
    }
  }, [open])

  const addText = useCallback((text: string) => {
    const tokens = splitPaste(text)
    if (tokens.length === 0) return
    const added = tokens.map((token): AddItem => ({
      id: nextIdRef.current++,
      source: { kind: 'link', text: token },
      result: parseMagnet(token),
    }))
    setItems((current) => [...current, ...added])
  }, [])

  const addFiles = useCallback((files: ReadonlyArray<File>) => {
    if (files.length === 0) return
    const generation = generationRef.current
    const live = () => generation === generationRef.current
    setReading((count) => count + files.length)
    chainRef.current = chainRef.current.then(async () => {
      for (const [index, file] of files.entries()) {
        if (!live()) return
        let result: AddItem['result']
        try {
          if (index > 0) await yieldToMain()
          result = await readTorrentFile(file, { yieldToMain })
        } catch {
          result = { kind: 'unreadable', reason: 'file' }
        }
        if (!live()) return
        const item: AddItem = {
          id: nextIdRef.current++,
          source: { kind: 'file', name: file.name },
          result,
        }
        setItems((current) => [...current, item])
        setReading((count) => Math.max(0, count - 1))
      }
    })
  }, [])

  const remove = useCallback((id: number) => {
    setItems((current) => {
      const removed = current.find((item) => item.id === id)
      if (removed === undefined) return current
      const { result } = removed
      // A merged copy (same hash) would take the row's place otherwise.
      const hash = result.kind === 'unreadable' ? null : result.hash
      return current.filter(
        (item) =>
          item.id !== id &&
          (hash === null ||
            item.result.kind === 'unreadable' ||
            item.result.hash !== hash),
      )
    })
  }, [])

  const { data: torrents } = useMaindata(selectTorrents)
  // Each poll brings a new torrents object: the key is worked out again, the
  // set only when the key changed.
  const hashKey = useMemo(
    () =>
      open
        ? Object.keys(torrents ?? {})
            .sort()
            .join(' ')
        : null,
    [open, torrents],
  )
  const existing = useMemo(
    () =>
      hashKey === null
        ? null
        : new Set(hashKey === '' ? [] : hashKey.split(' ')),
    [hashKey],
  )
  const [shownRows, setShownRows] = useState<ReadonlyArray<JudgedItem>>([])
  const rows = useMemo(
    () => (existing === null ? null : judgeEntries(items, existing)),
    [items, existing],
  )
  // Closed: the last rows stay while the sheet slides out.
  if (rows !== null && rows !== shownRows) setShownRows(rows)

  return {
    rows: rows ?? shownRows,
    ready: torrents !== undefined,
    reading,
    addText,
    addFiles,
    remove,
  }
}
