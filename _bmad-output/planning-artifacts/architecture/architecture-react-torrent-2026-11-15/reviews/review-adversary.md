---
reviewer: adversary
target: ../ARCHITECTURE-SPINE.md
inputs:
  - ../ARCHITECTURE-SPINE.md
  - ../.memlog.md
  - ../../../ux-designs/ux-react-torrent-2026-11-13/EXPERIENCE.md
date: 2026-11-15
---

# 對手審查：兩個 story 都守規矩，還是做不起來

## 判決

AD-1 到 AD-11 把「伺服器那一側」管得很緊（白名單、帳密、SID、錯誤 code），但「前端那一側」幾乎沒有規則：資料的形狀、前端狀態放哪、誰負責算「目前看得到的那串種子」、操作和輪詢誰先誰後、設定檔裡每個欄位的身分，全都留給各 story 自己決定。照這份底稿讓不同 agent 分開做，至少會出現下面 14 對不相容。其中 8 對是高嚴重度（洞 1、2、3、4、6、7、8、13），第一個 epic 就會撞到。

嚴重度定義：
- **高**：功能會壞、資料會錯，或有安全後果；兩個 story 合併後要重寫其中一個。
- **中**：畫面行為不一致或偶發錯誤，修起來要動兩個 story。
- **低**：重複程式或小不一致，之後整理就好。

標「需查證」的是依賴 qBittorrent 5.1.4 或 TanStack Start 1.169 行為的推論，照 AD-11 要先查對應版本的官方文件再定案。

---

## 洞 1：`['maindata']` 裡的資料長什麼樣子，沒人定（高）

**Story A（看下載進度：列表）**：`getMaindata(rid)` 直接回 qBittorrent 的原始增量（snake_case，`torrents` 是以 hash 為 key 的物件，欄位只帶有變的），前端 queryFn 自己合併，存成 `{ rid, torrents: Record<hash, Torrent>, categories, server_state }`。

**Story B（全域速度、詳情）**：寫 server function 時順手在 `src/shared` 定了一個完整的 zod `Torrent` schema，欄位轉成 camelCase（`savePath`、`completionOn`），而且用完整 schema 去 parse 增量回應（增量只有幾個欄位，parse 失敗，回 `invalid_input` 或直接丟掉）。詳情的 `src/lib` 純函式照 camelCase 寫。

**為什麼都合規卻不相容**：AD-6 只說「一個地方抓、合併成一份、放在 `['maindata']`」，沒說合併在哪一側做、合併後的形狀、欄位要不要改名、增量怎麼驗證。慣例只規定 id 用 `hash`、時間用秒、大小用 bytes，沒規定欄位名稱。A 的列表元件拿到 snake_case，B 的 `lib` 函式吃 camelCase；B 的 schema 讓 A 的增量全被擋掉。另外 `torrents_removed`、`categories_removed`、`full_update: true` 怎麼處理也沒寫，一個 story 處理、一個沒處理，刪掉的種子就留在畫面上。

**建議規則（收緊 AD-6）**：
- 合併只在前端做，由 `src/lib/maindata-merge.ts` 一個純函式負責（處理 `full_update`、`torrents_removed`、`categories_removed`、`server_state` 的部分欄位），vitest 要有這四種情況的測試。
- `['maindata']` 的形狀寫死在 `src/shared/maindata.ts`：`{ rid: number; torrents: Record<string, Torrent>; categories: Record<string, Category>; serverState: ServerState; fetchedAt: number }`。
- `Torrent` 欄位名稱照 qBittorrent 5.1.4 原樣（snake_case），不改名；增量回應用 `.partial()` 的 schema 驗。前端程式只准透過 `src/lib` 的 selector 讀欄位，不在元件裡直接摸原始欄位。
- 需查證：5.1.4 的 maindata 每個種子有沒有帶 `private`。狀態對應表要靠它分「錯誤（私人種子找不到檔案）」和「已整理」，沒有的話會有 story 改去逐顆打 `torrents/properties`，直接違反 AD-6 的精神又不違反字面。要在 AD 裡寫明這個欄位從哪來。

---

## 洞 2：操作後「立刻觸發一次 getMaindata」和 5 秒輪詢打架（高）

**Story A（刪除）**：成功後呼叫 `queryClient.invalidateQueries({ queryKey: ['maindata'] })`。

**Story B（改路徑）**：成功後自己 `await getMaindata({ rid })`，把結果用 merge 函式 `setQueryData` 進 `['maindata']`。理由是「我沒有自己改資料，我是照 qBittorrent 的新資料改」，字面上符合 AD-7。

**為什麼都合規卻不相容**：B 的手動請求和輪詢的請求可能同時用同一個舊 `rid` 出去。假設輪詢帶 rid 10 回來的是 10→12，B 的帶 rid 10 回來的是 10→11，而 B 晚到：較舊的欄位值蓋掉較新的，`rid` 還被倒退回 11。接下來每次輪詢都從 11 開始拿增量，畫面短暫錯亂。A 的 invalidate 會取消正在跑的那次，所以 A 沒事，B 有事；兩個 story 一起上線，bug 只在「改路徑剛好碰上輪詢」時出現，很難重現。

另外，qBittorrent 收到刪除、搬移後不一定在下一次 maindata 就反映（需查證）。刪除淡出 0.2 秒後，那一列可能又回來 5 秒再消失。A 可能加一個「待刪除 hash」集合把列藏起來（沒改 `['maindata']`，合規），B 不加，於是刪除不閃、改路徑會閃。

**建議規則（收緊 AD-7，加一條 AD-12 輪詢）**：
- 只有一個函式能觸發 maindata 更新：`refreshMaindata()`（在前端的資料層），內部用 `invalidateQueries` 並取消進行中的請求。禁止任何 feature 直接呼叫 `getMaindata` 或對 `['maindata']` 用 `setQueryData`（lint 擋 `setQueryData(['maindata']`）。
- 合併函式收到 `rid` 比目前小或相等的回應就丟掉。
- 「操作後到 qBittorrent 反映前」的畫面處理只准走一個共用機制（見洞 9 的 `pendingOps`），規定哪些操作要用（刪除：藏列直到 maindata 的 `torrents_removed` 出現或 15 秒逾時），不准各 feature 自己發明。

---

## 洞 3：同一個 UI 狀態存在不同地方（高）

**Story A（篩選分類）**：目前分類、搜尋關鍵字放 TanStack Router 的 URL search params（`?cat=mteam-tv&q=`），「打開 App 回到上次看的分類」用 localStorage 記 `lastCategory`。

**Story B（登入）**：登入成功要「回到原本的畫面和分類」，B 在登入前把目前分類存進 React context，登入後讀回來，不知道 A 用 URL。

**Story C（詳情）**：「每個分類各記上次看的那個種子」（memlog #59），C 在 `settings.json` 加了一個 `lastViewedByCategory`，用新的小修改函式 `setLastViewed` 寫，每點一列寫一次檔。

**Story D（設定頁）**：「捲動時自動收合其他欄」開關存 `settings.json`；看板 story 從 localStorage 讀同名開關。

**為什麼都合規卻不相容**：AD-8 的 Binds 只列排序記憶、分類順序、常用路徑。上次看的分類、每分類上次看的種子、自動收合開關、已整理欄展開與否、深色模式（底稿說是瀏覽器偏好）沒有主人。AD-8 只禁止「整份覆蓋」，加新欄位和新小函式都合規。結果：手機和電腦的「上次分類」一邊在瀏覽器、一邊可能在 NAS；C 每次點擊都寫檔搶 AD-8 那把鎖，排序寫入跟著變慢；D 的開關在設定頁切了，看板沒反應。

**建議規則（新 AD-13：前端狀態的主人表）**：底稿加一張表，每個 UI 狀態只有一個主人，story 不准自己決定：

| 狀態 | 主人 | 理由 |
| --- | --- | --- |
| 目前分類、搜尋關鍵字、目前看的種子 hash | URL search params（`validateSearch` 用 `src/shared` 的 zod schema） | 登入後回原畫面、重新整理不掉 |
| 每分類記住的排序、分類順序、常用路徑 | `settings.json`（AD-8） | 跨裝置 |
| 上次看的分類 | 要問 Alex：跨裝置（`settings.json`）還是每台各自（localStorage） | EXPERIENCE 沒寫 |
| 每分類上次看的種子 | 記憶體（session 內）或 localStorage，不進 `settings.json` | 寫入太頻繁 |
| 自動收合開關、深色模式 | localStorage，一個 key 表放 `src/lib/prefs.ts` | 只是這台的偏好 |
| 勾選、詳情面板開關、對話框 | 前端記憶體的單一 store（見洞 5） | 不跨頁 |

並規定：`settings.json` 只放「要跨裝置、而且一次操作才寫一次」的東西。

---

## 洞 4：「目前看得到的那串種子」各算各的（高）

**Story A（列表）**：在列表元件裡算「篩選、搜尋、排序、拿掉已整理」，加上「滑鼠停在列表上、有勾選、手機在捲時先不重排」的凍結順序（EXPERIENCE 排序和檢視）。

**Story B（詳情固定頭、前後切換、鍵盤 ↑↓）**：從 `['maindata']` 自己再篩選排序一次，算「第 N 個／共 M 個」和 ‹ › 的上一個、下一個。

**Story C（看板）**：每欄的固定順序（要處理最新出問題的在前等）寫在看板元件裡；詳情在看板模式的「這一欄第 N 個」又由 B 自己算一次。

**為什麼都合規卻不相容**：AD-6 說「都從這份推出來」，三個 story 都是從 `['maindata']` 推的，完全合規。但凍結順序只在 A 裡有，B 用的是即時排序：滑鼠停在列表時按 ↓，跳到的是「即時排序的下一個」而不是畫面上的下一列；N 跟眼睛看到的位置對不上。排序比較函式（51 種）各寫一份，同分時的次序（tie-break）不同，看板和詳情的「第 N 個」也會差一位。「正在看的種子不見了就換成下一個」也需要這串順序，誰算的就誰說了算。

**建議規則（新 AD-14：唯一的可見順序）**：
- `src/lib` 提供 `selectVisibleTorrents(maindata, view)` 純函式，`view` 包含分類、搜尋、排序欄位和方向、看板欄；回傳排好的 hash 陣列。51 種排序的比較函式和 tie-break（同分用 `added_on` 再用 `hash`）只在這裡。
- 凍結順序由一個共用 hook（例如 `useVisibleOrder()`）持有，列表、看板、詳情固定頭、鍵盤、刪除後換下一個，全部用同一份輸出。禁止任何 feature 自己 `sort()` 種子。
- 看板每欄的固定排序也寫在同一個模組，欄位對照用洞 10 的狀態對應函式。

---

## 洞 5：勾選有兩份，順序也不同（中）

**Story A（列表、看板的勾選框）**：勾選存在 `features/list` 裡的 `useState<Set<string>>`，看板自己也有一份。

**Story B（刪除確認）**：清單要「照勾選的先後排，最早勾的在最上面」，B 假設拿到的是有順序的陣列；完成後要「選取清空」，B 去 import `features/list` 的 setter。

**Story C（改路徑多選）**：「一次搬全部選的」，從看板進來時讀的是看板那一份。

**為什麼都合規卻不相容**：底稿沒規定 feature 之間能不能互相 import，也沒有前端共用狀態的位置（分層圖只有 `lib` 純函式、`shared` schema、`server/functions`）。`Set` 在 JS 會保留插入順序，但換分類「清掉」再重建、或用 `new Set([...])` 過濾已刪的時，順序規則看實作。列表和看板各一份時，從列表勾了切到看板（排序換成狀態）選取就不見了。選到的種子被刪掉或被別台搬走時，誰把它從選取裡拿掉也沒寫，選取列的加總會算到不存在的種子。

**建議規則（新 AD-15：前端共用狀態放 `src/state/`）**：
- 分層加一層 `src/state/`：前端共用的 store（勾選、`pendingOps`、詳情開關）。`features/*` 可以 import `state`、`lib`、`shared`；**feature 之間不准互相 import**（lint 用 import 邊界規則擋）。
- 勾選是 `state/selection` 裡的有序 hash 陣列，提供 `toggle`、`clear`、`prune(existingHashes)`；換分類、改搜尋時由 `state` 自己清；每次 maindata 更新後 prune。列表、看板、選取列、刪除、改路徑都讀這一份。

---

## 洞 6：錯誤 `{ code, message }` 怎麼傳、誰處理，各寫一套（高）

**Story A（刪除）**：server function 裡 `throw new AppError('qbit_rejected', ...)`，靠 TanStack Start 把例外序列化，前端在 `useMutation` 的 `onError` 讀 `error.code`。

**Story B（新增）**：server function 成功回傳 `{ ok: false, error: { code, message } }`，前端在 `onSuccess` 裡判斷。

**Story C（列表輪詢）**：收到 `not_logged_in` 時在 queryFn 裡 `navigate('/login')`；A 和 B 各自在自己的 `onError` 也導去登入頁，三個地方行為不同（有的保留目前分類、有的不保留）。

**為什麼都合規卻不相容**：AD-9 規定的是形狀和 code 清單，沒規定傳輸方式（丟例外還是回傳值）、沒規定 `X-Requested-With` 由誰加（Start 的 server function 呼叫不是自己寫 fetch，需查證怎麼加 header）、沒規定哪些 code 由全域處理。`message` 是給人看的中文還是給除錯用的原文也沒寫：A 直接把 qBittorrent 的英文原因放進 toast，B 照 code 對應中文。

**建議規則（收緊 AD-9）**：
- 所有 server function 都用 `src/server/functions/_define.ts` 的一個工廠（例如 `defineAuthedFn({ input, handler })`）建立。工廠內建：檢查 App cookie（AD-2）、zod 驗輸入（AD-5）、30 秒逾時、把例外轉成 `AppError`。失敗一律「丟出」`AppError`，不准用回傳值表示失敗。直接呼叫 `createServerFn` 只准出現在這個檔（lint 擋）。
- 前端只有一個請求出口，負責加 `X-Requested-With`、把 401 和非 JSON 轉成 `cloudflare_expired`（前端專用的 code，加進 AD-9 的表）。
- `not_logged_in`、`qbit_auth_failed`、`cloudflare_expired`、`qbit_unreachable` 只由 QueryCache／MutationCache 的全域 `onError` 處理；feature 只處理 `qbit_rejected`、`timeout`、`invalid_input`、`settings_write_failed`。
- `message` 只給 log 和除錯；畫面文字由 `src/lib/error-text.ts` 依 code 和操作決定，用語照 EXPERIENCE。

---

## 洞 7：多選操作的部分失敗沒有回傳形狀（高）

**Story A（刪除）**：`deleteTorrents({ hashes })` 一次把所有 hash 丟給 qBittorrent 的 `torrents/delete`，成功回 `void`，失敗丟一個 `qbit_rejected`。

**Story B（新增）**：`addTorrents` 逐筆送，回 `{ results: [{ index, ok, code }] }`。

**Story C（改路徑多選）**：`setLocation({ hashes, path })` 一次送，第一個錯就丟例外。

**為什麼都合規卻不相容**：AD-9 只定義「整個呼叫失敗」的形狀。EXPERIENCE 的「多選動作部分失敗」要「3 個刪好了，2 個失敗」、每列寫原因、按鈕變「重試 2 個」，這需要每一筆的結果，三個 story 各發明一種，前端的部分失敗畫面就要寫三份。更糟的是：qBittorrent 的 `torrents/delete` 對不存在的 hash 也回 200（需查證），A 根本拿不到單筆失敗，只能回「全部成功」，跟畫面規格對不上。

**建議規則（新 AD-16：批次操作的結果形狀）**：
- 接受多個 hash 或多筆輸入的 server function，回傳一律是 `{ items: Array<{ key: string; ok: true } | { key: string; ok: false; code: ErrorCode; message: string }> }`，`key` 是 hash（新增是輸入的序號或解析出的 info hash）。整個呼叫只在 `not_logged_in`、`qbit_unreachable`、`qbit_auth_failed`、`invalid_input` 這類「一筆都沒做」時才丟 `AppError`。
- qBittorrent 不回單筆結果的 API（刪除、暫停繼續），server function 送完後要不要再查一次確認、還是直接當成功，寫在這條裡統一決定，不留給 story。

---

## 洞 8：重登 qBittorrent 沒有全域開關，會被封 IP（高）

**Story A（qBittorrent client，AD-4）**：每個請求收到 403 就用環境變數重登一次，失敗回 `qbit_auth_failed`，「不再重試」。

**Story B（列表輪詢）**：`getMaindata` 失敗時 TanStack Query 照預設重試 3 次，然後 5 秒後照常輪詢。檔案分頁另外每 5 秒一次。手機和電腦同時開著。

**為什麼都合規卻不相容**：AD-4 的「重登一次、不再重試」是**每個請求**各一次。容器環境變數的密碼一旦不對（Alex 改了 qBittorrent 密碼還沒改容器），每 5 秒的輪詢、檔案分頁、TanStack 的自動重試、第二台裝置，各自觸發一次重登。qBittorrent 5.1.4 預設同 IP 錯 5 次封 1 小時（memlog），大約半分鐘內容器 IP 就被封，連 VueTorrent 那條退路如果走同一個來源也可能受影響（需查證網路模式）。另外同時有好幾個請求收到 403 時，A 沒寫要排隊，會同時送好幾個登入。

**建議規則（收緊 AD-4）**：
- 重登用單一飛行（single-flight）：同時間只有一個登入請求，其他請求等它的結果。
- 用環境變數登入失敗一次後，容器進入「qBittorrent 帳密錯」的鎖定狀態：之後所有請求直接回 `qbit_auth_failed`，不再碰 qBittorrent 登入 API，直到容器重啟（改環境變數本來就要重啟）。
- 前端收到 `qbit_auth_failed` 或 `not_logged_in` 就停掉 maindata 和檔案輪詢，TanStack Query 對這兩個 code 不重試（`retry` 函式統一寫在 QueryClient 預設值）。

---

## 洞 9：「搬移中」和「真的搬完才出 toast」沒有主人（中）

**Story A（改路徑）**：關對話框前把「hash → 目標路徑」存在改路徑元件的 state，並在元件裡 `useEffect` 盯 maindata，看到 `moving` 結束就跳「已搬到 影集媒體庫　接著改檔名」。對話框一關元件就卸載，盯不到了。

**Story B（詳情狀態區）**：要寫「搬移中 · 正在搬到 /data/media/tv · 」，需要目標路徑，但 maindata 在搬的期間不一定帶新路徑（需查證），B 只好自己 import `features/path` 的 state，或改成只寫「搬移中」。

**為什麼都合規卻不相容**：AD-7 只說不改 `['maindata']`，沒禁止 feature 自己存「進行中的操作」，也沒規定放哪。另外 AD-7 的「立刻觸發一次 getMaindata」很可能拿到還沒進入 `moving` 的狀態，A 如果用「看到不是 moving 就算搬完」判斷，toast 會在搬之前就跳出來。

**建議規則（併入 AD-15 的 `src/state/`）**：
- `state/pending-ops` 是唯一存「已送出、qBittorrent 還沒反映完」的地方，形狀 `Record<hash, { kind: 'move' | 'delete' | 'rename'; target?: string; startedAt: number; sawMoving: boolean }>`。
- 搬完的判斷寫死：先看到 `moving` 再看到離開 `moving`，或 `save_path` 已等於目標；60 秒內沒看到 `moving` 也沒變路徑就當失敗。完成時的 toast 由 `state` 層發，不靠對話框元件活著。
- 詳情、列表第二行、看板卡片都從這裡讀「搬移中」和目標路徑。

---

## 洞 10：狀態對應、位置標籤、路徑比對各寫一份（中）

**Story A（看板）**：照 EXPERIENCE 的狀態對應表寫了 `stateToColumn()` 放在 `features/board`。

**Story B（詳情狀態區、列表第二行）**：另寫 `stateToLabel()`；`missingFiles` 的私人判斷用 `private`，A 用 `tracker` 網域猜。

**Story C（列表位置標籤）**：常用路徑比對用 `savePath.startsWith(p.path)`。

**Story D（改路徑的「目前 N 個」、「已經在清單裡」）**：用 `===` 比對。

**為什麼都合規卻不相容**：慣例說 `src/lib` 放「狀態對應、位置標籤」，但沒說「只能有一份、其他地方禁止自己寫」。C 的 `startsWith` 會讓 `/data/media/tv2` 也被標成「影集媒體庫」並變紫色；D 的 `===` 在路徑多一個結尾斜線時說「不在清單裡」，同一個路徑可以被加兩次。看板說「已整理」的種子，列表可能算成「錯誤」，分類數字（不含已整理）跟看板對不上。

**建議規則（收緊慣例，或寫成 AD）**：
- `src/lib/torrent-status.ts` 一個函式 `classify(torrent) → { status, column, subtitleKind }` 是狀態對應唯一來源，看板欄、狀態用語、顏色、是否已整理、分類計數都用它。
- `src/lib/paths.ts` 提供 `normalizePath()`（去結尾斜線、不改大小寫）和 `matchCommonPath(savePath, commonPaths)`（以資料夾邊界判斷、取最長），位置標籤、媒體庫判斷、「目前 N 個」、「已在清單裡」、`addCommonPath` 去重全部用它。伺服器的 `addCommonPath` 存檔前也要 normalize。
- feature 裡出現 `torrent.state ===` 或 `save_path.startsWith` 就是違規（可用 lint 或 code review 檢查）。

---

## 洞 11：設定檔 schema 各加各的，`version` 互撞，身分用索引（中）

**Story A（排序記憶）**：在 schema 加 `categorySort: Record<string, { field: string; dir: 'asc' | 'desc' }>`，`version` 從 1 改 2，寫 1→2 的遷移。

**Story B（常用路徑）**：同時在另一個分支加 `commonPaths: Array<{ name, path, isLibrary }>`，也把 `version` 從 1 改 2，寫自己的 1→2 遷移。`updateCommonPath(index, patch)`、`removeCommonPath(index)` 用陣列索引。

**Story C（分類順序）**：`categoryOrder: string[]`，用 `z.object().strict()` 讀檔。

**為什麼都合規卻不相容**：AD-8 只說「zod schema 定、帶 version、只能小改」。兩個分支各自 bump 成 2，合併時有兩個意思不同的 v2；C 的 `.strict()` 碰到 A、B 加的欄位整份讀不進來，而 zod 的 `z.object` 預設會把不認得的欄位丟掉，寫回去時就把別人的欄位刪了。B 用索引定位：手機刪掉第 2 個的同時電腦改第 3 個的名字，電腦改到的其實是原本第 4 個，正好是 AD-8 想防的「手機和電腦互相蓋掉」。A 的 `field` 是自由字串，排序 story 存 `seeding_time`、列表 story 讀 `seedingTime`，記住的排序永遠讀不到。

**建議規則（收緊 AD-8）**：
- 第一個碰設定檔的 story（建議排在最前）一次把三個區塊都定好：`{ version: 1, categorySort: {}, categoryOrder: [], commonPaths: [] }`，之後 story 只填內容。改 schema 要改這份底稿，`version` 只在改既有欄位意思時 bump，遷移函式集中在 `src/server/settings/migrations.ts`，一個版本一個函式。
- 讀檔用預設的 strip 模式加 `.default()`，缺的區塊補預設值；不准 `.strict()`。
- 常用路徑以 normalize 後的 `path` 當身分（修改和刪除都帶 path，不帶索引）；改路徑本身就是「刪舊加新」。所有修改函式要冪等（`addCommonPath` 已存在就當成功），因為 `settings_write_failed` 的「重試」可能在上一次其實寫成功後再送一次。
- 排序欄位是 `src/shared/sort-fields.ts` 的列舉（51 個 id 和分組、預設方向），設定檔、排序選單、`selectVisibleTorrents` 共用。

---

## 洞 12：「全部」和「未分類」的 key 會撞（中）

**Story A（排序記憶）**：「全部」的排序存在 `categorySort['']`（因為「全部」沒有分類名）。

**Story B（篩選分類）**：照 qBittorrent 慣例，`category: ''` 是未分類，篩選時 `''` 代表未分類；URL 的 `?cat=` 空字串也是未分類，「全部」用 `cat` 不存在表示。

**為什麼都合規卻不相容**：沒有規定保留字。「全部」的排序和未分類的排序存在同一格；分類順序 `categoryOrder` 裡要不要放「全部」（EXPERIENCE 說固定第一，不能排）也沒定，C 可能存進去，D 讀的時候又在前面加一次，出現兩個「全部」。qBittorrent 有新分類但 `categoryOrder` 裡沒有時，放最後還是照字母，也各寫一套。

**建議規則（併入 AD-8 或 AD-14）**：
- `src/shared/categories.ts` 定義 `ALL = '__all__'`、`UNCATEGORIZED = ''`，設定檔和 URL 一律用這兩個常數。
- `categoryOrder` 不存 `ALL`。顯示順序由一個 lib 函式算：`ALL` 第一，接著 `categoryOrder` 裡還存在的分類，再接著不在清單裡的分類照名稱排序，最後拿掉沒有種子的。

---

## 洞 13：用 GET 做會改東西的 server function，SameSite=Lax 擋不住（高，安全）

**Story A（暫停繼續）**：`createServerFn()` 沒寫 method，`stopTorrents` 用預設方法（需查證：Start 的預設是 GET）。

**Story B（刪除）**：`createServerFn({ method: 'POST' })`。

**為什麼都合規卻不相容**：AD-2 只說 cookie 是 SameSite=Lax，AD-9 只說「前端所有請求帶 `X-Requested-With`」，沒說**伺服器要檢查**這個 header，也沒規定改東西的操作要用 POST。SameSite=Lax 在頂層 GET 導航時會送 cookie。在家用 IP 加 port 的那一側只有 App 登入一道門，只要 Alex 在記住我的 90 天內點到一個別人做的連結，GET 型的改動操作就可能被觸發。A 和 B 各自都合規，安全性卻由「哪個 agent 記得寫 POST」決定。

**建議規則（收緊 AD-2）**：
- 改動 qBittorrent 或設定檔的 server function 一律 `method: 'POST'`，只有讀取（`getMaindata`、檔案清單、讀設定）可以 GET。
- 洞 6 的工廠內建：沒有 `X-Requested-With: XMLHttpRequest` 的請求直接拒絕（回 `not_logged_in` 以外的 code，或 403），當作 CSRF 防線。寫 vitest 測這兩點。

---

## 洞 14：App 登入鎖定的對象不一致（中）

**Story A（登入）**：連錯 5 次鎖 15 分鐘，以請求來源 IP 為單位。從 Tunnel 來的請求來源都是 cloudflared 的位址。

**Story B（部署或之後改登入的人）**：為了分辨外面的人，改讀 `CF-Connecting-IP` header。

**為什麼都合規卻不相容**：AD-3 只說「連錯 5 次鎖 15 分鐘」，沒說鎖誰。A 的做法下，過了 Cloudflare Access 的任何人猜錯 5 次，Alex 在外面也一起被鎖。B 的做法下，家裡區網直接連 port 的請求可以自己帶假的 `CF-Connecting-IP`，每次換一個值就永遠不會被鎖。底稿另外說不寫「分辨請求來自家裡或 Tunnel」的設定，B 等於偷偷做了這件事。

**建議規則（收緊 AD-3）**：鎖定是全域的（不分來源）：整個容器連錯 5 次就鎖 15 分鐘，回 `login_locked` 帶剩餘秒數。只有 Alex 一個人用，全域鎖的代價是偶爾等 15 分鐘，比起被繞過可以接受。禁止讀 `CF-Connecting-IP`、`X-Forwarded-For` 做任何判斷（`X-Forwarded-Proto` 只用來決定 Secure，這是唯一例外）。

---

## 其他查過、程度較輕的面向

這些是中低嚴重度，可以用一句慣例補，不一定要開 AD：

1. **快捷鍵和 `Esc` 搶處理**（中）：列表和看板都註冊全域 `↑` `↓`；搜尋、詳情、對話框都聽 `Esc`，一次按下可能同時清搜尋又關詳情。建議一個 `state/keymap` 註冊表，優先順序：對話框 > 搜尋框 > 詳情面板 > 列表。
2. **qBittorrent 的特殊值**（中）：`eta` 用 8640000 代表無限，`completion_on` 沒完成時可能是 0 或 -1、分享率上限有 -1、-2（需查證）。數字寫法 story 和詳情 story 各自判斷就會一邊寫「沒有」一邊寫「1970/01/01」。建議 `src/lib/format.ts` 是唯一處理特殊值的地方。
3. **info hash 判斷重複**（中）：新增要用 btih 判斷「以前下載過」。磁力連結的 btih 可能是 40 字元 hex 或 32 字元 base32，v2 種子另有 btmh；maindata 的 `hash` 是 hex。建議 `src/lib/info-hash.ts` 一個 `normalizeInfoHash()`，.torrent 的 info hash 在容器解析（不在瀏覽器裝 bencode 套件），回傳 hex。
4. **檔案分頁的 query key**（中）：AD-6 允許檔案分頁例外輪詢，但沒給 key。`setFilePriority` 成功後照 AD-7 只刷新 `['maindata']`，檔案那一列 5 秒後才變，違反「那一列自己變」。建議 key 固定 `['files', hash]`，AD-7 加一句：檔案操作成功後刷新 `['files', hash]`；收到 `qbit_auth_failed` 時一樣停。
5. **「連不到家裡」由誰判斷**（中）：頁首速度膠囊看 `dataUpdatedAt`，提示條看 query error。`getMaindata` 回 `timeout` 算不算「連不到家裡」、`qbit_unreachable`（容器到了但 qBittorrent 沒開，memlog 說規格沒有這格）寫哪一句，沒定。建議一個 `selectConnectionBanner()` 依 EXPERIENCE 的提示條優先順序輸出唯一一句，並補上 `qbit_unreachable` 的文案（問 Alex 或 UX）。
6. **toast 一次一個**（低）：EXPERIENCE 要求新的換掉舊的、失敗帶重試不自動消失。各 story 直接呼叫 sonner 會各自設 duration。建議 `src/lib/toast.ts` 包三種：`info`、`action`、`failure`。
7. **healthcheck**（低）：「先不決定」說加 Docker healthcheck。若有 story 寫一個 server route 去打 qBittorrent 版本，它不是 server function，不受 AD-2、AD-5 管。建議 healthcheck 只回容器自己活著，不碰 qBittorrent，不用登入。
8. **看板「捲到底載入下一批」**（低）：可能有 story 誤以為要分頁向伺服器要資料而新增 `getTorrents({ offset })`，這已經違反 AD-6，不算合規的不相容；但值得在 AD-6 加一句「分批顯示只是畫面虛擬化，資料一次在 `['maindata']`」。

查過、沒找到合規卻不相容例子的面向：白名單閘門本身（AD-5 寫得夠死）、帳密存放（AD-3）、SID cookie 名稱（AD-4）、文字顯示（AD-10）、檔名和函式命名、時間和大小單位、部署與 CI。

---

## 建議新增或收緊的規則總表

| 編號 | 動作 | 內容 | 補哪幾個洞 |
| --- | --- | --- | --- |
| AD-4 | 收緊 | 重登單一飛行；帳密錯一次就鎖到重啟；前端遇到停輪詢、不重試 | 8 |
| AD-2 | 收緊 | 改動一律 POST；伺服器檢查 `X-Requested-With` | 13 |
| AD-3 | 收緊 | 登入鎖定是全域的，不讀來源 IP header | 14 |
| AD-6 | 收緊 | 合併只在前端、一個 merge 函式；`['maindata']` 形狀和欄位名稱寫死；`rid` 倒退就丟；`private` 欄位來源 | 1、2 |
| AD-7 | 收緊 | 只有 `refreshMaindata()` 能觸發；檔案用 `['files', hash]`；待反映的畫面處理只走 `pendingOps` | 2、9、其他 4 |
| AD-8 | 收緊 | 三個區塊一次定好；不准 `.strict()`；常用路徑用 path 當身分；修改冪等；排序欄位列舉；保留 key | 11、12 |
| AD-9 | 收緊 | 工廠建立 server function；失敗一律丟出；單一前端出口；全域處理哪些 code；`message` 不上畫面 | 6 |
| AD-12（新） | 新增 | 輪詢與操作的時序：單一刷新入口、取消進行中、`rid` 單調遞增 | 2 |
| AD-13（新） | 新增 | 前端狀態的主人表（URL、settings.json、localStorage、記憶體） | 3 |
| AD-14（新） | 新增 | 唯一的可見順序 `selectVisibleTorrents` 加凍結 hook；排序比較和 tie-break 只在這裡 | 4、10 |
| AD-15（新） | 新增 | `src/state/` 前端共用狀態層；feature 之間不准互相 import；勾選、`pendingOps`、keymap 放這裡 | 5、9、其他 1 |
| AD-16（新） | 新增 | 批次操作回傳 `{ items: [...] }`；不回單筆結果的 API 怎麼處理寫死 | 7 |
| 慣例 | 收緊 | 狀態對應、路徑比對、特殊值、info hash、toast、連線提示各只有一個 `src/lib` 函式，feature 不准自己寫 | 10、其他 2、3、5、6 |

另外有兩件要問 Alex 的事，不能代決：「上次看的分類」要跨裝置還是每台各自；`qbit_unreachable`（家裡到了但 qBittorrent 沒開）畫面上寫什麼。
