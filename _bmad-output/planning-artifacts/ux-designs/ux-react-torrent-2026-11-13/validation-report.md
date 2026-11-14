# Validation Report：react-torrent

- **DESIGN.md：** `_bmad-output/planning-artifacts/ux-designs/ux-react-torrent-2026-11-13/DESIGN.md`
- **EXPERIENCE.md：** `_bmad-output/planning-artifacts/ux-designs/ux-react-torrent-2026-11-13/EXPERIENCE.md`
- **Run at：** 2026-11-14T21:23:30+08:00
- **合成自：** 4 份審查，原始 finding 共 205 條（rubric 45、consistency 42、memlog-trace 35、drawability 83），合併後 103 條（F1 到 F103）。

## 給 Alex 挑

### A. 照已有決定改字就好（44 條，可以整批同意）

- F3：欄底「還有 N 個」改成「每欄自己捲，捲到底載入下一批」（memlog #48）。改 DESIGN.md Components 的 board-column；EXPERIENCE.md Component Patterns 的 board-column、State Patterns「欄裡卡片太多」。
- F7：選取列補上「改路徑」按鈕（memlog #80）。改 DESIGN.md Components 的 selection-bar；EXPERIENCE.md Component Patterns 的改路徑「用在」、IA 表第 8 張「從哪裡進」。
- F8：儲存位置區塊補上「改檔名」按鈕，跟改路徑並排（memlog #93）。改 DESIGN.md Components 的 save-path-block 和主要按鈕的「用在」。
- F10：自動收合那段刪掉「等 Alex 試」「1.6 秒」「0.66 秒」「以滑鼠下面那張為準」，改成 memlog #56、#57 的最終規則（整段動畫停捲、錨點是欄裡離滑鼠最近的那張）。改 EXPERIENCE.md 待決問題「自動收合的問題」，搬到動態或 Interaction Primitives。
- F12：IA 的「沒有設定畫面」改成「沒有新的設定畫面，沿用原本的設定頁」，補一段設定頁要加的東西（分類順序 #89、自動收合開關 #56）；Q22 那句改成「快捷鍵不能自訂，說明在頁首按鈕打開的視窗」（#101、#53）。改 EXPERIENCE.md Information Architecture、常用路徑和位置標籤、待決問題 Q22。
- F14：頁首補上右上角快捷鍵按鈕，搜尋寫成「平常藏在放大鏡後面，點了或按 / 才打開」（memlog #53）。改 DESIGN.md Layout & Spacing 的頁首；EXPERIENCE.md Information Architecture 的頁首和 Responsive & Platform 的手機頁首。
- F15：4 個旅程的「失敗：還沒決定（Q15）」改成指向 State Patterns 那幾列（memlog #41、#102）。新增失敗另見 F16。改 EXPERIENCE.md Key Flows 旅程 1 到 4。
- F17：寫明「正式稿只畫白底，深藍夜在實作時截圖檢查，必要時多畫一張深藍夜關鍵畫面，算進 15 張」（memlog #37）。改 DESIGN.md Colors 和 Do's and Don'ts；EXPERIENCE.md Foundation。
- F23：劃掉的 Q 條目裡已定案的規格（快捷鍵、搜尋框、分類分頁順序、排序方向預設、打開回到上次分類、變寬欄一排 2 到 3 張）搬到正文，待決問題只留真的沒決定的。改 EXPERIENCE.md 待決問題，搬到 Component Patterns、Interaction Primitives、動態、排序和檢視。
- F24：詳情元件補上「⋯」選單，內容只有暫停／繼續（memlog #88）。位置另見 F25。改 DESIGN.md Components 的 detail-header；EXPERIENCE.md Component Patterns。
- F44：收合後的直條欄和變寬欄的格線，照 Alex 看過說可以的 demo 數值補進去（memlog #49、#50、#57）。改 DESIGN.md Components（新增收合欄元件）和 Layout & Spacing 的看板。
- F46：「9 張畫面」改成 10 張；根目錄「第 10 張以上」改成「第 11 張以上」（memlog #102）。改 EXPERIENCE.md 開頭和 Foundation；根目錄 DESIGN.md 加畫門檻那段。
- F47：狀態用語補「已整理」變 7 種，「比 6 種多」改成「比 7 種多」，錯誤種子的例子改成 error 真正的原因（memlog #87）。改 EXPERIENCE.md Voice and Tone、qBittorrent 狀態對應、State Patterns 的錯誤種子。
- F48：旅程 1 第 3 步的「下載區」改成常用路徑範例的名字「下載區（影集）」（memlog #35、#77）。改 EXPERIENCE.md 旅程 1。
- F49：旅程 1 第 5、6 步改成「先顯示搬移中，搬完跳『接著改檔名』提示，他點提示進改檔名」（memlog #82）。改 EXPERIENCE.md 旅程 1。
- F51：改檔名的集數規則改成「先從原檔名抓集數，抓不到才照順序加」（memlog #94）。改 EXPERIENCE.md Component Patterns 的 rename、旅程 1 第 6 步。
- F56：把 #102「15 條全部確認」是哪 15 條補進 memlog（用 append），讓標「Alex 確認」的列查得到來源。改 .memlog.md（這次沒動，由 Alex 或下一輪做）。
- F58：Q14 不要劃掉，改成「ASSUMPTION，畫畫面時確認」；Q15、Q17、Q18 改成「Alex 確認（2026-11-14）」；從對應表推出來的說法也標 ASSUMPTION（memlog #41、#102）。改 EXPERIENCE.md 待決問題、Voice and Tone、State Patterns。
- F59：Q20 的「範圍待定（Q22）」改成「見 Q22，先不做」（memlog #101）。改 EXPERIENCE.md 待決問題 Q20。
- F60：全域速度合併成一處，手機的寫法從 Q2 搬過來，其他地方只留引用。改 EXPERIENCE.md 全域速度、Component Patterns 的 speed-pill、待決問題 Q2。
- F61：EXPERIENCE.md 散文裡的由來、Alex 原話、統計數字移回 memlog，只留會影響決定的數字。改 EXPERIENCE.md 多處。
- F62：兩份 `sources` 的 `DESIGN.md` 改成 repo 根目錄的路徑，不然會指到 spine 自己。改兩份的 frontmatter。
- F63：根目錄的「taste-log 還沒有原則」補上已記錄的原則 1、2、3（memlog #26、#28、#35、#81）。改根目錄 DESIGN.md 最後一段。
- F64：對比表補 5 組數字：accent-foreground 在 accent 上、selection-bar 的字、狀態色當文字、選中分頁裡的淡色數量、text-muted 在 selection-row。改 DESIGN.md Colors 的對比表。
- F65：detail-header 的前後按鈕、save-path-block 的按鈕加手機 44px 的 token（EXPERIENCE.md 已寫，Alex 確認於 #102）。改 DESIGN.md frontmatter components。
- F66：把已決定行為的元件寫成元件列：搜尋框（#53）、快捷鍵說明視窗（#53）、手機分類清單（#47）、手機狀態分頁、拖檔遮罩、分類分頁 tooltip 顯示快捷鍵數字（#55）。外觀細節見 F16、F31、F32。改兩份的 Components／Component Patterns。
- F67：Responsive 表的「詳情：一直在右邊」拆成「列表：一直在右邊；看板：點了才滑出來」（memlog #58）。改 EXPERIENCE.md Responsive & Platform。
- F68：底部面板補右上角 ✕（手機 44px）和拉到全螢幕的樣子（memlog #64）。改 DESIGN.md Components 的 bottom-sheet。
- F69：新增、刪除確認、改路徑、改檔名在手機用品牌底部面板，不是 shadcn Sheet；手機呈現清單補齊 6 張（第 3、6、7、8、9、10 張）（memlog #63、#64、#92、#102）。改 DESIGN.md Components 的對話框列；EXPERIENCE.md Responsive & Platform。
- F70：根目錄「搜尋放在第 3 張」改成「放在頁首放大鏡，算第 3 張的一部分」；「套用或換分類後回到最上面」改回「套用或換篩選（分類、搜尋）後」（memlog #44、#53）。改根目錄 DESIGN.md 第 25 行；EXPERIENCE.md 排序和檢視。
- F71：demo 照規格改：上傳速度拿掉斜線（#67）、深色淡紫底用新值、排序按鈕高度、第四種陰影。改 .working/demo-board/index.html。
- F72：imports/ 6 張截圖在對應章節各加一行連結和說明。改 EXPERIENCE.md Inspiration & Anti-patterns、全域速度、搜尋；DESIGN.md Brand & Style、詳情固定頭。
- F73：畫布連結旁加一張小表：畫面編號、artboard 名稱、跟 spine 不一樣的地方、哪幾張還沒有畫稿。改 DESIGN.md 開頭或 Components。
- F83：狀態圓圈的「中間白色圖示」改成「中間 `{colors.status-icon}` 圖示」（memlog #39）。改 DESIGN.md Components 的 status-circle。
- F84：Colors 的「舊值 → 新值」變更紀錄移到 memlog，status-archived「用在」欄的對比數字移到對比表；frontmatter「全部取自方向 K」改成「取自方向 K，2026-11-14 依對比調過」。改 DESIGN.md Colors 和 frontmatter。
- F87：元件 `detail-hero` 和字型角色同名，改名或寫明兩者關係。改 DESIGN.md Components 和 Typography。
- F88：旅程裡加一步「按 / 打名字找某一部」。改 EXPERIENCE.md 旅程 3 或 4。
- F89：demo-board 的連結從劃掉的 Q20 搬到動態或看板元件列；A 到 D 的否決連到 directions-1.html。改 EXPERIENCE.md。
- F90：「以這兩份為準」只留一份，另一份改成引用。改 EXPERIENCE.md Foundation 開頭或 DESIGN.md Brand & Style。
- F91：DESIGN.md frontmatter 多出的 status、sources、updated 可以留著，或寫一句說明。改 DESIGN.md frontmatter。
- F92：gates.md 還寫 8 件，改成 7 件（memlog #19）。改 ai-context/core/gates.md（spine 以外，要 Alex 同意才改）。
- F93：旅程 2、3 寫「新種子出現在看板」改成「（假設上次是狀態排序）」（memlog #51 記住上次分類）。改 EXPERIENCE.md 旅程 2、3。
- F94：種子數量註明是不同時間查的（4164 和 4165 混用、分類數 7 和 8），Q21 的分類加總補齊。改 EXPERIENCE.md 待決問題 Q4、Q20、Q21；根目錄 DESIGN.md。
- F96：快捷鍵說明補上看板模式的 ↑ ↓ 和 Esc（memlog #58）。改 EXPERIENCE.md 待決問題 Q20（搬到 Interaction Primitives 時一起改）。

### B. 要 Alex 自己選的設計題目（59 條，依重要性排）

1. F1（critical）「已整理」窄條放哪、收著和展開長怎樣、手機有沒有這一格、名字要不要跟收合的「窄條」分開？擋第 1、2 張的看板。
2. F2（critical）已整理的種子算不算進分類數字、「共 M 個」、全選和選取加總？列表模式要混在裡面、排最後，還是藏起來？擋 X 和「全部」兩個分類的第 1、2 張。
3. F4（critical）登入畫面放哪些東西、錯誤怎麼寫、要不要記住登入、用到一半過期時開著的對話框怎麼辦？擋第 10 張，也擋旅程 5。
4. F5（critical）詳情的檔案、追蹤者、用戶分頁各要看什麼、能做什麼，不做的功能要明寫嗎？擋第 4、5 張的分頁內容。
5. F18（high）一張「畫面」包含哪些尺寸、模式、狀態？第 3 張要畫排序選單、搜尋、手機分類清單哪幾個？擋全部 10 張的工作量和 15 張額度。
6. F6（high）看板卡片要不要狀態圓圈、多大？擋第 1、2 張和驚艷的進度環動畫在看板上轉什麼。
7. F29（high）看板每一欄裡的卡片照什麼順序排？擋第 1、2 張每欄第一張是誰。
8. F30（high）確認 qBittorrent 狀態對應表：已停止的種子算「已完成」還是「已暫停」、完成欄第二行要不要帶時間、mteam-X 的 43 個要不要紅色？擋第 1、2 張的欄位內容和卡片第二行。
9. F20（high）速度膠囊的警告色、提示條、改檔名的「抓到的」「猜的」「撞名」各用哪個色彩角色，提示條長怎樣？擋第 1、2 張的頂端和第 9 張。
10. F19（high）shadcn 的 accent、muted、ring、popover、background 各對到哪個品牌角色？擋所有選單、對話框的 hover 和深色模式。
11. F13（high）頁首完整的按鈕清單和順序：設定從哪裡進、手機要不要快捷鍵按鈕和設定入口、設定頁和快捷鍵說明視窗要不要畫、算不算 15 張？擋第 1、2 張的頁首。
12. F36（high）分類分頁加排序按鈕在 1024px 放不下時怎麼辦？擋第 1 張。
13. F32（high）手機頂端由上到下怎麼排、狀態分頁每格放什麼、分類清單每列放什麼？擋第 2 張。
14. F22（high）「這個分類記住的」什麼時候顯示（一直、切分類後、跟上次不同時）？擋第 1、2、3 張的排序按鈕。
15. F21（high）排序方向只用名稱旁的小箭頭（#73），還是也寫成字「久的在前」？箭頭在按鈕上還是選單項目上？擋第 1、3 張。
16. F33（high）排序選單的「更多」（49 個、10 組）怎麼展開，手機用什麼呈現？擋第 3 張。
17. F31（high）搜尋打開後電腦和手機各長怎樣、只找目前分類還是全部、0 筆時寫什麼、換分類時關鍵字留不留？擋第 3 張。
18. F11（high）自動收合的門檻選哪個（「大約一個螢幕高」或 demo 的其他選項）？擋第 1 張的捲動行為。
19. F34（high）列表右邊大數字和全 App 的數字寫法：日期相對還是絕對、何時換 TB、速度 0 寫什麼？擋第 1、2 張的列表模式。
20. F35（high）鍵盤焦點和「詳情正在看」的內框要不要長得不一樣，其他元件的焦點長怎樣？擋第 1 張和所有可以按的元件。
21. F26（high）要不要有「全選」、放哪、範圍是整個篩選還是一欄（「連檔案一起刪」預設打勾）？這條 memlog 沒有來源。擋第 1、2、7 張。
22. F9（high）選取列多的「改路徑」和儲存位置區塊多的「改檔名」放哪、什麼樣子，手機一排放不下怎麼排？擋第 1、4、5 張。
23. F38（high）詳情由上到下的區塊順序，哪些固定、哪些在概覽分頁裡？擋第 4、5 張。
24. F39（high）每種狀態的詳情大字和摘要寫什麼（目前只有兩個例子）？擋第 4、5 張。
25. F27（high）看板模式滑出來的詳情面板多寬、有沒有陰影或遮罩、窄的時候怎麼排？擋第 4 張的看板模式。
26. F28（high）看板模式下「第 N 個／共 M 個」和 ‹ › 的範圍是一欄還是整個分類？擋第 4、5 張。
27. F25（high）詳情固定頭的「⋯」放哪，手機固定頭放不下時分兩排還是搬走哪個？擋第 4、5 張。
28. F43（high）手機底部面板一打開多高、把手和 ✕ 怎麼擺、全螢幕時頂端留多少？擋第 5 張。
29. F37（high）手機「點名稱展開全名」只在詳情有效，還是列表和卡片也要？展開後怎麼推？擋第 2、5 張。
30. F16（high）新增種子：錯誤（格式錯、重複、壞檔、不是 .torrent）出現在哪、送出中和成功的樣子、預設分類、其他 qBittorrent 選項做不做、「以前下載過」提示做不做、新增後要不要跳到那個分類？擋第 6 張和旅程 2。
31. F40（high）改檔名格式：season 數字補不補 0、`<其他>` 留哪段、資料夾一起建嗎、劇名要預填嗎、非影集要不要能單一改名？擋第 9 張。
32. F41（high）改檔名預覽一列怎麼排、對話框多寬、改集數用什麼控制、字幕和不動的檔案列不列？擋第 9 張。
33. F42（high）網路慢時按鈕「送出中」「不能按」的樣子，要不要提示「最後更新 20 秒前」？擋所有有動作的畫面。
34. F52（medium）詳情三個數字裡「最後有人抓」memlog 找不到來源，三個數字固定還是依狀態換？擋第 4、5 張。
35. F53（medium）正在看的種子被刪、搬走或被篩掉，以及空分類時，詳情顯示什麼？擋第 4 張和第 7 張之後的畫面。
36. F45（medium）看板捲到底載入下一批時長怎樣（demo 是「載入中…」）？擋第 1、2 張的捲動狀態。
37. F55（medium）資料一直更新時，滑鼠停在列表上或有勾選時要不要暫停重排？擋第 1 張的列表模式。
38. F57（medium）排分享率時，列表那一欄固定的「分享率」要不要換掉？這一欄 memlog 也沒來源。擋第 1 張。
39. F74（medium）列和卡片的勾選框出現在哪個角？擋第 1、2 張。
40. F75（medium）列、卡片、分頁、膠囊按鈕的 hover 和不能按的樣子？擋第 1 張和各對話框。
41. F76（medium）手機列表列第二行放不下時先砍哪個？擋第 2 張。
42. F77（medium）手機選取模式：長按的回饋、全選在哪、怎麼離開？擋第 2 張。
43. F78（medium）長路徑從後面切還是中間切，手機怎麼看完整路徑？擋第 4、5 張。
44. F50（medium）「接著改檔名」提示在送出後還是搬完後出現、寫路徑還是常用路徑名字，批次時「目前路徑」寫什麼？擋第 8 張。
45. F79（medium）刪除確認：取消勾「連檔案一起刪」後按鈕寫什麼、標題、取消按鈕位置、寬度、刪除中和刪完、一次刪幾千個時怎麼寫？擋第 7 張。
46. F54（medium）多選動作部分失敗時怎麼顯示？擋第 7、8 張的結果。
47. F82（medium）刪除、新增、改路徑、改檔名成功後要不要提示？擋第 6 到 9 張的結尾。
48. F80（medium）toast 放哪、跟選取列疊在一起時怎麼辦、帶按鈕的停多久？擋全部有 toast 的畫面。
49. F81（medium）舊資料變淡多淡，連不到家裡、Cloudflare 過期、防火牆同時發生時先寫哪個？擋第 2 張的速度那一行。
50. F85（low）深色模式的位置標籤有沒有淡紫底（現在深淺同值）？擋深色截圖檢查。
51. F86（low）媒體庫標籤的粗細、各字型角色的行高要不要寫值？擋第 1、4 張的細節。
52. F95（low）根目錄的衝突順序裡「品牌規範」指什麼，要不要拿掉？不擋畫面，但會影響實作時的配色判斷。
53. F97（low）快捷鍵 1 到 8 超過 8 個分頁時怎麼辦？不擋畫面。
54. F98（low）自動收合在手機和平板要不要有？不擋畫面。
55. F99（low）「更多」排序裡已經砍掉的欄位（暫存路徑、標籤）要不要拿掉？擋第 3 張的選單內容。
56. F100（low）「刪除確認被關掉等於不刪」memlog 沒有來源，要留嗎？不擋畫面。
57. F101（low）「方向探索 A 到 K 不算 15 張」只有 directions-1 有 Alex 的話，K 和 demo 算不算？擋 15 張額度的算法。
58. F102（low）手機看板一排放幾張卡片？擋第 2 張。
59. F103（low）手動改路徑會關掉那個種子的自動管理，要不要在畫面上提示？要先在架構階段確認 qBittorrent 的行為。擋第 8 張。

A 類 44 條，B 類 59 條。

## Overall verdict

顏色 token 很完整：每個角色都有淺色、深色兩個 hex，DESIGN.md 的 39 個 `{token}` 引用和 EXPERIENCE.md 的 4 個全部對得到。兩份的元件表也是同一組 25 個名字。最大的問題在 EXPERIENCE.md：很多已經定案的規格（自動收合、快捷鍵、搜尋框、分頁順序）只寫在劃了刪除線的「待決問題」裡，其中自動收合那段還留著舊數字。另外，登入畫面、「已整理」窄條、設定頁三個東西有決定卻沒有規格。畫 10 張畫面之前，先把這幾塊搬到正確的章節，再補齊。（取自 rubric 審查）

另外 3 份審查讓情況更清楚。consistency 和 memlog-trace 都指出問題出在位置：memlog 要追溯的 72 筆裡 49 筆有寫進去、14 筆寫了但跟決定不同、6 筆部分沒寫，多半是後來的決定只進了 Q 區，DESIGN.md 的元件和版面沒跟上（選取列、儲存位置區塊、看板欄、頁首）。drawability 從「明天要畫」的角度找到 4 個 blocker：「已整理」窄條放哪、「已整理」算不算進數字、登入畫面、詳情三個分頁，另外手機頂端和詳情固定頭在 358px 寬放不下。所以 A 類（照已有決定改字）可以先整批改，B 類裡前 5 題不定，第 1、2、4、5、10 張都畫不出來。

## Category verdicts

- Flow coverage：adequate
- Token completeness：adequate
- Component coverage：thin
- State coverage：adequate
- Visual reference coverage：thin
- Bloat & overspecification：thin
- Inheritance discipline：adequate
- Shape fit：adequate

## 合併方式

- 4 份審查的原始數量：rubric（critical 0、high 11、medium 19、low 15）、consistency（critical 1、high 7、medium 19、low 15）、memlog-trace（critical 1、high 6、medium 13、low 15）、drawability（blocker 4、high 34、medium 39、low 6）。
- drawability 的 blocker 算成 critical。合併後嚴重度取各份裡最高的。
- 每條後面列出提到它的審查。4 份都提到的有 F1、F6、F7、F8、F12、F14、F15、F20、F21、F22、F24、F30、F46、F47、F48，共 15 條。
- memlog 編號一律用 `#n`（memlog-trace 的寫法，`#n` 在 `.memlog.md` 第 n+5 行）。consistency 和 drawability 寫的是行號，例如「memlog L56」等於 #51，這裡都換算過。

## Findings by severity

### Critical（5）

**F1｜Component coverage｜rubric、consistency、memlog、drawability（4 份）｜B**：「已整理」窄條只有一句話，版面和元件都還是 4 欄（EXPERIENCE.md qBittorrent 狀態對應、IA、Component Patterns 的 board-column；DESIGN.md Layout & Spacing 的看板）
已整理約 3737 個，大約是全部種子的九成，只有狀態對應表和 Q21 寫「看板最後一條窄條，平常收著，點了展開」。沒寫它是第 5 欄、看板下面的橫條還是別的；展開後怎麼排；手機狀態分頁有沒有這一格；跟自動收合的「窄條」同名容易搞混。consistency 判 critical、drawability 判 blocker。
Fix：請 Alex 選位置和展開後的樣子，兩份各加一個元件（收著、展開兩種狀態），手機寫清楚入口，換一個不撞名的名字。

**F2｜Component coverage｜rubric、drawability（2 份）｜B**：已整理算不算進數字和列表（EXPERIENCE.md qBittorrent 狀態對應、排序和檢視）
X 分類 3631 個裡 3551 個是已整理。分類分頁數字、「共 M 個」、全選、選取列加總、刪除確認的大小要不要包含它們？列表模式（排做種時間、加入時間）時它們混在裡面、排最後，還是藏起來？drawability 判 blocker。
Fix：請 Alex 決定後寫進排序和檢視和狀態對應表。

**F3｜Consistency｜consistency、memlog、drawability（3 份）｜A**：欄底「還有 N 個」是 Alex 沒選的做法（DESIGN.md Components board-column；EXPERIENCE.md Component Patterns board-column、State Patterns「欄裡卡片太多」）
memlog #48 Alex 選的是每欄自己捲、一直載入，正確寫法只在 Q20。照元件表畫看板會畫錯。memlog-trace 判 critical。
Fix：三處改成「每欄自己捲，捲到底載入下一批」。載入中的樣子見 F45。

**F4｜Component coverage｜rubric、consistency、drawability（3 份）｜B**：登入畫面（第 10 張）沒有元件、版面、狀態，也沒有旅程（EXPERIENCE.md IA 表、State Patterns；DESIGN.md Components）
只有一句「要有新的登入畫面，不沿用現有的」。沒寫放哪些欄位、錯誤（帳密錯、試太多次被暫時封鎖、連不到 qBittorrent、送出中）、何時出現、登入後回哪裡、跟 Cloudflare 過期怎麼區分。drawability 判 blocker。
Fix：請 Alex 選內容，兩份各加 login 列，State Patterns 加狀態，Key Flows 加旅程 5。

**F5｜State coverage｜rubric、drawability（2 份）｜B**：詳情的檔案、追蹤者、用戶分頁沒有內容規格（EXPERIENCE.md Component Patterns 詳情分頁）
只有分頁名字和「換分頁時固定頭不動」。檔案分頁要不要樹狀、顯示大小和進度、能不能勾選或改優先順序都沒寫；三個分頁的載入中、讀不到、空的狀態也沒有。drawability 判 blocker。
Fix：請 Alex 選每個分頁要看什麼、能做什麼，不做的明寫不做；State Patterns 補分頁的狀態。

### High（38）

**F6｜Component coverage｜rubric、consistency、memlog、drawability（4 份）｜B**：看板卡片上有沒有狀態圓圈，前後說法不一（DESIGN.md Components board-card、status-circle；EXPERIENCE.md status-circle「用在」、動態、旅程 2、3）
元件表的卡片沒有圓圈，但旅程 2 高潮「圓圈的進度環開始走」、旅程 3「看圓圈和第二行」、驚艷動畫都假設有。demo 加了 32px 圓圈，memlog #51 寫明「not in K」。卡片沒圓圈的話，看板上唯一的圓圈是欄標題，外圈是滿的，沒東西可轉。
Fix：請 Alex 選，再同步兩張元件表、旅程和動態。

**F7｜Component coverage｜rubric、consistency、memlog、drawability（4 份）｜A**：選取列少了「改路徑」（DESIGN.md Components selection-bar）
memlog #80 Alex 選了選取列有改路徑，EXPERIENCE.md 有寫，DESIGN.md 只有「已選 N 個、共 X GB、取消、刪除（含檔案）」。EXPERIENCE.md 改路徑的「用在」和 IA 第 8 張也只寫詳情。
Fix：三處補上。按鈕位置和樣子見 F9。

**F8｜Component coverage｜rubric、consistency、memlog、drawability（4 份）｜A**：儲存位置區塊少了「改檔名」（DESIGN.md Components save-path-block）
memlog #93 Alex 選了改檔名跟改路徑並排，DESIGN.md 只寫三顆。
Fix：補成四顆，主要按鈕的「用在」一起更新。樣子和手機排法見 F9。

**F9｜Consistency｜consistency、memlog、drawability（3 份）｜B**：多出來的兩顆按鈕放哪、長怎樣，手機放不下（DESIGN.md selection-bar、save-path-block）
選取列的改路徑在取消和刪除之間的哪裡、什麼底色；改檔名是不是也實心。四顆 34px 膠囊在詳情面板放不放得下要重算；手機 358px 寬放大到 44px 後兩處都排不下一排。
Fix：請 Alex 選位置、樣子和手機排法。

**F10｜Inheritance discipline｜rubric、consistency、memlog（3 份）｜A**：自動收合那段混著舊數字和「等 Alex 試」（EXPERIENCE.md 待決問題「自動收合的問題」）
還寫「demo 的修法（等 Alex 試）」「閃 2px 框 1.6 秒」「停住捲動約 0.66 秒」「以滑鼠下面那張為準」「另加一開始捲就收合的選項」。memlog #54、#56、#57 已改成整段動畫停捲、錨點是欄裡離滑鼠最近的那張（沒有就第一張完整看得到的）、框先出現，Alex 已核准。
Fix：照 #56、#57 重寫成一張規則表，搬出 Q 區。門檻見 F11。

**F11｜Inheritance discipline｜rubric、memlog（2 份）｜B**：自動收合的門檻沒定（EXPERIENCE.md 待決問題 Q20）
Q20 寫「大約一個螢幕高」，demo 有 0.15、0.5、1、1.5 四種，#57 只核可速度和畫面。
Fix：請 Alex 選一個寫進規則表。

**F12｜Inheritance discipline｜rubric、consistency、memlog、drawability（4 份）｜A**：「沒有設定畫面」跟三個放進原本設定頁的決定打架（EXPERIENCE.md Information Architecture、常用路徑和位置標籤、待決問題 Q3、Q22）
#35 說的是不加新的設定畫面。後來 #56 把自動收合開關、#89 把分類分頁順序放進原本的設定頁；Q22 又寫「設定頁只放快捷鍵說明」，但快捷鍵說明是頁首按鈕打開的視窗（#53），#101 只決定自訂快捷鍵先不做。
Fix：IA 改成「沒有新的設定畫面，沿用原本的設定頁」，補一段設定頁要加的東西，改正 Q22 那句。入口見 F13。

**F13｜Consistency｜consistency、drawability（2 份）｜B**：頁首完整清單和設定入口沒定（DESIGN.md Layout & Spacing 頁首；EXPERIENCE.md IA、Responsive & Platform）
demo 有一顆設定齒輪，memlog 沒決定設定入口；手機要不要快捷鍵按鈕、要不要設定入口沒寫；設定頁和快捷鍵說明視窗要不要畫、算不算 15 張也沒寫。
Fix：請 Alex 選，DESIGN.md 列出電腦和手機的頁首按鈕和順序。

**F14｜Component coverage｜rubric、consistency、memlog、drawability（4 份）｜A**：頁首漏了快捷鍵按鈕，搜尋寫成一直在（DESIGN.md Layout & Spacing；EXPERIENCE.md IA、Responsive & Platform）
#53：搜尋平常藏在放大鏡後面，點了或按 / 才打開；右上角加快捷鍵按鈕（Alex 加的）。頁首描述都還是「標題、全域速度、搜尋、新增」。
Fix：頁首描述補上。元件列見 F66。

**F15｜Flow coverage｜rubric、consistency、memlog、drawability（4 份）｜A**：4 個旅程的失敗路徑還寫「還沒決定（Q15）」（EXPERIENCE.md Key Flows 旅程 1 到 4）
Q15 已由 #102 確認，State Patterns 有寫失敗用 toast 加重試、對話框不關，和連不到家裡的提示條。例外：新增失敗 State Patterns 真的沒有（見 F16）。
Fix：旅程 1、3、4 改成指向 State Patterns 那一列。

**F16｜State coverage｜rubric、consistency、drawability（3 份）｜B**：新增種子沒有錯誤狀態，送出、成功和選項細節也沒寫（EXPERIENCE.md State Patterns、Component Patterns 新增、旅程 2）
磁力連結格式錯、種子已經在清單裡、.torrent 壞了、拖進來的不是 .torrent，出現在欄位旁還是 toast。送出中、成功後的樣子；預設分類；多個檔案共用分類嗎；其他 qBittorrent 選項做不做；拖檔遮罩的樣子和手機不做拖放；Q21 的「以前下載過」點子做不做；新增後要不要跳到那個分類（不然旅程 2 的高潮看不到）。
Fix：請 Alex 選，State Patterns 補這幾列，旅程 2 的失敗路徑接上。

**F17｜Consistency｜consistency、memlog、drawability（3 份）｜A**：「每張畫面兩種模式各看一次」可能讓正式稿畫成 20 張（DESIGN.md Colors、Do's and Don'ts）
memlog #37：為了守 15 張上限，正式稿畫白底，深藍夜在實作時截圖檢查，必要時加一張深藍夜關鍵畫面。規格沒寫這段。
Fix：DESIGN.md 兩處和 EXPERIENCE.md Foundation 補這句。

**F18｜Drawability｜drawability（1 份）｜B**：15 張額度怎麼算沒寫清楚（根目錄 DESIGN.md；EXPERIENCE.md Foundation）
10 張乘電腦、手機，第 1、2 張還有看板和列表兩種模式，加上空、載入、出錯。第 3 張不是獨立頁面，要畫排序選單、搜尋、手機分類清單哪幾個也沒寫。
Fix：請 Alex 定一張「畫面」包含哪些尺寸、模式、狀態，寫進根目錄 DESIGN.md。

**F19｜Token completeness｜rubric、drawability（2 份）｜B**：沒寫品牌角色怎麼對到 shadcn 變數，accent 撞名（DESIGN.md frontmatter 開頭說明）
品牌的 accent 是淺色模式的黑色主要動作，shadcn 的 accent 是選單 hover 淡底和 Skeleton 底色，照名字對會讓選單 hover 和骨架變整塊黑。shadcn zinc 的深色是近黑灰，不是深藍夜，Dialog、Sheet、選單在深色模式會跟頁面不同色。
Fix：請 Alex 定 background、card、popover、muted、primary、accent、ring、destructive 各對到哪個角色，加一張淺色、深色兩欄的對照表。

**F20｜Token completeness｜rubric、consistency、memlog、drawability（4 份）｜B**：散文用到的顏色沒有色彩角色，提示條沒有元件（EXPERIENCE.md speed-pill、State Patterns、待決問題 Q12；DESIGN.md Colors、Do's and Don'ts）
速度膠囊出問題「變橘色」、連不到家裡和 Cloudflare 過期的提示條、改檔名預覽「抓到的」「猜的」兩種顏色、撞名「列變紅」。DESIGN.md 規定不能加角色以外的顏色，現在沒有「警告」角色。memlog-trace 寫明要問 Alex。
Fix：請 Alex 選每一個對到哪個角色（或新增），補深色值和對比；DESIGN.md 加提示條元件。

**F21｜Component coverage｜rubric、consistency、memlog、drawability（4 份）｜B**：排序方向用箭頭還是用字（DESIGN.md Components sort-pill；EXPERIENCE.md Voice and Tone、旅程 4）
#73 定了「排序名稱旁一個小箭頭可以反過來」，DESIGN.md sort-pill 沒有箭頭；Voice 和旅程 4 又寫成字「做種時間，久的在前」。demo 的排法又不一樣（demo 不算數）。
Fix：請 Alex 選方向要不要也寫成字、箭頭在按鈕上還是選單項目上，再統一 sort-pill、Voice 和旅程。

**F22｜Inheritance discipline｜rubric、consistency、memlog、drawability（4 份）｜B**：「這個分類記住的」什麼時候顯示（EXPERIENCE.md sort-pill；根目錄 DESIGN.md「還沒決定的事」）
根目錄還列著「排序被記住時要不要提示」；方向 K（#31）的排序按鈕已經寫出這幾個字，EXPERIENCE.md 寫「一直寫出」。drawability 指出一直寫的話，剛手動選完的排序也寫「記住的」，等於沒資訊；memlog 沒定什麼時候顯示。
Fix：請 Alex 選顯示時機，根目錄那條改成已決定。

**F23｜Bloat & overspecification｜rubric、consistency、memlog（3 份）｜A**：定案的規格只寫在劃掉的 Q 條目裡（EXPERIENCE.md 待決問題）
看板自動收合、全部快捷鍵、搜尋框點了才出現、分類分頁順序、排序方向預設、打開回到上次分類、變寬欄一排 2 到 3 張。22 條裡 20 條已劃掉，章節名跟內容不符，寫程式的人看到刪除線可能整段跳過。
Fix：搬到 Component Patterns、Interaction Primitives、動態、排序和檢視，待決問題只留真的沒決定的。

**F24｜Component coverage｜rubric、consistency、memlog、drawability（4 份）｜A**：詳情的「⋯」選單（暫停／繼續）不在元件表（DESIGN.md detail-header；EXPERIENCE.md Component Patterns）
#88：暫停／繼續收在詳情「⋯」選單，「重新找來源」不做。只寫在根目錄和 Q19。
Fix：元件表補上，選單只有暫停／繼續。位置見 F25。

**F25｜Drawability｜drawability（1 份）｜B**：詳情固定頭在手機放不下，「⋯」位置沒定（DESIGN.md detail-header）
要放名稱、‹、「第 12 個／共 3,631 個」、›（手機 44px）、✕、「⋯」，358px 扣掉三四顆 44px 按鈕，名稱只剩很少。
Fix：請 Alex 選「⋯」位置，手機固定頭分兩排還是搬走哪個。

**F26｜Consistency｜consistency、memlog、drawability（3 份）｜B**：「全選」memlog 沒有來源，位置和範圍也沒寫（EXPERIENCE.md checkbox、Interaction Primitives）
規格寫列表頂端有全選，只選目前篩選後的列表。「連檔案一起刪」預設打勾（#38），在 X 分類全選就是 3631 個連檔案。DESIGN.md 沒有表頭；看板模式和手機的全選沒寫。memlog-trace 判 high。
Fix：請 Alex 選要不要、放哪、範圍。

**F27｜Component coverage｜rubric、consistency、drawability（3 份）｜B**：看板模式蓋上來的詳情面板沒有樣子（DESIGN.md detail-panel、Elevation & Depth）
#58：看板點卡片時詳情從右邊滑出來蓋住最右邊那欄。DESIGN.md 只有列表模式的固定面板（約 660px 寬）；蓋上去大約只有 300px，三張數字小卡、四顆按鈕、28px 狀態大字怎麼排沒寫；陰影只有三種，蓋上去要不要陰影或遮罩也沒寫。
Fix：請 Alex 選寬度和陰影或遮罩，補窄版排法。

**F28｜Consistency｜consistency、drawability（2 份）｜B**：看板模式下「第 N 個／共 M 個」和 ‹ › 怎麼算（EXPERIENCE.md detail-header、Interaction Primitives）
#58 說看板模式 ↑ ↓ 只換同一欄。M 是這一欄還是整個分類？‹ › 到欄底會不會跳到下一欄？
Fix：請 Alex 選，寫進 detail-header。

**F29｜Consistency｜consistency、drawability（2 份）｜B**：看板每一欄裡的卡片順序沒寫（EXPERIENCE.md 排序和檢視）
規格只寫看板不在欄裡排序；demo 自己訂了做種中欄照做種天數排，其他照資料原本的順序。旅程 3 要找昨晚加的那部，順序決定第一張是誰。
Fix：請 Alex 選每欄的固定順序。

**F30｜State coverage｜rubric、consistency、memlog、drawability（4 份）｜B**：qBittorrent 狀態對應表還是 ASSUMPTION，有幾處要 Alex 確認（EXPERIENCE.md qBittorrent 狀態對應；DESIGN.md status-error）
已停止的種子（203 個）歸「已完成」，但「暫停／繼續」就是為它們加的，結果已完成的種子「⋯」裡有「繼續」。完成欄第二行要不要帶時間（旅程 3 寫「今天 09:12 下載好了」，表裡只有「下載好了」，demo 又是「完成於 11/14」）。mteam-X 的 43 個照規則會變紅，Alex 還沒確認，只寫在劃掉的 Q21，DESIGN.md 卻寫成規則。
Fix：請 Alex 確認整張表，表裡寫成完整範例，其他地方照它。

**F31｜State coverage｜rubric、drawability（2 份）｜B**：搜尋打開後的樣子、範圍、0 筆都沒寫（EXPERIENCE.md 待決問題 Q20、State Patterns）
電腦是按鈕變長還是蓋住頁首；手機是蓋住標題列嗎；只找目前分類還是全部；0 筆時寫什麼；看板各欄都空時怎麼辦；「共 M 個」跟不跟著變；換分類時關鍵字留不留。
Fix：請 Alex 選，State Patterns 加「搜尋沒結果」。

**F32｜Drawability｜drawability（1 份）｜B**：手機頂端放不下（DESIGN.md Layout & Spacing 手機；EXPERIENCE.md Responsive & Platform）
標題、搜尋、新增（44px）、速度、分類名 ▾、排序按鈕、狀態分頁，哪些同一排沒寫。4 個狀態分頁（加已整理就 5 個）每格不到 72px。手機分類清單每列有沒有數量、目前分類怎麼標、空分類藏不藏也沒寫。
Fix：請 Alex 選排法和每格放什麼，排序按鈕在手機可以省哪幾個字。

**F33｜Consistency｜consistency、drawability（2 份）｜B**：排序選單「更多」怎麼展開，手機怎麼呈現（DESIGN.md Components sort-menu；EXPERIENCE.md Responsive & Platform）
只寫沿用 shadcn DropdownMenu。49 個、10 組用子選單還是展開；方向、選中標記、快捷鍵數字要不要顯示；手機裝 54 項很難點。根目錄要求第 3 張寫手機怎麼呈現。
Fix：請 Alex 選，補進 sort-menu。

**F34｜Drawability｜drawability（1 份）｜B**：列表右邊大數字和全 App 的數字寫法只有零星例子（DESIGN.md list-row；EXPERIENCE.md 排序和檢視）
53 種排序只給「41 天」「3.12」「media/tv」。日期相對還是絕對、GB 何時換 TB、速度 0 寫什麼、千分位、太長怎麼切、整欄要不要對齊。
Fix：請 Alex 定寫法，補一張「排序欄位 → 大數字寫法」表和一節「數字寫法」。

**F35｜Drawability｜drawability（1 份）｜B**：鍵盤焦點跟「詳情正在看」長得一樣，其他元件沒有焦點樣子（DESIGN.md list-row）
兩者都是 2px accent 內框，Tab 走到別列時分不出來。分類分頁、排序按鈕、卡片、窄條、勾選框、對話框按鈕都沒寫焦點。
Fix：請 Alex 選兩者要不要不一樣，補一條全域焦點規則含深色。

**F36｜Drawability｜drawability（1 份）｜B**：分類分頁加排序按鈕在 1024px 放不下（DESIGN.md Layout & Spacing）
7 個分頁加「看板｜排序：狀態（這個分類記住的）▾」，切換點 1024px 一定擠。
Fix：請 Alex 選捲動、折行、收進更多，或排序按鈕換排。

**F37｜Drawability｜drawability（1 份）｜B**：手機「點名稱展開全名」跟「點列打開詳情」打架（EXPERIENCE.md 設計要求 3、State Patterns）
範圍寫「全部」，但列和卡片點了是開底部面板。展開後下面內容往下推還是浮在上面也沒寫。
Fix：請 Alex 選範圍和展開樣子。

**F38｜Drawability｜drawability（1 份）｜B**：詳情由上到下的區塊順序沒寫（DESIGN.md Components；EXPERIENCE.md Component Patterns）
狀態區和數字小卡在分頁上面還是概覽裡；儲存位置區塊在概覽裡嗎；概覽還放什麼。
Fix：請 Alex 選，標出哪些跟著分頁換。

**F39｜Drawability｜drawability（1 份）｜B**：狀態大字只有兩個例子（DESIGN.md detail-hero）
只有「做種 41 天」「停滯　87%」。下載中、已暫停、已完成、錯誤、已整理、抓種子資訊中、排隊中、檢查檔案中、搬移中都沒寫。
Fix：請 Alex 定，補一張「狀態 → 大字 → 摘要」表。

**F40｜Drawability｜drawability（1 份）｜B**：改檔名的目標格式有五處不清楚（EXPERIENCE.md Component Patterns rename）
season 數字補不補 0、`<其他>` 保留哪段、資料夾一起建嗎、劇名要不要從種子名稱預填、季數預設多少；非影集的種子按改檔名看到什麼，要不要能單一改名。
Fix：請 Alex 選，寫進 rename。

**F41｜Drawability｜drawability（1 份）｜B**：改檔名預覽一列放不下（EXPERIENCE.md rename；DESIGN.md 對話框）
原檔名、新檔名、集數左右並排還是上下兩行；shadcn Dialog 預設寬度很窄；改單一集數用輸入框還是點了才變；字幕和不動的檔案在預覽裡列不列；手機怎麼排。
Fix：請 Alex 選，補預覽列內容和對話框寬度。

**F42｜Drawability｜drawability（1 份）｜B**：網路慢沒有狀態（EXPERIENCE.md State Patterns）
有「連不到家裡」，沒有「連得到但很慢」。按鈕送出中、不能按、等很久的樣子；更新變慢時要不要寫「最後更新 20 秒前」。
Fix：請 Alex 選，補全域的送出中和不能按。

**F43｜Drawability｜drawability（1 份）｜B**：手機底部面板一打開多高（DESIGN.md bottom-sheet）
只寫可以拉到全螢幕，沒寫初始高度，也沒寫把手和 ✕ 的相對位置、全螢幕時頂端安全區。
Fix：請 Alex 選初始高度和頂端排法。

### Medium（39）

**F44｜Component coverage｜rubric、consistency、drawability（3 份）｜A**：收合後的直條欄和變寬欄沒有視覺規格（DESIGN.md Components、Layout & Spacing）
只有 Q20 的文字；demo 有數值（直條 64px、直書欄名、圓圈加數量，變寬欄卡片最小 270px），Alex 看完說畫面可以（#57）。
Fix：照 demo 數值補收合欄元件和變寬欄格線。

**F45｜State coverage｜rubric、consistency（2 份）｜B**：看板捲到底載入下一批時的樣子沒寫（EXPERIENCE.md State Patterns）
demo 一次 40 張，顯示「載入中…」。
Fix：請 Alex 選用 demo 的字樣還是別的。

**F46｜Inheritance discipline｜rubric、consistency、memlog、drawability（4 份）｜A**：畫面數還寫 9 張（EXPERIENCE.md 開頭、Foundation；根目錄 DESIGN.md 加畫門檻）
#102 已改成 10 張。根目錄「第 10 張以上」也要改成第 11 張。
Fix：改成 10 張、第 11 張以上。

**F47｜Inheritance discipline｜rubric、consistency、memlog、drawability（4 份）｜A**：狀態用語只列 6 種，少了「已整理」（EXPERIENCE.md Voice and Tone、qBittorrent 狀態對應、State Patterns）
DESIGN.md 是 7 種（#87 加了 status-archived）。錯誤種子的例子「找不到檔案」也跟狀態對應表對不上。memlog-trace 把這條和 F1 一起判 high，這裡只算用字，取 medium。
Fix：補「已整理」，「比 6 種多」改「比 7 種多」，換錯誤種子的例子。

**F48｜Flow coverage｜rubric、consistency、memlog、drawability（4 份）｜A**：旅程 1 的位置標籤寫「下載區」（EXPERIENCE.md 旅程 1 第 3 步）
是 #34 舊的分區標籤做法，已被 #35、#77 推翻。範例表叫「下載區（影集）」。drawability 判 medium，其他判 low。
Fix：改成「下載區（影集）」。

**F49｜Flow coverage｜rubric、memlog（2 份）｜A**：旅程 1 沒用到「接著改檔名」提示和搬移中（EXPERIENCE.md 旅程 1 第 5、6 步）
#82 決定只搬一個時完成提示有「接著改檔名」。旅程寫「他從詳情進改檔名」。
Fix：第 5 步寫搬移中和提示，第 6 步寫點提示進改檔名。

**F50｜Drawability｜drawability（1 份）｜B**：改路徑的提示時機、用字、批次時目前路徑（EXPERIENCE.md 改路徑）
「接著改檔名」送出後馬上跳還是搬完才跳；搬移中能不能改檔名；寫「已搬到 media/tv」還是常用路徑名字；批次時原本路徑不一樣寫什麼。
Fix：請 Alex 選。

**F51｜memlog trace｜memlog（1 份）｜A**：改檔名的集數規則寫舊了（EXPERIENCE.md rename、旅程 1 第 6 步）
都只寫「集數自動往上加」。#94 決定先從原檔名抓集數（E05、第05話、[05]），抓不到才照順序加。
Fix：照 #94 改。

**F52｜memlog trace｜memlog、drawability（2 份）｜B**：詳情三個數字「最後有人抓」memlog 找不到（EXPERIENCE.md stat-tile、旅程 4）
#31 記的 K 清理畫面是「做種天數、分享率、在連的人」。三個數字是否依狀態換、沒值時寫什麼也沒寫。
Fix：請 Alex 選三個數字和沒值的寫法。

**F53｜State coverage｜rubric、memlog、drawability（3 份）｜B**：正在看的種子不見了、刪除後、空分類時詳情顯示什麼（EXPERIENCE.md State Patterns）
刪掉、搬走後不在篩選裡、被搜尋篩掉；刪除成功後選取怎麼清；#89 定了空分類不顯示分頁，「這個分類沒有種子」什麼時候出現沒寫清楚。
Fix：請 Alex 選，State Patterns 加列。

**F54｜State coverage｜rubric（1 份）｜B**：多選動作部分失敗（EXPERIENCE.md State Patterns）
刪 5 個只成功 3 個、批次搬只成功一部分時怎麼顯示。
Fix：請 Alex 選，加「部分失敗」一列。

**F55｜State coverage｜rubric（1 份）｜B**：資料一直更新時列表重排（EXPERIENCE.md 排序和檢視、Interaction Primitives）
依速度、進度、剩餘時間排時列一直換位置，滑鼠底下那列會跑掉。
Fix：請 Alex 選更新頻率和要不要暫停重排。

**F56｜memlog trace｜memlog（1 份）｜A**：「Alex 確認」的列查不到是哪 15 條（.memlog.md #102；EXPERIENCE.md State Patterns 等）
不放轉圈圈、空欄寫「沒有」、平板規則、手機 44px 等只靠 #102 背書，memlog 沒列出清單。
Fix：用 append 把 15 條清單補進 memlog。

**F57｜memlog trace｜memlog、drawability（2 份）｜B**：列表固定的「分享率」欄，排分享率時出現兩次（DESIGN.md list-row）
#33 只說右邊大數字是目前的排序欄位，左邊固定多一欄分享率 memlog 沒有來源。
Fix：請 Alex 選要不要這一欄，排分享率時怎麼辦。

**F58｜Consistency｜consistency、memlog（2 份）｜A**：Q14 劃掉當已決定，但狀態對應表還是 ASSUMPTION（EXPERIENCE.md 待決問題、Voice and Tone、State Patterns）
#102 寫狀態對應表仍是 ASSUMPTION。Q15、Q17、Q18 還寫「Claude 先定」，內文已寫「Alex 確認」。從表推出來的說法（已暫停放下載中欄等）沒標 ASSUMPTION。
Fix：Q14 不劃掉，Q15、Q17、Q18 改「Alex 確認（2026-11-14）」，推出來的說法標 ASSUMPTION。

**F59｜Inheritance discipline｜rubric、consistency（2 份）｜A**：Q20 還寫「範圍待定（Q22）」（EXPERIENCE.md 待決問題 Q20）
Q22 已決定先不做（#101）。
Fix：改成「見 Q22，先不做」。

**F60｜Bloat & overspecification｜rubric（1 份）｜A**：全域速度寫在三個地方（EXPERIENCE.md speed-pill、全域速度、Q2）
手機的寫法只在 Q2。
Fix：合併成一處。

**F61｜Bloat & overspecification｜rubric（1 份）｜A**：EXPERIENCE.md 散文帶由來、原話和統計數字
體驗規格的散文要的是規則。
Fix：留會影響決定的數字，其他移回 memlog。

**F62｜Inheritance discipline｜rubric（1 份）｜A**：兩份 `sources` 會指到 spine 自己（兩份 frontmatter）
Fix：改成 repo 根目錄的路徑。

**F63｜Consistency｜consistency、memlog（2 份）｜A**：根目錄說 taste-log 還沒有原則，規格卻在引用原則 1、2、3（根目錄 DESIGN.md 最後一段）
memlog #26、#28、#35、#81 已記錄三條原則。根目錄的衝突順序把 taste-log 原則排在前面，所以要寫出來。
Fix：抄進三條原則。

**F64｜Token completeness｜rubric（1 份）｜A**：對比表少了 5 組天天看到的組合（DESIGN.md Colors 對比表）
Fix：補淺色、深色數字。

**F65｜Token completeness｜rubric、consistency（2 份）｜A**：手機 44px 沒有 token（DESIGN.md frontmatter components）
`detail-header.nav-button-size` 36px、`save-path-block.button-height` 34px 只有電腦值。
Fix：加 `-phone: 44px`。

**F66｜Component coverage｜rubric、memlog（2 份）｜A**：已決定行為的元件不在元件表（兩份 Components／Component Patterns）
搜尋框（#53）、快捷鍵說明視窗（#53）、手機分類清單（#47）、手機狀態分頁、拖檔遮罩、分類分頁 tooltip 顯示快捷鍵數字（#55）。
Fix：各補一列，外觀沿用 shadcn 的就寫沿用哪個。

**F67｜Consistency｜consistency（1 份）｜A**：Responsive 表的詳情沒分看板和列表（EXPERIENCE.md Responsive & Platform）
Fix：拆成兩列（#58）。

**F68｜Consistency｜consistency、drawability（2 份）｜A**：底部面板少了 ✕ 和全螢幕的樣子（DESIGN.md bottom-sheet）
#64：右上角 ✕ 也能關，往上拉到全螢幕。
Fix：補上。

**F69｜Consistency｜consistency（1 份）｜A**：對話框在手機寫成沿用 shadcn Sheet，手機呈現清單少 2 張（DESIGN.md Components 對話框列；EXPERIENCE.md Responsive & Platform）
Q5、Q6、Q9 已定手機用跟詳情同一種的品牌底部面板（#63、#64、#92）。根目錄要求 6 張寫手機呈現，只列了 4 張。
Fix：改成品牌底部面板，補齊第 3、10 張。

**F70｜Consistency｜consistency（1 份）｜A**：搜尋放哪根目錄和 EXPERIENCE.md 不一樣，「回到最上面」範圍變窄（根目錄 DESIGN.md；EXPERIENCE.md 排序和檢視）
#44 搜尋算篩選、#53 放頁首放大鏡。設計要求 5 是「換篩選」，EXPERIENCE.md 寫成「換分類」。
Fix：根目錄改位置，EXPERIENCE.md 改回「換篩選（分類、搜尋）」。

**F71｜Consistency｜consistency、drawability（2 份）｜A**：demo 跟規格不一致（.working/demo-board/index.html）
上傳速度還有斜線（#67 說不要斜線）、深色淡紫底是舊值、排序按鈕高度 34px（token 40px）、第四種陰影。
Fix：demo 照規格改。

**F72｜Visual reference coverage｜rubric（1 份）｜A**：imports/ 6 張截圖沒有一張被連結
Fix：在對應章節加連結和說明。

**F73｜Visual reference coverage｜rubric（1 份）｜A**：畫布只有一個連結，沒對到哪張畫面
方向 K 只涵蓋第 1、2、4、5 張和部分第 3 張，第 6 到 10 張沒有畫稿。
Fix：加一張對照表。

**F74｜Drawability｜drawability（1 份）｜B**：勾選框「在角落出現」是哪個角（DESIGN.md board-card、list-row）
Fix：請 Alex 選。

**F75｜Drawability｜drawability（1 份）｜B**：hover 和不能按的樣子沒寫
列、卡片、膠囊按鈕、分頁，和改檔名撞名時「確定」不能按。跟 F19 有關。
Fix：請 Alex 選，補通用規則。

**F76｜Drawability｜drawability（1 份）｜B**：手機列表列第二行放不下時先砍誰
位置標籤、大小、速度；電腦的分享率欄手機有沒有。
Fix：請 Alex 選欄位和切掉的順序。

**F77｜Drawability｜drawability（1 份）｜B**：手機選取模式的進出
長按回饋、全選位置、怎麼離開。
Fix：請 Alex 選。

**F78｜Drawability｜drawability（1 份）｜B**：長路徑切哪邊，手機怎麼看完整路徑
路徑最後一段通常是劇名，切後面就看不到。
Fix：請 Alex 選。

**F79｜Drawability｜drawability（1 份）｜B**：刪除確認的細節（第 7 張）
取消勾後按鈕字、標題、取消按鈕、寬度、長檔名、刪除中和刪完、一次幾千個時單位和清單。
Fix：請 Alex 選。

**F80｜Drawability｜drawability（1 份）｜B**：toast 位置和停留時間
選取列也在下方，會疊在一起。
Fix：請 Alex 選。

**F81｜Drawability｜drawability（1 份）｜B**：舊資料變淡的程度和多個問題的優先順序
手機那一行只能寫一個。
Fix：請 Alex 選。

**F82｜Drawability｜drawability（1 份）｜B**：成功的回饋整體沒寫
失敗都用 toast，成功只寫了「已複製」「已加到常用」。改檔名送出中和成功也算在這條。
Fix：請 Alex 選，補「動作 → 成功回饋」表。

### Low（21）

**F83｜Inheritance discipline｜rubric、consistency、memlog（3 份）｜A**：狀態圓圈寫「中間白色圖示」，深色模式其實是深色圖示（DESIGN.md status-circle；#39）
Fix：改成 `{colors.status-icon}`。

**F84｜Bloat & overspecification｜rubric、consistency（2 份）｜A**：Colors 的變更紀錄和 frontmatter 註解（DESIGN.md Colors、frontmatter）
Fix：變更紀錄移到 memlog，對比數字移到對比表，註解改成「依對比調過」。

**F85｜Token completeness｜rubric、drawability（2 份）｜B**：`media-library-tint-dark` 跟淺色同值（DESIGN.md Colors）
對比表深色是量在 surface 上，看起來像深色沒有淡紫底。
Fix：請 Alex 選深色要不要底色。

**F86｜Token completeness｜rubric（1 份）｜B**：幾個字型值沒進 token（DESIGN.md Typography）
卡片百分比電腦 17px、手機 22px 只在 note；媒體庫標籤「粗一點」沒寫粗細；沒有 lineHeight。
Fix：百分比搬成字型角色，粗細和行高請 Alex 選。

**F87｜Component coverage｜rubric（1 份）｜A**：`detail-hero` 同時是元件名和字型角色名
Fix：改名或寫明關係。

**F88｜Flow coverage｜rubric（1 份）｜A**：打字找名字沒有出現在旅程
Fix：旅程 3 或 4 加一步。

**F89｜Visual reference coverage｜rubric（1 份）｜A**：demo-board 只在劃掉的 Q20，directions-1.html 沒提
Fix：搬連結。

**F90｜Visual reference coverage｜rubric（1 份）｜A**：「以這兩份為準」寫了兩次
Fix：留一份。

**F91｜Shape fit｜rubric（1 份）｜A**：DESIGN.md frontmatter 多了規格沒有的 key
不影響使用。
Fix：留著或移走。

**F92｜Consistency｜consistency（1 份）｜A**：gates.md 還寫 8 件（ai-context/core/gates.md）
根目錄已改 7 件（#19）。交接寫明要 Alex 同意才改。
Fix：Alex 同意後改。

**F93｜Consistency｜consistency（1 份）｜A**：旅程 2、3 假設打開一定是看板
#51 打開回到上次分類和它記住的排序。
Fix：加「（假設上次是狀態排序）」。

**F94｜Consistency｜consistency（1 份）｜A**：種子數量是不同時間查的，對不起來
4164 和 4165 混用；分類數 7 和 8；Q21 分類加總少兩個分類。
Fix：註明時間或統一寫「約 4165」，補齊加總。

**F95｜Consistency｜consistency（1 份）｜B**：根目錄衝突順序把「品牌規範」排第一（根目錄 DESIGN.md 開頭）
這個 App 的配色是 Alex 在方向 K 自己選的，照字面讀可能套個人品牌色。
Fix：請 Alex 寫清楚指什麼，或拿掉。

**F96｜Consistency｜consistency（1 份）｜A**：快捷鍵說明少了看板模式（EXPERIENCE.md Q20）
#58 看板模式打開詳情時 ↑ ↓ 也能用，Esc 關詳情。
Fix：補上。

**F97｜Consistency｜consistency（1 份）｜B**：快捷鍵 1 到 8 照現在的分頁數寫死
空分類有種子後會變 9 個分頁。
Fix：請 Alex 選超過 8 個時怎麼辦。

**F98｜Consistency｜consistency（1 份）｜B**：自動收合要在手機上試，但手機一次只看一欄
設定頁的開關在手機也沒作用。
Fix：請 Alex 選只在電腦版，或平板橫拿也要。

**F99｜Consistency｜consistency（1 份）｜B**：「更多」排序裡有已經砍掉的欄位
暫存路徑（#19 砍了）、標籤（0 個，篩選也不做）。
Fix：請 Alex 選要不要拿掉，數字跟著改。

**F100｜memlog trace｜memlog（1 份）｜B**：「刪除確認被關掉等於不刪」memlog 沒有（EXPERIENCE.md Q9）
合理推論，但沒有 Alex 選過的紀錄。
Fix：請 Alex 確認。

**F101｜memlog trace｜memlog（1 份）｜B**：「方向探索 A 到 K 不算 15 張」寫成事實（EXPERIENCE.md Foundation）
Alex 只說過 directions-1 不算（#21）。
Fix：請 Alex 確認 K 和 demo 算不算。

**F102｜Drawability｜drawability（1 份）｜B**：手機看板卡片一排幾張沒寫
Fix：請 Alex 選。

**F103｜Drawability｜drawability（1 份）｜B**：手動改路徑會關掉自動種子管理，要不要提示
要先在架構階段確認 qBittorrent 的實際行為。
Fix：請 Alex 選。

## Mechanical notes

- Token 引用：DESIGN.md 39 種 `{path}`、EXPERIENCE.md 4 種，全部對得到 frontmatter（rubric）。
- `list-row.focus-ring: inset 0 0 0 2px {colors.accent}` 沒加引號，引用夾在字串中間，有些解析器只處理整個值是引用的情況（rubric）。
- 元件名：兩張元件表各 25 個名字，英文代號一致（rubric、consistency）。
- memlog 實際有 103 筆，交接檔和 rubric 寫 102 筆（memlog-trace）。
- [ASSUMPTION] 只剩「qBittorrent 狀態對應」一個（rubric、memlog-trace），見 F30、F58。
- 待決問題的排列是 Q1 到 Q18、Q21、Q22、Q19、Q20，讀起來會以為少題（consistency，不算 finding）。
- 兩份都沒有 Mermaid。

## Reviewer files

- `review-rubric.md`
- `review-consistency.md`
- `review-memlog-trace.md`
- `review-drawability.md`
