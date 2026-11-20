// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ConfirmShell,
  STILL_WAITING_MS,
  STILL_WAITING_TEXT,
} from '#/shared/ui/confirm-shell'
import type { ConfirmShellProps } from '#/shared/ui/confirm-shell'
import { MAIN_ID } from '#/shared/ui/main-scroll'

// Spec 4.3: the shared confirm shell. Desktop: the non-modal dialog with
// the brand look, no ✕, a press outside ignored, cancel then primary on the
// right, focus on cancel. Phone: the bottom sheet with the primary pinned
// in its footer. Sending: the primary's text changes and it cannot be
// pressed again, every close path is ignored, and 「還在等 NAS 回應」
// appears after 10 s. The caller's Esc layer is tested with the feature
// (delete-confirm.dom.test.tsx); Radix's own Esc is here.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

let root: Root
let container: HTMLElement
let opener: HTMLButtonElement
const onCancel = vi.fn()
const onPrimary = vi.fn()

function props(overrides: Partial<ConfirmShellProps> = {}): ConfirmShellProps {
  return {
    open: true,
    desktop: true,
    title: '刪除 3 個種子？',
    children: <p>內容</p>,
    primaryLabel: '刪除 3 個種子和檔案（301.2 GB）',
    sendingLabel: '刪除中…',
    onPrimary,
    primaryTone: 'delete',
    closeLabel: '關閉，不刪',
    sending: false,
    onCancel,
    role: 'alertdialog',
    returnFocus: () => opener,
    ...overrides,
  }
}

async function render(overrides: Partial<ConfirmShellProps> = {}) {
  await act(async () => root.render(<ConfirmShell {...props(overrides)} />))
}

const shell = () =>
  document.querySelector<HTMLElement>('[role="alertdialog"]') as HTMLElement
const scrim = () =>
  document.querySelector<HTMLElement>(
    '[data-slot="dialog-overlay"], [data-slot="bottom-sheet-scrim"]',
  ) as HTMLElement
const buttonNamed = (name: string) =>
  [...document.querySelectorAll('button')].find(
    (each) =>
      each.textContent === name || each.getAttribute('aria-label') === name,
  ) as HTMLButtonElement
const waitingLine = () =>
  [...document.querySelectorAll('p')].find(
    (each) => each.textContent === STILL_WAITING_TEXT,
  )

/** Radix arms its outside-press listener and moves focus on 0 ms timeouts. */
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

const press = (key: string) =>
  act(async () => {
    ;(document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
    )
  })

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  onCancel.mockReset()
  onPrimary.mockReset()
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: query.includes('reduce'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  )
  const main = document.createElement('main')
  main.id = MAIN_ID
  document.body.append(main)
  opener = document.createElement('button')
  document.body.append(opener)
  opener.focus()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.useRealTimers()
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
})

describe('desktop dialog', () => {
  it('an alertdialog with the brand look, 512px, never taller than the viewport', async () => {
    await render()
    const box = shell()
    expect(box.getAttribute('aria-modal')).toBe('true')
    const classes = box.className.split(' ')
    for (const token of [
      'bg-surface',
      'border',
      'rounded-panel',
      'shadow-float',
      'p-6',
      'gap-3.5',
      'flex',
      'flex-col',
      'w-[512px]',
      'max-h-[calc(100dvh-40px)]',
      'overflow-hidden',
      'data-[state=open]:animate-pop',
    ]) {
      expect(classes, token).toContain(token)
    }
    expect(scrim().className).toContain('bg-scrim-dialog')
    const title = box.querySelector('h2') as HTMLElement
    expect(title.textContent).toBe('刪除 3 個種子？')
    expect(title.className).toContain('text-[18px]')
    expect(title.className).toContain('font-bold')
    expect(
      document.getElementById(box.getAttribute('aria-labelledby') ?? ''),
    ).toBe(title)
  })

  it('no ✕; cancel (outline) then the primary (delete colour), 36px pills on the right, 8px apart', async () => {
    await render()
    expect(shell().querySelector('[data-slot="dialog-close"]')).toBeNull()
    const buttons = [...shell().querySelectorAll('button')]
    expect(buttons.map((each) => each.textContent)).toEqual([
      '取消',
      '刪除 3 個種子和檔案（301.2 GB）',
    ])
    const [cancel, primary] = buttons
    expect(cancel.parentElement?.className).toContain('justify-end')
    expect(cancel.parentElement?.className).toContain('gap-2')
    for (const each of [cancel, primary]) {
      expect(each.className).toContain('h-9')
      expect(each.className).toContain('rounded-full')
    }
    expect(cancel.className).toContain('border')
    expect(primary.className).toContain('bg-delete')
    expect(primary.className).toContain('text-delete-foreground')
  })

  it('focus starts on cancel; cancel closes and focus goes back', async () => {
    await render()
    await settle()
    expect(document.activeElement).toBe(buttonNamed('取消'))
    await act(async () => buttonNamed('取消').click())
    expect(onCancel).toHaveBeenCalledOnce()
    await render({ open: false })
    await settle()
    expect(shell()).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it('Esc means cancel; a press outside does nothing', async () => {
    await render()
    await settle()
    await act(async () => {
      scrim().dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, button: 0 }),
      )
      scrim().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await settle()
    expect(onCancel).not.toHaveBeenCalled()
    await press('Escape')
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('the primary runs onPrimary', async () => {
    await render()
    await act(async () =>
      buttonNamed('刪除 3 個種子和檔案（301.2 GB）').click(),
    )
    expect(onPrimary).toHaveBeenCalledOnce()
  })
})

describe('sending', () => {
  it('desktop: the primary reads 刪除中…, keeps its colour, cannot be pressed; cancel, Esc and outside do nothing', async () => {
    await render({ sending: true })
    await settle()
    const primary = buttonNamed('刪除中…')
    expect(primary.getAttribute('aria-disabled')).toBe('true')
    expect(primary.className).toContain('bg-delete')
    // The base rule dims [aria-disabled]; the sending primary is lifted back.
    expect(primary.hasAttribute('data-sending')).toBe(true)
    expect(primary.className).toContain('data-[sending]:opacity-100')
    expect(primary.disabled).toBe(false)
    await act(async () => primary.click())
    expect(onPrimary).not.toHaveBeenCalled()
    const cancel = buttonNamed('取消')
    expect(cancel.getAttribute('aria-disabled')).toBe('true')
    await act(async () => cancel.click())
    await press('Escape')
    await act(async () => {
      scrim().dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, button: 0 }),
      )
    })
    await settle()
    expect(onCancel).not.toHaveBeenCalled()
    expect(shell()).not.toBeNull()
  })

  it('phone: the sending primary is lifted back to full opacity too', async () => {
    await render({ desktop: false, sending: true })
    const primary = buttonNamed('刪除中…')
    expect(primary.hasAttribute('data-sending')).toBe(true)
    expect(primary.className).toContain('data-[sending]:opacity-100')
  })

  it.each([true, false])(
    'desktop %s: 「還在等 NAS 回應」 only after 10 s, gone when the send ends',
    async (desktop) => {
      vi.useFakeTimers()
      await render({ desktop, sending: true })
      await act(async () => vi.advanceTimersByTime(STILL_WAITING_MS - 1))
      expect(waitingLine()).toBeUndefined()
      await act(async () => vi.advanceTimersByTime(1))
      const line = waitingLine() as HTMLElement
      expect(line.className).toContain('text-meta')
      expect(line.className).toContain('text-text-muted')
      // Under the buttons.
      const primary = buttonNamed('刪除中…')
      expect(
        primary.compareDocumentPosition(line) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
      await render({ desktop, sending: false })
      expect(waitingLine()).toBeUndefined()
      // A new send starts its own 10 s.
      await render({ desktop, sending: true })
      await act(async () => vi.advanceTimersByTime(STILL_WAITING_MS - 1))
      expect(waitingLine()).toBeUndefined()
    },
  )
})

describe('accessibility and guards (review)', () => {
  it.each([true, false])(
    'desktop %s: the body describes the alertdialog; the status region is mounted empty before 10 s',
    async (desktop) => {
      await render({ desktop })
      const id = shell().getAttribute('aria-describedby') ?? ''
      expect(id).not.toBe('')
      expect(document.getElementById(id)?.textContent).toBe('內容')
      const status = shell().querySelector('[role="status"]') as HTMLElement
      expect(status).not.toBeNull()
      expect(status.textContent).toBe('')
      await render({ desktop, sending: true })
      // The same element, not a new one, gets the text later.
      expect(shell().querySelector('[role="status"]')).toBe(status)
    },
  )

  it.each([true, false])(
    'desktop %s: primaryDisabled makes the primary a no-op',
    async (desktop) => {
      await render({ desktop, primaryDisabled: true })
      const primary = buttonNamed('刪除 3 個種子和檔案（301.2 GB）')
      expect(primary.getAttribute('aria-disabled')).toBe('true')
      // Nothing to send: it stays dimmed (no data-sending).
      expect(primary.hasAttribute('data-sending')).toBe(false)
      await act(async () => primary.click())
      expect(onPrimary).not.toHaveBeenCalled()
    },
  )
})

describe('subtitle (story 5.2)', () => {
  const subtitle = () =>
    document.querySelector<HTMLElement>('[data-slot="confirm-subtitle"]')

  it('none by default', async () => {
    await render()
    expect(subtitle()).toBeNull()
  })

  it('desktop: one cut meta line right under the title, outside the scrolling body', async () => {
    await render({ subtitle: 'Fake.Show.S01.1080p' })
    const line = subtitle() as HTMLElement
    expect(line.textContent).toBe('Fake.Show.S01.1080p')
    expect(line.title).toBe('Fake.Show.S01.1080p')
    for (const token of ['truncate', 'text-meta', 'text-text-muted']) {
      expect(line.className.split(' ')).toContain(token)
    }
    expect(line.previousElementSibling?.textContent).toBe('刪除 3 個種子？')
    const body = document.getElementById(
      shell().getAttribute('aria-describedby') ?? '',
    )
    expect(body?.contains(line)).toBe(false)
  })

  it('phone: the first line of the body', async () => {
    await render({ desktop: false, subtitle: 'Fake.Show.S01.1080p' })
    const line = subtitle() as HTMLElement
    expect(line.nextElementSibling?.textContent).toBe('內容')
  })
})

describe('phone sheet', () => {
  it('an alertdialog sheet with the ✕ 「關閉，不刪」 and one full-width 44px primary pinned outside the scroller', async () => {
    await render({ desktop: false })
    const sheet = shell()
    expect(sheet.dataset.slot).toBe('bottom-sheet')
    const footer = sheet.querySelector(
      '[data-slot="bottom-sheet-footer"]',
    ) as HTMLElement
    const primary = buttonNamed('刪除 3 個種子和檔案（301.2 GB）')
    expect(footer.contains(primary)).toBe(true)
    for (const token of ['min-h-11', 'w-full', 'bg-delete', 'text-[15px]']) {
      expect(primary.className.split(' ')).toContain(token)
    }
    // Long texts wrap at 320 to 360px instead of overflowing.
    expect(primary.className).not.toContain('whitespace-nowrap')
    expect(buttonNamed('取消')).toBeUndefined()
    expect(buttonNamed('關閉，不刪')).toBeDefined()
    expect(
      sheet.querySelector('[data-slot="bottom-sheet-content"]')?.textContent,
    ).toBe('內容')
  })

  it('✕ means cancel; while sending it, the scrim and the primary do nothing', async () => {
    await render({ desktop: false })
    await act(async () => buttonNamed('關閉，不刪').click())
    expect(onCancel).toHaveBeenCalledOnce()
    onCancel.mockReset()
    await render({ desktop: false, sending: true })
    expect(buttonNamed('關閉，不刪').getAttribute('aria-disabled')).toBe('true')
    await act(async () => buttonNamed('關閉，不刪').click())
    await act(async () => scrim().click())
    await act(async () => buttonNamed('刪除中…').click())
    expect(onCancel).not.toHaveBeenCalled()
    expect(onPrimary).not.toHaveBeenCalled()
  })
})
