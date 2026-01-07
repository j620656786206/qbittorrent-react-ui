import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearAllTags,
  createTag,
  deleteTag,
  formatTagString,
  getTagById,
  getTagByName,
  getTags,
  getTagsByNames,
  isValidTagColor,
  parseTagString,
  tagNameExists,
  updateTag,
  validateTagName,
} from '../tag-storage'
import type { Tag } from '@/types/tag'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
  }
})()

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

describe('Tag Storage', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  describe('getTags', () => {
    it('should return empty array when no tags exist', () => {
      const tags = getTags()
      expect(tags).toEqual([])
    })

    it('should return empty array when localStorage contains invalid JSON', () => {
      localStorageMock.getItem.mockReturnValueOnce('invalid json')
      const tags = getTags()
      expect(tags).toEqual([])
    })

    it('should return empty array when localStorage contains non-array', () => {
      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify({ notAnArray: true }))
      const tags = getTags()
      expect(tags).toEqual([])
    })

    it('should filter out invalid tag entries', () => {
      const mixedData = [
        { id: 'valid-id', name: 'Valid Tag', createdAt: Date.now() },
        { id: 'missing-name', createdAt: Date.now() },
        { name: 'missing-id', createdAt: Date.now() },
        { id: 'missing-createdAt', name: 'No Date' },
        null,
        'string entry',
        123,
      ]
      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(mixedData))
      const tags = getTags()
      expect(tags).toHaveLength(1)
      expect(tags[0].name).toBe('Valid Tag')
    })

    it('should return valid tags from localStorage', () => {
      const validTags: Array<Tag> = [
        { id: 'tag-1', name: 'Movies', color: 'blue', createdAt: Date.now() },
        { id: 'tag-2', name: 'TV Shows', createdAt: Date.now() },
      ]
      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(validTags))
      const tags = getTags()
      expect(tags).toHaveLength(2)
      expect(tags[0].name).toBe('Movies')
      expect(tags[1].name).toBe('TV Shows')
    })
  })

  describe('createTag', () => {
    it('should create a tag with valid name', () => {
      const tag = createTag('Movies')
      expect(tag.name).toBe('Movies')
      expect(tag.id).toBeDefined()
      expect(tag.createdAt).toBeDefined()
      expect(typeof tag.createdAt).toBe('number')
    })

    it('should create a tag with valid color', () => {
      const tag = createTag('Movies', 'blue')
      expect(tag.name).toBe('Movies')
      expect(tag.color).toBe('blue')
    })

    it('should ignore invalid color and set undefined', () => {
      const tag = createTag('Movies', 'invalid-color')
      expect(tag.name).toBe('Movies')
      expect(tag.color).toBeUndefined()
    })

    it('should trim whitespace from tag name', () => {
      const tag = createTag('  Movies  ')
      expect(tag.name).toBe('Movies')
    })

    it('should throw error for empty tag name', () => {
      expect(() => createTag('')).toThrow('Tag name cannot be empty')
    })

    it('should throw error for whitespace-only tag name', () => {
      expect(() => createTag('   ')).toThrow('Tag name cannot be empty')
    })

    it('should throw error for tag name exceeding 50 characters', () => {
      const longName = 'a'.repeat(51)
      expect(() => createTag(longName)).toThrow('Tag name cannot exceed 50 characters')
    })

    it('should throw error for tag name containing commas', () => {
      expect(() => createTag('Movies, TV')).toThrow('Tag name cannot contain commas')
    })

    it('should throw error for duplicate tag name (case-insensitive)', () => {
      createTag('Movies')
      expect(() => createTag('movies')).toThrow('Tag "movies" already exists')
      expect(() => createTag('MOVIES')).toThrow('Tag "MOVIES" already exists')
    })

    it('should persist tag to localStorage', () => {
      createTag('Movies')
      expect(localStorageMock.setItem).toHaveBeenCalled()
      const storedData = localStorageMock.setItem.mock.calls[0][1]
      const parsedData = JSON.parse(storedData)
      expect(parsedData).toHaveLength(1)
      expect(parsedData[0].name).toBe('Movies')
    })
  })

  describe('getTagById', () => {
    it('should return tag when found', () => {
      const createdTag = createTag('Movies')
      const foundTag = getTagById(createdTag.id)
      expect(foundTag).toBeDefined()
      expect(foundTag?.name).toBe('Movies')
    })

    it('should return undefined when tag not found', () => {
      const foundTag = getTagById('non-existent-id')
      expect(foundTag).toBeUndefined()
    })
  })

  describe('getTagByName', () => {
    it('should return tag when found (case-insensitive)', () => {
      createTag('Movies')
      expect(getTagByName('Movies')?.name).toBe('Movies')
      expect(getTagByName('movies')?.name).toBe('Movies')
      expect(getTagByName('MOVIES')?.name).toBe('Movies')
    })

    it('should return tag with trimmed name matching', () => {
      createTag('Movies')
      expect(getTagByName('  Movies  ')?.name).toBe('Movies')
    })

    it('should return undefined when tag not found', () => {
      const foundTag = getTagByName('NonExistent')
      expect(foundTag).toBeUndefined()
    })
  })

  describe('updateTag', () => {
    it('should update tag name', () => {
      const tag = createTag('Movies')
      const updated = updateTag(tag.id, { name: 'Films' })
      expect(updated.name).toBe('Films')
      expect(updated.id).toBe(tag.id)
    })

    it('should update tag color', () => {
      const tag = createTag('Movies', 'blue')
      const updated = updateTag(tag.id, { color: 'green' })
      expect(updated.color).toBe('green')
    })

    it('should remove color when invalid color provided', () => {
      const tag = createTag('Movies', 'blue')
      const updated = updateTag(tag.id, { color: 'invalid' })
      expect(updated.color).toBeUndefined()
    })

    it('should update both name and color', () => {
      const tag = createTag('Movies')
      const updated = updateTag(tag.id, { name: 'Films', color: 'red' })
      expect(updated.name).toBe('Films')
      expect(updated.color).toBe('red')
    })

    it('should throw error when tag not found', () => {
      expect(() => updateTag('non-existent-id', { name: 'New Name' })).toThrow(
        'Tag with ID "non-existent-id" not found'
      )
    })

    it('should throw error for empty new name', () => {
      const tag = createTag('Movies')
      expect(() => updateTag(tag.id, { name: '' })).toThrow('Tag name cannot be empty')
    })

    it('should throw error for duplicate new name (case-insensitive)', () => {
      createTag('Movies')
      const tag2 = createTag('TV Shows')
      expect(() => updateTag(tag2.id, { name: 'Movies' })).toThrow(
        'Tag "Movies" already exists'
      )
    })

    it('should allow updating name to same value (case variations)', () => {
      const tag = createTag('movies')
      const updated = updateTag(tag.id, { name: 'MOVIES' })
      expect(updated.name).toBe('MOVIES')
    })

    it('should trim whitespace from updated name', () => {
      const tag = createTag('Movies')
      const updated = updateTag(tag.id, { name: '  Films  ' })
      expect(updated.name).toBe('Films')
    })
  })

  describe('deleteTag', () => {
    it('should delete existing tag and return true', () => {
      const tag = createTag('Movies')
      const result = deleteTag(tag.id)
      expect(result).toBe(true)
      expect(getTagById(tag.id)).toBeUndefined()
    })

    it('should return false when tag not found', () => {
      const result = deleteTag('non-existent-id')
      expect(result).toBe(false)
    })

    it('should only delete the specified tag', () => {
      const tag1 = createTag('Movies')
      const tag2 = createTag('TV Shows')
      deleteTag(tag1.id)
      expect(getTagById(tag1.id)).toBeUndefined()
      expect(getTagById(tag2.id)).toBeDefined()
    })
  })

  describe('clearAllTags', () => {
    it('should remove all tags from localStorage', () => {
      createTag('Movies')
      createTag('TV Shows')
      clearAllTags()
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('qbit_tags')
      expect(getTags()).toEqual([])
    })
  })

  describe('tagNameExists', () => {
    it('should return true when tag name exists', () => {
      createTag('Movies')
      expect(tagNameExists('Movies')).toBe(true)
      expect(tagNameExists('movies')).toBe(true)
    })

    it('should return false when tag name does not exist', () => {
      expect(tagNameExists('Movies')).toBe(false)
    })

    it('should exclude specified id from check', () => {
      const tag = createTag('Movies')
      expect(tagNameExists('Movies', tag.id)).toBe(false)
    })

    it('should still find other tags when excludeId is provided', () => {
      const tag1 = createTag('Movies')
      createTag('TV Shows')
      expect(tagNameExists('TV Shows', tag1.id)).toBe(true)
    })
  })

  describe('validateTagName', () => {
    it('should return undefined for valid tag names', () => {
      expect(validateTagName('Movies')).toBeUndefined()
      expect(validateTagName('TV Shows')).toBeUndefined()
      expect(validateTagName('4K HDR')).toBeUndefined()
      expect(validateTagName('a'.repeat(50))).toBeUndefined()
    })

    it('should return error for empty name', () => {
      expect(validateTagName('')).toBe('Tag name cannot be empty')
      expect(validateTagName('   ')).toBe('Tag name cannot be empty')
    })

    it('should return error for name exceeding 50 characters', () => {
      expect(validateTagName('a'.repeat(51))).toBe('Tag name cannot exceed 50 characters')
    })

    it('should return error for name containing commas', () => {
      expect(validateTagName('Movies, TV')).toBe('Tag name cannot contain commas')
    })
  })

  describe('isValidTagColor', () => {
    it('should return true for valid Tailwind colors', () => {
      expect(isValidTagColor('blue')).toBe(true)
      expect(isValidTagColor('red')).toBe(true)
      expect(isValidTagColor('green')).toBe(true)
      expect(isValidTagColor('purple')).toBe(true)
      expect(isValidTagColor('slate')).toBe(true)
      expect(isValidTagColor('rose')).toBe(true)
    })

    it('should return false for invalid colors', () => {
      expect(isValidTagColor('invalid')).toBe(false)
      expect(isValidTagColor('navy')).toBe(false)
      expect(isValidTagColor('#ff0000')).toBe(false)
      expect(isValidTagColor('rgb(255,0,0)')).toBe(false)
    })

    it('should return false for undefined or empty', () => {
      expect(isValidTagColor(undefined)).toBe(false)
      expect(isValidTagColor('')).toBe(false)
    })
  })

  describe('getTagsByNames', () => {
    it('should return matching tags by names', () => {
      createTag('Movies', 'blue')
      createTag('TV Shows', 'green')
      createTag('Music', 'red')

      const tags = getTagsByNames(['Movies', 'Music'])
      expect(tags).toHaveLength(2)
      expect(tags.map((t) => t.name)).toContain('Movies')
      expect(tags.map((t) => t.name)).toContain('Music')
    })

    it('should handle case-insensitive matching', () => {
      createTag('Movies')
      const tags = getTagsByNames(['movies', 'MOVIES'])
      expect(tags).toHaveLength(1)
      expect(tags[0].name).toBe('Movies')
    })

    it('should handle whitespace in names', () => {
      createTag('Movies')
      const tags = getTagsByNames(['  Movies  '])
      expect(tags).toHaveLength(1)
    })

    it('should return empty array when no matches', () => {
      createTag('Movies')
      const tags = getTagsByNames(['NonExistent'])
      expect(tags).toHaveLength(0)
    })

    it('should return empty array for empty input', () => {
      createTag('Movies')
      const tags = getTagsByNames([])
      expect(tags).toHaveLength(0)
    })
  })

  describe('parseTagString', () => {
    it('should parse comma-separated tag string', () => {
      const result = parseTagString('Movies,TV Shows,4K')
      expect(result).toEqual(['Movies', 'TV Shows', '4K'])
    })

    it('should handle whitespace around tags', () => {
      const result = parseTagString('  Movies  ,  TV Shows  ,  4K  ')
      expect(result).toEqual(['Movies', 'TV Shows', '4K'])
    })

    it('should filter out empty entries', () => {
      const result = parseTagString('Movies,,TV Shows,,,4K')
      expect(result).toEqual(['Movies', 'TV Shows', '4K'])
    })

    it('should return empty array for empty string', () => {
      expect(parseTagString('')).toEqual([])
    })

    it('should return empty array for whitespace-only string', () => {
      expect(parseTagString('   ')).toEqual([])
    })

    it('should handle single tag', () => {
      const result = parseTagString('Movies')
      expect(result).toEqual(['Movies'])
    })
  })

  describe('formatTagString', () => {
    it('should format tag array to comma-separated string', () => {
      const result = formatTagString(['Movies', 'TV Shows', '4K'])
      expect(result).toBe('Movies,TV Shows,4K')
    })

    it('should filter out empty tags', () => {
      const result = formatTagString(['Movies', '', 'TV Shows', '   '])
      expect(result).toBe('Movies,TV Shows')
    })

    it('should return empty string for empty array', () => {
      expect(formatTagString([])).toBe('')
    })

    it('should handle single tag', () => {
      const result = formatTagString(['Movies'])
      expect(result).toBe('Movies')
    })
  })
})
