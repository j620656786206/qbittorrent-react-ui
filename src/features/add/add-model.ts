import type { AddEntry, EntryStatus, JudgedEntry } from '#/lib/add-entries'
import { categoryLabel, orderCategoryKeys } from '#/lib/category-tabs'
import { formatCount } from '#/lib/format'
import { ALL, UNCATEGORIZED } from '#/shared/categories'
import type { Category } from '#/shared/maindata'

// Story 4.6 (DESIGN and EXPERIENCE add-torrent, mockups S06-add-*): the add
// screen's text and choices, pure, so they are tested in node. Judging and
// ordering are src/lib/add-entries.ts (story 4.5); this file only turns
// the judged rows into what the screen shows.

/** Where an entry came from: one pasted token or one file. */
export type AddSource =
  { kind: 'link'; text: string } | { kind: 'file'; name: string }

/** One entry on the screen: 4.5's read result plus its source. */
export interface AddItem extends AddEntry {
  /** Stable for the screen's lifetime (React keys, removal). */
  id: number
  source: AddSource
}

export type JudgedItem = JudgedEntry<AddItem>

/** The empty box and the paste strip (desktop: drag too). */
export const PASTE_TEXT_DESKTOP = '貼上磁力連結，或把 .torrent 檔拖進來'
/** EXPERIENCE add-torrent 手機: no drag on the phone. */
export const PASTE_TEXT_PHONE = '貼上磁力連結'
/** Shown in place of the paste text while files are being read. */
export const READING_TEXT = '讀取中…'
export const ADD_TITLE = '新增種子'
/** The category menu with nothing chosen. */
export const NO_CATEGORY_TEXT = '選分類'

/** The longest link text drawn; CSS cuts it to one line with 「…」 anyway. */
const LINK_SHOWN_MAX = 300

/** The first `max` code units, never ending on half of an emoji. */
export function cutText(text: string, max: number): string {
  const cut = text.slice(0, max)
  return /[\ud800-\udbff]$/.test(cut) ? cut.slice(0, -1) : cut
}

export interface RowView {
  /** Plain text: the torrent's name, else the link's start or the file name. */
  name: string
  /** A link without a name: drawn in the mono font. */
  mono: boolean
  status: EntryStatus
  label: string | null
  /** The hash 「打開」 opens, for an entry qBittorrent already has. */
  existingHash: string | null
}

export function rowView({ entry, status, label }: JudgedItem): RowView {
  const { result, source } = entry
  const sourceName =
    source.kind === 'file' ? source.name : cutText(source.text, LINK_SHOWN_MAX)
  let name = sourceName
  if (result.kind === 'file') name = result.name
  if (result.kind === 'magnet' && result.name !== null) name = result.name
  const mono =
    source.kind === 'link' && !(result.kind === 'magnet' && result.name)
  return {
    name,
    mono,
    status,
    label,
    existingHash:
      status === 'existing' && result.kind !== 'unreadable'
        ? result.hash
        : null,
  }
}

export interface AddCounts {
  addable: number
  /** Unreadable and already downloaded rows: 「有 N 個不會加」. */
  skipped: number
}

export function addCounts(rows: ReadonlyArray<JudgedItem>): AddCounts {
  const addable = rows.filter((row) => row.status === 'addable').length
  return { addable, skipped: rows.length - addable }
}

/** The footer's left text; empty when every row will be added. */
export function skippedText(skipped: number): string {
  return skipped > 0 ? `有 ${formatCount(skipped)} 個不會加` : ''
}

/** 「新增 7 個」, or 「新增」 while nothing can be added. */
export function addButtonText(addable: number): string {
  return addable > 0 ? `新增 ${formatCount(addable)} 個` : '新增'
}

/** Disabled with nothing addable or no category chosen. */
export function addDisabled(addable: number, category: string): boolean {
  return addable === 0 || category === ''
}

/** The list's accessible name. */
export function listLabel(count: number): string {
  return `要新增的種子，${formatCount(count)} 個`
}

/**
 * Every qBittorrent category (maindata's map; `''` is no category), in the
 * tabs' order: `categoryOrder` first, then the rest by name.
 */
export function categoryOptions(
  categories: Readonly<Record<string, Category>> | undefined,
  categoryOrder: ReadonlyArray<string>,
): Array<{ value: string; label: string }> {
  const names = Object.keys(categories ?? {}).filter((name) => name !== '')
  return orderCategoryKeys(names, categoryOrder).map((value) => ({
    value,
    label: categoryLabel(value),
  }))
}

/**
 * The menu's preset: the category on screen when qBittorrent has it;
 * empty in 全部 and in 未分類 (no category is named '').
 */
export function defaultCategory(
  viewCategory: string,
  options: ReadonlyArray<{ value: string }>,
): string {
  if (viewCategory === ALL || viewCategory === UNCATEGORIZED) return ''
  return options.some((option) => option.value === viewCategory)
    ? viewCategory
    : ''
}

export type SavePathLine =
  { kind: 'none' } | { kind: 'default' } | { kind: 'path'; path: string }

/** 「會存到 …」 under the menu: the category's save path, read only. */
export function savePathLine(
  category: string,
  categories: Readonly<Record<string, Category>> | undefined,
): SavePathLine {
  if (category === '' || !categories || !Object.hasOwn(categories, category))
    return { kind: 'none' }
  const { savePath } = categories[category]
  return savePath === ''
    ? { kind: 'default' }
    : { kind: 'path', path: savePath }
}

export const SAVE_PATH_PREFIX = '會存到 '
export const SAVE_PATH_DEFAULT = '會存到 qBittorrent 的預設位置'
