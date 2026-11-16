import { createContext, useContext } from 'react'

// AD-13, story 2.4: the URL owns the torrent the detail shows (`hash`). The
// `_authed` layout reads the validated search and provides it here, with a
// setter that writes the URL with `replace` (and `resetScroll: false`);
// `null` removes `hash` (the detail closed). Rows, cards and the detail
// containers read it without touching the router. Without a provider (node
// tests) nothing is viewed and setting does nothing.

export interface ViewedHashControl {
  /** The URL's `hash`, validated; `null` when there is none. */
  hash: string | null
  /** Stable. Writes the URL with `replace`; `null` removes `hash`. */
  setHash: (hash: string | null) => void
}

export const NO_VIEWED_HASH: ViewedHashControl = Object.freeze({
  hash: null,
  setHash: () => {},
})

export const ViewedHashContext =
  createContext<ViewedHashControl>(NO_VIEWED_HASH)

export function useViewedHash(): ViewedHashControl {
  return useContext(ViewedHashContext)
}
