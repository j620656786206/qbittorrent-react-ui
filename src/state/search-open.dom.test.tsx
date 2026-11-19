// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSearchOpen } from '#/state/search-open'
import type { SearchOpen, SearchOpenInput } from '#/state/search-open'

// Story 3.5: whether the search box is open. The URL is played by hand
// here (`query`, `onList`), so the moments between a close and the URL
// catching up can be rendered one by one.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

let root: Root
let container: HTMLElement
let seen: SearchOpen
const writeQuery = vi.fn<(text: string) => void>()
const removeQuery = vi.fn<() => void>()
const resetScroll = vi.fn<() => void>()

function Probe(props: Pick<SearchOpenInput, 'query' | 'onList'>) {
  seen = useSearchOpen({ ...props, writeQuery, removeQuery, resetScroll })
  return null
}

async function render(query: string, onList = true) {
  await act(async () => root.render(<Probe query={query} onList={onList} />))
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  root = createRoot(container)
  writeQuery.mockReset()
  removeQuery.mockReset()
  resetScroll.mockReset()
})

afterEach(async () => {
  await act(async () => root.unmount())
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
})

describe('useSearchOpen', () => {
  it('a keyword in the URL opens it; clearing the text keeps it open', async () => {
    await render('show')
    expect(seen.open).toBe(true)
    await act(async () => seen.setQuery(''))
    expect(writeQuery).toHaveBeenCalledWith('')
    await render('')
    expect(seen.open).toBe(true)
  })

  it('a close stays closed even when a render lands before the URL drops q', async () => {
    await render('show')
    await act(async () => seen.closeSearch())
    expect(removeQuery).toHaveBeenCalledTimes(1)
    // The URL still has the keyword for a moment.
    await render('show')
    await render('')
    expect(seen.open).toBe(false)
  })

  it('the magnifier opens it without a keyword', async () => {
    await render('')
    expect(seen.open).toBe(false)
    await act(async () => seen.openSearch())
    expect(seen.open).toBe(true)
  })

  it('closed on the settings page: back on the list the old keyword is dropped', async () => {
    await render('show', false)
    await act(async () => seen.closeSearch())
    await render('', false)
    // History back to the list entry that still has `q=show`.
    removeQuery.mockReset()
    await render('show', true)
    expect(seen.query).toBe('')
    expect(seen.open).toBe(false)
    expect(removeQuery).toHaveBeenCalled()
    await render('', true)
    // Later the same keyword is a real one again.
    await render('show', true)
    expect(seen.query).toBe('show')
  })
})
