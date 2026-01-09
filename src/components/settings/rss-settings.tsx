import React from 'react'
import { useTranslation } from 'react-i18next'
import { Controller, useForm } from 'react-hook-form'
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import type { AppPreferences, AppPreferencesPayload } from '@/types/preferences'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { usePreferences, useUpdatePreferences } from '@/hooks/use-preferences'

/**
 * Form data type for RSS settings
 * Based on AppPreferences fields related to RSS configuration (~8 parameters)
 */
type RssFormData = {
  // RSS Processing
  rss_processing_enabled: boolean
  rss_refresh_interval: number
  rss_fetch_delay: number
  rss_max_articles_per_feed: number

  // RSS Auto-Downloading
  rss_auto_downloading_enabled: boolean
  rss_download_repack_proper_episodes: boolean

  // Smart Episode Filters
  rss_smart_episode_filters: string
}

interface RssSettingsProps {
  preferences: AppPreferences
}

/**
 * Collapsible section component for grouping related settings
 */
function SettingsSection({
  title,
  description,
  children,
  defaultOpen = true,
}: {
  title: string
  description?: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen)

  return (
    <div className="border rounded-lg">
      <button
        type="button"
        className="flex items-center justify-between w-full p-4 text-left hover:bg-muted/50 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div>
          <h3 className="font-medium">{title}</h3>
          {description && (
            <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {isOpen && <div className="px-4 pb-4 space-y-4">{children}</div>}
    </div>
  )
}

/**
 * RSS settings form component
 * Handles ~8 parameters for RSS processing and auto-downloading configuration
 */
export function RssSettings({ preferences }: RssSettingsProps) {
  const { t } = useTranslation()
  const updatePreferences = useUpdatePreferences()

  // Initialize form with current preferences
  const { control, handleSubmit, watch, formState: { isDirty, isSubmitting } } = useForm<RssFormData>({
    defaultValues: {
      // RSS Processing
      rss_processing_enabled: preferences.rss_processing_enabled,
      rss_refresh_interval: preferences.rss_refresh_interval,
      rss_fetch_delay: preferences.rss_fetch_delay,
      rss_max_articles_per_feed: preferences.rss_max_articles_per_feed,

      // RSS Auto-Downloading
      rss_auto_downloading_enabled: preferences.rss_auto_downloading_enabled,
      rss_download_repack_proper_episodes: preferences.rss_download_repack_proper_episodes,

      // Smart Episode Filters
      rss_smart_episode_filters: preferences.rss_smart_episode_filters,
    },
    mode: 'onBlur', // Performance optimization for large forms
  })

  // Watch values for conditional rendering
  const rssProcessingEnabled = watch('rss_processing_enabled')
  const rssAutoDownloadingEnabled = watch('rss_auto_downloading_enabled')

  // Handle form submission
  const onSubmit = (data: RssFormData) => {
    const payload: AppPreferencesPayload = {
      // RSS Processing
      rss_processing_enabled: data.rss_processing_enabled,
      rss_refresh_interval: data.rss_refresh_interval,
      rss_max_articles_per_feed: data.rss_max_articles_per_feed,

      // RSS Auto-Downloading
      rss_auto_downloading_enabled: data.rss_auto_downloading_enabled,
      rss_download_repack_proper_episodes: data.rss_download_repack_proper_episodes,

      // Smart Episode Filters
      rss_smart_episode_filters: data.rss_smart_episode_filters,
    }

    // Only include optional fields if the feature is supported
    if (preferences.rss_fetch_delay !== undefined) {
      payload.rss_fetch_delay = data.rss_fetch_delay
    }

    updatePreferences.mutate(payload)
  }

  // Check if rss_fetch_delay is supported (newer qBit versions)
  const hasFetchDelaySupport = preferences.rss_fetch_delay !== undefined

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* RSS Processing Section */}
      <SettingsSection
        title={t('qbittorrent.rss.processing.title', 'RSS Processing')}
        description={t('qbittorrent.rss.processing.description', 'Configure how RSS feeds are fetched and processed')}
      >
        <Controller
          name="rss_processing_enabled"
          control={control}
          render={({ field }) => (
            <div className="flex items-center gap-2">
              <Checkbox
                id="rss_processing_enabled"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
              <Label htmlFor="rss_processing_enabled" className="font-normal cursor-pointer">
                {t('qbittorrent.rss.enableProcessing', 'Enable RSS fetching and processing')}
              </Label>
            </div>
          )}
        />

        {rssProcessingEnabled && (
          <div className="space-y-4 ml-6 p-3 bg-muted/30 rounded-md">
            {/* Refresh Interval */}
            <div className="grid gap-2">
              <Label htmlFor="rss_refresh_interval">
                {t('qbittorrent.rss.refreshInterval', 'Feed refresh interval (minutes)')}
              </Label>
              <Controller
                name="rss_refresh_interval"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    id="rss_refresh_interval"
                    type="number"
                    min={1}
                    max={1440}
                    className="max-w-[200px]"
                    onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 30)}
                  />
                )}
              />
              <p className="text-xs text-muted-foreground">
                {t('qbittorrent.rss.refreshIntervalHint', 'How often to check RSS feeds for new content (1-1440 minutes)')}
              </p>
            </div>

            {/* Fetch Delay (newer qBit versions) */}
            {hasFetchDelaySupport && (
              <div className="grid gap-2">
                <Label htmlFor="rss_fetch_delay">
                  {t('qbittorrent.rss.fetchDelay', 'Delay between feed fetches (ms)')}
                </Label>
                <Controller
                  name="rss_fetch_delay"
                  control={control}
                  render={({ field }) => (
                    <Input
                      {...field}
                      id="rss_fetch_delay"
                      type="number"
                      min={0}
                      max={60000}
                      className="max-w-[200px]"
                      onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
                    />
                  )}
                />
                <p className="text-xs text-muted-foreground">
                  {t('qbittorrent.rss.fetchDelayHint', 'Delay between consecutive feed fetches to avoid rate limiting (0 = no delay)')}
                </p>
              </div>
            )}

            {/* Max Articles Per Feed */}
            <div className="grid gap-2">
              <Label htmlFor="rss_max_articles_per_feed">
                {t('qbittorrent.rss.maxArticles', 'Maximum articles per feed')}
              </Label>
              <Controller
                name="rss_max_articles_per_feed"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    id="rss_max_articles_per_feed"
                    type="number"
                    min={1}
                    max={10000}
                    className="max-w-[200px]"
                    onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 50)}
                  />
                )}
              />
              <p className="text-xs text-muted-foreground">
                {t('qbittorrent.rss.maxArticlesHint', 'Maximum number of articles to store per feed')}
              </p>
            </div>
          </div>
        )}
      </SettingsSection>

      {/* RSS Auto-Downloading Section */}
      <SettingsSection
        title={t('qbittorrent.rss.autoDownload.title', 'Auto-Downloading')}
        description={t('qbittorrent.rss.autoDownload.description', 'Configure automatic torrent downloading from RSS feeds')}
      >
        <Controller
          name="rss_auto_downloading_enabled"
          control={control}
          render={({ field }) => (
            <div className="flex items-center gap-2">
              <Checkbox
                id="rss_auto_downloading_enabled"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
              <Label htmlFor="rss_auto_downloading_enabled" className="font-normal cursor-pointer">
                {t('qbittorrent.rss.enableAutoDownload', 'Enable RSS auto-downloading')}
              </Label>
            </div>
          )}
        />

        <p className="text-xs text-muted-foreground ml-6">
          {t('qbittorrent.rss.autoDownloadHint', 'Automatically download torrents matching your RSS rules')}
        </p>

        {rssAutoDownloadingEnabled && (
          <div className="space-y-4 ml-6 p-3 bg-muted/30 rounded-md">
            <Controller
              name="rss_download_repack_proper_episodes"
              control={control}
              render={({ field }) => (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="rss_download_repack_proper_episodes"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                  <Label htmlFor="rss_download_repack_proper_episodes" className="font-normal cursor-pointer">
                    {t('qbittorrent.rss.downloadRepack', 'Download REPACK/PROPER episodes')}
                  </Label>
                </div>
              )}
            />
            <p className="text-xs text-muted-foreground ml-6">
              {t('qbittorrent.rss.downloadRepackHint', 'Re-download episodes tagged as REPACK or PROPER (improved quality releases)')}
            </p>
          </div>
        )}
      </SettingsSection>

      {/* Smart Episode Filters Section */}
      <SettingsSection
        title={t('qbittorrent.rss.smartFilters.title', 'Smart Episode Filters')}
        description={t('qbittorrent.rss.smartFilters.description', 'Custom regex patterns to identify episode numbers in RSS item titles')}
        defaultOpen={false}
      >
        <div className="grid gap-2">
          <Controller
            name="rss_smart_episode_filters"
            control={control}
            render={({ field }) => (
              <Textarea
                {...field}
                id="rss_smart_episode_filters"
                placeholder={t('qbittorrent.rss.smartFiltersPlaceholder', 's(\\d+)e(\\d+)\nEpisode (\\d+)\n(\\d{1,3})\\s*of\\s*(\\d{1,3})')}
                rows={6}
                className="font-mono text-sm"
              />
            )}
          />
          <p className="text-xs text-muted-foreground">
            {t('qbittorrent.rss.smartFiltersHint', 'Enter one regex pattern per line. These patterns are used to extract episode information from RSS item titles for smart filtering.')}
          </p>
          <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-md">
            <p className="font-medium mb-1">{t('qbittorrent.rss.smartFiltersExamples', 'Common patterns:')}</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li><code className="bg-muted px-1 rounded">s(\d+)e(\d+)</code> - {t('qbittorrent.rss.patternSeason', 'Season/Episode format (S01E02)')}</li>
              <li><code className="bg-muted px-1 rounded">(\d+)x(\d+)</code> - {t('qbittorrent.rss.patternXFormat', 'Episode format (1x02)')}</li>
              <li><code className="bg-muted px-1 rounded">Episode\s+(\d+)</code> - {t('qbittorrent.rss.patternEpisode', '"Episode 12" format')}</li>
            </ul>
          </div>
        </div>
      </SettingsSection>

      {/* Save Button */}
      <div className="flex justify-end pt-4 border-t">
        <Button
          type="submit"
          disabled={!isDirty || isSubmitting || updatePreferences.isPending}
        >
          {(isSubmitting || updatePreferences.isPending) && (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          )}
          {t('common.save', 'Save')}
        </Button>
      </div>

      {/* Error Display */}
      {updatePreferences.isError && (
        <div className="text-sm text-red-500 bg-red-500/10 rounded-md px-3 py-2">
          {updatePreferences.error instanceof Error
            ? updatePreferences.error.message
            : t('qbittorrent.rss.saveFailed', 'Failed to save RSS settings')}
        </div>
      )}

      {/* Success Display */}
      {updatePreferences.isSuccess && (
        <div className="text-sm text-green-600 bg-green-500/10 rounded-md px-3 py-2">
          {t('qbittorrent.rss.saveSuccess', 'RSS settings saved successfully')}
        </div>
      )}
    </form>
  )
}

/**
 * RSS settings tab wrapper that handles loading state
 */
export function RssSettingsTab() {
  const { data: preferences, isLoading, error } = usePreferences()
  const { t } = useTranslation()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !preferences) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2">
        <p className="text-destructive">
          {t('qbittorrent.rss.errorLoading', 'Failed to load RSS settings')}
        </p>
        {error instanceof Error && (
          <p className="text-sm text-muted-foreground">{error.message}</p>
        )}
      </div>
    )
  }

  return <RssSettings preferences={preferences} />
}
