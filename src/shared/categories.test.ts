import { describe, expect, it } from 'vitest'
import {
  ALL,
  MAX_CATEGORY_NAME,
  UNCATEGORIZED,
  categoryKeySchema,
  categoryOrderEntrySchema,
  hasControlChar,
} from '#/shared/categories'

// Story 3.1 (AD-8): category keys. Code-name categories only (X, mteam-X).

describe('category keys', () => {
  it('ALL is __all__ and uncategorized is the empty string', () => {
    expect(ALL).toBe('__all__')
    expect(UNCATEGORIZED).toBe('')
    expect(MAX_CATEGORY_NAME).toBe(255)
  })

  it.each([[ALL], [''], ['X'], ['mteam-X'], ['影集'], ['x'.repeat(255)]])(
    'categoryKeySchema accepts %j',
    (key) => {
      expect(categoryKeySchema.safeParse(key).success).toBe(true)
    },
  )

  it.each([
    ['256 characters', 'x'.repeat(256)],
    ['a control character', 'mteam\u0007X'],
    ['a newline', 'X\n'],
    ['DEL', 'X\u007f'],
    ['a C1 control', 'X\u0085'],
    ['NUL', 'X\u0000'],
    ['__proto__', '__proto__'],
    ['a number', 5],
  ])('categoryKeySchema rejects %s', (_name, key) => {
    expect(categoryKeySchema.safeParse(key).success).toBe(false)
  })

  it('categoryOrder entries: a name or uncategorized, never ALL', () => {
    expect(categoryOrderEntrySchema.safeParse('X').success).toBe(true)
    expect(categoryOrderEntrySchema.safeParse('').success).toBe(true)
    expect(categoryOrderEntrySchema.safeParse(ALL).success).toBe(false)
    expect(categoryOrderEntrySchema.safeParse('X\t').success).toBe(false)
  })

  it('hasControlChar', () => {
    expect(hasControlChar('plain 中文 name')).toBe(false)
    expect(hasControlChar('\u001f')).toBe(true)
    expect(hasControlChar(' ')).toBe(false)
  })
})
