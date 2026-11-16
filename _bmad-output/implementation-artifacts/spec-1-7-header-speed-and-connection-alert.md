---
title: 'Story 1.7: Header, global speed and connection alert bar'
type: 'feature'
created: '2026-11-16'
status: 'done'
baseline_revision: 'd68d10c481700eb99ff5cf52a4c3fa5dc2804bcf'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-react-torrent-2026-11-15/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-react-torrent-2026-11-13/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-react-torrent-2026-11-13/EXPERIENCE.md'
warnings: ['oversized']
deferred:
  - summary: >-
      A first maindata fetch that fails with a non-connection code (qbit_rejected, bad_origin) leaves the speed and count skeletons pulsing with no message.
    evidence: |-
      Story 1.8 builds the list loading, empty and error states; add the first-load error state there and make the header leave its skeleton.
    location: >-
      src/features/header/header-model.ts
    severity: low
  - summary: >-
      The 50% content dim for the two unreachable states cannot be seen yet because main is empty.
    evidence: |-
      Story 1.8 mounts the list; re-check the dim and scrolling there.
    location: >-
      src/features/header/app-shell.tsx
    severity: low
  - summary: >-
      Focus restore when the alert bar unmounts (header retry success, login submit) relies on layout-effect cleanup and is not checked in a browser.
    evidence: |-
      Check once in the browser during Story 1.8's screenshot run.
    location: >-
      src/shared/ui/alert-bar.tsx
    severity: low (unverified)
  - summary: >-
      Whether real Cloudflare Access answers 401, a redirect or an HTML page is not observed.
    evidence: |-
      NAS checklist in Story 1.9 (AR-60); the fake script now offers all three modes.
    location: >-
      scripts/fake-qbit.mjs
    severity: low
---

<intent-contract>

## Intent

**Problem:** Logged-in pages show only a bare 「種子」 title: no header, no speeds or limits, no placeholders for later entries, and connection failures (home unreachable, qBittorrent not responding, Cloudflare login expired, firewalled, disconnected, stale data) are recorded in `src/state/connection.ts` but never shown, on the authed pages or on the login screen (spec 1.4 deferred item).

**Approach:** Add `src/features/header` (app shell: header, speed area, alert bar, 「全部」 tab and sort pill, dimmable scrolling content) mounted by the `_authed` layout; feed it from `['maindata']` through `useMaindata` and one `src/state` hook that calls the existing `pickConnectionAlert`; put the bar's look in `src/shared/ui/alert-bar.tsx` so the login screen shows the same bar; add `formatSpeedLimit` to `format.ts`; serve fake qBittorrent responses for screenshots from a dev-only script.

## Boundaries & Constraints

**Always:**
- Every visual value comes from the S01, S02, S10 mockups or UX DESIGN.md (table in Design Notes). Colors only through existing tokens (`surface`, `border`, `text`, `text-muted`, `surface-muted`, `status-stalled`, `status-downloading`, `status-seeding`, `accent`); no new color.
- One alert at a time, chosen only by `pickConnectionAlert` (AD-13). Its `kind` decides the surface: `cloudflare_expired`, `home_unreachable`, `qbit_unreachable` use the alert bar; `disconnected`, `firewalled` use the speed area; `stale` adds the muted 「最後更新 N 前」 text. Desktop pills keep the last known speeds while a bar shows (S01-offline-desktop); on phone the bar replaces the speed line (S02-offline-phone).
- Only `home_unreachable` and `qbit_unreachable` dim the content (`main`, below the filter row) to opacity 0.5; header, speed line, bar and filter row never dim; the content stays scrollable and clickable (no `pointer-events: none`).
- 「重試」 calls `refreshMaindata` once per press (after the fix PR it forces the container to pull from qBittorrent again, without the 1 s reuse, so nothing extra is needed). 「重新登入」 calls `window.location.reload()`. On the login screen 「重試」 submits the form again through the existing `decideSubmit` path.
- All speed and limit text goes through `src/lib/format.ts`; alert text only from `pickConnectionAlert` (which uses `errorText`). No home address, URL or raw error text in the UI.
- Placeholders (search, 新增, shortcuts, settings, phone category button, sort pill) use the native `disabled` attribute: 50% and `not-allowed` from the base rule in `src/styles.css`, no hover (the hover utilities skip `:disabled`), not focusable. Icon-only ones keep `aria-label` per UX-DR77: 搜尋, 新增種子 (phone), 快捷鍵, 設定; phone category 「分類：全部」; sort 「排序：加入時間，新的在前，列表」. No `title` tooltips while disabled (their shortcuts do not exist yet).
- The ticking clock (`useNow`) is used only in small leaf components; page content is passed as `children` so a tick never re-renders it (Story 1.8 mounts about 4165 rows there).
- `['maindata']` is read only through the module-level fixed selectors that `src/state/maindata.ts` exposes after the 1.4 to 1.6 review fix PR; never pass an inline `select` function (a new function reference re-runs the selector, e.g. a re-sort of about 4167 rows, every render). When no fixed selector exists for what the header needs (server state, connection status, the 「全部」 count), add one next to the existing ones in `src/state/maindata.ts`, in the same style.
- Phone below 1024px (`lg`), desktop from 1024px; both variants are rendered and the hidden one is `display: none`. No horizontal scroll at 390px.
- Fake data for tests and screenshots only: category names `X`, `mteam-X`, `mteam-tv`, paths under `/data/media/X/incompleted`, fake hashes, no IP literals besides loopback in the dev script, no real credentials.

**Never:**
- Never contact the real qBittorrent or read `.env` (the screenshot script boots the built server with its own env and strips inherited app variables, like `scripts/smoke-built-server.mjs`).
- No working search, add, shortcuts, settings, category switching or sort menu; no other category tabs; no list rows or row skeletons (Story 1.8); no bottom 110px selection-bar padding (comes with the selection bar).
- No Radix Dialog, Popover, DropdownMenu or Tooltip (so no CSP `style-src` change; the spec 1.3 deferred item stays open for the first Dialog story).
- No jsdom, testing-library or other new dependency; no animation, i18n or gesture package.
- No change to the error contract, `callFn` classification, server functions or `src/shared/csp.ts`.
- The dev script is never imported from `src/`, never run in CI and never shipped in `.output`.

## I/O & Edge-Case Matrix

Byte values: `D = 10433331` (9.95 MB/s), `U = 2495611` (2.38 MB/s), `L = 34288435` (32.7 MB/s). `now` fixed. "Bar" = alert bar, "pills" = desktop speed pills, "line" = phone speed line.

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| H1 Normal | `serverState` dl `D`, up `U`, dl limit 0, up limit `L`, connected; no alert | pills 「↓ 9.95 MB/s　不限速」 「↑ 2.38 MB/s　上限 32.7」 (limit `text-muted`); line has both groups; no bar; no dim | none |
| H2 Zero speed | dl 0 | 「0 KB/s」 | none |
| H3 Alt limit | H1, then next data `use_alt_speed_limits: true`, dl limit 10485760; then back to 0 | 「上限 10.0」, then 「不限速」 on the next data | none |
| H4 Limit text | limit 0; -1; `L`; 10485760; 1048576; 512000 | 「不限速」 「不限速」 「上限 32.7」 「上限 10.0」 「上限 1.00」 「上限 500 KB/s」 | none |
| H5 Firewalled, disconnected | alert `firewalled` / `disconnected` | desktop: one warning pill (pending the blocking question, option A); line replaced by warning icon plus 「防火牆擋住了」 / 「斷線了」 in `text`; no bar; no dim | none |
| H6 Stale | alert `stale`, text 「最後更新 20 秒前」 | pills plus `text-muted` text right of them; line plus the same text after it; no dim | none |
| H7 Home unreachable | alert `home_unreachable`, last success 3 min ago | bar 「連不到家裡的 NAS，最後更新 3 分前」 plus 「重試」; pills keep last speeds; line replaced by the bar; dim | none |
| H8 qBittorrent not responding | alert `qbit_unreachable` | bar 「家裡的 qBittorrent 沒有回應」 (suffix when stale) plus 「重試」; dim | none |
| H12 Unreachable switches | store gets `home_unreachable`, then `qbit_unreachable` (the store keeps only the newest of the two; `cloudflare_expired` stays alongside) | bar text follows the newest; with `cloudflare_expired` also present the Cloudflare bar wins | none |
| H9 Cloudflare expired | alert `cloudflare_expired` (any other codes too) | bar 「Cloudflare 登入過期了」 plus 「重新登入」; no dim; only one bar | none |
| H10 No data yet | `serverState` undefined; with and without `home_unreachable` | pills and line show the loading skeleton bars; 「全部」 count is a skeleton; with the code: bar 「連不到家裡的 NAS」 without suffix | none |
| H11 Count | 6 fake torrents, 2 archived (non-private `missingFiles`) | 「全部 4」 via `countAll` | none |
| S1 Stale while fetching | last success 25 s ago; fetch started 1 s ago / 3 s ago / no fetch | `null` / stale 「最後更新 25 秒前」 / stale (the hold-back is the merged `pickConnectionAlert`'s grace of about 2 s; use its constant, not a literal) | none |
| R1 Retry | after a failed poll, press 「重試」 | one immediate `getMaindata` call; success clears the store and the bar | failure keeps the bar |
| LA1 Login, unreachable | login submit rejects `home_unreachable` | bar 「連不到家裡的 NAS」 plus 「重試」 above the form; no message under the password; fields kept | 「重試」 resubmits (empty field: focus, no call) |
| LA2 Login, Cloudflare | login submit rejects `cloudflare_expired` | bar 「Cloudflare 登入過期了」 plus 「重新登入」 (reload) | none |
| LA3 Login, new submit | bar showing, submit again | codes cleared when the submit starts; a new connection failure shows the bar again; an inline error (`login_failed`) shows no bar | none |
| LA4 Login required | a call returns `not_logged_in` or `qbit_auth_failed` while codes are set | connection codes cleared (the container answered) | none |

</intent-contract>

## Code Map

- **Final post-fix APIs (PR #9, merge d68d10c; these names win over any "(post-fix)" wording below):**
  - `src/state/maindata.ts`: `useMaindata(select)` with a stable function only; selectors `selectServerState`, `selectConnectionStatus`, `selectCategories`, `selectTorrents`, `selectStateBeforeMove`; the 「全部」 count is `useMaindata(countAll)` with `countAll` from `#/lib/visible-torrents`; lists use `useVisibleTorrents(view)` (pass `EPIC1_VIEW` or a memoized view; per-row selects go through `useCallback`); `refreshMaindata(client)` sends `{ fresh: true }`; `useMaindataFetchStartedAt()` / `getMaindataFetchStartedAt()`.
  - `src/lib/connection-alert.ts`: `pickConnectionAlert({ errorCodes, connectionStatus, lastSuccessAt, fetchStartedAt: number | null, now })`; `FETCH_GRACE_MS` 2000, `STALE_AFTER_MS` 10000; per-code ordering in `CODE_ALERTS`.
  - `src/state/connection.ts`: `useConnectionAlert(now)` builds the alert (give it a ticking `now`); store `{ errors: ReadonlyArray<ConnectionCode> }`; `markConnectionError(code)` (home_unreachable and qbit_unreachable replace each other, cloudflare_expired kept), `clearUnreachable()`, `clearConnectionErrors()`, `getConnectionErrors()`, `useConnectionErrors()`. A maindata failure that is neither connection-class nor timeout calls `clearUnreachable()`; cloudflare_expired clears only on a maindata success.
  - `src/features/login/`: `screenMessage({ submitError, loginRequired })` in `login-form-model.ts` decides the inline message; `login-screen.tsx` renders `<p role="alert">` (CircleAlert plus `message.text`) under the password field and uses `message.passwordInvalid` for aria-invalid. `bad_origin` shows 「請求來源不對，要檢查容器的 APP_ORIGINS 設定」 and keeps the password. The three connection codes produce no inline message (this story's alert bar shows them). Only `WRONG_CREDENTIAL_CODES` (login_failed, login_locked) clear and mark the password.
  - `src/lib/torrent-status.ts`: `classify(t, { now, timeZone?, stateBeforeMove })`, `statusOf(t, stateBeforeMove)`; `stateBeforeMove` required (`{}` when none).
  - Lint: any object with the maindata key plus `queryFn` is banned (incl. `queryOptions`, `useQueries`, `useInfiniteQuery`); `setQueryDefaults` only in `query-client.ts`; `{ state }` destructuring banned only from torrent-like values.

Written against the shapes after the 1.4 to 1.6 review fix PR, which must be on `main` before implementation starts. Identifiers below marked "(post-fix)" describe a contract; read the merged code for the final names before writing.

- `src/routes/_authed.tsx` -- pathless layout, `component: Outlet`; becomes the shell host.
- `src/routes/_authed/index.tsx` -- temporary `Home` with an `h1`; the title moves to the header.
- `src/routes/login.tsx`, `src/features/login/login-screen.tsx` -- login page; mutation `onError` keeps connection codes out of the inline message (`INLINE_ERROR_CODES` in `login-form-model.ts`); `inFlightRef` and `decideSubmit` guard submits. Post-fix the screen also shows a message for `bad_origin`; this story must not move or change that message.
- `src/lib/connection-alert.ts` -- `pickConnectionAlert` (post-fix): input has `fetchStartedAt` instead of `isFetching`; the stale-only text is held back for about the first 2 s of a fetch, then shown even while fetching. `STALE_AFTER_MS`, kinds and texts. Only tests call it so far.
- `src/lib/format.ts` -- `formatSpeed` (lines 80 to 110), `NO_VALUE`; add `formatSpeedLimit` here.
- `src/lib/visible-torrents.ts`, `src/lib/torrent-status.ts` -- `countAll(maindata)` (excludes archived). Post-fix, `classify()` and `statusOf()` take `stateBeforeMove` as a required argument; any direct call passes the maindata's `stateBeforeMove` or `{}`. The header should not need to call them (it uses the count selector).
- `src/state/connection.ts` -- store of active codes (post-fix: `home_unreachable` and `qbit_unreachable` replace each other, newest wins; `cloudflare_expired` is kept alongside): `markConnectionError`, `clearConnectionErrors`, `useConnectionErrors` (check final names).
- `src/state/maindata.ts` -- `useMaindata` with module-level fixed selectors (post-fix), `refreshMaindata` (post-fix: forces a fresh container pull), `MAINDATA_KEY`. Check whether the fix PR already tracks the fetch start time for `fetchStartedAt`; reuse it if so.
- `src/state/query-client.ts` -- global `onError` (login stop, connection codes, maindata `timeout` as `qbit_unreachable`), maindata `onSuccess` clears codes.
- `src/state/testing.ts`, `src/state/maindata.test.ts` -- client and fake fetch helpers to reuse.
- `src/shared/maindata.ts` -- `ServerState` (`dl_info_speed`, `up_info_speed`, `dl_rate_limit`, `up_rate_limit` already the limit in effect, `use_alt_speed_limits`, `connection_status`).
- `src/shared/ui/button.tsx`, `src/shared/ui/cn.ts` -- existing UI pieces; `cn` only via shared/ui.
- `src/styles.css` -- tokens, hover utilities (skip `:disabled`), base `:disabled` rule, `animate-rise`; `src/styles.test.ts` checks tokens.
- `eslint.config.js` -- boundaries: features import state, lib, shared; features never import each other; `scripts/**` is outside the TS lint.
- `scripts/smoke-built-server.mjs` -- pattern for booting `.output/server/index.mjs` with fake env (`APP_ENV` stripped, `freePort()`).

## Tasks & Acceptance

**Execution:**
- `src/lib/format.ts`, `src/lib/format.test.ts` -- add `formatSpeedLimit(bytesPerSecond)`: 0, negative or missing is 「不限速」; otherwise `formatSpeed` with the 「 MB/s」 unit dropped (「上限 32.7」), other units kept (「上限 500 KB/s」) -- FR-5; row H4.
- `src/lib/connection-alert.ts`, `src/lib/connection-alert.test.ts` -- keep the merged `pickConnectionAlert` rules as they are (its `fetchStartedAt` input and about 2 s hold-back come from the fix PR); add `alertSurface(kind)` (`'bar' | 'speed' | 'stale'`), `alertAction(kind)` (`{ action: 'retry', label: '重試' }` for the two unreachable kinds, `{ action: 'reload', label: '重新登入' }` for Cloudflare, else `null`) and `dimsContent(kind)`; add S1 (if the fix PR already covers it, keep its row) -- FR-6, FR-7, AD-13.
- `src/state/now.ts` -- `useNow(intervalMs)`: epoch ms, re-renders the caller every interval, cleans up its timer.
- `src/state/connection-alert.ts`, `src/state/connection-alert.test.ts` -- `useConnectionAlert()` for authed pages (mounts `useMaindata` with the fixed connection-status selector, reads `dataUpdatedAt`, passes `fetchStartedAt` (reuse the fix PR's tracking if it exists, else record when `isFetching` turns true), store codes, `useNow(1000)`); `useLoginConnectionAlert()` (store codes only, `lastSuccessAt: null`, mounts no maindata observer). Test the input building as a pure helper plus R1 and H12 with `createQueryClient({ fetchMaindata: fake })`.
- `src/state/query-client.ts`, `src/state/query-client.test.ts` -- in the login-stop branch also clear the connection codes, unless the merged code already does; row LA4.
- `src/styles.css`, `src/styles.test.ts` -- add `@utility animate-skeleton` (mockup `pulse`: 1.6s ease-in-out infinite, 50% opacity .55, none under reduced motion); Story 1.8 reuses it.
- `src/shared/ui/alert-bar.tsx` -- presentational bar: `{ text, icon: 'offline' | 'warning', actionLabel, onAction, className? }`, `role="alert"`, values in Design Notes, desktop and phone sizes by `lg:`.
- `src/state/maindata.ts` (only if missing post-fix) -- add module-level fixed selectors for `serverState` and the 「全部」 count (`countAll`), next to the existing ones, with a reference-stability test like the existing selector tests.
- `src/features/header/header-model.ts`, `src/features/header/header-model.test.ts` -- pure `headerModel({ serverState, alert, allCount })` returning pill texts or skeleton, warning pill, stale text, phone line mode (`speeds | warning | bar`), bar (text, icon, action) and `dim`; rows H1 to H11.
- `src/features/header/speed-area.tsx` -- desktop pills, warning pill, stale text; phone line; skeleton bars (`animate-skeleton`, sizes in Design Notes); `useNow` lives here and in the bar and dim wrappers only.
- `src/features/header/app-shell.tsx` -- `AppShell({ children })`: full-height column, desktop max width 1240px content with 22px 28px padding, phone 18px 16px 0; top area (header row, speed or bar, filter row) never scrolls; `main` is the scroll container (`min-h-0 flex-1 overflow-y-auto`) wrapped by a small `ContentDim` that sets opacity 0.5 when `dimsContent`; header row: 「種子」 (`text-page-title`), pills, spacer, search, 新增 (accent capsule with plus icon), shortcuts, settings (desktop); 「種子」 plus search and 新增 44px round buttons (phone, no shortcuts); filter row: desktop `role="tablist"` with the selected 「全部」 tab (not disabled, `aria-selected="true"`) and the disabled sort pill 「列表」 mini pill plus 「排序：加入時間 ↓」 and chevron; phone disabled 「全部 N ▾」 and 「☰ 加入時間 ↓ ▾」 -- FR-4, UX-DR13 to UX-DR21, UX-DR71 to UX-DR73, UX-DR92.
- `src/features/header/app-shell.test.tsx` -- `renderToStaticMarkup` (from `react-dom/server`, already installed) of the presentational parts with fixed models: order of header children, every placeholder `disabled` with its `aria-label`, no `title`, one `role="alert"` per variant, dim class only for H7 and H8, text never contains `http` or an IP pattern.
- `src/routes/_authed.tsx` -- `component` renders `<AppShell><Outlet /></AppShell>`.
- `src/routes/_authed/index.tsx` -- render `null` (the title is in the header; Story 1.8 adds the list).
- `src/features/login/login-screen.tsx` -- render `AlertBar` from `useLoginConnectionAlert()` at the top of the login column (Design Notes), as a new sibling before the existing content; leave the merged `bad_origin` message and the inline message logic untouched; `clearConnectionErrors()` when a submit starts; 「重試」 calls `formRef.current?.requestSubmit()`; 「重新登入」 reloads; extract the submit-start and bar-action decisions into `login-form-model.ts` (`connectionBarAction(kind)`: `resubmit` for the unreachable kinds, `reload` for Cloudflare) and test them in `login-form-model.test.ts`; rows LA1 to LA3 end to end in the browser.
- `scripts/fake-qbit.mjs` -- dev-only, no dependencies: starts a fake qBittorrent on a free loopback port (`POST /api/v2/auth/login` answers `Ok.` with `Set-Cookie: SID=fake`; `GET /api/v2/sync/maindata` answers the H11 torrents and a mode-driven `server_state`, `full_update: true` is allowed every time), boots `.output/server/index.mjs` with fake env (`QBIT_URL` the fake, `QBIT_USERNAME=fake-user`, `QBIT_PASSWORD=fake-pass`, random `SESSION_SECRET`, `APP_ORIGINS=http://localhost:<port>`, `SAVE_ROOTS=/data`, temp `CONFIG_DIR`, inherited app variables removed), and a front proxy on `<port>` (default 3100) that forwards to it. Control: `curl -X POST 'http://localhost:<port>/__fake/mode?qbit=normal|alt|firewalled|disconnected|slow|down&front=normal|down|cloudflare'` (loopback only). `slow` delays maindata 25 s; qbit `down` closes connections; front `down` answers 502 to server function calls; front `cloudflare` answers 401 to requests with `X-Requested-With`. Prints the URL and fake credentials; exits if `.output` is missing.

**Acceptance Criteria:**
- Given width 1280px and the fake script in `normal`, when ego-browser opens `/` and logs in with the fake credentials, then the header shows left to right 「種子」, ↓ pill, ↑ pill, space, search, 「新增」, shortcuts, settings; the content column is at most 1240px wide, centered, padded 22px 28px; below it the selected 「全部 4」 tab and 「列表｜排序：加入時間 ↓」; `main` is the only scroll container, so the header stays when content scrolls.
- Given width 390px, when the same page renders, then row 1 is 「種子」 plus search and 新增 44px round buttons, row 2 the speed line, row 3 「全部 4 ▾」 and 「加入時間 ↓ ▾」, no shortcuts button, and `document.documentElement.scrollWidth` equals 390.
- Given any viewport, when Tab is pressed repeatedly from the top, then focus never lands on search, 新增, shortcuts, settings, category or sort; each of them reports `disabled`, computed opacity 0.5, cursor `not-allowed`, and the `aria-label` listed in Always.
- Given the fake script switched to `alt` and back, when the next data arrives, then the download limit text changes 「不限速」 to 「上限 10.0」 and back without a reload.
- Given `firewalled`, `slow` (more than 10 s after the last success, the fetch still in flight), front `down` (desktop and phone), and front `cloudflare`, when ego-browser looks, then the screens match rows H5, H6, H7 and H9; with front `down` the computed opacity of `main` is 0.5, it still scrolls, and 「重試」 sends exactly one server function call (network log) and, after `front=normal`, the bar disappears; with `cloudflare`, 「重新登入」 reloads the page.
- Given the login screen and front `down` or `cloudflare`, when the login form is submitted, then the same bar shows at the top of the login column (rows LA1, LA2), and nothing names a host, port or exception.
- Given the fake script, when ego-browser saves screenshots after hiding every extension overlay (password manager included), then `_bmad-output/implementation-artifacts/screenshots/1-7/` holds `header-{normal,firewalled,stale,home-unreachable,cloudflare-expired}-{desktop,phone}-{light,dark}.png` (20 files, desktop 1280 x 844, phone 390 x 844, dark through emulated `prefers-color-scheme`) and `login-alert-{desktop,phone}-{light,dark}.png` (4 files); the implementer opens every PNG and confirms no personal data, no real torrent name and no overlay; the console shows no CSP violation.
- Given the source tree, when `rg -n "fake-qbit" src` runs, then there is no hit, and no file under `.output/public` or `.output/server` contains `__fake/mode`.

## Spec Change Log

## Review Triage Log

### 2026-11-16: Review pass
- verdicts: 34 findings: high 0, medium 7, low 27, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` VG: useConnectionAlert never run; tests check a copy. real hook exercised through a shared function or a probe render.
  - `[medium]` `[patch]` VG: live ShellLayout branch never rendered. AppShell rendered under a seeded client for H1, H5, H7.
  - `[medium]` `[patch]` VG: 重試 / 重新登入 mapping untested. pure runBarAction shared by header and login, tested.
  - `[low]` `[defer]` VG: login submit clearing codes only browser-checked. node setup cannot fire form events; decision helpers tested; bar render test added.
  - `[medium]` `[patch]` Blind: alert bar re-announces every second. live region on stable text; ticking suffix outside.
  - `[medium]` `[patch]` Blind: hidden layout does per-second work four times. one model per tick in a provider.
  - `[low]` `[patch]` Blind: 重試 has no pending state and can cancel itself. aria-busy and press guard.
  - `[low]` `[patch]` Blind: speed limit read without unit. sr-only full text.
  - `[low]` `[patch]` Blind: loading has no accessible state. aria-busy.
  - `[low]` `[reject]` Blind: firewalled hides stale data. UX-DR92 and the AC say one problem at a time; the spec routes one alert kind; recorded for Alex to revisit if it bites.
  - `[medium]` `[patch]` Blind: live shell path never rendered. same fix as the VG row.
  - `[low]` `[patch]` Blind: login bar has no component test. render test for the three codes.
  - `[low]` `[patch]` Blind: bar decision made three ways. barFor on both screens.
  - `[low]` `[patch]` Blind: per-kind rules scattered. one record per kind.
  - `[low]` `[patch]` Blind: fake-qbit undiscoverable and unchecked. npm script and node --check in CI.
  - `[low]` `[patch]` Blind: fake Cloudflare covers only 401. 302 and HTML modes.
  - `[low]` `[reject]` Intent R2: single alert across surfaces. UX-DR92; same as the Blind firewalled row.
  - `[low]` `[reject]` Intent R3: only main dims, not the filter row. matches the S01-offline mockup.
  - `[low]` `[reject]` Intent R4: phone 全部 shows a count. follows the S02-offline mockup.
  - `[low]` `[reject]` Intent R5: login 重試 resubmits instead of fetching. the login screen has no data to fetch; recorded as Claude 代決.
  - `[low]` `[defer]` Intent: scroll and dim not observable until the list exists. Story 1.8 mounts the list; re-check dim there.
  - `[low]` `[reject]` Intent: disabled placeholder visuals rely on CSS. base rule from Story 1.3 is tested there.
  - `[low]` `[reject]` Intent: two role=alert nodes in the DOM. the hidden layout is display:none, which removes it from the accessibility tree.
  - `[low]` `[defer]` Intent: real Cloudflare trigger not observed. NAS checklist in Story 1.9 (AR-60).
  - `[low]` `[patch]` Intent: phone column lacks bottom padding (UX-DR73). added.
  - `[low]` `[reject]` Intent: no title tooltips on disabled placeholders. Claude 代決: the shortcuts they would name do not exist yet.
  - `[medium]` `[patch]` Edge: per-second re-announcement. same fix as the Blind row.
  - `[low]` `[defer]` Edge: first fetch failing with qbit_rejected or bad_origin leaves skeletons forever. Story 1.8 builds the list loading and empty states; add the error state there.
  - `[low]` `[patch]` Edge: focus lost when the login bar unmounts. focus moved to a stable target.
  - `[low]` `[patch]` Edge: focus lost after a successful header retry. focus moved to main or h1.
  - `[low]` `[patch]` Edge: fake-qbit orphans the app on startup failure. top-level cleanup.
  - `[low]` `[patch]` Edge: fake-qbit exits 0 after an app crash. exit code propagated.
  - `[low]` `[patch]` Edge: fake-qbit swallows EADDRINUSE on ::1. only address-family errors swallowed.
  - `[low]` `[patch]` Edge: --port=N ignored. both forms parsed.

## Design Notes

## Resolved question (Alex, 2026-11-16)

Alex chose option (A): on desktop, firewalled or disconnected replaces both speed pills with one warning pill (`surface` background, 1px `status-stalled` border, `status-stalled` warning icon, 「防火牆擋住了」 or 「斷線了」 in `text`); speeds return when the state clears, matching the phone. The spec already follows (A). Original question kept below.

### Original question

On desktop, when qBittorrent reports `connection_status` firewalled or disconnected, what happens to the two speed pills? No mockup draws this state. The AC says 「電腦膠囊的警告圖示和外框變 `status-stalled`，字用 `text`，寫「防火牆擋住了」或「斷線了」」 (one pill), and on the phone the whole speed line is replaced. Firewalled can last for days when the port is not forwarded, so the choice decides whether speeds stay visible during it.
- (A) Both speed pills are replaced by one pill: `surface` background, 1px `status-stalled` border, 14px `status-stalled` warning icon, 「防火牆擋住了」 or 「斷線了」 in `text`. Speeds come back when the state clears, the same as the phone line. Claude's recommendation: it matches the phone and the AC's single pill.
- (B) Both speed pills stay with speeds and limits; a third pill with the warning look follows them.
- (C) The download pill keeps its speed, its arrow becomes the warning icon, its border turns `status-stalled` and its limit text becomes 「防火牆擋住了」; the upload pill stays normal.

The spec is written for (A). For (B) or (C) only row H5, `header-model.ts` and `speed-area.tsx` change; flip `status` to `ready-for-dev` after the answer.

**Visual values** (S01-offline-desktop, S01-loading-desktop, S01-list-mode-desktop, S02-offline-phone, S02-list-mode-phone, S02-loading-phone, DESIGN.md components):

| Element | Value |
|---|---|
| Desktop column | max 1240px content (1296px with padding), padding 22px 28px, groups gap 14px; header row gap 12px, wraps |
| Phone column | padding 18px 16px 0, groups gap 14px; header group (title row plus line or bar) gap 6px; title row `justify-between`, buttons gap 8px |
| Speed pill | `surface`, 1px `border`, full radius, padding 7px 14px, gap 6px, nowrap, tabular nums; arrow 14px stroke 2.6, ↓ `status-downloading` (`role="img"`, `aria-label` 下載), ↑ `status-seeding` (上傳); limit `text-muted` |
| Phone line | `meta` 12px, gap 12px between groups, group gap 4px, arrows 12px; warning variant: 12px `status-stalled` icon plus text in `text` |
| Stale text | `text-muted`; desktop 13px right of the pills; phone 12px after the groups |
| Skeleton | `surface-muted`, `animate-skeleton`; desktop pill bars 92 x 12 and 100 x 12, radius 6px; phone 96 x 10 and 104 x 10, radius 5px; count 20 x 10 (desktop tab), 22 x 10 (phone button), radius 5px |
| Icon button | 36px circle (phone 44px), `surface`, 1px `border`, icon 20px (search stroke 2.2, keyboard and settings stroke 2) |
| 新增 | desktop 36px capsule, `accent` / `accent-foreground`, bold, padding 0 16px 0 12px, gap 6px, plus 18px stroke 2.4; phone 44px circle, plus 20px |
| Alert bar | `surface`, 1px `status-stalled` border, radius `card` 16px, padding 6px 6px 6px 14px (phone 12px left), gap 10px; icon 18px stroke 2.2 `status-stalled`; text `text`, 13px (phone 12px), `flex-1 min-w-0`; button outline capsule `surface`, 1px `border`, 32px (phone 44px), padding 0 14px, weight 600 |
| 「全部」 tab | 34px capsule, padding 0 13px, gap 6px; selected `accent` background and border, `accent-foreground` text, count at opacity .75; tablist padding 3px |
| Sort pill | desktop 40px, phone 44px capsule, `surface`, 1px `border`, padding 0 10px 0 6px, gap 8px; mini pill `surface-muted`, 12px weight 600, padding 3px 8px (phone 4px 8px, icon only), list icon 16px; label weight 700; chevron 16px |
| Phone category | 44px capsule, padding 0 10px 0 14px, gap 6px, name weight 600, count `text-muted`, chevron 16px |
| Dim | `main` opacity 0.5 |

Icons (lucide-react 1.73.0, closest to the mockup paths): `ArrowDown`, `ArrowUp`, `Search`, `Plus`, `Keyboard`, `Settings`, `List`, `ChevronDown`, `WifiOff` (mockup alert icon), `TriangleAlert`.

Contrast (WCAG formula): `status-stalled` icon and border on `surface` 4.29 light, 6.66 dark (graphics need 3); `text-muted` on `surface` 5.87 / 6.26 and on `surface-page` 5.42 / 5.61; arrows on `surface` 4.71 and 4.34 light, 6.39 and 7.6 dark; on the phone line (`surface-page`) 4.35 and 4.01 light. Disabled controls are exempt.

**Claude 代決** (for Alex's veto):
- Warning icon: `TriangleAlert` in the firewalled/disconnected pill, the phone warning line and the Cloudflare bar; `WifiOff` (the mockup's) for the two unreachable bars.
- Limit under 1 MB/s keeps its unit (「上限 500 KB/s」); only MB/s drops it, as in 「上限 32.7」.
- The phone speed line may wrap; each group stays on one line, so a long stale text drops to a second line instead of causing horizontal scroll.
- The selected desktop 「全部」 tab is not disabled (50% would misstate the selection); it is inert until the category story.
- No `title` tooltips on disabled placeholders (the mockup's 「搜尋（/）」 and 「按 1」 name shortcuts that do not work yet).
- Header stays put by layout: `main` is the scroll container (mockup structure), not `position: sticky`.
- Login screen bar: first child of the login column, above the card on desktop (400px wide, gap 16px), above 「登入」 on phone; same component and sizes.
- Login 「重試」 resubmits the form; the bar sits above the card so the merged `bad_origin` message keeps its place; clearing the codes when a submit starts and on `not_logged_in`/`qbit_auth_failed` (the container answered, so old connection codes are stale).
- 「重試」 does not change its label; another press restarts the fetch (`refreshMaindata` cancels the one in flight).
- The bar's dim applies to the content only; the filter row stays (S01-offline-desktop dims only `main`).
- Component tests use `react-dom/server` `renderToStaticMarkup` in the node environment instead of adding jsdom; behavior lives in tested pure modules; layout, focus and color are checked with ego-browser (same split as spec 1.4).
- Screenshots use `scripts/fake-qbit.mjs` against the built server (no `.env` loading); `home_unreachable` and `cloudflare_expired` come from its front proxy, the qBittorrent-side states from its fake API.

**Carried-forward items:**
- Spec 1.4 deferred (connection failures on the login screen): handled by LA1 to LA3; the global `MutationCache` `onError` already records the codes, the login screen reads them through `useLoginConnectionAlert()`.
- Spec 1.5 (`dl_rate_limit` / `up_rate_limit` already the alt limit): used directly; H3 proves the text follows the next data.
- Spec 1.6 and its review fix PR: `useMaindata` fixed selectors, `refreshMaindata` (forced pull), the code store (newest unreachable code wins, Cloudflare kept) and `pickConnectionAlert` (`fetchStartedAt`, about 2 s hold-back) are reused as merged, not re-implemented here. Wire size stays deferred to Story 1.9.
- Spec 1.3 Radix Dialog `<style>` vs CSP: not touched, this story uses no style-injecting Radix primitive; stays deferred to the first Dialog story.
- AR-60 (Cloudflare 401 or redirect): Cloudflare documents a 401 for AJAX requests carrying `X-Requested-With: XMLHttpRequest` and recommends a page refresh, which `callFn` already maps to `cloudflare_expired`; the real check stays on the Story 1.9 NAS checklist.

**Docs consulted (AD-11):**
- Cloudflare Access session management (expired token, 401 with `X-Requested-With`, refresh the page): https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/
- Cloudflare Access authorization cookie: https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/
- TanStack Query v5 `useQuery` (`isFetching`, `dataUpdatedAt`, `refetchInterval`, `select` memoization): https://tanstack.com/query/v5/docs/framework/react/reference/useQuery
- TanStack Query v5 `QueryClient` (`cancelQueries`, `refetchQueries`): https://tanstack.com/query/v5/docs/reference/QueryClient
- TanStack Router layout routes and `Outlet`: https://tanstack.com/router/latest/docs/framework/react/routing/routing-concepts
- React `renderToStaticMarkup`: https://react.dev/reference/react-dom/server/renderToStaticMarkup
- `HTMLFormElement.requestSubmit`: https://developer.mozilla.org/en-US/docs/Web/API/HTMLFormElement/requestSubmit
- Tailwind CSS v4 responsive design and `@utility`: https://tailwindcss.com/docs/responsive-design, https://tailwindcss.com/docs/adding-custom-styles

## Verification

**Commands:**
- `bash -c 'source ~/.nvm/nvm.sh && nvm use && npm run lint'` -- expected: exit 0.
- `bash -c 'source ~/.nvm/nvm.sh && nvm use && npm run typecheck'` -- expected: exit 0.
- `bash -c 'source ~/.nvm/nvm.sh && nvm use && npm test'` -- expected: all pass, including rows H1 to H12, S1, R1, LA1 to LA4 and the static markup tests.
- `bash -c 'source ~/.nvm/nvm.sh && nvm use && npm audit'` -- expected: 0 vulnerabilities.
- `bash -c 'source ~/.nvm/nvm.sh && nvm use && npm run build'` -- expected: exit 0.
- `bash -c 'source ~/.nvm/nvm.sh && nvm use && npm run smoke'` -- expected: passes.
- `bash .claude/skills/next-story/check.sh` -- expected: every line ok.

**Manual checks (if no CLI):**
- `bash -c 'source ~/.nvm/nvm.sh && nvm use && node scripts/fake-qbit.mjs'`, then with the ego-browser skill run the browser ACs, switch modes with the printed `curl`, take the 24 screenshots, read the computed values in the Visual values table in both schemes, collect CSP violations with a `securitypolicyviolation` listener, and open every saved PNG. If ego-browser fails, halt as blocked.

## Auto Run Result (pipeline)

- **Decision by Alex (2026-11-16):** on desktop, firewalled or disconnected replaces both speed pills with one warning pill, matching the phone.
- **Built on PR #9 (merge d68d10c):** final APIs from the 1.4 to 1.6 review fixes (fixed selectors, fetchStartedAt, connection store replace rules, login screen message model).
- **Review findings:** 34 findings. 22 patched (7 medium entries), 4 deferred (in frontmatter), 8 rejected with reasons.
- **Follow-up review recommended:** false. The medium patches (live region, single per-tick provider, real hook test, AppShell render tests, shared bar action) each have tests that ran green; no unverified risk from the patches can be named except focus restore, which is deferred for a browser check.
- **Verification (Node v26.13.1):** lint exit 0; typecheck exit 0; vitest 51 files, 976 tests passed; audit 0 vulnerabilities; `node --check scripts/fake-qbit.mjs` ok; fresh build ok; `npm run smoke` passed; no fake-script strings in `.output`; `check.sh` all ok.
- **Screenshots:** 24 PNGs in `screenshots/1-7/` taken against the fake server before the review patches; the orchestrator viewed all of them (as contact sheets) and found no personal data and no browser-extension overlay. The review patches changed no visible element except the phone column's bottom padding.
- **Residual risks:** the deferred items; screenshots predate the review round.
