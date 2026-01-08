import { useTranslation } from 'react-i18next'
import { FileUp } from 'lucide-react'

interface DropZoneOverlayProps {
  visible: boolean
}

/**
 * Full-screen overlay that appears when dragging torrent files over the app window.
 * Provides visual feedback to indicate the drop zone is active.
 */
export function DropZoneOverlay({ visible }: DropZoneOverlayProps) {
  const { t } = useTranslation()

  if (!visible) {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in-0"
      style={{ pointerEvents: 'none' }}
    >
      <div className="flex flex-col items-center justify-center gap-4 rounded-lg border-4 border-dashed border-primary bg-background/95 p-12 shadow-2xl">
        <FileUp className="h-16 w-16 text-primary animate-pulse" />
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-foreground">
            {t('dropZone.title')}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('dropZone.subtitle')}
          </p>
        </div>
      </div>
    </div>
  )
}
