import React from 'react'
import { useTranslation } from 'react-i18next'
import { Controller, useForm } from 'react-hook-form'
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import type {
  AppPreferences,
  AppPreferencesPayload,
  Encryption,
  MaxRatioAction,
} from '@/types/preferences'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { usePreferences, useUpdatePreferences } from '@/hooks/use-preferences'
import { EncryptionLabels, MaxRatioActionLabels } from '@/types/preferences'

/**
 * Form data type for BitTorrent settings
 * Based on AppPreferences fields related to BitTorrent protocol configuration
 */
type BitTorrentFormData = {
  // Privacy
  dht: boolean
  pex: boolean
  lsd: boolean
  encryption: number
  anonymous_mode: boolean

  // Torrent Queueing
  queueing_enabled: boolean
  max_active_checking_torrents: number
  max_active_downloads: number
  max_active_uploads: number
  max_active_torrents: number
  dont_count_slow_torrents: boolean
  slow_torrent_dl_rate_threshold: number
  slow_torrent_ul_rate_threshold: number
  slow_torrent_inactive_timer: number

  // Share Ratio Limiting
  max_ratio_enabled: boolean
  max_ratio: number
  max_seeding_time_enabled: boolean
  max_seeding_time: number
  max_inactive_seeding_time_enabled: boolean
  max_inactive_seeding_time: number
  max_ratio_act: number

  // Automatic Trackers
  add_trackers_enabled: boolean
  add_trackers: string
}

interface BitTorrentSettingsProps {
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
            <p className="text-sm text-muted-foreground mt-0.5">
              {description}
            </p>
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
 * BitTorrent settings form component
 * Handles ~25 parameters for BitTorrent protocol configuration
 */
export function BitTorrentSettings({ preferences }: BitTorrentSettingsProps) {
  const { t } = useTranslation()
  const updatePreferences = useUpdatePreferences()

  // Initialize form with current preferences
  const {
    control,
    handleSubmit,
    watch,
    formState: { isDirty, isSubmitting },
  } = useForm<BitTorrentFormData>({
    defaultValues: {
      // Privacy
      dht: preferences.dht,
      pex: preferences.pex,
      lsd: preferences.lsd,
      encryption: preferences.encryption,
      anonymous_mode: preferences.anonymous_mode,

      // Torrent Queueing
      queueing_enabled: preferences.queueing_enabled,
      max_active_checking_torrents: preferences.max_active_checking_torrents,
      max_active_downloads: preferences.max_active_downloads,
      max_active_uploads: preferences.max_active_uploads,
      max_active_torrents: preferences.max_active_torrents,
      dont_count_slow_torrents: preferences.dont_count_slow_torrents,
      slow_torrent_dl_rate_threshold:
        preferences.slow_torrent_dl_rate_threshold,
      slow_torrent_ul_rate_threshold:
        preferences.slow_torrent_ul_rate_threshold,
      slow_torrent_inactive_timer: preferences.slow_torrent_inactive_timer,

      // Share Ratio Limiting
      max_ratio_enabled: preferences.max_ratio_enabled,
      max_ratio: preferences.max_ratio,
      max_seeding_time_enabled: preferences.max_seeding_time_enabled,
      max_seeding_time: preferences.max_seeding_time,
      max_inactive_seeding_time_enabled:
        preferences.max_inactive_seeding_time_enabled,
      max_inactive_seeding_time: preferences.max_inactive_seeding_time,
      max_ratio_act: preferences.max_ratio_act,

      // Automatic Trackers
      add_trackers_enabled: preferences.add_trackers_enabled,
      add_trackers: preferences.add_trackers,
    },
    mode: 'onBlur', // Performance optimization for large forms
  })

  // Watch values for conditional rendering
  const queueingEnabled = watch('queueing_enabled')
  const dontCountSlowTorrents = watch('dont_count_slow_torrents')
  const maxRatioEnabled = watch('max_ratio_enabled')
  const maxSeedingTimeEnabled = watch('max_seeding_time_enabled')
  const maxInactiveSeedingTimeEnabled = watch(
    'max_inactive_seeding_time_enabled',
  )
  const addTrackersEnabled = watch('add_trackers_enabled')

  // Handle form submission
  const onSubmit = (data: BitTorrentFormData) => {
    const payload: AppPreferencesPayload = {
      // Privacy
      dht: data.dht,
      pex: data.pex,
      lsd: data.lsd,
      encryption: data.encryption as Encryption,
      anonymous_mode: data.anonymous_mode,

      // Torrent Queueing
      queueing_enabled: data.queueing_enabled,
      max_active_checking_torrents: data.max_active_checking_torrents,
      max_active_downloads: data.max_active_downloads,
      max_active_uploads: data.max_active_uploads,
      max_active_torrents: data.max_active_torrents,
      dont_count_slow_torrents: data.dont_count_slow_torrents,
      slow_torrent_dl_rate_threshold: data.slow_torrent_dl_rate_threshold,
      slow_torrent_ul_rate_threshold: data.slow_torrent_ul_rate_threshold,
      slow_torrent_inactive_timer: data.slow_torrent_inactive_timer,

      // Share Ratio Limiting
      max_ratio_enabled: data.max_ratio_enabled,
      max_ratio: data.max_ratio,
      max_seeding_time_enabled: data.max_seeding_time_enabled,
      max_seeding_time: data.max_seeding_time,
      max_ratio_act: data.max_ratio_act as MaxRatioAction,

      // Automatic Trackers
      add_trackers_enabled: data.add_trackers_enabled,
      add_trackers: data.add_trackers,
    }

    // Only include optional fields if the feature is supported
    if (preferences.max_inactive_seeding_time_enabled !== undefined) {
      payload.max_inactive_seeding_time_enabled =
        data.max_inactive_seeding_time_enabled
      payload.max_inactive_seeding_time = data.max_inactive_seeding_time
    }

    updatePreferences.mutate(payload)
  }

  // Check if max_inactive_seeding_time is supported (newer qBit versions)
  const hasInactiveSeedingTimeSupport =
    preferences.max_inactive_seeding_time_enabled !== undefined

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Privacy Section */}
      <SettingsSection
        title={t('qbittorrent.bittorrent.privacy.title', 'Privacy')}
        description={t(
          'qbittorrent.bittorrent.privacy.description',
          'Configure peer discovery and encryption settings',
        )}
      >
        <div className="space-y-3">
          <Controller
            name="dht"
            control={control}
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="dht"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
                <Label htmlFor="dht" className="font-normal cursor-pointer">
                  {t(
                    'qbittorrent.bittorrent.enableDht',
                    'Enable DHT (decentralized network) to find more peers',
                  )}
                </Label>
              </div>
            )}
          />

          <Controller
            name="pex"
            control={control}
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="pex"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
                <Label htmlFor="pex" className="font-normal cursor-pointer">
                  {t(
                    'qbittorrent.bittorrent.enablePex',
                    'Enable Peer Exchange (PEX) to find more peers',
                  )}
                </Label>
              </div>
            )}
          />

          <Controller
            name="lsd"
            control={control}
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="lsd"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
                <Label htmlFor="lsd" className="font-normal cursor-pointer">
                  {t(
                    'qbittorrent.bittorrent.enableLsd',
                    'Enable Local Peer Discovery (LSD) to find local peers',
                  )}
                </Label>
              </div>
            )}
          />

          <Controller
            name="anonymous_mode"
            control={control}
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="anonymous_mode"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
                <Label
                  htmlFor="anonymous_mode"
                  className="font-normal cursor-pointer"
                >
                  {t(
                    'qbittorrent.bittorrent.anonymousMode',
                    'Enable anonymous mode',
                  )}
                </Label>
              </div>
            )}
          />

          <p className="text-xs text-muted-foreground ml-6">
            {t(
              'qbittorrent.bittorrent.anonymousModeHint',
              'When enabled, qBittorrent will not share identifying information with trackers',
            )}
          </p>
        </div>

        {/* Encryption Mode */}
        <div className="grid gap-2 pt-2">
          <Label htmlFor="encryption">
            {t('qbittorrent.bittorrent.encryption', 'Encryption mode')}
          </Label>
          <Controller
            name="encryption"
            control={control}
            render={({ field }) => (
              <select
                {...field}
                id="encryption"
                onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                className="h-9 w-full max-w-[300px] rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] dark:bg-input/30"
              >
                {Object.entries(EncryptionLabels).map(([value, labelKey]) => (
                  <option key={value} value={value}>
                    {t(labelKey, value)}
                  </option>
                ))}
              </select>
            )}
          />
          <p className="text-xs text-muted-foreground">
            {t(
              'qbittorrent.bittorrent.encryptionHint',
              'Force encryption for increased privacy, prefer encryption for compatibility',
            )}
          </p>
        </div>
      </SettingsSection>

      {/* Torrent Queueing Section */}
      <SettingsSection
        title={t('qbittorrent.bittorrent.queueing.title', 'Torrent Queueing')}
        description={t(
          'qbittorrent.bittorrent.queueing.description',
          'Control the number of active torrents',
        )}
      >
        <Controller
          name="queueing_enabled"
          control={control}
          render={({ field }) => (
            <div className="flex items-center gap-2">
              <Checkbox
                id="queueing_enabled"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
              <Label
                htmlFor="queueing_enabled"
                className="font-normal cursor-pointer"
              >
                {t(
                  'qbittorrent.bittorrent.enableQueueing',
                  'Enable torrent queueing',
                )}
              </Label>
            </div>
          )}
        />

        {queueingEnabled && (
          <div className="space-y-4 ml-6 p-3 bg-muted/30 rounded-md">
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Max Active Checking Torrents */}
              <div className="grid gap-2">
                <Label htmlFor="max_active_checking_torrents">
                  {t(
                    'qbittorrent.bittorrent.maxActiveChecking',
                    'Maximum active checking torrents',
                  )}
                </Label>
                <Controller
                  name="max_active_checking_torrents"
                  control={control}
                  render={({ field }) => (
                    <Input
                      {...field}
                      id="max_active_checking_torrents"
                      type="number"
                      min={1}
                      onChange={(e) =>
                        field.onChange(parseInt(e.target.value, 10) || 1)
                      }
                    />
                  )}
                />
              </div>

              {/* Max Active Downloads */}
              <div className="grid gap-2">
                <Label htmlFor="max_active_downloads">
                  {t(
                    'qbittorrent.bittorrent.maxActiveDownloads',
                    'Maximum active downloads',
                  )}
                </Label>
                <Controller
                  name="max_active_downloads"
                  control={control}
                  render={({ field }) => (
                    <Input
                      {...field}
                      id="max_active_downloads"
                      type="number"
                      min={-1}
                      onChange={(e) =>
                        field.onChange(parseInt(e.target.value, 10) || 0)
                      }
                    />
                  )}
                />
              </div>

              {/* Max Active Uploads */}
              <div className="grid gap-2">
                <Label htmlFor="max_active_uploads">
                  {t(
                    'qbittorrent.bittorrent.maxActiveUploads',
                    'Maximum active uploads',
                  )}
                </Label>
                <Controller
                  name="max_active_uploads"
                  control={control}
                  render={({ field }) => (
                    <Input
                      {...field}
                      id="max_active_uploads"
                      type="number"
                      min={-1}
                      onChange={(e) =>
                        field.onChange(parseInt(e.target.value, 10) || 0)
                      }
                    />
                  )}
                />
              </div>

              {/* Max Active Torrents */}
              <div className="grid gap-2">
                <Label htmlFor="max_active_torrents">
                  {t(
                    'qbittorrent.bittorrent.maxActiveTorrents',
                    'Maximum active torrents',
                  )}
                </Label>
                <Controller
                  name="max_active_torrents"
                  control={control}
                  render={({ field }) => (
                    <Input
                      {...field}
                      id="max_active_torrents"
                      type="number"
                      min={-1}
                      onChange={(e) =>
                        field.onChange(parseInt(e.target.value, 10) || 0)
                      }
                    />
                  )}
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              {t('qbittorrent.bittorrent.unlimitedHint', '-1 = unlimited')}
            </p>

            {/* Slow Torrents Settings */}
            <Controller
              name="dont_count_slow_torrents"
              control={control}
              render={({ field }) => (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="dont_count_slow_torrents"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                  <Label
                    htmlFor="dont_count_slow_torrents"
                    className="font-normal cursor-pointer"
                  >
                    {t(
                      'qbittorrent.bittorrent.dontCountSlowTorrents',
                      'Do not count slow torrents in queue limits',
                    )}
                  </Label>
                </div>
              )}
            />

            {dontCountSlowTorrents && (
              <div className="space-y-4 ml-6 p-3 bg-muted/20 rounded-md">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="grid gap-2">
                    <Label htmlFor="slow_torrent_dl_rate_threshold">
                      {t(
                        'qbittorrent.bittorrent.slowDownloadThreshold',
                        'Download rate (KiB/s)',
                      )}
                    </Label>
                    <Controller
                      name="slow_torrent_dl_rate_threshold"
                      control={control}
                      render={({ field }) => (
                        <Input
                          {...field}
                          id="slow_torrent_dl_rate_threshold"
                          type="number"
                          min={0}
                          onChange={(e) =>
                            field.onChange(parseInt(e.target.value, 10) || 0)
                          }
                        />
                      )}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="slow_torrent_ul_rate_threshold">
                      {t(
                        'qbittorrent.bittorrent.slowUploadThreshold',
                        'Upload rate (KiB/s)',
                      )}
                    </Label>
                    <Controller
                      name="slow_torrent_ul_rate_threshold"
                      control={control}
                      render={({ field }) => (
                        <Input
                          {...field}
                          id="slow_torrent_ul_rate_threshold"
                          type="number"
                          min={0}
                          onChange={(e) =>
                            field.onChange(parseInt(e.target.value, 10) || 0)
                          }
                        />
                      )}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="slow_torrent_inactive_timer">
                      {t(
                        'qbittorrent.bittorrent.slowInactiveTimer',
                        'Inactivity timer (s)',
                      )}
                    </Label>
                    <Controller
                      name="slow_torrent_inactive_timer"
                      control={control}
                      render={({ field }) => (
                        <Input
                          {...field}
                          id="slow_torrent_inactive_timer"
                          type="number"
                          min={0}
                          onChange={(e) =>
                            field.onChange(parseInt(e.target.value, 10) || 0)
                          }
                        />
                      )}
                    />
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  {t(
                    'qbittorrent.bittorrent.slowTorrentHint',
                    'Torrents with transfer rate below thresholds or inactive for the specified time are considered slow',
                  )}
                </p>
              </div>
            )}
          </div>
        )}
      </SettingsSection>

      {/* Share Ratio Limiting Section */}
      <SettingsSection
        title={t(
          'qbittorrent.bittorrent.seedingLimits.title',
          'Seeding Limits',
        )}
        description={t(
          'qbittorrent.bittorrent.seedingLimits.description',
          'Configure when to stop seeding torrents',
        )}
      >
        {/* Max Ratio */}
        <Controller
          name="max_ratio_enabled"
          control={control}
          render={({ field }) => (
            <div className="flex items-center gap-2">
              <Checkbox
                id="max_ratio_enabled"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
              <Label
                htmlFor="max_ratio_enabled"
                className="font-normal cursor-pointer"
              >
                {t(
                  'qbittorrent.bittorrent.enableMaxRatio',
                  'When ratio reaches',
                )}
              </Label>
            </div>
          )}
        />

        {maxRatioEnabled && (
          <div className="flex items-center gap-2 ml-6">
            <Controller
              name="max_ratio"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  id="max_ratio"
                  type="number"
                  min={-1}
                  step={0.1}
                  className="max-w-[120px]"
                  onChange={(e) =>
                    field.onChange(parseFloat(e.target.value) || 0)
                  }
                />
              )}
            />
            <span className="text-sm text-muted-foreground">
              {t('qbittorrent.bittorrent.ratioHint', '(-1 = unlimited)')}
            </span>
          </div>
        )}

        {/* Max Seeding Time */}
        <Controller
          name="max_seeding_time_enabled"
          control={control}
          render={({ field }) => (
            <div className="flex items-center gap-2">
              <Checkbox
                id="max_seeding_time_enabled"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
              <Label
                htmlFor="max_seeding_time_enabled"
                className="font-normal cursor-pointer"
              >
                {t(
                  'qbittorrent.bittorrent.enableMaxSeedingTime',
                  'When seeding time reaches (minutes)',
                )}
              </Label>
            </div>
          )}
        />

        {maxSeedingTimeEnabled && (
          <div className="flex items-center gap-2 ml-6">
            <Controller
              name="max_seeding_time"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  id="max_seeding_time"
                  type="number"
                  min={-1}
                  className="max-w-[120px]"
                  onChange={(e) =>
                    field.onChange(parseInt(e.target.value, 10) || 0)
                  }
                />
              )}
            />
            <span className="text-sm text-muted-foreground">
              {t('qbittorrent.bittorrent.timeHint', '(-1 = unlimited)')}
            </span>
          </div>
        )}

        {/* Max Inactive Seeding Time (newer qBit versions) */}
        {hasInactiveSeedingTimeSupport && (
          <>
            <Controller
              name="max_inactive_seeding_time_enabled"
              control={control}
              render={({ field }) => (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="max_inactive_seeding_time_enabled"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                  <Label
                    htmlFor="max_inactive_seeding_time_enabled"
                    className="font-normal cursor-pointer"
                  >
                    {t(
                      'qbittorrent.bittorrent.enableMaxInactiveSeedingTime',
                      'When inactive seeding time reaches (minutes)',
                    )}
                  </Label>
                </div>
              )}
            />

            {maxInactiveSeedingTimeEnabled && (
              <div className="flex items-center gap-2 ml-6">
                <Controller
                  name="max_inactive_seeding_time"
                  control={control}
                  render={({ field }) => (
                    <Input
                      {...field}
                      id="max_inactive_seeding_time"
                      type="number"
                      min={-1}
                      className="max-w-[120px]"
                      onChange={(e) =>
                        field.onChange(parseInt(e.target.value, 10) || 0)
                      }
                    />
                  )}
                />
                <span className="text-sm text-muted-foreground">
                  {t('qbittorrent.bittorrent.timeHint', '(-1 = unlimited)')}
                </span>
              </div>
            )}
          </>
        )}

        {/* Action when limit is reached */}
        {(maxRatioEnabled ||
          maxSeedingTimeEnabled ||
          (hasInactiveSeedingTimeSupport && maxInactiveSeedingTimeEnabled)) && (
          <div className="grid gap-2 pt-2">
            <Label htmlFor="max_ratio_act">
              {t('qbittorrent.bittorrent.limitAction', 'Then')}
            </Label>
            <Controller
              name="max_ratio_act"
              control={control}
              render={({ field }) => (
                <select
                  {...field}
                  id="max_ratio_act"
                  onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                  className="h-9 w-full max-w-[300px] rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] dark:bg-input/30"
                >
                  {Object.entries(MaxRatioActionLabels).map(
                    ([value, labelKey]) => (
                      <option key={value} value={value}>
                        {t(labelKey, value)}
                      </option>
                    ),
                  )}
                </select>
              )}
            />
          </div>
        )}
      </SettingsSection>

      {/* Automatic Trackers Section */}
      <SettingsSection
        title={t(
          'qbittorrent.bittorrent.automaticTrackers.title',
          'Automatically Add Trackers',
        )}
        description={t(
          'qbittorrent.bittorrent.automaticTrackers.description',
          'Add custom trackers to all new torrents',
        )}
        defaultOpen={false}
      >
        <Controller
          name="add_trackers_enabled"
          control={control}
          render={({ field }) => (
            <div className="flex items-center gap-2">
              <Checkbox
                id="add_trackers_enabled"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
              <Label
                htmlFor="add_trackers_enabled"
                className="font-normal cursor-pointer"
              >
                {t(
                  'qbittorrent.bittorrent.enableAutoTrackers',
                  'Automatically add these trackers to new downloads',
                )}
              </Label>
            </div>
          )}
        />

        {addTrackersEnabled && (
          <div className="grid gap-2 ml-6">
            <Controller
              name="add_trackers"
              control={control}
              render={({ field }) => (
                <Textarea
                  {...field}
                  id="add_trackers"
                  placeholder={t(
                    'qbittorrent.bittorrent.trackersPlaceholder',
                    'udp://tracker.example.com:6969/announce\nhttp://tracker2.example.com/announce',
                  )}
                  rows={6}
                  className="font-mono text-sm"
                />
              )}
            />
            <p className="text-xs text-muted-foreground">
              {t(
                'qbittorrent.bittorrent.trackersHint',
                'Enter one tracker URL per line. These will be added to all new torrents.',
              )}
            </p>
          </div>
        )}
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
            : t(
                'qbittorrent.bittorrent.saveFailed',
                'Failed to save BitTorrent settings',
              )}
        </div>
      )}

      {/* Success Display */}
      {updatePreferences.isSuccess && (
        <div className="text-sm text-green-600 bg-green-500/10 rounded-md px-3 py-2">
          {t(
            'qbittorrent.bittorrent.saveSuccess',
            'BitTorrent settings saved successfully',
          )}
        </div>
      )}
    </form>
  )
}

/**
 * BitTorrent settings tab wrapper that handles loading state
 */
export function BitTorrentSettingsTab() {
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
          {t(
            'qbittorrent.bittorrent.errorLoading',
            'Failed to load BitTorrent settings',
          )}
        </p>
        {error instanceof Error && (
          <p className="text-sm text-muted-foreground">{error.message}</p>
        )}
      </div>
    )
  }

  return <BitTorrentSettings preferences={preferences} />
}
