---
title: 'Story 4.2: phone selection mode'
type: 'feature'
created: '2026-11-19'
status: 'done'
baseline_revision: 'bafe0bb875d88f61068b990940f6198be38004e2'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-1-desktop-checkbox-selection-bar.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** On a phone (under 1024px) Alex cannot select torrents. Story 4.1 built desktop selection only. It also clears the selection whenever the viewport drops below 1024px, because the phone had no way to leave selection mode.

**Approach:**
- Add a long press (0.5 s, cancelled by more than 10px of movement) on phone list rows and board cards. It ticks the pressed torrent and enters selection mode.
- Selection mode is breakpoint-agnostic: it is on whenever anything is selected.
- On phone, while in selection mode:
  - Rows shift 28px right using transform only, and checkboxes appear.
  - A tap toggles instead of opening the bottom sheet.
  - A two-row phone selection bar slides up.
- Remove 4.1's clear-below-1024px. The selection survives crossing the breakpoint, and each side shows its own checkboxes and bar.

## Boundaries & Constraints

**Always:**
- The timing and movement rule is a pure `src/lib` function, tested with vitest: fire at 500 ms, cancel when the pointer moves more than 10px (Euclidean) from the start before then.
- The pointer handling is hand-written with pointer events (AR-7). There is no gesture library.
- A long press cancels on any of these: `pointerup` or `pointercancel` before 500 ms, lost pointer capture, or a scroll of the containing scroller.
- A long press never brings up the system text-selection or image callout. Rows and cards below 1024px use `-webkit-touch-callout: none` and `user-select: none`, and `contextmenu` is prevented while a press is pending or has fired.
- When the press fires:
  - The torrent is added to the selection.
  - `navigator.vibrate` is called once with a short pulse, only if it exists, and never throws.
  - The `click` that follows the release is swallowed, so it neither opens the sheet nor toggles again.
- Long press is active only below 1024px and only while nothing is selected. While selecting, a press is an ordinary tap.
- On phone while selecting:
  - A tap on a row or card calls `toggleSelected` instead of `setHash`. The bottom sheet never opens from that tap.
  - Swiping between board status tabs still works, and ticks survive it.
  - The list stays frozen (4.1's `selection` freeze reason).
- Entering and leaving selection mode (on phone):
  - On entry, every list row's content and its checkbox shift 28px right in 0.2 s with `cubic-bezier(0.2,0.8,0.2,1)`, using `transform` only.
  - On leave, they shift back the same way.
  - Only rows mounted at the moment the mode changes animate. Rows mounted later by virtualization appear in their final place.
  - There is no horizontal scroll at 390px. The row clips its own overflow.
- Leaving happens on 取消, on unticking the last one, or on a category or search change (4.1 scope). All three hide the checkboxes, shift rows back and slide the bar down.
- Phone selection bar:
  - Fixed `left/right: 16px` and `bottom: 16px` plus `env(safe-area-inset-bottom)`, `rounded-panel` (22px), `shadow-float`, the `selection-bar` colours, padding 8/12/12/18px, and an 8px gap between the two rows.
  - Row 1: 「已選 N 個」 (700) and 「共 X GB」 (12px, 70%) on the left, 取消 on the right (44px tall, at least 44px wide, 600).
  - Row 2: a two-column grid with an 8px gap. 改路徑 (1px outline pill, native `disabled`) and 刪除（含檔案） (`delete`, 700, native `disabled`), each 44px tall.
  - Same texts and same `role="region"` / `role="status"` with the sr-only 「，」 as the desktop bar.
  - It slides with a transform (0.3 s, the same curve), and not at all under reduced motion.
- With `prefers-reduced-motion: reduce`, neither the shift nor the bar slide plays. Both go straight to their end state.
- Keep these 4.1 decisions unchanged:
  - The checkbox is a sibling of the row or card button.
  - Hidden checkboxes have `pointer-events-none`.
  - Bar visibility comes from `hashes.length`.
  - `scrollPaddingEnd` while selecting (desktop).
  - `toast.setLift` is desktop-only.
- Keep these from earlier PRs:
  - PR #42: `use-arrow-stepping.ts` and the `[role="menu"]` / `inMenus` check.
  - PR #40: `followHash` / `setHash`.
  - `src/state` never imports `src/shared/ui`.

**Never:**
- No select all.
- No new dependency.
- No haptics beyond `navigator.vibrate`.
- Do not wire delete or 改路徑. Delete is 4.3 and 改路徑 is Epic 5.
- No long press on desktop (1024px and up).
- Do not change desktop click behaviour while selecting: on desktop a row click still opens the detail.
- Never write to the real qBittorrent (AD-15).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Long press | phone, nothing selected, hold a row 500 ms still | row ticked, mode on, bar up, one vibrate, release opens nothing | `vibrate` missing: no call, no error |
| Scroll, not press | hold and move 11px within 500 ms | nothing selected, the list scrolls | none |
| Small wobble | hold, move 6px, reach 500 ms | fires (ticks) | none |
| Short tap | press and release at 200 ms, nothing selected | opens the bottom sheet as before | none |
| Tap while selecting | phone, `[A]`, tap B | `[A, B]`, no sheet | none |
| Untick last | phone, `[A]`, tap A | `[]`, mode off, rows shift back, bar down | none |
| Board swipe | phone board, `[A]`, swipe to next tab | still `[A]`, bar still up | none |
| Cross breakpoint | desktop `[A, B]`, resize to 390px | still `[A, B]`. Phone bar and phone checkboxes show, rows already shifted, no animation | none |
| Reduced motion | enter mode | rows and bar at the end state with no transition | none |

</intent-contract>

## Code Map

- `src/routes/_authed/index.tsx`:
  - Around lines 40 to 42 is 4.1's `useEffect` that clears the selection when `!desktop`. Remove it.
  - Line 50 mounts `ListDetailSheet` when `!desktop`, and line 122 mounts `BoardDetailSheet`.
  - `{desktop && <SelectionBar/>}` should become one bar that renders the desktop or the phone layout.
  - `src/routes/home-selection.dom.test.tsx` asserts the clear today. Flip it to assert that the selection survives.
- `src/state/selection.ts` has `toggleSelected`, `useSelectedHashes` and `useSelectionUpkeep`. Mode equals `hashes.length > 0`. Add whatever small piece the "animate only rows mounted at the mode change" rule needs, for example the time of the last mode change.
- `src/state/order-freeze.ts`: the `selection` reason already freezes the list. Touch freeze is wired at `torrent-list.tsx` lines 277 to 296 with passive touch listeners.
- `src/features/list/torrent-row.tsx`:
  - `RowContent` (lines 66 to 124) is one `<button onClick={onOpen}>`, `px-2.5 py-[9px] gap-2` below lg.
  - The reserved slot at line 93 is `hidden … lg:block`, so a phone row has no slot.
- `src/features/list/torrent-list.tsx`:
  - `TorrentRows` passes `onOpen={setHash}` at line 392.
  - The `role="listitem"` wrapper is at lines 367 to 378, and the desktop checkbox at line 379 renders when `props && desktop`, using `ROW_CHECKBOX_CLASS`.
  - The scroller is `overflow-y-auto`, so anything wider than the row creates a horizontal scroll. The row wrapper must clip, for example with `overflow-hidden`.
- `src/features/board/status-tabs.tsx`:
  - Panels are `CardList` at lines 282 to 300 with `paddingStart={0}`, `paddingEnd={4}`, `touch-pan-y` and no `selectable`.
  - Swipe runs through pointer events on `[data-slot="board-swipe"]` (lines 155 to 264). `board-swipe.ts:16` sets `SWIPE_SLOP = 10`.
  - A vertical drag gets `pointercancel` from the browser.
- `src/features/board/card-list.tsx`:
  - `CARD_CHECKBOX_CLASS` is at line 65, positioned at -6/-6.
  - `onOpen={setHash}` is at line 373.
  - Phone panels need room so the -6px checkbox is not clipped: about 10px of start padding and about 8px of side padding.
- `src/features/selection/selection-bar.tsx`:
  - The desktop pill (`BAR_CLASS`, z-40).
  - Hidden state: kept numbers, `inert`, `aria-hidden`.
  - Calls `toast.setLift`.
- `src/shared/ui/bottom-sheet.tsx` is z-50, above the bar. `sheet-session.ts:46` makes the other body children inert. The phone toaster sits at the top (`toaster.tsx:70`), so the bar does not conflict with it.
- Bottom room on phone: there is no phone bottom token, and the mockup uses 140px while the bar shows. Add it only while selecting, on the list scroller and on the phone board panels' `paddingEnd`. It only extends the scroll, so nothing visible moves.
- Specs and mockups:
  - UX `DESIGN.md` line 628 has the phone selection-bar, line 620 the 28px shift, and line 618 the checkbox.
  - `EXPERIENCE.md` lines 407 to 410 describe phone selection mode, and lines 426 to 431 the motion rules.
  - Mockups: `mockups/S07-delete-phone.dc.html` has the bar CSS (`left:16px; right:16px; bottom:16px; gap:8px; border-radius:22px; padding:8px 12px 12px 18px`, row 2 a grid with an 8px gap). `SD-delete-phone` is the dark version.
- `src/shared/ui/breakpoint.ts` has `useIsDesktop` and `DESKTOP_QUERY`. Only routes and features may import it, so `src/state` stays breakpoint-agnostic.
- e2e:
  - `e2e/selection.spec.ts` line 337 asserts "below 1024px: no checkbox and no selection bar". Rewrite it.
  - Touch tests use `test.use({ hasTouch: true })` plus CDP `Input.dispatchTouchEvent`, through the `touchDrag` helpers at `e2e/board.spec.ts:448` and `e2e/smoke.spec.ts:637`.
  - A long press is touchStart, a wait of about 600 ms, then touchEnd.

## Tasks & Acceptance

**Execution:**
- `src/lib/long-press.ts` (+ test). Write a pure decision function, for example `longPressStep({ elapsedMs, dx, dy }) → 'wait' | 'fire' | 'cancel'`, with exported `LONG_PRESS_MS = 500` and `LONG_PRESS_SLOP_PX = 10`. Test the boundaries: 499 and 500 ms, 10 and 10.01 px, and diagonal movement.
- `src/state/long-press.ts` (+ dom test). Write a `useLongPress({ enabled, onFire })` hook that returns pointer handlers for a target element.
  - It starts on a primary `pointerdown` and arms a 500 ms timer.
  - It decides with the lib function on `pointermove`.
  - It cancels on `pointerup`, `pointercancel`, `lostpointercapture` or a `scroll` of the nearest scroller, and on unmount.
  - When it fires, it calls `onFire`, calls `navigator.vibrate?.(…)` inside a try, and swallows the next `click` from that press in the capture phase.
  - It prevents `contextmenu` while a press is pending or has fired.
  - Test it with fake timers and the matrix rows.
- `src/features/list/torrent-row.tsx`, `torrent-list.tsx` (+ dom test).
  - Below lg, rows get the long-press handlers (enabled only while nothing is selected) and no-callout / no-select styles.
  - While selecting on phone, `onOpen` toggles instead of `setHash`.
  - While selecting, render the phone checkbox (the shared `Checkbox`, 20px, `aria-label` 「選取 <name>」) at the row's left. The row content takes 28px more left room, both slide in from -28px using transform only, and the wrapper clips its overflow.
  - Animate only when the mode changed within the last 200 ms. Use no transition under reduced motion.
  - The selected row has `bg-selection-row`.
  - Desktop behaviour from 4.1 stays unchanged.
- `src/features/board/card-list.tsx`, `status-tabs.tsx` (+ dom test).
  - Phone panels become `selectable`, with the phone checkbox showing only while selecting (no hover on phone), the long press, the tap toggling while selecting, and enough padding that the -6px checkbox is not clipped.
  - Swiping must still switch tabs. A swipe cancels a pending long press.
  - While selecting, the phone panels get 140px of end room.
- `src/features/selection/selection-bar.tsx` (+ dom test).
  - Add the phone layout described in Boundaries, chosen by a `desktop` prop.
  - Call `toast.setLift` only when visible and on desktop.
  - Same visibility, kept numbers and slide-out behaviour as 4.1.
- `src/routes/_authed/index.tsx`, `src/routes/home-selection.dom.test.tsx`. Remove the clear-below-1024px. Render the bar for both widths. Assert that the selection survives crossing the breakpoint in both directions.
- `src/features/list/list-states.tsx`, or the scroller in `torrent-list.tsx`. Add 140px of bottom room on phone while selecting.
- `e2e/selection.spec.ts`. Use a phone block with `hasTouch` at 390x844.
  - A long press on a row enters the mode: the row is ticked, the bar is up and no sheet opens.
  - A drag of more than 10px within 500 ms only scrolls.
  - A tap toggles without opening the sheet.
  - Unticking the last one, or pressing 取消, leaves the mode.
  - A long press on a board card works, and a swipe to the next tab keeps the selection.
  - There is no horizontal scroll (`scrollWidth <= clientWidth` on the scroller and the document).
  - Crossing from desktop to phone keeps the selection.
  - Replace the old "below 1024px: no checkbox and no selection bar" assertion with "no checkbox until a long press".
  - Screenshots in `screenshots/4-2/` at 390px, light and dark: the list while selecting and the board while selecting.

**Acceptance Criteria:**
- Given a phone list with nothing selected, when Alex scrolls with a finger, then no row gets selected and no system callout appears.
- Given selection mode on phone, when a sheet is open (for example the sort sheet), then the sheet covers the bar and the selection is unchanged when it closes.
- Given 4.1's desktop selection, when the viewport is 1024px or wider, then every 4.1 behaviour and test still holds, apart from the removed clear-below-1024px.

## Spec Change Log

## Review Triage Log

### 2026-11-19: Review pass
- verdicts: 23 findings. high 0, medium 0, low 23, false 0, maybe-false 0
- findings:
  - `[low]` `[reject]` (intent) The 28px is a padding change that applies at once, with a transform-only slide hiding it. This is not strict "nothing but transform". It is the defensible reading: only the motion is transform, and the single relayout is not animated. A strict lasting translate would push row content past the clipped edge. The PR lists it as Claude 代決.
  - `[low]` `[reject]` (intent) The timer fire path does not call `longPressStep`. The thresholds are the lib constants, and the step function decides every move. The fire-at-500 ms rule is the same constant.
  - `[low]` `[patch]` (verification-gap) No test checks that desktop board cards do not long-press. Action: a desktop card hold test.
  - `[low]` `[patch]` (verification-gap) The phone board corner checkbox is never clicked in tests. Action: a toggle test.
  - `[low]` `[reject]` (verification-gap other) The e2e drag test releases before 500 ms, so it cannot catch a broken slop rule. The hook test covers 11px within 500 ms.
  - `[low]` `[patch]` (edge) After a fire, a swallowed click can linger when the target loses capture. Action: `lostpointercapture` starts the swallow end-timer.
  - `[low]` `[reject]` (edge) A late timer plus a move past the slop after 500 ms still fires. Movement after 500 ms legitimately fires, and a single event cannot tell when the movement happened.
  - `[low]` `[patch]` (edge) `overflow-x-clip` cuts off the focus outline on phone rows. Action: a clip margin for the outline.
  - `[low]` `[reject]` (edge) The leaving checkbox flips to unticked while it slides away. This is a cosmetic 0.2 s effect, and the fix needs the last ticked set to be kept.
  - `[low]` `[reject]` (edge) The window capture scroll listener cancels on any scroll. On this page only the list or panel scrolls under a finger. A press during an unrelated scroll is not a real case.
  - `[low]` `[reject]` (edge) Padding is not transform-only. Same as the first intent row.
  - `[low]` `[reject]` (blind) Rows mounted during the 200 ms window play the slide. This is cosmetic and limited to that window.
  - `[low]` `[patch]` (blind) The clear timer starts in an effect, so it can cut the keyframes short. Action: a margin past the animation.
  - `[low]` `[reject]` (blind) Padding is not transform-only. Same as the first intent row.
  - `[low]` `[reject]` (blind) The 140px room ignores the safe area. The inset is 0 today, because the viewport has no `viewport-fit=cover`.
  - `[low]` `[patch]` (blind) The swallow outlives a release on another element. Grouped with the edge `lostpointercapture` row.
  - `[low]` `[reject]` (blind) The phone board's resting padding changed. This is a logged spec Claude 代決, the same trade 4.1 made on desktop.
  - `[low]` `[patch]` (blind) The phone row clip cuts off the focus ring. Grouped with the edge clip row.
  - `[low]` `[reject]` (blind) Below 1024px there is no way into selection without the gesture, which leaves out keyboard and screen-reader users. The phone design is touch-first, and a narrow desktop window can still use a mouse long press. Noted as a known limit.
  - `[low]` `[reject]` (blind) The phone bar duplicates the desktop buttons. This is developer-only. 4.3 must wire delete in both layouts, which is noted for 4.3.
  - `[low]` `[reject]` (blind) The board swipe-cancel test goes through the slop path. The capture path is tested in the hook test.
  - `[low]` `[reject]` (blind) `useSelectionShift` runs on desktop. The cost is negligible: one extra render on the first tick and on the last untick.
  - `[low]` `[reject]` (blind) Crossing to phone with the detail open is untested. The sheet covers the bar, and closing it returns to selection mode. Nothing is lost.

## Design Notes

Claude 代決 (Alex can veto):
- Selection mode means "anything selected", shared by desktop and phone. Crossing the breakpoint keeps the selection and switches the checkbox and bar layout without animating.
- While selecting, a long press is an ordinary tap. A long press only enters the mode, it never toggles inside it.
- The long press also works with a mouse in a narrow desktop window, so it is testable without touch. Pen and touch behave the same.
- The vibrate pulse is short, about 10 ms.
- The phone bar slides in 0.3 s and the row shift takes 0.2 s (as the spec says). Both use the repo curve.
- The phone bottom room of 140px (the mockup value) is added only while selecting. On desktop, 110px is always there, as in 4.1.
- Phone board panels get permanent padding so the card checkbox is not clipped, the same trade 4.1 made on desktop.
- 4.2 adds no long-press visual feedback before 500 ms. The spec's feedback is the tick at the moment the press fires.

AD-11 docs to check:
- Pointer events and capture: https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events and https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture
- `navigator.vibrate`: https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate
- `-webkit-touch-callout`: https://developer.mozilla.org/en-US/docs/Web/CSS/-webkit-touch-callout
- TanStack Virtual 3.14.26: https://tanstack.com/virtual/v3/docs/api/virtualizer
- Tailwind 4.3 `motion-reduce` and translate: https://tailwindcss.com/docs/translate

## Verification

**Commands:**
- `source ~/.nvm/nvm.sh && nvm use && npm run lint && npm run typecheck`: expected to pass.
- `source ~/.nvm/nvm.sh && nvm use && npm test`: all pass.
- `source ~/.nvm/nvm.sh && nvm use && npm run build && caffeinate -dimsu npx playwright test`: all pass.
- `bash .claude/skills/next-story/check.sh`: every line ok.

## Auto Run Result

Status: done

**Summary.** Below 1024px, holding a list row or board card for 500 ms enters selection mode. The press is cancelled by more than 10px of movement, a release, a cancel, a lost capture or a scroll. The pressed torrent is ticked, the phone vibrates once if it can, and the click that follows is swallowed. On phone while selecting, these happen:
- A tap toggles instead of opening the sheet.
- Rows shift 28px right, and checkboxes appear. The slide is transform-only and lasts 0.2 s. Only rows mounted at the mode change animate.
- Board cards show a corner checkbox.
- A two-row phone bar slides up.

Swiping between board tabs keeps the selection. 4.1's clear-below-1024px is removed, so the selection survives crossing the breakpoint, and each side shows its own checkboxes and bar without animating.

**Files**
- `src/lib/long-press.ts` (+ test): the pure 500 ms / 10px decision.
- `src/state/long-press.ts` (+ test): the hand-written pointer hook. It cancels in every listed case, vibrates, swallows the click and blocks contextmenu.
- `src/state/selection.ts` (+ test): `useSelecting` and `useSelectionShift`, which clears after 250 ms to leave margin past the 200 ms animation.
- `src/features/list/torrent-row.tsx`, `torrent-list.tsx`: the phone long press, tap-to-toggle, the phone checkbox, the 28px shift with the row clip (plus an outline margin) and 140px of bottom room while selecting.
- `src/features/board/card-list.tsx`, `status-tabs.tsx`, `board-card.tsx`: phone selectable panels, the corner checkbox, the long press, permanent 10px / 8px panel padding and 140px of end room while selecting.
- `src/features/selection/selection-bar.tsx`: the phone two-row layout behind a `desktop` prop. The toast lift is desktop-only.
- `src/routes/_authed/index.tsx` (+ test): the clear-below-1024px is removed and the bar renders at both widths.
- `src/styles.css` (+ test): the shift keyframes, turned off under reduced motion.
- `e2e/selection.spec.ts`: the phone block with touch, plus 4 screenshots in `screenshots/4-2/`.

**Review findings.** 23 in total, all low.
- Patched: 5.
  - The swallow ends after a lost capture.
  - The focus outline margin on phone rows.
  - The shift-clear margin.
  - A desktop card no-long-press test.
  - A phone card checkbox toggle test.
- Deferred: none.
- Rejected: 18, each with its reason in the triage log. Notes carried into 4.3:
  - Delete must be wired in both bar layouts.
  - There is no non-gesture entry to selection below 1024px.

**Follow-up review: not recommended (false).** No medium or high finding was patched.

**Verification**
- lint and typecheck are clean.
- vitest: 132 files and 3223 tests pass.
- The build passes.
- Playwright: a full run with `caffeinate` passed 130 in 14.7 min, after the patches. The run before the patches also passed 130.
- check.sh: every line ok.

**Residual risks**
- The iOS callout, the vibration and a real finger's scroll and long-press feel cannot be tested in Chromium. Alex checks them on a phone.
- The padding change on entering the mode is a single relayout, with a transform hiding it.
- The phone board panels' resting padding changed.
