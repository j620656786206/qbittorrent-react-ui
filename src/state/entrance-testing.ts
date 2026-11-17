import { vi } from 'vitest'
import type { Mock } from 'vitest'

// Test-only (story 2.9): a stand-in for `Element.prototype.animate` that
// records each call and lets the test finish it. `cancel()` rejects
// `finished` with an AbortError, as browsers do.

export interface RecordedAnimation {
  element: Element
  keyframes: Array<Record<string, unknown>>
  options: KeyframeAnimationOptions
  cancel: Mock<() => void>
  finish: () => void
  finished: Promise<unknown>
}

export interface AnimateStub {
  /** Every call so far, oldest first; the test may empty it. */
  calls: Array<RecordedAnimation>
  /** Puts the engine's own `animate` back. */
  restore: () => void
}

export function stubElementAnimate(): AnimateStub {
  const original = Object.getOwnPropertyDescriptor(Element.prototype, 'animate')
  const stub: AnimateStub = {
    calls: [],
    restore: () => {
      if (original)
        Object.defineProperty(Element.prototype, 'animate', original)
      else delete (Element.prototype as Partial<Element>).animate
    },
  }
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    writable: true,
    value: function (
      this: Element,
      keyframes: Array<Record<string, unknown>>,
      options: KeyframeAnimationOptions,
    ) {
      let finish!: () => void
      let fail!: (error: unknown) => void
      const finished = new Promise<unknown>((resolve, reject) => {
        finish = () => resolve(undefined)
        fail = reject
      })
      // Nobody may await it (a test that never settles): no unhandled rejection.
      finished.catch(() => {})
      const animation: RecordedAnimation = {
        element: this,
        keyframes,
        options,
        finished,
        finish,
        cancel: vi.fn(() => fail(new DOMException('cancel', 'AbortError'))),
      }
      stub.calls.push(animation)
      return animation
    },
  })
  return stub
}

/** `matchMedia` answering `prefers-reduced-motion: reduce` with `reduced()`. */
export function stubReducedMotion(reduced: () => boolean): void {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: query.includes('prefers-reduced-motion') && reduced(),
        media: query,
      }) as MediaQueryList,
  )
}
