# Epic 4 Context: Add and delete

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Let Alex pick several torrents and delete them in one go, and add a whole batch of magnet links and .torrent files at once. On desktop he ticks rows or cards by hovering. On phone a long press starts selection mode. A floating selection bar shows the count and total size and opens a delete confirmation that lists exactly what goes and whether the files go with it. Adding accepts pasted text, picked files or dragged files. Each entry is judged on arrival (already downloaded, unreadable, too large), and a partial failure leaves the failed entries in the list with their reasons so he can retry them. This epic adds the `deleteTorrents` and `addTorrents` server functions, the shared dialog/sheet component and the pure-JS info hash. Changing paths and renaming files belong to Epic 5. The selection bar's 「改路徑」 button stays disabled until then.

## Stories

- Story 4.1: Desktop checkboxes and selection bar
- Story 4.2: Phone selection mode
- Story 4.3: Delete confirmation and delete
- Story 4.4: Delete fade-out
- Story 4.5: Info hash and judging pasted input
- Story 4.6: Add screen: paste, pick files, drag files
- Story 4.7: Submit add and results

## Requirements & Constraints

- Selection has no "select all". Desktop ticks one by one. Phone enters selection with a 0.5 s long press, and moving more than 10 px within that time cancels it, because the finger is scrolling.
- Selection clears on a category or search change. After each `['maindata']` update, hashes that no longer exist drop out of the selection.
- The selection total and the delete size count only torrents whose files still exist. Torrents that are 已整理 or whose files are missing do not count. `classify()` decides which torrents count, and a `src/lib` selector adds them up.
- The delete confirmation must say what is deleted and whether files go too. 「連檔案一起刪」 is ticked by default. Closing the confirmation means nothing is deleted, and the selection stays.
- Delete is all-or-nothing, with no partial-failure screen. Add can partly fail, and failed entries stay in the list with a reason.
- Sending an operation changes the button text and blocks a second send. After 10 s the dialog shows 「還在等 NAS 回應」. After 30 s the operation counts as `timeout`. A failure keeps everything Alex filled in.
- The add screen judges every entry before sending: unreadable (including files over 10 MB), already downloaded, or addable. It matches against every torrent in `['maindata']`, including 已整理. Two identical entries in one paste merge into one row.
- Adding must work over plain http at home. The info hash uses pure-JS SHA-1 and never `crypto.subtle`. Paste never relies on `navigator.clipboard.readText`.
- Torrent names, file names and category names render as plain text everywhere.
- Performance: the delete list virtualizes, so with 3,626 selected the DOM holds fewer than 60 rows. Hashing 20 files of 10 MB must not block the main thread for more than 200 ms, because only the `info` section is hashed.
- Accessibility: checkboxes carry `aria-label` 「選取 <種子名稱>」, focus rings stay visible, phone touch targets are 44 px, and nothing scrolls sideways at 390 px. Reduced motion turns off every animation and keeps the features.
- Tests and automation never write to the real qBittorrent. Delete and add are verified only with fake responses. Alex does the final check on the NAS.

## Technical Decisions

- **Hash-array body limit is 400 KB (409,600 bytes).** Alex approved the change on 2026-11-18 and it replaces the earlier 384 KB. TanStack Start wraps each hash, so 5000 hashes of 64 characters measured 395,140 bytes. `deleteTorrents` (and Epic 5's `setLocation`) must send 3,626 or more hashes within this limit. Other non-file bodies stay at 64 KB.
- **`deleteTorrents`.** It is a POST built with the `_define.ts` factory. zod takes `{ hashes, deleteFiles }`. Each hash is 40 or 64 lowercase hex, the array holds 1 to 5000, and `all` or `|` is never accepted. `deleteFiles` is a required boolean with no default, and a missing value returns `invalid_input`. The container joins hashes in qBittorrent's format and builds parameters with `URLSearchParams`. If qBittorrent accepts the call, every item comes back ok in the batch shape. A rejection returns one overall `qbit_rejected`.
- **`addTorrents`.** It is a POST with `FormData` that takes magnet links (only `magnet:`), .torrent files and a category. It never accepts http URLs or `savepath`. The category must exist in the container's torrent table, otherwise the call returns `invalid_input`. Limits are 10 MB per file, 20 files per request and 50 MB per request. The container checks `Content-Length` first, counts bytes while reading, and stops reading when a limit is exceeded. Each file must start as a bencode dictionary. The container sends entries to qBittorrent one at a time and never fetches a URL the user gave.
- **Batch result shape.** The shape is `{ ok: true, data: { items: [{ key, ok: true } | { key, ok: false, code, message }] } }`. `key` is the hash for delete and the input index for add. An overall error is returned only when nothing was done.
- **After success, wait for qBittorrent.** The app never edits local data. It calls `refreshMaindata()` and records the hashes in `pendingOps`. Rows disappear, or fade out, only once the refreshed data no longer contains them.
- **Shared dialog/sheet component.** Story 4.3 builds it once in the same shared directory as Epic 2's bottom sheet, and add and Epic 5 reuse it. Desktop uses a shadcn `Dialog` (an `AlertDialog` for delete). Phone uses the existing bottom sheet with the same content. The sending state lives in this component: the pressed button changes text, and cancel, ✕, `Esc`, a scrim click and a drag down cannot close it while a request is in flight.
- **Selection state** lives in `src/state/selection` as an ordered hash array with the earliest tick first. The delete list follows this order.
- **Order freeze.** The existing freeze hook in `src/state` gains two reasons: "has a selection" for the list, and "delete animation running". New maindata waits until the animation ends. Features never sort torrents themselves.
- **Fade-out ownership.** Delete only hands hashes to `src/state` as "leaving". The list and board components run the exit animation, and only for visible rows. A torrent removed by another device or by VueTorrent disappears without a fade.
- **`src/lib/info-hash.ts`** uses a minimal bencode parser to find the raw bytes of the `info` dictionary, then returns lowercase 40-character hex plus `info.name` (UTF-8) and the file size. A magnet link parses `xt=urn:btih:` (40 hex or 32 base32, converted to lowercase hex) and `dn`. A v2-only torrent or a magnet with only `btmh` counts as unreadable for now.
- **Client batching.** A `src/lib` pure function splits addable entries into batches of at most 20 (magnets and files together) and under 50 MB of files with room for form overhead. The batches go out in order and the results are merged.
- **Errors.** `qbit_rejected`, `timeout` and `invalid_input` show the "failure with retry" toast, with text from `src/lib/error-text.ts`. Only the global handler deals with connection codes. On `not_logged_in` the add list is not kept.
- **Pure functions with vitest.** Long-press timing and movement thresholds, the selection total, the delete button text (with and without files, thousands separators, TB, all files missing), entry judging and ordering, and batch splitting each get one pure function with vitest coverage. Test .torrent fixtures are generated in the test with bencode. They never use Alex's real files, tracker URLs or private category names.

## UX & Interaction Patterns

- **Checkbox.** It is 20 px with a 6 px radius. Unticked it has a 2 px `text-faint` border, and ticked it has an `accent` fill with an `accent-foreground` check. It appears on hover or focus at the far left of a list row, or 6 px outside a card's top-left corner. After the first tick every row shows it. The list row's reserved 20 px slot means rows never shift. Ticked rows and cards use the `selection-row` background. Clicking the checkbox only changes the selection. Clicking anywhere else on the row opens detail as before.
- **Phone selection.** A long press ticks the row, vibrates if supported, and pushes every row 28 px right in 0.2 s. While selecting, a tap toggles the row instead of opening the sheet, and swiping between status tabs still works.
- **Selection bar.** On desktop it is a floating centred pill with the `selection-bar` colours: 「已選 N 個」 (bold), 「共 X GB」 (muted), 取消, 改路徑 (disabled), and 刪除（含檔案） in solid `delete` on the right. On phone it is two rows with 16 px side margins, and 改路徑 and 刪除 split the second row. It slides in and out using `transform` only. Content gets 110 px of extra bottom padding, and toasts move to 16 px above the bar.
- **Delete confirmation.** The title is 「刪除 N 個種子？」. Five rows show first, and 「還有 N 個 ▾」 expands a virtualized list up to 320 px tall. Rows with missing files show 「找不到檔案」 plus a note below the list. The button reads 「刪除 3 個種子和檔案（301.2 GB）」 or 「只刪 3 個種子，檔案留著」. On desktop the dialog is 512 px wide with cancel on the left and delete on the right, has no ✕, and ignores a click outside it. On phone it is a content-height sheet with one full-width delete button. If torrents vanish elsewhere while it is open, the list updates, and the dialog closes when none are left. After a successful delete a toast says 「已刪除 …」, with no undo.
- **Fade-out.** Opacity goes to 0 over 0.2 s and the rows below move up with `transform`. A category emptied this way shows 「這個分類沒有種子」.
- **Add screen.** The desktop dialog is 640 px wide. Phone uses a fixed 90% sheet with no cancel button. When empty it shows a focusable dashed drop box: 「貼上磁力連結，或把 .torrent 檔拖進來」 plus 「選檔案」 (multi-select, .torrent only). Once filled it becomes a self-scrolling list with problem rows marked: unreadable gets 「拿掉」, already downloaded gets 「打開」. A paste row stays at the bottom. The category menu lists every qBittorrent category. It is empty when the screen opens from "All" and preselects the current category otherwise. Below it, 「會存到 <路徑>」 is read-only. 「新增 N 個」 counts only addable entries and is disabled when N is 0 or no category is chosen. Closing the screen discards the list.
- **Drag overlay (desktop only).** A file drag anywhere shows a full-screen scrim with 「放開就新增」. Dropping opens add, or appends if it is already open. A text drag shows nothing.
- **Add results.** The app stays on the current screen. Full success shows a toast 「已新增 N 個種子」 with 「去看」 for 8 s, which switches to the add category and opens detail when a single torrent was added. Partial failure shows a 「5 個加好了，2 個失敗」 banner, per-row reasons, and the button becomes 「新增 2 個」.

## Cross-Story Dependencies

- **From earlier epics.** The epic relies on the order-freeze hook (`src/state/order-freeze.ts`), `pendingOps` and `refreshMaindata()`, `sendOp` with the failure toast, the bottom sheet in `src/shared/ui`, the hash list schema and batch types in `src/shared/torrent-ops.ts`, the 400 KB `HASH_LIST_BODY_LIMIT`, `classify()`, `format.ts`, the disabled header 「新增」 and empty-state 「新增種子」 buttons, and the URL `category` and `q` that clear the selection.
- 4.1 creates `src/state/selection` and the selection bar, which 4.2 extends for phone. 4.3 enables the delete button on both.
- 4.3 builds the shared dialog/sheet and its sending state, which 4.6 and 4.7 (and Epic 5) reuse. 4.4 adds the fade-out on top of 4.3's success path.
- 4.5 provides the judging and batching functions used by 4.6 (screen) and 4.7 (re-judging against the latest maindata before sending, then submitting in batches).
- Epic 5 wires the selection bar's 「改路徑」 and reuses the 400 KB hash limit for `setLocation`.
