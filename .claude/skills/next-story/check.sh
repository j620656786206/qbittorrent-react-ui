#!/usr/bin/env bash
# react-torrent 送出前檢查。commit、push、開 PR 之前都要跑，任何一項 FAIL 就停下來修。
#
# 用法：bash .claude/skills/next-story/check.sh [base]
#   base：從哪裡開始算「新增的內容」，預設 origin/main。
#
# 只印項目名稱和數量，不印命中的內容（避免把秘密印進對話或 log）。
# 這個檔本身也進 git，所以隱私字用 [x] 寫法，檔案裡不會出現原字。

#   或：bash .claude/skills/next-story/check.sh --file <路徑>
#   只檢查一個 repo 外的檔案（PR 標題和說明、要貼出去的留言），查破折號、兩個隱私字、內網 IP。

set -u

if [ "${1:-}" = "--file" ]; then
  f="${2:?要給檔案路徑}"
  bad=0
  grep -q "$(printf '\xe2\x80\x94')" "$f" && { echo "FAIL  破折號"; bad=1; }
  grep -qiE 'adul[t]' "$f" && { echo "FAIL  隱私字 1（分類真名）"; bad=1; }
  grep -q "刮[削]" "$f" && { echo "FAIL  隱私字 2（整理流程）"; bad=1; }
  grep -qE '(192\.168\.[0-9]{1,3}\.[0-9]{1,3}|(^|[^0-9.])10\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}|172\.(1[6-9]|2[0-9]|3[01])\.[0-9]{1,3}\.[0-9]{1,3})' "$f" && { echo "FAIL  內網 IP"; bad=1; }
  [ "$bad" -eq 0 ] && echo "結果：全部通過。" || echo "結果：有項目沒過，先修好再送。"
  exit "$bad"
fi

cd "$(git rev-parse --show-toplevel)" || exit 2
BASE="${1:-origin/main}"
fail=0

report() {
  if [ "$1" -ne 0 ]; then
    echo "FAIL  $2: $1"
    fail=1
  else
    echo "ok    $2"
  fi
}

# BMAD 安裝程式產生的檔案（.claude/skills/bmad-*、_bmad/ 底下）是外部的東西，破折號和 IP 不檢查。
# 例外：_bmad/custom/bmad-build-auto.toml 是我們自己寫的，要檢查。
VENDOR_RE='^(\.claude/skills/bmad-|_bmad/)'
OURS_RE='^_bmad/custom/bmad-build-auto\.toml$'

# 要進 git 的檔案：已追蹤的加上沒被 ignore 的新檔案。隱私字連 BMAD 的檔案一起查，只排除 BMAD 的 skill（裡面有一般英文用法）。
files_in_git() {
  git ls-files -co --exclude-standard \
    | grep -v -E '^\.claude/skills/bmad-' \
    | while IFS= read -r f; do [ -f "$f" ] && printf '%s\0' "$f"; done
}

# 從 BASE 到現在新增的行，加上新檔案的全部內容。
added_lines() {
  { git diff "$BASE" --name-only --diff-filter=d; git ls-files --others --exclude-standard; } \
    | sort -u | grep -v -E '^package-lock\.json$' \
    | while IFS= read -r f; do
        if echo "$f" | grep -qE "$VENDOR_RE" && ! echo "$f" | grep -qE "$OURS_RE"; then continue; fi
        [ -f "$f" ] || continue
        if git cat-file -e "$BASE:$f" 2>/dev/null; then
          git diff "$BASE" -U0 -- "$f" | grep '^+' | grep -v '^+++'
        else
          cat "$f"
        fi
      done
}

# 1. 破折號（U+2014）。新增的內容裡要是 0。
DASH=$(printf '\xe2\x80\x94')
n=$(added_lines | grep -c "$DASH" || true)
report "$n" "破折號"

# 2. 隱私：那個分類的真名。整個 repo（要進 git 的檔案）要是 0。
n=$(files_in_git | xargs -0 grep -liE 'adul[t]' 2>/dev/null | wc -l | tr -d ' ')
report "$n" "隱私字 1（分類真名）"

# 3. 隱私：Alex 整理檔案的流程。整個 repo 要是 0。
n=$(files_in_git | xargs -0 grep -l "刮[削]" 2>/dev/null | wc -l | tr -d ' ')
report "$n" "隱私字 2（整理流程）"

# 4. 內網 IP。新增的內容裡要是 0。
n=$(added_lines | grep -cE '(192\.168\.[0-9]{1,3}\.[0-9]{1,3}|(^|[^0-9.])10\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}|172\.(1[6-9]|2[0-9]|3[01])\.[0-9]{1,3}\.[0-9]{1,3})' || true)
report "$n" "內網 IP"

# 5. .env 檔（.env.example 以外）不能進 git。
n=$(git ls-files -co --exclude-standard | grep -E '(^|/)\.env' | grep -v -E '\.env\.example$' | wc -l | tr -d ' ')
report "$n" ".env 檔進了 git"

# 6. 本機 .env 裡的密碼、token 原文不能出現在新增的內容裡。
n=0
for envf in .env .env.local .env.development .env.production; do
  [ -f "$envf" ] || continue
  while IFS= read -r line; do
    key="${line%%=*}"
    val="${line#*=}"
    val="${val%\"}"; val="${val#\"}"; val="${val%\'}"; val="${val#\'}"
    case "$key" in *PASS*|*SECRET*|*TOKEN*|*KEY*) ;; *) continue ;; esac
    [ "${#val}" -ge 6 ] || continue
    if added_lines | grep -qF -- "$val"; then n=$((n + 1)); fi
  done < <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$envf")
done
report "$n" "本機秘密原文"

if [ "$fail" -ne 0 ]; then
  echo "結果：有項目沒過，先修好再送。"
  exit 1
fi
echo "結果：全部通過。"
