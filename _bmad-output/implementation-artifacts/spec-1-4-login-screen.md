---
title: 'Story 1.4: Login screen'
type: 'feature'
created: '2026-11-16'
status: 'done'
baseline_revision: '15bafe25bb36e0b24e2127c4a9a2affc750896ec'
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
      Connection failures (home_unreachable, cloudflare_expired, qbit_unreachable) while submitting login show no message on the login screen.
    evidence: |-
      Story 1.7 wires the connection alert bar onto the login screen; it must also read mutation connection codes, not only query state (carried from 1.3).
    location: >-
      src/features/login/login-screen.tsx
    severity: medium
  - summary: >-
      The _authed beforeLoad wiring to requireSession and the LoginScreen DOM wiring have no automated test.
    evidence: |-
      Needs a router or jsdom harness; logic lives in tested pure modules (requireSession, form model, completeLogin, watchLoginRequired).
    location: >-
      src/routes/_authed.tsx
    severity: low
  - summary: >-
      Queries with no data or in error state still fetch on mount while login is required (refetchOnMount false does not block them).
    evidence: |-
      Harmless extra request that returns not_logged_in again; revisit when Story 1.6 adds the first polling query.
    location: >-
      src/state/query-client.ts
    severity: low
---

<intent-contract>

## Intent

**Problem:** Nothing checks login yet: every URL renders without a session, there is no `login` server function, `setSessionCookie` has no caller, and the 1.3 login store (`not_logged_in` / `qbit_auth_failed`) is recorded but never shown. 1.2's gate and factory have only been tested with hand-built harnesses, never through Start's real handler.

**Approach:** Add a public `login` server function (SHA-256 plus `timingSafeEqual` against the env credentials, in-memory global lockout, issues `rt_session`) and a gated `getSession` GET. Protect every page under a pathless `_authed` layout whose `beforeLoad` redirects to `/login?redirect=<same-site path>` (Start auth guide pattern). Build the S10 login screen from the mockups with shadcn Input, Checkbox and Button restyled to DESIGN.md. Extend the built-server smoke test to call the real functions.

## Boundaries & Constraints

**Always:**
- Credentials are compared only in the container, never sent to qBittorrent; the browser stores no credential (no localStorage, sessionStorage, IndexedDB, cookie readable by JS, URL or `VITE_` variable).
- Every server function comes from `_define.ts`; `login` is the only `auth: 'public'` function; no new server route.
- Lockout is one global in-memory counter; never read `CF-Connecting-IP` or `X-Forwarded-For`.
- Log failures and lockouts through `src/server/log` only, never username or password values (not even hashes).
- Screen text comes from the mockups, the story ACs or `errorText()`. Every visual value comes from the S10 mockups or DESIGN.md (table in Design Notes). Traditional Chinese, no em dash.
- Tests and screenshots use fake env only (`QBIT_URL=http://qbit.test.invalid:8080`, `QBIT_USERNAME=dev`, `QBIT_PASSWORD=dev-pass`); this story never calls qBittorrent.

**Never:**
- No logout button, no qBittorrent address field, no toast, no spinner.
- No alert bar or connection-state UI on the login screen (Story 1.7). Connection codes stay with the global `onError`.
- No Dialog on this screen (so no CSP `style-src` change); no change to `src/shared/csp.ts`.
- No `disabled` or `aria-disabled` on the submitting button (both dim it to 50%; UX-DR93 says the color stays).
- No new test dependency (no jsdom, no testing-library); no animation, i18n or gesture package.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| R1 Return path ok | `safeReturnTo` of `/`, `/?view=list#x`, `/a/b?c=1` | same string | none |
| R2 Return path unsafe | `undefined`, `123`, `''`, `//evil.example`, `/\evil.example`, `https://evil.example/`, `javascript:alert(1)`, `/\t/evil.example`, a 2049-char path, `/login?redirect=/` | `/` | none |
| L1 Login ok, remember | env creds, `remember: true` | `{ ok: true, data: { exp } }`; token `exp - iat` = 7 776 000; `setSessionCookie(token, 7776000)` called once | none |
| L2 Login ok, not remembered | `remember: false` | same, 43 200 s | none |
| L3 Wrong credentials | wrong password, or wrong username, or both empty | `login_failed`; no cookie; counter +1 | log `login_failed` with `consecutiveFailures`, no values |
| L4 Lock starts | 5th wrong attempt in a row | `login_locked`; lock until now + 15 min | log `login_locked` with `until` |
| L5 Locked | 6th attempt with correct credentials, 1 ms to 14:59.999 after the lock | `login_locked`; credentials not compared; no cookie | log `login_rejected_locked` |
| L6 Lock expiry | correct credentials at exactly lock + 15:00 | ok; counter 0 | none |
| L7 Reset on success | 4 wrong, 1 right, 4 wrong | last answer `login_failed` (not locked) | none |
| L8 Bad input | missing `remember`, non-string, 1025-char password | `invalid_input`; counter unchanged | none |
| L9 Never forwarded | every row above with `fetch` stubbed | `fetch` called 0 times | none |
| L10 Log hygiene | rows L3 to L5 with stdout captured | no line contains the fake username, password or their SHA-256 hex | none |
| S1 getSession | valid session in context / none | `{ ok: true, data: { exp } }` / `not_logged_in` | none |
| G1 Guard, store set | `loginRequired = { reason, returnTo: '/?v=1' }` | throws redirect to `/login`, search `{ redirect: '/?v=1' }`; session not fetched | none |
| G2 Guard, no session | fetch rejects `AppError('not_logged_in')`, location `/x?y=1#z` | throws redirect `{ redirect: '/x?y=1#z' }` | none |
| G3 Guard, ok | fetch resolves `{ exp }` | resolves, no redirect | none |
| G4 Guard, connection | fetch rejects `home_unreachable` or `cloudflare_expired` | resolves, no redirect (Story 1.7 shows the alert) | none |
| W1 Watcher | store `null` to set; set to set; set to `null` | listener called once (first change only) | none |
| F1 Form, wrong | submit result `login_failed` or `login_locked` | message `errorText(code)`; clear password; focus password; username kept | none |
| F2 Form, other inline | `invalid_input`, `qbit_rejected`, `timeout` | same as F1 | none |
| F3 Form, global code | `home_unreachable`, `cloudflare_expired`, `qbit_unreachable`, `bad_origin` | no message; password and username kept | left to global `onError` |
| F4 Form, stored reason | no submit error, store `qbit_auth_failed` / `not_logged_in` / `null` | `errorText('qbit_auth_failed')` with the password marked invalid / none / none; a submit error replaces it | none |
| F5 Slow hint | pending at 9 999 ms / 10 000 ms | hint false / true; false again once settled | timer cleared |
| B1 Built: no cookie | real `getSession` GET, allowed Origin, XRW | HTTP 200 (not 401), body code `not_logged_in` | none |
| B2 Built: wrong login | real `login` POST, wrong password | 200, `login_failed`, no `Set-Cookie` | none |
| B3 Built: login over http | correct, `remember: false` | `Set-Cookie: rt_session=...; Max-Age=43200; Path=/; HttpOnly; SameSite=Strict`, no `Secure` | none |
| B4 Built: login over https | correct, `remember: true`, `X-Forwarded-Proto: https` | same with `Max-Age=7776000` and `Secure` | none |
| B5 Built: cookie | `getSession` with the B3 cookie | 200, `ok: true` | none |
| B6 Built: foreign Origin | `getSession` with the B3 cookie and `Origin: https://evil.example`; `login` POST with that Origin | 403 JSON `bad_origin`; no `Set-Cookie` | none |

</intent-contract>

## Code Map

- `src/server/functions/_define.ts` -- `serverGet` (23), `serverPost` (25), `input()` (34), `guard()` (83: auth, body limit, `safeParse`, 30 s race, `ServerFailure` and catch-all mapping). Reuse as is. Every export of a `src/server/functions/*.ts` file must be a factory server fn (discovery test), so schemas live in `src/shared`.
- `src/server/functions/discover.test.ts` -- auto-discovers real functions; `PUBLIC_NAME = 'login'` (21). New files are picked up automatically.
- `src/server/functions/__fixtures__/public-login.ts` -- golden example of a public `login` shape.
- `src/server/auth/session.ts` -- `issueSession({ remember })` (31) returns `{ token, maxAge }`; `verifySession`; `sessionCookieOptions` (95); `setSessionCookie(token, maxAge)` (109) uses Start's `setCookie` and `getRequestProtocol()` (honours `X-Forwarded-Proto` by default, checked in installed `start-server-core/dist/esm/internal-request-response.js:556`). First caller is `login`.
- `src/server/gate/session.ts` -- puts `session` in context for server fn requests only; `guard()` reads it.
- `src/server/env/index.ts` -- `getEnv()` gives `qbitUsername`, `qbitPassword`.
- `src/server/log/index.ts` -- `log.warn(event, fields)`; keys containing `password`, `session`, `secret`, `token`, `cookie` are masked, so name fields `consecutiveFailures`, `until`.
- `src/state/call-fn.ts` -- `callFn(fn, input?, { signal })`; failures throw `AppError`.
- `src/state/login-required.ts` -- `loginStore`, `markLoginRequired` (no-op without `window`), `clearLoginRequired`, `isLoginRequired`, `useLoginRequired`.
- `src/state/query-client.ts` -- global `onError` (50) marks login-required and cancels queries; default `retry` (67) retries connection codes 3 times; `loginStore.subscribe` (81).
- `src/lib/app-error.ts` -- `AppError`, `isAppError`; `src/lib/error-text.ts` -- `errorText(code)` (texts for `login_failed`, `login_locked`, `qbit_auth_failed` already match the ACs).
- `src/shared/ui/button.tsx` -- shadcn generated, not brand-styled yet; `src/shared/ui/cn.ts`; `src/shared/ui/ui.test.ts` (bans `outline-none`, `focus-visible:ring*` in `src/shared/ui/*.tsx`).
- `src/styles.css` -- tokens (`--text-page-title`, `--text-body`, `--text-meta`, `--text-column-title`, `rounded-panel`, `rounded-xs`), `hover-solid` utility, global `:focus-visible` outline, `:disabled, [aria-disabled='true']` at 50%.
- `src/routes/index.tsx` -- temporary 「種子」 page; moves under `_authed`. `src/routes/__root.tsx` -- shell only; leave it (its `beforeLoad` would run during the server shell render).
- `src/router.tsx` -- `getRouter()` with `context: { queryClient }`, `ssr: { nonce }`.
- `scripts/smoke-built-server.mjs` -- `checkValidBoot()` (96) boots `.output/server/index.mjs` with fake env (`QBIT_USERNAME: 'smoke-user'`, random password, `APP_ORIGINS: base`).
- `eslint.config.js` -- layers: routes may import features, state, lib, shared, server-functions; features may import state, lib, shared, server-functions; state only lib and shared.
- Installed sources checked: `router-core/dist/esm/load-server.js:78` (shell render loads only the root route); `start-plugin-core/dist/esm/vite/planning.js:73` (`TSS_SHELL` is true only in dev, so the built server SSRs child routes per request); `start-plugin-core/dist/esm/start-compiler/compiler.js:295` (build ids are SHA-256 of file and export); `start-client-core/dist/esm/client-rpc/serverFnFetcher.js` (request format: `x-tsr-serverFn: true`, POST body `JSON.stringify(await toJSONAsync({ data }))` from `seroval`, GET `?payload=`).

## Tasks & Acceptance

**Execution:**
- `src/shared/login.ts` -- `loginInputSchema = z.object({ username: z.string().max(1024), password: z.string().max(1024), remember: z.boolean() })`, `LoginInput`; `loginSearchSchema = z.object({ redirect: z.string().optional().catch(undefined) })` -- AD-13 search params validated by a shared zod schema.
- `src/lib/return-to.ts` -- `safeReturnTo(value: unknown): string` per R1, R2: string of at most 2048 chars, starts with `/`, not `//`, no `\`; `new URL(value, 'http://return.invalid')` must keep that origin; result is `pathname + search + hash`; a `/login` path gives `/` -- AC "原網址只接受站內路徑".
- `src/server/auth/credentials.ts` -- `credentialsMatch(username, password, env)`: SHA-256 each side, `timingSafeEqual` per pair, both pairs always computed, then combined -- AD-3.
- `src/server/auth/login-lockout.ts` -- `LOCK_AFTER_FAILURES = 5`, `LOCK_MS = 900_000`; module state `{ consecutiveFailures, lockedUntil }` using `Date.now()` (fake timers drive it); `lockedUntil(now)`, `recordFailure(now)` returning whether the lock started, `recordSuccess()`, `resetLoginLockout()` for tests -- AR-21.
- `src/server/auth/login.ts` -- `attemptLogin(input)`: locked: log, `{ ok: false, code: 'login_locked' }` without comparing; mismatch: `recordFailure`, log, `login_locked` if the lock just started else `login_failed`; match: `recordSuccess`, `issueSession({ remember })`, return `{ ok: true, token, maxAge, exp }` -- L1 to L7.
- `src/server/functions/login.ts` -- `export const login = serverPost.validator(input(loginInputSchema)).handler(guard({ input: loginInputSchema, auth: 'public', name: 'login' }, ...))`: `attemptLogin`; on success `setSessionCookie(token, maxAge)` and `ok({ exp })`, else `fail(code)`. Only export -- AR-22.
- `src/server/functions/get-session.ts` -- `export const getSession = serverGet.validator(input(z.undefined())).handler(guard({ input: z.undefined(), name: 'getSession' }, async ({ session }) => ok({ exp: session!.exp })))` (guard already rejected a null session; avoid the non-null assertion if lint forbids it). Only export.
- `src/state/login-required.ts` -- add `onLoginRequired(listener): () => void`, called only when the store goes from `null` to set -- W1.
- `src/router.tsx` -- in the browser only (`typeof window !== 'undefined'`), `onLoginRequired(() => { if (router.state.status === 'idle') void router.invalidate() })` so a later `not_logged_in` / `qbit_auth_failed` reruns `_authed`'s `beforeLoad` and shows login; skipped while a navigation is in flight because that `beforeLoad` redirects itself -- AC "記下 qbit_auth_failed 時顯示登入畫面".
- `src/shared/ui/input.tsx`, `src/shared/ui/checkbox.tsx` -- `npx shadcn@4.23.0 add input checkbox -y`; replace the `cn` import with `#/shared/ui/cn`; remove ring and outline classes (as 1.3 did); Input: `rounded-full border border-input bg-card px-4 text-body`, `aria-invalid:border-destructive`, height left to the caller; Checkbox: `size-5 rounded-xs border-2 border-text-faint`, checked `border-0 bg-primary text-primary-foreground`, indicator lucide `Check` 14px stroke 3; prettier; confirm `package.json` keeps exact versions -- DESIGN text-input, checkbox, UX-DR52.
- `src/shared/ui/button.tsx` -- base `rounded-full`; `default` variant becomes button-primary: `bg-primary text-primary-foreground font-bold hover-solid` (drop `hover:bg-primary/90`); other variants untouched -- DESIGN button-primary.
- `src/styles.css` -- `@keyframes rise` (from `opacity: 0; transform: translateY(10px)`) and `@utility animate-rise` (0.5s `cubic-bezier(.2,.8,.2,1)` both), none under `prefers-reduced-motion: reduce` -- mockup `<main class="rise">`.
- `src/features/login/login-form-model.ts` -- pure: `INLINE_ERROR_CODES` (`login_failed`, `login_locked`, `invalid_input`, `qbit_rejected`, `timeout`); `afterSubmitError(code)` returning `{ message, clearPassword, focusPassword }`; `screenMessage({ submitError, loginRequired })`; `SLOW_HINT_MS = 10_000` -- F1 to F4.
- `src/features/login/session-query.ts` -- `sessionQueryOptions()`: key `['session']`, `queryFn: ({ signal }) => callFn(getSession, undefined, { signal })`, `staleTime: Infinity`, `retry: false`.
- `src/features/login/require-session.ts` -- `requireSession({ location, loginRequired, fetchSession })` implementing G1 to G4 with `redirect({ to: '/login', search: { redirect } })`; any other error also resolves.
- `src/features/login/login-screen.tsx` -- the S10 screen (structure and values in Design Notes): `useMutation` calling `callFn(login, values)`; re-submit ignored while pending, button text 「登入中…」 and `aria-busy`; 10 s hint 「還在等 NAS 回應」 (`text-meta text-muted-foreground`) below the button; on success `clearLoginRequired()`, `queryClient.setQueryData(['session'], data)`, `router.history.replace(safeReturnTo(search.redirect))`; on error apply `afterSubmitError`; message slot reads `screenMessage` with `useLoginRequired()`.
- `src/routes/login.tsx` -- `createFileRoute('/login')({ ssr: false, validateSearch: loginSearchSchema, component })` rendering `LoginScreen`.
- `src/routes/_authed.tsx` -- pathless layout: `ssr: false`; `beforeLoad: ({ context, location }) => requireSession({ location, loginRequired: loginStore.state.loginRequired, fetchSession: () => context.queryClient.ensureQueryData(sessionQueryOptions()) })`; component `<Outlet />`.
- `src/routes/index.tsx` -> `src/routes/_authed/index.tsx` -- same temporary page; `src/routeTree.gen.ts` regenerates on dev or build.
- `scripts/smoke-built-server.mjs` -- add `checkLoginFlow(base, password)` inside `checkValidBoot` for rows B1 to B6: find the `login` and `getSession` ids in the built server manifest (an entry under `.output/server` whose `functionName` is `"login"` / `"getSession"`; exactly one each, else fail with a clear message); send requests the way `serverFnFetcher` does, plus `Host`, `Origin: base`, `X-Requested-With: XMLHttpRequest`, `Accept: application/json`; decode with `seroval` `fromJSON` when `x-tss-serialized` is set; read cookies with `headers.getSetCookie()`; also assert `/login` HTML has no `<style` and no ` style="` -- carried items (a) and (b).
- `src/lib/return-to.test.ts` (R1, R2), `src/server/auth/credentials.test.ts`, `src/server/auth/login.test.ts` (L1 to L10; fake timers, `resetLoginLockout` in `beforeEach`, `vi.stubGlobal('fetch')`, stdout spy, env via `vi.stubEnv`), `src/server/functions/login.test.ts` (call `login[GUARDED].run({ data, context: { session: null } })` with `setSessionCookie` mocked via `vi.mock`; L1, L2, L8), `src/server/functions/get-session.test.ts` (S1), `src/features/login/require-session.test.ts` (G1 to G4), `src/features/login/login-form-model.test.ts` (F1 to F5, fake timers for F5), `src/state/login-required.test.ts` (W1, stub `window`).
- `src/server/functions/discover.test.ts` -- also assert the real set contains `./login.ts#login` and `./get-session.ts#getSession`.

**Acceptance Criteria:**
- Given no or an invalid `rt_session`, when ego-browser opens `/?view=list` on the built server, then the URL becomes `/login?redirect=...` and the login screen shows; after logging in with the fake credentials the page is `/?view=list` showing 「種子」, with no toast.
- Given the login screen, when inspected, then it has 「登入」, 「用 qBittorrent 的帳號密碼」, 帳號, 密碼, an eye button with `aria-label` 「顯示密碼」 toggling `aria-pressed` and the input type, 「記住我」 checked by default, and 「登入」; no address field, no logout button.
- Given a wrong password, when submitting in the browser, then 「帳號或密碼不對」 appears under the password field with the icon, the password border is `delete`, the password is empty and focused, and the username is kept.
- Given a successful login, when ego-browser reads localStorage, sessionStorage, `indexedDB.databases()` and `document.cookie`, then none contains the username, the password or a SHA-256 hex of either, and `document.cookie` has no `rt_session`.
- Given the built server with fake env, when ego-browser captures the login screen, then these exist under `_bmad-output/implementation-artifacts/screenshots/1-4/`: `login-desktop-light.png`, `login-desktop-dark.png`, `login-error-desktop-light.png`, `login-error-desktop-dark.png`, `login-focus-desktop-light.png`, `login-focus-desktop-dark.png` (Tab to the eye button and to 「記住我」: 2px accent outline, 2px offset), `login-phone.png`, `login-error-phone.png` (390 x 844), `seed-after-login.png`; and the computed values in Design Notes match in both schemes; the console shows no CSP violation.
- Given `npm run smoke`, when it runs, then rows B1 to B6 pass along with the existing checks.

## Spec Change Log

## Review Triage Log

### 2026-11-16: Review pass
- verdicts: 37 findings: high 0, medium 6, low 31, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` VG: router watcher sending mid-session not_logged_in back to login untested. watchLoginRequired extracted and tested; also rechecks after a pending navigation resolves.
  - `[medium]` `[patch]` VG: login success path (clear store, seed session, safe return) only checked by hand. completeLogin extracted and tested with the real query client and store.
  - `[low]` `[defer]` VG: _authed beforeLoad wiring to requireSession untested. needs a router harness; requireSession holds the logic; manual check covers the two-line wiring.
  - `[medium]` `[patch]` Edge: invalidate skipped when the store is set during a pending navigation. same fix as the VG watcher row.
  - `[low]` `[patch]` Edge: session staleTime Infinity ignores exp. staleTime based on exp.
  - `[medium]` `[patch]` Edge: double submit counts twice toward the lock. ref guard set synchronously.
  - `[low]` `[patch]` Edge: empty submit burns an attempt. client does not submit when a field is empty; focuses it.
  - `[low]` `[patch]` Edge: old submitError shown during a new attempt. cleared at submit start; alert keyed.
  - `[low]` `[reject]` Edge: wall clock jump during a lock. a NAS clock correction of minutes is rare; the lock still ends; monotonic time adds complexity for no named user harm.
  - `[low]` `[patch]` Edge (claim): /LOGIN or encoded login path passes the not-login rule. decoded lowercase comparison.
  - `[low]` `[reject]` Edge (claim): smoke never matches the id to functionName. the id must appear in the manifest and the chunk pairs it with the name; good enough for a smoke check.
  - `[low]` `[defer]` Intent R-h: DOM wiring (clear and focus password, pending label, slow hint render) only screenshot-checked. decisions moved into the tested form model; a jsdom component harness is not set up yet.
  - `[low]` `[defer]` Intent: end-to-end chain from global onError to login screen to return URL untested. pieces tested; Story 1.6 brings the first polling query that can trigger it.
  - `[low]` `[reject]` Intent R-d: 5th wrong attempt already returns login_locked. AC only fixes the 6th; AD-3 says 5 wrong locks; recorded as Claude 代決.
  - `[low]` `[reject]` Intent R-e: fake qBittorrent client counted via global fetch spy. no qBittorrent client module exists until Story 1.5; the fetch spy proves nothing leaves the container.
  - `[low]` `[reject]` Intent R-f: login fails at callFn's 35 s, not FR-57's 30 s. AD-9 sets one client timeout; FR-57's 30 s is the container's qBittorrent timeout; recorded as Claude 代決.
  - `[low]` `[reject]` Intent R-g: no phone keyboard-focus screenshots. the screenshot set as a whole covers error and focus; focus styling is identical on phone.
  - `[low]` `[reject]` Intent: global Button now pill-shaped. UX-DR9 says buttons are pills; the Dialog has no Button rendered yet.
  - `[low]` `[reject]` Intent: invalid_input, qbit_rejected, timeout also shown under the password field. same slot keeps one place for login errors; recorded as Claude 代決.
  - `[medium]` `[defer]` Blind: connection failures on the login form show nothing. Story 1.7 wires the connection alert bar onto the login screen; it must also read mutation connection codes (carried from 1.3's deferred item).
  - `[low]` `[patch]` Blind: repeated identical failure not re-announced. alert keyed and cleared per submit.
  - `[low]` `[patch]` Blind: empty Enter costs an attempt. same fix as the Edge row.
  - `[low]` `[reject]` Blind: login_locked always says 15 minutes. fixed text per UX-DR96; the error contract carries no extra data by design (AD-9).
  - `[low]` `[reject]` Blind: qbit_auth_failed marks the password field and can loop. the message tells Alex to fix the container setting; the loop ends once it is fixed; recorded.
  - `[medium]` `[patch]` Blind: expiry seen during a pending navigation strands the user. same fix as the VG watcher row.
  - `[low]` `[patch]` Blind: session query ignores exp. same fix as the Edge row.
  - `[low]` `[patch]` Blind: successful logins not logged. login_succeeded info line.
  - `[low]` `[patch]` Blind: smoke never sends a getSession GET without Origin. B1 and B5 variants without Origin.
  - `[low]` `[patch]` Blind: B4 duplicates callServerFn and skips the ok check. helper gains headers; ok asserted.
  - `[low]` `[reject]` Blind: smoke id discovery depends on build output format. a format change fails loudly in CI; acceptable for a smoke check.
  - `[low]` `[defer]` Blind: LoginScreen wiring has no component test. same as the Intent R-h defer row.
  - `[low]` `[reject]` Blind: logged-in user can open /login. harmless; recorded as Claude 代決.
  - `[low]` `[patch]` Blind: lockedUntil() mutates state. reset moved to an explicit step.
  - `[low]` `[patch]` Blind: slow hint not announced. role=status.
  - `[low]` `[reject]` Blind: Button shape change checked only on the login screen. Dialog renders no Button yet; the pill shape is UX-DR9.
  - `[low]` `[patch]` Blind (connection submitError wipes stored qbit_auth_failed message). stored reason kept for connection-class submit errors.
  - `[low]` `[patch]` Implementer note: browser schemas must import the jitless zod wrapper, nothing enforces it. lint ban on importing zod directly outside src/shared/zod.ts and src/server.

## Design Notes

## Resolved question (Alex, 2026-11-16)

Alex chose option 1: accept 4.20:1 for the light phone error line. DESIGN.md's contrast section now lists it under the accepted known issues. The spec already follows this answer. Original question kept below.

### Original question

On the phone the login screen has no card, so the error line (13px/600, `status-error`) sits on `surface-page`. In light mode `#D93A3A` on `#F6F6F4` is 4.20:1, below the 4.5 text rule (NFR-7, UX-DR79, and this story's AC "文字和圖示對比照 UX DESIGN.md 的對比表"). DESIGN.md's contrast table only lists status colors on `surface` (`#D93A3A` on `#FFFFFF` is 4.55, passes), and no mockup draws the phone error state, so the values cannot satisfy both DESIGN.md and the contrast rule. Dark mode passes (4.75), the icon passes the 3:1 graphic rule (4.20). **Question: how should the light phone error line meet (or not meet) 4.5?**
1. Accept 4.20 on the light phone error line and add it to DESIGN.md's "known issues, Alex accepted" list (recommended: smallest change, same hue Alex already approved, 0.3 short at 13px/600). The spec is written for this answer.
2. Keep the red icon but write the phone error text in `text` (17.03); desktop stays `status-error`. One class change in `login-screen.tsx`.
3. Darken light `status-error` / `delete` in DESIGN.md (changes every screen's error and delete color; needs an impeccable pass).

Everything else below is decided; only the error line's text color depends on the answer.

**Screen values (S10 mockups and DESIGN.md; phone first, `lg:` = 1024 px and up):**

| Element | Phone (S10-login-phone) | Desktop (S10-login-desktop) |
|---|---|---|
| Page | `bg-background`, padding 96px 16px 18px | full height (`min-h-dvh`, min 640px), flex centered, padding 24px |
| `main` | no card, flex column gap 28px, `animate-rise` | 400px wide, `max-w-full`, `bg-card`, `rounded-panel` (22px), padding 32px 28px 28px, no shadow, gap 24px |
| Heading block | gap 6px; h1 `text-page-title`; p `text-body text-muted-foreground` | same |
| Form | flex column gap 18px; field: label above, gap 6px, label 13px/600/1.4 | same |
| Inputs | height 44px, font 16px, padding 0 16px (password right 48px) | height 40px, `text-body` 13px, password right 44px |
| Eye button | 44 x 44, right 0, transparent, `text-muted-foreground`, lucide `Eye` 18px stroke 2.2 | 32 x 32, right 4px |
| Error line | `role="alert"`, margin-top 2px, gap 6px, 13px/600, `text-status-error`, lucide `CircleAlert` 16px stroke 2.4; password gets `aria-invalid` and `aria-describedby` | same |
| 「記住我」 | `label` wrapping Checkbox (20px, radius 6px), gap 10px, min-height 44px, 15px | min-height 28px, 13px |
| 「登入」 | Button default, full width, height 44px, 15px/700 | height 40px, 13px/700 |
| Hint | under the button (wrapper gap 6px), `text-meta text-muted-foreground` | same |

Contrast (computed with the WCAG formula, 2026-11-16): subtitle `text-muted` on `surface-page` 5.42 light; `text` on `surface-page` 17.03; checkbox `text-faint` border on `surface-page` 3.12; error `status-error` on `surface` 4.55 light (desktop card), 5.30 dark; on `surface-page` (phone, no card) 4.75 dark but 4.20 light, see the blocking question.

Computed values to check (light / dark): page bg `rgb(246, 246, 244)` / `rgb(31, 41, 55)`; desktop card bg `rgb(255, 255, 255)` / `rgb(24, 32, 44)`, width 400px, radius 22px, padding `32px 28px 28px`; input border `rgb(228, 228, 224)` / `rgb(45, 58, 77)`, radius 9999px, height 40px (phone 44px, font 16px); error border and text `rgb(217, 58, 58)` / `rgb(224, 112, 127)`; button bg `rgb(20, 20, 20)` / `rgb(108, 180, 228)`, text `rgb(255, 255, 255)` / `rgb(15, 23, 32)`; subtitle `rgb(101, 101, 95)` / `rgb(149, 161, 178)`; phone `main` top 96px, sides 16px.

**Flow.** Start's auth guide puts the check in an `_authed` layout `beforeLoad` and redirects to `/login` with `search: { redirect: location.href }`; Router's guide says to use the `beforeLoad` `location` and return with `router.history.push` (we use `replace`). Neither validates the target, so `safeReturnTo` does. Both routes are `ssr: false`: the built server SSRs child routes per request (`TSS_SHELL` is only set in dev), where `beforeLoad` would call `getSession` without the gate's context and always see "not logged in"; with `ssr: false` dev and prod behave the same and Radix's hidden checkbox input gets its style through CSSOM on the client instead of an SSR `style=` attribute that CSP would block. On first load, `ensureQueryData` fails with `not_logged_in`, the global `onError` marks the store (stopping polling, recording the reason) and `beforeLoad` redirects; the router watcher skips that case (`status !== 'idle'`).

**Golden example:**
```ts
// src/routes/_authed.tsx
export const Route = createFileRoute('/_authed')({
  ssr: false,
  beforeLoad: ({ context, location }) =>
    requireSession({
      location,
      loginRequired: loginStore.state.loginRequired,
      fetchSession: () => context.queryClient.ensureQueryData(sessionQueryOptions()),
    }),
  component: Outlet,
})
```

**Carried-forward items.** (a) 1.2 built-server test: rows B1, B5, B6 in `scripts/smoke-built-server.mjs` (already run in CI) call the real gated `getSession` through Start's handler with and without the cookie and with a foreign Origin, proving the gate context reaches `guard()` and `not_logged_in` is HTTP 200. (b) `setSessionCookie` first caller is `login`; B3 and B4 check `HttpOnly`, `SameSite=Strict`, `Path=/`, `Max-Age` and `Secure` only for `X-Forwarded-Proto: https`; the real Tunnel header stays on the NAS checklist. (c) 1.3 Radix Dialog `<style>` CSP issue: the login screen opens no Dialog (Checkbox injects no `<style>`), so it stays deferred to the first Dialog story.

**Claude 代決:**
- `/login?redirect=` route instead of rendering the form in place: the AC's same-site rule only makes sense with a return parameter, and it is the Start guide's pattern.
- The 5th wrong attempt already answers `login_locked` (the lock starts with it), so Alex is not invited to try a 6th; the AC's 6th attempt is also locked.
- While locked, attempts neither compare credentials nor extend the lock; after 15 minutes the counter is 0.
- Empty username or password is not submitted: focus moves to the first empty field, no message and no browser `required` bubble (the mockups draw neither), and no attempt counts toward the global lock. A second submit while one is in flight is ignored (guard set synchronously). Each submit clears the previous error first. (Changed after review, 2026-11-16; replaces "empty fields are submitted and count as a wrong attempt".)
- `login_locked`, `invalid_input`, `qbit_rejected` and `timeout` use the same slot and behavior as `login_failed` (UX-DR59 puts every login error there). Connection codes show nothing in 1.4 and keep both fields.
- The stored `qbit_auth_failed` text also turns the password border `delete` ("出錯時"); a submit result replaces it; the message stays until the next submit.
- Login failure time is `callFn`'s 35 s (AD-9 wins); FR-57's 30 s is the container's qBittorrent timeout, which `login` never reaches.
- Eye button keeps the label 「顯示密碼」 and toggles `aria-pressed` (as in the mockup); the icon becomes lucide `EyeOff` while shown.
- No placeholder on 帳號 (the error mockup has `placeholder="帳號"`, the other two do not; the label already says it). No autofocus on load.
- Focus ring on the 20px checkbox, not the whole row (DESIGN lists 勾選框 among focus-ring targets); the label still toggles it and gives the 44px phone target. No hover look on the borderless eye button.
- `rise` entrance on `main` as drawn (0.5 s, transform and opacity only, off for reduced motion).
- Unknown paths are not guarded (they show no data); `/login` stays reachable when logged in.
- Session query cached with `staleTime: Infinity`; expiry is detected by later polling (Story 1.6) through the global `onError`.
- Form logic is a pure module tested in node; focus, clearing and layout are checked in the browser (no jsdom).
- Smoke script finds function ids in the built manifest rather than adding `serverFns.generateFunctionId`.

**Out of scope, noticed:** `createQueryClient` subscribes to the module-level `loginStore` on every `getRouter()`, including per-request server renders, and never unsubscribes. Not fixed here; the new watcher is browser-only so it adds no server subscription. `autocomplete="current-password"` (from the mockup) lets the browser's own password manager offer to save; that is the browser, not app storage.

**Docs (AD-11, read 2026-11-16):** Start auth `https://tanstack.com/start/latest/docs/framework/react/guide/authentication`; Start selective SSR `https://tanstack.com/start/latest/docs/framework/react/guide/selective-ssr`; Start server functions (server context, `@tanstack/react-start/server`) `https://tanstack.com/start/latest/docs/framework/react/guide/server-functions`; Router authenticated routes `https://tanstack.com/router/latest/docs/guide/authenticated-routes`; Router search params with zod 4 (`validateSearch: schema`, `.catch()` keeps types) `https://tanstack.com/router/latest/docs/guide/search-params`; Query `ensureQueryData` `https://tanstack.com/query/v5/docs/reference/QueryClient`; shadcn Input `https://ui.shadcn.com/docs/components/input` and Checkbox `https://ui.shadcn.com/docs/components/checkbox` (implementer reads); Node `crypto.timingSafeEqual` `https://nodejs.org/api/crypto.html#cryptotimingsafeequala-b`. `setCookie`, `getRequestProtocol` and `router.invalidate` / `router.state.status` signatures: confirm in the installed types (start-server-core 1.169.45, router-core 1.171.39).

## Verification

**Commands:** (prefix each with `source ~/.nvm/nvm.sh && nvm use &&`)
- `npm run lint` -- expected: 0 errors
- `npm run typecheck` -- expected: 0 errors
- `npm test` -- expected: all pass, every matrix row R to W and F included
- `npm audit --omit=dev --audit-level=high` -- expected: exit 0
- `npm run build` -- expected: succeeds with no app env
- `npm run smoke` -- expected: `smoke: built server ok`, rows B1 to B6 included
- `bash .claude/skills/next-story/check.sh` -- expected: every line ok

**Manual checks:**
- Start the built server with fake env (`QBIT_URL=http://qbit.test.invalid:8080 QBIT_USERNAME=dev QBIT_PASSWORD=dev-pass SESSION_SECRET=$(openssl rand -base64 32) APP_ORIGINS=http://localhost:3000 SAVE_ROOTS=/downloads PORT=3000 node .output/server/index.mjs`). With the ego-browser skill: run the browser ACs (redirect and return, wrong password, storage check), take the screenshots at 1280 x 844 light and dark (emulated `prefers-color-scheme`) and 390 x 844, read the computed values listed above, and collect CSP violations with a `securitypolicyviolation` listener. Record values in the Auto Run Result. Compare each screenshot with the matching S10 mockup's values. Repeat the redirect check and the CSP check on `npm run dev`. If ego-browser fails, halt as blocked.

## Auto Run Result (pipeline)

- **Summary:** login screen per the S10 mockups (desktop card, phone without card, pill inputs and button, error under the password field, eye toggle, remember me), public `login` server function (SHA-256 plus timingSafeEqual, global 5-strike 15-minute lockout, issues `rt_session`), gated `getSession`, `_authed` layout guard with same-site `redirect` return, browser-only watcher that returns to login when a query reports `not_logged_in` or `qbit_auth_failed`, smoke checks B1 to B6 through the real Start handler.
- **Decision by Alex (2026-11-16):** accept 4.20:1 for the light phone error line; recorded in DESIGN.md known issues.
- **Review findings:** 37 findings. 20 patched (5 medium entries), 4 deferred (3 in frontmatter), 13 rejected with reasons. Plus one peer-session reminder: invalidate other queries after login (patched).
- **Follow-up review recommended:** false. The medium patches (watcher recheck, completeLogin, double-submit guard) are each covered by node tests that ran green; no unverified risk from the patches can be named.
- **Verification (Node v26.13.1):** lint exit 0; typecheck exit 0; vitest 32 files, 492 tests passed; audit 0 vulnerabilities; build ok; `npm run smoke` passed (B1 to B6 including GETs without Origin); no lint-probe files left in src; `check.sh` all ok. Screenshots: 12 PNGs in `screenshots/1-4/`, each viewed by the orchestrator and confirmed free of personal data (an earlier batch that captured a password manager overlay was discarded by the implementer before saving).
- **Residual risks:** the deferred items; review-round UI changes (double submit, empty fields, status hint) verified by unit tests, not re-checked in the browser.
