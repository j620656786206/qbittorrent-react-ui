import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { FilePlus } from 'lucide-react'
import { useIsDesktop } from '#/shared/ui/breakpoint'
import { addOpenStore, openAdd } from '#/state/add-open'
import { dialogLayerOpen } from '#/state/shortcuts'

// Story 4.6 (DESIGN and EXPERIENCE drop-overlay, mockup S06-drop-overlay-
// desktop): from 1024px, dragging files anywhere over the app dims it
// (`rgba(0,0,0,.5)`), draws a 2px white dashed frame 16px in (22px radius)
// and a `surface` card with a 40px icon and 「放開就新增」 in `page-title`.
// Dropping opens the add screen with the files, or appends them when it is
// already open (src/state/add-open.ts); every file goes in, a non-torrent
// one is judged 看不懂這個檔案 there. Only a drag carrying files counts
// (`dataTransfer.types` has `Files`): dragging text shows nothing and keeps
// the browser's own behaviour. Leaving the window or the drag ending hides
// it; `Esc` hides it until that drag ends. Below 1024px (no drag on the
// phone), or while another dialog or sheet is open, there is no overlay
// and a drop is ignored; with add itself open a drop appends. At every
// width `dragover` and `drop` of files are cancelled on `window`, so a file
// let go anywhere never opens in the tab and leaves the app. It takes no
// pointer events: the drag events reach `window` from whatever lies under
// it.
// Docs (AD-11): https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API

export const DROP_TEXT = '放開就新增'

function carriesFiles(event: DragEvent): boolean {
  const types = event.dataTransfer?.types
  return types !== undefined && Array.from(types).includes('Files')
}

export function DropOverlay() {
  const desktop = useIsDesktop()
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (!desktop) setShown(false)
    // dragenter and dragleave come in pairs per element crossed; the
    // count is back at 0 once the drag left the window.
    let depth = 0
    /** Esc hid it: it stays hidden until this drag ends. */
    let dismissed = false
    const end = () => {
      depth = 0
      dismissed = false
      setShown(false)
    }
    /** Overlay and opening add: desktop only, never over another dialog. */
    const accepts = () =>
      desktop && (addOpenStore.state.open || !dialogLayerOpen())
    const show = () => {
      if (!dismissed && accepts()) setShown(true)
    }
    const onEnter = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      event.preventDefault()
      depth += 1
      show()
    }
    // At every width: a file let go anywhere never replaces the app.
    const onOver = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      event.preventDefault()
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = accepts() ? 'copy' : 'none'
      }
      show()
    }
    const onLeave = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) end()
    }
    const onDrop = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      event.preventDefault()
      const take = accepts()
      end()
      const files = Array.from(event.dataTransfer?.files ?? [])
      if (take && files.length > 0) openAdd(files)
    }
    const onKey = (event: KeyboardEvent) => {
      // Only a drag under way: an Esc that closes a dialog changes nothing.
      if (event.key !== 'Escape' || depth === 0) return
      dismissed = true
      setShown(false)
    }
    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragover', onOver)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('drop', onDrop)
    window.addEventListener('dragend', end)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('drop', onDrop)
      window.removeEventListener('dragend', end)
      window.removeEventListener('keydown', onKey)
    }
  }, [desktop])

  if (!shown || !desktop) return null
  return createPortal(
    <div
      data-drop-overlay=""
      className="pointer-events-none fixed inset-0 z-[60] animate-fade bg-scrim-dialog"
    >
      <div
        role="status"
        aria-live="assertive"
        className="absolute inset-4 flex items-center justify-center rounded-panel border-2 border-dashed border-white"
      >
        <div className="flex animate-pop flex-col items-center gap-3 rounded-panel bg-surface px-10 py-7 text-text shadow-float">
          <FilePlus
            size={40}
            strokeWidth={1.8}
            aria-hidden="true"
            className="block flex-none"
          />
          <span className="text-page-title">{DROP_TEXT}</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
