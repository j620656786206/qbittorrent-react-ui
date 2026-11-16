---
title: 'Story 1.6: Frontend torrent data, status and number pure functions'
type: 'feature'
created: '2026-11-16'
status: 'done'
baseline_revision: 'c4368e8048151304976a70079689161777fa4772'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-react-torrent-2026-11-15/ARCHITECTURE-SPINE.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Wire size of getMaindata (seroval envelope) is about 2.6 MiB for a full read and about 191 KiB for a 300-seeder delta, roughly 50% over plain JSON.
    evidence: |-
      Accepted with wire budgets of 3 MiB and 224 KiB (Claude 代決). Story 1.9 should check whether the container or Cloudflare compresses these responses; if not, consider compression or slimming fields (seeding_time ticks).
    location: >-
      src/server/sync/payload-size.test.ts
    severity: low
---

<intent-contract>

## Intent

**Problem:** `getMaindata` exists (Story 1.5) but nothing in the browser polls it, merges it, or turns raw qBittorrent values into the 7 status words, number formats, location tags and the one connection alert. Stories 1.7 and 1.8 render from these, and every later operation needs one `refreshMaindata()`.

**Approach:** Wire one `['maindata']` query (5 s, through `pollInterval()` and `callFn`) whose `queryFn` returns `mergeMaindata(previous, response)`; add the pure single sources in `src/lib` (`maindata-merge`, `torrent-status` `classify()`, `format`, `paths`, `visible-torrents`, `connection-alert`) with table-driven vitest; record connection codes in a `src/state` store from the global `onError`; add the lint bans. No screens.

## Boundaries & Constraints

**Always:**
- Layering per epic-1-context: `src/state` may not import `src/server/functions`, so the query takes an injected fetcher: `createQueryClient({ fetchMaindata })`, and the root file `src/router.tsx` passes `bindFetchMaindata(getMaindata)` (from `src/state/maindata.ts`: `(since, signal, { fresh }) => callFn(getMaindata, input, { signal })`, where `input` holds only the keys that are set, or is `undefined`). That import is what keeps `getMaindata` in the bundle, so the side-effect import in `src/start.ts` and its comment are removed (smoke `SERVER_ONLY_MARKERS` check stays).
- `['maindata']` options are registered once with `queryClient.setQueryDefaults(MAINDATA_KEY, ...)`: `refetchInterval: pollInterval(MAINDATA_POLL_MS)` (5000), `refetchIntervalInBackground: false`, `refetchOnWindowFocus` returning `'always'` unless login is required, `staleTime: MAINDATA_POLL_MS`, `enabled: unlessLoginRequired`, `retry: false`, `networkMode: 'always'` (a phone without signal must fail the call, not pause). Structural sharing stays at Query's default, so `select` results keep their reference.
- The `queryFn` reads the current data with `client.getQueryData(MAINDATA_KEY)`, sends `since = previous?.version` (and `fresh: true` while `refreshMaindata` runs), records when it started (`useMaindataFetchStartedAt`), and returns `mergeMaindata(previous, response)`. Nothing else writes `['maindata']`. On failure Query keeps the old data; `query.state.dataUpdatedAt` is the last success time (no second store).
- `useMaindata(select)` needs a stable `select` (module-level or `useCallback`); Query reruns `select` whenever the function changes.
- Pure functions take `now` (epoch ms) and an optional IANA `timeZone` (default: runtime local) as arguments; qBittorrent times are Unix seconds, sizes bytes, speeds bytes/s. They never read the clock or globals.
- All UI strings are Traditional Chinese exactly as PRD FR-5 to FR-9 and EXPERIENCE give them; full-width punctuation as written there. Error wording comes from `errorText(code)`.
- Fixtures use only fake hashes, category names `X`, `mteam-X`, `mteam-tv` and paths like `/data/media/X/incompleted`; no IP literals.

**Never:**
- No React screens, no components, no route changes (the temporary home page stays). 1.7 and 1.8 render.
- No `setQueryData(['maindata'], ...)`, no optimistic writes, no second polling timer, no numeric literal `refetchInterval`.
- No browser zod parse of the response, no new error codes, no new server function, no change to `src/shared/maindata.ts` fields (decided below: `seeding_time` stays).
- No speed-limit formatting (`不限速`, `上限 32.7`): that is header copy for Story 1.7, which adds it to `format.ts`.
- No contact with the real qBittorrent; no reading `.env`.

## I/O & Edge-Case Matrix

Clock for F, C, A rows: `now` = 2026-11-16 12:00 in `Asia/Taipei`, passed explicitly. `t(...)` is a fake slim torrent.

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| M1 First full | `previous` undefined, `full: true`, 3 torrents | `torrents` keyed by hash, `version`, `serverState`, `categories` set; `stateBeforeMove` `{}` | none |
| M2 Delta | 1 changed, 1 removed of 3 | changed hash has the new object; removed hash gone; third keeps the same reference (`toBe`) | none |
| M3 Changed but equal | `changed` holds a torrent equal field by field to the old one | old reference kept; when no torrent changed or was removed, `torrents` record itself keeps its reference | none |
| M4 Full again | `full: true` where 1 torrent is equal, 1 differs, 1 absent | equal keeps reference, differing replaced, absent dropped | none |
| M5 Server state, categories | shallow-equal `serverState`, equal `categories` | both keep references; `version` updated | none |
| M6 Moving memory | old state `stalledUP`, new `moving`; next delta still `moving`; then `uploading`; a torrent first seen as `moving` | `stateBeforeMove[h] = 'stalledUP'` and kept; entry dropped when no longer moving or removed; first-seen moving has no entry | none |
| M7 Input untouched | any merge | `previous` and `response` are not mutated (frozen inputs in the test) | none |
| C1 Table | every row of EXPERIENCE "qBittorrent 狀態對應" (each state code in its own test row) | `status`, `word`, `column`, `detail` as in the Design Notes table | none |
| C2 Missing files | `missingFiles` with `private` `true`; `false`; `null` | true: `error`/錯誤/要處理/「找不到檔案，做不了種」 (also when category is `mteam-X`); false and null: `archived`/已整理/已整理欄/「已整理」 | none |
| C3 Moving | `moving` with `stateBeforeMove` `pausedDL`; without it at progress 0.4; without it at progress 1 | 已暫停 in 下載中; 下載中 in 下載中; 做種中 in 做種中; `detail` 「搬移中」 and `moving: true` in all three | none |
| C4 Unlisted code | `state: 'somethingNew'` | same as `unknown`: 錯誤, 要處理, 「狀態不明」 | none |
| C5 Plain text | `name` or detail containing `<b>` | returned unchanged as a string | none |
| F1 Count | 3631; 0 | 「3,631」; 「0」 | none |
| F2 Size | 0; 512; 1 KiB; 85 GiB; 301.2 GiB; 1,023 GiB; 1,024 GiB; 22.1 TiB; 1023.96 GiB | 「0 B」 「512 B」 「1 KB」 「85 GB」 「301.2 GB」 「1,023 GB」 「1 TB」 「22.1 TB」 「1 TB」 (unit chosen after rounding; `.0` dropped) | none |
| F3 Speed | 0; 300 B/s; 1,023 KiB/s; 1,024 KiB/s; 6.21 MiB/s; 9.999 MiB/s; 10 MiB/s; 32.7 MiB/s | 「0 KB/s」 「1 KB/s」 「1,023 KB/s」 「1.00 MB/s」 「6.21 MB/s」 「10.0 MB/s」 「10.0 MB/s」 「32.7 MB/s」; `formatRowSpeed(0)` is `null` | none |
| F4 ETA | 30 s; 34 min; 3 h 12 min; 2 d 5 h; 3 h exactly; 8640000; -1; any eta with `dlspeed` 0 | 「剩不到 1 分」 「剩 34 分」 「剩 3 小時 12 分」 「剩 2 天 5 小時」 「剩 3 小時」 「剩餘時間不明」 x3 | none |
| F5 Date | today 09:12; yesterday 21:40; 2026-11-05; 2025-07-18; 0; -1; same instant with `timeZone` `UTC` vs `Asia/Taipei` across midnight | 「今天 09:12」 「昨天 21:40」 「11/05」 「2025/07/18」 「沒有」 「沒有」; day label follows the given zone | none |
| F6 Ago | 3 s; 20 s; 5 min; 3 h; 3 d; future time | 「剛剛」 「20 秒前」 「5 分前」 「3 小時前」 「3 天前」 「剛剛」 | none |
| F7 Duration | 41 d; 5 h; 12 min; 30 s; 412 d | 「41 天」 「5 小時」 「12 分」 「不到 1 分」 「412 天」 | none |
| F8 Ratio | 3.123; 0.999; 1; -1 (qBittorrent's value at or above the max ratio) | 「3.12」 「0.99」 「1.00」 「∞」; `isGoodRatio` true, false, true, true | none |
| F9 Percent | 0.87; 0.29; 0.999; 1; 0 | 「87%」 「29%」 (float guard) 「99%」 「100%」 「0%」 | none |
| F10 No value | `null` / `undefined` to any formatter that accepts it | `NO_VALUE` 「沒有」 | none |
| V1 Order | 4 torrents, two with equal `added_on`, one archived | hashes by `added_on` desc, ties by `hash` asc; archived excluded | none |
| V2 Count | same data | `countAll` = 3 (archived excluded) | none |
| P1 Label | `/data/media/tv`; `/data/media/tv/`; `/data`; `/`; `''`; `/data//torrents/tv` | 「media/tv」 「media/tv」 「data」 「/」 「/」 「torrents/tv」 | none |
| A1 Each alone | each of: `cloudflare_expired`; `home_unreachable` (last success 3 min ago); `qbit_unreachable`; status `disconnected`; `firewalled`; last success 20 s ago | 「Cloudflare 登入過期了」; 「連不到家裡的 NAS，最後更新 3 分前」; 「家裡的 qBittorrent 沒有回應，最後更新 3 分前」; 「斷線了」; 「防火牆擋住了」; 「最後更新 20 秒前」 with tone `muted` (others `warning`) | none |
| A2 Combinations | cloudflare + home + disconnected + stale; `qbit_unreachable` + firewalled + stale; disconnected + stale; firewalled + stale | cloudflare; qbit_unreachable; disconnected; firewalled | none |
| A3 Boundaries | last success exactly 10 s ago; 10.001 s; `null` (never loaded); home unreachable with `null` | none; stale; none; 「連不到家裡的 NAS」 without suffix | none |
| A4 Suffix and grace | failure 5 s after a success; `lastSuccessAt` 0 or -1; a fetch started 0.5 s ago with data 20 s old | no suffix; never; no stale line (higher alerts still show) | none |
| A5 Hung fetch | data 20 s old, fetch started 0 s, 1.999 s, 2 s, 15 s ago | none, none, 「最後更新 20 秒前」 x2 (`FETCH_GRACE_MS = 2000`) | none |
| S1 Connection store | maindata fails home, then qbit; a mutation fails cloudflare; maindata fails home; then `qbit_rejected`; then succeeds | `[home]`; `[qbit]`; `[cloudflare, qbit]`; `[cloudflare, home]`; `[cloudflare]`; `[]` | none |
| Q1 Poll | observer mounted, fake timers | first call `since` undefined; one call per 5 s; later calls send the last `version` | none |
| Q2 Hidden | `focusManager.setFocused(false)`, advance 20 s, then `setFocused(true)` | zero calls while hidden; exactly one call immediately on return | none |
| Q3 Failure | call rejects `AppError('home_unreachable')` after a success | data unchanged (same reference), `dataUpdatedAt` unchanged, connection store `home_unreachable`, polling continues; next success clears the store | none |
| Q4 Login stop | call rejects `not_logged_in` | login store set, no further calls after 30 s; a newly mounted observer does not fetch while login is required | none |
| Q5 Refresh | `refreshMaindata(client)` while a call is in flight; and while idle | in-flight call's signal aborted, a new call starts at once; idle: one immediate call; resolves after it settles | none |
| Q6 bad_origin | call rejects `bad_origin` (also on every poll) | `console.error` once per client; login store and connection store untouched | none |
| Q7 Fresh refresh | `refreshMaindata(client)`; container got a pull 0.5 s earlier or one still in flight | fetcher gets `{ fresh: true }`, polls `{ fresh: false }`; the syncer skips the 1 s reuse and joins only a pull started after the call arrived (waits out an older one) | none |

</intent-contract>

## Code Map

- `src/state/query-client.ts` -- `createQueryClient`, global `onError`, retry rules, login-store observer refresh; gains `fetchMaindata` option, connection store writes and maindata `onSuccess` clear.
- `src/state/polling.ts` -- `pollInterval(ms)`; the only allowed `refetchInterval` value.
- `src/state/login-required.ts` -- `isLoginRequired`, `markLoginRequired`; store pattern to copy for the connection store.
- `src/state/call-fn.ts` -- `callFn(fn, input, { signal })`; classifies network, 401, HTML, 5xx.
- `src/state/testing.ts` (`fakeServerFn`, `startServerFn`, `startResponse`: Start's real client RPC) and `src/lib/testing.ts` (fixtures: `t()`, `fakeHash`, `fakeResponse`, `fakeServerState`, `fakeCategories`), `src/state/query-client.test.ts` -- test helpers and existing client tests to extend.
- `src/lib/app-error.ts` -- `AppError`, `LOGIN_STOP_CODES`; add `CONNECTION_CODES` beside it.
- `src/lib/error-text.ts` -- `errorText(code)` wording for the alert.
- `src/shared/maindata.ts` -- `SlimTorrent`, `ServerState`, `Category`, `MaindataResponse`, `MaindataVersion`.
- `src/server/functions/get-maindata.ts` -- the server function the router binds.
- `src/server/sync/syncer.ts`, `src/server/qbit/testing.ts` -- `createSyncer` (`read(since, { fresh })`), `rawTorrent()` for the payload measurement.
- `src/router.tsx` -- root wiring (may import any layer).
- `src/start.ts` -- holds the side-effect import to delete.
- `eslint.config.js`, `src/lint-rules.test.ts` -- `no-restricted-syntax` groups (a later block replaces, not merges) and lint probes.
- `scripts/smoke-built-server.mjs` -- `SERVER_ONLY_MARKERS` check of `.output/public` (unchanged, must still pass).

## Tasks & Acceptance

**Execution:**
- `src/lib/format.ts` -- create `NO_VALUE`, `formatCount`, `formatSize`, `formatSpeed`, `formatRowSpeed` (`null` at 0), `formatEta(eta, dlspeed)`, `formatDate(unixSec, now, timeZone?)`, `formatAgo(unixSec, now)`, `formatDuration(seconds)`, `formatRatio`, `isGoodRatio`, `formatPercent(progress)` per rows F1 to F10 and the Design Notes rules; `QBIT_ETA_INFINITY = 8_640_000` and the ratio sentinel live only here; one cached `Intl` formatter per zone -- FR-9, AR-41.
- `src/lib/format.test.ts` -- create: `it.each` tables for F1 to F10 with fixed `now` and explicit zones.
- `src/lib/paths.ts`, `src/lib/paths.test.ts` -- create `locationLabel(savePath)` (last two non-empty segments, root or empty gives 「/」) and rows P1. Header comment: common-path matching joins here in Epic 5.
- `src/lib/maindata-merge.ts` -- create `Maindata` type (`version`, `torrents: Readonly<Record<string, SlimTorrent>>`, `serverState`, `categories`, `stateBeforeMove: Readonly<Record<string, string>>`) and `mergeMaindata(previous, response)` per M1 to M7 (field equality over `TORRENT_FIELDS`). Header comment: the only producer of `['maindata']` data -- AR-39.
- `src/lib/maindata-merge.test.ts` -- create rows M1 to M7 with `toBe` reference checks and `Object.freeze`d inputs.
- `src/lib/torrent-status.ts` -- create `TorrentStatusId` (`downloading | seeding | done | paused | stalled | error | archived`, matching the `status-*` tokens), `BoardColumn` (`attention | downloading | seeding | done | archived`), `statusOf(torrent, stateBeforeMove)` (cheap, no text) and `classify(torrent, { now, timeZone?, stateBeforeMove })` (`stateBeforeMove` required: pass `Maindata.stateBeforeMove`, `{}` only in tests) returning `{ status, word, column, detail, moving, showsProgress }`; detail text through `format.ts` only -- FR-8, AR-41, rows C1 to C5.
- `src/lib/torrent-status.test.ts` -- create: one `it.each` row per state code in the Design Notes table plus C2 to C5.
- `src/lib/visible-torrents.ts`, `src/lib/visible-torrents.test.ts` -- create `TorrentView` (`{ sort: 'added_on_desc' }`, doc comment: category, search and the other 50 sorts extend this object later), `EPIC1_VIEW`, `selectVisibleTorrents(maindata, view)` (hash array, archived excluded via `statusOf`), `countAll(maindata)`; rows V1, V2 -- AR-41, AD-13.
- `src/lib/connection-alert.ts`, `src/lib/connection-alert.test.ts` -- create `pickConnectionAlert({ errorCodes, connectionStatus, lastSuccessAt, fetchStartedAt, now })` returning `{ kind, text, tone } | null` (`kind`: `cloudflare_expired | home_unreachable | qbit_unreachable | disconnected | firewalled | stale`; `STALE_AFTER_MS = 10_000`, strictly greater; the stale line waits only `FETCH_GRACE_MS = 2_000` after a fetch starts); codes ranked by a `Record<ConnectionCode, { rank, withLastUpdated }>` so a new code fails to compile; rows A1 to A5 -- FR-6, FR-7.
- `src/lib/app-error.ts` -- add `CONNECTION_CODES` (`cloudflare_expired`, `home_unreachable`, `qbit_unreachable`), `ConnectionCode`, `isConnectionCode` -- AR-35.
- `src/state/connection.ts` -- create a `@tanstack/react-store` store `{ errors: ReadonlyArray<ConnectionCode> }` with `markConnectionError(code)` (`home_unreachable` / `qbit_unreachable`: the latest replaces the other; `cloudflare_expired`: its own flag), `clearUnreachable()` (a maindata failure the container answered), `clearConnectionErrors()` (maindata success), `getConnectionErrors`, `useConnectionErrors`, and `useConnectionAlert(now)` (the header bar's one call: errors, connection status, `dataUpdatedAt`, fetch start time into `pickConnectionAlert`); browser-only writes like `markLoginRequired`; row S1.
- `src/state/maindata.ts` -- create `MAINDATA_KEY = ['maindata'] as const`, `MAINDATA_POLL_MS`, `FetchMaindata` type, `bindFetchMaindata`, `maindataQueryDefaults(fetch)` (options in Always), `useMaindata(select)` (`useQuery({ queryKey: MAINDATA_KEY, select })`, `select` must be stable), the stable selectors `selectServerState`, `selectConnectionStatus`, `selectCategories`, `selectTorrents`, `selectStateBeforeMove` (plus `countAll` from `src/lib/visible-torrents.ts`), `useVisibleTorrents(view)`, `useMaindataFetchStartedAt()` / `getMaindataFetchStartedAt()`, and `refreshMaindata(client)`: marks the client as refreshing (fetches send `fresh: true`), then `await client.cancelQueries({ queryKey: MAINDATA_KEY, exact: true })` and `await client.refetchQueries({ queryKey: MAINDATA_KEY, exact: true })` -- AR-38, AR-42, rows Q1 to Q7.
- `src/state/query-client.ts` -- accept `fetchMaindata?`; when given, `setQueryDefaults(MAINDATA_KEY, maindataQueryDefaults(fetchMaindata))`; in `onError` mark connection codes (maindata `timeout` as `qbit_unreachable`), clear the unreachable code on any other maindata failure, log `bad_origin` once per client; add `QueryCache` `onSuccess` that clears the connection store when the query key is `MAINDATA_KEY`; update the header comment (connection codes now live in `src/state/connection.ts`).
- `src/state/maindata.test.ts` -- create rows Q1 to Q6 using `createQueryClient({ fetchMaindata: fake, currentPath })`, a `QueryObserver` on `MAINDATA_KEY`, `vi.useFakeTimers()`, `focusManager.setFocused`, `clearLoginRequired`/`clearConnectionError` in `afterEach`.
- `src/router.tsx` -- pass `fetchMaindata: bindFetchMaindata(getMaindata)`.
- `src/shared/maindata.ts` (input schema only), `src/server/functions/get-maindata.ts`, `src/server/sync/syncer.ts` -- `getMaindata` takes `fresh?: boolean` and calls `read(since, { fresh })`; a fresh read skips the 1 s reuse and joins only a pull started after it arrived -- AD-7, row Q7.
- `src/start.ts` -- delete the `get-maindata` side-effect import and its comment.
- `eslint.config.js` -- add to every `no-restricted-syntax` group: (1) `setQueryData` / `setQueriesData` whose first argument is the maindata key (`MAINDATA_KEY`, `[...MAINDATA_KEY]`, an array starting with `'maindata'`, bare or under `as const` / `satisfies`) or an object whose `queryKey` is it; (2) any options object with that `queryKey` and a `queryFn` (useQuery, useQueries, useInfiniteQuery, queryOptions, fetchQuery, ...) outside `src/state/maindata.ts`; (3) `setQueryDefaults` with that key outside `src/state/query-client.ts`; (4) a `refetchInterval` property whose value is not a `pollInterval(...)` call. The key through another variable is not caught (review rule). Add a block for `src/features/**` and `src/routes/**` that also bans `x.state` compared, switched on, passed to includes / has / indexOf, used as a lookup key or called on, and `{ state }` destructured from a torrent-named value or a `...Torrent`-typed parameter (message: use `classify()` / `statusOf()` from `src/lib/torrent-status.ts`). `src/server/functions` production files also get the zod ban (tests and `__fixtures__` do not) -- AR-35, AR-39, AR-41, AD-10.
- `src/lint-rules.test.ts` -- add probes: `setQueryData(['maindata'], x)`, `setQueryData(MAINDATA_KEY, x)`, `setQueriesData({ queryKey: ['maindata'] }, x)`, `refetchInterval: 5000`, `queryOptions` / `useQueries` / `useInfiniteQuery` with the key and a `queryFn`, `setQueryDefaults(MAINDATA_KEY, ...)` in a feature or `src/state` fail; `refetchInterval: pollInterval(5000)`, `setQueryData(['session'], x)`, `setQueryDefaults(['session'], ...)` and `setQueryDefaults(MAINDATA_KEY, ...)` in `src/state/query-client.ts` pass; `torrent.state === 'error'` in a feature fails, the same in `src/lib` passes, `router.state.status === 'idle'` in a feature passes; `const { state } = useLocation()` in a route and `useSidebar()` state in `src/shared/ui` pass; `zod` in a server function file fails, in its test or fixture passes.
- `src/server/sync/payload-size.test.ts` -- create: a fake client feeding `createSyncer` a 4167-torrent `full_update` (names about 80 characters with CJK, `save_path` under `/data/media/X/incompleted` or `/data/torrent/mteam-seed`, categories `X`, `mteam-X`, `mteam-tv`), then a partial where 300 seeding torrents change only `seeding_time`; assert `JSON.stringify` of the full read is under 2 MiB and of the next delta read under 160 KiB, and that the delta's `changed` has exactly 300 items. Record measured sizes in the PR -- deferred item (a).

**Acceptance Criteria:**
- Given the built app, when `npm run build && npm run smoke` run after the `start.ts` line is removed, then B9 and B10 still pass (getMaindata is bundled via `src/router.tsx`) and `.output/public` contains no `SERVER_ONLY_MARKERS` string.
- Given the source tree, when `rg -n "setQueryData|setQueriesData" src --glob '!**/*.test.ts'` and `rg -n "refetchInterval" src --glob '!**/*.test.ts'` run, then no hit writes `['maindata']` and every `refetchInterval` value is `pollInterval(...)`; `rg -n "\.state\s*[!=]==?" src/features src/routes` has no torrent hit.
- Given `npm run lint` on a probe file in `src/features` containing `torrent.state === 'error'`, when linted, then it fails with the `classify()` message (proved by `src/lint-rules.test.ts`).
- Given the PR description, when read, then it lists the payload sizes measured by `payload-size.test.ts` and the `seeding_time` decision, and quotes the Claude 代決 list below for Alex's veto.

## Spec Change Log

### 2026-11-16: review pass 1
- Trigger: review findings on the connection store (single code), alert wording, offline behaviour, select sharing, lint bypasses and the payload measurement layer.
- Amended (applied as patches): connection store holds a set of codes; maindata `timeout` shows as `qbit_unreachable`; alert suffix only past the stale threshold; `isFetching` input; `networkMode: 'always'`; default structural sharing restored; `bindFetchMaindata` exported and tested; payload measured as the seroval envelope with wire budgets 3 MiB and 224 KiB alongside the original JSON budgets.
- Known-bad state avoided: hung qBittorrent with no alert; lower-priority codes hiding Cloudflare expiry; silent pause on a phone without signal; full list re-render every 5 s; a broken binding pulling the full list each poll.
- KEEP: pure function tables, merge reference preservation, single writer.

### 2026-11-16: review pass 2 (multi-model review of 1.4 to 1.6, findings D1 to D5, C4 to C6, L1)
- D1: unreachable codes replace each other; a maindata failure the container answered clears them; Cloudflare stays until a success (row S1).
- D2: `isFetching` replaced by `fetchStartedAt` with a 2 s grace, so a hung fetch still shows 「最後更新 N 秒前」 (row A5).
- D3: `stateBeforeMove` required in `classify()` and `statusOf()`.
- D4: stable selectors, `useVisibleTorrents(view)`, and the stable-`select` rule on `useMaindata`.
- C4: `refreshMaindata` sends `fresh: true`; the syncer skips the 1 s reuse for it (row Q7).
- C5: lint catches `queryOptions` / `useQueries` / `useInfiniteQuery` / `setQueryDefaults`; `{ state }` destructuring only from torrent-named values; `src/shared/ui` out of the AR-41 block.
- C6: alert codes ranked by `Record<ConnectionCode, ...>`.
- L1: zod ban on `src/server/functions` production files.
- Noted items fixed on the way: `bad_origin` logged once per client; `unlessLoginRequired` shared from `src/state/login-required.ts`.

## Review Triage Log

### 2026-11-16: Review pass
- verdicts: 32 findings: high 0, medium 7, low 25, false 0, maybe-false 0
- findings:
  - `[low]` `[reject]` Intent A: polling only exists in tests until a screen mounts useMaindata. by design: Stories 1.7 and 1.8 mount the readers; the router binding is now tested.
  - `[low]` `[patch]` Intent: qbit_auth_failed stop path untested in this story. stop row variant added.
  - `[low]` `[patch]` Intent: mutation-side onError for connection codes and bad_origin untested. tests added.
  - `[low]` `[patch]` Intent: Story 1.6 AC wording still says the error reason is returned. epics.md updated to the fixed line and Story 2.10.
  - `[low]` `[reject]` Intent E: classify branches on completion_on > 0 and dlspeed > 0 outside format.ts. those are status logic, not display of special values; format.ts owns the text.
  - `[medium]` `[patch]` Edge: timeout raises no connection alert. timeout shown as qbit_unreachable.
  - `[low]` `[patch]` Edge: refreshMaindata fetches while login is required without observers. early return.
  - `[low]` `[patch]` Edge: lastSuccessAt 0 shows a huge stale age. treated as never.
  - `[low]` `[patch]` Edge: 「最後更新 剛剛」 on the first failed poll. suffix only past the stale threshold.
  - `[low]` `[patch]` Edge: future date shows a bare date. daysAgo <= 0 is today.
  - `[low]` `[patch]` Edge: ratio just under 1 displays 1.00 but is not good. good decided from the floored value.
  - `[low]` `[patch]` Edge: queryFn override on MAINDATA_KEY bypasses the merge. lint ban.
  - `[low]` `[patch]` Edge: aliased, spread or computed forms bypass the write ban. selectors extended with probes.
  - `[low]` `[patch]` Edge: optional chaining, includes, destructuring bypass the state ban. selectors extended with probes.
  - `[low]` `[reject]` Edge: duplicate hashes in a full answer. the server builds changed from an object keyed by hash, so duplicates cannot occur.
  - `[low]` `[patch]` Edge: complete-login lost maindata coverage. polling-restarts-after-login row.
  - `[low]` `[patch]` Blind: 「最後更新 剛剛」. same fix as the Edge row.
  - `[medium]` `[patch]` Blind: timeout gives no alert. same fix.
  - `[medium]` `[patch]` Blind: store keeps only the latest code. set of active codes with priority.
  - `[low]` `[patch]` Blind: connection error lingers on screens without maindata. cleared on the next maindata success, which resumes after login; tested.
  - `[medium]` `[patch]` Blind: structuralSharing false breaks select sharing. default sharing restored; reference test.
  - `[medium]` `[patch]` Blind: offline pauses the fetch and refreshMaindata hangs. networkMode always; test.
  - `[low]` `[patch]` Blind: AR-39 ban misses as const and other write paths. selectors extended; direct cache setData stays a review-time rule.
  - `[low]` `[patch]` Blind: AR-41 ban misses includes, endsWith, indexing, destructuring, shared/ui. extended.
  - `[low]` `[patch]` Blind: payload budget measures JSON, not the serialized envelope. measured with seroval.
  - `[low]` `[patch]` Blind: no test that polling restarts after login. row added.
  - `[low]` `[patch]` Blind: stale line flashes on tab return. isFetching input.
  - `[low]` `[patch]` Blind: client without fetchMaindata fails silently. clear error.
  - `[low]` `[patch]` Blind: C1 copies SHOWS_PROGRESS; moving plus missingFiles row missing. explicit booleans; V row.
  - `[low]` `[patch]` Blind: formatRowSpeed null; zoneFormat bad zone. handled.
  - `[medium]` `[patch]` VG: features/routes lint block may drop raw-HTML and session bans untested. probes under features and routes.
  - `[medium]` `[patch]` VG: production fetchMaindata binding never run. binder exported and tested.

## Design Notes

## Resolved question (Alex, 2026-11-16)

Alex chose: fixed line now (option A, 「qBittorrent 回報錯誤」), and add a later story for the real reason. `epics.md` now has Story 2.10 「出錯種子的原因」 (read-only qBittorrent log, privacy filtering). This story implements option A. Original question kept below.

### Original question

EXPERIENCE "qBittorrent 狀態對應" (Alex-confirmed, memlog #118 to #120) and PRD FR-8 say a torrent in qBittorrent state `error` shows "qBittorrent 給的原因" as its second line (and as the detail summary). qBittorrent 5.1.4 has no error-reason field in `sync/maindata` (checked in `serialize_torrent.cpp` during Story 1.5) and no other WebUI endpoint returns it; the reason only appears as free text in qBittorrent's own log. Which second line should `error` torrents show?
- **A (recommended):** a fixed line, proposed 「qBittorrent 回報錯誤」; detail summary falls back to 「85 GB · mteam-tv」 like `unknown`. No extra requests.
- **B:** the container reads qBittorrent's log (`log/main`, read-only) and picks the latest error line for that torrent. Adds a second qBittorrent endpoint, parses free-form text that contains file paths (privacy filtering needed); its own later story, with A until then.
- **C:** no second line for `error`.

On an answer the only edits are the `error` row in the table below and status `ready-for-dev`; every other part of this spec is decided.

**Status table for `classify()`** (C1; `detail` built only from `format.ts`):

| state | status / word | column | detail |
|---|---|---|---|
| `error` | error / 錯誤 | attention | fixed 「qBittorrent 回報錯誤」; detail summary falls back to size and location like `unknown` |
| `missingFiles`, `private: true` | error / 錯誤 | attention | 「找不到檔案，做不了種」 |
| `missingFiles`, `private` false or null | archived / 已整理 | archived | 「已整理」 |
| `stalledDL` | stalled / 停滯 | attention | 「卡在 87%，沒有來源」 |
| `downloading`, `forcedDL` | downloading / 下載中 | downloading | 「剩 34 分 · ↓ 6.21 MB/s」; speed 0: 「剩餘時間不明」 |
| `metaDL`, `forcedMetaDL` | downloading / 下載中 | downloading | 「抓種子資訊中」 |
| `queuedDL` | downloading / 下載中 | downloading | 「排隊中」 |
| `checkingDL`, `allocating`, `checkingResumeData` | downloading / 下載中 | downloading | 「檢查檔案中」 |
| `pausedDL`, `stoppedDL` | paused / 已暫停 | downloading | 「手動暫停」 |
| `uploading`, `forcedUP`, `queuedUP`, `checkingUP` | seeding / 做種中 | seeding | 「做種 41 天」 (`formatDuration(seeding_time)`) |
| `stalledUP` | seeding / 做種中 | seeding | 「沒人在抓」 |
| `pausedUP`, `stoppedUP` | done / 已完成 | done | 「今天 09:12 下載好了」; `completion_on` 0 or less: 「下載好了」 |
| `moving` | from `stateBeforeMove`, else progress rule | same | 「搬移中」 |
| `unknown`, any unlisted code | error / 錯誤 | attention | 「狀態不明」 |

`showsProgress` is true for downloading, paused and stalled.

**Carried-forward items:**
- (a) 1.5 payload: synthetic estimate with that shape gave about 1.67 MB full and 122 KB per delta with 300 ticking seeders (about 412 bytes per torrent; gzip about 77 KB and 7 KB). Decision (Claude 代決 1): keep `seeding_time` in the Epic 1 field list. `classify()` needs it for 「做種 41 天」, values stay qBittorrent's own, and the delta is fine on the LAN; over the Tunnel Cloudflare compresses JSON (not verified here). `payload-size.test.ts` guards the budget so a regression is visible.
- (b) 1.5 side-effect import: removed; `src/router.tsx` imports `getMaindata`; smoke keeps the `.output/public` check.
- (c) 1.3 numeric `refetchInterval`: maindata uses `pollInterval()`; a lint rule now rejects any other `refetchInterval` value.
- (d) 1.3/1.4 fetch on mount while login required: maindata gets `enabled: () => !isLoginRequired()`, so a mount with no data does not fetch (Q4); the existing login-store subscription re-runs `setOptions`, so polling resumes after login. `refetchQueries` skips disabled queries, so `refreshMaindata()` is a no-op while login is required.

**Claude 代決 (each open to Alex's veto):**
1. `seeding_time` stays (above).
2. `retry: false` for maindata: the next 5 s poll is the retry, so the alert appears after one failed call instead of after the 3 retries with backoff.
3. Connection store is cleared only by a successful `['maindata']` fetch (a `getSession` success says nothing about qBittorrent).
4. `qbit_unreachable` alert text gets the same 「，最後更新 N 分前」 suffix as `home_unreachable`; without a last success the suffix is dropped.
5. `moving` without a remembered state: progress under 1 shows 下載中, progress 1 shows 做種中. The memory lives in `Maindata.stateBeforeMove`, maintained by the merge. Epic 5's `movingTo` may replace it.
6. `private: null` (no metadata yet) counts as a regular torrent.
7. Unlisted future state codes map like `unknown`.
8. Seeding detail is 「做種 41 天」 (matches the detail hero wording), using duration rules.
9. Rounding: sizes and speeds round half up, unit picked after rounding; ratio and percent floor (so 「1.00」 always means good); percent guards float error (`Math.floor(p * 100 + 1e-9)`), capped at 99 below 1.
10. Speeds keep fixed decimals (「10.0 MB/s」, 「1.00 MB/s」); non-zero speed under 1 KB/s writes 「1 KB/s」. Sizes under 1 KB use 「B」.
11. Under one minute: 「剩不到 1 分」 (spec) and 「不到 1 分」 for durations; ago under 10 s and future times are 「剛剛」; ETA drops a zero trailing part (「剩 3 小時」); all time parts floor.
12. Location label for root or empty path is 「/」; empty segments ignored.
13. `TorrentView` starts as `{ sort: 'added_on_desc' }`; `countAll` is a separate selector (no sort needed to count).
14. ~~`structuralSharing: false`~~ (reverted in review pass 1): default structural sharing, so `select` results keep their reference.
15. Lint bans for `torrent.state` comparisons apply to `src/features` and `src/routes` only (`src/shared/ui` was added in review pass 1 and removed in review pass 2: generic UI has its own `state`).
16. (review pass 2) The stale line waits 2 s after a fetch starts (`FETCH_GRACE_MS`); a longer fetch shows it.
17. (review pass 2) A maindata failure with a non-connection code clears `home_unreachable` / `qbit_unreachable` (the container answered) but not `cloudflare_expired`, which only a success clears.
18. (review pass 2) `useConnectionAlert(now)` added so Story 1.7 has one call that wires the alert inputs; the caller supplies the ticking `now`.

**Investigation (AD-11, versions from package.json; behaviour also read in `node_modules/@tanstack/query-core` 5.107.1 source):**
- useQuery options (`enabled` function, `refetchInterval` function, `refetchIntervalInBackground`, `refetchOnWindowFocus: 'always'`, `structuralSharing` false or function, `retry`): https://tanstack.com/query/v5/docs/framework/react/reference/useQuery. Source: the interval timer skips a tick unless `refetchIntervalInBackground` or `focusManager.isFocused()`.
- QueryClient `setQueryDefaults` (observer options merged by key), `cancelQueries` (`revert: true` default keeps old data), `refetchQueries` (`cancelRefetch: true` default; skips disabled queries), `getQueryData`: https://tanstack.com/query/v5/docs/reference/QueryClient
- QueryFunctionContext has `client`, `signal`: https://tanstack.com/query/v5/docs/framework/react/guides/query-functions
- Structural sharing and render optimizations: https://tanstack.com/query/v5/docs/framework/react/guides/render-optimizations
- Window focus (visibilitychange in v5): https://tanstack.com/query/v5/docs/framework/react/guides/window-focus-refetching and https://tanstack.com/query/v5/docs/reference/focusManager
- Cancellation: https://tanstack.com/query/v5/docs/framework/react/guides/query-cancellation; QueryCache `onError` / `onSuccess`: https://tanstack.com/query/v5/docs/reference/QueryCache
- `Intl.DateTimeFormat.prototype.formatToParts` with `timeZone`: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/formatToParts; `Intl.NumberFormat`: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat
- TanStack Store (connection store, same as login store): https://tanstack.com/store/latest/docs/framework/react/quick-start
- qBittorrent 5.1.4 facts from Story 1.5: ratio at or above max is `-1`, stopped `eta` is 8640000, `private` is `null` without metadata, no error-reason field.

## Verification

**Commands:**
- `source ~/.nvm/nvm.sh && nvm use && npm run lint` -- expected: exit 0.
- `source ~/.nvm/nvm.sh && nvm use && npm run typecheck` -- expected: exit 0.
- `source ~/.nvm/nvm.sh && nvm use && npm test` -- expected: all pass, including M, C, F, V, P, A, Q rows, lint probes and the payload test.
- `source ~/.nvm/nvm.sh && nvm use && npm audit --audit-level=high` -- expected: no high or critical findings.
- `source ~/.nvm/nvm.sh && nvm use && npm run build && npm run smoke` -- expected: `smoke: built server ok`, B9 and B10 pass, public bundle free of server-only strings.
- `bash .claude/skills/next-story/check.sh` -- expected: every line `ok`.

## Auto Run Result (pipeline)

- **Decision by Alex (2026-11-16):** `error` torrents show the fixed second line 「qBittorrent 回報錯誤」; the real reason is Story 2.10 (added to epics.md).
- **Review findings:** 32 findings. 29 patched (7 medium entries), 3 rejected with reasons. Plus 1 deferred item from the patch round (wire size).
- **Follow-up review recommended:** false. Each medium patch has a test that was shown to fail when the fix was removed (implementer broke networkMode, select sharing, login early return, since and signal in the binding, and the timeout mapping); no unverified risk from the patches can be named.
- **Verification (Node v26.13.1):** lint exit 0; typecheck exit 0; vitest 45 files, 788 tests passed; audit 0 vulnerabilities; fresh build ok; `npm run smoke` passed; `check.sh` all ok. Payload: plain JSON full 1,802,527 bytes, delta 130,708 bytes; wire (seroval) full 2,704,841 bytes, delta 195,811 bytes.
- **Residual risks:** wire size (deferred); polling becomes live only when Story 1.7 or 1.8 mounts `useMaindata`.
