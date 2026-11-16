---
title: 'Story 1.9: Image, CI push and NAS deployment template'
type: 'feature'
created: '2026-11-16'
status: 'done'
baseline_revision: 'c5ad088003359e608ae5548b2545781237b92638'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-react-torrent-2026-11-15/ARCHITECTURE-SPINE.md'
warnings: ['oversized']
deferred:
  - summary: >-
      image.yml (checks, sha push, guarded latest push, GHCR login) and GitHub's acceptance of dependabot.yml run for the first time on main.
    evidence: |-
      Cannot run before merge; failure is loud (red Image run on main, Dependabot config error in the repo Insights). Check the first run after merging this story.
    location: >-
      .github/workflows/image.yml
    severity: medium (unverified)
  - summary: >-
      CI cannot prove a regressed .dockerignore keeps .env out of the local build stage.
    evidence: |-
      The pushed image copies only .output, which the smoke verifies; add a sentinel build-stage check if the Dockerfile changes shape.
    location: >-
      .dockerignore
    severity: low
  - summary: >-
      NAS acceptance: the post-deploy checklist in docs/deployment.md (home http login and list, phone via Tunnel with Secure cookie, Access expiry response form, compression through the Tunnel, phone touch-freeze timing, hardening flags via docker inspect).
    evidence: |-
      Alex runs it on the NAS; this is Epic 1's acceptance. Any mismatch goes back into the architecture spine.
    location: >-
      docs/deployment.md
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Epic 1's app only runs as `.output` on a dev machine. Alex cannot put it on the Unraid NAS: there is no image, no GHCR push, no Unraid template, no deployment guide, and nothing checks the built server inside a hardened container.

**Approach:** Add a multi-stage Dockerfile (Node 26 pinned by digest, runtime stage holds only `.output`), a `.dockerignore`, an image smoke script that CI runs on every PR after the existing checks and on main before pushing `latest` plus the commit sha to GHCR, a Dependabot config, an Unraid template, a static vitest that guards all of these files, and a Traditional Chinese deployment guide with the post-deploy checklist that is Epic 1's acceptance.

## Boundaries & Constraints

**Always:**
- Base image for both stages: `node:26.13.1-trixie-slim@sha256:e6bedef217677b276c591795e169840edd9096dbf13f29df8ef8d1856b8820bc` (multi-arch index digest; same as `26-slim` on 2026-11-16).
- Runtime stage: `.output` only (Nitro already traces production deps into `.output/server/node_modules`), owned by root, `USER 99:100`, `/config` created and owned by `99:100`, `EXPOSE 3000`, exec-form `CMD ["node", "/app/.output/server/index.mjs"]`, `HEALTHCHECK` with `node` (the image has no curl or wget).
- `COMMIT_SHA` reaches the build only as a build arg; `vite.config.ts` already reads `process.env.COMMIT_SHA` (no change there). The startup log line `{"event":"startup",...,"commit":"<sha>"}` proves it.
- Image smoke uses only fake values: `QBIT_URL=http://127.0.0.1:1`, fake username, a random password, `SESSION_SECRET` generated at run time (32 random bytes, base64), `APP_ORIGINS=http://127.0.0.1:<port>`, `SAVE_ROOTS=/downloads`. Values go to `docker run` through the child process env (`-e NAME` without `=value`), never on the command line.
- Every container the smoke starts uses `--read-only --tmpfs /tmp --cap-drop=ALL --security-opt=no-new-privileges` plus a writable `/config` (a fresh named volume, which Docker seeds with the image's `99:100` ownership).
- Workflows: top-level `permissions: contents: read`; `packages: write` only on the push job in `image.yml`; no `pull_request_target`; every `uses:` pinned to a 40-character SHA with the tag as a trailing comment.
- Push only from `push` to `main`, `--platform linux/amd64`, tags `ghcr.io/<owner lowercase>/react-torrent:latest` and `:<full 40-char github.sha>`, only after the image smoke passed on that exact image.
- Docs for Alex (`docs/deployment.md`) in Traditional Chinese (Taiwan usage), short sentences. No em dash anywhere. No IP except loopback `127.0.0.1` in the smoke script; no credentials; domains only as placeholders such as `torrent.example.com` and `qbittorrent.example`; the private category only as X / mteam-X.
- Run `bash .claude/skills/next-story/check.sh` before every commit.

**Never:**
- Never push an image or log in to GHCR from a PR or from a local machine. Local `docker build` and `docker run` are for verification only.
- Never contact the real qBittorrent or read `.env` values (AD-15, AD-3).
- No Cloudflare, Unraid or GitHub settings changes: those are Alex's manual steps, documented only.
- No `TSS_*` variable in the Dockerfile or template (Story 1.2 deferred item: `TSS_PRERENDERING` would disable the Host gate).
- No `VOLUME` instruction, no `--privileged`, `--network=host`, Docker socket, extra mounts, `--cap-add` or `--device` anywhere in the template.
- No app-level response compression in this story (see Design Notes).
- No change to app code under `src/` except the new test file.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| I1 Valid boot | Image run with full fake env, hardened flags, named volume on `/config`, `-p 127.0.0.1:<free port>:3000` | Docker health becomes `healthy` within 60 s; `GET /healthz` is `200` body `ok`; `GET /` is `200` with `content-type` text/html | Smoke fails and prints `docker logs` if the container exits or never turns healthy. Verify: `scripts/smoke-image.mjs` |
| I2 Missing env | Same flags, `SESSION_SECRET` absent | Container stops by itself within 20 s with a non-zero exit code; logs have a `startup_env_invalid` line naming `SESSION_SECRET`; no `Listening` line | Smoke kills it after 20 s and fails. Verify: `scripts/smoke-image.mjs` |
| I3 Hardening | I1 container running | `docker exec ... id -u` prints `99`; writing a file under `/app` fails; writing and deleting `/config/.smoke-probe` succeeds; image config `User` is `99:100` | Verify: `scripts/smoke-image.mjs` |
| I4 Commit sha | Build with `--build-arg COMMIT_SHA=<sha>` | Exactly one log line with `"event":"startup"` whose `commit` equals `<sha>` | Verify: `scripts/smoke-image.mjs` (second arg) |
| I5 Secrets stay out | Repo has a local `.env` and `.auto-claude/.env` | Exported image filesystem has no entry named `.env` or `.env.*`; `/app` holds only `.output`; logs never contain the fake password or secret | Verify: `scripts/smoke-image.mjs` (`docker export` listing) |
| I6 PR vs main | PR to main / push to main | PR: build and smoke, never push, no `packages` permission. Main: build, smoke, then push both tags | Verify: `src/deploy-files.test.ts` |
| I7 Template vs code | `deploy/unraid/react-torrent.xml` | Variable `Target`s equal `REQUIRED_ENV` from `src/server/env`; masks exactly on `QBIT_PASSWORD` and `SESSION_SECRET` | Verify: `src/deploy-files.test.ts` |

</intent-contract>

## Code Map

- `.github/workflows/ci.yml` -- PR workflow from 1.1: public-repo check, lint, typecheck, test, audit, build, `npm run smoke`, route-tree diff. The image steps append here.
- `scripts/smoke-built-server.mjs` -- reference for style (no deps, `check()` list, `freePort()`, fake env, exit codes). Covers server behavior on `.output`; the image smoke covers container behavior only.
- `vite.config.ts` -- `commitSha()` takes `COMMIT_SHA` (7 to 40 lowercase hex) else git else `unknown`.
- `src/server/env/index.ts` -- `REQUIRED_ENV`, `DEFAULT_CONFIG_DIR='/config'`, `runStartupCheck` logs `startup` with `version` and `commit`, or `startup_env_invalid` and exits 1.
- `src/server/env/startup-plugin.ts` -- reads `TSS_PRERENDERING` (must never be set at runtime).
- `src/server/log/index.ts` -- `formatLine` writes JSON lines `{time, level, event, ...fields}`.
- `src/lib/app-error.ts` -- `classifyResponse` already maps 401, any redirect and HTML-in-200/403 to `cloudflare_expired`; the checklist records which one real Access sends.
- `src/lint-rules.test.ts` -- precedent for a root-category test in `src/` that reads files with Node APIs.
- `.output/server/index.mjs` (built) -- Nitro reads `NITRO_PORT`/`PORT` (default 3000) and `NITRO_HOST`/`HOST`; srvx handles SIGTERM.
- `.env.example`, `README.md`, `CLAUDE.md` -- variable docs and pointers.

## Tasks & Acceptance

**Execution:**
- `.dockerignore` -- list `**/.env*`, `!.env.example`, `.git`, `**/node_modules`, `_bmad-output`, `_bmad`, `.claude`, `config`, `.output`, `.nitro`, `.tanstack`, `coverage`, `.auto-claude`, `.wrangler`, `**/.DS_Store` -- AR-9; `**/` because a bare `.env*` only matches the context root and `.auto-claude/` holds a `.env`.
- `Dockerfile` -- two stages per the golden example in Design Notes: build (`npm ci` from `package.json` + `package-lock.json` first, then the rest, then `COMMIT_SHA=$COMMIT_SHA npm run build`), runtime (`NODE_ENV=production`, `/config` owned `99:100`, copy `/app/.output` only, OCI labels `org.opencontainers.image.source` and `org.opencontainers.image.revision`, `USER 99:100`, `HEALTHCHECK`, `CMD`) -- AR-8.
- `scripts/smoke-image.mjs` -- `node scripts/smoke-image.mjs <image> <commit-sha>`; Node built-ins only; drives the Docker CLI with `spawn` (no shell); implements matrix rows I1 to I5 in that order; always removes its containers and volume in `finally`; prints `smoke-image: ok` or each failure and exits 1; header comment states it never talks to a real qBittorrent and never reads `.env` -- AR-11 image half.
- `.github/workflows/ci.yml` -- after the route-tree diff step add: `node --check scripts/smoke-image.mjs`; `docker build --platform linux/amd64 --build-arg COMMIT_SHA=${{ github.event.pull_request.head.sha }} -t react-torrent:ci .`; `node scripts/smoke-image.mjs react-torrent:ci ${{ github.event.pull_request.head.sha }}`. Raise `timeout-minutes` to 25. No new permissions, no new actions -- AR-11.
- `.github/workflows/image.yml` -- `on: push: branches: [main]`; top-level `permissions: contents: read`; `concurrency: { group: image-main, cancel-in-progress: false }`; one job `push` with `permissions: { contents: read, packages: write }`, `timeout-minutes: 25`: checkout (pinned like ci.yml, `persist-credentials: false`), setup-node (pinned like ci.yml, `node-version-file: .nvmrc`), compute `IMAGE=ghcr.io/${GITHUB_REPOSITORY_OWNER,,}/react-torrent` into `$GITHUB_ENV`, `docker build --platform linux/amd64 --build-arg COMMIT_SHA=$GITHUB_SHA -t $IMAGE:$GITHUB_SHA -t $IMAGE:latest .`, smoke on `$IMAGE:$GITHUB_SHA`, `docker/login-action@8aa5831fb8d48d8f76594c7ddde61ae58019f550 # v4.8.0` (`registry: ghcr.io`, `username: ${{ github.actor }}`, `password: ${{ secrets.GITHUB_TOKEN }}`), `docker push $IMAGE:$GITHUB_SHA` then `docker push $IMAGE:latest` -- AR-12, AR-13.
- `.github/dependabot.yml` -- per the golden example: npm monthly with groups `production-dependencies` (`dependency-type: production`) and `development-dependencies` (`dependency-type: development`), both `patterns: ['*']`; `github-actions` and `docker` (directory `/`) joined in one multi-ecosystem group `ci-and-image` with a monthly schedule and `patterns: ['*']`; no `target-branch`, no `pull-request-branch-name` -- AR-14, AR-15 (branches stay `dependabot/...`, never `story/`).
- `deploy/unraid/react-torrent.xml` -- `<Container version="2">`: `Name` react-torrent, `Repository` `ghcr.io/<owner lowercase>/react-torrent:latest` (owner from `git remote get-url origin`), `Registry` the GitHub package page, `Network` bridge, `Privileged` false, `Shell` sh, `Support`/`Project` the GitHub repo, short `Overview`, `Category` Downloaders:, `WebUI` `http://[IP]:[PORT:3000]/`, empty `TemplateURL` and `Icon`, `ExtraParams` exactly `--cap-drop=ALL --security-opt=no-new-privileges --read-only --tmpfs /tmp`; Config entries: one `Type="Port"` (Target 3000, Default 3000, Mode tcp), one `Type="Path"` (Target `/config`, Default `/mnt/user/appdata/react-torrent`, Mode rw), six `Type="Variable"` for `REQUIRED_ENV` with empty `Default`, `Required="true"`, `Display="always"`, descriptions with placeholder examples only, `Mask="true"` on `QBIT_PASSWORD` and `SESSION_SECRET` only -- AR-16.
- `src/deploy-files.test.ts` -- static checks with `node:fs` and regexes (no new deps), one `it` per bullet: (a) every Dockerfile `FROM` is `node:<x.y.z>-<variant>@sha256:<64 hex>`; it has `npm ci`, `USER 99:100`, a `HEALTHCHECK` using `node` and `/healthz`, `ARG COMMIT_SHA`; the last stage copies only `.output`; no `TSS_` and no `VOLUME`. (b) `.dockerignore` has every entry from its task. (c) every workflow has top-level `permissions:` with only `contents: read`, no `pull_request_target`, every `uses:` matches `@[0-9a-f]{40} # v`; `packages: write` appears once, inside `image.yml`, which triggers only on push to `main`; `ci.yml` has no `packages` and no `docker push`/`login`. (d) dependabot has the three groups, `interval: monthly` for npm and the multi-ecosystem group, no `target-branch`, no `pull-request-branch-name`. (e) template: rows I7 plus exactly one Port and one Path (Target `/config`), `Privileged` false, `Network` bridge, `ExtraParams` exact string, no `docker.sock`, `--privileged`, `--network`, `--net=`, `-v `, `--mount`, `--device`, `--cap-add`, `TSS_`, and no IPv4 literal -- guards AR-8, AR-9, AR-13, AR-14, AR-16 and the 1.2 `TSS_PRERENDERING` item.
- `docs/deployment.md` -- Traditional Chinese guide, sections in this order: (1) 一次性的 GitHub 設定: main 分支保護 (要 CI 的 `check` 通過、禁止 force push), 開 Dependabot alerts 和 security updates (Settings > Code security; today both are off), 說明自動流程只合併 `story/` 分支，Dependabot 的 `dependabot/` PR 要 Alex 自己看 (AR-15). (2) 第一次推映像後把 GHCR 套件設成公開，確認套件連到這個 repo. (3) Unraid: 建 `/mnt/user/appdata/react-torrent` 並 `chown 99:100`; 把範本放進 `/boot/config/plugins/dockerMan/templates-user/`; 新增容器選這個範本; 每個變數怎麼填，`SESSION_SECRET` 用 `openssl rand -base64 32`, `APP_ORIGINS` 列出在家網址 (`http://<NAS 位址>:<範本的 port>`) 和 Tunnel 網址 (`https://torrent.example.com`)，逗號分隔、不加結尾斜線、port 要和範本的 port 一樣, `SAVE_ROOTS` 是 qBittorrent 容器裡看到的下載根目錄 (例如 `/downloads`)，多個用逗號; 不要加範本以外的變數 (特別是 `TSS_` 開頭的)、資料夾或參數. (4) Cloudflare: 新網址在 Tunnel 指到容器並加 Access; 舊 qBittorrent 網址加 Access; 確認 qBittorrent「執行外部程式」是空的; 確認 qBittorrent 容器只掛下載資料夾和自己的 appdata，appdata 加進備份. (5) 更新: Unraid Docker 頁按檢查更新再套用. (6) 退回: 編輯容器，把 Repository 的 `:latest` 換成上一個 commit sha (GitHub 的 commit 列表或套件頁)，套用; 修好後改回 `latest`. (7) 上線後實測清單 (checkbox), each item says what to look at and what to do if it differs: 在家走 http 登入、看到列表和頁首速度; Unraid 顯示 healthy，log 的 `startup` 行 commit 和 GitHub main 最新 commit 一樣; 手機經 Tunnel 先過 Access 再登入、看到列表; 在電腦用 Tunnel 網址開，開發者工具 Cookies 裡 `rt_session` 有 Secure (AR-59, Story 1.2); Access 過期: 刪掉 Tunnel 網域的 `CF_Authorization` cookie (或在 Zero Trust 撤銷 session)，等 5 秒或按重試，Network 記下 server function 回的是 401、轉址或 200 的 HTML，畫面要出「Cloudflare 登入過期了」(AR-60, Story 1.7); 壓縮: Tunnel 網址下 `getMaindata` 的 `/_serverFn/` 回應有 `content-encoding` (zstd、br 或 gzip) (Story 1.6); 手機用手指捲列表時列不換位置，放手約 0.3 秒後才更新 (Story 1.8); 結果和預期不同時，回去改架構底稿 (`ARCHITECTURE-SPINE.md` 的 AD-2 或「先不決定」那一列)，下次開 session 告訴 Claude. End with: Epic 1 的驗收就是 Alex 照這份清單在 NAS 上打開、登入、看到列表.
- `README.md` -- add one sentence: deployment on Unraid is in `docs/deployment.md`; images come only from CI.
- `CLAUDE.md` -- add under commands: local image check `docker build -t react-torrent:local --build-arg COMMIT_SHA=$(git rev-parse HEAD) .` then `node scripts/smoke-image.mjs react-torrent:local $(git rev-parse HEAD)`; never push or log in to GHCR locally; point to `docs/deployment.md`.

**Acceptance Criteria:**
- Given the Dockerfile, when `docker build` runs, then both stages use the pinned digest, the runtime image's `/app` holds only `.output`, its user is `99:100`, and its health check runs `node` against `/healthz` (I1, I3, I5 via the image smoke; static shape via `src/deploy-files.test.ts`).
- Given a PR, when CI runs, then the 1.1 checks and `npm run smoke` run first, then the image is built for amd64 and `scripts/smoke-image.mjs` passes, and no step pushes or logs in to a registry.
- Given a push to main, when `image.yml` runs, then the image is built, the same smoke passes on that image, and only then `latest` and the full commit sha tag are pushed to GHCR from the only job holding `packages: write`.
- Given `.github/dependabot.yml`, when GitHub parses it, then there are three monthly version-update PR groups (production npm, development npm, Actions plus base image) and security updates stay ungrouped; Dependabot branches start with `dependabot/`.
- Given the Unraid template, when Alex creates the container from it, then it has one port, only `/config`, the six required variables with two masked, the exact hardening ExtraParams, and no IP, credential, real domain or `TSS_` variable.
- Given `docs/deployment.md`, when Alex follows it, then every manual step from the story and the spine's "Alex 自己做" list appears in order, `APP_ORIGINS` and `SAVE_ROOTS` are explained, update and rollback are described, and the checklist covers AR-59, AR-60 and the carried 1.6 and 1.8 items with what to do on a mismatch.

## Spec Change Log

### 2026-11-16: implementation
- Trigger: inside the Debian image `localhost` resolves to IPv6 first, so the SPA prerender could not reach its preview server; `npm run build` still exited 0 but `_shell.html` was missing.
- Amended: the build `RUN` sets `NODE_OPTIONS=--dns-result-order=ipv4first`; the image smoke now checks `_shell.html` exists.
- KEEP: two-stage build, runtime holds only `.output`.

## Review Triage Log

### 2026-11-16: Review pass
- verdicts: 36 findings: high 0, medium 4, low 32, false 0, maybe-false 0
- findings:
  - `[low]` `[reject]` Intent: final layer holds only .output. Nitro bundles production dependencies into .output; recorded as Claude 代決.
  - `[low]` `[patch]` Intent: missing-env check covers only SESSION_SECRET. all six required variables checked.
  - `[low]` `[reject]` Intent: template names the public GitHub account in the image and repo URLs. a public account name, not a credential, IP or home domain; needed for the image path.
  - `[low]` `[reject]` Intent: Docker base image folded into the Actions Dependabot group. keeps the three monthly groups AR-14 asks for while updating the pinned digest.
  - `[low]` `[reject]` Intent: security updates moved to a repo setting. GitHub only offers them as a repository setting; documented as a manual step.
  - `[low]` `[reject]` Intent: doc order differs from the story's manual list. a working sequence that covers every step.
  - `[low]` `[reject]` Intent: AR-60 framed as measure and report. AR-60 is marked undecided; the checklist records the observed form.
  - `[medium]` `[patch]` Blind: PR image tagged with head sha but built from the merge commit. github.sha.
  - `[medium]` `[patch]` Blind: image.yml can push latest from an untested squash commit. full checks in image.yml; up-to-date branch rule in the doc.
  - `[medium]` `[patch]` Blind: I3 cannot tell whether /app is root-owned. ownership check.
  - `[low]` `[patch]` Blind: no check that the SPA shell was prerendered. _shell.html check in the image.
  - `[low]` `[patch]` Blind: QBIT_URL guidance does not fit the bridge network. doc updated with placeholders; reached-qBittorrent checklist step.
  - `[low]` `[patch]` Blind: no post-deploy check of the hardening flags. docker inspect step.
  - `[low]` `[patch]` Blind: Dockerfile Node major can drift from .nvmrc. test.
  - `[low]` `[patch]` Blind: Dependabot groups mix majors with minor and patch. update-types split.
  - `[low]` `[patch]` Blind: local command builds arm64. --platform linux/amd64.
  - `[low]` `[patch]` Blind: smoke-image has no timeouts. fetch and docker timeouts.
  - `[low]` `[patch]` Blind: runtime ships npm, npx, corepack. removed.
  - `[low]` `[reject]` Blind: tmpfs has no size or noexec options. the AC fixes the Extra Parameters string; revisit with the architecture if needed.
  - `[low]` `[patch]` Blind: no GHCR retention plan. doc note.
  - `[low]` `[patch]` Blind: no guidance for template updates. doc note.
  - `[medium]` `[patch]` VG: I3 ownership unverified. same fix as the Blind row.
  - `[low]` `[defer]` VG: I5 cannot fail in CI; local build stage could cache a .env if the ignore rule regressed. the pushed image is protected by the single COPY, which is verified; a sentinel build-stage check can be added later.
  - `[low]` `[defer]` VG: image.yml push path never runs before merge. only testable by a real push; failure is loud (red run, commit-sha checklist item).
  - `[low]` `[patch]` Edge: health check ignores NITRO_PORT. included.
  - `[low]` `[patch]` Edge: fetch can hang the smoke. timeouts.
  - `[low]` `[patch]` Edge: failed docker exec passes I3. stderr check.
  - `[low]` `[patch]` Edge: same ownership regression. same fix.
  - `[low]` `[patch]` Edge: freed port race. retry once.
  - `[low]` `[reject]` Edge: GNU base-256 tar sizes. no entry in this image approaches 8 GiB.
  - `[low]` `[patch]` Edge: PR merge ref vs head sha. same fix as the Blind row.
  - `[low]` `[patch]` Edge: queued middle run cancelled leaves a sha without an image. rollback uses GHCR tags only.
  - `[low]` `[patch]` Edge: re-running an old run moves latest back. origin/main guard.
  - `[low]` `[patch]` Edge: rollback doc points at the commit list. GHCR tag list.
  - `[low]` `[patch]` Edge: Tunnel target port fixed at 3000 in the doc. template host port.
  - `[low]` `[patch]` Edge (claim): finally cleanup skipped on signals or spawn errors. signal handling and guarded cleanup.

## Design Notes

**Claude 代決 (Alex can veto):**
- Base `node:26.13.1-trixie-slim` (Debian 13, what `26-slim` points to; matches local Node 26.13.1) over Alpine (musl) and bookworm. Same digest for build and runtime. Dependabot keeps the digest current.
- Runtime copies `.output` only. Nitro bundles and traces every runtime dependency into `.output/server` (checked: `.output/server/node_modules` holds only the traced `tslib`; everything else is in `_libs`), so a separate `npm ci --omit=dev` layer would only add unused files. The smoke's I5 listing proves `/app` contains nothing else.
- Docker base image updates join the GitHub Actions PR through a multi-ecosystem group, so Alex still gets three monthly PRs (AR-14) and the pinned digest does not go stale. If Alex prefers four PRs, split `docker` into its own entry.
- Plain `docker build` and `docker push` on the runner instead of `docker/setup-buildx-action` and `docker/build-push-action`: one fewer pair of third-party actions to pin, and PR and main build the image with the same command. Resolved for reference: build-push-action v7.4.0 `c3c9e263c25d99ce0380d002d59b67737d91b0dc`, setup-buildx-action v4.4.1 `f87e5991a6d7451dcb8d9637bfbc97413f497069`. login-action v4.8.0 `8aa5831fb8d48d8f76594c7ddde61ae58019f550` (released 2026-11-05) is kept because it logs out in its post step.
- Image name `react-torrent` (project name) instead of the repo name; the `org.opencontainers.image.source` label links the package to the repo. Push is a separate workflow file so the PR workflow never has a push path.
- Full 40-character sha as the tag (canonical identifier; Alex copies it from GitHub for rollback).
- `CONFIG_DIR` is not in the template (default `/config` matches the mount). No `VOLUME` instruction (it would create anonymous volumes on Unraid). No icon (no external image URL in the template).
- Smoke script is Node, not bash: same style as the other two scripts, and macOS has no `timeout`, so polling `docker inspect` works on both CI and Alex's Mac.
- Healthcheck `--interval=30s --timeout=5s --start-period=15s --start-interval=2s --retries=3`. Older Docker engines ignore `--start-interval` and just check every 30 s.
- Guide plus checklist in one file `docs/deployment.md`.

**Compression (Story 1.6 deferred item), Claude 代決: no app-level compression.** Nitro 3 has no runtime compression for dynamic responses; it only has `compressPublicAssets` for prebuilt static files (checked in `node_modules/nitro`: compression code exists only in the static asset path). Start answers server functions with `content-type: application/json` (`server-functions-handler.js`). Cloudflare compresses `application/json` and `text/html` for 200 responses to visitors (zstd on Free, br on Pro) unless the origin sends `cache-control: no-transform`; we send `no-store` only. So the phone path (2.6 MiB full read, about 191 KiB per 5 s delta) is compressed at the edge, and the LAN path stays uncompressed, which a home network carries easily. The checklist confirms `content-encoding` through the Tunnel; if it is missing, Alex decides between `compressPublicAssets` plus a compression step and slimming fields.

**Carried items:**
- 1.1 healthz through a built server: already in `npm run smoke` since 1.2; the image smoke adds it inside the container.
- 1.2 `TSS_PRERENDERING`: the static test bans `TSS_` in the Dockerfile and template; the guide tells Alex not to add `TSS_` variables.
- 1.2 / AR-59 Secure cookie through the Tunnel: checklist item; `npm run smoke` B4 already proves `X-Forwarded-Proto: https` gives Secure.
- 1.3 / 1.7 / AR-60 Access expiry form: checklist item; `classifyResponse` already covers 401, redirect and HTML.
- 1.6 wire size: above.
- 1.8 phone touch freeze: checklist item.
- AR-15: guide section (1); test asserts no branch-name override in Dependabot.

**Golden examples (shape, not exact text):**

```dockerfile
FROM node:26.13.1-trixie-slim@sha256:e6bedef217677b276c591795e169840edd9096dbf13f29df8ef8d1856b8820bc AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG COMMIT_SHA=unknown
RUN COMMIT_SHA=$COMMIT_SHA npm run build
# runtime: same FROM; mkdir /config && chown 99:100; COPY --from=build /app/.output /app/.output
HEALTHCHECK CMD ["node","-e","fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
```

```yaml
version: 2
multi-ecosystem-groups:
  ci-and-image:
    schedule: { interval: monthly }
updates:
  - package-ecosystem: npm
    directory: /
    schedule: { interval: monthly }
    groups:
      production-dependencies: { dependency-type: production, patterns: ['*'] }
      development-dependencies: { dependency-type: development, patterns: ['*'] }
  - { package-ecosystem: github-actions, directory: /, patterns: ['*'], multi-ecosystem-group: ci-and-image }
  - { package-ecosystem: docker, directory: /, patterns: ['*'], multi-ecosystem-group: ci-and-image }
```

**Investigation (AD-11), 2026-11-16:**
- Node image tags and digests: `docker buildx imagetools inspect node:26.13.1-trixie-slim` (index digest above, same as `26-slim` and `26-trixie-slim`); https://hub.docker.com/_/node, https://github.com/nodejs/docker-node. Base image has no `.env*` files, no curl or wget, gid 100 is `users`, uid 99 has no passwd entry (Node does not need one).
- Dockerfile: https://docs.docker.com/reference/dockerfile/#healthcheck, https://docs.docker.com/build/concepts/context/#dockerignore-files, run flags https://docs.docker.com/reference/cli/docker/container/run/.
- Nitro Node output: https://tanstack.com/start/latest/docs/framework/react/guide/hosting, https://nitro.build/deploy/runtimes/node, https://nitro.build/config#compresspublicassets; port and host env confirmed in `.output/server/index.mjs` (`NITRO_PORT ?? PORT`, default 3000).
- Actions: `gh api repos/docker/<name>/git/ref/tags/<tag>` (all three are lightweight tags on commits); https://github.com/docker/login-action.
- GHCR: https://docs.github.com/en/packages/managing-github-packages-using-github-actions-workflows/publishing-and-installing-a-package-with-github-actions (job needs `contents: read` and `packages: write`; a package published from a workflow grants that repo admin access and inherits the repo's visibility model; Alex still confirms Public).
- Dependabot: https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference (groups, `dependency-type`, `applies-to` defaults to version updates, default branch `dependabot/PACKAGE-MANAGER/DEPENDENCY`, security updates use a separate limit and the default branch), https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/configuring-multi-ecosystem-updates (`schedule` lives on the group; `patterns` required on member entries). Repo state today: vulnerability alerts and automated security fixes are off, main has no branch protection.
- Unraid template: https://ca.unraid.net/submit/help/xml-field-reference and a real v2 template https://github.com/linuxserver/templates/blob/main/unraid/qbittorrent.xml (Config attributes `Name Target Default Mode Description Type Display Required Mask`, `Mask="true"` for secrets, `ExtraParams`, `WebUI` placeholders).
- Cloudflare compression: https://developers.cloudflare.com/speed/optimization/content/compression/.

## Verification

**Commands:** (prefix each Node command with `source ~/.nvm/nvm.sh && nvm use &&`)
- `npm run lint` -- expected: exit 0
- `npm run typecheck` -- expected: exit 0
- `npm test` -- expected: all pass, including `src/deploy-files.test.ts`; temporarily breaking one guarded line (for example removing `Mask="true"` from `SESSION_SECRET`) turns it red, then restore
- `npm audit --omit=dev --audit-level=high` -- expected: exit 0
- `npm run build && npm run smoke` -- expected: `smoke: built server ok`
- `node --check scripts/smoke-image.mjs` -- expected: exit 0
- `docker build -t react-torrent:local --build-arg COMMIT_SHA=$(git rev-parse HEAD) .` -- expected: succeeds (native arch locally; CI adds `--platform linux/amd64`)
- `node scripts/smoke-image.mjs react-torrent:local $(git rev-parse HEAD)` -- expected: `smoke-image: ok`; afterwards `docker ps -a` and `docker volume ls` show nothing left by the smoke
- `docker run --rm --entrypoint sh react-torrent:local -c 'ls -A /app'` -- expected: only `.output`
- `bash .claude/skills/next-story/check.sh` -- expected: every line ok

**Manual checks:**
- Read `docs/deployment.md` once end to end: Traditional Chinese, every step from the story's manual list and the spine's "Alex 自己做" list present, no IP, credential or real domain, no em dash.
- The `image.yml` push path cannot run locally or in a PR; it is first exercised by the merge to main (status: waits for CI on main).

## Auto Run Result (pipeline)

- **Summary:** two-stage Dockerfile (Node 26.13.1 trixie-slim pinned by digest, runtime holds only `.output` owned by root, `USER 99:100`, node health check), `.dockerignore`, image smoke script run in PR CI (hardened `docker run`, healthz and `/`, ownership, shell file, startup commit sha, no `.env`, each missing required variable exits non-zero), `image.yml` pushing the sha tag and a guarded `latest` to GHCR after full checks, Dependabot monthly groups, Unraid template, Traditional Chinese deployment guide with the post-deploy checklist.
- **Review findings:** 36 findings. 26 patched (4 medium entries), 2 deferred, 8 rejected with reasons.
- **Follow-up review recommended:** false. The medium patches (PR sha, guarded latest, ownership check) are covered by the guard test and an image smoke that caught a deliberately broken image; the push path itself is deferred to its first run on main.
- **Verification (Node v26.13.1, Docker 29.9.3):** lint exit 0; typecheck exit 0; vitest 56 files, 1073 tests passed; audit 0 vulnerabilities; fresh build ok; `npm run smoke` passed; local `docker build` plus `node scripts/smoke-image.mjs` printed `smoke-image: ok` with no containers left; no IPv4 literal other than loopback in the guide or template; `check.sh` all ok.
- **Residual risks:** the deferred items; Unraid and GitHub button names in the guide come from documentation, not from the live screens.
