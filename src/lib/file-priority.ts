import type { FilePriority } from '#/shared/torrent-files'

// Story 2.7 (EXPERIENCE 檔案分頁): how a file's qBittorrent priority reads
// in the files tab, and what a tick or a menu choice sends. The one place
// that maps priority numbers to words: 0 (or below) 不下載, 1 to 5 一般
// (older qBittorrent values 2 to 5 included), 6 高, 7 (or above) 最高.

export type FilePriorityLevel = 'skip' | 'normal' | 'high' | 'max'

export function filePriorityLevel(priority: number): FilePriorityLevel {
  if (priority <= 0) return 'skip'
  if (priority >= 7) return 'max'
  if (priority === 6) return 'high'
  return 'normal'
}

export const FILE_PRIORITY_WORDS: Readonly<Record<FilePriorityLevel, string>> =
  {
    skip: '不下載',
    normal: '一般',
    high: '高',
    max: '最高',
  }

/** What each level sends to qBittorrent. */
export const FILE_PRIORITY_VALUES: Readonly<
  Record<FilePriorityLevel, FilePriority>
> = {
  skip: 0,
  normal: 1,
  high: 6,
  max: 7,
}

/** The priority menu's items, top to bottom (不下載 is the checkbox). */
export const FILE_PRIORITY_CHOICES: ReadonlyArray<
  Exclude<FilePriorityLevel, 'skip'>
> = ['normal', 'high', 'max']

/** The checkbox: ticked while the file downloads at all. */
export function isFileWanted(priority: number): boolean {
  return filePriorityLevel(priority) !== 'skip'
}

/** Ticking sends 1 (一般), unticking 0 (不下載). */
export function tickPriority(checked: boolean): FilePriority {
  return checked ? FILE_PRIORITY_VALUES.normal : FILE_PRIORITY_VALUES.skip
}

/** A menu choice: its value, or `null` when it is the current level. */
export function choicePriority(
  current: number,
  choice: FilePriorityLevel,
): FilePriority | null {
  return filePriorityLevel(current) === choice
    ? null
    : FILE_PRIORITY_VALUES[choice]
}
