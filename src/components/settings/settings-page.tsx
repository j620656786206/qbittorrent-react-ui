import { useTranslation } from 'react-i18next'
import {
  Download,
  Gauge,
  Globe,
  Network,
  Rss,
  Settings2,
  Share2,
} from 'lucide-react'

import { AdvancedSettingsTab } from './advanced-settings'
import { BitTorrentSettingsTab } from './bittorrent-settings'
import { ConnectionSettingsTab } from './connection-settings'
import { DownloadsSettingsTab } from './downloads-settings'
import { RssSettingsTab } from './rss-settings'
import { SpeedSettingsTab } from './speed-settings'
import { WebUISettingsTab } from './webui-settings'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

/**
 * Main qBittorrent settings page component with 7-tab navigation
 *
 * Tabs:
 * - Downloads: Save paths, content layout, auto-management
 * - Speed: Global and alternative speed limits with scheduler
 * - Connection: Listen port, connection limits, proxy settings
 * - BitTorrent: DHT, PEX, LSD, encryption, seeding limits
 * - WebUI: Security, authentication, HTTPS settings
 * - RSS: RSS processing and auto-downloading
 * - Advanced: libtorrent options, disk I/O, network tuning
 */
export function SettingsPage() {
  const { t } = useTranslation()

  return (
    <Tabs defaultValue="downloads" className="w-full">
      <TabsList className="flex flex-wrap h-auto gap-1 w-full justify-start bg-transparent p-0 mb-4">
        <TabsTrigger value="downloads" className="gap-1.5">
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">
            {t('settings.tabs.downloads', 'Downloads')}
          </span>
        </TabsTrigger>
        <TabsTrigger value="speed" className="gap-1.5">
          <Gauge className="h-4 w-4" />
          <span className="hidden sm:inline">
            {t('settings.tabs.speed', 'Speed')}
          </span>
        </TabsTrigger>
        <TabsTrigger value="connection" className="gap-1.5">
          <Network className="h-4 w-4" />
          <span className="hidden sm:inline">
            {t('settings.tabs.connection', 'Connection')}
          </span>
        </TabsTrigger>
        <TabsTrigger value="bittorrent" className="gap-1.5">
          <Share2 className="h-4 w-4" />
          <span className="hidden sm:inline">
            {t('settings.tabs.bittorrent', 'BitTorrent')}
          </span>
        </TabsTrigger>
        <TabsTrigger value="webui" className="gap-1.5">
          <Globe className="h-4 w-4" />
          <span className="hidden sm:inline">
            {t('settings.tabs.webui', 'WebUI')}
          </span>
        </TabsTrigger>
        <TabsTrigger value="rss" className="gap-1.5">
          <Rss className="h-4 w-4" />
          <span className="hidden sm:inline">
            {t('settings.tabs.rss', 'RSS')}
          </span>
        </TabsTrigger>
        <TabsTrigger value="advanced" className="gap-1.5">
          <Settings2 className="h-4 w-4" />
          <span className="hidden sm:inline">
            {t('settings.tabs.advanced', 'Advanced')}
          </span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="downloads" className="mt-0">
        <DownloadsSettingsTab />
      </TabsContent>

      <TabsContent value="speed" className="mt-0">
        <SpeedSettingsTab />
      </TabsContent>

      <TabsContent value="connection" className="mt-0">
        <ConnectionSettingsTab />
      </TabsContent>

      <TabsContent value="bittorrent" className="mt-0">
        <BitTorrentSettingsTab />
      </TabsContent>

      <TabsContent value="webui" className="mt-0">
        <WebUISettingsTab />
      </TabsContent>

      <TabsContent value="rss" className="mt-0">
        <RssSettingsTab />
      </TabsContent>

      <TabsContent value="advanced" className="mt-0">
        <AdvancedSettingsTab />
      </TabsContent>
    </Tabs>
  )
}
