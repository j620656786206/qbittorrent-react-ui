// Story 2.5 (spine 一致性慣例: no https-only browser API without a way
// back): copies text to the clipboard. `navigator.clipboard.writeText`
// first (https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText:
// secure contexts only, a promise that rejects with NotAllowedError); at
// home over plain http it is missing, so a temporary off-screen textarea
// and `document.execCommand('copy')` take over
// (https://developer.mozilla.org/en-US/docs/Web/API/Document/execCommand:
// deprecated but still the only http path; `false` when it did not copy).
// The textarea is styled through the CSSOM (never a `style` attribute
// string: CSP) and goes inside `host`, so an open bottom sheet's focus trap
// and `inert` background do not take the selection away. Call it from a
// click: both ways need the user's gesture.

/** True when the text reached the clipboard. */
export async function copyText(
  text: string,
  host: HTMLElement = document.body,
): Promise<boolean> {
  const clipboard =
    typeof navigator === 'undefined' ? undefined : navigator.clipboard
  if (typeof clipboard?.writeText === 'function') {
    try {
      await clipboard.writeText(text)
      return true
    } catch {
      // Denied or not focused: the textarea way below.
    }
  }
  return copyWithTextarea(text, host)
}

function copyWithTextarea(text: string, host: HTMLElement): boolean {
  const area = document.createElement('textarea')
  area.value = text
  // Not `readOnly`: iOS Safari selects nothing in a read-only textarea, so
  // the copy would be empty. 16px so focusing it does not zoom on iOS.
  area.tabIndex = -1
  area.style.position = 'fixed'
  area.style.top = '0'
  area.style.left = '-9999px'
  area.style.opacity = '0'
  area.style.pointerEvents = 'none'
  area.style.fontSize = '16px'
  const before = document.activeElement
  host.append(area)
  let copied = false
  try {
    area.focus({ preventScroll: true })
    area.select()
    // iOS Safari ignores select() alone.
    area.setSelectionRange(0, text.length)
    copied = document.execCommand('copy')
  } catch {
    copied = false
  } finally {
    area.remove()
    if (before instanceof HTMLElement && before.isConnected) {
      before.focus({ preventScroll: true })
    }
  }
  return copied
}
