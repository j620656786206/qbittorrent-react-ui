---
title: 'Story 2.5: Detail overview: status hero, stat tiles, save path'
type: 'feature'
created: '2026-11-17'
status: 'in-review'
baseline_revision: '5f16c22fd3069d0ac8435850c34bff1405d93d64'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-react-torrent-2026-11-15/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-4-detail-containers-header-prev-next.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** The overview tab shows only the info list, so Alex still opens VueTorrent to see how a torrent is doing (seeding days, ratio, sources) and where it is stored, and cannot copy its path.

**Approach:** Above the 2.4 info list add, top to bottom, the status hero (64px status circle, 28px status-coloured headline, one muted summary line), three stat tiles that change with the status, and the save-path block (label with location tag, the full path, four pill buttons with only 複製 working). Text comes from pure `src/lib` functions; the extra counts come from `getTorrentDetail`.

## Boundaries & Constraints

**Always:**
- Overview order: hero, tiles (3 in one row), save-path block, info list. Same in the list panel, the board's narrow panel (~354px) and the phone sheet; no horizontal scroll anywhere.
- Hero (EXPERIENCE 「詳情狀態區每種狀態寫什麼」, exact wording): 64px `StatusCircle` (ring for statuses that show progress) plus `text-detail-hero` in the status colour: status word, a full-width space (U+3000), the number. Summary: one `text-muted` line, parts joined by 「 · 」. The 12 rows: 下載中 「下載中　87%」 / 「剩 34 分 · ↓ 6.21 MB/s · 85 GB · mteam-tv」; 抓種子資訊中 「抓種子資訊中」 / 「還不知道大小 · mteam-tv」; 排隊中 「排隊中　12%」 / size · category; 檢查檔案中 「檢查檔案中　45%」 / size · category; 已暫停 「已暫停　87%」 / 「手動暫停 · 85 GB · mteam-tv」; 停滯 「停滯　87%」 / 「沒有來源 · …」; 做種中 「做種 41 天」 / 「分享率 3.12 · 已上傳 301.2 GB · 85 GB · mteam-seed」; 已完成 「已完成」 / 「今天 09:12 下載好了 · 分享率 3.12 · 85 GB · mteam-tv」; 找不到檔案 (private) 「找不到檔案」 / 「做不了種 · 85 GB · mteam-tv」; 錯誤 (`error`) 「錯誤」 / 「qBittorrent 回報錯誤」 (the fixed text until Story 2.10, same as `classify().detail`); 狀態不明 (`unknown`) 「狀態不明」 / size · category; 已整理 「已整理」 / 「留著當紀錄 · 2025/07/18 下載好了 · 85 GB · X」. Colours follow the status (`status-downloading`, `paused`, `stalled`, `seeding`, `done`, `error`, `archived`).
- Hero text and tile values come from pure functions in `src/lib` built on `classify()` and the torrent fields; `src/lib/torrent-status.ts` stays the only owner of state codes (no `torrent.state ===` in features). Missing-files rules follow AR-58 as `classify` already does (`private: null` counts as regular, so it is 已整理).
- Tiles (EXPERIENCE 「數字小卡依狀態換」): 下載中, 已暫停, 停滯 (and 抓資訊, 排隊, 檢查, which are 下載中) show 下載速度, 剩餘時間, 來源數; 做種中, 已完成 show 現在上傳, 在抓的人, 最後有人抓 (`last_activity` as 「3 天前」); 錯誤 (all three error kinds), 已整理 show 大小, 完成時間, 分享率. Missing values: speed 「0 KB/s」, time left 「不明」, never active 「沒人抓過」, anything else 「沒有」. Tile: `surface-muted`, radius 16px, padding 12px 14px, muted title above, `text-stat-value` 20px value. All numbers through `src/lib/format.ts`.
- 來源數 is qBittorrent's connected seeds `num_seeds`, 在抓的人 its connected leechers `num_leechs`; both join `TORRENT_DETAIL_FIELDS` (spine AD-6 detail exception names them for 2.5). 已上傳 in the 做種中 summary is `getTorrentDetail`'s `uploaded`. Before the first answer these show 「…」 muted, as 2.4's rows do.
- Save-path block: `surface-muted`, radius 16px. Row 1: 「儲存位置」 plus the location tag (`locationLabel`, last two segments). Row 2: the full `save_path` in the `path` role (mono 12px/1.5), one line, cut at the front keeping the end (「…media/tv/牧神記」), Chinese and slashes in order; desktop shows the full path on hover (`title`); phone: tapping the path expands it to wrap, tapping again collapses (a real button with `aria-expanded`). Row 3: four pills in order 複製, 「☆ 加到常用」, 改路徑 (`accent` solid, the only solid one), 改檔名 (outline); desktop 34px tall, gap 8px, left aligned; phone 2×2 equal width, 44px tall. The last three are disabled the Epic 1 way (native `disabled`: 50%, not-allowed, no hover, not focusable).
- 複製 copies the full path: `navigator.clipboard.writeText` when present, else or on failure a temporary off-screen `textarea` with `document.execCommand('copy')` (styles set through the CSSOM, never a `style` attribute string: CSP). Success: the label is 「已複製」 for 1.5 s, no toast; both failing: 「複製失敗」 for 1.5 s. Pressing again restarts the 1.5 s.
- Names, paths and categories are plain text (React text nodes); `<b>` or `javascript:` shows as typed.
- Contrast: the 28px headline at least 3:1 on `surface`, other text at least 4.5:1, both themes (check the status tokens; fix a token only if it fails, and say so).

**Never:** the 搬移中 prefix and moving states (Epic 5); 加到常用, 改路徑, 改檔名 behaviour (Epic 5); a toast; new dependencies; `torrent.state` comparisons outside `src/lib/torrent-status.ts`; real qBittorrent in tests or screenshots (AD-15); adding `num_seeds`/`num_leechs`/`uploaded` to the slim table.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| H1 hero rows | each of the 12 states above | headline, colour and summary exactly as the table | unlisted state reads as 狀態不明 |
| H2 summary gaps | empty category; downloading at 0 B/s; `eta` infinite | the category part is left out; no speed part; 「剩餘時間不明」 | n/a |
| T1 tile groups | downloading, seeding, error/archived torrents | the three titles and values of their group | n/a |
| T2 tile no values | speed 0, unknown eta, `last_activity` 0 or less, missing counts or completion | 「0 KB/s」, 「不明」, 「沒人抓過」, 「沒有」 | detail fields before the first answer 「…」 |
| P1 path cut | long `save_path` with Chinese | one line, ellipsis at the front, end visible in order | n/a |
| P2 path expand | phone, tap the path, tap again | wraps over several lines, then one line | n/a |
| C1 copy | `navigator.clipboard` works | full path copied, 「已複製」 1.5 s | n/a |
| C2 copy fallback | no `navigator.clipboard`, or it rejects | textarea fallback copies, 「已複製」 | both fail: 「複製失敗」 1.5 s |
| X1 plain text | name, path, category with `<b>x</b>` or `javascript:` | shown as typed, no element or link | n/a |

</intent-contract>

## Code Map

- `src/features/detail/detail-view.tsx` -- `Overview` (add hero, tiles, save-path block above `InfoList`), `InfoList` uses `useTorrentDetail(torrent.hash, fetchTorrentDetail)`; share one query result instead of a second hook call where practical (same key, so a second observer is harmless).
- `src/features/detail/detail-model.ts` -- `infoRows`, `LOADING_VALUE`; put pure tile/hero text here or in `src/lib` (hero must be `src/lib`: it needs state kinds).
- `src/lib/torrent-status.ts` -- `classify`, internal `StateKind`/`effectiveKind`/`detailOf`, `WORDS`; the hero's kind split (meta, queued, checking, paused, stalled, missing files, error, unknown) lives here or in a new `src/lib` file that gets the kind from an export here, never from `torrent.state`.
- `src/lib/format.ts` -- `formatSpeed` (0 is 「0 KB/s」), `formatEta(eta, dlspeed)` (「剩 34 分」, 「剩餘時間不明」), `formatSize`, `formatDate`, `formatAgo`, `formatDuration`, `formatRatio`, `isGoodRatio`, `formatPercent`, `formatCount`, `NO_VALUE`.
- `src/lib/paths.ts` -- `locationLabel`.
- `src/shared/ui/status-circle.tsx` -- `StatusCircle`, `GEOMETRY` (sizes 36/32/28); add 64 from the mockup.
- `src/shared/torrent-detail.ts` -- `TORRENT_DETAIL_FIELDS` (add `num_seeds`, `num_leechs`); `src/server/functions/get-torrent-detail.test.ts`, `src/state/torrent-detail.test.ts`, `src/features/detail/detail.dom.test.tsx` mock follow.
- `src/styles.css` -- tokens `text-detail-hero`, `text-stat-value`, `--font-mono`, `--rt-status-*`, `surface-muted`, `rounded-card` (16px); the `path` role (12px/1.5 mono) may need a utility.
- `src/features/header/app-shell.tsx:23` -- the Epic 1 disabled pattern to copy.
- `scripts/fake-qbit.mjs` -- `DATA_MODES`, `DATA` (`sample`, `many`, `empty`, `archived`, `calm`); add a `states` mode with one torrent per hero row (fake names, code-name categories only) for e2e and screenshots.
- `e2e/detail.spec.ts`, `e2e/fixtures.ts` (`login`, `openList`, `setModes`) -- screenshot test pattern from 2.4.
- Mockups: `_bmad-output/planning-artifacts/ux-designs/ux-react-torrent-2026-11-13/mockups/S04-overview-desktop.dc.html`, `S05-overview-phone.dc.html`; DESIGN.md lines 515, 636-638, 691-694; EXPERIENCE.md lines 95-99, 112-143, 254-270.

## Tasks & Acceptance

**Execution:**
- `src/lib/torrent-status.ts` or new `src/lib/detail-hero.ts` (+ test) -- hero headline, colour key and summary parts for the 12 rows (H1, H2) -- pure, one test per row.
- `src/features/detail/detail-model.ts` (+ test) -- stat tile titles and values per group, missing values, loading (T1, T2).
- `src/shared/torrent-detail.ts` (+ server, state, DOM tests) -- add `num_seeds`, `num_leechs`.
- `src/shared/ui/status-circle.tsx` (+ test) -- size 64.
- `src/features/detail/` new hero, tiles, save-path components and `detail-view.tsx` `Overview` -- layout, path cut and phone expand, pills, copy with fallback and 1.5 s labels (C1, C2, P1, P2, X1).
- copy helper in `src/lib` or `src/shared/ui` (+ vitest in an environment without `navigator.clipboard`, and with a rejecting one).
- `scripts/fake-qbit.mjs` -- `states` data mode.
- `e2e/detail.spec.ts` -- overview order, the narrow board panel without horizontal scroll, phone path expand, copy label; screenshots into `e2e-output/screenshots/2-5/`: 12 states desktop list mode light, plus one set desktop dark, board narrow panel, phone 390 with the path expanded.

**Acceptance Criteria:**
- Given fake data, when Alex opens any torrent's detail, then the overview shows hero, three tiles in one row, save-path block and info list, in the list panel, the board's narrow panel and the phone sheet, with no horizontal scroll at 390px or in the ~354px panel.
- Given `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run smoke`, `CI=1 npm run smoke:browser` and `check.sh`, then all pass with 0 CSP violations.
- Given the PR, then it carries the 12-state desktop light screenshots and the dark, narrow-panel and phone (path expanded) sets.

## Spec Change Log

## Review Triage Log

### 2026-11-17: Review pass
- verdicts: 30 findings: high 0, medium 3, low 22, false 5, maybe-false 0
- findings:
  - `[low]` `[patch]` (blind) the copy's setState and 1.5 s timer can run after the save-path block unmounted. Patch: a mounted ref, return after the await when gone.
  - `[low]` `[patch]` (blind) the tab panel lost `tabIndex={0}`, against the APG pattern (first content not focusable, the panel is the scroller) and 2.4's behaviour. Patch: restored, DOM test flipped.
  - `[low]` `[reject]` (blind) the copy result has no live region. The label change on the pressed button is what the AC asks; Alex alone uses the app; a live region adds a component.
  - `[false]` `[reject]` (blind) the desktop full path is only in `title`. The AC says 「電腦 hover 看全文」.
  - `[medium]` `[patch]` (blind) the textarea fallback selects nothing on iOS Safari (readOnly plus `select()`), so copy fails on the phone over plain http. Patch: editable while selecting, `setSelectionRange`, 16px font.
  - `[low]` `[patch]` (blind) `formatTimeLeft` parses `formatEta`'s text. Patch: both built from the eta parts.
  - `[low]` `[reject]` (blind) tile `muted` decided by string and a second `LOADING` constant in `detail-hero.ts`. Same accepted pattern as 2.4's info rows; the fix moves constants across layers (lib cannot import features).
  - `[medium]` `[patch]` (blind) `heroKindOf` repeats `statusOfKind`'s AR-58 and moving rules; status and hero kind can drift. Patch: one source decides, plus a consistency test over all state codes.
  - `[low]` `[patch]` (blind) test doubles for `execCommand` and `navigator.clipboard` leak between tests. Patch: descriptors restored.
  - `[low]` `[patch]` (blind) no test that ‹ › resets the path expansion and 「已複製」. Patch: DOM test.
  - `[low]` `[patch]` (blind) the fake-qbit comment says 3001 to 3012 hex; the code ends at 0x300c. Patch: comment fixed.
  - `[low]` `[patch]` (blind) e2e H1 checks only headlines; seed and leecher counts unset in the fixture. Patch: explicit counts, exact tile values, summaries on three rows.
  - `[low]` `[reject]` (blind) `blockKinds` finds blocks by `svg[width="64"]` and `DL`. Test brittleness only, no behaviour at risk.
  - `[low]` `[reject]` (blind) the C1 e2e does not bound the 1.5 s from below. The DOM test checks the timing with fake timers.
  - `[low]` `[patch]` (verification) the path expansion and copy label are not checked to reset on a torrent switch (same root cause as the blind row). Patched there.
  - `[low]` `[patch]` (verification) the headline colour is checked for 做種中 only. Patch: e2e asserts `text-status-<status>` on all 12 rows.
  - `[low]` `[patch]` (verification) the tiles' muted class is never checked in the DOM. Patch: DOM assertion on a muted and a real value.
  - `[false]` `[reject]` (intent) the `error` summary is fixed text, not qBittorrent's reason. Alex decided 2026-11-16 (Story 1.6) to show 「qBittorrent 回報錯誤」 until Story 2.10 brings the real reason.
  - `[low]` `[reject]` (intent) no test measures contrast. The implementer computed the ratios from the tokens (lowest headline 4.06:1, muted text on tiles 4.95:1 and 5.09:1); the PR carries them, as the AC asks.
  - `[false]` `[reject]` (intent) the 已整理 screenshot comes from the board panel. 已整理 never appears in list mode by design (Story 2.1); recorded as Claude 代決.
  - `[low]` `[reject]` (intent) the front cut is checked in the narrow panel only and the bidi order only by screenshots. `textContent` cannot show bidi order; the screenshots in both widths do.
  - `[low]` `[reject]` (intent) the C2 e2e checks the label, not the copied text. The unit test checks the textarea path's text; C1 checks real clipboard content.
  - `[low]` `[patch]` (intent) the tab panel's `tabIndex` change alters 2.4 (same root cause as the blind row). Patched there.
  - `[false]` `[reject]` (intent) "沒有 `private` 欄位時照 Alex 當時的決定" unverified. The hero follows `classify`, which already encodes Story 1.5's AR-58 result (`private: null` counts as regular).
  - `[low]` `[patch]` (edge) setState after unmount during a pending copy (same root cause as the first blind row). Patched there.
  - `[medium]` `[patch]` (edge) iOS readOnly textarea selects nothing (same root cause as the blind row). Patched there.
  - `[low]` `[reject]` (edge) an empty `save_path` leaves the phone expand button unnamed and copies an empty string. qBittorrent always reports a save path; rare.
  - `[low]` `[patch]` (edge) `execCommand` override never restored (same root cause as the blind test-doubles row). Patched there.
  - `[low]` `[patch]` (edge) `navigator.clipboard` set to undefined for good (same root cause). Patched there.
  - `[false]` `[reject]` (edge) 11 list-mode shots plus one board-panel shot. Same as the intent row: 已整理 cannot show in list mode.

## Design Notes

- Claude 代決 (Alex may veto): 來源數 is `num_seeds` (connected seeds) and 在抓的人 `num_leechs` (connected leechers), the counts qBittorrent's own UI shows as connected; an empty category is left out of the summary; the hero's 下載中 summary reuses `formatEta` and `formatSpeed` with 「↓ 」 as the list's second line does; the 剩餘時間 tile shows the `formatEta` text without its 「剩 」 prefix when that reads better in the mockup (follow the mockup); a second 複製 press restarts the 1.5 s.
- Path cut: an RTL ellipsis box (`direction: rtl; text-overflow: ellipsis; overflow: hidden; white-space: nowrap`) with the text inside an LTR isolate (`<bdi>` or `unicode-bidi: isolate` plus `direction: ltr`) keeps 「…media/tv/牧神記」 in order; verify in the browser, not only in happy-dom.
- Docs to read first (AD-11): MDN `Clipboard.writeText` (https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText), MDN `Document.execCommand` (https://developer.mozilla.org/en-US/docs/Web/API/Document/execCommand), MDN `<bdi>` (https://developer.mozilla.org/en-US/docs/Web/HTML/Element/bdi), Tailwind v4 arbitrary values if used (https://tailwindcss.com/docs/adding-custom-styles). Record the URLs actually read.
- URLs actually read (2026-11-17): `https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText` (secure contexts only; a promise that rejects with `NotAllowedError`), `https://developer.mozilla.org/en-US/docs/Web/API/Document/execCommand` (deprecated, `copy` copies the current selection, returns `false` when it did not run, needs a user interaction), `https://developer.mozilla.org/en-US/docs/Web/HTML/Element/bdi` (isolates its run both ways; `<bdi dir="ltr">` equals an LTR span with isolation). Tailwind arbitrary values were used only in the forms the codebase already uses (`h-[34px]`, `[overflow-wrap:anywhere]`), so that page was not reopened.
- Implementation notes (Claude 代決, Alex may veto):
  - The hero row comes from a new `heroKindOf()` export in `src/lib/torrent-status.ts`; `classify`/`statusOf` now derive the status from that row (`HERO_STATUS`), so the two cannot drift (a test covers every state code, `private` value and move). The text is built in `src/lib/detail-hero.ts`. A moving torrent with no remembered state reads by progress (做種 or 下載中), matching `classify`.
  - 已上傳 in the 做種中 summary: 「已上傳 …」 before the first answer, left out when `getTorrentDetail` says unknown (「已上傳 沒有」 reads badly).
  - Tile values wrap instead of overflowing (at 1024px the board panel's tiles are about 47px wide inside), so 「6.21 MB/s」 can take two lines in the narrow panel; summary parts are kept whole and wrap between parts. Tile padding follows the spec (12px 14px) on the phone too, not the phone mockup's 12px.
  - The phone path button's accessible name is the path itself (no `aria-label`), so screen readers still hear the path; `aria-expanded` carries the state.
  - The location tag uses the neutral tag look from the list row (the desktop mockup's purple media-library tag is a common-path name, Epic 5).
  - The copy fallback's textarea is appended inside the save-path block, not `body`, so the phone sheet's focus trap and `inert` background do not take the selection away; focus returns to 複製.
  - The tabpanel keeps `tabIndex={0}` (it is the scroller and its first content takes no focus).
  - The copy fallback's textarea is editable while selected, gets `setSelectionRange(0, length)` and a 16px font, for iOS Safari over plain http.
  - 已整理 is never in list mode, so its desktop screenshot comes from the board panel; the 12-row set is otherwise the list panel.
  - Contrast (computed from the tokens): headline on `surface` at least 4.06:1 light (paused) and 4.74:1 dark (done), above 3:1; `text-muted` on `surface-muted` 5.09:1 light, 4.95:1 dark. No token changed.

## Verification

**Commands:**
- `source ~/.nvm/nvm.sh && nvm use && npm run lint && npm run typecheck && npm test` -- expected: all pass.
- `source ~/.nvm/nvm.sh && nvm use && npm run build && npm run smoke && CI=1 npm run smoke:browser` -- expected: all pass, 0 CSP violations.
- `bash .claude/skills/next-story/check.sh` -- expected: every line ok.

## Auto Run Result

Status: done (first review pass; a follow-up pass is recommended)

Summary: the overview now shows the status hero (64px circle, 28px status-coloured headline, muted summary for the 12 rows), three stat tiles by status group, the save-path block (label with location tag, front-cut path with hover and phone expand, four pills with only 複製 working, clipboard plus textarea fallback, 1.5 s labels) and the 2.4 info list. `getTorrentDetail` also sends `num_seeds` and `num_leechs`.

Files changed (main ones):
- `src/lib/detail-hero.ts` (new), `src/lib/torrent-status.ts` (`heroKindOf`, one source for status and hero row), `src/lib/format.ts` (`formatTimeLeft`).
- `src/features/detail/overview.tsx` (new: hero, tiles, save-path block, info list), `detail-model.ts` (`statTiles`), `detail-view.tsx`, `phone-detail-sheet.tsx`.
- `src/shared/ui/copy-text.ts` (new), `src/shared/ui/status-circle.tsx` (size 64), `src/shared/torrent-detail.ts` (two fields).
- `scripts/fake-qbit.mjs` (`states` mode), `e2e/detail.spec.ts`, `e2e/fixtures.ts`, tests beside each file.
- `_bmad-output/implementation-artifacts/epic-2-context.md` recompiled (the spine had changed).

Review: 30 findings. Patched 2 medium entries and 9 low entries (10 fixes), deferred none, rejected 15 (9 low, 6 false counting grouped rows once; every row has its reason in the log).

Follow-up review recommendation: true. Two medium entries were patched on a first pass. Named risk: `classify()`'s status now comes through the new hero-kind map in `src/lib/torrent-status.ts` (the core state mapping every screen uses), and the iOS textarea fallback cannot be exercised here.

Verification (2026-11-17, after the patches): `npm run lint` clean; `npm run typecheck` clean; `npm test` 86 files, 1916 tests passed; `npm run build` ok; `npm run smoke` built server ok; `CI=1 npm run smoke:browser` 43 passed, 0 CSP violations; `check.sh` all ok. Matrix audit: H1, H2, T1, T2, P1, P2, C1, C2, X1 each have covering tests that ran and passed.

Residual risks: copy over plain http on iOS Safari needs Alex's phone; contrast computed from tokens (lowest headline 4.06:1 light paused; muted text on tiles 4.95:1 dark, 5.09:1 light), not measured in a test.

