import { describe, expect, it } from 'vitest'
import { moveOutcomeOf } from '#/lib/move-outcome'
import type { MoveRecord } from '#/lib/move-outcome'
import { t } from '#/lib/testing'

// Spec 5.3 rows O1 to O4: the decision from the tab's record plus the
// previous and the current torrent, and the seen flag; a move that ends
// back at `from` failed, one that ends in a third folder is dropped.

const TARGET = '/data/media/tv'
const OLD = '/data/torrents/tv/'
const unseen: MoveRecord = {
  target: TARGET,
  from: '/data/torrents/tv',
  startedAt: 1000,
  seen: false,
}
const seen: MoveRecord = { ...unseen, seen: true }

describe('moveOutcomeOf', () => {
  it('movingTo now: waiting, seen set', () => {
    const current = t({ save_path: OLD, movingTo: TARGET })
    expect(moveOutcomeOf(unseen, undefined, current)).toEqual({
      kind: 'waiting',
      record: seen,
    })
  })

  it('qBittorrent moving now (no movingTo): waiting, seen set', () => {
    const current = t({ save_path: OLD, state: 'moving' })
    expect(moveOutcomeOf(unseen, undefined, current)).toEqual({
      kind: 'waiting',
      record: seen,
    })
  })

  it('already seen and still moving: the same record back', () => {
    const current = t({ save_path: OLD, state: 'moving', movingTo: TARGET })
    const outcome = moveOutcomeOf(seen, undefined, current)
    expect(outcome.kind).toBe('waiting')
    expect(outcome.kind === 'waiting' && outcome.record).toBe(seen)
  })

  it('O1 seen, now neither, save_path at the target (trailing slash): done', () => {
    const current = t({ save_path: `${TARGET}/`, state: 'uploading' })
    expect(moveOutcomeOf(seen, undefined, current)).toEqual({ kind: 'done' })
  })

  it('O2 seen, now neither, save_path unchanged: failed', () => {
    const current = t({ save_path: OLD, state: 'uploading' })
    expect(moveOutcomeOf(seen, undefined, current)).toEqual({
      kind: 'failed',
    })
  })

  it('O2 seen elsewhere: the previous torrent was moving, now neither, not at the target: failed', () => {
    const previous = t({ save_path: OLD, state: 'moving', movingTo: TARGET })
    const current = t({ save_path: OLD, state: 'uploading' })
    expect(moveOutcomeOf(unseen, previous, current)).toEqual({
      kind: 'failed',
    })
  })

  it('O3 never seen, now neither, save_path at the target: done', () => {
    const previous = t({ save_path: OLD, state: 'uploading' })
    const current = t({ save_path: TARGET, state: 'uploading' })
    expect(moveOutcomeOf(unseen, previous, current)).toEqual({ kind: 'done' })
  })

  it('O4 never seen, nothing changed: waiting with the same record', () => {
    const torrent = t({ save_path: OLD, state: 'uploading' })
    const outcome = moveOutcomeOf(unseen, torrent, torrent)
    expect(outcome).toEqual({ kind: 'waiting', record: unseen })
    expect(outcome.kind === 'waiting' && outcome.record).toBe(unseen)
  })

  it('container expiry: seen through movingTo, movingTo gone, still at from: failed', () => {
    const previous = t({ save_path: OLD, state: 'uploading', movingTo: TARGET })
    const current = t({ save_path: OLD, state: 'uploading' })
    expect(moveOutcomeOf(seen, previous, current)).toEqual({ kind: 'failed' })
  })

  it('seen, then ended in a third folder (another client): dropped, no failure', () => {
    const current = t({ save_path: '/data/media/anime', state: 'uploading' })
    expect(moveOutcomeOf(seen, undefined, current)).toEqual({
      kind: 'dropped',
    })
  })

  it('never seen by the record, another client moved it elsewhere (previous moving): dropped', () => {
    const previous = t({ save_path: OLD, state: 'moving' })
    const current = t({ save_path: '/data/media/anime', state: 'uploading' })
    expect(moveOutcomeOf(unseen, previous, current)).toEqual({
      kind: 'dropped',
    })
  })

  it('from unknown: seen, now not moving and not at the target is failed, never a silent drop', () => {
    const current = t({ save_path: OLD, state: 'uploading' })
    expect(moveOutcomeOf({ ...seen, from: '' }, undefined, current)).toEqual({
      kind: 'failed',
    })
  })

  it('an errored torrent still holding movingTo is still under way: waiting', () => {
    const current = t({ save_path: OLD, state: 'error', movingTo: TARGET })
    expect(moveOutcomeOf(seen, undefined, current)).toEqual({
      kind: 'waiting',
      record: seen,
    })
  })

  it('a target with a trailing slash still matches', () => {
    const record = { ...seen, target: `${TARGET}/` }
    const current = t({ save_path: TARGET, state: 'uploading' })
    expect(moveOutcomeOf(record, undefined, current)).toEqual({ kind: 'done' })
  })
})
