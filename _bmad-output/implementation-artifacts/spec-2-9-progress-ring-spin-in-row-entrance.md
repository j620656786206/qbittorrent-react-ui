---
title: 'Story 2.9: Progress ring spin-in and row entrance'
type: 'feature'
created: '2026-11-17'
status: 'done'
baseline_revision: '515ca355bff3f15de95cd3a19b8961c79a181b3d'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-react-torrent-2026-11-15/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-8-board-auto-collapse.md'
warnings: ['oversized']
deferred:
  - summary: >-
      The desktop list panel's hero ring may miss the entrance on a slow device if it mounts more than JOIN_MS after the list claims.
    evidence: |-
      Unverified. The panel hero can mount on the commit after publishShownList; on a fast dev machine that is within a few ms. Settle by tracing on a slow machine the gap between the list's claim and the panel hero's first layout effect.
    location: >-
      src/features/detail/overview.tsx HeroBlock, src/lib/entrance.ts JOIN_MS
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** When the app opens, the skeleton is swapped for the finished screen in one jump: the progress rings already sit at their values and every row is already there, so the "how far along is it" moment the UX chose as the app's one wow (EXPERIENCE 〔動態〕「驚艷的那一下：進度環轉進來」, Alex 2026-11-14) never happens.

**Approach:** One `src/state` entrance store with a generation. At the skeleton-to-data moment (and again whenever Epic 3 calls the trigger `replayEntrance()`), each mounted surface (the list rows, each board card list, the detail hero) sweeps once: the rows and cards visible right then rise 10px and fade in, 60ms apart, and the visible progress rings (downloading, stalled, paused) turn from 0 to their value over 0.9s, all with the Web Animations API on elements React already rendered. Elements that mount later (scrolled in, sort change, prev/next, the 5s refresh) draw their current state with no animation.

## Boundaries & Constraints

**Always:**
- Ring: SVG `stroke-dashoffset` from the full circumference (empty ring) to the value React rendered, 900ms, `cubic-bezier(.2,.8,.2,1)` (Claude 代決 duration, already in the epic). Use a single from-keyframe at `offset: 0` (`[{ offset: 0, strokeDashoffset: '<C>px' }]`) so the end is the element's live underlying value: maindata that arrives mid-spin changes the attribute and the spin lands on the newest progress without restarting.
- Rise: from `translateY(10px)` and `opacity: 0` to the element's own values, 500ms, same easing, `fill: 'backwards'`, `transform` and `opacity` only, also as a single from-keyframe. It animates the inner element (the row button, the card button), never the virtualizer's wrapper (which owns `translateY(start)`) and never the board FLIP's `data-hash` wrapper.
- Stagger: visible elements grouped by their top edge (equal top within 1px is one row, so the wide column's grid rows rise together); row `k` (0-based, top to bottom, per surface: the list, each board column, the phone's visible tab) has delay `k * 60ms`. A row's ring uses the same delay as its row (Claude 代決: the ring turns as its row arrives). The detail hero ring has delay 0 and no rise (the panel or sheet already slides in).
- Visible means the element's rect intersects both its scroll container's rect and the window viewport, read once per sweep (one layout read; the phone's off-screen tab panels and overscan rows fail it). Only visible elements get animations.
- Sweep timing: the sweep runs in a layout effect on the first commit where the surface has data and its virtualizer has measured its scroll element (rows cover the viewport), so the rows' first painted frame is already the animation's first frame. No frame may show the final state and then jump back.
- Generation rules: the first surface to be ready while the generation has no `startedAt` claims it (`startedAt = performance.now()`); surfaces ready within `JOIN_MS` (150ms, Claude 代決) of `startedAt` join with their delays shifted by the elapsed time (negative delays are fine); a surface that first becomes ready later, or mounts later, marks the generation played and never sweeps it. `replayEntrance()` starts a new generation with `startedAt = now`; every mounted surface sweeps it on its next commit (subscribed), cancelling its own previous animations first.
- Order: a sweep that started at least one animation holds the order through `holdOrderForAnimation()` from `src/state/order-freeze.ts` and releases it once when all its animations have settled (finished or cancelled), on replay, or on unmount. List and board positions therefore wait through the existing freeze reasons.
- `prefers-reduced-motion: reduce`: no sweep, no hold, everything drawn at once; function unchanged.
- No `Element.prototype.animate` (happy-dom, old engines): skip silently, no hold.
- Board card progress bar: grows with its ring (same delay and duration) via `transform: scaleX(0)` from-keyframe with `transform-origin: left` on the fill (Claude 代決: board-card.tsx deferred "the fill animation" to this story; a bar already full while its ring turns would contradict it).

**Never:**
- No `conic-gradient`, no CSS custom-property animation, no animation or motion packages, no new dependency.
- No animation on sort change, board/list switch, prev/next in the detail, opening the detail by click, the 5s maindata refresh, a card moving columns, phone tab swipes, or rows scrolled into view.
- No `torrent.state ===` comparisons; spin applies exactly where `StatusCircle` already draws an arc (`arcFraction > 0`), which is downloading, stalled and paused.
- Do not change the board auto-collapse controller's behaviour or the freeze store's API; do not touch toast or pending-ops (PR #27 just reshaped them).
- No writes to a real qBittorrent; fake-qbit only (AD-15).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Open, list | skeleton, then 300 rows arrive, 14 fit the viewport | 14 rows rise with delays 0..780ms; their rings (downloading, stalled, paused, progress > 0) spin 900ms from empty; overscan rows unanimated | No error expected |
| Open, desktop board | 4 columns visible, 已整理 collapsed | each column's visible cards rise from its own row 0; rings and bars spin | No error expected |
| Open, phone board | tab 要處理 visible, 3 panels off-screen | only the visible panel's cards animate | No error expected |
| Open with `hash` in URL | detail mounted in the same commit | hero ring spins (delay 0); list or board sweeps too | No error expected |
| Maindata mid-spin | progress 40% to 42% at 300ms | ring ends at 42%, no restart; list order held until animations settle | No error expected |
| Scroll during entrance | new rows mount | new rows drawn at current state, no animation | No error expected |
| Sort change / prev-next / 5s poll | after the entrance | nothing animates | No error expected |
| `replayEntrance()` | surfaces mounted | previous animations cancelled, currently visible rows and rings play again | No error expected |
| Reduced motion | OS setting on | no animations, no hold | No error expected |
| No `animate` | happy-dom | no animations, no hold, no throw | Skip silently |
| Status change mid-spin | downloading turns seeding | arc element removed by React; its animation ends; hold still releases | `finished` rejection caught |

</intent-contract>

## Code Map

- `src/shared/ui/status-circle.tsx` -- arc `<circle>` (rendered only when `arcFraction > 0`) has `strokeDasharray={C}` and `strokeDashoffset={ringOffset}`; add a marker attribute (e.g. `data-progress-arc`) so a sweep can find it; the from value is its `stroke-dasharray`. Update the header comment ("No spin-in yet").
- `src/shared/ui/` (new, e.g. `entrance-motion.ts`) -- DOM-only helpers, no state import (shared may import only shared): `prefersReducedMotion()`, `canAnimate(el)`, collect visible `[data-entrance]` / arc / bar elements of a container, start rise, ring and bar animations with the constants above, return the `Animation`s. Pattern to copy: `prefersReducedMotion`/`canAnimate` in `src/features/board/board-collapse-controller.ts:106-117` (leave that file as is).
- `src/lib/` (new, e.g. `entrance.ts`) -- pure: timings (900, 500, 60, easing, `JOIN_MS`), `rowOrdinals(rects)` grouping by top within 1px, `isVisible(rect, containerRect, viewport)`, `sweepDecision({ startedAt, now, played, generation, ready })` returning claim / join(elapsed) / skip / wait.
- `src/state/` (new, e.g. `entrance.ts`) -- the store (`@tanstack/react-store` `createStore`, as `order-freeze.ts` does) with `generation` (starts at 1) and `startedAt: number | null`; exported `replayEntrance()` (the Epic 3 trigger); `useEntrance(containerRef, { ready, rise })` running the sweep in a layout effect each commit until the generation is played, owning cancel, the order hold and its release; a test reset.
- `src/state/order-freeze.ts:47` -- `holdOrderForAnimation()` returns a once-only release; list uses `isOrderFrozen`, board `isBoardFrozen`, both honour `animation`.
- `src/features/list/torrent-list.tsx` -- `TorrentRows` (rows absolutely positioned inside `listRef`, scroller `scrollRef`, `useVirtualizer` with `scrollMargin` measured in a layout effect): call `useEntrance` with the scroller and `ready` once the virtualizer has a measured scroll rect and rows are rendered.
- `src/features/list/torrent-row.tsx:62` -- `RowContent`'s `<button>` is the rise target: mark it `data-entrance`.
- `src/features/board/card-list.tsx` -- each column (desktop `board-column.tsx:140`, archived via `BoardColumnView`, phone `status-tabs.tsx:271`, all four panels mounted, off-screen ones translated) renders `CardList`: call `useEntrance` on the scroll body; card wrappers carry `data-hash` and the FLIP's transform, so do not animate them.
- `src/features/board/board-card.tsx:60-112` -- card root button is the rise target (`data-entrance`); bar fill at `:106-110` (`style.width` percent) gets a marker and `origin-left`; fix the comment at `:19-20`.
- `src/features/detail/overview.tsx:88-96` -- `HeroBlock`'s 64px `StatusCircle`: `useEntrance` on the hero with `rise: false`.
- `src/styles.css:310-325` -- existing `animate-rise` keyframes (login, toast) stay; the entrance does not use CSS classes.
- `scripts/trace-board-collapse.mjs` -- pattern for the new local-only trace script (spawn fake-qbit on its own port, `data=many`, Playwright Chromium, CDP tracing, JSON plus summary image).
- `e2e/fixtures.ts`, `e2e/board.spec.ts` -- e2e fixture (CSP and console checks) and fake mode switching to reuse.

## Tasks & Acceptance

**Execution:**
- `src/lib/entrance.ts` + `src/lib/entrance.test.ts` -- pure timings, visibility, row ordinals, sweep decision -- every matrix branch of the decision and grouping tested.
- `src/shared/ui/entrance-motion.ts` (+ test if logic beyond calls) -- DOM helpers above -- keeps shared free of state.
- `src/shared/ui/status-circle.tsx` -- arc marker, comment -- lets sweeps find arcs without geometry imports.
- `src/state/entrance.ts` + `src/state/entrance.test.ts` -- store, `replayEntrance()`, `useEntrance` -- vitest covers: generation starts unplayed; first ready claims; join within `JOIN_MS`; late surface skips; `replayEntrance()` bumps the generation and sets `startedAt`; mounted surface sweeps again after replay; hold released once after settle, on replay and on unmount; reduced motion and missing `animate` skip with no hold.
- `src/features/list/torrent-list.tsx`, `torrent-row.tsx` -- wire `useEntrance`, mark rise target -- list entrance.
- `src/features/board/card-list.tsx`, `board-card.tsx` -- wire per list, mark targets, bar marker -- board entrance.
- `src/features/detail/overview.tsx` -- hero spin -- detail entrance.
- DOM tests (`torrent-list.dom.test.tsx`, `torrent-board.dom.test.tsx`, `detail.dom.test.tsx`, or a new entrance dom test) -- stub `Element.prototype.animate`, `matchMedia` and rects -- assert: visible rows get rise with delays 0, 60, 120...; arcs get a `strokeDashoffset` from-keyframe equal to `stroke-dasharray`; rows outside the viewport and seeding/done circles get none; a rerender with new maindata, a sort change and prev/next start no new animations; `replayEntrance()` starts them again; reduced motion starts none.
- `e2e/entrance.spec.ts` -- fake-qbit `sample` (and `many` for scroll) -- after load `document.getAnimations()` includes animations on row/card buttons and arcs; after they finish, changing sort or scrolling adds none; a `reducedMotion: 'reduce'` context has none; zero CSP violations and console errors as in the fixture.
- `scripts/trace-entrance.mjs` -- local only, never CI -- fake-qbit `many` (4165 torrents): for desktop 1440x900 and phone 390x844, list and board, record a Chrome trace from navigation to 2.5s after first data; report long tasks (> 50ms) split into "before the first sweep" and "from the sweep to the last animation end", the number of ring animations running at once versus visible circles, and capture a frame sequence (pause all entrance animations and step `currentTime` to 0, 150, 300, 600, 900, 1500ms; screenshot each) into `e2e-output/screenshots/2-9/`; write a JSON summary.

**Acceptance Criteria:**
- Given the app opens and data replaces the skeleton, when downloading, stalled or paused circles are visible in list rows, board cards or the detail, then their arcs turn from 0 to the current progress over 0.9s with `cubic-bezier(.2,.8,.2,1)` via `stroke-dashoffset`, and only visible circles turn.
- Given the same moment, when rows and cards appear, then the visible ones rise 10px and fade in over 0.5s, 60ms apart per row, animating only `transform` and `opacity`.
- Given Epic 3 calls `replayEntrance()`, when surfaces are mounted, then the spin and rise play again for what is visible; sort changes, prev/next and the 5s refresh never replay.
- Given the trace script on 4165 fake torrents, when it runs, then no task from the first sweep to the last animation end exceeds 50ms, and ring animations running at once never exceed the visible circles. Any task over 50ms before the sweep is reported with numbers in the Auto Run Result and as a `deferred` item (it predates this story's work only if the same script on `baseline_revision` shows it too), never silently dropped.
- Given lint, typecheck, vitest, build, Playwright and `check.sh`, when run, then all pass.

## Spec Change Log

- 2026-11-17, implementation: the DOM helpers live in `src/shared/entrance-motion.ts`, not `src/shared/ui/`. The eslint rule `SHARED_UI_BAN` forbids `src/state` (the hook) from importing `src/shared/ui`; `src/shared` stays free of state as the Code Map asks. Test-only stubs for `Element.animate` and reduced motion are in `src/state/entrance-testing.ts`, shared by the state and feature DOM tests. happy-dom 21 does implement `Element.animate`; its boxes are empty, so nothing counts as visible and other DOM tests start no entrance animation.
- 2026-11-17, first review pass: `replayEntrance()` starts the new generation with `startedAt: null`, not `now`, and the first ready surface claims it. Triggered by the replay-skip findings (a commit over JOIN_MS after the call skipped every surface). Avoids a replay that silently does nothing. KEEP: claim on first ready sweep; join within JOIN_MS; the intent's clause "every mounted surface sweeps it on its next commit" is the governing rule. Epic 3 must call `replayEntrance()` after the new category's rows commit (documented on the function).

## Review Triage Log

### 2026-11-17: Review pass
- verdicts: 31 findings, high 0, medium 11, low 15, false 4, maybe-false 1
- findings:
  - `[low]` `[patch]` (intent) Trace counted long tasks only from shortly before the sweep, while the AC is about opening the App : script now counts from `navigationStart` on every renderer main thread to the last animation end; rerun shows 0 tasks over 50ms.
  - `[false]` `[reject]` (intent) Real-phone 60fps check is not in the diff : the AC assigns that check to Alex on his phone; nothing in the diff can or should do it.
  - `[medium]` `[patch]` (intent) Mid-poll proof used a direct attribute write, not React : grouped with the verification-gap finding below; DOM test added that polls mid-turn through React.
  - `[medium]` `[patch]` (intent) Epic 3 trigger could skip when the new rows commit late : grouped with the replay entry below.
  - `[low]` `[reject]` (intent) No e2e opens the detail at load : DOM tests cover hero spin, prev/next and late open; a new e2e flow is more than a direct correction for a rarely-hit path.
  - `[false]` `[reject]` (intent) Board bar animation is not in the AC : it is a logged Claude 代決 using `transform` only; not a defect.
  - `[medium]` `[patch]` (blind) Detail hero never spins under StrictMode (dev) : cleanup now resets `playedRef` when it cancels an unsettled run, so the remount joins; StrictMode test added (fails with the fix disabled).
  - `[medium]` `[patch]` (blind) `replayEntrance()` set `startedAt` at call time, so surfaces committing over 150ms later skipped the replay : replay now leaves `startedAt: null` and the first ready surface claims; tests for a late commit and a replay before any claim.
  - `[low]` `[reject]` (blind) A surface that animates nothing still starts the join clock : all surfaces become ready in the same or the immediately following synchronous commit, well inside 150ms; fixing adds a branch for no observed harm.
  - `[false]` `[reject]` (blind) Phone hero in the sheet may be off-screen at sweep time : the hero's container is the hero block itself and, at the sheet's first frame (`translateY(60%)` of a 70% sheet), the hero sits around 85% of an 844px viewport, so `isVisible` passes.
  - `[low]` `[reject]` (blind) No cap on total stagger for very tall windows : the AC sets 60ms per row with no cap; Alex's screens show about 11 to 14 rows; a clamp would deviate from the spec.
  - `[low]` `[patch]` (blind) Trace does not prove the last animation ends inside the trace window; frame timing not measured : `lastAnimationEndInsideTrace` added and required for `ok`; frame timing is left to Alex's phone check as the AC says.
  - `[medium]` `[patch]` (blind) Two e2e checks race the 0.9s ring on slow runners : init script now pauses entrance animations at creation and the tests step `currentTime`.
  - `[low]` `[patch]` (blind) Reduced-motion e2e could pass before anything rendered : now waits for `[data-entrance]` count > 0 on list and board.
  - `[low]` `[reject]` (blind) No phone-width e2e : the board DOM test covers the off-screen panels; a phone e2e suite is new scope for a path unit-tested already.
  - `[low]` `[patch]` (blind) AD-11 URLs missing for TanStack Store and the virtualizer's `scrollRect` : URLs added in `src/state/entrance.ts`, `torrent-list.tsx`, `card-list.tsx`.
  - `[low]` `[reject]` (blind) `scaleX` squashes the 4px bar's round caps early in the grow : barely visible for a fraction of a second; `clip-path` would repaint per frame, against the transform-only rule.
  - `[low]` `[reject]` (blind) `stubReducedMotion` is thin and lives in `src/state` : test helper ergonomics only; no caller breaks.
  - `[low]` `[patch]` (blind) `trace-entrance.mjs --keep` without a value crashes late : now exits with a usage error (code 2) before starting.
  - `[low]` `[patch]` (blind) Over-long comment line in `board-card.tsx` and out-of-order import in `torrent-list.tsx` : rewrapped and reordered.
  - `[medium]` `[patch]` (edge) Replay before generation 1 was claimed made the first-load entrance skip : fixed by the replay entry above (`startedAt: null`).
  - `[medium]` `[patch]` (edge) Replay join measured from call time : same root cause as the replay entry; fixed there.
  - `[low]` `[reject]` (edge) First data empty means the list entrance plays later when the first torrent appears : Alex runs about 4165 torrents; an empty first list is not an everyday state and the fix adds a branch at the list level.
  - `[false]` `[reject]` (edge) A pin-scroll commit could also sweep : a sweep only runs on the first ready commit or a replay, and a pin exists only during an auto-collapse, which cannot be active on first load.
  - `[maybe-false]` `[defer]` (edge) Desktop list-panel hero may mount on a follow-up commit more than 150ms after the list claims on slow devices : would need a trace on a slow machine of the commit gap between the list's claim and the panel hero's mount; medium if true.
  - `[low]` `[reject]` (edge) Trace script does not detect a busy port or an early fake-qbit exit : local-only tool; it fails loudly after its health wait.
  - `[medium]` `[patch]` (edge) e2e race on live `getAnimations()` : same root cause as the blind e2e race entry; fixed there.
  - `[medium]` `[patch]` (edge, claim) Mounted surfaces can miss a replay : same root cause as the replay entry; fixed there.
  - `[low]` `[reject]` (edge, claim) Code Map points to `src/shared/ui/entrance-motion.ts` : the fix is a spec edit; the move is already recorded in the Spec Change Log.
  - `[medium]` `[patch]` (verification-gap) No test proves a poll mid-spin keeps the turning arc : DOM test added: the arc stays connected, its offset becomes `ringOffset(0.6)`, no new `animate` call.
  - `[medium]` `[patch]` (verification-gap, other) StrictMode cancels the hero spin in dev : same root cause as the blind StrictMode entry; fixed there.

### 2026-11-18: Review pass (follow-up)
- verdicts: 35 findings, high 0, medium 5, low 23, false 6, maybe-false 1
- findings:
  - `[false]` `[reject]` (intent) `replayEntrance()` leaves `startedAt: null` where the contract says `now` : the contract's own clause "every mounted surface sweeps it on its next commit" fails under `now` for a commit over JOIN_MS late; the epics AC ("Epic 3 換分類時呼叫就會再轉一次") is met; recorded in the Spec Change Log.
  - `[low]` `[reject]` (intent) No test asserts the first painted frame is the animation's first frame : needs a paint-level harness; the layout-effect sweep makes it structural and the trace frames show the start state.
  - `[medium]` `[patch]` (intent) Hero joining the list on a `hash` load is untested : grouped with the verification-gap finding below; e2e added.
  - `[false]` `[reject]` (intent) Hero may be off-screen during the panel or sheet slide-in : carried; the hero's container is its own block and at the slide's first frame it is inside the viewport.
  - `[low]` `[reject]` (intent) Phone panel visibility only unit-tested : carried; the board DOM test covers it.
  - `[low]` `[reject]` (intent) `replayEntrance()` has no e2e : no product caller until Epic 3; store, hook, list and board tests cover it.
  - `[low]` `[reject]` (intent) Order hold during the entrance has no e2e : unit and DOM tests cover hold and release; the freeze store itself is e2e-tested since 1.8.
  - `[low]` `[reject]` (intent) Status change mid-spin is simulated by a rejected `finished` : browsers keep the animation of a removed element until it ends, so `allSettled` resolves either way.
  - `[low]` `[reject]` (intent) Board/list switch or tab swipe within JOIN_MS would animate : a person cannot change sort or swipe within 150ms of the first data.
  - `[low]` `[patch]` (intent) Stale comment in the list replay test ("the replay's clock started a moment before this commit") : comment corrected.
  - `[medium]` `[patch]` (blind) A replay called before the new rows commit sweeps the old rows (`ready` stays true) : `replayEntrance()` now documents the calling contract (after the new rows commit, e.g. from a layout effect keyed on the category).
  - `[medium]` `[patch]` (blind) On replay the hero claims at once and could lock out a late list : same root cause; under the documented contract every surface sweeps in the same commit.
  - `[low]` `[reject]` (blind) A sweep that animates nothing still claims : carried; claiming is also what stops a surface mounted later (sort switch) from animating when nothing on screen had an arc.
  - `[false]` `[reject]` (blind) Phone hero in the sheet never spins : carried.
  - `[low]` `[reject]` (blind) Rows are clickable while still at opacity 0 during their delay : at most about 0.8s, rows already sit in their final place and a click opens the right torrent.
  - `[low]` `[reject]` (blind) `stubReducedMotion` is thin : carried.
  - `[low]` `[reject]` (blind) `src/state/entrance-testing.ts` imports vitest in the src tree : only test files import it; the build passes and nothing reaches the bundle.
  - `[low]` `[patch]` (blind) TanStack Store link is `latest` and names `useStore` : now cites the pinned 0.11.2 source for `useSelector` and `createStore`.
  - `[low]` `[patch]` (blind) Trace `lastEnd` coerces a null `startTime` to 0 : null start times skipped; trace rerun.
  - `[low]` `[reject]` (blind) Trace `ok` counts rings in their delay and visible circles only at the first call : can only cause a false failure, never a false pass; the run reports `ok: true`.
  - `[low]` `[reject]` (blind) Trace hides fake-qbit's stderr : carried.
  - `[low]` `[reject]` (blind) Board stagger assertions round the delays : the exact shift is unit-tested in `entrance.test.tsx`; rounding keeps the browser test stable.
  - `[low]` `[reject]` (blind) No phone e2e in CI : carried.
  - `[low]` `[reject]` (blind) The bar reuses `RING_MS` : the bar grows with its ring by design (Claude 代決); naming only.
  - `[maybe-false]` `[defer]` (edge) Hero claims before the list is ready and the list may skip after 150ms : carried; already the deferred item; the proposed guard would let a later-mounted surface animate when nothing had an arc.
  - `[medium]` `[patch]` (edge) Replay animates stale rows when new rows commit later : same root cause as the blind replay entry; fixed there.
  - `[low]` `[patch]` (edge) An arc outside the scroll box spins when its row is only partly visible : arcs and bars are now visibility-checked on their own rect; unit test added.
  - `[low]` `[reject]` (edge) No stagger cap : carried.
  - `[low]` `[patch]` (edge) Trace null `startTime` : same as the blind trace entry; fixed there.
  - `[false]` `[reject]` (edge, claim) Replay does not set `startedAt` : same as the intent entry above.
  - `[low]` `[patch]` (edge, claim) Partly visible rows spin hidden rings : same root cause as the arc visibility entry; fixed there.
  - `[low]` `[reject]` (edge, claim) Code Map path `src/shared/ui/entrance-motion.ts` : carried; the fix is a spec edit, the move is in the Spec Change Log.
  - `[medium]` `[patch]` (verification-gap) No browser test opens with `hash` on a torrent with an arc : e2e added; the hero spin's delay is within (-150, 0] and the list's delays stay [0, 60, 120, 180].
  - `[false]` `[reject]` (verification-gap, other) Mutation check of the `ready` gate : the reviewer confirmed 7 tests fail when the gate is removed; not a defect.
  - `[false]` `[reject]` (verification-gap, other) Double release of the hold : the release is once-only (`order-freeze.ts`); not a defect.

## Design Notes

Why WAAPI with one from-keyframe: the end keyframe is implicit, so it composites to the underlying value every frame. React keeps writing the live `stroke-dashoffset` attribute, and the spin lands on whatever is current at 900ms. A CSS transition would restart its 0.9s on every data change, and explicit keyframes would need rewriting on every poll.

```ts
arc.animate([{ offset: 0, strokeDashoffset: `${circumference}px` }], {
  duration: 900, delay, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards',
})
button.animate([{ offset: 0, opacity: 0, transform: 'translateY(10px)' }], {
  duration: 500, delay, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards',
})
```

The surface-level sweep (not per row) keeps the memoized rows and cards free of state, makes "mounted later means no animation" structural, and does one layout read per sweep.

Claude 代決 (list in the PR): ring duration 900ms (epic); `JOIN_MS` 150; ring delay equals its row's delay; stagger per surface and per board column; board bar grows with its ring; hero ring has no rise.

Docs (AD-11): MDN `Element.animate()` https://developer.mozilla.org/en-US/docs/Web/API/Element/animate ; implicit to/from keyframes https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API/Keyframe_Formats#implicit_tofrom_keyframes ; `Animation.finished` https://developer.mozilla.org/en-US/docs/Web/API/Animation/finished ; `Document.getAnimations()` https://developer.mozilla.org/en-US/docs/Web/API/Document/getAnimations ; `stroke-dashoffset` https://developer.mozilla.org/en-US/docs/Web/CSS/stroke-dashoffset ; `prefers-reduced-motion` https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion ; React `useLayoutEffect` https://react.dev/reference/react/useLayoutEffect ; TanStack Virtual 3.14.26 / virtual-core 3.19.11 `scrollRect`, `range` https://unpkg.com/@tanstack/virtual-core@3.19.11/src/index.ts ; TanStack Store `createStore` as used by `src/state/order-freeze.ts`; Playwright `reducedMotion` https://playwright.dev/docs/api/class-browser#browser-new-context-option-reduced-motion .

## Verification

**Commands:**
- `source ~/.nvm/nvm.sh && nvm use && npm run lint && npm run typecheck` -- expected: no errors (boundaries included)
- `source ~/.nvm/nvm.sh && nvm use && npm test` -- expected: all pass, new entrance tests included
- `source ~/.nvm/nvm.sh && nvm use && npm run build && npx playwright test` -- expected: all pass, zero CSP violations
- `source ~/.nvm/nvm.sh && nvm use && node scripts/trace-entrance.mjs` -- expected: JSON summary with no task over 50ms in the animation window; frames written
- `bash .claude/skills/next-story/check.sh` -- expected: every line ok

## Auto Run Result

Status: done (first review pass)

**Summary.** At the skeleton-to-data moment, and again on `replayEntrance()` (the Epic 3 trigger), each mounted surface (list rows, each board card list, the detail hero) sweeps once: visible rows and cards rise 10px and fade in 60ms apart per row, visible rings (downloading, stalled, paused) turn from empty over 0.9s, board bars grow with their rings. All via Web Animations with one from-keyframe, so a poll mid-turn lands on the newest value. The order is held through `holdOrderForAnimation()` until the animations settle. Anything mounted later draws as is. Reduced motion: nothing animates.

**Files.**
- `src/lib/entrance.ts` (+test): timings, `JOIN_MS`, row grouping, visibility, sweep decision.
- `src/shared/entrance-motion.ts`: DOM helpers (find targets, rise, spin, grow, reduced motion).
- `src/state/entrance.ts` (+test), `src/state/entrance-testing.ts`: store, `replayEntrance()`, `useEntrance`, test stubs.
- `src/shared/ui/status-circle.tsx`: `data-progress-arc` marker.
- `src/features/list/torrent-list.tsx`, `torrent-row.tsx`: list wiring, rise target.
- `src/features/board/card-list.tsx`, `board-card.tsx`: board wiring, rise target, bar marker and `origin-left`.
- `src/features/detail/overview.tsx`: hero ring spin.
- DOM tests in list, board and detail; `e2e/entrance.spec.ts`; local-only `scripts/trace-entrance.mjs`.

**Review.** 31 findings: patched 4 medium entries (replay claim, StrictMode reset, e2e race, mid-poll DOM test) and 6 low ones (trace from navigation start and window check, reduced-motion wait, `--keep` validation, AD-11 URLs, comment wrap and import order). Deferred 1 (panel hero join on slow devices, unverified). Rejected 15 low or false with reasons in the triage log.

**Follow-up review: recommended.** Patched by verdict: medium 4, low 6, high 0. The named risk: the hook's state machine changed after review (replay now claims on the first ready sweep; the StrictMode cleanup resets `playedRef`), so a second pass should re-check claim, join, replay and cleanup together.

**Verification (2026-11-17).** `npm run lint`, `npm run typecheck`: clean. `npm test`: 99 files, 2285 tests passed. `npm run build` then `npx playwright test`: 69 passed, 0 CSP violations. `check.sh`: all ok. `node scripts/trace-entrance.mjs` on 4165 fake torrents (desktop 1440x900 and phone 390x844, list and board): 0 tasks over 50ms from navigation start to the last animation end, rings running at once equal visible circles, `ok: true`.

**Residual risks.** Smoothness on Alex's real phone and tablet is unchecked (headless Chromium only). On real hardware the page takes longer from navigation to first data than locally. The board animates a 0-to-0 bar on a card at 0%, which is invisible.

### Follow-up pass (2026-11-18)

Status: done. 35 findings: patched 2 medium entries (replay calling contract documented; e2e for opening with `hash` on a torrent with an arc) and low ones (arc and bar visibility per element, pinned TanStack Store source links, trace null start times, a stale test comment). Deferred item carried, not re-added. Follow-up review: not recommended (no high patched on a follow-up pass). Trace rerun: 0 tasks over 50ms from navigation start to the last animation end on all four runs, `ok: true`.
