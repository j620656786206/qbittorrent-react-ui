# Epic 1 Context: See All Torrents on Open

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Rebuild react-torrent from the official TanStack Start template so Alex can open the new version on his NAS (desktop over plain http at home, phone over Cloudflare Tunnel outside), log in with the qBittorrent credentials, and see every torrent in a list with status, progress, size and location. The header always shows current speeds and active limits, and connection problems (home unreachable, Cloudflare login expired, qBittorrent not responding) are distinguishable and retryable. The epic builds only the foundation this path needs: scaffold, legacy cleanup, server gate and error contract, login and session, torrent sync, list, image, CI and NAS deployment template. Settings file, sort memory, common paths, bottom sheet, toast and shortcut registry are explicitly out of scope.

## Stories

- Story 1.1: Restart from the official template, remove legacy files
- Story 1.2: Server gate, error contract and logging
- Story 1.3: Frontend foundation: design tokens, shadcn mapping, system dark mode, callFn, global error handling
- Story 1.4: Login screen
- Story 1.5: Container owns the qBittorrent connection and torrent table
- Story 1.6: Frontend torrent data, status and number pure functions
- Story 1.7: Header, global speed and connection alert bar
- Story 1.8: Torrent list, skeleton and empty state
- Story 1.9: Image, CI push and NAS deployment template

## Requirements & Constraints

- Login uses the qBittorrent username and password, checked inside the container (never forwarded to qBittorrent). Any URL shows login when unauthenticated or expired; afterwards return to the original same-site URL. "Remember me" lasts 90 days, otherwise 12 hours. No logout button; the browser never stores credentials. Failures distinguish wrong credentials, a global 15-minute lockout after 5 wrong attempts, and a wrong qBittorrent password inside the container.
- Header on every screen with speed (down/up) and the currently active limit, including the alternative limit when it is in effect. Firewalled/disconnected status and "last updated N seconds ago" (only after 10 s without fresh data) shown in the speed area.
- One alert at a time, priority: Cloudflare expired > home unreachable = qBittorrent not responding > disconnected > firewalled > stale data. Unreachable states dim content to 50% but keep it scrollable.
- Every torrent maps to one of 7 fixed status words plus a board column; raw qBittorrent state codes, Unix times, home addresses and exception text never appear in the UI.
- One shared formatting rule set for numbers, sizes (1024-based), speeds, ETA, dates, relative time, durations, ratio and percent (floor, never 100% unless done).
- Archived torrents (non-private `missingFiles`) are excluded from the list and all counts.
- Submitting buttons change label and block re-submit; after 10 s show a "still waiting for NAS" hint; 30 s counts as failure.
- First load shows row-sized skeletons (no spinners); empty list shows a centered empty state.
- Performance: about 4165 torrents; list must be virtualized with no perceptible lag. Poll every 5 s for changes only; pause when tab hidden, fetch immediately on return; keep old data on failure.
- Breakpoint: 1024 px and up is desktop, below is phone; no horizontal scroll at 390 px. Latest Chrome, Edge, Safari.
- Everything must work over plain http (no https-only browser APIs).
- Security and privacy: credentials, IPs and the private category's real name never enter git, logs or error messages. Tests, CI and automation never write to a real qBittorrent; reads against the real instance only in local development.
- Three facts must be verified during the epic and fed back into the architecture if they differ: whether `sync/maindata` torrents carry a `private` field; whether `X-Forwarded-Proto` is https through the Tunnel; whether expired Cloudflare Access returns 401 or a redirect for requests with `X-Requested-With`.

## Technical Decisions

- **Shape:** one container acting as a BFF: serves the SPA, is the whitelist gate to qBittorrent, and owns the torrent table. Same origin, no CORS headers ever, and the container never returns HTTP 401 (reserved for Cloudflare Access).
- **Stack (exact versions, no `^` on framework packages):** TanStack Start 1.169.x SPA mode on Nitro 3, Router 1.170.x, Query 5.107.x, `@tanstack/react-virtual` 3.x, React 19.3.x, Vite 8.3.x, Tailwind 4.3.x, zod 4.6.x, vitest 5.1.x, latest shadcn/ui, Node 26 LTS, qBittorrent API 5.1.4. Read version-matched official docs before writing framework code and list URLs in the PR. No i18n, animation or gesture packages; UI copy is written directly in Traditional Chinese.
- **Layering enforced by ESLint import boundaries:** `routes`/`features` may import `state`, `lib`, `shared`, `server/functions`; `state` imports `lib`, `shared`; `server/functions` imports `server/*`, `shared`; `server/*` imports `lib`, `shared`; `lib` imports `shared`. Features never import each other.
- **Conventions:** kebab-case files; server functions are verb-first camelCase; torrent identity is lowercase hex `hash`; field names stay qBittorrent snake_case; times travel as Unix seconds and sizes as bytes, formatted only in the UI.
- **Server functions:** created only through `src/server/functions/_define.ts` (lint blocks `createServerFn` elsewhere). The factory enforces login, zod input validation, 30 s qBittorrent timeout and exception-to-error mapping. One function per qBittorrent operation; no generic `/api/v2/*` proxy; nothing that changes qBittorrent preferences. Mutations are POST, reads GET without side effects. Only `login` and `GET /healthz` are unauthenticated; `/healthz` is the only server route and returns `200 ok` without touching qBittorrent or settings.
- **Server function pattern (after PR #6, 2026-11-16):** `export const x = serverGet|serverPost.validator(input(schema)).handler(guard({ name: 'x', auth?, bodyLimit? }, async ({ input, signal, session }) => ok(...)))`. The schema is written once in `input(schema)`; a function without `.validator(input(...))` always returns `invalid_input`. Server function modules export only server functions (the discovery test enforces it). `guard()` trusts only sessions produced by `verifySession`; tests use `testSession()` from `src/server/auth/testing.ts`. Browser-reachable code imports `SessionPayload` / `isVerifiedSession` from `src/server/auth/verified.ts` only. `AppError.message` is the code; screens use `errorText(code)`. Anonymous requests have a fixed 64 KB body limit (`ANONYMOUS_BODY_LIMIT`). Browser schemas import `z` from `src/shared/zod.ts` (jitless, CSP).
- **Request gate (`src/start.ts`):** CSRF middleware plus `Host`/`Origin` allowlist (`APP_ORIGINS`) and required `X-Requested-With` (except `/healthz`); check origin and cookie before reading the body. CSRF middleware runs with `allowRequestsWithoutOriginCheck: true` (plain-http LAN browsers send no `Sec-Fetch-Site` and same-origin GETs no `Origin`); protection rests on the Host allowlist, required `X-Requested-With: XMLHttpRequest`, required `Origin` on POST, and SameSite=Strict. CSP and security headers on every response; HTML responses use `script-src 'self' 'nonce-<per-request>'` (passed through `getRouter()` `ssr.nonce`, because Start's shell has 3 inline scripts), static assets use the plain `script-src 'self'` string; never `'unsafe-inline'`. No external scripts or fonts. Lint blocks raw HTML injection APIs.
- **Session:** `rt_session` cookie, HttpOnly, SameSite=Strict, Secure only when the request protocol is https; signed with `iat`/`exp`, `exp` checked every time. Rotating `SESSION_SECRET` logs everyone out. Credential compare: SHA-256 both sides then `timingSafeEqual`.
- **qBittorrent session:** container logs in itself; take cookie name and value from `Set-Cookie` as is (do not hardcode `SID`); success needs `Ok.` plus `Set-Cookie`; single-flight re-login on 403 then one resend. Circuit breaker: re-login `Fails.` or login 403 means every request returns `qbit_auth_failed` until restart.
- **Error contract:** failures return `{ ok: false, error: { code, message } }`, never throw. Unexpected exceptions (bugs) map to `qbit_rejected`; the raw error goes only to the log. Codes: `not_logged_in`, `login_failed`, `login_locked`, `cloudflare_expired`, `home_unreachable`, `qbit_unreachable`, `qbit_auth_failed`, `qbit_rejected`, `timeout`, `invalid_input`, `settings_write_failed`, `bad_origin`. UI text only from `src/lib/error-text.ts`.
- **Frontend call path:** single `callFn` adds `X-Requested-With`, 35 s timeout; 401 or HTML-in-200 means `cloudflare_expired`; fetch error, timeout or 5xx means `home_unreachable`. Connection-class codes and auth codes are handled only in global QueryCache/MutationCache `onError`; `not_logged_in` and `qbit_auth_failed` stop all polling without retry and record reason plus current URL in `src/state`. `bad_origin` is a programming error (`console.error`).
- **Sync:** container syncs with its own `rid` only while a client requested data in the last 30 s; keeps a slim table (fields listed in `src/shared/maindata.ts`, add fields there as needed), per-torrent `changedAt` version, 10-minute tombstones. `getMaindata({ since })` returns `{ version, full, changed, removed, serverState, categories }`; `full: true` when `since` is empty, too old, or after restart.
- **Single sources of truth:** `src/lib/maindata-merge.ts` is the only writer of `['maindata']` (lint blocks `setQueryData(['maindata']`), preserving unchanged torrent object references; `classify()` in `src/lib/torrent-status.ts` is the only status mapping (no `torrent.state ===` in features); `selectVisibleTorrents(maindata, view)` is the only ordering (tie-break `added_on` then `hash`); `src/lib/format.ts` owns all special values; `src/lib/paths.ts` owns path logic; one `src/lib` function picks the connection alert; `refreshMaindata()` in `src/state` is the only "fetch now"; one `src/state` hook owns order freezing.
- **Logging:** only `src/server/log` (stdout, masks secrets and cookies, never logs bodies, full headers or env).
- **Config:** env vars `QBIT_URL`, `QBIT_USERNAME`, `QBIT_PASSWORD`, `SESSION_SECRET`, `APP_ORIGINS`, `SAVE_ROOTS`, `CONFIG_DIR` (default `/config`, locally a gitignored `./config`). The container refuses to start when a required one is missing or the secret is weak; never use `VITE_` variables for secrets.
- **Deployment:** non-root, read-only container on Unraid built only in CI; every PR runs lint, typecheck, vitest, `npm audit`, build, then image build and a `docker run` smoke test; main pushes to GHCR. Workflows never use `pull_request_target` and pin third-party actions by SHA.
- **Testing:** vitest covers `src/lib`, `src/state` and server functions with fake qBittorrent responses; an auto-discovering test asserts every server function except `login` returns `not_logged_in` when unauthenticated. No E2E yet.

## UX & Interaction Patterns

- Design tokens (light and dark color roles, 7 status colors with icons, type roles, radii, spacing, shadows) become CSS variables and Tailwind tokens; dark mode follows `prefers-color-scheme` only, no toggle. shadcn variables map onto brand tokens. System fonts only; numbers use `tabular-nums`. Focus ring only on `:focus-visible`. Phone tap targets are at least 44 px.
- Desktop header: title, download and upload speed pills, spacer, search, Add (accent), shortcuts, settings; sticky. Below it an "All" category tab (count excludes archived) and the sort pill showing list view, added time descending. Phone: title row with search and add 44 px round buttons, speed text line, category and sort buttons.
- Epic 1 placeholders: search, add, shortcuts, settings, category and sort buttons sit in their final positions but disabled (50% opacity, not-allowed cursor, no hover, not focusable, `aria-label` kept) so later epics only remove `disabled`. The empty-state "add torrent" button is disabled the same way.
- List: fixed order "added time, newest first", right-side big value is added time. Desktop list spans the full content width (max 1240 px); rows have no click action and no hover yet. Desktop row: reserved 20 px checkbox slot, 36 px status circle, one-line name with `title`, second line location tag, size, speed (omit when 0, no category pill), ratio column (`good` when 1 or more). Phone row drops the ratio column; second line drops speed then size, location tag always kept.
- Status circle: progress ring via SVG `stroke-dashoffset` for downloading, paused and stalled, full ring otherwise; not clickable; screen reader text like "stalled, 87%". No spin-in animation in this epic.
- Location tag in Epic 1 shows the last two segments of the save path; common paths and media-library styling come later.
- While the mouse rests on the desktop list or a phone finger is scrolling, values update but row positions freeze until the condition ends.
- Torrent names and error reasons render as plain text, never as HTML or links.

## Cross-Story Dependencies

- Story 1.1 is first; everything builds on it. Build order follows: 1.1 scaffold and CI, then 1.2 server gate and 1.5 qBittorrent/sync, then 1.6 frontend data and pure functions, then the screens.
- 1.4 depends on 1.3 (tokens, `callFn`, `error-text.ts`, global `onError` auth state) and on 1.2 (cookie signing, factory).
- 1.6 depends on 1.5 (`getMaindata`); its `refreshMaindata()` is reused by 1.7's retry and all later operations.
- 1.7 and 1.8 depend on 1.6 (`classify`, `format`, `paths`, connection-alert function, `selectVisibleTorrents`). 1.7 also wires the alert bar onto the login screen.
- 1.9 extends 1.1's CI with image build, run checks and GHCR push. Alex manually creates the Unraid container, sets GHCR visibility, configures Tunnel and Access, and runs the post-deploy checklist on the NAS; that checklist is the epic's acceptance.
- If 1.5 finds no `private` field in maindata, private-torrent status rules in 1.6 wait for Alex's decision and the architecture must be updated.
- Later epics extend these foundations: Epic 2 adds sort menu, detail panel (list narrows to 560 px), bottom sheet and toast; Epic 3 adds the settings file and its skeleton gating.
