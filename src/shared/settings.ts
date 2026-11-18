import { z } from '#/shared/zod'
import {
  categoryKeySchema,
  categoryOrderEntrySchema,
  hasControlChar,
} from '#/shared/categories'
import { savePathSchema } from '#/shared/save-path'
import { SORT_DIRS, SORT_FIELD_IDS } from '#/shared/sort-fields'

// AD-8, story 3.1: the settings file's format, fixed here once. Changing it
// means changing the architecture spine first; `version` only goes up when
// an existing field changes meaning (src/server/settings/migrations.ts).
// The container reads the file entry by entry (one bad entry is dropped,
// not the section), so these schemas also describe one entry each.

export const SETTINGS_VERSION = 1
/** The settings file's size bound; the container refuses a bigger file. */
export const MAX_SETTINGS_BYTES = 262_144
export const MAX_COMMON_PATHS = 50
export const MAX_COMMON_PATH_NAME = 50

/** A remembered sort: one of the 51 ids and a direction. */
export const sortChoiceSchema = z.strictObject({
  sort: z.enum(SORT_FIELD_IDS),
  dir: z.enum(SORT_DIRS),
})

/**
 * A common path's name: 1 to 50 characters, no control character (line
 * breaks included, like category names), not only whitespace.
 */
export const commonPathNameSchema = z
  .string()
  .min(1)
  .max(MAX_COMMON_PATH_NAME)
  .refine((name) => !hasControlChar(name), 'control character')
  .refine((name) => name.trim() !== '', 'only whitespace')

/** A common path; its normalized `path` is its identity (not its index). */
export const commonPathSchema = z.strictObject({
  path: savePathSchema,
  name: commonPathNameSchema,
  mediaLibrary: z.boolean(),
})

export const settingsSchema = z.strictObject({
  version: z.literal(SETTINGS_VERSION),
  /** Category key (`ALL`, `''` or a name) to its remembered sort. */
  categorySort: z.record(categoryKeySchema, sortChoiceSchema),
  /** Category names in tab order, never `ALL`. */
  categoryOrder: z.array(categoryOrderEntrySchema),
  commonPaths: z.array(commonPathSchema).max(MAX_COMMON_PATHS),
})

export type SortChoice = z.infer<typeof sortChoiceSchema>
export type CommonPath = z.infer<typeof commonPathSchema>
export type Settings = z.infer<typeof settingsSchema>

export function defaultSettings(): Settings {
  return {
    version: SETTINGS_VERSION,
    categorySort: {},
    categoryOrder: [],
    commonPaths: [],
  }
}

export const getSettingsInputSchema = z.undefined()

export type GetSettingsInput = z.infer<typeof getSettingsInputSchema>

export const setCategorySortInputSchema = z.strictObject({
  category: categoryKeySchema,
  sort: z.enum(SORT_FIELD_IDS),
  dir: z.enum(SORT_DIRS),
})

export type SetCategorySortInput = z.infer<typeof setCategorySortInputSchema>

/**
 * Story 3.3: the whole new tab order (`setCategoryOrder`). Each entry is a
 * `categoryOrder` entry (never `ALL`), no name twice, and the list fits the
 * settings file's 256 KB bound; anything else is `invalid_input`.
 */
export const setCategoryOrderInputSchema = z.strictObject({
  order: z
    .array(categoryOrderEntrySchema)
    .refine((order) => new Set(order).size === order.length, 'duplicate')
    .refine(
      (order) =>
        new TextEncoder().encode(JSON.stringify(order)).length <=
        MAX_SETTINGS_BYTES,
      'too large',
    ),
})

export type SetCategoryOrderInput = z.infer<typeof setCategoryOrderInputSchema>
