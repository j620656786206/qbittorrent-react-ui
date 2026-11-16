# CLAUDE.md

react-torrent 是 Alex 自用的 qBittorrent 網頁介面重寫版：一個 TanStack Start 容器（SPA 模式、Nitro 的 Node 輸出）同時送網頁、當 qBittorrent 的白名單閘門。

## 先讀這些

- 架構底稿：`_bmad-output/planning-artifacts/architecture/architecture-react-torrent-2026-11-15/ARCHITECTURE-SPINE.md`。分層、AD 規則、慣例和版本都以這份為準，story 不能自己改。
- PRD：`_bmad-output/planning-artifacts/prds/prd-react-torrent-2026-11-15/prd.md`
- UX：`DESIGN.md`（repo 根目錄），以及 `_bmad-output/planning-artifacts/ux-designs/ux-react-torrent-2026-11-13/` 底下的 `DESIGN.md`、`EXPERIENCE.md`
- Epic 和 story：`_bmad-output/planning-artifacts/epics.md`
- 進度：`_bmad-output/implementation-artifacts/sprint-status.yaml`
- 自動流程：`.claude/skills/next-story/`（送出前檢查 `check.sh`）、`.claude/skills/ship/`

## 指令

Node 版本寫在 `.nvmrc`（26）。shell 不會記住上一個指令切過的版本，所以每個指令都要帶前綴：

```bash
# 這台 Mac 還沒有 Node 26 時，先裝一次
source ~/.nvm/nvm.sh && nvm install 26

source ~/.nvm/nvm.sh && nvm use && npm ci
source ~/.nvm/nvm.sh && nvm use && npm run dev        # http://localhost:3000
source ~/.nvm/nvm.sh && nvm use && npm run lint
source ~/.nvm/nvm.sh && nvm use && npm run typecheck
source ~/.nvm/nvm.sh && nvm use && npm test
source ~/.nvm/nvm.sh && nvm use && npm run build
source ~/.nvm/nvm.sh && nvm use && npm start          # 跑 build 出來的 .output/server/index.mjs
```

本機檢查映像（只用來驗證，Docker Desktop 要開著）。CI 和 GHCR 是 amd64，所以本機也建 amd64；Apple Silicon 的 Mac 會用模擬跑，比較慢：

```bash
docker build --platform linux/amd64 -t react-torrent:local --build-arg COMMIT_SHA=$(git rev-parse HEAD) .
source ~/.nvm/nvm.sh && nvm use && node scripts/smoke-image.mjs react-torrent:local $(git rev-parse HEAD)
```

映像只由 CI 建和推。不准在本機 `docker push` 或登入 GHCR。部署到 Unraid 的步驟和上線後實測清單在 `docs/deployment.md`。

本機設定：`.env` 只留在本機、不進 git，變數名稱照 `.env.example`。舊的 `VITE_` 開頭名稱要改成 `.env.example` 的名稱；帳密絕對不能放在 `VITE_` 變數裡（AD-3，`VITE_` 會被打包進前端）。

## 規則

- **repo 是公開的。** 帳密、token、IP（包括家裡的內網位址）不能寫進任何追蹤的檔案、commit 訊息、PR 或 log。commit 前跑 `bash .claude/skills/next-story/check.sh`，每一行都要是 ok。
- **私人分類只寫代稱** X 或 mteam-X，真名和相關流程不進 git。
- **AD-15：** 測試、CI、任何自動流程都不能對真的 qBittorrent 做寫入（刪除、新增、搬移、改名、暫停繼續、改優先順序）。驗證一律用假的回應；對真的 qBittorrent 只能讀，而且只在本機開發。
- **AD-11：** 寫 TanStack Start、Router、Query、Nitro 或其他框架的程式之前，先查跟 `package.json` 鎖定版本相符的官網文件，把網址記在 spec 和 PR 說明裡。框架套件用精確版本，不加 `^`。
- 畫面文字直接寫繁體中文，不裝 i18n、動畫或手勢套件。
- 分層由 ESLint（`eslint-plugin-boundaries`）擋，規則在 `eslint.config.js`，對應底稿的分層圖。
