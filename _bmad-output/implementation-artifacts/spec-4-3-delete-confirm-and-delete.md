---
title: 'Story 4.3: delete confirmation and delete'
type: 'feature'
created: '2026-11-19'
status: 'done'
baseline_revision: '58845b5df3c9c72d819e4175e83c65840b3185bd'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-2-phone-selection-mode.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Gone-file rows promise 「只會刪種子」, but the batch sends one deleteFiles=true for every hash.
    evidence: |-
      Both 找不到檔案 and 已整理 come from qBittorrent's missingFiles state. If qBittorrent sets missingFiles when only some files are missing, the files still on the NAS would be deleted although the dialog said only the torrent goes. Settle it by checking when qBittorrent 5.1 sets MissingFiles (any missing file, or all). If it can be partial, send gone hashes with deleteFiles=false (two requests) or ask Alex how the copy should read.
    location: >-
      src/features/selection/delete-confirm.tsx
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** Alex can select torrents (4.1, 4.2), but 刪除（含檔案） is disabled. He still needs VueTorrent to delete. Delete is irreversible, so the confirmation has to say exactly what goes and whether the files go with it.

**Approach:**
- Add a `deleteTorrents` server function.
- Add a shared responsive confirm shell: a non-modal Radix dialog with `useModalSession` on desktop, the 2.2 bottom sheet on phone. It handles the sending state, the 10 s 「還在等 NAS 回應」 line and the close lock.
- Add a delete-confirm feature opened from both bar layouts. It lists the selection in tick order and has a 「連檔案一起刪」 checkbox (ticked by default). The button text and the totals come from `src/lib`.
- On success: a plain toast, the selection is cleared, `refreshMaindata` runs, and the hashes are marked in `pendingOps`.
- On failure: a toast with 重試, and the dialog stays open.

## Boundaries & Constraints

**Always:**
- `deleteTorrents` is a POST built with the `_define.ts` factory and `HASH_LIST_BODY_LIMIT` (400 KB), so 3,626 hashes fit.
  - Input: `z.strictObject({ hashes: torrentHashListSchema, deleteFiles: z.boolean() })`. `deleteFiles` is required, has no default, and a missing value returns `invalid_input`.
  - The server joins hashes with `|` and sends them with `deleteFiles` as `URLSearchParams` to `/api/v2/torrents/delete`.
  - When qBittorrent accepts, it returns `ok(allOk(hashes))`. Any rejection returns `qbit_rejected`. No session returns `not_logged_in`.
- AD-15: tests, e2e and CI only ever hit the fake qBittorrent. Never the real one.
- Shared confirm shell, desktop:
  - It is the non-modal `Dialog` from `src/shared/ui/dialog.tsx` plus `useModalSession`. Never Radix modal mode or Radix `AlertDialog`: both force modal and inject a `<style>` that the CSP blocks.
  - Look: `role="alertdialog"`, the `surface` background, a 1px `border`, 22px radius, `shadow-float`, 24px padding, a 14px gap between sections, and the `rgba(0,0,0,.5)` scrim.
  - Title 18px/700.
  - The footer is right-aligned: 36px pills with an 8px gap, the primary button rightmost.
  - It never grows taller than the viewport, and the list scrolls itself.
  - It opens with a 0.2 s scale from .95 plus a fade, and the scrim fades. Neither plays under reduced motion.
- Shared confirm shell, phone: the 2.2 bottom sheet with the same content. It needs two additions:
  - A pinned footer slot outside the scroller.
  - A lock prop that stops the scrim, the ✕ and a drag from closing it. A drag snaps back.
- Sending state, in the shell:
  - The pressed button changes its text, keeps its colour and cannot be pressed again.
  - Cancel, ✕, `Esc`, a scrim press and a drag-down all do nothing.
  - After 10 s, a line under the buttons reads 「還在等 NAS 回應」 (`meta`, `text-muted`).
- Delete confirm:
  - The title is 「刪除 N 個種子？」, with thousands separators.
  - The list is in selection order (earliest tick first; Alex chose this) on a `surface-muted` box with 16px radius and 4px padding.
  - Rows are 8px 12px. The name is 13px/600 on one line with an ellipsis, as plain text. The size is 13px, right-aligned, tabular.
  - The first 5 rows show, then 「還有 N 個 ▾」 (a 36px text button, 600). Expanded, the list is at most 320px tall, scrolls itself and is virtualized with `@tanstack/react-virtual`. With 3,626 rows, the DOM holds fewer than 60.
- Rows whose files are gone:
  - 找不到檔案 (`heroKindOf === 'missing_files'`): the size slot reads 「找不到檔案」 (12px, `text-muted`).
  - 已整理 (`statusOf === 'archived'`): the size slot reads 「已整理」. These torrents are already organised, not an error.
  - Under the list, one `meta` `text-muted` line per kind present: 「其中 N 個找不到檔案，只會刪種子」 and 「其中 N 個已整理，只會刪種子」.
- 「連檔案一起刪」 is a 20px checkbox, ticked by default. The delete button is always the `delete` colour.
- Button text:
  - With files: 「刪除 3 個種子和檔案（301.2 GB）」.
  - Without files: 「只刪 3 個種子，檔案留著」.
  - With files when every torrent's files are already gone: 「刪除 3 個種子（檔案已經不在）」.
  - The size counts only torrents whose files exist (`selectionTotal`), with thousands separators and automatic TB through `format.ts`. A pure `src/lib` function computes it.
- Desktop dialog:
  - 512px wide, cancel on the left (outline), delete on the right, no ✕.
  - `Esc` or cancel means no delete. A press outside does not close it.
  - On close, the selection stays and focus returns to that bar's 刪除（含檔案）.
- Phone sheet:
  - Content height up to 90%. A long list grows the sheet.
  - The checkbox row is 44px with 15px text.
  - At the bottom there is one full-width 44px delete button and no cancel.
  - ✕ (`aria-label`「關閉，不刪」) or a drag-down means no delete. The selection stays.
- While the dialog is open, the list, count and size follow the selection. The selection is already pruned when maindata changes. When nothing is left, the dialog closes.
- Sending: the button reads 「刪除中…」.
- On success:
  - The dialog closes.
  - A plain 4 s toast reads 「已刪除 3 個種子和檔案（301.2 GB）」, or 「已刪除 3 個種子，檔案留著」 without files. There is no undo.
  - The selection clears and the bar slides out.
  - The hashes go into `pendingOps`, and `refreshMaindata()` runs. Local data is never edited.
- On failure with a non-connection code (`qbit_rejected`, `timeout`, `invalid_input`):
  - A failure toast with 重試 shows text from `error-text.ts`.
  - The dialog stays open, keeping its checkbox and expanded state.
  - 重試 resends the same hashes and the same `deleteFiles`.
  - Connection codes go only to the global handler. The dialog stays and the button becomes pressable again.
  - There is no partial-failure screen.
- The plain toast kind (4 s, no 重試) is added once in the toast store, the API and the renderer, and reused later.
- Layers:
  - The shell goes in `src/shared/ui/`.
  - Text and total functions go in `src/lib/`.
  - The feature goes in `src/features/selection/`.
  - The server function goes in `src/server/functions/`, with `z` imported from `#/shared/zod`.
  - The `Esc` layer is registered by the caller through `useEscapeLayer(..., 'dialog')`.
  - Keep the 4.1 and 4.2 decisions and the PR #40/#42 rules.

**Never:**
- No undo.
- No size ordering of the list.
- No partial-failure screen.
- No delete fade-out (4.4).
- No new dependency.
- No editing of local maindata.
- No real qBittorrent call anywhere in tests or CI.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Server accepts | 2 valid hashes, `deleteFiles: true` | one POST `/api/v2/torrents/delete` with `hashes=a\|b&deleteFiles=true`, batch all ok | none |
| No files | `deleteFiles: false` | form `deleteFiles=false` | none |
| Missing flag | `{ hashes }` | `invalid_input`, no qBittorrent call | none |
| Bad hash | `['all']` or a value containing `\|` | `invalid_input` | none |
| Not logged in | no session | `not_logged_in` | none |
| qBittorrent rejects | 400 / 409 / 500 | `qbit_rejected` | none |
| 3,626 hashes | 64-hex hashes | under `HASH_LIST_BODY_LIMIT`, accepted | none |
| Button text | 3 torrents, 301.2 GB, files on | 刪除 3 個種子和檔案（301.2 GB） | none |
| Button text | files off | 只刪 3 個種子，檔案留著 | none |
| Button text | 3,626 torrents, 22.1 TB | 刪除 3,626 個種子和檔案（22.1 TB） | none |
| Button text | all files gone, files on | 刪除 3 個種子（檔案已經不在） | none |
| Moving torrent | was `missingFiles` before the move | adds nothing to the dialog size (4.1 deferred) | none |
| Gone while open | other device deletes all selected | dialog closes | none |
| Failure | `qbit_rejected` | failure toast 「刪除失敗：qBittorrent 拒絕這個操作」 with 重試, dialog open, state kept | 重試 resends the same body |

</intent-contract>

## Code Map

- `src/server/functions/_define.ts` provides `serverPost`, `input` and `guard({ name, bodyLimit })`. The guard checks in this order: `not_logged_in`, then `invalid_input`, then the 30 s `timeout`.
- `src/server/functions/stop-torrents.ts` is the template to copy, 24 lines.
- `src/server/qbit/client.ts`:
  - The `QbitClient` interface is at lines 21 to 53.
  - `hashesForm()` at lines 87 to 91 joins hashes with `|`.
  - `stopTorrents` is at line 129.
  - Add `deleteTorrents(hashes, deleteFiles)`, and add `torrentsDelete` to `src/server/qbit/paths.ts`.
- `src/server/qbit/session.ts:255` `expectOk` turns a non-2xx response into `qbit_rejected`.
- `src/shared/torrent-ops.ts` has `torrentHashListSchema`, `allOk`, `uniqueHashes` and the batch types. `src/server/gate/body-limit.ts:24` has `HASH_LIST_BODY_LIMIT`.
- `src/server/functions/torrent-ops.test.ts` and `src/server/qbit/testing.ts:193`:
  - `fakeQbit` records `calls`. Add a delete route there.
  - The S3, S4 and S5 rows are the patterns to copy.
  - `discover.test.ts:73` lists the functions.
- `src/state/tracked-op.ts` has `sendOp`, `useOpsInFlight` and the `TrackedOp` callbacks. It shows the failure toast with 重試 itself.
- `src/state/pending-ops.ts` has `markPending` and `clearPending`. `src/state/maindata.ts:280` has `refreshMaindata`.
- Copy `src/features/detail/more-menu.tsx` `pauseOp` (lines 65 to 86) for the op pattern.
- Errors:
  - `src/lib/error-text.ts` has `OPERATION_FAILURE_CODES` and `pauseActionFailureText`. Copy the latter for a `刪除失敗：…` wrapper.
  - `src/lib/app-error.ts:36` has `CONNECTION_CODES`.
- Toast:
  - `src/lib/toast.ts` has `failure`, `dismissFor` and `setLift`.
  - `src/shared/toast-store.ts` has `ShownToast.retry` required, at line 15.
  - `src/shared/ui/toaster.tsx` always renders 重試, at lines 51 to 55.
  - Add a plain kind with a 4 s timer.
- Dialog:
  - `src/shared/ui/dialog.tsx` is non-modal (`modal={false}` at line 43) and uses `useModalSession` (`sheet-session.ts`). It has `returnFocus` (line 110), `showCloseButton` (line 101) and the toast-region exemption in `onInteractOutside` (lines 138 to 144).
  - The `animate-in`/`zoom-in-95` classes at line 151 do nothing. Add real `@utility` keyframes in `src/styles.css`, around lines 295 to 440.
  - Copy the `useEscapeLayer` usage from `src/features/header/shortcut-help.tsx:96`.
- Bottom sheet:
  - `src/shared/ui/bottom-sheet.tsx` takes `mode` `'fit'` (90% max, `sheet-snap.ts`) and has a ✕ (44px).
  - There is no lock prop and no footer slot yet.
  - A drag release calls `close()` at around line 264.
  - Callers use `useSheetLayer` (`src/state/sheet-layer.ts:13`), as in `src/features/header/sort-sheet.tsx`.
- `src/features/selection/selection-bar.tsx` has the phone delete at lines 124 to 134 and the desktop delete at lines 174 to 184, both `disabled`. Add refs for focus return.
- `src/state/selection.ts` provides `useSelectedHashes` (ordered) and `clearSelection`.
- `src/lib/selection-total.ts` has `selectionTotal` and `filesGone`. `src/lib/torrent-status.ts` has `heroKindOf` at line 239 and `statusOf` at line 275. `src/lib/format.ts` has `formatCount` and `formatSize`.
- Fake qBittorrent, `scripts/fake-qbit.mjs`:
  - `OP_PATHS` at lines 689 to 692 lists only stop and start. The op handler is at lines 940 to 952. `OPS_MODES` at line 149 is `normal|reject`.
  - Add a delete endpoint with a `removed` set that `currentTorrents` (line 683) filters, cleared on a data reset.
  - Add an `ops=slow` mode that delays ops past 10 s so the 「還在等」 state shows.
- `e2e/fixtures.ts` has `Modes` (line 158), `opCalls` (line 199) and `setModes` (line 229).
- Specs and mockups:
  - UX `DESIGN.md` has the dialog at lines 320 to 337 and 653 to 660, and delete-confirm at lines 671 to 673.
  - `EXPERIENCE.md` has delete-confirm at lines 175 to 189, 送出中 at line 348, the failure at line 351 and the success at lines 366 to 370.
  - Mockups `S07-delete-desktop.dc.html` and `S07-delete-phone.dc.html`, plus their `SD-` dark versions. Copy their CSS numbers.

## Tasks & Acceptance

**Execution:**
- Server side:
  - `src/shared/torrent-ops.ts`: add `deleteTorrentsInputSchema`.
  - `src/server/qbit/paths.ts` and `client.ts`: add `deleteTorrents`.
  - `src/server/functions/delete-torrents.ts` (new): the server function.
  - `src/server/qbit/testing.ts`: add the delete route to the fake.
  - `torrent-ops.test.ts` and `discover.test.ts`: cover every server matrix row, only against fake responses.
- `src/lib/delete-confirm.ts` (+ test). Write pure functions for the button text, the title, the success toast text, the failure text and the gone-files counts per kind. Test every text row of the matrix, plus the moving torrent.
- Toast:
  - `src/shared/toast-store.ts`, `src/lib/toast.ts`, `src/shared/ui/toaster.tsx` (+ tests): add a plain toast kind, 4 s, with no 重試, reusing the same region and card.
  - Keep the failure toast and `setLift` unchanged.
- `src/shared/ui/bottom-sheet.tsx` (+ test): add an optional pinned `footer` and a `locked` prop. While locked, the scrim, the ✕ and a drag never close the sheet, and a drag snaps back. Existing callers do not change.
- `src/shared/ui/dialog.tsx`, `src/styles.css` (+ test): give the dialog real open keyframes (0.2 s scale from .95 plus a fade, and a scrim fade, none under reduced motion). Add a way to block outside-press closing and to drop the ✕. Keep the shortcut-help dialog working.
- `src/shared/ui/confirm-shell.tsx` (new, + dom test): the responsive shell (desktop dialog or phone sheet). Props cover the title, the body, the desktop footer (cancel plus primary), the phone primary, `sending`, `returnFocus`, `onCancel` and `role="alertdialog"`. It owns the close lock while sending and the 10 s 「還在等 NAS 回應」 line.
- `src/features/selection/delete-confirm.tsx` (new, + dom test):
  - The content: the list, the expand control, the virtualized expanded list, the gone notes and the checkbox.
  - The op: `sendOp` with `markPending` on send, and on success close, clear the selection, show the plain toast and call `refreshMaindata`. On failure `clearPending`. In flight comes from `useOpsInFlight`.
  - It closes when the selection empties.
  - It registers the `Esc` layer as `'dialog'`.
- `src/features/selection/selection-bar.tsx` (+ test): enable 刪除（含檔案） in both layouts, open the confirm, and return focus to that button.
- `scripts/fake-qbit.mjs`, `e2e/fixtures.ts`: the delete endpoint (logs `{ op: 'delete', hashes, deleteFiles }`, removes the hashes from later maindata) and `ops=slow`.
- `e2e/delete.spec.ts` (new):
  - Desktop and phone delete with and without files. Check `opCalls` and that the rows disappear after the refresh.
  - Expand with many rows: the DOM holds fewer than 60 rows.
  - The 找不到檔案 and 已整理 notes.
  - `Esc`, cancel, ✕ and a drag mean no delete and the selection stays. A press outside does nothing on desktop.
  - Sending: closing is blocked, and 「還在等 NAS 回應」 appears after 10 s (`ops=slow`).
  - `ops=reject`: the failure toast appears and 重試 resends the same body.
  - The dialog closes when another device's delete empties the selection.
  - Screenshots in `screenshots/4-3/`, desktop 1440 and phone 390, light and dark: 3 rows, expanded, with 找不到檔案, files unticked, 刪除中, 還在等 NAS 回應, and the failure toast.

**Acceptance Criteria:**
- Given the desktop dialog open, when Alex presses outside it, then nothing happens. When he presses `Esc` or 取消, then it closes with no request, the selection stays, and focus is on 刪除（含檔案）.
- Given a send in flight, when 10 s pass, then 「還在等 NAS 回應」 shows. Every close path is ignored until the request ends.
- Given 3,626 selected, when Alex expands the list, then fewer than 60 rows are in the DOM. Sending puts one request under the 400 KB limit.

## Spec Change Log

## Review Triage Log

### 2026-11-20: Review pass
- verdicts: 26 findings. high 0, medium 5, low 20, false 0, maybe-false 1
- findings:
  - `[low]` `[patch]` (intent) The 4.1 deferred moving-torrent check is covered only at the lib layer, not where the dialog wires `stateBeforeMove`. Action: a dom test with a moving fixture.
  - `[low]` `[reject]` (intent) `pendingOps` is marked at send, not at success. This is the 2.6 pause pattern (cleared on failure), and AD-7 is still met.
  - `[maybe-false]` `[defer]` (blind) Gone rows promise 「只會刪種子」, but the batch sends `deleteFiles=true`. Whether qBittorrent's missingFiles can be partial is unverified. Deferred as medium (unverified).
  - `[medium]` `[patch]` (blind) A late 重試 success clears an unrelated new selection. Action: prune only the sent hashes.
  - `[medium]` `[patch]` (blind) `markPendingAll` arms per-hash timers, which means per-hash store updates. Grouped with the edge O(n²) row. Action: one batch timer and a batched prune.
  - `[low]` `[patch]` (blind) Rows are computed while the dialog is closed. Action: skip the computation when not open.
  - `[low]` `[patch]` (blind) The expanded list loses focus and can steal it back when the count drops to 5 or fewer. Action: reset `expanded` and move focus to a defined element.
  - `[low]` `[patch]` (blind) The scroll box `aria-label` has no role. Action: `role="group"`.
  - `[low]` `[patch]` (blind) The alertdialog has no description. Action: `aria-describedby` points at the body.
  - `[low]` `[patch]` (blind) The 還在等 status mounts together with its text. Action: the status element is always mounted.
  - `[low]` `[patch]` (blind) A double send is possible in the same tick. Action: a ref guard.
  - `[low]` `[reject]` (blind) The success toast states as fact what a 200 cannot confirm. The text is the spec's exact wording. AD-7 keeps the rows until the refresh shows them gone.
  - `[low]` `[patch]` (blind) Fake timers can leak in a test. Action: `try/finally`.
  - `[low]` `[reject]` (blind) e2e gaps (phone all-gone, focus after delete) and a comment that runs too wide. Both are covered in the DOM tests, and the comment is cosmetic.
  - `[low]` `[patch]` (verification-gap) Esc while sending on phone is untested. Action: a phone dom test.
  - `[low]` `[patch]` (verification-gap) The content kept during the slide-out is untested. Action: a phone dom test with motion on.
  - `[medium]` `[patch]` (verification-gap other) A late 重試 clears the new selection. Grouped with the blind 重試 row.
  - `[medium]` `[patch]` (edge) A 重試 success clears the new selection and closes a newly opened confirm. Grouped with the blind 重試 row.
  - `[low]` `[patch]` (edge) An in-flight retry for other hashes makes a new confirm look as if it is sending. Action: `sending` is scoped to overlapping hashes.
  - `[low]` `[patch]` (edge) Empty rows with hashes selected send `[]`. Action: no send without rows.
  - `[low]` `[patch]` (edge) Expanded focus loss. Grouped with the blind expanded-list row.
  - `[medium]` `[patch]` (edge) Thousands of pending store updates after a big delete. Grouped with the blind `markPendingAll` row.
  - `[low]` `[patch]` (edge) The fake's slow delete leaks across a data reset. Action: an epoch check.
  - `[low]` `[reject]` (edge) An e2e helper loop can spin until the test timeout. It is test-only and still fails at the timeout.
  - `[low]` `[patch]` (edge) The selection emptying mid-send closes the locked dialog. Action: no auto-close while this dialog's delete is in flight.
  - `[low]` `[reject]` (edge) The plain toast replaces a failure toast. Showing one toast at a time, the newest winning, is the 2.6 design.

## Design Notes

Claude 代決 (Alex can veto):
- 已整理 rows read 「已整理」 in the size slot and get their own note, 「其中 N 個已整理，只會刪種子」. They are already organised (project rule), so labelling them 「找不到檔案」 would read as an error. Their size is excluded, as in 4.1.
- When every torrent's files are gone and 「連檔案一起刪」 is ticked, the button reads 「刪除 3 個種子（檔案已經不在）」. 「刪除 3 個種子和檔案（0 B）」 would promise files that aren't there.
- The failure toast reads 「刪除失敗：<reason>」, following 2.6's pattern.
- The plain toast lasts 4 s, the spine's "plain text" kind.
- 「還在等」 uses a fake `ops=slow` mode, used only by e2e and screenshots.
- The dialog open motion also applies to the 3.7 shortcuts dialog. It is the one shared dialog, and its animation classes never worked before.

AD-11 docs:
- TanStack Start server functions (1.169.5): https://tanstack.com/start/v0/docs/framework/react/server-functions
- qBittorrent WebUI API `torrents/delete`: https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-5.0)#delete-torrents
- zod 4 `strictObject` / `boolean`: https://zod.dev/api
- Radix Dialog (radix-ui 1.8.1), `onInteractOutside` / `onEscapeKeyDown`: https://www.radix-ui.com/primitives/docs/components/dialog
- TanStack Virtual 3.14.26: https://tanstack.com/virtual/v3/docs/api/virtualizer
- ARIA alertdialog: https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/alertdialog_role

## Verification

**Commands:**
- `source ~/.nvm/nvm.sh && nvm use && npm run lint && npm run typecheck`: expected to pass.
- `source ~/.nvm/nvm.sh && nvm use && npm test`: all pass, including the server, lib, toast, sheet, dialog, shell and feature tests.
- `source ~/.nvm/nvm.sh && nvm use && npm run build && caffeinate -dimsu npx playwright test`: all pass.
- `bash .claude/skills/next-story/check.sh`: every line ok.

## Auto Run Result

Status: done (first pass)

**Summary.**
- `deleteTorrents` is a POST built with the factory. It takes `{ hashes, deleteFiles }`, with `deleteFiles` required and the 400 KB body limit.
- A shared `ConfirmShell` covers both widths. On desktop it is a non-modal Radix dialog with `role="alertdialog"`, no ✕ and no outside close. On phone it is the bottom sheet with a pinned footer and a lock. It owns the sending lock and the 10 s 「還在等 NAS 回應」 line.
- The delete confirm opens from both bar layouts. The list follows tick order and is virtualized when expanded. Notes cover 找不到檔案 and 已整理. 「連檔案一起刪」 is ticked by default, and a lib function builds the button text.
- On success: a plain 4 s toast, only the sent hashes leave the selection, they are batch-marked in `pendingOps`, and `refreshMaindata` runs. On failure: a toast with 重試, and the dialog stays.
- The fake qBittorrent gains delete, `ops=slow` and "another device" removal.

**Files.**
- Server: `src/server/functions/delete-torrents.ts` (new), `src/server/qbit/client.ts`, `paths.ts`, `testing.ts`, `src/shared/torrent-ops.ts`.
- `src/lib/delete-confirm.ts` (new, the texts and rows), `selection-total.ts` (`goneKindOf`) and `error-text.ts` (`deleteFailureText`).
- `src/shared/toast-store.ts`, `src/lib/toast.ts`, `src/shared/ui/toaster.tsx`: the plain toast.
- `src/shared/ui/bottom-sheet.tsx`: `footer`, `locked`, `role`, `closeLabel`, `describedBy`.
- `src/shared/ui/dialog.tsx` and `src/styles.css`: the pop and fade keyframes, `closeOnOutsidePress`.
- `src/shared/ui/confirm-shell.tsx` (new).
- `src/features/selection/delete-confirm.tsx` (new) and `selection-bar.tsx`.
- `src/state/pending-ops.ts`: batch mark and clear, one timer per batch.
- `scripts/fake-qbit.mjs` and `e2e/fixtures.ts`.
- `e2e/delete.spec.ts` (new) and `e2e/selection.spec.ts`.
- 28 screenshots in `screenshots/4-3/`.

**Review findings: 26.**
- Patched: 18 findings in 12 entries. 2 entries are medium: the late 重試 clearing a new selection, and per-hash pending updates after a big delete. The other 10 entries are low.
- Deferred: 1, medium (unverified). Gone rows say 「只會刪種子」, but the batch sends `deleteFiles=true`. It depends on whether qBittorrent's missingFiles can be partial.
- Rejected: 7, each with its reason in the triage log.
- Found during the screenshot check, after review: the global `[aria-disabled]` 50% rule dimmed the sending primary. It now stays at full opacity (`data-[sending]:opacity-100`), and the 4-3 screenshots were regenerated.

**Follow-up review: recommended (true).** Two medium entries were patched, so these risks still need a review:
- The selection-scoped `sending` and the self-close when the selection empties.
- The batch timers in `pendingOps`.

**Verification, after all patches.**
- lint and typecheck are clean.
- vitest: 136 files and 3314 tests pass.
- The build passes.
- Playwright: a full run with `caffeinate` passed 143 in 18.1 min.
- check.sh: every line ok.
