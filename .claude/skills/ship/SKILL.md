---
name: ship
description: react-torrent 的「改動到合併」流程：送出檢查、本機驗證、push、開 PR、CI 全綠才合併（squash）、更新 sprint-status。通常由 /next-story 呼叫；Alex 說「ship」「/ship」時也用。只合併這個流程自己從 Alex 帳號建的 story 分支（AR-15）。
---

# /ship：react-torrent 的合併流程

把目前分支上的改動帶到合併，中間不問。只有真的屬於 Alex 的決定才停。照 Vido 的 /ship 改寫，規則以本檔為準。

## 一定要守的規則

- **不准直接 commit 到 `main`**。分支一律從最新的 `main` 開。
- **不用 git worktree**。
- **gh 一律用 Alex 的個人帳號**：每個要用 `gh` 的 shell 開頭先 `export GH_TOKEN=$(gh auth token --user j620656786206)`。不要用 `gh auth switch`。
- **只合併自己建的分支（AR-15）**。合併前全部要成立，有一項不成立就不合併，停下來回報：
  - 分支名稱是 `story/<id>`，而且是這次 /next-story 建的
  - `isCrossRepository` 是 `false`（不是 fork 來的）
  - PR 作者是 `j620656786206`
  - 不是 Dependabot 或其他外部的 PR（依賴更新 PR 要 Alex 自己看）
- **不碰真的 qBittorrent 的寫入（AD-15）**。CI 和本機測試都只用假的回應。
- **每次 commit 前跑 `bash .claude/skills/next-story/check.sh`**，全部 `ok` 才能 commit。

## 網路：重試，不要停

github.com 有時候會連不上幾分鐘，但其他網站正常。這不是工作失敗，重試就好：

- **push、fetch、pull**：最多 20 次，每次等 20 秒。例如 `for i in $(seq 1 20); do git push -q -u origin "$B" && break; sleep 20; done`。
- **`gh pr create`**：說明先寫進檔案（`--body-file`）再重試；每次失敗都先查 `gh pr list --head "$B" --json number,url`，可能其實已經建好了。**同一個分支不要開兩個 PR。**
- 整個重試時間都連不上，才回報卡住，並說明卡在哪一步（push、PR、CI、合併）。

## 流程

### 1. 本機驗證

指令前面都加 `source ~/.nvm/nvm.sh && nvm use &&`。看 `package.json` 的 `scripts` 有哪些，有的都跑：

- lint（`npm run lint`）
- 型別檢查（有 `typecheck` 就跑它，沒有就 `npx tsc --noEmit`）
- 單元測試（`npm test`）
- build（`npm run build`）
- `npm audit --omit=dev --audit-level=high`

失敗就修，修完重跑。lint 能自動修的先自動修。每次修完 commit 前跑 check.sh。

### 2. Push、開 PR

```bash
export GH_TOKEN=$(gh auth token --user j620656786206)
B=$(git branch --show-current)
```

1. 跑 check.sh，全部 `ok`。
2. Push（用上面的重試）。
3. PR 說明寫進 scratchpad 的檔案，內容：
   - 做了什麼（照 story 的 AC 一條一條對）
   - 本機驗證跑了哪些、結果
   - AD-11：查過哪些官網文件（網址）
   - 截圖：用 `https://github.com/j620656786206/qbittorrent-react-ui/blob/<commit-sha>/<路徑>?raw=true` 嵌進來
   - Claude 代決：這張自己做的瑣碎決定，一條一句
   - 審查留下來沒修的（規格檔 `deferred` 清單）
   - 結尾加 Claude Code 的署名（照系統給的那兩行）
4. PR 文字不在 repo 裡，要另外查：標題第一行、說明接在後面寫進同一個檔案，跑 `bash .claude/skills/next-story/check.sh --file <那個檔案>`，要全部通過。
5. `gh pr create --base main --head "$B" --title "<標題>" --body-file <說明檔>`（用上面的重試）。
   - 標題格式：`feat(<id>): <story 標題>`，只改文件的用 `docs(<id>): …`，只改 CI 的用 `chore(ci): …`。

### 3. sprint-status 標 done

PR 編號拿到後，在同一個分支上：

1. sprint-status 裡這張 story 改成 `done`，同一行後面加註解 `# PR #<N>：<一句話摘要>`。
2. 規格檔的 Auto Run Result 確認寫完了。
3. 跑 check.sh，commit：`docs(<id>): sprint-status 標 done`，push。

這樣 CI 只要跑最後這一版，合併後 main 上的 sprint-status 就是對的。如果最後沒有合併，main 的 sprint-status 也不會被改到。

### 4. 等 CI

```bash
gh pr checks <N> --watch --interval 30
gh pr checks <N> --json name,bucket
```

- 要**至少有 1 個 check**，而且每個都是 `pass` 或 `skipping`，沒有 `pending`，才算全綠。0 個 check 不准合併，停下來回報。
- 可以把「等 CI 到合併」放進一個背景指令跑，結束時會通知。

CI 紅了：

1. 先看歷史：`gh run list --workflow "<名稱>" --limit 30`。
   - 一直是綠的、剛剛才紅、別的分支同時也紅 → 外部問題（GitHub、npm）。重跑失敗的 job（`gh run rerun <run-id> --failed`），**最多 2 次**。
   - 跟這次改動有關 → 修。修的 commit 放同一個 PR（CI 設定的修正用 `chore(ci): …`）。**最多修 3 次**。
2. 重跑 2 次還紅、或修了 3 次還紅 → **停**，照 /next-story 的停止格式回報。

### 5. 合併前檢查每月上限

規則（Alex 2026-11-15 定）：每月 main 上的 commit 不超過 60 個。只算進 main 的，一個 squash 合併的 PR 算 1 個，分支上的不算，文件 commit 也算。

```bash
git fetch origin
n=$(git log origin/main --since="$(date +%Y-%m-01)" --oneline | wc -l | tr -d ' ')
echo "本月 main 已經有 $n 個 commit，這次合併後是 $((n + 1)) 個"
```

- 合併後 ≤ 60 → 繼續。
- 合併後會 > 60 → **不准合併，也不能自己放行**。用 Agent 工具叫 `red-team`，只給數字和事實（本月 commit 數、日期、還剩幾張 story、期限 2027-01-31），不給計畫和理由。把它的判決用三行以內放在回覆最前面（標「🟥 red-team：」），然後停下來等 Alex。

### 6. 合併

1. 確認 PR 上沒有沒處理的審查留言（bot 或人的）。有就先處理。
2. 確認上面「只合併自己建的分支」的四項都成立：
   ```bash
   gh pr view <N> --json headRefName,isCrossRepository,author --jq '{b:.headRefName, fork:.isCrossRepository, who:.author.login}'
   ```
3. `gh pr merge <N> --squash --delete-branch`。squash 的標題用 PR 標題加 `(#<N>)`。
4. `git checkout main && git pull --ff-only`，確認合併的 commit 真的在 main 上了（`git log --oneline -1`）。
5. 回 /next-story 的 §6。

## 什麼時候停下來問

- 真的產品決定（範圍、畫面行為、功能該做什麼）。
- 真的架構決定（新依賴、資料格式、會影響很多地方的重構）而底稿裡查不到。
- 超過每月 commit 上限（先叫 red-team）。
- 合併檢查（AR-15）有一項不成立。

lint、格式、帳號被切走、網路暫時斷掉、偶發的 CI 失敗：這些自己處理，不算停止理由。
