---
title: 'Story 1.1: Restart from the official TanStack Start template, remove legacy files'
type: 'chore'
created: '2026-11-16'
status: 'done'
baseline_revision: '2c50f92d18ab9faccd7e20a063ade8112b3a142c'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-react-torrent-2026-11-15/ARCHITECTURE-SPINE.md'
warnings: ['oversized']
deferred:
  - summary: >-
      /healthz is only tested by calling the handler, never through the built Nitro server.
    evidence: |-
      src/routes/healthz.test.ts calls Route.options.server.handlers.GET directly; CI builds but never starts .output/server/index.mjs. Story 1.9 adds the image and its smoke test.
    location: >-
      src/routes/healthz.test.ts
    severity: medium
  - summary: >-
      .env.example has no notes on APP_ORIGINS and SAVE_ROOTS separators or the SESSION_SECRET strength rule.
    evidence: |-
      Story 1.2 defines env parsing and the weak-secret refusal; document the formats there.
    location: >-
      .env.example
    severity: low
  - summary: >-
      No Traditional Chinese not-found page; unknown URLs show the English framework default.
    evidence: |-
      src/routes/__root.tsx has no notFoundComponent. A new screen is a design decision for Alex. Settle by asking whether Epic 1 needs one.
    location: >-
      src/routes/__root.tsx
    severity: low (unverified)
---

<intent-contract>

## Intent

**Problem:** The repo still holds the old Vite + Cloudflare Workers app plus Auto Claude leftovers, an out-of-date lock file and a CI that has never passed. Every later story needs one clean foundation built on the official TanStack Start template with CI guarding each PR.

**Approach:** Scaffold the official TanStack Start React template (SPA mode, Node server output via Nitro), replace the old app and tooling, delete legacy files, pin the stack to the architecture's versions, encode the layer boundaries and raw-HTML bans in ESLint, add `GET /healthz` as the only server route, and replace the old CI with one PR workflow (lint, typecheck, vitest, audit, build).

## Boundaries & Constraints

**Always:**
- Leave untouched: `DESIGN.md`, `LICENSE`, `_bmad/`, `_bmad-output/` (except files this story adds there), `.claude/`, `.env`.
- Framework packages use exact versions (no `^`, no `~`): TanStack Start 1.169.x, Router 1.170.x, React 19.3.x, Vite 8.3.x, Tailwind 4.3.x, vitest 5.1.x, Nitro 3.x (whatever Start 1.169's Node hosting page installs). TypeScript: the version the official template pins, provided it satisfies typescript-eslint's `typescript` peer range; otherwise the newest version that does. Install Query, Virtual, zod and shadcn only when a story first uses them (not here).
- `.nvmrc` is `26`; `package.json` `engines.node` is `>=26`.
- Read version-matched official docs before writing framework code (AD-11). Record every doc URL used in this spec's Design Notes.
- `src/` follows the layer map: `src/routes`, `src/features/<feature>`, `src/state`, `src/lib`, `src/shared`, `src/server/functions`, `src/server/{qbit,sync,settings,auth,log}`, `src/start.ts` (created by Story 1.2, not here).
- UI copy is Traditional Chinese written directly in the code. `<html lang="zh-Hant-TW">`.
- No em dash characters anywhere. No IPs, usernames, passwords or tokens in any tracked file. The private category is only ever "X" or "mteam-X".
- Run `bash .claude/skills/next-story/check.sh` before every commit; commit only when every line says ok.

**Never:**
- No i18n, animation or gesture packages. No Cloudflare, wrangler or Workers code.
- No Dockerfile, image build, GHCR push or Dependabot config (Story 1.9).
- No login, session, server functions, `src/start.ts`, qBittorrent client, design tokens, shadcn setup or real UI (Stories 1.2 to 1.8).
- No `pull_request_target`; no workflow permission above `contents: read`; no third-party action referenced by tag instead of commit SHA.
- Never call the real qBittorrent from tests or CI.
- Do not edit `.env` or rename its variables.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Health check | `GET /healthz`, no cookie | `200`, body exactly `ok`, `content-type: text/plain` | Handler never touches qBittorrent, env vars or the filesystem |
| Only one server route | Any file under `src/routes` | Only `healthz` defines `server.handlers` | A vitest test fails if any other route file defines server handlers |
| Home page | `GET /` in dev | Temporary page with the heading 「種子」; nothing from the old UI | n/a |
| Layer violation | e.g. `src/lib/x.ts` imports from `src/state`, or `src/features/a` imports `src/features/b` | `npm run lint` reports an error | CI fails |
| Raw HTML | JSX `dangerouslySetInnerHTML`, assignment to `.innerHTML` / `.outerHTML`, `document.write(...)` | `npm run lint` reports an error | CI fails |
| Example pure-function test | `isTorrentHash('<40 or 64 lowercase hex>')` / uppercase / wrong length / non-hex | `true` / `false` / `false` / `false` | n/a |

</intent-contract>

## Code Map

- Scaffold command (non-interactive, verified with `--help` on 2026-11-16): `npx @tanstack/cli@0.72.16 create react-torrent --framework React --build-tool vite --package-manager npm --deployment nitro --toolchain eslint --no-examples --no-git --no-intent --non-interactive --target-dir <scratch dir>`. Generate in a scratch directory outside the repo, then copy the template files in. If a flag is rejected, adjust using `--help` and record what was used in Design Notes.
- Legacy files to delete (all tracked today): `src/` (91 old files), `index.html`, `vite.config.ts`, `vitest.config.ts`, `eslint.config.js`, `tsconfig.json`, `components.json`, `wrangler.jsonc`, `.cta.json`, `.github/workflows/release.yml`, `.github/workflows/test.yml`, `.auto-claude-status`, `.claude_settings.json`, `build-progress.txt`, `context.json`, `implementation_plan.json`, `project_index.json`, `init.sh`, `logs/` (3 files), `MANUAL-TESTING-GUIDE.md`, `TESTING-READY.md`, `VERIFICATION-RESULTS.md`, `verify-translations.cjs`, `docs/PERFORMANCE_TESTING.md`, `public/` images the template does not use, `prettier.config.js` and `.prettierignore` unless the template ships prettier, `.vscode/settings.json` unless the template ships one. Replace `package.json` and `package-lock.json` wholesale (the old lock is out of sync).
- `.gitignore` -- keep `node_modules`, `.DS_Store`, `dist`, `*.local`, `.env`, `.nitro`, `.tanstack`, `.output`, `coverage/`, and the existing `_bmad-output/planning-artifacts/ux-designs/*/imports/*.png` line with its comment; add `config/`; drop `.wrangler`, `.vinxi`, `.auto-claude/`, `count.txt`, `todos.json`.
- Architecture refs: layer map in the spine's design-pattern section (mermaid graph); conventions table; tech table; "Structure > Deployment" and "Legacy files" bullets; AD-5 (`/healthz`), AD-10 (raw HTML), AD-16 (workflow rules).

## Tasks & Acceptance

**Execution:**
- scratch dir -- run the scaffold command, read the generated `vite.config.ts`, `package.json`, `src/` and docs links it references -- template is the starting point, not memory.
- repo root -- delete every legacy file in the Code Map list; copy template files in -- AC "old files gone".
- `vite.config.ts` -- template config with `tanstackStart({ spa: { enabled: true } })`, the Nitro plugin per the Node hosting page, Tailwind plugin, React plugin -- SPA mode on Node output.
- `package.json` -- exact versions per Always; scripts `dev` (port 3000), `build`, `start` (`node .output/server/index.mjs` or whatever the hosting page says), `lint`, `typecheck` (`tsc --noEmit`), `test` (`vitest run`); `engines.node >=26`; remove packages the template adds that this story does not use (devtools, demo add-ons) -- AR-3.
- `.nvmrc` -- `26`.
- `src/routes/__root.tsx` -- template root, `lang="zh-Hant-TW"`, page title `react-torrent`, no demo nav or devtools.
- `src/routes/index.tsx` -- temporary page: `<h1>種子</h1>` only.
- `src/routes/healthz.ts` -- `createFileRoute('/healthz')` with `server.handlers.GET` returning `new Response('ok', { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } })`; imports nothing from `src/server`, env or fs -- AD-5.
- `src/routes/healthz.test.ts` -- call the GET handler with a `Request`, assert 200 and body `ok`; scan `src/routes/**` source and assert `healthz` is the only file defining server handlers.
- `src/lib/is-torrent-hash.ts` + `src/lib/is-torrent-hash.test.ts` -- `isTorrentHash(value: string): boolean`, true only for 40 or 64 lowercase hex characters; tests cover the matrix row -- example `src/lib` test, reused later for hash validation (AR-6).
- `vitest.config.ts` (or the vitest block the template uses) -- runs `src/**/*.test.ts(x)`; node environment is enough for now.
- `eslint.config.js` -- template flat config plus: `eslint-plugin-boundaries` element types for each layer encoding exactly the spine's allowed-import graph (anything not drawn is an error) and `src/features/*` never importing another feature; `no-restricted-syntax` (or an equivalent core rule) banning `dangerouslySetInnerHTML` JSX attributes, assignments to `innerHTML`/`outerHTML`, and `document.write`/`document.writeln` calls -- AR-5, AR-32. Pick an `eslint-plugin-boundaries` version compatible with the installed ESLint; if none is, use `eslint-plugin-import-x` `no-restricted-paths` and note it in Design Notes.
- `_bmad-output/implementation-artifacts/1-1-lint-proof.txt` -- create temporary violating files (one per boundary rule kind plus each raw-HTML ban), run `npm run lint`, save the trimmed output here, then delete the temporary files -- AC "PR shows lint blocking examples".
- `.github/workflows/ci.yml` -- `on: pull_request` to `main`; `permissions: contents: read`; one job on `ubuntu-latest`: checkout, setup-node with `node-version-file: .nvmrc` and npm cache, `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm audit --omit=dev --audit-level=high`, `npm run build`, in that order. Actions pinned by full commit SHA with the tag as a trailing comment (resolve SHAs with `gh api repos/<owner>/<repo>/git/ref/tags/<tag>`; set `GH_TOKEN=$(gh auth token --user j620656786206)` first) -- AR-11, AR-13.
- `CLAUDE.md` -- rewrite: what the project is (one sentence), pointers to the architecture spine, PRD, UX spec (`DESIGN.md`, `EXPERIENCE.md`), `epics.md`, `sprint-status.yaml` and `.claude/skills/next-story`; commands with Node 26 via `nvm use`; rules kept: repo is public so no credentials or IPs; private category only as X / mteam-X; AD-15 (no writes to real qBittorrent from tests or automation); AD-11 (version-matched docs) -- AR-2.
- `README.md` -- one short paragraph: what the new version is and how to run it locally (`nvm use`, `npm ci`, `npm run dev`, copy `.env.example`); no IP or credentials.
- `.env.example` -- exactly `QBIT_URL`, `QBIT_USERNAME`, `QBIT_PASSWORD`, `SESSION_SECRET`, `APP_ORIGINS`, `SAVE_ROOTS`, `CONFIG_DIR` with placeholder values (e.g. `QBIT_URL=http://qbittorrent.example:8080`).
- `.gitignore` -- per Code Map.

**Acceptance Criteria:**
- Given the scaffolded repo, when listing tracked files, then none of the legacy files in the Code Map remain and `DESIGN.md`, `LICENSE`, `_bmad/`, `_bmad-output/`, `.claude/` are unchanged apart from the files this story adds.
- Given `package.json`, when inspected, then every framework package has an exact version in the stated minor line, `.nvmrc` is `26`, and no i18n, animation or gesture package is present.
- Given `npm run dev` on port 3000, when opening `/`, then the page shows 「種子」 and nothing from the old UI; `curl -i localhost:3000/healthz` returns 200 with body `ok`.
- Given a PR, when CI runs, then lint, typecheck, vitest, audit and build run in that order and any failure turns the run red; the workflow has no `pull_request_target`, top-level `permissions: contents: read`, and every third-party action is pinned to a 40-character SHA.
- Given `CLAUDE.md`, `README.md`, `.env.example`, `.gitignore`, when read, then they match the Tasks above and contain no IP, username, password or token.

## Spec Change Log

### 2026-11-16: review pass 1
- Trigger: edge-case and blind reviewers found `.auto-claude/` and `.wrangler/` still on disk (one holds a `.env`) while the Code Map dropped their `.gitignore` entries; Alex works on two Macs, so `.git/info/exclude` is not enough.
- Amended: `.gitignore` keeps `.auto-claude/` and `.wrangler/` until both folders are deleted on both machines. Applied as a patch instead of a full re-derivation because the change is two lines and nothing else depends on it.
- Known-bad state avoided: a `git add -A` on the second Mac committing Auto Claude data, including a `.env`, to a public repo.
- KEEP: everything else in the implementation.

## Review Triage Log

### 2026-11-16: Review pass
- verdicts: 41 findings: high 0, medium 9, low 21, false 2, maybe-false 9
- findings:
  - `[medium]` `[patch]` Verification gap: boundary and raw-HTML rules only proven by a one-time hand-run file; a resolver regression silently disables them. Fix: `src/lint-rules.test.ts` with the ESLint Node API.
  - `[medium]` `[defer]` Verification gap: `/healthz` tested by calling the handler, never through the built server. Story 1.9 adds the image smoke test.
  - `[low]` `[patch]` Verification gap: "only healthz has server handlers" is a text grep. Fix: inspect each route's `Route.options.server`.
  - `[maybe-false]` `[reject]` Intent: deleted-file list, doc URLs and lint output belong in the PR description. Settled by /ship writing them into the PR body.
  - `[maybe-false]` `[reject]` Intent: Query, Virtual, zod, shadcn not installed (R2 reading). The story AC asks installed versions to match the table; the epics principle is "build when first needed".
  - `[maybe-false]` `[reject]` Intent: doc URLs point at `/latest/`. TanStack docs serve the current release (1.169.5) there; no version-pinned path exists.
  - `[false]` `[reject]` Intent: files added under `_bmad-output/` break "不動". The rule protects existing planning files; story artifacts must live there.
  - `[medium]` `[defer]` Intent: healthz proxy-tested only. Same as the verification-gap row; Story 1.9.
  - `[low]` `[patch]` Intent: single-server-route check is a text scan. Same fix as above.
  - `[medium]` `[patch]` Intent: lint proof never exercised same-layer edges, the `#/` alias feature edge, route to server. Covered by the new lint test.
  - `[medium]` `[patch]` Intent: `innerHTML` and `document.write` bans miss other forms. Selectors extended.
  - `[maybe-false]` `[reject]` Intent: TypeScript 6.0.3 and ESLint 10 vs template. typescript-eslint caps TypeScript below 6.1; ESLint 10 recorded as Claude 代決 in Design Notes.
  - `[false]` `[reject]` Intent: git index does not match the diff. The `A`/`DA` states came from the reviewer-diff step (`git add -N`); /ship stages everything before committing.
  - `[medium]` `[patch]` Edge: files outside the layer map bypass boundaries (verified). Fix: `root` element plus `boundaries/no-unknown-files`.
  - `[medium]` `[patch]` Edge: raw-HTML ban bypasses (string key, `window.document.write`, computed `['write']`, `insertAdjacentHTML`). Selectors extended.
  - `[low]` `[patch]` Edge: healthz text-grep false red and false green. Same fix as above.
  - `[maybe-false]` `[reject]` Edge: `POST /healthz` returns the SPA shell with 200. Not in any AC; Story 1.2's gate owns method handling. Settle by curling the built server in 1.9.
  - `[low]` `[reject]` Edge: `isTorrentHash` coerces non-strings. Typed `string` parameter; every caller is TypeScript.
  - `[low]` `[reject]` Edge: no `engine-strict`. CI and `.nvmrc` pin Node 26; an install warning is enough.
  - `[low]` `[patch]` Edge: CI has no `timeout-minutes`. Added 15.
  - `[low]` `[patch]` Edge: `.auto-claude/` and `.wrangler` dropped from `.gitignore`. Restored (see Spec Change Log).
  - `[medium]` `[patch]` Edge (claim): "anything not drawn is an error" is untrue for unmapped paths. Same fix as the layer-map row.
  - `[low]` `[patch]` Edge (claim): `document.write` ban misses forms. Same fix as the raw-HTML row.
  - `[low]` `[patch]` Blind: files outside the layer map, shadcn's `src/components/ui` would bypass. Same fix as the layer-map row; Story 1.3 maps the shadcn folder.
  - `[low]` `[patch]` Blind: lint proof skips route to server and the `Property` selector. Covered by the new lint test.
  - `[low]` `[patch]` Blind: boundary rules can break on plugin upgrade. Covered by the new lint test.
  - `[low]` `[patch]` Blind: raw-HTML bypasses including `createContextualFragment`, `setHTMLUnsafe`. Selectors extended.
  - `[low]` `[reject]` Blind: JSX `srcDoc` not banned. Not one of the four APIs AD-10 names; no story renders iframes.
  - `[medium]` `[patch]` Blind: `CLAUDE.md` says not to rename `.env` variables while the local file uses `VITE_` credential names. Rewritten.
  - `[maybe-false]` `[defer]` Blind: `.env.example` has no format notes for `APP_ORIGINS`, `SAVE_ROOTS`, `SESSION_SECRET`. Story 1.2 defines env parsing and the weak-secret check; document formats there.
  - `[low]` `[patch]` Blind: healthz text grep and `as unknown as` cast. Text grep replaced; cast left if the router types need it.
  - `[low]` `[patch]` Blind: nothing checks the committed `routeTree.gen.ts` is current. CI step `git diff --exit-code` after build.
  - `[maybe-false]` `[reject]` Blind: `tsr.config.json` duplicates generator settings. Shipped by the template; only matters if someone runs the Router CLI by hand.
  - `[low]` `[reject]` Blind: `eslint.config.js` is not linted or type-checked. Config file; any break shows up as lint failing to start.
  - `[low]` `[reject]` Blind: formatting drift, no `prettier --check` in CI. Not in the AC; cosmetic.
  - `[low]` `[patch]` Blind: six lint rules disabled with no reason, `import/no-cycle` off. Reasons added; `import/no-cycle` re-enabled if lint stays green.
  - `[low]` `[patch]` Blind: `CLAUDE.md` lost the per-command nvm prefix and the `nvm install 26` hint. Rewritten.
  - `[maybe-false]` `[defer]` Blind: no Chinese not-found page; TanStack shows English "Not Found". A new screen is a design decision; raise with Alex, not built here.
  - `[low]` `[reject]` Blind: favicon removed with no replacement. Cosmetic; belongs with the brand assets in Story 1.3.
  - `[low]` `[patch]` Blind: dead `#app` CSS. Deleted.
  - `[maybe-false]` `[reject]` Blind: CI lacks `concurrency` and `push: main`. `concurrency` added with the timeout (trivial); `push: main` is Story 1.9's image job.

## Design Notes

- Why Nitro now: the tech table names Nitro 3 as Start's Node output; adding it here makes `npm run build` produce the production shape that Story 1.9 wraps in an image.
- Why `isTorrentHash` as the example test: AR-55 asks for at least one runnable `src/lib` test, and hash validation (lowercase 40 or 64 hex) is needed by Story 2.6 onward, so the example is not throwaway code.
- Docs already checked during planning (2026-11-16): quick start `https://tanstack.com/start/latest/docs/framework/react/quick-start`; SPA mode `https://tanstack.com/start/latest/docs/framework/react/guide/spa-mode`; server routes `https://tanstack.com/start/latest/docs/framework/react/guide/server-routes`; middleware and `src/start.ts` `https://tanstack.com/start/latest/docs/framework/react/guide/middleware`; Node hosting with Nitro `https://tanstack.com/start/latest/docs/framework/react/guide/hosting`. Add any further URLs used during implementation.
- `src/start.ts` must not be created here: per the middleware docs, once it exists Start stops adding CSRF middleware automatically, and Story 1.2 owns that file.
- Docs re-read during implementation (2026-11-16): hosting `https://tanstack.com/start/latest/docs/framework/react/guide/hosting` (Nitro plugin order `tanstackStart(), nitro(), viteReact()`, `start` = `node .output/server/index.mjs`, `npm install nitro` with no pinned version); SPA mode `https://tanstack.com/start/latest/docs/framework/react/guide/spa-mode`; server routes `https://tanstack.com/start/latest/docs/framework/react/guide/server-routes`; router file options `https://tanstack.com/router/latest/docs/api/file-based-routing` (`routeFileIgnorePattern`); boundaries `https://www.jsboundaries.dev/docs/quick-start/`, `https://www.jsboundaries.dev/docs/guides/typescript-support/`, `https://www.jsboundaries.dev/docs/setup/selectors/`, `https://www.jsboundaries.dev/docs/setup/elements/`, `https://www.jsboundaries.dev/docs/rules/dependencies/`.
- Scaffold: the Code Map command ran unchanged with `@tanstack/cli@0.72.16` on Node 26.13.1. The template ships prettier and `.vscode/settings.json`, so both stay (prettier config kept as the old file because it is the same config, already prettier-formatted); `.prettierignore` also skips `_bmad/`, `_bmad-output/`, `.claude/`, `DESIGN.md` and `src/routeTree.gen.ts` so `npm run format` cannot touch planning files. The template ships no `public/`, so the whole old `public/` (logos, `manifest.json`, `robots.txt`) was removed (Claude 代決: the manifest pointed only at the deleted logos).
- Versions installed: Start 1.169.5, Router 1.170.46, React 19.3.1, Vite 8.3.8, Tailwind 4.3.5, vitest 5.1.0. Nitro 3.0.261103-rc: the template pins 3.0.260610-beta, but the hosting page says plain `npm install nitro`, which resolves to 3.0.261103-rc today. TypeScript 6.0.3: the template's `^6.0.2` resolves to it and typescript-eslint 8.72.2 accepts `>=4.8.4 <6.1.0` (7.x would not). ESLint 10.15.0 instead of the template's 9.x (Claude 代決): 9.39.5 prints a deprecation warning and `@eslint/js` 10 inside `@tanstack/eslint-config` wants ESLint 10; `@tanstack/eslint-config` and boundaries accept 10. `@types/node` 26.6.6 to match Node 26. Devtools packages and the template's Sentry `external` option for Nitro were removed. Every direct dependency is pinned exactly, not only framework packages.
- Boundaries: `eslint-plugin-boundaries` 7.4.3 with `eslint-import-resolver-typescript` 4.4.5 for the `#/` alias. The spine draws routes and features as one node; the config allows route -> feature but not feature -> route (Claude 代決: a feature has no reason to import a route file). `src/server/*` modules may import each other because the spine draws them as one node. `server/functions` is listed before `server/*` because the first matching descriptor wins. Top-level `src/*.{ts,tsx}` files (`router.tsx`, later `start.ts`) are the `root` file category: they may import any layer, no layer may import them. `src/**/*.css` is the `style` category so `styles.css?url` stays allowed. `src/routeTree.gen.ts` is ignored. `boundaries/no-unknown-files` and `boundaries/no-unknown-dependencies` (the v7 name of `no-unknown`) are errors, so any unmapped path fails lint. `src/lint-rules.test.ts` runs the ESLint Node API on throwaway files and fails if a boundary or raw-HTML rule stops firing (checked: removing the `import/resolver` block turns 7 of its tests red). Proof in `1-1-lint-proof.txt`.
- Raw-HTML bans (AD-10) also cover quoted object keys, computed `['write']` / `['innerHTML']`, chains ending in `.document.write`, and calls to `insertAdjacentHTML`, `createContextualFragment` and `setHTMLUnsafe`.
- ESLint rule overrides: `import/no-cycle` is now on as an error (the template turned off a rule `@tanstack/eslint-config` does not enable anyway; the current tree passes). `import/order`, `sort-imports`, `@typescript-eslint/array-type` and `@typescript-eslint/require-await` stay off with a reason in the config. `pnpm/json-enforce-catalog` was removed: no pnpm plugin is loaded and the repo uses npm.
- Route tests live next to routes, so `tanstackStart({ router: { routeFileIgnorePattern: '\\.test\\.tsx?$' } })` keeps them out of the route tree (the generator warned otherwise). `src/routeTree.gen.ts` is tracked because `typecheck` runs before `build` in CI.
- `.auto-claude/` and `.wrangler/` stay in `.gitignore` (review change to the Code Map): both folders still exist locally, `.auto-claude/` holds a `.env`, and Alex works on two Macs, so a local `.git/info/exclude` is not enough. Remove the lines once both machines have deleted the folders.
- CI: job `timeout-minutes: 15`, a `concurrency` group per PR ref with `cancel-in-progress`, and a last step `git diff --exit-code src/routeTree.gen.ts` so a stale committed route tree fails.
- `src/routes/healthz.test.ts` imports every route module (via `import.meta.glob`, skipping tests and `-` files) and checks `Route.options.server?.handlers`, instead of grepping source text.

## Verification

**Commands:** (prefix each with `source ~/.nvm/nvm.sh && nvm use &&`; run `nvm install 26` first if needed)
- `node --version` -- expected: v26.x
- `npm ci` -- expected: succeeds with the committed lock file
- `npm run lint` -- expected: 0 errors
- `npm run typecheck` -- expected: 0 errors
- `npm test` -- expected: all tests pass, including healthz and isTorrentHash
- `npm audit --omit=dev --audit-level=high` -- expected: exit 0
- `npm run build` -- expected: succeeds
- `npm run dev` in the background, then `curl -s -o /dev/null -w '%{http_code}' localhost:3000/healthz` and `curl -s localhost:3000/healthz` -- expected: `200` and `ok`; stop the dev server afterwards
- `git ls-files | grep -E '^(wrangler.jsonc|init.sh|implementation_plan.json|verify-translations.cjs|index.html)$'` -- expected: no output
- `bash .claude/skills/next-story/check.sh` -- expected: every line ok

## Auto Run Result

- **Summary:** replaced the old Vite + Cloudflare app with the official TanStack Start template (SPA mode, Nitro Node output, Node 26), deleted 114 legacy files, pinned the stack to exact versions, encoded the spine's layer map and the AD-10 raw-HTML bans in ESLint with an automated test, added `GET /healthz` as the only server route, and replaced the old CI with one PR workflow.
- **Files changed:**
  - `package.json`, `package-lock.json`, `.nvmrc`: exact versions, Node 26, scripts.
  - `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `tsr.config.json`: template config with SPA mode and Nitro.
  - `eslint.config.js`: boundaries layer map, root and style categories, unknown files and dependencies as errors, raw-HTML bans, rule overrides with reasons.
  - `src/routes/__root.tsx`, `src/routes/index.tsx`, `src/router.tsx`, `src/styles.css`, `src/routeTree.gen.ts`: template shell, temporary 「種子」 page.
  - `src/routes/healthz.ts` and test: `/healthz` and the single-server-route check.
  - `src/lib/is-torrent-hash.ts` and test: example `src/lib` function.
  - `src/lint-rules.test.ts`: ESLint Node API test for every boundary and raw-HTML rule.
  - `.github/workflows/ci.yml`: lint, typecheck, test, audit, build, route-tree freshness; SHA-pinned actions; timeout and concurrency.
  - `CLAUDE.md`, `README.md`, `.env.example`, `.gitignore`, `.prettierignore`: rewritten for the new architecture.
  - `_bmad-output/implementation-artifacts/1-1-lint-proof.txt`, `epic-1-context.md`, this spec.
- **Review findings:** 41 findings. 13 patched (9 medium, the rest low), 3 deferred (built-server healthz smoke test to Story 1.9; `.env.example` format notes to Story 1.2; Chinese not-found page needs Alex), 25 rejected with reasons in the Review Triage Log.
- **Follow-up review recommended:** false. 9 medium entries were patched, but each patch is covered by a test that was shown to fail on regression (lint test went red with the resolver removed; healthz test caught a temporary second server route), so no unverified risk can be named.
- **Verification (Node v26.13.1):** `npm ci` ok; `npm run lint` exit 0; `npm run typecheck` exit 0; `npm test` 3 files, 29 tests passed; `npm audit --omit=dev --audit-level=high` 0 vulnerabilities; `npm run build` ok; dev server `/healthz` 200 `ok`, `/` has `lang="zh-Hant-TW"`; legacy file check empty; `check.sh` all ok.
- **Residual risks:** Nitro is a release candidate (3.0.261103-rc); `/healthz` on the built server is not exercised in CI until Story 1.9; ESLint 10 instead of the template's 9.x (Claude 代決).
