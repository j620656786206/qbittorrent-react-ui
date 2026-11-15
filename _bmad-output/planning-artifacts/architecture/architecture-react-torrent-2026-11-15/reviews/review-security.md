---
reviewer: security
target: ../ARCHITECTURE-SPINE.md
rationale: ../.memlog.md
date: 2026-11-15
verdict: 方向對（同源 BFF、白名單、帳密不進瀏覽器），但有 1 個嚴重、5 個高的缺口要先寫進底稿才能開 story
---

# 資安審查：react-torrent 架構底稿

## 判決

整體方向是對的：同源容器、沒有通用轉送、帳密只在環境變數、陌生人文字當純文字，這幾條把舊版最大的洞都補起來了。

但底稿只管「新容器」這扇門，**舊的 qBittorrent 網址還開著，而且舊密碼在公開 repo 的 git 歷史裡**，這會讓 AD-5 的白名單整個被繞過。另外，CSRF、「每個 server function 都要記得檢查 cookie」、路徑參數、`hashes=all` 這幾件事，底稿沒寫規則，交給各 story 自己決定就會各做各的。

嚴重度定義：

- **嚴重**：不用登入我們的 App 就能拿到 qBittorrent 全權（等於拿到 NAS）。
- **高**：過了一道門或在家裡網路上，就能拿到 NAS 或毀掉所有下載。
- **中**：要先過兩道門或在家裡網路，才能造成實際損害；或會讓 Alex 自己被鎖。
- **低**：損害小，或只在家裡網路且需要很多條件。

## 摘要表

| # | 項目 | 嚴重度 | 改哪條 |
| --- | --- | --- | --- |
| S1 | 舊 qBittorrent 網址沒有 Access，舊密碼在 git 歷史 | 嚴重 | AD-1 |
| S2 | App 登入密碼就是 qBittorrent 密碼 | 高 | AD-3 |
| S3 | CSRF：server function 預設 GET、同 IP 其他 port 算同站、cookie 不分 port | 高 | AD-2、AD-9、新 AD |
| S4 | 「每個 server function 先查 cookie」靠人記得 | 高 | AD-2、AD-5 |
| S5 | 路徑參數沒有範圍：`setLocation`、`savepath`、改名、常用路徑 | 高 | AD-5、AD-8、新 AD |
| S6 | 種子 hash 參數可以塞 `all`，加上刪檔就是全刪 | 高 | AD-5 |
| S7 | 新增種子的網址讓 qBittorrent 去抓任意位址（SSRF） | 中 | AD-5 |
| S8 | 上傳種子檔沒有大小限制，而且要在查 cookie 之後才讀 body | 中 | AD-5 |
| S9 | cookie 的到期、`SESSION_SECRET` 產生與更換、登出都沒寫 | 中 | AD-2 |
| S10 | 登入鎖定沒說是全域還是每個 IP，來源 IP 怎麼認 | 中 | AD-3 |
| S11 | 容器對 qBittorrent 重登會把自己害到被 qBittorrent 封鎖 | 中 | AD-4 |
| S12 | 沒有 CSP 和防嵌入，XSS 一發生就是全權 | 中 | AD-10 |
| S13 | 容器以 root 跑、Unraid 範本的權限沒寫 | 中 | 部署 |
| S14 | CI、自動合併和 GHCR 映像的供應鏈 | 中 | 部署 |
| S15 | 依賴套件和基底映像怎麼更新 | 中 | 部署 |
| S16 | log 和錯誤訊息可能寫出帳密、cookie、qBittorrent 位址 | 中 | AD-9、新 AD |
| S17 | Host 標頭沒有白名單（DNS rebinding） | 低 | 新 AD |
| S18 | Docker healthcheck 會不會洩漏或觸發 qBittorrent 封鎖 | 低 | 先不決定 |
| S19 | 「登入後回原畫面」可能變成開放式轉址 | 低 | AD-2 |
| S20 | 設定檔沒有大小上限和檔案權限 | 低 | AD-8 |
| S21 | 在家走 http 是明文 | 低（接受風險） | AD-2 |
| S22 | 不准為了讓容器能連而關掉 qBittorrent 自己的防護 | 低 | AD-4 |

---

## S1：舊 qBittorrent 網址沒有 Access，舊密碼在 git 歷史

**嚴重度：嚴重**

**問題**

- memlog 記錄 Alex 的回答：現在 qBittorrent 的對外 Tunnel 網址「沒有開 Cloudflare Access」。
- AD-1 寫「VueTorrent 原本的網址和替代 WebUI 不動」，等於試用期間（至少到 2027-02-14）這扇門照開。
- commit `94da054` 的說明自己寫了：舊密碼還在 git 歷史裡（從 `2b3ac93` 起），要在 qBittorrent 改掉密碼才算處理完。repo 是公開的（`gh repo view` 回 `PUBLIC`）。底稿和 memlog 都沒寫這件事做了沒。

**攻擊情境**

任何人從公開 repo 的歷史拿到舊帳密，直接開舊網址登入 qBittorrent 原生 WebUI 或 API，改「下載完成後執行外部程式」。新容器的白名單、兩道門、鎖定全部用不上，因為攻擊者根本不經過新容器。舊網址也只有 qBittorrent 自己的鎖定（同 IP 錯 5 次封 1 小時），換 IP 就能繼續猜。

**建議規則**（寫進 AD-1，並列為第一個 story 之前的前置條件）

1. 舊 qBittorrent Tunnel 網址**現在就**加上 Cloudflare Access（跟新網址同一個 email OTP 政策）；不能加就先把那個 Tunnel 網址關掉，在家用 IP 進 VueTorrent 當退路就好。
2. 立刻改 qBittorrent 密碼：至少 20 字隨機、不跟任何服務共用（memlog 裡「密碼有沒有跟別的服務共用」這題還沒答）。
3. 改完後檢查 qBittorrent 設定裡「新增 torrent 時執行外部程式」和「下載完成後執行外部程式」兩欄是空的，WebUI 的 IP 白名單和「略過 localhost 驗證」沒有被打開。舊網址曾經只靠一組外洩的密碼擋著，要先確認沒有人進來過。
4. AD-1 加一句：「容器以外任何能碰到 qBittorrent WebUI 的對外網址，都必須在 Cloudflare Access 後面。」

---

## S2：App 登入密碼就是 qBittorrent 密碼

**嚴重度：高**

**問題**

AD-3 讓 App 登入拿輸入的帳密跟 `QBIT_USERNAME`、`QBIT_PASSWORD` 比對。App 密碼和 qBittorrent 密碼是同一組。

**攻擊情境**

- App 登入畫面變成猜 qBittorrent 密碼的地方。猜中 App 密碼等於拿到 qBittorrent 原生 API 的密碼，可以繞過白名單，從任何能碰到 qBittorrent 的地方（家裡網路、S1 的舊網址）直接改設定。
- 白名單只有在「攻擊者拿到的權限比 qBittorrent 密碼小」時才有意義。兩組一樣，白名單就只擋得住「偷到 cookie 的人」，擋不住「猜到密碼的人」。
- Alex 在手機上被人看到 App 密碼，也是同一個後果。

**建議規則**（改 AD-3）

1. App 登入用自己的一組：環境變數 `APP_PASSWORD_HASH`（scrypt 或 argon2id 的雜湊，不存明文）。帳號可以省略，只有 Alex 一個人。
2. 容器啟動時檢查：`APP_PASSWORD_HASH` 沒設、或用它驗證 `QBIT_PASSWORD` 會通過（兩組一樣），就拒絕啟動並在 log 寫原因（不寫值）。
3. 提供一個本機指令（例如 `npm run hash-password`）產生雜湊，Alex 貼進 Unraid 範本。
4. 改 qBittorrent 密碼和改 App 密碼互不影響，AD-9 的 `qbit_auth_failed` 說明照舊。

如果 Alex 不想多記一組，至少要接受並在 memlog 寫明：「App 密碼外洩 = qBittorrent 全權，白名單只防偷 cookie。」

---

## S3：CSRF

**嚴重度：高**

**問題**

底稿只寫了 `SameSite=Lax` 和「前端帶 `X-Requested-With`」，有四個洞：

1. **TanStack Start 的 `createServerFn` 預設是 GET**（寫 story 時照 AD-11 查 1.169 版文件確認）。`SameSite=Lax` 會在「從別的網站點連結過來」這種頂層 GET 導覽時送出 cookie。如果 `deleteTorrents` 之類的操作是 GET，別的網站放一個連結就可能觸發。
2. **同一個 IP 的其他 port 算「同站」**。SameSite 看的是站（在家就是 NAS 的 IP），不看 port。NAS 上其他容器的網頁（Unraid 後台、其他自架服務）如果有 XSS 或本身不可信，對它來說我們的容器是同站，Lax 甚至 Strict 都擋不住。
3. **cookie 不分 port**。在家用 `http://IP:port` 登入拿到的 cookie，瀏覽器也會送給同一個 IP 的所有其他 port。其他容器的伺服器端看得到這張 cookie 的值，也可以設同名 cookie 把它蓋掉。
4. **前端帶 `X-Requested-With` 只寫了「前端要帶」，沒寫「伺服器要檢查」**。不檢查就沒有防護效果。`addTorrents` 用 FormData 上傳，是瀏覽器不用預檢就能跨來源送出的格式。

**攻擊情境**

Alex 已經登入的瀏覽器，在家開了 NAS 上另一個被入侵的服務頁面，或在外面點了別人給的連結。那個頁面讓瀏覽器對我們的容器送出刪除、改路徑或新增種子的請求，瀏覽器自動帶上 cookie。

**建議規則**（新增一條 AD「請求來源檢查」，並改 AD-2、AD-9）

1. 所有會改東西的 server function 一律 `method: 'POST'`。GET 只給純讀取（`getMaindata`、讀檔案列表、讀設定），而且讀取函式不能有任何副作用。
2. 容器用一個全域 middleware，對**所有** server function 請求檢查：
   - 有 `X-Requested-With: XMLHttpRequest`。
   - `Origin` 標頭存在，且在環境變數 `APP_ORIGINS` 列的清單裡（在家的 `http://IP:port` 和 Tunnel 網域，各一個）。沒有 `Origin` 的 POST 一律拒絕。
   - 不合格回新 code `bad_origin`（加進 AD-9 的表，前端當成程式錯誤顯示，不導去登入）。
3. 容器不回任何 CORS 標頭（`Access-Control-Allow-*`），也不處理 OPTIONS 預檢。這樣自訂標頭會讓跨來源請求在瀏覽器端就被擋下。
4. cookie 改 `SameSite=Strict`。SPA 的首頁 HTML 不需要 cookie，server function 都是同源 fetch，Strict 不會影響使用，但多擋掉頂層導覽那一種。
5. cookie 名稱取一個不會撞名的（例如 `rt_session`），寫進底稿。Tunnel 那邊（https）可以用 `__Host-rt_session`；在家 http 不能用 `__Host-`，接受「同 IP 其他 port 看得到 cookie」這個風險，並寫進 memlog。

---

## S4：「每個 server function 先查 cookie」靠人記得

**嚴重度：高**

**問題**

AD-2 寫「除了登入以外，每個 server function 先檢查這張 cookie」。自動開發流程每張 story 都會新增 server function，只要有一個忘了檢查，就是不用登入就能呼叫的 qBittorrent 操作。Start 的 server function 是用固定網址呼叫的，不會因為畫面沒有按鈕就叫不到。

**攻擊情境**

在家裡網路的任何裝置，或過了 Cloudflare Access 但還沒 App 登入的人，直接呼叫那個漏掉檢查的函式。

**建議規則**（改 AD-2、AD-5）

1. `src/server/functions/` 底下的函式只能用一個共用的工廠建立（例如 `authedServerFn`），工廠裡套用登入檢查、S3 的來源檢查和輸入的 zod 驗證。
2. 不需要登入的函式只能是一個寫死的清單：`login`、`logout`（logout 也可以要求登入）、healthcheck。清單寫在底稿。
3. 加 lint 規則：在工廠檔案以外直接呼叫 `createServerFn` 就報錯。
4. 加一個 vitest：列出所有 server function，沒登入呼叫時，清單以外的每一個都必須回 `not_logged_in`。新增函式時這個測試會自動涵蓋。
5. 如果 Start 1.169 有全域 middleware（AD-11 查文件），登入檢查優先放全域，工廠再檢查一次。

---

## S5：路徑參數沒有範圍

**嚴重度：高**

**問題**

會把「路徑」交給 qBittorrent 的參數有：`setLocation` 的新位置、`addTorrents` 的 `savepath`（和 `downloadPath`）、`renameFile`／`renameFolder` 的新名字、設定檔裡的常用路徑。底稿只寫「輸入用 zod 驗過」，沒寫路徑可以是什麼。

**攻擊情境**

過了兩道門的人（或偷到 cookie、或 XSS）可以：

- 把下載位置或搬移位置指到 qBittorrent 容器裡的設定資料夾或系統資料夾。加上一個內容由攻擊者決定的種子，就可能把檔案寫成 qBittorrent 的設定檔，下次重啟就改掉「執行外部程式」。這是繞過 AD-5「不開 setPreferences」的一種方法。
- 用改名參數裡的 `..`、開頭的 `/` 或反斜線，把檔案搬出種子自己的資料夾。
- 把大檔下載到小分割區把系統碟塞爆。

實際能碰到哪些資料夾，取決於 qBittorrent 容器在 Unraid 掛了什麼。掛得越多，這條越嚴重。

**建議規則**（新增一條 AD「路徑只能在允許的根目錄底下」，並改 AD-5、AD-8）

1. 新增環境變數 `SAVE_ROOTS`（逗號分隔，是 qBittorrent 容器**裡面**看到的下載根目錄，例如它的下載掛載點）。容器啟動時沒設就拒絕啟動。
2. `src/shared` 放一個共用的路徑 schema，所有存路徑的參數都用它：
   - 必須是絕對路徑；拒絕 NUL 字元、反斜線、控制字元；長度上限 1024。
   - 用 POSIX 的 normalize 處理後，必須等於某個根目錄，或以「根目錄加 `/`」開頭。
   - normalize 前後只要出現 `..` 這一段就拒絕（不要只靠 normalize）。
3. 改名用另一個 schema：
   - `renameFile` 的新名字只能是**單一段**檔名：不含 `/`、`\`、NUL，不能是 `.` 或 `..`，長度 1 到 255 bytes。舊路徑必須存在於這個種子目前的檔案列表裡（從 qBittorrent 抓來比對，不信前端）。
   - `renameFolder` 同樣規則，新路徑只能改最後一段。
4. 設定檔的常用路徑寫入時也套第 2 點，讀出來給前端之前再驗一次（防止有人手改 settings.json）。
5. Alex 要做的事（寫進「Alex 自己做」）：確認 qBittorrent 容器在 Unraid 只掛了下載資料夾和它自己的 appdata，沒有掛 `/mnt/user` 整個、沒有掛 Docker socket、沒有 privileged。

---

## S6：種子 hash 參數可以塞 `all`

**嚴重度：高**

**問題**

qBittorrent 的 `torrents/delete`、`stop`、`start` 等 API，`hashes` 參數接受特殊值 `all`，代表全部種子；多個 hash 用 `|` 串起來。如果 zod 只寫成「字串陣列」，`all` 或含 `|` 的字串都會通過。

**攻擊情境**

一個 `deleteTorrents` 請求，hash 寫 `all` 再加上刪除檔案，NAS 上所有下載一次消失。不需要拿到 NAS 權限也能造成很大的損失。前端的 bug（例如把空陣列轉成特殊值）也可能誤觸。

**建議規則**（改 AD-5，寫進 `src/shared` 的 schema）

1. hash schema：`^[a-f0-9]{40}$` 或 `^[a-f0-9]{64}$`（v2 種子），轉小寫後比對。陣列長度 1 到 500。永遠不把 `all` 傳給 qBittorrent。
2. 送給 qBittorrent 的表單一律用 `URLSearchParams` 或 `FormData` 組，禁止字串拼接（防止名稱裡藏 `&savepath=` 之類的東西被當成另一個參數）。
3. 每個 server function 的 zod schema 用 `.strict()`，只把自己定義的欄位傳給 qBittorrent，禁止把前端的物件整包展開送出。
4. 其他參數：`setFilePriority` 的檔案 id 只能是非負整數陣列（上限 10000 個），priority 只能是 `0`、`1`、`6`、`7`；刪除的「一併刪檔」是明確的 boolean，預設 `false`。

---

## S7：新增種子的網址讓 qBittorrent 去抓任意位址（SSRF）

**嚴重度：中**

**問題**

`addTorrents` 接受網址時，是 qBittorrent 去下載那個網址（不是我們的容器）。qBittorrent 在家裡網路裡面，看得到路由器、NAS 後台和其他容器。

**攻擊情境**

過了兩道門的人，讓 qBittorrent 對家裡網路的內部網址發出 GET。看不到回應，但可以觸發「用 GET 就會動作」的內部裝置功能，或探測哪些位址有服務。`file:` 之類的協定看 qBittorrent 版本可能被拿來讀本機檔案。

**建議規則**（改 AD-5，寫在 `addTorrents` 的 schema）

1. 網址只接受 `magnet:`、`https:`、`http:` 三種開頭。
2. `http(s)` 網址：主機不能是 IP 位址字面值（IPv4 或 IPv6，包含私有、回送、link-local 範圍），不能是 `localhost`、單段主機名稱、`.local`、`.lan`、`.internal` 結尾。只接受公開網域名稱。
3. 一次最多 50 個網址，每個長度上限 4096。
4. 不開放 qBittorrent `torrents/add` 的 `cookie` 參數。
5. 容器自己**永遠不**去下載使用者給的網址（不要為了預覽種子名稱而在容器裡 fetch），這條寫進底稿，防止之後有 story 加「先抓下來看看」的功能。

---

## S8：上傳種子檔沒有大小限制

**嚴重度：中**

**問題**

底稿沒寫上傳大小，也沒寫「先查 cookie 再讀 body」。如果框架先把整個請求讀進記憶體再交給函式檢查登入，沒登入的人也能送超大請求。

**攻擊情境**

家裡網路的任何裝置（或過了 Access 的人）送很多個超大的 multipart 請求，把容器記憶體吃光，Unraid 上的 Node 程式被系統砍掉。

**建議規則**（改 AD-5）

1. 順序：先檢查來源（S3）和 cookie，再讀 body。如果 Start 的 server function 做不到，`addTorrents` 改用 server route，自己控制讀取順序（AD-11 查文件）。
2. 先看 `Content-Length`，沒有或超過就直接拒絕，讀取時也邊讀邊算（不信標頭）。
3. 上限：單個 `.torrent` 10 MB、一次最多 20 個、整個請求 50 MB；其他 server function 的 body 上限 64 KB。
4. 檔案開頭必須是 bencode 字典（第一個字元是 `d`），副檔名不算數。
5. 超過上限回 `invalid_input`，message 寫是哪個上限。

---

## S9：cookie 的到期、SESSION_SECRET、登出都沒寫

**嚴重度：中**

**問題**

- 「不勾記住我就關瀏覽器失效」只靠瀏覽器的 session cookie。手機瀏覽器常常會把分頁還原，cookie 跟著復活，實際上可能活好幾週。
- cookie 的到期只寫在 cookie 屬性上，如果簽章內容沒有到期時間，偷到的 cookie 可以永遠用。
- `SESSION_SECRET` 怎麼產生、多長、怎麼換，沒寫。
- 沒有登出，也沒有「手機掉了，把所有裝置登出」的方法。

**攻擊情境**

手機掉了、或某台電腦的 cookie 被偷，90 天內對方都能用（外面還要過 Access，家裡網路不用）。`SESSION_SECRET` 如果用了很短的字串或跟範例一樣，可以自己偽造 cookie，跳過 App 登入。

**建議規則**（改 AD-2）

1. 簽章內容至少放：`iat`（簽發時間）、`exp`（到期時間）、`epoch`（見第 4 點）。伺服器每次都檢查 `exp`。記住我 `exp` = 90 天；不勾 `exp` = 12 小時，cookie 本身不設 Max-Age。
2. 用框架內建的加密 session（Start 有內建 session 工具時優先用，AD-11 查文件）或成熟套件，不要自己寫 HMAC 比對。
3. `SESSION_SECRET`：至少 32 bytes 隨機值（用 `openssl rand -base64 32` 之類的工具產生），只放 Unraid 範本。容器啟動時檢查：沒設、短於 32 字元、或等於 `.env.example` 裡的佔位字，就拒絕啟動。不能從 qBittorrent 密碼推出來。
4. 全部登出：`/config/settings.json` 放一個 `sessionEpoch` 數字，cookie 裡的 `epoch` 比它小就當沒登入。設定畫面或一個 server function（要登入）可以把它加 1。換 `SESSION_SECRET` 並重啟也有同樣效果，寫進維運說明。
5. 加 `logout` server function（POST），清掉 cookie。
6. 每次驗證通過時，如果離 `exp` 不到一半，可以重新簽發延長，但不超過 90 天。

---

## S10：登入鎖定沒說是全域還是每個 IP

**嚴重度：中**

**問題**

AD-3 只寫「連錯 5 次鎖 15 分鐘」，三件事沒寫：

1. 是全域鎖還是每個 IP 鎖。
2. 走 Tunnel 的請求，容器看到的連線來源都是 cloudflared，真正的來源在 `CF-Connecting-IP` 標頭。
3. 這個標頭誰都能自己加。在家裡網路直接連容器的裝置，也可以送一個假的 `CF-Connecting-IP`。

**攻擊情境**

- 全域鎖：家裡一台被入侵的裝置一直猜錯，Alex 在哪裡都登不進去。
- 每個 IP 鎖但直接信 `CF-Connecting-IP`：家裡網路的裝置每次換一個假值，鎖定就失效，可以無限猜（S2 沒改的話，猜的是 qBittorrent 密碼）。
- 每個 IP 鎖但只看連線來源：所有 Tunnel 來的請求共用一個額度，別人過了 Access 猜錯也會鎖到 Alex 的手機。

**建議規則**（改 AD-3）

1. 每個來源 IP 各自計數：15 分鐘內錯 5 次，鎖 15 分鐘。
2. 來源 IP 怎麼認：只有當連線來源在環境變數 `TRUSTED_PROXY_IPS`（cloudflared 容器的位址或網段）裡，才讀 `CF-Connecting-IP`；其他連線一律用連線來源，忽略標頭。`X-Forwarded-Proto` 也照這條，只信任 cloudflared 送來的。
3. 再加一個全域上限：1 小時內全部來源加起來錯 50 次，之後每次登入都延遲 5 秒（只延遲不鎖死），防止換很多 IP 慢慢猜，又不會把 Alex 完全鎖在外面。
4. 鎖定狀態只放記憶體。Alex 被鎖時的解法：在 Unraid 重啟容器。把這句寫進 AD-3 和登入畫面 `login_locked` 的說明旁邊（給 Alex 看的維運說明，不顯示在畫面上）。
5. 比對方式：兩邊先做 SHA-256 再用 `timingSafeEqual`，避免長度不同時直接回傳，洩漏長度。
6. 每次登入失敗寫一行 log：時間、認定的來源 IP、這個 IP 錯第幾次。不寫輸入的帳號或密碼。

---

## S11：容器對 qBittorrent 重登會把自己害到被封鎖

**嚴重度：中**

**問題**

AD-4 寫「403 時重登一次再重送，再失敗回 `qbit_auth_failed`」，這是每個請求各自重試一次。前端每 5 秒輪詢 `getMaindata`，加上檔案分頁也在輪詢。如果環境變數的 qBittorrent 密碼是錯的（例如 S1 改了密碼但忘了改容器），25 秒內就會錯 5 次，qBittorrent 5.1.4 把容器的 IP 封 1 小時。同時有好幾個請求遇到 403，也會同時重登好幾次。

**攻擊情境**

不是外部攻擊，是 Alex 自己被鎖：改完 qBittorrent 密碼、修好容器設定之後，還要再等 1 小時才能用。家裡網路的人如果能讓容器的 SID 失效（例如觸發 qBittorrent 重啟），也會加速這件事。

**建議規則**（改 AD-4）

1. 重登要單一執行：同一時間只有一個重登在跑，其他請求等它的結果。
2. 第一次重登失敗（帳密錯）後，2 分鐘內不再嘗試登入 qBittorrent，所有請求直接回 `qbit_auth_failed`。2 分鐘後再試一次，又失敗就完全停止重登，直到容器重啟。qBittorrent 的封鎖是看「連續失敗次數」，所以容器最多只會錯 2 次，永遠碰不到 5 次的門檻。
3. 容器重啟（Alex 改完環境變數）時清掉這個狀態。
4. healthcheck 不准觸發登入 qBittorrent（見 S18）。

---

## S12：沒有 CSP 和防嵌入

**嚴重度：中**

**問題**

AD-10 擋了 `dangerouslySetInnerHTML`，但沒有第二道防線。cookie 是 HttpOnly，可是 XSS 不需要讀 cookie，直接從頁面呼叫 server function 就有全部權限。種子名稱、檔名、tracker 網址、種子的 comment 欄位都是陌生人寫的。

另外沒有禁止別的網站用 iframe 嵌入我們的頁面。

**攻擊情境**

- 某個種子的 comment 或 tracker 欄位被做成 `javascript:` 開頭的連結，Alex 在詳情裡點了。
- 別的網站把我們的頁面嵌進透明 iframe，騙 Alex 點到「刪除」（clickjacking）。在家 http 時 S3 的 Origin 檢查擋不住這種，因為請求是從我們自己的頁面發出的。

**建議規則**（改 AD-10）

1. 容器對所有回應加標頭：
   - `Content-Security-Policy: default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`（樣式需要的話 `style-src 'self' 'unsafe-inline'`，不給 script 用 `unsafe-inline`）。
   - `X-Content-Type-Options: nosniff`、`Referrer-Policy: no-referrer`。
2. 畫面上任何從 qBittorrent 來的網址（tracker、comment、網站），要做成連結時只允許 `http:`、`https:`、`magnet:` 開頭，其他一律當純文字；外部連結加 `rel="noopener noreferrer"`。
3. lint 也擋 `innerHTML`、`outerHTML`、`document.write`，不只 `dangerouslySetInnerHTML`。
4. 不載入任何外部 CDN 的 script 或字型（全部打包進映像），CSP 才能維持 `'self'`。

---

## S13：容器以 root 跑、Unraid 範本的權限沒寫

**嚴重度：中**

**問題**

Node 官方映像預設是 root。底稿只寫了「一個 port、`/config` 掛 appdata、四個環境變數」，沒寫使用者和權限。

**攻擊情境**

容器裡的程式（或某個依賴套件）被拿下後，以 root 身分可以改 `/config` 以外的東西；如果範本被加了多餘的掛載或 privileged，就能碰到 NAS 本體。

**建議規則**（寫進「部署」）

1. Dockerfile 最後 `USER` 切成非 root。Unraid 的慣例是 `99:100`（nobody:users），appdata 權限才對得上；或用 Node 映像內建的 `node` 使用者，並在範本說明 appdata 的擁有者。
2. Unraid 範本的 Extra Parameters：`--cap-drop=ALL --security-opt=no-new-privileges --read-only --tmpfs /tmp`。只有 `/config` 可寫。
3. 範本禁止：privileged、掛 Docker socket、`--network=host`、掛 `/mnt/user` 或其他資料夾。容器不需要碰下載資料夾（qBittorrent 才需要）。
4. 範本裡 `QBIT_PASSWORD`、`SESSION_SECRET`（和 S2 的 `APP_PASSWORD_HASH`）欄位設成遮罩（Unraid 範本的 Mask 屬性），避免截圖或旁人看到。
5. `settings.json` 建立時權限 `600`。

---

## S14：CI、自動合併和 GHCR 映像的供應鏈

**嚴重度：中**

**問題**

- memlog 寫之後要照 Vido 的做法跑自動流程：CI 綠燈就合併，合併後自動接下一張。repo 是公開的，任何人都能開 PR。
- 合併到 main 就推 `latest`，Alex 在 Unraid 按更新就會跑那個映像。也就是說，**能合併進 main 的人，就能在 Alex 的 NAS 上跑程式**。
- GHCR 映像的公開或私有沒有寫。公開本身沒問題（原始碼本來就公開），但映像裡不能有不該有的檔案。
- 現有的 `.github/workflows/release.yml` 還在，用的是 `actions/upload-release-asset@v1` 這種已經不維護的 action。

**攻擊情境**

- 陌生人開一個看起來像修 typo 的 PR，CI 綠燈後被自動流程合併，映像裡多了一段會把環境變數送出去的程式。
- 某個第三方 GitHub Action 的 tag 被改指到惡意版本，建映像時被植入。
- 本機建映像時把 `.env` 一起打包進去，推到公開的 GHCR。

**建議規則**（寫進「部署」）

1. 自動合併只合併「自動流程自己從 Alex 帳號建的分支」的 PR。外部 PR 一律不自動合併，要 Alex 手動看。main 開 branch protection：要 CI 綠燈、禁止 force push。
2. workflow 不用 `pull_request_target`。預設 `permissions: contents: read`，只有推映像的 job 給 `packages: write`。PR 的 job 拿不到任何 secret。
3. 第三方 action 釘在 commit SHA，不用 tag。
4. `.dockerignore` 至少排除：`.env*`（`.env.example` 除外）、`.git`、`node_modules`、`_bmad-output`、`.claude`。Dockerfile 用多階段，最後一層只放建置結果和正式環境的依賴。
5. CI 建完映像後加一步檢查：映像裡沒有 `.env` 檔、前端打包結果裡沒有 `QBIT_`、`SESSION_SECRET` 這類字串。
6. 映像只在 CI 建，不從本機推。GHCR 公開或私有二選一寫進底稿：公開的話 Unraid 不用存 GitHub token（比較少一個秘密要顧）；私有的話要用只有 `read:packages` 權限的 token。推薦公開。
7. 刪掉舊的 `release.yml`，或改成新的流程。

---

## S15：依賴套件和基底映像怎麼更新

**嚴重度：中**

**問題**

底稿沒寫依賴怎麼更新。TanStack Start 1.169 是第一個 stable 版（memlog），才一個多月，接下來的安全修補會比較密集。每月 60 個 commit 的上限也會被自動更新 PR 吃掉。

**攻擊情境**

依賴或 Node 基底映像有已公開的漏洞，容器一直跑舊版。或是反過來，自動更新把一個被入侵的新版套件直接帶進 main。

**建議規則**（寫進「部署」和「一致性慣例」）

1. 用 Dependabot 或 Renovate，**每月一次、分組成一個 PR**（正式依賴一組、開發依賴一組、GitHub Actions 一組），安全性更新例外，隨時開。這些 PR 要算進每月 60 個 commit（在 sprint planning 跟 Alex 確認）。
2. 依賴更新 PR 不走自動合併，要 Alex 看過（跟 S14 第 1 點一致）。
3. CI 加 `npm audit --omit=dev --audit-level=high`，有高風險就紅燈。
4. Docker 用 `npm ci`，鎖定 `package-lock.json`。
5. Node 基底映像釘在 digest，跟著每月更新一起換。
6. Alex 在 GitHub 訂閱 TanStack Router／Start 的 security advisories。
7. Unraid 用 `latest`，出問題時改成上一個 commit sha 的 tag 回退，寫進維運說明。

---

## S16：log 和錯誤訊息可能寫出帳密、cookie、qBittorrent 位址

**嚴重度：中**

**問題**

底稿沒寫 log 規則。錯誤合約 `{ code, message }` 的 `message` 也沒說可以放什麼。常見的洩漏點：把整個請求物件或 fetch 的錯誤直接印出來（裡面有 cookie、登入 body）；把 qBittorrent 回的錯誤或 Node 的例外訊息原樣轉給前端（裡面有 `QBIT_URL`，也就是家裡的 IP 和 port）；啟動時印出所有環境變數方便除錯。

**攻擊情境**

Unraid 的容器 log 被截圖貼到網路上問問題，或錯誤訊息出現在手機畫面上被截圖，帳密或家裡的位址就外流了。

**建議規則**（新增到 AD-9 或「一致性慣例」）

1. 只用一個 logger，內建遮罩：`password`、`cookie`、`set-cookie`、`authorization`、`sid`、`session`、`QBIT_*`、`SESSION_SECRET`、`APP_PASSWORD_HASH` 這些鍵的值一律換成 `[redacted]`。
2. 禁止 log：登入請求的 body、任何請求或回應的 header 全部內容、環境變數。啟動時只印「某某變數有設／沒設」。
3. `message` 只能是程式裡寫死的中文字串，不能放例外訊息、qBittorrent 的原始回應或任何網址。原始錯誤只寫 log（遮罩後）。
4. 加一個 vitest：讓 qBittorrent 假回應丟出含 `QBIT_URL` 的錯誤，檢查回給前端的 `message` 不含那個網址。
5. 不印 stack trace 給前端；正式環境的 log 可以有 stack，但要遮罩。

---

## S17：Host 標頭沒有白名單（DNS rebinding）

**嚴重度：低**

**問題**

在家用 `http://IP:port` 時，惡意網站可以讓自己的網域解析到 NAS 的 IP，讓瀏覽器以為是同源，對容器發請求。cookie 不會帶過去（主機不同），但它可以在 Alex 的瀏覽器裡對登入函式猜密碼，或讀不需要登入的端點。

**攻擊情境**

Alex 在家開了惡意網頁，網頁在背景用 Alex 的瀏覽器從家裡網路內部打容器的登入函式。

**建議規則**（併入 S3 的新 AD）

容器檢查 `Host` 標頭，只接受 `APP_ORIGINS` 裡的主機（在家的 IP:port 和 Tunnel 網域），其他一律回 421 或 403，不進任何 server function。healthcheck 從容器內部打 `localhost`，要另外允許。

---

## S18：Docker healthcheck

**嚴重度：低**

**問題**

「先不決定」寫「容器加 Docker healthcheck 就好」，沒寫 healthcheck 打什麼、回什麼。

**攻擊情境**

- healthcheck 端點不用登入，如果回 qBittorrent 版本、連線位址、種子數量，等於對家裡網路和 Tunnel 後面公開這些資訊。
- healthcheck 如果會去登入 qBittorrent，帳密錯的時候每 30 秒錯一次，很快觸發 S11 的封鎖。

**建議規則**（寫進「部署」）

1. healthcheck 端點只回 `200` 和固定的 `ok`，只代表 Node 程式還活著，不碰 qBittorrent、不讀設定檔、不回版本。
2. Dockerfile 的 `HEALTHCHECK` 用 `node -e` 打 `http://localhost:<port>/healthz`（Node 映像沒有 curl，不要為了它多裝套件）。
3. 這個端點在 S4 不用登入的清單裡，在 S17 的 Host 白名單額外允許 `localhost`。
4. 想知道 qBittorrent 連不連得到，看頁首的連線狀態就好（AD-6），不要做進 healthcheck。

---

## S19：「登入後回原畫面」可能變成開放式轉址

**嚴重度：低**

**問題**

AD-9 寫 `not_logged_in` 時「登入後回原畫面」。如果原畫面是從網址參數讀的（例如 `?redirect=`），沒檢查就可能被導到別的網站。

**攻擊情境**

別人給 Alex 一個我們網域的登入連結，登入後被導到外面的假頁面，假頁面再要求輸入密碼。

**建議規則**（改 AD-2）

回原畫面的目標只能是站內路徑：以單一 `/` 開頭、不能以 `//` 或 `/\` 開頭、不含協定。不合格就回首頁。優先用 TanStack Router 的路由狀態記住，不要放網址參數。

---

## S20：設定檔沒有大小上限和檔案權限

**嚴重度：低**

**問題**

AD-8 有 zod schema、原子寫入和鎖，但沒有數量和長度上限。常用路徑還會被拿去當新增種子和改路徑的建議值，等於 S5 的另一個入口。

**攻擊情境**

一直呼叫 `addCommonPath` 塞很長的字串，把 appdata 塞滿；或塞一個指向系統資料夾的常用路徑，等 Alex 自己點下去。

**建議規則**（改 AD-8）

1. 常用路徑最多 50 個，名字最長 50 字，路徑套 S5 的路徑 schema。分類順序、排序記憶的項目數也設上限（例如 500）。整個檔案寫入前超過 256 KB 就拒絕，回 `settings_write_failed`。
2. zod schema 用 `.strict()`，讀檔時不認得的欄位丟掉，不跟現有物件深度合併。
3. 檔案權限 `600`（S13）。

---

## S21：在家走 http 是明文

**嚴重度：低（Alex 已接受家裡網路，列出來留紀錄）**

**問題**

在家用 http，登入的密碼和 90 天的 cookie 在家裡網路上是明文。家裡網路有訪客 Wi-Fi、智慧家電的話，信任範圍比「家人的電腦」大。http 也讓同網路的裝置有機會竄改送來的 JavaScript。

**攻擊情境**

家裡網路上一台被入侵的智慧家電側錄到 cookie，在家裡網路內直接使用（不用過 Access）。

**建議規則**（寫進 memlog 的接受風險，不一定要改架構）

1. memlog 加一行：「在家走 http，接受同網路裝置可以側錄 cookie 和密碼的風險」。
2. 訪客和智慧家電放在路由器的訪客網路，跟 NAS 隔開（Alex 自己做）。
3. 之後如果要補，最省事的做法是在家也走 Tunnel 網域（https），而不是在 NAS 上自己弄憑證。

---

## S22：不准為了讓容器能連而關掉 qBittorrent 自己的防護

**嚴重度：低**

**問題**

qBittorrent 的 WebUI 有自己的 CSRF 防護、Host 標頭檢查和登入封鎖。實作時如果容器連不上（例如 Host 或 Referer 對不上），最快的「修法」是把這些關掉，或打開「略過 localhost 驗證」、IP 白名單。這會讓 S1 的舊網址和家裡網路的其他裝置更好攻擊。

**建議規則**（改 AD-4）

容器對 qBittorrent 的請求自己帶正確的 `Host`／`Referer`。不准關 qBittorrent 的 CSRF 防護、Host 檢查和登入封鎖，不准打開略過驗證或 IP 白名單。遇到連不上，先查 qBittorrent 5.1.4 文件，不改 qBittorrent 設定。

---

## 建議底稿的改法

- **AD-1**：加 S1 第 4 點（所有對外網址都要在 Access 後面），列出舊網址加 Access 和改密碼是前置條件。
- **AD-2**：加 S3 第 4、5 點（Strict、cookie 名稱）、S9 全部、S19。
- **AD-3**：換成 S2（App 自己的密碼雜湊）、加 S10 全部。
- **AD-4**：加 S11 和 S22。
- **AD-5**：加 S4（工廠和測試）、S6、S7、S8。
- **AD-8**：加 S20。
- **AD-9**：加 `bad_origin` 這個 code，加 S16 的 message 規則。
- **AD-10**：加 S12。
- **新 AD-12「請求來源與 Host 檢查」**：S3 第 1 到 3 點、S17。
- **新 AD-13「路徑只能在允許的根目錄底下」**：S5。
- **部署**：S13、S14、S15、S18；Unraid 範本的環境變數從 4 個變成 7 個左右（加 `APP_PASSWORD_HASH`、`APP_ORIGINS`、`TRUSTED_PROXY_IPS`、`SAVE_ROOTS`），一致性慣例那一行要跟著改。
- **memlog**：記下 S3 第 5 點和 S21 兩個接受的風險。

## 要 Alex 確認的事實

這幾件事底稿和 memlog 都沒有答案，影響上面幾條的嚴重度：

1. qBittorrent 密碼從 `2b3ac93` 外洩之後改過了沒（S1）。
2. 舊 qBittorrent 的 Tunnel 網址現在加 Access 了沒（S1）。
3. qBittorrent 容器在 Unraid 掛了哪些資料夾、有沒有 privileged（S5）。
4. cloudflared 是哪種網路模式、在容器看起來是什麼來源位址（S10 的 `TRUSTED_PROXY_IPS`）。
5. NAS 的同一個 IP 上還開了哪些網頁服務（S3 的同站風險有多大）。
