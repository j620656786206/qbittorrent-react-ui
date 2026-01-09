import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { SettingsPage as SettingsPageContent } from '@/components/settings/settings-page'

export const Route = createFileRoute('/settings')({ component: SettingsPage })

function SettingsPage() {
  const { t } = useTranslation()

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card p-4">
        <div className="flex items-center gap-4">
          <Link to="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-semibold text-foreground">
            {t('settings.title', 'Settings')}
          </h1>
        </div>
      </div>

      {/* Content Area */}
      <div className="p-4 md:p-6">
        <div className="max-w-4xl mx-auto">
          <SettingsPageContent />
        </div>
      </div>
    </div>
  )
}
