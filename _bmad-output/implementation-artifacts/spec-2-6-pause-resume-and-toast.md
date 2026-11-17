---
title: 'Story 2.6: Pause/resume and toast'
type: 'feature'
created: '2026-11-17'
status: 'done'
baseline_revision: 'd24064c8f3c33b79897f00f31f0c68563cdac5ab'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-react-torrent-2026-11-15/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-5-detail-overview-hero-stats-save-path.md'
warnings: ['oversized']
deferred:
  - summary: >-
      The 384 KB hash-list body limit (AD-12) is too small for 5000 64-char hashes as TanStack Start serializes them.
    evidence: |-
      src/server/functions/torrent-ops.test.ts measures 5000 64-char hashes at 395,140 bytes against 393,216; 4975 fit, 5000 40-char hashes fit at 275,140. The schema accepts 1 to 5000 of either length, so 4976 to 5000 v2-only hashes would get invalid_input. Nothing sends more than one hash until Epic 4's batch delete and move. Raising the limit changes the spine (AD-12), which is Alex's decision; the code comment now states the measured numbers.
    location: >-
      src/server/gate/body-limit.ts
    severity: medium
---

<intent-contract>

## Intent

**Problem:** The detail's 「⋯」 is disabled, so Alex cannot pause a torrent or start one of the 203 stopped (已完成) torrents seeding again without going back to VueTorrent; there is also no toast to tell him an action failed.

**Approach:** Two POST server functions (`stopTorrents`, `startTorrents`) through the factory, a 「⋯」 menu with one item (暫停 or 繼續) that calls them, `pendingOps` in `src/state` so the item locks until qBittorrent reflects the change, and a hand-written toast (store and renderer in `src/shared/ui`, the three allowed kinds in `src/lib/toast.ts`) used for the failure-with-retry case.

## Boundaries & Constraints

**Always:**
- Server functions: `serverPost` + `guard`, input `z.strictObject({ hashes })`, `hashes` an array of 1 to 5000 strings matching `TORRENT_HASH_PATTERN` (40/64 lowercase hex; so never `all`, never `|`), deduplicated in the container, joined with `|` in a `URLSearchParams` form field `hashes`, sent to qBittorrent 5.1.4's stop and start endpoints (expected `/api/v2/torrents/stop` and `/api/v2/torrents/start`, WebAPI 2.11 rename of pause/resume: confirm in the official wiki and record the URL). Body limit 384 KB (393_216 bytes): raise the gate's request ceiling `MAX_REQUEST_BODY` to it (anonymous ceiling stays 64 KB), export it as the hash-list limit, and give both functions `bodyLimit` of it. A 2xx from qBittorrent returns AR-54's shape `{ items: [{ key: hash, ok: true }, ...] }` for every input hash (a shared type in `src/shared`, reused by later batch stories).
- `src/server/qbit`: two named client methods and two `QBIT_PATHS` constants; nothing generic.
- Menu: 「⋯」 (`aria-label` 「更多動作」, 36px desktop, 44px phone) opens a shadcn/Radix `DropdownMenu` (the existing non-modal wrapper) with exactly one item: 「繼續」 when the torrent's status is 已暫停 or 已完成 (qBittorrent `pausedDL`, `stoppedDL`, `pausedUP`, `stoppedUP`, also while moving with such a remembered state), else 「暫停」. The rule is a new export of `src/lib/torrent-status.ts` (e.g. `pauseActionOf(torrent, stateBeforeMove): 'stop' | 'start'`) built on `statusOf`; vitest covers every state code in `STATE_KINDS`, an unlisted code, and `missingFiles` private and not. Phone item rows 44px. On the phone the menu content portals into the bottom sheet (Radix `Portal` `container`), so the sheet's focus trap and `inert` do not close or block it. Esc with the menu open closes only the menu, not the detail panel or sheet.
- Success (any `ok: true`): no toast, the item keeps its word; call `refreshMaindata(queryClient)` once; never touch local data.
- `pendingOps` (`src/state`, the only in-flight record, generic for later ops): `markPending(hash, op)`, cleared when the item's action for that hash no longer equals the sent op (qBittorrent reflected it), when the torrent is gone, on failure, or 30 s after marking (a timer, so the item re-enables without new data). While pending the item is `disabled`. Marked when the request is sent.
- Failure: `qbit_rejected`, `timeout`, `invalid_input` show `toast.failure` with text from `src/lib/error-text.ts` (a per-op function, e.g. 「暫停失敗：qBittorrent 拒絕這個操作」) and 「重試」 that sends the same op for the same hash again. Connection codes and `bad_origin` are left to the global `MutationCache` `onError` (no toast). Any failure clears the pending mark.
- Toast: features call only `src/lib/toast.ts` (`info(text)`, `action(text, { label, onAction })`, `failure(text, { onRetry })`), which drives a store and `<Toaster />` in `src/shared/ui/toaster.tsx`; an ESLint `no-restricted-imports` rule allows that module only from `src/lib/toast.ts` and the mounting root. Mounted once in `src/routes/__root.tsx`. One toast at a time; a new one replaces the old (and replays the entrance). `info` 4 s; `action` 8 s, countdown paused while the pointer is over it and resumed with the time left; `failure` never auto-closes. Every toast has ✕ (28px, `text-muted`, `aria-label` 「關閉」). `action`/`failure` have a 32px outline pill button on the right (`failure` label 「重試」; pressing it closes the toast and runs the callback). Looks: `surface`, 1px `border`, `rounded-card` (16px), `shadow-float`, padding 12px 8px 12px 18px, left text 13px/600, no colour for success. Desktop (≥1024px): fixed bottom-right, 24px from right and bottom, width 356px; a lift parameter (`setToastLift(px)` in `src/lib/toast.ts`, default 0) moves it to 16px above a bar of that height (Epic 4 selection bar). Phone: fixed at the top, 16px left/right/top (plus safe area), above the bottom sheet and its scrim (z-index above `z-50`). Entrance: the existing `rise` keyframe (10px up, opacity), none under reduced motion. `info`/`action` sit inside an always-mounted `aria-live="polite"` region; `failure` has `role="alert"`.
- The toast region is exempt from the bottom sheet's modal session: `src/shared/ui/sheet-session.ts` skips it in `inertOthers` and its `focusin` pull-back ignores targets inside it (mark the region with a data attribute), so 「重試」 and ✕ work over an open sheet.
- `scripts/fake-qbit.mjs`: POST stop/start (cookie required, `hashes` form field) records each call (inspectable via a loopback control endpoint) and overrides those torrents' states so the next maindata reflects it (stop: `stoppedUP` if complete else `stoppedDL`; start: `uploading` if complete else `downloading`); an `ops` mode `normal | reject` (reject answers HTTP 400, which the session maps to `qbit_rejected`). Mode changes of `data` clear overrides.
- AD-11: read Radix DropdownMenu Portal/`container` docs, TanStack Query v5 `useMutation`, MDN `aria-live`/`role=alert`, the qBittorrent 5.x WebUI API wiki; record URLs in Design Notes.

**Never:** a toast on success; optimistic updates or writes to `['maindata']`; batch pause/resume or a selection-bar entry; a toast package (sonner or other) or any new dependency; `torrent.state` comparisons outside `src/lib/torrent-status.ts`; real qBittorrent in tests, e2e or screenshots (AD-15); features importing `src/shared/ui/toaster.tsx`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| S1 send | `stopTorrents({ hashes: [h1, h1, h2] })`, fake qBittorrent 200 | POST `/api/v2/torrents/stop`, form `hashes=h1|h2`; result items for each input hash ok | n/a |
| S2 bad input | `[]`, 5001 hashes, `'all'`, `'a|b'`, uppercase hex, extra key | `invalid_input`, no qBittorrent call | n/a |
| S3 auth | no session | `not_logged_in` (discovery test covers both) | n/a |
| S4 rejected | qBittorrent answers 400/500 | `qbit_rejected` | n/a |
| S5 big body | 5000 64-char hashes as Start serializes them | under 384 KB, accepted | over the limit: `invalid_input` |
| M1 menu word | each qBittorrent state | 繼續 for paused/stopped DL/UP, 暫停 otherwise | unlisted state reads 暫停 |
| P1 pending | press 暫停, data not yet changed | item disabled; re-enabled when state flips, torrent vanishes, or 30 s pass | n/a |
| F1 failure | `qbit_rejected` / `timeout` / `invalid_input` | failure toast with 「重試」; item enabled again; 重試 resends | n/a |
| F2 connection | `home_unreachable`, `not_logged_in`, ... | no toast; global alert or login | pending cleared |
| T1 timing | fake timers | info gone at 4 s; action at 8 s, hover pauses and resumes with time left; failure stays until ✕ | n/a |
| T2 replace | second toast while one shows | only the new one shown | n/a |
| T3 over sheet | phone sheet open, failure toast | toast visible above sheet, 重試 and ✕ clickable and focusable | n/a |

</intent-contract>

## Code Map

- `src/server/functions/_define.ts` -- `serverPost`, `guard({ name, bodyLimit })`, `input()`; pattern in `get-torrent-detail.ts`.
- `src/server/gate/body-limit.ts` -- `MAX_REQUEST_BODY` (64 KB today, test at `body-limit.test.ts:43` asserts it), `ANONYMOUS_BODY_LIMIT` stays 64 KB; `_define.ts:118` caps `bodyLimit` at the ceiling.
- `src/server/qbit/paths.ts`, `client.ts` -- add paths and `stopTorrents`/`startTorrents` methods; `session.send(path, { method: 'POST', form })` already exists (non-2xx non-403 becomes `qbit_rejected`, 403 re-logs in once).
- `src/server/functions/*.test.ts` -- the discovery/not-logged-in test lists every server function; existing server-function tests show the fake fetch setup.
- `src/shared/torrent-hash.ts` -- `TORRENT_HASH_PATTERN`; add the hash-list schema and AR-54 batch types in `src/shared` (new file, e.g. `torrent-ops.ts`).
- `src/lib/torrent-status.ts` -- `statusOf`, `STATE_KINDS`, `effectiveKind`; add the pause/resume action export.
- `src/lib/error-text.ts` -- `errorText(code)`; add per-op failure text.
- `src/state/maindata.ts:228` -- `refreshMaindata(client)`; `src/state/torrent-detail.ts` -- the bind pattern (`src/state` may not import server functions; features pass them in).
- `src/state/query-client.ts` -- `MutationCache` `onError` already routes connection codes and `bad_origin`; features handle the rest.
- `src/state/shortcuts.ts` -- Esc registry (`useEscapeLayer`); check how it interacts with Radix's own Escape handling.
- `src/features/detail/detail-header.tsx` -- `more` button (disabled today) for `row`, `stacked`, `phone`; `IconButton` sizes.
- `src/features/detail/detail-view.tsx`, `phone-detail-sheet.tsx`, `board-detail-panel.tsx`, `list-detail-panel.tsx` -- where the header gets torrent and `stateBeforeMove`; the sheet element for the portal container.
- `src/shared/ui/dropdown-menu.tsx` -- non-modal Radix wrapper; `DropdownMenuContent` hardcodes `Portal` (add a `container` prop); used by `src/features/header/sort-menu.tsx`.
- `src/shared/ui/sheet-session.ts` -- `inertOthers(keep)`, `onFocusIn` pull-back: exempt the toast region.
- `src/routes/__root.tsx` -- `RootDocument`, mount `<Toaster />`.
- `src/styles.css` -- `--shadow-float`, `rise` keyframe (line ~312, reduced-motion off), `rounded-card`, `surface`, `border`, `text-muted`.
- `eslint.config.js` -- add the toaster import restriction beside the existing bans.
- `scripts/fake-qbit.mjs` -- `fakeQbit` handler (~line 590), `controlMode`, `DATA_MODES`, `states` data mode from 2.5; `e2e/fixtures.ts` `setModes`, `login`; `e2e/detail.spec.ts` screenshot pattern.
- Mockups: `_bmad-output/planning-artifacts/ux-designs/ux-react-torrent-2026-11-13/mockups/S06-add-success-desktop.dc.html`, `S08-done-desktop.dc.html` (toast), `S04-overview-desktop.dc.html`, `S05-overview-phone.dc.html` (header); UX DESIGN.md lines 347-356, 662; EXPERIENCE.md lines 94, 323, 375, 394-396.

## Tasks & Acceptance

**Execution:**
- `src/shared/torrent-ops.ts` (new) -- hash-list input schema, batch result types.
- `src/server/gate/body-limit.ts` (+ test) -- 384 KB ceiling and exported hash-list limit.
- `src/server/qbit/paths.ts`, `client.ts` (+ test) -- stop/start methods.
- `src/server/functions/stop-torrents.ts`, `start-torrents.ts` (+ tests: S1 to S5 with fake fetch only).
- `src/lib/torrent-status.ts` (+ test) -- action rule (M1).
- `src/lib/error-text.ts` (+ test) -- per-op failure text.
- `src/state/pending-ops.ts` (new, + test with fake timers) -- P1.
- `src/shared/ui/toaster.tsx` (new, + DOM test) and `src/lib/toast.ts` (new, + test with fake timers) -- T1, T2, aria, lift.
- `src/shared/ui/sheet-session.ts` (+ test) -- exempt the toast region (T3).
- `src/shared/ui/dropdown-menu.tsx` -- `container` prop.
- `src/features/detail/` -- a `MoreMenu` (or inside `detail-header.tsx`) with the mutation, pending, failure toast, retry; wire through the three containers (+ DOM tests for menu word, aria-label, sizes, pending disable, retry, no toast on success, refresh called).
- `src/routes/__root.tsx` -- mount `<Toaster />`; `eslint.config.js` -- import restriction.
- `scripts/fake-qbit.mjs` -- stop/start endpoints, call log, `ops` mode.
- `e2e/detail.spec.ts` (or new `e2e/pause.spec.ts`) -- pause a downloading torrent and start a 已完成 one in the board (it moves to 做種中, the panel stays and recounts 「第 N 個」), the rejected path shows the failure toast and 重試 resends, the phone sheet with a failure toast on top; screenshots into `e2e-output/screenshots/2-6/`: menu (暫停, 繼續) and failure toast desktop and phone 390 (over the sheet), light and dark.
- Normal and action toasts have no product caller yet: expose `window.__rtToastPreview` (the three `src/lib/toast.ts` functions) only when `import.meta.env.DEV`, and take their screenshots (desktop and phone 390, light and dark) from the dev server against the fake qBittorrent; verify `npm run build` output contains no `__rtToastPreview`.

**Acceptance Criteria:**
- Given fake data, when Alex presses 「⋯」 then 暫停 on a downloading torrent, then the fake records one stop call for that hash, no toast appears, and after the refresh the hero reads 已暫停 and the item reads 繼續.
- Given `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run smoke`, `CI=1 npm run smoke:browser` and `check.sh`, then all pass with 0 CSP violations and 0 console errors.
- Given the PR, then it carries the menu and three-toast screenshots at desktop and phone 390 (incl. over the sheet), light and dark, and lists the doc URLs read.

## Spec Change Log

## Review Triage Log

### 2026-11-17: Review pass
- verdicts: 32 findings: high 0, medium 5, low 22, false 5, maybe-false 0
- findings:
  - `[medium]` `[defer]` (intent) 384 KB keeps 5000 64-char hashes out although the AC accepts 1 to 5000. Recorded in `deferred`: a spine AD-12 decision for Alex before Epic 4; no caller sends more than one hash today.
  - `[low]` `[reject]` (intent) raising `MAX_REQUEST_BODY` lifts the gate ceiling for every logged-in request. Each function's own `guard` limit (64 KB default) still rejects, anonymous stays 64 KB; only Alex logs in.
  - `[low]` `[patch]` (intent) server tests skip the HTTP gate (same root cause as the verification-gap middleware row). Patched there.
  - `[low]` `[patch]` (intent) pending clearing runs only while a menu reads it (same root cause as the blind comment row). Patched there.
  - `[low]` `[reject]` (intent) info and action phone screenshots are not over the sheet. 「含蓋在底部面板上」 is met by the failure toast over the sheet; same renderer and placement.
  - `[low]` `[reject]` (intent) reduced motion is not tested here. The `rise` utility and its reduced-motion rule are the existing ones from 2.4.
  - `[false]` `[reject]` (intent) the global `onError` firing for connection codes is not asserted. `src/state/query-client.test.ts` already covers the MutationCache path; the feature test shows no toast and a cleared pending.
  - `[medium]` `[defer]` (blind) the 384 KB comment claims 5000 64-char hashes fit while the test pins the opposite. Comment corrected to the measured numbers in the patch round; the limit itself joins the deferred item above.
  - `[low]` `[patch]` (blind) `usePendingOp` would clear a later story's op on the same hash. Patch: it only judges the ops its caller owns (`['stop', 'start']`), test with a `delete` entry.
  - `[low]` `[patch]` (blind) the pending header comment overstated when entries go. Patch: says the checks run while a reader is mounted, the 30 s timer otherwise.
  - `[medium]` `[patch]` (blind) a sticky failure toast's 重試 can resend a stale op later. Patch: `toast.failure` returns a `dismiss` handle; a new op for that hash closes it (onMutate).
  - `[medium]` `[patch]` (blind) a success from the menu leaves the old failure toast and its 重試 (same root cause as the row above). Patched there.
  - `[low]` `[reject]` (blind) Tab cannot reach the toast over an open sheet. The sheet exists only below 1024px (touch); tapping works and is tested; adding the region to the wrap cycle is new focus logic.
  - `[low]` `[reject]` (blind) the action toast pauses on hover, not focus. The AC names hover; no product caller exists until Epic 4 and 5.
  - `[low]` `[patch]` (blind) the fake does not log rejected calls, so the e2e resend assertions cannot fail. Patch: rejected calls logged with `rejected: true`; e2e asserts the resends and no call after ✕.
  - `[low]` `[reject]` (blind) a 4.5 s sleep in e2e. Timing is checked with fake timers in `toast.test.ts`; the sleep only adds run time.
  - `[low]` `[patch]` (blind) the toaster lint exemptions have no probes. Patch: probes for `toast.ts` importing `cn` and another lib file importing the toaster.
  - `[low]` `[patch]` (blind) no AD-11 reference for `MutationObserver`; the spec is not in the diff. Patch: the 5.107.1 source URL cited (no docs page exists); the spec is left out of the diff by design.
  - `[low]` `[reject]` (blind) a sticky phone failure toast covers the sheet header. EXPERIENCE puts the phone toast at the top over the sheet; its ✕ closes it.
  - `[false]` `[reject]` (blind) per-item results are ignored. Stop and start always answer every item ok (AD-14); no failed item can reach the menu today.
  - `[low]` `[patch]` (blind) `toast.ts` exposes named exports beside the `toast` object. Patch: only `toast` and `setToastLift` remain.
  - `[low]` `[patch]` (verification) the logged-in 384 KB ceiling has no middleware test. Patch: 393,216 bytes reaches `next`, 393,217 gets 413.
  - `[low]` `[patch]` (verification) MoreMenu's `stateBeforeMove` wiring is untested. Patch: a `pausedDL` torrent polled to `moving` still shows 繼續.
  - `[low]` `[patch]` (verification) the e2e reject assertions are vacuous (same root cause as the blind fake-log row). Patched there.
  - `[low]` `[patch]` (edge) the 30 s mark can expire while the call is still in flight, allowing a duplicate press. Patch: the item is also disabled while this hash's mutation is pending; test fails with the fix reverted.
  - `[low]` `[reject]` (edge) an older failure clears a newer mark. Needs two calls in flight for one hash, which the in-flight disable and the toast dismiss now prevent.
  - `[false]` `[reject]` (edge) 已整理 and error torrents are never offered 繼續 and lock for 30 s. The AC says 「其他是暫停」; the 30 s lock is the specified fallback.
  - `[medium]` `[defer]` (edge) 4976 to 5000 64-char hashes rejected (same as the deferred item). Deferred there.
  - `[false]` `[reject]` (edge) login or settings codes would fail silently. `stopTorrents` and `startTorrents` can only return the guard's codes (`not_logged_in`, `invalid_input`, `timeout`, `qbit_*`), never `login_*` or `settings_write_failed`.
  - `[false]` `[reject]` (edge) a new toast replaces a failure toast. The AC says 「一次只顯示一個，新的換掉舊的」.
  - `[low]` `[reject]` (edge) 重試 or ✕ drops focus to `body`. Touch on the phone, mouse on desktop; restoring focus adds state for a rare keyboard path.
  - `[low]` `[reject]` (edge) keyboard cannot reach the toast over the sheet (same as the blind Tab row). Rejected there.

## Design Notes

- Claude 代決 (Alex may veto): no toast package: the AC's behaviour (one at a time, hover pause, sticky failure, lift parameter, `rise` entrance) is small to write and the spine forbids new animation packages; DESIGN says the toast follows shadcn's structure, which this keeps (region, title, action, close). Hover pause applies to `action` only (the AC names it there); leaving resumes with the time left. Failure text is 「暫停失敗：<reason>」 / 「繼續失敗：<reason>」 with the reason from the error table. The menu word follows the status (已暫停, 已完成 → 繼續); 已整理 and error torrents read 暫停, as the AC says 「其他是暫停」. Pending also clears when the torrent leaves the data.
- Layering: `src/shared` may import only itself, so the renderer and store live in `src/shared/ui/toaster.tsx` (the 「底層 toast」) and `src/lib/toast.ts` is the only API features use.
- The Radix menu inside the phone sheet: portaling to `body` would put it outside the sheet's focus trap (the `focusin` pull-back closes it); portal into the sheet instead.
- URLs actually read (2026-11-17, AD-11): `https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-5.0)` (`/api/v2/torrents/stop` and `/api/v2/torrents/start`, `hashes` separated by `|` or `all`, 200 in every case; POST for mutations, form-encoded in the examples); `https://www.radix-ui.com/primitives/docs/components/dropdown-menu` (Portal `container`, default `document.body`; Esc closes the menu and focuses the trigger); `https://tanstack.com/query/v5/docs/framework/react/reference/useMutation` (`onMutate` before the mutation function, `onError`/`onSuccess`, retry 0 by default; callbacks given to `mutate()` stop after unmount, so 重試 uses a `MutationObserver` with the same options); `https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-live` (the live region exists empty first, then gets the update; polite does not interrupt); `https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/alert_role` (equals assertive plus atomic; the element must be in the markup before the message, so the `role="alert"` box is always mounted and the failure card is put into it).
- Implementation notes (Claude 代決, Alex may veto):
  - S5 finding: Start's client sends a POST body through seroval, which wraps every string as `{"t":1,"s":"..."}`. Measured: 5000 40-char hashes are 275 140 bytes (fit), 5000 64-char hashes 395 140 bytes, 1 924 over 393 216; 4975 64-char ones fit. The limit stays 384 KB as the spine says (AD-12); a test pins both numbers. Nothing sends more than one hash before Epic 4's batch actions, so Alex decides there (raise the limit in the spine, or accept 4975 v2-only hashes as the real ceiling).
  - The board's 「click on empty space closes the panel」 now counts only targets inside the board's own DOM: the portaled menu's click bubbled there through React and closed the panel (found by the e2e).
  - `stopTorrents`/`startTorrents` answer one item per input hash, repeats included (S1 `[h1, h1, h2]` gives three items); qBittorrent gets the distinct ones.
  - The syncer now takes `Pick<QbitClient, 'syncMaindata'>` (it only reads), so its tests need no write-method stubs.
  - The toaster ban is any import specifier ending in `toaster`, allowed in `src/lib/toast.ts`, `src/routes/__root.tsx` and the two toaster test files. `src/lib/toast.ts` may import that one `src/shared/ui` file only.
  - The toast region's attribute lives in `src/shared/ui/toast-region.ts`, because `sheet-session.ts` may not import the toaster.
  - Menu item: 13px semibold like the sort menu rows, `min-w-36` panel, aligned to the ⋯'s right edge; a disabled item is 50% with `not-allowed` (added to the shared item class).
  - MDN advises text-only content in `role="alert"`; the spec puts the failure toast (with 重試 and ✕) there, which this follows.
  - Review fixes: `usePendingOp(hash, action, owned)` judges only the ops its caller sends (a later story's op on the same hash is returned and left alone); the reflected and gone checks run only while a reader is mounted, the 30 s timer is the fallback. `toast.failure` returns `{ dismiss }` (closes that toast only if it still shows); a new op for a hash closes that hash's failure toast, so 重試 never resends a replaced op. The item is also disabled while this menu's call for the shown hash is in flight (a call can outlive the 30 s mark). fake-qbit logs rejected calls as `rejected: true`. `src/lib/toast.ts` exports only `toast` and `setToastLift`. MutationObserver source read: `https://github.com/TanStack/query/blob/@tanstack/query-core@5.107.1/packages/query-core/src/mutationObserver.ts`.
  - `window.__rtToastPreview` is installed by an effect in `src/routes/__root.tsx` under `import.meta.env.DEV`; `grep -r __rtToastPreview .output` finds nothing after a build. The info and action screenshots came from the dev server against fake-qbit's fake qBittorrent (env set explicitly; `.env` holds none of the new variable names).

## Verification

**Commands:**
- `source ~/.nvm/nvm.sh && nvm use && npm run lint && npm run typecheck && npm test` -- expected: all pass.
- `source ~/.nvm/nvm.sh && nvm use && npm run build && npm run smoke && CI=1 npm run smoke:browser` -- expected: all pass, 0 CSP violations.
- `grep -r __rtToastPreview .output || echo none` -- expected: none.
- `bash .claude/skills/next-story/check.sh` -- expected: every line ok.

## Auto Run Result

Status: done (one review pass)

Summary: the detail's 「⋯」 now opens a one-item menu (暫停 for most states, 繼續 for 已暫停 and 已完成) that calls the new `stopTorrents` / `startTorrents` POST server functions (1 to 5000 hashes, deduplicated, `|`-joined, qBittorrent 5.1.4 `torrents/stop` and `torrents/start`, AR-54 all-ok result). Success refreshes maindata with no toast; `pendingOps` keeps the item disabled until qBittorrent reflects it, the torrent goes, the call fails, or 30 s pass (and while the call is in flight). The three operation errors show a sticky failure toast with 重試. A hand-written toast (store and renderer in `src/shared/ui/toaster.tsx`, the three kinds only through `src/lib/toast.ts`, lint-enforced) is mounted in the root and stays usable over the phone sheet.

Files changed (main ones):
- `src/server/functions/stop-torrents.ts`, `start-torrents.ts` (new), `src/shared/torrent-ops.ts` (new: hash-list schema, batch types), `src/server/qbit/client.ts`, `paths.ts`, `src/server/gate/body-limit.ts` (384 KB logged-in ceiling).
- `src/lib/torrent-status.ts` (`pauseActionOf`), `src/lib/error-text.ts` (operation failure text), `src/lib/toast.ts` (new).
- `src/state/pending-ops.ts` (new).
- `src/shared/ui/toaster.tsx`, `toast-region.ts` (new), `sheet-session.ts` (toast region exempt), `dropdown-menu.tsx` (`container`, disabled look).
- `src/features/detail/more-menu.tsx` (new), `detail-header.tsx`, `detail-view.tsx`; `src/routes/__root.tsx` (Toaster, DEV-only preview), `src/routes/_authed/index.tsx` (portaled menu clicks no longer close the board panel).
- `eslint.config.js` (toaster import rule), `scripts/fake-qbit.mjs` (stop/start, call log, `ops` mode), `e2e/pause.spec.ts` (new), tests beside each file.

Review: 32 findings. Patched 1 medium entry (stale 重試 / leftover failure toast) and 9 low entries (11 fixes), deferred 1 medium (384 KB vs 5000 64-char hashes, Alex's AD-12 decision before Epic 4), rejected 9 low and 5 false with reasons in the log.

Follow-up review recommendation: false. First pass patched no high and one medium entry.

Verification (2026-11-17, after the patches): `npm run lint` clean; `npm run typecheck` clean; `npm test` 90 files, 2059 tests passed; `npm run build` ok and `grep -r __rtToastPreview .output` finds nothing; `npm run smoke` ok; `CI=1 npm run smoke:browser` 49 passed, 0 CSP violations; `check.sh` all ok. Matrix audit: S1 to S5, M1, P1, F1, F2, T1, T2, T3 each have covering tests that ran and passed.

Residual risks: pause and resume against the real qBittorrent are Alex's NAS check (AD-15); the 384 KB limit caps 64-char hash lists at 4975 until Alex decides; keyboard Tab cannot reach a toast over the phone sheet.
