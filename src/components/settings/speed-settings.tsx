import React from 'react'
import { useTranslation } from 'react-i18next'
import { Controller, useForm } from 'react-hook-form'
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import type {
  AppPreferences,
  AppPreferencesPayload,
  SchedulerDays,
} from '@/types/preferences'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { usePreferences, useUpdatePreferences } from '@/hooks/use-preferences'
import { SchedulerDaysLabels } from '@/types/preferences'

/**
 * Form data type for Speed settings
 * Based on AppPreferences fields related to speed limits and scheduler
 */
type SpeedFormData = {
  // Global Rate Limits
  dl_limit: number
  up_limit: number

  // Alternative Rate Limits
  alt_dl_limit: number
  alt_up_limit: number

  // Rate Limit Options
  limit_utp_rate: boolean
  limit_tcp_overhead: boolean
  limit_lan_peers: boolean

  // Scheduler
  scheduler_enabled: boolean
  schedule_from_hour: number
  schedule_from_min: number
  schedule_to_hour: number
  schedule_to_min: number
  scheduler_days: number
}

interface SpeedSettingsProps {
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
 * Time picker component for hour and minute selection
 */
function TimePicker({
  hourValue,
  minuteValue,
  onHourChange,
  onMinuteChange,
  label,
  id,
}: {
  hourValue: number
  minuteValue: number
  onHourChange: (value: number) => void
  onMinuteChange: (value: number) => void
  label: string
  id: string
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <select
          id={`${id}-hour`}
          value={hourValue}
          onChange={(e) => onHourChange(parseInt(e.target.value, 10))}
          className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] dark:bg-input/30"
        >
          {Array.from({ length: 24 }, (_, i) => (
            <option key={i} value={i}>
              {i.toString().padStart(2, '0')}
            </option>
          ))}
        </select>
        <span className="text-muted-foreground">:</span>
        <select
          id={`${id}-min`}
          value={minuteValue}
          onChange={(e) => onMinuteChange(parseInt(e.target.value, 10))}
          className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] dark:bg-input/30"
        >
          {Array.from({ length: 60 }, (_, i) => (
            <option key={i} value={i}>
              {i.toString().padStart(2, '0')}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

/**
 * Convert bytes/s to KiB/s for display
 * -1 or 0 means unlimited
 */
function bytesToKiB(bytes: number): number {
  if (bytes <= 0) return 0
  return Math.floor(bytes / 1024)
}

/**
 * Convert KiB/s to bytes/s for API
 * 0 means unlimited
 */
function kibToBytes(kib: number): number {
  if (kib <= 0) return 0
  return kib * 1024
}

/**
 * Speed settings form component
 * Handles ~12 parameters for speed limits and scheduler configuration
 */
export function SpeedSettings({ preferences }: SpeedSettingsProps) {
  const { t } = useTranslation()
  const updatePreferences = useUpdatePreferences()

  // Initialize form with current preferences
  // Convert bytes/s to KiB/s for display
  const {
    control,
    handleSubmit,
    watch,
    formState: { isDirty, isSubmitting },
  } = useForm<SpeedFormData>({
    defaultValues: {
      // Global Rate Limits (convert bytes to KiB)
      dl_limit: bytesToKiB(preferences.dl_limit),
      up_limit: bytesToKiB(preferences.up_limit),

      // Alternative Rate Limits (convert bytes to KiB)
      alt_dl_limit: bytesToKiB(preferences.alt_dl_limit),
      alt_up_limit: bytesToKiB(preferences.alt_up_limit),

      // Rate Limit Options
      limit_utp_rate: preferences.limit_utp_rate,
      limit_tcp_overhead: preferences.limit_tcp_overhead,
      limit_lan_peers: preferences.limit_lan_peers,

      // Scheduler
      scheduler_enabled: preferences.scheduler_enabled,
      schedule_from_hour: preferences.schedule_from_hour,
      schedule_from_min: preferences.schedule_from_min,
      schedule_to_hour: preferences.schedule_to_hour,
      schedule_to_min: preferences.schedule_to_min,
      scheduler_days: preferences.scheduler_days,
    },
    mode: 'onBlur', // Performance optimization for large forms
  })

  // Watch values for conditional rendering
  const schedulerEnabled = watch('scheduler_enabled')

  // Handle form submission
  const onSubmit = (data: SpeedFormData) => {
    // Convert KiB/s back to bytes/s for the API
    const payload: AppPreferencesPayload = {
      dl_limit: kibToBytes(data.dl_limit),
      up_limit: kibToBytes(data.up_limit),
      alt_dl_limit: kibToBytes(data.alt_dl_limit),
      alt_up_limit: kibToBytes(data.alt_up_limit),
      limit_utp_rate: data.limit_utp_rate,
      limit_tcp_overhead: data.limit_tcp_overhead,
      limit_lan_peers: data.limit_lan_peers,
      scheduler_enabled: data.scheduler_enabled,
      schedule_from_hour: data.schedule_from_hour,
      schedule_from_min: data.schedule_from_min,
      schedule_to_hour: data.schedule_to_hour,
      schedule_to_min: data.schedule_to_min,
      scheduler_days: data.scheduler_days as SchedulerDays,
    }

    updatePreferences.mutate(payload)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Global Rate Limits Section */}
      <SettingsSection
        title={t('qbittorrent.speed.globalLimits.title', 'Global Rate Limits')}
        description={t(
          'qbittorrent.speed.globalLimits.description',
          'Set maximum download and upload speeds',
        )}
      >
        {/* Download Limit */}
        <div className="grid gap-2">
          <Label htmlFor="dl_limit">
            {t(
              'qbittorrent.speed.downloadLimit',
              'Global download rate limit (KiB/s)',
            )}
          </Label>
          <div className="flex items-center gap-2">
            <Controller
              name="dl_limit"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  id="dl_limit"
                  type="number"
                  min={0}
                  className="max-w-[200px]"
                  onChange={(e) =>
                    field.onChange(parseInt(e.target.value, 10) || 0)
                  }
                />
              )}
            />
            <span className="text-sm text-muted-foreground">
              {t('qbittorrent.speed.unlimitedHint', '0 = unlimited')}
            </span>
          </div>
        </div>

        {/* Upload Limit */}
        <div className="grid gap-2">
          <Label htmlFor="up_limit">
            {t(
              'qbittorrent.speed.uploadLimit',
              'Global upload rate limit (KiB/s)',
            )}
          </Label>
          <div className="flex items-center gap-2">
            <Controller
              name="up_limit"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  id="up_limit"
                  type="number"
                  min={0}
                  className="max-w-[200px]"
                  onChange={(e) =>
                    field.onChange(parseInt(e.target.value, 10) || 0)
                  }
                />
              )}
            />
            <span className="text-sm text-muted-foreground">
              {t('qbittorrent.speed.unlimitedHint', '0 = unlimited')}
            </span>
          </div>
        </div>
      </SettingsSection>

      {/* Alternative Rate Limits Section */}
      <SettingsSection
        title={t(
          'qbittorrent.speed.alternativeLimits.title',
          'Alternative Rate Limits',
        )}
        description={t(
          'qbittorrent.speed.alternativeLimits.description',
          'Set alternative speed limits for scheduled periods',
        )}
      >
        {/* Alternative Download Limit */}
        <div className="grid gap-2">
          <Label htmlFor="alt_dl_limit">
            {t(
              'qbittorrent.speed.altDownloadLimit',
              'Alternative download rate limit (KiB/s)',
            )}
          </Label>
          <div className="flex items-center gap-2">
            <Controller
              name="alt_dl_limit"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  id="alt_dl_limit"
                  type="number"
                  min={0}
                  className="max-w-[200px]"
                  onChange={(e) =>
                    field.onChange(parseInt(e.target.value, 10) || 0)
                  }
                />
              )}
            />
            <span className="text-sm text-muted-foreground">
              {t('qbittorrent.speed.unlimitedHint', '0 = unlimited')}
            </span>
          </div>
        </div>

        {/* Alternative Upload Limit */}
        <div className="grid gap-2">
          <Label htmlFor="alt_up_limit">
            {t(
              'qbittorrent.speed.altUploadLimit',
              'Alternative upload rate limit (KiB/s)',
            )}
          </Label>
          <div className="flex items-center gap-2">
            <Controller
              name="alt_up_limit"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  id="alt_up_limit"
                  type="number"
                  min={0}
                  className="max-w-[200px]"
                  onChange={(e) =>
                    field.onChange(parseInt(e.target.value, 10) || 0)
                  }
                />
              )}
            />
            <span className="text-sm text-muted-foreground">
              {t('qbittorrent.speed.unlimitedHint', '0 = unlimited')}
            </span>
          </div>
        </div>
      </SettingsSection>

      {/* Rate Limit Options Section */}
      <SettingsSection
        title={t(
          'qbittorrent.speed.rateLimitOptions.title',
          'Rate Limit Options',
        )}
        description={t(
          'qbittorrent.speed.rateLimitOptions.description',
          'Configure what connections are affected by rate limits',
        )}
      >
        <div className="space-y-3">
          <Controller
            name="limit_utp_rate"
            control={control}
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="limit_utp_rate"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
                <Label
                  htmlFor="limit_utp_rate"
                  className="font-normal cursor-pointer"
                >
                  {t(
                    'qbittorrent.speed.limitUtpRate',
                    'Apply rate limit to µTP protocol',
                  )}
                </Label>
              </div>
            )}
          />

          <Controller
            name="limit_tcp_overhead"
            control={control}
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="limit_tcp_overhead"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
                <Label
                  htmlFor="limit_tcp_overhead"
                  className="font-normal cursor-pointer"
                >
                  {t(
                    'qbittorrent.speed.limitTcpOverhead',
                    'Apply rate limit to transport overhead',
                  )}
                </Label>
              </div>
            )}
          />

          <Controller
            name="limit_lan_peers"
            control={control}
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="limit_lan_peers"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
                <Label
                  htmlFor="limit_lan_peers"
                  className="font-normal cursor-pointer"
                >
                  {t(
                    'qbittorrent.speed.limitLanPeers',
                    'Apply rate limit to peers on LAN',
                  )}
                </Label>
              </div>
            )}
          />
        </div>
      </SettingsSection>

      {/* Scheduler Section */}
      <SettingsSection
        title={t('qbittorrent.speed.scheduler.title', 'Bandwidth Scheduler')}
        description={t(
          'qbittorrent.speed.scheduler.description',
          'Schedule alternative speed limits for specific times',
        )}
      >
        <Controller
          name="scheduler_enabled"
          control={control}
          render={({ field }) => (
            <div className="flex items-center gap-2">
              <Checkbox
                id="scheduler_enabled"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
              <Label
                htmlFor="scheduler_enabled"
                className="font-normal cursor-pointer"
              >
                {t(
                  'qbittorrent.speed.enableScheduler',
                  'Enable bandwidth scheduler',
                )}
              </Label>
            </div>
          )}
        />

        {schedulerEnabled && (
          <div className="space-y-4 ml-6 p-3 bg-muted/30 rounded-md">
            {/* Time Range */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                name="schedule_from_hour"
                control={control}
                render={({ field: hourField }) => (
                  <Controller
                    name="schedule_from_min"
                    control={control}
                    render={({ field: minField }) => (
                      <TimePicker
                        id="schedule_from"
                        label={t('qbittorrent.speed.scheduleFrom', 'From')}
                        hourValue={hourField.value}
                        minuteValue={minField.value}
                        onHourChange={hourField.onChange}
                        onMinuteChange={minField.onChange}
                      />
                    )}
                  />
                )}
              />

              <Controller
                name="schedule_to_hour"
                control={control}
                render={({ field: hourField }) => (
                  <Controller
                    name="schedule_to_min"
                    control={control}
                    render={({ field: minField }) => (
                      <TimePicker
                        id="schedule_to"
                        label={t('qbittorrent.speed.scheduleTo', 'To')}
                        hourValue={hourField.value}
                        minuteValue={minField.value}
                        onHourChange={hourField.onChange}
                        onMinuteChange={minField.onChange}
                      />
                    )}
                  />
                )}
              />
            </div>

            {/* Day Selection */}
            <div className="grid gap-2">
              <Label htmlFor="scheduler_days">
                {t('qbittorrent.speed.schedulerDays', 'When')}
              </Label>
              <Controller
                name="scheduler_days"
                control={control}
                render={({ field }) => (
                  <select
                    {...field}
                    id="scheduler_days"
                    onChange={(e) =>
                      field.onChange(parseInt(e.target.value, 10))
                    }
                    className="h-9 w-full max-w-[300px] rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] dark:bg-input/30"
                  >
                    {Object.entries(SchedulerDaysLabels).map(
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

            <p className="text-sm text-muted-foreground">
              {t(
                'qbittorrent.speed.schedulerHint',
                'Alternative rate limits will be applied during the scheduled time period.',
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
                'qbittorrent.speed.saveFailed',
                'Failed to save speed settings',
              )}
        </div>
      )}

      {/* Success Display */}
      {updatePreferences.isSuccess && (
        <div className="text-sm text-green-600 bg-green-500/10 rounded-md px-3 py-2">
          {t(
            'qbittorrent.speed.saveSuccess',
            'Speed settings saved successfully',
          )}
        </div>
      )}
    </form>
  )
}

/**
 * Speed settings tab wrapper that handles loading state
 */
export function SpeedSettingsTab() {
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
          {t('qbittorrent.speed.errorLoading', 'Failed to load speed settings')}
        </p>
        {error instanceof Error && (
          <p className="text-sm text-muted-foreground">{error.message}</p>
        )}
      </div>
    )
  }

  return <SpeedSettings preferences={preferences} />
}
