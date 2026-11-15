---
title: 'Story 1.2: Server gate, error contract and logging'
type: 'feature'
created: '2026-11-16'
status: 'done'
baseline_revision: '82551adff6c68a445fe3a0dd8da47ac28969e6db'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-react-torrent-2026-11-15/ARCHITECTURE-SPINE.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Request-middleware context (session, bodyBytes) reaching guard() and the serialized not_logged_in status are only tested with hand-built harnesses.
    evidence: |-
      No real server function exists yet. Story 1.4 adds login and should add a built-server test that calls a gated function with and without a valid cookie and with a foreign Origin.
    location: >-
      src/server/functions/_define.ts
    severity: medium
  - summary: >-
      setSessionCookie and the Secure flag through the Tunnel (X-Forwarded-Proto) are untested.
    evidence: |-
      Story 1.4 is the first caller; the NAS checklist verifies X-Forwarded-Proto through the Tunnel.
    location: >-
      src/server/auth/session.ts
    severity: low
  - summary: >-
      TSS_PRERENDERING read at runtime would disable the Host gate if it were ever set in the container env.
    evidence: |-
      Start sets it only for the prerender child. Settle by confirming the Unraid template never sets it, or by detecting prerender at build time.
    location: >-
      src/server/gate/origin.ts
    severity: medium (unverified)
  - summary: >-
      CSP has no style-src or img-src decision.
    evidence: |-
      AR-31 already allows style-src 'self' 'unsafe-inline' when needed. Story 1.3 decides when the design tokens and shadcn land.
    location: >-
      src/shared/csp.ts
    severity: low (unverified)
---

<intent-contract>

## Intent

**Problem:** The container has no request gate, no error contract, no session signing, no startup env check and no logger, so any server function added later would be unauthenticated, could throw raw exception text, and could leak secrets into logs.

**Approach:** Add `src/start.ts` with an explicit request middleware chain (security headers, CSRF, Host/Origin/X-Requested-With gate, session verification, body limit), a server function factory in `src/server/functions/_define.ts` that enforces login, zod validation, a 30 s timeout and exception mapping, the shared error contract, `rt_session` signing, a Nitro boot plugin that refuses to start on bad env, and a masking stdout logger. No real server function ships yet; a test fixture proves the factory and the auto-discovery test.

## Boundaries & Constraints

**Always:**
- Error codes are exactly AR-33's 12. Server functions return `{ ok: true, data }` or `{ ok: false, error: { code, message } }` and never throw to the caller; `message` comes only from a fixed Chinese table.
- The container never sends HTTP 401 and never sends any `Access-Control-*` header.
- Gate order in `requestMiddleware`: security headers (outermost, so short-circuit responses also get headers), CSRF, origin gate, session gate, body limit. Origin and cookie are checked before any body byte is read.
- Only `src/server/log` writes logs (`no-console` in `src/server/**` and `src/start.ts`). Never log request bodies, full headers, `Request`/`Response`/`Headers` objects or env.
- `createServerFn` is imported only in `src/server/functions/_define.ts` (lint). Every server function is a top-level `export const x = serverGet|serverPost.validator(input(schema)).handler(guard(spec, run))` (see Design Notes for why).
- zod pinned exactly at `4.6.7` (AR-3 line 4.6.x; `npm view zod version` on 2026-11-16).
- Tests never touch a real qBittorrent; fake values like `http://qbit.test.invalid:8080` only. No IPs or credentials in any tracked file.

**Never:**
- No login screen or `login` function (Story 1.4), no qBittorrent client (1.5), no `callFn` or `error-text.ts` (1.3), no 384 KB or 10 MB/50 MB rules (Stories 4.3, 5.5, add-torrents). Only the 64 KB default, with the per-function hook described below.
- No `'unsafe-inline'` in `script-src`. No CORS headers, no generic `/api/v2/*` proxy, no second server route.
- No reading `CF-Connecting-IP` or `X-Forwarded-For`.
- Do not edit `.env`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Env valid | all 6 required set, secret 44 chars | parsed env; `CONFIG_DIR` defaults to `/config`, or the given value | none |
| Env missing | any one of `QBIT_URL`, `QBIT_USERNAME`, `QBIT_PASSWORD`, `SESSION_SECRET`, `APP_ORIGINS`, `SAVE_ROOTS` unset or empty | one `error` log line naming the variable; injected `exit(1)` called | output never contains any provided value |
| Weak secret | `SESSION_SECRET` under 32 UTF-8 bytes, or equal to `replace-with-openssl-rand-base64-32` | same as above, reason "too short" / "placeholder" | same |
| Bad list format | `APP_ORIGINS` entry with a path or not a URL; `SAVE_ROOTS` entry not absolute, `/` alone, or containing a `..` segment | same as above | same |
| Build prerender / dev | `TSS_PRERENDERING=true` / `TSS_DEV_SERVER=true` | prerender: check skipped; dev: problems logged, no exit | none |
| Log masking | `log.info('x', { password, cookie, 'set-cookie', sid, session, rt_session, QBIT_URL, SESSION_SECRET, nested: { password } })` | one JSON line on stdout with `time` (ISO), `level`, `event`; every listed value is `[masked]` | `Headers`/`Request`/`Response` values become `[omitted]`; string values containing the current `QBIT_PASSWORD`, `SESSION_SECRET`, `QBIT_URL` text are scrubbed |
| Startup log | boot with valid env | `info` line `startup` with `version` and `commit` | none |
| Error messages | `fail(code)` for each of the 12 codes, with fake `QBIT_URL` set | fixed Chinese message; never contains the URL or its host | none |
| Session token | issued at T with remember / without | valid at `exp - 1`, invalid at `exp` and `exp + 1`; `exp - iat` is 7 776 000 s / 43 200 s | tampered payload, bad signature, garbage, or token signed with the previous secret: treated as no session |
| Session cookie | protocol https / http | `rt_session`, `HttpOnly`, `SameSite=Strict`, `Path=/`, `Max-Age` = lifetime; `Secure` only for https | none |
| Factory: no session | gated function, no session in context | `not_logged_in`; zod and handler not run | none |
| Factory: public | `auth: 'public'`, no session | handler runs | none |
| Factory: bad input | input fails schema | `invalid_input`; handler not run | zod issue text not in message |
| Factory: slow | handler pending past 30 s | `timeout`; handler's `signal` aborted | none |
| Factory: known failure | handler throws `ServerFailure('qbit_rejected')` | `qbit_rejected` | logged at `warn` |
| Factory: unknown exception | handler throws `Error('connect ECONNREFUSED http://qbit.test.invalid:8080')` | `qbit_rejected`; fixed message | logged at `error`, masked; message never contains the URL |
| Factory: body over function limit | fixture with `bodyLimit: 1024`, context `bodyBytes: 2000` | `invalid_input`; handler not run | none |
| Discovery | every export of `src/server/functions/*.ts` (not `_*`, not tests) | each returns `not_logged_in` unauthenticated except one named `login`; any other `auth: 'public'` export fails the test | fixture dir proves the same helper catches a gated function, a fake `login`, a non-factory export |
| Gate: bad Origin | server fn POST, `Origin: https://evil.example` | 403 JSON `{ ok: false, error: { code: 'bad_origin', message } }` | `next` not called |
| Gate: Host | any non-`/healthz` request, Host not a host of `APP_ORIGINS` | 403 `bad_origin` | `next` not called |
| Gate: no X-Requested-With | server fn request without `X-Requested-With: XMLHttpRequest` | 403 `bad_origin` | `next` not called |
| Gate: POST without Origin | server fn POST, no `Origin` | 403 `bad_origin` | `next` not called |
| Gate: GET read | server fn GET, good Host, XRW, no `Origin` | passes | none |
| Gate: CSRF | server fn, `Sec-Fetch-Site: cross-site` | `createCsrfMiddleware` `failureResponse`: 403 `bad_origin` JSON | `next` not called |
| Gate: healthz | `/healthz`, foreign Host, no XRW | 200 `ok` | none |
| Gate: page | `GET /` with allowed Host, no XRW, no Origin | page renders | none |
| Gate: session | valid / invalid / missing `rt_session` | `next({ context: { session } })` with payload or `null`; never rejects | none |
| Body: Content-Length | server fn, `Content-Length: 65537` | 413 `invalid_input` | `next` not called, body not read |
| Body: streamed | server fn, no Content-Length, 70 000-byte stream | 413 `invalid_input` once count passes 65 536 | stream cancelled, `next` not called |
| Body: ok | 1 000-byte body | `next({ context: { bodyBytes: 1000 } })`; original body still readable | none |
| Headers | any response through Start: 200, 404, gate 403/413, healthz | `Content-Security-Policy` per amended AD-10 (nonce on HTML, exact AR-31 string on static assets), `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`; any `access-control-*` removed | response with immutable headers (`Response.redirect`) is copied, then headed |
| Static assets | `GET /assets/*.js` (served by Nitro, bypasses Start) | nosniff, no-referrer, CSP exactly AR-31's string via Nitro `routeRules` | none |

</intent-contract>

## Code Map

- `src/start.ts` -- new. `export const startInstance = createStart(() => ({ requestMiddleware }))`. Root file category: may import any layer.
- `src/router.tsx` -- `getRouter()` adds `ssr: { nonce }` read from `getGlobalStartContext()?.cspNonce` (undefined on the client).
- `src/routes/healthz.ts` -- unchanged; the gate exempts `/healthz`.
- `vite.config.ts` -- `nitro({ plugins: [...], routeRules: {...} })` and `define` for version and commit sha.
- `eslint.config.js` -- add `no-restricted-imports` for `createServerFn` (override for `_define.ts`) and `no-console` for server code. Boundaries already map `src/server/*` and `src/server/functions`.
- `src/lint-rules.test.ts` -- existing ESLint Node API probe; extend it.
- `.env.example` -- placeholders already exist; add format comments (Story 1.1 deferred item).
- `node_modules/@tanstack/start-client-core/dist/esm/createCsrfMiddleware.js`, `node_modules/@tanstack/start-server-core/dist/esm/createStartHandler.js`, `.../server-functions-handler.js`, `node_modules/@tanstack/start-plugin-core/dist/esm/start-compiler/handleCreateServerFn.js` -- installed source used to confirm the APIs below.

## Tasks & Acceptance

**Execution:**
- `package.json` -- add `"version": "0.1.0"`; add `"zod": "4.6.7"` to dependencies; `npm install` -- AR-3; startup log needs a version.
- `src/shared/errors.ts` -- `ERROR_CODES` (12, readonly tuple), `ErrorCode`, `ERROR_MESSAGES` (table in Design Notes), `Success<T>`, `Failure`, `Result<T>`, `ok(data)`, `fail(code)` -- AR-33.
- `src/server/errors/server-failure.ts` -- `class ServerFailure extends Error { code: ErrorCode }` that server modules throw for known failures; its message is never sent to the client.
- `src/server/log/index.ts` -- `log.info|warn|error(event, fields?)`, one JSON line per call via `process.stdout.write`; masking rules from the matrix (keys case-insensitive: equal to or containing `password`, `cookie`, `session`, `secret`, `token`, equal to `sid`, or starting with `qbit_`; recursive); `Error` values logged as `{ name, message }` with message scrubbed; testable through an injected writer and secret list -- AR-36.
- `src/server/env/index.ts` -- `parseEnv(source)` returning `{ ok: true, env }` or `{ ok: false, problems: string[] }` (problems name the variable and reason only); `getEnv()` parses `process.env` once and throws a fixed message if invalid; `runStartupCheck({ source, exit, version, commit, isPrerender, isDev })` logs problems or the `startup` line -- AR-17, NFR-16.
- `src/server/env/startup-plugin.ts` -- Nitro `definePlugin` calling `runStartupCheck` with `process.exit`, `__APP_VERSION__`, `__COMMIT_SHA__`, `process.env.TSS_PRERENDERING === 'true'`, `process.env.TSS_DEV_SERVER === 'true'`.
- `src/globals.d.ts` -- declare `__APP_VERSION__` and `__COMMIT_SHA__` as `string`.
- `src/server/auth/session.ts` -- `issueSession({ remember, now, secret })` returning `{ token, maxAge }`; `verifySession(token, { now, secret })` returning `{ iat, exp }` or `null`; `sessionCookieOptions({ maxAge, protocol })`; `setSessionCookie(token, maxAge)` using `setCookie` and `getRequestProtocol()` from `@tanstack/react-start/server`. Token format in Design Notes -- AR-22. Story 1.4 calls `issueSession` + `setSessionCookie`.
- `src/server/gate/security-headers.ts` -- request middleware: per-request nonce (`crypto.randomBytes(16)` base64), `next({ context: { cspNonce } })`, then set CSP, nosniff, no-referrer and delete `access-control-*` on the returned response (copy with `new Response(body, response)` if headers are immutable). Export the CSP builder for tests -- AR-31, AR-18.
- `src/server/gate/origin.ts` -- request middleware for the Host / Origin / X-Requested-With rules in the matrix; exempt `pathname === '/healthz'`; skip when `TSS_PRERENDERING === 'true'`; returns `badOriginResponse()` (403 JSON from `fail('bad_origin')`) -- AR-26.
- `src/server/gate/session.ts` -- request middleware, server fn requests only: read `rt_session` from the cookie header, `verifySession`, `next({ context: { session } })`; never rejects -- AR-26 "cookie before body".
- `src/server/gate/body-limit.ts` -- `DEFAULT_BODY_LIMIT = 65_536`, `MAX_REQUEST_BODY = DEFAULT_BODY_LIMIT` (the request-level ceiling; later stories raise it); server fn requests with a body: reject on `Content-Length` over the ceiling, else when absent count a `request.clone()` stream and cancel past the ceiling; pass `bodyBytes` in context; 413 `fail('invalid_input')` JSON -- AR-27.
- `src/server/gate/index.ts` -- `export const requestMiddleware = [securityHeaders, csrf, originGate, sessionGate, bodyLimit] as const`, where `csrf = createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === 'serverFn', origin: <APP_ORIGINS list>, failureResponse: () => badOriginResponse() })`.
- `src/start.ts` -- `createStart` with `requestMiddleware` from the gate.
- `src/router.tsx` -- nonce wiring as in Code Map.
- `src/server/functions/_define.ts` -- `serverGet`, `serverPost` (`createServerFn({ method })`), `input(schema)` (non-throwing typed passthrough validator), `guard(spec, run)` with `spec = { input, auth?: 'required' | 'public', bodyLimit?: number }`; order: auth, body limit vs `context.bodyBytes`, `safeParse`, run with a 30 s `AbortSignal` raced against a timer, map `ServerFailure` and timeouts, catch-all maps to `qbit_rejected`. Attach the inner runner under `Symbol.for('rt.guarded')` with the spec so tests can call it -- AR-23, AR-25.
- `src/server/functions/__fixtures__/sample.ts`, `public-login.ts`, `plain.ts` -- test-only modules: a gated GET with a zod input and `bodyLimit: 1024`, a fake `login` with `auth: 'public'`, a non-server-fn export. Not imported by the app, so never built.
- `src/server/functions/discover.test.ts` -- shared discovery helper over `import.meta.glob(['./*.ts', '!./_*.ts', '!./*.test.ts'])` and over `./__fixtures__/*.ts`; matrix row "Discovery".
- `vite.config.ts` -- `nitro({ plugins: ['./src/server/env/startup-plugin.ts'], routeRules: { '/**': { headers: { nosniff, no-referrer } }, '/assets/**': { headers: { 'content-security-policy': <AR-31 literal> } } } })`; never put CSP under `/**` (it overwrites the nonce CSP, verified). `define`: `__APP_VERSION__` from `package.json`, `__COMMIT_SHA__` from `process.env.COMMIT_SHA`, else `git rev-parse HEAD`, else `'unknown'`.
- `eslint.config.js` -- `no-restricted-imports` banning `createServerFn` from `@tanstack/react-start` and `@tanstack/*start*` everywhere except `src/server/functions/_define.ts`; `no-console: 'error'` for `src/server/**` and `src/start.ts`.
- `src/lint-rules.test.ts` -- probes: `createServerFn` imported outside `_define.ts` fails; inside passes; `console.log` in `src/server/x` fails.
- `.env.example` -- comments: `APP_ORIGINS` comma-separated origins (scheme, host, optional port, no path or trailing slash), list every address used (placeholders like `http://nas.example:3000,https://torrent.example.com`); `SAVE_ROOTS` comma-separated absolute paths as seen inside the qBittorrent container; `SESSION_SECRET` from `openssl rand -base64 32`, at least 32 bytes, the placeholder is refused, changing it logs everyone out; `CONFIG_DIR` defaults to `/config`.
- Tests next to each module: `src/shared/errors.test.ts`, `src/server/log/index.test.ts`, `src/server/env/index.test.ts`, `src/server/auth/session.test.ts`, `src/server/gate/*.test.ts`, `src/server/functions/_define.test.ts` -- one test per matrix row; middleware tests call `mw.options.server({ request, pathname, handlerType, context, next: vi.fn() })` and assert `next` call counts; env via `vi.stubEnv`; timeout via fake timers.

**Acceptance Criteria:**
- Given the built server and an env missing `SESSION_SECRET`, when running `node .output/server/index.mjs`, then it prints one error line naming `SESSION_SECRET` (no values) and exits non-zero before listening; with valid env it logs `startup` with version and a 40-hex or `unknown` commit, then listens.
- Given `npm run build` with no app env vars set, when it runs, then the build and prerender succeed.
- Given the dev server with valid env, when curling `/healthz` and `/`, then both responses carry the CSP, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` and no `Access-Control-*` header; `/` renders 「種子」.
- Given the dev server, when curling `/_serverFn/x` with a foreign `Host`, or without `X-Requested-With`, then the status is 403 (never 401) with JSON code `bad_origin`.
- Given a browser (ego-browser) on the dev server and on the built server, when opening `/`, then the console shows no CSP violation and the page hydrates.
- Given a file outside `_define.ts` importing `createServerFn`, when linting, then lint fails.

## Spec Change Log

### 2026-11-16: implementation
- Trigger: home access over plain http sends no `Sec-Fetch-Site`, no `Origin` on same-origin GET, and no `Referer` (no-referrer), so Start's CSRF middleware would reject every read.
- Amended: `createCsrfMiddleware` runs with `allowRequestsWithoutOriginCheck: true`; Alex approved on 2026-11-16 and AD-12 records it.
- Known-bad state avoided: the app unusable at home.
- KEEP: Host allowlist, required `X-Requested-With`, required `Origin` on POST.

## Review Triage Log

### 2026-11-16: Review pass
- verdicts: 49 findings: high 0, medium 8, low 35, false 2, maybe-false 4
- findings:
  - `[medium]` `[patch]` VG: no automated check that inline scripts carry the per-request nonce. smoke script asserts header nonce equals every script nonce on the built server, CI step.
  - `[medium]` `[defer]` VG: gate mount in start.ts and middleware context reaching guard() only tested with hand-built harnesses. Story 1.4 adds the first real function; built-server test with and without cookie and with a foreign Origin.
  - `[medium]` `[patch]` VG: Nitro startup plugin registration and exit wiring untested. smoke script boots without SESSION_SECRET and asserts non-zero exit and no Listening.
  - `[medium]` `[patch]` VG: asset CSP test pins a constant the server never uses. single constant in src/shared/csp.ts imported by vite.config.ts; smoke asserts the served asset CSP.
  - `[low]` `[patch]` VG other: STATIC_CSP dead at runtime. same fix as above.
  - `[medium]` `[defer]` Intent 1: request-middleware context reaching the handler not asserted. same as the VG defer row; Story 1.4.
  - `[low]` `[defer]` Intent 2: handler-not-called asserted on the simulated chain. covered when Story 1.4's built-server test exists.
  - `[low]` `[patch]` Intent 3: discovery is top-level only and runs below the RPC layer. glob made recursive over ts and tsx; RPC-level check deferred with Story 1.4.
  - `[low]` `[patch]` Intent 4: serverGet.handler without guard bypasses lint. imports of _define restricted to src/server/functions/**; discovery catches unguarded exports there.
  - `[low]` `[patch]` Intent 5: real header surfaces only checked manually. smoke script covers /, /healthz and an asset.
  - `[medium]` `[patch]` Intent 6: HTML nonce plumbing untested. smoke script.
  - `[maybe-false]` `[defer]` Intent 7: HTTP status of a serialized not_logged_in never asserted. Story 1.4 built-server test; settle by curling a gated function without a cookie.
  - `[low]` `[defer]` Intent 8: setSessionCookie untested and uncalled. Story 1.4 is its first caller.
  - `[low]` `[patch]` Intent 9: startup plugin and define substitution untested. smoke script checks the startup line and the env exit.
  - `[low]` `[reject]` Intent 10: no test for 'no external CDN'. enforced by default-src 'self'; there is no external reference in the code.
  - `[false]` `[reject]` Intent 11: GET without Origin accepted. deliberate, approved by Alex 2026-11-16 and recorded in AD-12.
  - `[medium]` `[patch]` Blind: no end-to-end request through Start. smoke script for HTML, assets and boot; function-level context deferred to Story 1.4.
  - `[false]` `[reject]` Blind: unknown exceptions always qbit_rejected. Alex chose this on 2026-11-16; recorded in AD-9.
  - `[low]` `[reject]` Blind: AbortSignal not linked to the request abort. qBittorrent calls are capped at 30 s; adding signal plumbing is more than a direct correction.
  - `[low]` `[patch]` Blind: failure logs lack function name and Error.cause. optional name in the guard spec and sanitized cause in the logger.
  - `[medium]` `[patch]` Blind: serverGet/serverPost importable anywhere; glob not recursive. import restriction and recursive glob.
  - `[low]` `[patch]` Blind: nothing makes mutations use POST. doc comment on serverGet citing AR-25.
  - `[maybe-false]` `[defer]` Blind: TSS_PRERENDERING read at runtime could disable the Host gate. Start sets it only in the prerender child; settle by checking whether the container env could ever carry it (Unraid template is Alex's).
  - `[low]` `[patch]` Blind: SESSION_SECRET length on untrimmed string. trim once, measure bytes of the trimmed value.
  - `[low]` `[patch]` Blind: QBIT_URL accepts path, query, credentials. rejected; stored without trailing slash.
  - `[low]` `[patch]` Blind: APP_ORIGINS rejects non-canonical origins. accept and store url.origin.
  - `[maybe-false]` `[defer]` Blind: CSP has no style-src or img-src decision. SPA renders on the client so React sets styles through CSSOM; AR-31 already allows adding style-src when needed; Story 1.3 decides.
  - `[low]` `[patch]` Blind: static CSP duplicated. shared constant.
  - `[low]` `[defer]` Blind: cookie Secure relies on X-Forwarded-Proto through the Tunnel. already listed as an epic fact to verify; Story 1.4 and the NAS checklist.
  - `[low]` `[patch]` Blind: bodyLimit above the ceiling not enforced. throw at definition time.
  - `[low]` `[patch]` Blind: log scrubbing mangles short words. username dropped from substring scrubbing; longest first.
  - `[low]` `[patch]` Blind: errors.test mutates process.env. vi.stubEnv.
  - `[low]` `[patch]` Edge: APP_ORIGINS or SAVE_ROOTS of only commas. 'has no entries' problems.
  - `[low]` `[patch]` Edge: SAVE_ROOTS with '.' or empty segments. rejected.
  - `[low]` `[patch]` Edge: SESSION_SECRET whitespace. trimmed.
  - `[low]` `[patch]` Edge: getEnv throw inside gates gives a raw 500. caught, returns bad_origin.
  - `[maybe-false]` `[defer]` Edge: TSS_PRERENDERING left set at runtime. same as the Blind defer row.
  - `[low]` `[patch]` Edge: client abort makes reader.read reject. caught, contract response.
  - `[low]` `[reject]` Edge: slow-loris body without Content-Length. Node and Cloudflare connection timeouts bound it; a deadline race adds a branch for a LAN-only app.
  - `[low]` `[patch]` Edge: bodyLimit NaN or above ceiling. throw at definition time.
  - `[low]` `[patch]` Edge: handler-returned custom message reaches client. re-wrapped with fail(code).
  - `[low]` `[reject]` Edge: redirect or notFound swallowed. no server function in this app redirects; adding control-flow passthrough is extra surface.
  - `[low]` `[patch]` Edge: discovery misses tsx and subdirectories. recursive glob.
  - `[low]` `[reject]` Edge: dynamic import of createServerFn passes lint. no realistic author does this; the Start compiler only extracts top-level builders anyway.
  - `[low]` `[reject]` Edge: duplicate rt_session cookies. the app sets one host-only cookie with one path; no second cookie can exist.
  - `[low]` `[patch]` Edge: Error.cause dropped. sanitized cause kept.
  - `[low]` `[patch]` Edge: authorization, apikey, credential keys not masked. added.
  - `[low]` `[patch]` Edge: short or uppercase COMMIT_SHA dropped. lowercased, 7 to 40 hex accepted.
  - `[low]` `[patch]` Edge: errors.test env leak. vi.stubEnv.

## Design Notes

## Resolved questions (Alex, 2026-11-16)

Both answered with the recommended option: (1) AD-10 and AR-31 are amended to `script-src 'self' 'nonce-<per-request>'` for HTML responses, static assets keep the exact AR-31 string; (2) unknown exceptions map to `qbit_rejected`. The spine and epics are updated. Original questions kept below for the record.

### Original questions

The spec stays `blocked` until Alex answers both. Everything else below is decided.

1. **CSP header vs. hydration.** AR-31 / AD-10 fix the header as `script-src 'self'`. TanStack Start 1.169.5 puts three inline `<script>` tags in every HTML response (scroll restoration, the `$_TSR` dehydration payload, a stream boundary); checked in `.output/public/_shell.html` and in the per-request SSR of `/` from the built server. Without them `hydrate()` fails (`window.$_TSR` undefined), so the exact AR-31 header leaves a blank app. The payload changes per response (`u:` timestamp), so build-time hashes do not work, and `'unsafe-inline'` is forbidden. The only version-supported way is the router's `ssr.nonce`: a per-request nonce makes the header `script-src 'self' 'nonce-<random>'` (verified in a scratch build: every inline script, the module script and a `csp-nonce` meta carry the nonce; dev and prod, `/`, `/healthz`, 404). **Question: may AD-10 / AR-31 be amended to `script-src 'self' 'nonce-<per-request>'` for HTML responses (static assets keep the exact AR-31 string)?** Recommended: yes. This spec is written for that answer; if yes, update AD-10 and AR-31 first, then set status `ready-for-dev`. Known upstream issues: TanStack/router #8789 (nonce set after router creation is ignored; avoided by passing it in `getRouter()`), #8550 (with the CSP in a header, a duplicate module script is appended after hydration; same nonce, the module runs once).
2. **Unknown exceptions in the factory.** The story says no server function throws and every exception maps to the contract, but none of the 12 codes means "unexpected server error". **Question: which code should an unrecognised exception become?** Recommended: `qbit_rejected` (the UI then runs that operation's own failure path; `qbit_unreachable` would raise the global connection alert for a bug). The alternative is to add a 13th code to AD-9 first.

### Decisions and rationale

- **Factory shape (compiler constraint):** Start's compiler only transforms a top-level `const x = <builder>.handler(fn)` and derives the function id from the variable name and file (`handleCreateServerFn.js`). A wrapper like `defineServerFn({...})` calling `createServerFn` inside `_define.ts` would give every function the same id. So `_define.ts` exports builders and `guard()`; verified in a scratch build that `serverGet.handler(...)` imported from `_define.ts` compiles with distinct ids per file. A function middleware cannot short-circuit with `{ ok: false, error }`: Start reads the `error` key as a thrown error (verified), so the checks live in `guard()`. Golden example:

  ```ts
  // src/server/functions/get-example.ts
  const exampleInput = z.object({ since: z.number().int().nonnegative() })
  export const getExample = serverGet
    .validator(input(exampleInput))
    .handler(guard({ input: exampleInput }, async ({ input, signal }) => ok({ since: input.since })))
  ```
- **Validator name:** this version uses `.validator()` (installed `createServerFn.d.ts` and the server functions guide); there is no `.inputValidator()`. Start's own validator throws on failure, so `input()` only types the call site and `guard()` runs `safeParse`.
- **Testing without the compiler:** under vitest `.handler(fn)` keeps `fn` as the client fetcher, and Start copies its own enumerable properties (including symbols) onto the server fn object, so `fn[Symbol.for('rt.guarded')]` reaches the runner (verified). Tests call that runner with a fake context; they never call the server fn directly.
- **Request-middleware context:** values passed with `next({ context })` reach the handler's `context` and `getGlobalStartContext()` (verified). `guard()` reads `session` and `bodyBytes` from there.
- **Gate scope (Claude 代決):** Origin and X-Requested-With apply only to server fn requests (`handlerType === 'serverFn'`): browser navigations to `/` cannot send `X-Requested-With`, and same-origin GET fetches send no `Origin`. Host applies to every Start request except `/healthz` (DNS rebinding). POST server fns must send `Origin`; GET must match if present. `X-Requested-With` must equal `XMLHttpRequest`, the value `callFn` will send.
- **Body limit (Claude 代決):** Start reads the body inside `handleServerAction` after middleware, and middleware cannot know which function an opaque id targets. So the request-level ceiling (`MAX_REQUEST_BODY`) is checked before reading, and `guard()` compares the measured `bodyBytes` with its own `bodyLimit` (default 64 KB). A later story raises the ceiling and passes `bodyLimit` on the functions that need more. `request.clone()` keeps the original body readable for Start.
- **Cookie before body (Claude 代決):** `login` needs a body without a cookie and the id is opaque, so the session gate verifies the cookie before the body is read and `guard()` enforces it; the ceiling bounds what an unauthenticated caller can make the container parse.
- **Statuses (Claude 代決):** `bad_origin` 403, body too large 413, both JSON in the contract shape. A plain JSON response from middleware reaches the caller as-is (`serverFnFetcher.js` returns `response.json()` without checking status). `not_logged_in` is a return value, so Start sends 200.
- **Startup check placement:** Start loads `src/start.ts` lazily on the first request (`getEntries()`), so a module-level check would not run at container start. A Nitro plugin runs at boot before listening (verified: exit code 1, no "Listening"). It also runs during the build's SPA prerender (`TSS_PRERENDERING=true`), so it skips there or CI builds fail; the origin gate skips there too. In dev, `process.exit` makes Nitro restart its worker in a loop (verified), so dev logs and continues (Claude 代決).
- **Static assets:** Nitro serves `/assets/*` without Start, so only `routeRules` reach them (verified). A CSP under `/**` replaces the middleware's nonce CSP on `/` (verified), so CSP goes under `/assets/**` only.
- **Session token (Claude 代決):** `base64url(JSON.stringify({ v: 1, iat, exp }))` + `.` + `base64url(HMAC-SHA256(SESSION_SECRET, payloadPart))`, compared with `timingSafeEqual`; seconds since epoch; valid while `now < exp`. `Max-Age` equals the lifetime in both modes.
- **Env formats (Claude 代決):** comma-separated lists, entries trimmed; origins normalised with `new URL(entry).origin` and must equal the trimmed entry; allowed hosts are each origin's `host`.
- **Messages (Claude 代決):** `not_logged_in` 請先登入; `login_failed` 帳號或密碼不對; `login_locked` 錯太多次，請稍後再試; `cloudflare_expired` Cloudflare 登入過期; `home_unreachable` 連不到家裡; `qbit_unreachable` 家裡的 qBittorrent 沒有回應; `qbit_auth_failed` 容器裡的 qBittorrent 密碼不對，要改 NAS 上的容器設定; `qbit_rejected` qBittorrent 拒絕這個操作; `timeout` qBittorrent 超過 30 秒沒有回應; `invalid_input` 送出的資料格式不對; `settings_write_failed` 設定檔寫不進去; `bad_origin` 請求來源不對. Screen text still comes from `error-text.ts` (Story 1.3).
- **Other Claude 代決:** version `0.1.0`; commit sha from `COMMIT_SHA` then `git rev-parse HEAD` then `unknown` (Story 1.9 passes `COMMIT_SHA`, since `.dockerignore` drops `.git`); `style-src` not added (no inline styles in the shell; React style props use CSSOM, which CSP allows); fixtures in `src/server/functions/__fixtures__/`.
- **Docs and sources (AD-11, 2026-11-16):** middleware and `src/start.ts` `https://tanstack.com/start/latest/docs/framework/react/guide/middleware`; server functions `https://tanstack.com/start/latest/docs/framework/react/guide/server-functions`; SPA mode `https://tanstack.com/start/latest/docs/framework/react/guide/spa-mode`; hosting `https://tanstack.com/start/latest/docs/framework/react/guide/hosting`; Nitro plugins `https://nitro.build/docs/plugins`; Nitro route rules `https://nitro.build/docs/routing#route-rules`; CSP nonce pattern `https://github.com/TanStack/router/discussions/3028`; issues `https://github.com/TanStack/router/issues/8789`, `https://github.com/TanStack/router/issues/8550`. The docs do not cover `failureResponse`, `getRequestProtocol` or `setCookie`; their names and signatures come from the installed 1.169.5 types (`createCsrfMiddleware.d.ts`, `internal-request-response.d.ts`). Installed: start-server-core 1.169.45, start-client-core 1.170.39, router-core 1.171.39, nitro 3.0.261103-rc.

## Verification

**Commands:** (prefix each with `source ~/.nvm/nvm.sh && nvm use &&`)
- `npm run lint` -- expected: 0 errors
- `npm run typecheck` -- expected: 0 errors
- `npm test` -- expected: all pass, including every matrix row
- `npm audit --omit=dev --audit-level=high` -- expected: exit 0
- `env -u QBIT_URL -u SESSION_SECRET npm run build` -- expected: succeeds with no app env
- `SESSION_SECRET=short QBIT_URL=http://qbit.test.invalid:8080 QBIT_USERNAME=u QBIT_PASSWORD=p APP_ORIGINS=http://localhost:3000 SAVE_ROOTS=/downloads PORT=3456 node .output/server/index.mjs; echo $?` -- expected: one error line naming `SESSION_SECRET`, no value printed, exit code not 0
- Start the dev server with fake env (`QBIT_URL=http://qbit.test.invalid:8080 QBIT_USERNAME=dev QBIT_PASSWORD=dev-pass SESSION_SECRET=$(openssl rand -base64 32) APP_ORIGINS=http://localhost:3000 SAVE_ROOTS=/downloads npm run dev`), then `curl -si localhost:3000/healthz` and `curl -si localhost:3000/` -- expected: both show `content-security-policy` with `script-src 'self' 'nonce-`, `x-content-type-options: nosniff`, `referrer-policy: no-referrer`, no `access-control-`; then `curl -si -H 'Host: evil.example' localhost:3000/` and `curl -si -X POST -H 'Origin: http://localhost:3000' localhost:3000/_serverFn/x` -- expected: 403 JSON `bad_origin`. Stop the server.
- Same curls against the built server (`PORT=3000 node .output/server/index.mjs` with the fake env), plus `curl -sI localhost:3000/assets/<a built js file>` -- expected: nosniff, no-referrer and the exact AR-31 CSP
- `bash .claude/skills/next-story/check.sh` -- expected: every line ok

**Manual checks:**
- ego-browser on `http://localhost:3000/` (dev and built): page shows 「種子」, console has no CSP violation. If ego-browser fails, halt as blocked.

## Auto Run Result

- **Summary:** server gate (`src/start.ts` request middleware: security headers with per-request CSP nonce, CSRF, Host/Origin/X-Requested-With, session, 64 KB body limit), the 12-code error contract with fixed Chinese messages, the masked stdout logger, env validation that refuses to boot, signed `rt_session` cookies, and the `_define.ts` server function factory with a login audit over every function.
- **Files changed:** `src/start.ts`; `src/router.tsx` (nonce); `src/shared/errors.ts`, `src/shared/csp.ts`; `src/server/errors/`, `src/server/log/`, `src/server/env/` (with the Nitro startup plugin), `src/server/auth/session.ts`, `src/server/gate/*`; `src/server/functions/_define.ts` with fixtures and the discovery test; `src/globals.d.ts`; `scripts/smoke-built-server.mjs`; `vite.config.ts`; `eslint.config.js`; `.github/workflows/ci.yml` (smoke step); `.env.example` (format notes); `package.json` (version, zod 4.6.7, smoke script); tests next to each module.
- **Review findings:** 49 findings. 31 patched (8 medium entries among them), 9 deferred (4 recorded in frontmatter, the rest folded into those), 9 rejected with reasons in the Review Triage Log.
- **Follow-up review recommended:** false. The medium patches (nonce plumbing, boot exit, asset CSP, factory imports) are each covered by the new smoke script or lint and unit tests that ran green; no unverified risk from the patches can be named. The open risk (middleware context reaching real functions) is deferred to Story 1.4, not patched here.
- **Verification (Node v26.13.1):** lint exit 0; typecheck exit 0; vitest 14 files, 213 tests passed; audit 0 vulnerabilities; build with no app env ok; `npm run smoke` passed (nonce on every script, asset CSP equals the shared constant, healthz 200, boot without SESSION_SECRET exits non-zero); manual curl on the built server: nonce CSP, nosniff, no-referrer, 403 `bad_origin` JSON for a foreign Host; ego-browser: page hydrates with no CSP violations (implementer); `check.sh` all ok.
- **Residual risks:** the deferred items above; dev-server foreign Host gets Vite's plain-text 403 instead of the JSON body (status still 403); `scripts/` is excluded from lint.
- **Decisions by Alex (2026-11-16):** nonce CSP on HTML (AD-10, AR-31); unknown exceptions map to `qbit_rejected` (AD-9); CSRF `allowRequestsWithoutOriginCheck: true` (AD-12).
