---
title: 'Story 4.5: Info hash and judging pasted input'
type: 'feature'
created: '2026-11-20'
status: 'done'
baseline_revision: 'fc9c2c9c75e6bbc8a2e51f545a2c508f53db4272'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
warnings: []
deferred:
  - summary: >-
      The 200 ms main-thread bound is measured in a Node vitest worker, not in a browser with a real File read and a real yield.
    evidence: |-
      info-hash.test.ts asserts thread CPU per slice with a setTimeout(0) yield and a faked File. The browser yield and
      File.arrayBuffer() arrive with the add screen; measure there (long tasks in a Chromium trace, 20 files of 10 MB).
    location: >-
      src/lib/info-hash.ts
    severity: low
---

<intent-contract>

## Intent

**Problem:** The add screen (4.6) and submit (4.7) need to know, the moment something is pasted or dropped, which torrent each entry is, whether it is already in qBittorrent, and whether it can be read at all. At home the app runs over plain http, where `crypto.subtle` does not exist.

**Approach:** Pure functions in `src/lib` with vitest: a pure-JS SHA-1 (incremental), a minimal bencode reader, `info-hash.ts` for .torrent bytes and magnet links, a paste splitter, a judge that labels and orders entries against the maindata hash set, and a batch splitter for `addTorrents`. The add limits live in `src/shared` so 4.7's server function uses the same numbers.

## Boundaries & Constraints

**Always:**
- SHA-1 is pure JS. Never `crypto.subtle`, `crypto.createHash` or any Node or browser crypto API (AR-56, NFR-9).
- Info hashes are lowercase 40-char hex. Every comparison uses that form (spine 一致性慣例「info hash」, AR-41: info hash logic only in `src/lib/info-hash.ts`).
- The info hash is the SHA-1 of the exact raw bytes of the top-level `info` value as they appear in the file, never a re-encoding.
- Limits (AD-12), in `src/shared/torrent-add.ts`: a .torrent file at most 10 MB (10,485,760 bytes; larger is too large), at most 20 entries per request (magnets and files together), at most 50 MB (52,428,800 bytes) per request including form overhead.
- A file over 10 MB is judged too large from its size alone; its bytes are never parsed or hashed.
- Hashing work yields: the async entry point hashes the `info` bytes in chunks of at most 1 MiB and awaits an injected `yieldToMain()` between chunks and between files, so no single main-thread slice runs long. `src/lib` stays free of DOM and timer APIs; the caller injects the yield.
- Names (`info.name`, magnet `dn`) are returned as plain strings for text rendering. UTF-8 decoding uses `TextDecoder` with replacement (never throws).
- Test .torrent data is generated in the test with a bencode encoder written in the test helpers. No real torrent files, tracker URLs or private category names (use X, mteam-X only).
- AD-15: nothing here talks to qBittorrent.

**Never:**
- No UI, no state, no server function in this story (4.6 and 4.7).
- No npm dependency for bencode, SHA-1 or base32.
- Never fetch a URL from the input. http(s) links are unreadable entries.
- v2-only torrents (no v1 `pieces`, `meta version` 2 only) and magnets with only `btmh` are unreadable for now (epics.md note).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| H1 SHA-1 vectors | `""`, `"abc"`, 1 MiB of `a`, the 448-bit vector | Standard digests (FIPS 180 / RFC 3174 vectors) | None |
| H2 incremental | Same data fed in uneven chunks | Same digest as one-shot | None |
| T1 v1 single-file | Generated torrent | Hash equals SHA-1 of the raw info bytes; name; `contentBytes` = `length`; `fileBytes` = byte length of the file | None |
| T2 v1 multi-file | `files` list | `contentBytes` = sum of file lengths | None |
| T3 hybrid | v1 `pieces` plus `meta version` 2 and `file tree` | Readable, v1 hash | None |
| T4 v2-only | `meta version` 2, no `pieces` | 看不懂這個檔案 | Unreadable kind `file` |
| T5 not a dict / garbage / truncated / trailing junk inside / no `info` / `info` not a dict | Bytes | 看不懂這個檔案 | Never throws |
| T6 too large | 10,485,761 bytes | 檔案超過 10 MB, bytes not read | Unreadable kind `too-large` |
| T7 exactly 10 MB | 10,485,760-byte valid torrent | Readable | None |
| T8 key order | Raw info with unsorted keys | Hash of the raw bytes as given | None |
| T9 bad UTF-8 name | Invalid bytes in `name` | Name with replacement chars, still readable | None |
| M1 magnet hex | `xt=urn:btih:<40 hex, any case>` and `dn` | Lowercase hex hash, decoded `dn` | None |
| M2 magnet base32 | 32-char base32 btih | Converted to lowercase hex | None |
| M3 no btih | `btmh` only, no `xt`, bad hex or base32 length or chars | 看不懂這個連結 | Unreadable kind `link` |
| M4 not a magnet | `https://…`, plain words | 看不懂這個連結 | Unreadable kind `link` |
| P1 split | Text with newlines, spaces, tabs, blank lines | One entry per non-empty token, in order | None |
| P2 merge | Same hash twice in one paste (hex and base32 of one hash too) | One row, first occurrence kept | None |
| J1 existing | Hash in the maindata set (archived included) | 以前下載過，已整理好 | None |
| J2 order | Mixed entries | Unreadable (links, files, too large) first, then existing, then addable; input order inside each group | None |
| B1 count | 20 / 21 addable | One batch / two batches (20 + 1), input order kept | None |
| B2 size | Files summing just under / just over the byte budget | One batch / split before the file that would cross it | None |
| B3 magnets | Only magnets | Batches of 20 | None |

</intent-contract>

## Code Map

- `src/shared/torrent-hash.ts`: `TORRENT_HASH_PATTERN` (40 or 64 lowercase hex). `src/lib/is-torrent-hash.ts` wraps it. Pattern for a shared constants file next to it.
- `src/shared/torrent-ops.ts`: existing shared op constants (`MAX_TORRENT_HASHES`); the new `src/shared/torrent-add.ts` follows its style.
- `src/server/gate/body-limit.ts`: `HASH_LIST_BODY_LIMIT`, `MAX_REQUEST_BODY` ("uploads raise it" in 4.7). Do not change it here.
- `src/lib/*.ts` with sibling `*.test.ts`: the pure-function convention (no DOM, no network). `src/lib/testing.ts` holds shared test helpers; the bencode test encoder can live there or in a new `src/lib/bencode-testing.ts`.
- Maindata torrents are keyed by `hash` (`src/shared/maindata.ts` `SlimTorrent`), so the existing-hash set is `new Set(Object.keys(torrents))`, archived torrents included (4.7 and 4.6 build it from `['maindata']`).
- Specs: PRD FR-38 (`prd.md` around line 599), EXPERIENCE 〔新增種子 add-torrent〕 判斷和驗證 (`EXPERIENCE.md` lines 163 to 167), spine lines 245 and 246, epics.md note at line 1784 (v2-only and `btmh` unreadable).

## Tasks & Acceptance

**Execution:**
- `src/shared/torrent-add.ts` (new): `MAX_TORRENT_FILE_BYTES = 10_485_760`, `MAX_ADD_ENTRIES = 20`, `MAX_ADD_REQUEST_BYTES = 52_428_800`, and the client's form allowance (a fixed base plus a per-entry allowance, documented, so a batch's file bytes plus allowance never exceed the request limit).
- `src/lib/sha1.ts` (+ test): incremental SHA-1 (`createSha1()` with `update(Uint8Array)` and `digestHex()`) plus `sha1Hex(bytes)`. H1, H2.
- `src/lib/bencode.ts` (+ test): a minimal reader over `Uint8Array` that returns values plus, for dictionaries, the byte span of each value, so `info` raw bytes can be sliced. Strict: integers without leading zeros, string lengths within bounds, dictionaries with byte-string keys; any violation is a parse failure (returned, not thrown).
- `src/lib/info-hash.ts` (+ test): `readTorrentFile(bytes, options)` async with injected `yieldToMain`, chunked hashing; `parseMagnet(text)`; base32 to hex. Results are a tagged union: readable `{ kind: 'file' | 'magnet', hash, name, contentBytes?, fileBytes? }` or unreadable `{ reason: 'link' | 'file' | 'too-large' }`. T1 to T9, M1 to M4.
- `src/lib/add-entries.ts` (+ test): `splitPaste(text)`, `judgeEntries(entries, existingHashes)` (labels, merge of same hash, order), `addBatches(addable)` (count and byte limits from `src/shared/torrent-add.ts`). Text for the labels comes from one place (the three unreadable texts and 以前下載過，已整理好). P1, P2, J1, J2, B1 to B3.
- Measurement (+ test or script): hash 20 generated 10 MB torrents through `readTorrentFile` with a `yieldToMain` that records timestamps; report the longest synchronous slice and the total. Record the numbers in Design Notes for the PR. The test asserts the longest slice stays under 200 ms with a generous margin note (CI machines vary).

**Acceptance Criteria:**
- Given 20 generated 10 MB .torrent files, when they are hashed through the async entry point, then no slice between two yields exceeds 200 ms on the measuring machine, and the numbers are recorded.
- Given any byte input, when it is read as a .torrent, then the function returns a result and never throws.

## Spec Change Log

## Review Triage Log

### 2026-11-20: Review pass
- verdicts: 37 findings: high 0, medium 5, low 24, false 8, maybe-false 0
- findings:
  - `[false]` `[reject]` (intent) The 200 ms bound is measured in Node, not the browser: the intent allows a vitest measurement; the browser check is deferred to the add screen.
  - `[false]` `[reject]` (intent) "Including 已整理" is not exercised: the judge takes the hash set; the add screen builds it from every maindata torrent.
  - `[low]` `[reject]` (intent) Merging covers the whole list, not one paste: merging a hash pasted twice across pastes or as file and magnet is the safer reading (never sends one torrent twice).
  - `[false]` `[reject]` (intent) Server limits are client-only: the server function is 4.7.
  - `[false]` `[reject]` (intent) The bencode reader is not "minimal": its strictness and lazy spans came from the measured GC pauses.
  - `[false]` `[reject]` (intent) The measurement is not in the diff: it is in the spec's Design Notes.
  - `[low]` `[reject]` (edge) A rejecting `yieldToMain` makes `readTorrentFile` reject: the caller supplies it; guarding a caller's own throw adds branches for a case nobody produces.
  - `[low]` `[reject]` (edge) One file's rejection loses the batch's results: same root as above.
  - `[low]` `[patch]` (edge) An empty `name.utf-8` hides `name`: falls back to `name` when empty; tested.
  - `[low]` `[patch]` (edge) A malformed first btih hides a later good one: every `xt` and `xt.N` scanned, first convertible btih used; tested.
  - `[low]` `[patch]` (edge) Numbered `xt.1` ignored: same fix.
  - `[medium]` `[patch]` (edge) An unencoded space in a magnet's `dn` splits the entry: split by line, then rejoin a token after a magnet whose last parameter is `dn=` (not when the next token is a magnet); tested.
  - `[low]` `[patch]` (edge) Zero-width spaces before a magnet: U+200B to U+200D, U+2060, U+FEFF count as whitespace; tested.
  - `[low]` `[reject]` (edge) `addBatches` given non-addable entries: the caller passes the judge's addable group; its type says so.
  - `[medium]` `[patch]` (edge) Missing `piece length` or bad `files[].path` judged addable: libtorrent's checks added (name, piece length, pieces count, path lists, length or files exclusive); T5 rows for each.
  - `[low]` `[reject]` (edge) Half the measured files are 9.4 MB: they are the worst parse shape; the 10 MB shape is measured by the other ten.
  - `[low]` `[reject]` (edge) The test asserts CPU, not wall clock: wall clock in a parallel suite counts other workers; it is logged.
  - `[false]` `[reject]` (edge) The signature differs from the spec text: the departure is recorded in Design Notes.
  - `[medium]` `[patch]` (blind) Magnets count 0 bytes in the batch budget: magnets carry `linkBytes` and the budget counts them; tested.
  - `[medium]` `[patch]` (blind) The .torrent check is looser than libtorrent's: same fix as the edge row.
  - `[low]` `[patch]` (blind) An invalid `length` falls back to `files`; both accepted: single-file needs a valid `length` and no `files`, multi-file the reverse; tested.
  - `[medium]` `[patch]` (blind) A literal space in `dn` splits the magnet: same fix as the edge row.
  - `[low]` `[patch]` (blind) `parseMagnet` stops at the first btih and ignores `xt.N`: same fix.
  - `[low]` `[reject]` (blind) Several walks of the info dict in one slice: the longest slice is 42 to 44 ms against the 200 ms bound.
  - `[low]` `[reject]` (blind) No way to cancel `readTorrentFiles`: the add screen decides how closing it stops work.
  - `[low]` `[reject]` (blind) 「檔案超過 10 MB」 is hardcoded: the story fixes the text; the limit is fixed by AD-12.
  - `[low]` `[reject]` (blind) Merged duplicates are dropped silently: nothing in the story shows a merge count.
  - `[low]` `[reject]` (blind) The judge assumes lowercase hashes: maindata hashes match the lowercase pattern (`src/shared/torrent-hash.ts`).
  - `[low]` `[patch]` (blind) Shared unreadable results are mutable: frozen and typed `Readonly`; tested.
  - `[low]` `[patch]` (blind) The `singleFileInfo` comment says keys are sorted: keys now sorted after overrides, so T8 is the only unsorted case.
  - `[low]` `[reject]` (blind) The measurement helper is fragile and has no regression bound: a test-helper refactor, not a defect users meet.
  - `[false]` `[reject]` (blind) Spec signature mismatch and missing spec: recorded in Design Notes; the spec is reviewed separately.
  - `[low]` `[patch]` (gap) No test for `length` above 2^53: T5 rows added for single and multi-file totals.
  - `[low]` `[patch]` (gap) "No name gives null" untested: a missing or empty name is now unreadable (libtorrent check); tested.
  - `[low]` `[patch]` (gap, other) Empty `name.utf-8`: same fix as above.
  - `[false]` `[reject]` (gap, other) J2 ordering inside the unreadable group: the story orders by input inside each group; "(links, files, too large)" lists members, not an order.
  - `[low]` `[patch]` (gap, other) A bad first btih: same fix as above.

### 2026-11-20: Review pass (follow-up)
- verdicts: 34 findings: high 0, medium 0, low 29, false 4, maybe-false 1
- findings:
  - `[low]` `[patch]` (edge) Non-ASCII letters pass the base32 check after `toUpperCase` (`ß` gives a hash over 40 hex): ASCII alphabet checked first; tested.
  - `[low]` `[patch]` (edge) `piece length` above 2^31 − 1 accepted: refused; T5 row; `parseTorrent` doc narrowed.
  - `[low]` `[patch]` (edge) Both `files` and `length` judged unreadable, though libtorrent takes `files`: `files` wins and `length` is ignored; rows now expect readable multi-file sizes.
  - `[low]` `[reject]` (edge) A rejecting `yieldToMain`: carried, rejected in the first pass.
  - `[maybe-false]` `[reject]` (edge) Uppercase `XT=` or `DN=` keys: unverified whether qBittorrent accepts them; if true it is low (hand-written links only).
  - `[low]` `[reject]` (edge) Quadratic rescan of a long open-`dn` line: needs thousands of tokens after one magnet on one line; the fix adds parser state.
  - `[low]` `[patch]` (edge) One magnet larger than the budget still makes an oversized batch: a magnet over 64 KiB is 看不懂這個連結, so every addable entry fits a batch; tested at 64 KiB and one byte more.
  - `[low]` `[patch]` (edge) The batch guarantee claim: same fix; `addBatches` doc explains why every entry fits.
  - `[false]` `[reject]` (edge) Signature differs from the spec text: carried.
  - `[low]` `[patch]` (blind) The `judgeEntries` doc implies a sub-order: reworded (input order).
  - `[low]` `[patch]` (blind) A URL after an open `dn=` is swallowed: tokens starting with a URI scheme are never joined; tested.
  - `[low]` `[reject]` (blind) Chat and markdown wrappers around links: not in the story; unwrapping heuristics are more than a direct fix.
  - `[low]` `[patch]` (blind) `addBatches` cannot keep its guarantee for a huge magnet: same fix as the edge row.
  - `[false]` `[reject]` (blind) 以前下載過，已整理好 for torrents still downloading: the PRD assumption uses the same text for any state.
  - `[low]` `[reject]` (blind) Merged duplicates are silent: carried.
  - `[low]` `[reject]` (blind) The lowercase hash contract is only a comment: carried.
  - `[low]` `[patch]` (blind) `parseTorrent` claims more than it checks (piece length bound): same fix as the edge row.
  - `[low]` `[reject]` (blind) Phone slices and repeated `dictValue` walks: the measured slice is 61.7 ms against 200 ms; the phone gap is a recorded residual risk and the browser measurement is deferred.
  - `[low]` `[patch]` (blind) The second `TOO_LARGE` branch untested: test added.
  - `[low]` `[patch]` (blind) Missing bencode strictness tests: huge string length and integer past 2^53 in bencode.test.ts, `pieces` as integer or list in info-hash.test.ts.
  - `[low]` `[reject]` (blind) The measurement helper's comment and index: carried.
  - `[low]` `[reject]` (blind) 「檔案超過 10 MB」 hardcoded: carried.
  - `[low]` `[reject]` (blind) The test encoder sits in `src/lib`: the repo keeps test helpers beside their modules (`src/lib/testing.ts`, `src/state/entrance-testing.ts`).
  - `[low]` `[patch]` (gap) Batch sizes after a byte split unchecked: exact sizes `[4, 4, 4, 4, 4, 4, 4, 2]` asserted.
  - `[low]` `[patch]` (gap) Chunked hashing of an `info` over 1 MiB unchecked: T7 asserts the hash equals SHA-1 of the raw `info` span (over 9 MiB).
  - `[low]` `[patch]` (gap) Empty `dn=` giving `name: null` untested: test added.
  - `[low]` `[defer]` (intent) The 200 ms bound measured in Node: carried, deferred in the first pass.
  - `[low]` `[reject]` (intent) No automated check against `crypto` use: `sha1.ts` imports nothing; a lint rule is more than this story needs.
  - `[false]` `[reject]` (intent) The archived-included comparison is untested here: carried.
  - `[low]` `[reject]` (intent) The batch allowance is checked against itself: 4.7's server test measures the real multipart body.
  - `[low]` `[patch]` (intent) The join rule absorbs an `https://` token: same fix as the blind row.
  - `[low]` `[reject]` (intent) Merging across files and magnets: carried.
  - `[false]` `[reject]` (intent) More inputs are unreadable than the T rows list: the libtorrent checks were patched in on purpose in the first pass.
  - `[low]` `[reject]` (intent) The test helper location: same as the blind row.

## Design Notes

Claude 代決 (Alex can veto):
- 10 MB and 50 MB are binary megabytes (10,485,760 and 52,428,800 bytes), matching how `format.ts` shows sizes. 4.7's server uses the same constants.
- The batch byte budget subtracts a fixed form allowance, so a batch the client builds always fits under the server's 50 MB.
- 「檔案超過 10 MB」 is judged before reading (the story's own Claude 代決 for the text).
- Both sizes are returned for a file: `fileBytes` (the .torrent itself, for batching) and `contentBytes` (what the torrent downloads, for the list row in 4.6).
- Merging a repeated hash keeps the first occurrence (input order is the tie-break everywhere).

Claude 代決 during implementation (Alex can veto):
- `readTorrentFile` takes a source with `size` and `arrayBuffer()` instead of raw bytes. A browser `File` or `Blob` fits as is. The size check runs before anything calls `arrayBuffer()`, which is how "over 10 MB, bytes never read" holds. A read that rejects is 看不懂這個檔案.
- Unreadable results also carry `kind: 'unreadable'`, so every result has the same discriminant (`kind`) next to `reason`.
- The bencode reader returns byte spans and reads a value only when asked (`dictEntries`, `dictValue`, `listItems`, `readInteger`, `readBytes`). The first version built every value up front. On a .torrent with 150,000 file entries it kept 150,000 dictionaries alive until the end, and GC pauses pushed one slice past 130 ms. The span version checks the same strict grammar.
- `readTorrentFile` also yields once between checking the whole file and reading the `info` fields. `readTorrentFiles(files, options)` reads the files in order and yields between them.
- Bytes after the top dictionary, a trailing newline included, make the file unreadable (T5, strict).
- `contentBytes` leaves out BEP 47 padding files (`attr` contains `p`). When both `name.utf-8` and `name` exist, `name.utf-8` wins.
- The form allowance is 64 KiB per request plus 64 KiB per entry, about 1.3 MB for 20 entries. A magnet's UTF-8 length counts toward the batch budget on top of its allowance. `parseMagnet` refuses a link longer than 64 KiB (看不懂這個連結), so every addable entry fits a batch alone and no batch goes over 50 MB.
- A .torrent is readable only when it passes these checks, which libtorrent also applies: a non-empty `name.utf-8` or `name`, a `piece length` from 1 to 2^31 - 1, and exactly ceil(total / piece length) piece hashes. When `files` is present the info is multi-file and the reader ignores `length`, as libtorrent does. `files` must then be non-empty, and each file needs a valid `length` and a `path` list of byte strings. Without `files`, the info needs a valid single-file `length`. A total past 2^53 is unreadable.
- `splitPaste` splits by line first. Inside a line, a token that follows a magnet whose last parameter is `dn=` joins that magnet with a space, unless the token starts with a URI scheme (another magnet, an https link). Zero-width characters (U+200B to U+200D, U+2060, U+FEFF) split like spaces.
- `parseMagnet` reads every `xt` and `xt.N` parameter and uses the first btih that converts. A base32 btih must be 32 ASCII characters from A-Z (any case) and 2-7.

Measurement (AC 1) on the Apple Silicon dev Mac, Node 26.13.1, vitest:
- 20 generated torrents. Ten are one `pieces` string at exactly 10,485,760 bytes, the most bytes to hash. Ten are about 9.4 MB of 150,000 file entries, the most to parse. 230 slices in all.
- The test file alone: longest slice 42.3 to 44.4 ms of thread CPU (46.1 to 47.3 ms wall), total about 1.25 s. The stricter .torrent check walks each file's `path` as well, which raised the parse slice from about 30 ms. After the second review pass (2026-11-20, test file alone): longest slice 61.7 ms thread CPU (65.3 ms wall), total about 1.44 s over 230 slices.
- Inside the full suite (143 test files at once), measured before the stricter check: longest slice 58 to 68 ms of thread CPU, 83 to 118 ms wall, total about 2.2 s. After the stricter check the full suite (3526 tests, 2026-11-20) still passes the 200 ms CPU assertion; vitest hides the test's log line in a full run, so no new number is recorded.
- The test asserts that the longest slice's thread CPU time (`process.threadCpuUsage()`) stays under 200 ms. It logs wall clock without asserting it, because in the full suite wall clock also counts the time other workers held the CPU.
- Hashing one 1 MiB chunk takes about 2.5 ms. The longest slice is the 150,000-entry parse.

AD-11 docs:
- `TextDecoder` (fatal false, replacement): https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder
- BitTorrent BEP 3 (bencode, info hash): https://www.bittorrent.org/beps/bep_0003.html
- BEP 9 (magnet `xt=urn:btih`, base32): https://www.bittorrent.org/beps/bep_0009.html
- BEP 52 (v2 and hybrid torrents): https://www.bittorrent.org/beps/bep_0052.html
- SHA-1, RFC 3174 test vectors: https://www.rfc-editor.org/rfc/rfc3174
- `crypto.subtle` is secure-context only: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto

## Verification

**Commands:**
- `source ~/.nvm/nvm.sh && nvm use && npm run lint && npm run typecheck`: expected to pass.
- `source ~/.nvm/nvm.sh && nvm use && npm test`: all pass, including the new lib tests and the measurement.
- `bash .claude/skills/next-story/check.sh`: every line ok.

## Auto Run Result

Status: done (first pass; a follow-up review pass is recommended).

**Change.** Pure functions in `src/lib` for the add screen and submit: a pure-JS incremental SHA-1, a strict bencode reader that keeps byte spans, `info-hash.ts` (.torrent files hashed in 1 MiB chunks with an injected yield, magnet links with hex or base32 btih), and `add-entries.ts` (paste splitting, judging and ordering, batches under 20 entries and 50 MB). The limits are in `src/shared/torrent-add.ts` for 4.7's server.

**Files.**
- `src/shared/torrent-add.ts`: add limits and the form allowance.
- `src/lib/sha1.ts` (+ test): SHA-1, one-shot and incremental.
- `src/lib/bencode.ts` (+ test): strict, never-throwing reader with lazy byte spans.
- `src/lib/info-hash.ts` (+ test): .torrent and magnet reading, libtorrent-level validity checks.
- `src/lib/add-entries.ts` (+ test): `splitPaste`, `judgeEntries`, `addBatches`, the row labels.
- `src/lib/bencode-testing.ts`: test encoder and generated fixtures (no real torrents or trackers).

**Review.** 37 findings. Patched: medium 3 entries (magnet spaces, magnet bytes in the budget, libtorrent checks), low 9 rows. Deferred: 1 (the browser measurement, for the add screen). Rejected: 8 false, 15 low with reasons in the triage log.

**Follow-up review: true.** Two or more medium entries were patched. The unreviewed risk is the new paste joining rule and the stricter .torrent checks (a valid real-world file now rejected would show 看不懂這個檔案).

**Verification (2026-11-20, after the patches).**
- `npm run lint`, `npm run typecheck`: exit 0.
- `npm test`: 143 files, 3526 tests pass (including the measurement's 200 ms CPU assertion).
- Measurement alone: longest slice 42.3 to 44.4 ms thread CPU (46.1 to 47.3 ms wall), total about 1.25 s for 20 files.
- `check.sh`: every line ok.

**Residual risks.** Phones may run slices several times longer than the Mac. Strict parsing rejects a .torrent with bytes after the top dictionary (T5).

### Follow-up pass 1 (2026-11-20)

Status: done. Follow-up review: false (no high patched; converged).

**Review.** 34 findings. Patched: low 10 entries (ASCII base32, piece length bound, `files` wins over `length`, 64 KiB magnet cap, URI tokens not joined, doc fixes, five test gaps). Deferred: 0 new (1 carried). Rejected: 4 false, 1 maybe-false, 13 low with reasons in the triage log.

**Verification (after the patches).**
- `npm run lint`, `npm run typecheck`: exit 0.
- `npm test`: 143 files, 3542 tests pass.
- Measurement alone: longest slice 61.7 ms thread CPU (65.3 ms wall), total about 1.44 s.
- `check.sh`: every line ok.
