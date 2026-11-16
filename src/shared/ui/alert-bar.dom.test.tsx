// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AlertBar } from '#/shared/ui/alert-bar'

// Review of 1.7 to 1.9: where focus goes when the bar disappears
// (useRestoreFocusOnUnmount), in a DOM.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

let target: HTMLElement
let other: HTMLButtonElement
let root: Root

function bar() {
  return (
    <AlertBar
      text="連不到家裡的 NAS"
      detail="最後更新 3 分前"
      icon="offline"
      actionLabel="重試"
      onAction={() => {}}
      restoreFocusTo={() => target}
    />
  )
}

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  target = document.createElement('main')
  target.tabIndex = -1
  other = document.createElement('button')
  const container = document.createElement('div')
  document.body.append(target, other, container)
  root = createRoot(container)
  await act(async () => root.render(bar()))
})

afterEach(async () => {
  await act(async () => root.unmount())
  document.body.replaceChildren()
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
})

const button = () =>
  [...document.querySelectorAll('button')].find(
    (element) => element.textContent === '重試',
  ) as HTMLButtonElement

describe('AlertBar focus when it goes away', () => {
  it('its focused button hands focus to restoreFocusTo()', async () => {
    button().focus()
    await act(async () => root.render(null))
    expect(document.activeElement).toBe(target)
  })

  it('focus elsewhere stays where it is', async () => {
    other.focus()
    await act(async () => root.render(null))
    expect(document.activeElement).toBe(other)
  })

  it('a button focused then left does not pull focus back', async () => {
    button().focus()
    other.focus()
    await act(async () => root.render(null))
    expect(document.activeElement).toBe(other)
  })

  it('only the problem text is the live region', () => {
    const alert = document.querySelector('[role="alert"]')
    expect(alert?.textContent).toBe('連不到家裡的 NAS')
  })
})
