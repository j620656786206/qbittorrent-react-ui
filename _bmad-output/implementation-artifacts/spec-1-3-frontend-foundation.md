---
title: 'Story 1.3: Frontend foundation: design tokens, shadcn mapping, system dark mode, callFn and global error handling'
type: 'feature'
created: '2026-11-16'
status: 'done'
baseline_revision: 'dc473ffaf126d6a45235259703a9b981ab223b45'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-react-torrent-2026-11-15/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-react-torrent-2026-11-13/DESIGN.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Radix Dialog injects a style element at runtime (react-remove-scroll) that the current CSP blocks.
    evidence: |-
      Nothing opens a Dialog yet. The first story that does must pass a nonce through get-nonce and add style-src with that nonce, or use AR-31's allowed style-src 'self' 'unsafe-inline'.
    location: >-
      src/shared/ui/dialog.tsx
    severity: medium
  - summary: >-
      Cloudflare Access may answer an expired session with a redirect instead of 401, which shows as home_unreachable.
    evidence: |-
      Epic fact to verify on the NAS with an expired Access session; add a redirect row if it happens.
    location: >-
      src/state/call-fn.ts
    severity: medium (unverified)
  - summary: >-
      Mutation errors with connection codes have no global handler.
    evidence: |-
      Story 1.7 builds the connection alert state and should route these.
    location: >-
      src/state/query-client.ts
    severity: low
  - summary: >-
      A query with a plain numeric refetchInterval keeps polling after a login stop.
    evidence: |-
      No polling query exists yet; Story 1.6 adds the first one through pollInterval() and can add a lint rule.
    location: >-
      src/state/polling.ts
    severity: low
---

<intent-contract>

## Intent

**Problem:** The app has no design tokens, no shadcn setup, no single way for the browser to call a server function, and no central error handling, so every later screen would pick its own colors, call server functions with or without `X-Requested-With`, misread Cloudflare and network failures, and handle login expiry in each feature.

**Approach:** Write the UX-DR1 to UX-DR12 tokens (light and dark, dark only via `prefers-color-scheme`) into `src/styles.css` as CSS variables plus Tailwind 4 theme tokens, map shadcn's variables onto them, install only the shadcn Dialog (and the Button it imports) into `src/shared/ui`, add `callFn` (headers, 35 s timeout, response classification into `AppError`), `src/lib/error-text.ts`, a QueryClient whose global `onError` stops all polling on `not_logged_in` / `qbit_auth_failed` and records reason plus URL in a `src/state` store, and restyle the temporary 「種子」 page with the tokens.

## Boundaries & Constraints

**Always:**
- Colors, sizes, radii, spacing and shadows come only from UX DESIGN.md frontmatter (values in Design Notes are copied from it). Never invent a color or visual rule.
- Dark mode follows `prefers-color-scheme` only: no toggle, no stored preference, no `.dark` class, no `@custom-variant dark`.
- System fonts only; no `@font-face`, no font package, no external stylesheet or CDN.
- Every new dependency pinned exactly (no `^` or `~`). No animation, gesture or i18n packages (so no `tw-animate-css`).
- UI text Traditional Chinese (Taiwan usage); no em dash anywhere; no IPs or credentials; private category only as X / mteam-X.
- Tests never touch a real qBittorrent; fake URLs only (`http://qbit.test.invalid:8080`). Screenshots use no qBittorrent data at all.
- The spine's layer graph is unchanged; lint enforces the extra rules in Tasks.

**Never:**
- No login screen or `login` function (1.4), no header, alert bar or list UI (1.7, 1.8), no real server function, no connection-alert logic (1.7), no `refreshMaindata` (1.6).
- No `style-src` change and no `img-src` (decision in Design Notes). No change to `src/shared/csp.ts`.
- No `@tanstack/react-router-ssr-query`, no devtools packages.
- Do not restyle Dialog or Button beyond the edits listed in Tasks; their full brand styling belongs to the first story that renders them.

## I/O & Edge-Case Matrix

`callFn(fn, input?, { signal? })` against a fake `fetch` (rows 1 to 11 are one table-driven test):

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 1 Success | 200 JSON `{ ok: true, data: { n: 1 } }` | resolves `{ n: 1 }`; the request carried `x-requested-with: XMLHttpRequest` and the caller's input | none |
| 2 Contract failure | 200 JSON `{ ok: false, error: { code: 'qbit_rejected', message } }` | rejects `AppError` code `qbit_rejected` | message is the fixed Chinese text, not the server's |
| 3 Gate reject | 403 JSON `{ ok: false, error: { code: 'bad_origin' } }` | `AppError` `bad_origin` | none |
| 4 Cloudflare 401 | 401 `text/html` login page | `AppError` `cloudflare_expired` | `message` contains no HTML or URL |
| 5 HTML in 200 | 200 `text/html` | `AppError` `cloudflare_expired` | same |
| 6 Network error | fetch rejects `TypeError('Failed to fetch')` | `AppError` `home_unreachable` | original text not in message |
| 7 Timeout | fetch never settles | still pending at 34 999 ms; at 35 000 ms `AppError` `home_unreachable` and the fetch `signal` is aborted | timer cleared on every settle |
| 8 Server down | 500, 502, 530 with HTML body | `AppError` `home_unreachable` | body not read into message |
| 9 Caller cancel | caller `signal` aborted mid-request | rejects with the abort reason, not an `AppError` | no classification |
| 10 Unknown shape | 200 `text/plain`; 404 `text/html`; contract with a code outside AR-33 | `AppError` `qbit_rejected` | raw value goes to `console.error` only |
| 11 Message hygiene | every row above with `vi.stubEnv('QBIT_URL', 'http://qbit.test.invalid:8080')` | no `AppError.message` contains `qbit.test.invalid`, `<`, or `http` | none |

Global `onError` (QueryClient from `createQueryClient({ currentPath: () => '/?view=list' })`, fake timers, a query polling with `pollInterval(5000)`):

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 12 Query gets `not_logged_in` | first poll ok, second returns contract `not_logged_in` | fetch called exactly 2 times over 60 s (no retry, no further poll); store `{ reason: 'not_logged_in', returnTo: '/?view=list' }`; query keeps the first data | none |
| 13 Mutation gets `qbit_auth_failed` | polling query running; a mutation via `callFn` returns `qbit_auth_failed` | polling stops (no fetch after the mutation); store reason `qbit_auth_failed`; mutation not retried | none |
| 14 Second auth error | `qbit_auth_failed` after `not_logged_in` | reason becomes `qbit_auth_failed`; `returnTo` keeps the first value | none |
| 15 `bad_origin` | query returns `bad_origin` | `console.error` once; store stays `null`; polling continues | none |
| 16 Connection code | query returns `home_unreachable` | store stays `null`; polling continues; old data kept | none |

`errorText` and styles:

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 17 Error text | each of the 12 `ERROR_CODES`, fake `QBIT_URL` stubbed | non-empty Traditional Chinese string from the table in Design Notes; no em dash, no `http`, no fake host, no IP pattern | none |
| 18 Color tokens | parse `src/styles.css` | all 26 UX-DR1 to UX-DR3 roles defined as `--rt-<role>` with the exact DESIGN.md hex in `:root` and the `-dark` hex inside `@media (prefers-color-scheme: dark)`; a missing or wrong one fails | none |
| 19 shadcn mapping | parse `src/styles.css` | each shadcn variable in the UX-DR4 table equals `var(--rt-<role>)` for the right role | none |
| 20 Theme tokens | parse `src/styles.css` | 12 text roles, 7 radii, 3 shadows, 2 scrims, both font stacks, `--color-*: initial`; `body` has `tabular-nums`; `:focus-visible` outline 2px `var(--ring)` offset 2px; no `@font-face`, `@import url(` or `http` | none |
| 21 Dialog surface | read `src/shared/ui/dialog.tsx` | `DialogContent` classes contain `bg-surface`, not `bg-background`; no `outline-none`, `outline-hidden`, `focus:ring`, `focus-visible:ring` in any `src/shared/ui/*.tsx` | none |
| 22 cn merge | `cn('text-page-title', 'text-foreground')`, `cn('rounded-panel', 'rounded-lg')`, `cn('shadow-float', 'shadow-lg')` | both kept; `rounded-lg`; `shadow-lg` | none |

</intent-contract>

## Code Map

- `src/styles.css` -- today only `@import "tailwindcss"` and three resets; becomes the token file.
- `src/routes/index.tsx` -- temporary page, `<h1>種子</h1>`.
- `src/routes/__root.tsx` -- `createRootRoute` with `shellComponent: RootDocument`; switches to `createRootRouteWithContext<RouterContext>()`.
- `src/router.tsx` -- `getRouter()` with `ssr: { nonce }` (keep it); add `context` and `Wrap`. Root file category, may import any layer.
- `src/shared/errors.ts` -- reuse `ERROR_CODES`, `ErrorCode`, `isErrorCode`, `Result`, `ERROR_MESSAGES` (server fallback text; screen text is `error-text.ts`).
- `src/shared/csp.ts` -- unchanged; `STATIC_CSP` / `buildCsp` have no `style-src`.
- `eslint.config.js` -- `layers` (line 8), `CREATE_SERVER_FN_BAN` and `DEFINE_BAN` blocks near the end. A later flat-config block replaces `no-restricted-imports` for overlapping files, it does not merge.
- `src/lint-rules.test.ts` -- ESLint Node API probes with `FIXTURES`; extend.
- `scripts/smoke-built-server.mjs` -- `checkValidBoot()` fetches `/` and inspects the HTML; extend.
- `node_modules/@tanstack/start-client-core/dist/esm/client-rpc/serverFnFetcher.js` -- `serverFnFetcher`: uses call-site `fetch` (`first.fetch ?? handler`), merges `first.headers`, passes `first.signal`. `getResponse`: JSON without `x-tss-serialized` is returned as-is (gate 403); non-JSON 2xx returns the raw `Response`; non-JSON non-2xx throws `new Error(await response.text())` (would leak HTML); an error thrown by the custom fetch propagates unchanged (`createServerFn.js` `executeMiddleware` rethrows it). All verified with a probe on 2026-11-16.
- `node_modules/@tanstack/start-client-core/dist/esm/client-rpc/createClientRpc.js` -- real client stub (`url = process.env.TSS_SERVER_FN_BASE + id`); outside Start it needs `runWithStartContext({ startOptions: {} }, ...)` from `@tanstack/start-storage-context` (verified).
- `@tanstack/query-core` 5.107.1 `query.ts` -- cache `onError` runs after the error dispatch, so observers already rescheduled their interval; `CancelledError` never reaches `onError`. `queryObserver.ts` -- `setOptions` recomputes a function `refetchInterval`; `#shouldScheduleTimer` is false when `environmentManager.isServer()`.

## Tasks & Acceptance

**Execution:**
- `package.json` -- `npm install --save-exact @tanstack/react-query@5.107.1 @tanstack/react-store@0.11.2 radix-ui@1.8.1 cn@0.5.2 class-variance-authority@0.7.1 lucide-react@1.73.0` -- AR-3; the shadcn CLI adds `cn` and `radix-ui` with `^` and skips the other two, so install them explicitly.
- `components.json` -- write by hand (no `shadcn init`): `style: "new-york"`, `rsc: false`, `tsx: true`, `tailwind: { config: "", css: "src/styles.css", baseColor: "zinc", cssVariables: true, prefix: "" }`, aliases `components`/`ui`/`lib` = `#/shared/ui`, `utils` = `#/shared/ui/cn`, `hooks` = `#/shared/ui/hooks`, `iconLibrary: "lucide"` -- DESIGN says new-york, zinc; `init` here prompts interactively and picks other presets (verified).
- `src/shared/ui/cn.ts` -- `export const cn = createCn({ extend: { theme: { text: [12 type roles], radius: ['bar','row','card','panel','sheet'], shadow: ['card','float','sheet'] } } })` from `cn/config` -- plain `cn` drops `text-page-title` next to `text-foreground` (verified).
- `src/shared/ui/dialog.tsx`, `src/shared/ui/button.tsx` -- `npx shadcn@4.23.0 add dialog button -y`; then: replace `import { cn } from "cn"` with `#/shared/ui/cn`; `DialogContent` `bg-background` to `bg-surface`; both "Close" strings to 「關閉」; remove ring-based focus classes (`outline-none`, `focus-visible:border-ring`, `focus-visible:ring-*`, `focus:ring-*`, `focus:outline-hidden`, `ring-offset-background`) so the global outline applies; run prettier; fix lint without changing behavior; confirm `package.json` still has exact versions after the CLI. Leave the rest generated -- UX-DR4, UX-DR75.
- `src/styles.css` -- per Design Notes "Token layout": brand roles, shadcn mapping, `@theme inline` colors, `@theme` type/radius/spacing/shadow tokens, `text-card-value` and hover utilities, base rules (body, focus, disabled) -- UX-DR1 to UX-DR12, UX-DR75, NFR-6, NFR-7.
- `src/lib/app-error.ts` -- `class AppError extends Error { readonly code: ErrorCode }` (message always `ERROR_MESSAGES[code]`), `isAppError`, `LOGIN_STOP_CODES` (`not_logged_in`, `qbit_auth_failed`), `GLOBAL_ERROR_CODES` (AD-9's six), `classifyResponse(response): ErrorCode | null` (401 or 200 `text/html` to `cloudflare_expired`, status >= 500 to `home_unreachable`, else `null`) -- pure, AR-34.
- `src/lib/error-text.ts` -- `ERROR_TEXT: Readonly<Record<ErrorCode, string>>` (table in Design Notes) and `errorText(code)` -- AR-33, UX-DR96. Later stories add per-operation text here.
- `src/state/call-fn.ts` -- `callFn(fn, input?, { signal? })`: per call, pass `{ data, headers: { 'X-Requested-With': 'XMLHttpRequest' }, signal, fetch: guardedFetch }` to the server fn; signal = `AbortSignal.any([caller, timeout])` with the timeout driven by `setTimeout(35_000)` (fake-timer friendly); `guardedFetch` calls `globalThis.fetch` at call time and throws `AppError` per `classifyResponse` or on rejection/timeout, but rethrows the caller's abort reason untouched; unwrap `{ ok: true, data }`, throw `AppError(code)` for `{ ok: false }` (unknown code: `qbit_rejected`); any other value or error becomes `qbit_rejected` with the raw value only in `console.error` -- AR-34, matrix 1 to 11.
- `src/state/login-required.ts` -- TanStack Store `createStore<{ loginRequired: { reason: 'not_logged_in' | 'qbit_auth_failed'; returnTo: string } | null }>`; `markLoginRequired(reason, returnTo)` (reason overwrites, `returnTo` kept once set), `clearLoginRequired()` (for 1.4), `useLoginRequired()` via `useSelector` -- AR-35, AD-13.
- `src/state/polling.ts` -- `pollInterval(ms)` returns `() => (loginRequired ? false : ms)`; the only way features set `refetchInterval` -- AR-35.
- `src/state/query-client.ts` -- `RouterContext` type; `createQueryClient({ currentPath? })` with `QueryCache` and `MutationCache` `onError` calling one handler: login-stop codes: `markLoginRequired(code, currentPath())`, `void client.cancelQueries()`, then for every query in the cache `observer.setOptions(observer.options)` so `pollInterval` is re-read now; `bad_origin`: `console.error`; other global codes: nothing yet (1.7 reads query state). `defaultOptions.queries.retry = (n, e) => !(isAppError(e) && LOGIN_STOP_CODES has e.code) && n < 3`. `currentPath` defaults to `location.pathname + location.search + location.hash`, `'/'` without `window` -- AR-35.
- `src/router.tsx` -- `const queryClient = createQueryClient()` inside `getRouter()`; `context: { queryClient }`; `Wrap: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>`.
- `src/routes/__root.tsx` -- `createRootRouteWithContext<RouterContext>()`; rest unchanged.
- `src/routes/index.tsx` -- `<main className="p-page-phone lg:p-page-desktop"><h1 className="text-page-title">種子</h1></main>` -- temporary page for the screenshots.
- `eslint.config.js` -- compose `no-restricted-imports` per file group (one helper building `{ paths, patterns }`): ban the `cn` package everywhere except `src/shared/ui/cn.ts`; ban `#/shared/ui` (regex `(^|/)shared/ui(/|$)`) from `src/server/**`, `src/lib/**`, `src/state/**`; keep the existing `createServerFn` and `_define` bans exactly.
- `src/lint-rules.test.ts` -- probes: `import { cn } from 'cn'` in `src/routes/-x.tsx` fails, in `src/shared/ui/cn.ts` passes; `#/shared/ui/button` from `src/server/qbit/x.ts`, `src/lib/x.ts`, `src/state/x.ts` fails, from `src/routes/-x.tsx` passes; existing probes still pass.
- `scripts/smoke-built-server.mjs` -- assert the served `/` HTML has no `<style` tag and no ` style="` attribute -- guards the no-`style-src` decision.
- `src/state/testing.ts` -- `fakeServerFn(id, method)`: `vi.stubEnv('TSS_SERVER_FN_BASE', '/_serverFn/')`, `createClientRpc(id)` from `@tanstack/react-start/client-rpc`, called inside `runWithStartContext({ startOptions: {} }, ...)` with `{ ...opts, method }` -- so tests run Start's real client parsing. If lint or resolution rejects the transitive `@tanstack/start-storage-context`, add it as an exact devDependency at the installed version.
- Tests: `src/state/call-fn.test.ts` (rows 1 to 11, `vi.stubGlobal('fetch')`), `src/state/query-client.test.ts` (rows 12 to 16 with `QueryObserver` / `MutationObserver`, `environmentManager.setIsServer(() => false)` in `beforeEach` and restored after, fake timers), `src/lib/error-text.test.ts` (17), `src/lib/app-error.test.ts` (`classifyResponse` per status), `src/styles.test.ts` (18 to 20, expected tables written in the test), `src/shared/ui/ui.test.ts` (21, 22).

**Acceptance Criteria:**
- Given the built server with fake env, when ego-browser opens `/` with the system color scheme emulated as light and then dark, then `_bmad-output/implementation-artifacts/screenshots/1-3/seed-light.png` and `seed-dark.png` exist; computed styles match DESIGN.md: body background `rgb(246, 246, 244)` / `rgb(31, 41, 55)`, h1 color `rgb(20, 20, 20)` / `rgb(233, 238, 245)`, h1 26px weight 700, font-family starting `-apple-system`, `main` padding `22px 28px` at a 1280 px viewport; and the console shows no CSP violation.
- Given the dev server, when opening `/`, then the page hydrates with the same colors and no CSP violation in the console.
- Given `package.json`, when inspected, then every added dependency is an exact version and no font, animation, gesture or i18n package is present.

## Spec Change Log

### 2026-11-16: review pass 1
- Trigger: review findings on error classification, the two error tables, and brand tokens in the shadcn components.
- Amended (applied as patches): matrix row 10 now reads: any non-2xx HTML other than 401 and 403 is `home_unreachable` (the container never answers server functions with HTML); 401 and 403 HTML and HTML in a 2xx are `cloudflare_expired`. `ERROR_MESSAGES` uses the `error-text.ts` wording. The Dialog uses `rounded-panel`, `shadow-float`, `bg-scrim-dialog` and the destructive Button uses the delete foreground, lifting those two items out of the Never list because the brand tokens already exist and the defaults contradicted them.
- Known-bad state avoided: Cloudflare pages blamed on qBittorrent; screen text drifting from AppError.message; off-brand dialog styling at first use.
- Also found while testing: gate rejections (plain contract JSON on 403/413) came back as `qbit_rejected` through Start's real client wrapper; `guardedFetch` now reads non-2xx JSON and throws the contract code.
- KEEP: callFn shape, store, polling helper, token layout.

## Review Triage Log

### 2026-11-16: Review pass
- verdicts: 40 findings: high 0, medium 8, low 27, false 3, maybe-false 2
- findings:
  - `[medium]` `[patch]` Blind: polling never restarts after clearLoginRequired. observers re-read options on clear; test clear-then-poll.
  - `[low]` `[patch]` Blind: module-level loginStore written during SSR. markLoginRequired no-op without window.
  - `[medium]` `[defer]` Blind: Radix Dialog injects a style element the CSP blocks. nothing opens a Dialog yet; the first story that does chooses nonce or unsafe-inline (AR-31 allows it).
  - `[medium]` `[patch]` Blind: two error-text tables disagree. ERROR_MESSAGES aligned to error-text.ts with an equality test.
  - `[medium]` `[patch]` Blind: retry policy retries permanent failures. retry only home_unreachable, qbit_unreachable, timeout.
  - `[low]` `[patch]` Blind: unrecognised responses blame qBittorrent; 403 HTML missing. any HTML response classified as Cloudflare or home; rows added.
  - `[maybe-false]` `[defer]` Blind: Access may redirect instead of 401. epic fact to verify on the NAS; settle with an expired Access session request.
  - `[low]` `[patch]` Blind: destructive Button ignores delete-foreground. text-destructive-foreground, dark override dropped.
  - `[low]` `[patch]` Blind: shadcn components bypass brand radius, shadow, scrim. Dialog uses rounded-panel, shadow-float, bg-scrim-dialog; Button shape waits for Story 1.4's login button spec.
  - `[low]` `[patch]` Blind: disabled styling defined twice, cursor hidden, nested opacity. Button disabled classes removed; nested rule added.
  - `[low]` `[patch]` Blind: src/shared outside ui can import shared/ui; risky lint blocks unprobed. no-UI group extended; probes added.
  - `[low]` `[patch]` Blind: GLOBAL_ERROR_CODES unused; LoginStopReason duplicates LOGIN_STOP_CODES. export removed or used; type derived.
  - `[low]` `[reject]` Blind: test helper in production source. nothing imports it outside tests, so it is never bundled; moving it adds churn.
  - `[false]` `[reject]` Blind: SSR query hydration missing. SPA mode: no server loaders exist; the shell is prerendered without data.
  - `[medium]` `[patch]` VG: callFn never tested through the createServerFn client wrapper. cases built as createServerFn(...).handler(createClientRpc(id)) with Start's real encoding.
  - `[low]` `[patch]` VG: default locationPath never exercised. window.location stub test.
  - `[low]` `[patch]` VG: cn radius and shadow lists spot-checked only. exported lists, it.each, equality with styles.css tokens.
  - `[low]` `[patch]` VG: server-functions and _define.ts bans unprobed. probes added.
  - `[medium]` `[defer]` VG other: Radix Dialog style element under CSP. same as the Blind defer row.
  - `[medium]` `[patch]` Intent 1: AppError.message comes from a second table. same fix as the Blind table row.
  - `[low]` `[reject]` Intent 2: fake QBIT_URL check in error-text.test is trivial. the real leak check lives in call-fn.test; error-text is a constant table.
  - `[low]` `[defer]` Intent 3: plain numeric refetchInterval keeps polling; focus and reconnect not addressed. focus and reconnect patched; a lint rule for numeric intervals waits for Story 1.6 where the first polling query lands.
  - `[low]` `[reject]` Intent 4: callFn and code-handling rules not lint-enforced. no feature code exists yet; Story 1.6 adds the first callers.
  - `[low]` `[reject]` Intent 5: timeout row tested in a separate describe. needs fake timers; still one table per classifier.
  - `[low]` `[reject]` Intent 6: token checks parse CSS text, not compiled Tailwind. build and screenshots cover generation; the AC asks vitest to read the style file.
  - `[low]` `[defer]` Intent 7: reading B items (default Tailwind scales still available, hover-row on checked rows, selection-bar focus). owned by the stories that build those components.
  - `[false]` `[reject]` Intent 8: no literal -dark variables. UX-DR1 means the dark value of the same role; tests check values.
  - `[low]` `[reject]` Intent 9: screenshots stored as files, not on the PR. /ship embeds them in the PR body.
  - `[false]` `[reject]` Intent 10: media-library tint in dark. token matches DESIGN.md frontmatter; the no-tint rule belongs to the location tag component.
  - `[low]` `[reject]` Edge: AbortSignal.any missing on iOS before 17.4. NFR-17 targets the latest Safari, which has it.
  - `[maybe-false]` `[defer]` Edge: Access redirect shows home_unreachable. same as the Blind defer row.
  - `[low]` `[patch]` Edge: 4xx HTML pages become qbit_rejected. same fix as the Blind classification row.
  - `[low]` `[patch]` Edge: undefined data rejected by TanStack Query. data ?? null.
  - `[low]` `[patch]` Edge: focus, reconnect, mount refetch after stop. defaults return !isLoginRequired().
  - `[medium]` `[patch]` Edge: polling never resumes after clear. same fix as the Blind row.
  - `[low]` `[patch]` Edge: SSR singleton store. same fix as the Blind row.
  - `[low]` `[defer]` Edge: mutation connection errors have no global handler. Story 1.7 builds the connection alert state.
  - `[low]` `[patch]` Edge: permanent codes retried. same fix as the Blind retry row.
  - `[low]` `[patch]` Edge: src/shared can import shared/ui. same fix as the Blind lint row.
  - `[low]` `[patch]` Edge: nested disabled opacity. same fix as the Blind disabled row.

## Design Notes

**Values (copied from UX DESIGN.md frontmatter; light / dark):** surface-page #F6F6F4 / #1F2937, surface #FFFFFF / #18202C, surface-muted #EFEFEC / #263243, border #E4E4E0 / #2D3A4D, track #E7E7E3 / #334155, text #141414 / #E9EEF5, text-muted #65655F / #95A1B2, text-faint #8C8C87 / #67758A; accent #141414 / #6CB4E4, accent-foreground #FFFFFF / #0F1720, selection-row #EEF4FF / #25344A, selection-bar #141414 / #E9EEF5, selection-bar-foreground #FFFFFF / #0F1720, delete #D93A3A / #E0707F, delete-foreground #FFFFFF / #0F1720, good #18753F / #8FD19E, media-library #6A45C8 / #A48FE0, media-library-tint #6A45C81F / #6A45C81F (DESIGN frontmatter defines both; "not applied in dark" is the location-tag story's rule); status-downloading #2F6FDF / #5AA9E0, status-seeding #278A4F / #7FBF8E, status-done #141414 / #7D8BA0, status-paused #B26F0C / #E0AD62, status-stalled #C9581E / #E3925F, status-error #D93A3A / #E0707F, status-archived #65655F / #95A1B2, status-icon #FFFFFF / #0F1720. Type roles, radii, spacing, shadows, scrims: UX-DR7 to UX-DR11 exactly (DESIGN.md Typography, Shapes, Layout & Spacing, Elevation & Depth).

**Token layout in `src/styles.css`:**
1. `:root { color-scheme: light dark; --rt-<role>: <light>; ... }` and `@media (prefers-color-scheme: dark) { :root { --rt-<role>: <dark>; ... } }`.
2. shadcn variables on `:root`, referencing roles (UX-DR4): `--background: var(--rt-surface-page)`, `--foreground`, `--card-foreground`, `--popover-foreground`, `--secondary-foreground`, `--accent-foreground`: `var(--rt-text)`; `--card`, `--popover`: `var(--rt-surface)`; `--primary`: `var(--rt-accent)`; `--primary-foreground`: `var(--rt-accent-foreground)`; `--secondary`, `--muted`, `--accent`: `var(--rt-surface-muted)`; `--muted-foreground`: `var(--rt-text-muted)`; `--destructive`: `var(--rt-delete)`; `--destructive-foreground`: `var(--rt-delete-foreground)`; `--border`, `--input`: `var(--rt-border)`; `--ring`: `var(--rt-accent)`. Dark needs no second mapping. No sidebar or chart variables (DESIGN maps none).
3. `@theme { --color-*: initial; --color-black: #000; --color-white: #fff; }` (UX-DR5: no colors outside the roles; shadcn's overlay uses `bg-black/50`, which equals the dialog scrim) and `@theme inline` exposing every shadcn variable as `--color-<name>` plus every role as `--color-<role>` (`border` once, shared by both), except brand `accent` / `accent-foreground`, which exist only as `primary` / `primary-foreground` (DESIGN: brand accent is wired to `--primary`). Scrims: `--color-scrim-sheet: rgba(0,0,0,.18)`, `--color-scrim-dialog: rgba(0,0,0,.5)`.
4. `@theme`: `--font-sans` / `--font-mono` (UX-DR7 stacks); `--text-<role>` with `--line-height` and `--font-weight` sub-properties for the 12 roles (`path` is used together with `font-mono`); `card-value` is `@utility text-card-value` (22px, 17px from `lg`, 700, 1.2); `--radius-xs 6px`, `bar 9px`, `row 14px`, `card 16px`, `panel 22px`, `sheet 28px`, `full 9999px`; `--spacing-<name>` for the named DESIGN spacings (use with `p-*` only, two-value shorthands); `--container-content-max: 1240px`, `--container-list-column-max: 560px`; `--shadow-card`, `--shadow-float`, `--shadow-sheet`. The 4..16 px scale is Tailwind's default `--spacing: 0.25rem`. Desktop breakpoint is Tailwind's default `lg` (64rem = 1024px).
5. UX-DR12 utilities: `hover-row` (bg surface-muted), `hover-ring` (inset 1px text-faint), `hover-outline` (border-color text-faint), `hover-solid` (opacity .9); each applies on `:hover` inside `@media (hover: hover)` and on `:active`, never on `:disabled` or `[aria-disabled="true"]`. Base: `:disabled, [aria-disabled="true"] { opacity: .5; cursor: not-allowed }`.
6. Base: `body { background-color: var(--background); color: var(--foreground); font-family: var(--font-sans); font-variant-numeric: tabular-nums }` plus `font-size: var(--text-body)` and `line-height: var(--text-body--line-height)`; `:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px }` (follows border-radius; dark uses accent-dark through `--ring`).

**Error text (`ERROR_TEXT`):** not_logged_in 請先登入; login_failed 帳號或密碼不對; login_locked 錯太多次了，15 分鐘後再試; cloudflare_expired Cloudflare 登入過期了; home_unreachable 連不到家裡的 NAS; qbit_unreachable 家裡的 qBittorrent 沒有回應; qbit_auth_failed 容器裡的 qBittorrent 密碼不對，要改 NAS 上的容器設定; qbit_rejected qBittorrent 拒絕這個操作; timeout qBittorrent 沒有回應，請再試一次; invalid_input 送出的資料格式不對; settings_write_failed 設定檔寫不進去; bad_origin 請求來源不對. Sources: Story 1.4 ACs, EXPERIENCE alert list, AD-9 table, the epics' failure-toast example; the rest reuse the 1.2 server text.

**CSP `style-src` finding (closes 1.2's deferred item):** not added. Evidence: (1) a build of the current tree has no `<style>` element and no `style=` attribute in `.output/public/_shell.html`; Tailwind 4 emits a CSS file loaded by `<link>`, allowed by `default-src 'self'`. (2) React applies `style` props through CSSOM (`el.style.x = ...` / `setProperty`), which CSP does not block (MDN style-src). (3) Radix inline positioning also goes through React style props. (4) Risk found: Radix Dialog uses `react-remove-scroll`, whose `react-style-singleton` creates a `<style>` element when a dialog opens; `default-src 'self'` blocks it (body scroll lock lost, console violation). It supports a nonce via `get-nonce` `setNonce`. Nothing renders a Dialog in this story, so the first story that does must choose nonce styles (`style-src 'self' 'nonce-...'`, nonce read from the `csp-nonce` meta) or AR-31's `'unsafe-inline'`. No `img-src` either: lucide icons are inline SVG, no data: images exist. The smoke check guards (1).

**Golden example (feature code in later stories):**
```ts
const maindata = useQuery({
  queryKey: ['maindata'],
  queryFn: ({ signal }) => callFn(getMaindata, { since }, { signal }),
  refetchInterval: pollInterval(5000),
})
```

**Claude 代決:**
- shadcn components live in `src/shared/ui`: the spine's graph lets routes and features import `shared`, and `shared` imports nothing internal, which shadcn files satisfy; a new layer would need a spine change. Lint keeps server, lib and state from importing it.
- `callFn` lives in `src/state`: `src/lib` must not touch the network, and `state` is the only non-screen layer features may import. `AppError` and `classifyResponse` stay pure in `src/lib`.
- Headers, timeout and classification via per-call `fetch`/`headers`/`signal` options, not a global function middleware or `createStart({ serverFns })`: keeps the single exit self-contained and testable with Start's real client.
- Anything outside AD-9's table (non-contract value, 404 page, unknown code, Start's own errors) maps to `qbit_rejected`, mirroring Alex's 2026-11-16 choice for unknown server exceptions.
- A followed Cloudflare redirect (if Access redirects instead of returning 401) fails CORS and becomes `home_unreachable`; no `redirect: 'manual'` handling until the epic fact is verified on the NAS.
- Retry: login-stop codes never; everything else Query's default 3 for queries, 0 for mutations.
- `returnTo` is the same-site path (`pathname + search + hash`), kept from the first record; the latest reason wins.
- Store: `@tanstack/react-store` 0.11.2 (same version the router already installs) instead of a hand-written store.
- QueryClient per `getRouter()`, exposed through router context and `Wrap`; no `react-router-ssr-query` (SPA mode, no server prefetch).
- Brand roles as `--rt-<role>` (avoids shadcn's `--accent` clash); Tailwind palette reset to the roles plus black and white; `tabular-nums` set on `body`; `color-scheme: light dark`.
- `text-card-value` as one responsive utility; scrim, shadow and hover utility names as listed above.
- Generated `animate-in` / `fade-*` classes stay as inert no-ops (no `tw-animate-css`); the first dialog story decides motion.
- Text tables in tests are written out instead of parsing DESIGN.md (no YAML dependency).
- Temporary page padding uses the page spacing tokens so the screenshot shows them.

**Not covered here (later stories):** status icons per status (UX-DR3 icons, with `classify()` and the status circle); `:focus-visible` on text inputs also matches mouse clicks in browsers (1.4 login inputs); Button and Dialog brand shapes, capsule radius, shadcn's default `shadow-xs` / `shadow-lg` / `rounded-md` classes and disabled cursor (first story rendering them); the selection-bar focus color (selection bar story); `prefers-reduced-motion` (first story with motion). Carried from 1.1: Chinese not-found page still deferred. Carried from 1.2: built-server tests through a real gated function belong to 1.4.

**Docs (AD-11, read 2026-11-16 unless marked):** shadcn TanStack install `https://ui.shadcn.com/docs/installation/tanstack`, theming `https://ui.shadcn.com/docs/theming`, components.json `https://ui.shadcn.com/docs/components-json`, CLI `https://ui.shadcn.com/docs/cli`, Dialog `https://ui.shadcn.com/docs/components/dialog` (implementer reads); Tailwind theme `https://tailwindcss.com/docs/theme`, font-size sub-properties `https://tailwindcss.com/docs/font-size`, dark mode `https://tailwindcss.com/docs/dark-mode`, custom utilities `https://tailwindcss.com/docs/adding-custom-styles` (implementer reads); Router + Query `https://tanstack.com/router/latest/docs/integrations/query`, router context `https://tanstack.com/router/latest/docs/guide/router-context`, `Wrap` `https://tanstack.com/router/latest/docs/api/router/RouterOptionsType`; Query `https://tanstack.com/query/v5/docs/reference/QueryCache`, `https://tanstack.com/query/v5/docs/reference/MutationCache`, `https://tanstack.com/query/v5/docs/framework/react/guides/query-retries`, `https://tanstack.com/query/v5/docs/framework/react/guides/query-cancellation`, `https://tanstack.com/query/v5/docs/framework/react/reference/useQuery`; Start server functions `https://tanstack.com/start/latest/docs/framework/react/guide/server-functions`; Store `https://tanstack.com/store/latest/docs/framework/react/quick-start`; CSP `https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/style-src`; `cn` README in `node_modules/cn/README.md` (Custom themes). Signatures confirmed in installed sources: Start client 1.170.39, query-core 5.107.1, store 0.11.2, shadcn CLI 4.23.0.

## Verification

**Commands:** (prefix each with `source ~/.nvm/nvm.sh && nvm use &&`)
- `npm run lint` -- expected: 0 errors
- `npm run typecheck` -- expected: 0 errors
- `npm test` -- expected: all pass, every matrix row included
- `npm audit --omit=dev --audit-level=high` -- expected: exit 0
- `npm run build` -- expected: succeeds with no app env
- `npm run smoke` -- expected: passes, including the no-inline-style check
- `bash .claude/skills/next-story/check.sh` -- expected: every line ok

**Manual checks:**
- Start the built server with fake env (`QBIT_URL=http://qbit.test.invalid:8080 QBIT_USERNAME=dev QBIT_PASSWORD=dev-pass SESSION_SECRET=$(openssl rand -base64 32) APP_ORIGINS=http://localhost:3000 SAVE_ROOTS=/downloads PORT=3000 node .output/server/index.mjs`), then use the ego-browser skill at a 1280 px viewport: emulate light, read the computed styles listed in the AC, save `seed-light.png`; emulate dark, same, save `seed-dark.png` under `_bmad-output/implementation-artifacts/screenshots/1-3/`; check the console for CSP violations. Repeat the console check on `npm run dev`. Record the computed values in the Auto Run Result. If ego-browser fails or cannot emulate the color scheme, halt as blocked.

## Auto Run Result

Manual checks, 2026-11-16, ego-browser at a 1280 px viewport, prefers-color-scheme emulated through CDP `Emulation.setEmulatedMedia`, CSP violations collected with a `securitypolicyviolation` listener injected before page load.

| Check | Built server, light | Built server, dark | Dev server, light | Dev server, dark |
|---|---|---|---|---|
| body background | rgb(246, 246, 244) | rgb(31, 41, 55) | rgb(246, 246, 244) | rgb(31, 41, 55) |
| h1 color | rgb(20, 20, 20) | rgb(233, 238, 245) | rgb(20, 20, 20) | rgb(233, 238, 245) |
| h1 size / weight | 26px / 700 | 26px / 700 | 26px / 700 | 26px / 700 |
| main padding | 22px 28px | 22px 28px | 22px 28px | 22px 28px |
| body font-variant-numeric | tabular-nums | tabular-nums | not read | not read |
| CSP violations | 0 | 0 | 0 | 0 |
| hydrated (React fiber on h1) | not read | not read | yes | yes |

- font-family computed: `-apple-system, "system-ui", "SF Pro Text", "PingFang TC", "Noto Sans TC", system-ui, sans-serif` (Chromium serializes `BlinkMacSystemFont` as `"system-ui"`; the stack still starts with `-apple-system`).
- Screenshots: `screenshots/1-3/seed-light.png`, `screenshots/1-3/seed-dark.png` (built server).
- Dev server CSP header present with a nonce; no `<style>` element in either page.

## Auto Run Result (review pass)

- **Review findings:** 40 findings. 24 patched (6 medium entries), 7 deferred (4 in frontmatter, the rest folded in), 9 rejected with reasons in the Review Triage Log.
- **Follow-up review recommended:** false. The medium patches (polling resume, error tables, retry policy, wrapper-shaped callFn tests) are each covered by tests that ran green; the wrapper tests are what caught the gate-rejection bug, which is now fixed and tested. No unverified risk from the patches can be named.
- **Verification after patches (Node v26.13.1):** lint exit 0; typecheck exit 0; vitest 20 files, 390 tests passed; audit 0 vulnerabilities; build with no app env ok; `npm run smoke` passed; build output contains none of the local `.env` values; `check.sh` all ok. Screenshots in `screenshots/1-3/` still match (the page did not change in the review pass).
- **Residual risks:** the deferred items; `seroval` and `@tanstack/start-storage-context` are imported by test helpers as transitive dependencies.
