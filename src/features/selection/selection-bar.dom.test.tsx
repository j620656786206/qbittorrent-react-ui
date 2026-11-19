// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { QueryClientProvider, notifyManager } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeHash, fakeResponse, t } from '#/lib/testing'
import { MAINDATA_KEY } from '#/state/maindata'
import { resetOrderFreeze } from '#/state/order-freeze'
import { createQueryClient } from '#/state/query-client'
import {
  resetSelection,
  selectionStore,
  toggleSelected,
} from '#/state/selection'
import {
  BAR_HIDDEN_CLASS,
  SelectionBar,
} from '#/features/selection/selection-bar'

// Spec 4.1: the desktop selection bar. Its texts and buttons, the total
// without 已整理 and 找不到檔案, 取消, the slide (transform only, kept
// mounted with the last numbers) and the toast lift.

// The toast API as features see it (they never import the toast store):
// records the lift the bar asks for.
const lift = vi.hoisted(() => ({ on: false, calls: 0 }))
vi.mock('#/lib/toast', () => ({
  toast: {
    setLift: (on: boolean) => {
      lift.on = on
      lift.calls += 1
    },
  },
}))

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

const GB = 1024 ** 3
const A = fakeHash(1)
const B = fakeHash(2)
const C = fakeHash(3)

let root: Root
let client: QueryClient

async function render() {
  client = createQueryClient({
    fetchMaindata: () =>
      Promise.resolve(
        fakeResponse({
          changed: [
            t({ hash: A, size: 100 * GB }),
            t({
              hash: B,
              size: 50 * GB,
              state: 'missingFiles',
              progress: 1,
              private: false,
            }),
            t({
              hash: C,
              size: 20 * GB,
              state: 'missingFiles',
              progress: 1,
              private: true,
            }),
          ],
        }),
      ),
    currentPath: () => '/',
  })
  await client.prefetchQuery({ queryKey: MAINDATA_KEY })
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <SelectionBar />
      </QueryClientProvider>,
    ),
  )
}

const bar = () =>
  document.querySelector<HTMLElement>('[data-selection-bar]') as HTMLElement
const buttons = () => [...bar().querySelectorAll('button')]
/** The polite live region holding the count and the size. */
const status = () =>
  bar().querySelector<HTMLElement>('[role="status"]') as HTMLElement
const button = (name: string) =>
  buttons().find((each) => each.textContent === name) as HTMLButtonElement

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  notifyManager.setScheduler((callback) => callback())
  resetSelection()
  resetOrderFreeze()
  lift.on = false
  lift.calls = 0
})

afterEach(async () => {
  await act(async () => root.unmount())
  client.clear()
  document.body.replaceChildren()
  resetSelection()
  resetOrderFreeze()
  lift.on = false
  lift.calls = 0
  notifyManager.setScheduler((callback) => setTimeout(callback, 0))
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
})

describe('the selection bar', () => {
  it('nothing selected: mounted below the viewport, inert, hidden from screen readers; toasts not lifted', async () => {
    await render()
    expect(bar().className).toContain(BAR_HIDDEN_CLASS)
    expect(bar().hasAttribute('inert')).toBe(true)
    expect(bar().getAttribute('aria-hidden')).toBe('true')
    expect(lift.on).toBe(false)
  })

  it('a tick: the region 「選取的種子」 with the exact texts, in order, the size without 已整理 and 找不到檔案', async () => {
    await render()
    await act(async () => {
      toggleSelected(A)
      toggleSelected(B)
      toggleSelected(C)
    })
    expect(bar().getAttribute('role')).toBe('region')
    expect(bar().getAttribute('aria-label')).toBe('選取的種子')
    expect(bar().className).not.toContain(BAR_HIDDEN_CLASS)
    expect(bar().hasAttribute('inert')).toBe(false)
    expect(bar().hasAttribute('aria-hidden')).toBe(false)
    expect(status().parentElement).toBe(bar())
    expect([...status().children].map((child) => child.textContent)).toEqual([
      '已選 3 個',
      '，',
      '共 100 GB',
    ])
    // The separator is for screen readers only.
    expect(status().children[1].className).toBe('sr-only')
    expect([...bar().children].map((child) => child.textContent)).toEqual([
      '已選 3 個，共 100 GB',
      '取消',
      '改路徑',
      '刪除（含檔案）',
    ])
    expect(button('取消').disabled).toBe(false)
    expect(button('改路徑').disabled).toBe(true)
    expect(button('刪除（含檔案）').disabled).toBe(true)
    expect(lift.on).toBe(true)
  })

  it('the count and size changing are announced (a polite status region)', async () => {
    await render()
    await act(async () => toggleSelected(A))
    expect(status().textContent).toBe('已選 1 個，共 100 GB')
    await act(async () => toggleSelected(C))
    expect(status().textContent).toBe('已選 2 個，共 100 GB')
  })

  it('a selected hash maindata lacks (before the prune) keeps the bar shown, like the freeze', async () => {
    await render()
    await act(async () => toggleSelected(fakeHash(0x99)))
    expect(bar().className).not.toContain(BAR_HIDDEN_CLASS)
    expect(bar().hasAttribute('inert')).toBe(false)
    expect(lift.on).toBe(true)
  })

  it('only 已整理 selected: 共 0 B', async () => {
    await render()
    await act(async () => toggleSelected(B))
    expect(bar().textContent).toContain('已選 1 個')
    expect(bar().textContent).toContain('共 0 B')
  })

  it('the DESIGN looks: a centred pill 24px up, 8/8/8/22 padding, 14px gap, transform-only slide, none under reduced motion', async () => {
    await render()
    const classes = bar().className
    for (const token of [
      'fixed',
      'bottom-6',
      'left-1/2',
      '-translate-x-1/2',
      'rounded-full',
      'bg-selection-bar',
      'text-selection-bar-foreground',
      'shadow-float',
      'py-2',
      'pr-2',
      'pl-[22px]',
      'gap-3.5',
      'transition-transform',
      'duration-300',
      'ease-[cubic-bezier(0.2,0.8,0.2,1)]',
      'motion-reduce:transition-none',
    ]) {
      expect(classes).toContain(token)
    }
    expect(bar().getAttribute('style')).toBeNull()
    const [count, , size] = [...status().children]
    expect(count.className).toContain('font-bold')
    expect(size.className).toContain('text-[12px]')
    expect(size.className).toContain('opacity-70')
    expect(button('取消').className).toContain('h-9')
    expect(button('取消').className).toContain('font-semibold')
    expect(button('改路徑').className).toContain('border')
    expect(button('刪除（含檔案）').className).toContain('bg-delete')
    expect(button('刪除（含檔案）').className).toContain(
      'text-delete-foreground',
    )
    for (const each of buttons()) {
      expect(each.className).toContain(
        'focus-visible:outline-selection-bar-foreground',
      )
    }
  })

  it('取消 clears: the bar slides out keeping its last numbers; toasts go back down', async () => {
    await render()
    await act(async () => {
      toggleSelected(A)
      toggleSelected(C)
    })
    await act(async () => button('取消').click())
    expect(selectionStore.state.hashes).toEqual([])
    expect(bar()).not.toBeNull()
    expect(bar().className).toContain(BAR_HIDDEN_CLASS)
    expect(bar().textContent).toContain('已選 2 個')
    expect(bar().hasAttribute('inert')).toBe(true)
    expect(lift.on).toBe(false)
  })

  it('unmounting while visible lowers the toasts', async () => {
    await render()
    await act(async () => toggleSelected(A))
    expect(lift.on).toBe(true)
    await act(async () => root.unmount())
    expect(lift.on).toBe(false)
    root = createRoot(document.createElement('div'))
  })
})
