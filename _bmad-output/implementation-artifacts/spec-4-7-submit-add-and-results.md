---
title: 'Story 4.7: Submit add and results'
type: 'feature'
created: '2026-11-20'
status: 'done'
baseline_revision: '1441bcd19d6b1d32cd5bc540ab8b0f819eeefb51'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Hybrid (v1 plus v2) torrents are matched only by their v1 info hash when judging 以前下載過.
    evidence: |-
      Alex decided on 2026-11-20 (relayed by the review session) to leave it: M-Team torrents are v1. qBittorrent keys a
      hybrid torrent by its v1 hash, so the match holds; a v2-only or btmh-only entry stays unreadable (4.5).
    location: >-
      src/lib/info-hash.ts
    severity: low
---

<intent-contract>

## Intent

**Problem:** 「新增 N 個」 on the add screen (4.6) does nothing: there is no `addTorrents` server function, the list does not keep the picked `File`s, and there is no result handling, so Alex still cannot add torrents from this app.

**Approach:** Add the `addTorrents` POST server function (FormData, magnets and .torrent files and a category, limits checked as the body is read, one qBittorrent call per entry, the AR-54 batch shape keyed by input index). On the client, re-judge against the latest `['maindata']`, send 4.5's batches in order through the tracked-op machinery, and show the outcome: all ok closes with an 8 s 「去看」 toast; some rejected keeps those rows with their reasons; a whole-request failure keeps everything with a retry toast. With no qBittorrent categories at all, the screen says 「qBittorrent 還沒有分類」 (Alex's decision).

## Boundaries & Constraints

**Always:**
- `addTorrents` (factory: `serverPost` + validator + `guard`):
  - POST with `FormData`: zero or more `magnet` text fields (each must start with `magnet:`), zero or more `torrent` file fields, one `category`. At least one entry, at most 20 (`MAX_ADD_ENTRIES`). No other field is accepted (no `savepath`, no URL other than `magnet:`); anything else is `invalid_input`.
  - `category` must be in the container's category list (the sync torrent table), else `invalid_input`.
  - Each file at most 10 MB (`MAX_TORRENT_FILE_BYTES`) and must start with a bencode dictionary (`d`), else `invalid_input`. The whole request at most `MAX_ADD_REQUEST_BYTES`: the request ceiling for a verified session rises to that number; it stays 64 KB without a session (`ANONYMOUS_BODY_LIMIT`). `Content-Length` is checked first and the body is counted while read (existing `measureBody`).
  - The container sends entries to qBittorrent one at a time (`torrents/add`, multipart, `urls` for a magnet, `torrents` for a file, `category`, `autoTMM=true` so the category's save path applies, matching 「會存到」). It never fetches a user URL and never sends `savepath` or `cookie`.
  - Result: `{ ok: true, data: { items: [{ key: <input index>, ok: true } | { key, ok: false, code, message }] } }`. A whole-request error only when nothing was done (validation, session, timeout before the first entry).
- Client:
  - The list keeps each picked or dropped `File` on its item, so the send can include it.
  - On press: re-judge every row against the current `['maindata']`; rows now present become 以前下載過，已整理好 and are not sent. Send `addBatches` in order; merge the results.
  - Sending: the button reads 「新增中…」, shows 「還在等 NAS 回應」 after 10 s (`STILL_WAITING_MS`, `STILL_WAITING_TEXT` from `confirm-shell.tsx`), and every close path (取消, ✕, Esc, drag down, 打開) is ignored until the send ends.
  - All ok: close the screen, stay on the current screen and category, `refreshMaindata()`, never edit local data. Toast 「已新增 N 個種子」 with 「去看」, 8 s: 去看 switches to the add category like a tab click (`selectCategory`); with exactly one torrent added it also opens that torrent's detail as soon as it appears in maindata (Claude 代決: if it has not appeared within 30 s, stay on the category).
  - Some rejected: succeeded rows leave, failed rows stay with a 12px/600 `status-error` reason from `src/lib/error-text.ts` by code; a 13px/600 `status-error` line with icon and hairline at the top of the list frame reads 「5 個加好了，2 個失敗」; the button becomes 「新增 2 個」; the dialog stays; pressing again sends only what is left.
  - Whole request failed with `invalid_input`, `timeout` or `qbit_rejected`: the failure toast with 重試 (tracked-op), the dialog stays, list and category stay; 重試 resends the same content. Connection codes go to the global handler only; the list stays and the button works again. `not_logged_in` discards the list (AD-9).
  - No qBittorrent categories: under the category field a line 「qBittorrent 還沒有分類」 explains why 新增 is disabled. Selecting a category stays required.
- AD-15: vitest uses fake qBittorrent responses only; e2e uses `scripts/fake-qbit.mjs`. Never write to the real qBittorrent.

**Never:**
- No `savepath`, no http(s) URL entries, no `cookie` field, no server-side URL fetch.
- No local edit of `['maindata']`; new torrents appear through `refreshMaindata()` and polling.
- Do not change 4.6's judging order, labels or `splitPaste` rules (PR #53), the `followHash`/`setHash` split, `use-arrow-stepping.ts`, or the `[role="menu"]` plus `inMenus` rule.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| S1 server ok | 2 magnets, 1 file, category X | 3 qBittorrent calls (urls / torrents, category X, autoTMM=true), items keys 0..2 ok | None |
| S2 http | `https://…` in `magnet` field | `invalid_input`, no qBittorrent call | Whole-request error |
| S3 savepath | extra `savepath` field | `invalid_input` | Whole-request error |
| S4 category | category not in the table | `invalid_input` | Whole-request error |
| S5 not bencode | file not starting with `d` | `invalid_input` | Whole-request error |
| S6 file size | 10,485,761-byte file | `invalid_input` | Whole-request error |
| S7 count | 21 entries | `invalid_input` | Whole-request error |
| S8 request size | body over `MAX_ADD_REQUEST_BYTES` | 413 `invalid_input` before reading | Gate |
| S9 partial | qBittorrent rejects entry 1 of 3 | items: 0 ok, 1 `{ok:false, code:'qbit_rejected'}`, 2 ok | Per item |
| S10 session | no session | `not_logged_in`, no qBittorrent call | Gate |
| S11 anonymous size | no session, body over 64 KB | 413 | Gate |
| C1 re-judge | Row became present in maindata after paste | Not sent, shown 以前下載過，已整理好 | None |
| C2 batches | 25 addable entries | Two requests in order (20 + 5), results merged | None |
| C3 sending | Press 新增 | 「新增中…」, 10 s 「還在等 NAS 回應」, every close path ignored | None |
| C4 all ok | All items ok | Dialog closes, same screen and category, refresh, toast 「已新增 N 個種子」 + 去看 (8 s) | None |
| C5 去看 | Press 去看 (several / one added) | Switch to the add category; with one, its detail opens when it appears (30 s cap) | None |
| C6 partial | 2 of 7 rejected | 5 rows leave, 2 stay with reasons, top line 「5 個加好了，2 個失敗」, button 「新增 2 個」 | Per item |
| C7 whole failure | `qbit_rejected` / `timeout` / `invalid_input` | Failure toast with 重試, dialog and list stay, 重試 resends | Toast |
| C8 connection | `qbit_unreachable` etc. | Global handler only; list stays; button usable | Global |
| C9 logged out | `not_logged_in` | List discarded | Global |
| C10 no categories | Categories `{}` | 「qBittorrent 還沒有分類」, 新增 disabled | None |
| C11 board | Sort 狀態 after adding | New torrent first in 下載中 (fake data) | None |

</intent-contract>

## Code Map

- Server function factory: `src/server/functions/_define.ts` `serverPost` (:28), `input(schema)` (:49, never throws, WeakMap of `safeParse`), `guard(spec, run)` (:113: build-time `RangeError` unless `bodyLimit` within `MAX_REQUEST_BODY`; per call `not_logged_in` → body over limit → parse failed → 30 s timeout → `ServerFailure` code, else `qbit_rejected`). Template `src/server/functions/delete-torrents.ts:15-28`.
- FormData in Start 1.169.5: the client sends a `FormData` body as is (`start-client-core/src/client-rpc/serverFnFetcher.ts:211-221`); the server calls `request.formData()` for multipart (`start-server-core/src/server-functions-handler.ts:210-250`) and passes it as `data`; a POST validator whose input extends `FormData` skips the serializable check (`createServerFn.ts:520`). The validator runs on the server only. So a FormData-aware `input` step (FormData → plain object, then zod) is needed. Docs: `node_modules/@tanstack/start-client-core/skills/start-core/server-functions/SKILL.md:175-191`.
- Body limits: `src/server/gate/body-limit.ts` (`DEFAULT_BODY_LIMIT`, `HASH_LIST_BODY_LIMIT`, `MAX_REQUEST_BODY` :26 "uploads raise it", `ANONYMOUS_BODY_LIMIT`, `measureBody`, middleware `bodyLimit` :74), registered in `src/server/gate/index.ts:29-35`.
- qBittorrent client: `src/server/qbit/client.ts` (`QbitClient` :21-62, `deleteTorrents` :152), `src/server/qbit/session.ts` (`SendOptions.form` is `URLSearchParams` only :56; `request()` :128-133; `expectOk` :255; 403 re-login :298-311; `QBIT_DEADLINE_MS` 25 s), `src/server/qbit/paths.ts` (no `torrentsAdd` yet).
- Categories for validation: `src/server/sync/torrent-table.ts` `categories` getter (:46, :242); the `Syncer` (`src/server/sync/syncer.ts:65-79`, `read()` :179) has no categories-only accessor; reach it via `getSyncer()` (`src/server/sync/index.ts:12`).
- Batch shape and errors: `src/shared/torrent-ops.ts:35-46` (`BatchItem`, `BatchResult`), `src/shared/errors.ts` (`ERROR_CODES`, `ERROR_MESSAGES`, `fail`), `src/lib/app-error.ts:36` `CONNECTION_CODES`, `src/lib/error-text.ts` (`OPERATION_FAILURE_CODES` :29, `deleteFailureText` :66 as the pattern; no add texts yet).
- Client ops: `src/state/tracked-op.ts` (`TrackedOp`, `sendOp` → `Promise<void>`, failure toast with 重試, `useOpsInFlight`), `src/state/call-fn.ts:98` (35 s), `src/state/maindata.ts:317` `refreshMaindata`.
- Sending lock pattern: `src/features/selection/delete-confirm.tsx:93-109` (`deleteOp`), `:273-360` (pressed ref and state, sending, cancel guard, batches, `Promise.all` unlock). `src/shared/ui/confirm-shell.tsx` exports `STILL_WAITING_MS` (:33), `STILL_WAITING_TEXT` (:35).
- Toasts: `src/lib/toast.ts` (`failure`, `plain`, `dismissFor`, `setLift`; comment :8-12 says the button kind comes with its first caller), `src/shared/toast-store.ts` (`ShownToast` failure | plain, `PLAIN_TOAST_MS`), `src/shared/ui/toaster.tsx:42-95`. A third kind (`action`, label, run, 8 s) is needed.
- Add feature: `src/features/add/add-screen.tsx` (inert submit :190-206, `disabled` :158, close paths :106-108, :257, :265, `onOpenExisting` :117), `use-add-entries.ts` (items `{id, source, result}` :94-98 without the `File`; `ready`; hash list), `add-model.ts` (`AddSource`, `AddItem`, `JudgedItem`, `addCounts`, `addButtonText`, `addDisabled`, `skippedText`), `src/lib/add-entries.ts` (`judgeEntries`, `ENTRY_LABELS`, `addBatches`), `src/shared/torrent-add.ts`. Test harness `src/features/add/add-screen-testing.tsx` (env, `render({loaded})`, `submit()`, `paste`, `pick`, `torrentFile`, `infoHashOf`, `NEW_A/B/C`, `LIVE`, `ARCHIVED`); `add-screen.dom.test.tsx:66` asserts the press does nothing (must change).
- Navigation: `selectCategory` (`src/routes/_authed.tsx:373-424`, drops `hash` unless the new category holds it: call `setHash` after it, and only once the torrent exists), `useViewedHash()`, `src/state/detail-outside.ts` (cleared when maindata lacks the hash). Board 下載中 sorts newest `added_on` first (`src/lib/visible-torrents.ts:146-152`).
- Fake qBittorrent: `scripts/fake-qbit.mjs` ops routes (:728-732, handler :998-1023, `readBody` :976 is string-only), `OPS_MODES` (:170), `CATS_MODES` (:172), maindata categories (:1060-1073), `addGrown` (:663) as the pattern for a new torrent with the newest `added_on`. Multipart can be parsed with `await new Response(buffer, { headers: { 'content-type': ct } }).formData()`. `e2e/fixtures.ts` `Modes` (:158-182), `opCalls` (:212).
- Unit fakes: `src/server/qbit/testing.ts` (`FakeCall.body` is the URLSearchParams string only :222; `FakeQbitRoutes` :164), `src/server/functions/torrent-ops.test.ts` (runner pattern :36-58), `src/server/functions/discover.test.ts:73-91` (add `addTorrents`).
- qBittorrent API: https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-5.0)#add-new-torrent (check the status codes for an invalid torrent).

## Tasks & Acceptance

**Execution:**
- `src/server/gate/body-limit.ts` (+ test): an upload limit equal to `MAX_ADD_REQUEST_BYTES`; `MAX_REQUEST_BODY` becomes the largest per-function limit; anonymous stays 64 KB.
- `src/server/functions/_define.ts` (+ test): a FormData-aware input step that never throws (FormData → object, then zod).
- `src/shared/torrent-add.ts` / `src/shared/torrent-ops.ts`: the add input schema (`magnets`, `files`, `category`), strict.
- `src/server/qbit/session.ts`, `client.ts`, `paths.ts`, `testing.ts` (+ tests): multipart sends (`form: URLSearchParams | FormData`), `addMagnet(url, category)` / `addFile(bytes, name, category)` (or one `addTorrent`), `torrentsAdd`; the fake records multipart fields.
- `src/server/sync/syncer.ts` (+ test): a categories accessor for validation.
- `src/server/functions/add-torrents.ts` (new, + test in `torrent-ops.test.ts` or its own file), `discover.test.ts`: S1 to S11.
- `src/lib/error-text.ts` (+ test): `addFailureText(code)` for the whole-request toast (「新增失敗：…」) and `addItemFailureText(code, kind)` for row reasons (timeout 「qBittorrent 沒有回應，請再試一次」; rejected file 「qBittorrent 讀不了這個檔案」; rejected magnet 「qBittorrent 拒絕這個連結」, Claude 代決).
- `src/shared/toast-store.ts`, `src/lib/toast.ts`, `src/shared/ui/toaster.tsx` (+ tests): the action toast (label, run, 8 s, `role="status"`).
- `src/state/` (new small store, + test): the pending 「去看」 open (hash, category, 30 s cap) that writes `setHash` once the torrent appears; cleared on timeout, on another choice, or on a new add.
- `src/features/add/*` (+ dom tests through the harness): keep `File` on items; `addTorrentsOp` (tracked-op); re-judge, batches, sending lock and labels, results (C1 to C10); the no-categories line.
- `scripts/fake-qbit.mjs`, `e2e/fixtures.ts`: `POST /api/v2/torrents/add` (multipart; logs `{op:'add', urls|file, category, autoTMM}`; adds a downloading torrent with the newest `added_on` named from `dn` or the file's `info.name` when parseable, else a generic fake name); `ops=reject` rejects every add, `ops=reject-files` rejects file adds, `ops=slow` delays; `cats=none` for C10.
- `e2e/add-submit.spec.ts` (new): C1 to C11 on desktop; C3, C4, C6 on phone; no horizontal scroll at 390px.
- Screenshots (`screenshots/4-7/`), desktop 1440 and phone 390, light and dark: 新增中, the all-ok toast, partial failure, the whole-failure toast; also the no-categories line.

**Acceptance Criteria:**
- Given 3 entries sent where qBittorrent rejects one, when results return, then the two leave the list, the one stays with its reason, and pressing again sends only that one.
- Given a send in flight, when Alex presses 取消, ✕, Esc or drags down, then nothing closes until the send ends.
- Given a request body over the limit, when it reaches the container, then it is refused before the body is read in full and no qBittorrent call is made.

## Spec Change Log

## Review Triage Log

### 2026-11-20: Review pass
- verdicts: 35 findings: high 0, medium 11, low 19, false 5, maybe-false 0
- findings:
  - `[medium]` `[patch]` (blind) Paste, pick, drop, 拿掉 and the category stay live while sending; an all-ok close discards mid-send rows: inputs locked while sending; all-ok closes only when every shown row was sent and nothing is reading; tested.
  - `[medium]` `[patch]` (blind) 重試 sends a stale list after new pastes: adding entries dismisses the failure toast; 重試 runs a normal press (re-judged); tested.
  - `[medium]` `[patch]` (blind) 重試 reports torrents qBittorrent already took as rejected: 重試 re-judges against the latest maindata; tested.
  - `[medium]` `[patch]` (blind) Client 35 s timeout includes upload while the server deadline starts in the handler: `addCallTimeoutMs(bytes)` (35 s plus upload at 256 KB/s, capped at 4 min) passed through a new `callFn` `timeoutMs`; tested.
  - `[medium]` `[patch]` (blind) A later batch throwing loses earlier batches' outcome: non-AppErrors fail only that batch; `not_logged_in` carries what was done (added rows leave, a plain toast) before the list is discarded; tested.
  - `[low]` `[patch]` (blind) A deleted category gives a vague whole failure on every retry: a whole `invalid_input` also refreshes maindata so the category drops out; tested.
  - `[medium]` `[patch]` (blind) The 50 MB ceiling applied to every verified request: only `multipart/form-data` gets it; others keep 400 KB; the 409,601-byte 413 test restored.
  - `[low]` `[patch]` (blind) The result line has no live region: inside an always-mounted `role="status"`.
  - `[low]` `[reject]` (blind) The 去看 toast does not pause on hover or focus: the story fixes 8 s; the same toast store has no pause for any kind.
  - `[low]` `[patch]` (blind) The result line keeps the old failed count: counts the failed rows still shown; tested.
  - `[low]` `[reject]` (blind) No way to cancel a long send: the AC makes the send uncloseable (4.3 pattern).
  - `[low]` `[patch]` (blind) The AD-11 link cites v0: now `/start/latest/.../guide/server-functions` and the installed SKILL.md.
  - `[low]` `[patch]` (blind) e2e gaps: C9 now logs back in, reopens and checks the list is empty; batch split and server whole failures stay in DOM and unit tests.
  - `[false]` `[reject]` (intent) Keys are by position in the request, not the screen: the client maps keys back through its send order.
  - `[low]` `[reject]` (intent) Per-file size and count are checked after Start parses the form: the gate stops oversized bodies first; Start always reads the form whole.
  - `[low]` `[reject]` (intent) The press-time 改標 is not asserted when the screen closes: the row is not sent (asserted); the label matters only while the screen stays.
  - `[false]` `[reject]` (intent) The sending lock is reimplemented rather than the 4.3 component: the add screen has its own shell since 4.6; the behavior matches.
  - `[false]` `[reject]` (intent) The 去看 URL write waits for the torrent: the spec's recorded choice.
  - `[low]` `[reject]` (intent) The no-categories screenshot still shows category tabs: fake torrents keep their category names; the line and the disabled button are checked.
  - `[low]` `[reject]` (intent) 「還在等 NAS 回應」 is not in a screenshot: asserted in tests.
  - `[low]` `[reject]` (intent) No end-to-end oversized multipart test: the gate and the handler are each tested at their boundary.
  - `[false]` `[reject]` (intent) A whole-request `qbit_rejected` may be unreachable from the server: per-entry rejections are items by design (AD-14).
  - `[medium]` `[patch]` (edge) Mid-send entries dropped on the all-ok close: same fix as the blind row.
  - `[medium]` `[patch]` (edge) 新增 while files are still reading: disabled while `reading > 0`; tested.
  - `[medium]` `[patch]` (edge) 拿掉 or a category change during a send: same lock.
  - `[low]` `[patch]` (edge) Stale failed count: same fix as the blind row.
  - `[medium]` `[patch]` (edge) Client timeout versus server deadline: same fix as the blind row.
  - `[low]` `[patch]` (edge) Deleted category: same fix as the blind row.
  - `[low]` `[patch]` (edge) A magnet near 64 KiB with spaces grows past the limit as `%20`: `linkBytes` measured on the sent text (`magnetSendText`); boundary test.
  - `[low]` `[patch]` (edge) fake-qbit `bencodeEnd` loops on a non-numeric length: throws.
  - `[medium]` `[patch]` (edge) 重試 resends rows now shown as 以前下載過: same fix as the blind row.
  - `[false]` `[reject]` (edge) 重試 skips re-judging: duplicate of the row above (fixed there).
  - `[low]` `[patch]` (gap) A failed row that turns 以前下載過 is untested: tested (reason gone, top line gone).
  - `[low]` `[patch]` (gap) A new press cancelling a pending 去看 is untested: tested through `submit`.
  - `[low]` `[patch]` (gap) `removeAdded` dropping merged copies is untested: tested with hex and base32 of one hash.

## Design Notes

Claude 代決 (Alex can veto):
- `autoTMM=true` is sent with the category, so qBittorrent saves to the category path the screen promised (4.6 deferred item).
- 去看 with one torrent opens its detail once it appears, capped at 30 s (the story's own Claude 代決).
- Row reasons: timeout 「qBittorrent 沒有回應，請再試一次」, rejected file 「qBittorrent 讀不了這個檔案」, rejected magnet 「qBittorrent 拒絕這個連結」, other codes their `errorText`.
- The whole-request toast reads 「新增失敗：<reason>」, like 刪除失敗 (4.3).
- Re-judging uses the `['maindata']` already in the cache at the press (it polls every few seconds); no extra fetch before sending.

Alex's decisions (2026-11-20, relayed by the review session): no categories shows 「qBittorrent 還沒有分類」 and keeps the category required; hybrid hash matching deferred (frontmatter `deferred`).

AD-11 docs:
- TanStack Start server functions with FormData (1.169.5): https://tanstack.com/start/v0/docs/framework/react/server-functions and the installed `start-client-core/skills/start-core/server-functions/SKILL.md`
- qBittorrent WebUI API `torrents/add`: https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-5.0)#add-new-torrent
- `FormData` and `fetch` multipart: https://developer.mozilla.org/en-US/docs/Web/API/FormData
- zod 4: https://zod.dev/api

## Verification

**Commands:**
- `source ~/.nvm/nvm.sh && nvm use && npm run lint && npm run typecheck`: expected to pass.
- `source ~/.nvm/nvm.sh && nvm use && npm test`: all pass.
- `source ~/.nvm/nvm.sh && nvm use && npm run build && caffeinate -dimsu npx playwright test`: all pass.
- `bash .claude/skills/next-story/check.sh`: every line ok.

## Auto Run Result

Status: done (first pass; a follow-up review pass is recommended).

**Change.** `addTorrents` (POST FormData, magnets and .torrent files and a category, limits, one qBittorrent call per entry with `autoTMM=true`, batch result keyed by input index) and the client send: re-judge, batches, sending lock, all-ok toast with 去看, partial failure rows and line, whole-failure toast with 重試, the no-categories line.

**Files.** Server: `src/server/functions/add-torrents.ts`, `_add-entries.ts`, `_define.ts` (`formInput`), `src/server/gate/body-limit.ts` (multipart ceiling), `src/server/qbit/{session,client,paths,testing}.ts`, `src/server/sync/syncer.ts`. Client: `src/features/add/{use-add-submit.ts,use-add-entries.ts,add-screen.tsx,add-parts.tsx,add-model.ts}`, `src/state/open-when-added.ts`, `src/state/{tracked-op,call-fn}.ts`, toast store, lib and toaster (action kind), `src/lib/error-text.ts`, `src/lib/info-hash.ts` (`magnetSendText`), `src/shared/torrent-add.ts` (`addCallTimeoutMs`). Fake and tests: `scripts/fake-qbit.mjs` (`torrents/add`, `ops=drop`, `cats=none`, `/__fake/added`), `e2e/fixtures.ts`, `e2e/add-submit.spec.ts`, `src/features/add/add-submit.dom.test.tsx`, server tests; screenshots in `screenshots/4-7/`.

**Review.** 35 findings. Patched: medium 7 entries (input lock while sending, reading gate, re-judged 重試, upload timeout, later-batch outcome, multipart-only ceiling, plus duplicates), low 13 rows. Deferred: 0 new (hybrid hash, Alex's call). Rejected: 5 false, 9 low with reasons.

**Follow-up review: true.** Two or more medium entries were patched. Unreviewed risks: the 重試 path through `TrackedOp.retry`, the `AddInterrupted` carry on `not_logged_in`, and the multipart ceiling in the gate.

**Verification (2026-11-20, after the patches).**
- `npm run lint`: 0 errors (3 existing warnings in files from PR #53); `npm run typecheck`: exit 0.
- `npm test`: 153 files, 3735 tests pass.
- `npm run build && npx playwright test`: 182 passed, 1 skipped (opt-in recording), 24.2 min; screenshots retaken.
- `check.sh`: every line ok.
