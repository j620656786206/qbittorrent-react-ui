---
title: 'Story 2.2: Bottom sheet and the phone sort sheet'
type: 'feature'
created: '2026-11-16'
status: 'done'
baseline_revision: '394ae0cac8d885a055eaaf58895ad13c438c6fa7'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-react-torrent-2026-11-15/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-1-sort-fields-desktop-sort-menu.md'
warnings: ['oversized']
deferred:
  - summary: >-
      The bottom sheet's document-level Esc handler calls preventDefault on every Escape.
    evidence: |-
      Later sheets with inputs (add, rename) and the Story 2.4 shortcut registry need Esc routing; move it into the registry then.
    location: >-
      src/shared/ui/bottom-sheet.tsx
    severity: low
---

<intent-contract>

## Intent

**Problem:** On the phone the sort pill is disabled, so Alex cannot change the sort away from home. Later stories (detail, delete, add, move) all need the same phone bottom sheet, and none exists.

**Approach:** Build one shared brand bottom sheet in `src/shared/ui` (own pointer-event gestures, no new package, no shadcn `Sheet`), with snap decisions as `src/lib` pure functions, and use it for the phone sort sheet in "fit content" mode. Enable the phone sort pill.

## Boundaries & Constraints

**Always:**
- Shared component `src/shared/ui/bottom-sheet.tsx`, not under any `features/` folder. Opens by sliding up: 0.55 s, `cubic-bezier(.2,.85,.25,1)`, from `translateY(60%)`, animating only `transform` and `opacity`; scrim `rgba(0,0,0,.18)` behind it.
- Look (UX-DR49, DESIGN bottom-sheet): `surface` background (dark: the same surface as cards), top corners 28px (`rounded.sheet`), shadow `0 -12px 40px rgba(0,0,0,.18)`; handle 44×5px centered, 8px from the top edge, handle band 20px tall; title 16px / 700; ✕ button 44px at the right end of the content's first row, `aria-label`「關閉」.
- Closing: dragging down past the threshold, tapping the scrim, pressing ✕, and Esc all close it; focus returns to the element that opened it.
- Dragging: the sheet follows the finger (transform only, no per-frame layout); a downward drag moves the sheet only when the content is scrolled to the top, otherwise it scrolls the content. Dragging up reaches full screen: top corners 0, top padding `env(safe-area-inset-top)`, handle stays.
- Height modes: `fit` (content height, max 90%), `fixed90`, `detail` (opens at 70%; released past half its height closes, otherwise springs back to 70%), `full`. Where the sheet settles after release is decided by pure functions in `src/lib/sheet-snap.ts` (input: mode, current height or offset, drag distance and velocity, viewport height; output: `close` | a snap target). vitest covers every mode's thresholds. Only `fit` is wired to a UI in this story.
- Accessibility: `role="dialog"`, `aria-modal="true"`, named by its title (`aria-labelledby`); focus moves into the sheet on open and is trapped there; the page behind cannot scroll while open (scroll lock through CSSOM style changes, never an injected `<style>` element).
- While a sheet is open, the order-freeze hook in `src/state/order-freeze.ts` counts it as a freeze reason (`sheetOpen`), so the list behind keeps its positions (vitest).
- `prefers-reduced-motion: reduce`: no slide animations on open, close or release (jump to the result); dragging still follows the finger.
- 0 CSP violations with the sheet open (browser smoke). Epic 1 retro action item 3: decide style-src per AR-31. The default decision is to keep the current CSP (no `style-src`, no `'unsafe-inline'`) by avoiding injected `<style>` and SSR `style=` attributes; record it in Design Notes and the PR.
- Phone pill (width under 1024px, UX-DR21): enabled, 44px tall, only the view icon, the sort name, the arrow and ▾, e.g. 「▦ 做種時間 ↓ ▾」; 「狀態」 has no arrow; `aria-label` with the full words (same text as the desktop pill).
- Phone sort sheet (mockup S03-sort-sheet-phone): the `fit` sheet titled 「排序」, rows 52px, no shortcut digits; 「更多」 expands inside the sheet; the selected item has a check plus direction words and arrow; when the current sort is under 更多 the sheet opens expanded and scrolled to it. Tapping the selected item flips the direction and keeps the sheet open; tapping another item switches to it with its default direction, closes the sheet, and scrolls the list to the top. 「狀態」 is shown but disabled, like desktop. Reuse the sort model from Story 2.1 (`src/features/header/sort-model.ts`, `sort-fields.ts`), not a copy.
- UI text exactly as given; no em dash anywhere; `check.sh` before every commit; fake data only for screenshots and tests (AD-15).

**Never:**
- No shadcn `Sheet`, no gesture or animation package, no new runtime dependency.
- No CSP loosening unless there is no other way; if it is truly needed, stop and record why instead of adding `'unsafe-inline'` silently.
- Do not wire the `fixed90`, `detail` or `full` modes into any screen yet (later stories); no category sheet, no detail sheet.
- No 「排序換成這個分類記住的」 line (Epic 3).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| B1 open | tap the phone sort pill | sheet slides up (0.55 s), scrim shows, focus inside, title 「排序」 | n/a |
| B2 close ✕ / scrim / Esc | sheet open | closes; focus back on the pill | n/a |
| B3 drag down | content at top, drag down past threshold, release | closes | below threshold: springs back |
| B4 drag in scrolled content | content scrolled down, drag down | content scrolls, sheet stays | n/a |
| B5 drag up | drag up and release | full screen: corners 0, safe-area top padding, handle visible | n/a |
| B6 snap fn fit | release positions and velocities | `close` or the fit/full target per thresholds | n/a |
| B7 snap fn detail | released at 49% vs 51% drop of 70% height | springs back to 70% vs closes | n/a |
| B8 snap fn fixed90 / full | release cases | close or stay per thresholds | n/a |
| B9 freeze | sheet open, data poll reorders | list positions unchanged until closed, then reorders once | n/a |
| B10 reduced motion | prefers-reduced-motion | no slide animation; drag follows finger | n/a |
| B11 flip | tap the selected item | direction flips, sheet stays open | n/a |
| B12 switch | tap another item | default direction, sheet closes, `main` scrollTop 0 | n/a |
| B13 more | current sort under 更多 | opens expanded, scrolled to it | n/a |
| B14 scroll lock | sheet open, wheel or touch on the page | page behind does not scroll | n/a |

</intent-contract>

## Code Map

- `src/shared/ui/dialog.tsx`, `dropdown-menu.tsx`, `ui.test.ts` -- existing shared UI pattern and token checks; the new sheet lives beside them.
- `src/shared/ui/restore-focus.ts`, `main-scroll.ts` -- focus restore helper and `getMain()` for scroll-to-top.
- `src/styles.css` -- design tokens (`--rt-surface`, radii, shadows); add `sheet` radius / shadow tokens here if missing, values from the UX DESIGN.md frontmatter.
- `src/state/order-freeze.ts:20-28,125-191` -- `FreezeReasons` (`pointerInList`, `touchScroll`), `freezeStore`, `setReason`, `resetOrderFreeze`; add `sheetOpen`.
- `src/features/header/sort-menu.tsx` -- desktop menu and the disabled `PhoneSortPill`; `sort-model.ts` -- `sortPillModel`, `pickSort` (reuse for the phone sheet).
- `src/features/header/app-shell.tsx`, `app-shell.test.tsx` -- where the phone pill renders; tests assert its label.
- `src/state/list-view.ts`, `src/routes/_authed.tsx` -- `useListView().setView` (replace, `resetScroll: false`).
- `src/shared/csp.ts` -- current CSP strings (no `style-src`).
- `e2e/smoke.spec.ts`, `e2e/fixtures.ts` -- add a phone-width sheet test (open, 更多, pick, flip, close by ✕/scrim, focus back, 0 CSP); screenshots at 390px light and dark: sheet collapsed, 更多 expanded, full screen; no horizontal scroll.
- UX sources: `_bmad-output/planning-artifacts/ux-designs/ux-react-torrent-2026-11-13/EXPERIENCE.md:100` (bottom-sheet behavior), `:438` (sheet motion), `:251` (freeze while a sheet is open); `DESIGN.md:309-318` (bottom-sheet tokens), `:565-567` (shadow and scrim), `:582` (`sheet` radius 28px), `:614` (sort-menu, phone part); `mockups/S03-sort-sheet-phone.dc.html`.
- Spine: `ARCHITECTURE-SPINE.md:243` (gestures with pointer events in the shared component, no package), AD-10 / AR-31 CSP rule (line 164).

## Tasks & Acceptance

**Execution:**
- `src/lib/sheet-snap.ts` (+ test) -- pure snap/close decision for the four modes; thresholds and velocity rule tested per mode (B6 to B8).
- `src/shared/ui/bottom-sheet.tsx` (+ DOM test) -- portal, scrim, handle, title row with ✕, pointer-event drag with content-scroll handoff, full-screen state, four modes via props, focus trap and restore, Esc, scroll lock via CSSOM, reduced motion, `onOpenChange`; registers `sheetOpen` with the freeze store while open.
- `src/state/order-freeze.ts` (+ test) -- `sheetOpen` reason (B9).
- `src/features/header/sort-sheet.tsx` (or inside `sort-menu.tsx`) (+ DOM test) -- phone sort sheet per Always (B11 to B13), reusing the sort model.
- `src/features/header/sort-menu.tsx`, `app-shell.tsx` (+ tests) -- enabled 44px phone pill opening the sheet; label tests with a non-default view (closes the 2.1 deferred item).
- `src/styles.css` -- sheet tokens if missing.
- `e2e/smoke.spec.ts` -- phone sheet smoke and 390px screenshots (collapsed, 更多 expanded, full screen; light and dark).
- A local-only trace script or documented steps (not run in CI) that records a drag in Chromium and reports whether Layout events occur during the drag frames, for the PR.

**Acceptance Criteria:**
- Given the app at 390px with fake data, when Alex taps the sort pill, then the 「排序」 sheet slides up, sorting works as in the matrix, and ✕, scrim, Esc and a downward drag each close it with focus back on the pill; the browser smoke sees 0 CSP violations and 0 console errors.
- Given the sheet open, then the page behind does not scroll and the list order is frozen until it closes.
- Given `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run smoke`, `npm run smoke:browser`, `check.sh`, then all pass.
- Given the PR, then it carries 390px light and dark screenshots of the sheet (collapsed, 更多 expanded, full screen) with no horizontal scroll, the CSP decision, the drag trace summary, and a note that Alex verifies the feel on a real phone.

## Spec Change Log

## Review Triage Log

### 2026-11-16 Review pass
- verdicts: 36 findings: high 0, medium 10, low 19, false 1, maybe-false 6
- findings:
  - `[low]` `[reject]` (intent) open slide starts at 60% of the visible height, not the element box. The sheet box is full height, so 60% of the visible height is the reading that matches the mockup motion.
  - `[maybe-false]` `[reject]` (intent) drag trace is headless with mouse, not a Chrome Performance recording on a phone. The AC leaves the phone check to Alex; the PR asks him to record it. If true, medium.
  - `[low]` `[reject]` (intent) detail, fixed90 and full modes never rendered in tests. The story wires only fit; snap functions are tested per mode.
  - `[low]` `[reject]` (intent) the B9 browser test checks new rows held, not swaps. Reducer tests cover swaps.
  - `[medium]` `[patch]` (intent) touch handoff, scroll lock and safe area only tested with stand-ins. Patch: touch-action DOM test; the PR lists B3, B4, B5, B14 for Alex's phone check.
  - `[medium]` `[patch]` (blind) reopening during the close slide breaks the scrim and focus. Patch: cancel the scrim fade, treat as a fresh open, new DOM test.
  - `[low]` `[patch]` (blind) the scrim takes taps during the close slide. Patch: pointer-events none while closing.
  - `[low]` `[reject]` (blind) only the freeze handles two sheets at once. No screen opens two sheets; the later story that needs it adds a stack.
  - `[medium]` `[patch]` (blind) crossing 1024px with the sheet open. Patch: the phone sheet closes at lg; focus falls back to `main`.
  - `[low]` `[reject]` (blind) mounting already open measures before padding. No consumer mounts it open; the detail story can fix it if it does.
  - `[low]` `[patch]` (blind) an upward flick against the drag distance goes full screen. Patch: settle at rest when velocity opposes distance.
  - `[medium]` `[patch]` (blind) touch path never in a real browser. Same patch as the intent touch row.
  - `[low]` `[patch]` (blind) missing tests: unmount while open, num_seeds label. Patch: both added; pointercancel velocity and the `handle()` selector rejected as low.
  - `[low]` `[patch]` (blind) B9 waits a fixed 11 s. Patch: waits for two maindata responses.
  - `[low]` `[reject]` (blind) effect deps miss mode and runtime. Mode is fixed per sheet instance; no caller changes it while open.
  - `[medium]` `[patch]` (blind) the page behind is not hidden from screen readers. Patch: `inert` on sibling body children while open.
  - `[low]` `[reject]` (blind) the phone back gesture leaves the page. A product decision for the detail sheet story; noted in the PR.
  - `[low]` `[defer]` (blind) the global Esc handler will swallow Esc in later sheet inputs. Moves to the Story 2.4 shortcut registry.
  - `[false]` `[reject]` (blind) spec B11 does not mention scroll on flip. Fix edits this build's spec.
  - `[low]` `[reject]` (blind) bottom-sheet.tsx is 662 lines. A refactor, not a defect.
  - `[medium]` `[patch]` (verification-gap) reopen during close has no test. Same patch as the blind row.
  - `[medium]` `[patch]` (verification-gap) unmount while open cleanup never checked. Patch: DOM test.
  - `[medium]` `[patch]` (verification-gap) content touch-action wiring untested. Patch: DOM test.
  - `[maybe-false]` `[reject]` (verification-gap other) reproduction of the reopen defect. Same as the patched row.
  - `[maybe-false]` `[reject]` (verification-gap other) short-drag flake suspicion. The reviewer measured 0.13 px/ms against 0.5; not flaky.
  - `[medium]` `[patch]` (edge) reopen skips initialFocus and onOpened. Same patch as the blind row.
  - `[medium]` `[patch]` (edge) the scrim fade-out is never cancelled. Same patch as the blind row.
  - `[low]` `[reject]` (edge) a resize during a drag uses stale metrics on release. Rotation mid-drag is rare; the next open measures again.
  - `[low]` `[patch]` (edge) focus on a hidden pill after crossing 1024px. Same patch as the blind row.
  - `[low]` `[patch]` (edge) an abandoned press still fires click. Patch: click suppressed after the slop.
  - `[low]` `[reject]` (edge) view changes to a 更多 field while the sheet is open. Only history back can do that with the sheet open; the next open expands.
  - `[low]` `[reject]` (edge) trace script relative path. Local-only script run from the repo root as documented.
  - `[low]` `[reject]` (edge) trace script `--keep` without a path. Local-only.
  - `[maybe-false]` `[reject]` (intent) 40 style recalcs per drag count as more than composite. Inline transform changes recalc style but not layout or paint; settled by Alex's phone recording. If true, low.
  - `[maybe-false]` `[reject]` (intent) the safe-area padding is only a class in tests. Settled on a notched phone. If true, low.
  - `[maybe-false]` `[reject]` (intent) the 1024px switch relies on existing CSS. Unchanged CSS from Epic 1, covered by its tests. If true, low.

## Design Notes

- Docs to read first (AD-11): MDN Pointer Events and `setPointerCapture`, `touch-action`, `overscroll-behavior`, `prefers-reduced-motion`, `env(safe-area-inset-top)`; WAI-ARIA dialog (modal) pattern `https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/`. Radix `FocusScope` from the installed `radix-ui` may be used for the focus trap if it injects no `<style>`; otherwise a small own trap. Record the URLs actually read.
- URLs actually read (2026-11-16): `https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action` (pan-up/pan-down name the scroll direction, so `pan-down` is a finger moving up; the value is read when a gesture starts; the browser sends `pointercancel` when it takes the gesture), `https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture`, `https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/` (Tab wraps, Esc closes, focus returns to the opener, `aria-modal` plus a name). `overscroll-behavior`, `prefers-reduced-motion` and `env(safe-area-inset-top)` were used from existing knowledge, not fetched again.
- Focus trap: own small trap (Tab wraps, a `focusin` outside is pulled back). Radix `FocusScope` is not exported by the installed `radix-ui` package (only the transitive `@radix-ui/react-focus-scope`), and importing a transitive package would be an undeclared dependency.
- Layering: the spine's layer map lets `src/shared` import nothing else, so `src/shared/ui/bottom-sheet.tsx` cannot import `src/lib/sheet-snap.ts` or `src/state/order-freeze.ts`. The shared types live in `src/shared/sheet.ts`; `src/router.tsx` (a root file, allowed to import every layer) binds `sheetRestHeight`, `settleSheet`, `releaseVelocity` and `holdOrderForSheet` into `SheetRuntimeContext`, the same pattern as `bindFetchMaindata`. A closed sheet needs no runtime; an open one without it throws.
- CSP decision (Epic 1 retro action item 3, AR-31): keep the current CSP, no `style-src`, no `'unsafe-inline'`. The sheet never adds a `<style>` element; inline values go through the CSSOM (React `style`, `element.style.transform`, `element.animate`), which CSP does not govern, and `_authed` renders only in the browser (`ssr: false`), so no `style=` attribute is served. The browser smoke saw 0 CSP violations with the sheet open, dragged, full screen and closed.
- Esc: the sheet listens on `document` while open (component-local like Radix's own Esc; the shortcut registry arrives with Story 2.4). The dialog is `tabIndex={-1}` so a press on the handle keeps focus inside.
- Drag trace (`node scripts/trace-sheet-drag.mjs`, local only, after `npm run build`): headless Chromium at 390px, 40 mouse steps over 160px on the handle, one frame each, trace category `devtools.timeline`, stopped before the release: 40 `pointermove` dispatched, 0 `Layout`, 0 `Paint`, 40 `UpdateLayoutTree` (style recalc for the inline transform). Alex still verifies the feel on a real phone.
- Release and close reuse the open motion (0.55 s, same curve); the scrim fades in and out in 0.2 s ease-out (mockup `fade`). The open slide starts 60% of the visible sheet height below its rest position.
- Closes the Story 2.1 deferred item: the phone pill is now rendered with non-default views in `app-shell.test.tsx` and `sort-sheet.dom.test.tsx`.
- Claude 代決 (Alex may veto), implementation detail: `detail` closes on distance only (no flick close, per EXPERIENCE 「往下拉超過一半就關」); the up threshold is a quarter of the smaller of the rest height and the room above it, so a 90% sheet can reach full screen; from full screen a flick down or a drag past a quarter of the screen returns to the rest height and below the rest height's close line it closes; a 6px slop before a press counts as a drag; in the content a drag up expands the sheet only while nothing scrolls.
- Claude 代決 (Alex may veto): drag thresholds (close when dragged down more than a quarter of the sheet height or released with a downward velocity above about 0.5 px/ms; go full screen when dragged up more than a quarter or with upward velocity above the same); Esc also closes the sheet (keyboard parity with the desktop menu); the phone pill's view icon is the same 「列表」 icon as desktop, without the capsule text.

## Verification

**Commands:**
- `source ~/.nvm/nvm.sh && nvm use && npm run lint && npm run typecheck && npm test` -- expected: all pass.
- `source ~/.nvm/nvm.sh && nvm use && npm run build && npm run smoke && npm run smoke:browser` -- expected: all pass.
- `bash .claude/skills/next-story/check.sh` -- expected: every line ok.

## Auto Run Result

Status: done

**Summary:** Shared brand bottom sheet in `src/shared/ui/bottom-sheet.tsx` (own pointer-event drag, content-scroll handoff via touch-action, four height modes, full screen with safe-area padding, focus trap and return, Esc, CSSOM scroll lock, `inert` on the rest of the page, reduced motion, freeze reason `sheetOpen`); snap decisions in `src/lib/sheet-snap.ts`; runtime (snap functions, freeze hook) injected from `src/router.tsx` through `SheetRuntimeContext` because `src/shared` may not import `src/lib` or `src/state`; enabled 44px phone pill and the 「排序」 sort sheet reusing the Story 2.1 sort model. CSP unchanged (no `style-src`, no `'unsafe-inline'`): nothing injects a `<style>` element.

**Review:** 36 findings. Patched the medium entries (reopen during close slide, crossing 1024px while open, screen readers reaching the page behind, unmount cleanup untested, touch-action wiring untested, touch path only tested with stand-ins) and low items (scrim taps while closing, flick against the drag, click after an abandoned press, num_seeds label, B9 fixed wait). Deferred 1 (global Esc handler moves to the Story 2.4 shortcut registry). Rejected the rest with reasons in the triage log.

**Follow-up review recommendation:** true (two or more medium entries patched on a first pass). Unverified risk: the reopen-while-closing path and the inert handling were changed in one patch round; real touch behavior is checked only by Alex on a phone.

**Verification:** lint, typecheck clean; `npm test` 73 files, 1406 tests; build, smoke ok; `CI=1 npm run smoke:browser` 16 of 16, 0 CSP violations; check.sh all ok. Drag trace (`node scripts/trace-sheet-drag.mjs`, local only): 40 drag steps, 0 Layout, 0 Paint.

**Residual risks:** touch drag feel, scroll handoff, safe area and iOS Safari are not verified on a real phone; phone back gesture does not close the sheet (decide in the detail sheet story).
