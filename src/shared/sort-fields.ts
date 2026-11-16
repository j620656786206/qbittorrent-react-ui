// AR-6, AR-46, AD-8: the 51 sort ids, the only list of them. Ids are
// qBittorrent 5.1.4's own field names; derived ones (avg speeds, global
// volume, tracker domain, basenames) are snake_case. The settings file (Epic
// 3), the URL search params and the sort menu all take ids from here.
//
// Direction: `desc` is the arrow ↓ and the first of the two direction words
// (大的、新的、久的、高的在前, A 到 Z, 是在前); `asc` is ↑ and the second.
// So for text `desc` means A to Z (EXPERIENCE 排序方向: 名稱排序 ↓ 是 A 到 Z).
//
// `source: 'slim'` fields are in the slim torrent table (getMaindata);
// `extra` ones come on demand from getSortKeys (AD-6, 2026-11-16).

export type SortDir = 'asc' | 'desc'

export const SORT_DIRS = [
  'asc',
  'desc',
] as const satisfies ReadonlyArray<SortDir>

export type SortGroup =
  | 'time'
  | 'progress'
  | 'speed'
  | 'traffic'
  | 'size'
  | 'peers'
  | 'name'
  | 'path'
  | 'limits'
  | 'tech'

export const SORT_GROUP_LABELS: Readonly<Record<SortGroup, string>> = {
  time: '時間',
  progress: '進度',
  speed: '速度',
  traffic: '流量和分享率',
  size: '大小',
  peers: '人數',
  name: '名稱和分類',
  path: '路徑',
  limits: '限制和設定',
  tech: '技術資訊',
}

/**
 * How the row's big number is written (EXPERIENCE 列表右邊的大數字), and so
 * which formatter and "no value" rule in src/lib/format.ts apply.
 */
export type BigNumberKind =
  /** A point in time: 「今天 09:12」 「11/05」. */
  | 'date'
  /** How long ago (EXPERIENCE 離現在多久): 「3 小時前」. */
  | 'ago'
  /** A length of time in seconds: 「41 天」. */
  | 'duration'
  /** qBittorrent's share ratio, -1 is 「∞」: 「3.12」. */
  | 'ratio'
  /** Another two-decimal number: 「0.87」. */
  | 'decimal'
  /** 0 to 1: 「87%」. */
  | 'percent'
  /** Bytes/s; 0 is a muted 「0」. */
  | 'speed'
  /** Bytes: 「301.2 GB」. */
  | 'size'
  /** A whole number: 「12」. */
  | 'count'
  /** Bytes/s, unset is 「不限速」. */
  | 'speed_limit'
  /** 「是」「否」. */
  | 'boolean'
  /** Plain text, cut at the end (category, basenames, comment, domain). */
  | 'text'
  /** A full path, cut from the front. */
  | 'path'
  /** The save path's location label: 「media/tv」. */
  | 'location'
  /** The first 8 characters in the path font. */
  | 'hash'
  /** The progress (「87%」) or the status word (「做種中」). */
  | 'status'

export interface SortFieldDef {
  id: string
  /** The Chinese name in the menu and on the pill. */
  label: string
  group: SortGroup
  /** 1 to 5 for the top five (their menu position), otherwise undefined. */
  top?: 1 | 2 | 3 | 4 | 5
  defaultDir: SortDir
  /** The words for `desc` (↓) and `asc` (↑). */
  words: { desc: string; asc: string }
  kind: BigNumberKind
  source: 'slim' | 'extra'
  /** `state` has no direction (no arrow); every other field has one. */
  directional: boolean
}

const W = {
  long: { desc: '久的在前', asc: '短的在前' },
  newest: { desc: '新的在前', asc: '舊的在前' },
  high: { desc: '高的在前', asc: '低的在前' },
  large: { desc: '大的在前', asc: '小的在前' },
  alpha: { desc: 'A 到 Z', asc: 'Z 到 A' },
  yes: { desc: '是在前', asc: '否在前' },
  state: { desc: '要處理的在前', asc: '完成的在前' },
} as const

function field<
  const TId extends string,
  const TSource extends 'slim' | 'extra',
>(
  id: TId,
  label: string,
  group: SortGroup,
  kind: BigNumberKind,
  words: { desc: string; asc: string },
  source: TSource,
  top?: SortFieldDef['top'],
): SortFieldDef & { id: TId; source: TSource } {
  return {
    id,
    label,
    group,
    top,
    // EXPERIENCE: every listed default is the ↓ direction (long, new, high,
    // large, A to Z; booleans 是 first is Claude 代決).
    defaultDir: 'desc',
    words,
    kind,
    source,
    directional: id !== 'state',
  }
}

/** Top five first (menu order), then the 46 under 更多 by group. */
export const SORT_FIELDS = [
  field('state', '狀態', 'name', 'status', W.state, 'slim', 1),
  field('seeding_time', '做種時間', 'time', 'duration', W.long, 'slim', 2),
  field('added_on', '加入時間', 'time', 'date', W.newest, 'slim', 3),
  field('ratio', '分享率', 'traffic', 'ratio', W.high, 'slim', 4),
  field('completion_on', '完成時間', 'time', 'date', W.newest, 'slim', 5),
  // 時間
  field('time_active', '活動時間', 'time', 'duration', W.long, 'extra'),
  field('last_activity', '最後活動', 'time', 'ago', W.newest, 'slim'),
  field('seen_complete', '最後看到完整', 'time', 'ago', W.newest, 'extra'),
  field('eta', '剩餘時間', 'time', 'duration', W.long, 'slim'),
  // 進度
  field('progress', '進度', 'progress', 'percent', W.large, 'slim'),
  field('amount_left', '剩餘大小', 'progress', 'size', W.large, 'extra'),
  field('availability', '可用度', 'progress', 'decimal', W.large, 'extra'),
  // 速度
  field('dlspeed', '下載速度', 'speed', 'speed', W.large, 'slim'),
  field('upspeed', '上傳速度', 'speed', 'speed', W.large, 'slim'),
  field('avg_dlspeed', '平均下載速度', 'speed', 'speed', W.large, 'extra'),
  field('avg_upspeed', '平均上傳速度', 'speed', 'speed', W.large, 'extra'),
  field('global_speed', '總速度', 'speed', 'speed', W.large, 'slim'),
  // 流量和分享率
  field('uploaded', '已上傳', 'traffic', 'size', W.large, 'extra'),
  field('downloaded', '已下載', 'traffic', 'size', W.large, 'extra'),
  field('uploaded_session', '這次已上傳', 'traffic', 'size', W.large, 'extra'),
  field(
    'downloaded_session',
    '這次已下載',
    'traffic',
    'size',
    W.large,
    'extra',
  ),
  field('global_volume', '總流量', 'traffic', 'size', W.large, 'extra'),
  field('popularity', '熱門度', 'traffic', 'decimal', W.large, 'extra'),
  // 大小
  field('size', '大小', 'size', 'size', W.large, 'slim'),
  field('total_size', '總大小', 'size', 'size', W.large, 'extra'),
  // 人數 (VueTorrent: connected seeds and peers, then the swarm's)
  field('num_seeds', '做種人數（連上的）', 'peers', 'count', W.large, 'extra'),
  field('num_leechs', '下載人數（連上的）', 'peers', 'count', W.large, 'extra'),
  field('num_complete', '做種人數（全部）', 'peers', 'count', W.large, 'extra'),
  field(
    'num_incomplete',
    '下載人數（全部）',
    'peers',
    'count',
    W.large,
    'extra',
  ),
  // 名稱和分類
  field('name', '名稱', 'name', 'status', W.alpha, 'slim'),
  field('category', '分類', 'name', 'text', W.alpha, 'slim'),
  field('tracker_domain', 'Tracker 網域', 'name', 'text', W.alpha, 'extra'),
  field('trackers_count', 'Tracker 數量', 'name', 'count', W.large, 'extra'),
  field('private', '私人種子', 'name', 'boolean', W.yes, 'slim'),
  // 路徑
  field('save_path', '儲存路徑', 'path', 'location', W.alpha, 'slim'),
  field('content_path', '內容路徑', 'path', 'path', W.alpha, 'extra'),
  field('root_path', '根路徑', 'path', 'path', W.alpha, 'extra'),
  field(
    'content_path_basename',
    '內容路徑最後一層',
    'path',
    'text',
    W.alpha,
    'extra',
  ),
  field(
    'save_path_basename',
    '儲存路徑最後一層',
    'path',
    'text',
    W.alpha,
    'slim',
  ),
  // 限制和設定
  field('dl_limit', '下載上限', 'limits', 'speed_limit', W.large, 'extra'),
  field('up_limit', '上傳上限', 'limits', 'speed_limit', W.large, 'extra'),
  field('ratio_limit', '分享率上限', 'limits', 'decimal', W.high, 'extra'),
  field(
    'seeding_time_limit',
    '做種時間上限',
    'limits',
    'duration',
    W.long,
    'extra',
  ),
  field(
    'inactive_seeding_time_limit',
    '閒置做種時間上限',
    'limits',
    'duration',
    W.long,
    'extra',
  ),
  field('priority', '排隊順序', 'limits', 'count', W.large, 'extra'),
  field(
    'reannounce',
    '下次回報 Tracker',
    'limits',
    'duration',
    W.long,
    'extra',
  ),
  // 技術資訊
  field('hash', 'Hash', 'tech', 'hash', W.alpha, 'slim'),
  field('infohash_v1', 'Infohash v1', 'tech', 'hash', W.alpha, 'extra'),
  field('infohash_v2', 'Infohash v2', 'tech', 'hash', W.alpha, 'extra'),
  field('has_metadata', '有種子資訊', 'tech', 'boolean', W.yes, 'extra'),
  field('comment', '註解', 'tech', 'text', W.alpha, 'extra'),
] as const satisfies ReadonlyArray<SortFieldDef>

type FieldTuple = typeof SORT_FIELDS

export type SortFieldId = FieldTuple[number]['id']

/** The ids in table order, as a tuple for `z.enum`. */
export const SORT_FIELD_IDS = SORT_FIELDS.map((entry) => entry.id) as [
  SortFieldId,
  ...Array<SortFieldId>,
]

const BY_ID: ReadonlyMap<string, SortFieldDef> = new Map(
  SORT_FIELDS.map((entry) => [entry.id, entry]),
)

export function isSortFieldId(value: unknown): value is SortFieldId {
  return typeof value === 'string' && BY_ID.has(value)
}

export function sortField(id: SortFieldId): SortFieldDef {
  // Every SortFieldId is in the table.
  return BY_ID.get(id) as SortFieldDef
}

export type ExtraSortFieldId = Extract<
  FieldTuple[number],
  { source: 'extra' }
>['id']

export const EXTRA_SORT_FIELD_IDS = SORT_FIELDS.filter(
  (entry) => entry.source === 'extra',
).map((entry) => entry.id) as [ExtraSortFieldId, ...Array<ExtraSortFieldId>]

export function isExtraSortField(id: SortFieldId): id is ExtraSortFieldId {
  return sortField(id).source === 'extra'
}

/** The five at the top of the menu, in order. */
export const TOP_SORT_FIELDS: ReadonlyArray<SortFieldDef> = (
  SORT_FIELDS as ReadonlyArray<SortFieldDef>
).filter((entry) => entry.top !== undefined)

export interface SortFieldGroup {
  group: SortGroup
  label: string
  fields: ReadonlyArray<SortFieldDef>
}

/** The 46 under 更多, by group in table order. */
export const MORE_SORT_GROUPS: ReadonlyArray<SortFieldGroup> = (() => {
  const groups = new Map<SortGroup, Array<SortFieldDef>>()
  for (const entry of SORT_FIELDS as ReadonlyArray<SortFieldDef>) {
    if (entry.top !== undefined) continue
    const list = groups.get(entry.group) ?? []
    list.push(entry)
    groups.set(entry.group, list)
  }
  return [...groups].map(([group, fields]) => ({
    group,
    label: SORT_GROUP_LABELS[group],
    fields,
  }))
})()

/** `true` when the field is listed under 更多 (not in the top five). */
export function isUnderMore(id: SortFieldId): boolean {
  return sortField(id).top === undefined
}

/** 「↓」 or 「↑」. */
export function dirArrow(dir: SortDir): string {
  return dir === 'desc' ? '↓' : '↑'
}
