import { describe, expect, it } from 'vitest'
import {
  FILE_PRIORITY_CHOICES,
  FILE_PRIORITY_WORDS,
  choicePriority,
  filePriorityLevel,
  isFileWanted,
  tickPriority,
} from '#/lib/file-priority'

// Spec 2.7 rows R1 to R3 at the pure level.

describe('file priority levels', () => {
  it.each([
    [0, 'skip', '不下載', false],
    [1, 'normal', '一般', true],
    [2, 'normal', '一般', true],
    [5, 'normal', '一般', true],
    [6, 'high', '高', true],
    [7, 'max', '最高', true],
    [-1, 'skip', '不下載', false],
    [9, 'max', '最高', true],
  ] as const)('priority %s reads %s (%s)', (priority, level, word, wanted) => {
    expect(filePriorityLevel(priority)).toBe(level)
    expect(FILE_PRIORITY_WORDS[filePriorityLevel(priority)]).toBe(word)
    expect(isFileWanted(priority)).toBe(wanted)
  })

  it('the menu offers 一般, 高, 最高 in that order', () => {
    expect(FILE_PRIORITY_CHOICES.map((c) => FILE_PRIORITY_WORDS[c])).toEqual([
      '一般',
      '高',
      '最高',
    ])
  })

  it('R1 unticking sends 0, ticking sends 1', () => {
    expect(tickPriority(false)).toBe(0)
    expect(tickPriority(true)).toBe(1)
  })

  it('R2 a choice sends its value; the current level sends nothing', () => {
    expect(choicePriority(1, 'high')).toBe(6)
    expect(choicePriority(1, 'max')).toBe(7)
    expect(choicePriority(7, 'normal')).toBe(1)
    expect(choicePriority(1, 'normal')).toBeNull()
    // 2 to 5 read as 一般: choosing 一般 sends nothing.
    expect(choicePriority(3, 'normal')).toBeNull()
    expect(choicePriority(6, 'high')).toBeNull()
  })
})
