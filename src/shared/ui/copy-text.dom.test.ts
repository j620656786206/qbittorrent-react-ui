// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { copyText } from '#/shared/ui/copy-text'

// Spec 2.5 rows C1, C2: the clipboard API when it works, the textarea
// fallback without it or when it rejects, `false` when both fail.

const PATH = '/data/media/tv/假影集.Fake.Show.S01'

let host: HTMLElement
let execCommand: ReturnType<typeof vi.fn>
/** What the textarea held when `copy` ran, and how it was styled. */
let seen: Array<{
  value: string
  position: string
  fontSize: string
  readOnly: boolean
  selectionStart: number | null
  selectionEnd: number | null
}>

/** Own property descriptors before the tests touch them (restored after). */
const ORIGINAL = {
  clipboard: Object.getOwnPropertyDescriptor(navigator, 'clipboard'),
  execCommand: Object.getOwnPropertyDescriptor(document, 'execCommand'),
}

function restore(
  target: object,
  name: string,
  descriptor: PropertyDescriptor | undefined,
) {
  if (descriptor) Object.defineProperty(target, name, descriptor)
  else Reflect.deleteProperty(target, name)
}

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
        fontSize: area.style.fontSize,
        readOnly: area.readOnly,
        selectionStart: area.selectionStart,
        selectionEnd: area.selectionEnd,
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
  restore(navigator, 'clipboard', ORIGINAL.clipboard)
  restore(document, 'execCommand', ORIGINAL.execCommand)
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
    // Editable and selected end to end (iOS Safari copies nothing from a
    // read-only textarea or after select() alone); 16px: no zoom on iOS.
    expect(seen).toEqual([
      {
        value: PATH,
        position: 'fixed',
        fontSize: '16px',
        readOnly: false,
        selectionStart: 0,
        selectionEnd: PATH.length,
      },
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
