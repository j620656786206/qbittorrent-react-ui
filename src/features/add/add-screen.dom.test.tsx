// @vitest-environment happy-dom
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fakeHash, t } from '#/lib/testing'
import { ALL, UNCATEGORIZED } from '#/shared/categories'
import { addOpenStore, closeAdd, openAdd } from '#/state/add-open'
import { detailOutsideStore } from '#/state/detail-outside'
import { defaultSettings } from '#/shared/settings'
import { MAINDATA_KEY } from '#/state/maindata'
import {
  ARCHIVED,
  LIVE,
  NEW_A,
  NEW_B,
  NEW_C,
  base32,
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
  skipped,
  select,
  pathLine,
  buttonNamed,
  paste,
  pick,
  click,
  press,
  torrentFile,
  infoHashOf,
  baseTorrents,
} from '#/features/add/add-screen-testing'

// Spec 4.6: the add screen in a DOM, A1 to A10, C1, C2 and R1 (the harness
// is add-screen-testing.tsx; the rest is in add-screen-more.dom.test.tsx).

describe('A1 open', () => {
  it('opens the 640px dialog empty, focus in the paste box, 新增 disabled', async () => {
    await render()
    expect(screen()).toBeNull()
    await open()
    expect(screen().querySelector('h2')?.textContent).toBe('新增種子')
    expect(screen().className).toContain('w-[640px]')
    expect(box()).not.toBeNull()
    expect(textarea().getAttribute('aria-label')).toBe(
      '貼上磁力連結，或把 .torrent 檔拖進來',
    )
    expect(document.activeElement).toBe(textarea())
    expect(submit().textContent).toBe('新增')
    expect(submit().getAttribute('aria-disabled')).toBe('true')
    expect(buttonNamed('取消')).toBeDefined()
    expect(buttonNamed('關閉')).toBeDefined()
    const input = screen().querySelector<HTMLInputElement>('input[type="file"]')
    expect(input?.multiple).toBe(true)
    expect(input?.accept).toBe('.torrent,application/x-bittorrent')
  })

  it('a press on 新增 does nothing yet (story 4.7)', async () => {
    await render()
    await open()
    await paste(`magnet:?xt=urn:btih:${NEW_A}`)
    await click(submit())
    expect(screen()).not.toBeNull()
    expect(rows()).toHaveLength(1)
  })
})

describe('A2 paste', () => {
  it('judges 10 lines: unreadable first, then existing, then addable; a duplicate merges', async () => {
    await render()
    await open()
    await paste(
      [
        `magnet:?xt=urn:btih:${NEW_A}&dn=Fake.A`,
        `magnet:?xt=urn:btih:${base32(NEW_A)}`,
        `magnet:?xt=urn:btih:${NEW_B}`,
        'https://example.invalid/fake.torrent',
        'just words',
        `magnet:?xt=urn:btih:${ARCHIVED}&dn=Archived.Show`,
        `magnet:?xt=urn:btih:${NEW_C}&dn=Fake.C`,
        `magnet:?xt=urn:btih:${NEW_B}`,
        'magnet:?xt=urn:btmh:1220abcd',
        `magnet:?xt=urn:btih:${LIVE}`,
      ].join('\n'),
    )
    expect(box()).toBeNull()
    expect(rowStatuses()).toEqual([
      'unreadable',
      'unreadable',
      'unreadable',
      'unreadable',
      'existing',
      'existing',
      'addable',
      'addable',
      'addable',
    ])
    expect(rowNames()).toEqual([
      'https://example.invalid/fake.torrent',
      'just',
      'words',
      'magnet:?xt=urn:btmh:1220abcd',
      'Archived.Show',
      `magnet:?xt=urn:btih:${LIVE}`,
      'Fake.A',
      `magnet:?xt=urn:btih:${NEW_B}`,
      'Fake.C',
    ])
    expect(
      screen().querySelector('[data-add-list]')?.getAttribute('aria-label'),
    ).toBe('要新增的種子，9 個')
    // Labels and their buttons.
    const first = rows()[0]
    expect(first.querySelector('[data-add-label]')?.textContent).toBe(
      '看不懂這個連結',
    )
    expect(first.textContent).toContain('拿掉')
    expect(rows()[4].textContent).toContain('以前下載過，已整理好')
    expect(rows()[4].textContent).toContain('打開')
    // A link without a name is mono; problem rows are muted.
    expect(rows()[7].querySelector('[title]')?.className).toContain('font-mono')
    expect(rows()[0].querySelector('[title]')?.className).toContain(
      'text-text-muted',
    )
    expect(skipped()).toBe('有 6 個不會加')
    expect(submit().textContent).toBe('新增 3 個')
  })

  it('typed text confirmed with Enter counts as a paste; Shift+Enter does not', async () => {
    await render()
    await open()
    const area = textarea()
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value',
      )?.set
      setter?.call(area, `magnet:?xt=urn:btih:${NEW_A}`)
      area.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      area.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      )
    })
    expect(rows()).toHaveLength(0)
    await press('Enter', area)
    await settle()
    expect(rowStatuses()).toEqual(['addable'])
    // The strip's textarea is empty again.
    expect(textarea().value).toBe('')
  })

  it('never reads the clipboard API', async () => {
    const readText = vi.fn()
    vi.stubGlobal('navigator', { ...navigator, clipboard: { readText } })
    await render()
    await open()
    await paste(`magnet:?xt=urn:btih:${NEW_A}`)
    expect(readText).not.toHaveBeenCalled()
  })

  it('names render as text, never HTML', async () => {
    await render()
    await open()
    await paste(
      `magnet:?xt=urn:btih:${NEW_A}&dn=${encodeURIComponent('<img src=x onerror=alert(1)>')}`,
    )
    expect(screen().querySelector('img')).toBeNull()
    expect(rowNames()).toEqual(['<img src=x onerror=alert(1)>'])
  })
})

describe('A3 files', () => {
  it('reads picked files: a torrent, a non-torrent, an 11 MB file', async () => {
    await render()
    await open()
    const good = torrentFile('Fake.File.S01')
    await pick([
      good.file,
      new File(['hello'], 'notes.txt'),
      new File([new Uint8Array(11 * 1024 * 1024)], 'huge.torrent'),
    ])
    await settleReads()
    expect(rowStatuses()).toEqual(['unreadable', 'unreadable', 'addable'])
    expect(
      rows().map(
        (row) => row.querySelector('[data-add-label]')?.textContent ?? null,
      ),
    ).toEqual(['看不懂這個檔案', '檔案超過 10 MB', null])
    expect(rowNames()).toEqual(['notes.txt', 'huge.torrent', 'Fake.File.S01'])
  })

  it('pasted files are read like picked ones', async () => {
    await render()
    await open()
    await paste('Fake.File.S01.torrent', [torrentFile('Fake.File.S01').file])
    await settleReads()
    expect(rowNames()).toEqual(['Fake.File.S01'])
  })

  it('shows 讀取中… while files are read', async () => {
    let finish: (buffer: ArrayBuffer) => void = () => {}
    const slow = {
      name: 'slow.torrent',
      size: 10,
      arrayBuffer: () =>
        new Promise<ArrayBuffer>((resolve) => {
          finish = resolve
        }),
    } as unknown as File
    await render()
    await open()
    await pick([slow])
    await settle()
    expect(box()?.textContent).toContain('讀取中…')
    await act(async () => finish(new ArrayBuffer(0)))
    await settleReads()
    expect(rowStatuses()).toEqual(['unreadable'])
    expect(
      screen().querySelector('[data-add-strip]')?.textContent,
    ).not.toContain('讀取中…')
  })
})

describe('A4 and A6 existing', () => {
  it('a magnet of an archived torrent is 以前下載過 with 打開, which closes and opens the detail', async () => {
    await render()
    await open()
    await paste(`magnet:?xt=urn:btih:${ARCHIVED.toUpperCase()}`)
    expect(rowStatuses()).toEqual(['existing'])
    await click(
      buttonNamed(`打開 magnet:?xt=urn:btih:${ARCHIVED.toUpperCase()}`),
    )
    expect(addOpenStore.state.open).toBe(false)
    expect(env.setHash).toHaveBeenCalledWith(ARCHIVED)
    expect(detailOutsideStore.state.hash).toBe(ARCHIVED)
  })
})

describe('A5 remove', () => {
  it('✕ and 拿掉 remove a row; the last one gone brings the box back', async () => {
    await render()
    await open()
    await paste(
      `junk\nmagnet:?xt=urn:btih:${NEW_A}\nmagnet:?xt=urn:btih:${NEW_B}`,
    )
    expect(rows()).toHaveLength(3)
    // One 「拿掉 junk」 for screen readers: the ✕ (the text one is hidden).
    const named = [...screen().querySelectorAll('button')].filter(
      (each) =>
        each.closest('[aria-hidden="true"]') === null &&
        each.getAttribute('aria-label') === '拿掉 junk',
    )
    expect(named).toHaveLength(1)
    expect(named[0].hasAttribute('data-add-remove')).toBe(true)
    buttonNamed('拿掉').focus()
    await click(buttonNamed('拿掉'))
    expect(rowStatuses()).toEqual(['addable', 'addable'])
    expect(skipped()).toBe('')
    // Focus moved to a remaining ✕, never to body.
    expect(document.activeElement?.hasAttribute('data-add-remove')).toBe(true)
    const removes = () => [
      ...screen().querySelectorAll<HTMLElement>('[data-add-remove]'),
    ]
    await click(removes()[0])
    expect(submit().textContent).toBe('新增 1 個')
    await click(removes()[0])
    expect(rows()).toHaveLength(0)
    expect(box()).not.toBeNull()
    expect(submit().textContent).toBe('新增')
    // Focus is back on the box's textarea.
    expect(document.activeElement).toBe(textarea())
    expect(box()?.contains(document.activeElement)).toBe(true)
  })

  it('removing a row also removes the copies of its hash merged into it', async () => {
    await render()
    await open()
    await paste(`magnet:?xt=urn:btih:${NEW_A}`)
    await paste(`magnet:?xt=urn:btih:${base32(NEW_A)}`)
    expect(rows()).toHaveLength(1)
    await click(
      screen().querySelector<HTMLElement>('[data-add-remove]') as HTMLElement,
    )
    expect(rows()).toHaveLength(0)
    expect(box()).not.toBeNull()
  })
})

describe('A7 and A8 category', () => {
  it.each([
    ['mteam-X', 'mteam-X'],
    [ALL, ''],
    [UNCATEGORIZED, ''],
  ])('opened in %s the menu starts at %j', async (view, expected) => {
    env.viewCategory = view
    await render()
    await open()
    expect(select().value).toBe(expected)
  })

  it('lists every qBittorrent category in tab order; the path line follows', async () => {
    env.settings = { ...defaultSettings(), categoryOrder: ['mteam-tv'] }
    await render()
    await open()
    const values = [...select().options].map((option) => option.value)
    expect(values).toEqual(['', 'mteam-tv', 'mteam-X', 'X', 'X-default'])
    expect(pathLine()).toBe('')
    await act(async () => {
      select().value = 'X'
      select().dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(pathLine()).toBe('會存到 /data/media/X')
    expect(
      screen().querySelector('[data-add-path] .font-mono')?.textContent,
    ).toBe('/data/media/X')
    await act(async () => {
      select().value = 'X-default'
      select().dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(pathLine()).toBe('會存到 qBittorrent 的預設位置')
  })
})

describe('A9 footer', () => {
  it('7 addable and 3 not: 有 3 個不會加 and 新增 7 個; disabled without a category', async () => {
    await render()
    await open()
    await paste(
      [
        ...Array.from(
          { length: 7 },
          (_, index) => `magnet:?xt=urn:btih:${fakeHash(100 + index)}`,
        ),
        'junk',
        'http://example.invalid',
        `magnet:?xt=urn:btih:${ARCHIVED}`,
      ].join('\n'),
    )
    expect(skipped()).toBe('有 3 個不會加')
    expect(submit().textContent).toBe('新增 7 個')
    expect(submit().getAttribute('aria-disabled')).toBe('true')
    await act(async () => {
      select().value = 'X'
      select().dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(submit().hasAttribute('aria-disabled')).toBe(false)
  })

  it('0 addable stays disabled with a category', async () => {
    env.viewCategory = 'X'
    await render()
    await open()
    await paste('junk')
    expect(submit().textContent).toBe('新增')
    expect(submit().getAttribute('aria-disabled')).toBe('true')
  })
})

describe('A10 append', () => {
  it('a second paste and a pick are judged with the rows already there', async () => {
    await render()
    await open()
    await paste(`magnet:?xt=urn:btih:${NEW_A}&dn=Fake.A`)
    await paste(
      `junk\nmagnet:?xt=urn:btih:${NEW_A}\nmagnet:?xt=urn:btih:${NEW_B}`,
    )
    expect(rowStatuses()).toEqual(['unreadable', 'addable', 'addable'])
    expect(rowNames()).toEqual([
      'junk',
      'Fake.A',
      `magnet:?xt=urn:btih:${NEW_B}`,
    ])
    await pick([torrentFile('Fake.File.S01').file])
    await settleReads()
    expect(rowNames()).toEqual([
      'junk',
      'Fake.A',
      `magnet:?xt=urn:btih:${NEW_B}`,
      'Fake.File.S01',
    ])
  })

  it('files dropped while open are appended (the queue)', async () => {
    await render()
    await open()
    await paste(`magnet:?xt=urn:btih:${NEW_A}`)
    await act(async () => openAdd([torrentFile('Fake.Dropped').file]))
    await settleReads()
    expect(rowNames()).toEqual([`magnet:?xt=urn:btih:${NEW_A}`, 'Fake.Dropped'])
  })
})

describe('C1 close', () => {
  it.each(['取消', '關閉', 'Escape'])(
    '%s closes and the next open is empty',
    async (how) => {
      await render()
      await open()
      await paste(`magnet:?xt=urn:btih:${NEW_A}`)
      if (how === 'Escape') await press('Escape', textarea())
      else await click(buttonNamed(how))
      await settle()
      expect(addOpenStore.state.open).toBe(false)
      expect(screen()).toBeNull()
      await open()
      expect(rows()).toHaveLength(0)
      expect(box()).not.toBeNull()
    },
  )

  it('a press outside leaves it open', async () => {
    await render()
    await open()
    const scrim = document.querySelector<HTMLElement>(
      '[data-slot="dialog-overlay"]',
    )
    await act(async () => {
      scrim?.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, cancelable: true }),
      )
    })
    await settle()
    expect(addOpenStore.state.open).toBe(true)
  })
})

describe('C2 late read', () => {
  it('files still being read when it closes are dropped', async () => {
    let finish: (buffer: ArrayBuffer) => void = () => {}
    const bytes = torrentFile('Fake.Late').bytes
    const slow = {
      name: 'late.torrent',
      size: bytes.length,
      arrayBuffer: () =>
        new Promise<ArrayBuffer>((resolve) => {
          finish = resolve
        }),
    } as unknown as File
    await render()
    await open()
    await pick([slow])
    await settle()
    await act(async () => closeAdd())
    await open()
    await act(async () => finish(bytes.slice().buffer))
    await settleReads()
    expect(rows()).toHaveLength(0)
    expect(box()).not.toBeNull()
  })
})

describe('R1 maindata change', () => {
  it('a pasted addable torrent that appears in maindata turns 以前下載過', async () => {
    const hash = infoHashOf('Fake.File.S01')
    await render()
    await open()
    await pick([torrentFile('Fake.File.S01').file])
    await settleReads()
    expect(rowStatuses()).toEqual(['addable'])
    env.torrents = [...baseTorrents(), t({ hash, name: 'Fake.File.S01' })]
    await act(async () => {
      await env.client.refetchQueries({ queryKey: MAINDATA_KEY })
    })
    await settle()
    expect(rowStatuses()).toEqual(['existing'])
  })
})
