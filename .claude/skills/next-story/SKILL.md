---
name: next-story
description: react-torrent 的「下一張 story」自動流程：從 sprint-status 找下一張，開分支，用 bmad-build-auto 寫規格、實作、審查，截圖對設計稿，交給 /ship 開 PR、等 CI 全綠、合併，然後自動接下一張。碰到設計決定、CI 不是偶發的紅燈、超過每月 commit 上限、epic 做完，就停下來。當 Alex 說「下一個 story」「繼續做」「做 <story-id>」「把 epic N 做完」時使用。「接下來做什麼」「挑一張」不在這裡，那要先列候選給他選。
---

# /next-story：react-torrent 的 story 流水線

把下一張 story 從開分支一路帶到 PR 合併，然後接下一張，**中間不問**。只有碰到真的屬於 Alex 的決定才停。

這份是 react-torrent 專用，照 Vido 的 next-story 改寫。分工：本 skill 管「哪一張、開分支、實作、審查、截圖」；`/ship`（`.claude/skills/ship/SKILL.md`）管「送出檢查、PR、CI、合併」。

## 先分清楚：「做下一張」還是「挑一張」

| Alex 說的 | 意思 | 做什麼 |
|---|---|---|
| 「下一個 story」「繼續做」「做 1-3」「把 epic 2 做完」 | 順序已經排好 | 走本 skill，直接做 |
| 「接下來做什麼」「挑一張」（沒指定） | 要他排優先 | **不要做**。列 2 到 3 張候選（各一句：做什麼、大小、碰不碰畫面）加推薦，停下來等他選 |

## 一定要守的規則（每一張都適用）

1. **AD-15**：自動流程和測試**不准**對真的 qBittorrent 做任何寫入（刪除、新增、搬移、改名、暫停繼續、改優先順序）。測試一律用假的 qBittorrent 回應。對真的 qBittorrent 只能讀，而且只在本機開發。
2. **AD-11**：寫框架程式（TanStack Start、Router、Query、shadcn、Vite、zod 等）前，先查跟 `package.json` 版本相同的官網文件，不要照記憶寫。PR 說明附查過的網址。
3. **AD-3**：qBittorrent 帳密只放容器的環境變數，瀏覽器什麼都不存。
4. **架構底稿優先**：`_bmad-output/planning-artifacts/architecture/architecture-react-torrent-2026-11-15/ARCHITECTURE-SPINE.md`。repo 根目錄的 `CLAUDE.md` 在 Story 1.1 重寫前是舊架構，衝突時以底稿為準。
5. **隱私**：有一個分類的真名和 Alex 整理檔案的流程不能進 git。文件和程式一律用代稱「X」「mteam-X」，路徑也是（`/data/media/X/incompleted`）。那些種子要當成「已經整理好」，不是錯誤。細節只寫「檔案被 Alex 自己的整理流程在 qBittorrent 外搬走（細節不進 git）」。
6. **repo 是公開的**：不寫 IP、帳密、token。
7. **不用破折號**：改用句號或冒號。
8. **每次 commit 前**跑 `bash .claude/skills/next-story/check.sh`，全部 `ok` 才能 commit。這支腳本查：破折號、兩個隱私字、內網 IP、`.env` 檔、本機秘密原文。
9. **截圖只用假資料**：真的種子名稱和路徑可能含隱私字，所以截圖一律接假的 qBittorrent 回應。截圖前後都跑一次 check.sh。
10. **瀏覽器一律用 `ego-browser` skill**。連不上就停下來告訴 Alex，不要改用別的瀏覽器工具。
11. **memlog** 只能用 `uv run _bmad/scripts/memlog.py append` 寫，不准手改。
12. **gh 一律用 Alex 的個人帳號**，每個要用 `gh` 的 shell 開頭先 `export GH_TOKEN=$(gh auth token --user j620656786206)`。不要用 `gh auth switch`（公司 repo 的 session 會把它切走）。
13. **Node 版本**：指令前面加 `source ~/.nvm/nvm.sh && nvm use`（照 `.nvmrc`）。版本沒裝就 `nvm install`。
14. 不用 git worktree，直接 `git checkout -b`。

## 0. 開工前

1. `git fetch origin`，確認 `origin/main` 有 `_bmad-output/planning-artifacts/epics.md` 和這份 skill。沒有就**停**：規劃文件還沒合進 main，要 Alex 先把 `design-rewrite` 合進去。
2. 工作區要乾淨（`git status --short` 是空的）。不乾淨就停，列出有哪些檔案。
3. 讀 `_bmad-output/implementation-artifacts/sprint-status.yaml`。

## 1. 找下一張

照順序找，找到第一張就停：

1. 狀態 `in-progress` 或 `review` 的 story（上次沒做完的，先收尾；看 §6 怎麼接）。
2. 目前 epic（狀態 `in-progress` 的那個；都沒有就是編號最小、還有 story 不是 `done` 的 epic）裡，下一張 `ready-for-dev`，再來是 `backlog`，照 story 編號順序。
3. 目前 epic 的 story 全部 `done` → **停**（見停止規則「epic 做完」）。不要自己跳到下一個 epic。

Alex 有指定 story 就直接用那張。

story 的代號長這樣：`1-3-前端地基-...`。下面用 `<id>` 代表前面的數字部分（例如 `1-3`），用 `<key>` 代表整個代號。

## 2. 開分支

```bash
git checkout main && git pull --ff-only
git checkout -b story/<id>
```

分支名稱只用數字（`story/1-3`），不放中文，避免路徑出問題。分支已經存在（上次停在一半）就直接 `git checkout story/<id>`，接著做。

這時候**不要**改 sprint-status：bmad-build-auto 開工時要乾淨的工作區。sprint-status 等 §5 再一起改。

## 3. 寫規格、實作、審查：bmad-build-auto

用 Skill 工具呼叫 `bmad-build-auto`，intent 寫：

```
Story <id>「<story 標題>」，在 _bmad-output/planning-artifacts/epics.md。
照這張 story 的涵蓋清單和全部 AC 實作。分支是 story/<id>。
```

它會自己做完這幾件事：

- 編譯 epic 的背景資料（`_bmad-output/implementation-artifacts/epic-<N>-context.md`）
- 寫規格檔（`_bmad-output/implementation-artifacts/spec-<id>-....md`），這就是「建檔」
- 用子代理實作
- 四層審查（Blind Hunter、Edge Case Hunter、Verification Gap、Intent Alignment），範圍內的問題自己修。**這就是 code review，不用再另外跑一次。**
- 在分支上 commit，不 push

專案規則已經寫進 `_bmad/custom/bmad-build-auto.toml` 的 `persistent_facts`，它每次都會讀到。

看它的結果：

| 結果 | 做什麼 |
|---|---|
| `status: done` | 繼續 §4 |
| `blocked`，原因是 `intent gap` 或規格缺決定 | **停**，照停止格式回報，把它列的問題原封不動給 Alex |
| `blocked`，原因是工作區不乾淨、找不到檔案這類機械問題 | 自己修，再跑一次；第二次還是一樣就停 |
| `followup_review_recommended: true` | 用同一份規格再呼叫一次 bmad-build-auto（intent 寫規格檔路徑），做第二輪審查 |

## 4. 截圖對設計稿（有畫面的 story 才做）

story 的 AC 要求 PR 附截圖，或這張有新增、修改畫面時：

1. 用假的 qBittorrent 回應把 App 跑起來（照這張或前面 story 建的假資料做法）。**不要接真的 qBittorrent 截圖。**
2. 照 `ego-browser` skill 的說明，照 AC 要的寬度和深淺色截圖（通常是電腦 1440px、手機 390px，淺色和深色）。
3. 跟設計稿對照：`_bmad-output/planning-artifacts/ux-designs/ux-react-torrent-2026-11-13/mockups/` 裡對應編號的畫稿（例如 S01、S02），加上 `DESIGN.md`、`EXPERIENCE.md`。
4. 截圖存到 `_bmad-output/implementation-artifacts/screenshots/<id>/`，檔名寫清楚（`desktop-dark-empty.png`）。這些截圖會跟著 PR 進 main。
5. 跑 check.sh，再 commit：`docs(<id>): 截圖`。

對照結果：

- 跟設計稿一樣，或差異是規格檔裡寫明的 → 繼續。
- 差異是實作錯了 → 自己修（修完重跑相關測試，再截一次）。
- 設計稿和 AC 對不上，或設計稿沒畫到、要自己補設計 → **停**（設計是 Alex 的決定）。
- ego-browser 連不上 → **停**，告訴 Alex。

## 5. 更新 sprint-status，交給 /ship

1. sprint-status：這張 story 標 `review`。如果這是 epic 的第一張，epic 標 `in-progress`。
2. 跑 check.sh，commit：`docs(<id>): sprint-status`。
3. 呼叫 `/ship`（`.claude/skills/ship/SKILL.md`）。它負責本機驗證、push、開 PR、把 sprint-status 改成 `done` 並附 PR 編號、等 CI、合併。

## 6. 接下一張

`/ship` 合併成功後，給一行摘要：

```
✅ <id> <標題>：PR #<N> 已合併，CI 全綠（<跑了哪些>）。本月 main 第 <n>/60 個 commit。
```

然後**直接回 §1**，不要問「要不要繼續」。

上次停在一半的接法：

- 分支在、還沒開 PR → 從 §3 或 §4 接（看規格檔的 `status`；`done` 就從 §4 接）。
- PR 已經開了 → 直接接 `/ship` 的 CI 那一步。

## 停止規則（碰到就停，講清楚卡在哪）

| 情況 | 為什麼 |
|---|---|
| 要做範圍、畫面行為、新依賴、資料格式的決定，規劃文件裡查不到答案 | 這是 Alex 的決定 |
| 設計稿和 AC 對不上、設計稿沒畫到、要自己補設計 | 設計是 Alex 的決定 |
| CI 紅燈不是偶發：重跑 2 次還紅，而且歷史看起來不是 GitHub 那邊的問題；或自己修了 3 次還紅 | 硬修會把 CI 修正和功能混在一起 |
| 合併後 main 這個月會超過 60 個 commit | 上限要先叫 `red-team`，不能自己放行（見 `/ship`） |
| 這個 epic 的 story 全部 `done` | 先看要不要跑 retro（Epic 1 的 retro 要決定要不要加 E2E 測試） |
| 新點子、不在 epics.md 裡的功能 | 先問 Alex，他同意才加 |
| ego-browser 連不上 | 全域規則：先跟 Alex 說，不准改用別的瀏覽器 |
| 要對真的 qBittorrent 做寫入才能驗證 | AD-15 不准，改用假的回應；真的做不到就停 |

停下來時，回覆照這個格式（Alex 只看得到最後一則，要短）：

```
停在：<id> 的 <哪一步>
原因：<一句話>
要你決定：<A 還是 B，各一句；我推薦哪個、為什麼>
已經做完：<哪些已合併、哪些在分支上還沒 push>
```

**不算**停止理由（自己處理）：lint 失敗、型別錯誤、測試失敗但原因清楚、GitHub 暫時連不上、`gh` 帳號被切走、偶發的 runner 斷線。

## 瑣碎的決定：自己決定，記下來

數字格式、寬度、用哪個現成 token、溢出怎麼處理、按鈕順序、照既有決定推得出來的預設值：自己決定，寫進規格檔的 Design Notes，PR 說明裡列一節「Claude 代決」，讓 Alex 事後否決。會影響品味、範圍、安全的才停下來問。

## 不要做的事

- 不要「挑一張」然後直接做。
- 不要把兩張 story 塞進同一個 PR。
- 不要跳過 check.sh。
- 不要合併不是這個流程自己建的分支（`/ship` 會擋）。
- 不要 commit `.env`、真資料截圖。
- 不要把 story 檔或 sprint-status 沒更新的 PR 合併。
