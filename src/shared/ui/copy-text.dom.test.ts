// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { copyText } from '#/shared/ui/copy-text'

// Spec 2.5 rows C1, C2: the clipboard API when it works, the textarea
// fallback without it or when it rejects, `false` when both fail.

const PATH = '/data/media/tv/假影集.Fake.Show.S01'

let host: HTMLElement
let execCommand: ReturnType<typeof vi.fn>
/** What the textarea held when `copy` ran, and how it was styled. */
let seen: Array<{ value: string; position: string; styleAttr: string | null }>

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', {
    value,
    configurable: true,
  })
}

beforeEach(() => {
  host = document.createElement('section')
  document.body.append(host)
  seen = []
  execCommand = vi.fn((command: string) => {
    const area = host.querySelector('textarea')
    if (command === 'copy' && area) {
      seen.push({
        value: area.value,
        position: area.style.position,
        styleAttr: area.getAttribute('style'),
      })
      return true
    }
    return false
  })
  Object.defineProperty(document, 'execCommand', {
    value: execCommand,
    configurable: true,
    writable: true,
  })
})

afterEach(() => {
  document.body.replaceChildren()
  setClipboard(undefined)
  vi.restoreAllMocks()
})

describe('copyText', () => {
  it('C1 uses navigator.clipboard when it works; no textarea', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    setClipboard({ writeText })
    expect(await copyText(PATH, host)).toBe(true)
    expect(writeText).toHaveBeenCalledWith(PATH)
    expect(execCommand).not.toHaveBeenCalled()
  })

  it('C2 no navigator.clipboard (plain http): the textarea inside host', async () => {
    setClipboard(undefined)
    const button = document.createElement('button')
    host.append(button)
    button.focus()
    expect(await copyText(PATH, host)).toBe(true)
    expect(seen).toEqual([
      expect.objectContaining({ value: PATH, position: 'fixed' }),
    ])
    // Removed again, and focus is back on the button.
    expect(host.querySelector('textarea')).toBeNull()
    expect(document.activeElement).toBe(button)
  })

  it('C2 a rejecting navigator.clipboard falls back to the textarea', async () => {
    setClipboard({
      writeText: () =>
        Promise.reject(new DOMException('no', 'NotAllowedError')),
    })
    expect(await copyText(PATH, host)).toBe(true)
    expect(seen.map((entry) => entry.value)).toEqual([PATH])
  })

  it('C2 both fail: false, nothing left behind', async () => {
    setClipboard({ writeText: () => Promise.reject(new Error('no')) })
    execCommand.mockImplementation(() => false)
    expect(await copyText(PATH, host)).toBe(false)
    execCommand.mockImplementation(() => {
      throw new Error('unsupported')
    })
    expect(await copyText(PATH, host)).toBe(false)
    expect(host.querySelector('textarea')).toBeNull()
  })
})
