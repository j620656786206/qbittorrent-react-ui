import React from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { LOCALES, Locales, defaultLocale } from '@/locales'
import { ChevronDownIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import i18n from '@/i18n'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: () => void
}

export function SettingsModal({ isOpen, onClose, onSave }: SettingsModalProps) {
  const { t } = useTranslation()
  const [username, setUsername] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [language, setLanguage] = React.useState<Locales>(defaultLocale)

  React.useEffect(() => {
    // Load current values from localStorage when modal opens
    setUsername(localStorage.getItem('qbit_username') || 'admin')
    setPassword(localStorage.getItem('qbit_password') || 'adminadmin')
    setLanguage((i18n.language as Locales) || defaultLocale)
  }, [isOpen])

  const handleSave = () => {
    localStorage.setItem('qbit_username', username)
    localStorage.setItem('qbit_password', password)
    i18n.changeLanguage(language)
    onSave()
    onClose()
  }

  const selectedLocale = LOCALES.find((l) => l.value === language) || LOCALES[0]

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('settings.title')}</DialogTitle>
          <DialogDescription>
            {t('settings.description')}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="username" className="text-right">
              {t('settings.username')}
            </Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="password" className="text-right">
              {t('settings.password')}
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="language" className="text-right">
              {t('settings.language')}
            </Label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  id="language"
                  variant="outline"
                  className="col-span-3 justify-between"
                >
                  {selectedLocale.title}
                  <ChevronDownIcon className="ml-2 h-4 w-4 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[200px]">
                <DropdownMenuRadioGroup value={language} onValueChange={(value) => setLanguage(value as Locales)}>
                  {LOCALES.map((locale) => (
                    <DropdownMenuRadioItem key={locale.value} value={locale.value}>
                      {locale.title}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <DialogFooter>
          <Button type="submit" onClick={handleSave}>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
