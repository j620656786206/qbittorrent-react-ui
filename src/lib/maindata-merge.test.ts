import { describe, expect, it } from 'vitest'
import { mergeMaindata } from '#/lib/maindata-merge'
import type { Maindata } from '#/lib/maindata-merge'
import {
  fakeCategories,
  fakeHash,
  fakeResponse,
  fakeServerState,
  t,
} from '#/lib/testing'
import type { MaindataResponse } from '#/shared/maindata'

// Spec 1.6 rows M1 to M7. Every input is deep-frozen: a mutation throws.

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}

const H1 = fakeHash(1)
const H2 = fakeHash(2)
const H3 = fakeHash(3)

function response(overrides: Partial<MaindataResponse>): MaindataResponse {
  return deepFreeze(fakeResponse(overrides))
}

function first(): Maindata {
  return deepFreeze(
    mergeMaindata(
      undefined,
      response({
        version: 'abcdef12.1',
        full: true,
        changed: [
          t({ hash: H1, name: 'one' }),
          t({ hash: H2, name: 'two' }),
          t({ hash: H3, name: 'three' }),
        ],
      }),
    ),
  )
}

describe('mergeMaindata', () => {
  it('M1 first full answer', () => {
    const data = first()
    expect(Object.keys(data.torrents).sort()).toEqual([H1, H2, H3])
    expect(data.torrents[H1].name).toBe('one')
    expect(data.version).toBe('abcdef12.1')
    expect(data.serverState).toEqual(fakeServerState())
    expect(data.categories).toEqual(fakeCategories())
    expect(data.stateBeforeMove).toEqual({})
  })

  it('M2 delta: changed replaced, removed gone, the rest keeps its object', () => {
    const before = first()
    const changedTorrent = t({ hash: H1, name: 'one', progress: 0.9 })
    const after = mergeMaindata(
      before,
      response({
        version: 'abcdef12.2',
        full: false,
        changed: [changedTorrent],
        removed: [H2],
      }),
    )
    expect(after.torrents[H1]).toEqual(changedTorrent)
    expect(after.torrents[H1]).not.toBe(before.torrents[H1])
    expect(H2 in after.torrents).toBe(false)
    expect(after.torrents[H3]).toBe(before.torrents[H3])
    expect(after.version).toBe('abcdef12.2')
  })

  it('M3 changed but equal field by field keeps the old object and record', () => {
    const before = first()
    const after = mergeMaindata(
      before,
      response({
        version: 'abcdef12.2',
        full: false,
        changed: [{ ...before.torrents[H1] }],
      }),
    )
    expect(after.torrents[H1]).toBe(before.torrents[H1])
    expect(after.torrents).toBe(before.torrents)
  })

  it('M3 a removed hash that is not there changes nothing', () => {
    const before = first()
    const after = mergeMaindata(
      before,
      response({ full: false, removed: [fakeHash(99)] }),
    )
    expect(after.torrents).toBe(before.torrents)
  })

  it('M4 full again: equal kept, differing replaced, absent dropped', () => {
    const before = first()
    const differing = t({ hash: H2, name: 'two', ratio: 1.5 })
    const after = mergeMaindata(
      before,
      response({
        version: 'abcdef12.3',
        full: true,
        changed: [{ ...before.torrents[H1] }, differing],
      }),
    )
    expect(after.torrents[H1]).toBe(before.torrents[H1])
    expect(after.torrents[H2]).toBe(differing)
    expect(H3 in after.torrents).toBe(false)
    expect(Object.keys(after.torrents)).toHaveLength(2)
  })

  it('M4 a full answer identical to what we have keeps the record', () => {
    const before = first()
    const after = mergeMaindata(
      before,
      response({
        full: true,
        changed: Object.values(before.torrents).map((torrent) => ({
          ...torrent,
        })),
      }),
    )
    expect(after.torrents).toBe(before.torrents)
  })

  it('M5 equal server state and categories keep their references', () => {
    const before = first()
    const after = mergeMaindata(
      before,
      response({
        version: 'abcdef12.9',
        full: false,
        serverState: fakeServerState(),
        categories: fakeCategories(),
      }),
    )
    expect(after.serverState).toBe(before.serverState)
    expect(after.categories).toBe(before.categories)
    expect(after.version).toBe('abcdef12.9')
  })

  it('M5 a changed server state or category is replaced', () => {
    const before = first()
    const serverState = fakeServerState({ dl_info_speed: 1 })
    const categories = {
      ...fakeCategories(),
      X: { name: 'X', savePath: '/data/media/X/incompleted' },
    }
    const after = mergeMaindata(
      before,
      response({ full: false, serverState, categories }),
    )
    expect(after.serverState).toBe(serverState)
    expect(after.categories).toBe(categories)
  })

  describe('M6 moving memory', () => {
    const start = () =>
      deepFreeze(
        mergeMaindata(
          undefined,
          response({
            full: true,
            changed: [
              t({ hash: H1, state: 'stalledUP', progress: 1 }),
              t({ hash: H2, state: 'moving' }),
            ],
          }),
        ),
      )

    it('remembers the state before moving and keeps it while moving', () => {
      const s0 = start()
      expect(s0.stateBeforeMove).toEqual({})

      const s1 = deepFreeze(
        mergeMaindata(
          s0,
          response({
            full: false,
            changed: [t({ hash: H1, state: 'moving', progress: 1 })],
          }),
        ),
      )
      expect(s1.stateBeforeMove).toEqual({ [H1]: 'stalledUP' })

      const s2 = deepFreeze(
        mergeMaindata(
          s1,
          response({
            full: false,
            changed: [
              t({ hash: H1, state: 'moving', progress: 1, upspeed: 10 }),
            ],
          }),
        ),
      )
      expect(s2.stateBeforeMove).toEqual({ [H1]: 'stalledUP' })
      expect(s2.stateBeforeMove).toBe(s1.stateBeforeMove)

      const s3 = mergeMaindata(
        s2,
        response({
          full: false,
          changed: [t({ hash: H1, state: 'uploading', progress: 1 })],
        }),
      )
      expect(s3.stateBeforeMove).toEqual({})
    })

    it('a torrent first seen as moving has no entry', () => {
      const s0 = start()
      expect(H2 in s0.stateBeforeMove).toBe(false)
      const s1 = mergeMaindata(
        s0,
        response({
          full: false,
          changed: [t({ hash: H2, state: 'moving', progress: 0.7 })],
        }),
      )
      expect(H2 in s1.stateBeforeMove).toBe(false)
    })

    it('drops the entry when the torrent is removed', () => {
      const s1 = deepFreeze(
        mergeMaindata(
          start(),
          response({
            full: false,
            changed: [t({ hash: H1, state: 'moving', progress: 1 })],
          }),
        ),
      )
      const removed = mergeMaindata(
        s1,
        response({ full: false, removed: [H1] }),
      )
      expect(removed.stateBeforeMove).toEqual({})

      const absentFromFull = mergeMaindata(
        s1,
        response({ full: true, changed: [t({ hash: H2, state: 'moving' })] }),
      )
      expect(absentFromFull.stateBeforeMove).toEqual({})
    })
  })

  it('M7 inputs are not mutated', () => {
    const before = first()
    const snapshot = structuredClone(before)
    const delta = response({
      full: false,
      changed: [t({ hash: H1, state: 'moving' })],
      removed: [H2],
    })
    const deltaSnapshot = structuredClone(delta)
    // Frozen inputs: any write would throw in strict mode.
    expect(() => mergeMaindata(before, delta)).not.toThrow()
    expect(before).toEqual(snapshot)
    expect(delta).toEqual(deltaSnapshot)
  })
})
