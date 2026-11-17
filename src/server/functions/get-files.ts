import { guard, input, serverGet } from '#/server/functions/_define'
import { getQbitClient } from '#/server/qbit'
import { ok } from '#/shared/errors'
import { getFilesInputSchema } from '#/shared/torrent-files'

// AD-6 files exception, story 2.7: the files of the one torrent the 檔案 tab
// shows (qBittorrent 5.1.4 `torrents/files`), each with index, name, size,
// progress and priority only, in qBittorrent's order. Reads only.
export const getFiles = serverGet
  .validator(input(getFilesInputSchema))
  .handler(
    guard({ name: 'getFiles' }, async ({ input: values }) =>
      ok(await getQbitClient().torrentFiles(values.hash)),
    ),
  )
