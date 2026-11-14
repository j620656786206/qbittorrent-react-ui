# Spine Pair Review：react-torrent

- 審查對象：`DESIGN.md`、`EXPERIENCE.md`（都還是 draft）
- 對照：根目錄 `DESIGN.md`（7 件事、10 張畫面、5 條設計要求）、`.memlog.md`（102 筆，衝突時以它為準）
- 審查日期：2026-11-14

## Overall verdict

顏色 token 很完整：每個角色都有淺色、深色兩個 hex，DESIGN.md 的 39 個 `{token}` 引用和 EXPERIENCE.md 的 4 個全部對得到。兩份的元件表也是同一組 25 個名字。最大的問題在 EXPERIENCE.md：很多已經定案的規格（自動收合、快捷鍵、搜尋框、分頁順序）只寫在劃了刪除線的「待決問題」裡，其中自動收合那段還留著舊數字。另外，登入畫面、「已整理」窄條、設定頁三個東西有決定卻沒有規格。畫 10 張畫面之前，先把這幾塊搬到正確的章節，再補齊。

## 1. Flow coverage：adequate

檢查了什麼：根目錄的 7 件事和 10 張畫面，逐一對到 4 個旅程。7 件事都有旅程走到（旅程 1 走篩選、排序、改路徑、改檔名；旅程 2 走新增；旅程 3 走看進度；旅程 4 走刪除）。每個旅程都有主角（Alex）、編號步驟和高潮。缺的是第 10 張登入，失敗路徑也跟 State Patterns 對不上。

### Findings

- **high** 4 個旅程的失敗路徑都寫「還沒決定（Q15）」，但 Q15 已經結案：State Patterns 已定「失敗用 toast 加重試、對話框不關」和「連不到家裡」的提示條。(EXPERIENCE.md 第 251、261、273、285 行，對照第 149、154 行) *Fix:* 失敗路徑改成直接引用 State Patterns 那幾列，例如旅程 4 寫「刪除失敗：toast 寫原因加重試，刪除確認不關」。
- **high** 第 10 張「登入」沒有任何旅程。它是做任何一件事的前提，而且跟「Cloudflare 登入過期」「連不到家裡」三種情況容易混。(EXPERIENCE.md IA 表第 40 行、State Patterns 第 151 行) *Fix:* 加旅程 5：Alex 在外面用手機打開 App，qBittorrent 登入失效，看到新的登入畫面，登入後回到上次的分類和排序。失敗：帳密錯、qBittorrent 連不到。
- **medium** 旅程 1 第 6 步寫「他從詳情進改檔名」，沒用到 Q7 定好的「已搬到 media/tv　接著改檔名」提示，也沒寫搬移中那段。這兩個正是這個旅程的設計重點。(EXPERIENCE.md 第 245 到 247 行，對照第 297 行、第 155 行) *Fix:* 第 5 步改成「列先顯示搬移中，搬完標籤變紫色，下面跳提示接著改檔名」，第 6 步改成「他點提示進改檔名」。
- **low** 旅程 1 第 3 步的位置標籤寫「下載區」，常用路徑範例的名字是「下載區（影集）」。(EXPERIENCE.md 第 244 行，對照第 118 行) *Fix:* 統一用範例表的名字。
- **low** 打字找名字（畫面 3 的一部分）沒有出現在任何旅程裡。(EXPERIENCE.md Key Flows) *Fix:* 在旅程 4 加一步「按 `/` 打名字找某一部」，或在旅程 3 用手機搜尋。

## 2. Token completeness：adequate

檢查了什麼：frontmatter 的 52 個顏色 token（26 組淺深配對）、11 個字型角色、7 個圓角、18 個間距、19 個元件，加上兩份散文裡的 `{path}` 引用。顏色全部有 hex，也都有 `-dark` 配對，沒有 critical。缺的是跟 shadcn 的對應，以及幾個散文裡用到卻沒有 token 的顏色。

### Findings

- **high** 沒寫品牌角色怎麼對到 shadcn 的 CSS 變數。frontmatter 只說「沒列的 shadcn token 先沿用，實作時再對」。問題有兩個：(1) 這裡的 `accent` 是黑色主要動作，shadcn 的 `--accent` 是選單項目滑上去的淡底，照名字對會讓 DropdownMenu（排序選單）每個 hover 項目變黑。(2) shadcn zinc 的深色是近黑灰，不是深藍夜，Dialog、Sheet、DropdownMenu、Toast、Input 在深色模式會跟頁面不同色。(DESIGN.md 第 10 到 12 行) *Fix:* 加一張對照表，例如 `--background` → `surface-page`、`--card`／`--popover` → `surface`、`--muted` → `surface-muted`、`--primary` → `accent`、`--accent` → `surface-muted`、`--ring` → `accent`、`--destructive` → `delete`，淺色、深色各一欄。
- **medium** 散文裡用到但沒有 token 的顏色：速度膠囊出問題時「變橘色」、連不到家裡和 Cloudflare 過期的提示條、改檔名預覽「抓到的」和「猜的」兩種顏色、撞名的列「變紅」。(EXPERIENCE.md 第 72、152、149 到 150、302 行) *Fix:* 每一個指定用哪個現有角色（例如橘色用 `status-stalled`、撞名用 `delete`），或新增 token 並補對比。
- **medium** 對比表少了幾組天天會看到的組合：`accent-foreground` 在 `accent` 上（新增按鈕、選中的分頁，深色是 `#0F1720` 在 `#6CB4E4`）；`selection-bar-foreground` 在 `selection-bar`；狀態色當文字用（詳情狀態大字、速度膠囊的 ↓ ↑）；選中分頁裡的淡色數量；`text-muted` 在 `selection-row`。(DESIGN.md 第 291 到 301 行) *Fix:* 補這 5 組的淺色、深色數字。
- **medium** 手機點擊範圍要 44px，但元件 token 只有電腦的值：`detail-header.nav-button-size` 36px、`save-path-block.button-height` 34px。寫程式的人照 DESIGN.md 會做出 36px 和 34px。(DESIGN.md 第 217、229 行，對照 EXPERIENCE.md 第 215 行) *Fix:* 加 `-phone: 44px` 的 token，像 `sort-pill` 那樣分兩個值。
- **low** `media-library-tint-dark` 跟淺色同值（`#6A45C81F`），對比表的深色數字是量在 `surface` 上，不是量在淡紫底上。(DESIGN.md 第 47 到 48、297 行) *Fix:* 確認深色是不是要另一個淡紫值，並量淡紫底上的對比。
- **low** 幾個尺寸沒進 token：看板卡片百分比電腦 17px、手機 22px 只寫在 `row-value` 的 note；媒體庫標籤「粗一點的字」沒寫粗細；所有字型角色都沒有 `lineHeight`。(DESIGN.md 第 83、387 行) *Fix:* 卡片百分比加一個字型角色，標籤寫 `fontWeight`，行高寫一句「沿用 Tailwind 預設」或補值。

## 3. Component coverage：thin

檢查了什麼：兩份元件表各 25 個名字，完全對得上，每列都有實際規則。問題是兩份文件其他地方用到的元件，至少 9 個兩張表都沒有，而且有一個元件長相前後不一。

### Findings

- **high** 登入畫面（第 10 張）在兩份都沒有元件、版面或行為規格，只有一句「新的登入畫面，不沿用現有的」。(EXPERIENCE.md 第 40、151 行；DESIGN.md Components 沒提) *Fix:* 兩份各加一列 `login`：欄位、按鈕、錯誤訊息位置、電腦和手機的樣子，以及跟 Cloudflare 過期怎麼區分。
- **high** 看板卡片上有沒有狀態圓圈，前後說法不一。DESIGN.md 卡片的構造沒有圓圈，EXPERIENCE.md 狀態圓圈的「用在」也沒有卡片；但旅程 2 高潮「圓圈的進度環開始走」、旅程 3 第 5 步「看圓圈和第二行就知道好了沒」、動態的「進度環轉進來」都假設卡片上有圓圈。memlog 第 56 筆說 demo 有加 32px 圓圈，但「不在 K 裡」。(DESIGN.md 第 384 行；EXPERIENCE.md 第 76、206、259、270 行) *Fix:* 請 Alex 決定卡片要不要圓圈，再同步改兩張元件表、旅程和動態。這會影響畫面 1、2 和驚艷的那一下。
- **high** 「已整理」窄條只有一句「看板最後一條窄條，平常收著，點了展開」，兩張表都沒有它。它裝了大約 3737 個種子，是全部的九成。沒寫：手機狀態分頁有沒有這一格、列表模式（例如排做種時間）要不要混在一起、分類分頁的數量算不算它。(EXPERIENCE.md 第 166 行；DESIGN.md 第 337 行只寫 4 欄) *Fix:* 兩份各加一列 `archived-strip`，並寫清楚列表模式和手機的規則。
- **medium** 文件裡用到、但兩張元件表都沒有的元件：搜尋框（點了才出現，`/` 打開）、快捷鍵按鈕和說明視窗、手機分類清單（「mteam-tv ▾」的底部面板）、手機的狀態分頁、收合後的直條欄、連線提示條、拖檔案時的遮罩「放開就新增」、詳情的「⋯」選單（暫停／繼續）。(EXPERIENCE.md 第 33、293、298、311、312 行，DESIGN.md 第 344 行) *Fix:* 兩份各補一列；外觀沿用 shadcn 的就寫「沿用 shadcn X」。
- **medium** DESIGN.md 的元件構造落後於 EXPERIENCE.md：選取列少了「改路徑」按鈕；儲存位置區塊少了「改檔名」按鈕；排序按鈕少了排序方向的小箭頭；詳情固定頭沒放「⋯」。(DESIGN.md 第 381、390、392、396 行，對照 EXPERIENCE.md 第 83、89、300、311 行) *Fix:* 把 DESIGN.md 這四列的構造補上，並寫按鈕順序。
- **medium** 電腦看板點卡片時，詳情「從右邊滑出來，蓋住最右邊那欄」，但 DESIGN.md 的詳情面板只描述列表模式的固定面板，沒寫蓋上去時的寬度、陰影、要不要遮罩。(DESIGN.md 第 391 行，對照 EXPERIENCE.md 第 78、298 行) *Fix:* 詳情面板加一個「蓋在看板上」的樣子。
- **low** `detail-hero` 同時是元件名和字型角色名。(DESIGN.md 第 71、393 行) *Fix:* 元件改名 `detail-status`，或在 Components 寫明兩者的關係。

## 4. State coverage：adequate

檢查了什麼：IA 表 10 張畫面，每張該有的狀態。全域狀態寫得很好：第一次載入、連不到家裡、Cloudflare 過期、qBittorrent 斷線、空分類、空欄、動作失敗都分開寫。缺的集中在新增、登入兩張畫面和多選動作。

### Findings

- **high** 新增種子沒有錯誤狀態：磁力連結格式不對、種子已經在清單裡（qBittorrent 會拒絕重複）、.torrent 檔壞了、拖進來的不是 .torrent。旅程 2 的失敗路徑因此也懸空。(EXPERIENCE.md 第 92、261、295 行) *Fix:* State Patterns 加這 4 列。重複那一列可以順便接 Q21 的點子「以前下載過」。
- **high** 登入畫面沒有狀態：帳密錯、qBittorrent 本身連不到、送出中。(EXPERIENCE.md 第 151 行) *Fix:* 跟元件那條一起補。
- **medium** 多選動作的結果沒寫：刪 5 個只成功 3 個、一次搬好幾個只搬成功一部分時怎麼顯示；刪除成功後詳情要顯示哪一個、選取怎麼清。(EXPERIENCE.md 第 154 行只寫整體失敗) *Fix:* 加「部分失敗」和「刪除成功後」兩列。
- **medium** 搜尋沒有找到東西時怎麼顯示沒寫；開著搜尋時換分類，關鍵字留不留也沒寫。(EXPERIENCE.md 第 311、312 行) *Fix:* State Patterns 加「搜尋沒結果」一列，Interaction Primitives 寫換分類時的規則。
- **medium** 看板每欄「自己捲、一直載入」，列表要虛擬化，但沒寫捲到底在載入下一批時長什麼樣子。(EXPERIENCE.md 第 193、312 行) *Fix:* 加一列「載入更多」：例如底部 2 到 3 張骨架卡。
- **medium** 資料會一直更新，但沒寫列表跟著變時怎麼處理。依速度、進度、剩餘時間排序時，列會一直換位置，滑鼠底下那列可能跑掉。(EXPERIENCE.md 排序和檢視、Interaction Primitives) *Fix:* 寫更新頻率，以及滑鼠停在列表上或有勾選時要不要暫停重排。
- **low** 詳情的檔案、追蹤者、用戶三個分頁沒有載入中和空的狀態，例如「抓種子資訊中」時還沒有檔案清單。(EXPERIENCE.md 第 88 行) *Fix:* State Patterns 加一列。
- **low** mteam-X 的 43 個照規則會變紅色放「要處理」，Alex 還沒確認。這件事只寫在劃了刪除線的 Q21 裡，很容易漏掉。(EXPERIENCE.md 第 309 行) *Fix:* 移到還沒決定的清單，或請 Alex 確認後拿掉。

## 5. Visual reference coverage：thin

檢查了什麼：`imports/` 6 張、`.working/` 3 個檔，沒有 `mockups/` 和 `wireframes/`。兩份都把線上畫布連結和「以這兩份為準」寫在開頭。但 `imports/` 6 張沒有一張在 spine 裡被連結，畫布也沒有對到哪張畫面。

### Findings

- **medium** `imports/` 6 張都是孤兒，spine 裡沒有連結：`moze-calendar-full.png`、`moze-home-empty.png`、`moze-home-list.png` 應該放在 Inspiration「從 MOZE 學」；`vuetorrent-detail-content-tab.png` 是設計要求 2 的由來，放在詳情固定頭；`vuetorrent-search-bar.png` 放在搜尋；`vuetorrent-settings-speed.png` 放在全域速度。(EXPERIENCE.md Inspiration、全域速度；DESIGN.md Brand & Style) *Fix:* 在對應章節各加一行連結，寫它示範了什麼。
- **medium** 畫布只給一個連結，沒寫哪個 artboard 是哪張畫面，也沒寫哪些畫面還沒有參考。依文件，方向 K 只涵蓋畫面 1、2、4、5 和部分 3；6 到 10 沒有畫稿。畫布上還有已知要改的地方：舊顏色、「/ 32.7」。(DESIGN.md 第 245、308 行；EXPERIENCE.md 第 131 行) *Fix:* 加一張小表：畫面編號、artboard 名稱、跟 spine 不一樣的地方。
- **low** `demo-board/index.html` 只出現在劃了刪除線的 Q20 段落裡，`directions-1.html`（第一輪 A 到 D）完全沒提。(EXPERIENCE.md 第 314 行) *Fix:* demo 連結移到動態或看板的元件列；A 到 D 的否決那條連到 directions-1.html。
- **low** 「以這兩份為準」兩份各寫一次。規則是寫一次就好。(DESIGN.md 第 245 行、EXPERIENCE.md 第 12 行) *Fix:* 留一份，另一份改成「規則見 DESIGN.md 開頭」。不改也不影響下游。

## 6. Bloat & overspecification：thin

### Findings

- **high** 很多已經定案的規格只寫在「待決問題」劃了刪除線的條目裡：看板自動收合（門檻、兩步動畫、錨點、停捲、展開規則、設定開關）、全部快捷鍵、搜尋框點了才出現、分類分頁順序、排序方向的預設值、打開 App 回到上次的分類、欄變寬後一排 2 到 3 張。寫程式的人看到刪除線很可能整段跳過。(EXPERIENCE.md 第 291 到 314 行) *Fix:* 搬到 Component Patterns、Interaction Primitives、動態、排序和檢視；「待決問題」只留真的還沒決定的（Q5、Q7 的版面、mteam-X 那 43 個）。決定的來龍去脈 memlog 已經有了。
- **medium** 全域速度寫在三個地方：速度膠囊的元件列、「全域速度」一節、Q2。手機的寫法只在 Q2 裡。(EXPERIENCE.md 第 72、126 到 132、292 行) *Fix:* 合併成一處，其他地方只留一句引用。
- **medium** EXPERIENCE.md 的散文帶了很多由來、Alex 原話和 NAS 統計數字（第 64、124、309、312 行等）。體驗規格的散文不該帶這些，下游要的是規則。(EXPERIENCE.md 多處) *Fix:* 保留會影響決定的數字（例如「已整理」約九成），其他移回 memlog。
- **low** DESIGN.md Colors 的「調了哪些（舊值 → 新值）」是變更紀錄；`status-archived` 的「用在」欄塞了對比數字。(DESIGN.md 第 273、303 到 306 行) *Fix:* 變更紀錄移到 memlog，對比數字移到對比表。

## 7. Inheritance discipline：adequate

檢查了什麼：sources 能不能解析、畫面名稱和根目錄是否一致、用語、元件名、token 引用、跟 memlog 的衝突。畫面名稱跟根目錄一字不差，token 引用全部對得到，元件名在兩份一致。

### Findings

- **high** 自動收合那段跟 memlog 衝突，寫程式的人會照錯的數字做。EXPERIENCE.md 還留著「demo 的修法（等 Alex 試）」「停住捲動約 0.66 秒」「閃 2px 框 1.6 秒」「以滑鼠下面那張為準」。memlog 第 59、61、62 筆已改成：整段動畫都停捲、錨點是欄裡離滑鼠最近的那張（沒有就第一張完整看得到的）、在最上面往上滾也會展開，Alex 已核准。收合門檻（「大約一個螢幕高」或「一開始捲」）最後選哪個也沒寫。(EXPERIENCE.md 第 312、314 行) *Fix:* 照 memlog 第 61、62 筆重寫成一張規則表，門檻請 Alex 選一個。
- **high** IA 寫「沒有設定畫面」，但有三個決定放在「App 原本的設定頁」（`src/routes/settings.tsx`）：分類分頁順序（上下箭頭排）、「捲動時自動收合其他欄」開關、快捷鍵說明。這頁不在 10 張裡，也沒有任何規格。(EXPERIENCE.md 第 42、293、310、314 行) *Fix:* IA 改成「沒有新的設定畫面，沿用原本的設定頁」，並在 Component Patterns 寫這頁要加的三個東西。
- **medium** 畫面數還寫 9 張，根目錄和 IA 表已經是 10 張。(EXPERIENCE.md 第 13、23 行) *Fix:* 改成 10 張。
- **medium** 狀態用語只列 6 種（下載中、做種中、已完成、已暫停、停滯、錯誤），DESIGN.md 是 7 種，多了「已整理」。DESIGN.md 版面也只寫「4 欄等寬」，沒有窄條。(EXPERIENCE.md 第 62、160 行；DESIGN.md 第 263、337 行) *Fix:* 用語加「已整理」，版面加窄條。
- **medium** 兩份的 `sources` 都寫 `DESIGN.md`。在工作區裡，這會指到 spine 自己，不是根目錄那份。(DESIGN.md 第 6 行、EXPERIENCE.md 第 5 行) *Fix:* 改成從 repo 根目錄算的路徑，例如 `/DESIGN.md` 加註「repo 根目錄」，或寫完整路徑。
- **low** Q20 還寫「範圍待定（Q22）」，但 Q22 已決定先不做。Q22 寫「設定頁只放快捷鍵說明」，Q20 又說快捷鍵說明是右上角按鈕跳出的視窗。(EXPERIENCE.md 第 310、312 行) *Fix:* 刪掉 Q20 那句，說明視窗的位置統一成一種。
- **low** DESIGN.md 狀態圓圈寫「中間白色圖示」，但同一份 Colors 說深色模式用深色圖示。(DESIGN.md 第 275、378 行) *Fix:* 改成「中間 `{colors.status-icon}` 圖示」。
- **low** 根目錄「還沒決定的事」還列著「排序被記住時要不要提示」，spine 已經用排序按鈕的「（這個分類記住的）」解決了。(根目錄 DESIGN.md 第 81 行) *Fix:* 根目錄那條標「已決定」，指到 EXPERIENCE.md 的排序按鈕。

## 8. Shape fit：adequate

檢查了什麼：DESIGN.md 的 8 節照標準順序（Brand & Style、Colors、Typography、Layout & Spacing、Elevation & Depth、Shapes、Components、Do's and Don'ts），沒有缺。EXPERIENCE.md 8 個必要章節都在，Responsive 和 Inspiration 也有（多裝置、有參考產品，都該有）。自己加的章節裡，「排序和檢視」「常用路徑和位置標籤」「動態」都有用；「全域速度」跟元件列重複；「待決問題」大部分已結案。

### Findings

- **medium** 「待決問題」22 條裡 20 條已劃掉，但內容還是規格本體，章節名字跟內容不符，又放在 Key Flows 後面。(EXPERIENCE.md 第 287 到 314 行) *Fix:* 照第 6 類的第一條處理，搬完之後這節只剩幾行。
- **low** 「全域速度」一節可以併進 Component Patterns 的速度膠囊列，或改成它的補充說明。(EXPERIENCE.md 第 126 到 132 行) *Fix:* 見第 6 類第二條。
- **low** DESIGN.md frontmatter 多了 `status`、`sources`、`updated`，DESIGN.md 規格沒有這幾個 key。不影響使用，解析器會略過。(DESIGN.md 第 4 到 8 行) *Fix:* 可以留著，或移到 EXPERIENCE.md 統一管理。

## Mechanical notes

- **Token 引用**：DESIGN.md 39 種 `{path}` 引用、EXPERIENCE.md 4 種（`colors.accent`、`colors.good`、`colors.selection-row`、`colors.media-library`），全部對得到 frontmatter。EXPERIENCE.md 第 12 行的 `{path.to.token}` 是說明文字，不是引用。
- **嵌在字串裡的引用**：`list-row.focus-ring: inset 0 0 0 2px {colors.accent}` 沒加引號，引用夾在字串中間。有些解析器只處理整個值是引用的情況，實作時要注意。
- **元件名**：兩張元件表各 25 個名字，英文代號完全一致。中文名一致（選取列、詳情固定頭、儲存位置區塊等）。
- **名稱不一致**：「已完成」（狀態）和「完成」（看板欄名）是刻意區分，第 62 行有寫，沒問題。「下載區」和「下載區（影集）」不一致（見第 1 類）。
- **畫面數**：EXPERIENCE.md 第 13、23 行寫 9 張，其他地方都是 10 張。
- **Frontmatter**：EXPERIENCE.md 有 name、status、sources、updated，跟範例一致。兩份 `sources` 的 `DESIGN.md` 會解析成 spine 自己（見第 7 類）。
- **[ASSUMPTION]**：只剩「qBittorrent 狀態對應」一個，跟 memlog 第 107 筆一致。
- **Mermaid**：兩份都沒有。
