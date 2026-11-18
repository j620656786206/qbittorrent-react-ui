# 部署到 Unraid

這份寫的是把 react-torrent 放上 Unraid NAS 的步驟，照順序做。映像只在 GitHub Actions 建：PR 只建映像、跑檢查，不推；合併到 main 後才推到 GHCR。不要在自己的電腦上 `docker push` 或登入 GHCR。

文件裡的網址都是範例：`torrent.example.com` 代表 Tunnel 的新網址，`<NAS 位址>` 換成你在家連 NAS 用的位址，`<範本的 port>` 是範本裡 WebUI port 設的主機 port（預設 3000）。

## 1. 一次性的 GitHub 設定

在 repo 的 Settings 做，只要做一次。

1. **main 分支保護**：Settings > Branches 新增規則，套用到 `main`。勾「合併前要通過狀態檢查」（Require status checks to pass before merging），選 CI 的 `check`，同時勾「Require branches to be up to date before merging」，這樣 CI 測過的就是合併後的內容。勾「禁止 force push」。
2. **Dependabot**：Settings > Code security，打開 Dependabot alerts 和 Dependabot security updates。目前兩個都是關的。
3. **依賴更新 PR 要自己看**：自動流程（/ship）只合併 `story/` 開頭的分支。Dependabot 開的 PR 分支是 `dependabot/` 開頭，不會被自動合併，要你自己看過再合併。每月會有三個：正式依賴、開發依賴、GitHub Actions 加 Node 基底映像。安全性更新不分組，隨時會開。

## 2. 第一次推映像之後：GHCR 套件設成公開

第一次合併到 main，`Image` workflow 跑完後，GitHub 會多一個叫 `react-torrent` 的套件。

1. 到 GitHub 個人頁的 Packages，點 `react-torrent`。
2. Package settings > Danger Zone > Change visibility，選 Public。Unraid 拉映像不用登入。
3. 同一頁確認套件有連到 `qbittorrent-react-ui` 這個 repo（Manage Actions access 裡看得到它）。沒有的話，在那裡把 repo 加進去。

## 3. Unraid：建容器

1. 在 Unraid 終端機建設定資料夾，交給容器的使用者（99:100）：

   ```bash
   mkdir -p /mnt/user/appdata/react-torrent
   chown 99:100 /mnt/user/appdata/react-torrent
   ```

2. 把 repo 裡的 `deploy/unraid/react-torrent.xml` 複製到 `/boot/config/plugins/dockerMan/templates-user/`。
3. Docker 頁按「Add Container」，Template 選 `react-torrent`。
4. 填變數：

   | 變數             | 怎麼填                                                                                                                   |
   | ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
   | `QBIT_URL`       | 從這個容器看到的 qBittorrent WebUI，寫成 `http://<NAS 位址>:<qBittorrent 的主機 port>`。不加路徑和結尾斜線（見下面說明） |
   | `QBIT_USERNAME`  | qBittorrent WebUI 的帳號，也是這個 App 的登入帳號                                                                        |
   | `QBIT_PASSWORD`  | qBittorrent WebUI 的密碼，也是這個 App 的登入密碼                                                                        |
   | `SESSION_SECRET` | 在終端機跑 `openssl rand -base64 32`，貼上結果。換掉它所有裝置都會登出                                                   |
   | `APP_ORIGINS`    | 瀏覽器開這個 App 用的網址，全部列出來，用逗號分開                                                                        |
   | `SAVE_ROOTS`     | 下載根目錄，用 qBittorrent 容器裡看到的路徑                                                                              |

   `QBIT_URL`：Unraid 預設的 bridge 網路裡，容器名稱查不到，不能寫 `http://qbittorrent:8080`。要寫 NAS 在家裡網路的位址，加上 qBittorrent 容器對應到主機的 port（qBittorrent 容器設定裡 WebUI 那一列的主機 port）。如果 qBittorrent 用 br0 或 macvlan 網路、有自己的位址，Unraid 預設不讓 bridge 的容器連到它（主機隔離）。這時候 `QBIT_URL` 寫 qBittorrent 自己的位址 `http://<qBittorrent 的 br0 位址>:<WebUI port>`，並到 Settings > Docker 打開「Host access to custom networks」。填完後在實測清單確認 App 真的連得到 qBittorrent。

   `APP_ORIGINS` 要列兩個：在家用的 `http://<NAS 位址>:<範本的 port>`，和 Tunnel 的 `https://torrent.example.com`。寫成 `http://<NAS 位址>:3000,https://torrent.example.com`。不加結尾斜線。port 要和範本的 port 一樣，改了範本的 port 就要一起改。少列一個，從那個網址開會被擋。

   `SAVE_ROOTS` 是 qBittorrent 容器裡看到的路徑，不是 NAS 上的路徑。例如 qBittorrent 把下載資料夾掛在 `/downloads`，就填 `/downloads`。有好幾個就用逗號分開。改路徑時，新路徑一定要在這些資料夾底下。

5. 不要加範本以外的東西：不加其他變數（特別是 `TSS_` 開頭的，它會關掉 Host 檢查），不加資料夾，不改 Extra Parameters，不開 Privileged。
6. 按 Apply。容器少了變數或 `SESSION_SECRET` 太短時會自己停掉，log 會寫是哪一個變數。

## 4. Cloudflare 和 qBittorrent

1. **新網址**：在 Cloudflare Tunnel 新增 `torrent.example.com`，指到這個容器 `http://<NAS 位址>:<範本的 port>`。port 用範本裡設的主機 port，改過就用改過的值。再到 Zero Trust 為它加一個 Access 應用程式。
2. **舊 qBittorrent 網址**：現在對外的 qBittorrent 網址（包含 VueTorrent）也加 Access。任何能碰到 qBittorrent WebUI 的對外網址都要在 Access 後面。
3. **執行外部程式**：qBittorrent 設定 > 下載，確認「下載完成時執行外部程式」和「新增種子時執行外部程式」都是空的。
4. **qBittorrent 容器的掛載**：在 Unraid 編輯 qBittorrent 容器，確認只掛了下載資料夾和它自己的 appdata。
5. **備份**：把 qBittorrent 的 appdata 和 `/mnt/user/appdata/react-torrent` 加進備份。

## 5. 更新

合併到 main 以後，GHCR 會有新的 `latest`。在 Unraid Docker 頁按「Check for Updates」，`react-torrent` 出現可更新時按「Apply Update」。

範本改過時（`deploy/unraid/react-torrent.xml` 有新的變數、參數或欄位），已經建好的容器不會跟著變。Unraid 建容器時把你填的值存成 `/boot/config/plugins/dockerMan/templates-user/my-react-torrent.xml`，容器照這份跑。不要刪它，密碼和 `SESSION_SECRET` 都在裡面。做法：看 GitHub 上 `react-torrent.xml` 這次改了什麼，到 Docker 頁編輯 `react-torrent` 容器，照著把那幾個欄位改好或補上，按 Apply。Unraid 會把結果寫回 `my-react-torrent.xml`。

## 6. 退回上一版

新版有問題時：

1. 到 GHCR 套件頁（GitHub 個人頁 > Packages > `react-torrent`），從列出的 tag 挑上一個 commit 的完整 sha。只用套件頁上有的 tag：main 連續合併時，排隊中的 workflow 可能被跳過，不是每個 commit 都有映像。
2. Unraid 編輯 `react-torrent` 容器，把 Repository 的 `:latest` 換成那個 sha，例如 `ghcr.io/j620656786206/react-torrent:<commit sha>`。按 Apply。
3. 修好、新版推上去以後，再把 Repository 改回 `:latest`。不改回去的話，檢查更新不會看到新版。

**舊映像的保留**：每次合併都會多一個 sha tag，GHCR 不會自己刪。留最近幾個（至少上一個能用的版本）給退回用，更舊的偶爾到套件頁的 Manage versions 手動刪掉。正在用的那個 sha 和 `latest` 不要刪。

## 7. 上線後實測清單

上線後照這份一項一項確認。結果和預期不同時，把看到的記下來，回去改架構底稿 `_bmad-output/planning-artifacts/architecture/architecture-react-torrent-2026-11-15/ARCHITECTURE-SPINE.md`（AD-2，或「先不決定」表裡「地基 story 要先實測的事」那一列），下次開 session 告訴 Claude。

- [ ] **在家用 http 登入**：電腦開 `http://<NAS 位址>:<範本的 port>`，用 qBittorrent 帳密登入。要看到種子列表，頁首有下載和上傳速度。
      不一樣時：被擋或一直回登入頁，先看 `APP_ORIGINS` 有沒有列這個網址、port 對不對。
- [ ] **真的連到 qBittorrent**：登入後列表要有種子，數量和 qBittorrent 裡的差不多。
      不一樣時：畫面寫「家裡的 qBittorrent 沒有回應」或一直是空的，先檢查 `QBIT_URL`（第 3 步的說明：bridge 網路要寫 NAS 位址加主機 port，br0 要開主機存取）。登入畫面寫 qBittorrent 密碼不對，就改容器的 `QBIT_PASSWORD`，改完重啟容器。
- [ ] **容器加固有生效**：在 Unraid 終端機跑下面的指令，要印出 `true [ALL] [no-new-privileges] 99:100`。
      不一樣時：容器的 Extra Parameters 被改過或沒套用，照範本改回 `--cap-drop=ALL --security-opt=no-new-privileges --read-only --tmpfs /tmp`，按 Apply。

  ```bash
  docker inspect react-torrent --format '{{.HostConfig.ReadonlyRootfs}} {{.HostConfig.CapDrop}} {{.HostConfig.SecurityOpt}} {{.Config.User}}'
  ```

- [ ] **容器健康、commit 對得上**：Unraid Docker 頁 `react-torrent` 顯示 healthy。點 log，找 `"event":"startup"` 那一行，`commit` 要和 GitHub main 最新的 commit sha 一樣。
      不一樣時：不是 healthy，看 log 有沒有 `startup_env_invalid`；commit 不一樣，按檢查更新再套用一次。
- [ ] **手機走 Tunnel**：手機開 `https://torrent.example.com`。要先出現 Cloudflare Access 的登入，過了以後才是 App 的登入畫面，登入後看到列表。
      不一樣時：沒出現 Access 就直接看到 App，表示 Access 沒套到這個網址，先回第 4 步補上再用。
- [ ] **Secure cookie（AR-59）**：電腦用 `https://torrent.example.com` 開並登入。開發者工具 > Application > Cookies，`rt_session` 的 Secure 要打勾。
      不一樣時：表示經過 Tunnel 時容器沒看到 https（`X-Forwarded-Proto`），記下來回報。
- [ ] **Access 過期（AR-60）**：在電腦用 Tunnel 網址登入後，開發者工具刪掉這個網域的 `CF_Authorization` cookie（或在 Zero Trust 撤銷這個 session）。等 5 秒或按重試。開發者工具 Network 找 `/_serverFn/` 的請求，記下回應是 401、轉址還是 200 的 HTML。畫面要出現「Cloudflare 登入過期了」。
      不一樣時：畫面出現的是「連不到家裡」或別的提示，把記下的回應種類回報，前端的判斷要照實際的回應改。
- [ ] **壓縮（Story 1.6）**：用 Tunnel 網址開，Network 找 `getMaindata` 的 `/_serverFn/` 回應，Response Headers 要有 `content-encoding`（zstd、br 或 gzip 其中一個）。
      不一樣時：沒有壓縮，手機每次要多傳好幾倍的資料，記下來，下次決定要在 App 裡壓縮還是減少欄位。
- [ ] **手機捲動時不換位置（Story 1.8）**：手機用手指捲列表，捲的時候列的位置不變。放手約 0.3 秒後列表才更新順序。
      不一樣時：捲到一半列跳來跳去，記下是在哪個畫面、大概多少種子在下載。

- [ ] **錯誤原因（Story 2.10，只看不改）**：NAS 上剛好有「錯誤」狀態的種子時，大約一分鐘內這三個地方都要顯示原因（例如「找不到檔案或資料夾」），不是「qBittorrent 回報錯誤」：看板「要處理」欄它的卡片第二行、列表模式（任一個不是「狀態」的排序）它那一列的第二行、點開它的詳情狀態區那行灰字。原因裡有路徑、數字或中文這類內容時，畫面會維持「qBittorrent 回報錯誤」，這是故意的（只顯示常見的系統錯誤和單純的英文句子），不算失敗。當天 NAS 上沒有錯誤狀態的種子，這項就記「還沒驗」，不要為了驗證自己弄出一個錯誤的種子（AD-15 不准對真的 qBittorrent 做寫入）。
      不一樣時：一直是「qBittorrent 回報錯誤」，記下 qBittorrent 的介面語言和它「執行日誌」裡那個種子最新一行的開頭幾個字（不要抄路徑和檔名），可能是日誌的格式或語言和程式認得的不同。

Epic 1 的驗收就是 Alex 照這份清單在 NAS 上打開、登入、看到列表。
