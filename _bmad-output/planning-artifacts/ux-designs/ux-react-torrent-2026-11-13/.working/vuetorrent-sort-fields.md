# VueTorrent 的排序欄位（v2.37.0 master，src/components/Dashboard/Toolbar.vue）

共 54 個。分組是 Claude 分的，不是 VueTorrent 的。

2026-11-14 react-torrent 拿掉 3 個（Claude 代決，`.memlog.md` #124 的 F99）：`download_path`、`basename_download_path`、`tags`，下面標「（不做）」。理由：暫存路徑沒在用，標籤一個都沒有。react-torrent 剩 51 個。

## 時間（7）
- `added_on`：Added On
- `completed_on`：Completed On
- `seeding_time`：Seeding Time
- `time_active`：Time Active
- `last_activity`：Last Active
- `seen_complete`：Seen Complete
- `eta`：ETA

## 進度（3）
- `progress`：Progress
- `amount_left`：Amount Left
- `availability`：Availability

## 速度（5）
- `dlspeed`：DL Speed
- `upspeed`：UL Speed
- `avgDownloadSpeed`：Avg. DL Speed
- `avgUploadSpeed`：Avg. UL Speed
- `globalSpeed`：Global Speed

## 流量和分享率（7）
- `uploaded`：Uploaded (global)
- `downloaded`：Downloaded (global)
- `uploaded_session`：Uploaded (session)
- `downloaded_session`：Downloaded (session)
- `ratio`：Ratio
- `globalVolume`：Global Volume
- `popularity`：Popularity

## 大小（2）
- `size`：Size
- `total_size`：Total Size

## 人數（4）
- `num_seeds`：Seeds (connected)
- `num_leechs`：Peers (connected)
- `available_seeds`：Seeds (swarm)
- `available_peers`：Peers (swarm)

## 名稱和分類（7）
- `name`：Torrent Title
- `category`：Category
- `tags`：Tags（不做）
- `trackerDomain`：Tracker 網域（en.json 裡沒有對應字串）
- `trackers_count`：Trackers Count
- `private`：Is Private
- `state`：State

## 路徑（7）
- `savePath`：Save Path
- `download_path`：DL Path（不做）
- `content_path`：Content Path
- `rootPath`：Root path
- `basename_content_path`：Content Path (basename)
- `basename_download_path`：Download Path (basename)（不做）
- `basename_save_path`：Save Path (basename)

## 限制和設定（7）
- `dl_limit`：DL Limit
- `up_limit`：UL Limit
- `ratio_limit`：Ratio limit
- `seeding_time_limit`：Seeding Time Limit
- `inactive_seeding_time_limit`：Inactive Seeding Time Limit
- `priority`：Queue Pos.
- `reannounce`：Next Reannounce

## 技術資訊（5）
- `hash`：Hash
- `infohash_v1`：Infohash v1
- `infohash_v2`：Infohash v2
- `hasMetadata`：Has Metadata
- `comment`：Comment
