---
title: 'Story 2.10: Reason text for errored torrents'
type: 'feature'
created: '2026-11-18'
status: 'done'
baseline_revision: 'cabf8b1aa9e83e9e49db26e06306e0dc427b1a3c'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-react-torrent-2026-11-15/ARCHITECTURE-SPINE.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** A torrent in qBittorrent's `error` state shows the fixed 「qBittorrent 回報錯誤」 on its second line (list row, board card) and in the detail hero summary, so Alex has to open qBittorrent's own log to learn what went wrong. qBittorrent 5.1.4 puts the reason only in its log text (`sync/maindata`, `torrents/info` and `torrents/properties` carry none).

**Approach:** One new named read-only qBittorrent client method for `GET /api/v2/log/main` (warning level only). The container reads it at most once a minute, only when asked and only while some torrent is in `error`, finds each errored torrent's latest error line by its name, cleans the reason (paths and IP addresses removed, common OS errors in Traditional Chinese) and serves a hash-to-reason map through one new GET server function. The client polls that map only while maindata holds an errored torrent and passes each reason into the existing second-line and hero text; with no reason the fixed text stays.

## Boundaries & Constraints

**Always:**
- Client path `/api/v2/log/main` added to `QBIT_PATHS` (typed whitelist); the client method sends `normal=false&info=false&warning=true&critical=false&last_known_id=<n>` and parses `[{ id, message, timestamp, type }]` with zod. Nothing else in qBittorrent is called.
- Rate limit: the container calls `log/main` at most once per 60 s (`ERROR_REASON_REFRESH_MS`, Claude 代決), never on the 5 s maindata poll, and not at all while no torrent in the container table is `error`. Calls inside the window answer from the cache.
- Incremental reads: keep the last seen `id` and ask with `last_known_id`; when a read returns nothing while an errored torrent still has no reason, the next allowed read uses `-1` (covers a qBittorrent restart, whose counter starts over). Keep at most the latest line per torrent name, not the whole log.
- Matching by name (the log never carries a hash), exact prefix only, newest line wins:
  - `File error alert. Torrent: "<name>". File: "<file>". Reason: "<reason>"`: reason is libtorrent's message; take the text after its last `error: ` when present, else the whole reason.
  - `Torrent errored. Torrent: "<name>". Error: "<error>"`: if the error is `Couldn't write to file. Reason: "<r>". Torrent is now in "upload only" mode.`, take `<r>`; else the whole error.
  - Only torrents currently `error` in the container table get a reason. A name shared by two or more torrents in the table gets none (fixed text) (Claude 代決: never attribute a reason to the wrong torrent).
- Cleaning (pure `src/lib` function, vitest with fake log lines using only X / mteam-X names): remove absolute POSIX and Windows paths (replace with 「（路徑）」), IPv4 and IPv6 addresses and `user@host` forms (replace with 「（位址）」), collapse whitespace, cap at 120 characters with 「…」. Then map known OS texts (case-insensitive, whole reason) to Traditional Chinese: 「No such file or directory」 to 「找不到檔案或資料夾」, 「No space left on device」 to 「磁碟空間不足」, 「Permission denied」 and 「Operation not permitted」 to 「沒有權限」, 「Read-only file system」 to 「磁碟是唯讀的」, 「Input/output error」 and 「I/O error」 to 「磁碟讀寫錯誤」, 「File too large」 to 「檔案太大」 (Claude 代決). Unknown reasons stay as cleaned plain text.
- Display: `classify().detail` for kind `error` and the hero summary for `error` use the torrent's reason when the caller passes one, else 「qBittorrent 回報錯誤」. Rendered as JSX text only. Pass the reason as an explicit optional value (per torrent) so memoized rows and cards re-render only when their own reason changes.
- Client data: `['error-reasons']` via `src/state`, `enabled` only while `['maindata']` has at least one torrent whose `classify` kind is `error` (helper in `src/lib`, no `torrent.state ===`) and login is not required, `refetchInterval` 60 s, no retry, a failure keeps the previous map (the fixed text shows meanwhile).
- Server log (AD-16): log a failed `log/main` read like other qBittorrent failures; never log reason text, file names or torrent names.

**Never:**
- No `/api/v2/*` pass-through, no other new qBittorrent path, no write or settings call (AD-5, AD-15). No reason field in the slim maindata table (160 KB delta budget).
- No reasons for `missingFiles` (that state keeps 「找不到檔案，做不了種」 or 「已整理」), `unknown`, or move failures that do not put a torrent in `error`.
- No HTML rendering of reasons; no new dependency.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| File error | errored "Fake.Show.S01E05", log `File error alert. Torrent: "Fake.Show.S01E05". File: "/data/media/X/incompleted/a.mkv". Reason: "Fake.Show.S01E05 file_open (/data/media/X/incompleted/a.mkv) error: No such file or directory"` | reason 「找不到檔案或資料夾」 on its second line and hero summary | No error expected |
| Upload-only | `Torrent errored. Torrent: "N". Error: "Couldn't write to file. Reason: \"No space left on device\". Torrent is now in \"upload only\" mode."` | 「磁碟空間不足」 | No error expected |
| Unknown reason with path and IP | reason `tracker 203.0.113.5 refused /srv/x/y` | 「tracker （位址） refused （路徑）」 | No error expected |
| No log line | errored torrent, nothing in the log | 「qBittorrent 回報錯誤」 | No error expected |
| Duplicate names | two torrents named "N", one errored | fixed text | No error expected |
| Newer line wins | two lines for "N" | the higher `id`'s reason | No error expected |
| Not errored anymore | torrent left `error` | no reason in the map; normal text | No error expected |
| No errored torrent | maindata has none | client does not fetch; container never calls `log/main` | No error expected |
| Rate limit | two requests 10 s apart | one `log/main` call; second answers from cache | No error expected |
| qBittorrent restarted | incremental read returns `[]` while a reason is missing | next allowed read uses `last_known_id=-1` | No error expected |
| `log/main` fails | timeout or 500 | server function returns the AD-9 error; client keeps the previous map | Logged without reason text |
| Malformed response | not the expected JSON shape | treated as a failed read (`qbit_rejected`) | zod rejects |

</intent-contract>

## Code Map

- `src/server/qbit/paths.ts` -- add `logMain: '/api/v2/log/main'` with the wiki URL comment.
- `src/server/qbit/client.ts` -- `QbitClient` interface and `createQbitClient`; follow `torrentFiles` (GET with `URLSearchParams`, zod parse, `qbit_rejected` on bad shape); add `logMain(lastKnownId)`.
- `src/server/qbit/testing.ts`, `client.test.ts` -- client test patterns (fake fetch).
- `src/server/sync/syncer.ts` -- owns the container torrent table (`readTorrentDetail` shows how a read uses it); expose what the reason reader needs (errored torrents' hash and name, name counts) without widening `SyncerOptions.client` to write methods.
- `src/server/sync/` (new, e.g. `error-reasons.ts` + test) -- the rate-limited incremental reader, cache, name matching; injectable `now` (monotonic) and client, like the syncer.
- `src/server/functions/get-error-reasons.ts` (new) -- `serverGet` + `guard({ name: 'getErrorReasons' })` from `_define.ts`, no input (or an empty zod object), returns `ok({ reasons })`; pattern `get-torrent-detail.ts`.
- `src/shared/` (new, e.g. `error-reasons.ts`) -- response type and zod schema shared by server and client.
- `src/lib/` (new, e.g. `error-reason.ts` + test) -- pure parse of a log line for a name, clean, translate; a helper that says whether maindata has an errored torrent (through `classify` / `heroKindOf`).
- `src/lib/torrent-status.ts:309-314` -- `detailOf` kind `error`; `ClassifyOptions` at `:34`; add an optional reason input.
- `src/lib/detail-hero.ts:131-133` -- hero summary for `error`; add the same optional reason.
- `src/features/list/list-model.ts:191-275` (`rowModel`, `rowProps`), `src/features/list/torrent-list.tsx`, `src/features/board/board-model.ts:160` (`cardModel`), `card-list.tsx`, `board-card.tsx`, `src/features/detail/overview.tsx` -- thread the per-torrent reason from the new state hook.
- `src/state/torrent-detail.ts` -- pattern for a polled query with `bindFetch...` (src/state may not import server functions), `unlessLoginRequired`, `pollInterval`.
- `scripts/fake-qbit.mjs` -- add `GET /api/v2/log/main` honouring `last_known_id` and the level flags, answering warning lines for the `many` data's `error` torrents (`:314` and `:507` define them); add the path to whatever request log the e2e reads.
- `e2e/` -- reuse `fixtures.ts` (`setModes`, `login`) for a `many`-mode check.

## Tasks & Acceptance

**Execution:**
- `src/server/qbit/paths.ts`, `client.ts`, `client.test.ts` -- `logMain` -- the one named read-only method.
- `src/shared/error-reasons.ts` -- schema and types.
- `src/lib/error-reason.ts` + test -- parse, clean, translate, `hasErroredTorrent` -- covers matrix rows 1 to 3, 6, and cleaning edge cases (Windows path, IPv6, long text; test IPs only from the documentation ranges 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24 and 2001:db8::/32, since check.sh rejects private ones).
- `src/server/sync/error-reasons.ts` + test -- reader with rate limit, incremental id, restart reset, duplicate names, only errored torrents, cache -- matrix rows 4, 5, 7, 8, 9, 10, 12.
- `src/server/functions/get-error-reasons.ts` + test -- server function; AD-9 error on failure; log line has no reason text -- matrix row 11.
- `src/state/error-reasons.ts` + test -- the polled query, enabled only with an errored torrent, keeps the previous map on failure.
- `src/lib/torrent-status.ts`, `src/lib/detail-hero.ts` + tests -- reason in second line and hero.
- list, board and detail features + DOM tests -- an errored row, card and hero show the reason; without one the fixed text.
- `scripts/fake-qbit.mjs` -- fake `log/main`.
- `e2e/error-reason.spec.ts` -- `many` data: an errored torrent's card and detail show the cleaned reason; no request to `log/main` faster than the rate limit during the test; zero CSP violations.

**Acceptance Criteria:**
- Given a torrent in `error` with a matching log line, when the list, board or detail shows it, then its second line and the detail summary show the cleaned reason; with no line, 「qBittorrent 回報錯誤」.
- Given any reason, when shown, then it carries no path, IP address or account, and test fixtures use only X / mteam-X.
- Given the qBittorrent client, when this story lands, then exactly one named read-only method and path were added, and nothing writes or changes settings.
- Given maindata polls every 5 s, when errored torrents exist, then `log/main` is called at most once per 60 s; with none, never.
- Given lint, typecheck, vitest, build, Playwright and `check.sh`, when run, then all pass.

## Spec Change Log

- 2026-11-18, first review pass: three rules in the intent contract turned out wrong and the code now follows the story's AC instead. (1) Matching accepts the qBittorrent 5.1.4 zh_TW, zh_HK and zh_CN templates as well as English (qBittorrent writes these lines through tr()). (2) The restart rule "an empty read while a reason is missing starts over at -1" is replaced by an overlap check: read from the newest seen id minus one; an empty answer or a different first entry means qBittorrent restarted, so clear and read from -1 in the same refresh; nothing else starts over. (3) The refresh window is 55 s so the 60 s client poll never lands on the cache. Also: a file error without libtorrent's 「error: 」 gives no reason, any token with a slash becomes 「（路徑）」, and a reason older than the torrent's `added_on` is not used. KEEP: one read-only method; warning level only; matching by name with duplicate names excluded; cleaning before anything leaves the container.

## Review Triage Log

### 2026-11-18: Review pass
- verdicts: 33 findings, high 0, medium 17, low 14, false 2, maybe-false 0
- findings:
  - `[medium]` `[patch]` (intent) Only English log lines match; a qBittorrent in Chinese shows the fixed text everywhere : the 5.1.4 zh_TW, zh_HK and zh_CN templates (from `src/lang/*.ts` at release-5.1.4) are now accepted, with tests per locale.
  - `[false]` `[reject]` (intent) A real category name outside a path is not renamed to X at runtime : the code names apply to git artifacts; at runtime the app already shows Alex's real category names in tags, and paths are removed.
  - `[medium]` `[patch]` (intent) "Most recent" is the newest line ever seen, so an older episode's reason can show : lines older than the torrent's `added_on` are ignored; grouped with the stale-reason entries below.
  - `[low]` `[reject]` (intent) A failed read keeps the previous reason instead of the fixed text : the spec's matrix row 11 chose this; the reason was right when last read and the next read refreshes it.
  - `[false]` `[reject]` (intent) Additions beyond the AC : all are logged Claude 代決 inside the one-read-only-method limit.
  - `[medium]` `[patch]` (blind) qBittorrent locale not handled : same root cause as the intent locale entry; fixed there.
  - `[medium]` `[patch]` (blind) Restart detection misses a restart whose new log already passed the old id, and one where every candidate has a reason : replaced by an overlap check (read from the newest seen id minus one; a missing or different first entry means a restart, so clear and read from -1).
  - `[medium]` `[patch]` (blind) An errored torrent with no line causes a full re-read every other minute : same root cause (the start-over heuristic); the overlap check starts over only on a restart.
  - `[medium]` `[patch]` (blind) Reasons have no age; a deleted and re-added torrent with the same name gets the old reason : line timestamps kept; a reason is used only when not older than the torrent's `added_on`.
  - `[medium]` `[patch]` (blind) Path cleaning misses paths after `:` or `,`, relative paths and paths with spaces : a file error without libtorrent's 「error: 」 now gives no reason; `:` and `,` join the prefix set; any remaining token with `/` or `\` (except I/O words) becomes 「（路徑）」.
  - `[low]` `[patch]` (blind) A long reason is cut off on cards and rows with no way to read it : `title` with the full second line added on card and row.
  - `[low]` `[patch]` (blind) Common NAS errors are untranslated : seven texts added to the table (Claude 代決).
  - `[low]` `[patch]` (blind) Server and client disagree on a moving torrent whose state before the move was `error` : the server now classifies with the table's stateBeforeMove.
  - `[low]` `[patch]` (blind) A reason can be about two minutes late (server window equals client poll) : server window 55 s, client poll 60 s.
  - `[low]` `[patch]` (blind) The e2e never sends a reason that needs cleaning : a fake unknown reason with a fake path and a documentation-range IP; card, detail and response body checked.
  - `[low]` `[reject]` (blind) The reason lookup and the test mock are copied in three places : no caller diverges today; extracting them is cosmetic.
  - `[low]` `[reject]` (blind) The response schema does not enforce the 120-character cap : the server produces the text; a second check adds nothing a user meets.
  - `[low]` `[reject]` (blind) One test pins the snapshot cache : it documents the one-scan-per-snapshot rule; harmless.
  - `[low]` `[patch]` (blind) The deployment checklist has no check for real reasons : one read-only line added to `docs/deployment.md`.
  - `[medium]` `[patch]` (verification-gap, other) Restart with a non-empty answer : same root cause as the restart entry; fixed there.
  - `[medium]` `[patch]` (verification-gap, other) Endless full re-reads : same root cause; fixed there.
  - `[low]` `[patch]` (verification-gap, other) Moving error torrent loses its reason : same as the blind moving entry; fixed there.
  - `[medium]` `[patch]` (edge) Path with spaces leaks its tail : same root cause as the blind path entry; fixed there.
  - `[medium]` `[patch]` (edge) Path after a colon stays whole : same root cause; fixed there.
  - `[medium]` `[patch]` (edge) File error without 「error: 」 passes name and path through : same root cause; fixed there.
  - `[medium]` `[patch]` (edge) Non-English locale never matches : same root cause as the locale entry; fixed there.
  - `[medium]` `[patch]` (edge) Restart while every candidate has a reason : same root cause as the restart entry; fixed there.
  - `[medium]` `[patch]` (edge) New session lines 0 to the old id skipped : same root cause; fixed there.
  - `[medium]` `[patch]` (edge) Endless start-overs for a reason never in the log : same root cause; fixed there.
  - `[low]` `[patch]` (edge) The newest line cleans to nothing and an older reason wins : the newest id is remembered with no reason.
  - `[medium]` `[patch]` (edge) Deleted and re-added torrent with the same name gets the old reason : same root cause as the reason-age entry; fixed there.
  - `[low]` `[patch]` (edge) Poll period equals the server window : same as the blind latency entry; fixed there.
  - `[low]` `[reject]` (edge) A torrent that recovers and errors again within 60 s shows the previous reason until the next poll : at most one poll late; invalidating on every flip adds state for a rare case.

## Design Notes

Research (qBittorrent `release-5.1.4` source and the 5.0 WebUI API wiki): `log/main` takes `normal`, `info`, `warning`, `critical` (default true) and `last_known_id` (default -1, returns only newer ids), answers `[{id, timestamp (seconds), type (1 normal, 2 info, 4 warning, 8 critical), message}]` oldest first from a 20000-message in-memory buffer that restarts at id 0 when qBittorrent restarts; a normal WebUI login may read it and it changes nothing. The `error` state's lines are WARNING: `SessionImpl::handleFileErrorAlert` (「File error alert…」, logged once per torrent per second) and `SessionImpl::createTorrent` (「Torrent errored…」 for torrents restored already errored). Both name the torrent by name only. `missingFiles` wins over `error` in `TorrentImpl::updateState`, so fast-resume-rejected lines belong to `missingFiles` and are ignored. Some `error` causes log nothing (libtorrent `torrent_error_alert` is unhandled), so the fixed text stays for them.

Claude 代決 (list in the PR): 60 s refresh; duplicate names get no reason; the zh-TW table above; 「（路徑）」 and 「（位址）」 placeholders; 120-character cap.

Docs (AD-11): qBittorrent WebUI API (5.0) 「Get log」 https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-5.0)#get-log ; source `src/webui/api/logcontroller.cpp`, `src/base/logger.h`, `src/base/bittorrent/sessionimpl.cpp`, `torrentimpl.cpp` at https://github.com/qbittorrent/qBittorrent/tree/release-5.1.4 ; libtorrent 2.0.11 `src/alert.cpp` https://github.com/arvidn/libtorrent/blob/v2.0.11/src/alert.cpp ; TanStack Query `useQuery` `enabled`, `refetchInterval` https://tanstack.com/query/v5/docs/framework/react/reference/useQuery ; zod 4 https://zod.dev/api .

## Verification

**Commands:**
- `source ~/.nvm/nvm.sh && nvm use && npm run lint && npm run typecheck` -- expected: no errors
- `source ~/.nvm/nvm.sh && nvm use && npm test` -- expected: all pass
- `source ~/.nvm/nvm.sh && nvm use && npm run build && npx playwright test` -- expected: all pass, zero CSP violations
- `bash .claude/skills/next-story/check.sh` -- expected: every line ok

## Auto Run Result

Status: done (first review pass)

**Summary.** Errored torrents show qBittorrent's reason on their second line (list, board, phone tabs) and in the detail summary. One new read-only client method reads `log/main` (warning lines, English and the 5.1.4 zh_TW, zh_HK and zh_CN templates) at most once per 55 s, only while a torrent is `error`; the container matches lines by name (unique names only, not older than the torrent's `added_on`), cleans paths and addresses, translates common OS errors and serves `getErrorReasons`; the browser polls it every 60 s only while maindata holds an errored torrent. No reason: the fixed 「qBittorrent 回報錯誤」.

**Files.** `src/server/qbit/paths.ts`, `client.ts` (`logMain`); `src/server/sync/error-reasons.ts` (reader), `syncer.ts` and `torrent-table.ts` (candidates, state before a move); `src/server/functions/get-error-reasons.ts`; `src/shared/error-reasons.ts`; `src/lib/error-reason.ts` (parse, clean, translate); `src/lib/torrent-status.ts`, `detail-hero.ts` (reason in the texts); `src/state/error-reasons.ts` (query); list, board and detail features (threading, `title` on the second line); `scripts/fake-qbit.mjs` (fake `log/main`); `e2e/error-reason.spec.ts`; `docs/deployment.md` (post-deploy check). Tests beside each.

**Review.** 33 findings: patched 4 medium entries (locale templates, restart overlap check, path cleaning, reason age) and 7 low ones; rejected 6 with reasons; nothing deferred.

**Follow-up review: recommended.** Patched by verdict: medium 4, low 7. The named risk: the reader's read loop and the cleaner were rewritten after review, so a second pass should re-check restart handling, the overlap read and the slash-token rule together.

**Verification (2026-11-18).** lint and typecheck clean; `npm test` 103 files, 2427 tests passed; `npm run build` then `npx playwright test` 74 passed, 0 CSP violations; `check.sh` all ok. `npm audit --omit=dev --audit-level=high` now reports 11 high findings from one new advisory (GHSA-fc5q-39xc-vjpf, picomatch <= 4.0.7, no patched version, updated 2026-11-17) reached through `@tanstack/react-start` build tooling; this story changes no dependency.
