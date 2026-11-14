---
name: react-torrent
description: Alex 自用的 qBittorrent 網頁介面（練設計專案）。shadcn/ui（new-york、zinc）加上方向 K 的品牌層；這份只寫跟 shadcn 預設不同的地方。
# status、sources、updated 是這個專案自己加的 key，DESIGN.md 格式沒有，解析器會略過。
status: draft
sources:
  - ../../../../DESIGN.md  # repo 根目錄的 DESIGN.md，不是這份
  - ~/projects/personal/ai-context/core/taste-log.md
updated: 2026-11-14
colors:
  # 依「意思」分角色，淺色（白底）和深色（深藍夜）各一個值。
  # shadcn 的變數怎麼對到這些角色，見 Colors 的「shadcn 變數對照」（Claude 代決，memlog #124）。
  # 值取自方向 K 的畫稿產生器（gen3.py 的 PAL，gen4.py 的補充），2026-11-14 依對比調過。
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
  # 行高（Claude 代決，memlog #124）：15px 以上 1.2，13px 以下 1.4，path 1.5。
  page-title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang TC', 'Noto Sans TC', system-ui, sans-serif"
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 1.2
  detail-hero:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang TC', 'Noto Sans TC', system-ui, sans-serif"
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 1.2
  stat-value:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang TC', 'Noto Sans TC', system-ui, sans-serif"
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 1.2
  row-value:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang TC', 'Noto Sans TC', system-ui, sans-serif"
    fontSize: 18px
    fontWeight: '700'
    lineHeight: 1.2
    note: 'font-variant-numeric: tabular-nums。'
  card-value:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang TC', 'Noto Sans TC', system-ui, sans-serif"
    fontSize: 17px
    fontWeight: '700'
    lineHeight: 1.2
    note: 'font-variant-numeric: tabular-nums。看板卡片的百分比，手機 22px（Claude 代決，memlog #124）。'
  detail-name:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang TC', 'Noto Sans TC', system-ui, sans-serif"
    fontSize: 16px
    fontWeight: '700'
    lineHeight: 1.2
  column-title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang TC', 'Noto Sans TC', system-ui, sans-serif"
    fontSize: 15px
    fontWeight: '700'
    lineHeight: 1.2
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang TC', 'Noto Sans TC', system-ui, sans-serif"
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 1.4
  row-name:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang TC', 'Noto Sans TC', system-ui, sans-serif"
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 1.4
  meta:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang TC', 'Noto Sans TC', system-ui, sans-serif"
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 1.4
  tag:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang TC', 'Noto Sans TC', system-ui, sans-serif"
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 1.4
  path:
    fontFamily: "'SF Mono', ui-monospace, Menlo, monospace"
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 1.5
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
  focus-ring:
    # 全域的鍵盤焦點，只在 :focus-visible 出現，所有可以按的東西共用（Claude 代決，memlog #124）。
    color: '{colors.accent}'
    width: 2px
    offset: 2px
    color-on-selection-bar: '{colors.selection-bar-foreground}'
  header-icon-button:
    # 頁首的搜尋、快捷鍵、設定（Claude 代決，memlog #124）。
    background: '{colors.surface}'
    border: '{colors.border}'
    radius: '{rounded.full}'
    size: 36px
    size-phone: 44px
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
    overflow-fade: 24px
  category-sheet:
    row-height: 52px
  search-box:
    background: '{colors.surface}'
    border: '{colors.border}'
    radius: '{rounded.full}'
    width: 240px
    height: 36px
    height-phone: 44px
  sort-pill:
    background: '{colors.surface}'
    border: '{colors.border}'
    view-label-background: '{colors.surface-muted}'
    radius: '{rounded.full}'
    height-desktop: 40px
    height-phone: 44px
  sort-menu:
    width: 260px
    max-height: 70vh
    row-height-phone: 52px
  status-circle:
    fill: '{colors.status-downloading}'
    icon: '{colors.status-icon}'
    ring-track: '{colors.track}'
    size-row: 36px
    size-card: 32px
    size-column: 28px
    size-detail: 64px
    inner-ratio: '0.8'
    icon-ratio: '0.42'
  status-tabs:
    background: '{colors.surface-muted}'
    radius: '{rounded.card}'
    padding: 4px
    gap: 6px
    cell-height: 56px
    active-background: '{colors.surface}'
    active-radius: '{rounded.row}'
    circle-size: 28px
  board-column:
    background: '{colors.surface-muted}'
    radius: '{rounded.panel}'
    padding: '{spacing.3}'
    widened-card-min-width: 270px
  board-column-collapsed:
    width: 64px
    title-writing-mode: vertical-rl
    title-size: 14px
    title-weight: '700'
    circle-size: 28px
    count-size: 12px
    count-foreground: '{colors.text-muted}'
  board-card:
    background: '{colors.surface}'
    radius: '{rounded.card}'
    padding: '{spacing.card-padding}'
    shadow: 0 1px 2px rgba(0,0,0,.05)
    circle-size: 32px
    checkbox-offset: -6px
  list-row:
    radius: '{rounded.row}'
    selected-background: '{colors.selection-row}'
    hover-background: '{colors.surface-muted}'
    viewing-ring: inset 0 0 0 2px {colors.accent}
    value-max-width: 160px
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
    media-font-weight: '600'
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
    radius-phone: '{rounded.panel}'
    shadow: 0 12px 32px rgba(0,0,0,.28)
  detail-panel:
    background: '{colors.surface}'
    radius: '{rounded.panel}'
    padding: '{spacing.panel-padding}'
    width-board: 400px
    shadow-board: 0 12px 32px rgba(0,0,0,.28)
  detail-header:
    divider: '{colors.border}'
    nav-button-size: 36px
    nav-button-size-phone: 44px
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
    button-height-phone: 44px
    button-gap: 8px
    primary-background: '{colors.accent}'
    primary-foreground: '{colors.accent-foreground}'
  bottom-sheet:
    background: '{colors.surface}'
    radius-top: '{rounded.sheet}'
    shadow: 0 -12px 40px rgba(0,0,0,.18)
    scrim: rgba(0,0,0,.18)
    height-detail: 70%
    max-height-other: 90%
  button-primary:
    background: '{colors.accent}'
    foreground: '{colors.accent-foreground}'
    radius: '{rounded.full}'
---

# react-torrent：視覺規格

> 視覺來源是 Claude Design 畫布上的方向 K（白底版和深藍夜版）：https://claude.ai/artifact/No6PbxLKUGqBmqEvnBZxye 。畫稿還沒搬進 `mockups/`。這份和 `EXPERIENCE.md` 跟任何畫稿、截圖衝突時，以這兩份為準。
> 標「Alex 選，memlog #n」的是 Alex 自己選的。標「Claude 代決，memlog #124」的是 Alex 授權 Claude 代決的瑣碎題（memlog #122），完整理由在 `.working/claude-decisions-2026-11-14.md`，Alex 可以逐條推翻。

**畫布對照**（artboard 名稱和逐張差異 Finalize 時補）。整份畫布已知的差異：顏色是調對比之前的舊值（見 Colors），上傳速度寫成「/ 32.7」（規格是「上限 32.7」）。

| # | 畫面 | artboard 名稱 | 跟 spine 不一樣的地方 | 有沒有畫稿 |
|---|---|---|---|---|
| 1 | 種子列表（電腦） | Finalize 時補 | Finalize 時補 | 有（方向 K） |
| 2 | 種子列表（手機） | Finalize 時補 | Finalize 時補 | 有（方向 K） |
| 3 | 篩選和排序 | Finalize 時補 | Finalize 時補 | 部分：分類分頁和排序按鈕在方向 K 裡；排序選單沒有畫稿 |
| 4 | 詳情頁（電腦） | Finalize 時補 | Finalize 時補 | 有（方向 K） |
| 5 | 詳情頁（手機） | Finalize 時補 | Finalize 時補 | 有（方向 K） |
| 6 | 新增種子 | 沒有 | 沒有 | 還沒畫 |
| 7 | 刪除確認 | 沒有 | 沒有 | 還沒畫 |
| 8 | 改路徑 | 沒有 | 沒有 | 還沒畫 |
| 9 | 改檔名 | 沒有 | 沒有 | 還沒畫 |
| 10 | 登入 | 沒有 | 沒有 | 還沒畫 |

## Brand & Style

這是 Alex 一個人每天用的工具，用來取代 VueTorrent。標準只有一條：Alex 自己喜歡。他說：「這個 App 是給我用沒錯，但是既然是我用的話，所以主題一定要是我喜歡的。」

第二條是美感。Alex 否決第一輪四個方向時說：「要讓這個畫面人家一看看到就會覺得我想用這個 App，所以美感是絕對必要的。」簡潔他要，「沒有美感」的灰色後台他不要。

樣子學 MOZE 記帳：資訊多，但靠熟悉的圖示和主次讓人看得懂。每列左邊一個大的彩色圓圈，名稱和數字大，分類這類次要資訊變成小的外框標籤。顏色只用來表示意思，不拿來裝飾。參考截圖：`imports/moze-home-list.png`（每列大圓圈加外框標籤）、`imports/moze-home-empty.png`、`imports/moze-calendar-full.png`（深藍底，顏色只表示意思）。

介面系統是 shadcn/ui（repo 已裝，new-york、zinc、lucide 圖示）。這份只寫品牌層：配色角色、比較圓的形狀、狀態圓圈和幾個自訂元件。Dialog、Sheet、DropdownMenu、Checkbox、Tabs、Toast 的結構沿用 shadcn。

不要的方向（來自第一輪的回饋）：公司後台的灰階表格、終端機的極客風、報紙排版、深紫配粉紅的糖果色。

## Colors

兩套顏色都要，跟著系統的淺色、深色模式切換。白底是淺色，深藍夜是深色。Alex 對兩套的回答是「都好」，所以顏色照角色分，換底色時角色不變，只換色值。代價是每張畫面都要在兩種模式下各看一次。為了守 15 張上限，正式稿只畫白底；深藍夜在實作時截圖檢查，必要時多畫一張深藍夜的關鍵畫面，算進 15 張（memlog #37）。

**狀態（7 種）**：每種狀態一個顏色加一個圖示，不能只靠顏色分。

| 角色 | 淺色 | 深色 | 圖示 | 用在 |
|---|---|---|---|---|
| `status-downloading` | `#2F6FDF` | `#5AA9E0` | 向下箭頭 | 下載中；全域下載速度的 ↓ |
| `status-seeding` | `#278A4F` | `#7FBF8E` | 向上箭頭 | 做種中；全域上傳速度的 ↑ |
| `status-done` | `#141414` | `#7D8BA0` | 打勾 | 已完成（不再做種，含已停止的做完種子，memlog #118） |
| `status-paused` | `#B26F0C` | `#E0AD62` | 兩條直線 | 已暫停 |
| `status-stalled` | `#C9581E` | `#E3925F` | 沙漏 | 停滯（沒有來源）；也當警告用，見下面 |
| `status-error` | `#D93A3A` | `#E0707F` | 驚嘆號 | 錯誤；私人（PT）種子找不到檔案（做不了種，memlog #120）；改檔名撞名的列 |
| `status-archived` | `#65655F` | `#95A1B2` | 封存盒 | 已整理：一般種子找不到檔案，留著當紀錄 |

圓圈裡的圖示用 `{colors.status-icon}`：白底版是白色圖示，深藍夜版是深色圖示（`#0F1720`）。深藍夜的圓圈顏色比較淡，白色圖示會看不清楚，所以反過來。

**警告不另外加角色**（Alex 選，memlog #121）：借現有的狀態色。「用 `status-stalled`」只指圖示和 1px 外框，字一律用 `text`：淺色 `status-stalled` 當小字只有 4.3，不到 4.5；當圖形是 3 以上，過（Claude 代決，memlog #125）。

- 警告用 `status-stalled`：速度膠囊出問題、連不到家和 Cloudflare 過期的提示條、改檔名預覽裡「猜的」集數。
- 撞名用 `status-error`：改檔名撞名的列和「有 N 列撞名」那行字。
- 改檔名預覽裡「抓到的」集數用一般字色 `text`。

**其他角色**

- **主要動作 `accent`**（`#141414`／`#6CB4E4`）：新增按鈕、選中的分類分頁、選中的詳情分頁、勾選框、詳情儲存位置區塊的改路徑按鈕、詳情對應的那一列的內框、鍵盤焦點的外框。白底版是黑色，深藍夜版是亮藍。
- **選取**：被勾選的列底色 `{colors.selection-row}`（`#EEF4FF`／`#25344A`）。選取列在白底版是黑底白字，在深藍夜版反過來是淺底深字（`{colors.selection-bar}`）。
- **刪除 `delete`**：跟 `status-error` 同色。只用在選取列的「刪除（含檔案）」按鈕和刪除確認。
- **媒體庫 `media-library`**（`#6A45C8`／`#A48FE0`）：位置標籤落在媒體庫時用紫色字加淡紫底（`{colors.media-library-tint}`，12% 透明度）。紫色只表示「已經在媒體庫」，不拿來做別的事。深色模式的淡紫底要不要看得出來還沒定，見 `EXPERIENCE.md` 的待決問題；沒定之前照「沒有底色」畫。
- **好 `good`**（`#18753F`／`#8FD19E`）：分享率到 1 以上時，數字變綠。
- **文字**：`text`、`text-muted`（次要資訊、標籤字）、`text-faint`（未勾選的勾選框外框、分頁點點、hover 時的外框）。
- **表面**：`surface-page`（頁面底）、`surface`（卡片、列表、詳情面板）、`surface-muted`（看板欄底、數字小卡、儲存位置區塊）、`border`（細線和外框）、`track`（進度條和進度環的底）。

**shadcn 變數對照**（Claude 代決，memlog #124）：深色模式一律用同名的 `-dark` 值。

| shadcn 變數 | 品牌角色 |
|---|---|
| `background` | `surface-page` |
| `foreground` | `text` |
| `card`、`popover` | `surface` |
| `card-foreground`、`popover-foreground` | `text` |
| `primary` | 品牌的 `accent` |
| `primary-foreground` | 品牌的 `accent-foreground` |
| `secondary`、`muted` | `surface-muted` |
| `secondary-foreground` | `text` |
| `muted-foreground` | `text-muted` |
| shadcn 的 `accent`（選單 hover、Skeleton 底） | `surface-muted` |
| shadcn 的 `accent-foreground` | `text` |
| `destructive` | `delete`（字用 `delete-foreground`） |
| `border`、`input` | `border` |
| `ring` | 品牌的 `accent` |

- 撞名：品牌的 `accent` 在程式裡接到 shadcn 的 `--primary`；shadcn 的 `--accent` 接 `surface-muted`。規格裡提到「accent」一律指品牌的。
- 結果：選單 hover 和骨架是淡灰底，不會變整塊黑。Dialog、選單、底部面板在深色模式是 `surface-dark`，跟卡片同色。
- 對話框後面的遮罩沿用 shadcn 預設，不另外定。

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
| `status-archived`：圖示對圓圈／圓圈對 `surface` | 5.87／5.87 | 6.89／6.26 | 3 |
| `accent-foreground` 在 `accent`（新增按鈕、選中的分頁） | 18.4 | 8.0 | 4.5，過 |
| `selection-bar-foreground` 在 `selection-bar`（選取列的字） | 18.4 | 15.5 | 4.5，過 |
| 狀態色當文字，在 `surface`（詳情狀態大字 28px 粗體算大字） | 4.1 到 18.4 | 4.7 到 8.1 | 大字 3，全過；4.5 有三個沒過：淺色 `status-paused` 4.1、`status-stalled` 4.3、`status-seeding` 4.3 |
| 選中分頁裡的淡色數量（照 demo：`accent-foreground` 75% 透明疊在 `accent` 上；規格還沒定這個顏色） | 10.6 | 4.9 | 4.5，過 |
| `text-muted` 在 `selection-row`（被勾選的列） | 5.3 | 4.8 | 4.5，過 |

調了哪些（舊值 → 新值）：

- 淺色：`status-paused` #D38A17 → #B26F0C、`status-stalled` #E06A2C → #C9581E、`status-seeding` #2E9D5B → #278A4F、`good` #1F8A4C → #18753F、`media-library` #7A55D6 → #6A45C8、`text-muted` #6E6E6A → #65655F、`text-faint` #A3A39E → #8C8C87。
- 深色：`status-icon-dark` 和 `delete-foreground-dark` 從白色改成 #0F1720（淡色底配深色字）、`text-muted-dark` #8B97A8 → #95A1B2、`text-faint-dark` #5D6A7D → #67758A。

畫布上的方向 K 是調之前的顏色。兩邊不一樣時，以這份為準。

## Typography

兩種字型。介面全部用系統字（Apple 系統字、PingFang TC、Noto Sans TC），路徑用等寬字（`{typography.path}`），因為路徑要一個字一個字對。

| 角色 | 大小／粗細／行高 | 用在 |
|---|---|---|
| `page-title` | 26px／700／1.2 | 頁首「種子」 |
| `detail-hero` | 28px／700／1.2 | 詳情的狀態大字，例如「做種 41 天」，用狀態色。只用在同名元件 `detail-hero`（詳情狀態區）裡 |
| `stat-value` | 20px／700／1.2 | 詳情的數字小卡 |
| `row-value` | 18px／700／1.2，等寬數字 | 列表列右邊的大數字（目前排序的欄位） |
| `card-value` | 電腦 17px、手機 22px／700／1.2，等寬數字 | 看板卡片右上角的百分比（Claude 代決，memlog #124） |
| `detail-name` | 16px／700／1.2 | 詳情頂端固定的種子名稱 |
| `column-title` | 15px／700／1.2 | 看板欄標題 |
| `body` | 13px／400／1.4 | 一般文字、排序按鈕 |
| `row-name` | 13px／600／1.4 | 列表列和卡片的種子名稱 |
| `meta` | 12px／400／1.4 | 次要資訊（剩餘時間、速度、數字小卡標題） |
| `tag` | 11px／400／1.4 | 分類標籤、位置標籤、列表列第二行 |
| `path` | 12px／400／1.5，等寬字 | 完整路徑（會展開成多行，所以行高鬆一點） |

行高、`card-value` 都是 Claude 代決（memlog #124）。種子名稱一律一行，超過用「…」切掉。數字用等寬數字（`tabular-nums`），換值時不會跳動。

## Layout & Spacing

沿用 Tailwind 的 4 倍數尺度。畫稿實際用到的間距：4、6、8、10、12、14、16px。

**電腦**

- 內容最寬 `{spacing.content-max}`（1240px），置中，四邊留 `{spacing.page-desktop}`。底部多留 `{spacing.page-desktop-bottom}`，讓浮在下面的選取列不會蓋住最後一列。
- 由上到下：頁首 → 分類分頁和排序按鈕同一排 → 內容。
- 頁首由左到右（Claude 代決，memlog #124）：標題「種子」、下載速度膠囊、上傳速度膠囊、空白、搜尋（放大鏡）、「新增」（`accent` 膠囊）、快捷鍵（鍵盤圖示）、設定（齒輪）。搜尋、快捷鍵、設定是 36px 的圓形圖示按鈕（`{components.header-icon-button}`），快捷鍵和設定在最右邊（memlog #53 的「右上角」）。搜尋平常藏在放大鏡後面，點了或按 `/` 才打開；快捷鍵按鈕點了打開快捷鍵說明視窗（memlog #53）；設定按鈕進原本的設定頁。
- 分類分頁那一排放不下時可以左右捲，排序按鈕固定在右邊不動、不縮字（見 category-tabs，Claude 代決，memlog #124）。
- 看板：5 欄（Alex 選，memlog #104）。左邊 4 個工作欄等寬，順序是要處理、下載中、做種中、完成；最右邊是已整理欄，平常收著，樣子跟自動收合的收合欄一樣（64px），點了展開成一般欄。欄距 `{spacing.board-gap}`。
- 看板自動收合時（規則見 `EXPERIENCE.md` 的動態）：收起的欄變成 64px 的窄條（`{components.board-column-collapsed.width}`），正在捲的那欄吃掉剩下的寬度，卡片照 `repeat(auto-fill, minmax(270px, 1fr))` 排，一排 2 到 3 張。數值取自 demo，Alex 看過說畫面可以（memlog #49、#50、#57）。
- 列表加詳情：左邊列表最寬 `{spacing.list-column-max}`（560px），右邊詳情面板吃掉剩下的寬度，中間 16px。
- 看板模式點卡片時，詳情面板寬 400px 從右邊滑出來，蓋在看板上（見 detail-panel）。

**手機**（畫稿寬 390px）

- 四邊留 `{spacing.page-phone}`；列表模式左右收到 12px（`{spacing.page-phone-list}`），讓名稱多一點字。
- 頂端由上到下（Claude 代決，memlog #124）：
  1. 第一排：左邊標題「種子」（`page-title`），右邊搜尋、新增兩顆 44px 圓按鈕。手機不放快捷鍵按鈕（沒有鍵盤），設定的入口在分類清單最下面一列（見 category-sheet）。
  2. 第二排：速度那一行字（`meta` 12px，memlog #72）。
  3. 第三排：左邊分類按鈕（例如「mteam-tv 203 ▾」），右邊排序按鈕。兩顆都是 44px 高的膠囊，中間 8px。
  4. 第四排（只有看板模式）：狀態分頁（見 status-tabs）。
- 搜尋一樣平常只有放大鏡，點了才打開，打開時輸入框蓋住第一排。
- 看板變成一次看一欄，上面是狀態分頁。手機只有 4 個工作欄，不放已整理（Alex 選，memlog #105）。卡片一排 1 張（卡片最小 270px，358px 放不下兩張；Claude 代決，memlog #124）。詳情是從下面滑上來的面板。

**眼睛不要左右來回**（taste-log 原則 2）：要一起看的東西放在同一條線上。詳情頂端的名稱、「第 N 個／共 M 個」和前後按鈕：電腦列表模式放同一排；手機和看板模式的窄面板，「第 N 個」和前後按鈕放在名稱正下方那一排（見 detail-header，Claude 代決，memlog #124）。列表列的名稱和右邊的大數字在同一列。

## Elevation & Depth

層次主要靠底色深淺：`surface-page` 最底，`surface` 疊在上面，`surface-muted` 用在面板裡的區塊。

陰影只有三種：

- 看板卡片：`0 1px 2px rgba(0,0,0,.05)`，幾乎看不到，只讓卡片離開欄底一點點。
- 選取列：`0 12px 32px rgba(0,0,0,.28)`，它浮在內容上面，要明顯。看板模式滑出來的詳情面板也用這一種，不加第四種（Claude 代決，memlog #124）。
- 手機底部面板：`0 -12px 40px rgba(0,0,0,.18)`，後面加一層 `rgba(0,0,0,.18)` 的遮罩。

## Shapes

比 shadcn 預設圓很多。按鈕、分類分頁、詳情分頁、排序按鈕、標籤、選取列全部是膠囊（`{rounded.full}`）。狀態圓圈和前後按鈕是正圓。

| Token | 值 | 用在 |
|---|---|---|
| `xs` | 6px | 勾選框 |
| `bar` | 9px | 進度條 |
| `row` | 14px | 列表列（選取、hover、詳情正在看時的底色形狀）、手機狀態分頁選中的那格 |
| `card` | 16px | 看板卡片、數字小卡、儲存位置區塊、手機狀態分頁的長條 |
| `panel` | 22px | 看板欄、列表外框、詳情面板、手機兩排的選取列 |
| `sheet` | 28px | 手機底部面板的上緣 |
| `full` | 9999px | 膠囊 |

## Components

沿用 shadcn、不改外觀的：`Dialog`、`AlertDialog`、`Sheet`、`DropdownMenu`、`Checkbox` 的行為、`Tabs` 的行為、`Toast`、`Skeleton`、`Input`。Toast 的位置：電腦右下角，手機畫面上方（規則見 `EXPERIENCE.md` State Patterns 的 toast，Claude 代決，memlog #124）。

**hover 和不能按**（Claude 代決，memlog #124）

- 列表列：hover 時底色 `surface-muted`，圓角 `row`。已勾選的列 hover 不變。
- 看板卡片、收合欄：hover 時多一圈 1px `text-faint` 內框。
- 有外框的膠囊（沒選中的分類分頁、排序按鈕、複製、加到常用、改檔名、圖示按鈕）：hover 時外框從 `border` 變成 `text-faint`。
- 實心按鈕（新增、改路徑、刪除、選中的分頁）：hover 時透明度 90%（shadcn 預設）。
- 選單項目：hover 底色 `surface-muted`（見 shadcn 變數對照）。
- 不能按：整顆透明度 50%，滑鼠變禁止符號，沒有 hover（shadcn 預設）。
- 手機沒有 hover，按下去的當下用同一個 hover 樣子。

**鍵盤焦點**（Claude 代決，memlog #124）：2px `accent` 外框（`{components.focus-ring}`），跟元件之間空 2px，形狀跟著元件的圓角。只有用鍵盤時出現（`:focus-visible`），滑鼠點不出現。所有可以按的東西都用同一個外框，包括分類分頁、排序按鈕、看板卡片、收合欄、勾選框、圖示按鈕、對話框按鈕。例外：選單項目照 shadcn 用 hover 的底色；選取列上的按鈕外框改用 `selection-bar-foreground`。深色模式用 `accent-dark`。跟「詳情正在看」的內框長得不一樣（見 list-row）。

品牌層的元件：

- **狀態圓圈 status-circle**：外圈是進度環，裡面是填滿狀態色的圓（直徑 80%），中間 `{colors.status-icon}` 圖示（42%）。下載中、已暫停、停滯的外圈畫出進度（例如 87%），其他狀態外圈是滿的。尺寸：列表列 36px、看板卡片 32px（Alex 選，照 demo，memlog #115）、看板欄標題、收合欄和手機狀態分頁 28px、詳情 64px。畫稿用 `conic-gradient` 畫進度環，實作要換成 SVG `stroke-dashoffset`（見 `EXPERIENCE.md` 的動態）。
- **全域速度膠囊 speed-pill**：頁首兩顆。下載是藍色 ↓ 加速度加「不限速」或上限，上傳是綠色 ↑ 加目前速度，後面寫「上限 32.7」（寫出「上限」兩個字，不用斜線）。上限用 `text-muted`。出問題時用 `status-stalled`（memlog #121）。手機沒有膠囊外框，改成標題下面一行字。
- **頁首圖示按鈕 header-icon-button**：搜尋、快捷鍵、設定。36px 圓形，`surface` 底、`border` 外框；手機 44px（Claude 代決，memlog #124）。
- **分類分頁 category-tabs**：膠囊，名稱後面接淡色的數量（例如「mteam-tv 203」），數量不含已整理（memlog #106）。選中的是 `accent` 底。滑鼠移上去的 tooltip 顯示它的快捷鍵數字（memlog #55），第 10 個分頁以後沒有數字鍵，tooltip 也不寫數字。放不下時（Claude 代決，memlog #124）：分頁那一排左右捲，排序按鈕固定在右邊；不顯示捲軸，右邊被切到的地方用 `surface-page` 到透明的 24px 漸層蓋住；換分類時選中的分頁自動捲進看得到的範圍；不折成兩排，不做「更多」選單。
- **手機分類清單 category-sheet**：手機點「分類名 ▾」從下面彈出的分類清單（memlog #47），用品牌底部面板，面板標題寫「分類」。每列（Claude 代決，memlog #124）：列高 52px，左邊分類名（`body` 13px），右邊數量（`text-muted`、等寬數字，不含已整理）。目前的分類名字粗體 700，最左邊一個打勾圖示。「全部」固定第一列，其他照設定頁的順序，沒有種子的分類不列（memlog #89）。最下面一列是「設定」，前面一個齒輪圖示，跟上面的分類用一條 `border` 細線分開。
- **手機狀態分頁 status-tabs**：手機看板上面的一排狀態分頁，一次看一欄，左右滑換欄。只有 4 格：要處理、下載中、做種中、完成，沒有已整理（Alex 選，memlog #105）。每格（Claude 代決，memlog #124）：4 格平分寬度，格距 6px，高 56px。上面一行 28px 狀態圓圈，右邊接數量（`meta` 12px、粗體 700、等寬數字）；下面一行欄名（`tag` 11px）。整排放在一條 `surface-muted` 底、圓角 `card` 的長條裡，內距 4px。選中的那格：`surface` 底、圓角 `row`、看板卡片那種陰影，欄名用 `text` 粗體 700；沒選中的欄名用 `text-muted`。選中的不用 `accent` 底，因為白底版 `accent` 是黑色，「完成」的黑色圓圈會看不到。
- **搜尋框 search-box**：頁首一顆放大鏡圓按鈕，點了或按 `/` 才打開輸入框，`Esc` 清除（memlog #53）。打開後（Claude 代決，memlog #124）：電腦是放大鏡原地往左變成 240px 寬、36px 高的膠囊輸入框（`surface` 底、`border` 外框），左邊放大鏡圖示，右邊 ✕，提示字「找名字」，蓋在頁首中間的空白上，其他按鈕不動。手機是輸入框蓋住第一排，寬度拉滿，44px 高，右邊一個「取消」文字按鈕，速度那一行以下不動。
- **快捷鍵說明視窗 shortcut-help**：頁首右上角快捷鍵按鈕或按 `?` 打開（memlog #53）。結構沿用 shadcn `Dialog`，內容見 `EXPERIENCE.md` 的 Interaction Primitives。不畫，不算進 15 張（Claude 代決，memlog #124）。
- **拖檔遮罩 drop-overlay**：.torrent 檔拖到 App 任何地方時，畫面變暗寫「放開就新增」（memlog #92）。沒有畫稿。
- **提示條 alert-bar**：頁首下面一整條，寫出問題加一顆按鈕（「重試」或「重新登入」）。用 `status-stalled`（Alex 選，memlog #121）。一次只出現一條，優先順序見 `EXPERIENCE.md` State Patterns。沒有畫稿。
- **排序按鈕 sort-pill**：膠囊。左邊一個小膠囊寫目前是「看板」還是「列表」並配圖示，右邊粗體「排序：做種時間 ↓」，最後一個 ▾。方向只用箭頭，箭頭只是顯示、不能單獨點；「狀態」沒有方向，不放箭頭（Claude 代決，memlog #124）。淡色的「（這個分類記住的）」只在排序是 App 自己換成這個分類記住的時候出現（Claude 代決，memlog #124，規則見 `EXPERIENCE.md`）。手機省字：只留檢視圖示（不寫「看板」「列表」）、排序名稱、方向箭頭、▾，例如「▦ 做種時間 ↓ ▾」；不寫「排序：」，也不寫「（這個分類記住的）」，那句改成第三排下面一行 `meta` 12px、`text-muted` 的字（Claude 代決，memlog #124）。
- **排序選單 sort-menu**：沒有畫稿（Claude 代決，memlog #124）。電腦用 shadcn `DropdownMenu`，寬 260px。上面 5 項，每項右邊用 `text-muted` 寫快捷鍵數字 1 到 5；一條分隔線，下面一項「更多 ▾」。點「更多」在同一個選單裡往下展開，不開子選單；分組名用小標（`tag` 11px、`text-muted`）。選單最高 70% 螢幕高，超過在選單裡捲。目前選中的那一項左邊打勾，名稱後面 `text-muted` 的字加箭頭，例如「做種時間　久的在前 ↓」。手機用品牌底部面板，標題「排序」，每列高 52px，不顯示快捷鍵數字。內容順序見 `EXPERIENCE.md`。
- **看板欄 board-column**：`surface-muted` 底，標題列是 28px 狀態圓圈、欄名、淡色數量。每欄自己捲，捲到底載入下一批（memlog #48），載入時欄底畫 2 張卡片骨架（Claude 代決，memlog #124）。自動收合時正在捲的欄變寬，卡片最小 270px，一排 2 到 3 張，名稱一樣一行加「…」（memlog #50）。
- **收合欄 board-column-collapsed**：自動收合時其他欄變成的窄條。寬 64px，上面 28px 狀態圓圈加數量（12px，`text-muted`），下面直書欄名（14px／700）。點了展開。數值取自 demo（`.working/demo-board/index.html`），Alex 看過說畫面可以（memlog #57）。
- **已整理欄**：看板第 5 欄，放最右邊（Alex 選，memlog #104）。平常收著，收著的樣子就是收合欄（64px，28px 灰色封存盒圓圈加數量，直書「已整理」）；點了展開成一般的看板欄。叫「已整理欄」，不叫「窄條」，跟自動收合不撞名（memlog #105、#108）。只有電腦看板有，手機不放（memlog #105）。
- **看板卡片 board-card**：`surface` 底。第一行左邊 32px 狀態圓圈（Alex 選，照 demo，memlog #115），右邊接名稱（一行），最右邊百分比（`{typography.card-value}`，只有下載中、暫停、停滯有）。下載中的圓圈外圈畫進度，驚艷的進度環動畫也在卡片上轉（memlog #115）。第二行是剩餘時間和速度，或一句狀態說明（「卡在 87%，沒有來源」「做種滿 14 天」「今天 09:12 下載好了」，memlog #119）。有進度的卡片加一條 4px 進度條，用狀態色。最下面是分類標籤和位置標籤。勾選框掛在左上角，一半在卡片外面（往上 6px、往左 6px），自己有 `surface` 底（Claude 代決，memlog #124）。
- **列表列 list-row**：勾選框、36px 狀態圓圈、名稱和第二行、右邊的大數字。被勾選時底色是 `selection-row`；詳情正在看的那一列加 2px `accent` 內框（`{components.list-row.viewing-ring}`）。以下都是 Claude 代決（memlog #124）：
  - 勾選框在最左邊，垂直置中。電腦上這 20px 的位置一直留著（藏著時是空的），列不會跳；手機平常不留位置，進入選取時整列往右推 28px，0.2 秒。
  - 第二行是位置標籤、大小、速度。手機放不下時先砍速度，再砍大小；位置標籤一定留著，最寬佔一半，超過用「…」。速度是 0 時不寫。不放分類標籤。
  - 電腦上大數字左邊多一欄「分享率 3.12」，1 以上用 `good`。排序是「分享率」時這一欄藏起來，右邊的大數字就是分享率。手機沒有這一欄。
  - 右邊的大數字靠右對齊，等寬數字，不固定欄寬，最寬 160px。數字類用 `row-value`（18px 粗體）；文字類（分類、路徑、Hash、註解）用 `body` 13px、`text-muted`，超過 160px 切掉，路徑從前面切，Hash 只寫前 8 碼（用 `path` 等寬字）。各欄位的寫法見 `EXPERIENCE.md` 的數字寫法。
- **分類標籤 category-pill**：11px，`border` 外框，`text-muted` 字，沒有底色。
- **位置標籤 location-tag**：跟分類標籤同樣大小，前面加一個資料夾圖示。一般位置是外框加 `text-muted`；媒體庫是淡紫底加紫色的字，粗細 600（跟 `row-name` 同一級，Claude 代決，memlog #124），沒有外框。
- **勾選框 checkbox**：20px，圓角 6px。勾選時 `accent` 底加白勾（深色模式是深色勾），沒勾時 2px `text-faint` 外框。在列表列的最左邊、看板卡片的左上角（Claude 代決，memlog #124）。
- **進度條 progress-bar**：4px 高，`track` 底，填的部分用狀態色。
- **選取列 selection-bar**：浮在畫面下方。電腦是置中的膠囊，內容由左到右（Claude 代決，memlog #124）：「已選 N 個」（粗）、「共 X GB」（淡）、取消（只有字，沒有框）、改路徑（外框膠囊，沒有底色，字和 1px 外框用 `selection-bar-foreground`，一次搬全部選的，memlog #80）、刪除（含檔案）（`delete` 實心，放最右邊）。手機左右各留 16px，變成兩排，圓角改成 `panel`（22px）：第一排左邊「已選 3 個　共 301.2 GB」，右邊「取消」（點擊範圍 44px）；第二排改路徑、刪除（含檔案）各佔一半，高 44px，中間 8px。
- **詳情面板 detail-panel**：電腦右邊的 `surface` 面板，圓角 22px。看板模式滑出來的那一種（Claude 代決，memlog #124）：寬 400px，貼著內容區右邊，上緣對齊看板上緣，往下到畫面底；用選取列那種陰影；沒有遮罩；固定頭右上角多一顆 ✕。滑出來時從右邊 24px 淡入，0.3 秒，`cubic-bezier(.2,.8,.2,1)`，只動 `transform` 和 `opacity`。400px 會蓋住已整理欄、完成欄和一部分做種中欄；點的卡片在被蓋住的欄裡時會被蓋住，不另外處理。窄版裡數字小卡照樣 3 張一排，儲存位置區塊照三層排。
- **詳情固定頭 detail-header**：種子名稱（`{typography.detail-name}`，一行加「…」）、‹、「第 N 個／共 M 個」、›、「⋯」。下面一條 `border` 細線。前後按鈕電腦 36px、手機 44px。「⋯」選單只有一項，依目前狀態是「暫停」或「繼續」（memlog #88）。排法（Claude 代決，memlog #124）：
  - 電腦列表模式（面板約 660px）：一排。名稱吃掉剩下的寬度，接著 ‹、「第 12 個／共 80 個」、›，最右邊「⋯」（36px 圓按鈕）。
  - 手機、電腦看板模式的窄面板（400px）：兩排，都固定。第一排是名稱、「⋯」、✕；第二排是 ‹、「第 12 個／共 80 個」、›，靠左，緊貼在名稱正下方。手機三顆按鈕都是 44px。
  - 看板模式在「第 N 個」前面多寫欄名，例如「做種中　第 3 個／共 80 個」。
  - 由來截圖：`imports/vuetorrent-detail-content-tab.png`（VueTorrent 切到「內容」分頁就看不到名稱）。
- **詳情分頁 detail-tabs**：只有概覽、檔案兩個（Alex 選，memlog #112）。追蹤者、用戶分頁不做，用到再加。膠囊，選中的是 `accent` 底。
- **詳情狀態區 detail-hero**：64px 狀態圓圈加狀態大字（`{typography.detail-hero}`，狀態色），下面一行 `text-muted` 摘要。大字是「狀態用語加一個數字」，中間一個全形空白；摘要用「 · 」分開。每種狀態寫什麼見 `EXPERIENCE.md` 的 detail-hero 表（Claude 代決，memlog #124）。元件和字型角色同名：字型角色 `detail-hero` 就是這個元件的狀態大字。
- **數字小卡 stat-tile**：3 張一排，`surface-muted` 底，上面淡色標題、下面 `{typography.stat-value}`。三張依狀態換（Claude 代決，memlog #124，表見 `EXPERIENCE.md`）。
- **儲存位置區塊 save-path-block**：`surface-muted` 底。由上到下三層，電腦、手機、看板模式的窄面板都一樣（Claude 代決，memlog #124）：
  1. 「儲存位置」加位置標籤。
  2. 完整路徑，一整排寬（等寬字，一行；太長從前面切，留後面，例如「…media/tv/牧神記」）。
  3. 四顆膠囊按鈕（電腦 34px），靠左，間距 8px，順序：複製、☆ 加到常用、改路徑、改檔名。改檔名跟改路徑並排（memlog #93）。改路徑是 `accent` 實心，一個區塊只有這一顆實心；改檔名跟複製、加到常用一樣是外框膠囊（`surface` 底、`border` 外框、`text` 字）。手機四顆排成 2 乘 2，每顆等寬、高 44px：上排複製、☆ 加到常用，下排改路徑、改檔名。
- **底部面板 bottom-sheet**：手機的詳情，刪除確認、新增種子、排序選單、分類清單也用它。上緣圓角 28px，後面的列表變淡加遮罩，右上角一顆 ✕（44px）也能關，可以往上拉到全螢幕（memlog #64）。細節（Claude 代決，memlog #124）：
  - 一打開多高：詳情是螢幕高的 70%，看得到固定頭、分頁、狀態區、數字小卡；刪除確認、新增種子、排序、分類清單高度跟著內容，最高 90%。
  - 頂端：把手（44×5px）置中，離面板上緣 8px，把手那一帶高 20px，下面才是內容的第一排。✕ 在內容第一排的最右邊，不跟把手同一排。
  - 拉動：往上拉到全螢幕；往下拉超過一半高度就關掉，沒超過彈回 70%。
  - 全螢幕時：上緣圓角變 0，頂端留系統的安全區（`env(safe-area-inset-top)`），把手留著。
- **主要按鈕 button-primary**：膠囊，`accent` 底。用在「新增」和詳情儲存位置區塊的「改路徑」。改檔名和選取列的改路徑不用它，是外框膠囊（Claude 代決，memlog #124）。
- **登入 login**（第 10 張）：只有帳號、密碼兩個欄位，密碼欄加一顆顯示密碼的眼睛按鈕，加一顆「登入」按鈕，跟現在的程式一樣（Alex 選，memlog #109）。qBittorrent 位址不放這裡。有「記住我」勾選（memlog #110）。行為見 `EXPERIENCE.md`。沒有畫稿。
- **新增種子 add-torrent、刪除確認 delete-confirm、改路徑 change-path、改檔名 rename**：還沒有畫稿。電腦先沿用 shadcn `Dialog` 的外觀，刪除確認用 shadcn `AlertDialog`。手機上新增種子和刪除確認用跟詳情同一種的品牌底部面板（bottom-sheet，不是 shadcn `Sheet`，memlog #63、#64、#92、#102）；改路徑、改檔名在手機怎麼呈現還沒定。各張的手機呈現見 `EXPERIENCE.md` 的 Responsive & Platform，新增種子、改路徑的版面見待決問題。
  - 刪除確認（Claude 代決，memlog #124）：電腦寬 512px（shadcn 預設）。取消在刪除按鈕左邊，外框樣式，兩顆靠右；手機只有最下面一顆刪除按鈕，取消用 ✕ 或往下拉。刪除按鈕不管有沒有勾「連檔案一起刪」都用 `delete` 色。清單的長檔名一行加「…」，大小靠右、等寬數字；展開「還有 N 個」後清單在對話框裡自己捲，最高 320px。

**詳情由上到下**（Claude 代決，memlog #124）

- 固定不動（兩塊）：詳情固定頭，下面接詳情分頁（概覽、檔案）。
- 概覽分頁（會捲），由上到下：詳情狀態區 detail-hero、數字小卡 3 張一排、儲存位置區塊、資訊清單（分類、大小、加入時間、完成時間、已下載、已上傳）。資訊清單一列一項，左邊 `text-muted` 的標題，右邊緊接著值，不把值推到最右邊（原則 2）。
- 檔案分頁：固定的兩塊下面，整塊都給檔案清單（memlog #113）。

## Do's and Don'ts

| 要 | 不要 |
|---|---|
| 狀態用顏色加圖示一起表示 | 只靠顏色分狀態 |
| 顏色照角色用，換主題只換色值 | 為了好看在某個畫面加角色以外的顏色 |
| 警告借 `status-stalled`，撞名借 `status-error`（memlog #121） | 為警告另外加一個顏色 |
| 紫色只表示媒體庫 | 把紫色拿來當強調色或裝飾 |
| 紅色只用在錯誤和刪除 | 把紅色用在一般按鈕 |
| 種子名稱一行，用「…」切 | 讓名稱折成兩三行把列撐高 |
| 名稱、「第 N 個／共 M 個」、前後按鈕放在一起：電腦放同一排；手機和窄面板放名稱正下方那一排 | 把總數放在另一個角落 |
| 按鈕、分頁、標籤用膠囊 | 混用直角和膠囊 |
| 正式稿畫白底，實作時每張畫面在深藍夜截圖檢查一次 | 只看一套顏色就交；或白底、深藍夜各畫一套正式稿（會超過 15 張） |
| 全域速度只放「現在」的數字 | 放速度波形圖（Alex：「波形圖好像沒有什麼用」） |
