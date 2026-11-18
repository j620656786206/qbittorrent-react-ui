import { describe, expect, it } from 'vitest'
import {
  ERROR_REASON_MAX_CHARS,
  errorReasonText,
  hasErroredTorrent,
  isErroredTorrent,
  parseErrorLine,
} from '#/lib/error-reason'
import { fakeHash, t } from '#/lib/testing'
import type { SlimTorrent } from '#/shared/maindata'

// Spec 2.10: parse qBittorrent 5.1.4 log lines, pass the reason through
// the allow-list and translate it. Fake lines only: code-name paths (X, mteam-X) and documentation
// addresses (RFC 5737 IPv4, RFC 3849 IPv6).

const fileError = (name: string, file: string, reason: string) =>
  `File error alert. Torrent: "${name}". File: "${file}". Reason: "${reason}"`
const errored = (name: string, error: string) =>
  `Torrent errored. Torrent: "${name}". Error: "${error}"`
const uploadOnly = (reason: string) =>
  `Couldn't write to file. Reason: "${reason}". Torrent is now in "upload only" mode.`

describe('parseErrorLine', () => {
  it("matrix 1: a file error alert gives libtorrent's OS text, translated", () => {
    expect(
      parseErrorLine(
        fileError(
          'Fake.Show.S01E05',
          '/data/media/X/incompleted/a.mkv',
          'Fake.Show.S01E05 file_open (/data/media/X/incompleted/a.mkv) error: No such file or directory',
        ),
      ),
    ).toEqual({ name: 'Fake.Show.S01E05', reason: '找不到檔案或資料夾' })
  })

  it('matrix 2: an upload-only error gives the inner reason, translated', () => {
    expect(
      parseErrorLine(errored('N', uploadOnly('No space left on device'))),
    ).toEqual({ name: 'N', reason: '磁碟空間不足' })
  })

  it('a torrent errored line with plain English keeps it whole', () => {
    expect(
      parseErrorLine(
        errored('N', 'torrent file collides with file from another torrent'),
      ),
    ).toEqual({
      name: 'N',
      reason: 'torrent file collides with file from another torrent',
    })
  })

  it('a torrent errored line with a path is recognised with no reason', () => {
    expect(
      parseErrorLine(
        errored('N', 'fake tracker said no to /data/torrent/mteam-X'),
      ),
    ).toEqual({ name: 'N', reason: null })
  })

  it('a file error without 「error: 」 is recognised but shows nothing', () => {
    expect(
      parseErrorLine(
        fileError(
          'N',
          '/data/media/X/a.mkv',
          'N file_open (/data/media/X/a.mkv)',
        ),
      ),
    ).toEqual({ name: 'N', reason: null })
  })

  it('an empty reason is recognised with no reason', () => {
    expect(parseErrorLine(errored('N', '   '))).toEqual({
      name: 'N',
      reason: null,
    })
  })

  it('takes the text after the last 「error: 」', () => {
    expect(
      parseErrorLine(
        fileError(
          'N',
          'f',
          'N file_rename (error: x) error: Permission denied',
        ),
      )?.reason,
    ).toBe('沒有權限')
  })

  it('a name with quotes and markup stays as written', () => {
    const name = '<img src=x onerror=alert(1)> "Fake" mteam-X'
    expect(
      parseErrorLine(fileError(name, 'f', 'n error: File too large')),
    ).toEqual({ name, reason: '檔案太大' })
  })

  it.each([
    ['another warning', 'Fast resume data was rejected. Torrent: "N"'],
    ['a prefix that is not at the start', `x ${errored('N', 'boom')}`],
    ['an info line', 'Added new torrent. Torrent: "N"'],
    ['a truncated line', 'File error alert. Torrent: "N". File: "f"'],
  ])('%s: null', (_name, message) => {
    expect(parseErrorLine(message)).toBeNull()
  })
})

// qBittorrent 5.1.4 src/lang/qbittorrent_zh_TW.ts, zh_HK.ts, zh_CN.ts: the
// lines are written through tr(); libtorrent's part stays English.
describe('parseErrorLine in a Chinese qBittorrent', () => {
  const OS =
    'mteam-X.Fake file_open (/data/media/X/a.mkv) error: No such file or directory'

  it.each([
    [
      'zh_TW file error',
      `檔案錯誤警告。Torrent：「mteam-X.Fake」。檔案：「/data/media/X/a.mkv」。原因：「${OS}」`,
      '找不到檔案或資料夾',
    ],
    [
      'zh_HK file error (理由)',
      `檔案錯誤警告。Torrent：「mteam-X.Fake」。檔案：「/data/media/X/a.mkv」。理由：「${OS}」`,
      '找不到檔案或資料夾',
    ],
    [
      'zh_CN file error',
      `文件错误警报。Torrent：“mteam-X.Fake”。文件：“/data/media/X/a.mkv”。原因：“${OS}”`,
      '找不到檔案或資料夾',
    ],
    [
      'zh_TW upload only',
      'Torrent 錯誤。Torrent：「mteam-X.Fake」。錯誤：「無法寫入檔案。原因：「No space left on device」。Torrent 目前為「僅上傳」模式。」',
      '磁碟空間不足',
    ],
    [
      'zh_HK upload only',
      'Torrent 錯誤。Torrent：「mteam-X.Fake」。錯誤：「無法寫入檔案。理由：「No space left on device」。Torrent 目前處在「僅上傳」模式。」',
      '磁碟空間不足',
    ],
    [
      'zh_CN upload only',
      'Torrent 出错了。Torrent：“mteam-X.Fake”。错误：“无法写入文件。原因：“No space left on device”。Torrent 目前处在 “仅上传” 模式。”',
      '磁碟空間不足',
    ],
    [
      'zh_TW another error',
      'Torrent 錯誤。Torrent：「mteam-X.Fake」。錯誤：「Permission denied」',
      '沒有權限',
    ],
  ])('%s', (_name, message, reason) => {
    expect(parseErrorLine(message)).toEqual({ name: 'mteam-X.Fake', reason })
  })
})

describe('errorReasonText', () => {
  it('matrix 3: an unknown reason with an IP address and a path shows nothing', () => {
    expect(errorReasonText('tracker 203.0.113.5 refused /srv/x/y')).toBeNull()
  })

  it.each([
    ['No such file or directory', '找不到檔案或資料夾'],
    ['no space left on device', '磁碟空間不足'],
    ['Permission denied', '沒有權限'],
    ['Operation not permitted', '沒有權限'],
    ['Read-only file system', '磁碟是唯讀的'],
    ['Input/output error', '磁碟讀寫錯誤'],
    ['I/O error', '磁碟讀寫錯誤'],
    ['FILE TOO LARGE', '檔案太大'],
    ['  No   space left\ton device ', '磁碟空間不足'],
    ['Transport endpoint is not connected', '磁碟連線中斷'],
    ['Stale file handle', '檔案連結已失效'],
    ['disk quota exceeded', '超過磁碟配額'],
    ['Too many open files', '開啟的檔案太多'],
    ['File name too long', '檔名太長'],
    ['Is a directory', '這是資料夾，不是檔案'],
    ['NOT A DIRECTORY', '路徑裡有一段不是資料夾'],
  ])('translates %j', (raw, text) => {
    expect(errorReasonText(raw)).toBe(text)
  })

  it.each([
    [
      'a libtorrent error',
      'torrent file collides with file from another torrent',
    ],
    ['a reason with , and -', "can't open the file, it is in use - try later"],
    ['an OS text with words around it', 'Permission denied for X'],
  ])('shows %s as written', (_name, raw) => {
    expect(errorReasonText(raw)).toBe(raw)
  })

  it('collapses whitespace in a reason shown as written', () => {
    expect(errorReasonText('  mismatching\n file   size ')).toBe(
      'mismatching file size',
    )
  })

  // Shapes seen in qBittorrent 5.1.4 logs, with fake names: anything that
  // is not plain English words never leaves the container.
  it.each([
    ['a POSIX path', 'cannot open /data/X/a.mkv now'],
    ['a path with spaces', 'cannot open /data/X/My Show/ep 1.mkv now'],
    ['a path word with no slash', 'cannot open /data/X/Fake Secret/Show now'],
    ['a Windows path', 'cannot open C:\\Downloads\\X\\a.mkv now'],
    ['a UNC path', 'at \\\\nas\\share\\X\\a.mkv'],
    ['a quoted path', 'open "/data/media/X/a b.mkv"'],
    ['a 「」 quoted path', 'open 「/data/X/假 檔名.mkv」'],
    ['a bare file name', 'cannot open fake-secret.mkv'],
    ['a host with a port and no dot', 'tracker nas:8080 refused'],
    ['a host name', 'tracker.example.com said no'],
    ['an IPv4 address', 'peer 198.51.100.7 hung up'],
    ['an IPv6 address', 'peer 2001:db8::1 hung up'],
    ['an account', 'login fake-user@nas.example failed'],
    ['a URL', 'GET https://tracker.example/announce?passkey=fake failed'],
    [
      'a fast resume line',
      'mteam-X.Fake fast resume rejected. file_stat(/data/media/X/incompleted/fake@a b.mp4): mismatching file size',
    ],
    [
      'a bdecode error',
      'expected value (list, dict, int or string) in bencoded string [bdecode:4]',
    ],
    ['Chinese text', '找不到 X 的檔案'],
    ['a version', 'libtorrent 2.0.11 said no'],
    ['an empty reason', '   '],
    ['markup', '<img src=x onerror=alert(1)>'],
  ])('never shows %s', (_name, raw) => {
    expect(errorReasonText(raw)).toBeNull()
  })

  it('a plain reason of exactly 120 characters stays; 121 shows nothing', () => {
    const raw = 'y'.repeat(ERROR_REASON_MAX_CHARS)
    expect(errorReasonText(raw)).toBe(raw)
    expect(errorReasonText(`${raw}y`)).toBeNull()
  })
})

describe('hasErroredTorrent', () => {
  const data = (
    torrents: Array<SlimTorrent>,
    stateBeforeMove: Record<string, string> = {},
  ) => ({
    torrents: Object.fromEntries(torrents.map((x) => [x.hash, x])),
    stateBeforeMove,
  })

  it('true with a torrent in the error state', () => {
    expect(
      hasErroredTorrent(
        data([
          t({ hash: fakeHash(1) }),
          t({ hash: fakeHash(2), state: 'error' }),
        ]),
      ),
    ).toBe(true)
  })

  it.each([
    ['missing files (private)', { state: 'missingFiles', private: true }],
    ['missing files (archived)', { state: 'missingFiles', private: false }],
    ['an unknown code', { state: 'unknown' }],
    ['stalled', { state: 'stalledDL' }],
  ])('false for %s', (_name, overrides) => {
    expect(
      hasErroredTorrent(data([t({ hash: fakeHash(1), ...overrides })])),
    ).toBe(false)
  })

  it('false for none', () => {
    expect(hasErroredTorrent(data([]))).toBe(false)
  })

  it('a move remembered as error counts', () => {
    const hash = fakeHash(3)
    const torrent = t({ hash, state: 'moving' })
    expect(isErroredTorrent(torrent, { [hash]: 'error' })).toBe(true)
    expect(hasErroredTorrent(data([torrent], { [hash]: 'error' }))).toBe(true)
    expect(isErroredTorrent(torrent, {})).toBe(false)
  })

  it('answers each snapshot once', () => {
    const snapshot = data([t({ hash: fakeHash(1), state: 'error' })])
    expect(hasErroredTorrent(snapshot)).toBe(true)
    // Same object: the cached answer, even if a test mutates it.
    snapshot.torrents = {}
    expect(hasErroredTorrent(snapshot)).toBe(true)
  })
})
