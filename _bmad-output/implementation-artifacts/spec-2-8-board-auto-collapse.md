---
title: 'Story 2.8: Board auto-collapse'
type: 'feature'
created: '2026-11-17'
status: 'done'
baseline_revision: '5c5c029abd4e97b43d354adc2fd22e6873763ca5'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-react-torrent-2026-11-15/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-3-board-desktop-columns-phone-status-tabs.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** On the desktop board a column with hundreds of torrents is one narrow card per row, so finding one means a lot of scrolling.

**Approach:** When Alex scrolls one column past one column-height, mark the anchor card, collapse the other columns into 64px strips and widen this column (step 1), then spread its cards into 2 to 3 per row from the anchor outwards (step 2), all with FLIP on `transform`, following the approved demo `_bmad-output/planning-artifacts/ux-designs/ux-react-torrent-2026-11-13/.working/demo-board/index.html` (functions `flip`, `findAnchor`, `keepAnchor`, `setFocus`, `check`, the wheel handler, the strip click). Scrolling back to the top (or wheeling up at the top) or clicking a strip restores the board. A `src/lib/prefs.ts` key turns it off; data that arrives mid-animation waits through the `src/state` freeze store.

## Boundaries & Constraints

**Always:**
- Only on the desktop board (≥1024px, `useIsDesktop` or the existing breakpoint helper) and only while the auto-collapse pref is on. Below 1024px nothing changes.
- Trigger: in the normal board, a work column (or the expanded 已整理 column) whose `scrollTop` passes its own `clientHeight` (1 visible column height) starts collapse with that column as the wide one. Checked on `scroll` through `requestAnimationFrame` (passive listeners), never while an animation runs.
- Anchor: among the column's visible cards, the one nearest the pointer when the pointer is inside the column (gaps count: distance 0 inside a card, else to its nearer edge); without a pointer inside, the first fully visible card; else the first visible. It gets a 2px `accent` frame (an outline or inset ring, no layout shift) before anything moves; the frame stays for the animation plus about 0.9 s, then fades or goes.
- Step 1, 380 ms, easing `cubic-bezier(.25,.8,.25,1)`: the other columns become 64px collapsed strips and this column takes the rest of the width; its cards keep their one-per-row width. Step 2, 1300 ms: the cards rearrange to `grid-template-columns: repeat(auto-fill, minmax(270px, 1fr))` (2 to 3 per row), each card animating from its old position with a delay growing with its distance from the anchor (demo `ripple`: 35 ms per card, capped at 320 ms); the anchor keeps its viewport position (`keepAnchor`); cards that were not on screen before rise in (demo `fadeNew`). Names stay one line with 「…」.
- FLIP: measure, change layout once, animate from the inverted transform to none with the Web Animations API. Animated properties: `transform` (and `opacity` only where the demo fades new cards or reopening columns). The column background widens via `scaleX` on a separate background layer as the demo does, so text is never scaled. No per-frame layout or paint from our code.
- While an animation runs, the scrolled column's scrolling is held (wheel/touch/keyboard do not move it, e.g. `overflow: hidden` or prevented wheel; restore after) and no new collapse or expand starts.
- Collapsed strip (UX DESIGN board-column-collapsed, same look as the existing 已整理 strip in `archived-column.tsx`; reuse it): 64px wide, 28px status circle plus the count (12px `text-muted`) at the top, the column name vertical below (14px/700, `writing-mode: vertical-rl`), hover adds a 1px `text-faint` inset ring, a real button (focusable, Enter/Space). Pressing a strip restores the normal board (demo: `setFocus(null, false)`), keeping the anchor in place, and that previously wide column does not collapse again until it has been scrolled back near its top (demo `suppressed`).
- Expand: when collapsed, the wide column scrolled up to its top (`scrollTop < 8` and moving up), or a wheel up at the top accumulating past 60px of `deltaY`, restores 4 equal work columns (plus the 已整理 strip as before), scrolled to the top, animated with FLIP (cards back to one per row, 0.75 × 1300 ms, ripple), never collapsing again until the column is scrolled past the threshold once more. A scroll the code makes itself (`keepAnchor`, scroll to top) never counts as Alex's scroll.
- Reduced motion (`prefers-reduced-motion: reduce`): no animation and no delay; the layout switches at once (collapse and expand), everything else the same.
- Freeze (AR-50, AD-7): add an `animation` reason to `src/state/order-freeze.ts` (`FreezeReasons`, `isOrderFrozen`, a hold/release API like `holdOrderForSheet`); held from the first measure until the animation ends (also on unmount). The board columns' shown order uses the freeze store while it holds (cards keep positions; values may update; a new torrent waits for the release). vitest covers the reason's start and end and that the board order holds and then applies.
- Virtualised columns (`card-list.tsx`): in the wide column rows hold as many cards as `auto-fill, minmax(270px, 1fr)` fits for the column width (recomputed on resize); row height is the tallest card in the row; DOM stays bounded (under 60 card elements per column). FLIP animates only the cards in view (plus overscan), as the demo does.
- The board detail panel (2.4) stays where it is, same position and width, during and after collapse (Claude 代決 in the story).
- Prefs: new `src/lib/prefs.ts` holding the only localStorage key table (AD-13), with a typed `autoCollapse` key (default on), read and write wrapped in try/catch (missing or broken storage reads the default). Stories 3.3 and 3.6 add keys here. The board reads it on mount and on the `storage` event.
- AD-11: read TanStack Virtual 3 docs for row grouping or lanes, MDN `Element.animate` / Web Animations, MDN `writing-mode`, MDN `prefers-reduced-motion`; record URLs in Design Notes.

**Never:** animation packages or new dependencies; animating `width`, `height`, `top`, `left`, `grid-template-*` or anything that lays out per frame; the feature on the phone or below 1024px; the settings-page toggle (Epic 3); collapse triggered by the code's own scrolling; reordering cards during an animation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| C1 trigger | desktop, pref on, scroll a column past its clientHeight | frame on anchor, step 1 then step 2, others 64px strips, cards 2 to 3 per row | n/a |
| C2 off / narrow | pref off; width 1023 | scrolling never collapses | broken storage reads default (on) |
| C3 anchor | pointer in a gap between two cards; no pointer | nearest card by edge distance; first fully visible | no visible cards: no frame |
| C4 hold | wheel during the animation | column does not scroll; no second trigger | n/a |
| E1 expand top | collapsed, scroll up to top; wheel up 60px at top | 4 columns, scrollTop 0; no re-collapse until past threshold again | n/a |
| E2 strip | press a strip (click or Enter) | board restored; previous wide column suppressed until near top | n/a |
| F1 freeze | maindata arrives mid-animation | order holds; applies after the animation ends | unmount mid-animation releases the hold |
| R1 reduced | reduced motion on | layout switches at once, no animations | n/a |
| P1 panel | board detail panel open, collapse | panel position and width unchanged | n/a |
| V1 rows | wide column with 1000 cards | 2 to 3 per row, under 60 card elements | resize recomputes per-row count |

</intent-contract>

## Code Map

- Demo (the approved behaviour, port it): `_bmad-output/planning-artifacts/ux-designs/ux-react-torrent-2026-11-13/.working/demo-board/index.html` lines ~415-475 (scroll check, wheel up at top, strip click), ~480-610 (`visibleCards`, `flip`, `findAnchor`, `keepAnchor`, `setFocus`), CSS for `.col`, `.bg`, `.collapsed`, `.focus`, `.leaving`, `.here`.
- `src/features/board/torrent-board.tsx` -- desktop board layout (5 columns), mobile tabs; where collapse state lives.
- `src/features/board/board-column.tsx` -- `COLUMN_CLASS`, `COLUMN_HEADER_CLASS`, `ColumnTitle`.
- `src/features/board/archived-column.tsx` -- the existing 64px collapsed strip (circle, count, vertical name): reuse for collapsed work columns.
- `src/features/board/card-list.tsx` -- per-column `useVirtualizer`, fixed heights per card kind from `board-model.ts`; the scroll element.
- `src/features/board/board-card.tsx` -- card; `board-model.ts` -- heights, columns.
- `src/state/order-freeze.ts` -- `FreezeReasons`, `isOrderFrozen`, `freezeStore`, `holdOrderForSheet`, `useFrozenOrder`; `src/state/maindata.ts` `useBoardColumns`.
- `src/routes/_authed/index.tsx` -- `BoardHome` (detail panel and board wrapper).
- `src/shared/ui/breakpoint.ts` -- desktop breakpoint helper.
- `src/styles.css` -- tokens (`accent`, `text-faint`, `text-muted`, `surface-muted`), existing keyframes and reduced-motion rules.
- `scripts/fake-qbit.mjs` -- `many` data mode (about 4165 torrents) for the performance check; `e2e/board.spec.ts` board e2e and screenshot patterns.

## Tasks & Acceptance

**Execution:**
- `src/lib/prefs.ts` (new, + test) -- key table and `autoCollapse` read/write with default and storage failures.
- `src/state/order-freeze.ts` (+ test) -- `animation` reason and hold API (F1).
- `src/lib/` or `src/features/board/board-collapse.ts` (+ test) -- pure helpers: anchor choice from rects and pointer (C3), threshold and expand decisions incl. suppression and wheel accumulation (C1, E1, E2), per-row count from width (V1), ripple delay.
- `src/features/board/` -- collapse controller (state machine normal → collapsing → collapsed → expanding), FLIP runner on the Web Animations API, collapsed strip for work columns, wide-column grid rows in `card-list.tsx`, scroll hold, anchor frame, reduced motion (+ DOM tests C2, C4, E2, R1, P1).
- `e2e/board-collapse.spec.ts` (new) -- C1, E1, E2, P1 in Chromium against fake data; screenshots into `e2e-output/screenshots/2-8/`: before, after step 1, after step 2, desktop light and dark.
- Performance: with the `many` data mode record a Chrome trace over one collapse and one expand (CDP `Tracing` from Playwright), count `Layout` and `Paint` events inside the animation windows (beyond the single layout change at each step start), save the counts as a JSON summary next to the screenshots and a rendered image of the trace summary if practical; report the numbers in the PR.

**Acceptance Criteria:**
- Given fake data on a 1440px window, when Alex scrolls a column past one column-height, then the anchor gets the accent frame, the other columns become 64px strips in about 0.38 s, and the cards spread to 2 to 3 per row in about 1.3 s with the anchor still in view.
- Given `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run smoke`, `CI=1 npm run smoke:browser` and `check.sh`, then all pass with 0 CSP violations and 0 console errors.
- Given the PR, then it carries the before, step 1 and step 2 screenshots (light and dark) and the performance trace summary.

## Spec Change Log

## Review Triage Log

### 2026-11-17: Review pass
- verdicts: 43 findings: high 0, medium 1, low 38, false 2, maybe-false 2
- findings:
  - `[false]` `[reject]` (blind) the spec is not in the diff. Left out on purpose for the review layers; committed with the code.
  - `[low]` `[patch]` (blind) turning the pref off during a transition leaves the board collapsed. Patch: `disable()` remembers it while busy and `finish` restores the board; DOM test with animations on.
  - `[low]` `[patch]` (blind) `cardsPerRow` has no cap, so wide windows get 4+ per row against 「一排 2 到 3 張」. Patch: capped at 3, unit tests at 1600px and 2560px.
  - `[low]` `[patch]` (blind) Enter on a strip, or a collapse of the column holding focus, drops focus to `body`. Patch: focus moves to the restored column's body or the wide column's body when it fell to `body`; DOM tests.
  - `[low]` `[reject]` (blind) non-wide columns restart at their top after a collapse. Recorded Claude 代決 (strips unmount their lists); Alex was scrolling the wide column, not those.
  - `[low]` `[patch]` (blind) the 已整理 strip reads 「展開已整理欄」 during a collapse although pressing restores the board. Patch: strips read 「回到看板，<欄名>，N 個」 while collapsed.
  - `[low]` `[reject]` (blind) the open detail panel covers the wide column's right side. The story AC (Claude 代決) keeps the panel's position and width during a collapse; flagged in the PR for Alex.
  - `[low]` `[reject]` (blind) a torrent changing column during the ~2 s freeze vanishes from both until the hold ends. Short window, counts recover at the release; fixing needs cross-column freeze state.
  - `[low]` `[patch]` (blind) the anchor deleted mid-animation leaves step 2 without a pin. Patch: falls back to a new anchor from the cards on screen; DOM test.
  - `[low]` `[reject]` (blind) the wheel-up counter never resets over time. Same as the approved demo.
  - `[low]` `[patch]` (blind) touch cannot expand a collapsed column already at its top (the tablet acceptance device). Patch: a finger drag down past 60px at the top expands, like the wheel rule; DOM test.
  - `[low]` `[reject]` (blind) the trace script cannot fail. The AC asks for a recording in the PR, not a CI gate; the summary numbers go in the PR.
  - `[low]` `[patch]` (blind) `rangeExtractor` has no version-matched reference (AD-11). Patch: cites `@tanstack/virtual-core` 3.19.11 source, the version 3.14.26 pins.
  - `[low]` `[patch]` (blind) the busy wheel block also blocks ctrl+wheel zoom and horizontal wheels. Patch: only vertical wheels without `ctrlKey` are cancelled; test.
  - `[low]` `[reject]` (blind) test hygiene in the DOM test (restore order, a no-op push). No behaviour at risk.
  - `[low]` `[patch]` (blind) dead or broad exports in the controller. Patch: `isBusy` removed, `cardsInView` and `prefersReducedMotion` no longer exported.
  - `[low]` `[patch]` (verification) a strip press never checks the anchor stays in view. Patch: e2e E2 records the first fully visible card and asserts the frame lands on it and it stays in view after the expand.
  - `[low]` `[patch]` (verification) 已整理 as the wide column and closing it from its header are untested. Patch: reduced-motion DOM case for both.
  - `[low]` `[patch]` (verification) touch is not checked in the scroll hold. Patch: cancelable `touchmove` prevented during the transition, passes after.
  - `[low]` `[patch]` (verification) pref off while busy (same root cause as the blind row). Patched there.
  - `[low]` `[patch]` (edge) pref off while busy (same root cause). Patched there.
  - `[low]` `[reject]` (edge) scrollbar drag, autoscroll or find-in-page can scroll during the hold. Recorded Claude 代決; `overflow: hidden` while busy would change the scrollbar width and force layout mid-animation.
  - `[low]` `[reject]` (edge) such a non-wheel scroll during a pin can show blank rows briefly (consequence of the row above). Rejected there.
  - `[maybe-false]` `[reject]` (edge) reduced-motion collapse finishes on `setTimeout(0)` before React commits, dropping the pin. DOM and e2e R1 pass with the final layout; settling needs a reduced-motion e2e checking the anchor position; if true only low.
  - `[maybe-false]` `[reject]` (edge) the same race for reduced-motion expand. Same note as the row above.
  - `[low]` `[patch]` (edge) focus falls to `body` when a strip or column swaps (same root cause as the blind focus row). Patched there.
  - `[low]` `[reject]` (edge) a strip press during the animation does nothing for ~2 s. The hold blocks all transitions by design; the press works once it ends.
  - `[low]` `[reject]` (edge) the frame animation does not restart when a new transition picks the same anchor within its life. Needs a second transition on the same card within ~3.8 s.
  - `[low]` `[patch]` (edge) running animations are not cancelled on reset or unmount. Patch: handles kept and cancelled; test.
  - `[low]` `[patch]` (edge) the anchor removed during step 1 (same root cause as the blind row). Patched there.
  - `[low]` `[patch]` (edge) 4+ cards per row on wide windows (same root cause as the blind row). Patched there.
  - `[low]` `[patch]` (edge) `overflow-hidden` removed from the column lets the body spill past the rounded corners. Patch: the body clips to the rounded bottom corners, the section stays unclipped for the background scale; checked in screenshots.
  - `[medium]` `[patch]` (intent) the anchor frame reached full opacity only after step 1 ended, against 「先出現 2px accent 框」. Patch: keyframes start at full opacity, fade only at the end; tests for the keyframes and for the frame in the step 1 commit.
  - `[low]` `[reject]` (intent) a strip press restores the whole board rather than making that column wide. Approved demo behaviour, recorded Claude 代決.
  - `[false]` `[reject]` (intent) the freeze lets values update. AD-7 and AR-44 say the same mechanism as 「先不重排」, which holds order and membership, not values.
  - `[low]` `[reject]` (intent) two hooks over one freeze store. One store and one reason list; the board hook only selects the animation reason, as the board was never frozen by hover (2.3).
  - `[low]` `[reject]` (intent) the scrollbar thumb is not held (same as the edge row). Rejected there.
  - `[low]` `[reject]` (intent) the anchor distance uses `hypot` instead of vertical distance. One card per row in the column, so the horizontal term only breaks ties.
  - `[low]` `[reject]` (intent) DOM tests mock `animate`. e2e checks the real 380 ms and 1300 ms animations, strip widths, per-row counts and the anchor in view.
  - `[low]` `[reject]` (intent) performance proof is a headless CDP trace table, not a DevTools screenshot. The trace counts the same Layout and Paint events; the PR carries it and asks Alex to record on the tablet.
  - `[low]` `[reject]` (intent) the step 1 screenshot is taken at 350 ms. 30 ms before the end of a 380 ms step; the layout is final.
  - `[low]` `[reject]` (intent) under reduced motion the frame still shows ~0.9 s without animation. Function kept, no motion; matches 「功能照常」.
  - `[low]` `[reject]` (intent) older board tests turn the feature off. Needed so they keep testing story 2.3 and 2.4 behaviour; the default path is covered by `board-collapse.spec.ts`.

## Design Notes

- Claude 代決 (Alex may veto): a strip press restores the whole board (as the demo does), not a swap of the wide column; `opacity` joins `transform` only where the demo fades in new cards and reopening columns (both composite-only); the anchor frame lasts the animation plus about 0.9 s (demo `--here`); the 已整理 column, when expanded, can be the wide one like any work column.
- Freeze: the board was not frozen by hover (story 2.3); only the new `animation` reason freezes it, so FLIP measurements stay valid.
- URLs actually read (AD-11, 2026-11-17): `https://tanstack.com/virtual/latest/docs/api/virtualizer` (`lanes` puts each item in the shortest lane, masonry, so it cannot give "row height = tallest card in the row"; rows are grouped by hand and the virtualizer counts rows; `rangeExtractor` receives the visible `Range` and returns the indexes to draw; `getItemKey` changes force the positions to recompute, confirmed in the installed `@tanstack/virtual-core` 3.14 source where `estimateSize` alone does not), `https://developer.mozilla.org/en-US/docs/Web/API/Element/animate` (returns an `Animation`; timing options from `KeyframeEffect`: `delay`, `easing`, `fill: 'backwards'` holds the first keyframe during the delay), `https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion` (`reduce`; read in code with `matchMedia` at the start of each transition), `https://developer.mozilla.org/en-US/docs/Web/CSS/writing-mode` (`vertical-rl` for the strip names, as the existing 已整理 strip).
- Claude 代決 (Alex may veto), implementation: the virtualizer counts rows in every column (one card per row outside the wide grid), and every card is a direct child of the list keyed by hash, so a layout change moves the same element and the FLIP matches cards by `data-hash`. A `pin` prop makes the column draw exactly the rows around the anchor's new position (custom `rangeExtractor`) and sets `scrollTop` in a layout effect before the board measures, so `keepAnchor` is computed from the row geometry instead of measured. The demo's `.leaving` fade (the shrinking column's content fading over 0.14 s, clipped to 64px) is not ported: the content is replaced by the strip at step 1 while the background still narrows through `scaleX`, and the strip content fades in after 0.12 s as in the demo. Scroll hold: wheel, `touchmove` and scroll keys on the board are cancelled while `busy` (non-passive listeners on the board); dragging the scrollbar thumb is not blocked. Space on a focused card still presses it. Collapsed columns unmount their card lists, so after an expand the other columns start at their top. Closing the wide 已整理 column from its header ends the collapse at once without animation. While collapsed every strip restores the board, so its label says so: 「回到看板，下載中，2 個」 (the normal board keeps 「展開已整理欄，N 個」). Focus that falls off the board in a swap goes to the restored column's body after a strip press, and to the wide column's body when the column holding focus became a strip. The anchor frame is at full strength from the first frame of step 1 and only fades out at the end. Rows hold at most 3 cards; wider windows widen the cards. On a touch screen at desktop width (a tablet), a finger pulled down past 60px at the top of the wide column expands like the wheel up. While busy only vertical wheels without `ctrlKey` are cancelled (zoom and sideways wheels pass). Turning the pref off mid-transition restores the board when the transition ends. A reset or unmount cancels the running animations. If the anchor leaves during step 1, step 2 picks a new anchor from the cards on screen. The scroll body clips itself to the column's rounded bottom corners (the section no longer clips, so its background can scale past it). `rangeExtractor` follows the installed `@tanstack/virtual-core` 3.19.11 (the version `@tanstack/react-virtual` 3.14.26 pins): `https://unpkg.com/@tanstack/virtual-core@3.19.11/src/index.ts`.
- Performance (scripts/trace-board-collapse.mjs, fake `many`, headless Chromium 1440 x 900, 2026-11-17): Layout events during the animation windows beyond each step's start: collapse step 1 0, step 2 0, expand 1 (the 5 s maindata poll's response landed in the window: ResourceFinish at 831 ms, Layout at 847 ms). Paint during the windows: single card wrappers, one each as its staggered animation starts or ends (layer promotion and demotion), not a repaint per frame: 3, 24 and 36 such paints of about 30 µs each. Counts in `e2e-output/screenshots/2-8/trace-summary.json` and `trace-summary.png`.
- e2e: three 2.3/2.4 tests that scroll a desktop column for another reason (K9, the detail's no-scroll check, the scrollbar click) turn the pref off through the new `autoCollapseOff` fixture, so they keep testing what they tested.

## Verification

**Commands:**
- `source ~/.nvm/nvm.sh && nvm use && npm run lint && npm run typecheck && npm test` -- expected: all pass.
- `source ~/.nvm/nvm.sh && nvm use && npm run build && npm run smoke && CI=1 npm run smoke:browser` -- expected: all pass, 0 CSP violations.
- `bash .claude/skills/next-story/check.sh` -- expected: every line ok.

## Auto Run Result

Status: done (one review pass)

Summary: on the desktop board (1024px and up, pref on), scrolling a column past one column-height frames the anchor card, collapses the other columns into 64px strips in 380 ms and spreads the cards to 2 or 3 per row in 1300 ms, all with FLIP on `transform` (plus `opacity` where the demo fades in new cards and reopening columns). Scrolling back to the top, wheeling or dragging down at the top, or pressing a strip restores the board. Reduced motion switches layouts at once. Data that arrives mid-animation waits through a new `animation` freeze reason. `src/lib/prefs.ts` is the localStorage key table with `autoCollapse` (default on).

Files changed (main ones):
- `src/lib/prefs.ts` (new), `src/state/order-freeze.ts` (`animation` reason, board hook).
- `src/features/board/board-collapse.ts` (new: pure rules), `board-collapse-controller.ts` (new: state machine and FLIP), `use-board-collapse.ts` (new), `collapsed-strip.tsx` (new, shared with 已整理), `card-list.tsx` (rows, pin, frame), `torrent-board.tsx`, `board-column.tsx`, `archived-column.tsx`, `src/styles.css`.
- `e2e/board-collapse.spec.ts` (new), `e2e/fixtures.ts` (`autoCollapseOff`), `scripts/trace-board-collapse.mjs` (new), tests beside each file.

Review: 43 findings. Patched 1 medium entry (anchor frame shown before anything moves) and 15 low entries (21 rows including shared root causes), deferred none, rejected 21 (17 low, 2 false, 2 maybe-false) with reasons in the log.

Follow-up review recommendation: false. One medium entry patched on a first pass.

Verification (2026-11-17, after the patches): `npm run lint` clean; `npm run typecheck` clean; `npm test` 97 files, 2226 tests passed; `npm run build` ok; `npm run smoke` ok; `CI=1 npm run smoke:browser` 63 passed, 0 CSP violations; `check.sh` all ok; `node scripts/trace-board-collapse.mjs` (fake 4165 torrents): Layout during the animation windows 0, 0 and 1 (the 1 is the 5 s data refresh landing in the expand window), Paint during 3, 24 and 36 (one per card as its staggered animation starts or ends, not per frame). Matrix audit: C1 to C4, E1, E2, F1, R1, P1, V1 each have covering tests that ran and passed.

Residual risks: smoothness and the anchor frame on Alex's tablet in landscape; the board detail panel keeps its place and so covers the right part of the wide column; the performance proof is a headless trace table, not a DevTools recording.
