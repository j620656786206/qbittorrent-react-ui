---
reviewer: rubric walker
target: ../ARCHITECTURE-SPINE.md
context: ../.memlog.md、repo 根目錄 DESIGN.md、ux-designs/ux-react-torrent-2026-11-13/EXPERIENCE.md、repo 現況（CLAUDE.md、.nvmrc、.github/workflows、wrangler.jsonc、.env.example 的變數名）
date: 2026-11-15
---

# 架構底稿審查（照清單逐項）

## 判決

方向對，大決定（同源 BFF、白名單閘門、帳密只在容器、單一資料來源）都站得住，7 件事和兩個例外也都有對到。但還不能直接拆成給不同 agent 分開做的 story：有一個會被每個 agent 自動讀進去、而且跟 AD-1、AD-3、AD-5 直接衝突的舊 `CLAUDE.md`；畫面狀態（目前分類、搜尋、排序、選取、正在看哪個）放哪沒決定；錯誤怎麼傳、批次部分失敗長什麼樣沒定；SID 共用加 `rid` 會讓兩台裝置互相打成全量更新；重登沒有斷路器。維運面（secrets 怎麼產生與換、log、healthcheck、權限）只有零星一句。修完下面 critical 和 high 再進 epic。

嚴重度統計：critical 1、high 7、medium 11、low 8。

## 清單逐項結果

| 項目 | 結果 |
| --- | --- |
| 抓到下一層會做不一樣的地方 | 大部分有。漏了畫面狀態的歸屬、篩選後順序的單一來源、共用元件和建造順序、批次結果的形狀（見 H4、H5、H7） |
| AD 的 Rule 可檢查、擋得住 Prevents | AD-5、AD-10 可檢查。AD-2（每個函式自己查 cookie）、AD-4（不再重試）、AD-9（錯誤形狀）、AD-11 寫法擋不住或沒辦法檢查（見 H2、H3、H4、L1）。AD-5 的 Prevents 被舊的公開網址架空（見 H6） |
| 「先不決定」藏著會讓兩個 story 做不一樣的 | 「每個 server function 的輸入輸出細節」裡的批次結果形狀、共用的種子型別；「動畫怎麼做」裡的底部面板和手勢套件（見 H4、M8） |
| 技術是現在的 | 版本跟 memlog #12 一致。缺 Node 的託管轉接層、虛擬化套件；TS 7 跟 lint 工具相容性沒寫（見 M5、M8、L4） |
| initiative 面向（部署、基礎設施、維運） | 部署和 CI 有。secrets 的產生與輪替、log、healthcheck 的內容、容器權限、回滾、設定檔不存在或壞掉時的行為都沒寫（見 M1、M2、M3、M4、M11） |
| DESIGN.md 7 件事和兩個例外 | 都有 Binds 和功能對應。設計要求 2（第幾個／共幾個）和 5（換篩選回到最上面）依賴還沒決定的畫面狀態（H5）；設定頁沒有位置（L8） |

## 發現

### C1：舊的 `CLAUDE.md` 和設定檔會被每個 story agent 讀進去，而且跟 AD 直接衝突

- **位置**：底稿整份沒提；repo 根目錄 `CLAUDE.md`、`.nvmrc`、`.github/workflows/test.yml`、`release.yml`、`wrangler.jsonc`、`.env.example`
- **問題**：自動流程每張 story 由不同 agent 做，每個 agent 開場都會載入 `CLAUDE.md`。現在這份寫的是舊架構：用 `VITE_QBIT_*` 放帳密（違反 AD-3）、在 `src/lib/api.ts` 直接 `fetch` qBittorrent（違反 AD-1、AD-5）、翻譯加到 `src/locales/en.json` 和 `zh-Hant.json`（違反「不裝 i18n」）、Node 用 `lts/iron` 也就是 20（底稿是 24）、「Features should be tested against the actual qBittorrent instance」。最後這條在自動流程裡最危險：agent 為了驗證刪除功能，可能對真的 NAS 送「連檔案一起刪」。另外 `wrangler.jsonc` 指向 Cloudflare Workers 部署，`.env.example` 的變數叫 `QBIT_BASEURL`（底稿是 `QBIT_URL`），舊 CI 用 Node 20、只在 release 打 zip。
- **建議改法**：在底稿加一節「舊檔案怎麼處理」，並把它排成第一張 story 的驗收條件：重寫 `CLAUDE.md`（指向這份底稿、Node 24、不准 `VITE_` 帳密、不准對真的 qBittorrent 送任何會改東西的請求，只能讀）；`.nvmrc` 改 24；刪 `wrangler.jsonc`、`release.yml`；`test.yml` 換成底稿的 CI；`.env.example` 改成底稿的四個變數名。再加一條 AD：「自動流程和測試不得對真的 qBittorrent 呼叫任何寫入操作（刪除、新增、搬移、改名、暫停、改優先），驗證一律用假的回應」。
- **嚴重度**：critical

### H1：一個共用 SID 加上前端各自的 `rid`，兩台裝置會互相打成全量更新

- **位置**：AD-4、AD-6
- **問題**：AD-4 規定 SID 只有一個、在容器記憶體；AD-6 規定前端帶自己的 `rid` 呼叫 `getMaindata`。qBittorrent 的增量同步狀態是跟著 session（SID）記的，只認得「上一次送出的那個 rid」。電腦和手機同時開著時，兩邊交錯送不同的 rid，qBittorrent 每次都會回 `full_update`。4165 個種子的全量資料每 5 秒一次，經 Tunnel 到手機的行動網路會很重，也會讓「資料更新變慢」的提示常常出現。底稿沒有發現這個衝突。
- **建議改法**：先在 NAS 上驗證一次（同一個 SID，兩個 rid 交錯打 `sync/maindata`，看是不是每次都 `full_update`）。成立的話擇一寫進 AD-4／AD-6：(a) 容器替每個 App 登入 session 各自保管一個 qBittorrent SID（cookie 裡放 session id，容器用 Map 對到 SID），最省事；(b) 容器自己當唯一的輪詢者，合併成一份，再用容器自己的版本號給前端增量。另外寫明容器回傳的種子只留畫面用得到的欄位，降低第一次載入的大小。
- **嚴重度**：high

### H2：重登沒有「同時只登一次」和斷路器，密碼錯時幾十秒內就會把容器 IP 害到被封

- **位置**：AD-4
- **問題**：Rule 寫「再失敗回 `qbit_auth_failed`，不再重試」，但只管單一請求。前端每 5 秒還會再呼叫 `getMaindata`，每次都會觸發一次新的重登；同時有好幾個請求拿到 403，也會各自重登。qBittorrent 5.1.4 預設同一 IP 錯 5 次封 1 小時（memlog #12），密碼改了但容器環境變數沒改時，大約 25 秒內容器就被封，連帶在家用 VueTorrent 也可能受影響（同一台 NAS 的來源位址）。Prevents 寫的「連續重登觸發 IP 封鎖」實際上擋不住。
- **建議改法**：Rule 加兩句：「重登同時只會有一個在跑，其他請求等同一個結果」；「用環境變數登入失敗一次後，容器進入 `qbit_auth_failed` 狀態，之後所有請求直接回這個錯，不再嘗試登入，直到容器重啟（改環境變數本來就要重啟）」。可以用 vitest 加假的 qBittorrent 檢查：連續 10 次請求只送出 1 次 `auth/login`。
- **嚴重度**：high

### H3：「每個 server function 先檢查 cookie」靠每個 story 自己記得，漏一個就是洞；也沒有 CSRF 的伺服器端檢查

- **位置**：AD-2、AD-9
- **問題**：(1) 驗證寫成「每個函式先檢查」，是分散在每張 story 裡的手工步驟，沒辦法用一條規則檢查，某個 agent 忘了寫，那個函式就是不用登入就能刪種子。(2) cookie 是 `SameSite=Lax`，TanStack Start 的 server function 可以是 GET；用 GET 做的寫入操作，從別的網站點連結就會帶著 cookie 送出。(3) 底稿只寫「前端所有請求帶 `X-Requested-With`」，沒寫容器要檢查它；這個自訂標頭本來可以順便當 CSRF 防護（跨站送不出自訂標頭）。(4) 前端怎麼「所有請求」都帶這個標頭也沒指定機制，各 story 可能各自包一層。
- **建議改法**：改成一條結構性規則：「驗證和標頭檢查放在 Start 的全域 middleware（查對應版本文件，`createMiddleware` 註冊成全域），預設全部要登入，只有登入函式和 healthcheck 在明確的白名單裡」；「所有寫入操作用 POST」；「容器拒絕沒有 `X-Requested-With: XMLHttpRequest` 的 server function 請求」；「標頭由同一個全域 client middleware 加，不在各功能裡加」。再加一個 vitest：列出 `src/server/functions/` 所有匯出，逐一在沒有 cookie 時呼叫，除了白名單都要回 `not_logged_in`。
- **嚴重度**：high

### H4：錯誤是「回傳」還是「丟出」沒定；批次操作的部分失敗沒有共用形狀；「不是 JSON 就是 Cloudflare 過期」跟 Start 的傳輸格式可能對不上

- **位置**：AD-9、「先不決定」的「每個 server function 的輸入輸出細節」
- **問題**：(1) 「失敗一律是 `{ code, message }`」可以讀成回傳值（`{ ok: false, error }` 聯集），也可以讀成丟出帶 code 的錯誤。兩個 agent 會各選一種，前端的 TanStack Query `onError` 和畫面判斷跟著分裂。丟出的錯誤在 Start 會變成哪個 HTTP 狀態碼也要確認，才能保證「容器絕不回 401」。(2) EXPERIENCE.md 要求刪除、改路徑、新增都能顯示「3 個好了，2 個失敗」並「重試 2 個」，改檔名也要能從失敗那筆重試。這是至少 4 張 story 共用的形狀，卻被放進「寫那個 story 時決定」。qBittorrent 的 `torrents/delete`、`setLocation` 一次送多個 hash 時只回一個結果，要知道哪幾個失敗得在容器裡另外處理，這也是共用策略。(3) Start 的 server function 回應不一定是純 JSON（序列化格式依版本），用「不是 JSON」判斷 Cloudflare 過期可能誤判。
- **建議改法**：AD-9 寫死一種：建議「server function 一律回傳 `{ ok: true, data } | { ok: false, error: { code, message } }`，不丟出；只有程式錯誤才丟出」。加一個共用型別 `BatchResult = { succeeded: string[]; failed: { hash: string; code; message }[] }`，放 `src/shared`，刪除、改路徑、新增、改檔名都用它，並寫明容器怎麼得到逐筆結果（逐筆送，或送完再用 maindata 對一次）。Cloudflare 過期的判斷改成看狀態碼 401、`content-type` 是 `text/html`、或 `response.redirected`，並要求第一張 story 實測 Access 擋下時前端實際拿到什麼。
- **嚴重度**：high

### H5：畫面狀態放哪、篩選後的順序由誰算，都沒決定

- **位置**：「先不決定」沒列；AD-6 只管資料來源；功能對應
- **問題**：目前分類、搜尋關鍵字、排序、選取（還要記勾選先後，刪除確認照最早勾的排）、正在看哪個種子、看板展開哪一欄，至少被列表、看板、詳情固定頭（第幾個／共幾個）、鍵盤 ↑ ↓、選取列、刪除確認、新增成功的「去看」、改路徑完成的「接著改檔名」共用。不定的話，一個 agent 放 URL search params，一個放 React context，一個放元件 state，結果「共 M 個」和前後切換的順序會對不起來（DESIGN.md 設計要求 2 和 5 都依賴這個）。「已整理不算」要套在分類數量、共 M 個、選取加總、列表模式、搜尋五個地方，分散在不同 story 各寫一次很容易漏一處。另外「打開 App 回到上次看的分類」（UX memlog #46）和「每個分類上次看的那個種子」（#59）存在哪裡（這台瀏覽器還是 NAS）也沒寫。
- **建議改法**：加一條 AD：「分類、搜尋、排序放 TanStack Router 的 search params（可分享、可回上一頁）；選取和勾選順序、正在看的種子放一個全域 store（指定一個，例如 TanStack Store 或 zustand）」；「篩選加排序後的清單只由 `src/lib` 的一個 selector 算（輸入 maindata、分類、搜尋、排序，輸出順序），列表、看板欄、詳情固定頭、鍵盤導覽都用它」；「狀態對應和『是不是已整理』只由 `src/lib` 的一個函式決定」。上次看的分類和種子，決定存在瀏覽器還是 settings.json，寫進 AD-8 或慣例。
- **嚴重度**：high

### H6：舊的公開 qBittorrent 網址沒有 Access，AD-5 想擋的事從那邊照樣做得到

- **位置**：AD-1「VueTorrent 原本的網址和替代 WebUI 不動」、AD-5 的 Prevents、部署的「Alex 自己做」
- **問題**：memlog #16 記錄現在 qBittorrent 的對外網址沒有開 Cloudflare Access，只靠一組密碼。AD-5 的理由是防止「闖過登入的人改『下載完成後執行外部程式』拿到 NAS」，但舊網址直接把完整的 qBittorrent API（含 `setPreferences`）放在網路上。新容器做得再嚴，攻擊面還在，而且 2027-02 之後也沒寫什麼時候收掉。
- **建議改法**：部署節的「Alex 自己做」加一項：「舊的 qBittorrent 對外網址現在就加上 Cloudflare Access」（Alex 已回「可加」）；再加一項期限：「2027-02-14 試用期結束、重寫版通過後，拿掉舊網址的 Tunnel 路由，只留家裡 IP 加 port」。AD-5 的 Prevents 補一句「前提是 qBittorrent 本身沒有不經 Access 的對外入口」。
- **嚴重度**：high

### H7：沒有建造順序，共用的地基和元件沒有歸屬

- **位置**：「功能對應」「結構」
- **問題**：功能對應只列各功能放哪，沒說誰先做。以下東西每個功能 story 都要用，第一個碰到的 agent 會順手做一份，第二個 agent 不知道又做一份：用官方範本起專案並清掉舊 `src`、Dockerfile 和 CI、`src/server/qbit` client 和 SID、登入和 middleware、`['maindata']` 輪詢和合併、狀態對應、數字寫法（EXPERIENCE.md「數字寫法」整節）、品牌底部面板（詳情、刪除、新增、改路徑、排序、分類清單六處共用，而且 UX 指定不是 shadcn `Sheet`）、電腦對話框和手機面板的切換（1024px）、toast 的位置規則、狀態圓圈。
- **建議改法**：加一節「建造順序」：第一個 epic 是地基，至少拆成：(1) 清舊程式、起 Start 專案、改 C1 的舊檔案、CI、Dockerfile、healthcheck；(2) qbit client、SID、登入、middleware、錯誤合約；(3) maindata 輪詢、狀態對應、selector、數字寫法；(4) 共用元件（底部面板、對話框和面板切換、狀態圓圈、toast）。功能 story 一律在地基之後，並在功能對應表加一欄「依賴」。
- **嚴重度**：high

### M1：設定檔的 schema 和行為少了好幾塊

- **位置**：AD-8
- **問題**：(1) EXPERIENCE.md 的設定頁有「捲動時自動收合其他欄」開關，沒說存 NAS 還是瀏覽器；上次看的分類、各分類上次看的種子也一樣（見 H5）。(2) `updateCommonPath`、`removeCommonPath` 用什麼當 id 沒寫（路徑字串還是 uuid）；改路徑畫面和詳情的「加到常用」是不同 story，會各自決定。(3) 排序記憶用分類名當 key，「全部」和「未分類」的 key 是什麼、分類在 qBittorrent 改名或刪掉後怎麼辦沒寫。(4) 檔案不存在（第一次啟動）、JSON 壞掉、`version` 比程式舊時的行為沒寫。(5) `/config` 是容器路徑，本機開發時 Mac 上沒有這個目錄，設定 story 和 Dockerfile story 可能各自寫死不同路徑。(6) 前端的 settings query key 和寫完要不要重抓沒寫。
- **建議改法**：AD-8 補：schema 列出全部欄位（含自動收合開關、或明寫它存瀏覽器）；常用路徑用 uuid 當 id；分類 key 用 qBittorrent 分類名，「全部」用固定字串 `__all__`，不存在的分類 key 讀的時候忽略；檔案不存在用預設值建立，壞掉時把壞檔改名保留再用預設值並記 log，`version` 舊的走遷移函式；路徑用環境變數 `CONFIG_DIR`（預設 `/config`，本機 `.env` 指到 gitignore 的 `./config`）；前端 key 固定 `['settings']`，每個修改函式成功後回傳新的整份設定並寫回這個 key。
- **嚴重度**：medium

### M2：secrets 怎麼產生、怎麼換、少了怎麼辦都沒寫

- **位置**：AD-2、AD-3、慣例「環境變數」、部署「Unraid」
- **問題**：`SESSION_SECRET` 沒寫怎麼產生、最短多長；環境變數少了或太短時容器該怎麼辦沒寫（照現在的寫法，可能用空字串簽 cookie 照樣跑）。手機掉了要讓那張 90 天 cookie 失效，唯一的方法是換 `SESSION_SECRET`，底稿沒寫。改 qBittorrent 密碼的步驟只在 memlog #23，底稿沒有。cookie 裡要不要放到期時間也沒寫（只靠瀏覽器的 Max-Age，偷到的 cookie 可以一直用）。
- **建議改法**：慣例或部署節加一段「secrets」：`SESSION_SECRET` 用 `openssl rand -base64 32` 產生，至少 32 bytes；容器啟動時檢查四個環境變數，缺任何一個或 secret 太短就印出原因並結束，不啟動；換 `SESSION_SECRET` 等於登出所有裝置，這就是撤銷的方法；改 qBittorrent 密碼的步驟（改 Unraid 範本的 `QBIT_PASSWORD`，套用後容器重啟）；簽章內容帶到期時間，伺服器端檢查。
- **嚴重度**：medium

### M3：log 完全沒寫

- **位置**：整份沒提
- **問題**：沒說 log 寫到哪、寫什麼、不准寫什麼。最大的風險是某個 agent 為了除錯把請求內容整包印出來，帳密、cookie、SID 就進了 Unraid 的 Docker log。登入失敗和鎖定、qBittorrent 連不到、設定檔寫入失敗這些出事時要查的東西也沒要求記。
- **建議改法**：慣例加一列「log」：只寫 stdout（Unraid 看得到）；一行一筆，帶時間和等級；必記：容器啟動（版本、commit sha）、App 登入失敗和鎖定、qBittorrent 重登和 `qbit_auth_failed`、`qbit_unreachable`、設定檔寫入失敗；禁止記：密碼、cookie、SID、`SESSION_SECRET`、請求的 body。加一個 vitest 檢查 log 函式會遮掉這些欄位。
- **嚴重度**：medium

### M4：healthcheck 只有一句，內容和例外沒定

- **位置**：「先不決定」的「監控、告警」
- **問題**：沒說 healthcheck 打哪個路徑、要不要登入、檢不檢查 qBittorrent。H3 的全域驗證一上，healthcheck 不在白名單就會一直失敗；檢查 qBittorrent 的話，qBittorrent 重啟時容器會被標成不健康，Unraid 上看起來像容器壞了。也沒說 Start 的 server route 能不能用（AD-5 說「沒有通用轉送」，但沒說 server route 一律不准）。
- **建議改法**：寫明：「`GET /healthz` 是唯一的 server route，不用登入，只回容器自己活著（200），不碰 qBittorrent；Dockerfile 用 `HEALTHCHECK` 呼叫它（基底映像沒有 curl 時用 node 發請求）。qBittorrent 連不連得到由前端的 `qbit_unreachable` 顯示」。並在 AD-5 加「除了 `/healthz` 不寫任何 server route」。
- **嚴重度**：medium

### M5：Start 用什麼方式跑成 Node 伺服器沒寫，舊的 Workers 設定還在

- **位置**：技術表、部署「映像」
- **問題**：底稿只寫「打包成一個 Node 容器」。TanStack Start 1.x 要跑在 Node 上，需要選託管的轉接方式（依版本文件，可能是 Nitro 的 node 預設或其他）。起專案的 story 和寫 Dockerfile 的 story 會各自選，加上 repo 裡的 `wrangler.jsonc` 指向 Cloudflare Workers，agent 可能照著做成 Workers 版本。
- **建議改法**：技術表加一列「Node 託管轉接：照 Start 1.169 官網 Node／Docker 部署那頁指定的方式」，並寫明「不做 Cloudflare Workers 版本，刪掉 `wrangler.jsonc`」。起專案的 story 驗收條件寫：`docker run` 後網頁和一個 server function 都能用。
- **嚴重度**：medium

### M6：白名單函式的輸入還有幾個口子

- **位置**：AD-5
- **問題**：「輸入用 zod 驗過」只保證格式，沒限制內容。(1) 新增種子如果接受任意字串送給 qBittorrent `torrents/add` 的 `urls`，http(s) 網址會讓 qBittorrent 去抓，等於讓登入的人叫 NAS 打任意網址。(2) 新增時如果把 `savepath` 開給前端，就繞過「路徑由分類決定，新增時不能改」（EXPERIENCE.md 新增種子）。(3) `setLocation` 收任意路徑，可以把檔案搬到容器能寫的任何地方。
- **建議改法**：AD-5 補三句：「`addTorrents` 只收 `magnet:` 連結和上傳的 .torrent 檔，不收 http(s) 網址，不收 `savepath`」；「`setLocation` 的目的地必須在環境變數 `ALLOWED_SAVE_ROOT`（例如資料根目錄）底下，用正規化後的路徑比對」；「只開用得到的參數，其他參數由容器固定」。
- **嚴重度**：medium

### M7：分層規則沒有說怎麼擋

- **位置**：設計模式「箭頭是可以 import，沒畫的方向都不行」
- **問題**：規則清楚，但沒說由什麼檢查。沒有 lint 規則的話，畫面 import `src/server/qbit` 只會在打包時把伺服器程式帶進前端（或在執行時才壞），code review 不一定看得出來。另外 `src/server/functions/` 的檔案如果除了 server function 還匯出別的東西（例如共用常數），畫面 import 它就可能把伺服器程式拉進前端。圖上也沒有 `server → lib`，伺服器要用路徑正規化之類的純函式時不知道能不能 import。
- **建議改法**：Rule 加「用 ESLint 的 import 限制規則（例如 `import/no-restricted-paths` 或 boundaries 外掛）把箭頭寫成設定，CI 的 lint 會擋」；「`src/server/functions/` 的檔案只匯出 server function」；決定 `src/server` 能不能 import `src/lib`（建議可以，`src/lib` 本來就是純函式），並補進圖。
- **嚴重度**：medium

### M8：跨 story 共用的套件沒列進技術表

- **位置**：技術表、「先不決定」的「動畫怎麼做」
- **問題**：EXPERIENCE.md 要求列表、刪除確認清單、看板欄都要虛擬化；底部面板要能拖拉、彈回、拉到全螢幕；看板收合用 FLIP。「動畫怎麼做」被歸為「不影響其他 story」，但底部面板是六個畫面共用，虛擬化是三個畫面共用。不先選，會出現 `@tanstack/react-virtual` 和 `react-window` 並存、`vaul` 和自己手寫手勢並存。
- **建議改法**：技術表加：虛擬化（建議 `@tanstack/react-virtual`，跟其他 TanStack 一致）、底部面板手勢（選一個，或寫明自己用 pointer events 做在共用元件裡）、動畫（寫明用 CSS transition 和 Web Animations API，或選一個套件）。「先不決定」那列改成「看板展開的動畫細節」，只留單一畫面的部分。
- **嚴重度**：medium

### M9：「操作後立刻抓一次」跟輪詢會撞在一起；檔案分頁和設定的重抓沒寫

- **位置**：AD-7、AD-6
- **問題**：操作成功後觸發 `getMaindata`，可能剛好有一個輪詢在途中，兩個請求帶同一個 `rid`，回來的順序不一定，合併時可能把較新的蓋成較舊的。另外檔案分頁勾選、改優先後要重抓的是那個種子的檔案 query，不是 `['maindata']`；AD-7 只講 maindata，story 可能改成樂觀更新（UX 寫「那一列自己變」容易被讀成樂觀更新）。
- **建議改法**：AD-7 補：「立刻抓一次用 `refetchQueries` 並取消在途的請求；maindata 的 queryFn 同時只有一個在跑，合併只接受比目前 rid 新的回應」；「檔案分頁的操作成功後重抓 `['files', hash]`；設定的修改照 M1 寫回 `['settings']`」；「『那一列自己變』是指重抓後的結果，不做樂觀更新」。
- **嚴重度**：medium

### M10：自動流程只有單元測試，容器和畫面沒有任何自動確認

- **位置**：慣例「測試」、「先不決定」的「E2E 測試」
- **問題**：E2E 延後可以接受，但目前 CI 只有 lint、typecheck、vitest、build。每張 story 由不同 agent 做、CI 綠就自動合併，那麼「映像跑得起來嗎」「網頁打得開嗎」在第一個 epic 結束前都沒有人確認。Dockerfile 或託管設定被某張 story 弄壞，要到 Alex 在 Unraid 更新時才發現。
- **建議改法**：CI 多一步：在 PR 上建映像（不推），用假的環境變數 `docker run`，打 `/healthz` 和首頁確認 200。成本低，擋的是最容易被自動流程弄壞的部分。
- **嚴重度**：medium

### M11：映像發布和回滾沒寫完整

- **位置**：部署「映像」「Unraid」「Alex 自己做」
- **問題**：(1) GHCR 新套件預設不一定是公開的，Unraid 拉私有映像要設帳號 token，沒寫要公開還是私有。(2) 映像要公開的話，必須保證裡面沒有 `.env`；目前沒寫 `.dockerignore`，也沒寫「映像只在 CI 建」。(3) Unraid 用 `latest`，壞版本合併後按更新就上線，回滾步驟（把 tag 改成前一個 commit sha）沒寫。(4) 「全綠才能合併」要在 GitHub 開分支保護才會生效，自動流程會自己合併，沒開等於沒擋，這件事沒列在 Alex 要做的事裡。
- **建議改法**：部署節補：GHCR 套件設公開（映像裡沒有秘密）；加 `.dockerignore` 排除 `.env`、`config/`、`node_modules`，映像只在 CI 建；回滾是在 Unraid 範本把 tag 改成上一個可用的 sha；「Alex 自己做」加「main 開分支保護，要求 CI 通過」。
- **嚴重度**：medium

### L1：AD-11 沒辦法檢查

- **位置**：AD-11
- **問題**：「先查官網文件」做沒做，事後看不出來。`package.json` 如果用 `^` 版本，「鎖定的版本」也會飄。
- **建議改法**：Rule 加「`package.json` 的框架套件寫精確版本，不用 `^`」和「PR 說明列出這次參考的官網文件網址」，code review 可以檢查這兩項。
- **嚴重度**：low

### L2：`[ADOPTED]` 標記跟 memlog 不一致

- **位置**：AD-1、AD-2、AD-5、AD-11 有標，其他沒有
- **問題**：memlog #34 記錄 Alex 已接受代決 A 到 I，AD-3、4、6 到 10 也都是定案，只標一部分會讓下游 agent 以為沒標的還能改。
- **建議改法**：全部標 `[ADOPTED]`，或在開頭說明標記的意思（例如「Alex 親自選的」對「Claude 代決、Alex 接受」）。
- **嚴重度**：low

### L3：「深色模式切換的存法」跟 UX 對不上

- **位置**：「先不決定」第 4 列
- **問題**：EXPERIENCE.md Foundation 寫「主題跟著系統的淺色、深色模式」，沒有切換開關。這列會讓 agent 以為要做切換。
- **建議改法**：改成「主題跟著系統（`prefers-color-scheme`），不做切換」，移到慣例，或直接刪掉這列。
- **嚴重度**：low

### L4：TypeScript 7 和 Node 版本的備註

- **位置**：技術表
- **問題**：memlog #12 查到 TypeScript 最新是 7.0.2，底稿寫「跟 Start 範本鎖的一樣」，這樣可以；但 lint 用的 typescript-eslint 支不支援 TS 7 沒寫，範本如果鎖 TS 7 而 lint 不支援，CI 第一天就紅。Node 26 照官方排程 2026-10-28 進 Active LTS，今天已過，可以在第一張 story 時確認一次；留在 24 也沒問題（維護到 2028-04-30）。
- **建議改法**：技術表 TypeScript 那列加「要跟 typescript-eslint 支援的版本相容，不相容就退到它支援的最新版」。Node 那列保持 24，「先不決定」的 Node 26 加上「已過排程日，epic 結束時確認」。
- **嚴重度**：low

### L5：登入鎖定的範圍和 cookie 細節沒寫

- **位置**：AD-3
- **問題**：「連錯 5 次鎖 15 分鐘」是全域鎖還是依來源鎖沒寫；從 Tunnel 進來的請求來源都是 cloudflared，依 IP 鎖等於全域鎖。鎖定狀態放記憶體，容器重啟就重算，也沒寫。這兩點都可以接受（外面還有 Access 那道門），但要寫清楚，不然兩種寫法都有可能。
- **建議改法**：寫明「全域計數，放記憶體，重啟歸零；外面有 Access，家裡網路信得過（memlog #16），所以接受」。
- **嚴重度**：low

### L6：家裡用 http 送密碼的取捨沒寫進底稿

- **位置**：AD-2
- **問題**：在家用 IP 加 port 是 http，App 登入的帳密以明文在區網傳。memlog #16 記錄 Alex 說家裡網路信得過，這是有意識的取捨，但底稿沒寫，之後的審查或 agent 可能想「修好」它（例如強制 https 導致在家打不開）。
- **建議改法**：AD-2 加一句「在家走 http 是接受的取捨（memlog #16），不要加強制 https 或 HSTS」。
- **嚴重度**：low

### L7：maindata 的欄位假設要確認

- **位置**：AD-6、狀態對應（EXPERIENCE.md「qBittorrent 狀態對應」）
- **問題**：「已整理」靠 `missingFiles` 加 `private` 欄位判斷。UX memlog #90 查過 private 欄位，但沒寫是從哪個 API 拿的。如果 `sync/maindata` 的種子物件沒有 `private`，就要對每個種子另外查，AD-6「只有一個來源」就做不到。
- **建議改法**：地基 story 的驗收條件加「確認 5.1.4 的 `sync/maindata` 種子物件有 `private` 欄位」；沒有的話回來改 AD-6。
- **嚴重度**：low

### L8：功能對應少了幾個會被分到 story 的東西

- **位置**：功能對應、原始碼結構的 `features/` 註解
- **問題**：設定頁（分類順序、自動收合開關，EXPERIENCE.md 說要沿用舊的 `src/routes/settings.tsx`，但舊 `src` 會整個換掉，等於要重寫）、頁首（速度膠囊、提示條）、搜尋框、拖檔遮罩、快捷鍵和說明視窗都沒有資料夾。拖檔遮罩是全 App 範圍、會打開新增視窗，跨功能怎麼呼叫（見 H5）也沒寫。
- **建議改法**：功能對應加列：設定頁 `features/settings`（照 AD-8）、頁首 `features/header`（AD-6、AD-9）、搜尋屬於 `features/list` 並照 H5 的 selector、拖檔和快捷鍵放 `features/shell` 或根路由。並註明「沿用舊設定頁」在重寫版是「照舊設定頁的樣式重寫」。
- **嚴重度**：low

## DESIGN.md 7 件事和兩個例外對照

| 項目 | 底稿有沒有 | 備註 |
| --- | --- | --- |
| 1 看下載進度 | 有（AD-6、AD-10） | H1 影響手機上的效能 |
| 2 篩選分類（含列表內搜尋） | 有（AD-6、AD-8） | 搜尋沒寫在功能對應，篩選結果的單一來源見 H5 |
| 3 刪除種子 | 有（AD-5、AD-7） | 部分失敗形狀見 H4 |
| 4 新增種子 | 有（AD-5、AD-7） | 輸入限制見 M6，部分失敗見 H4 |
| 5 排序 | 有（AD-8） | 設定 key 見 M1 |
| 6 改儲存路徑 | 有（AD-5、AD-7、AD-8） | 路徑限制見 M6 |
| 7 改檔名、資料夾 | 有（AD-5、AD-7） | 批次逐筆結果見 H4 |
| 例外：暫停／繼續 | 有（`stopTorrents`、`startTorrents`，名稱對上 qBittorrent 5.x 的 stop／start） | 無 |
| 例外：檔案勾選、優先順序 | 有（AD-6 例外、`setFilePriority`） | 重抓哪個 query 見 M9 |
| 設計要求 2、5 | 間接 | 依賴 H5 |
| 設計要求 4 | 有（AD-8） | 無 |
