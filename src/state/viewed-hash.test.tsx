import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  NO_VIEWED_HASH,
  ViewedHashContext,
  useViewedHash,
} from '#/state/viewed-hash'
import type { ViewedHashControl } from '#/state/viewed-hash'

// Spec 2.4: the viewed torrent's control. The `_authed` layout provides the
// URL's `hash` and the writer (searchWithHash in list-search.test.ts);
// without a provider nothing is viewed.

function read(provided?: ViewedHashControl): ViewedHashControl {
  let seen: ViewedHashControl | null = null
  function Probe() {
    seen = useViewedHash()
    return null
  }
  renderToStaticMarkup(
    provided ? (
      <ViewedHashContext value={provided}>
        <Probe />
      </ViewedHashContext>
    ) : (
      <Probe />
    ),
  )
  return seen as unknown as ViewedHashControl
}

describe('useViewedHash', () => {
  it('without a provider: no hash, setting does nothing', () => {
    const control = read()
    expect(control).toBe(NO_VIEWED_HASH)
    expect(control.hash).toBeNull()
    expect(() => control.setHash('a')).not.toThrow()
  })

  it('reads what the layout provides', () => {
    const provided = { hash: 'a'.repeat(40), setHash: () => {} }
    expect(read(provided)).toBe(provided)
  })
})
