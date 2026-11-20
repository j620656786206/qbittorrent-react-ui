---
title: 'Story 5.1: Location tag and media library'
type: 'feature'
created: '2026-11-21'
status: 'done'
baseline_revision: 'c51c229037301f79511a28b680fe201320c62fae'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Location tags on list rows, board cards, the detail's 儲存位置 block and the 儲存路徑 big value still show Epic 1's stand-in (the path's last two folders). Alex cannot see which torrents already sit in a media library.

**Approach:** Add common-path matching to `src/lib/paths.ts`: the tag name is the longest matching common path's `name` (folder boundary, normalized), and the tag is "media library" when any matching common path has `mediaLibrary`. A `src/state` hook builds one memoized resolver per `['settings']` common-path list, so each distinct `save_path` is resolved once. Every tag site uses it, and `LocationTag` gains the media-library look (purple, only for media library).

## Boundaries & Constraints

**Always:**
- Matching (Epic 5 shared decisions): paths compared after `normalizeSavePath` (`src/shared/save-path.ts`); a common path matches when the save path equals it or lies under it at a folder boundary (`/data/media/tv` does not match `/data/media/tv2`); the name comes from the longest matching common path; media library is true when any matching common path (outer or inner) has `mediaLibrary`; no match falls back to the existing last-two-folders label.
- Path logic stays in `src/lib/paths.ts` (AR-41). No `startsWith` path comparison in features or state.
- Look (DESIGN.md `location-tag`, lines 257-264, 450, 625): normal tag keeps the outline and `text-muted`; media library in light mode is `media-library-tint` background, `media-library` text, weight 600, no border; in dark mode only bold purple text (the dark `--rt-media-library`) and the folder icon, no background, no border. Purple appears nowhere else. Tags only display; not clickable.
- The 儲存路徑 big value shows the same name (muted style unchanged; title keeps the full path).
- Long names truncate inside the tag; rows and cards never grow or wrap because of a tag (design-advisor, taste-log principle 2).
- Memoization: one resolver per common-path list identity; it caches per raw `save_path` string, so a poll that leaves paths unchanged costs no matching, and memoized rows and cards keep receiving the same `{ name, mediaLibrary }` object while nothing changed. A change to common paths or to a torrent's `save_path` updates the tag on the next render.
- Screenshots and fixtures use fake data only: code names X and mteam-X, fake `/data/...` paths.
- AD-15: nothing writes to qBittorrent.

**Never:**
- No common-path editing UI (5.2, 5.4), no new server function.
- No purple outside the media-library tag.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| P1 equal | save `/data/media/tv`, common `/data/media/tv` 影集媒體庫 (media) | 影集媒體庫, media | None |
| P2 child | save `/data/media/tv/Show.S01` | 影集媒體庫, media | None |
| P3 boundary | save `/data/media/tv2/x`, common `/data/media/tv` | No match: `tv2/x` | None |
| P4 nested | commons `/data/media` 媒體 (media) and `/data/media/tv` 影集 (not media); save `/data/media/tv/x` | 影集, media (outer is media) | None |
| P5 inner media only | commons `/data/media` (not media), `/data/media/tv` (media); save `/data/media/movies/x` | 媒體, not media | None |
| P6 trailing slash | save `/data/media/tv/`, common `/data/media/tv/` | Match | None |
| P7 none | no common paths | last two folders | None |
| P8 root | common `/` named 全部 | matches every path unless a longer one does | None |
| P9 messy save path | save `/data//media/./tv/x` | normalized before matching | None |
| R1 settings change | common paths edited while open | tags update without reload | None |
| R2 save_path change | a torrent moves | its tag updates | None |
| R3 perf | 4165 torrents, 50 common paths, many distinct paths, change common paths | recompute plus repaint under 100 ms on the dev machine; number recorded | None |

</intent-contract>

## Code Map

- `src/lib/paths.ts`: `locationLabel(savePath)` (9-13, last two folders) and `isInFolder(path, folder)` (20-23, folder boundary on normalized paths; the only `startsWith` path check, fine inside lib). Tests `src/lib/paths.test.ts` (P1 locationLabel, isInFolder).
- `src/shared/save-path.ts:18` `normalizeSavePath`; `src/shared/settings.ts:40-46` `commonPathSchema { path, name, mediaLibrary }`, `MAX_COMMON_PATHS = 50`, `CommonPath`.
- `src/state/settings.ts` `useSettings()` (90-97) returns `{ settings, ready, readFailed }`; `SETTINGS_KEY`.
- Tag sites (all call `locationLabel` today):
  - List: `src/features/list/list-model.ts` `rowModel()` sets `tag` (194, 212); `bigValue()` location branch (172-180); `rowProps` (280); `torrent-row.tsx` `SecondLine` renders `LocationTag` (218-227), `BigValueCell` (189); `TorrentRow` is `memo` (62) and calls `rowModel()` per render (81); rows get props from `torrent-list.tsx:415-423`.
  - Board: `src/features/board/board-model.ts` `cardModel()` `location` (183, 203); `board-card.tsx:174` with `TAG_CLASS` (49-50); `BoardCard` is `memo` (77); props from `card-list.tsx:401-413`.
  - Detail: `src/features/detail/overview.tsx` `SavePathBlock` (224, tag at 248-251).
- `src/shared/ui/location-tag.tsx:8` `LocationTag({ label, className })` (folder svg plus truncating span); add a media-library variant.
- Tokens: `src/styles.css` `--rt-media-library` (31 light, 61 dark), `--rt-media-library-tint` (32, 62), theme `--color-media-library` (144), `--color-media-library-tint` (145). There is no separate `media-library-dark` token; dark overrides the variable. Use the project's existing dark-variant mechanism for "no background, no border in dark".
- Specs: UX DESIGN.md (`_bmad-output/planning-artifacts/ux-designs/ux-react-torrent-2026-11-13/DESIGN.md`) 46-49, 257-264, 450, 487, 625, 704; EXPERIENCE.md 90, 284, 288-306 (example common paths, use them for fixtures with fake names).
- Fake and e2e: `scripts/fake-qbit.mjs` `controlSettings` (1406-1420) only resets; add a seed (e.g. `POST /__fake/settings?seed=<name>`) writing a `settings.json` with common paths under `/data` (the app serves only paths under `SAVE_ROOTS=/data`). `data=many` has only two distinct save paths (344-420); the perf run needs a variant with many distinct paths (e.g. a `paths=varied` mode). `e2e/fixtures.ts` `freshSettings` resets settings before every test (37-43, 153-156).
- Perf precedent: `scripts/trace-category-switch.mjs` (100 ms budget, `performance.now()` plus rAF plus MessageChannel, JSON summary).

## Tasks & Acceptance

**Execution:**
- `src/lib/paths.ts` (+ test): `locationOf(savePath, commonPaths)` returning `{ name, mediaLibrary }` and `createLocationResolver(commonPaths)` (normalizes the common paths once, caches per raw save path). Tests P1 to P9.
- `src/state/locations.ts` (new, + test): `useLocationResolver()` from `useSettings()`; stable while the common-path list is unchanged; with settings not loaded it resolves like no common paths.
- `src/shared/ui/location-tag.tsx` (+ test): `mediaLibrary` prop with the light and dark looks.
- List, board, detail, big value: take the location from the resolver (pass it as a prop to memoized rows and cards so a settings change re-renders them), replace `locationLabel` at every site. Update the tests that asserted the last-two-folders label where common paths now apply.
- `scripts/fake-qbit.mjs`, `e2e/fixtures.ts`: the settings seed and a varied-paths data mode.
- `e2e/location-tags.spec.ts` (new): tags in list, board card and detail for normal, media library and no-match; R1 by seeding new settings and refocusing the window (settings refetch on focus); dark mode has no tag background or border; no horizontal overflow at 390px.
- `scripts/trace-location-tags.mjs` (new): 4165 torrents with many distinct paths, 50 common paths, change the common paths, time from the settings response to the next frame after the visible tags change; JSON summary. Record the number in Design Notes.
- Screenshots (`screenshots/5-1/`): desktop 1440 and phone 390, light and dark: normal, media library and last-two-folders tags in the list, a board card and the detail's 儲存位置 block.

**Acceptance Criteria:**
- Given common paths with a media-library entry, when the list, board and detail render, then matching tags show the common path's name and media-library tags are purple per mode, and nothing else is purple.
- Given 4165 torrents and 50 common paths, when the common paths change, then the tags update within 100 ms on the dev machine, and the number is recorded.

## Spec Change Log

## Review Triage Log

### 2026-11-21: Review pass
- verdicts: 22 findings: high 0, medium 0, low 18, false 4, maybe-false 0
- findings:
  - `[low]` `[patch]` (blind) Duplicate common paths tie silently: "first in the list wins" documented and tested (5.2 decides on refusing duplicates).
  - `[low]` `[patch]` (blind) The `Location` type shadows the DOM global: renamed `TagLocation`.
  - `[low]` `[patch]` (blind) A truncated name can never be read: the tag has a `title` with the full name.
  - `[low]` `[patch]` (blind) Media library is colour only for screen readers: visually hidden 「，媒體庫」.
  - `[low]` `[patch]` (blind) No long-name truncation test: `library-long` seed; e2e checks row height, card height and the cut name with its title.
  - `[low]` `[reject]` (blind) Gaps in the purple checks (raw hex, other border sides): the token rule and the computed-style scans cover the sites; widening them is test scope, not a defect.
  - `[low]` `[reject]` (blind) Sorting by 儲存路徑 can split a name group: sorting stays on the raw path (Epic 2); the big value shows the name with the full path as title.
  - `[low]` `[patch]` (blind) The p95 of 6 rounds is the max: dropped, median and max reported.
  - `[low]` `[patch]` (blind) Board and detail have no R2 test: added.
  - `[low]` `[reject]` (blind) `grow`/`add` torrents keep default paths under `paths=varied`: fake-data nuance; the trace uses `data=many`.
  - `[low]` `[patch]` (blind) Seeds are never checked against the schema: seeds moved to `scripts/fake-settings-seeds.mjs`, parsed by a vitest with `settingsSchema`.
  - `[low]` `[reject]` (blind) The screenshot path into the commit is undocumented: same flow as every earlier story.
  - `[low]` `[patch]` (blind) Unbounded cache and a duplicated empty resolver: cache clears at 20,000 paths; one shared `NO_COMMON_PATHS_RESOLVER`.
  - `[low]` `[patch]` (intent) The eager 4165-path number is not rerunnable: an R3 vitest (median of five under 50 ms) replaces the sentence.
  - `[false]` `[reject]` (intent) Another device's edit shows only on refocus: settings refetch on focus by design (3.1); the AC's "next screen update" is the next render after the settings change.
  - `[low]` `[patch]` (intent) Long names untested: same fix as the blind row.
  - `[low]` `[patch]` (intent) 儲存位置 screenshots show only media library: normal and no-match detail shots added.
  - `[low]` `[reject]` (intent) The purple scan does not cover settings, add, menus: same as the blind row.
  - `[false]` `[reject]` (intent) DESIGN.md names a `media-library-dark` token: the dark override of `--rt-media-library` has the same value; e2e checks the computed colour.
  - `[false]` `[reject]` (intent) A Prettier reflow in detail.dom.test.tsx: formatting only.
  - `[low]` `[patch]` (edge) A raw save path with `..` matches wrongly: such paths never match (last two folders, not media library); tested.
  - `[false]` `[reject]` (edge) The cache grows forever: duplicate of the blind row (fixed there).

## Design Notes

Claude 代決 (Alex can veto):
- Settings not loaded yet: tags show the last-two-folders fallback until they arrive.
- Fixture common paths follow EXPERIENCE.md's example table with fake folders (影集媒體庫 `/data/media/tv` media library, PT 做種 `/data/torrent/mteam-seed`, and similar), never real paths.
- The media-library tag keeps a 1px transparent border, so both looks have the same height and rows and cards line up.
- The list row's tag is capped at half the second line on desktop too (it was uncapped there), so a long common-path name is cut inside the tag instead of pushing size and speed out of the line.
- The tag owns its look: callers pass only the box (height, padding, radius, type); `LocationTag` adds the outline and `text-muted`, or the media-library classes. It sets `data-media-library` on media tags for tests, a `title` with the full name (a long name is cut), and visually hidden 「，媒體庫」 on media tags for screen readers.
- Matching edge cases: two common paths that normalize to the same folder resolve to the first in the list (5.2 decides whether to refuse duplicates); a save path with a `..` segment never matches (last two folders, not media library).
- The resolver cache starts over past 20,000 distinct save paths (`LOCATION_CACHE_LIMIT`); one shared `NO_COMMON_PATHS_RESOLVER` serves before settings load and in tests.
- The shared type is `TagLocation` (not `Location`, which would shadow the DOM global).

R3 timing (2026-11-21, `node scripts/trace-location-tags.mjs`, headless Chromium 1440 x 900, `data=many&paths=varied`: 4165 torrents with 4165 distinct save paths, 50 common paths, every name and every 媒體庫 flipped each round; from the settings answer arriving in `fetch` to the first painted frame with the new tags):
- List: median 5.5 ms, max 6.3 ms over 6 rounds (every visible tag changed each round).
- Board: median 6.4 ms, max 8.6 ms over 6 rounds.
- The resolver is lazy, so the page only resolves mounted rows and cards. The eager case (all 4165 paths against 50 common paths) is pinned by the R3 test in `src/lib/paths.test.ts`, which asserts the median of five full recomputes stays under 50 ms.

AD-11 docs:
- React `memo` and `useMemo`: https://react.dev/reference/react/memo , https://react.dev/reference/react/useMemo
- TanStack Query `refetchOnWindowFocus`: https://tanstack.com/query/v5/docs/framework/react/guides/window-focus-refetching
- Tailwind 4 dark variant: https://tailwindcss.com/docs/dark-mode

## Verification

**Commands:**
- `source ~/.nvm/nvm.sh && nvm use && npm run lint && npm run typecheck`: expected to pass.
- `source ~/.nvm/nvm.sh && nvm use && npm test`: all pass.
- `source ~/.nvm/nvm.sh && nvm use && npm run build && caffeinate -dimsu npx playwright test`: all pass.
- `source ~/.nvm/nvm.sh && nvm use && node scripts/trace-location-tags.mjs`: under 100 ms.
- `bash .claude/skills/next-story/check.sh`: every line ok.

## Auto Run Result

Status: done (one review pass; follow-up not recommended: no high or medium patched).

**Change.** `src/lib/paths.ts` resolves a save path to `{ name, mediaLibrary }` (longest matching common path at a folder boundary, media library if any match is ticked, last two folders otherwise) through a cached resolver; `src/state/locations.ts` builds one per common-path list. List rows, board cards, the detail's 儲存位置 block and the 儲存路徑 big value use it. `LocationTag` has the media-library look (light: tint, purple 600; dark: purple text only), a full-name title and a hidden 「，媒體庫」.

**Review.** 22 findings. Patched: 14 low rows. Rejected: 4 false, 4 low with reasons above.

**Verification (2026-11-21, after the patches).**
- `npm run lint`: 0 errors; `npm run typecheck`: exit 0.
- `npm test`: 156 files, 3818 tests pass.
- `npx playwright test` on location-tags, detail, board, smoke: 49 passed (the full suite, 185 passed, ran before the patches).
- `node scripts/trace-location-tags.mjs`: list median 5.5 ms, max 6.3 ms; board median 6.4 ms, max 8.6 ms (budget 100 ms).
- `check.sh`: every line ok.
