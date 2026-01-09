import { describe, expect, it } from 'vitest'
import en from '../en.json'
import zhHant from '../zh-Hant.json'
import zhCN from '../zh-CN.json'
import es from '../es.json'
import de from '../de.json'
import fr from '../fr.json'
import ja from '../ja.json'

/**
 * Recursively extracts all keys from a nested object, returning them as dot-notation paths
 * @param obj - The object to extract keys from
 * @param prefix - The prefix to prepend to keys (for nested objects)
 * @returns Array of all key paths in dot notation (e.g., ['common.pause', 'torrent.status.all'])
 */
function getAllKeys(obj: Record<string, unknown>, prefix = ''): Array<string> {
  const keys: Array<string> = []

  for (const key in obj) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    const value = obj[key]

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      // Recursively get keys from nested objects
      keys.push(...getAllKeys(value as Record<string, unknown>, fullKey))
    } else {
      // Leaf node - add the full key path
      keys.push(fullKey)
    }
  }

  return keys.sort()
}

/**
 * Compares two sorted arrays of keys and returns missing/extra keys
 */
function compareKeys(reference: Array<string>, target: Array<string>): { missing: Array<string>; extra: Array<string> } {
  const refSet = new Set(reference)
  const targetSet = new Set(target)

  const missing = reference.filter((key) => !targetSet.has(key))
  const extra = target.filter((key) => !refSet.has(key))

  return { missing, extra }
}

describe('Translation Files', () => {
  describe('Key Structure Consistency', () => {
    const referenceKeys = getAllKeys(en as Record<string, unknown>)

    it('English (reference) should have keys', () => {
      expect(referenceKeys.length).toBeGreaterThan(0)
    })

    it('Traditional Chinese (zh-Hant) should have identical keys to English', () => {
      const zhHantKeys = getAllKeys(zhHant as Record<string, unknown>)
      const { missing, extra } = compareKeys(referenceKeys, zhHantKeys)

      expect(missing).toEqual([])
      expect(extra).toEqual([])
      expect(zhHantKeys).toEqual(referenceKeys)
    })

    it('Simplified Chinese (zh-CN) should have identical keys to English', () => {
      const zhCNKeys = getAllKeys(zhCN as Record<string, unknown>)
      const { missing, extra } = compareKeys(referenceKeys, zhCNKeys)

      expect(missing).toEqual([])
      expect(extra).toEqual([])
      expect(zhCNKeys).toEqual(referenceKeys)
    })

    it('Spanish (es) should have identical keys to English', () => {
      const esKeys = getAllKeys(es as Record<string, unknown>)
      const { missing, extra } = compareKeys(referenceKeys, esKeys)

      expect(missing).toEqual([])
      expect(extra).toEqual([])
      expect(esKeys).toEqual(referenceKeys)
    })

    it('German (de) should have identical keys to English', () => {
      const deKeys = getAllKeys(de as Record<string, unknown>)
      const { missing, extra } = compareKeys(referenceKeys, deKeys)

      expect(missing).toEqual([])
      expect(extra).toEqual([])
      expect(deKeys).toEqual(referenceKeys)
    })

    it('French (fr) should have identical keys to English', () => {
      const frKeys = getAllKeys(fr as Record<string, unknown>)
      const { missing, extra } = compareKeys(referenceKeys, frKeys)

      expect(missing).toEqual([])
      expect(extra).toEqual([])
      expect(frKeys).toEqual(referenceKeys)
    })

    it('Japanese (ja) should have identical keys to English', () => {
      const jaKeys = getAllKeys(ja as Record<string, unknown>)
      const { missing, extra } = compareKeys(referenceKeys, jaKeys)

      expect(missing).toEqual([])
      expect(extra).toEqual([])
      expect(jaKeys).toEqual(referenceKeys)
    })
  })

  describe('All Languages', () => {
    const languages = [
      { name: 'English', code: 'en', translations: en },
      { name: 'Traditional Chinese', code: 'zh-Hant', translations: zhHant },
      { name: 'Simplified Chinese', code: 'zh-CN', translations: zhCN },
      { name: 'Spanish', code: 'es', translations: es },
      { name: 'German', code: 'de', translations: de },
      { name: 'French', code: 'fr', translations: fr },
      { name: 'Japanese', code: 'ja', translations: ja },
    ]

    it('should have exactly 7 languages', () => {
      expect(languages).toHaveLength(7)
    })

    it('all languages should have the same number of keys', () => {
      const keyCounts = languages.map((lang) => ({
        name: lang.name,
        count: getAllKeys(lang.translations as Record<string, unknown>).length,
      }))

      const referenceCount = keyCounts[0].count
      keyCounts.forEach((langCount) => {
        expect(langCount.count).toBe(referenceCount)
      })
    })

    it('all languages should have valid JSON structure', () => {
      languages.forEach((lang) => {
        expect(lang.translations).toBeDefined()
        expect(typeof lang.translations).toBe('object')
        expect(lang.translations).not.toBeNull()
      })
    })

    it('all languages should have top-level namespaces', () => {
      const expectedNamespaces = [
        'common',
        'torrent',
        'sidebar',
        'tags',
        'login',
        'settings',
        'batch',
        'addTorrent',
        'fileList',
        'fileTree',
        'priority',
        'trackers',
        'keyboard',
        'dropZone',
        'toast',
      ]

      languages.forEach((lang) => {
        const topLevelKeys = Object.keys(lang.translations).sort()
        expect(topLevelKeys).toEqual(expectedNamespaces.sort())
      })
    })
  })
})