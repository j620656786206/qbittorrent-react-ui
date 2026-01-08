import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { usePlatform } from '@/lib/hooks'

interface KeyboardHelpModalProps {
  isOpen: boolean
  onClose: () => void
}

interface Shortcut {
  key: string
  descriptionKey: string
}

export function KeyboardHelpModal({ isOpen, onClose }: KeyboardHelpModalProps) {
  const { t } = useTranslation()
  const { isMac } = usePlatform()

  // Platform-appropriate modifier key symbol
  const modKey = isMac ? '⌘' : 'Ctrl'

  // Define all keyboard shortcuts
  const shortcuts: Array<Shortcut> = [
    { key: `${modKey}+A`, descriptionKey: 'keyboard.shortcuts.selectAll' },
    { key: 'Space', descriptionKey: 'keyboard.shortcuts.pauseResume' },
    { key: 'Delete', descriptionKey: 'keyboard.shortcuts.delete' },
    { key: '↑ / ↓', descriptionKey: 'keyboard.shortcuts.navigate' },
    { key: 'Enter', descriptionKey: 'keyboard.shortcuts.toggleSelect' },
    { key: 'Escape', descriptionKey: 'keyboard.shortcuts.clearSelection' },
    { key: '? / F1', descriptionKey: 'keyboard.shortcuts.help' },
  ]

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{t('keyboard.help.title')}</DialogTitle>
          <DialogDescription>
            {t('keyboard.help.description')}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">{t('keyboard.help.keyColumn')}</TableHead>
                <TableHead>{t('keyboard.help.actionColumn')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shortcuts.map((shortcut, index) => (
                <TableRow key={index}>
                  <TableCell className="font-mono font-semibold">
                    {shortcut.key}
                  </TableCell>
                  <TableCell>{t(shortcut.descriptionKey)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  )
}
