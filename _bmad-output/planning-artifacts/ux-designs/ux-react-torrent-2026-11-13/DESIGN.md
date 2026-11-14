---
name: react-torrent
description: Alex 自用的 qBittorrent 網頁介面（練設計專案）。shadcn/ui（new-york、zinc）加上方向 K 的品牌層；這份只寫跟 shadcn 預設不同的地方。
status: draft
sources:
  - DESIGN.md
  - ~/projects/personal/ai-context/core/taste-log.md
updated: 2026-11-14
colors:
  # 依「意思」分角色，淺色（白底）和深色（深藍夜）各一個值。
  # 沒列的 shadcn token（popover、input、ring 等）先沿用 shadcn，實作時再對到下面的角色。
  # 值全部取自方向 K 的畫稿產生器（gen3.py 的 PAL，gen4.py 的補充）。
  surface-page: '#F6F6F4'
  surface-page-dark: '#1F2937'
  surface: '#FFFFFF'
  surface-dark: '#18202C'
  surface-muted: '#EFEFEC'
  surface-muted-dark: '#263243'
  border: '#E4E4E0'
  border-dark: '#2D3A4D'
  text: '#141414'
  text-dark: '#E9EEF5'
  text-muted: '#65655F'
  text-muted-dark: '#95A1B2'
  text-faint: '#8C8C87'
  text-faint-dark: '#67758A'
  track: '#E7E7E3'
  track-dark: '#334155'
  accent: '#141414'
  accent-dark: '#6CB4E4'
  accent-foreground: '#FFFFFF'
  accent-foreground-dark: '#0F1720'
  selection-row: '#EEF4FF'
  selection-row-dark: '#25344A'
  selection-bar: '#141414'
  selection-bar-dark: '#E9EEF5'
  selection-bar-foreground: '#FFFFFF'
  selection-bar-foreground-dark: '#0F1720'
  delete: '#D93A3A'
  delete-dark: '#E0707F'
  delete-foreground: '#FFFFFF'
  delete-foreground-dark: '#0F1720'
  good: '#18753F'
  good-dark: '#8FD19E'
  media-library: '#6A45C8'
  media-library-dark: '#A48FE0'
  media-library-tint: '#6A45C81F'
  media-library-tint-dark: '#6A45C81F'
  status-downloading: '#2F6FDF'
  status-downloading-dark: '#5AA9E0'
  status-seeding: '#278A4F'
  status-seeding-dark: '#7FBF8E'
  status-done: '#141414'
  status-done-dark: '#7D8BA0'
  status-paused: '#B26F0C'
  status-paused-dark: '#E0AD62'
  status-stalled: '#C9581E'
  status-stalled-dark: '#E3925F'
  status-error: '#D93A3A'
  status-error-dark: '#E0707F'
  status-archived: '#65655F'
  status-archived-dark: '#95A1B2'
  status-icon: '#FFFFFF'
  status-icon-dark: '#0F1720'
typography:
  # 字型堆疊兩種：介面用系統字，路徑用等寬字。
  page-title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang TC', 'Noto Sans TC', system-ui, sans-serif"
    fontSize: 26px
    fontWeight: '700'
  detail-hero:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang TC', 'Noto Sans TC', system-ui, sans-serif"
    fontSize: 28px
    fontWeight: '700'
  stat-value:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang TC', 'Noto Sans TC', system-ui, sans-serif"
    fontSize: 20px
    fontWeight: '700'
  row-value:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang TC', 'Noto Sans TC', system-ui, sans-serif"
    fontSize: 18px
    fontWeight: '700'
    note: 'font-variant-numeric: tabular-nums。看板卡片的百分比在電腦 17px、手機 22px。'
  detail-name:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang TC', 'Noto Sans TC', system-ui, sans-serif"
    fontSize: 16px
    fontWeight: '700'
  column-title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang TC', 'Noto Sans TC', system-ui, sans-serif"
    fontSize: 15px
    fontWeight: '700'
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang TC', 'Noto Sans TC', system-ui, sans-serif"
    fontSize: 13px
    fontWeight: '400'
  row-name:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang TC', 'Noto Sans TC', system-ui, sans-serif"
    fontSize: 13px
    fontWeight: '600'
  meta:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang TC', 'Noto Sans TC', system-ui, sans-serif"
    fontSize: 12px
    fontWeight: '400'
  tag:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang TC', 'Noto Sans TC', system-ui, sans-serif"
    fontSize: 11px
    fontWeight: '400'
  path:
    fontFamily: "'SF Mono', ui-monospace, Menlo, monospace"
    fontSize: 12px
    fontWeight: '400'
rounded:
  # 比 shadcn 預設圓很多：按鈕、分頁、標籤都是膠囊。
  xs: 6px
  bar: 9px
  row: 14px
  card: 16px
  panel: 22px
  sheet: 28px
  full: 9999px
spacing:
  # 沿用 Tailwind 的 4 倍數尺度，下面是畫稿裡實際用到、要固定的值。
  '1': 4px
  '1.5': 6px
  '2': 8px
  '2.5': 10px
  '3': 12px
  '3.5': 14px
  '4': 16px
  page-desktop: 22px 28px
  page-desktop-bottom: 110px
  page-phone: 18px 16px
  page-phone-list: 18px 12px
  content-max: 1240px
  list-column-max: 560px
  board-gap: 14px
  card-padding: 12px 14px
  row-padding-desktop: 9px 12px
  row-padding-phone: 9px 10px
  panel-padding: 18px 22px
components:
  speed-pill:
    background: '{colors.surface}'
    border: '{colors.border}'
    radius: '{rounded.full}'
    padding: 7px 14px
  category-tabs:
    active-background: '{colors.accent}'
    active-foreground: '{colors.accent-foreground}'
    background: '{colors.surface}'
    border: '{colors.border}'
    radius: '{rounded.full}'
  sort-pill:
    background: '{colors.surface}'
    border: '{colors.border}'
    view-label-background: '{colors.surface-muted}'
    radius: '{rounded.full}'
    height-desktop: 40px
    height-phone: 44px
  status-circle:
    fill: '{colors.status-downloading}'
    icon: '{colors.status-icon}'
    ring-track: '{colors.track}'
    size-row: 36px
    size-column: 28px
    size-detail: 64px
    inner-ratio: '0.8'
    icon-ratio: '0.42'
  board-column:
    background: '{colors.surface-muted}'
    radius: '{rounded.panel}'
    padding: '{spacing.3}'
  board-card:
    background: '{colors.surface}'
    radius: '{rounded.card}'
    padding: '{spacing.card-padding}'
    shadow: 0 1px 2px rgba(0,0,0,.05)
  list-row:
    radius: '{rounded.row}'
    selected-background: '{colors.selection-row}'
    focus-ring: inset 0 0 0 2px {colors.accent}
  category-pill:
    border: '{colors.border}'
    foreground: '{colors.text-muted}'
    radius: '{rounded.full}'
    padding: 1px 8px
  location-tag:
    border: '{colors.border}'
    foreground: '{colors.text-muted}'
    media-background: '{colors.media-library-tint}'
    media-foreground: '{colors.media-library}'
    radius: '{rounded.full}'
    padding: 1px 8px
  checkbox:
    checked-background: '{colors.accent}'
    checked-foreground: '{colors.accent-foreground}'
    unchecked-border: '{colors.text-faint}'
    radius: '{rounded.xs}'
    size: 20px
  progress-bar:
    track: '{colors.track}'
    height: 4px
    radius: '{rounded.bar}'
  selection-bar:
    background: '{colors.selection-bar}'
    foreground: '{colors.selection-bar-foreground}'
    delete-background: '{colors.delete}'
    delete-foreground: '{colors.delete-foreground}'
    radius: '{rounded.full}'
    shadow: 0 12px 32px rgba(0,0,0,.28)
  detail-panel:
    background: '{colors.surface}'
    radius: '{rounded.panel}'
    padding: '{spacing.panel-padding}'
  detail-header:
    divider: '{colors.border}'
    nav-button-size: 36px
  stat-tile:
    background: '{colors.surface-muted}'
    radius: '{rounded.card}'
    padding: '{spacing.card-padding}'
  detail-tabs:
    active-background: '{colors.accent}'
    active-foreground: '{colors.accent-foreground}'
    radius: '{rounded.full}'
  save-path-block:
    background: '{colors.surface-muted}'
    radius: '{rounded.card}'
    button-height: 34px
    primary-background: '{colors.accent}'
    primary-foreground: '{colors.accent-foreground}'
  bottom-sheet:
    background: '{colors.surface}'
    radius-top: '{rounded.sheet}'
    shadow: 0 -12px 40px rgba(0,0,0,.18)
    scrim: rgba(0,0,0,.18)
  button-primary:
    background: '{colors.accent}'
    foreground: '{colors.accent-foreground}'
    radius: '{rounded.full}'
---

# react-torrent：視覺規格

> 視覺來源是 Claude Design 畫布上的方向 K（白底版和深藍夜版）：https://claude.ai/artifact/No6PbxLKUGqBmqEvnBZxye 。畫稿還沒搬進 `mockups/`。這份和 `EXPERIENCE.md` 跟任何畫稿、截圖衝突時，以這兩份為準。

## Brand & Style

這是 Alex 一個人每天用的工具，用來取代 VueTorrent。標準只有一條：Alex 自己喜歡。他說：「這個 App 是給我用沒錯，但是既然是我用的話，所以主題一定要是我喜歡的。」

第二條是美感。Alex 否決第一輪四個方向時說：「要讓這個畫面人家一看看到就會覺得我想用這個 App，所以美感是絕對必要的。」簡潔他要，「沒有美感」的灰色後台他不要。

樣子學 MOZE 記帳：資訊多，但靠熟悉的圖示和主次讓人看得懂。每列左邊一個大的彩色圓圈，名稱和數字大，分類這類次要資訊變成小的外框標籤。顏色只用來表示意思，不拿來裝飾。

介面系統是 shadcn/ui（repo 已裝，new-york、zinc、lucide 圖示）。這份只寫品牌層：配色角色、比較圓的形狀、狀態圓圈和幾個自訂元件。Dialog、Sheet、DropdownMenu、Checkbox、Tabs、Toast 的結構沿用 shadcn。

不要的方向（來自第一輪的回饋）：公司後台的灰階表格、終端機的極客風、報紙排版、深紫配粉紅的糖果色。

## Colors

兩套顏色都要，跟著系統的淺色、深色模式切換。白底是淺色，深藍夜是深色。Alex 對兩套的回答是「都好」，所以顏色照角色分，換底色時角色不變，只換色值。代價是每張畫面都要在兩種模式下各看一次。

**狀態（7 種）**：每種狀態一個顏色加一個圖示，不能只靠顏色分。

| 角色 | 淺色 | 深色 | 圖示 | 用在 |
|---|---|---|---|---|
| `status-downloading` | `#2F6FDF` | `#5AA9E0` | 向下箭頭 | 下載中；全域下載速度的 ↓ |
| `status-seeding` | `#278A4F` | `#7FBF8E` | 向上箭頭 | 做種中；全域上傳速度的 ↑ |
| `status-done` | `#141414` | `#7D8BA0` | 打勾 | 已完成（不再做種） |
| `status-paused` | `#B26F0C` | `#E0AD62` | 兩條直線 | 已暫停 |
| `status-stalled` | `#C9581E` | `#E3925F` | 沙漏 | 停滯（沒有來源） |
| `status-error` | `#D93A3A` | `#E0707F` | 驚嘆號 | 錯誤；私人（PT）種子找不到檔案（做不了種） |
| `status-archived` | `#65655F` | `#95A1B2` | 封存盒 | 已整理：一般種子找不到檔案，留著當紀錄。圖示對圓圈 5.87（淺）、6.89（深），圓圈對底 5.87、6.26 |

圓圈裡的圖示用 `{colors.status-icon}`：白底版是白色圖示，深藍夜版是深色圖示（`#0F1720`）。深藍夜的圓圈顏色比較淡，白色圖示會看不清楚，所以反過來。

**其他角色**

- **主要動作 `accent`**（`#141414`／`#6CB4E4`）：新增按鈕、選中的分類分頁、選中的詳情分頁、勾選框、改路徑按鈕、詳情對應的那一列的外框。白底版是黑色，深藍夜版是亮藍。
- **選取**：被勾選的列底色 `{colors.selection-row}`（`#EEF4FF`／`#25344A`）。選取列在白底版是黑底白字，在深藍夜版反過來是淺底深字（`{colors.selection-bar}`）。
- **刪除 `delete`**：跟 `status-error` 同色。只用在選取列的「刪除（含檔案）」按鈕和刪除確認。
- **媒體庫 `media-library`**（`#6A45C8`／`#A48FE0`）：位置標籤落在媒體庫時用紫色字加淡紫底（`{colors.media-library-tint}`，12% 透明度）。紫色只表示「已經在媒體庫」，不拿來做別的事。
- **好 `good`**（`#18753F`／`#8FD19E`）：分享率到 1 以上時，數字變綠。
- **文字**：`text`、`text-muted`（次要資訊、標籤字）、`text-faint`（未勾選的勾選框外框、分頁點點）。
- **表面**：`surface-page`（頁面底）、`surface`（卡片、列表、詳情面板）、`surface-muted`（看板欄底、數字小卡、儲存位置區塊）、`border`（細線和外框）、`track`（進度條和進度環的底）。

**對比（WCAG 對比，2026-11-14 用 impeccable 的對比規則調過）**

規則：文字至少 4.5，圖示和外框這類圖形至少 3。只調亮度，色相和角色都不變。

| 組合 | 淺色 | 深色 | 目標 |
|---|---|---|---|
| `text` 在 `surface` | 18.4 | 14.1 | 4.5 |
| `text-muted` 在 `surface` | 5.9 | 6.3 | 4.5 |
| `text-muted` 在 `surface-muted` | 5.1 | 5.0 | 4.5 |
| `good` 在 `surface`／`selection-row`（分享率數字 11 到 12px） | 5.8／5.2 | 9.2／7.1 | 4.5 |
| `media-library` 字在淡紫底 | 5.5 | 5.9（在 `surface`） | 4.5 |
| 狀態圓圈裡的圖示（圖形） | 4.1 到 18.4 | 5.2 到 8.9 | 3 |
| 狀態圓圈在 `surface-muted`（看板欄底） | 3.5 以上 | 3.7 以上 | 3 |
| `delete-foreground` 在 `delete`（按鈕字） | 4.6 | 5.8 | 4.5 |
| `text-faint` 勾選框外框在 `surface` | 3.4 | 3.5 | 3 |

調了哪些（舊值 → 新值）：

- 淺色：`status-paused` #D38A17 → #B26F0C、`status-stalled` #E06A2C → #C9581E、`status-seeding` #2E9D5B → #278A4F、`good` #1F8A4C → #18753F、`media-library` #7A55D6 → #6A45C8、`text-muted` #6E6E6A → #65655F、`text-faint` #A3A39E → #8C8C87。
- 深色：`status-icon-dark` 和 `delete-foreground-dark` 從白色改成 #0F1720（淡色底配深色字）、`text-muted-dark` #8B97A8 → #95A1B2、`text-faint-dark` #5D6A7D → #67758A。

畫布上的方向 K 是調之前的顏色。兩邊不一樣時，以這份為準。

## Typography

兩種字型。介面全部用系統字（Apple 系統字、PingFang TC、Noto Sans TC），路徑用等寬字（`{typography.path}`），因為路徑要一個字一個字對。

| 角色 | 大小／粗細 | 用在 |
|---|---|---|
| `page-title` | 26px／700 | 頁首「種子」 |
| `detail-hero` | 28px／700 | 詳情的狀態大字，例如「做種 41 天」，用狀態色 |
| `stat-value` | 20px／700 | 詳情的數字小卡 |
| `row-value` | 18px／700，等寬數字 | 列表列右邊的大數字（目前排序的欄位） |
| `detail-name` | 16px／700 | 詳情頂端固定的種子名稱 |
| `column-title` | 15px／700 | 看板欄標題 |
| `body` | 13px／400 | 一般文字、排序按鈕 |
| `row-name` | 13px／600 | 列表列和卡片的種子名稱 |
| `meta` | 12px／400 | 次要資訊（剩餘時間、速度、數字小卡標題） |
| `tag` | 11px | 分類標籤、位置標籤、列表列第二行 |

種子名稱一律一行，超過用「…」切掉。數字用等寬數字（`tabular-nums`），換值時不會跳動。

## Layout & Spacing

沿用 Tailwind 的 4 倍數尺度。畫稿實際用到的間距：4、6、8、10、12、14、16px。

**電腦**

- 內容最寬 `{spacing.content-max}`（1240px），置中，四邊留 `{spacing.page-desktop}`。底部多留 `{spacing.page-desktop-bottom}`，讓浮在下面的選取列不會蓋住最後一列。
- 由上到下：頁首（標題、全域速度、搜尋、新增）→ 分類分頁和排序按鈕同一排 → 內容。
- 看板：4 欄等寬，欄距 `{spacing.board-gap}`，欄的順序是要處理、下載中、做種中、完成。
- 列表加詳情：左邊列表最寬 `{spacing.list-column-max}`（560px），右邊詳情面板吃掉剩下的寬度，中間 16px。

**手機**（畫稿寬 390px）

- 四邊留 `{spacing.page-phone}`；列表模式左右收到 12px（`{spacing.page-phone-list}`），讓名稱多一點字。
- 頁首只留標題、搜尋、新增三個圓按鈕。
- 看板變成一次看一欄，上面是狀態分頁。詳情是從下面滑上來的面板。

**眼睛不要左右來回**（taste-log 原則 2）：要一起看的東西放在同一條線上。詳情頂端的名稱、「第 N 個／共 M 個」和前後按鈕在同一排；列表列的名稱和右邊的大數字在同一列。

## Elevation & Depth

層次主要靠底色深淺：`surface-page` 最底，`surface` 疊在上面，`surface-muted` 用在面板裡的區塊。

陰影只有三種：

- 看板卡片：`0 1px 2px rgba(0,0,0,.05)`，幾乎看不到，只讓卡片離開欄底一點點。
- 選取列：`0 12px 32px rgba(0,0,0,.28)`，它浮在內容上面，要明顯。
- 手機底部面板：`0 -12px 40px rgba(0,0,0,.18)`，後面加一層 `rgba(0,0,0,.18)` 的遮罩。

## Shapes

比 shadcn 預設圓很多。按鈕、分類分頁、詳情分頁、排序按鈕、標籤、選取列全部是膠囊（`{rounded.full}`）。狀態圓圈和前後按鈕是正圓。

| Token | 值 | 用在 |
|---|---|---|
| `xs` | 6px | 勾選框 |
| `bar` | 9px | 進度條 |
| `row` | 14px | 列表列（選取、對焦時的底色形狀） |
| `card` | 16px | 看板卡片、數字小卡、儲存位置區塊 |
| `panel` | 22px | 看板欄、列表外框、詳情面板 |
| `sheet` | 28px | 手機底部面板的上緣 |
| `full` | 9999px | 膠囊 |

## Components

沿用 shadcn、不改外觀的：`Dialog`、`AlertDialog`、`Sheet`、`DropdownMenu`、`Checkbox` 的行為、`Tabs` 的行為、`Toast`、`Skeleton`、`Input`。

品牌層的元件：

- **狀態圓圈 status-circle**：外圈是進度環，裡面是填滿狀態色的圓（直徑 80%），中間白色圖示（42%）。下載中、已暫停、停滯的外圈畫出進度（例如 87%），其他狀態外圈是滿的。尺寸：列表列 36px、看板欄標題和手機狀態分頁 28px、詳情 64px。畫稿用 `conic-gradient` 畫進度環，實作要換成 SVG `stroke-dashoffset`（見 `EXPERIENCE.md` 的動態）。
- **全域速度膠囊 speed-pill**：頁首兩顆。下載是藍色 ↓ 加速度加「不限速」或上限，上傳是綠色 ↑ 加目前速度，後面寫「上限 32.7」（寫出「上限」兩個字，不用斜線）。上限用 `text-muted`。手機沒有膠囊外框，改成標題下面一行字。
- **分類分頁 category-tabs**：膠囊，名稱後面接淡色的數量（例如「mteam-tv 203」）。選中的是 `accent` 底。
- **排序按鈕 sort-pill**：膠囊。左邊一個小膠囊寫目前是「看板」還是「列表」並配圖示，右邊粗體「排序：狀態」加淡色「（這個分類記住的）」，最後一個 ▾。
- **排序選單 sort-menu**：沒有畫稿。結構沿用 shadcn `DropdownMenu`，內容順序見 `EXPERIENCE.md`。
- **看板欄 board-column**：`surface-muted` 底，標題列是 28px 狀態圓圈、欄名、淡色數量。卡片放不下時，欄底寫「還有 N 個」。
- **看板卡片 board-card**：`surface` 底。第一行名稱（一行）加右邊的百分比（只有下載中、暫停、停滯有）。第二行是剩餘時間和速度，或一句狀態說明（「卡在 87%，沒有來源」「做種滿 14 天」）。有進度的卡片加一條 4px 進度條，用狀態色。最下面是分類標籤和位置標籤。
- **列表列 list-row**：勾選框、36px 狀態圓圈、名稱和第二行、右邊的大數字（`{typography.row-value}`）。第二行是位置標籤加大小和速度。電腦上大數字左邊多一欄「分享率 3.12」。被勾選時底色是 `selection-row`；詳情正在看的那一列加 2px `accent` 內框。
- **分類標籤 category-pill**：11px，`border` 外框，`text-muted` 字，沒有底色。
- **位置標籤 location-tag**：跟分類標籤同樣大小，前面加一個資料夾圖示。一般位置是外框加 `text-muted`；媒體庫是淡紫底加紫色粗一點的字，沒有外框。
- **勾選框 checkbox**：20px，圓角 6px。勾選時 `accent` 底加白勾（深色模式是深色勾），沒勾時 2px `text-faint` 外框。
- **進度條 progress-bar**：4px 高，`track` 底，填的部分用狀態色。
- **選取列 selection-bar**：浮在畫面下方的膠囊。電腦置中，手機左右各留 16px。內容由左到右：「已選 N 個」（粗）、「共 X GB」（淡）、取消、紅色的「刪除（含檔案）」按鈕。
- **詳情面板 detail-panel**：電腦右邊的 `surface` 面板，圓角 22px。
- **詳情固定頭 detail-header**：一行種子名稱（`{typography.detail-name}`），右邊緊接 ‹、「第 N 個／共 M 個」、›，三個放在一起。下面一條 `border` 細線。
- **詳情狀態區 detail-hero**：64px 狀態圓圈加狀態大字（`{typography.detail-hero}`，狀態色），下面一行淡色摘要（分享率、已上傳、大小、分類）。
- **數字小卡 stat-tile**：3 張一排，`surface-muted` 底，上面淡色標題、下面 `{typography.stat-value}`。
- **詳情分頁 detail-tabs**：概覽、檔案、追蹤者、用戶。膠囊，選中的是 `accent` 底。
- **儲存位置區塊 save-path-block**：`surface-muted` 底。左邊上面寫「儲存位置」加位置標籤，下面一行完整路徑（等寬字，一行，太長用「…」）。右邊三顆 34px 膠囊按鈕：複製、☆ 加到常用、改路徑（只有改路徑是 `accent` 實心）。
- **底部面板 bottom-sheet**：手機的詳情。上緣圓角 28px，頂端一條 44×5px 的把手，後面的列表變淡加遮罩。
- **主要按鈕 button-primary**：膠囊，`accent` 底。用在「新增」和「改路徑」。
- **新增種子 add-torrent、刪除確認 delete-confirm、改路徑 change-path、改檔名 rename**：還沒有畫稿。先沿用 shadcn `Dialog`（電腦）和 `Sheet`（手機）的外觀，版面見 `EXPERIENCE.md` 的待決問題。

## Do's and Don'ts

| 要 | 不要 |
|---|---|
| 狀態用顏色加圖示一起表示 | 只靠顏色分狀態 |
| 顏色照角色用，換主題只換色值 | 為了好看在某個畫面加角色以外的顏色 |
| 紫色只表示媒體庫 | 把紫色拿來當強調色或裝飾 |
| 紅色只用在錯誤和刪除 | 把紅色用在一般按鈕 |
| 種子名稱一行，用「…」切 | 讓名稱折成兩三行把列撐高 |
| 名稱、「第 N 個／共 M 個」、前後按鈕放同一排 | 把總數放在另一個角落 |
| 按鈕、分頁、標籤用膠囊 | 混用直角和膠囊 |
| 每張畫面在白底和深藍夜各看一次 | 只看一套顏色就交 |
| 全域速度只放「現在」的數字 | 放速度波形圖（Alex：「波形圖好像沒有什麼用」） |
