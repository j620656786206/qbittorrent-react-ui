import { z } from '#/shared/zod'

// AD-8, story 3.1: category keys. A category is named by qBittorrent's own
// category name; 「全部」 is `ALL` and uncategorized torrents are the empty
// string. `ALL` is a key of the settings file's `categorySort`, never an
// entry of `categoryOrder`.

export const ALL = '__all__'
export const UNCATEGORIZED = ''

/**
 * Claude 代決: qBittorrent documents no cap on a category name; 255 keeps
 * the settings file's 256 KB bound meaningful.
 */
export const MAX_CATEGORY_NAME = 255

/** A C0 or C1 control character (NUL and DEL included). */
export function hasControlChar(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true
  }
  return false
}

/**
 * A qBittorrent category name: 1 to 255 characters, no control character.
 * `__proto__` is refused: a key by that name would turn into a prototype
 * on the way through plain objects.
 */
export const categoryNameSchema = z
  .string()
  .min(1)
  .max(MAX_CATEGORY_NAME)
  .refine((name) => !hasControlChar(name), 'control character')
  .refine((name) => name !== '__proto__', 'reserved name')

/** A key of `categorySort`: `ALL`, uncategorized (`''`) or a name. */
export const categoryKeySchema = z.union([
  z.literal(ALL),
  z.literal(UNCATEGORIZED),
  categoryNameSchema,
])

/** An entry of `categoryOrder`: uncategorized or a name, never `ALL`. */
export const categoryOrderEntrySchema = z.union([
  z.literal(UNCATEGORIZED),
  categoryNameSchema.refine((name) => name !== ALL, 'ALL is not ordered'),
])

export type CategoryKey = z.infer<typeof categoryKeySchema>
