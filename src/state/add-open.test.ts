import { afterEach, describe, expect, it } from 'vitest'
import {
  addOpenStore,
  closeAdd,
  openAdd,
  resetAddOpen,
  takeQueuedFiles,
} from '#/state/add-open'

// Spec 4.6: the add screen's open state and the files a drop hands it.

const fileNamed = (name: string) => new File(['d1:ae'], name)

afterEach(() => resetAddOpen())

describe('add-open', () => {
  it('opens and closes', () => {
    openAdd()
    expect(addOpenStore.state.open).toBe(true)
    expect(takeQueuedFiles()).toEqual([])
    closeAdd()
    expect(addOpenStore.state.open).toBe(false)
  })

  it('queues dropped files, appending while open, until the screen takes them', () => {
    const a = fileNamed('a.torrent')
    const b = fileNamed('b.torrent')
    openAdd([a])
    openAdd([b])
    expect(addOpenStore.state.open).toBe(true)
    expect(takeQueuedFiles()).toEqual([a, b])
    expect(takeQueuedFiles()).toEqual([])
  })

  it('closing drops what is still queued', () => {
    openAdd([fileNamed('a.torrent')])
    closeAdd()
    expect(takeQueuedFiles()).toEqual([])
  })
})
