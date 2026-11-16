// FR-9, AR-41: the one rule set for every number, size, speed, time and
// ratio on screen (EXPERIENCE 數字寫法). qBittorrent's special values (the
// infinite `eta`, the "at or above max" ratio) are handled here and nowhere
// else. Inputs stay qBittorrent's own units: bytes, bytes/s, Unix seconds.
// Nothing here reads the clock or the runtime zone on its own: callers pass
// `now` (epoch ms) and, optionally, an IANA `timeZone`.

/** What a missing value reads as (`text-muted` on screen). */
export const NO_VALUE = '沒有'

/** qBittorrent 5.1.4's `eta` for "never" (100 days in seconds). */
export const QBIT_ETA_INFINITY = 8_640_000

/** qBittorrent 5.1.4 reports a ratio at or above the max ratio as -1. */
const QBIT_RATIO_INFINITY = -1

const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const KIB = 1024

const grouped = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

/** Fixed or up-to-n decimals with thousands separators, cached by shape. */
const decimalFormats = new Map<string, Intl.NumberFormat>()
function decimals(value: number, min: number, max: number): string {
  const key = `${min}-${max}`
  let format = decimalFormats.get(key)
  if (!format) {
    format = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: min,
      maximumFractionDigits: max,
    })
    decimalFormats.set(key, format)
  }
  return format.format(value)
}

/** Half up at `places` decimals (inputs here are never negative). */
function roundTo(value: number, places: number): number {
  const scale = 10 ** places
  return Math.round(value * scale) / scale
}

/** Floor at `places` decimals, ignoring float error just under a step. */
function floorTo(value: number, places: number): number {
  const scale = 10 ** places
  return Math.floor(value * scale + 1e-9) / scale
}

function isMissing(
  value: number | null | undefined,
): value is null | undefined {
  return value === null || value === undefined || Number.isNaN(value)
}

/** 「3,631」 */
export function formatCount(value: number | null | undefined): string {
  if (isMissing(value)) return NO_VALUE
  return grouped.format(value)
}

const SIZE_UNITS = ['KB', 'MB', 'GB', 'TB', 'PB'] as const

/**
 * 1024-based, at most one decimal, 「.0」 dropped, unit picked after rounding
 * (1023.96 GiB is 「1 TB」): 「512 B」 「85 GB」 「301.2 GB」 「1,023 GB」.
 */
export function formatSize(bytes: number | null | undefined): string {
  if (isMissing(bytes)) return NO_VALUE
  const value = Math.max(0, bytes)
  if (value < KIB) return `${grouped.format(Math.round(value))} B`
  let unit = 0
  let scaled = roundTo(value / KIB, 1)
  while (scaled >= KIB && unit < SIZE_UNITS.length - 1) {
    unit += 1
    scaled = roundTo(value / KIB ** (unit + 1), 1)
  }
  return `${decimals(scaled, 0, 1)} ${SIZE_UNITS[unit]}`
}

/**
 * KB/s as a whole number (a non-zero speed under 1 KB/s is 「1 KB/s」), from
 * 1,024 KB/s on MB/s with two decimals under 10 and one from 10:
 * 「0 KB/s」 「1,023 KB/s」 「1.00 MB/s」 「6.21 MB/s」 「10.0 MB/s」.
 */
export function formatSpeed(bytesPerSecond: number | null | undefined): string {
  if (isMissing(bytesPerSecond)) return NO_VALUE
  const value = Math.max(0, bytesPerSecond)
  if (value === 0) return '0 KB/s'
  const kb = Math.max(1, Math.round(value / KIB))
  if (kb < KIB) return `${grouped.format(kb)} KB/s`
  const units = ['MB/s', 'GB/s', 'TB/s'] as const
  for (let index = 0; index < units.length; index += 1) {
    const scaled = value / KIB ** (index + 2)
    const isLast = index === units.length - 1
    // Two decimals under 10, one from 10; the unit is decided after rounding.
    let shown = roundTo(scaled, 2)
    let places = 2
    if (shown >= 10) {
      shown = roundTo(scaled, 1)
      places = 1
    }
    if (shown < KIB || isLast) {
      return `${decimals(shown, places, places)} ${units[index]}`
    }
  }
  // Unreachable: the last unit always returns.
  return NO_VALUE
}

/** A row's second line leaves the speed out when it is 0 or missing. */
export function formatRowSpeed(
  bytesPerSecond: number | null | undefined,
): string | null {
  if (isMissing(bytesPerSecond) || !(bytesPerSecond > 0)) return null
  return formatSpeed(bytesPerSecond)
}

/** The two largest non-zero parts of an ETA, floored: 「3 小時 12 分」. */
function etaParts(seconds: number): string {
  const days = Math.floor(seconds / DAY)
  const hours = Math.floor((seconds % DAY) / HOUR)
  const minutes = Math.floor((seconds % HOUR) / MINUTE)
  if (days > 0) return hours > 0 ? `${days} 天 ${hours} 小時` : `${days} 天`
  if (hours > 0)
    return minutes > 0 ? `${hours} 小時 ${minutes} 分` : `${hours} 小時`
  return `${minutes} 分`
}

/**
 * 「剩不到 1 分」 「剩 34 分」 「剩 3 小時 12 分」 「剩 2 天 5 小時」; no download
 * speed, a negative or the infinite `eta`: 「剩餘時間不明」.
 */
export function formatEta(eta: number, dlspeed: number): string {
  const unknown = !(dlspeed > 0) || !(eta >= 0) || eta >= QBIT_ETA_INFINITY
  if (unknown) return '剩餘時間不明'
  if (eta < MINUTE) return '剩不到 1 分'
  return `剩 ${etaParts(eta)}`
}

interface ZonedParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

/** One cached formatter per zone (`''` is the runtime's local zone). */
const zoneFormats = new Map<string, Intl.DateTimeFormat>()
const ZONE_FIELDS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
}
/** An unknown zone name falls back to the runtime's zone instead of throwing. */
function zoneFormat(timeZone: string | undefined): Intl.DateTimeFormat {
  const key = timeZone ?? ''
  let format = zoneFormats.get(key)
  if (!format) {
    try {
      format = new Intl.DateTimeFormat('en-US', { ...ZONE_FIELDS, timeZone })
    } catch (error) {
      if (!(error instanceof RangeError)) throw error
      format = new Intl.DateTimeFormat('en-US', ZONE_FIELDS)
    }
    zoneFormats.set(key, format)
  }
  return format
}

function zonedParts(epochMs: number, timeZone: string | undefined): ZonedParts {
  const parts: Partial<Record<Intl.DateTimeFormatPartTypes, number>> = {}
  for (const part of zoneFormat(timeZone).formatToParts(epochMs)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value)
  }
  return {
    year: parts.year ?? 0,
    month: parts.month ?? 0,
    day: parts.day ?? 0,
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
  }
}

/** Calendar day number, for "today" / "yesterday" in the given zone. */
function dayNumber({ year, month, day }: ZonedParts): number {
  return Date.UTC(year, month - 1, day) / (DAY * 1000)
}

const pad2 = (value: number) => String(value).padStart(2, '0')

/**
 * The day something happened (added, completed), 24-hour clock:
 * 「今天 09:12」 「昨天 21:40」 「11/05」 (this year) 「2025/07/18」; a time of
 * 0 or less (qBittorrent's "never") is 「沒有」, a future day is 「今天」.
 */
export function formatDate(
  unixSeconds: number | null | undefined,
  now: number,
  timeZone?: string,
): string {
  if (isMissing(unixSeconds) || unixSeconds <= 0) return NO_VALUE
  const then = zonedParts(unixSeconds * 1000, timeZone)
  const today = zonedParts(now, timeZone)
  const daysAgo = dayNumber(today) - dayNumber(then)
  const time = `${pad2(then.hour)}:${pad2(then.minute)}`
  // A time after today (the NAS clock runs ahead) still reads as today.
  if (daysAgo <= 0) return `今天 ${time}`
  if (daysAgo === 1) return `昨天 ${time}`
  const monthDay = `${pad2(then.month)}/${pad2(then.day)}`
  if (then.year === today.year) return monthDay
  return `${then.year}/${monthDay}`
}

/** Single largest unit, floored. Under 10 s (or in the future) is 「剛剛」. */
function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  if (seconds < 10) return '剛剛'
  if (seconds < MINUTE) return `${seconds} 秒前`
  if (seconds < HOUR) return `${Math.floor(seconds / MINUTE)} 分前`
  if (seconds < DAY) return `${Math.floor(seconds / HOUR)} 小時前`
  return `${Math.floor(seconds / DAY)} 天前`
}

/** How long ago: 「剛剛」 「20 秒前」 「5 分前」 「3 小時前」 「3 天前」. */
export function formatAgo(
  unixSeconds: number | null | undefined,
  now: number,
): string {
  if (isMissing(unixSeconds)) return NO_VALUE
  return formatElapsed(now - unixSeconds * 1000)
}

/**
 * A length of time (seeding time), single largest unit, floored; days even
 * past a year: 「41 天」 「5 小時」 「12 分」 「不到 1 分」 「412 天」.
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (isMissing(seconds)) return NO_VALUE
  if (seconds >= DAY) return `${Math.floor(seconds / DAY)} 天`
  if (seconds >= HOUR) return `${Math.floor(seconds / HOUR)} 小時`
  if (seconds >= MINUTE) return `${Math.floor(seconds / MINUTE)} 分`
  return '不到 1 分'
}

/** Two decimals, floored (so 「1.00」 always means good); -1 is 「∞」. */
export function formatRatio(ratio: number | null | undefined): string {
  if (isMissing(ratio)) return NO_VALUE
  if (ratio === QBIT_RATIO_INFINITY) return '∞'
  return decimals(shownRatio(ratio), 2, 2)
}

/** The value formatRatio shows; `good` is decided on it so the two agree. */
function shownRatio(ratio: number): number {
  return floorTo(Math.max(0, ratio), 2)
}

/** A shown ratio of 1.00 or more, or qBittorrent's "at or above max", is `good`. */
export function isGoodRatio(ratio: number | null | undefined): boolean {
  if (isMissing(ratio)) return false
  return ratio === QBIT_RATIO_INFINITY || shownRatio(ratio) >= 1
}

/** Whole percent, floored; never 「100%」 before the torrent is complete. */
export function formatPercent(progress: number | null | undefined): string {
  if (isMissing(progress)) return NO_VALUE
  if (progress >= 1) return '100%'
  const percent = Math.min(99, Math.floor(Math.max(0, progress) * 100 + 1e-9))
  return `${percent}%`
}
