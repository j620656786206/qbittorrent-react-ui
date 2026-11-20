// @vitest-environment happy-dom
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { addOpenStore, closeAdd } from '#/state/add-open'
import { MAINDATA_KEY } from '#/state/maindata'
import { setShortcutAction } from '#/state/shortcuts'
import {
  ARCHIVED,
  NEW_A,
  NEW_B,
  env,
  render,
  settle,
  settleReads,
  open,
  screen,
  textarea,
  box,
  rows,
  rowStatuses,
  rowNames,
  submit,
  select,
  pathLine,
  buttonNamed,
  paste,
  pick,
  click,
  press,
  torrentFile,
  setDesktop,
  crossTo,
  type,
} from '#/features/add/add-screen-testing'

// Spec 4.6: the add screen in a DOM, beyond A1 to A10: the dialog layer,
// the phone sheet, the typed draft, focus, the read queue, the category
// resets and the review's edge cases (harness: add-screen-testing.tsx).

describe('the dialog layer', () => {
  it('no shortcut runs while it is open; Esc closes it', async () => {
    const openSearch = vi.fn(() => true)
    setShortcutAction('openSearch', openSearch)
    await render()
    await open()
    await act(async () => buttonNamed('取消').focus())
    await press('/')
    expect(openSearch).not.toHaveBeenCalled()
    await press('Escape')
    expect(addOpenStore.state.open).toBe(false)
    await press('/')
    expect(openSearch).toHaveBeenCalledTimes(1)
  })
})

describe('the phone sheet', () => {
  it('a 90% sheet titled 新增種子 with the button pinned under it and no cancel', async () => {
    setDesktop(false)
    await render()
    await open()
    const sheet = document.querySelector<HTMLElement>(
      '[data-slot="bottom-sheet"]',
    )
    expect(sheet).not.toBeNull()
    expect(sheet?.querySelector('h2')?.textContent).toBe('新增種子')
    expect(textarea().getAttribute('aria-label')).toBe('貼上磁力連結')
    expect(box()?.textContent).toContain('貼上磁力連結')
    expect(box()?.textContent).not.toContain('拖')
    const footer = sheet?.querySelector('[data-slot="bottom-sheet-footer"]')
    expect(footer?.querySelector('[data-add-submit]')).not.toBeNull()
    // The category and 會存到 stay in view in the pinned footer; the list is
    // the sheet's scrolling content.
    expect(footer?.querySelector('select')).not.toBeNull()
    expect(footer?.querySelector('[data-add-path]')).not.toBeNull()
    const content = sheet?.querySelector('[data-slot="bottom-sheet-content"]')
    expect(content?.querySelector('[data-add-box]')).not.toBeNull()
    expect(buttonNamed('取消')).toBeUndefined()
    await paste(`junk\nmagnet:?xt=urn:btih:${ARCHIVED}`)
    expect(content?.querySelector('[data-add-frame]')).not.toBeNull()
    expect(screen().querySelector('[data-add-strip]')?.className).toContain(
      'sticky',
    )
    // Labels sit on the line under the name; 44px buttons.
    const row = rows()[0]
    expect(row.className).toContain('min-h-12')
    expect(row.querySelector('[data-add-remove]')?.className).toContain(
      'size-11',
    )
    await press('Escape')
    await settle()
    expect(addOpenStore.state.open).toBe(false)
  })
})

describe('the typed draft', () => {
  it('survives a pick that turns the box into the list', async () => {
    await render()
    await open()
    await type('magnet:?xt=urn:btih:')
    await pick([torrentFile('Fake.File.S01').file])
    await settleReads()
    expect(box()).toBeNull()
    expect(rows()).toHaveLength(1)
    expect(textarea().value).toBe('magnet:?xt=urn:btih:')
  })

  it('survives crossing 1024px', async () => {
    await render()
    await open()
    await paste(`magnet:?xt=urn:btih:${NEW_A}`)
    await type('half typed')
    await crossTo(false)
    expect(document.querySelector('[data-slot="bottom-sheet"]')).not.toBeNull()
    expect(rows()).toHaveLength(1)
    expect(textarea().value).toBe('half typed')
  })

  it('a paste while typing goes into the draft at the caret, judged on Enter', async () => {
    await render()
    await open()
    await type('magnet:?xt=urn:btih:&dn=Fake.A')
    const area = textarea()
    area.setSelectionRange(20, 20)
    await paste(NEW_A, [], area)
    expect(rows()).toHaveLength(0)
    expect(textarea().value).toBe(`magnet:?xt=urn:btih:${NEW_A}&dn=Fake.A`)
    expect(textarea().selectionStart).toBe(20 + NEW_A.length)
    await press('Enter', textarea())
    await settle()
    expect(rowNames()).toEqual(['Fake.A'])
    expect(textarea().value).toBe('')
  })

  it('every open starts with an empty draft, the phone sheet too', async () => {
    await render()
    await open()
    await type('left over')
    await click(buttonNamed('取消'))
    await open()
    expect(textarea().value).toBe('')
    await act(async () => closeAdd())
    await crossTo(false)
    await open()
    await type('left over')
    await act(async () => closeAdd())
    await open()
    expect(textarea().value).toBe('')
  })
})

describe('focus when the box and the list swap', () => {
  it('after the first paste focus is on the strip, so a second paste works', async () => {
    await render()
    await open()
    expect(document.activeElement).toBe(textarea())
    await paste(`magnet:?xt=urn:btih:${NEW_A}`)
    expect(box()).toBeNull()
    const strip = screen().querySelector('[data-add-strip]')
    expect(strip?.contains(document.activeElement)).toBe(true)
    await paste(
      `magnet:?xt=urn:btih:${NEW_B}`,
      [],
      document.activeElement as HTMLElement,
    )
    expect(rows()).toHaveLength(2)
  })
})

describe('the read queue', () => {
  it('a pick after close and reopen is read without waiting for the old one', async () => {
    const stuck = {
      name: 'stuck.torrent',
      size: 10,
      arrayBuffer: () => new Promise<ArrayBuffer>(() => {}),
    } as unknown as File
    await render()
    await open()
    await pick([stuck])
    await settle()
    await act(async () => closeAdd())
    await open()
    await pick([torrentFile('Fake.File.S01').file])
    await settleReads()
    expect(rowNames()).toEqual(['Fake.File.S01'])
  })
})

describe('the category resets', () => {
  it('a pick is forgotten on close: the next open has the preset again', async () => {
    env.viewCategory = 'mteam-X'
    await render()
    await open()
    await act(async () => {
      select().value = 'X'
      select().dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(select().value).toBe('X')
    await click(buttonNamed('取消'))
    await open()
    expect(select().value).toBe('mteam-X')
  })
})

describe('the submit button', () => {
  it('has the solid hover like the other primary buttons', async () => {
    await render()
    await open()
    expect(submit().className).toContain('hover-solid')
  })
})

describe('more edge cases (review)', () => {
  it('a read that throws counts as 看不懂這個檔案 and the queue keeps going', async () => {
    const throwing = {
      name: 'broken.torrent',
      get size(): number {
        throw new Error('gone')
      },
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    } as unknown as File
    await render()
    await open()
    await pick([
      torrentFile('Fake.A').file,
      throwing,
      torrentFile('Fake.B').file,
    ])
    await settleReads()
    expect(rowNames()).toEqual(['broken.torrent', 'Fake.A', 'Fake.B'])
    expect(rows()[0].querySelector('[data-add-label]')?.textContent).toBe(
      '看不懂這個檔案',
    )
    expect(
      screen().querySelector('[data-add-strip]')?.textContent,
    ).not.toContain('讀取中…')
    // Later picks are still read.
    await pick([torrentFile('Fake.C').file])
    await settleReads()
    expect(rowNames()).toContain('Fake.C')
  })

  it('before maindata loads 新增 stays disabled; once loaded the rows are judged again', async () => {
    env.viewCategory = 'X'
    await render({ loaded: false })
    await open()
    await paste(`magnet:?xt=urn:btih:${ARCHIVED}\nmagnet:?xt=urn:btih:${NEW_A}`)
    expect(submit().getAttribute('aria-disabled')).toBe('true')
    await act(async () => {
      env.loadMaindata()
    })
    await settle()
    expect(rowStatuses()).toEqual(['existing', 'addable'])
    expect(submit().textContent).toBe('新增 1 個')
    expect(submit().hasAttribute('aria-disabled')).toBe(false)
  })

  it('Enter while an IME composes does not judge the draft; Enter after it does', async () => {
    await render()
    await open()
    await type(`magnet:?xt=urn:btih:${NEW_A}`)
    const composingEnter = (init: KeyboardEventInit) =>
      act(async () => {
        textarea().dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Enter',
            bubbles: true,
            cancelable: true,
            ...init,
          }),
        )
      })
    await composingEnter({ isComposing: true })
    await composingEnter({ keyCode: 229 })
    expect(rows()).toHaveLength(0)
    expect(textarea().value).toBe(`magnet:?xt=urn:btih:${NEW_A}`)
    await press('Enter', textarea())
    await settle()
    expect(rowStatuses()).toEqual(['addable'])
  })

  it('a paste that leaves the draft unchanged never moves the caret later', async () => {
    await render()
    await open()
    await type('abc')
    textarea().setSelectionRange(1, 1)
    await paste('', [], textarea())
    expect(textarea().value).toBe('abc')
    await type('abcd')
    expect(textarea().selectionStart).toBe(4)
  })

  it('a chosen category that leaves qBittorrent clears the menu, the path and 新增', async () => {
    await render()
    await open()
    await paste(`magnet:?xt=urn:btih:${NEW_A}`)
    await act(async () => {
      select().value = 'X'
      select().dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(pathLine()).toBe('會存到 /data/media/X')
    expect(submit().hasAttribute('aria-disabled')).toBe(false)
    const { X: _gone, ...rest } = env.categories
    env.categories = rest
    await act(async () => {
      await env.client.refetchQueries({ queryKey: MAINDATA_KEY })
    })
    await settle()
    expect(select().value).toBe('')
    expect(pathLine()).toBe('')
    expect(submit().getAttribute('aria-disabled')).toBe('true')
  })
})
