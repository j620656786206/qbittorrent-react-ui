// @vitest-environment happy-dom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Dialog, DialogContent, DialogTitle } from '#/shared/ui/dialog'

// Spec 4.3: the shared dialog's additions. Real open keyframes on the
// content and the scrim (classes here; the keyframes in styles.test.ts),
// `closeOnOutsidePress={false}` and `showCloseButton={false}`. The 3.7
// shortcuts window (shortcut-help.dom.test.tsx) keeps the defaults: a press
// outside closes, the ✕ shows.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

let root: Root
let container: HTMLElement
const onOpenChange = vi.fn()

function Harness(props: {
  closeOnOutsidePress?: boolean
  showCloseButton?: boolean
}) {
  const [open, setOpen] = useState(true)
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        setOpen(next)
      }}
    >
      <DialogContent aria-describedby={undefined} {...props}>
        <DialogTitle>標題</DialogTitle>
        <button type="button">裡面</button>
      </DialogContent>
    </Dialog>
  )
}

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')
const scrim = () =>
  document.querySelector<HTMLElement>('[data-slot="dialog-overlay"]')
const closeX = () =>
  document.querySelector<HTMLElement>('[data-slot="dialog-close"]')

/** Radix arms its outside-press listener on a 0 ms timeout. */
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

async function pressScrim() {
  await act(async () => {
    scrim()?.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, button: 0 }),
    )
    scrim()?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await settle()
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  onOpenChange.mockReset()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  document.body.replaceChildren()
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
})

describe('dialog (story 4.3 additions)', () => {
  it('opens with the pop on the content and the fade on the scrim; the dead animate-in classes are gone', async () => {
    await act(async () => root.render(<Harness />))
    expect(dialog()?.className).toContain('data-[state=open]:animate-pop')
    expect(scrim()?.className).toContain('data-[state=open]:animate-fade')
    for (const element of [dialog(), scrim()]) {
      expect(element?.className).not.toMatch(
        /animate-in|animate-out|zoom-in|fade-in-0/,
      )
    }
  })

  it('by default a press outside closes it and the ✕ shows', async () => {
    await act(async () => root.render(<Harness />))
    await settle()
    expect(closeX()).not.toBeNull()
    await pressScrim()
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
    expect(dialog()).toBeNull()
  })

  it('closeOnOutsidePress={false}: a press outside leaves it open', async () => {
    await act(async () => root.render(<Harness closeOnOutsidePress={false} />))
    await settle()
    await pressScrim()
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(dialog()).not.toBeNull()
  })

  it('showCloseButton={false}: no ✕', async () => {
    await act(async () => root.render(<Harness showCloseButton={false} />))
    expect(closeX()).toBeNull()
  })
})
