---
title: 'Story 5.2: Change one torrent path'
type: 'feature'
created: '2026-11-21'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
baseline_revision: '6f89849c2970ceb675beb8c104f210454fdc74e0'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-react-torrent-2026-11-15/ARCHITECTURE-SPINE.md'
warnings: ['oversized']
deferred:
  - summary: >-
      The 10-minute movingTo expiry may drop a move that qBittorrent has queued behind another move, if a queued move does not report moving.
    evidence: |-
      Unverified. Settle on the NAS: start two moves at once and watch whether the second torrent reads moving while it waits. If it does not, the expiry rule needs a queue-aware condition.
    location: >-
      src/server/sync/torrent-table.ts settleMoves
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** The detail's 「改路徑」 button is still disabled, so Alex cannot move a torrent whose seeding time is over into the media library. The container has no way to ask qBittorrent to move a torrent, no record of where a move is going, and no way to add a common path.

**Approach:** Add two guarded POST server functions, `setLocation` (per-hash pre-check, then one qBittorrent call, records `movingTo` in the container's torrent table) and `addCommonPath` (idempotent settings write). Build a change-path dialog (desktop 560 px) and content-height sheet (phone) in a new `features/path`, opened from the detail's save-path block through a small open store, with the common-path list, the 「會搬到」 box, 「加到常用」 and 「搬過去」.

## Boundaries & Constraints

**Always:**
- Server functions only through `_define.ts` (`serverPost`, `input`, `guard`); `setLocation` uses `bodyLimit: HASH_LIST_BODY_LIMIT`, `addCommonPath` the default limit. Both answer `not_logged_in` with no session and are added to `src/server/functions/discover.test.ts`.
- `setLocation` input `{ hashes, location }`: `hashes` via `torrentHashListSchema` (1 to 5000, AR-28), `location` via `savePathSchema`, then `isUnderSaveRoot` or `invalid_input`. qBittorrent receives the normalized path.
- Per-hash pre-check against the container's table (fresh enough read, like `readCategoryNames`): unknown hash fails with `invalid_input`, a torrent already moving (`movingTo` set or `isMovingTorrent`) fails with `qbit_rejected`. The rest go to qBittorrent in ONE `POST /api/v2/torrents/setLocation` (`hashes` joined by `|`, `location`). A non-2xx answer (400, 409, anything) fails the whole call with one error (`qbit_rejected`). Success returns `BatchResult` with one item per input hash in input order (`allOk`-style for sent ones, the pre-check failures with their code and fixed message).
- `movingTo` (normalized target) is set on each sent hash only after qBittorrent answers 2xx, bumps `version` and that row's `changedAt` so `getMaindata` returns it. It is optional on `slimTorrentSchema` in `src/shared/maindata.ts`, omitted from qBittorrent's raw schema, and absent from rows that have none.
- `movingTo` is removed (row `changedAt` bumped) when: the row was seen in `moving` and is no longer; or normalized `save_path` equals the target; or 10 minutes passed with no `moving` seen and `save_path` unchanged since it was set (log a warn event with a count only, never a path or name, AR-36). Clock comes from the table's injected `now`.
- `addCommonPath` input `{ path, name, mediaLibrary }`: `path` via `savePathSchema` plus `isUnderSaveRoot`, `name` trimmed then `commonPathNameSchema` (1 to 50). Identity is the normalized path: already listed (trailing slash or not) succeeds without changing the stored entry; otherwise 50 stored entries fail `invalid_input`. Writes go through `getSettingsStore().update`; success returns `ok(written.settings)`, a failed write `settings_write_failed`. The frontend writes the answer to `['settings']` with `applySettings` through a `TrackedOp` in the `SETTINGS_WRITE_SCOPE`.
- Change path lives in `src/features/path/`. Open state lives in `src/state/change-path-open.ts` (`{ hashes } | null`, like `add-open.ts`); the detail's 「改路徑」 opens it with its torrent's hash; the route `_authed.tsx` renders the screen. 5.2 handles exactly one hash.
- Screen shape (DESIGN.md change-path, text-input; S08-path-desktop, S08-path-phone): `ConfirmShell` with `desktopWidthClass="w-[560px]"`, title 「改路徑」, below it the torrent name as plain text in `meta`/`text-muted`; phone is the shell's content-height sheet with no cancel. Only the save path, no temp path field. tv-sonarr and radarr torrents get no special case.
- 「常用路徑」 header 12px/600. Rows 52 px (phone 56 px): 20 px radio, name 13px/600 over path (mono 12 px, `text-muted`), right side a media-library tag reading 「媒體庫」 (location-tag media look, read once by screen readers) and an outline 「目前」 tag on the row `paths.ts` says the torrent is in now (longest match). Selected row: `bg-selection-row`, radio is a 2 px `accent` ring with an `accent` dot. 「目前」 and 「選中」 must read differently (taste-log principle 3): 「目前」 is only the outline tag, selection is only the background plus radio.
- The box: 36 px pill (phone 44 px, 16 px text), mono 12 px, label 「會搬到」, defaults to the torrent's current `save_path`. Clicking a row fills its path. A row is selected when the normalized box equals its normalized path (first such row if duplicates), otherwise none. Invalid format: border `delete`, one `meta` line under the box with the reason, 「搬過去」 disabled. 「搬過去」 is also disabled when the normalized box equals the normalized current `save_path`.
- Last list row 「加到常用」: sends `addCommonPath` with the normalized box path, `name` = `locationLabel` (last two segments), `mediaLibrary: false`; on success the list follows the returned settings. Disabled, with right-side `meta`/`text-muted` 「框裡的路徑已經在清單裡」 (phone 「已在清單裡」), when the normalized box path is already listed; also disabled while the box is invalid, while settings are not ready, and while its own request is in flight.
- 「搬過去」 sending follows the 4.3 shell: label 「搬移中…」, no second send, close paths locked, 「還在等 NAS 回應」 after 10 s; the server's 30 s guard answers `timeout`. Success: close, `refreshMaindata()`, record the hash and the target in `pendingOps`, never edit local data. Failure with a non-connection code: failure toast with 重試 (same body), text from `src/lib/error-text.ts` by code and operation, dialog stays open and keeps the box. A single-item `BatchResult` whose item failed is treated as that code's failure. Connection codes are left to the global handler.
- Every write is verified with fake qBittorrent responses only (AD-15). Fixture and screenshot data are fictional; private categories only as X or mteam-X.
- Framework code follows the docs for the locked versions (AD-11); record URLs in Design Notes.

**Never:**
- No 「編輯」 pill or edit mode, no inline rename after adding, no 「☆ 加到常用」 wiring (5.4). No moving display, completion toast or disabled-while-moving buttons (5.3). No selection-bar entry or many-torrent title (5.5).
- No new error codes (AD-9 needs a spine change). No `startsWith` path checks in features; path matching only from `src/lib/paths.ts`. No `torrent.state` reads in features or routes. No writes to `['maindata']`.
- No new dependencies, no i18n, animation or gesture packages. `src/state` never imports `src/shared/ui` or server functions.
- No paths or names in log lines.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| S1 move ok | 1 known hash, `/data/media/tv` | one qBittorrent call `hashes=<h>&location=/data/media/tv`; `{ items: [{ key: h, ok: true }] }`; next `getMaindata` row has `movingTo: '/data/media/tv'` | none |
| S2 trailing slash | `/data/media/tv/` | qBittorrent gets `/data/media/tv`; `movingTo` normalized | none |
| S3 outside roots | `/etc` or `/database` with roots `/data` | `invalid_input`, no qBittorrent call | fixed message |
| S4 dot-dot / relative / too long | `/data/../etc`, `data/tv`, 1025 chars | `invalid_input`, no call | fixed message |
| S5 pre-check | unknown hash plus known one; or known one already `moving` / with `movingTo` | only valid hashes sent; items in input order, unknown `invalid_input`, moving `qbit_rejected` | all invalid: no call, all items failed |
| S6 qBittorrent refuses | 400 or 409 or 500 | whole call `qbit_rejected`, no `movingTo` | fixed message |
| S7 movingTo cleared | row seen `moving` then leaves it; or `save_path` reaches target; or 10 min no `moving` and same `save_path` | `movingTo` gone, row `changedAt` bumped | expiry logs a count only |
| C1 add new path | `/data/media/anime`, name `media/anime` | appended, returns full settings | none |
| C2 add twice | same path, then with trailing `/` | one entry, the first unchanged, both succeed | none |
| C3 add invalid | `..`, outside roots, name blank, name 51 chars | `invalid_input` | none written |
| C4 full | 50 stored, new path | `invalid_input`; an already-listed path still succeeds | toast 「常用路徑最多 50 個」 |
| U1 open | torrent in `/data/torrents/tv`, seed `library` | box `/data/torrents/tv`, its row 「目前」 and selected, 「搬過去」 disabled | none |
| U2 pick library | click 影集媒體庫 | box `/data/media/tv`, that row selected, 「目前」 stays on the old row, 「搬過去」 enabled, 「加到常用」 disabled with the note | none |
| U3 bad format | box `data/tv`, `/data/../x`, 1025 chars | `delete` border, 「路徑要從 / 開頭」, 「路徑不能有 ..」, 「路徑太長」; 「搬過去」 disabled | none |
| U4 move fails | `ops=reject` | failure toast with 重試; dialog open, box kept; 重試 sends the same body | none |

</intent-contract>

## Code Map

- `src/server/functions/_define.ts` -- `serverPost` L28, `input` L49, `guard` L147 (checks session, body bytes, parse, 30 s, `ServerFailure`). Only place that calls `createServerFn`.
- `src/server/functions/delete-torrents.ts` -- closest analogue (28 lines). `src/server/functions/_add-entries.ts` L64 -- the only per-item batch result today.
- `src/server/functions/set-category-sort.ts` -- settings mutation model: `store.update(...)` then `ok(written.settings)` or `fail('settings_write_failed')`.
- `src/server/functions/discover.test.ts` L73-84 -- hard-coded list of discovered functions; add both.
- `src/server/gate/body-limit.ts` L25 `HASH_LIST_BODY_LIMIT` (comment already budgets a 1024-char path).
- `src/shared/torrent-ops.ts` -- `BatchItem` L35, `BatchResult` L39, `allOk` L44, `uniqueHashes` L49, `torrentHashListSchema` L15, `deleteTorrentsInputSchema` L30 (model for `setLocationInputSchema`).
- `src/shared/save-path.ts` -- `normalizeSavePath` L18, `savePathSchema` L26 (absolute, no `..`, no control char or backslash, max 1024).
- `src/shared/settings.ts` -- `MAX_COMMON_PATHS` L19, `commonPathNameSchema` L32 (does not trim), `commonPathSchema` L40; put `addCommonPathInputSchema` beside `setCategorySortInputSchema` L72.
- `src/server/settings/save-roots.ts` L10 `isUnderSaveRoot`; `src/server/settings/store.ts` `update` L451 (gets full stored settings, skips unchanged writes, returns `served`), `served` L399.
- `src/server/qbit/paths.ts` L3 `QBIT_PATHS` whitelist (add `torrentsSetLocation`); `src/server/qbit/client.ts` L21 `QbitClient`, `hashesForm` L151, `deleteTorrents` L207 as model; `src/server/qbit/session.ts` L265 `expectOk` (non-2xx is `qbit_rejected`; a 403 re-logs once first).
- `src/server/qbit/testing.ts` L167 `FakeQbitRoutes` (add `setLocation`), L200 `fakeQbit`, `rawTorrent` L51, `HASH_A..D`; `src/server/gate/testing.ts` `TEST_ENV.SAVE_ROOTS = '/downloads'`.
- `src/server/functions/torrent-ops.test.ts` -- runner L38, `startBody` L62, delete block L199+ as the test model; `src/server/functions/settings.test.ts` -- temp `CONFIG_DIR` model.
- `src/server/sync/torrent-table.ts` -- `Row` L66, `apply` L93 (`slimTorrentSchema.safeParse({ ...existing, ...partial })`, so `movingTo` must not come from qBittorrent), `errorStarts` L84 as side-state model, `createTorrentTable(now)` L81. No mutation API besides `apply` yet.
- `src/server/sync/syncer.ts` -- `pull(reuseMs)` L155, `readCategoryNames` L238 (model for a hash read), `DETAIL_PULL_REUSE_MS` L50. `src/server/qbit/maindata-schema.ts` L57 `rawTorrentSchema` (omit `movingTo`). `src/server/sync/payload-size.test.ts` budgets.
- `src/shared/maindata.ts` L17 `slimTorrentSchema`, L46 `TORRENT_FIELDS`. `src/lib/torrent-status.ts` L270 `isMovingTorrent`. `src/server/log/index.ts` L173 `log`.
- `src/state/settings.ts` -- `applySettings` L105, `SETTINGS_WRITE_SCOPE` L123, `categorySortOp` L137 (model for `addCommonPathOp`); bound calls are built in a route or feature (`_authed.tsx` L130).
- `src/state/pending-ops.ts` -- `markPending` L73, `clearPending` L109, `pendingOpOf` L114; add a target per hash for `setLocation` (5.3 reads it), cleared with the op.
- `src/state/maindata.ts` L317 `refreshMaindata`. `src/state/tracked-op.ts` L32 `TrackedOp`, L78 `sendOp`, L118 `useOpsInFlight`. `src/state/add-open.ts` -- open-store model. `src/state/shortcuts.ts` L468 `useEscapeLayer(open, cancel, 'dialog')`.
- `src/lib/error-text.ts` -- `deleteFailureText` L66 model; `OPERATION_FAILURE_CODES` L29, `SETTINGS_WRITE_FAILURE_CODES` L42. `src/lib/toast.ts` L56.
- `src/lib/paths.ts` -- `locationLabel` L12, `isInFolder` L23, `locationOf` L91 (longest match, `..` never matches). Add a pure helper returning the matched common path (for 「目前」).
- `src/shared/ui/confirm-shell.tsx` -- props L37, phone sheet `fit` mode L122, `STILL_WAITING` L33-68. `src/features/selection/delete-confirm.tsx` -- usage model: reset on open L257, `send()` L312, shell L384, sending from `useOpsInFlight` L273-289.
- `src/shared/ui/input.tsx` -- capsule `Input` (caller sets height; add `font-mono text-path`). No radio component exists. `src/state/use-arrow-stepping.ts` -- arrow-key stepping for a list.
- `src/shared/ui/location-tag.tsx` -- media-library look from 5.1 (`data-media-library`, hidden 「，媒體庫」).
- `src/features/detail/overview.tsx` -- `SavePathBlock` L225 (needs the hash), disabled 「改路徑」 L292-302 (solid `bg-primary`). `src/features/detail/phone-detail-sheet.tsx` -- the phone detail is a BottomSheet; change path opens above it.
- `src/routes/_authed.tsx` -- renders global screens (add screen) and builds bound ops.
- `scripts/fake-qbit.mjs` -- route chain L1223-1323, `OP_PATHS` L959, `ops` modes L206 (`normal|reject|slow|reject-files|drop`), `opLog`, `/__fake/ops`, `stateOverrides`, `/__fake/settings` L1467; no setLocation yet. `scripts/fake-settings-seeds.mjs` -- `library` seed (`/data/torrents/tv`, `/data/media/tv` media library, ...).
- `e2e/fixtures.ts` -- `setModes` L304, `Modes` L173, `DEFAULT_MODES` L211, `opCalls` L250 (add `SetLocationCall`), `seedSettings` L164. `e2e/delete.spec.ts` -- dialog flow, slow and reject patterns, screenshot loop L633.

## Tasks & Acceptance

**Execution:**
- `src/shared/torrent-ops.ts`, `src/shared/settings.ts` -- add `setLocationInputSchema` (strict `{ hashes, location }`) and `addCommonPathInputSchema` (strict, name trimmed before `commonPathNameSchema`) -- shared by server and client.
- `src/shared/maindata.ts`, `src/server/qbit/maindata-schema.ts` -- optional `movingTo` on slim rows, omitted from the raw qBittorrent schema -- getMaindata carries it.
- `src/server/qbit/paths.ts`, `src/server/qbit/client.ts`, `src/server/qbit/testing.ts` -- `setLocation(hashes, location)` client method and fake route -- one form POST.
- `src/server/sync/torrent-table.ts`, `src/server/sync/syncer.ts` -- read rows for hashes (fresh pull); `setMovingTo(hashes, target)`; cleanup rules in `apply` with the injected clock and a count-only log -- container owns `movingTo` (AR-43).
- `src/server/functions/set-location.ts`, `src/server/functions/add-common-path.ts` -- the two guarded functions per Always -- with `discover.test.ts` updated.
- `src/server/functions/set-location.test.ts`, `src/server/functions/add-common-path.test.ts`, `src/server/sync/torrent-table.test.ts` -- matrix rows S1 to S7 and C1 to C4, plus no-session -- fake responses only.
- `src/lib/paths.ts` (+ test) -- helper for the matched common path; `src/lib/error-text.ts` (+ test) -- `setLocationFailureText(code)` (`invalid_input` gives 「這個路徑不在允許的下載資料夾底下」), `addCommonPathFailureText(code, full)`, and the box format reasons -- texts in one place.
- `src/state/pending-ops.ts` (+ test) -- target per hash; `src/state/settings.ts` (+ test) -- `addCommonPathOp(call)`; `src/state/change-path-open.ts` (+ test) -- open store.
- `src/features/path/*` (+ DOM tests) -- change-path screen per Always (list, radio rows with arrow keys, box, 「加到常用」, send) and its `setLocationOp`.
- `src/features/detail/overview.tsx` (+ DOM test) -- pass the hash, enable 「改路徑」 (solid `accent`), open the store; other three buttons unchanged. `src/routes/_authed.tsx` -- render the screen, build bound calls.
- `scripts/fake-qbit.mjs`, `e2e/fixtures.ts` -- fake `/api/v2/torrents/setLocation` (logged in `opLog`, honours `ops=reject` with 400 and `ops=slow`; otherwise the torrent shows `moving` for a few seconds, then `save_path` becomes the target) -- e2e and 5.3 can watch a move.
- `e2e/change-path.spec.ts` -- desktop and phone flows (open from detail, pick, move, slow, reject and retry, add to common, bad format) and screenshots to `_bmad-output/implementation-artifacts/screenshots/5-2/`.

**Acceptance Criteria:**
- Given the detail of a torrent, when 「改路徑」 is pressed, then on desktop a 560 px dialog 「改路徑」 with the torrent name under it opens, and on phone a content-height sheet (max 90%) with no cancel button opens above the detail sheet; Esc and ✕ close it when not sending.
- Given the screen is open, when Alex picks a row or types, then selection, 「目前」, the box, 「加到常用」 and 「搬過去」 follow the matrix rows U1 to U3 and the Always rules, and no 「編輯」 pill is shown.
- Given a valid different path, when 「搬過去」 is pressed, then the fake receives exactly one setLocation call with that hash and the normalized path, the button reads 「搬移中…」 while sending, and on success the screen closes and maindata is refetched.
- Given `ops=reject`, when 「搬過去」 is pressed, then a failure toast with 重試 appears, the screen stays open with the box kept, and 重試 sends the same body (U4).
- Given 「加到常用」, when pressed, then the new row appears from the returned settings with the last-two-segments name and no media-library tag, and it becomes the selected row.
- Given the fake qBittorrent, when screenshots run, then desktop 1440 and phone 390, light and dark, exist for: open with 「目前」 and the media library selected, bad format, already listed, 「搬移中…」, failure toast.

## Spec Change Log

## Review Triage Log

### 2026-11-21: Review pass
- verdicts: 33 findings: high 0, medium 6, low 17, false 10, maybe-false 0
- findings:
  - `[false]` `[reject]` (intent) pendingOps is written on send, not after success: the 4.3 pattern; after success the entry with its target is there, which is what the AC asks.
  - `[false]` `[reject]` (intent) qBittorrent behaviour is proven only against fakes: required by AD-15; the real move is Alex's NAS acceptance.
  - `[false]` `[reject]` (intent) Server function tests bypass the transport: the e2e covers the full call path against the built server.
  - `[false]` `[reject]` (intent) 「目前」 vs selected is checked only by class names: the screenshots show both marks on different rows (media library selected).
  - `[low]` `[reject]` (intent) Pixel sizes are checked as class tokens: the e2e measures width and the phone box; more pixel checks add test scope, not a fix.
  - `[low]` `[reject]` (intent) The 50-path toast relies on cached settings: a stale cache needs another device to add paths in the same seconds; the fallback text still says it failed.
  - `[false]` `[reject]` (intent) Old callers of the shared changes are untested: delete, selection, detail and location-tags e2e ran and passed (60).
  - `[medium]` `[patch]` (blind) Enter during a toast 重試 sends a second move: `send()` now returns while `sending`; DOM test added.
  - `[medium]` `[patch]` (blind) `movingTo` sticks when the torrent ends up elsewhere: settled when not moving and `save_path` left `savePathAtSet`; unit tests added.
  - `[low]` `[reject]` (blind) The screen ignores a torrent already moving: moving display and disabled buttons are 5.3 per the intent; the container refuses the second move.
  - `[medium]` `[patch]` (blind) A pending `move` disables 暫停/繼續 for 30 s: the more menu ignores a `move` entry; test added.
  - `[low]` `[patch]` (blind) One `invalid_input` covers several causes: 加到常用 now names the realistic cause (outside the download folders). Rejected parts: an unknown torrent cannot be sent from the screen (it closes when the torrent leaves maindata); outside-roots with 50 listed is rare.
  - `[false]` `[reject]` (blind) The box cannot show an outside-roots reason: the epic decides the frontend checks only the shared schema; the container checks roots.
  - `[false]` `[reject]` (blind) 加到常用 stays enabled at 50: the AC asks for the toast 「常用路徑最多 50 個」 at 50.
  - `[low]` `[reject]` (blind) The screen uses only the first hash: the only caller passes one; 5.5 opens it with many.
  - `[low]` `[reject]` (blind) No per-hash lock for overlapping moves: needs two sends within one qBittorrent round trip; the double send inside one screen is fixed above.
  - `[low]` `[reject]` (blind) Refused items in a many-hash result are not surfaced: single torrent in 5.2; 5.5 owns partial failure.
  - `[false]` `[reject]` (blind) A move that starts and then fails is silent: 5.3 shows a failure toast when `movingTo` goes while `save_path` is not the target.
  - `[low]` `[reject]` (blind) Fixture gaps (no fake mode for never-moving or moved elsewhere): the table rules are unit-tested; an e2e mode adds scope only.
  - `[low]` `[patch]` (verification) Toast dismiss on close/reopen and editing during sending are untested: DOM tests added.
  - `[low]` `[patch]` (verification) The refresh after a failed move is untested: U4 cases assert `maindataFetches` grows.
  - `[medium]` `[patch]` (verification) A successful move disables 暫停/繼續: same fix as the blind row.
  - `[medium]` `[patch]` (edge) Enter during 重試 sends twice: same fix as the blind row.
  - `[medium]` `[patch]` (edge) `movingTo` never dropped after a move elsewhere: same fix as the blind row.
  - `[low]` `[reject]` (edge) Overlapping setLocation calls skip the pre-check: same as the blind lock row.
  - `[low]` `[reject]` (edge) An unknown torrent reads as outside the download folders: same as the blind invalid_input row.
  - `[low]` `[patch]` (edge) 加到常用 outside roots reads 「送出的資料格式不對」: same fix as the blind invalid_input row.
  - `[low]` `[patch]` (edge) The move toast key equals pause/delete keys, so typing dismisses them: move toasts are keyed `move:<hash>`; tests added.
  - `[low]` `[reject]` (edge) A failed 加到常用 toast survives editing the box: its 重試 adds the path it named; harmless and rare.
  - `[low]` `[patch]` (edge) Leading or trailing spaces in a pasted path create a folder ending in a space: the box is trimmed before normalizing; tests added.
  - `[false]` `[reject]` (edge) Duplicate rows split focus and checked: `addCommonPath` refuses duplicates and the store's `repair()` dedupes on read.
  - `[low]` `[reject]` (edge) `fitName` can split a grapheme past 50 units: needs a 50-character folder name ending in an emoji sequence.
  - `[false]` `[reject]` (edge) `readMoveStates` reuses a pull up to 6 s old: the spec asks for a read like `readCategoryNames`, which is this reuse.

### 2026-11-21: Review pass (follow-up)
- verdicts: 32 findings: high 0, medium 2, low 20, false 9, maybe-false 1
- findings:
  - `[false]` `[reject]` (intent) pendingOps is written on send: carried, the 4.3 pattern.
  - `[false]` `[reject]` (intent) A fourth `movingTo` clearing rule: added by the first pass for the moved-elsewhere case; the intent lists conditions that must clear, not the only ones.
  - `[low]` `[reject]` (intent) An unknown hash reads as outside the download folders: carried.
  - `[low]` `[reject]` (intent) The 50-path toast relies on cached settings: carried.
  - `[false]` `[reject]` (intent) Additions beyond the intent: each is a first-pass patch or a logged Claude 代決.
  - `[false]` `[reject]` (intent) A real move is untested: carried, AD-15.
  - `[false]` `[reject]` (intent) `accent` written as `primary`: the brand accent is the `primary` token (`styles.css`), the same one ConfirmShell's accent tone uses.
  - `[medium]` `[patch]` (blind) A 403 from setLocation (folder not writable) is taken as an expired session and blocks every qBittorrent call for 60 s: `send` has an opt-in `forbiddenMayBeRefusal`, set only by `setLocation`; a 403 after the re-login is `qbit_rejected` for that call, no cooldown, cookie kept. Tests in session, client and set-location.
  - `[low]` `[reject]` (blind) Pausing during a pending move overwrites the move entry and its target: needs a pause within the 30 s window; 5.3, the first reader of the target, decides how a move entry survives (noted for 5.3 in the PR).
  - `[low]` `[reject]` (blind) Two overlapping moves pass the pre-check: carried.
  - `[low]` `[reject]` (blind) The already-moving refusal reads as qBittorrent's: carried (5.3 disables the button while moving).
  - `[low]` `[reject]` (blind) An unknown torrent gets the path text: carried.
  - `[low]` `[reject]` (blind) 改路徑 stays enabled while moving: carried (5.3).
  - `[false]` `[reject]` (blind) 加到常用 does not block the 51st path: carried, the AC asks for the toast.
  - `[low]` `[reject]` (blind) A typo creates a new folder: qBittorrent creates missing folders by design; a "folder does not exist yet" hint is new scope.
  - `[low]` `[reject]` (blind) Disabled buttons do not say why: the spec gives the only texts; 「目前」 marks the current row.
  - `[low]` `[reject]` (blind) The fake never answers 403: the 403 path is covered by vitest after the patch above.
  - `[false]` `[reject]` (blind) `targets` is written but never read: the AC asks to record the target for 5.3.
  - `[low]` `[patch]` (blind) The op name `'move'` is written twice: one `MOVE_PENDING_OP` exported from `src/state/pending-ops.ts`.
  - `[maybe-false]` `[defer]` (blind) A queued move behind another move may not report `moving`, so the 10-minute expiry could drop `movingTo` while it waits: settle by checking on the NAS whether qBittorrent 5.1.4 reports `moving` for a queued move (if not, the expiry is wrong; medium if true).
  - `[low]` `[patch]` (verification) An IME-composing Enter is untested: DOM test added with the Safari case below.
  - `[low]` `[reject]` (verification) Closing while sending when the torrent leaves maindata is untested: needs a delete from another client during the send; the result still arrives by toast or refresh.
  - `[medium]` `[patch]` (verification) Safari commits an IME candidate with keyCode 229 and `isComposing` false, so Enter could send a half-typed Chinese folder name: the box also skips keyCode 229, like the add screen; DOM test.
  - `[false]` `[reject]` (edge) The screen can open before maindata has the torrent: it opens only from the detail, which renders only a torrent in maindata.
  - `[low]` `[reject]` (edge) Overlapping setLocation calls: carried.
  - `[low]` `[reject]` (edge) A move that fails between pulls keeps `movingTo` for 10 minutes: the expiry clears it; 5.3 shows failures.
  - `[low]` `[reject]` (edge) 50 listed plus outside roots, or a stale count: carried.
  - `[low]` `[reject]` (edge) A failed settings read makes a full list read as the path text: needs the read to fail and 50 paths at once.
  - `[low]` `[reject]` (edge) An unknown hash reads as the path text: carried.
  - `[low]` `[reject]` (edge) `fitName` can split a grapheme: carried.
  - `[low]` `[reject]` (edge) The fake ignores `ops=drop` for setLocation: e2e scope only; connection codes are the global handler's, tested in earlier stories.
  - `[false]` `[reject]` (edge) `readMoveStates` reuses a 6 s pull: carried.

## Design Notes

- qBittorrent 5.0 WebUI API, "Set torrent location": `POST /api/v2/torrents/setLocation`, `hashes` separated by `|`, `location` (created if missing); 400 save path empty, 409 cannot create the folder, 200 otherwise, no body (https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-5.0)#set-torrent-location). The torrent state `moving` is documented in the same page's state table.
- Claude 代決 (pre-check codes): no new codes are allowed, so an unknown hash is `invalid_input` and an already-moving torrent is `qbit_rejected`. The single-torrent screen shows that item's text in the failure toast.
- Claude 代決 (texts): the failure toast reads 「改路徑失敗：<reason>」 like delete; for `invalid_input` the reason is 「這個路徑不在允許的下載資料夾底下」. Box reasons in order: empty or relative 「路徑要從 / 開頭」, a `..` segment 「路徑不能有 ..」, over 1024 characters 「路徑太長」, backslash or control character 「路徑不能有反斜線或控制字元」. 「加到常用」 failure: `invalid_input` with 50 listed gives 「常用路徑最多 50 個」, other codes the 3.1 settings-write text.
- Claude 代決 (behaviour): Enter in the box presses 「搬過去」 when enabled. Adding a common path shows no toast (5.4 adds rename). While settings are not loaded the list is empty and 「加到常用」 is disabled. Duplicate common paths are already refused by `addCommonPath`'s identity rule, which settles the 5.1 note on duplicates.
- Docs (AD-11): TanStack Store 0.11 quick start https://tanstack.com/store/v0/docs/framework/react/quick-start ; TanStack Query v5 mutation scopes https://tanstack.com/query/v5/docs/framework/react/guides/mutations#mutation-scopes ; WAI-ARIA radio group pattern https://www.w3.org/WAI/ARIA/apg/patterns/radio/ .
- Claude 代決 (implementation): `ConfirmShell` gained an optional `subtitle` (delete passes none). The desktop dialog has no ✕, like every shared dialog; Esc and 取消 close it. A default name over 50 characters is cut to 50. Move toasts are keyed `move:<hash>`. The fake answers 409 when its data is reset during a slow move.
- The phone change-path sheet opens over the phone detail sheet; `sheet-session` makes other body children inert, so the detail sheet must come back intact when it closes (test it).

## Verification

**Commands:**
- `source ~/.nvm/nvm.sh && nvm use && npm run lint` -- expected: 0 errors
- `source ~/.nvm/nvm.sh && nvm use && npm run typecheck` -- expected: exit 0
- `source ~/.nvm/nvm.sh && nvm use && npm test` -- expected: all pass
- `source ~/.nvm/nvm.sh && nvm use && npm run build && npx playwright test e2e/change-path.spec.ts e2e/detail.spec.ts e2e/location-tags.spec.ts e2e/delete.spec.ts` -- expected: all pass
- `bash .claude/skills/next-story/check.sh` -- expected: every line ok

## Auto Run Result

Status: done (first pass). Follow-up review recommended: 3 medium entries were patched (the Enter double send, the stuck `movingTo`, the pending move disabling 暫停/繼續). The unverified risk is whether the new `settleMoves` rule and the `move:<hash>` toast key hold up on a second read. Patched by verdict: medium 3 entries, low 5 entries.

**Change.** `setLocation` (per-hash pre-check, one qBittorrent `torrents/setLocation` call, `movingTo` recorded by the table and settled by its rules) and `addCommonPath` (idempotent, normalized path as identity, 50 max). The detail's 「改路徑」 opens the change-path screen in `src/features/path/` (560 px dialog, content-height phone sheet): radio rows with 「目前」 and 「媒體庫」 tags, the 「會搬到」 box with format reasons, 「加到常用」, and 「搬過去」 through `ConfirmShell`. `pendingOps` keeps a move's target per hash for 5.3. The fake qBittorrent answers setLocation (moving for 3 s, then the new folder).

**Files.** Server: `set-location.ts`, `add-common-path.ts`, `torrent-table.ts`, `syncer.ts`, qbit client and paths, `maindata-schema.ts`. Shared: `maindata.ts` (`movingTo`), `torrent-ops.ts`, `settings.ts` input schemas, `confirm-shell.tsx` (`subtitle`), `location-tag.tsx`. Lib: `paths.ts` (`currentCommonPath`, `listedCommonPath`), `error-text.ts`. State: `pending-ops.ts`, `settings.ts` (`addCommonPathOp`), `change-path-open.ts`. Features: `features/path/*`, `detail/overview.tsx`, `detail/more-menu.tsx`. Route: `_authed.tsx`. Fake and e2e: `fake-qbit.mjs`, `e2e/fixtures.ts`, `e2e/change-path.spec.ts`, `e2e/detail.spec.ts`.

**Review.** 33 findings: 8 entries patched, 0 deferred, the rest rejected with reasons in the triage log.

**Verification (2026-11-21, after the patches).**
- `npm run lint`: 0 errors; `npm run typecheck`: exit 0.
- `npm test`: 161 files, 3941 tests pass.
- `npx playwright test` change-path and detail: 23 passed. Before the patches, change-path, detail, location-tags, delete and selection: 60 passed.
- `check.sh`: every line ok. Matrix rows S1 to S7, C1 to C4, U1 to U4 each have a tagged test that ran.

**Residual risks.** Real qBittorrent behaviour during a move (when `save_path` changes, how long `moving` shows) is known only from the docs until the NAS check. The phone sheet over the detail sheet is e2e-tested in Chromium only.

### Follow-up pass (2026-11-21)

Status: done. Follow-up review not recommended: no high was patched (medium 2 entries, low 1 entry). Patches: a 403 from setLocation no longer blocks qBittorrent for 60 s; the 「會搬到」 box ignores Safari's IME Enter (keyCode 229); one constant for the move op name. Deferred: 1 (queued move and the 10-minute expiry, unverified). Rejected: the rest, with reasons in the triage log.
