import { toCrossJSONAsync } from 'seroval'
import { describe, expect, it, vi } from 'vitest'
import { rawMaindataSchema } from '#/server/qbit/maindata-schema'
import type { RawMaindata } from '#/server/qbit/maindata-schema'
import type { QbitClient } from '#/server/qbit/client'
import { rawServerState, rawTorrent } from '#/server/qbit/testing'
import { MIN_PULL_INTERVAL_MS, createSyncer } from '#/server/sync/syncer'
import { ok } from '#/shared/errors'

// Spec 1.6 deferred item (a): a budget for what `getMaindata` sends, for a
// library shaped like the NAS one (4167 torrents, long CJK names, the
// code-name categories): the full read, and a delta where 300 seeding
// torrents only tick `seeding_time`. Fake hashes, fake names, no real paths.
//
// Two measurements. The spec's budgets (2 MiB / 160 KiB) apply to the data as
// plain JSON. What reaches the browser is the `ok(...)` envelope encoded by
// Start with seroval, about 50% larger; measured 2026-11-16: about 2,641 KiB
// full and 191 KiB delta on the wire, against 1,760 KiB and 128 KiB as plain
// JSON (before compression). The wire budgets keep about 15% headroom.
// Start's own limits are far above (32 MiB pending output, 16 MiB a frame).

const TORRENTS = 4167
const TICKING_SEEDERS = 300
const FULL_JSON_BUDGET = 2 * 1024 * 1024
const DELTA_JSON_BUDGET = 160 * 1024
const FULL_WIRE_BUDGET = 3 * 1024 * 1024
const DELTA_WIRE_BUDGET = 224 * 1024

const CATEGORIES = ['X', 'mteam-X', 'mteam-tv'] as const
const STATES = [
  'stalledUP',
  'uploading',
  'pausedUP',
  'missingFiles',
  'downloading',
  'stalledDL',
] as const

const hashOf = (index: number) => index.toString(16).padStart(40, '0')

/** About 80 characters, CJK and Latin mixed, like scene release names. */
function nameOf(index: number): string {
  const episode = String((index % 99) + 1).padStart(2, '0')
  return `[測試字幕組] 假的影集名稱第${index}部 長長的副標題 Fake.Show.S01E${episode}.1080p.WEB-DL.AAC2.0.H.264-FAKE`
}

function isSeeding(index: number): boolean {
  const state = STATES[index % STATES.length]
  return state === 'stalledUP' || state === 'uploading'
}

function torrentAt(index: number) {
  const category = CATEGORIES[index % CATEGORIES.length]
  const state = STATES[index % STATES.length]
  const done = state !== 'downloading' && state !== 'stalledDL'
  return rawTorrent({
    name: nameOf(index),
    state,
    // Long floats, as qBittorrent sends them.
    progress: done ? 1 : 0.1234567891 + (index % 7) / 10,
    size: 1_234_567_890 + index * 7919,
    dlspeed: done ? 0 : 6_512_345,
    upspeed: isSeeding(index) ? 123_456 : 0,
    eta: done ? 8_640_000 : 2045,
    ratio: 3.1234567891 + index / 1000,
    added_on: 1_700_000_000 + index * 60,
    completion_on: done ? 1_700_100_000 + index * 60 : -1,
    seeding_time: isSeeding(index) ? 3_456_789 + index : 0,
    save_path:
      category === 'X'
        ? '/data/media/X/incompleted'
        : '/data/torrent/mteam-seed',
    category,
    private: category !== 'X',
  })
}

function fullUpdate(): RawMaindata {
  const torrents: Record<string, unknown> = {}
  for (let index = 0; index < TORRENTS; index += 1) {
    torrents[hashOf(index)] = torrentAt(index)
  }
  return rawMaindataSchema.parse({
    rid: 1,
    full_update: true,
    torrents,
    categories: {
      X: { name: 'X', savePath: '/data/media/X' },
      'mteam-X': { name: 'mteam-X', savePath: '/data/torrent/mteam-seed' },
      'mteam-tv': { name: 'mteam-tv', savePath: '/data/torrent/mteam-seed' },
    },
    server_state: rawServerState(),
  })
}

function seedingTick(): RawMaindata {
  const torrents: Record<string, unknown> = {}
  let ticked = 0
  for (let index = 0; ticked < TICKING_SEEDERS; index += 1) {
    if (!isSeeding(index)) continue
    torrents[hashOf(index)] = { seeding_time: 3_456_789 + index + 5 }
    ticked += 1
  }
  return rawMaindataSchema.parse({
    rid: 2,
    torrents,
    server_state: { up_info_speed: 654_321 },
  })
}

/**
 * The response body the browser receives: the server function's `ok(...)`
 * envelope, encoded by Start's server handler with seroval (the same
 * encoding as `startResponse` in src/state/testing.ts), before compression.
 */
const jsonBytes = (value: unknown) =>
  Buffer.byteLength(JSON.stringify(value), 'utf8')

async function wireBytes(data: unknown): Promise<number> {
  const body = JSON.stringify(
    await toCrossJSONAsync({ result: ok(data) }, { refs: new Map() }),
  )
  return Buffer.byteLength(body, 'utf8')
}

describe('getMaindata payload size', () => {
  it('full read and a 300-seeder seeding_time tick stay inside the budgets', async ({
    annotate,
  }) => {
    let clock = 0
    const answers = [fullUpdate(), seedingTick()]
    const client: QbitClient = {
      syncMaindata: vi.fn(async () => {
        const next = answers.shift()
        if (!next) throw new Error('no more answers')
        return next
      }),
    }
    const syncer = createSyncer({
      client,
      now: () => clock,
      instanceId: 'abcdef12',
    })

    const full = await syncer.read()
    expect(full.full).toBe(true)
    expect(full.changed).toHaveLength(TORRENTS)

    clock += MIN_PULL_INTERVAL_MS
    const delta = await syncer.read(full.version)
    expect(delta.full).toBe(false)
    expect(delta.changed).toHaveLength(TICKING_SEEDERS)
    expect(delta.removed).toEqual([])

    const fullJson = jsonBytes(full)
    const deltaJson = jsonBytes(delta)
    const fullBytes = await wireBytes(full)
    const deltaBytes = await wireBytes(delta)
    await annotate(
      `wire: full ${fullBytes} bytes (${(fullBytes / 1024).toFixed(1)} KiB), delta ${deltaBytes} bytes (${(deltaBytes / 1024).toFixed(1)} KiB); plain JSON: full ${fullJson}, delta ${deltaJson}`,
    )
    expect(fullJson).toBeLessThan(FULL_JSON_BUDGET)
    expect(deltaJson).toBeLessThan(DELTA_JSON_BUDGET)
    expect(fullBytes).toBeLessThan(FULL_WIRE_BUDGET)
    expect(deltaBytes).toBeLessThan(DELTA_WIRE_BUDGET)
  })
})
