import { describe, expect, it } from 'vitest'
import {
  MAX_BENCODE_DEPTH,
  decodeBencode,
  dictEntries,
  dictValue,
  isByteStringList,
  listItems,
  readBytes,
  readInteger,
} from '#/lib/bencode'
import type { BSpan } from '#/lib/bencode'
import { bencode } from '#/lib/bencode-testing'

// Spec 4.5: the strict reader the info hash sits on. Every violation is a
// returned failure, never a throw.

const encode = (text: string) => new TextEncoder().encode(text)
const decodeText = (value: Uint8Array | null) =>
  value === null ? null : new TextDecoder().decode(value)

function root(bytes: Uint8Array): BSpan {
  const result = decodeBencode(bytes)
  if (!result.ok) throw new Error('parse failed')
  return result.root
}

describe('values', () => {
  it('reads integers, strings, lists and dictionaries', () => {
    const bytes = encode('d3:agei-42e4:listli1e0:e4:name3:abce')
    const dict = dictEntries(bytes, root(bytes))!
    expect(readInteger(bytes, dict.get('age'))).toBe(-42)
    const list = listItems(bytes, dict.get('list')!)!
    expect(readInteger(bytes, list[0])).toBe(1)
    expect(decodeText(readBytes(bytes, list[1]))).toBe('')
    expect(decodeText(readBytes(bytes, dict.get('name')))).toBe('abc')
  })

  it('a reader of the wrong type gives null', () => {
    const bytes = encode('d1:ai1e1:b1:x1:clee')
    const dict = dictEntries(bytes, root(bytes))!
    expect(readBytes(bytes, dict.get('a'))).toBeNull()
    expect(readInteger(bytes, dict.get('b'))).toBeNull()
    expect(dictEntries(bytes, dict.get('c')!)).toBeNull()
    expect(listItems(bytes, dict.get('a')!)).toBeNull()
    expect(readInteger(bytes, dict.get('missing'))).toBeNull()
  })

  it('keeps each dictionary value byte span', () => {
    const input = 'd4:infod4:name1:xe1:zi0ee'
    const bytes = encode(input)
    const info = dictEntries(bytes, root(bytes))!.get('info')!
    expect(input.slice(info.start, info.end)).toBe('d4:name1:xe')
  })

  it('accepts unsorted keys and keeps the first of a repeated key', () => {
    const bytes = encode('d1:bi1e1:ai2e1:bi3ee')
    const dict = dictEntries(bytes, root(bytes))!
    expect([...dict.keys()]).toEqual(['b', 'a'])
    expect(readInteger(bytes, dict.get('b'))).toBe(1)
  })

  it('dictValue finds one key without the whole map', () => {
    const input = 'd6:lengthi7e4:attr1:p6:lengthi9ee'
    const bytes = encode(input)
    const span = root(bytes)
    expect(readInteger(bytes, dictValue(bytes, span, 'length'))).toBe(7)
    expect(decodeText(readBytes(bytes, dictValue(bytes, span, 'attr')))).toBe(
      'p',
    )
    expect(dictValue(bytes, span, 'path')).toBeNull()
    expect(dictValue(bytes, span, 'lengt')).toBeNull()
    expect(dictValue(encode('li1ee'), { start: 0, end: 5 }, 'a')).toBeNull()
  })

  it('isByteStringList: a non-empty list of byte strings only', () => {
    const check = (input: string) => {
      const bytes = encode(input)
      return isByteStringList(bytes, root(bytes))
    }
    expect(check('l3:sub5:a.mkve')).toBe(true)
    expect(check('le')).toBe(false)
    expect(check('l3:subi7ee')).toBe(false)
    expect(check('l3:subl1:xee')).toBe(false)
    expect(check('5:a.mkv')).toBe(false)
    expect(isByteStringList(encode('le'), null)).toBe(false)
  })

  it('reads keys as Latin-1, byte for byte', () => {
    const bytes = new Uint8Array([
      ...encode('d2:'),
      0xc3,
      0xa9,
      ...encode('i1ee'),
    ])
    expect([...dictEntries(bytes, root(bytes))!.keys()]).toEqual(['Ã©'])
  })

  it('reads what the test encoder writes', () => {
    const bytes = bencode({ a: [1, 'two', { c: -3 }], b: 'x' })
    const dict = dictEntries(bytes, root(bytes))!
    const list = listItems(bytes, dict.get('a')!)!
    expect(list).toHaveLength(3)
    expect(decodeText(readBytes(bytes, list[1]))).toBe('two')
    expect(readInteger(bytes, dictEntries(bytes, list[2])!.get('c'))).toBe(-3)
  })
})

describe('strictness: every case is ok: false', () => {
  it.each([
    ['empty input', ''],
    ['leading zero integer', 'i03e'],
    ['negative zero', 'i-0e'],
    ['empty integer', 'ie'],
    ['minus only', 'i-e'],
    ['unterminated integer', 'i12'],
    ['non-digit in integer', 'i1x2e'],
    ['leading zero string length', '03:abc'],
    ['string longer than input', '5:abc'],
    ['string without colon', '3abc'],
    ['unterminated list', 'li1e'],
    ['unterminated dictionary', 'd1:ai1e'],
    ['integer dictionary key', 'di1ei2ee'],
    ['list dictionary key', 'dlei2ee'],
    ['dictionary key without value', 'd1:ae'],
    ['unknown token', 'x'],
    ['trailing bytes after the top value', 'i1ei2e'],
    ['trailing newline', 'de\n'],
  ])('%s', (_, input) => {
    expect(decodeBencode(encode(input))).toEqual({ ok: false })
  })

  it('nesting deeper than the limit fails instead of overflowing', () => {
    const nest = (depth: number) =>
      encode('l'.repeat(depth) + 'e'.repeat(depth))
    expect(decodeBencode(nest(MAX_BENCODE_DEPTH + 1))).toEqual({ ok: false })
    expect(decodeBencode(nest(MAX_BENCODE_DEPTH)).ok).toBe(true)
  })

  it('a million unclosed lists fails without throwing', () => {
    expect(decodeBencode(encode('l'.repeat(1_000_000)))).toEqual({ ok: false })
  })
})
