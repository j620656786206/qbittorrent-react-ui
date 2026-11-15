# 底稿現況查證：ARCHITECTURE-SPINE.md

- 審查日期：2026-11-15
- 審查角色：現況查證（每個決定有沒有上網或實際查過，不是憑記憶）
- 審查範圍：`ARCHITECTURE-SPINE.md` 和同資料夾 `.memlog.md`
- 查證方法：`npm view`、`npm pack` 下載套件原始碼直接讀、`gh api` 讀 TanStack 和 qBittorrent 在對應 tag 的原始碼、官網文件。底稿沒有改。

## 判決

技術表的版本全部是今天 npm 上的最新版，qBittorrent 端點和封鎖預設也對。但有 3 件事要改底稿才能開工：Node 26 已經是 Active LTS（底稿還寫「等 LTS 確認」）、AD-4 的重登規則在每 5 秒輪詢下會在約 25 秒內把容器 IP 封 1 小時、建立 `src/start.ts` 會讓 Start 內建的 CSRF 保護消失而且它擋下的回應不是 JSON，會被 AD-9 誤判成 Cloudflare 過期。另有幾條中低度的補充。

## 嚴重度總表

| # | 項目 | 要不要改 | 嚴重度 |
| --- | --- | --- | --- |
| 1 | 技術表版本 | 不用改 | 無 |
| 2 | Node 24 LTS、Node 26 待確認 | 要改 | 中 |
| 3 | 現有 `.nvmrc` 是 Node 20 | 要補 | 中 |
| 4 | TypeScript 版本「跟範本一樣」 | 建議寫明 | 低 |
| 5 | 正式環境的伺服器層（Nitro）沒寫進技術表 | 要補 | 中 |
| 6 | SPA 模式加 server functions | 不用改 | 無 |
| 7 | server function 控制 status、cookie、讀 header | 不用改，補一句 | 低 |
| 8 | `src/start.ts` 會關掉內建 CSRF；CSRF 擋下回非 JSON 403 | 要改 | 高 |
| 9 | 錯誤要用回傳，不要用丟出 | 建議寫明 | 低 |
| 10 | qBittorrent 封鎖預設 5 次、1 小時 | 不用改 | 無 |
| 11 | 重登失敗後每 5 秒輪詢會把容器 IP 封掉 | 要改 | 高 |
| 12 | 登入失敗是 HTTP 200 加「Fails.」 | 要補 | 中 |
| 13 | SID cookie 名稱 | 建議改寫法 | 低 |
| 14 | `rid` 增量和「同一個 SID 給多台裝置」 | 要補 | 中 |
| 15 | stop、start、setLocation、renameFile、renameFolder、filePrio | 不用改 | 無 |
| 16 | Cloudflare Access 帶 X-Requested-With 回 401 | 不用改，補設定提醒 | 低 |
| 17 | X-Forwarded-Proto 經過 Tunnel 的值 | 上線時實測 | 低 |
| 18 | GHCR 免費、Actions 建 amd64 | 要補一步 | 低 |

## 逐項

### 1. 技術表版本

- **底稿怎麼寫**：Start 1.169.x、Router 1.170.x、Query 5.107.x、React 19.3.x、Vite 8.3.x、Tailwind 4.3.x、zod 4.6.x、vitest 5.1.x。
- **查到什麼**：今天 `npm view` 的 latest：`@tanstack/react-start` 1.169.5（2026-11-08）、`@tanstack/react-router` 1.170.46、`@tanstack/react-query` 5.107.1、`react` 19.3.1、`react-dom` 19.3.1、`vite` 8.3.8（2026-11-11）、`tailwindcss` 4.3.5、`zod` 4.6.7、`vitest` 5.1.0（2026-11-02）。全部對得上。Start 1.169.5 的 dependencies 直接鎖 `@tanstack/react-router` 1.170.46，所以 Start 1.169 配 Router 1.170 是官方組合；peer 要 `vite >=8.0.0`。周邊也相容：`@tailwindcss/vite` 4.3.5 peer 含 vite 8、`@vitejs/plugin-react` 6.3.0 peer `vite ^8`、`shadcn` CLI 4.23.0。memlog 說「1.169 是第一個 stable」也查到：官方部落格 2026-10-13〈TanStack Start 1.0 is Stable〉，npm 上 1.169.0 發布時間是 2026-10-12。
- **來源**：`npm view <pkg> version`、`npm view @tanstack/react-start dependencies peerDependencies engines`；<https://tanstack.com/blog/tanstack-start-1-0>
- **要不要改**：不用。
- **嚴重度**：無

### 2. Node 24 LTS、Node 26「LTS 確認後再升」

- **底稿怎麼寫**：技術表 Node.js 24 LTS；「先不決定」寫 Node 26 等 LTS 確認後再升。memlog 寫「Node 26 預定 2026-10-28 進 Active LTS，未確認已發生」。
- **查到什麼**：已經發生。Node 官方 `schedule.json`：v26 `lts: 2026-10-28`、維護到 2029-04-30；v24 在 2026-10-20 已經進 Maintenance LTS（只修安全和重大問題），到 2028-04-30 結束。`nodejs.org/dist/index.json`：v26.13.0（2026-10-28）起標 `lts: Lithium`，最新 v26.13.1（2026-11-10）。相依需求：Start `engines.node >=22.12.0`、`nitro` 3 RC `>=22.22.0`、vitest 5.1 `^22.12.0 || ^24.0.0 || >=26.0.0`，Node 26 都符合。Docker Hub 有 `node:26-alpine`、`node:26-slim`（2026-11-11 更新）。
- **來源**：<https://raw.githubusercontent.com/nodejs/Release/main/schedule.json>、<https://nodejs.org/dist/index.json>、<https://hub.docker.com/_/node>
- **要不要改**：要。技術表改成「Node.js 26 LTS（Active，2026-10-28 起）」，或保留 24 但寫清楚「24 已是 Maintenance LTS」；「先不決定」刪掉 Node 26 那列。新專案建議直接 26，維護期比 24 多一年。
- **嚴重度**：中（不會壞，但底稿寫的事實已經過時，而且 AD-11 精神就是不照舊資料）

### 3. 現有 `.nvmrc` 是 Node 20

- **底稿怎麼寫**：沒寫。
- **查到什麼**：repo 根目錄 `.nvmrc` 是 `lts/iron`（Node 20），專案 `CLAUDE.md` 也寫要 20.19+。Start 1.169.5 要 `>=22.12.0`，Nitro 3 要 `>=22.22.0`，Node 20 裝不起來或跑不起來。自動流水線照 `CLAUDE.md` 跑 `nvm use` 會拿到錯的版本。
- **來源**：`cat .nvmrc`；`npm view @tanstack/react-start engines`、`npm view nitro engines`
- **要不要改**：要補一句：第一個 story 要把 `.nvmrc` 改成 Node 26（或 24），`CLAUDE.md` 的 Node 段落一起改，CI 用同一個版本。
- **嚴重度**：中

### 4. TypeScript 版本「跟 Start 官方範本鎖的一樣」

- **底稿怎麼寫**：技術表寫「跟 Start 官方範本鎖的一樣」；memlog 寫「npm 最新是 7.0，Start 支不支援未確認」。
- **查到什麼**：已經查得到。TanStack/router repo 的 `examples/react/start-basic/package.json`（main）是兩個套件並用：`"typescript": "npm:@typescript/typescript6@^6.0.2"` 和 `"@typescript/native": "npm:typescript@^7.0.2"`，build 指令是 `vite build && tsc --noEmit`。`@typescript/typescript6` 的執行檔叫 `tsc6`，所以 `tsc` 指到 TS 7（原生編譯器），而 `import 'typescript'` 拿到的是 TS 6 的 JS API。這樣安排的原因查得到：`typescript-eslint` 8.72.2 的 peer 是 `typescript >=4.8.4 <6.1.0`，裝純 TS 7 會讓 lint 工具壞掉（AD-10 要用 lint 擋 `dangerouslySetInnerHTML`，CI 也跑 lint）。TanStack repo 根目錄也是同樣寫法，另外還測 5.6 到 5.9。
- **來源**：<https://github.com/TanStack/router/blob/main/examples/react/start-basic/package.json>、`npm view typescript-eslint peerDependencies`、`npm view @typescript/typescript6 bin`、`npm view typescript dist-tags`（latest 7.0.2）
- **要不要改**：建議把技術表那列寫明：「`typescript` 用 `@typescript/typescript6` 6.0.x（給 lint 等工具），`tsc` 用 `@typescript/native` 指到 TypeScript 7.0.x；照 Start 範本」。不寫明的話，自動流水線很可能直接裝 `typescript@7`，lint 就會裝不起來。
- **嚴重度**：低

### 5. 正式環境的伺服器層沒寫進技術表

- **底稿怎麼寫**：「打包成一個 Node 容器」，技術表沒有伺服器這一層。memlog 有查過 hono，但最後沒用。
- **查到什麼**：官網 Hosting 文件寫，用 Vite 建的 Start 要跑在 Node 上，是走 Nitro：`vite.config.ts` 加 `nitro()`（`nitro/vite`），`"start": "node .output/server/index.mjs"`，輸出在 `.output`。官方範本也是這樣，用 `nitro ^3.0.260903-beta`。npm 上 `nitro` 的 latest 是 `3.0.261103-rc`（2026-11-03），還不是正式版；官網寫這個 plugin「still under active development」。RC 改版說明也寫舊的 `@tanstack/nitro-v2-vite-plugin` 已移除，要用 `nitro/vite`。另一條路是 Rsbuild 加 `srvx` 或自己寫 Node 伺服器，不需要 Nitro。
- **來源**：<https://tanstack.com/start/latest/docs/framework/react/guide/hosting>、<https://tanstack.com/start/latest/docs/framework/react/migrate-from-release-candidate>、`npm view nitro dist-tags engines`、start-basic 範本的 `vite.config.ts`
- **要不要改**：要。技術表加一列「正式伺服器：Nitro 3（`nitro/vite`，目前 RC），輸出 `.output/server/index.mjs`」，Dockerfile 那段寫用這個指令啟動。這是 Start 之外第二個還沒正式版的元件，Alex 接受的「Start 才一個月」風險其實也包含它，應該寫進 memlog。
- **嚴重度**：中

### 6. SPA 模式加 server functions、server routes

- **底稿怎麼寫**：Start 開 SPA 模式（不做 SSR），伺服器那塊用 server functions／server routes。
- **查到什麼**：官網 SPA mode 現在的寫法是 `tanstackStart({ spa: { enabled: true } })`，只預先產出根路由的殼（預設 `/_shell.html`）。文件明寫 SPA 模式「pair very nicely with server-side features like server functions and/or server routes」。部署到靜態主機才要另外寫轉址；這裡是自己的 Node 容器，伺服器本來就會接 `/_serverFn/*`，沒問題。server routes 的寫法是 `createFileRoute(...)({ server: { handlers: { GET, POST } } })`，可以拿來做 Docker healthcheck。
- **來源**：<https://tanstack.com/start/latest/docs/framework/react/guide/spa-mode>；`@tanstack/start-client-core@1.170.39` 套件內的 `skills/start-core/middleware/SKILL.md`
- **要不要改**：不用。
- **嚴重度**：無

### 7. server function 能不能控制 HTTP status、設 HttpOnly cookie、讀 header

- **底稿怎麼寫**：AD-2 發 HttpOnly cookie、看 `X-Forwarded-Proto` 決定 Secure；AD-9 前端帶 `X-Requested-With`，容器不回 401。
- **查到什麼**：都可以。`@tanstack/react-start/server` 匯出 `getRequestHeader`、`setResponseStatus`、`setCookie`、`getCookie`、`deleteCookie`、`getRequestProtocol`（直接讀 1.169.45 的 `start-server-core` 原始碼確認）。`setCookie(name, value, options)` 的 options 是 `cookie-es` 的 `CookieSerializeOptions`，有 `httpOnly`、`secure`、`sameSite`、`maxAge`；不給 `maxAge`／`expires` 就是關瀏覽器失效的 session cookie。`getRequestProtocol()` 預設就會讀 `x-forwarded-proto`。前端每個 server function 請求要加 header，官方做法是全域 client function middleware：`createMiddleware({ type: 'function' }).client(({ next }) => next({ headers: {...} }))`，放在 `src/start.ts` 的 `createStart(() => ({ functionMiddleware: [...] }))`；要檢查回應是不是 JSON，可以在同一個 middleware 用 `next({ fetch: customFetch })` 包 fetch。另外 1.0 已經拿掉 `useSession`（RC 改版說明），所以底稿用 `SESSION_SECRET` 自己簽 cookie 的方向是對的。
- **來源**：<https://tanstack.com/start/latest/docs/framework/react/guide/server-functions>、<https://tanstack.com/start/latest/docs/framework/react/guide/authentication-server-primitives>、<https://tanstack.com/start/latest/docs/framework/react/migrate-from-release-candidate>；套件原始碼 `start-server-core/src/internal-request-response.ts`
- **要不要改**：不用改規則。可以在 AD-2 補一句「用 `getRequestProtocol()` 判斷 https，不要自己解析 header」、AD-9 補「X-Requested-With 用全域 client function middleware 加」，免得每個 story 各寫一套。
- **嚴重度**：低

### 8. 建立 `src/start.ts` 會關掉內建 CSRF；CSRF 擋下的回應不是 JSON

- **底稿怎麼寫**：AD-2 每個 server function 先檢查 cookie；AD-9 收到 401 或不是 JSON 的回應，一律當 Cloudflare Access 過期。
- **查到什麼**：讀 1.169.45 原始碼 `createStartHandler.js`：沒有 `src/start.ts` 時，Start 自動對 server function 掛 `createCsrfMiddleware`；**一旦有 `src/start.ts`，就改用你自己列的 `requestMiddleware`，內建 CSRF 不再自動加**（開發模式只會印警告）。官網 server functions 文件也寫「If your app does not define `src/start.ts`, Start installs this middleware automatically」。第 7 條加 header 和 AD-2 的全域登入檢查，最自然的寫法就是建 `src/start.ts`，所以一定會碰到。另外，CSRF middleware 擋下時預設回 `new Response("Forbidden", { status: 403 })`，是純文字，照 AD-9 前端會當成「Cloudflare 過期」，提示 Alex 重新過 Access，方向錯。CSRF 檢查的順序是先看 `Sec-Fetch-Site`，沒有才比 `Origin` 和請求網址；請求網址在 Tunnel 後面是 http，跟瀏覽器的 https Origin 會不一樣，但現代瀏覽器都會送 `Sec-Fetch-Site`，所以實際上同源請求會過。
- **來源**：<https://tanstack.com/start/latest/docs/framework/react/guide/server-functions>（CSRF 段落）；套件原始碼 `@tanstack/start-server-core@1.169.45/dist/esm/createStartHandler.js` 第 21、349 行，`@tanstack/start-client-core@1.170.39/dist/esm/createCsrfMiddleware.js`
- **要不要改**：要。AD-2 或 AD-9 加一條：`src/start.ts` 必須明確放 `createCsrfMiddleware({ filter: ctx => ctx.handlerType === 'serverFn' })`，並設 `failureResponse` 回 JSON 的 `{ code, message }`（可以新增一個 code，例如 `forbidden`，或併進現有 code），不准回純文字。這樣 AD-9「非 JSON 就是 Cloudflare」才站得住。
- **嚴重度**：高（一個漏掉 CSRF 保護、一個把錯誤導去錯的處理）

### 9. 錯誤用回傳，不要用丟出

- **底稿怎麼寫**：AD-9「server function 失敗一律是 `{ code, message }`」，沒說是回傳還是丟出。
- **查到什麼**：RC 改版說明：沒接住的錯誤會回「generic JSON body」，status 400 到 599（預設 500）；要指定錯誤內容就要回傳 `Response` 或值。server function 被拒時，前端拿到的是丟出的東西。也就是說「丟一個 Error」跟「回傳 `{ code, message }`」在前端看到的形狀不一樣。
- **來源**：<https://tanstack.com/start/latest/docs/framework/react/migrate-from-release-candidate>
- **要不要改**：建議 AD-9 寫明「失敗用回傳（例如 `{ ok: false, code, message }`），不要 `throw`；`throw` 只留給程式錯誤」，不然兩個 story 會一個丟一個回。
- **嚴重度**：低

### 10. qBittorrent 5.1.4 登入失敗封鎖預設

- **底稿怎麼寫**：memlog「5.1.4 預設同 IP 錯 5 次封 1 小時」；AD-3 因此不把使用者輸入的密碼轉給 qBittorrent。
- **查到什麼**：對。`release-5.1.4` 的 `src/base/preferences.cpp`：`getWebUIMaxAuthFailCount()` 預設 5，`getWebUIBanDuration()` 預設 3600 秒。5.3.0 也一樣（設定鍵改名成 `WebUI/...`，數值不變）。被封時 `auth/login` 回 403（`APIErrorType::AccessDenied`）。
- **來源**：<https://github.com/qbittorrent/qBittorrent/blob/release-5.1.4/src/base/preferences.cpp>、<https://github.com/qbittorrent/qBittorrent/blob/release-5.1.4/src/webui/api/authcontroller.cpp>
- **要不要改**：不用。
- **嚴重度**：無

### 11. 重登失敗後，每 5 秒輪詢會把容器 IP 封掉

- **底稿怎麼寫**：AD-4「qBittorrent 回 403 時，用環境變數重登一次再重送原請求；再失敗回 `qbit_auth_failed`，不再重試」。AD-6 每 5 秒呼叫 `getMaindata`，檔案分頁開著時再加一個 5 秒輪詢。
- **查到什麼**：「不再重試」是以一個請求為單位。如果環境變數的密碼錯了（例如 Alex 改了 qBittorrent 密碼但還沒改容器），每 5 秒的 `getMaindata` 都會各自「403 → 重登一次 → 失敗」，每次重登都算一次失敗（第 12 條：密碼錯是 200 加 `Fails.`，而且會累計失敗次數），第 5 次就封容器 IP 3600 秒，大約 25 秒內發生。兩台裝置同時開著會更快。被封之後就算 Alex 改好環境變數重啟容器，還要等滿 1 小時（容器 IP 沒變）。
- **來源**：同第 10 條的 `authcontroller.cpp`（失敗分支呼叫 `increaseFailedAttempts()`）、`preferences.cpp`
- **要不要改**：要。AD-4 改成「容器層級」的斷路：一旦用環境變數登入拿到 `Fails.`，容器記住這個狀態，之後所有請求直接回 `qbit_auth_failed`，不再打 `auth/login`，直到容器重啟（環境變數改了一定要重啟）或過了一段冷卻時間；同一時間多個請求遇到 403 時只能有一個在重登，其他人等它的結果。
- **嚴重度**：高（整個 App 會停擺 1 小時，VueTorrent 不受影響，而且原因很難從畫面看出來）

### 12. 登入失敗回的是 HTTP 200 加「Fails.」

- **底稿怎麼寫**：AD-4 只寫「回 403 時重登」「再失敗回 `qbit_auth_failed`」，沒寫怎麼判斷登入失敗。
- **查到什麼**：5.1.4 的 `loginAction()`：成功回 `Ok.`；帳密錯回 **HTTP 200**，內容是 `Fails.`；被封鎖回 403。沒登入就打私有 API 是 403（`webapplication.cpp` 的 `ForbiddenHTTPError`）。另外，qBittorrent 的 CSRF 檢查或 Host header 檢查沒過時回的是 **401**（`UnauthorizedHTTPError`）；容器要把這個 401 轉成自己的錯誤碼，不能原樣傳出去，否則違反 AD-9「容器自己絕不回 401」，前端會誤判成 Cloudflare 過期。
- **來源**：<https://github.com/qbittorrent/qBittorrent/blob/release-5.1.4/src/webui/api/authcontroller.cpp>、<https://github.com/qbittorrent/qBittorrent/blob/release-5.1.4/src/webui/webapplication.cpp>（約 310 到 330 行、600 到 630 行）
- **要不要改**：要補到 AD-4：登入成功以「回應是 `Ok.` 而且有拿到 session cookie」判斷；`Fails.` 回 `qbit_auth_failed`；`auth/login` 回 403 表示容器 IP 被封，也回 `qbit_auth_failed`（message 寫被封要等多久）；qBittorrent 回 401 對到 `qbit_rejected`。
- **嚴重度**：中

### 13. SID cookie 名稱

- **底稿怎麼寫**：AD-4「cookie 名稱同時認 `SID` 和 qBittorrent 5.2 起的 `QBT_SID_<port>`」。
- **查到什麼**：說法對。5.1.4：`DEFAULT_SESSION_COOKIE_NAME = "SID"`，但名稱可以用偏好設定 `getWebAPISessionCookieName()` 改掉。5.2.0：`SESSION_COOKIE_NAME_PREFIX = "QBT_SID_"`，名稱是前綴加 WebUI port；5.3.0 一樣。cookie 是 HttpOnly，開 CSRF 保護時 SameSite=Strict（容器在伺服器端自己帶 cookie，不受影響）。另外 qBittorrent 最新版已經是 5.3.0（2026-10-20），5.2.x 也出到 5.2.4。
- **來源**：<https://github.com/qbittorrent/qBittorrent/blob/release-5.1.4/src/webui/webapplication.cpp>（73、174 到 182、744 到 752 行）、<https://github.com/qbittorrent/qBittorrent/blob/release-5.2.0/src/webui/webapplication.cpp>（75、472 行）、<https://github.com/qbittorrent/qBittorrent/releases>
- **要不要改**：建議把寫法改成「從 `auth/login` 回應的 `Set-Cookie` 拿名稱和值，原樣帶回去」，不要寫死兩個名字。這樣 5.1.4 有人改過名稱、5.2 以後換 port，都不用改程式。另外建議 Unraid 的 qBittorrent 映像釘版本，不要用 `latest`，避免 qBittorrent 自己升到 5.3。
- **嚴重度**：低

### 14. `rid` 增量，以及「同一個 SID 給多台裝置」

- **底稿怎麼寫**：AD-6「前端每 5 秒呼叫 `getMaindata(rid)`，用 qBittorrent 的 `rid` 增量合併」；AD-4「SID 只在容器記憶體」（容器只有一個 SID）。
- **查到什麼**：`rid` 增量存在：`sync/maindata` 收 `rid`，回 `rid` 和 `full_update`。但 qBittorrent 的增量狀態是**跟著 session 走的**：`sessionStart()` 給每個 WebSession 建一個自己的 `SyncController`，裡面只記一組 `m_maindataLastSentID`／`m_maindataAcceptedID`。容器只有一個 SID，手機和電腦同時開著時，兩邊輪流送各自的 `rid`，對 qBittorrent 來說是同一個 session 的 rid 一直對不上，結果幾乎每次都回 `full_update`（全量資料），增量就沒用了；交錯時會不會漏掉變更，原始碼看起來它會退回全量所以應該不會錯，但沒有實測。另外 SID 過期重登後是新的 session，前端手上的 `rid` 一定會拿到 `full_update: true`。
- **來源**：<https://github.com/qbittorrent/qBittorrent/blob/release-5.1.4/src/webui/api/synccontroller.cpp>（約 492 到 512 行）、<https://github.com/qbittorrent/qBittorrent/blob/release-5.1.4/src/webui/webapplication.cpp>（731 到 742 行）
- **要不要改**：要補。兩個做法擇一寫進 AD-6：（a）容器自己用一個 `rid` 跟 qBittorrent 同步、在容器裡合併出完整資料，前端拿容器給的版本號做增量或直接拿全量（種子數量少時全量也不大）；（b）維持前端帶 `rid`，但寫明「`full_update: true` 時整份取代，不是合併」，接受多裝置時退化成全量。不寫的話，合併邏輯很容易只處理增量那條路。
- **嚴重度**：中

### 15. stop、start、setLocation、renameFile、renameFolder、filePrio

- **底稿怎麼寫**：功能對應用 `stopTorrents`、`startTorrents`、`setLocation`、`renameFile`、`renameFolder`、`setFilePriority`，對接 5.1.4。
- **查到什麼**：5.1.4 的 `torrentscontroller.h` 有 `startAction`、`stopAction`、`setLocationAction`、`renameFileAction`、`renameFolderAction`、`filePrioAction`、`filesAction`、`addAction`、`deleteAction`；**沒有** `pauseAction`、`resumeAction`（5.0 改名後就拿掉了）。`webapplication.h` 規定這幾個都要 POST。`filePrio` 要 `hash`、`id`、`priority` 三個參數，priority 不是合法值會回錯。5.1.4 的 WebAPI 版本是 2.11.4。5.3.0 這些端點都還在（API 2.16.2）。
- **來源**：<https://github.com/qbittorrent/qBittorrent/blob/release-5.1.4/src/webui/api/torrentscontroller.h>、<https://github.com/qbittorrent/qBittorrent/blob/release-5.1.4/src/webui/webapplication.h>（POST 清單、`API_VERSION`）、<https://github.com/qbittorrent/qBittorrent/blob/release-5.3.0/src/webui/webapplication.h>
- **要不要改**：不用。
- **嚴重度**：無

### 16. Cloudflare Access 過期時帶 X-Requested-With 會拿到 401

- **底稿怎麼寫**：AD-9 前端帶 `X-Requested-With: XMLHttpRequest`，收到 401 當 Access 過期。
- **查到什麼**：官方文件原文：「You can configure Access to provide a 401 response on sub-requests with an expired session token」「In order to receive a 401 for an expired session, add the following header to all AJAX requests: X-Requested-With: XMLHttpRequest」，並建議收到 401 就重新整理頁面或提示過期。Access 應用程式的 session 預設 24 小時。
- **來源**：<https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/>
- **要不要改**：規則不用改。可以在「Alex 自己做」補一句：新增 Access 應用程式後，用一個過期或刪掉的 `CF_Authorization` cookie 實際打一次 server function，確認回的是 401 不是 302。文件用的詞是「can configure」，沒寫清楚是不是預設開。
- **嚴重度**：低

### 17. X-Forwarded-Proto 經過 Tunnel 的值

- **底稿怎麼寫**：AD-2「請求是 https（看 `X-Forwarded-Proto`）才加 Secure」。
- **查到什麼**：Cloudflare 的 HTTP headers 文件寫 `X-Forwarded-Proto` 代表「訪客連到 Cloudflare 用的協定」，預設 https；但搜尋時看到 Cloudflare 另一頁把它寫成「Cloudflare 連到 origin 的協定」，兩頁說法不一致。cloudflared 自己的文件沒查到它會帶哪些 header。另外 `CF-Visitor: {"scheme":"https"}` 也是一個訊號。
- **來源**：<https://developers.cloudflare.com/fundamentals/reference/http-headers/>
- **要不要改**：不用改規則，但要在部署 story 加一步：第一次上線時記一次容器收到的 `X-Forwarded-Proto`，確認經 Tunnel 是 `https`、在家直連沒有這個 header。拿到的不對就改看 `CF-Visitor`。
- **嚴重度**：低（判斷錯的後果是外面那條路沒加 Secure，cookie 還是 HttpOnly 加 SameSite=Lax）

### 18. GHCR 免費、GitHub Actions 建 amd64 映像

- **底稿怎麼寫**：合併到 main 後建 amd64 映像推 GHCR，tag `latest` 和 commit sha；Unraid 按檢查更新。
- **查到什麼**：GitHub Packages 計費文件：「Container image storage and bandwidth for the Container registry is currently free」，公開套件本來就免費，變更前至少提前一個月通知。公開 repo 用標準 GitHub 代管 runner 免費。`ubuntu-latest` 是 x64（就是 amd64）。用 `GITHUB_TOKEN` 從 workflow 推，套件會自動連到這個 repo。但**第一次推上去的套件預設是 private**；Unraid 要拉 private 映像得先在 NAS 上 `docker login ghcr.io`，否則「檢查更新」會失敗。
- **來源**：<https://docs.github.com/en/billing/concepts/product-billing/github-packages>、<https://docs.github.com/en/billing/concepts/product-billing/github-actions>、<https://docs.github.com/en/actions/reference/runners/github-hosted-runners>、<https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry>
- **要不要改**：要在「Alex 自己做」補一步：第一次推完之後，到 GitHub 把套件改成 public（映像裡沒有帳密，帳密是 Unraid 範本的環境變數，repo 本來也是公開的），或在 Unraid 登入 GHCR。workflow 要給 `permissions: packages: write`（文件那頁沒寫這段，屬於常見做法，寫 story 時再查一次）。
- **嚴重度**：低

## 沒查到、要注意的地方

- 第 14 條「多裝置交錯會不會漏資料」只讀了原始碼，沒有實際跑。
- 第 16 條 Access 的 401 是不是預設開，文件沒寫清楚，需要上線後實測。
- 第 17 條 cloudflared 實際送的 `X-Forwarded-Proto`，官方文件互相矛盾，需要實測。
