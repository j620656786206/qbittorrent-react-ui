---
status: final
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-react-torrent-2026-11-15/prd.md
  - _bmad-output/planning-artifacts/architecture/architecture-react-torrent-2026-11-15/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-react-torrent-2026-11-13/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-react-torrent-2026-11-13/EXPERIENCE.md
  - DESIGN.md
---

# react-torrent - Epic Breakdown

## Overview

這份文件把 react-torrent 的需求拆成可以實作的 epic 和 story。需求來自 PRD、UX 規格（UX `DESIGN.md` 和 `EXPERIENCE.md`）和架構底稿。範圍以根目錄 `DESIGN.md` 為準：7 件事加兩個例外。

需求清單之後是 FR 對照、5 個 epic 和 40 張 story，已照驗證結果（`epics-validation.md`）修過。細節以來源文件為準，這裡每條只寫一句，實作時回去讀標的章節。私人分類只寫代稱 X、mteam-X。

## Requirements Inventory

### Functional Requirements

- FR-1：用 qBittorrent 的帳號密碼登入 App；沒登入或過期時任何網址都顯示登入畫面，登入後回原網址（PRD §4.1）
- FR-2：登入失敗時知道原因和下一步：帳密不對、連錯 5 次鎖 15 分鐘、容器裡的 qBittorrent 密碼不對（PRD §4.1）
- FR-3：勾「記住我」90 天、不勾 12 小時不用再登入；瀏覽器不存帳密；沒有登出按鈕（PRD §4.1）
- FR-4：任何畫面都看得到頁首，從頁首進搜尋、新增、快捷鍵說明和設定（PRD §4.2）
- FR-5：隨時看到現在的下載、上傳速度和目前生效的上限，寫成「不限速」「上限 32.7」（PRD §4.2）
- FR-6：從速度膠囊（手機是速度那一行）看出 qBittorrent 防火牆擋住、斷線，以及資料超過 10 秒沒更新（PRD §4.2）
- FR-7：連不到家裡、Cloudflare 登入過期、家裡的 qBittorrent 沒回應時，看到分得出種類的提示條並能重試（PRD §4.2）
- FR-8：每個種子對到固定的 7 個狀態用語和看板欄，看不到 qBittorrent 的原始狀態碼（PRD §4.3）
- FR-9：整個 App 的數字、大小、速度、時間、分享率、百分比用同一套寫法（PRD §4.3）
- FR-10：電腦選「狀態」排序時，用 4 個工作欄加已整理欄的看板看每個種子在哪個階段（PRD §4.3）
- FR-11：電腦看板捲某一欄時，其他欄自動收合、那欄變寬；捲回頂或點收合欄才展開（PRD §4.3）
- FR-12：手機選「狀態」排序時，用 4 個狀態分頁一次看一欄，左右滑換欄（PRD §4.3）
- FR-13：選「狀態」以外的排序時用列表看種子，右邊大數字跟著排序欄位走（PRD §4.3）
- FR-14：打開 App 或換分類時，看得到的進度環從 0 轉到目前進度（PRD §4.3）
- FR-15：第一次載入看到骨架；空分類、空欄、只剩已整理時看到對的空狀態（PRD §4.3）
- FR-16：點列或卡片就在原畫面看詳情（電腦詳情面板、手機底部面板），重新整理後還在（PRD §4.3）
- FR-17：詳情任何分頁都固定顯示名稱和「第 N 個／共 M 個」，並能前後切換（PRD §4.3）
- FR-18：在概覽分頁看到依狀態換的詳情狀態區、三張數字小卡、儲存位置區塊和資訊清單（PRD §4.3）
- FR-19：在儲存位置區塊看到路徑和位置標籤，從這裡複製、加到常用、改路徑、改檔名（PRD §4.3）
- FR-20：正在看的種子被刪、搬出篩選或被搜尋篩掉時，詳情換成下一個或關掉（PRD §4.3）
- FR-21：電腦點分類分頁就篩成那個分類，排序換成記住的，列表回到最上面（PRD §4.4）
- FR-22：手機從分類按鈕彈出的分類清單換分類，並從最下面一列進設定（PRD §4.4）
- FR-23：在目前分類裡打字，邊打邊篩種子名稱（PRD §4.4）
- FR-24：搜尋沒結果時一鍵改到「全部」找（PRD §4.4）
- FR-25：排序是「狀態」就是看板，其他 50 種都是列表加詳情（PRD §4.5）
- FR-26：從排序選單選 51 種排序之一，常用 5 個在上面，其他收在「更多」（PRD §4.5）
- FR-27：看懂並反轉排序方向；每種排序有預設方向，同分時順序固定（PRD §4.5）
- FR-28：每個分類（含「全部」）記住最後一次手動選的排序，存在 NAS，電腦手機共用（PRD §4.5）
- FR-29：打開 App 回到這台裝置上次看的分類、記住的排序和上次看的種子（PRD §4.5）
- FR-30：電腦滑上去出現勾選框，一個一個勾選多個種子，沒有全選（PRD §4.6）
- FR-31：手機長按 0.5 秒進入選取模式（PRD §4.6）
- FR-32：勾選後從選取列看到數量和加總大小，並開始改路徑或刪除（PRD §4.6）
- FR-33：在刪除確認看清楚要刪哪些、會不會連檔案一起刪（PRD §4.7）
- FR-34：關掉刪除確認等於不刪，選取留著（PRD §4.7）
- FR-35：刪除後列淡出並跳 toast；整批成功或整批失敗，失敗能重試（PRD §4.7）
- FR-36：從頁首「新增」或電腦拖 .torrent 檔打開新增（PRD §4.8）
- FR-37：一次貼上或拖進多筆磁力連結和 .torrent 檔，套同一個分類送出（PRD §4.8）
- FR-38：貼上當下就知道哪幾筆重複、看不懂或超過上限，不會加（PRD §4.8）
- FR-39：送出後留在原畫面；成功 toast 有「去看」，部分失敗的留在清單寫原因（PRD §4.8）
- FR-40：從詳情改一個種子的儲存路徑，或從選取列一次搬好幾個（PRD §4.9）
- FR-41：從常用路徑點一下選目標，也能自己改「會搬到」的路徑（PRD §4.9）
- FR-42：在卡片、列、儲存位置區塊用位置標籤看出種子在哪、是不是在媒體庫（PRD §4.9）
- FR-43：在改路徑畫面新增、改名、刪除常用路徑，並勾「媒體庫」（PRD §4.9）
- FR-44：在詳情按「☆ 加到常用」，一鍵把目前路徑加進常用路徑（PRD §4.9）
- FR-45：改路徑後看得到搬移中；只搬一個時，搬完被提醒「接著改檔名」（PRD §4.9）
- FR-46：從詳情或搬完的 toast 進改檔名，自動判斷整季批次或單檔（PRD §4.10）
- FR-47：輸入劇名和季數，預覽並一次改好整季的檔名和 `<劇名>/season<n>/` 資料夾（PRD §4.10）
- FR-48：確定前看出哪些集數是猜的、哪些撞名；有撞名時不能確定（PRD §4.10）
- FR-49：只有一個影片檔的種子也能改檔名和資料夾名稱（PRD §4.10）
- FR-50：改名後看到結果，中途失敗時能「重試剩下的」（PRD §4.10）
- FR-51：在詳情「⋯」選單暫停或繼續一個種子（例外）（PRD §4.11）
- FR-52：在詳情的檔案分頁看每個檔案的名字、大小、進度（例外）（PRD §4.12）
- FR-53：在檔案分頁勾掉不下載的檔案，或改優先順序（例外）（PRD §4.12）
- FR-54：在設定頁排分類分頁的順序，開關看板自動收合（PRD §4.13）
- FR-55：電腦用快捷鍵搜尋、關閉、上下切換、跳分類、選常用排序（PRD §4.14）
- FR-56：打開快捷鍵說明視窗看全部快捷鍵（PRD §4.14）
- FR-57：送出後按鈕換字、不能重複送出；超過 10 秒提示，30 秒算失敗（PRD §4.15）
- FR-58：操作失敗時看到原因並能重試，填的東西不會不見；多選改路徑有部分失敗畫面（PRD §4.15）
- FR-59：toast 位置固定、一次一個，依種類決定停多久（PRD §4.15）
- FR-60：手機用同一種底部面板看詳情和做動作，關法都一樣（PRD §4.15）

### NonFunctional Requirements

- NFR-1：約 4165 個種子下，列表、看板欄、刪除確認、檔案分頁都虛擬化；換分類、排序、搜尋沒有感覺得到的延遲（PRD §5）
- NFR-2：種子資料每 5 秒只拿變動；分頁在背景時停、回前景立刻拿；失敗保留舊資料；所有數字來自同一份資料（PRD §5）
- NFR-3：動畫只動 `transform` 和 `opacity`，數值照規格，在真的手機上不掉格（目標 60fps）（PRD §5）
- NFR-4：系統開了減少動態時，所有動畫都關掉，功能照常（PRD §5）
- NFR-5：寬度 1024px 以上是電腦版、以下是手機版；10 張畫面兩種版面都能用；手機不會橫向捲動（PRD §5）
- NFR-6：跟系統的深淺色，顏色照角色用；每張畫面在深藍夜截圖檢查一次（PRD §5）
- NFR-7：狀態用顏色加圖示、圖示按鈕有 `aria-label`、焦點外框、手機點擊範圍 44px、對比 4.5 和 3（PRD §5）
- NFR-8：畫面文字直接寫繁體中文台灣用語，用句號或冒號斷句，不露原始狀態碼和 Unix 時間（PRD §5）
- NFR-9：在家走 http 也全部能用；複製和算 info hash 不依賴只有 https 才有的 API（PRD §5）
- NFR-10：瀏覽器只跟容器說話、兩道門、帳密只在容器、白名單、擋跨站和越界輸入、陌生文字當純文字（PRD §5）
- NFR-11：帳密、IP、私人分類的真名不進 git、log 或錯誤訊息；log 遮罩，不記請求 body（PRD §5）
- NFR-12：錯誤只有一種形狀、前端一個出口；分得出 5 種連線問題；不露位址和原文；登入過期時停掉自動更新（PRD §5）
- NFR-13：操作成功後不先改畫面，等下一次更新；搬移目標由容器記住（PRD §5）
- NFR-14：設定存在 NAS，電腦手機共用；同時改不會互相蓋掉；寫到一半不壞檔（PRD §5）
- NFR-15：自動流程、測試、CI 不對真的 qBittorrent 寫入；寫入功能的最後驗收由 Alex 在 NAS 上做（PRD §5）
- NFR-16：一個非 root、唯讀的容器跑在 Unraid，能退回上一版；缺環境變數就拒絕啟動；只有健康檢查和 log（PRD §5）
- NFR-17：支援最新版的 Chrome、Edge、Safari：電腦是 Mac、Windows，手機是 Alex 自己的手機（PRD §5）

### Additional Requirements

來源是 `ARCHITECTURE-SPINE.md`。每條標 AD 編號或底稿章節。story 不能自己改這些規則，要改先改底稿。

**地基和專案設定**

- AR-1：**Starter template**：用官方 TanStack Start 範本（SPA 模式，1.169.x）起專案，清掉舊程式。這是第一個 epic 的第一張 story（Story 1.1），其他 story 都排在它後面。（AD-1、AD-11、建造順序 1）
- AR-2：舊檔案處理，放在第一張 story：重寫 `CLAUDE.md` 指向架構底稿；`.nvmrc` 改成 26；刪掉 `wrangler.jsonc` 和 `.github/workflows/release.yml`；換掉舊 CI；`.env.example` 改成新的變數名，只放佔位字。（結構「舊檔案」）
- AR-3：技術版本照底稿：Node 26 LTS、React 19.3.x、Vite 8.3.x、Router 1.170.x、Query 5.107.x、`@tanstack/react-virtual` 3.x、Tailwind 4.3.x、zod 4.6.x、vitest 5.1.x、shadcn/ui 最新版；TypeScript 跟範本一樣且相容 typescript-eslint。框架套件寫精確版本，不用 `^`。（技術表、AD-11）
- AR-4：寫框架程式前先查跟 `package.json` 版本相符的官網文件；PR 說明列出參考的網址。（AD-11）
- AR-5：目錄分層：`src/routes`、`src/features/<功能>`、`src/state`、`src/lib`、`src/shared`、`src/server/functions`、`src/server/{qbit,sync,settings,auth,log}`、`src/start.ts`。用 ESLint import 邊界規則寫成設定，CI 擋；`features` 之間不准互相 import。（設計模式）
- AR-6：一致性慣例：檔名 kebab-case；server function 用動詞開頭的 camelCase；種子身分用小寫 hex 的 `hash`；欄位名照 qBittorrent 5.1.4 原樣；時間傳 Unix 秒、大小傳 bytes，只在畫面上轉文字。（一致性慣例）
- AR-7：長清單一律用 `@tanstack/react-virtual`；動畫只用 CSS transition 和 Web Animations API；底部面板手勢用 pointer events 自己寫；都不加套件。不裝 i18n 套件。（一致性慣例）

**容器、部署、CI**

- AR-8：多階段 Dockerfile：Node 26 基底釘 digest、`npm ci`、最後一層只放建置結果和正式依賴、`USER 99:100`、`HEALTHCHECK` 用 `node` 打 `/healthz`。（結構「部署」、AD-16）
- AR-9：`.dockerignore` 排除 `.env*`（`.env.example` 除外）、`.git`、`node_modules`、`_bmad-output`、`.claude`、`config`。（AD-16）
- AR-10：`GET /healthz` 只回 200 和 `ok`，不碰 qBittorrent、不讀設定檔、不用登入；這是唯一的 server route。（AD-5、結構「部署」）
- AR-11：CI 每個 PR 依序跑 lint、typecheck、vitest、`npm audit --omit=dev --audit-level=high`、build、建映像（不推）、用假環境變數 `docker run` 並打 `/healthz` 和首頁要 200。全綠才能合併。（結構「部署」）
- AR-12：合併到 main 後建 amd64 映像推 GHCR，tag 是 `latest` 和 commit sha，套件設公開。映像只在 CI 建。（結構「部署」、AD-16）
- AR-13：workflow 不用 `pull_request_target`，預設 `contents: read`，只有推映像的 job 有 `packages: write`，第三方 action 釘 commit SHA。（AD-16）
- AR-14：Dependabot 每月一次，分正式依賴、開發依賴、GitHub Actions 三組 PR；安全性更新隨時開。（結構「部署」）
- AR-15：自動合併只合併自動流程從 Alex 帳號建的分支；外部 PR 和依賴更新 PR 要 Alex 自己看。（AD-16）不拆成 story：在設定自動開發流程（next-story／ship）時處理。
- AR-16：Unraid Docker 範本：一個 port、只掛 `/config`、密碼類欄位遮罩、Extra Parameters 加 `--cap-drop=ALL --security-opt=no-new-privileges --read-only --tmpfs /tmp`；不准 privileged、`--network=host`、掛 Docker socket 或其他資料夾。（結構「部署」）
- AR-17：啟動時檢查 `QBIT_URL`、`QBIT_USERNAME`、`QBIT_PASSWORD`、`SESSION_SECRET`、`APP_ORIGINS`、`SAVE_ROOTS`；缺一個、`SESSION_SECRET` 短於 32 bytes 或等於佔位字，就印原因（不印值）並結束。`CONFIG_DIR` 預設 `/config`，本機指到 gitignore 的 `./config`。（AD-16、AD-8）

**伺服器：qBittorrent、登入、閘門**

- AR-18：容器不回任何 CORS 標頭；容器自己絕不回 HTTP 401。（AD-1、AD-9）
- AR-19：qBittorrent session 由容器保管：cookie 名稱和值從 `Set-Cookie` 原樣拿，不寫死 `SID`；回 `Ok.` 而且有 `Set-Cookie` 才算登入成功；同時只有一個重登在跑；403 時重登一次再重送。（AD-4）
- AR-20：斷路：重登回 `Fails.` 或 `auth/login` 回 403，之後所有請求直接回 `qbit_auth_failed`、不再碰登入，直到容器重啟。不准關掉 qBittorrent 的 CSRF、Host 檢查、登入封鎖或開略過驗證。（AD-4）
- AR-21：App 登入在容器比對帳密（兩邊先 SHA-256 再 `timingSafeEqual`），絕不轉給 qBittorrent；全域計數連錯 5 次鎖 15 分鐘回 `login_locked`，放記憶體；不讀 `CF-Connecting-IP`、`X-Forwarded-For`；不准用 `VITE_` 變數放帳密。（AD-3）
- AR-22：session cookie `rt_session`：HttpOnly、SameSite=Strict，`getRequestProtocol()` 是 https 才加 Secure；簽章帶 `iat`、`exp`，每次檢查 `exp`：記住我 90 天，不勾 12 小時。換 `SESSION_SECRET` 再重啟就全部登出。（AD-2）
- AR-23：server function 工廠：只能用 `src/server/functions/_define.ts` 建立（lint 擋其他地方呼叫 `createServerFn`）；內建登入檢查、zod 驗輸入、對 qBittorrent 30 秒逾時、例外轉成 AD-9 的錯誤。（AD-5）
- AR-24：白名單：每個 qBittorrent 操作一個 server function（`getMaindata`、`getFiles`、`deleteTorrents`、`addTorrents`、`setLocation`、`renameFiles`、`stopTorrents`、`startTorrents`、`setFilePriority`），沒有 `/api/v2/*` 通用轉送；`app/setPreferences` 和其他改 qBittorrent 設定的 API 一律不開。（AD-5）
- AR-25：改東西一律 POST、讀取才 GET 且沒有副作用；只有 `login` 和 `/healthz` 不用登入，vitest 列出所有 server function 檢查沒登入時都回 `not_logged_in`；參數用 `URLSearchParams` 或 `FormData` 組，每個 schema 只取自己的欄位。（AD-5）
- AR-26：`src/start.ts` 明確掛 `createCsrfMiddleware`，`failureResponse` 回 JSON 的 `bad_origin`；再加全域 request middleware：`Host`、`Origin` 要在 `APP_ORIGINS` 裡，而且要有 `X-Requested-With`，`/healthz` 例外。先檢查來源和 cookie，再讀 body。（AD-12）
- AR-27：body 上限：`.torrent` 每個 10 MB、一次 20 個、整個請求 50 MB；收 hash 陣列的請求 384 KB；其他 64 KB。先看 `Content-Length`，讀的時候也邊讀邊算。（AD-12）
- AR-28：hash 只收 40 或 64 位小寫 hex，陣列 1 到 5000 個；永遠不把 `all` 或含 `|` 的值送給 qBittorrent。（AD-12）
- AR-29：路徑共用 `src/shared` 一個 schema：絕對路徑，不含 NUL、反斜線、控制字元，任何一段是 `..` 就拒絕，正規化後要在 `SAVE_ROOTS` 某個根目錄底下，長度上限 1024。改名的新路徑相對於種子自己的資料夾，可以有好幾段，每一段各自檢查：不含 `\`、NUL、控制字元，不是 `.` 或 `..`，每段 1 到 255 bytes，不能以 `/` 開頭；舊路徑要在這個種子目前的檔案清單裡（容器去查）。（AD-12）
- AR-30：`addTorrents` 只收 `magnet:` 和 `.torrent`，不收 http 網址和 `savepath`，檔案開頭要是 bencode 字典，容器不抓使用者給的網址；`setFilePriority` 的 id 是非負整數、priority 只能 `0`、`1`、`6`、`7`；刪除的一併刪檔是明確 boolean。（AD-12）
- AR-31：CSP 和標頭：所有回應加 `Content-Security-Policy: default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`（需要時加 `style-src 'self' 'unsafe-inline'`）；HTML 回應的 `script-src` 是 `'self' 'nonce-<每次請求隨機>'`（Start 的 3 個內嵌 script 要用，2026-11-16 Alex 同意），靜態檔照原字串；`X-Content-Type-Options: nosniff`、`Referrer-Policy: no-referrer`；不載入外部 CDN 的 script 或字型。（AD-10）
- AR-32：陌生文字當純文字：lint 擋 `dangerouslySetInnerHTML`、`innerHTML`、`outerHTML`、`document.write`；從 qBittorrent 來的網址只有 `http:`、`https:`、`magnet:` 才做成連結，加 `rel="noopener noreferrer"`。（AD-10）

**錯誤合約和 log**

- AR-33：錯誤合約：server function 失敗回 `{ ok: false, error: { code, message } }`，不 throw；code 只能是 `not_logged_in`、`login_failed`、`login_locked`、`cloudflare_expired`、`home_unreachable`、`qbit_unreachable`、`qbit_auth_failed`、`qbit_rejected`、`timeout`、`invalid_input`、`settings_write_failed`、`bad_origin`；`message` 只能是寫死的中文；畫面文字由 `src/lib/error-text.ts` 決定。（AD-9）
- AR-34：前端唯一出口 `callFn`：加 `X-Requested-With: XMLHttpRequest`、35 秒逾時、失敗轉成 `AppError`；HTTP 401 或 200 但內容是 HTML 判成 `cloudflare_expired`；fetch 丟錯、逾時、5xx 判成 `home_unreachable`。（AD-9）
- AR-35：全域錯誤處理：六個連線類 code 只由 QueryCache 和 MutationCache 的全域 `onError` 處理，功能只處理其他的；收到 `not_logged_in`、`qbit_auth_failed` 時停掉所有輪詢、不重試。（AD-9）
- AR-36：log 遮罩：只用 `src/server/log` 一個 logger，寫 stdout，一行一筆帶時間和等級；遮掉 `password`、`cookie`、`set-cookie`、`sid`、`session`、`QBIT_*`、`SESSION_SECRET`；不記 body、header 全文、環境變數；必記啟動（版本、commit sha）、登入失敗和鎖定、重登和斷路、`qbit_unreachable`、設定檔寫入失敗。vitest 檢查遮罩，也檢查 `message` 不含 `QBIT_URL`。（AD-16）

**種子資料**

- AR-37：種子表同步：容器用自己的 `rid` 跟 qBittorrent 同步，只在最近 30 秒內有前端要資料時才同步；記憶體裡一張瘦身的種子表（欄位清單在 `src/shared/maindata.ts`），每個種子記 `changedAt` 版本號，刪掉的 hash 留墓碑 10 分鐘。（AD-6）
- AR-38：`getMaindata({ since })`：前端每 5 秒呼叫，回 `{ version, full, changed, removed, serverState, categories }`；`since` 太舊或容器重啟過回 `full: true`。分頁不在前景時停止輪詢，回前景立刻拿一次；失敗保留舊資料。（AD-6）
- AR-39：`src/lib/maindata-merge.ts` 是唯一能寫 `['maindata']` 的純函式（lint 擋 `setQueryData(['maindata']`）：`full` 時整份取代，沒變的種子保留原物件；列元件用 hash 當 key 並 memo。列表、看板、詳情、數量、速度、連線狀態都從它推出來。（AD-6）
- AR-40：檔案分頁例外：只在打開時每 5 秒抓那一個種子，key 是 `['files', hash]`；操作後重抓它。（AD-6、AD-7）
- AR-41：純函式單一來源：狀態對應只由 `src/lib/torrent-status.ts` 的 `classify()`；可見順序只由 `selectVisibleTorrents(maindata, view)`（同分再比 `added_on`，再比 `hash`）；路徑比對只由 `src/lib/paths.ts`；連線提示只由 `src/lib` 一個函式；特殊值只在 `src/lib/format.ts`；info hash 只在 `src/lib/info-hash.ts`。功能裡出現 `torrent.state ===`、`startsWith` 比路徑、自己 `sort()` 種子就是違規。（AD-13、一致性慣例）
- AR-42：操作成功後不改本機資料，只呼叫 `src/state` 唯一的 `refreshMaindata()`（取消在途請求、立刻抓一次）；「已送出、還沒反映」只走 `src/state` 的 `pendingOps`。（AD-7）
- AR-43：搬移目標由容器記：`setLocation` 成功時在種子表記 `movingTo`，`getMaindata` 跟著回，搬完就刪；前端看到 `movingTo` 消失才出完成 toast，只在發起的那台出。（AD-7）
- AR-44：動畫進行中（自動收合、刪除淡出）新資料先放著，結束再套用，跟「先不重排」用同一個凍結機制；離場動畫由列表元件負責。（AD-7、AD-13）

**設定檔**

- AR-45：設定檔放 `${CONFIG_DIR}/settings.json`，權限 600；schema 在 `src/shared/settings.ts`，第一個碰設定的 story 一次定好 `{ version: 1, categorySort: {}, categoryOrder: [], commonPaths: [] }`；遷移集中在 `src/server/settings/migrations.ts`；讀檔缺的區塊補預設值。（AD-8）
- AR-46：key 規則：分類 key 用 qBittorrent 分類名，「全部」用 `src/shared/categories.ts` 的 `ALL = '__all__'`，未分類用空字串；`categoryOrder` 不存 `ALL`，不在清單的排最後照名稱排；常用路徑用正規化後的 `path` 當身分，名字最長 50 字、最多 50 個；排序欄位只能是 `src/shared/sort-fields.ts` 的 id。（AD-8）
- AR-47：寫檔先寫暫存檔再 rename，容器裡一把鎖排隊；整檔超過 256 KB 拒絕；不存在就用預設值建立；壞掉就改名保留，再用預設值並記 log。（AD-8）
- AR-48：前端只能用冪等的小修改函式 `setCategorySort`、`setCategoryOrder`、`addCommonPath`、`updateCommonPath`、`removeCommonPath`，成功時回整份新設定寫回 `['settings']`；視窗拿回焦點時重讀；`['settings']` 和 `['maindata']` 都到了才收掉骨架。（AD-8）

**前端狀態**

- AR-49：狀態主人：目前分類、搜尋、手動選的排序、目前看的 hash 放 URL search params（zod 驗）；每分類排序、分類順序、常用路徑放 `settings.json`；上次看的分類、每分類上次看的種子、自動收合開關放 localStorage（key 表只在 `src/lib/prefs.ts`）；勾選、`pendingOps`、快捷鍵、凍結放 `src/state`；深色跟系統。（AD-13）
- AR-50：凍結順序由 `src/state` 一個 hook 持有（滑鼠停在列表、有勾選、手機在捲、動畫中）；列表、看板、「第 N 個」、鍵盤上下鍵、刪除後換下一個全部用它。（AD-13）
- AR-51：勾選由 `src/state/selection` 管：有序 hash 陣列，最早勾的在前；換分類、改搜尋時清掉；每次 maindata 更新後拿掉不存在的 hash。（AD-13）
- AR-52：快捷鍵只在 `src/state` 一份表登記；焦點在輸入框時只認 `Esc`；`Esc` 依序關對話框、搜尋、詳情；說明視窗和 tooltip 從同一份表產生。（AD-13）
- AR-53：toast 只用 `src/lib/toast.ts` 包好的三種：一般、帶按鈕、失敗帶重試。（AD-13）

**批次結果和測試**

- AR-54：批次結果形狀：收多個 hash 或多筆輸入的 server function 一律回 `{ ok: true, data: { items: Array<{ key, ok: true } | { key, ok: false, code, message }> } }`，`key` 是 hash（新增是輸入序號）；一筆都沒做才回整體錯誤。刪除、暫停繼續送完就當全部成功；`renameFiles` 依序做、第一個失敗就停並回已改好的；重試前先等下一次 maindata。（AD-14）
- AR-55：測試不碰真的 qBittorrent 寫入：自動流程、測試、CI 驗證一律用假的 qBittorrent 回應；對真的 qBittorrent 只能讀，而且只在本機開發。vitest 測 `src/lib`、`src/state` 和 server function；E2E 先不做。（AD-15、一致性慣例）
- AR-56：http 退路：複製用暫時的 textarea 當退路；info hash 用純 JS 的 SHA-1。（AD-2、一致性慣例）

**建造順序**

- AR-57：第一個 epic 是地基，依序：（1）清舊程式、Start 範本、舊檔案、CI、Dockerfile、`/healthz`；（2）`src/server/qbit`、登入和 cookie、`_define.ts` 工廠、`src/start.ts`、錯誤合約、log；（3）`src/server/sync`、`getMaindata`、`maindata-merge`、`classify`、`selectVisibleTorrents`、格式化；（4）共用元件（底部面板、電腦對話框和手機面板的切換、狀態圓圈、toast、快捷鍵登記）在第一個用到的 story 建。Epic 1 只做這條路用得到的地基，其他地基跟著功能 story 走。（建造順序）

**地基要先實測的三件事**（結果不符就回去改架構底稿，FR-7、FR-8 可能要改）

- AR-58：qBittorrent `sync/maindata` 的種子有沒有 `private` 欄位；FR-8 分「找不到檔案」和「已整理」要用。（先不決定）
- AR-59：經 Tunnel 時 `X-Forwarded-Proto` 是不是 https；AD-2 的 Secure cookie 要用。（先不決定）
- AR-60：Cloudflare Access 過期時，帶 `X-Requested-With` 的請求是回 401 還是轉址；FR-7 分「Cloudflare 登入過期」要用。（先不決定）

**Alex 手動，不是 story**

這些由 Alex 自己做，不拆成 story，也不讓自動流程做。

- 舊 qBittorrent 網址加 Cloudflare Access；確認 qBittorrent 的「執行外部程式」是空的。（結構「Alex 自己做」）
- 新網址指到容器並加 Access；上線後用過期的 Access 實測一次 server function 回 401。（結構「Alex 自己做」）
- 確認 qBittorrent 容器只掛下載資料夾和自己的 appdata；appdata 加進備份。（結構「Alex 自己做」）
- main 開分支保護：要 CI 通過、禁止 force push。（結構「Alex 自己做」）
- 在 Unraid 用範本建容器、填環境變數（`SESSION_SECRET` 用 `openssl rand -base64 32`）；更新時按檢查更新，壞了把 tag 改成上一個 commit sha。（AD-16、結構「部署」）
- 寫入功能（刪除、新增、搬移、改名、暫停繼續、改優先順序）的最後驗收在真的 NAS 上做。（NFR-15）
- 每月 60 個 commit 怎麼算，sprint planning 時由 Alex 決定。（先不決定、PRD §8 第 3 題）

### UX Design Requirements

來源是 UX `DESIGN.md`（外觀）和 `EXPERIENCE.md`（行為），兩份是同一份 UX 合約。數值以這兩份為準。

**設計 token**

- UX-DR1：表面和文字色（淺／深）：`surface-page` #F6F6F4／#1F2937、`surface` #FFFFFF／#18202C、`surface-muted` #EFEFEC／#263243、`border` #E4E4E0／#2D3A4D、`track` #E7E7E3／#334155、`text` #141414／#E9EEF5、`text-muted` #65655F／#95A1B2、`text-faint` #8C8C87／#67758A。寫成 CSS 變數，深色用同名 `-dark` 值。
- UX-DR2：動作和意思色（淺／深）：`accent` #141414／#6CB4E4、`accent-foreground` #FFFFFF／#0F1720、`selection-row` #EEF4FF／#25344A、`selection-bar` #141414／#E9EEF5、`selection-bar-foreground` #FFFFFF／#0F1720、`delete` #D93A3A／#E0707F、`delete-foreground` #FFFFFF／#0F1720、`good` #18753F／#8FD19E、`media-library` #6A45C8／#A48FE0、`media-library-tint` #6A45C81F（深色不套底）。
- UX-DR3：狀態 7 色加圖示（淺／深）：`status-downloading` #2F6FDF／#5AA9E0 向下箭頭；`status-seeding` #278A4F／#7FBF8E 向上箭頭；`status-done` #141414／#7D8BA0 打勾；`status-paused` #B26F0C／#E0AD62 兩條直線；`status-stalled` #C9581E／#E3925F 沙漏；`status-error` #D93A3A／#E0707F 驚嘆號；`status-archived` #65655F／#95A1B2 封存盒。圓圈裡的圖示用 `status-icon` #FFFFFF／#0F1720。
- UX-DR4：shadcn 變數對照：`background`→`surface-page`、`foreground`→`text`、`card`／`popover`→`surface`、`primary`→品牌 `accent`、`primary-foreground`→`accent-foreground`、`secondary`／`muted`→`surface-muted`、`muted-foreground`→`text-muted`、shadcn `accent`→`surface-muted`、`destructive`→`delete`、`border`／`input`→`border`、`ring`→品牌 `accent`。`DialogContent` 的底色從 `bg-background` 換成 `surface`。
- UX-DR5：顏色用法：狀態一律顏色加圖示；警告借 `status-stalled`，只用在圖示和 1px 外框，字用 `text`；撞名借 `status-error`；紫色只表示媒體庫；紅色只用在錯誤和刪除；不加角色以外的顏色。
- UX-DR6：主題跟系統 `prefers-color-scheme`，不做切換、不存偏好；陰影和遮罩深色沿用淺色的值。已知例外不調：深色選取列上的刪除按鈕對選取列底 2.65:1。
- UX-DR7：字型兩種：介面用 `-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang TC', 'Noto Sans TC', system-ui, sans-serif`；路徑用 `'SF Mono', ui-monospace, Menlo, monospace`。不載入外部字型。
- UX-DR8：字級 12 個角色（大小／粗細／行高）：`page-title` 26/700/1.2、`detail-hero` 28/700/1.2、`stat-value` 20/700/1.2、`row-value` 18/700/1.2、`card-value` 電腦 17 手機 22/700/1.2、`detail-name` 16/700/1.2、`column-title` 15/700/1.2、`body` 13/400/1.4、`row-name` 13/600/1.4、`meta` 12/400/1.4、`tag` 11/400/1.4、`path` 12/400/1.5 等寬字。數字一律 `tabular-nums`。
- UX-DR9：圓角：`xs` 6px（勾選框）、`bar` 9px（進度條）、`row` 14px（列表列、狀態分頁選中格）、`card` 16px（卡片、數字小卡、儲存位置區塊、toast、提示條、對話框清單框）、`panel` 22px（看板欄、詳情面板、對話框、登入卡片、手機選取列）、`sheet` 28px（底部面板上緣）、`full`（按鈕、分頁、標籤、輸入框、選取列都是膠囊）。
- UX-DR10：間距：4 倍數尺度 4、6、8、10、12、14、16px；`page-desktop` 22px 28px、`page-desktop-bottom` 110px、`page-phone` 18px 16px、`page-phone-list` 18px 12px、`content-max` 1240px、`list-column-max` 560px、`board-gap` 14px、`card-padding` 12px 14px、列內距電腦 9px 12px／手機 9px 10px、`panel-padding` 18px 22px。
- UX-DR11：陰影只有三種：看板卡片 `0 1px 2px rgba(0,0,0,.05)`；浮層 `0 12px 32px rgba(0,0,0,.28)`（選取列、看板詳情面板、對話框、toast、拖檔卡片）；底部面板 `0 -12px 40px rgba(0,0,0,.18)`。遮罩兩種：底部面板 `rgba(0,0,0,.18)`、對話框和拖檔 `rgba(0,0,0,.5)`。登入卡片沒有陰影。
- UX-DR12：hover 和不能按：列表列 hover 底色 `surface-muted`（已勾選的不變）；卡片和收合欄 hover 多 1px `text-faint` 內框；外框膠囊 hover 外框變 `text-faint`；實心按鈕 hover 透明度 90%；選單項目 hover `surface-muted`；不能按的整顆 50%、禁止游標、沒有 hover；手機按下時用 hover 的樣子。

**外框和頁首**

- UX-DR13：電腦頁首由左到右：標題「種子」（`page-title`）、下載速度膠囊、上傳速度膠囊、空白、搜尋、「新增」（`accent` 膠囊）、快捷鍵、設定。捲動內容時頁首不消失。
- UX-DR14：手機頂端四排：標題「種子」加搜尋、新增兩顆 44px 圓按鈕；速度那一行（`meta` 12px）；分類按鈕和排序按鈕（44px 膠囊，間距 8px）；只有看板時多一排狀態分頁。沒有快捷鍵按鈕。
- UX-DR15：頁首圖示按鈕 header-icon-button：36px 圓形（手機 44px），`surface` 底、`border` 外框，每顆有 `aria-label`。
- UX-DR16：速度膠囊 speed-pill：`surface` 底、`border` 外框、膠囊、內距 7px 14px；下載是藍色 ↓ 加「不限速」或上限，上傳是綠色 ↑ 加「上限 32.7」，上限字用 `text-muted`；出問題時警告圖示和外框用 `status-stalled`、字用 `text`，寫「防火牆擋住了」或「斷線了」；右邊 `text-muted` 的「最後更新 20 秒前」。手機沒有膠囊，改成標題下一行字。
- UX-DR17：提示條 alert-bar：頁首下面一整條，`surface` 底、1px `status-stalled` 外框、圓角 16px；左邊 18px `status-stalled` 圖示，字用 `text`（電腦 13px、手機 12px）；右邊外框膠囊按鈕「重試」或「重新登入」，電腦 32px、手機 44px；一次只一條。

**篩選和排序**

- UX-DR18：分類分頁 category-tabs：膠囊，名稱後接淡色數量（不含已整理）；選中的 `accent` 底加 `accent-foreground` 字（數量照 demo 用 75% 透明）；沒選中的 `surface` 底、`border` 外框；放不下時左右捲、不顯示捲軸、右邊用 24px 的 `surface-page` 到透明漸層蓋住、不折兩排；選中的分頁自動捲進看得到的範圍；tooltip 寫快捷鍵數字（只有前 9 個）；排序按鈕固定在右邊不縮字。
- UX-DR19：手機分類清單 category-sheet：底部面板，標題「分類」；列高 52px，左邊分類名（`body` 13px）、右邊數量（`text-muted`、等寬）；目前的分類粗體 700，最左邊打勾圖示；「全部」第一列；沒有種子的分類不列；最下面用 `border` 細線隔開一列「設定」加齒輪圖示。
- UX-DR20：電腦排序按鈕 sort-pill：40px 膠囊，`surface` 底、`border` 外框；左邊一個 `surface-muted` 小膠囊寫「看板」或「列表」加圖示；右邊粗體「排序：做種時間 ↓」加 ▾；「狀態」沒有箭頭；箭頭不能單獨點；條件成立時接淡色「（這個分類記住的）」；`aria-label` 和 tooltip 寫完整的字，例如「排序：做種時間，久的在前」。
- UX-DR21：手機排序按鈕：44px，只留檢視圖示、排序名稱、箭頭、▾，例如「▦ 做種時間 ↓ ▾」；「（這個分類記住的）」改成第三排下面一行 `meta` 12px、`text-muted` 的「排序換成這個分類記住的：做種時間」。
- UX-DR22：排序選單 sort-menu：電腦用 shadcn `DropdownMenu`，寬 260px，最高 70vh 在選單裡捲；上面 5 項（狀態、做種時間、加入時間、分享率、完成時間）右邊用 `text-muted` 寫 1 到 5；分隔線下「更多 ▾」原地展開 46 項，分組小標用 `tag` 11px、`text-muted`；選中項左邊打勾，名稱後接 `text-muted` 方向字加箭頭；目前排序在「更多」裡時一打開就展開並捲到它。手機用底部面板，標題「排序」，列高 52px，不顯示數字。
- UX-DR23：搜尋框 search-box：平常只有放大鏡；電腦打開時放大鏡原地往左變成 240×36px 膠囊（`surface` 底、`border` 外框），左邊放大鏡、右邊 ✕、提示字「找名字」，蓋在頁首空白上，其他按鈕不動；手機打開時 44px 高、寬度拉滿蓋住第一排，右邊一個「取消」文字按鈕。

**看板和列表**

- UX-DR24：狀態圓圈 status-circle：外圈進度環、內圈填狀態色（直徑 80%）、中間 `status-icon` 圖示（42%）；尺寸列表列 36px、看板卡片 32px、欄標題和收合欄 28px、詳情 64px；下載中、已暫停、停滯的外圈畫進度（`track` 底），其他滿圈；進度環用 SVG `stroke-dashoffset`，不用 `conic-gradient`；不能點；有給螢幕閱讀器的文字，例如「停滯，87%」。
- UX-DR25：手機狀態分頁 status-tabs：4 格平分、格距 6px、高 56px，放在 `surface-muted` 底、圓角 16px、內距 4px 的長條裡；每格上面 8px 狀態色小點加 `stat-value` 數量，下面 `tag` 11px 欄名；選中的 `surface` 底、圓角 14px、卡片陰影、欄名 `text` 700；沒選中的欄名 `text-muted`；不用 `accent` 底；沒有已整理。
- UX-DR26：看板欄 board-column：`surface-muted` 底、圓角 22px、內距 12px；標題列是 28px 狀態圓圈、欄名（`column-title`）、淡色數量；標題的 tooltip 寫這欄怎麼排（例如「做種最久的在前」）；每欄自己捲；欄距 14px；4 個工作欄等寬。
- UX-DR27：收合欄 board-column-collapsed：寬 64px；上面 28px 狀態圓圈加數量（12px、`text-muted`）；下面直書欄名（14px／700，`writing-mode: vertical-rl`）；點了展開那一欄；hover 多 1px `text-faint` 內框；能用鍵盤聚焦。
- UX-DR28：已整理欄：看板最右邊第 5 欄，平常就是收合欄的樣子（灰色封存盒圓圈、數量、直書「已整理」）；點了展開成一般欄，完成時間新的在前；只有電腦有。
- UX-DR29：看板卡片 board-card：`surface` 底、圓角 16px、內距 12px 14px、陰影 `0 1px 2px rgba(0,0,0,.05)`；第一行 32px 狀態圓圈、一行名稱（`row-name`）、最右邊 `card-value` 百分比（只有下載中、已暫停、停滯）；第二行剩餘時間和速度，或一句狀態說明；有進度的加 4px 進度條；最下面分類標籤和位置標籤；勾選框在左上角往外 6px，自帶 `surface` 底。
- UX-DR30：電腦列表列 list-row：勾選框、36px 狀態圓圈、名稱和第二行、右邊大數字；圓角 14px、內距 9px 12px；勾選時 `selection-row` 底；正在看的加 `inset 0 0 0 2px accent` 內框；勾選框的 20px 一直留著；第二行是位置標籤、大小、速度（速度 0 不寫，不放分類標籤）；大數字左邊多一欄「分享率 3.12」（1 以上用 `good`，排序是分享率時藏起來）。
- UX-DR31：列表大數字：靠右、等寬數字、最寬 160px；數字類用 `row-value` 18px；文字類（分類、路徑、Hash、註解）用 `body` 13px、`text-muted`，超過切掉，路徑從前面切，Hash 只寫前 8 碼用 `path` 字；速度 0 寫「0」用 `text-muted`。
- UX-DR32：手機列表列：沒有分享率那一欄；內距 9px 10px，頁面左右 12px；第二行放不下時先砍速度再砍大小，位置標籤一定留著、最寬佔一半加「…」；勾選框平常不佔位，進入選取時整列往右推 28px（0.2 秒）。
- UX-DR33：分類標籤 category-pill：11px、`border` 外框、`text-muted` 字、沒有底色、膠囊、內距 1px 8px；只顯示，不能點。
- UX-DR34：位置標籤 location-tag：跟分類標籤同樣大小，前面加資料夾圖示；一般位置是外框加 `text-muted`；媒體庫在淺色是 `media-library-tint` 底加 `media-library` 字、粗細 600、沒有外框；在深色只有 `media-library-dark` 粗體字加資料夾圖示，沒有底和框；只顯示，不能點。
- UX-DR35：勾選框 checkbox：20px、圓角 6px；勾選時 `accent` 底加 `accent-foreground` 勾；沒勾時 2px `text-faint` 外框；電腦平常藏著，滑上去才在角落出現，勾了第一個後全部顯示，全部取消後再藏。
- UX-DR36：進度條 progress-bar：4px 高、`track` 底、圓角 9px、填色用狀態色；只有下載中、已暫停、停滯有。
- UX-DR37：電腦選取列 selection-bar：浮在下方、置中的膠囊，`selection-bar` 底、`selection-bar-foreground` 字、浮層陰影；由左到右「已選 N 個」（粗）、「共 X GB」（淡）、取消（只有字）、改路徑（外框膠囊，字和 1px 外框用 `selection-bar-foreground`）、刪除（含檔案）（`delete` 實心，最右邊）；按鈕的焦點外框用 `selection-bar-foreground`。
- UX-DR38：手機選取列：左右各留 16px、兩排、圓角 22px；第一排「已選 3 個　共 301.2 GB」加「取消」（點擊範圍 44px）；第二排改路徑、刪除（含檔案）各佔一半，高 44px，間距 8px。

**詳情**

- UX-DR39：列表模式詳情面板 detail-panel：電腦右邊的 `surface` 面板，圓角 22px、內距 18px 22px，吃掉列表 560px 以外的寬度，中間 16px。
- UX-DR40：看板模式詳情面板：左緣對齊完成欄，寬 `calc((100% - 120px) / 4 + 78px)`（1280px 畫面約 354px），上下緣對齊看板欄，四角 22px，浮層陰影，沒有遮罩，固定頭多一顆 ✕；窄版裡數字小卡照樣 3 張一排，儲存位置區塊照三層排。
- UX-DR41：詳情固定頭 detail-header：名稱（`detail-name`，一行加「…」，電腦用 `title` 看全名）、‹、「第 N 個／共 M 個」、›、「⋯」，下面一條 `border` 細線；前後按鈕電腦 36px、手機 44px；電腦列表模式排成一排；手機和看板窄面板排成兩排（第一排名稱、⋯、✕；第二排 ‹、第 N 個、›，靠左緊貼名稱下面）；看板模式前面加欄名；到頭尾時那顆按鈕不能按；手機點名稱展開成多行，把下面內容往下推。
- UX-DR42：固定頭「⋯」選單只有一項，依目前狀態寫「暫停」或「繼續」；按了不跳 toast。
- UX-DR43：詳情分頁 detail-tabs：只有概覽、檔案；膠囊，選中的 `accent` 底；跟固定頭一起固定不捲。
- UX-DR44：詳情狀態區 detail-hero：64px 狀態圓圈加 `detail-hero` 28px 狀態色大字（狀態用語加全形空白加數字），下面一行 `text-muted` 摘要用「 · 」分開；照 EXPERIENCE 的表做全部 13 種，包括抓種子資訊中、排隊中、檢查檔案中、找不到檔案、`error`（摘要當純文字）、`unknown`「狀態不明」、已整理，和搬移中的摘要前綴。
- UX-DR45：數字小卡 stat-tile：3 張一排、`surface-muted` 底、圓角 16px、內距 12px 14px；上面淡色標題、下面 `stat-value` 20px；三組內容依狀態換；沒有值寫「0 KB/s」「不明」「沒人抓過」「沒有」。
- UX-DR46：資訊清單：概覽最下面，列分類、大小、加入時間、完成時間、已下載、已上傳；一列一項，左邊 `text-muted` 標題，右邊緊接著值，不把值推到最右邊。
- UX-DR47：檔案分頁：固定頭和分頁下面整塊是檔案清單（虛擬化）；每列有名字、大小、進度、下載勾選、優先順序控制；載入中畫 5 列骨架；讀不到寫「讀不到檔案清單」加「重試」；磁力還沒抓到資訊時寫「還在抓種子資訊，檔案清單等一下才有」；改了不跳 toast。
- UX-DR48：儲存位置區塊 save-path-block：`surface-muted` 底、圓角 16px；三層：「儲存位置」加位置標籤；完整路徑（`path` 等寬字、一行、從前面切，電腦 hover 看全文、手機點了展開）；四顆膠囊（電腦 34px、間距 8px、靠左）複製、☆ 加到常用、改路徑（唯一的 `accent` 實心）、改檔名（外框）。手機排成 2×2 等寬、高 44px。複製後字變「已複製」1.5 秒。搬移中四顆變 50% 不能按。

**底部面板、對話框、輸入框、toast**

- UX-DR49：底部面板外觀 bottom-sheet：品牌自己的元件，不用 shadcn `Sheet`；`surface` 底、上緣圓角 28px、陰影 `0 -12px 40px rgba(0,0,0,.18)`、遮罩 `rgba(0,0,0,.18)`；把手 44×5px 置中、離上緣 8px、把手帶高 20px；✕ 44px 放在內容第一排最右邊；標題 16px／700；全螢幕時上緣圓角變 0、頂端留 `env(safe-area-inset-top)`、把手留著。
- UX-DR50：底部面板行為：從下面滑上來，後面變淡；往下拉、點遮罩、按 ✕ 都能關；往上拉到全螢幕；詳情一打開 70%，拉過一半就關、沒過彈回 70%；新增固定 90%；刪除確認、改路徑、排序、分類高度跟著內容，最高 90%；改檔名一打開就全螢幕。手勢用 pointer events 跟著手指走。
- UX-DR51：電腦對話框 dialog（新增、刪除、改路徑、改檔名）：shadcn `Dialog` 結構（刪除用 `AlertDialog`）；`surface` 底、1px `border`、圓角 22px、浮層陰影、內距 24px、區塊間距 14px、遮罩 `rgba(0,0,0,.5)`；標題 18px／700（改路徑、改檔名下面多一行 `meta`、`text-muted` 的種子名稱）；右上 36px ✕（刪除沒有）；底部按鈕靠右、36px 膠囊、間距 8px，主要按鈕最右；清單放圓角 16px 的框裡自己捲，對話框不超過畫面高；寬度新增 640px、刪除 512px、改路徑 560px、改檔名 720px。
- UX-DR52：輸入框 text-input：膠囊、`surface` 底、1px `border`、字 13px；高度對話框 36px、電腦登入 40px、手機 44px（字放大到 16px）；路徑類用等寬字 12px；出錯時外框換 `delete`；新增種子的分類選單同樣子，寬 240px 加 ▾，手機拉滿。
- UX-DR53：主要按鈕 button-primary：膠囊、`accent` 底、`accent-foreground` 字；只用在頁首「新增」和儲存位置區塊的「改路徑」；改檔名和選取列的改路徑不用它。
- UX-DR54：toast 外觀：電腦右下角，離右和下各 24px，寬 356px；`surface` 底、1px `border`、圓角 16px、浮層陰影、內距 12px 8px 12px 18px；左邊 13px／600 的字，右邊 32px 外框膠囊動作按鈕，最右 28px ✕（`text-muted`）；成功的不加顏色。
- UX-DR55：toast 行為：選取列在時往上移到它上面 16px；手機在畫面上方、左右 16px、蓋在底部面板和遮罩上；純文字停 4 秒，帶按鈕停 8 秒（hover 時不倒數），失敗帶重試不自動消失；一次一個，新的換掉舊的；在眼前看得到變化的動作（暫停繼續、檔案勾選、複製）不跳。

**其他畫面元件**

- UX-DR56：拖檔遮罩 drop-overlay：電腦把 .torrent 檔拖到任何地方時，全畫面蓋 `rgba(0,0,0,.5)`；往內 16px 一圈白色 2px 虛線框、圓角 22px；正中間 `surface` 卡片（圓角 22px、浮層陰影、內距 28px 40px），裡面 40px 圖示加 `page-title` 的「放開就新增」。手機沒有。
- UX-DR57：快捷鍵說明視窗 shortcut-help：shadcn `Dialog`；從頁首快捷鍵按鈕或 `?` 打開；內容從快捷鍵登記表產生，跟 tooltip 一致；手機沒有入口。
- UX-DR58：電腦登入 login：`surface-page` 底上置中 400px 的 `surface` 卡片，圓角 22px、內距 32px 28px 28px、沒有陰影；標題「登入」（`page-title`）加一行 `text-muted`「用 qBittorrent 的帳號密碼」；帳號、密碼的標籤 13px／600 在上，輸入框 40px 膠囊；密碼框右邊 32px 眼睛按鈕；「記住我」20px 勾選、預設打勾；最下面拉滿 40px 的 `accent`「登入」。
- UX-DR59：登入錯誤和手機：出錯時密碼框外框換 `delete`，下面一行 13px／600、`status-error` 的字加圖示（帳密不對、鎖定、容器密碼不對都放這個位置）；手機是整頁、沒有卡片，從上面 96px 開始、左右 16px，輸入框、眼睛按鈕、「記住我」那一列、登入按鈕都 44px。
- UX-DR60：新增種子空的時候：200px 高大框，1.5px `text-faint` 虛線、`surface-muted` 底、圓角 16px；中間圖示加 15px／600「貼上磁力連結，或把 .torrent 檔拖進來」，下面外框膠囊「選檔案」；「新增」不能按。
- UX-DR61：新增種子清單：每列最少 40px；左邊 16px `text-muted` 圖示（連結或檔案），名字 13px／600 一行（磁力沒名字時寫開頭，用等寬 12px），最右 28px ✕；有問題的列名字變 `text-muted`，✕ 左邊多小標籤加底線按鈕：看不懂的是 `status-error` 圖示加 12px／600 `status-error` 字和「拿掉」，以前下載過的是灰色封存盒圖示加 `text-muted` 字和「打開」；順序是看不懂、以前下載過、可以加；清單最下面固定貼上列（上緣 1px `text-faint` 虛線、`surface-muted` 底、28px「選檔案」）。
- UX-DR62：新增種子底部和部分失敗：分類小標（12px／600）加分類選單，下面一行 `meta`、`text-muted`「會存到 <路徑>」，路徑用等寬字 `text`；最下面左邊「有 N 個不會加」，右邊取消和「新增 N 個」；部分失敗時清單框最上面一條 13px／600 `status-error`「5 個加好了，2 個失敗」加圖示和細線，失敗列右邊寫 12px／600 `status-error` 原因。
- UX-DR63：手機新增種子：底部面板固定 90%；每列最少 48px，小標籤換到名字下一行；「拿掉」「打開」✕ 點擊範圍 44px；貼上列 52px 寫「貼上磁力連結」，「選檔案」44px；分類選單拉滿 44px；最下面置中「有 N 個不會加」加拉滿的「新增 N 個」；沒有取消按鈕。
- UX-DR64：刪除確認 delete-confirm：標題「刪除 N 個種子？」；清單 `surface-muted` 底、圓角 16px、內距 4px，每列 8px 12px，名字 13px／600 一行加「…」，大小 13px 靠右等寬；找不到檔案的列在大小的位置寫 12px `text-muted`「找不到檔案」；「還有 N 個 ▾」是 36px 文字按鈕（600），展開後清單最高 320px 自己捲並虛擬化；`meta`、`text-muted`「其中 N 個找不到檔案，只會刪種子」；「連檔案一起刪」20px 勾選預設打勾；刪除按鈕一律 `delete` 色，字依勾選換。電腦取消在左（外框）、沒有 ✕、點外面不關；手機底部面板只有一顆拉滿的刪除按鈕，勾選那一列 44px、字 15px。
- UX-DR65：改路徑 change-path 版面：標題「改路徑」加種子名稱（一次多個時「搬 5 個種子」加「5 個種子現在在 2 個位置」）；「常用路徑」小標（12px／600），右邊 28px 外框膠囊「編輯」；清單每列 52px：20px 單選點，名稱 13px／600 加路徑（等寬 12px、`text-muted`），右邊媒體庫標籤和外框小標「目前」或「目前 N 個」；選中的列 `selection-row` 底，單選點是 2px `accent` 外圈加 `accent` 實心點；最後一列「加到常用」（已在清單時不能按，右邊 `meta`、`text-muted` 寫「框裡的路徑已經在清單裡」，手機寫「已在清單裡」）；下面「會搬到」36px 膠囊輸入框（等寬 12px）；底部取消和「搬過去」。
- UX-DR66：改路徑編輯模式和手機：「編輯」變「完成」（700）；每列沒有單選點，名稱下面點狀底線、點了變輸入框；右邊「媒體庫」20px 勾選和 32px ✕（tooltip「從常用拿掉（不動檔案）」）；「加到常用」那列藏起來。手機用底部面板、高度跟內容最高 90%、每列 56px、「編輯」和輸入框 44px（字 16px）、沒有取消按鈕。
- UX-DR67：改檔名 rename 版面：標題「改檔名」加種子名稱；劇名（拉滿）和第幾季（88px）兩個 36px 輸入框並排；下面「會放到 <路徑>/<劇名>/season1/」（等寬 12px）；預覽清單框最上面 11px `text-muted` 欄名「列」「集數」「原本　→　改成」；每列三欄 24px／60px／剩下：右對齊列號（12px、`text-muted`），60×30px 膠囊集數輸入框前面淡色「E」，名字兩行（上面原檔名等寬 12px `text-muted`，下面「→」加新檔名等寬 12px `text` 600）。
- UX-DR68：改檔名標示：猜的集數在「→」的位置換成 `status-stalled` 驚嘆號圖示，字還是 `text`；字幕列的集數欄寫「字幕」；不動的檔案只有原檔名，右邊寫「不動」；撞名列的集數外框、新檔名、「跟第 N 列同名」都用 `status-error`；底部左邊撞名時 13px／600 `status-error`「有 N 列撞名」加圖示，有猜的時 12px `text`「N 個集數是猜的，確定前看一下」加 `status-stalled` 圖示；右邊取消和「確定」，撞名時不能按。單檔時只有「新檔名」欄位，有外層資料夾時多「資料夾名稱」。
- UX-DR69：手機改檔名：全螢幕面板，上緣沒有圓角、沒有遮罩，頂端留安全區，把手留著；輸入框 44px；最下面拉滿的「確定」；沒有取消按鈕。
- UX-DR70：設定頁：沿用舊設定頁的位置和樣式（程式重寫），只有兩項：分類分頁順序（「全部」固定第一，其他用上下箭頭排）、「捲動時自動收合其他欄」開關（預設開；手機旁邊一行 `text-muted`「只在電腦版有用」）。沒有常用路徑、快捷鍵自訂、深淺色切換。

**RWD**

- UX-DR71：斷點：寬度 1024px 以上是電腦版，以下是手機版；平板直拿（例如 820px）用手機版、橫拿用電腦版；畫稿基準電腦 1280px、手機 390px；手機版不能出現橫向捲動。
- UX-DR72：電腦版面：內容最寬 1240px 置中，四邊 22px 28px，底部多留 110px 讓選取列不蓋住最後一列；由上到下是頁首、分類分頁和排序按鈕同一排、內容；看板是 4 個等寬工作欄加 64px 已整理欄，欄距 14px；列表模式左邊列表最寬 560px，中間 16px，右邊詳情面板。
- UX-DR73：手機版面：四邊 18px 16px，列表模式左右 12px；看板一次一欄、卡片一排 1 張、沒有已整理欄；詳情、刪除確認、新增、改路徑、排序、分類用底部面板；改檔名用全螢幕面板；登入是整頁。
- UX-DR74：手機沒有滑鼠才有的操作：hover 看全名改成在詳情固定頭點名稱展開；hover 看路徑改成點路徑展開；滑上去出現勾選框改成長按 0.5 秒進入選取（支援就短震）；列和卡片點名稱跟點其他地方一樣打開詳情；看板左右滑換狀態分頁；沒有拖檔和快捷鍵。

**無障礙**

- UX-DR75：鍵盤焦點：所有能按的東西（分頁、排序按鈕、看板卡片、收合欄、勾選框、圖示按鈕、對話框按鈕）用 2px `accent` 外框、間隔 2px、跟著元件圓角，只在 `:focus-visible` 出現；選單項目用 hover 底色；選取列上的按鈕外框用 `selection-bar-foreground`；深色用 `accent-dark`；跟「正在看」的 2px 內框長得不一樣。
- UX-DR76：鍵盤操作：列表模式按 `↑` `↓` 時焦點跟著正在看的那一列走；按 Tab 走到別列時那一列有外框、正在看的那一列保留內框；焦點在輸入框時只認 `Esc`。
- UX-DR77：螢幕閱讀器：狀態圓圈有文字標籤（例如「停滯，87%」）；只有圖示的按鈕都有 `aria-label`（搜尋、新增種子、上一個、下一個、快捷鍵、設定、✕、顯示密碼）；排序按鈕的 `aria-label` 寫完整方向；被「…」切掉的名稱在電腦用 `title` 拿得到全名。
- UX-DR78：點擊範圍：手機上至少 44px，包括詳情前後按鈕、儲存位置區塊的按鈕、底部面板 ✕、選取列的取消、新增清單的「拿掉」「打開」✕。
- UX-DR79：對比：文字至少 4.5；詳情狀態區 28px 粗體大字至少 3；圖示和外框至少 3（照 UX `DESIGN.md` 的對比表）；淺色 `status-paused`、`status-stalled`、`status-seeding` 不拿來當小字。
- UX-DR80：減少動態：`prefers-reduced-motion` 開著時，列進場、底部面板滑動、進度環轉進來、自動收合、詳情面板滑入、對話框放大、toast 淡入、刪除淡出、手機選取推移都關掉，直接到結果，功能照常。

**動畫**

- UX-DR81：動畫共同限制：只動 `transform` 和 `opacity`；用 CSS transition 和 Web Animations API；長列表只動畫看得到的那幾列；動畫進行中新資料先凍結，結束再套用；在真的手機上試，自動收合在平板橫拿時試。
- UX-DR82：進度環轉進來（這個 App 的「哇」）：打開 App 或換分類時，畫面上看得到的下載中、停滯、已暫停圓圈（列表列、看板卡片、詳情）外圈從 0 轉到目前進度；用 SVG `stroke-dashoffset`；只轉看得到的圓圈。
- UX-DR83：看板自動收合：在某一欄捲過 1 個欄的可見高度時觸發；錨點那張（離滑鼠最近的，卡片間空隙也算，沒有滑鼠時用第一張完整看得到的）先出現 2px `accent` 框；第 1 步 0.38 秒其他欄收成 64px 收合欄、該欄變寬、卡片維持一張一排；第 2 步 1.3 秒卡片從錨點往外散成 `repeat(auto-fill, minmax(270px, 1fr))` 一排 2 到 3 張；整段停住捲動；用 FLIP 只動 `transform`。只有往上捲到頂（已在頂再往上滾也算）或點收合欄才展開，展開後停在最上面不再自己收；只有電腦版；設定關掉時不收。
- UX-DR84：刪除淡出：刪除成功後被刪的列淡出 0.2 秒，下面的列補上來；離場動畫由列表元件負責，刪除只負責觸發。
- UX-DR85：列進場 rise：列和卡片從下面 10px 淡入，0.5 秒、`cubic-bezier(.2,.8,.2,1)`，每列晚 60ms，只做看得到的列。
- UX-DR86：底部面板滑入：0.55 秒、`cubic-bezier(.2,.85,.25,1)`，從 `translateY(60%)` 開始；拉動時跟著手指。
- UX-DR87：其他過場：看板詳情面板從右邊 24px 淡入 0.3 秒、`cubic-bezier(.2,.8,.2,1)`；對話框從 95% 放大加淡入 0.2 秒；toast 從下面 10px 淡入；選取列勾第一個時從下面滑上來、清空時滑下去；手機進入選取時整列往右推 28px，0.2 秒。

**空、載入、錯誤狀態**

- UX-DR88：第一次載入：列表和看板先畫跟列、卡片同樣大小的灰色骨架（shadcn `Skeleton`，`surface-muted` 底），不放轉圈圈；`['settings']` 和 `['maindata']` 都到了才直接換上資料。
- UX-DR89：看板欄載入下一批：欄底畫 2 張卡片骨架；200 毫秒內載完就不畫；不寫「載入中…」。
- UX-DR90：空狀態：空欄留著寫「沒有」，要處理欄空時寫「都沒問題」；在分類裡刪光或搬走最後一個的當下，顯示「這個分類沒有種子」加「新增種子」按鈕，分頁留到離開才消失；列表全空時列表和詳情面板一起換成一塊置中的空狀態；只剩已整理時分頁數字寫 0、4 欄都寫「沒有」、已整理欄照常。
- UX-DR91：搜尋沒結果：內容區中間「『關鍵字』在 <分類> 找不到」加外框按鈕「在全部裡找」；已經在「全部」時只寫「找不到『關鍵字』」；看板 4 欄和已整理欄全空時整個看板換成這句。
- UX-DR92：連線問題：連不到家裡、家裡的 qBittorrent 沒回應時，列表和看板內容透明度 50%（頁首、提示條、速度那一行不變淡），還能捲、能點開看；同時有好幾個問題時一次只顯示一個，由高到低：Cloudflare 登入過期了、連不到家裡的 NAS（家裡的 qBittorrent 沒有回應同一級）、斷線了、防火牆擋住了、最後更新 N 秒前。
- UX-DR93：送出中：被按的按鈕換字（「刪除中…」「搬移中…」「新增中…」「改名中…」「登入中…」），顏色不變、不放轉圈圈；同一個對話框的取消和 ✕ 不能按、對話框關不掉；超過 10 秒按鈕下面多一行 `meta`、`text-muted`「還在等 NAS 回應」；超過 30 秒算失敗。
- UX-DR94：失敗呈現：失敗 toast 寫寫好的中文原因加「重試」，不會自己消失；對話框不關，填的東西留著；改路徑部分失敗時只列失敗的，最上面 `status-error`「N 個開始搬了，M 個失敗」，每列名稱下面 `status-error` 原因，主要按鈕變「重試 M 個」；改檔名中途失敗寫「改好 6 個，第 7 個失敗」加「重試剩下的」。
- UX-DR95：搬移中：看板欄不變；列和卡片第二行寫「搬移中」；詳情摘要最前面加「搬移中 · 正在搬到 <新路徑> · 」；儲存位置區塊的按鈕 50% 不能按；關掉對話框、重新整理後還看得到。

**文案**

- UX-DR96：文案規則：繁體中文、台灣用語（設定、資料、檔案、介面）；句號或冒號斷句，不用破折號；詳情大字是「狀態用語加全形空白加數字」，摘要用「 · 」分開；狀態用語固定 7 個（下載中、做種中、已完成、已暫停、停滯、錯誤、已整理），看板欄名固定（要處理、下載中、做種中、完成、已整理欄）；不露原始狀態碼、Unix 時間、家裡的位址或例外原文。

### FR Coverage Map

- FR-1：Epic 1，用 qBittorrent 的帳號密碼登入 App；沒登入或過期時任何網址都顯示登入畫面，登入後回原網址
- FR-2：Epic 1，登入失敗時知道原因和下一步：帳密不對、連錯 5 次鎖 15 分鐘、容器裡的 qBittorrent 密碼不對
- FR-3：Epic 1，勾「記住我」90 天、不勾 12 小時不用再登入；瀏覽器不存帳密；沒有登出按鈕
- FR-4：Epic 1，任何畫面都看得到頁首，從頁首進搜尋、新增、快捷鍵說明和設定
- FR-5：Epic 1，隨時看到現在的下載、上傳速度和目前生效的上限，寫成「不限速」「上限 32.7」
- FR-6：Epic 1，從速度膠囊（手機是速度那一行）看出 qBittorrent 防火牆擋住、斷線，以及資料超過 10 秒沒更新
- FR-7：Epic 1，連不到家裡、Cloudflare 登入過期、家裡的 qBittorrent 沒回應時，看到分得出種類的提示條並能重試
- FR-8：Epic 1，每個種子對到固定的 7 個狀態用語和看板欄，看不到 qBittorrent 的原始狀態碼
- FR-9：Epic 1，整個 App 的數字、大小、速度、時間、分享率、百分比用同一套寫法
- FR-10：Epic 2，電腦選「狀態」排序時，用 4 個工作欄加已整理欄的看板看每個種子在哪個階段
- FR-11：Epic 2，電腦看板捲某一欄時，其他欄自動收合、那欄變寬；捲回頂或點收合欄才展開
- FR-12：Epic 2，手機選「狀態」排序時，用 4 個狀態分頁一次看一欄，左右滑換欄
- FR-13：Epic 1，選「狀態」以外的排序時用列表看種子，右邊大數字跟著排序欄位走
- FR-14：Epic 2，打開 App 或換分類時，看得到的進度環從 0 轉到目前進度
- FR-15：Epic 1，第一次載入看到骨架；空分類、空欄、只剩已整理時看到對的空狀態
- FR-16：Epic 2，點列或卡片就在原畫面看詳情（電腦詳情面板、手機底部面板），重新整理後還在
- FR-17：Epic 2，詳情任何分頁都固定顯示名稱和「第 N 個／共 M 個」，並能前後切換
- FR-18：Epic 2，在概覽分頁看到依狀態換的詳情狀態區、三張數字小卡、儲存位置區塊和資訊清單
- FR-19：Epic 2，在儲存位置區塊看到路徑和位置標籤，從這裡複製、加到常用、改路徑、改檔名
- FR-20：Epic 2，正在看的種子被刪、搬出篩選或被搜尋篩掉時，詳情換成下一個或關掉
- FR-21：Epic 3，電腦點分類分頁就篩成那個分類，排序換成記住的，列表回到最上面
- FR-22：Epic 3，手機從分類按鈕彈出的分類清單換分類，並從最下面一列進設定
- FR-23：Epic 3，在目前分類裡打字，邊打邊篩種子名稱
- FR-24：Epic 3，搜尋沒結果時一鍵改到「全部」找
- FR-25：Epic 2，排序是「狀態」就是看板，其他 50 種都是列表加詳情
- FR-26：Epic 2，從排序選單選 51 種排序之一，常用 5 個在上面，其他收在「更多」
- FR-27：Epic 2，看懂並反轉排序方向；每種排序有預設方向，同分時順序固定
- FR-28：Epic 3，每個分類（含「全部」）記住最後一次手動選的排序，存在 NAS，電腦手機共用
- FR-29：Epic 3，打開 App 回到這台裝置上次看的分類、記住的排序和上次看的種子
- FR-30：Epic 4，電腦滑上去出現勾選框，一個一個勾選多個種子，沒有全選
- FR-31：Epic 4，手機長按 0.5 秒進入選取模式
- FR-32：Epic 4，勾選後從選取列看到數量和加總大小，並開始改路徑或刪除
- FR-33：Epic 4，在刪除確認看清楚要刪哪些、會不會連檔案一起刪
- FR-34：Epic 4，關掉刪除確認等於不刪，選取留著
- FR-35：Epic 4，刪除後列淡出並跳 toast；整批成功或整批失敗，失敗能重試
- FR-36：Epic 4，從頁首「新增」或電腦拖 .torrent 檔打開新增
- FR-37：Epic 4，一次貼上或拖進多筆磁力連結和 .torrent 檔，套同一個分類送出
- FR-38：Epic 4，貼上當下就知道哪幾筆重複、看不懂或超過上限，不會加
- FR-39：Epic 4，送出後留在原畫面；成功 toast 有「去看」，部分失敗的留在清單寫原因
- FR-40：Epic 5，從詳情改一個種子的儲存路徑，或從選取列一次搬好幾個
- FR-41：Epic 5，從常用路徑點一下選目標，也能自己改「會搬到」的路徑
- FR-42：Epic 5，在卡片、列、儲存位置區塊用位置標籤看出種子在哪、是不是在媒體庫
- FR-43：Epic 5，在改路徑畫面新增、改名、刪除常用路徑，並勾「媒體庫」
- FR-44：Epic 5，在詳情按「☆ 加到常用」，一鍵把目前路徑加進常用路徑
- FR-45：Epic 5，改路徑後看得到搬移中；只搬一個時，搬完被提醒「接著改檔名」
- FR-46：Epic 5，從詳情或搬完的 toast 進改檔名，自動判斷整季批次或單檔
- FR-47：Epic 5，輸入劇名和季數，預覽並一次改好整季的檔名和 `<劇名>/season<n>/` 資料夾
- FR-48：Epic 5，確定前看出哪些集數是猜的、哪些撞名；有撞名時不能確定
- FR-49：Epic 5，只有一個影片檔的種子也能改檔名和資料夾名稱
- FR-50：Epic 5，改名後看到結果，中途失敗時能「重試剩下的」
- FR-51：Epic 2，在詳情「⋯」選單暫停或繼續一個種子（例外）
- FR-52：Epic 2，在詳情的檔案分頁看每個檔案的名字、大小、進度（例外）
- FR-53：Epic 2，在檔案分頁勾掉不下載的檔案，或改優先順序（例外）
- FR-54：Epic 3，在設定頁排分類分頁的順序，開關看板自動收合
- FR-55：Epic 3，電腦用快捷鍵搜尋、關閉、上下切換、跳分類、選常用排序
- FR-56：Epic 3，打開快捷鍵說明視窗看全部快捷鍵
- FR-57：Epic 1，送出後按鈕換字、不能重複送出；超過 10 秒提示，30 秒算失敗
- FR-58：Epic 4，操作失敗時看到原因並能重試，填的東西不會不見；多選改路徑有部分失敗畫面
- FR-59：Epic 2，toast 位置固定、一次一個，依種類決定停多久
- FR-60：Epic 2，手機用同一種底部面板看詳情和做動作，關法都一樣

## Epic List

### Epic 1：打開就看得到所有種子

Alex 在 NAS 上打開新版（在家用電腦、在外面用手機），用 qBittorrent 帳密登入，看到全部種子的列表和進度；頁首有速度，連不到家裡、Cloudflare 登入過期、qBittorrent 沒回應時有分得出種類的提示。地基只做這條路用得到的：起專案、清舊檔案、容器、登入和 session、種子資料同步、錯誤合約、CI、部署到 NAS。

**FRs covered:** FR-1、FR-2、FR-3、FR-4、FR-5、FR-6、FR-7、FR-8、FR-9、FR-13、FR-15、FR-57

**備註：** 列表先用固定順序，排序選單在 Epic 2。頁首的搜尋、新增、快捷鍵、設定入口先放好位置，功能在後面的 epic 接上。地基的 Starter template 是 Story 1.1（AR-1、AR-2）。Epic 結束時要能在 NAS 上跑（Alex 手動建容器）。

### Epic 2：看板、詳情、排序

Alex 選「狀態」排序時用看板看種子（電腦 5 欄含自動收合，手機 4 個分頁），換其他排序就是列表；點開看詳情（固定頭、概覽、儲存位置、檔案分頁），在詳情暫停或繼續、勾選檔案要不要下載。手機底部面板和 toast 在這裡第一次出現。

**FRs covered:** FR-10、FR-11、FR-12、FR-14、FR-16、FR-17、FR-18、FR-19、FR-20、FR-25、FR-26、FR-27、FR-51、FR-52、FR-53、FR-59、FR-60

**備註：** 儲存位置區塊這裡只做路徑、位置標籤（找不到常用路徑時顯示最後兩層）和複製；「改路徑」「☆ 加到常用」「改檔名」按鈕在 Epic 5 接上。

### Epic 3：找得到、記得住

Alex 用分類篩選、在目前分類裡搜尋；每個分類記住最後一次手動選的排序（存在 NAS，電腦手機共用）；打開 App 回到上次的地方；電腦有快捷鍵和說明視窗；設定頁可以排分類順序、開關自動收合。

**FRs covered:** FR-21、FR-22、FR-23、FR-24、FR-28、FR-29、FR-54、FR-55、FR-56

**備註：** 設定頁只放分類順序和自動收合兩項（AD-8、AD-13）。

### Epic 4：新增和刪除

Alex 勾選多個種子一次刪除（清楚知道刪哪些、會不會連檔案），一次貼上或拖進很多個磁力連結和 .torrent 檔新增，重複和看不懂的當下就擋下；失敗時看得到原因並能重試。

**FRs covered:** FR-30、FR-31、FR-32、FR-33、FR-34、FR-35、FR-36、FR-37、FR-38、FR-39、FR-58

**備註：** FR-58 的多選改路徑部分失敗在 Epic 5 做；這裡做刪除和新增的失敗與重試。

### Epic 5：整理檔案

Alex 改一個或一批種子的儲存路徑，用常用路徑一鍵選目標並在改路徑畫面管理它們；搬完接著整季批次改檔名或單檔改名。做完這個 epic，7 件事全部做得到。

**FRs covered:** FR-40、FR-41、FR-42、FR-43、FR-44、FR-45、FR-46、FR-47、FR-48、FR-49、FR-50

**備註：** FR-58 的多選改路徑部分失敗在這裡補上。改名用整批 renameFiles（AD-14）。

## Epic 1：打開就看得到所有種子

Alex 在 NAS 上打開新版（在家用電腦走 http、在外面用手機經 Cloudflare Tunnel），用 qBittorrent 的帳密登入，看到全部種子的列表、狀態和進度；頁首有速度和上限，連不到家裡、Cloudflare 登入過期、家裡的 qBittorrent 沒回應時，看得出是哪一種並能重試。地基只做這條路用得到的：起專案、清舊檔案、閘門和錯誤合約、登入、種子資料同步、列表、映像和部署範本。設定檔、排序記憶、常用路徑、底部面板、toast、快捷鍵登記都不在這個 epic。

**Epic 1 共用的決定（Claude 代決，Alex 可以否決）：**

- 列表固定用「加入時間，新的在前」排，右邊大數字是加入時間。排序選單在 Epic 2。
- 頁首和篩選列的入口先放在最後的位置，但一律 disabled（整顆 50%、禁止游標、沒有 hover、不能聚焦，`aria-label` 照寫）：電腦是搜尋、新增、快捷鍵、設定、排序按鈕；手機是搜尋、新增、分類按鈕、排序按鈕。後面的 epic 接上功能時只要拿掉 disabled，版面不跳。
- 電腦列表在 Epic 1 先佔滿內容寬度（最寬 1240px），列沒有點擊動作；Epic 2 加詳情面板時改成左邊 560px。
- 位置標籤先用儲存路徑的最後兩層當名字，常用路徑和媒體庫樣式在 Epic 5 接上。

### Story 1.1：用官方範本重起專案、清掉舊檔案

身為 Alex，我想要專案換成官方 TanStack Start 範本、舊程式和舊設定清乾淨、每個 PR 都有 CI 把關，這樣之後每張 story 都站在同一個乾淨的地基上。

**涵蓋：** AR-1、AR-2、AR-3、AR-4、AR-5、AR-6、AR-7（不裝 i18n 套件）、AR-10、AR-11（映像以外的檢查）、AR-13（PR 的 workflow）、AR-32（lint 部分）、AR-55（vitest 設定）、NFR-17
**規格：** 架構底稿〔設計模式〕〔一致性慣例〕〔技術〕〔結構／部署〕的「舊檔案」〔建造順序〕第 1 步；AD-1、AD-5（`/healthz`）、AD-10、AD-11、AD-16

**Acceptance Criteria:**

**Given** 目前 repo 是舊的 Vite 版加 Auto Claude 和 Cloudflare 的工具檔
**When** 用官方 TanStack Start 範本（SPA 模式，1.169.x）重起專案
**Then** 舊的 `src/`、舊的 vite、vitest、i18n 設定和翻譯檔都換成範本的或刪掉，`wrangler.jsonc`、`.github/workflows/release.yml` 刪掉
**And** 根目錄其他舊工具檔（Auto Claude 的狀態檔和 json、`init.sh`、測試報告類 `.md`、`verify-translations.cjs`、`docs/PERFORMANCE_TESTING.md`、範本用不到的 `public/` 圖）一併刪掉，PR 說明逐一列出刪了哪些
**And** `DESIGN.md`、`LICENSE`、`_bmad/`、`_bmad-output/`、`.claude/`、`.env` 不動

**Given** 新的 `package.json`
**When** 檢查版本
**Then** 版本符合 AR-3 的表，框架套件寫精確版本、沒有 `^`；`.nvmrc` 是 26；沒有 i18n 套件、動畫套件、手勢套件
**And** PR 說明列出這次參考的官網文件網址，版本跟 `package.json` 一致（AD-11）

**Given** 新專案
**When** 看 `CLAUDE.md`、`README.md`、`.env.example`、`.gitignore`
**Then** `CLAUDE.md` 重寫成指向架構底稿、PRD、UX 規格，指令用 Node 26，保留「repo 公開，不寫帳密、IP」和「私人分類只寫代稱 X、mteam-X」
**And** `README.md` 改成一段說明（新版是什麼、本機怎麼跑），沒有 IP 和帳密
**And** `.env.example` 只有 `QBIT_URL`、`QBIT_USERNAME`、`QBIT_PASSWORD`、`SESSION_SECRET`、`APP_ORIGINS`、`SAVE_ROOTS`、`CONFIG_DIR` 和佔位字；`.gitignore` 加上 `config/`

**Given** AR-5 的目錄分層
**When** 跑 lint
**Then** ESLint 的 import 邊界規則照底稿〔設計模式〕那張圖，畫外的方向和 `src/features/` 功能之間互相 import 都報錯
**And** lint 擋 `dangerouslySetInnerHTML`、`innerHTML`、`outerHTML`、`document.write`
**And** PR 說明附上 lint 擋下違規範例的輸出（範例檔驗完刪掉，不留在 repo）

**Given** 容器在跑
**When** 對 `GET /healthz` 發請求（沒帶 cookie）
**Then** 回 200 和 `ok`，不碰 qBittorrent、不讀設定檔
**And** 這是整個專案唯一的 server route；vitest 測這個行為

**Given** 開一個 PR
**When** CI 跑
**Then** 依序跑 lint、typecheck、vitest、`npm audit --omit=dev --audit-level=high`、build，任何一項失敗整個 CI 就紅；舊的 `test.yml` 換掉
**And** workflow 不用 `pull_request_target`，預設 `contents: read`，第三方 action 釘 commit SHA
**And** vitest 至少有一個 `src/lib` 的範例測試能跑；`npm run dev` 起得來，首頁先放暫時的「種子」標題頁，看不到舊介面

### Story 1.2：伺服器閘門、錯誤合約和 log

身為 Alex，我想要容器在碰任何資料之前，先擋掉來源不對、沒登入、格式不對的請求，錯誤只有一種形狀，log 不漏秘密，這樣後面每個 server function 都自動安全。

**涵蓋：** AR-17、AR-18、AR-22（cookie 簽章和驗證）、AR-23、AR-25、AR-26、AR-27（64 KB 上限）、AR-31、AR-33（容器端）、AR-36、NFR-10、NFR-11、NFR-12、NFR-16（缺環境變數拒絕啟動）
**規格：** 架構底稿〔建造順序〕第 2 步；AD-2、AD-5、AD-9、AD-10、AD-12、AD-16

**Acceptance Criteria:**

**Given** 環境變數缺 `QBIT_URL`、`QBIT_USERNAME`、`QBIT_PASSWORD`、`SESSION_SECRET`、`APP_ORIGINS`、`SAVE_ROOTS` 任何一個，或 `SESSION_SECRET` 短於 32 bytes、等於 `.env.example` 的佔位字
**When** 容器啟動
**Then** 印出哪個變數有問題（不印值）並以非 0 結束
**And** `CONFIG_DIR` 沒設時預設 `/config`；vitest 每種情況各測一次

**Given** `src/server/log` 是唯一的 logger
**When** 記一筆帶 `password`、`cookie`、`set-cookie`、`sid`、`session`、`QBIT_PASSWORD`、`SESSION_SECRET` 的資料
**Then** 輸出到 stdout，一行一筆帶時間和等級，這些欄位的值都被遮掉
**And** 不記請求 body、header 全文、環境變數；啟動時記版本和 commit sha；vitest 檢查遮罩

**Given** `src/shared` 定義錯誤合約
**When** 任何 server function 失敗
**Then** 回 `{ ok: false, error: { code, message } }`，不 throw；`code` 只能是 AR-33 的 12 個之一；`message` 是寫死的中文
**And** vitest 用假的 `QBIT_URL` 檢查每個 code 的 `message` 都不含它，也不含例外原文

**Given** `src/server/auth` 簽發和驗證 `rt_session`
**When** 驗一個 cookie
**Then** 簽章不對、被改過、`exp` 過了都當沒登入
**And** cookie 是 HttpOnly、SameSite=Strict；`getRequestProtocol()` 是 https 才加 Secure
**And** vitest 測：`exp` 前 1 秒有效、後 1 秒無效；記住我 90 天、不勾 12 小時；換 `SESSION_SECRET` 後舊 cookie 全部無效

**Given** `src/server/functions/_define.ts` 工廠
**When** 用它建 server function
**Then** 工廠內建登入檢查、zod 驗輸入（沒過回 `invalid_input`）、對 qBittorrent 30 秒逾時（回 `timeout`）、把例外轉成錯誤合約
**And** lint 擋 `_define.ts` 以外的地方呼叫 `createServerFn`
**And** vitest 自動列出 `src/server/functions/` 底下所有 server function（之後新增的也自動納入），沒登入呼叫時，除了 `login` 每一個都回 `not_logged_in`

**Given** `src/start.ts`
**When** 有請求進來
**Then** 明確掛 `createCsrfMiddleware`，`failureResponse` 回 JSON 的 `bad_origin`
**And** 全域 request middleware 檢查 `Host`、`Origin` 在 `APP_ORIGINS` 裡、有 `X-Requested-With`，`/healthz` 例外
**And** 先檢查來源和 cookie，再讀 body；body 超過 64 KB 回 `invalid_input`，先看 `Content-Length`，沒有時邊讀邊算
**And** vitest 測：錯的 `Origin`、`Host` 不在清單、沒有 `X-Requested-With`、超過 64 KB，都被擋下而且 handler 沒被呼叫

**Given** 任何回應（含 `/healthz` 和首頁）
**When** 檢查回應標頭
**Then** 有 AR-31 的 CSP、`X-Content-Type-Options: nosniff`、`Referrer-Policy: no-referrer`，沒有任何 `Access-Control-*` 標頭
**And** 沒登入、來源不對時回的 HTTP 狀態都不是 401（401 留給 Cloudflare Access）
**And** 頁面不載入任何外部 CDN 的 script 或字型

### Story 1.3：前端地基：設計 token、shadcn 對照、深色跟系統、callFn 和全域錯誤處理

身為 Alex，我想要先有淺深兩套設計 token、前端唯一的呼叫出口和全域錯誤處理，這樣之後每個畫面長得一致，錯誤也只在一個地方處理。

**涵蓋：** NFR-6（深色跟系統）、NFR-7（焦點外框）、NFR-8（`error-text.ts` 的文字）、AR-33（`error-text.ts`）、AR-34、AR-35（`not_logged_in`、`qbit_auth_failed` 停輪詢）、UX-DR1 到 UX-DR12、UX-DR75、UX-DR96（`error-text.ts` 的文字）
**規格：** EXPERIENCE〔Voice and Tone〕〔Accessibility Floor〕；UX DESIGN.md〔Colors〕〔Typography〕〔Layout & Spacing〕〔Elevation & Depth〕〔Shapes〕〔Components〕的 focus-ring；AD-9、AD-13

**這張沒有新畫面：** 只做樣式地基和前端呼叫出口，登入畫面在 Story 1.4。驗收靠 vitest 和暫時的「種子」標題頁截圖。

**Acceptance Criteria:**

**Given** 新專案還沒有任何畫面樣式
**When** 裝 shadcn/ui 並寫全域樣式
**Then** UX-DR1 到 UX-DR3 的顏色淺深兩套寫成 CSS 變數，深色只跟 `prefers-color-scheme`，沒有切換、不存偏好
**And** vitest 讀全域樣式檔，檢查 UX-DR1 到 UX-DR3 的每個顏色變數在淺色和深色兩套都有定義，少一個就失敗
**And** shadcn 變數照 UX-DR4 對照，`DialogContent` 底色換成 `surface`；vitest 檢查 UX-DR4 對照表的每個 shadcn 變數都指到對的 token
**And** 字型、12 個字級、圓角、間距、陰影、遮罩、hover 和不能按照 UX-DR7 到 UX-DR12 寫成 Tailwind token；數字一律 `tabular-nums`；不載入外部字型
**And** 鍵盤焦點是 2px `accent` 外框、間隔 2px，只在 `:focus-visible` 出現，深色用 `accent-dark`
**And** PR 附暫時的「種子」標題頁在系統淺色和深色下各一張截圖

**Given** 前端唯一出口 `callFn`
**When** 呼叫 server function
**Then** 加 `X-Requested-With: XMLHttpRequest`、35 秒逾時，失敗轉成 `AppError`
**And** HTTP 401 或 200 但內容是 HTML 判成 `cloudflare_expired`；fetch 丟錯、逾時、5xx 判成 `home_unreachable`；vitest 用假的 fetch 每種各測一次，寫成一張錯誤分類表逐列跑

**Given** `src/lib/error-text.ts`
**When** 畫面要顯示錯誤文字
**Then** 只從這個檔案拿，AR-33 的 12 個 code 都有預設文字（vitest 檢查）
**And** 文字照 UX-DR96：繁體中文、不用破折號、不露家裡的位址或例外原文（vitest 用假的 `QBIT_URL` 檢查）

**Given** QueryCache 和 MutationCache 的全域 `onError`
**When** 任何呼叫回 `not_logged_in` 或 `qbit_auth_failed`
**Then** 停掉所有輪詢、不重試；把「要登入」、原因（是哪一個 code）和目前網址記在 `src/state`；功能程式不處理這兩個 code
**And** vitest 用假的 fetch 和一個假的輪詢 query 測：收到後不再呼叫、不重試，記下的原因和網址正確
**And** 登入畫面讀這份狀態，在 Story 1.4 做

### Story 1.4：登入畫面

身為 Alex，我想要用 qBittorrent 的帳密登入新版，勾「記住我」後 90 天不用再登入，這樣在家和在外面都能直接打開。

**涵蓋：** FR-1、FR-2、FR-3、FR-57（登入按鈕）、NFR-6、NFR-7、NFR-8、NFR-9、AR-21、AR-22（發 cookie）、AR-35（顯示登入畫面）、UX-DR52、UX-DR58、UX-DR59、UX-DR77（顯示密碼）、UX-DR78、UX-DR79、UX-DR93（登入）、UX-DR96
**規格：** PRD FR-1、FR-2、FR-3、FR-57；EXPERIENCE〔登入 login〕〔State Patterns〕「送出中」「不能按」「qBittorrent 還沒登入、自動重登失敗」〔Voice and Tone〕〔Accessibility Floor〕；UX DESIGN.md〔Components〕的 login、text-input、focus-ring；AD-2、AD-3、AD-9、AD-13
**依賴：** Story 1.3 的設計 token、`callFn`、`error-text.ts` 和全域 `onError`。

**Acceptance Criteria:**

**Given** 沒登入或 `rt_session` 過期
**When** 打開任何網址
**Then** 顯示登入畫面：電腦是置中 400px 卡片，手機是整頁，版面照 UX-DR58、UX-DR59
**And** 有標題「登入」、「用 qBittorrent 的帳號密碼」、帳號、密碼、眼睛按鈕（`aria-label`「顯示密碼」）、「記住我」（預設打勾）、「登入」；沒有 qBittorrent 位址欄位，也沒有登出按鈕
**And** 受保護的路由進入前確認登入，做法照 Start 1.169 官網的認證那頁，用工廠建的 server function，不新增 server route

**Given** 登入畫面，帳密正確
**When** 按「登入」
**Then** 按鈕換成「登入中…」不能再按，成功後不跳 toast，回到原本的網址
**And** 原網址只接受站內路徑：`//` 開頭、帶協定或外部網域的都改回首頁
**And** 勾「記住我」的 cookie `exp` 是 90 天，不勾是 12 小時（vitest 在容器端驗）

**Given** 帳號或密碼錯
**When** 按「登入」
**Then** 密碼欄下面寫「帳號或密碼不對」（13px／600、`status-error` 加圖示），密碼框外框換 `delete`，密碼清空，焦點回到密碼欄，帳號留著

**Given** 已經連錯 5 次（全域計數，不看 `CF-Connecting-IP`、`X-Forwarded-For`）
**When** 第 6 次送出，就算帳密正確
**Then** 回 `login_locked`，密碼欄下面同一個位置寫「錯太多次了，15 分鐘後再試」
**And** 15 分鐘後恢復；登入成功時計數歸零；vitest 用假時鐘測鎖定、到期、歸零

**Given** 容器比對帳密
**When** 有人送出登入
**Then** 兩邊先 SHA-256 再 `timingSafeEqual`，輸入絕不轉給 qBittorrent（vitest 確認假的 qBittorrent client 在登入時一次都沒被呼叫）
**And** 登入失敗和鎖定照 AR-36 記 log，不記帳號密碼的值

**Given** 已登入，Story 1.3 的全域 `onError` 記下 `qbit_auth_failed`
**When** 畫面更新
**Then** 顯示登入畫面，密碼欄下面寫「容器裡的 qBittorrent 密碼不對，要改 NAS 上的容器設定」，表單照樣能用
**And** 記下的是 `not_logged_in` 時一樣顯示登入畫面，登入成功後回到記下的網址

**Given** 按了「登入」
**When** 10 秒還沒回應
**Then** 按鈕下面多一行 `meta`、`text-muted`「還在等 NAS 回應」
**And** 失敗或逾時後按鈕恢復能按，帳號留著；連線類錯誤（`home_unreachable`、`cloudflare_expired`）由全域處理記下，登入畫面的提示條在 Story 1.7 接上

**Given** 登入成功後
**When** 檢查 localStorage、sessionStorage、IndexedDB 和 `document.cookie`
**Then** 都找不到帳號或密碼（明文或雜湊都不行），JS 讀不到 `rt_session`
**And** PR 說明附檢查方法和結果，附登入畫面（含錯誤狀態和鍵盤焦點）的電腦淺色、電腦深色、手機 390px 截圖；文字和圖示對比照 UX DESIGN.md 的對比表；登入後先停在暫時的「種子」標題頁

### Story 1.5：容器保管 qBittorrent 連線和種子表

身為 Alex，我想要容器自己保管 qBittorrent 的登入和一份種子表，前端只拿變動，這樣電腦和手機同時開也不會每 5 秒拉一次全部 4165 個種子，容器 IP 也不會被 qBittorrent 封鎖。

**涵蓋：** AR-19、AR-20、AR-24（只有 `getMaindata`）、AR-37、AR-38（容器端）、AR-55、AR-58、NFR-2（容器端）、NFR-15
**規格：** 架構底稿〔建造順序〕第 2、3 步；AD-4、AD-5、AD-6、AD-15；PRD FR-5（`serverState` 要有的欄位）

**Acceptance Criteria:**

**Given** 容器第一次要跟 qBittorrent 說話
**When** `src/server/qbit` 用環境變數登入
**Then** 參數用 `URLSearchParams` 或 `FormData` 組；回 `Ok.` 而且有 `Set-Cookie` 才算成功
**And** cookie 名稱和值照 `Set-Cookie` 原樣保存在記憶體（vitest 用不叫 `SID` 的 cookie 名測）

**Given** 10 個請求同時遇到 qBittorrent 回 403
**When** 容器處理
**Then** 只送一次 `auth/login`，其他請求等它的結果，各自重送一次

**Given** 重登回 `Fails.`，或 `auth/login` 回 403
**When** 之後再有任何請求
**Then** 直接回 `qbit_auth_failed`，不再呼叫 `auth/login`，直到容器重啟（vitest 數呼叫次數）
**And** 重登和斷路照 AR-36 記 log

**Given** qBittorrent 連不到或 30 秒沒回
**When** server function 呼叫它
**Then** 分別回 `qbit_unreachable` 和 `timeout`，`message` 不含位址；`qbit_unreachable` 記 log
**And** qBittorrent client 只露出有名字的方法，沒有 `/api/v2/*` 通用轉送，也沒有任何改 qBittorrent 設定的 API

**Given** `src/server/sync` 用自己的 `rid` 同步
**When** 最近 30 秒內沒有前端呼叫 `getMaindata`
**Then** 不向 qBittorrent 同步；有人呼叫時才恢復（vitest 用假時鐘）
**And** qBittorrent 的增量（部分欄位、`torrents_removed`、`full_update: true`）都正確套進種子表

**Given** 記憶體裡的種子表
**When** 種子變動或被刪
**Then** 只留 `src/shared/maindata.ts` 列的欄位（先放 Epic 1 畫面和 `classify()` 用得到的；之後的 story 要新欄位就加在這份清單），每個種子記 `changedAt` 版本號
**And** 刪掉的 hash 留墓碑 10 分鐘

**Given** 前端呼叫 `getMaindata({ since })`（GET、沒有副作用、zod 驗 `since`）
**When** `since` 是空的、比墓碑保留期還舊、或容器重啟過
**Then** 回 `{ version, full: true, ... }` 的整份
**And** `since` 是目前版本時 `changed`、`removed` 都是空的；其他情況只回這之後的變動和刪掉的 hash
**And** `serverState` 有下載、上傳速度、目前生效的上限（替補上限生效時是替補值，欄位照 qBittorrent 5.1.4 文件確認）和 `connection_status`；`categories` 一起回

**Given** 所有測試
**When** 跑 vitest 和 CI
**Then** 一律用假的 qBittorrent 回應，不對真的 qBittorrent 做任何寫入
**And** AR-58：本機開發時只讀一次真的 `sync/maindata`，確認種子有沒有 `private` 欄位，結果寫在 PR 說明；沒有這個欄位時在 PR 標「要改架構底稿」，Story 1.6 的私人種子規則等 Alex 決定再做

### Story 1.6：前端種子資料、狀態和數字的純函式

身為 Alex，我想要前端每 5 秒只拿變動，所有地方都從同一份資料算狀態、數字和連線提示，這樣列表、速度和提示永遠對得起來。

**涵蓋：** FR-8、FR-9、NFR-2、NFR-8、NFR-12、AR-35（連線類 code）、AR-38（前端）、AR-39、AR-41（`classify()`、`selectVisibleTorrents`、連線提示、`format.ts`、`paths.ts` 的最後兩層）、AR-55
**規格：** PRD FR-8、FR-9；EXPERIENCE〔qBittorrent 狀態對應〕〔數字寫法〕〔排序和檢視〕〔State Patterns〕「提示條的優先順序」；AD-6、AD-9、AD-13

**Acceptance Criteria:**

**Given** 已登入
**When** App 開著
**Then** 每 5 秒經 `callFn` 呼叫 `getMaindata({ since })`；分頁不在前景時停，回前景立刻抓一次
**And** 失敗時保留舊資料並記住最後一次成功的時間；收到 `not_logged_in`、`qbit_auth_failed` 時停止輪詢
**And** 「立刻抓一次」只在 `src/state` 建一個 `refreshMaindata()`（取消在途請求、立刻抓一次，AR-42）；Story 1.7 的「重試」和之後所有操作都呼叫它，不另做

**Given** `src/lib/maindata-merge.ts`
**When** 套用一次回應
**Then** `full` 時整份取代，否則套 `changed`、拿掉 `removed`；沒變的種子保留原本的物件（vitest 用同一個參考檢查）
**And** 它是唯一能寫 `['maindata']` 的地方，lint 擋 `setQueryData(['maindata']`

**Given** `src/lib/torrent-status.ts` 的 `classify()`
**When** 輸入 EXPERIENCE 狀態對應表的每一種 qBittorrent 狀態
**Then** 回狀態用語（7 個之一）、看板欄、第二行小字，跟表一致；vitest 每一列都有，包括 `stoppedUP`、私人和一般的 `missingFiles`、`unknown`、`moving`
**And** `error` 的第二行先固定回傳「qBittorrent 回報錯誤」（qBittorrent 5.1.4 沒有錯誤原因欄位，2026-11-16 Alex 決定；真的原因在 Story 2.10）；功能程式裡沒有 `torrent.state ===`

**Given** `src/lib/format.ts`
**When** 格式化數字、大小、速度、剩餘時間、日期、離現在多久、長度、分享率、百分比
**Then** 照 FR-9 每一條，vitest 測邊界：1,023 GB 和 1,024 GB、「.0」不寫、1,023 KB/s 和 1,024 KB/s、MB/s 10 上下、`eta` 的無限值寫「剩餘時間不明」、今天、昨天、今年、往年（固定時鐘和時區）、99.9% 寫「99%」、分享率無限大寫「∞」、沒有值寫「沒有」
**And** 特殊值只在這個檔案處理

**Given** `selectVisibleTorrents(maindata, view)`
**When** Epic 1 呼叫它
**Then** 回排好的 hash 陣列：固定「加入時間，新的在前」，同分再比 `added_on`、再比 `hash`；不含已整理
**And** 參數形狀留給之後的分類、搜尋、排序，Epic 1 只實作這一種順序；vitest 測同分和已整理

**Given** `src/lib/paths.ts`
**When** 要顯示位置標籤的名字
**Then** 先取儲存路徑的最後兩層（vitest 測結尾斜線、根目錄、只有一層）；常用路徑的比對留給 Epic 5

**Given** `src/lib` 唯一的連線提示函式
**When** 輸入最近的錯誤 code、`connection_status`、最後成功時間、現在時間
**Then** 照優先順序只回一個：Cloudflare 登入過期了、連不到家裡的 NAS（家裡的 qBittorrent 沒有回應同一級）、斷線了、防火牆擋住了、最後更新 N 秒前（超過 10 秒才有）
**And** vitest 測每一種和同時發生的組合

**Given** QueryCache 和 MutationCache 的全域 `onError`
**When** 收到 `cloudflare_expired`、`home_unreachable`、`qbit_unreachable`
**Then** 只在這裡記成連線狀態，功能程式不處理；下一次成功就清掉
**And** 收到 `bad_origin` 當程式錯誤（`console.error`），不導去登入
**And** 「全部」的數量不含已整理，由 `src/lib` 的 selector 算

### Story 1.7：頁首、全域速度和連線提示條

身為 Alex，我想要任何畫面都看到頁首的速度和上限，連線出問題時看得出是哪一種並能重試，這樣在外面也分得出是網路、Cloudflare 還是家裡的問題。

**涵蓋：** FR-4、FR-5、FR-6、FR-7、NFR-5、NFR-7、UX-DR13、UX-DR14、UX-DR15、UX-DR16、UX-DR17、UX-DR18（只有「全部」）、UX-DR20、UX-DR21（disabled 的樣子）、UX-DR71、UX-DR72、UX-DR73（頁首部分）、UX-DR92
**規格：** PRD FR-4 到 FR-7；EXPERIENCE〔Information Architecture〕〔全域速度〕〔State Patterns〕「連不到家裡」「Cloudflare 登入過期」「提示條的優先順序」；UX DESIGN.md〔Layout & Spacing〕〔Components〕的 header-icon-button、speed-pill、alert-bar、category-tabs、sort-pill；AD-6、AD-9、AD-13

**Acceptance Criteria:**

**Given** 寬度 1024px 以上
**When** 看任何登入後的畫面
**Then** 頁首由左到右：「種子」、下載速度膠囊、上傳速度膠囊、空白、搜尋、「新增」、快捷鍵、設定；捲動內容時頁首不消失
**And** 內容最寬 1240px 置中，四邊 22px 28px；頁首下面一排是「全部」分頁（選中、數量不含已整理）和排序按鈕「列表｜排序：加入時間 ↓」

**Given** 寬度小於 1024px
**When** 看任何登入後的畫面
**Then** 第一排「種子」加搜尋、新增兩顆 44px 圓按鈕；第二排速度那一行；第三排分類按鈕「全部 ▾」和排序按鈕「加入時間 ↓ ▾」；沒有快捷鍵按鈕
**And** 390px 寬時沒有橫向捲動

**Given** 頁首和篩選列的入口
**When** 功能還沒做
**Then** 搜尋、新增、快捷鍵、設定、分類按鈕、排序按鈕都顯示在最後的位置但 disabled（50%、禁止游標、沒有 hover、不能聚焦），`aria-label` 照 UX-DR77

**Given** `['maindata']` 的 `serverState`
**When** 速度或上限變了
**Then** 電腦膠囊寫「↓ 9.95 MB/s　不限速」「↑ 2.38 MB/s　上限 32.7」，上限字用 `text-muted`；手機在標題下面一行字
**And** 速度是 0 寫「↓ 0 KB/s」；替補上限開始或結束後，下一次資料到了上限字就跟著換；文字一律經 `format.ts`

**Given** `connection_status` 是 firewalled 或 disconnected
**When** 畫頁首
**Then** 電腦膠囊的警告圖示和外框變 `status-stalled`，字用 `text`，寫「防火牆擋住了」或「斷線了」
**And** 手機速度那一行整行換成優先順序最高的一個提示

**Given** 超過 10 秒沒拿到新資料
**When** 畫頁首
**Then** 電腦在膠囊右邊、手機接在速度那一行後面寫「最後更新 20 秒前」（`text-muted`），拿到新資料就消失

**Given** 連線提示函式回 `home_unreachable` 或 `qbit_unreachable`
**When** 畫頁首下面
**Then** 提示條寫「連不到家裡的 NAS，最後更新 3 分前」或「家裡的 qBittorrent 沒有回應」加「重試」，按了立刻抓一次
**And** 內容區透明度 50%，還能捲；頁首、提示條、速度那一行不變淡

**Given** 連線提示函式回 `cloudflare_expired`
**When** 畫頁首下面
**Then** 提示條寫「Cloudflare 登入過期了」加「重新登入」，按了重新整理頁面
**And** 一次只有一條提示條；文字不出現家裡的位址或原始錯誤；登入畫面也看得到同一種提示條

**Given** 本機用假的 qBittorrent 回應
**When** 截圖
**Then** PR 附電腦和手機 390px、淺色和深色的平常、防火牆擋住、最後更新 N 秒前、連不到家裡、Cloudflare 登入過期截圖；不碰真的 qBittorrent 寫入

### Story 1.8：種子列表、骨架和空狀態

身為 Alex，我想要打開就看到全部種子的列表，每列看得出狀態、進度、大小和位置，這樣不用開 VueTorrent 就知道下載好了沒。

**涵蓋：** FR-13、FR-15、FR-8（畫面）、FR-9（畫面）、NFR-1、NFR-5、NFR-6、NFR-7、NFR-10（純文字）、AR-7、AR-50（滑鼠停在列表、手機在捲）、UX-DR24、UX-DR30、UX-DR31、UX-DR32、UX-DR34（一般位置）、UX-DR77（狀態圓圈文字）、UX-DR88、UX-DR90（列表全空）
**規格：** PRD FR-13、FR-15；EXPERIENCE〔排序和檢視〕〔數字寫法〕的大數字表〔Component Patterns〕的 list-row、status-circle〔State Patterns〕「第一次載入」「分類裡沒有種子」；UX DESIGN.md〔Components〕的 list-row、status-circle、location-tag；AD-6、AD-10、AD-13

**Acceptance Criteria:**

**Given** 已登入，`['maindata']` 到了
**When** 打開首頁
**Then** 列表照 `selectVisibleTorrents` 的順序（加入時間，新的在前），不含已整理
**And** 電腦每列：20px 勾選框空位（藏著，列不跳）、36px 狀態圓圈、名稱一行加「…」（`title` 看全名）、第二行位置標籤、大小、速度（0 不寫、不放分類標籤）、右邊大數字是加入時間（「今天 09:12」「11/05」「2025/07/18」），大數字左邊「分享率 3.12」（1 以上用 `good`）
**And** 電腦列表佔滿內容寬度；列沒有點擊動作，也還不做 hover 底色

**Given** 寬度小於 1024px
**When** 看列表
**Then** 沒有分享率那一欄，內距 9px 10px、頁面左右 12px，勾選框不佔位
**And** 第二行放不下時先砍速度再砍大小，位置標籤一定留著、最寬佔一半加「…」

**Given** 每一列的狀態圓圈
**When** 畫出來
**Then** 顏色加圖示照 `classify()` 的結果；下載中、已暫停、停滯的外圈用 SVG `stroke-dashoffset` 畫目前進度（`track` 底），其他滿圈；這個 story 不做轉進來的動畫（Epic 2）
**And** 圓圈不能點，有螢幕閱讀器文字，例如「停滯，87%」

**Given** 種子名稱或 `error` 原因裡有 `<script>`、HTML 標籤或 `javascript:`
**When** 畫在列上
**Then** 原樣當文字顯示，不被執行

**Given** 4165 個假種子
**When** 捲列表
**Then** 用 `@tanstack/react-virtual`，只畫看得到的列附近（DOM 裡的列少於 100 個），捲起來順
**And** 列元件用 hash 當 key 並 memo，沒變的種子不重畫

**Given** 資料每 5 秒更新
**When** 電腦滑鼠停在列表上，或手機手指正在捲
**Then** 數字照常更新，但列的位置先不換；情況結束後重排一次
**And** 凍結由 `src/state` 一個 hook 持有，vitest 測它的判斷

**Given** 第一次載入，`['maindata']` 還沒到
**When** 打開首頁
**Then** 畫跟列同樣大小的灰色骨架（shadcn `Skeleton`、`surface-muted`），不放轉圈圈，資料到了直接換上
**And** 等設定檔的條件留給 Epic 3（Epic 1 沒有 `['settings']`）

**Given** 列表一個都沒有（包括只剩已整理）
**When** 資料到了
**Then** 內容區換成一塊置中的空狀態「這個分類沒有種子」加「新增種子」按鈕（跟頁首「新增」一樣先 disabled，Epic 4 接上），「全部」分頁數字寫 0
**And** PR 附電腦和手機 390px、淺色和深色的載入中、有資料（含每種狀態和超長名稱）、空狀態截圖，用假的 qBittorrent 回應，手機沒有橫向捲動

### Story 1.9：映像、CI 推送和 NAS 部署範本

身為 Alex，我想要合併到 main 後 CI 自動建好映像，照一份範本說明就能在 Unraid 建容器、經 Tunnel 從手機打開，這樣 Epic 1 做完我就能真的開始用。

**涵蓋：** AR-8、AR-9、AR-11（映像和 `docker run` 檢查）、AR-12、AR-13、AR-14、AR-16、AR-59、AR-60（實測步驟）、NFR-9、NFR-16
**規格：** 架構底稿〔結構／部署〕和〔Alex 手動，不是 story〕清單（本文件 Additional Requirements）；AD-1、AD-2、AD-16

**這張不做、由 Alex 手動做的事：** 在 Unraid 用範本建容器、填環境變數（`SESSION_SECRET` 用 `openssl rand -base64 32`）；把 GHCR 套件設成公開；新網址在 Cloudflare Tunnel 指到容器並加 Cloudflare Access；舊 qBittorrent 網址加 Access、確認「執行外部程式」是空的；main 開分支保護；照說明文件跑實測清單。story 只負責映像、CI、Unraid 範本和說明文件。

**Acceptance Criteria:**

**Given** 多階段 Dockerfile
**When** 建映像
**Then** Node 26 基底釘 digest、`npm ci`，最後一層只放建置結果和正式依賴，`USER 99:100`，`HEALTHCHECK` 用 `node` 打 `/healthz`
**And** commit sha 由建置參數帶進去，啟動 log 印得出來

**Given** `.dockerignore`
**When** 建映像
**Then** 排除 `.env*`（`.env.example` 除外）、`.git`、`node_modules`、`_bmad-output`、`.claude`、`config`
**And** CI 檢查映像裡沒有 `.env`

**Given** 開一個 PR
**When** CI 跑完 Story 1.1 的檢查
**Then** 再建映像（不推），用假的環境變數（CI 現場產生的 32 bytes 以上 `SESSION_SECRET`）加 `--read-only --tmpfs /tmp --cap-drop=ALL --security-opt=no-new-privileges` 和一個可寫的 `/config` 跑起來，打 `/healthz` 和首頁都要 200
**And** 少一個必要環境變數時容器以非 0 結束（CI 也驗）

**Given** 合併到 main
**When** CI 跑
**Then** 建 amd64 映像推 GHCR，tag 是 `latest` 和 commit sha；只有這個 job 有 `packages: write`
**And** 所有 workflow 不用 `pull_request_target`、預設 `contents: read`、第三方 action 釘 commit SHA

**Given** Dependabot 設定
**When** 每月跑
**Then** 正式依賴、開發依賴、GitHub Actions 各一組 PR；安全性更新隨時開

**Given** repo 裡的 Unraid Docker 範本
**When** Alex 照它建容器
**Then** 只有一個 port、只掛 `/config`；環境變數照慣例列出，`QBIT_PASSWORD`、`SESSION_SECRET` 欄位遮罩；Extra Parameters 預填 `--cap-drop=ALL --security-opt=no-new-privileges --read-only --tmpfs /tmp`
**And** 沒有 privileged、`--network=host`、Docker socket 或其他資料夾；範本裡只有佔位字，沒有 IP、帳密、網域

**Given** repo 裡的部署說明文件
**When** Alex 照著做
**Then** 依序寫清楚上面「Alex 手動做」的每一步、`APP_ORIGINS` 和 `SAVE_ROOTS` 怎麼填、怎麼更新、壞了怎麼把 tag 改回上一個 commit sha
**And** 有一份上線後的實測清單：在家走 http 能登入和看列表；手機經 Tunnel 能登入和看列表，`rt_session` 有 Secure（AR-59）；Access 過期時 server function 回 401、畫面出「Cloudflare 登入過期了」（AR-60）；結果不符時回去改架構底稿
**And** Epic 1 的驗收是 Alex 照這份清單在 NAS 上打開、登入、看到列表

## Epic 2：看板、詳情、排序

Alex 選「狀態」排序時用看板看種子（電腦 4 個工作欄加已整理欄、捲動時自動收合，手機 4 個狀態分頁），換其他 50 種排序就是列表；點列或卡片在原畫面看詳情（固定頭、概覽、儲存位置、檔案分頁），在詳情暫停或繼續、勾選檔案要不要下載。手機底部面板、toast、`pendingOps` 和 Esc 的快捷鍵登記在這個 epic 第一次出現。分類、搜尋、每分類記住排序、設定檔都不在這個 epic。

**Epic 2 共用的決定（Claude 代決，Alex 可以否決）：**

- 排序、方向、正在看的種子放 URL search params（`sort`、`dir`、`hash`，schema 在 `src/shared`，zod 驗）。換排序、換正在看的種子用 replace，不堆瀏覽紀錄。值不合法時改回預設並修正網址。
- 網址沒有 `sort` 時預設「狀態」（照 PRD FR-28 的假設）。Story 2.1 還沒有看板，暫時沿用 Epic 1 的「加入時間，新的在前」；Story 2.3 起改成「狀態」。Epic 3 再把預設換成這個分類記住的排序。
- 換排序（含看板和列表互換）後，列表和看板捲回最上面（照 PRD FR-25 的假設）。
- 排序時沒有值的種子（例如沒完成的完成時間、無限的剩餘時間）一律排最後，不管方向。同分規則（再比 `added_on` 新的在前、再比 `hash`）不跟著方向反過來。
- 看板「要處理」欄的「最新出問題的在前」用 `last_activity` 新的在前；qBittorrent 沒有「出問題的時間」這個欄位。
- 共用畫面元件（底部面板、toast）放在 Epic 1 放 shadcn 元件和狀態圓圈的共用目錄，不放在任何一個 `features/` 底下。
- 「☆ 加到常用」「改路徑」「改檔名」三顆，以及搜尋、新增、快捷鍵、設定、分類按鈕，在 Epic 2 照 Epic 1 的 disabled 做法留著。勾選框和選取列在 Epic 4。
- 每分類記住排序、每分類上次看的種子、「（這個分類記住的）」、`↑` `↓` 和其他快捷鍵在 Epic 3。

### Story 2.1：51 種排序和電腦排序選單

身為 Alex，我想要在電腦上從排序選單選 51 種排序之一，列表和右邊的大數字跟著換，這樣清理時最該處理的會排在同一條列表的最上面。

**涵蓋：** FR-13（大數字跟著排序、分享率欄藏起來）、FR-25（列表部分）、FR-26（電腦）、FR-27、NFR-1、NFR-8、AR-6、AR-41（`selectVisibleTorrents` 的排序）、AR-46（`sort-fields.ts`）、AR-49（URL 的排序）、AR-50、UX-DR20（不含「這個分類記住的」）、UX-DR22（電腦）、UX-DR30（分享率欄）、UX-DR31、UX-DR77（排序按鈕）
**規格：** PRD FR-13、FR-25、FR-26、FR-27；EXPERIENCE〔排序和檢視〕〔數字寫法〕的大數字表〔Component Patterns〕的 sort-pill、sort-menu；UX DESIGN.md〔Components〕的 sort-pill、sort-menu；UX `.working/vuetorrent-sort-fields.md`；AD-6、AD-8（排序欄位 id）、AD-13

**Acceptance Criteria:**

**Given** `src/shared/sort-fields.ts`
**When** 列出所有排序欄位
**Then** 剛好 51 個 id，沒有 `download_path`、`basename_download_path`、`tags`；最上面 5 個照順序是狀態（`state`）、做種時間、加入時間、分享率、完成時間；其他 46 個照分組（時間、進度、速度、流量和分享率、大小、人數、名稱和分類、路徑、限制和設定、技術資訊）
**And** 每個欄位有中文名稱、分組、預設方向、兩個方向的字、大數字寫法；預設方向照 EXPERIENCE：做種時間久的在前、加入和完成時間新的在前、分享率高的在前、大小大的在前、名稱 A 到 Z、其他數字大的在前
**And** vitest 檢查數量、前 5 個的順序、沒有那 3 個欄位
**And** PR 附 51 個欄位的表（中文名稱、分組、預設方向、方向字、大數字寫法）給 Alex 看；大數字表沒寫到的欄位照最接近的一類定（時間點用日期、時間長度用長度、是非寫「是」「否」）

**Given** 排序需要的欄位
**When** 檢查 `src/shared/maindata.ts`
**Then** 51 種排序和大數字要用的 qBittorrent 欄位都加進瘦身欄位清單，容器端的種子表跟著留
**And** 衍生欄位（例如 Tracker 網域、全域速度、全域流量、平均速度、路徑最後一層）在 `src/lib` 用純函式算，算法照 VueTorrent v2.37.0 的原始碼，PR 寫出每個的算法；功能程式裡不算

**Given** `selectVisibleTorrents(maindata, view)`，`view` 帶排序和方向
**When** 用任一種非「狀態」的排序呼叫
**Then** 回排好的 hash 陣列，不含已整理；方向反過來時順序反過來，同分時再比 `added_on` 新的在前、再比 `hash`，這兩條不跟著反
**And** 沒有值的種子不管方向都排最後；特殊值（無限的 `eta`、`-1` 的完成時間、沒設的上限）的判斷只在 `src/lib/format.ts`
**And** vitest 每個欄位至少測一次預設方向和反方向，另測同分和沒有值
**And** 4165 個假種子換排序，在開發機上 `selectVisibleTorrents` 加重畫在 100 毫秒內，PR 附量測方法和數字

**Given** 網址的 search params
**When** 帶 `sort` 和 `dir` 打開或重新整理
**Then** 列表照網址的排序和方向畫；`sort` 不在 51 個 id 裡或 `dir` 不合法時改回預設，網址用 replace 修正
**And** 網址沒有 `sort` 時，這張 story 先維持 Epic 1 的「加入時間，新的在前」（Story 2.3 改成「狀態」）
**And** 收掉 Epic 1 的暫時做法：列表不再寫死加入時間，`selectVisibleTorrents` 裡的固定順序拿掉

**Given** 電腦的排序按鈕
**When** 看篩選列
**Then** 排序按鈕拿掉 disabled，照 UX-DR20：左邊 `surface-muted` 小膠囊寫「列表」加圖示，右邊粗體「排序：做種時間 ↓」加 ▾；箭頭不能單獨點
**And** `aria-label` 和 tooltip 寫完整的字，例如「排序：做種時間，久的在前」
**And** 手機的排序按鈕維持 disabled，Story 2.2 接上

**Given** 按了電腦的排序按鈕
**When** 排序選單打開
**Then** shadcn `DropdownMenu` 寬 260px，最高 70vh、超過在選單裡捲；上面 5 項右邊用 `text-muted` 寫 1 到 5（只是字，按鍵在 Epic 3）；分隔線下「更多 ▾」，點了在同一個選單裡展開 46 項，分組小標用 `tag` 11px、`text-muted`，不開子選單
**And** 選中的項目左邊打勾，名稱後面 `text-muted` 的方向字加箭頭，例如「做種時間　久的在前 ↓」
**And** 目前的排序在「更多」裡時，一打開就是展開的並捲到那一項
**And** 「狀態」先顯示但不能選（照 Epic 1 的 disabled 做法），Story 2.3 接上看板

**Given** 排序選單開著
**When** 點目前選中的那一項
**Then** 方向反過來，選單不關
**When** 點沒選中的項目
**Then** 換成那個排序、用預設方向，選單關掉，列表捲回最上面

**Given** 電腦滑鼠停在列表上，凍結中
**When** Alex 自己換排序
**Then** 照新排序立刻重排；凍結只擋資料更新造成的換位，不擋 Alex 的操作

**Given** 列表模式的每一列
**When** 換排序
**Then** 右邊大數字照 EXPERIENCE 的大數字表換：做種時間「41 天」、分享率「3.12」、進度「87%」、速度 0 寫「0」用 `text-muted`、名稱排序寫進度或狀態用語（13px）、儲存路徑寫位置標籤的名字、Hash 寫前 8 碼用 `path` 字、上限沒設寫「不限速」、沒完成的完成時間寫「沒有」
**And** 文字類（分類、路徑、Hash、註解）用 `body` 13px、`text-muted`，最寬 160px 超過切掉，路徑從前面切
**And** 排序是分享率時，大數字左邊的「分享率 3.12」那一欄藏起來
**And** 所有字經 `format.ts`；種子名稱、註解、路徑當純文字
**And** PR 附電腦淺色和深色截圖：選單收著、展開「更多」、選中「更多」裡的一項；列表在做種時間、分享率、名稱、儲存路徑、Hash 排序下的樣子

### Story 2.2：底部面板和手機排序面板

身為 Alex，我想要手機上有一種從下面滑上來的面板，往下拉、點旁邊、按 ✕ 都能關，先用來選排序，這樣在外面用手機也能換排序，之後的詳情和對話框都用同一種面板。

**涵蓋：** FR-26（手機）、FR-27（手機按鈕）、FR-60、NFR-3、NFR-4、NFR-5、NFR-7、AR-7（手勢自己寫）、AR-50（底部面板開著）、UX-DR21（不含「排序換成這個分類記住的」那行）、UX-DR22（手機）、UX-DR49、UX-DR50、UX-DR78、UX-DR80（底部面板）、UX-DR86
**規格：** PRD FR-26、FR-27、FR-60；EXPERIENCE〔Component Patterns〕的 bottom-sheet、sort-menu〔動態〕的底部面板〔Responsive & Platform〕；UX DESIGN.md〔Components〕的 bottom-sheet、sort-menu、sort-pill；AD-13、一致性慣例的底部面板手勢

**Acceptance Criteria:**

**Given** 共用的底部面板元件
**When** 打開
**Then** 從下面滑上來，0.55 秒、`cubic-bezier(.2,.85,.25,1)`、從 `translateY(60%)` 開始，只動 `transform` 和 `opacity`；後面蓋 `rgba(0,0,0,.18)` 遮罩
**And** 外觀照 UX-DR49：`surface` 底、上緣圓角 28px、陰影 `0 -12px 40px rgba(0,0,0,.18)`；把手 44×5px 置中、離上緣 8px、把手帶高 20px；標題 16px／700；✕ 44px 在內容第一排最右邊，`aria-label`「關閉」
**And** 不用 shadcn `Sheet`，手勢用 pointer events 自己寫，不加套件

**Given** 底部面板開著
**When** 往下拉、點遮罩、按 ✕
**Then** 三種都關掉，焦點回到打開它的按鈕
**And** 拖動時面板跟著手指走；內容捲在最上面時往下拉才拉面板，否則是捲內容
**And** 往上拉到全螢幕：上緣圓角變 0，頂端留 `env(safe-area-inset-top)`，把手留著

**Given** 面板的高度模式
**When** 用不同模式打開
**Then** 支援四種：跟著內容（最高 90%）、固定 90%、詳情（一打開 70%，往下拉過一半就關、沒過彈回 70%）、全螢幕
**And** 放開手指後要停在哪一段由 `src/lib` 的純函式決定，vitest 測每種模式的門檻；這張只接「跟著內容」，其他模式在之後用到的 story 接

**Given** 底部面板開著
**When** 檢查無障礙和凍結
**Then** 有 `role="dialog"`、`aria-modal`、標題當名稱；焦點留在面板裡；後面的頁面不能捲
**And** 面板開著算進 `src/state` 凍結 hook 的條件，後面列表的位置先不換（vitest 測）

**Given** 系統開了減少動態
**When** 打開、關掉、拉動放開
**Then** 不播滑動動畫，直接到結果；拖動照樣跟著手指，功能照常

**Given** 寬度小於 1024px
**When** 看排序按鈕
**Then** 拿掉 disabled，照 UX-DR21：44px，只留檢視圖示、排序名稱、箭頭、▾，例如「▦ 做種時間 ↓ ▾」；「狀態」沒有箭頭；`aria-label` 寫完整的字

**Given** 按了手機的排序按鈕
**When** 排序面板打開
**Then** 用「跟著內容」的底部面板，標題「排序」，列高 52px，不顯示快捷鍵數字；「更多」在面板裡展開；選中的項目打勾加方向字和箭頭；目前的排序在「更多」裡時一打開就展開並捲到那一項
**And** 點目前選中的項目方向反過來、面板不關；點別的項目換成那個排序、用預設方向、面板關掉、列表捲回最上面
**And** 「狀態」跟電腦一樣先不能選，Story 2.3 接上

**Given** 手機 390px
**When** 截圖
**Then** PR 附淺色和深色的排序面板（收著、展開「更多」、全螢幕）截圖，沒有橫向捲動
**And** （Alex 在手機上驗收）打開、拉動、關掉跟著手指走、不掉格；PR 附 Chrome Performance 錄的一段拖動，動畫期間只有 composite、沒有每格的 layout

### Story 2.3：看板：電腦 5 欄和手機狀態分頁

身為 Alex，我想要選「狀態」排序時用看板看每個種子在哪個階段，電腦一次看全部欄，手機一次一欄左右滑，這樣在外面也一眼看出下載好了沒。

**涵蓋：** FR-10、FR-12、FR-25（完整）、FR-15（看板的骨架和空欄）、NFR-1、NFR-5、NFR-6、NFR-7、NFR-10、AR-41（看板欄裡的順序）、AR-50（看板不受滑鼠凍結）、UX-DR24（28px、32px）、UX-DR25、UX-DR26、UX-DR28、UX-DR29（不含勾選框）、UX-DR33、UX-DR34（一般位置）、UX-DR36、UX-DR72（看板）、UX-DR73（看板）、UX-DR74（左右滑）、UX-DR88（看板）、UX-DR89、UX-DR90（看板）、UX-DR96
**規格：** PRD FR-10、FR-12、FR-15、FR-25；EXPERIENCE〔Component Patterns〕的 board-column、board-column-collapsed、已整理欄、status-tabs、board-card、progress-bar〔排序和檢視〕〔State Patterns〕「欄裡卡片太多」「分類裡沒有種子、看板某欄是空的」〔Responsive & Platform〕；UX DESIGN.md〔Components〕的 board-column、board-card、status-tabs；AD-6、AD-13

**Acceptance Criteria:**

**Given** 看板接上
**When** 選「狀態」排序，或網址沒有 `sort`
**Then** 「狀態」在電腦選單和手機面板都能選了，選了就是看板；網址沒有 `sort` 的預設從這張起改成「狀態」
**And** 排序按鈕寫「看板｜排序：狀態」（手機「▦ 狀態 ▾」），沒有箭頭；看板和列表互換時捲回最上面

**Given** 看板欄的順序
**When** `src/lib` 算看板
**Then** 每欄的 hash 陣列由 `selectVisibleTorrents`（或同一個檔案裡的 selector）算，欄由 `classify()` 決定：要處理 `last_activity` 新的在前；下載中加入時間新的在前；做種中做種最久的在前；完成剛完成的在前；已整理完成時間新的在前；同分再比 `added_on`、再比 `hash`
**And** 功能程式裡沒有 `sort()`；vitest 測每欄的順序和同分

**Given** 寬度 1024px 以上，排序是「狀態」
**When** 看內容區
**Then** 4 個工作欄等寬，順序要處理、下載中、做種中、完成，最右邊 64px 已整理欄；欄距 14px；欄 `surface-muted` 底、圓角 22px、內距 12px
**And** 欄標題是 28px 狀態圓圈、欄名（`column-title`）、淡色數量（不含已整理）；標題的 tooltip 寫這欄怎麼排，例如「做種最久的在前」，不能點來改
**And** 每欄自己捲，用 `@tanstack/react-virtual` 虛擬化，4165 個假種子時每欄 DOM 裡的卡片少於 60 張，捲起來順
**And** 如果實作有分批畫，一批超過 200 毫秒才在欄底畫 2 張卡片骨架，不寫「載入中…」、不放轉圈圈

**Given** 已整理欄
**When** 平常
**Then** 是收合欄的樣子：28px 灰色封存盒圓圈、數量（12px、`text-muted`）、直書「已整理」（14px／700，`writing-mode: vertical-rl`），能用鍵盤聚焦，hover 多 1px `text-faint` 內框
**When** 點它或按 Enter
**Then** 展開成一般欄，跟 4 個工作欄等寬，完成時間新的在前；再點它的欄標題收回（Claude 代決：來源沒寫怎麼收回）

**Given** 看板卡片
**When** 畫出來
**Then** 照 UX-DR29：`surface` 底、圓角 16px、內距 12px 14px、卡片陰影；第一行 32px 狀態圓圈、一行名稱（`title` 看全名）、最右邊 `card-value` 百分比（只有下載中、已暫停、停滯）；第二行剩餘時間和速度，或 `classify()` 的狀態說明（「卡在 87%，沒有來源」「今天 09:12 下載好了」）；下載中、已暫停、停滯有 4px 進度條；最下面分類標籤和位置標籤（最後兩層）
**And** 名稱和 `error` 原因當純文字；卡片這張先不能點（Story 2.4 接上）

**Given** 資料每 5 秒更新
**When** 電腦滑鼠停在看板上
**Then** 卡片換欄和欄裡的順序照常更新，不受滑鼠凍結（EXPERIENCE〔排序和檢視〕）；列元件用 hash 當 key 並 memo

**Given** 空欄和只剩已整理
**When** 某欄沒有種子
**Then** 欄留著寫「沒有」，要處理是空的時寫「都沒問題」
**And** 只剩已整理時「全部」分頁數字寫 0、4 欄都寫「沒有」、已整理欄照常

**Given** 第一次載入，排序是「狀態」
**When** `['maindata']` 還沒到
**Then** 畫跟卡片同樣大小的骨架（電腦每欄幾張、手機一欄），不放轉圈圈，資料到了直接換上

**Given** 寬度小於 1024px，排序是「狀態」
**When** 看頂端和內容
**Then** 第四排是狀態分頁，照 UX-DR25：4 格平分、格距 6px、高 56px，放在 `surface-muted` 底、圓角 16px、內距 4px 的長條裡；每格 8px 狀態色小點加 `stat-value` 數量，下面 `tag` 11px 欄名；選中的 `surface` 底、圓角 14px、卡片陰影、欄名 `text` 700；沒有已整理
**And** 內容一次一欄、卡片一排 1 張；點分頁或左右滑換欄，垂直捲動不被誤判成左右滑
**And** 換欄的位移只動 `transform`；減少動態開著時直接換，不播動畫

**Given** 本機用假的 qBittorrent 回應（含每種狀態、超長名稱、空欄）
**When** 截圖
**Then** PR 附電腦和手機 390px、淺色和深色的看板、已整理欄展開、空欄、只剩已整理、骨架截圖，手機沒有橫向捲動
**And** （Alex 在手機上驗收）左右滑換欄跟著手指、不掉格

### Story 2.4：點開詳情：三種容器、固定頭和前後切換

身為 Alex，我想要點列或卡片就在原畫面看詳情，最上面永遠寫名稱和「第 N 個／共 M 個」並能前後切換，這樣一個一個看下去不會迷路，重新整理也還在。

**涵蓋：** FR-16（不含「上次看的種子」）、FR-17、FR-20、FR-60（詳情 70%）、NFR-5、NFR-7、NFR-10、AR-49（`hash` 在 URL）、AR-50（「第 N 個」用凍結的順序）、AR-52（只登記 `Esc`）、UX-DR12（列和卡片的 hover）、UX-DR30（正在看的內框）、UX-DR39、UX-DR40、UX-DR41、UX-DR43、UX-DR46、UX-DR72（列表 560px）、UX-DR73（詳情）、UX-DR74（點名稱展開）、UX-DR75、UX-DR77、UX-DR78、UX-DR80（詳情面板）、UX-DR87（看板詳情面板滑入）
**規格：** PRD FR-16、FR-17、FR-20；EXPERIENCE〔Component Patterns〕的 detail-panel、detail-header、detail-tabs、list-row、board-card、bottom-sheet〔Interaction Primitives〕的前後切換、看板模式的詳情〔State Patterns〕「正在看的種子不見了」「名稱太長」〔Accessibility Floor〕；UX DESIGN.md〔Components〕的 detail-panel、detail-header、detail-tabs〔詳情由上到下〕；AD-13

**Acceptance Criteria:**

**Given** 寬度 1024px 以上，列表模式
**When** 看內容區
**Then** 收掉 Epic 1 的暫時做法：列表改成左邊最寬 560px，中間 16px，右邊 `surface` 詳情面板（圓角 22px、內距 18px 22px）吃掉剩下的寬度
**And** 列有 hover 底色 `surface-muted`；點列就換成那一列，網址的 `hash` 用 replace 換，那一列加 `inset 0 0 0 2px accent` 內框
**And** 網址沒有 `hash` 或那個種子不在目前的列表裡時顯示第一個；那一列不在畫面上時不捲過去（PRD FR-16 的假設）
**And** 列表全空時照 Epic 1 的空狀態，列表和詳情面板一起換掉，不留空的詳情面板

**Given** 寬度 1024px 以上，看板模式
**When** 點一張卡片
**Then** 詳情面板從右邊 24px 淡入，0.3 秒、`cubic-bezier(.2,.8,.2,1)`；左緣對齊完成欄，寬 `calc((100% - 120px) / 4 + 78px)`，上下緣對齊看板欄，四角 22px，浮層陰影，沒有遮罩
**And** 看板還能點：點別張卡片換成那一張；點看板空白處、按 `Esc`、按固定頭的 ✕（`aria-label`「關閉」）關掉，關掉時網址拿掉 `hash`
**And** 卡片有 hover 1px `text-faint` 內框；點的卡片在完成欄裡被蓋住時不捲動、不移位

**Given** 寬度小於 1024px
**When** 點列或卡片（點名稱也一樣）
**Then** 用 Story 2.2 的底部面板「詳情」模式打開，一開 70%；往下拉過一半就關，沒過彈回 70%；往上拉到全螢幕
**And** 關掉時網址拿掉 `hash`

**Given** 詳情固定頭
**When** 在任何分頁
**Then** 名稱（`detail-name`，一行加「…」，電腦用 `title` 看全名）、‹、「第 N 個／共 M 個」、›、「⋯」固定在最上面，下面 `border` 細線，再下面是概覽、檔案兩個膠囊分頁（選中 `accent` 底），一起固定不捲
**And** 電腦列表模式排成一排；手機和看板窄面板排成兩排：第一排名稱、⋯、✕，第二排 ‹、第 N 個、›，靠左緊貼名稱下面
**And** 前後按鈕電腦 36px、手機 44px，`aria-label`「上一個」「下一個」；「⋯」這張先 disabled，Story 2.6 接上；檔案分頁這張先 disabled，Story 2.7 接上

**Given** 「第 N 個／共 M 個」和前後切換
**When** 算 N 和 M
**Then** 都從 `src/state` 凍結 hook 給的順序算，跟畫面上看到的順序一致；列表模式 M 不含已整理
**And** 看板模式的範圍是這一欄：前面寫欄名，例如「做種中　第 3 個／共 80 個」，前後只在同一欄走；已整理欄展開後點卡片也照這條；手機看板的範圍是目前的狀態分頁
**And** 到第一個或最後一個時那顆按鈕不能按，不跳到隔壁欄
**And** vitest 測 N、M 和前後的結果，包括凍結中、欄的頭尾

**Given** 手機的固定頭
**When** 點名稱
**Then** 展開成多行，固定頭變高、下面內容往下推，不浮在上面；再點收起來；按 ‹ › 換種子時自動收起來

**Given** 概覽分頁
**When** 打開詳情
**Then** 先有資訊清單（UX-DR46）：分類、大小、加入時間、完成時間、已下載、已上傳，一列一項，左邊 `text-muted` 標題，右邊緊接著值，不推到最右邊；字經 `format.ts`，沒有值寫「沒有」
**And** 狀態區、數字小卡、儲存位置區塊在 Story 2.5 加在資訊清單上面

**Given** 正在看的種子不見了
**When** 列表模式裡它被刪掉、變成已整理而離開列表
**Then** 詳情換成補上它位置的那一列（原本的下一個），沒有下一個就換上一個，網址的 `hash` 跟著換
**When** 看板模式的面板裡它被刪掉
**Then** 面板關掉
**When** 看板模式的面板裡它換欄
**Then** 面板留著繼續看它，欄名和「第 N 個／共 M 個」照新的欄重算
**When** 手機底部面板裡它被刪掉
**Then** 面板關掉
**And** 「下一個是誰」由 `src/lib` 一個純函式算，輸入舊順序、新順序、正在看的 hash；vitest 測每種情況（含最後一個、只剩一個、全部不見）

**Given** 重新整理頁面
**When** 網址帶 `sort` 和 `hash`
**Then** 回到同一個排序和正在看的種子：列表模式詳情面板顯示它，看板模式面板打開，手機底部面板打開

**Given** `src/state` 的快捷鍵登記表
**When** 這張 story 建立它
**Then** 只登記 `Esc`：依序關最上層的東西（這張只有看板詳情面板和底部面板）；焦點在輸入框時只認 `Esc`
**And** 其他快捷鍵和說明視窗在 Epic 3 加進同一份表；vitest 測登記和輸入框規則

**Given** 鍵盤操作
**When** 用 Tab 走過列、卡片、前後按鈕、分頁、✕
**Then** 焦點是 2px `accent` 外框、間隔 2px，只在 `:focus-visible` 出現，跟正在看的 2px 內框長得不一樣
**And** 看板詳情面板滑入在減少動態時不播動畫，直接出現
**And** PR 附電腦列表模式、電腦看板模式面板、手機底部面板（70%、全螢幕、名稱展開）的淺色和深色截圖，手機 390px 沒有橫向捲動

### Story 2.5：詳情概覽：狀態區、數字小卡、儲存位置

身為 Alex，我想要在概覽一眼看到這個種子現在怎麼樣、存在哪裡，並能複製路徑，這樣不用再開 VueTorrent 查做種天數和分享率。

**涵蓋：** FR-18、FR-19（路徑、位置標籤、複製；其他三顆按鈕在 Epic 5）、FR-9（畫面）、NFR-8、NFR-9、NFR-10、AR-41（`paths.ts` 最後兩層、`format.ts`）、AR-56（複製的退路）、UX-DR24（64px）、UX-DR34（一般位置）、UX-DR44（不含搬移中）、UX-DR45、UX-DR48（不含搬移中）、UX-DR53、UX-DR79
**規格：** PRD FR-18、FR-19；EXPERIENCE〔詳情狀態區每種狀態寫什麼〕〔數字小卡依狀態換〕〔Component Patterns〕的 save-path-block〔State Patterns〕「路徑太長」「複製路徑成功」〔數字寫法〕；UX DESIGN.md〔Components〕的 detail-hero、stat-tile、save-path-block〔詳情由上到下〕；AD-10、AD-13

**Acceptance Criteria:**

**Given** 概覽分頁
**When** 打開詳情
**Then** 由上到下是詳情狀態區、數字小卡 3 張一排、儲存位置區塊、資訊清單（Story 2.4 做好的）

**Given** 詳情狀態區
**When** 畫任何狀態的種子
**Then** 64px 狀態圓圈加 `detail-hero` 28px 狀態色大字（狀態用語加全形空白加數字），下面一行 `text-muted` 摘要用「 · 」分開
**And** 照 EXPERIENCE 的表做 12 種：下載中、抓種子資訊中、排隊中、檢查檔案中、已暫停、停滯、做種中、已完成、找不到檔案（私人）、錯誤（`error`，摘要是 qBittorrent 給的原因，當純文字）、狀態不明（`unknown`）、已整理；搬移中的前綴在 Epic 5
**And** 大字和摘要由 `src/lib` 的純函式從 `classify()` 的結果和種子欄位算，功能程式裡沒有 `torrent.state ===`；vitest 表上每一列都有
**And** 私人種子找不到檔案的規則照 Story 1.5 的 AR-58 結果；沒有 `private` 欄位時照 Alex 當時的決定

**Given** 數字小卡
**When** 畫不同狀態
**Then** 3 張一排、`surface-muted` 底、圓角 16px、內距 12px 14px，上面淡色標題、下面 `stat-value` 20px
**And** 下載中、已暫停、停滯（含抓資訊、排隊、檢查）是下載速度、剩餘時間、來源數；做種中、已完成是現在上傳、在抓的人、最後有人抓（`last_activity`，寫「3 天前」）；錯誤、已整理是大小、完成時間、分享率
**And** 沒有值寫「0 KB/s」「不明」「沒人抓過」「沒有」；vitest 測三組和沒有值

**Given** 儲存位置區塊
**When** 畫出來
**Then** `surface-muted` 底、圓角 16px，三層：「儲存位置」加位置標籤（路徑最後兩層，常用路徑和媒體庫在 Epic 5）；完整路徑；四顆膠囊
**And** 完整路徑用 `path` 等寬字、一行、從前面切留後面，例如「…media/tv/牧神記」，中文和斜線不亂序；電腦 hover 看全文，手機點了展開成多行、再點收起來
**And** 四顆照順序：複製、☆ 加到常用、改路徑（`accent` 實心，區塊裡唯一實心）、改檔名（外框）；電腦 34px、間距 8px、靠左；手機 2×2 等寬、高 44px
**And** 「☆ 加到常用」「改路徑」「改檔名」先照 Epic 1 的 disabled 做法放好，Epic 5 接上

**Given** 按「複製」
**When** 在 https 或在家走 http
**Then** 複製完整路徑；有 `navigator.clipboard` 就用它，沒有或失敗就用暫時的 textarea 退路
**And** 按鈕字變「已複製」1.5 秒再變回來，不跳 toast
**And** 兩種方法都失敗時按鈕字變「複製失敗」1.5 秒（Claude 代決：來源沒寫）
**And** vitest 在沒有 `navigator.clipboard` 的環境測退路

**Given** 看板模式的窄面板（約 354px）
**When** 看概覽
**Then** 數字小卡照樣 3 張一排，儲存位置區塊照三層排，沒有橫向捲動

**Given** 種子名稱、路徑、`error` 原因裡有 HTML 標籤或 `javascript:`
**When** 畫在概覽
**Then** 原樣當文字顯示
**And** PR 附 12 種狀態的概覽截圖（電腦列表模式淺色），加電腦深色、看板窄面板、手機 390px（含路徑展開）各一組；28px 大字對比至少 3，文字至少 4.5

### Story 2.6：暫停繼續和 toast

身為 Alex，我想要在詳情的「⋯」選單暫停一個種子，或讓停止的種子繼續做種，失敗時看到原因並能重試，這樣 2027-02 那兩週不用切回 VueTorrent。

**涵蓋：** FR-51、FR-59、NFR-12、NFR-13、NFR-15、AR-24（`stopTorrents`、`startTorrents`）、AR-25、AR-28、AR-35、AR-42（`refreshMaindata()`、`pendingOps`）、AR-53、AR-54（送完就當成功）、AR-55、UX-DR42、UX-DR54、UX-DR55、UX-DR80（toast）、UX-DR87（toast 淡入）
**規格：** PRD FR-51、FR-59；EXPERIENCE〔Component Patterns〕的 detail-header〔State Patterns〕的 toast、「動作成功時」〔qBittorrent 狀態對應〕；UX DESIGN.md〔Components〕的 toast；AD-5、AD-7、AD-9、AD-12、AD-13、AD-14、AD-15

**Acceptance Criteria:**

**Given** `stopTorrents` 和 `startTorrents` 兩個 server function
**When** 用工廠建立
**Then** 都是 POST，zod 只收 1 到 5000 個 40 或 64 位小寫 hex 的 hash，永遠不送 `all` 或含 `|` 的值；body 上限照 AD-12 收 hash 陣列的 384 KB（不是 64 KB）；參數用 `URLSearchParams` 組，打 qBittorrent 5.1.4 的停止和開始 API（端點名稱照官方文件確認，PR 附網址）
**And** 回 AR-54 的批次形狀，qBittorrent 接受就每筆都算成功
**And** vitest 只用假的 qBittorrent 回應：送對端點和參數、擋掉不合法的 hash、沒登入回 `not_logged_in`、qBittorrent 拒絕回 `qbit_rejected`；不對真的 qBittorrent 呼叫

**Given** 詳情固定頭的「⋯」
**When** 按下去
**Then** 「⋯」拿掉 disabled，選單只有一項，依狀態寫「暫停」或「繼續」：停止類的狀態（已暫停、已完成）是「繼續」，其他是「暫停」
**And** 判斷由 `src/lib/torrent-status.ts` 給，功能程式裡沒有 `torrent.state ===`；vitest 測每種 qBittorrent 狀態
**And** 「⋯」按鈕有 `aria-label`「更多動作」，電腦 36px、手機 44px

**Given** 按了「暫停」或「繼續」
**When** 送出成功
**Then** 不跳 toast、選單項目不換字；呼叫 `src/state` 唯一的 `refreshMaindata()`（Story 1.6 建的，沿用，不另做），不改本機資料
**And** 這個 hash 記進 `src/state` 的 `pendingOps`，狀態反映出來或 30 秒後才拿掉；這段期間選單項目不能按，避免重複送
**And** 已完成的種子按「繼續」後，下一次資料到了就變做種中、移到做種中欄；看板詳情面板照 Story 2.4 留著並重算「第 N 個」
**And** 選取列沒有暫停或繼續，不做批次

**Given** 送出失敗
**When** code 是 `qbit_rejected`、`timeout`、`invalid_input`
**Then** 跳「失敗帶重試」的 toast，字從 `src/lib/error-text.ts` 拿，按「重試」再送一次
**When** code 是連線類（`cloudflare_expired`、`home_unreachable`、`qbit_unreachable`、`not_logged_in`、`qbit_auth_failed`）
**Then** 只由全域 `onError` 處理（提示條或登入畫面），功能不另外跳 toast；`bad_origin` 照 Story 1.6 當程式錯誤
**And** 失敗後 `pendingOps` 拿掉，選單項目恢復能按

**Given** `src/lib/toast.ts`
**When** 這張 story 建立它
**Then** 只包三種：一般、帶按鈕、失敗帶重試；功能程式不直接呼叫底層 toast
**And** 電腦右下角，離右和下各 24px，寬 356px；`surface` 底、1px `border`、圓角 16px、浮層陰影、內距 12px 8px 12px 18px；左邊 13px／600 的字，右邊 32px 外框膠囊動作按鈕，最右 28px ✕（`text-muted`、`aria-label`「關閉」）；成功的不加顏色
**And** 手機在畫面上方，左右各 16px，蓋在底部面板和遮罩上面
**And** 「選取列在時往上移到它上面 16px」留一個位置參數，Epic 4 選取列接上

**Given** toast 的時間和數量
**When** 跳出來
**Then** 一般的停 4 秒；帶按鈕的停 8 秒，滑鼠停在上面時不倒數；失敗帶重試的不會自己消失，按 ✕ 才關
**And** 一次只顯示一個，新的換掉舊的
**And** 從下面 10px 淡入；減少動態開著時直接出現
**And** 一般和帶按鈕的用 `aria-live="polite"`，失敗的用 `role="alert"`
**And** vitest 用假時鐘測三種的停留時間、hover 暫停、新的換掉舊的

**Given** 本機用假的 qBittorrent 回應
**When** 截圖
**Then** PR 附「⋯」選單（暫停、繼續）和三種 toast 在電腦、手機 390px（含蓋在底部面板上）的淺色和深色截圖
**And** （Alex 在 NAS 上驗收）對真的 qBittorrent 暫停一個、繼續一個已完成的，看它換欄

### Story 2.7：檔案分頁：清單、勾選、優先順序

身為 Alex，我想要在詳情的檔案分頁看每個檔案下載到哪，勾掉不要的檔案或改優先順序，這樣不用為了選檔案切回 VueTorrent。

**涵蓋：** FR-52、FR-53、NFR-1、NFR-2（檔案分頁例外）、NFR-10、NFR-13、NFR-15、AR-7、AR-24（`getFiles`、`setFilePriority`）、AR-25、AR-28、AR-30（priority 只能 `0`、`1`、`6`、`7`）、AR-40、AR-42（重抓 `['files', hash]`）、AR-55、UX-DR47、UX-DR78
**規格：** PRD FR-52、FR-53；EXPERIENCE〔Component Patterns〕的檔案分頁〔State Patterns〕「詳情分頁載入中、讀不到」、「動作成功時」的檔案分頁；UX DESIGN.md〔詳情由上到下〕的檔案分頁；AD-5、AD-6、AD-7、AD-12、AD-15

**Acceptance Criteria:**

**Given** `getFiles` 和 `setFilePriority` 兩個 server function
**When** 用工廠建立
**Then** `getFiles` 是 GET、沒有副作用，收一個 hash；`setFilePriority` 是 POST，收一個 hash、1 個以上非負整數的檔案 id、priority 只能是 `0`、`1`、`6`、`7`
**And** 檔案 id 在容器照 qBittorrent 規定的格式組，前端不傳組好的字串；hash 照 AR-28
**And** vitest 只用假的 qBittorrent 回應：送對端點和參數、擋掉不合法的 id 和 priority、沒登入回 `not_logged_in`

**Given** 打開詳情的檔案分頁
**When** 分頁開著
**Then** 檔案分頁拿掉 disabled；用 `['files', hash]` 每 5 秒抓這一個種子的檔案；換分頁、關詳情、瀏覽器分頁到背景時停，回前景立刻抓一次；換種子時換成新的 key
**And** 固定頭和分頁下面整塊是檔案清單，用 `@tanstack/react-virtual` 虛擬化；1000 個檔案時 DOM 裡的列少於 60 個

**Given** 檔案清單的每一列
**When** 畫出來
**Then** 有下載勾選、名字（種子裡的相對路徑，一行加「…」，電腦 `title` 看全文，當純文字）、大小、進度（`format.ts` 的百分比）、優先順序控制
**And** 平的清單，不做資料夾樹（Claude 代決：來源沒寫）
**And** 手機上勾選和優先順序控制的點擊範圍至少 44px

**Given** 勾選和優先順序的對應（Claude 代決：PRD FR-53 的假設）
**When** 操作
**Then** 勾掉就是 priority `0`（不下載）；再勾回來是 `1`（一般）
**And** 優先順序控制只在有勾的列能用，三個選項寫「一般」「高」「最高」，對到 `1`、`6`、`7`；沒勾的列控制顯示「不下載」並 disabled

**Given** 勾選或改優先順序
**When** 送出成功
**Then** 不跳 toast、不改本機資料，重抓 `['files', hash]`，那一列照重抓的結果變
**And** 從送出到重抓回來，那一列的控制不能按，避免重複送

**Given** 送出失敗
**When** code 不是連線類
**Then** 跳 Story 2.6 的「失敗帶重試」toast，按「重試」再送一次；連線類只由全域處理

**Given** 檔案清單的三種特殊狀態
**When** 還在載入
**Then** 畫 5 列骨架
**When** `getFiles` 失敗
**Then** 寫「讀不到檔案清單」加「重試」，按了立刻再抓
**When** 磁力連結還沒抓到種子資訊（由 `classify()` 判斷，不直接比狀態）
**Then** 寫「還在抓種子資訊，檔案清單等一下才有」

**Given** 本機用假的 qBittorrent 回應
**When** 截圖
**Then** PR 附電腦列表模式、看板窄面板、手機底部面板的檔案分頁（有資料、載入中、讀不到、還在抓資訊）淺色和深色截圖
**And** （Alex 在 NAS 上驗收）對真的 qBittorrent 勾掉一個檔案、改一個優先順序

### Story 2.8：看板自動收合

身為 Alex，我想要在電腦看板捲某一欄時，其他欄自動收起來、這欄變寬一排放 2 到 3 張，這樣一欄裡幾百個種子也找得快。

**涵蓋：** FR-11、NFR-3、NFR-4、AR-7、AR-44、AR-49（自動收合開關的 localStorage key）、AR-50（動畫中凍結）、UX-DR27、UX-DR80（自動收合）、UX-DR81、UX-DR83
**規格：** PRD FR-11；EXPERIENCE〔動態〕的「看板自動收合」〔Component Patterns〕的 board-column-collapsed；UX `.working/demo-board/index.html`；UX DESIGN.md〔Components〕的 board-column-collapsed；AD-7、AD-13

**Acceptance Criteria:**

**Given** 寬度 1024px 以上的看板，自動收合開著
**When** 在某一欄捲過 1 個欄的可見高度
**Then** 錨點那張卡片（離滑鼠最近的，卡片間空隙也算；沒有滑鼠時用第一張完整看得到的）先出現 2px `accent` 框
**And** 第 1 步 0.38 秒：其他欄收成 64px 收合欄，這欄變寬，卡片維持一張一排
**And** 第 2 步 1.3 秒：卡片從錨點往外散成 `repeat(auto-fill, minmax(270px, 1fr))` 一排 2 到 3 張，名稱一樣一行加「…」
**And** 整段動畫期間停住捲動；用 FLIP，只動 `transform`

**Given** 收合欄
**When** 畫出來
**Then** 寬 64px，上面 28px 狀態圓圈加數量（12px、`text-muted`），下面直書欄名（14px／700，`writing-mode: vertical-rl`）；hover 多 1px `text-faint` 內框；能用鍵盤聚焦
**When** 點它或聚焦後按 Enter
**Then** 展開那一欄

**Given** 已經收合
**When** 往上捲到頂，或已經在最上面時再往上滾
**Then** 展開回 4 個等寬工作欄，停在最上面，不會馬上又自己收；要再往下捲過門檻才會再收
**And** 展開也用 FLIP，只動 `transform`

**Given** 動畫進行中
**When** 新的 `['maindata']` 到了
**Then** 先放著，動畫結束再套用；用 `src/state` 同一個凍結 hook（vitest 測凍結的開始和結束）
**And** 欄用虛擬化時，變寬後照一排幾張重算列

**Given** 自動收合的開關
**When** 讀 `src/lib/prefs.ts` 的 key（這張建立 `src/lib/prefs.ts` 和 key 表，Story 3.3、3.6 沿用）
**Then** 預設開；關掉時捲動不收合（設定頁的開關在 Epic 3，這張先用 vitest 和手動改 localStorage 驗）
**And** 寬度小於 1024px 時沒有這個功能

**Given** 看板詳情面板開著
**When** 觸發收合
**Then** 照樣收合，面板維持打開時的位置和寬度，不跟著欄移動（Claude 代決：來源沒寫）

**Given** 系統開了減少動態
**When** 捲過門檻或捲回頂
**Then** 不播動畫，直接變成收合或展開後的版面，功能照常

**Given** 效能
**When** 用 4165 個假種子在 Chrome Performance 錄一次收合和展開
**Then** 動畫期間只有 composite，沒有每格的 layout 或 paint，PR 附錄製截圖
**And** （Alex 在平板橫拿驗收）收合和展開順、不掉格，錨點的框位置對
**And** PR 附收合前、第 1 步後、第 2 步後的電腦淺色和深色截圖

### Story 2.9：進度環轉進來和列進場

身為 Alex，我想要打開 App 時看得到的進度環從 0 轉到目前進度、列和卡片一列接一列浮上來，這樣每次打開都一眼看到下載到哪了。

**涵蓋：** FR-14、NFR-3、NFR-4、AR-7、UX-DR24（進度環）、UX-DR80（進度環、列進場）、UX-DR81、UX-DR82、UX-DR85
**規格：** PRD FR-14；EXPERIENCE〔動態〕的「驚艷的那一下」和動畫表；UX DESIGN.md〔Components〕的 status-circle；AD-7、AD-13

**Acceptance Criteria:**

**Given** 打開 App，骨架換成資料的那一刻
**When** 畫面上看得到下載中、停滯、已暫停的狀態圓圈（列表列、看板卡片、詳情）
**Then** 外圈用 SVG `stroke-dashoffset` 從 0 轉到目前進度，0.9 秒、`cubic-bezier(.2,.8,.2,1)`（Claude 代決：來源沒寫時間）
**And** 只轉看得到的圓圈；捲動後才畫出來的列直接畫目前進度
**And** 不用 `conic-gradient`

**Given** 換分類
**When** Epic 3 做分類分頁時
**Then** 這張提供一個觸發點（例如 `src/state` 的一個函式），Epic 3 換分類時呼叫就會再轉一次；vitest 測觸發點
**And** 換排序、前後切換詳情、每 5 秒的資料更新都不轉，直接畫新進度（Claude 代決）

**Given** 同樣的時機（打開 App、之後的換分類）
**When** 列和卡片出現
**Then** 從下面 10px 淡入，0.5 秒、`cubic-bezier(.2,.8,.2,1)`，每列晚 60ms，只做看得到的列，只動 `transform` 和 `opacity`

**Given** 動畫進行中
**When** 新的 `['maindata']` 到了
**Then** 進度環結束時落在最新的進度，不重新轉；列的位置照凍結 hook 先不換

**Given** 系統開了減少動態
**When** 打開 App
**Then** 不轉也不淡入，直接畫目前進度和列，功能照常

**Given** 效能
**When** 列表和看板各有 4165 個假種子
**Then** 同時轉的圓圈只有看得到的那些，PR 附 Chrome Performance 錄的一段打開 App，沒有長於 50 毫秒的工作
**And** （Alex 在手機上驗收）列表和看板打開時進度環轉進來、列進場不掉格，目標 60fps
**And** PR 附一段螢幕錄影或連續截圖，電腦和手機各一組

### Story 2.10：出錯種子的原因

身為 Alex，我想要出錯的種子顯示 qBittorrent 給的原因，這樣不用打開 qBittorrent 的 log 也知道怎麼處理。

**由來：** 2026-11-16 Story 1.6 查到 qBittorrent 5.1.4 的 `sync/maindata` 和其他 WebUI API 都沒有錯誤原因欄位，原因只寫在 qBittorrent 自己的 log 文字裡。Alex 選了「先固定，之後加一張 story」：Story 1.6 起第二行先寫固定的「qBittorrent 回報錯誤」，這張再換成真的原因。
**涵蓋：** FR-8（錯誤原因那一行）、EXPERIENCE〔qBittorrent 狀態對應〕的 `error` 列
**規格：** AD-5（只加有名字的唯讀方法，不做通用轉送）、AD-15（只讀）、AD-16（log 不漏秘密）

**Acceptance Criteria:**

**Given** 一個 `error` 狀態的種子
**When** 容器用唯讀的 qBittorrent log API 找到這個種子最近一筆錯誤
**Then** 第二行和詳情摘要顯示整理過的原因；找不到時維持「qBittorrent 回報錯誤」
**And** 原因裡的路徑、IP、帳號一律拿掉或換成代稱，私人分類只寫 X、mteam-X；vitest 用假的 log 測

**Given** qBittorrent client
**When** 加這個功能
**Then** 只新增一個有名字的唯讀方法，路徑加進型別白名單；不碰任何寫入或設定
**And** 讀 log 有頻率上限，不跟著每 5 秒輪詢

## Epic 3：找得到、記得住

Alex 用分類分頁（手機是分類清單）篩選，在目前分類裡打字找名字；每個分類記住最後一次手動選的排序，存在 NAS 上，電腦和手機共用；打開 App 回到這台裝置上次看的分類和種子；電腦有快捷鍵和說明視窗；設定頁可以排分類順序、開關自動收合。設定檔 `settings.json` 在這個 epic 第一次出現。勾選、刪除、新增、改路徑、改檔名都不在這個 epic。

**Epic 3 共用的決定（Claude 代決，Alex 可以否決）：**

- 目前分類和搜尋關鍵字放 URL search params（`category`、`q`，schema 在 `src/shared`，zod 驗），跟 Epic 2 的 `sort`、`dir`、`hash` 一樣用 replace，不堆瀏覽紀錄。`category` 不合法或那個分類已經不存在時改回「全部」並修正網址。
- 網址的 `sort`、`dir` 是「現在畫面用的排序」。換分類時 App 把它換成那個分類記住的；Alex 手動選排序時同時改網址和 `settings.json`。
- 沒記過排序的分類用「狀態」（照 PRD FR-28 的假設）。
- 未分類用空字串當 key（AD-8），有種子時才出現，畫面上寫「未分類」，排法跟其他分類一樣，不另外處理。
- 設定檔的單一筆資料不合法（例如排序 id 已經不在 51 個裡）時，只丟掉那一筆並記 log，不當成整份壞掉；JSON 讀不了才照 AD-8 改名保留再用預設值。
- 設定頁的分類順序按上下箭頭後，等容器回應才換位置（不先改畫面）；等的期間那一列的箭頭不能按。
- 快捷鍵、設定頁、分類分頁的數字提示都只在電腦版（寬度 1024px 以上）。

### Story 3.1：設定檔和「全部」記住排序

身為 Alex，我想要在「全部」手動選的排序存在 NAS 上，電腦改了手機也跟著換，這樣不管用哪台打開都是我上次選的樣子。

**涵蓋：** FR-28（存取和「全部」）、NFR-14、AR-29（共用路徑 schema）、AR-33（`settings_write_failed`）、AR-36（設定檔寫入失敗）、AR-45、AR-46、AR-47、AR-48（`getSettings`、`setCategorySort`）、AR-49（每分類排序）、AR-53、AR-55、UX-DR88（等設定檔）
**規格：** PRD FR-28、NFR-14；EXPERIENCE〔排序和檢視〕「每個分類記住最後一次手動選的排序」〔State Patterns〕「第一次載入」；架構底稿〔結構／原始碼〕的 `server/settings`；AD-8、AD-9、AD-12、AD-13、AD-16

**Acceptance Criteria:**

**Given** `src/shared/settings.ts`
**When** 這張 story 定 schema（之後的 story 不准改，要改先改底稿）
**Then** 格式是 `{ version: 1, categorySort: {}, categoryOrder: [], commonPaths: [] }`：`categorySort` 是「分類 key 對 `{ sort, dir }`」，`sort` 只能是 `src/shared/sort-fields.ts` 的 51 個 id；`categoryOrder` 是分類名的陣列、不含 `ALL`；`commonPaths` 每筆是 `{ path, name, mediaLibrary }`，`path` 過共用路徑 schema，`name` 1 到 50 字，最多 50 筆，`mediaLibrary` 是 boolean
**And** `src/shared/categories.ts` 定 `ALL = '__all__'`，未分類用空字串
**And** vitest 測每個欄位的合法和不合法值、50 筆和 51 筆、名字 50 字和 51 字

**Given** `src/shared` 的共用路徑 schema（AR-29）
**When** 驗一個路徑
**Then** 要是絕對路徑，不含 NUL、反斜線、控制字元，任何一段是 `..` 就拒絕，長度上限 1024，先正規化（拿掉重複和結尾的斜線）
**And** 容器端再檢查正規化後在 `SAVE_ROOTS` 某個根目錄底下，以資料夾為界（根目錄 `/data` 不收 `/database`）
**And** vitest 測 `..`、結尾斜線、重複斜線、控制字元、1024 和 1025 字、根目錄邊界

**Given** `src/server/settings` 讀 `${CONFIG_DIR}/settings.json`
**When** 檔案不存在
**Then** 用預設值建立，權限 600
**When** 檔案缺某個區塊
**Then** 補預設值，其他區塊照舊
**When** JSON 讀不了
**Then** 把舊檔改名保留（檔名帶時間），用預設值建新檔，記 log（不記內容）
**When** `version` 比程式認得的新（例如 Alex 把映像退回上一版）
**Then** 不改名、不覆蓋，畫面用預設值，寫入一律回 `settings_write_failed`，記 log
**And** 遷移函式放 `src/server/settings/migrations.ts`，`version: 1` 先是空的；vitest 每種情況各測一次（用暫存資料夾，不碰 `./config`）

**Given** 容器寫設定檔
**When** 同時有 20 個修改進來
**Then** 用一把鎖排隊，每次先寫暫存檔再 rename，20 個修改都留著（vitest 測）
**And** 寫完整檔超過 256 KB 就拒絕，回 `settings_write_failed`；寫入失敗照 AR-36 記 log

**Given** `getSettings` 和 `setCategorySort` 兩個 server function
**When** 用工廠建立
**Then** `getSettings` 是 GET、沒有副作用；`setCategorySort` 是 POST，收 `{ category, sort, dir }`，冪等，成功回整份新設定
**And** 前端把回傳寫進 `['settings']`；視窗拿回焦點時重讀 `['settings']`
**And** 沒登入時兩個都回 `not_logged_in`（Story 1.2 的自動清單測得到）

**Given** 第一次載入
**When** `['maindata']` 到了但 `['settings']` 還沒到
**Then** 骨架留著，兩個都到了才換上資料（收掉 Story 1.8 留給 Epic 3 的條件）

**Given** 目前在「全部」（這個 epic 還沒有分類分頁時只有「全部」）
**When** Alex 從排序選單或手機排序面板選一個排序，或點選中的項目反轉方向
**Then** 網址照 Epic 2 換，同時呼叫 `setCategorySort(ALL, sort, dir)`
**And** 網址沒有 `sort` 時改用這個分類記住的排序，沒記過才用「狀態」（收掉 Epic 2 寫死預設「狀態」的做法）

**Given** 電腦改了「全部」的排序
**When** 手機的分頁拿回焦點、重讀到新設定
**Then** 手機目前在「全部」時排序換成新記住的，列表捲回最上面

**Given** `setCategorySort` 失敗
**When** code 是 `settings_write_failed`、`timeout`、`invalid_input`
**Then** 跳「失敗帶重試」toast，字從 `src/lib/error-text.ts` 拿，按「重試」再送一次；畫面維持 Alex 剛選的排序
**And** 連線類 code 只由全域處理，不另外跳 toast
**And** 所有測試只用假的 qBittorrent 回應和暫存的設定資料夾

### Story 3.2：電腦分類分頁

身為 Alex，我想要在電腦點分類分頁就篩成那個分類，排序自動換成我在那裡上次選的，這樣清理 mteam-seed 時不用每次手動改排序、改完再改回來。

**涵蓋：** FR-21、FR-28（換分類換排序、「這個分類記住的」）、FR-14（換分類再轉一次）、NFR-1、AR-41（分類篩選在 `selectVisibleTorrents`）、AR-46（分類 key、`categoryOrder` 排法）、AR-49（分類在 URL）、UX-DR18、UX-DR20（「這個分類記住的」）、UX-DR82（換分類）、UX-DR85（換分類）、UX-DR90（分類刪光或搬走最後一個）
**規格：** PRD FR-21、FR-28；EXPERIENCE〔Component Patterns〕的 category-tabs、sort-pill〔排序和檢視〕〔State Patterns〕「分類裡沒有種子、看板某欄是空的」；UX DESIGN.md〔Components〕的 category-tabs、sort-pill；AD-8、AD-13

**Acceptance Criteria:**

**Given** `selectVisibleTorrents(maindata, view)`，`view` 多帶分類
**When** 選一個分類
**Then** 只回那個分類的種子（未分類用空字串比對），「全部」是全部；列表模式照舊不含已整理，看板各欄和已整理欄只算這個分類
**And** 每個分頁的數量由 `src/lib` 的 selector 算，不含已整理；vitest 測分類、未分類、只剩已整理

**Given** 分頁的順序
**When** `src/lib` 排分頁
**Then** 「全部」固定第一，其他照 `categoryOrder`，不在清單的排最後、照名稱排；vitest 測
**And** 一個種子都沒有的分類不顯示分頁；只剩已整理的分類照樣顯示，數字寫 0
**And** 目前選中的分類在這裡刪光或搬走最後一個時，分頁留著、內容是「這個分類沒有種子」，離開這個分類後才消失

**Given** 寬度 1024px 以上
**When** 看分類分頁那一排
**Then** 照 UX-DR18：膠囊，名稱後接淡色數量；選中的 `accent` 底加 `accent-foreground` 字（數量 75% 透明）；沒選中的 `surface` 底、`border` 外框
**And** 放不下時左右捲、不顯示捲軸、右邊 24px 的 `surface-page` 到透明漸層蓋住、不折兩排；選中的分頁自動捲進看得到的範圍；排序按鈕固定在右邊不縮字
**And** 分類名當純文字；快捷鍵的 tooltip 在 Story 3.7 加

**Given** 點一個分頁
**When** 換分類
**Then** 網址的 `category` 用 replace 換；排序換成這個分類記住的，沒記過用「狀態」；列表和看板捲回最上面
**And** 進度環從 0 轉一次、列重新進場（呼叫 Story 2.9 留的觸發點）
**And** 4165 個假種子時，在開發機上換分類加重畫在 100 毫秒內，PR 附量測方法和數字

**Given** 在某個分類裡手動選排序或反轉方向
**When** 選好
**Then** 呼叫 `setCategorySort(這個分類, sort, dir)`，失敗照 Story 3.1

**Given** 「（這個分類記住的）」
**When** 換分類後排序跟換之前不一樣，而且是 App 自己換的
**Then** 排序按鈕後面接淡色「（這個分類記住的）」
**And** Alex 手動選了排序就消失；再換分類時照同一個條件重新判斷；剛打開 App、或換分類後排序剛好一樣時不出現
**And** 判斷由 `src/lib` 一個純函式做，輸入換之前的排序、換之後的排序、是誰換的；vitest 測每種情況

**Given** 網址的 `category`
**When** 重新整理，或打開一個帶 `category` 的網址
**Then** 回到那個分類；值不合法或分類已經不存在時改回「全部」，網址用 replace 修正
**And** PR 附電腦淺色和深色截圖：分頁放不下時、選中的在最右邊、「（這個分類記住的）」出現時、分類刪光的空狀態

### Story 3.3：設定頁

身為 Alex，我想要在設定頁排分類分頁的順序、開關看板自動收合，這樣最常用的分類排在前面，不想要自動收合時也能關掉。

**涵蓋：** FR-54、NFR-7、NFR-14、AR-48（`setCategoryOrder`）、AR-49（自動收合開關）、UX-DR70、UX-DR83（設定關掉時不收）
**規格：** PRD FR-54；EXPERIENCE〔Information Architecture〕設定頁那段〔動態〕「看板自動收合」的設定；架構底稿〔一致性慣例〕的介面元件（沿用舊設定頁）；AD-8、AD-13

**Acceptance Criteria:**

**Given** 頁首的設定按鈕（電腦）
**When** 點它
**Then** 拿掉 disabled，進設定頁（`aria-label`「設定」）；設定頁的位置和樣式照舊版設定頁（Story 1.1 刪掉了，從 git 歷史看），程式重寫
**And** 頁首照常；設定頁上方一顆返回按鈕回到進來前的列表網址（含分類、排序）（Claude 代決：來源沒寫怎麼回去）

**Given** 設定頁
**When** 打開
**Then** 只有兩項：分類分頁順序、「捲動時自動收合其他欄」開關；沒有常用路徑、快捷鍵自訂、深淺色切換

**Given** 分類分頁順序
**When** 看清單
**Then** 「全部」固定第一、沒有箭頭；其他是 qBittorrent 的全部分類（含現在沒有種子的），照 Story 3.2 的排法；每列右邊上下箭頭，第一個不能往上、最後一個不能往下，箭頭有 `aria-label`（「把 mteam-tv 往上移」）
**When** 按一個箭頭
**Then** 呼叫 `setCategoryOrder`，送整份新順序（冪等），成功後清單和分類分頁照回傳的設定換位置；等的期間那一列的箭頭不能按
**And** 失敗照 Story 3.1 跳「失敗帶重試」toast，清單維持原本的順序
**And** `categoryOrder` 不存 `ALL`；vitest 測容器端收到含 `ALL` 或重複名稱時回 `invalid_input`

**Given** 「捲動時自動收合其他欄」開關
**When** 打開設定頁
**Then** 讀 `src/lib/prefs.ts` 那個 key（Story 2.8 定的），預設開；切換後馬上存在這台裝置
**And** 關掉後看板捲動不收合；手機上照樣顯示，旁邊一行 `text-muted`「只在電腦版有用」
**And** localStorage 讀寫失敗時當作開著，不報錯

**Given** 鍵盤操作
**When** 用 Tab 走過返回、箭頭、開關
**Then** 都有焦點外框，開關能用空白鍵切換
**And** PR 附電腦和手機 390px、淺色和深色的設定頁截圖；手機的入口在 Story 3.4 接上

### Story 3.4：手機分類清單

身為 Alex，我想要在手機點分類按鈕從下面彈出分類清單換分類，從最下面進設定頁，這樣在外面用手機也能只看 mteam-tv。

**涵蓋：** FR-22、FR-28（手機那一行）、FR-60（分類面板）、NFR-5、NFR-7、UX-DR14（分類按鈕）、UX-DR19、UX-DR21（「排序換成這個分類記住的」那一行）、UX-DR78
**規格：** PRD FR-22、FR-28；EXPERIENCE〔Component Patterns〕的 category-sheet、sort-pill；UX DESIGN.md〔Components〕的 category-sheet、sort-pill〔Layout & Spacing〕手機頂端；AD-13

**Acceptance Criteria:**

**Given** 寬度小於 1024px
**When** 看第三排
**Then** 分類按鈕拿掉 disabled，寫「分類名 數量 ▾」，例如「mteam-tv 203 ▾」（數量不含已整理），44px 膠囊，`aria-label`「分類：mteam-tv」

**Given** 點分類按鈕
**When** 分類面板打開
**Then** 用 Story 2.2 的「跟著內容」底部面板，標題「分類」；列高 52px，左邊分類名（`body` 13px），右邊數量（`text-muted`、等寬數字）
**And** 「全部」第一列，其他照 Story 3.2 的順序，沒有種子的分類不列；目前的分類粗體 700，最左邊打勾圖示
**And** 最下面用 `border` 細線隔開一列「設定」加齒輪圖示

**Given** 分類面板開著
**When** 點一個分類
**Then** 面板關掉，效果同 Story 3.2：網址換分類、排序換成記住的、捲回最上面、進度環再轉一次
**When** 點「設定」
**Then** 進設定頁（Story 3.3）
**When** 點目前的分類
**Then** 面板關掉，什麼都不換

**Given** 換分類後排序是 App 自己換的、而且跟之前不一樣
**When** 看第三排下面
**Then** 多一行 `meta` 12px、`text-muted`「排序換成這個分類記住的：做種時間」；出現和消失的條件跟 Story 3.2 同一個純函式
**And** 這一行出現和消失時下面的內容往下推，不蓋住列表

**Given** 手機 390px
**When** 截圖
**Then** PR 附淺色和深色的分類按鈕、分類面板（含「設定」那列）、「排序換成這個分類記住的」那一行截圖，沒有橫向捲動

### Story 3.5：列表內搜尋

身為 Alex，我想要在目前分類裡打字邊打邊篩名字，找不到時一鍵改到「全部」找，這樣在 3,000 多個種子裡也能馬上找到某一部。

**涵蓋：** FR-23、FR-24、NFR-1、NFR-10、AR-41（搜尋在 `selectVisibleTorrents`）、AR-49（搜尋在 URL）、AR-52（`/`、`Esc` 關搜尋）、UX-DR23、UX-DR77（搜尋按鈕）、UX-DR91
**規格：** PRD FR-23、FR-24；EXPERIENCE〔Component Patterns〕的 search-box〔State Patterns〕「搜尋沒結果」〔Interaction Primitives〕的快捷鍵；UX DESIGN.md〔Components〕的 search-box；AD-13

**Acceptance Criteria:**

**Given** 頁首的放大鏡
**When** 點它，或電腦按 `/`
**Then** 放大鏡拿掉 disabled（`aria-label`「搜尋」）；`/` 登記在 Story 2.4 那份快捷鍵表
**And** 電腦：放大鏡原地往左變成 240×36px 膠囊（`surface` 底、`border` 外框），左邊放大鏡、右邊 ✕、提示字「找名字」，蓋在頁首空白上，其他按鈕不動
**And** 手機：44px 高、寬度拉滿蓋住第一排，字 16px，右邊「取消」文字按鈕
**And** 打開時焦點在輸入框

**Given** 搜尋框開著
**When** 打字
**Then** 邊打邊篩：只找目前分類，只比對名稱，不分大小寫，前後空白不算；空字串等於沒篩
**And** 關鍵字放網址的 `q`（replace）；篩選在 `selectVisibleTorrents` 做，功能程式不自己篩
**And** 4165 個假種子時，每打一個字在開發機上篩加重畫在 100 毫秒內，PR 附數字
**And** 關鍵字裡的特殊字元（`.`、`*`、`(`、`<script>`）當一般字比對，畫面上原樣顯示

**Given** 有關鍵字
**When** 看列表和看板
**Then** 列表模式和手機不含已整理；電腦看板的已整理欄跟著篩，收著時上面的數量變成符合的數量
**And** 看板各欄數量和「第 N 個／共 M 個」跟著搜尋結果變；分類分頁和分類按鈕上的數字不變
**And** 看板有結果時 4 欄都留著，空的欄寫「沒有」
**And** 正在看的種子被篩掉時照 Story 2.4 換下一個或關掉

**Given** 有關鍵字時換分類
**When** 點分頁或分類清單
**Then** 關鍵字留著、搜尋框開著，列表捲回最上面

**Given** 搜尋沒結果
**When** 不在「全部」
**Then** 內容區中間寫「『牧神記』在 mteam-tv 找不到」，下面外框按鈕「在全部裡找」；點了換到「全部」（排序換成「全部」記住的），關鍵字留著
**When** 已經在「全部」
**Then** 只寫「找不到『牧神記』」
**And** 看板 4 欄和已整理欄全空時，整個看板換成這句；只有部分欄空時不換

**Given** 關掉搜尋
**When** 按 ✕、手機的「取消」，或按 `Esc`
**Then** 清掉關鍵字、拿掉網址的 `q`、收回放大鏡
**And** `Esc` 照快捷鍵表的順序：有對話框先關對話框，再來是搜尋，最後是詳情；焦點在搜尋框時也認 `Esc`
**And** 中文輸入法選字中按 `Esc` 或 Enter 不算（看 `isComposing`）；vitest 測 `Esc` 的順序
**And** PR 附電腦和手機 390px、淺色和深色截圖：搜尋框打開、有結果的看板、沒結果（在分類裡、在「全部」）

### Story 3.6：打開 App 回到上次的地方

身為 Alex，我想要打開 App 時回到這台裝置上次看的分類、那個分類記住的排序和上次看的種子，這樣關掉再開不用重新找。

**涵蓋：** FR-29、FR-16（上次看的種子）、AR-49（上次看的分類、每分類上次看的種子）
**規格：** PRD FR-16、FR-29；EXPERIENCE〔排序和檢視〕「打開 App 回到上次看的分類」〔Component Patterns〕的 detail-panel；AD-13

**Acceptance Criteria:**

**Given** `src/lib/prefs.ts` 的 key 表
**When** 這張 story 加 key
**Then** 加「上次看的分類」和「每分類上次看的種子」兩個；讀的時候用 zod 驗，值不合法或讀寫丟錯就當沒有
**And** localStorage 只經過 `src/lib/prefs.ts` 讀寫，功能程式裡沒有直接用 `localStorage`

**Given** 換分類或看了一個種子
**When** 網址的 `category` 或 `hash` 變了
**Then** 記下這台裝置上次看的分類，以及這個分類上次看的 hash

**Given** 打開 App，網址沒有 `category`、`sort`、`hash`
**When** 載入完成
**Then** 回到上次看的分類（分類已經不存在就用「全部」），排序是那個分類記住的，網址用 replace 補上
**And** 列表模式的詳情先顯示這個分類上次看的種子；它不在目前的列表裡（被刪、變成已整理、被篩掉）就顯示第一個
**And** 看板模式不自動打開詳情面板，手機不自動打開底部面板（Claude 代決：看板和手機的詳情是點了才出來）

**Given** 網址有帶 `category`、`sort` 或 `hash`（例如重新整理、登入後回原網址）
**When** 打開
**Then** 照網址，不用記住的值蓋掉

**Given** 列表模式，換分類或換排序
**When** 換好
**Then** 詳情先顯示這個分類上次看的那個，沒有就顯示第一個（收掉 Story 2.4「不含上次看的種子」）
**And** 那一列不在畫面上時不捲過去（PRD FR-16 的假設），按 `↑` `↓` 才捲過去（Story 3.7）

**Given** 兩台裝置
**When** 各自看不同分類
**Then** 各記各的，不經過 NAS；vitest 測 prefs 的讀寫、壞值、讀寫丟錯

### Story 3.7：快捷鍵和說明視窗

身為 Alex，我想要在電腦用鍵盤換種子、跳分類、選常用排序，忘了時打開說明視窗查，這樣清理時手不用一直離開鍵盤。

**涵蓋：** FR-55、FR-56、NFR-7、AR-52、UX-DR18（tooltip 的數字）、UX-DR22（`1` 到 `5` 生效）、UX-DR57、UX-DR76、UX-DR77（快捷鍵按鈕）
**規格：** PRD FR-55、FR-56；EXPERIENCE〔Interaction Primitives〕的快捷鍵、前後切換、看板模式的詳情〔Component Patterns〕的 category-tabs、shortcut-help〔Accessibility Floor〕；UX DESIGN.md〔Components〕的 shortcut-help；AD-13

**Acceptance Criteria:**

**Given** `src/state` 的快捷鍵登記表
**When** 這張 story 補齊
**Then** 表裡有：`/` 搜尋、`Esc`、`↑` `↓`、`1` 到 `9`、`[` `]`、`S` 加 `1` 到 `5`、`?`；每一項有按鍵、說明文字、分組
**And** 只在寬度 1024px 以上生效；焦點在輸入框時只認 `Esc`；有按 Cmd、Ctrl、Alt 的組合不攔（瀏覽器自己的快捷鍵照常）；中文輸入法選字中不算
**And** vitest 測登記、輸入框規則、組合鍵不攔

**Given** 列表模式
**When** 按 `↑` `↓`
**Then** 照凍結 hook 的順序換上一個、下一個，詳情跟著換，網址的 `hash` 用 replace 換；到頭尾時不動
**And** 鍵盤焦點跟著正在看的那一列走，那一列不在畫面上時捲進看得到的範圍
**And** 用 Tab 走到別列時那一列有外框，正在看的那一列保留內框

**Given** 看板模式
**When** 詳情面板開著時按 `↑` `↓`
**Then** 換同一欄的上一張、下一張，跟 ‹ › 同一個函式，到欄的頭尾不動、不跳欄
**When** 詳情面板沒開
**Then** `↑` `↓` 不做事

**Given** 按 `1` 到 `9` 或 `[` `]`
**When** 換分類
**Then** `1` 是「全部」，`2` 到 `9` 是後面 8 個分頁，照 Story 3.2 的順序；沒有那個分頁就不動
**And** `[` `]` 換上一個、下一個分頁，到頭尾時不繞回（Claude 代決：來源沒寫）
**And** 效果同點分頁：排序換成記住的、捲回最上面

**Given** 按 `S`
**When** 排序選單打開
**Then** 再按 `1` 到 `5` 選狀態、做種時間、加入時間、分享率、完成時間，效果同點選單（收掉 Story 2.1「只是字，按鍵在 Epic 3」）

**Given** 按 `?` 或點頁首的快捷鍵按鈕
**When** 說明視窗打開
**Then** 快捷鍵按鈕拿掉 disabled（`aria-label`「快捷鍵」）；shadcn `Dialog`，內容從登記表產生，照分組列出按鍵和說明；`Esc` 或 ✕ 關掉
**And** 手機沒有這顆按鈕

**Given** tooltip
**When** 滑到分類分頁、頁首按鈕、排序選單上面 5 項
**Then** 分類分頁的 tooltip 寫它的數字（只有前 9 個）；搜尋、快捷鍵按鈕的 tooltip 寫按鍵；排序選單的 1 到 5 照舊
**And** 這些字都從登記表拿；vitest 檢查 tooltip 和說明視窗用的是同一份資料
**And** PR 附說明視窗的淺色和深色截圖，加一段用鍵盤從換分類、選排序、`↑` `↓` 換種子到 `Esc` 關掉的螢幕錄影

## Epic 4：新增和刪除

Alex 勾選多個種子（電腦滑上去勾，手機長按進入選取），從選取列一次刪除，刪除確認清楚寫出刪哪些、會不會連檔案一起刪；一次貼上或拖進很多個磁力連結和 .torrent 檔新增，重複、看不懂、太大的當下就標出來；失敗時看得到原因並能重試。改路徑和改檔名不在這個 epic。

**Epic 4 共用的決定（Claude 代決，Alex 可以否決）：**

- 電腦對話框和手機底部面板的切換做成一個共用元件（建造順序第 4 步留下的），放在 Epic 2 放底部面板的共用目錄；Story 4.3 第一次做，新增和 Epic 5 照用。
- 選取列的「改路徑」在 Epic 4 照 Epic 1 的 disabled 做法留著，Epic 5 接上。
- 選取加總和刪除的大小只算檔案還在的，不算已整理和找不到檔案的；判斷由 `classify()` 給，加總由 `src/lib` 的 selector 算。
- 刪除成功後，等 `refreshMaindata()` 拿到的資料裡那些種子真的不見了才淡出（AD-7：不先改畫面）。
- 新增時在「全部」打開，分類選單先空著，選了分類才能按「新增」；在某個分類裡打開就預設那個分類。
- 同一次貼上裡兩筆一樣的種子自動併成一列，不另外標。
- 只有 v2 的 .torrent 檔和只有 `btmh` 的磁力連結先當「看不懂」（M-Team 的種子是 v1；要支援再改 `info-hash.ts`）。
- 一批可以加的超過 20 筆或加起來超過 50 MB 時，前端拆成好幾個請求依序送，結果合起來顯示（照 PRD FR-38 的假設）。

**底稿衝突（2026-11-15 已改架構 AD-12，Claude 代決）：**

- AR-27 規定 `.torrent` 以外的 body 上限 64 KB，AR-28 又允許一次 5000 個 hash。64 KB 的 JSON 大約只放得下 1,500 個 40 位的 hash，UX 的例子「刪除 3,626 個種子」送不出去。已改 AD-12：收 hash 陣列的請求上限 384 KB（5000 個 64 位 hash 的 JSON 約 330 KB）。Story 4.3 和 Story 5.5 照新的 AD-12 做。

### Story 4.1：電腦勾選和選取列

身為 Alex，我想要在電腦滑到列或卡片上就能勾，勾了以後下面浮出選取列寫「已選 3 個　共 301.2 GB」，這樣清理時一眼知道選了多少、會刪掉多大。

**涵蓋：** FR-30、FR-32（電腦）、NFR-3、NFR-4、NFR-7、AR-50（有勾選）、AR-51、UX-DR12（已勾選的 hover）、UX-DR29（勾選框）、UX-DR30（勾選底色）、UX-DR35、UX-DR37、UX-DR55（選取列在時 toast 上移）、UX-DR72（底部 110px）、UX-DR75（選取列的焦點）、UX-DR80（選取列）、UX-DR87（選取列滑入滑出）
**規格：** PRD FR-30、FR-32；EXPERIENCE〔Component Patterns〕的 checkbox、selection-bar、list-row、board-card〔Interaction Primitives〕的選取〔排序和檢視〕「資料一直更新時先不重排」；UX DESIGN.md〔Components〕的 checkbox、selection-bar；AD-13

**Acceptance Criteria:**

**Given** `src/state/selection`
**When** 勾選和取消
**Then** 存成有序的 hash 陣列，最早勾的在前；換分類、改搜尋關鍵字時清掉；每次 `['maindata']` 更新後拿掉已經不存在的 hash
**And** 已整理欄展開後的卡片也能勾；vitest 測順序、清掉、拿掉不存在的

**Given** 寬度 1024px 以上
**When** 滑鼠移到列表列或看板卡片上
**Then** 勾選框在列表列最左邊、卡片左上角往外 6px 出現（自帶 `surface` 底）；20px、圓角 6px，沒勾是 2px `text-faint` 外框，勾了是 `accent` 底加 `accent-foreground` 勾
**And** 勾了第一個之後所有列和卡片都顯示勾選框，全部取消後又藏起來；列表列的 20px 一直留著（Epic 1 留的空位），列不跳
**And** 鍵盤聚焦到列或卡片時勾選框也出現，聚焦到勾選框按空白鍵能勾；`aria-label`「選取 <種子名稱>」

**Given** 點勾選框
**When** 勾或取消
**Then** 只改選取，不換詳情；點列的其他地方照 Epic 2 打開詳情
**And** 勾選的列底色是 `selection-row`，hover 不變；卡片勾選時同樣有 `selection-row` 底
**And** 有勾選時列表先不重排（凍結 hook 多一個條件，vitest 測），全部取消後重排一次

**Given** 勾了一個以上
**When** 選取列出現
**Then** 浮在下方置中的膠囊，`selection-bar` 底、`selection-bar-foreground` 字、浮層陰影；由左到右「已選 N 個」（粗）、「共 X GB」（淡）、取消（只有字）、改路徑（外框膠囊）、刪除（含檔案）（`delete` 實心，最右邊）
**And** 數量有千分位；加總照 Epic 4 共用的決定，經 `format.ts`
**And** 勾第一個時從下面滑上來、清空時滑下去，只動 `transform`；減少動態開著時直接出現和消失
**And** 按鈕的焦點外框用 `selection-bar-foreground`

**Given** 選取列上的按鈕
**When** 按
**Then** 「取消」清掉選取；「改路徑」照 Epic 1 的 disabled 做法留到 Epic 5；「刪除（含檔案）」先 disabled，Story 4.3 接上
**And** 內容底部多留 110px，選取列不蓋住最後一列

**Given** 選取列在畫面上
**When** 跳 toast
**Then** toast 往上移到選取列上面 16px（接上 Story 2.6 留的位置參數），不疊在一起

**Given** 本機用假的 qBittorrent 回應
**When** 截圖
**Then** PR 附電腦淺色和深色截圖：滑上去出現勾選框、勾了 3 個的列表和看板、選取列加 toast、勾到已整理和找不到檔案時的加總

### Story 4.2：手機選取模式

身為 Alex，我想要在手機長按列或卡片就進入選取，之後點一下就勾或取消，這樣在外面也能挑幾個種子刪掉。

**涵蓋：** FR-31、FR-32（手機）、NFR-3、NFR-4、NFR-5、NFR-7、AR-7（長按自己用 pointer events 寫）、UX-DR32（勾選框推移）、UX-DR38、UX-DR74（長按）、UX-DR78、UX-DR80（手機選取推移）、UX-DR87（手機推移）
**規格：** PRD FR-31、FR-32；EXPERIENCE〔Interaction Primitives〕的手機選取模式〔Component Patterns〕的 selection-bar；UX DESIGN.md〔Components〕的 selection-bar、list-row；AD-13

**Acceptance Criteria:**

**Given** 寬度小於 1024px
**When** 長按列或卡片 0.5 秒
**Then** 那一列底色變 `selection-row`、勾起來；所有列和卡片的勾選框出現，整列往右推 28px（0.2 秒，只動 `transform`）；選取列滑上來
**And** 支援 `navigator.vibrate` 的手機短震一下，不支援就不震
**And** 0.5 秒內手指移動超過 10px（在捲）就取消，不進入選取；長按不跳出系統的選字或圖片選單
**And** 長按的時間和移動門檻由 `src/lib` 的純函式判斷，vitest 測

**Given** 選取中
**When** 點列或卡片
**Then** 勾選或取消，不打開底部面板
**And** 左右滑換狀態分頁照常，勾過的留著
**And** 手指在捲時照 Epic 1 的凍結先不重排

**Given** 選取中
**When** 按選取列的「取消」，或把勾的全部點掉
**Then** 離開選取：勾選框收起來、列推回原位、選取列滑下去
**And** 換分類、改搜尋時一樣清掉並離開

**Given** 手機的選取列
**When** 畫出來
**Then** 左右各留 16px、兩排、圓角 22px；第一排「已選 3 個　共 301.2 GB」加「取消」（點擊範圍 44px）；第二排改路徑、刪除（含檔案）各佔一半，高 44px，間距 8px
**And** 改路徑照 Epic 1 的 disabled 做法，刪除（含檔案）先 disabled，Story 4.3 接上
**And** 減少動態開著時推移和滑動都不播，直接到結果

**Given** 手機 390px
**When** 截圖
**Then** PR 附淺色和深色的列表和看板選取中截圖，沒有橫向捲動
**And** （Alex 在手機上驗收）長按進入、捲動不誤觸、推移不掉格

### Story 4.3：刪除確認和刪除

身為 Alex，我想要按「刪除（含檔案）」後先看到要刪哪些、會不會連檔案一起刪，確定後一次刪掉，失敗時看到原因並能重試，這樣不會刪錯，也不用切回 VueTorrent。

**涵蓋：** FR-33、FR-34、FR-35（不含淡出）、FR-57（刪除）、FR-58（刪除）、NFR-1、NFR-12、NFR-13、NFR-15、AR-7、AR-24（`deleteTorrents`）、AR-25、AR-28、AR-30（一併刪檔是 boolean）、AR-42、AR-54（送完就當成功）、AR-55、UX-DR50（跟著內容）、UX-DR51（刪除 512px）、UX-DR64、UX-DR93（刪除中…）、UX-DR94（刪除失敗）
**規格：** PRD FR-33、FR-34、FR-35、FR-57、FR-58；EXPERIENCE〔刪除確認 delete-confirm〕〔State Patterns〕「送出中」「刪除、改路徑、改檔名失敗」「動作成功時」的刪除；UX DESIGN.md〔Components〕的 dialog、delete-confirm；AD-5、AD-7、AD-9、AD-12、AD-14、AD-15

**Acceptance Criteria:**

**Given** `deleteTorrents` server function
**When** 用工廠建立
**Then** POST，zod 收 `{ hashes, deleteFiles }`：hash 照 AR-28（40 或 64 位小寫 hex，不收 `all`、不含 `|`），`deleteFiles` 是必填的 boolean，沒傳就回 `invalid_input`，不用預設值
**And** hash 由容器用 qBittorrent 的格式串起來，參數用 `URLSearchParams` 組；qBittorrent 接受就回 AR-54 的批次形狀、每筆成功；qBittorrent 拒絕回整體的 `qbit_rejected`
**And** body 上限照新的 AD-12（384 KB），選 3,626 個時送得出去
**And** vitest 只用假的 qBittorrent 回應：送對端點和參數、`deleteFiles` 的 true 和 false、擋掉不合法的 hash 和缺 `deleteFiles`、沒登入回 `not_logged_in`；不對真的 qBittorrent 呼叫

**Given** 共用的對話框元件
**When** 這張 story 建立它
**Then** 電腦是 shadcn `Dialog`（刪除用 `AlertDialog`）：`surface` 底、1px `border`、圓角 22px、浮層陰影、內距 24px、區塊間距 14px、遮罩 `rgba(0,0,0,.5)`；標題 18px／700；底部按鈕靠右、36px 膠囊、間距 8px，主要按鈕最右；清單放圓角 16px 的框裡自己捲，對話框不超過畫面高；從 95% 放大加淡入 0.2 秒（減少動態時直接出現）
**And** 手機是 Story 2.2 的底部面板，同一份內容
**And** 送出中的做法做在這個元件：被按的按鈕換字、顏色不變、不能再按；取消、✕、`Esc`、點遮罩、往下拉都關不掉；超過 10 秒按鈕下面多一行 `meta`、`text-muted`「還在等 NAS 回應」

**Given** 選取列的「刪除（含檔案）」
**When** 按下去
**Then** 拿掉 disabled（電腦和手機），打開刪除確認；標題「刪除 N 個種子？」，數量有千分位
**And** 清單 `surface-muted` 底、圓角 16px、內距 4px，照勾選的先後排（最早勾的在最上面）；每列 8px 12px，名字 13px／600 一行加「…」（當純文字），大小 13px 靠右等寬
**And** 先列 5 個，下面「還有 N 個 ▾」（36px 文字按鈕、600）；展開後清單最高 320px 自己捲，用 `@tanstack/react-virtual`，3,626 個時 DOM 裡的列少於 60 個
**And** 找不到檔案的列在大小的位置寫 12px `text-muted`「找不到檔案」；有的話清單下面一行 `meta`、`text-muted`「其中 N 個找不到檔案，只會刪種子」

**Given** 「連檔案一起刪」
**When** 打開刪除確認
**Then** 20px 勾選，預設打勾；刪除按鈕一律 `delete` 色
**And** 有勾寫「刪除 3 個種子和檔案（301.2 GB）」，沒勾寫「只刪 3 個種子，檔案留著」；大小只加總檔案還在的，數量千分位、大小自動換 TB（「刪除 3,626 個種子和檔案（22.1 TB）」）
**And** 按鈕字和加總由 `src/lib` 的純函式算，vitest 測兩種字、千分位、TB、全部找不到檔案

**Given** 電腦的刪除確認
**When** 看版面和關法
**Then** 寬 512px，取消在左（外框），刪除在右，沒有 ✕；按 `Esc` 或取消都等於不刪，點對話框外面不會關
**And** 關掉後選取留著不清掉，焦點回到「刪除（含檔案）」

**Given** 手機的刪除確認
**When** 看版面和關法
**Then** 「跟著內容」的底部面板，最高 90%，清單長時往上拉高；勾選那一列 44px、字 15px；最下面只有一顆拉滿的刪除按鈕，沒有取消
**And** ✕ 或往下拉都等於不刪，選取留著

**Given** 刪除確認開著
**When** 有種子被別的地方刪掉（`['maindata']` 更新後從選取拿掉）
**Then** 清單、數量和大小跟著變；全部不見時對話框關掉（Claude 代決：來源沒寫）

**Given** 按刪除
**When** 送出中
**Then** 按鈕寫「刪除中…」，照共用元件的送出中做法
**When** 成功
**Then** 對話框關掉；toast「已刪除 3 個種子和檔案（301.2 GB）」，沒勾時「已刪除 3 個種子，檔案留著」（Claude 代決：來源只寫有勾的字），沒有復原
**And** 選取清空、選取列滑下去；呼叫 `refreshMaindata()`，那些 hash 記進 `pendingOps`，不改本機資料；被刪的列在下一次資料裡消失，詳情照 Story 2.4
**When** 失敗，code 不是連線類
**Then** 跳「失敗帶重試」toast，原因從 `src/lib/error-text.ts` 拿（例如「qBittorrent 沒有回應，請再試一次」）；對話框不關，勾選和展開的狀態留著；按「重試」照同樣內容再送
**And** 超過 30 秒照 `timeout` 處理；連線類只由全域處理，對話框留著、按鈕恢復能按；刪除沒有部分失敗的畫面

**Given** 本機用假的 qBittorrent 回應
**When** 截圖
**Then** PR 附電腦和手機 390px、淺色和深色截圖：3 個、展開「還有 N 個」、含找不到檔案、沒勾「連檔案一起刪」、刪除中、還在等 NAS 回應、失敗 toast
**And** （Alex 在 NAS 上驗收）對真的 qBittorrent 刪一個測試用的種子，一次不刪檔、一次連檔案

### Story 4.4：刪除淡出

身為 Alex，我想要刪除後被刪的列淡出、下面的列補上來，這樣看得出剛剛刪掉的是哪幾列。

**涵蓋：** FR-35（淡出）、NFR-3、NFR-4、AR-7、AR-44、AR-50（動畫中）、UX-DR80（刪除淡出）、UX-DR81、UX-DR84
**規格：** PRD FR-35；EXPERIENCE〔State Patterns〕「動作成功時」的刪除〔動態〕；AD-7、AD-13

**Acceptance Criteria:**

**Given** 這個分頁剛送出的刪除成功
**When** `refreshMaindata()` 拿到的資料裡那些 hash 不見了
**Then** 列表列和看板卡片淡出 0.2 秒（`opacity`），下面的列補上來（`transform`）；看得到的才播，畫面外的直接拿掉
**And** 刪除只負責把 hash 交給 `src/state` 標成「要離場」，離場動畫由列表和看板元件做
**And** 成功回應到了、資料還沒反映之前不先淡出（AD-7）

**Given** 淡出進行中
**When** 新的 `['maindata']` 到了
**Then** 先放著，動畫結束再套用；用 `src/state` 同一個凍結 hook（vitest 測開始和結束）
**And** 正在看的種子被刪時，動畫結束後才照 Story 2.4 換下一個或關面板

**Given** 種子是別台裝置或 VueTorrent 刪的
**When** 下一次資料裡不見了
**Then** 不播淡出，直接拿掉

**Given** 刪光了這個分類的種子
**When** 淡出結束
**Then** 換成「這個分類沒有種子」，分頁留到離開才消失（Story 3.2）

**Given** 系統開了減少動態
**When** 刪除成功
**Then** 不播淡出和補位，直接拿掉，功能照常

**Given** 效能
**When** 4165 個假種子、一次刪 50 個看得到的
**Then** Chrome Performance 錄的動畫期間只有 composite，沒有每格的 layout，PR 附錄製截圖
**And** PR 附一段電腦列表、電腦看板、手機列表的刪除淡出螢幕錄影

### Story 4.5：info hash 和貼上內容的判斷

身為 Alex，我想要貼上或拖進來的東西一進來就被判斷出是哪個種子、以前有沒有下載過、看不看得懂，這樣不用送出才知道哪幾筆不會加，在家走 http 也一樣。

**涵蓋：** FR-38（判斷規則）、NFR-9、NFR-10、AR-27（前端的大小檢查和拆批）、AR-41（`info-hash.ts`）、AR-55、AR-56（純 JS 的 SHA-1）
**規格：** PRD FR-38；EXPERIENCE〔新增種子 add-torrent〕的判斷和驗證；架構底稿〔一致性慣例〕的 info hash、只在 https 才有的瀏覽器 API；AD-12、AD-13

**Acceptance Criteria:**

**Given** `src/lib` 的 SHA-1
**When** 算雜湊
**Then** 純 JS，不用 `crypto.subtle`（在家走 http 沒有）；vitest 用標準測試向量（空字串、`abc`、1 MB 的資料）驗

**Given** `src/lib/info-hash.ts` 讀一個 .torrent 檔
**When** 檔案是合法的 v1 或 hybrid 種子
**Then** 用最小的 bencode 解析找出 `info` 字典的原始位元組，算 SHA-1，回小寫 40 位 hex，加上名稱（`info.name`，UTF-8 解碼，當純文字）和檔案大小
**When** 不是 bencode 字典、解析失敗、沒有 `info`、只有 v2
**Then** 回「看不懂這個檔案」
**When** 檔案超過 10 MB
**Then** 不讀內容，回「檔案超過 10 MB」（Claude 代決：文案來源沒寫，比照看不懂的列內標示）

**Given** 貼上的文字
**When** 拆成一筆一筆
**Then** 用換行和空白拆開；`magnet:` 開頭的解析 `xt=urn:btih:`（40 位 hex 或 32 位 base32，統一轉成小寫 hex）和 `dn`（名稱）；沒有 btih、http 網址、其他文字都回「看不懂這個連結」
**And** 同一次貼上裡 hash 一樣的併成一列

**Given** 判斷每一筆
**When** 跟 `['maindata']` 裡的全部種子（含已整理）比 hash
**Then** 已經有的標「以前下載過，已整理好」（不管它現在是什麼狀態，照 PRD FR-38 的假設），其他是「可以加」
**And** 清單順序：看不懂的（含超過 10 MB）最上面，再來以前下載過的，最後是可以加的；同一組裡照進來的順序
**And** 判斷由 `src/lib` 的純函式做，輸入每一筆和現有的 hash 集合；vitest 測每一種和排序

**Given** 可以加的那些
**When** 算怎麼送
**Then** `src/lib` 的純函式把它們拆成好幾批：每批最多 20 筆（磁力和檔案一起算），檔案加起來不超過 50 MB 並留表單的餘量
**And** vitest 測 20 和 21 筆、剛好 50 MB 上下、全是磁力

**Given** 測試用的 .torrent 檔
**When** 寫 vitest
**Then** 測試資料在測試裡用 bencode 現場產生，不放 Alex 真的種子檔、tracker 網址或私人分類的名稱
**And** 算 20 個 10 MB 檔的 info hash 時，主執行緒沒有長於 200 毫秒的工作（只雜湊 `info` 那段），PR 附量測

### Story 4.6：新增畫面：貼上、選檔案、拖檔

身為 Alex，我想要從頁首「新增」或把 .torrent 檔拖進來，一次貼很多筆，每筆一列看出能不能加，再選一個分類，這樣一次加完一整批不用一個一個來。

**涵蓋：** FR-36、FR-37（畫面）、FR-38（畫面）、FR-60（新增 90%）、NFR-5、NFR-7、NFR-10、UX-DR50（固定 90%）、UX-DR51（新增 640px）、UX-DR52（分類選單）、UX-DR56、UX-DR60、UX-DR61、UX-DR62（不含部分失敗）、UX-DR63、UX-DR77（新增種子）、UX-DR78、UX-DR90（「新增種子」按鈕）
**規格：** PRD FR-36、FR-37、FR-38；EXPERIENCE〔新增種子 add-torrent〕〔Component Patterns〕的 drop-overlay、add-torrent；UX DESIGN.md〔Components〕的 add-torrent、drop-overlay、text-input；AD-12、AD-13

**Acceptance Criteria:**

**Given** 頁首的「新增」和空狀態的「新增種子」
**When** 按下去
**Then** 兩顆都拿掉 disabled（手機圓按鈕 `aria-label`「新增種子」），打開新增：電腦是 640px 的對話框，手機是固定 90% 的底部面板、沒有取消按鈕、用 ✕ 或往下拉關掉

**Given** 新增是空的
**When** 打開
**Then** 200px 高大框：1.5px `text-faint` 虛線、`surface-muted` 底、圓角 16px，中間圖示加 15px／600「貼上磁力連結，或把 .torrent 檔拖進來」（手機寫「貼上磁力連結」），下面外框膠囊「選檔案」；「新增」不能按
**And** 大框是可以聚焦的輸入區：電腦按 Cmd 或 Ctrl 加 V，手機點了跳鍵盤、長按貼上；不靠 `navigator.clipboard.readText`（Claude 代決：在家走 http 沒有）
**And** 「選檔案」打開系統的選檔，可以多選，只列 .torrent

**Given** 貼上或選了檔案
**When** 照 Story 4.5 判斷完
**Then** 大框變成清單，放在圓角 16px 的框裡自己捲；每列最少 40px（手機 48px）：左邊 16px `text-muted` 圖示（連結或檔案），名字 13px／600 一行（磁力沒名字時寫連結開頭，等寬 12px），最右 28px ✕
**And** 有問題的列名字變 `text-muted`，✕ 左邊多小標籤加底線按鈕：看不懂的是 `status-error` 圖示加 12px／600 `status-error` 字和「拿掉」；以前下載過的是灰色封存盒圖示加 `text-muted` 字和「打開」；手機小標籤換到名字下一行，「拿掉」「打開」✕ 點擊範圍 44px
**And** 清單最下面固定一條貼上列（上緣 1px `text-faint` 虛線、`surface-muted` 底、28px「選檔案」；手機 52px 寫「貼上磁力連結」、「選檔案」44px），可以再貼或再選
**And** 名字一律當純文字

**Given** 清單上的按鈕
**When** 按 ✕ 或「拿掉」
**Then** 拿掉那一列，數字跟著變；全部拿掉時回到空的大框
**When** 按「打開」
**Then** 關掉新增，打開那個種子的詳情；它不在目前的列表裡時，固定頭不顯示「第 N 個／共 M 個」和前後按鈕（照 PRD FR-38 的假設）

**Given** 分類
**When** 看清單下面
**Then** 分類小標（12px／600）加分類選單（36px 膠囊、寬 240px 加 ▾；手機拉滿 44px），選項是 qBittorrent 的全部分類（含現在沒有種子的）
**And** 在某個分類裡打開預設那個分類；在「全部」打開時先空著
**And** 下面一行 `meta`、`text-muted`「會存到 <路徑>」，路徑用等寬字 `text`，取那個分類在 qBittorrent 設定的儲存路徑；分類沒設路徑時寫「會存到 qBittorrent 的預設位置」（Claude 代決）；不能在這裡改

**Given** 底部
**When** 清單有東西
**Then** 電腦左邊「有 N 個不會加」，右邊取消和「新增 N 個」（N 只算可以加的）；手機置中「有 N 個不會加」加拉滿的「新增 N 個」
**And** N 是 0、或還沒選分類時「新增」不能按；這張 story 的「新增」先不送出，Story 4.7 接上

**Given** 寬度 1024px 以上
**When** 把檔案拖到 App 任何地方
**Then** 拖的是檔案時全畫面蓋 `rgba(0,0,0,.5)`，往內 16px 一圈白色 2px 虛線框、圓角 22px，正中間 `surface` 卡片（圓角 22px、浮層陰影、內距 28px 40px）裡 40px 圖示加 `page-title`「放開就新增」
**And** 放開就打開新增並把檔案加進清單（新增已經開著就接在後面），可以一次拖好幾個；不是 .torrent 的也列出來標「看不懂這個檔案」
**And** 拖出視窗或按 `Esc` 時遮罩消失；拖的是文字不出現遮罩；手機沒有拖檔

**Given** 關掉新增
**When** 按取消、✕、`Esc`、往下拉
**Then** 清單丟掉，下次打開是空的
**And** PR 附電腦和手機 390px、淺色和深色截圖：空的、貼了 10 筆（含看不懂、以前下載過、超過 10 MB）、拖檔遮罩、在「全部」打開時分類空著

### Story 4.7：送出新增和結果

身為 Alex，我想要按「新增 N 個」後留在原畫面，全部成功時可以一鍵去看，有幾筆被拒絕時那幾筆留在清單上寫原因，這樣一批裡壞掉一兩個也不用整批重來。

**涵蓋：** FR-37（送出）、FR-39、FR-57（新增）、FR-58（新增）、NFR-10、NFR-12、NFR-13、NFR-15、AR-24（`addTorrents`）、AR-25、AR-27、AR-30、AR-42、AR-54、AR-55、UX-DR62（部分失敗）、UX-DR93（新增中…）、UX-DR94（新增失敗）
**規格：** PRD FR-37、FR-38、FR-39、FR-57、FR-58；EXPERIENCE〔新增種子 add-torrent〕的送出〔State Patterns〕「動作成功時」的新增種子、「送出中」；UX DESIGN.md〔Components〕的 add-torrent；AD-5、AD-7、AD-9、AD-12、AD-14、AD-15

**Acceptance Criteria:**

**Given** `addTorrents` server function
**When** 用工廠建立
**Then** POST、`FormData`，收磁力連結（只收 `magnet:` 開頭）、.torrent 檔、分類；不收 http 網址、不收 `savepath`；分類要在容器種子表的分類清單裡，否則回 `invalid_input`
**And** 每個檔案上限 10 MB、一次 20 個、整個請求 50 MB：先看 `Content-Length`，讀的時候邊讀邊算，超過就停止讀並回 `invalid_input`；檔案開頭要是 bencode 字典
**And** 容器一筆一筆送給 qBittorrent，回 AR-54 的批次形狀，`key` 是輸入的序號；容器絕不去抓使用者給的網址
**And** vitest 只用假的 qBittorrent 回應：送對端點和欄位、擋掉 http 網址、`savepath`、不存在的分類、非 bencode 檔、11 MB 檔、21 個檔、超過 50 MB、部分成功的結果形狀、沒登入回 `not_logged_in`

**Given** 按「新增 N 個」
**When** 送出前
**Then** 用最新的 `['maindata']` 再判斷一次重複，剛被別台加進去的改標「以前下載過，已整理好」，不送
**And** 照 Story 4.5 拆好的批次依序送，結果合起來
**When** 送出中
**Then** 按鈕寫「新增中…」，照 Story 4.3 共用元件的送出中做法（10 秒提示、關不掉）

**Given** 全部成功
**When** 結果回來
**Then** 對話框關掉，留在原本的畫面和分類，不跳走；呼叫 `refreshMaindata()`，不改本機資料
**And** 帶按鈕的 toast「已新增 8 個種子」加「去看」，停 8 秒：點了切到新增用的分類（效果同點分頁）；只加一個時把它的 hash 放進網址，種子出現在資料裡就打開詳情，30 秒內沒出現就只停在分類（Claude 代決）
**And** 排序是「狀態」時，新種子在看板「下載中」欄最前面（資料驅動，用假回應驗）

**Given** 有幾筆被拒絕
**When** 結果回來
**Then** 成功的從清單消失，失敗的留著；清單框最上面一條 13px／600 `status-error`「5 個加好了，2 個失敗」加圖示和細線
**And** 失敗列右邊寫 12px／600 `status-error` 原因，從 `src/lib/error-text.ts` 照 code 拿（例如「qBittorrent 沒有回應，請再試一次」「qBittorrent 讀不了這個檔案」）
**And** 按鈕變成「新增 2 個」，只算留著的；對話框不關，再按就只送留著的

**Given** 整個請求失敗
**When** code 不是連線類（`invalid_input`、`timeout`、`qbit_rejected`）
**Then** 跳「失敗帶重試」toast，對話框不關，清單和分類留著；按「重試」照同樣內容再送
**And** 連線類只由全域處理，清單留著、按鈕恢復能按；收到 `not_logged_in` 時照 AD-9 清單不保留

**Given** 本機用假的 qBittorrent 回應
**When** 截圖
**Then** PR 附電腦和手機 390px、淺色和深色截圖：新增中、全部成功的 toast、部分失敗、整批失敗的 toast
**And** （Alex 在 NAS 上驗收）對真的 qBittorrent 加一個磁力連結和一個 .torrent 檔

## Epic 5：整理檔案

Alex 從詳情改一個種子的儲存路徑，或從選取列一次搬好幾個；常用路徑一鍵選目標，並在改路徑畫面新增、改名、刪除、勾「媒體庫」；位置標籤看得出種子在哪、是不是在媒體庫；搬的期間看得到搬移中，只搬一個時搬完接著改檔名；整季批次改檔名或單檔改名，確定前先預覽。做完這個 epic，7 件事全部做得到。

**Epic 5 共用的決定（Claude 代決，Alex 可以否決）：**

- 常用路徑的格式照 Story 3.1 定的 `{ path, name, mediaLibrary }`，用正規化後的 `path` 當身分。
- 位置標籤的名字取最長相符的常用路徑；是不是媒體庫則看所有相符的常用路徑裡有沒有勾「媒體庫」的（勾了的路徑底下都算）。
- 前端只用共用路徑 schema 檢查格式（絕對路徑、沒有 `..`、長度），不合格時「搬過去」不能按並在框下面寫原因（照 PRD FR-41 的假設）；在不在 `SAVE_ROOTS` 底下由容器檢查，擋下時照失敗做法。
- `setLocation` 一個請求帶全部 hash：容器先逐筆檢查（種子還在、不是正在搬），沒過的那幾筆回失敗，其他一次交給 qBittorrent；qBittorrent 整個拒絕時回整體錯誤。部分失敗就是這樣來的。
- 搬完的 toast 只在發起的那個分頁出，靠 `src/state` 的 `pendingOps` 記住這個分頁搬了哪些和目標路徑。
- 一次搬好幾個時，已經在目標路徑的那幾個不送，也不算進「已開始搬 N 個」。
- 改檔名的請求依序送，每個請求不超過 64 KB；任何一筆失敗就停。

**底稿衝突（2026-11-15 已改架構 AD-12，Claude 代決）：**

- AD-12（AR-29）寫「改名的新名字只能是單一段（不含 `/`）」，但 FR-47 要把檔案放進 `<劇名>/season<n>/`，新路徑一定有三段。已改 AD-12：新路徑是種子內的相對路徑，可以多段，每一段各自檢查（不含 `\`、NUL、控制字元，不是 `.` 或 `..`），不能跳出種子自己的資料夾。Story 5.6 照新的 AD-12 做。
- 刪除那條 body 上限的衝突（見 Epic 4）也影響 Story 5.5 的 `setLocation`。

### Story 5.1：位置標籤和媒體庫

身為 Alex，我想要卡片、列和儲存位置區塊上的位置標籤寫常用路徑的名字，搬進媒體庫的變紫色，這樣一眼看出哪些已經整理進媒體庫。

**涵蓋：** FR-42、NFR-6、AR-41（`paths.ts` 的常用路徑比對）、UX-DR2（`media-library`）、UX-DR5（紫色只表示媒體庫）、UX-DR34（媒體庫）
**規格：** PRD FR-42；EXPERIENCE〔常用路徑和位置標籤〕〔Component Patterns〕的 location-tag；UX DESIGN.md〔Colors〕的媒體庫〔Components〕的 location-tag；AD-8、AD-13

**Acceptance Criteria:**

**Given** `src/lib/paths.ts`
**When** 輸入種子的 `save_path` 和 `commonPaths`
**Then** 回位置標籤的名字和是不是媒體庫：名字取最長相符的常用路徑，以資料夾為界（`/data/media/tv` 不配 `/data/media/tv2`），先正規化結尾斜線；都不相符時照 Epic 1 取最後兩層
**And** 媒體庫照 Epic 5 共用的決定：任何一個相符的常用路徑勾了「媒體庫」就算
**And** 功能程式裡沒有 `startsWith` 比路徑；vitest 測相等、子資料夾、`tv` 和 `tv2`、巢狀的常用路徑、外層勾媒體庫內層沒勾、結尾斜線、沒有常用路徑

**Given** 列表列、看板卡片、儲存位置區塊，和排序是「儲存路徑」時的大數字
**When** 畫位置標籤
**Then** 都用 `paths.ts` 的結果（收掉 Epic 1 只取最後兩層的暫時做法）
**And** 一般位置：外框加 `text-muted` 字、資料夾圖示
**And** 媒體庫在淺色：`media-library-tint` 底加 `media-library` 字、粗細 600、沒有外框；在深色：只有 `media-library-dark` 粗體字加資料夾圖示，沒有底和框
**And** 紫色不用在其他任何地方；標籤只顯示，不能點

**Given** `['settings']` 的常用路徑變了，或種子的 `save_path` 變了
**When** 下一次畫面更新
**Then** 標籤跟著換，不用重新整理
**And** 每個不同的 `save_path` 只算一次（memo），4165 個假種子、50 個常用路徑時，換常用路徑後重算加重畫在開發機上 100 毫秒內，PR 附數字

**Given** 本機手動放一份含常用路徑的 `./config/settings.json`（常用路徑的畫面在 Story 5.2 和 5.4）
**When** 截圖
**Then** PR 附電腦和手機 390px、淺色和深色截圖：一般位置、媒體庫、沒有相符時的最後兩層，在列表、看板卡片、儲存位置區塊各一張

### Story 5.2：改一個種子的路徑

身為 Alex，我想要在詳情按「改路徑」，從常用路徑點一下選好目標，或自己改「會搬到」的路徑，按「搬過去」就開始搬，這樣做種天數到了的影集一鍵搬進媒體庫。

**涵蓋：** FR-40（一個）、FR-41、FR-43（「加到常用」那一列）、FR-57（改路徑）、FR-58（改路徑）、NFR-10、NFR-12、NFR-13、NFR-15、AR-24（`setLocation`）、AR-25、AR-28、AR-29、AR-42、AR-43（容器記 `movingTo`）、AR-48（`addCommonPath`）、AR-54、AR-55、UX-DR51（改路徑 560px）、UX-DR52（路徑輸入框）、UX-DR53（儲存位置區塊的改路徑）、UX-DR65、UX-DR93（搬移中…）、UX-DR94（改路徑失敗）
**規格：** PRD FR-40、FR-41、FR-43；EXPERIENCE〔改路徑 change-path〕〔常用路徑和位置標籤〕〔State Patterns〕「送出中」「刪除、改路徑、改檔名失敗」；UX DESIGN.md〔Components〕的 change-path、text-input；AD-5、AD-7、AD-8、AD-9、AD-12、AD-14、AD-15

**Acceptance Criteria:**

**Given** `setLocation` server function
**When** 用工廠建立
**Then** POST，收 `{ hashes, location }`：hash 照 AR-28，`location` 過共用路徑 schema，容器再檢查在 `SAVE_ROOTS` 底下，否則回 `invalid_input`
**And** 照 Epic 5 共用的決定先逐筆檢查再一次交給 qBittorrent 5.1.4 的改儲存路徑 API（端點照官方文件確認，PR 附網址），回 AR-54 的批次形狀
**And** 成功的每一筆在容器種子表記 `movingTo`（正規化後的目標），`changedAt` 跟著加，`getMaindata` 一起回；`movingTo` 加進 `src/shared/maindata.ts`
**And** 看過 `moving` 又離開、或 `save_path` 等於目標時刪掉 `movingTo`；10 分鐘內一直沒進 `moving` 而且 `save_path` 沒變時也刪掉並記 log（Claude 代決：避免永遠卡在搬移中）
**And** vitest 只用假的 qBittorrent 回應：送對端點和參數、擋掉 `..` 和根目錄以外的路徑、部分失敗的形狀、`movingTo` 的記和刪、沒登入回 `not_logged_in`

**Given** `addCommonPath` server function
**When** 用工廠建立
**Then** POST、冪等，收 `{ path, name, mediaLibrary }`：`path` 過共用路徑 schema（AD-12），容器再檢查在 `SAVE_ROOTS` 底下，否則回 `invalid_input`；`name` 去掉前後空白後 1 到 50 字
**And** 用正規化後的 `path` 當身分：同一條路徑已經在清單裡就當成功，不重複加、不改原本那一筆
**And** 清單已經 50 個時回 `invalid_input`（路徑已經在清單裡的照上一條當成功）
**And** 成功回整份新設定，前端寫回 `['settings']`；寫檔照 Story 3.1 的設定檔做法
**And** vitest 測：同一條路徑（含結尾斜線不同）加兩次只留一筆、`..` 和 `SAVE_ROOTS` 以外的路徑回 `invalid_input`、第 51 個回 `invalid_input`、名字空白和 51 字回 `invalid_input`、沒登入回 `not_logged_in`

**Given** 詳情儲存位置區塊的「改路徑」
**When** 按下去
**Then** 拿掉 disabled（`accent` 實心），打開改路徑：電腦是 560px 對話框，標題「改路徑」下面一行 `meta`、`text-muted` 的種子名稱（純文字）；手機是「跟著內容」的底部面板、最高 90%、沒有取消按鈕
**And** 只有儲存路徑，沒有暫存路徑欄位；tv-sonarr、radarr 的種子不特別處理

**Given** 常用路徑清單
**When** 打開改路徑
**Then** 「常用路徑」小標（12px／600）；每列 52px（手機 56px）：20px 單選點，名稱 13px／600 加路徑（等寬 12px、`text-muted`），右邊媒體庫標籤和外框小標「目前」（種子現在所在的那個，照 `paths.ts`）
**And** 選中的列 `selection-row` 底，單選點是 2px `accent` 外圈加 `accent` 實心點
**And** 「編輯」按鈕這張先不放，Story 5.4 接上

**Given** 「會搬到」輸入框
**When** 點一個常用路徑
**Then** 框裡填好那個路徑，可以再改；框裡的路徑剛好等於某個常用路徑時那一列是選中的，否則都不選
**And** 36px 膠囊（手機 44px、字 16px），等寬 12px；一打開預設是種子目前的 `save_path`
**And** 框裡的路徑跟目前一樣時「搬過去」不能按
**And** 格式不對時外框換 `delete`，框下面一行 `meta` 寫原因（「路徑要從 / 開頭」「路徑不能有 ..」「路徑太長」），「搬過去」不能按（Claude 代決：文案來源沒寫）

**Given** 清單最後一列「加到常用」
**When** 按下去
**Then** 呼叫 `addCommonPath`，把框裡的路徑加進清單，名稱預設最後兩層，「媒體庫」不勾；成功後清單照回傳的設定換
**And** 框裡的路徑已經在清單裡時不能按，右邊 `meta`、`text-muted` 寫「框裡的路徑已經在清單裡」（手機「已在清單裡」）
**And** 已經 50 個時回 `invalid_input`，toast 寫「常用路徑最多 50 個」；其他失敗照 Story 3.1 跳「失敗帶重試」toast
**And** 加好後當場改名在 Story 5.4

**Given** 按「搬過去」
**When** 送出中
**Then** 按鈕寫「搬移中…」，照 Story 4.3 共用元件的送出中做法
**When** 成功
**Then** 關掉對話框，呼叫 `refreshMaindata()`，把這個 hash 和目標記進 `pendingOps`，不改本機資料；搬移中和搬完的畫面在 Story 5.3
**When** 失敗，code 不是連線類
**Then** 跳「失敗帶重試」toast，原因從 `src/lib/error-text.ts` 照 code 和操作拿（`invalid_input` 寫「這個路徑不在允許的下載資料夾底下」）；對話框不關，框裡的路徑留著；連線類只由全域處理

**Given** 本機用假的 qBittorrent 回應
**When** 截圖
**Then** PR 附電腦和手機 390px、淺色和深色截圖：改路徑（有「目前」、選中媒體庫）、路徑格式不對、已在清單裡、搬移中…、失敗 toast
**And** （Alex 在 NAS 上驗收）對真的 qBittorrent 把一個測試用的種子搬到另一個資料夾

### Story 5.3：搬移中和搬完

身為 Alex，我想要送出改路徑後列和詳情寫「搬移中」，關掉對話框或重新整理也看得到，真的搬完才跳提示，這樣不會以為沒反應又按一次。

**涵蓋：** FR-45（一個的搬移中和搬完）、NFR-13、AR-43（前端）、UX-DR44（搬移中）、UX-DR48（搬移中）、UX-DR95
**規格：** PRD FR-45；EXPERIENCE〔詳情狀態區每種狀態寫什麼〕的搬移中〔State Patterns〕「改路徑後檔案搬移中」「動作成功時」的改路徑〔qBittorrent 狀態對應〕的 `moving`；UX DESIGN.md〔Components〕的 save-path-block 搬的期間；AD-7、AD-13

**Acceptance Criteria:**

**Given** 種子有 `movingTo`，或狀態是 `moving`
**When** 畫列表列和看板卡片
**Then** 看板欄照原本那欄（`classify()` 照 Epic 1 的 `moving` 規則）；第二行寫「搬移中」
**And** 判斷由 `src/lib/torrent-status.ts` 給，功能程式裡沒有 `torrent.state ===`

**Given** 正在搬的種子的詳情
**When** 看概覽
**Then** 摘要最前面加「搬移中 · 正在搬到 <新路徑> · 」，新路徑取 `movingTo`，當純文字
**And** 儲存位置區塊四顆按鈕都 50% 不能按（收掉 Story 2.5「不含搬移中」）
**And** 關掉對話框、重新整理、換一台裝置打開都看得到搬移中和目標路徑

**Given** 這個分頁發起的單一搬移
**When** `movingTo` 從資料裡消失，而且 `save_path` 等於記下的目標
**Then** 跳 toast「已搬到 <新的位置標籤名字>」，例如「已搬到 影集媒體庫」；位置標籤換成新的，搬進媒體庫的變紫色
**And** 這張先用一般 toast，「接著改檔名」的按鈕在 Story 5.8 加上
**When** `movingTo` 消失但 `save_path` 不等於目標
**Then** 跳「失敗帶重試」toast「沒有搬到 <目標路徑>」，按「重試」用同一個目標再送一次（Claude 代決：來源沒寫）
**And** 判斷由 `src/lib` 的純函式做，輸入 `pendingOps` 裡的記錄、上一次和這一次的種子資料；vitest 測搬完、沒搬成功、別台發起的（不跳）

**Given** 別台裝置發起的搬移
**When** 這一台看到
**Then** 照樣顯示搬移中，搬完不跳 toast

**Given** 本機用假的 qBittorrent 回應（`moving` 的種子、有 `movingTo` 的種子）
**When** 截圖
**Then** PR 附電腦和手機 390px、淺色和深色截圖：列表和看板的搬移中、詳情的摘要和不能按的四顆按鈕、搬完的 toast

### Story 5.4：管理常用路徑和「☆ 加到常用」

身為 Alex，我想要在改路徑畫面直接改常用路徑的名字、勾「媒體庫」、刪掉用不到的，在詳情按一下就把目前的路徑加進常用，這樣常用路徑跟著我的資料夾走，不用另外的設定畫面。

**涵蓋：** FR-43（編輯）、FR-44、NFR-14、AR-46（常用路徑的身分和上限）、AR-48（`updateCommonPath`、`removeCommonPath`）、UX-DR48（☆ 加到常用）、UX-DR66
**規格：** PRD FR-43、FR-44；EXPERIENCE〔改路徑 change-path〕的版面〔常用路徑和位置標籤〕〔Component Patterns〕的 save-path-block；UX DESIGN.md〔Components〕的 change-path 編輯模式；AD-8

**Acceptance Criteria:**

**Given** `updateCommonPath` 和 `removeCommonPath` 兩個 server function
**When** 用工廠建立
**Then** 都是 POST、冪等，用正規化後的 `path` 找那一筆：`updateCommonPath` 改 `name`（去掉前後空白後 1 到 50 字）或 `mediaLibrary`；`removeCommonPath` 刪掉那一筆（不存在也算成功）；成功回整份新設定
**And** vitest 測：名字空白和 51 字回 `invalid_input`、兩台同時改不同的路徑兩個都留著、刪不存在的路徑

**Given** 改路徑畫面的常用路徑小標右邊
**When** 按 28px 外框膠囊「編輯」
**Then** 變成「完成」（700）；每列沒有單選點，名稱下面點狀底線；右邊「媒體庫」20px 勾選和 32px ✕（tooltip「從常用拿掉（不動檔案）」）；「加到常用」那列藏起來
**And** 手機每列 56px，「編輯」和輸入框 44px（字 16px）

**Given** 編輯模式
**When** 點名稱
**Then** 變成輸入框，Enter 或離開輸入框時存（`updateCommonPath`），`Esc` 取消這次改名、不關對話框
**When** 勾或取消「媒體庫」
**Then** 馬上存，位置標籤跟著換色
**When** 按 ✕
**Then** 馬上刪掉那一筆，不再確認，不動任何檔案；它剛好是選中的那一列時，「會搬到」框裡的路徑留著、單選點清掉
**And** 等回應的期間那一列的控制不能按；失敗照 Story 3.1 跳「失敗帶重試」toast，輸入框裡的字留著

**Given** 一般模式按「加到常用」成功
**When** 新的那一列出現
**Then** 名稱直接變成輸入框並選取文字，可以當場改；不改就照預設的最後兩層

**Given** 詳情儲存位置區塊的「☆ 加到常用」
**When** 按下去
**Then** 拿掉 disabled，呼叫 Story 5.2 建的 `addCommonPath`（沿用，不另建）加目前的 `save_path`，名字自動取最後兩層，「媒體庫」不勾，不問名字
**And** 成功跳帶按鈕的 toast「已加到常用：media/tv」加「改名」；點「改名」打開這個種子的改路徑，直接進編輯模式並聚焦那一列的名稱（Claude 代決：來源只寫「當場可以改」）
**And** 目前路徑已經在常用路徑裡時按鈕不能按，tooltip 寫「已經在常用路徑裡」（照 PRD FR-44 的假設）
**And** 已經 50 個或存不進去時照 Story 5.2 的做法

**Given** 本機用假的設定檔
**When** 截圖
**Then** PR 附電腦和手機 390px、淺色和深色截圖：編輯模式、改名中、加到常用後當場改名、「已加到常用」toast、☆ 不能按

### Story 5.5：一次搬好幾個和部分失敗

身為 Alex，我想要勾好幾個種子後從選取列一次搬到同一個地方，有幾個失敗時只列失敗的讓我重試，這樣一次整理一批也不怕漏掉。

**涵蓋：** FR-40（選取列）、FR-41（好幾個）、FR-45（好幾個）、FR-58（多選改路徑部分失敗）、NFR-12、NFR-15、AR-54、UX-DR37（改路徑）、UX-DR38（改路徑）、UX-DR65（好幾個）、UX-DR94（改路徑部分失敗）
**規格：** PRD FR-40、FR-41、FR-45、FR-58；EXPERIENCE〔改路徑 change-path〕〔State Patterns〕「多選動作部分失敗」「動作成功時」的改路徑（好幾個）；UX DESIGN.md〔Components〕的 change-path、selection-bar；AD-7、AD-13、AD-14

**Acceptance Criteria:**

**Given** 選取列的「改路徑」
**When** 按下去
**Then** 拿掉 disabled（電腦和手機），打開改路徑，一次搬全部選的
**And** 標題「搬 5 個種子」，下面一行「5 個種子現在在 2 個位置」（位置照正規化後的 `save_path` 算）
**And** 每個常用路徑右邊寫「目前 N 個」，N 是這一批裡現在在那裡的數量；「會搬到」預設空著
**And** 全部選的都已經在框裡的路徑時「搬過去」不能按
**And** body 上限照新的 AD-12（384 KB）

**Given** 按「搬過去」，全部成功
**When** 結果回來
**Then** 對話框關掉，toast「已開始搬 3 個種子」（只算真的送出的），選取清空；沒有「接著改檔名」
**And** 每個種子照 Story 5.3 顯示搬移中，搬完不跳 toast

**Given** 部分失敗
**When** 結果回來
**Then** 對話框不關，改成只列失敗的那幾個：最上面一行 `status-error`「3 個開始搬了，2 個失敗」，每列名稱下面一行 `status-error` 原因（從 `src/lib/error-text.ts` 照 code 拿）
**And** 主要按鈕變成「重試 2 個」，只送失敗的；取消或 ✕ 關掉
**And** 成功的照常（離開篩選的從列表消失），不另外跳 toast；選取只留失敗的（Claude 代決：來源沒寫）

**Given** 整個請求失敗
**When** code 不是連線類
**Then** 跳「失敗帶重試」toast，對話框不關，框裡的路徑留著；連線類只由全域處理

**Given** 本機用假的 qBittorrent 回應
**When** 截圖
**Then** PR 附電腦和手機 390px、淺色和深色截圖：搬 5 個種子、目前 N 個、部分失敗、重試 2 個
**And** （Alex 在 NAS 上驗收）對真的 qBittorrent 一次搬兩個測試用的種子

### Story 5.6：改檔名的預覽計畫和 renameFiles

身為 Alex，我想要 App 從檔名抓集數、組好新檔名、找出猜的和撞名的，容器照順序改、第一個失敗就停，這樣改檔名畫面只要把結果畫出來，改到一半壞掉也知道停在哪。

**涵蓋：** FR-47（規則）、FR-48（規則）、FR-49（規則）、FR-50（容器端）、NFR-10、NFR-15、AR-24（`renameFiles`）、AR-25、AR-29（改名）、AR-54（依序做、第一個失敗就停）、AR-55
**規格：** PRD FR-47、FR-48、FR-49、FR-50；EXPERIENCE〔改檔名 rename〕的判斷和驗證〔改檔名的目標格式〕；AD-5、AD-12（照 2026-11-15 更新後的版本）、AD-14、AD-15

**開工前：** AD-12 已在 2026-11-15 改成可多段路徑，照新的寫法做。

**Acceptance Criteria:**

**Given** `src/lib` 的改檔名計畫純函式
**When** 輸入檔案清單（`getFiles` 的相對路徑和大小）、劇名、季數、每列手動改的集數
**Then** 回每一列：種類（影片、字幕、不動）、集數、是不是猜的、新的相對路徑、跟哪一列撞名
**And** 影片檔 2 個以上是整季批次；只有 1 個是單檔（只回新檔名，有外層資料夾時多回資料夾名稱）
**And** 字幕（`.ass`、`.srt`、`.ssa`、`.vtt`、`.sub`）跟同一集的影片改成同名，保留語言標記（`.zh.ass`、`.zh-Hant.srt`）；`.nfo`、圖片和其他檔案是「不動」

**Given** 抓集數
**When** 讀原檔名
**Then** 認得 `E05`、`S01E05`、`第05話`、`第5集`、`[05]` 這類；不會把 `1080p`、`2024`、`x264`、單獨的 `S02` 當成集數
**And** 抓不到的照檔名的自然順序，從抓到的最大集數往上加（抓到 E01 到 E07，猜的從 E08 開始），標成猜的

**Given** 組新檔名
**When** 劇名和季數都有
**Then** 新檔名是 `<劇名>.S01E05.<其他>`：季和集補成兩位，超過 99 用三位；`<其他>` 是原檔名集數後面的全部（含副檔名），猜的只留副檔名
**And** 新路徑是 `<劇名>/season<n>/<新檔名>`，資料夾的數字不補 0
**And** 劇名預填：種子名稱裡第一個季數、集數、年份、解析度字樣之前那段，點和底線換成空白；季數預填：抓得到 `S02`、`Season 2`、`第二季` 就用，抓不到填 1
**And** 劇名有 `/`、控制字元或是空的時，計畫標成不能確定，並給一句原因（「劇名不能有 /」「要填劇名」）（Claude 代決：文案來源沒寫）

**Given** 撞名
**When** 兩列以上的新路徑一樣，或新路徑跟一個不動的檔案一樣
**Then** 每一列都標「跟第 N 列同名」，計畫標成不能確定，給「有 N 列撞名」；不自動加 (2)
**And** vitest 至少有：一季 12 集全抓得到、一半要猜、字幕配對、`.nfo` 不動、撞名、超過 99 集、單檔有和沒有外層資料夾、劇名和季數預填的 5 種種子名稱（測試資料用虛構的劇名）

**Given** `renameFiles` server function
**When** 用工廠建立
**Then** POST，收 `{ hash, items: [{ oldPath, newPath }] }`，照順序；容器先向 qBittorrent 拿這個種子目前的檔案清單，`oldPath` 不在清單裡的回 `invalid_input`，不信前端
**And** `newPath` 照 2026-11-15 更新後的 AD-12 檢查，不能跳出種子自己的資料夾
**And** 容器依序呼叫 qBittorrent 5.1.4 的改檔名 API（檔案和資料夾各用對的端點，照官方文件確認，PR 附網址），第一個失敗就停；回 AR-54 的批次形狀，含已改好的和失敗的那一筆，沒做的不列
**And** body 上限 64 KB；前端把計畫切成好幾個請求依序送，任何一個請求有失敗就停
**And** vitest 只用假的 qBittorrent 回應：照順序送、第 3 筆失敗時停在第 3 筆、擋掉 `..` 和不在清單裡的 `oldPath`、沒登入回 `not_logged_in`

### Story 5.7：改檔名畫面：整季批次

身為 Alex，我想要輸入劇名和季數就看到整季改完的樣子，猜的集數和撞名都標出來，確定後一次改好檔名和資料夾，中途失敗能從失敗那個繼續，這樣一季影集一次整理好。

**涵蓋：** FR-46（整季）、FR-47、FR-48、FR-50、FR-57（改檔名）、FR-58（改檔名）、FR-60（改檔名全螢幕）、NFR-1、NFR-5、NFR-10、NFR-13、NFR-15、AR-7、AR-40（重抓 `['files', hash]`）、AR-42、UX-DR48（改檔名）、UX-DR50（全螢幕）、UX-DR51（改檔名 720px）、UX-DR67、UX-DR68（整季）、UX-DR69、UX-DR93（改名中…）、UX-DR94（改檔名中途失敗）
**規格：** PRD FR-46、FR-47、FR-48、FR-50；EXPERIENCE〔改檔名 rename〕〔改檔名的目標格式〕〔State Patterns〕「送出中」「刪除、改路徑、改檔名失敗」「動作成功時」的改檔名；UX DESIGN.md〔Components〕的 rename；AD-7、AD-9、AD-14

**Acceptance Criteria:**

**Given** 詳情儲存位置區塊的「改檔名」
**When** 按下去
**Then** 拿掉 disabled（外框），打開改檔名：電腦是 720px 對話框，標題「改檔名」下面一行種子名稱；手機是全螢幕面板（上緣沒有圓角、沒有遮罩、頂端留安全區、把手留著），沒有取消按鈕
**And** 搬移中照 Story 5.3 不能按；沒有切換開關
**And** 影片檔只有 1 個的種子，「改檔名」先照 Epic 1 的暫時 disabled 做法（50%、禁止游標、沒有 hover、不能聚焦）；這張不做單檔畫面，Story 5.8 接上單檔改名時拿掉

**Given** 檔案清單
**When** 打開改檔名
**Then** 用 `['files', hash]` 抓；載入中畫 5 列骨架；讀不到寫「讀不到檔案清單」加「重試」；還在抓種子資訊時寫「還在抓種子資訊，檔案清單等一下才有」，「確定」不能按

**Given** 整季批次的版面
**When** 畫出來
**Then** 劇名（拉滿）和第幾季（88px）兩個 36px 輸入框並排（手機 44px），照 Story 5.6 預填；下面「會放到 <目前儲存路徑>/<劇名>/season1/」（等寬 12px）
**And** 預覽清單框最上面 11px `text-muted` 欄名「列」「集數」「原本　→　改成」；每列三欄 24px／60px／剩下：右對齊列號（12px、`text-muted`），60×30px 膠囊集數輸入框前面淡色「E」，名字兩行（上面原檔名等寬 12px `text-muted`，下面「→」加新檔名等寬 12px `text` 600）
**And** 字幕列的集數欄寫「字幕」；不動的檔案只有原檔名，右邊寫「不動」
**And** 預覽清單用 `@tanstack/react-virtual`，500 個檔案時捲起來順；檔名都當純文字

**Given** 改劇名、季數或某一列的集數
**When** 打字
**Then** 預覽、「會放到」那一行和撞名馬上跟著變（重算 Story 5.6 的計畫）
**And** 猜的集數在「→」的位置換成 `status-stalled` 驚嘆號圖示，字還是 `text`；有猜的時底部左邊 12px `text`「N 個集數是猜的，確定前看一下」加 `status-stalled` 圖示
**And** 撞名列的集數外框、新檔名、「跟第 N 列同名」用 `status-error`；底部左邊 13px／600 `status-error`「有 N 列撞名」加圖示，「確定」不能按，改掉其中一個的集數才能按
**And** 劇名不合法時照 Story 5.6 的原因寫在劇名下面，「確定」不能按

**Given** 按「確定」
**When** 送出中
**Then** 按鈕寫「改名中…」，照 Story 4.3 共用元件的送出中做法；只送新路徑跟原本不一樣的列
**When** 全部成功
**Then** 對話框關掉，toast「已改好 12 個檔名」；重抓 `['files', hash]` 並呼叫 `refreshMaindata()`，不改本機資料
**When** 中途失敗
**Then** 跳「失敗帶重試」toast「改好 6 個，第 7 個失敗」，按鈕寫「重試剩下的」，不會自己消失；對話框不關，劇名、季數、手動改的集數都留著
**And** 按「重試剩下的」時先等下一次 `['files', hash]` 回來，已經在新路徑的不再送，從失敗那一個接著送
**And** 整個請求失敗（例如 `invalid_input`）照一般的「失敗帶重試」；連線類只由全域處理

**Given** 本機用假的 qBittorrent 回應
**When** 截圖
**Then** PR 附電腦和手機（全螢幕）、淺色和深色截圖：一季 12 集、有猜的、撞名、改名中…、中途失敗
**And** （Alex 在 NAS 上驗收）對真的 qBittorrent 改一個測試用的整季種子

### Story 5.8：單檔改名、接著改檔名、7 件事驗收

身為 Alex，我想要只有一個影片檔的種子也能改檔名和資料夾名稱，搬完一個種子時直接從提示進改檔名，這樣 7 件事都在新版做得到，可以開始只用新版。

**涵蓋：** FR-45（接著改檔名）、FR-46（單檔、從 toast 進）、FR-49、NFR-15、UX-DR55（帶按鈕的 toast）、UX-DR68（單檔）
**規格：** PRD FR-45、FR-46、FR-49、§7 SM-1；EXPERIENCE〔改檔名的目標格式〕的非影集〔State Patterns〕「動作成功時」的改路徑（一個）；根目錄 DESIGN.md 的 7 件事；AD-14、AD-15

**Acceptance Criteria:**

**Given** 種子只有一個影片檔
**When** 看詳情儲存位置區塊的「改檔名」
**Then** 拿掉 Story 5.7 留下的 disabled，按下去打開單檔改名

**Given** 種子只有一個影片檔
**When** 打開改檔名
**Then** 只有「新檔名」一個欄位，預填現在的檔名；種子有外層資料夾時多一個「資料夾名稱」欄位，預填現在的名字
**And** 字幕照 Story 5.6 跟著影片改成同名，保留語言標記；下面列出會跟著改的字幕
**And** 新檔名或資料夾名稱有 `/`、是空的、跟另一個檔案同名時，外框換 `delete` 並寫原因，「確定」不能按；都沒改時「確定」也不能按
**And** 送出、成功、中途失敗照 Story 5.7；手機一樣是全螢幕面板

**Given** 這個分頁發起的單一搬移搬完（Story 5.3）
**When** 跳 toast
**Then** 換成帶按鈕的 toast「已搬到 影集媒體庫」加「接著改檔名」，停 8 秒，滑鼠停在上面不倒數
**And** 點「接著改檔名」打開那個種子的詳情（電腦在原本的檢視裡，手機用底部面板）並直接打開改檔名
**And** 一次搬好幾個時照 Story 5.5，沒有這顆按鈕

**Given** 程式裡留給後面 epic 的 disabled 按鈕
**When** 這張 story 做完
**Then** 頁首（搜尋、新增、快捷鍵、設定）、篩選列（分類按鈕、排序按鈕）、空狀態的「新增種子」、詳情的「⋯」和檔案分頁、儲存位置區塊的四顆（含單檔種子的「改檔名」）、選取列的兩顆都能用，沒有一顆還是暫時 disabled（搬移中、送出中這類規格內的不能按不算）
**And** PR 列出這些按鈕各在哪張 story 接上，附搜尋程式裡暫時 disabled 標記的結果是 0

**Given** 7 件事都做完
**When** 準備給 Alex 驗收
**Then** repo 裡有一份驗收清單，照根目錄 DESIGN.md 的 7 件事各寫一到三個步驟和預期結果：看下載進度、篩選分類、刪除種子、新增種子、排序、改儲存路徑、改檔名／資料夾；加上兩個例外（暫停繼續、檔案勾選和優先順序）和旅程 1（移到媒體庫）從頭到尾一次
**And** 自動流程和 CI 照樣只用假的 qBittorrent 回應，不對真的 qBittorrent 寫入（NFR-15）
**And** （Alex 在 NAS 上驗收）部署這一版後，照清單在真的 qBittorrent 上逐件做一次，7 件事都做得到才算 SM-1 達成；做不到的那一件照 PRD §7 先叫 `red-team`
