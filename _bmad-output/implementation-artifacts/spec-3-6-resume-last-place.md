---
title: 'Story 3.6: Open the app where it was left'
type: 'feature'
created: '2026-11-18'
status: 'done'
baseline_revision: '51ae818da69ac2618666399462d35a3e53cab5b8'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-react-torrent-2026-11-15/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-2-desktop-category-tabs.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Opening the app always lands on 「全部」 with the first row, so after closing and reopening Alex has to find his category and torrent again.

**Approach:** Add two per-device preferences in `src/lib/prefs.ts` (the last viewed category, and the last viewed hash per category), record them when the URL's `category` or `hash` changes, restore the category (with its remembered sort) when the app opens on a bare URL, and in list mode let the detail prefer the category's last viewed torrent before the first row.

## Boundaries & Constraints

**Always:**
- `src/lib/prefs.ts` (the only localStorage key table) gains `lastCategory` (a category key, `ALL` default) and `lastViewedHash` (a map of category key to a torrent hash, empty default), each read through zod (`categoryOrderEntrySchema` or `ALL` for the key, the shared hash pattern for hashes); a bad value or a throwing storage reads as absent and never errors; writes never throw. Cap the map (Claude 代決: keep at most 100 categories, dropping the oldest entries) so the stored value stays small. No feature code touches `localStorage`.
- Recording: when the URL's `category` changes (including back to 「全部」), store `lastCategory`; when the URL's `hash` changes to a torrent, store it under the current category in `lastViewedHash`. Only the list route records (not `/settings`). Per device only; nothing goes to the NAS.
- Opening on a bare URL (no `category`, `sort` and `hash`; `q` alone does not count as carrying a place): once maindata and settings are ready, switch to `lastCategory` (fallback 「全部」 when that category has no torrents any more, per 3.2's existence rule) with that category's remembered sort (else 「狀態」), writing `category` and `sort`/`dir` with `replace`. No entrance replay beyond the normal first entrance, no hint (this is not a tab switch: 3.2's hint cause stays `open`).
- A URL carrying `category`, `sort` or `hash` (reload, login return) is followed as is; remembered values never override it.
- List mode detail (desktop list panel, `fallbackFirst`): without a usable `hash`, the viewed row is the category's `lastViewedHash` when that hash is in the current shown list (not deleted, not 已整理, not filtered out by search), else the first row. This applies on open, on a category switch and on a sort change (replacing Story 2.4's "first row" rule there). The preferred row is not scrolled into view (PRD FR-16); keyboard ↑ ↓ (Story 3.7) will.
- Board mode never opens the detail panel automatically; the phone never opens the bottom sheet automatically (Claude 代決, already in the epic): the remembered hash is only used where `fallbackFirst` already shows a row.
- vitest covers the prefs read/write, bad values, throwing storage, the cap, and two devices (two storages) keeping their own values.

**Never:**
- No settings.json change, no server function, no syncing between devices, no auto-scroll to the preferred row, no automatic detail on the board or phone.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Record | switch to mteam-tv, click torrent A | `lastCategory = mteam-tv`, `lastViewedHash[mteam-tv] = A` | No error expected |
| Open bare | `/` with lastCategory mteam-tv (remembered 做種時間 desc) | URL becomes `?category=mteam-tv&sort=seeding_time&dir=desc` (replace); list panel shows A | No error expected |
| Vanished category | lastCategory has no torrents now | 「全部」 with its remembered sort | No error expected |
| A gone | A deleted, archived or filtered out | panel shows the first row | No error expected |
| URL wins | `/?sort=ratio` or `/?hash=B` or `/?category=X` | followed as is | No error expected |
| Switch in list mode | switch to X with lastViewedHash[X] = C in the list | panel shows C, list not scrolled | No error expected |
| Board | board mode on open or switch | no detail panel opens | No error expected |
| Phone | list on phone | no sheet opens | No error expected |
| Bad stored value | `lastCategory` is garbage, map has a bad hash | treated as absent | No error expected |
| Storage throws | blocked localStorage | behaves as today, no error | Silent |
| Two devices | separate storages | each keeps its own values | No error expected |

</intent-contract>

## Code Map

- `src/lib/prefs.ts` -- `PREF_KEYS`, `PREF_DEFAULTS`, `CODECS`, `readPref`, `writePref`, `isPrefKey`; add the two keys with JSON codecs validated by zod.
- `src/shared/categories.ts` (`ALL`, `categoryOrderEntrySchema`), `src/shared/torrent-hash.ts` (hash pattern).
- `src/routes/_authed.tsx` -- reads the URL search, builds the view, `selectCategory`, the fix effects on the list route; add the open-time restore (after maindata and settings are ready, bare URL only) and the recording effects.
- `src/state/list-viewed.ts` -- `useListViewed(order, { fallbackFirst, scope })` and `resolveListViewed` in `src/lib/detail-position.ts`; add a preferred hash used when there is no usable `hash` and `fallbackFirst` is set.
- `src/features/list/torrent-list.tsx` -- calls `useListViewed` with `fallbackFirst: panel !== undefined`.
- `src/lib/category-tabs.ts` -- `resolveCategory` / existence rule for the vanished-category fallback.
- `e2e/fixtures.ts` -- settings reset, login; add a helper to clear localStorage between tests if needed.

## Tasks & Acceptance

**Execution:**
- `src/lib/prefs.ts` + tests -- two keys, zod, cap, throwing storage, two storages.
- `src/lib/detail-position.ts` + tests -- preferred hash in `resolveListViewed`.
- `src/state/list-viewed.ts`, `src/features/list/torrent-list.tsx` -- pass the category's preferred hash.
- `src/routes/_authed.tsx` + route DOM tests -- recording, open-time restore, URL wins, vanished category, board and phone never auto-open.
- `e2e/resume.spec.ts` -- pick a category and a torrent, reload `/`: same category, its sort, the same torrent in the panel; a URL with `sort` is not overridden; board mode opens no panel; CSP clean.

**Acceptance Criteria:**
- Given Alex viewed a category and a torrent, when he opens the app on `/`, then that category returns with its remembered sort (URL filled with replace) and, in list mode, the detail shows that torrent (or the first row if it is gone).
- Given a URL with `category`, `sort` or `hash`, when the app opens, then the URL is followed.
- Given list mode, when Alex switches category or sort, then the detail shows that category's last viewed torrent if it is in the list, else the first row, without scrolling to it.
- Given board mode or the phone, when the app opens or the category changes, then no detail opens by itself.
- Given lint, typecheck, vitest, build, Playwright, `npm run audit:prod` and `check.sh`, when run, then all pass.

## Spec Change Log

- 2026-11-18, first review pass: (1) a hash is recorded only when the torrent is in that category's list (not 已整理); (2) off the list the restore stays pending and nothing is recorded; back on the list it runs if the URL is still bare; (3) bareness is decided from the search as typed when the app opened (the router drops invalid params before any route renders, so `src/state/opening-search.ts` keeps the opening search, read once); (4) a failed first maindata request gives the restore up; (5) the restore writes the normalized search once. KEEP: the URL wins over remembered values; the restore keeps the hint off; board and phone never auto-open.

## Review Triage Log

### 2026-11-18: Review pass
- verdicts: 30 findings, high 0, medium 3, low 21, false 6, maybe-false 0
- findings:
  - `[false]` `[reject]` (intent) "Opening the app" is a fresh mount of the list route : that is what the AC describes (a bare URL when loading finishes).
  - `[false]` `[reject]` (intent) `q` alone or `dir` alone counts as bare : the AC names `category`, `sort` and `hash`; recorded as Claude 代決; an e2e now pins the `q` case.
  - `[false]` `[reject]` (intent) The restore writes category and sort, not `hash` : the AC says the URL is filled with category and sort and the panel shows the remembered torrent.
  - `[false]` `[reject]` (intent) "Category no longer exists" means no torrent has it : the same existence rule as the 3.2 tabs.
  - `[false]` `[reject]` (intent) Bad map entries are dropped one by one : one bad entry should not lose every other category's place.
  - `[low]` `[reject]` (intent) A real close and relaunch and a phone viewport are not tested : the restore reads only localStorage on mount; the DOM tests cover the phone branch.
  - `[low]` `[reject]` (intent) A list-to-list sort change keeps the row already shown : 2.4's rule; the shown row is normally the remembered one; noted in the PR for Alex.
  - `[medium]` `[patch]` (verification-gap) The restore's cancel path has no test : deferred-settings tests for opening 設定 and writing a sort during the restore.
  - `[medium]` `[patch]` (edge) A hash not in the category's list is recorded and replaces a good entry : recorded only when the torrent is in that category's list.
  - `[medium]` `[patch]` (edge) Opening 設定 during the restore drops it and records 「全部」 : the restore stays pending off the list and nothing is recorded.
  - `[low]` `[patch]` (edge) A URL with an invalid param counts as bare : bareness comes from the raw keys.
  - `[low]` `[reject]` (edge, claim) A sort change keeps the row already shown over the remembered one : same as the intent sort entry.
  - `[low]` `[patch]` (blind) A URL hash is saved even when the list does not hold it : same as the edge entry; fixed there.
  - `[low]` `[reject]` (blind) `preferred` re-reads localStorage keyed on `hash` : works because the layout writes first; keeping a second copy in state adds a sync point for no visible gain.
  - `[low]` `[patch]` (blind) The restore can stay pending forever if maindata never answers : gives up after the first failed maindata request.
  - `[low]` `[patch]` (blind) The restore's early-exit path has no test : same as the verification-gap entry; fixed there.
  - `[low]` `[patch]` (blind) No test checks what is saved during the restore : asserts 「全部」 is never written.
  - `[low]` `[patch]` (blind) The restore writes `dir` for 「狀態」 and leaves a rejection unhandled : writes the normalized search once; rejection handled.
  - `[low]` `[patch]` (blind) Two mislabeled tests : archived and filtered cases added; the panel is asserted.
  - `[low]` `[reject]` (blind) The two-devices test cannot fail : the AC asks for exactly this vitest of prefs per device.
  - `[low]` `[patch]` (blind) Nothing pins the panel for a URL with `sort` and no `hash` : test added.
  - `[low]` `[patch]` (blind) The `search.spec.ts` change hides the new `q` behaviour : e2e added for it.
  - `[low]` `[reject]` (blind) Two tabs on one device can overwrite each other : accepted limit, noted in the PR.
  - `[false]` `[reject]` (blind) The patch leaves out the spec and sprint-status : committed with the story.
  - `[low]` `[reject]` (blind) The phone path is tested only with a stubbed `matchMedia` : the branch is a width check covered in DOM tests; the restore is width-independent.
  - `[low]` `[reject]` (blind) Doc links are not version-matched : the repo cites the same `latest` pages throughout.
  - `[low]` `[reject]` (intent) "Not via the NAS" has no behaviour test : nothing in the change calls a server function; only `writePref` writes.
  - `[low]` `[reject]` (intent) Scroll is asserted only for the bare-URL open : the panel choice never scrolls (no scroll call added).
  - `[low]` `[reject]` (intent) The map is validated per entry, not by one schema : each entry goes through zod.
  - `[low]` `[reject]` (intent) The URL does not name the restored torrent : AD-13 gives the remembered torrent to localStorage until clicked.

## Design Notes

Claude 代決 (list in the PR): at most 100 categories kept in the per-category map; `q` alone still counts as a bare URL for the restore; the restore keeps the hint off (not a tab switch).

Docs (AD-11): MDN `Window.localStorage` https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage ; TanStack Router search params https://tanstack.com/router/latest/docs/framework/react/guide/search-params ; zod 4 https://zod.dev/api .

## Verification

**Commands:**
- `source ~/.nvm/nvm.sh && nvm use && npm run lint && npm run typecheck` -- expected: no errors
- `source ~/.nvm/nvm.sh && nvm use && npm test` -- expected: all pass
- `source ~/.nvm/nvm.sh && nvm use && npm run build && npx playwright test` -- expected: all pass, zero CSP violations
- `source ~/.nvm/nvm.sh && nvm use && npm run audit:prod` -- expected: passes
- `bash .claude/skills/next-story/check.sh` -- expected: every line ok

## Auto Run Result

Status: done (first review pass)

**Summary.** Two per-device prefs (`lastCategory`, `lastViewedHash` per category, at most 100) recorded when the URL's category or hash changes on the list; opening on a bare URL restores the last category with its remembered sort (URL filled with replace) and the list panel prefers the category's last viewed torrent, else the first row; a URL with a place wins; board and phone never open the detail by themselves.

**Review.** 30 findings: patched 3 medium (cancel-path tests, recording only the category's own rows, the restore waiting off the list) and low ones (raw bareness via the opening search, give-up on a failed first maindata, one URL write, test fixes, a `q`-only e2e); rejected 15 (6 false, 9 low) with reasons; nothing deferred.

**Follow-up review: recommended.** Patched by verdict: medium 3. The named risk: the restore state machine and the new opening-search module changed after review.

**Known limit.** Two tabs on one device can overwrite each other's remembered place.
