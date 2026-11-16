---
title: 'Story 1.5: Container owns the qBittorrent connection and torrent table'
type: 'feature'
created: '2026-11-16'
status: 'done'
baseline_revision: '901743631ea13cde4a7267bad0eb209b5856464d'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-react-torrent-2026-11-15/ARCHITECTURE-SPINE.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Payload size of getMaindata with about 4167 torrents is not measured; seeding_time ticks every second for seeding torrents.
    evidence: |-
      Story 1.6 builds polling on top; measure full and delta JSON sizes there with a synthetic 4167-row table and decide whether seeding_time belongs in the Epic 1 field list.
    location: >-
      src/shared/maindata.ts
    severity: low
  - summary: >-
      src/start.ts has a side-effect import of get-maindata so the function is bundled before any screen uses it.
    evidence: |-
      Story 1.6 imports getMaindata from a screen; remove the start.ts line then. Smoke now checks server-only strings never reach .output/public.
    location: >-
      src/start.ts
    severity: low
---

<intent-contract>

## Intent

**Problem:** Nothing talks to qBittorrent yet. The frontend (Story 1.6) needs one gated `getMaindata({ since })` that returns only changes, while the container must hold the only qBittorrent session (so the container IP is never banned by a re-login storm) and the only `rid`.

**Approach:** Add `src/server/qbit` (named-method client, in-memory session with single-flight re-login on 403 and a breaker that trips until restart), `src/server/sync` (a slim torrent table pulled from `sync/maindata` with the container's own `rid` only while a `getMaindata` call is being served, per-torrent `changedAt`, 10-minute tombstones, a version cursor that detects restarts), `src/shared/maindata.ts` (the field allowlists and response type) and the `getMaindata` GET server function.

## Boundaries & Constraints

**Always:**
- Follow the epic-1-context "Server function pattern (after PR #6)" exactly: `export const getMaindata = serverGet.validator(input(getMaindataInputSchema)).handler(guard({ name: 'getMaindata' }, async ({ input }) => ok(...)))`. The module exports only `getMaindata`. Known failures inside `src/server/*` are thrown as `ServerFailure(code)`; `guard()` maps them.
- qBittorrent parameters are built with `URLSearchParams` only. Login sends exactly `username` and `password` from `getEnv()`; maindata sends exactly `rid`.
- The cookie name and value are taken from the first `Set-Cookie` of a successful login as is (`response.headers.getSetCookie()[0]`, text before the first `;`, split at the first `=`). Never hardcode `SID`. Kept only in memory, never logged (not even the name).
- Every request to qBittorrent sends `Origin: <QBIT_URL origin>` and `Referer: <QBIT_URL origin>/` (wiki: must match the `Host` qBittorrent sees) and never asks qBittorrent to relax CSRF, Host checks, ban or auth bypass (AR-20).
- Each qBittorrent request has its own 30 s timeout driven by `setTimeout` plus an `AbortController` (fake-timer friendly; `QBIT_TIMEOUT_MS = 30_000` defined in `src/server/qbit`, because `src/server/*` may not import `src/server/functions`).
- Only allowlisted fields leave the container: torrent fields from `slimTorrentSchema`, server state from `serverStateSchema`, categories as `{ name, savePath }`. Allowlisting is done by zod parsing (unknown keys stripped), never by copying the raw object. `last_external_address_v4` / `_v6` (the home public IP), `magnet_uri`, `tracker`, `comment`, `content_path`, `download_path`, `root_path`, `infohash_*` never reach the table or the browser.
- Field names stay qBittorrent's own (`snake_case`, and `savePath` for categories as qBittorrent writes it); times in Unix seconds, sizes in bytes, speeds in bytes/s. The torrent identity is the maindata key lowercased, checked with `isTorrentHash` from `src/lib/is-torrent-hash.ts`, and added as `hash` to each slim torrent.
- Log through `src/server/log` only: `qbit_login` (info, `{ reason: 'initial' | 'expired' }`), `qbit_breaker_open` (error, `{ reason: 'login_failed' | 'login_forbidden' }`, once), `qbit_unreachable` (warn, `{ path, error }`), `qbit_login_no_cookie` (warn), `qbit_bad_response` (warn, `{ path, status }`, never the body). Paths are the constant API paths, never the full URL.
- All tests use fake qBittorrent responses through an injected or stubbed `fetch` and the fake origin `http://qbit.test.invalid:8080`; fake usernames and passwords only; no IP address literals anywhere (use marker strings such as `fake-external-v4`).

**Never:**
- No generic `/api/v2/*` forwarding, no path built from caller input, no `app/setPreferences` or any preferences, transfer-limit or torrent write endpoint. The client exposes named methods only; this story has exactly one: `syncMaindata(rid)`.
- No background timer or interval for syncing; no sync when no `getMaindata` call is being served.
- No new error codes, no HTTP 401, no exception text, URL or qBittorrent body in `message`.
- No frontend work (`maindata-merge`, polling, `classify`, screens are Stories 1.6 to 1.8), no `getFiles` or write functions, no `movingTo` (later epics).
- No reading `.env` values and no contact with the real qBittorrent from tests, smoke or automation (AD-15). The AR-58 read was done once by the orchestrator; its result is below.

## I/O & Edge-Case Matrix

Q rows: `src/server/qbit`. S rows: `src/server/sync`. G rows: `getMaindata` through `guarded.run` with `testSession()`.

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Q1 First login | No cookie; login answers 200 `Ok.` with `Set-Cookie: QBT_SID_8080=abc; HttpOnly; path=/` | Login body is `URLSearchParams` `username=...&password=...`; the maindata request then carries `Cookie: QBT_SID_8080=abc`, `Origin` and `Referer` of the fake origin; one `qbit_login` `initial` line | none |
| Q2 Ok without cookie | Login 200 `Ok.`, no `Set-Cookie` | `qbit_rejected`; breaker stays closed; next call tries login again | `qbit_login_no_cookie` logged |
| Q3 Ten concurrent 403s | Cookie stored; 10 parallel `syncMaindata` calls all get 403; login resolves later with a new cookie | Exactly 1 login request; each of the 10 resends once with the new cookie; all 10 succeed; one `qbit_login` `expired` line | none |
| Q4 Stale 403 | A request sent with the old cookie gets 403 after a newer cookie is stored | Resends with the newer cookie, no login | none |
| Q5 403 again after re-login | Resend after a successful re-login is 403 again | `qbit_rejected`; no second login for that request; breaker closed | `qbit_bad_response` logged |
| Q6 Login Fails. | Initial login or re-login answers 200 `Fails.` | That call returns `qbit_auth_failed`; the next 5 calls return `qbit_auth_failed` with zero further fetch calls (login count stays 1) until a new client instance | one `qbit_breaker_open` `login_failed` line; no password in any line |
| Q7 Login 403 | `auth/login` answers 403 (IP banned) | Same as Q6 | `qbit_breaker_open` `login_forbidden` |
| Q8 Unreachable | fetch rejects `TypeError('fetch failed')` (cause `ECONNREFUSED` or `ENOTFOUND`) on login or maindata | `qbit_unreachable`; breaker unaffected; the next call tries again | `qbit_unreachable` line; with `QBIT_URL` stubbed to the fake origin, no line contains `qbit.test.invalid` |
| Q9 No answer | fetch never settles until its signal aborts; fake timers advance 30 s | `timeout`; the fetch signal is aborted; breaker unaffected | none |
| Q10 Bad answer | maindata 500, non-JSON body, JSON failing the raw schema, or a key that is not a torrent hash | `qbit_rejected` | `qbit_bad_response` with status only |
| Q11 Surface | the client object and `QBIT_PATHS` | `Object.keys(client)` equals `['syncMaindata']`; `QBIT_PATHS` holds only `/api/v2/auth/login` and `/api/v2/sync/maindata`; a raw-source scan of `src/server/**` (non-test) finds no `setPreferences` and no template path starting `` `/api/v2/${ `` | none |
| S1 First pull | Empty table; maindata `rid` 0 answers `full_update: true` with 3 torrents, categories, full `server_state` | Table has 3 slim torrents; version counter 1; stored `rid` from the answer | none |
| S2 Partial, slim field | Next answer changes `progress` of one torrent and `num_seeds` (not slim) of another | Only the first gets `changedAt` = new version; a change in non-slim fields only does not bump the version | none |
| S3 Removed | `torrents_removed: [h]` | `h` leaves the table; tombstone `{ removedAt: version, at: now }` | none |
| S4 Full again | Later `full_update: true` (new qBittorrent session) with one torrent changed, one missing, one identical | Identical keeps its `changedAt`; changed is bumped; missing is tombstoned; categories replaced | none |
| S5 Categories and state partial | `categories` with only `savePath` for an existing name, `categories_removed`, `server_state` with only `dl_info_speed` | Category merged by name and removed one dropped; server state merged key by key | none |
| S6 Re-added | A tombstoned hash appears again | Tombstone dropped; torrent bumped, so it is in `changed` and not in `removed` | none |
| S7 New torrent incomplete | Partial answer brings an unknown hash without every slim field | `qbit_rejected`; table, version and `rid` unchanged | `qbit_bad_response` |
| S8 Pull fails | Any Q8 to Q10 failure during a pull | Table, version and `rid` unchanged (old data kept, NFR-2); the error reaches every caller waiting on that pull | as Q rows |
| S9 Idle | One read, then the fake clock advances 10 minutes with no reads | Zero qBittorrent calls while idle; the next read pulls once with the stored `rid` | none |
| S10 Coalescing | Two reads in parallel, then a third 500 ms later | One pull serves all three; a read 1 s or more after the last pull pulls again | none |
| S11 private | Torrents with `private` `true`, `false`, `null` (no metadata) | Values kept as is; `null` allowed | none |
| G1 No since | `{}` or `undefined` | `full: true`, `changed` = every torrent, `removed: []`, `serverState` and `categories` present | none |
| G2 Current since | `since` = latest version | `full: false`, `changed: []`, `removed: []` | none |
| G3 Older since | same instance, after one change and one removal | only the changed torrent and the removed hash | none |
| G4 Too old | `since` below the tombstone floor (tombstone pruned after 10 min on the fake clock) | `full: true` | none |
| G5 Restart | `since` with another instance id (`00000000.1`, or from a second syncer) | `full: true` | none |
| G6 Ahead | same instance id, counter above current | `full: true` | none |
| G7 Malformed | `since: 'abc'`, `since: 5`, `{ since, extra: 1 }` | `invalid_input`; zero qBittorrent calls | none |
| G8 Logged out | no session | `not_logged_in`; zero qBittorrent calls | none |
| G9 Allowlist | fake answer with `last_external_address_v4: 'fake-external-v4'`, `magnet_uri`, `tracker`, `comment`, `content_path` | `serverState` keys are exactly the 6 of `serverStateSchema`; each torrent's keys are exactly `TORRENT_FIELDS`; `JSON.stringify(result)` contains none of the marker values | none |
| G10 Errors pass | Q6, Q8, Q9 situations | `{ ok: false, error: { code, message } }` with `qbit_auth_failed`, `qbit_unreachable`, `timeout` and the fixed `ERROR_MESSAGES` text; result JSON has no `qbit.test.invalid` | none |
| G11 Alt limit | `use_alt_speed_limits: true`, `dl_rate_limit: 10240`, `up_rate_limit: 0` | passed through unchanged (qBittorrent already reports the limit in effect) | none |

</intent-contract>

## Code Map

- `src/server/functions/_define.ts` -- `serverGet`, `input`, `guard`, `GUARDED`; ServerFailure mapping and the 30 s handler timeout (returns `timeout`, aborts its signal).
- `src/server/functions/get-session.ts`, `get-session.test.ts` -- smallest gated GET pattern and test harness (`guarded.run({ data: input(schema)(value), context: { session: testSession() } })`).
- `src/server/functions/discover.test.ts` -- auto-discovers every server function; expects `not_logged_in` without a session.
- `src/server/errors/server-failure.ts` -- `ServerFailure(code, logMessage)`.
- `src/shared/errors.ts` -- `ok`, `fail`, `ERROR_MESSAGES`; `src/shared/zod.ts` -- jitless `z` that `src/shared` must use.
- `src/server/env/index.ts` -- `getEnv()` (`qbitUrl` is a normalised origin), `resetEnvCache()` for tests.
- `src/server/log/index.ts` -- `log`; masks sensitive keys and scrubs `QBIT_URL`, its host and `QBIT_PASSWORD` from every line.
- `src/server/auth/testing.ts` -- `testSession()`.
- `src/lib/is-torrent-hash.ts` -- lowercase 40/64 hex check.
- `src/state/call-fn.ts` -- comment already shows `callFn(getMaindata, { since }, { signal })`; Story 1.6 consumes the response type.
- `scripts/smoke-built-server.mjs` -- `serverFnIds()`, `callServerFn()`, `checkLoginFlow()` rows B1 to B8; boots with `QBIT_URL=http://qbit.test.invalid:8080`.
- `eslint.config.js` -- layer map: `server/functions` -> `server`, `shared`; `server` -> `server`, `lib`, `shared`; `shared` must import `z` from `#/shared/zod`.

## Tasks & Acceptance

**Execution:**
- `src/shared/maindata.ts` -- create: `slimTorrentSchema` (`z.object`, fields: `hash` string, `name` string, `state` string, `progress` number, `size` number, `dlspeed` number, `upspeed` number, `eta` number, `ratio` number, `added_on` number, `completion_on` number, `seeding_time` number, `save_path` string, `category` string, `private` boolean nullable, required key); `TORRENT_FIELDS` derived from its shape; `serverStateSchema` (`dl_info_speed`, `up_info_speed`, `dl_rate_limit`, `up_rate_limit` numbers, `use_alt_speed_limits` boolean, `connection_status` enum `connected | firewalled | disconnected`); `categorySchema` (`name`, `savePath` strings); `MAINDATA_VERSION_PATTERN` (`/^[0-9a-f]{8}\.(0|[1-9][0-9]{0,14})$/`); `getMaindataInputSchema = z.strictObject({ since: z.string().regex(MAINDATA_VERSION_PATTERN).optional() }).optional()`; exported types `SlimTorrent`, `ServerState`, `Category`, `MaindataVersion`, `MaindataResponse = { version: string; full: boolean; changed: SlimTorrent[]; removed: string[]; serverState: ServerState; categories: Record<string, Category> }`. Header comment: later stories add fields here only -- AR-37 single field list.
- `src/server/qbit/maindata-schema.ts` -- create: zod schema of the raw `sync/maindata` answer limited to what is read: `rid` int, `full_update` optional boolean, `torrents` optional record of `slimTorrentSchema.omit({ hash }).partial()`, `torrents_removed`, `categories` (record of `categorySchema.partial()`), `categories_removed`, `server_state` (`serverStateSchema.partial()`), all optional; export `RawMaindata` -- strip is the allowlist.
- `src/server/qbit/session.ts` -- create `createQbitSession({ baseUrl, username, password, fetch?, logger? })`: in-memory cookie, `send(path, { method, query?, form? })` with the per-request timeout and error mapping (fetch rejection from the timeout to `timeout`; any other rejection to `qbit_unreachable` plus log; 403 to the re-login path; other non-2xx to `qbit_rejected`), single-flight `login()` shared through one pending promise, the stale-cookie check of Q4, one resend, and a breaker flag that makes `send` throw `qbit_auth_failed` before any fetch. Login with a cookie never sends the old cookie -- AR-19, AR-20, Q1 to Q9.
- `src/server/qbit/client.ts` -- create `QBIT_PATHS` (constant) and `createQbitClient(options)` returning a frozen object with only `syncMaindata(rid: number): Promise<RawMaindata>` (GET with `rid` in `URLSearchParams`, JSON parse and schema parse failures to `qbit_rejected` plus `qbit_bad_response`) -- AR-24, Q10, Q11.
- `src/server/qbit/index.ts` -- create lazy singleton `getQbitClient()` built from `getEnv()` on first use with `fetch` read from `globalThis` at call time; `resetQbitClientForTests()` (tests only, like `resetEnvCache`). No env read at import (the discovery test imports every function module).
- `src/server/sync/torrent-table.ts` -- create `createTorrentTable(now = Date.now)`: `apply(raw)` (torrents before `torrents_removed`; full update diffs against the table as in S4; one version bump per apply that changed or removed at least one torrent; prunes tombstones older than `TOMBSTONE_MS = 600_000` and raises `floor` to the highest pruned `removedAt`; validates new hashes and new-torrent completeness before mutating anything), `serverState`, `categories`, `version`, `changesSince(counter | null)` returning `{ full, changed, removed }` per G1 to G6. `changedAt` stays internal; `changed` items are plain `SlimTorrent` objects -- AR-37, S1 to S7, S11.
- `src/server/sync/syncer.ts` -- create `createSyncer({ client, now?, instanceId? })`: `instanceId` 8 random hex chars from `node:crypto` by default; `read(since?)` that pulls first when there is no successful pull yet or the last pull started `MIN_PULL_INTERVAL_MS = 1000` or more ago, joins an in-flight pull otherwise, keeps `rid` from the last applied answer only, then parses `since` (other instance id, counter above current or below the floor means full) and returns `MaindataResponse` with `version` formatted `<instanceId>.<counter>`. A read before any successful pull that fails rethrows the pull's `ServerFailure` -- AR-37, AR-38, S8 to S10, G1 to G6.
- `src/server/sync/index.ts` -- create lazy singleton `getSyncer()` over `getQbitClient()`, plus `resetSyncerForTests()`.
- `src/server/functions/get-maindata.ts` -- create `getMaindata` per the pattern: `ok(await getSyncer().read(input?.since))` -- AR-24 (`getMaindata` only), AR-38.
- `src/server/qbit/session.test.ts`, `src/server/qbit/client.test.ts` -- create: rows Q1 to Q11 with a routing fake `fetch` (counts calls per path, captures headers and bodies; `Set-Cookie` via `new Response(body, { headers: [['set-cookie', ...]] })`), deferred promises for Q3, `vi.useFakeTimers()` for Q9, stdout capture for log assertions with `vi.stubEnv('QBIT_URL', 'http://qbit.test.invalid:8080')` plus `resetEnvCache()`.
- `src/server/sync/torrent-table.test.ts`, `src/server/sync/syncer.test.ts` -- create: rows S1 to S11 and G1 to G6 at module level with a fake client and fake clock.
- `src/server/functions/get-maindata.test.ts` -- create: method is GET, `spec.name` is `getMaindata`, rows G1, G2, G7 to G11 through `guarded.run` with stubbed env and global `fetch`, resetting both singletons in `afterEach`.
- `src/server/functions/discover.test.ts` -- extend "finds the real login and getSession functions" to also expect `./get-maindata.ts#getMaindata`.
- `scripts/smoke-built-server.mjs` -- extend `checkLoginFlow`: B9 `getMaindata` without cookie is HTTP 200 `not_logged_in`; B10 with the B3 cookie is HTTP 200 `qbit_unreachable` (the `.invalid` host never resolves) with `message` equal to `家裡的 qBittorrent 沒有回應` and a body without `qbit.test.invalid`; after shutdown, the captured stdout has a `qbit_unreachable` line and no line contains `qbit.test.invalid`. Update the header comment -- proves the built server's client and log masking end to end without any qBittorrent.

**Acceptance Criteria:**
- Given the merged branch, when `rg -n "createServerFn" src --glob '!src/server/functions/_define.ts'` and the discovery test run, then there are no hits and `getMaindata` returns `not_logged_in` without a session.
- Given the built server started by `npm run smoke`, when B9 and B10 run, then both return HTTP 200 with the contract codes above and nothing in the response or stdout names the qBittorrent host.
- Given the PR description, when read, then it records AR-58: on qBittorrent 5.1.4 every torrent in `sync/maindata` (rid 0) carried a boolean `private` field (266 true, 3901 false, 4167 torrents), so `private` is a required key in `src/shared/maindata.ts`, typed `boolean | null` because qBittorrent sends `null` for a torrent without metadata, and no architecture change is needed; it also notes the login cookie name observed was the default and the code keeps it generic.
- Given every test file added, when searched, then no IP address literal, real username, password or private category name appears, and only `X` / `mteam-X` would be used if a category is needed.

## Spec Change Log

### 2026-11-16: review pass 1
- Trigger: review found chained per-request timeouts (up to 120 s), a re-login storm after 403-after-relogin, no recovery from a rejected answer, a possible LAN IP in the unreachable log, and login 401 not opening the breaker.
- Amended (applied as patches): one 25 s deadline per `send()` replaces the 30 s per-request timeout; 60 s re-login cooldown; login 401 opens the breaker; `qbit_unreachable` logs `cause.code` only (Q8 field renamed from `error` to `cause`); rejected answers log `qbit_bad_maindata` with reason and field paths and reset `rid` to 0; failed pulls share the 1 s reuse window; smoke B10 uses a refused loopback port.
- Known-bad state avoided: stuck pulls timing out every reader; a login per poll; the same unusable delta forever; the NAS address in logs; retrying a wrong password.
- KEEP: pull-through design, slim allowlists, version format, tombstone floor.

## Review Triage Log

### 2026-11-16: Review pass
- verdicts: 30 findings: high 0, medium 11, low 17, false 1, maybe-false 1
- findings:
  - `[low]` `[reject]` Intent R1: on-demand pull instead of a background loop with a 30 s window. AD-6 says no sync without demand in the last 30 s; pull-through satisfies it with zero idle traffic; recorded as Claude 代決 1.
  - `[low]` `[reject]` Intent R2: getMaindata triggers qBittorrent reads and advances container state. no writes to qBittorrent; repeat-safe; R2a reading.
  - `[maybe-false]` `[reject]` Intent R3: an old since with no pruned tombstones gets an incremental reply. no removal can be missed because the floor rises whenever a tombstone is pruned; settle by checking AD-6 wording, which states the purpose (no missed removals).
  - `[low]` `[reject]` Intent R4: failure keeps old data in the container, not in the reply. container table is untouched (S8); keeping the old view is the front end's job (Story 1.6, NFR-2 client side).
  - `[low]` `[reject]` Intent R5: 10 concurrent 403s tested at the session layer. the AC is about the qBittorrent session; the syncer single-flight makes the server-function path collapse to one request anyway.
  - `[low]` `[patch]` Intent R6: session.send accepts any path and is exported. path typed to QBIT_PATHS union; lint bans importing session outside qbit.
  - `[low]` `[reject]` Intent R7: alt-limit semantics proven only by a fake. qBittorrent 5.1.4 source (sessionimpl.cpp) reports the alt values; documented in Design Notes.
  - `[medium]` `[patch]` Blind: per-request timeouts chain to 120 s and outlive the factory timeout; stuck inflight. one pull deadline under the factory timeout; inflight released; test distinguishes the timers.
  - `[medium]` `[patch]` Blind: no backoff after a failed pull; re-login storm after 403-after-relogin. failures reuse the 1 s window; 60 s re-login cooldown after a 403 right after re-login.
  - `[medium]` `[patch]` Blind: strict validation has no recovery and no diagnosis. rid reset to 0 after a rejected apply; distinct log event with reason and issue paths only.
  - `[low]` `[patch]` Blind: endpoint whitelist is a convention. typed path union and lint ban.
  - `[medium]` `[patch]` Blind: ECONNREFUSED fixture unrealistic; resolved LAN IP could reach the log. log cause.code only; realistic fixture; test asserts the address is absent.
  - `[low]` `[defer]` Blind: payload size with 4167 torrents not measured; seeding_time ticks. Story 1.6 builds polling; measure full and delta sizes there with a synthetic 4167-row table.
  - `[low]` `[patch]` Blind: categories lenient where torrents are strict. incomplete new category rejected.
  - `[low]` `[patch]` Blind: changesSince returns internal objects. copies or frozen rows.
  - `[low]` `[patch]` Blind: start.ts side-effect import unchecked; server code in client graph unasserted. smoke checks .output/public for server-only strings; Story 1.6 removes the import.
  - `[false]` `[reject]` Blind: review diff omits epic-1-context.md and the spec. the spec is the claims file by design; epic-1-context.md only gained the PR #6 pattern note.
  - `[low]` `[patch]` Blind: unreachable no-state branch has no log. removed.
  - `[low]` `[patch]` Blind: no syncer-level test of a session reset mid-stream. test added.
  - `[medium]` `[patch]` VG: retry after a failed pull never asserted. exact call counts; immediate and post-window reads tested.
  - `[medium]` `[patch]` VG: login 5xx or unexpected body keeping the breaker closed untested. it.each added; 401 now opens the breaker.
  - `[low]` `[patch]` VG other: G10 cannot tell which timeout fired. pull deadline test distinguishes them.
  - `[low]` `[patch]` VG other: _define doc says pass the signal to qBittorrent calls. doc comment updated.
  - `[medium]` `[patch]` Edge: login 401 keeps the breaker closed. 401 treated like Fails..
  - `[medium]` `[patch]` Edge: send chain up to 120 s. same fix as the Blind timeout row.
  - `[medium]` `[patch]` Edge: stuck inflight makes later reads time out. same fix.
  - `[low]` `[patch]` Edge: backward wall clock stops pulls. performance.now default clock.
  - `[medium]` `[patch]` Edge: resolved LAN IP in the unreachable log. same fix as the Blind fixture row.
  - `[medium]` `[patch]` Edge: rejected apply keeps the old rid forever. rid reset to 0.
  - `[low]` `[patch]` Edge: smoke B10 depends on .invalid DNS failing fast. B10 uses 127.0.0.1:1.

## Design Notes

**Investigation (AD-11):**
- qBittorrent WebUI API 5.0 wiki: https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-5.0) -- login sets the session cookie (`SID` in the example); 403 when the IP is banned; "Set Referer or Origin header to the exact same domain and port as used in the HTTP query Host header"; `sync/maindata` `rid`, `full_update`, partial torrent objects, `torrents_removed`, `categories(_removed)`, `server_state` (`dl_info_speed`, `up_info_speed`, `dl_rate_limit`, `up_rate_limit`, `connection_status` connected/firewalled/disconnected, `use_alt_speed_limits`). The wiki's torrent list names the field `isPrivate`; the 5.1.4 source and the real read both say `private`.
- Source at tag `release-5.1.4`: `src/webui/api/authcontroller.cpp` (body `Ok.` on success and when a session already exists, `Fails.` on bad credentials, ban throws AccessDenied = 403); `src/webui/webapplication.cpp` (cookie name from preference `getWebAPISessionCookieName()`, default `SID`, falls back to `SID` if invalid; any API call without a session throws `ForbiddenHTTPError` = 403; a request with neither Origin nor Referer passes the CSRF check); `src/webui/api/synccontroller.cpp` (sync state is per qBittorrent session, so a new session after re-login answers `full_update: true`; a mismatched `rid` resends from the last accepted point; partial updates carry only changed keys per torrent, per category and in `server_state`; the maindata torrent object has no `hash` key, the map key is the id; `last_external_address_v4/v6` are in `server_state`); `src/webui/api/serialize/serialize_torrent.cpp` (`private` is `null` without metadata; ratio at or above the max is sent as `-1`; there is no error-reason field); `src/base/bittorrent/sessionimpl.cpp` lines 3523 to 3543: `downloadSpeedLimit()` and `uploadSpeedLimit()` return the alternative limit while alternative limits are enabled. So `dl_rate_limit` / `up_rate_limit` already are the limit in effect (FR-5) and no extra reads are needed. URLs: `https://github.com/qbittorrent/qBittorrent/blob/release-5.1.4/<path>`.
- Node 26 fetch (undici): https://nodejs.org/docs/latest-v26.x/api/globals.html#fetch. Checked locally on Node 26.13.1: connection refused and DNS failure both reject `TypeError: fetch failed` (DNS cause code `ENOTFOUND`); aborting with a reason rejects with that reason (`AbortSignal.timeout` rejects `TimeoutError`, a plain abort `AbortError`). The client therefore decides `timeout` by its own timer having fired, and maps every other rejection to `qbit_unreachable`. Node's fetch sends `Origin` and `Referer` set by the caller; a constructed `Response` keeps `Set-Cookie` and `getSetCookie()` returns each.
- TanStack Start server functions (GET with validator): https://tanstack.com/start/latest/docs/framework/react/guide/server-functions. zod 4 `z.strictObject`, `.regex`, `.nullable`, `.partial`, `.omit`, `z.record`: https://zod.dev/api.

**Claude 代決 (each open to Alex's veto):**
1. Pull-through sync instead of a timer loop. AD-6 and AR-37 bound syncing to "a client asked in the last 30 s"; pulling only inside a `getMaindata` call meets that with zero idle traffic, fresher data, natural error reporting and no timer to leak. The S9 test proves no qBittorrent call during 10 idle minutes and a resume on the next call. A timer loop would add load (qBittorrent polled faster than any client) and a "last error" side channel.
2. Pulls coalesce: one in flight at a time, reused for any read within 1 s of the last pull start.
3. Version cursor `<8 hex instance id>.<counter>` as a string. A different instance id means the container restarted; malformed input is `invalid_input` (only our frontend sends it); ahead of current or below the floor means `full: true`.
4. Floor rule for "older than the tombstone window": pruning a tombstone raises `floor` to its `removedAt`; `since` below `floor` gets `full: true`.
5. `serverState` and `categories` are sent whole in every response (6 numbers and a few dozen categories); only torrents are incremental.
6. A later `full_update` (new qBittorrent session) is diffed against the table so clients see only real changes.
7. Strict validation: an answer that fails the raw schema, has a non-hash key or brings an incomplete new torrent is `qbit_rejected` and changes nothing. qBittorrent is pinned at 5.1.4.
8. Any `Fails.` from login, including the very first login, trips the breaker: retrying a wrong env password is exactly the ban AD-4 prevents.
9. A 403 on the resend after a fresh login is `qbit_rejected`, not the breaker (the credentials were just accepted).
10. `Ok.` without `Set-Cookie` (for example auth bypass turned on, which AD-4 forbids) is `qbit_rejected` without tripping the breaker.
11. Field list for Epic 1 (list row, status circle, `classify`, header, "全部" counts): `hash`, `name`, `state`, `progress`, `size`, `dlspeed`, `upspeed`, `eta`, `ratio`, `added_on`, `completion_on`, `seeding_time`, `save_path`, `category`, `private`. `size` (selected files) over `total_size`. Known cost: `seeding_time` ticks every second for active seeders, so they appear in `changed` on most polls; accepted because `classify` needs 做種天數 and values must stay qBittorrent's own.
12. `changedAt` is internal; `changed` holds `SlimTorrent` objects only.
13. Order inside one answer: torrents first, then `torrents_removed` (removal wins).
14. Module layout as in Tasks: `qbit/{session,client,maindata-schema,index}.ts`, `sync/{torrent-table,syncer,index}.ts`; lazy singletons with test-only resets.

**Facts for Story 1.6 (not acted on here):** maindata 5.1.4 has no error-reason text, so the `error` row's second line "原因" has no source field in `sync/maindata`; `moving` replaces the state code, so "keep the original status" must be inferred from other fields; `ratio` `-1` means infinite; a stopped torrent's `eta` is qBittorrent's large sentinel (8640000 in the wiki example). Add any needed field to `slimTorrentSchema`.

## Verification

**Commands:**
- `source ~/.nvm/nvm.sh && nvm use && npm run lint` -- expected: exit 0.
- `source ~/.nvm/nvm.sh && nvm use && npm run typecheck` -- expected: exit 0.
- `source ~/.nvm/nvm.sh && nvm use && npm test` -- expected: all pass, including Q, S and G rows and the discovery test.
- `source ~/.nvm/nvm.sh && nvm use && npm audit --audit-level=high` -- expected: no high or critical findings.
- `source ~/.nvm/nvm.sh && nvm use && npm run build && npm run smoke` -- expected: `smoke: built server ok` with B9 and B10 passing.
- `bash .claude/skills/next-story/check.sh` -- expected: every line `ok` (covers em dashes, private words, IP literals and local secrets in added lines).

## Auto Run Result (pipeline)

- **AR-58:** one read-only request to the real qBittorrent by the orchestrator (v5.1.4, 4167 torrents): every torrent carries a boolean `private` field (266 true, 3901 false); login cookie name was `SID` (code keeps it generic). No architecture change needed.
- **Review findings:** 30 findings. 21 patched (11 medium entries), 1 deferred, 8 rejected with reasons.
- **Follow-up review recommended:** false. Each medium patch has a test that ran green (deadline vs factory timer, cooldown on a fake clock, 401 breaker, realistic ECONNREFUSED fixture asserting the address is absent, rid reset, failed-pull reuse window, session reset mid-stream); no unverified risk from the patches can be named.
- **Verification (Node v26.13.1):** lint exit 0; typecheck exit 0; vitest 37 files, 584 tests passed; audit 0 vulnerabilities; fresh build ok; `npm run smoke` passed (B9, B10, client bundle free of server-only strings); `check.sh` all ok.
- **Residual risks:** the deferred items; Nitro RC; everything tested against fake qBittorrent responses only (AD-15).
