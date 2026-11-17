// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import {
  clearShownList,
  publishShownList,
  shownListStore,
  usePublishShownList,
  useShownList,
} from '#/state/shown-order'
import type { ShownList } from '#/state/shown-order'

// Spec 2.4: the list publishes the order it shows (its one useFrozenOrder
// result) and the viewed row; the detail reads the same arrays.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

afterEach(() => {
  clearShownList()
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
})

describe('the shown list store', () => {
  it('keeps the published arrays by reference; equal input does not notify', () => {
    const order = ['a', 'b']
    publishShownList({ order, viewed: 'a' })
    const first = shownListStore.state
    expect(first.order).toBe(order)
    publishShownList({ order, viewed: 'a' })
    expect(shownListStore.state).toBe(first)
    publishShownList({ order, viewed: 'b' })
    expect(shownListStore.state.viewed).toBe('b')
  })

  it('a mounted list publishes; the reader sees it; unmounting clears it', async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const order = Object.freeze(['b', 'a'])
    let read: ShownList | null = null
    function List() {
      usePublishShownList(order, 'b')
      return null
    }
    function Detail() {
      read = useShownList()
      return null
    }
    const root = createRoot(document.createElement('div'))
    await act(async () =>
      root.render(
        <>
          <List />
          <Detail />
        </>,
      ),
    )
    expect(read).toEqual({ order, viewed: 'b' })
    expect((read as unknown as ShownList).order).toBe(order)
    await act(async () => root.render(<Detail />))
    expect(read).toEqual({ order: undefined, viewed: null })
    await act(async () => root.unmount())
  })
})
