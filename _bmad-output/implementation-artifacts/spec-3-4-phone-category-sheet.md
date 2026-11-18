---
title: 'Story 3.4: Phone category sheet'
type: 'feature'
created: '2026-11-18'
status: 'done'
baseline_revision: '95f27dbfc9ed3fbdd448559aee71ef543113d607'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-react-torrent-2026-11-15/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-2-desktop-category-tabs.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** On the phone (under 1024px) the category button in the third row is disabled, so Alex cannot change category or reach the settings page from the phone, and the 「（這個分類記住的）」 hint has no phone form.

**Approach:** Enable the phone category button to open a category sheet (the Story 2.2 bottom sheet in its fit-content mode) listing 「全部」 and the categories in Story 3.2's order, with a 「設定」 row at the bottom; picking a category behaves exactly like a desktop tab click, and when the app changed the sort a muted line under the third row says 「排序換成這個分類記住的：<sort name>」.

## Boundaries & Constraints

**Always:**
- Phone category button (`src/features/header/app-shell.tsx` `PhoneCategoryButton`): no longer disabled; shows 「<label> <count> ▾」 (count excludes 已整理, as the tabs), 44px pill, `aria-label` 「分類：<label>」, `aria-haspopup="dialog"`, `aria-expanded` while open.
- Category sheet: `BottomSheet` from `src/shared/ui/bottom-sheet.tsx` with `mode="fit"` and title 「分類」 (same patterns as `src/features/header/sort-sheet.tsx`: initial focus on the current row, focus returns to the button); rows 52px, name left (`body` 13px), count right (`text-muted`, tabular numbers); 「全部」 first, then the categories from the same source and order as the desktop tabs (`CategoryTabsContext` / `useCategoryTabs`, so categories with no torrents are not listed and the sticky emptied category behaves the same); the current category bold 700 with a check icon at the far left (others keep the icon's space so names line up); a `border` hairline, then a 「設定」 row with a gear icon. Names are plain text. Mockup: `_bmad-output/planning-artifacts/ux-designs/ux-react-torrent-2026-11-13/mockups/S03-category-sheet-phone.dc.html`.
- Picking a category: the sheet closes and the layout's `selectCategory` runs (same effects as a desktop tab: URL `category` with replace, remembered sort else 「狀態」, back to top, entrance replay). Picking the current category closes the sheet and changes nothing. 「設定」 closes the sheet and calls the layout's `openSettings` from `ListViewContext` (it carries the list search into `/settings` and marks `fromList` in history state; never navigate to `/settings` directly).
- Hint line: under the third row, `meta` 12px `text-muted`, text 「排序換成這個分類記住的：<the sort's name>」 (name from `src/shared/sort-fields.ts`, the same label the sort pill uses); shown under the same condition as the desktop hint (`rememberedHint` from `ListViewContext`, computed by 3.2's pure function); phone only (desktop keeps the pill suffix); in normal flow so it pushes the content down instead of covering the list.
- On `/settings` the phone button and sheet behave like the desktop header there (3.3 and the review fix): a pick goes to the list on that category.
- Screenshots for the PR at 390px, light and dark: the category button, the open sheet including the 「設定」 row, and the hint line; no horizontal scroll.

**Never:**
- No new sheet component or animation package; no change to the desktop tabs; no localStorage; no category reordering here (3.3 owns it).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Open | tap 「全部 4 ▾」 | sheet 「分類」, focus on the current row | No error expected |
| Pick | tap mteam-tv (remembered 做種時間 desc) | sheet closes; URL `category=mteam-tv&sort=seeding_time&dir=desc`; top; entrance; hint line 「排序換成這個分類記住的：做種時間」 | No error expected |
| Pick current | tap the bold row | sheet closes, nothing changes | No error expected |
| No remembered sort | pick a category never sorted | sort 狀態, no hint line (3.2's fallback rule) | No error expected |
| Manual pick after | open the sort sheet and pick | hint line disappears | No error expected |
| Settings | tap 「設定」 | sheet closes; `/settings` with the list search; back returns to the list | No error expected |
| Loading | tabs not known yet | button shows the URL's category without a count; sheet lists what is known or a busy skeleton | No error expected |
| Desktop | width ≥1024px | phone button and line not rendered | No error expected |

</intent-contract>

## Code Map

- `src/features/header/app-shell.tsx:96-105,162-200` -- third row with `PhoneCategoryButton` (disabled) and `PhoneSortPill`; add the sheet and the hint line here or in a new `category-sheet.tsx` next to `sort-sheet.tsx`.
- `src/features/header/sort-sheet.tsx:170-225` -- `BottomSheet` usage (`mode="fit"`, `initialFocus`, `returnFocus`, row classes); copy the row pattern.
- `src/shared/ui/bottom-sheet.tsx` -- the sheet API.
- `src/state/list-view.ts:40-80` -- `ListViewContext` (`view`, `selectCategory`, `rememberedHint`, `openSettings`, `settingsOpen`) and `useCategoryTabs`.
- `src/lib/category-tabs.ts` -- `categoryLabel` (「未分類」), tab list.
- `src/shared/sort-fields.ts` -- sort names; `src/features/header/sort-model.ts` builds the pill label.
- `src/features/header/category-tabs.tsx` -- desktop tabs and `LoadingTab` (shows the URL's category while loading).
- `e2e/category-tabs.spec.ts`, `e2e/settings-page.spec.ts`, `e2e/fixtures.ts` -- helpers for categories data, settings reset, phone viewport.

## Tasks & Acceptance

**Execution:**
- `src/features/header/category-sheet.tsx` (new) + DOM test -- sheet rows, order, current row, 「設定」 row, pick, pick current, settings.
- `src/features/header/app-shell.tsx` + test -- enabled button with count and `aria-expanded`, hint line (phone only, in flow).
- `e2e/category-sheet.spec.ts` -- at 390px: open, pick a category with a remembered sort (hint line shows and the list is below it), pick current, 「設定」 then back; no horizontal scroll; screenshots light and dark to `e2e-output/screenshots/3-4/`; CSP clean.

**Acceptance Criteria:**
- Given a phone width, when Alex taps the category button, then the 「分類」 sheet lists 「全部」 and the categories in the tab order with the current one bold and checked, and a 「設定」 row at the bottom.
- Given the sheet, when Alex picks a category, then the sheet closes and the list behaves exactly as a desktop tab click; picking the current one changes nothing; 「設定」 opens the settings page with back to this list.
- Given the app changed the sort on a switch, when the phone shows the list, then 「排序換成這個分類記住的：<name>」 appears under the third row and pushes the list down; a manual pick removes it.
- Given lint, typecheck, vitest, build, Playwright, `npm run audit:prod` and `check.sh`, when run, then all pass.

## Spec Change Log

- 2026-11-18, review pass: the hint line ends with the phone pill's text, so a direction-only switch reads 「排序換成這個分類記住的：做種時間 ↑」; the line is a polite live region and stays empty on `/settings`; on `/settings` the 「設定」 row is the current one in the sheet. KEEP: picks go through the layout's `selectCategory` and `openSettings`; the sheet lists the 3.2 tab list.

## Review Triage Log

### 2026-11-18: Review pass
- verdicts: 26 findings, high 0, medium 1, low 19, false 6, maybe-false 0
- findings:
  - `[medium]` `[patch]` (verification-gap) No test keeps the phone hint line off desktop : e2e turns the hint on, resizes to 1280px and asserts the line is not visible; the unit test anchors on a `data-testid`.
  - `[low]` `[patch]` (edge) A direction-only switch reads as a field change : the line includes the direction.
  - `[low]` `[patch]` (edge) The sheet shows no busy state while settings are pending : skeleton while tabs are unknown and the first answers are pending; name only after a failed load.
  - `[false]` `[reject]` (edge, claim) On `/settings` the current row leaves settings : the 3.3 review fix asks a click on the current category there to go back to the list.
  - `[false]` `[reject]` (intent) The current row on `/settings` navigates instead of doing nothing : same as above.
  - `[false]` `[reject]` (intent) A just-emptied selected category stays listed with 0 : the sheet uses the 3.2 tab list, whose sticky rule the epic defines.
  - `[low]` `[patch]` (intent) Scroll to top after a phone pick is not checked from the phone : e2e step added.
  - `[low]` `[reject]` (intent) Counts excluding 已整理 are not checked at the phone : inherited from the 3.2 tab counts, unit-tested there.
  - `[low]` `[reject]` (intent) The 13px name comes from the body style : the body style is the design token; no extra class needed.
  - `[low]` `[reject]` (intent) Focus outline, contrast and the ✕ size are not exercised : shared bottom sheet and focus styles, tested since 2.2.
  - `[false]` `[reject]` (intent) Screenshots are outside the diff : attached to the PR.
  - `[false]` `[reject]` (intent) The spec and sprint-status are outside the diff : committed with the story.
  - `[low]` `[patch]` (blind) The desktop e2e hint check proves nothing : same as the verification-gap entry; fixed there.
  - `[low]` `[patch]` (blind) Screen readers never hear the hint line : a polite live region.
  - `[low]` `[patch]` (blind) A direction-only change is misleading : same as the edge entry; fixed there.
  - `[low]` `[patch]` (blind) Two current rows on `/settings` : the 設定 row is the current one there.
  - `[low]` `[patch]` (blind) `data-category` is never read : removed.
  - `[low]` `[patch]` (blind) Scroll to top and entrance after a sheet pick are untested : scroll step added (the entrance replay goes through the shared, tested `selectCategory`).
  - `[low]` `[patch]` (blind) The hint line on `/settings` is undecided : hidden there.
  - `[low]` `[patch]` (blind) The position test depends on identical class strings : `data-testid` anchor.
  - `[low]` `[patch]` (blind) "Never on the desktop pill row" checks almost nothing : replaced by the e2e visibility check.
  - `[low]` `[patch]` (blind) The hint text is copied in four places : prefix constant exported and used.
  - `[false]` `[reject]` (blind) The diff leaves out the spec and sprint-status : committed with the story.
  - `[low]` `[patch]` (blind) `useCloseAtDesktop` sits in features/header without a direct test : moved to `src/shared/ui` with a unit test.
  - `[low]` `[patch]` (blind) A broken comment wrap : reflowed.
  - `[low]` `[patch]` (blind) The failed-first-load sheet state is untested : test added.

## Design Notes

Claude 代決 (list in the PR): the check icon's space is kept on every row so names line up; while the tab list is unknown the sheet shows a short busy skeleton.

Docs (AD-11): WAI-ARIA dialog (modal) pattern https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ ; TanStack Router navigation https://tanstack.com/router/latest/docs/framework/react/guide/navigation .

## Verification

**Commands:**
- `source ~/.nvm/nvm.sh && nvm use && npm run lint && npm run typecheck` -- expected: no errors
- `source ~/.nvm/nvm.sh && nvm use && npm test` -- expected: all pass
- `source ~/.nvm/nvm.sh && nvm use && npm run build && npx playwright test` -- expected: all pass, zero CSP violations
- `source ~/.nvm/nvm.sh && nvm use && npm run audit:prod` -- expected: passes
- `bash .claude/skills/next-story/check.sh` -- expected: every line ok

## Auto Run Result

Status: done

**Summary.** The phone category button opens a 「分類」 sheet (fit-content bottom sheet): 「全部」 and the categories in the tab order, the current one bold and checked, a 「設定」 row under a hairline. A pick works like a desktop tab; the current one closes the sheet; 「設定」 opens the settings page through `openSettings`. When the app changed the sort, 「排序換成這個分類記住的：<sort>」 shows under the third row, in flow and announced.

**Review.** 26 findings: patched 1 medium (a desktop test that really turns the hint on) and the low ones (direction in the line, live region, settings-page current row, busy state, scroll-to-top e2e, shared close-at-desktop hook with a test, prefix constant, `data-testid` anchor); rejected 7 (6 false, 1 low) with reasons; nothing deferred.

**Follow-up review: not recommended.** Patched by verdict: medium 1, no high.

**Decisions (Claude 代決).** Check-icon space kept on every row; row names read 「<name>，<count> 個」; rows are buttons with `aria-current`; busy skeleton only while the first answers are pending; on `/settings` 「設定」 is the current row.
