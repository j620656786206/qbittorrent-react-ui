import React from 'react'
import { useTranslation } from 'react-i18next'
import { Controller, useForm } from 'react-hook-form'
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import type {
  AppPreferences,
  AppPreferencesPayload,
  FileLogAgeType,
} from '@/types/preferences'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { usePreferences, useUpdatePreferences } from '@/hooks/use-preferences'
import { FileLogAgeTypeLabels } from '@/types/preferences'

/**
 * Form data type for Behavior settings
 * Based on AppPreferences fields related to behavior and logging configuration (~8+ parameters)
 */
type BehaviorFormData = {
  // Behavior Settings
  locale: string
  performance_warning: boolean
  confirm_torrent_deletion: boolean
  confirm_torrent_recheck: boolean
  app_instance_name: string
  refresh_interval: number

  // File Logging Settings
  file_log_enabled: boolean
  file_log_path: string
  file_log_backup_enabled: boolean
  file_log_max_size: number
  file_log_delete_old: boolean
  file_log_age: number
  file_log_age_type: FileLogAgeType
}

interface BehaviorSettingsProps {
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
 * Behavior settings form component
 * Handles ~8+ parameters for behavior and logging configuration
 */
export function BehaviorSettings({ preferences }: BehaviorSettingsProps) {
  const { t } = useTranslation()
  const updatePreferences = useUpdatePreferences()

  // Initialize form with current preferences
  const {
    control,
    handleSubmit,
    watch,
    formState: { isDirty, isSubmitting },
  } = useForm<BehaviorFormData>({
    defaultValues: {
      // Behavior Settings
      locale: preferences.locale,
      performance_warning: preferences.performance_warning,
      confirm_torrent_deletion: preferences.confirm_torrent_deletion,
      confirm_torrent_recheck: preferences.confirm_torrent_recheck,
      app_instance_name: preferences.app_instance_name,
      refresh_interval: preferences.refresh_interval,

      // File Logging Settings
      file_log_enabled: preferences.file_log_enabled,
      file_log_path: preferences.file_log_path,
      file_log_backup_enabled: preferences.file_log_backup_enabled,
      file_log_max_size: preferences.file_log_max_size,
      file_log_delete_old: preferences.file_log_delete_old,
      file_log_age: preferences.file_log_age,
      file_log_age_type: preferences.file_log_age_type,
    },
    mode: 'onBlur', // Performance optimization for large forms
  })

  // Watch values for conditional rendering
  const fileLogEnabled = watch('file_log_enabled')
  const fileLogDeleteOld = watch('file_log_delete_old')

  // Handle form submission
  const onSubmit = (data: BehaviorFormData) => {
    const payload: AppPreferencesPayload = {
      // Behavior Settings (locale is read-only in qBittorrent WebUI API)
      // Note: locale cannot be changed via API, it's controlled by qBittorrent desktop app
      confirm_torrent_deletion: data.confirm_torrent_deletion,
      confirm_torrent_recheck: data.confirm_torrent_recheck,

      // File Logging Settings
      file_log_enabled: data.file_log_enabled,
      file_log_path: data.file_log_path,
      file_log_backup_enabled: data.file_log_backup_enabled,
      file_log_max_size: data.file_log_max_size,
      file_log_delete_old: data.file_log_delete_old,
      file_log_age: data.file_log_age,
      file_log_age_type: data.file_log_age_type,
    }

    // Only include optional fields if the feature is supported
    if (preferences.performance_warning !== undefined) {
      payload.performance_warning = data.performance_warning
    }
    if (preferences.app_instance_name !== undefined) {
      payload.app_instance_name = data.app_instance_name
    }
    if (preferences.refresh_interval !== undefined) {
      payload.refresh_interval = data.refresh_interval
    }

    updatePreferences.mutate(payload)
  }

  // Check feature availability based on qBittorrent version
  const hasPerformanceWarning = preferences.performance_warning !== undefined
  const hasAppInstanceName = preferences.app_instance_name !== undefined
  const hasRefreshInterval = preferences.refresh_interval !== undefined

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Behavior Section */}
      <SettingsSection
        title={t('qbittorrent.behavior.general.title', 'General Behavior')}
        description={t(
          'qbittorrent.behavior.general.description',
          'Configure application behavior and confirmations',
        )}
      >
        {/* Locale (read-only display) */}
        <div className="grid gap-2">
          <Label htmlFor="locale">
            {t('qbittorrent.behavior.locale', 'Application Locale')}
          </Label>
          <Controller
            name="locale"
            control={control}
            render={({ field }) => (
              <Input
                {...field}
                id="locale"
                disabled
                className="max-w-[200px] bg-muted"
              />
            )}
          />
          <p className="text-xs text-muted-foreground">
            {t(
              'qbittorrent.behavior.localeHint',
              'Locale is controlled by qBittorrent desktop application settings',
            )}
          </p>
        </div>

        {/* App Instance Name (newer qBit versions) */}
        {hasAppInstanceName && (
          <div className="grid gap-2">
            <Label htmlFor="app_instance_name">
              {t(
                'qbittorrent.behavior.instanceName',
                'Application Instance Name',
              )}
            </Label>
            <Controller
              name="app_instance_name"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  id="app_instance_name"
                  placeholder={t(
                    'qbittorrent.behavior.instanceNamePlaceholder',
                    'My qBittorrent',
                  )}
                  className="max-w-[300px]"
                />
              )}
            />
            <p className="text-xs text-muted-foreground">
              {t(
                'qbittorrent.behavior.instanceNameHint',
                'Custom name to identify this qBittorrent instance (useful when running multiple instances)',
              )}
            </p>
          </div>
        )}

        {/* UI Refresh Interval (newer qBit versions) */}
        {hasRefreshInterval && (
          <div className="grid gap-2">
            <Label htmlFor="refresh_interval">
              {t(
                'qbittorrent.behavior.refreshInterval',
                'UI Refresh Interval (ms)',
              )}
            </Label>
            <Controller
              name="refresh_interval"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  id="refresh_interval"
                  type="number"
                  min={500}
                  max={30000}
                  className="max-w-[200px]"
                  onChange={(e) =>
                    field.onChange(parseInt(e.target.value, 10) || 1500)
                  }
                />
              )}
            />
            <p className="text-xs text-muted-foreground">
              {t(
                'qbittorrent.behavior.refreshIntervalHint',
                'How often to refresh torrent data (500-30000ms, default: 1500)',
              )}
            </p>
          </div>
        )}

        {/* Performance Warning (newer qBit versions) */}
        {hasPerformanceWarning && (
          <Controller
            name="performance_warning"
            control={control}
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="performance_warning"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
                <Label
                  htmlFor="performance_warning"
                  className="font-normal cursor-pointer"
                >
                  {t(
                    'qbittorrent.behavior.performanceWarning',
                    'Show performance warning on startup',
                  )}
                </Label>
              </div>
            )}
          />
        )}

        {/* Confirm Torrent Deletion */}
        <Controller
          name="confirm_torrent_deletion"
          control={control}
          render={({ field }) => (
            <div className="flex items-center gap-2">
              <Checkbox
                id="confirm_torrent_deletion"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
              <Label
                htmlFor="confirm_torrent_deletion"
                className="font-normal cursor-pointer"
              >
                {t(
                  'qbittorrent.behavior.confirmDeletion',
                  'Confirm when deleting torrents',
                )}
              </Label>
            </div>
          )}
        />

        {/* Confirm Torrent Recheck */}
        <Controller
          name="confirm_torrent_recheck"
          control={control}
          render={({ field }) => (
            <div className="flex items-center gap-2">
              <Checkbox
                id="confirm_torrent_recheck"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
              <Label
                htmlFor="confirm_torrent_recheck"
                className="font-normal cursor-pointer"
              >
                {t(
                  'qbittorrent.behavior.confirmRecheck',
                  'Confirm before rechecking torrents',
                )}
              </Label>
            </div>
          )}
        />
      </SettingsSection>

      {/* File Logging Section */}
      <SettingsSection
        title={t('qbittorrent.behavior.logging.title', 'File Logging')}
        description={t(
          'qbittorrent.behavior.logging.description',
          'Configure logging to file for troubleshooting',
        )}
      >
        <Controller
          name="file_log_enabled"
          control={control}
          render={({ field }) => (
            <div className="flex items-center gap-2">
              <Checkbox
                id="file_log_enabled"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
              <Label
                htmlFor="file_log_enabled"
                className="font-normal cursor-pointer"
              >
                {t(
                  'qbittorrent.behavior.enableFileLogging',
                  'Enable logging to file',
                )}
              </Label>
            </div>
          )}
        />

        {fileLogEnabled && (
          <div className="space-y-4 ml-6 p-3 bg-muted/30 rounded-md">
            {/* Log File Path */}
            <div className="grid gap-2">
              <Label htmlFor="file_log_path">
                {t('qbittorrent.behavior.logPath', 'Log file path')}
              </Label>
              <Controller
                name="file_log_path"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    id="file_log_path"
                    placeholder="/var/log/qbittorrent/qbittorrent.log"
                  />
                )}
              />
              <p className="text-xs text-muted-foreground">
                {t(
                  'qbittorrent.behavior.logPathHint',
                  'Full path where log files will be saved',
                )}
              </p>
            </div>

            {/* Log Backup */}
            <Controller
              name="file_log_backup_enabled"
              control={control}
              render={({ field }) => (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="file_log_backup_enabled"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                  <Label
                    htmlFor="file_log_backup_enabled"
                    className="font-normal cursor-pointer"
                  >
                    {t(
                      'qbittorrent.behavior.logBackup',
                      'Enable log file backup',
                    )}
                  </Label>
                </div>
              )}
            />

            {/* Max Log Size */}
            <div className="grid gap-2">
              <Label htmlFor="file_log_max_size">
                {t(
                  'qbittorrent.behavior.maxLogSize',
                  'Maximum log file size (KB)',
                )}
              </Label>
              <Controller
                name="file_log_max_size"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    id="file_log_max_size"
                    type="number"
                    min={1}
                    max={100000}
                    className="max-w-[200px]"
                    onChange={(e) =>
                      field.onChange(parseInt(e.target.value, 10) || 65)
                    }
                  />
                )}
              />
              <p className="text-xs text-muted-foreground">
                {t(
                  'qbittorrent.behavior.maxLogSizeHint',
                  'Log file will be rotated when it exceeds this size',
                )}
              </p>
            </div>

            {/* Delete Old Logs */}
            <Controller
              name="file_log_delete_old"
              control={control}
              render={({ field }) => (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="file_log_delete_old"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                  <Label
                    htmlFor="file_log_delete_old"
                    className="font-normal cursor-pointer"
                  >
                    {t(
                      'qbittorrent.behavior.deleteOldLogs',
                      'Delete old log files',
                    )}
                  </Label>
                </div>
              )}
            />

            {fileLogDeleteOld && (
              <div className="space-y-4 ml-6 p-3 bg-muted/30 rounded-md">
                {/* Log Age */}
                <div className="flex items-center gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="file_log_age">
                      {t(
                        'qbittorrent.behavior.logAge',
                        'Delete logs older than',
                      )}
                    </Label>
                    <div className="flex items-center gap-2">
                      <Controller
                        name="file_log_age"
                        control={control}
                        render={({ field }) => (
                          <Input
                            {...field}
                            id="file_log_age"
                            type="number"
                            min={1}
                            max={365}
                            className="w-[100px]"
                            onChange={(e) =>
                              field.onChange(parseInt(e.target.value, 10) || 1)
                            }
                          />
                        )}
                      />
                      <Controller
                        name="file_log_age_type"
                        control={control}
                        render={({ field }) => (
                          <select
                            {...field}
                            id="file_log_age_type"
                            onChange={(e) =>
                              field.onChange(
                                parseInt(e.target.value, 10) as FileLogAgeType,
                              )
                            }
                            className="h-9 w-[120px] rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] dark:bg-input/30"
                          >
                            {Object.entries(FileLogAgeTypeLabels).map(
                              ([value, labelKey]) => (
                                <option key={value} value={value}>
                                  {t(labelKey, String(value))}
                                </option>
                              ),
                            )}
                          </select>
                        )}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
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
                'qbittorrent.behavior.saveFailed',
                'Failed to save behavior settings',
              )}
        </div>
      )}

      {/* Success Display */}
      {updatePreferences.isSuccess && (
        <div className="text-sm text-green-600 bg-green-500/10 rounded-md px-3 py-2">
          {t(
            'qbittorrent.behavior.saveSuccess',
            'Behavior settings saved successfully',
          )}
        </div>
      )}
    </form>
  )
}

/**
 * Behavior settings tab wrapper that handles loading state
 */
export function BehaviorSettingsTab() {
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
            'qbittorrent.behavior.errorLoading',
            'Failed to load behavior settings',
          )}
        </p>
        {error instanceof Error && (
          <p className="text-sm text-muted-foreground">{error.message}</p>
        )}
      </div>
    )
  }

  return <BehaviorSettings preferences={preferences} />
}
