import React from 'react'
import { useTranslation } from 'react-i18next'
import { Controller, useForm } from 'react-hook-form'
import { ChevronDown, ChevronRight, Loader2, Plus, Trash2 } from 'lucide-react'
import type { AppPreferences, AppPreferencesPayload, ScanDirs } from '@/types/preferences'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { usePreferences, useUpdatePreferences } from '@/hooks/use-preferences'
import { ContentLayoutLabels, TorrentStopConditionLabels } from '@/types/preferences'

/**
 * Form data type for Downloads settings
 * Based on AppPreferences fields related to downloads
 */
type DownloadsFormData = {
  // Adding Torrents
  torrent_content_layout: string
  add_to_top_of_queue: boolean
  add_stopped_enabled: boolean
  torrent_stop_condition: string
  merge_trackers: boolean
  auto_delete_mode: number
  preallocate_all: boolean
  incomplete_files_ext: boolean
  use_unwanted_folder: boolean

  // Saving Management
  auto_tmm_enabled: boolean
  torrent_changed_tmm_enabled: boolean
  save_path_changed_tmm_enabled: boolean
  category_changed_tmm_enabled: boolean
  save_path: string
  temp_path_enabled: boolean
  temp_path: string
  use_category_paths_in_manual_mode: boolean
  export_dir: string
  export_dir_fin: string
  excluded_file_names_enabled: boolean
  excluded_file_names: string

  // Email Notifications
  mail_notification_enabled: boolean
  mail_notification_sender: string
  mail_notification_email: string
  mail_notification_smtp: string
  mail_notification_ssl_enabled: boolean
  mail_notification_auth_enabled: boolean
  mail_notification_username: string
  mail_notification_password: string

  // External Programs
  autorun_on_torrent_added_enabled: boolean
  autorun_on_torrent_added_program: string
  autorun_enabled: boolean
  autorun_program: string
}

interface DownloadsSettingsProps {
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
 * Scan directories manager component
 */
function ScanDirsManager({
  value,
  onChange,
}: {
  value: ScanDirs
  onChange: (dirs: ScanDirs) => void
}) {
  const { t } = useTranslation()
  const [newPath, setNewPath] = React.useState('')
  const [newDownloadType, setNewDownloadType] = React.useState<string>('0')

  const entries = Object.entries(value)

  const handleAdd = () => {
    if (!newPath.trim()) return
    const downloadType = newDownloadType === '0' ? 0 : newDownloadType === '1' ? 1 : newDownloadType
    onChange({
      ...value,
      [newPath.trim()]: downloadType,
    })
    setNewPath('')
    setNewDownloadType('0')
  }

  const handleRemove = (path: string) => {
    const newDirs = { ...value }
    delete newDirs[path]
    onChange(newDirs)
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {entries.map(([path, downloadType]) => (
          <div key={path} className="flex items-center gap-2 p-2 bg-muted/50 rounded-md">
            <span className="flex-1 text-sm font-mono truncate" title={path}>
              {path}
            </span>
            <span className="text-xs text-muted-foreground">
              {downloadType === 0
                ? t('qbittorrent.downloads.scanDirs.defaultPath', 'Default')
                : downloadType === 1
                  ? t('qbittorrent.downloads.scanDirs.monitoredFolder', 'Monitored')
                  : downloadType}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => handleRemove(path)}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        {entries.length === 0 && (
          <p className="text-sm text-muted-foreground italic">
            {t('qbittorrent.downloads.scanDirs.empty', 'No monitored folders configured')}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <Input
          value={newPath}
          onChange={(e) => setNewPath(e.target.value)}
          placeholder={t('qbittorrent.downloads.scanDirs.placeholder', '/path/to/watch')}
          className="flex-1"
        />
        <select
          value={newDownloadType}
          onChange={(e) => setNewDownloadType(e.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] dark:bg-input/30"
        >
          <option value="0">{t('qbittorrent.downloads.scanDirs.defaultPath', 'Default')}</option>
          <option value="1">{t('qbittorrent.downloads.scanDirs.monitoredFolder', 'Monitored')}</option>
        </select>
        <Button type="button" variant="outline" size="icon" onClick={handleAdd}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

/**
 * Downloads settings form component
 * Handles ~30 parameters for torrent downloading configuration
 */
export function DownloadsSettings({ preferences }: DownloadsSettingsProps) {
  const { t } = useTranslation()
  const updatePreferences = useUpdatePreferences()
  const [scanDirs, setScanDirs] = React.useState<ScanDirs>(preferences.scan_dirs)

  // Initialize form with current preferences
  const { control, handleSubmit, watch, formState: { isDirty, isSubmitting } } = useForm<DownloadsFormData>({
    defaultValues: {
      // Adding Torrents
      torrent_content_layout: preferences.torrent_content_layout,
      add_to_top_of_queue: preferences.add_to_top_of_queue,
      add_stopped_enabled: preferences.add_stopped_enabled,
      torrent_stop_condition: preferences.torrent_stop_condition,
      merge_trackers: preferences.merge_trackers,
      auto_delete_mode: preferences.auto_delete_mode,
      preallocate_all: preferences.preallocate_all,
      incomplete_files_ext: preferences.incomplete_files_ext,
      use_unwanted_folder: preferences.use_unwanted_folder,

      // Saving Management
      auto_tmm_enabled: preferences.auto_tmm_enabled,
      torrent_changed_tmm_enabled: preferences.torrent_changed_tmm_enabled,
      save_path_changed_tmm_enabled: preferences.save_path_changed_tmm_enabled,
      category_changed_tmm_enabled: preferences.category_changed_tmm_enabled,
      save_path: preferences.save_path,
      temp_path_enabled: preferences.temp_path_enabled,
      temp_path: preferences.temp_path,
      use_category_paths_in_manual_mode: preferences.use_category_paths_in_manual_mode,
      export_dir: preferences.export_dir,
      export_dir_fin: preferences.export_dir_fin,
      excluded_file_names_enabled: preferences.excluded_file_names_enabled,
      excluded_file_names: preferences.excluded_file_names,

      // Email Notifications
      mail_notification_enabled: preferences.mail_notification_enabled,
      mail_notification_sender: preferences.mail_notification_sender,
      mail_notification_email: preferences.mail_notification_email,
      mail_notification_smtp: preferences.mail_notification_smtp,
      mail_notification_ssl_enabled: preferences.mail_notification_ssl_enabled,
      mail_notification_auth_enabled: preferences.mail_notification_auth_enabled,
      mail_notification_username: preferences.mail_notification_username,
      mail_notification_password: '', // Write-only field, don't populate

      // External Programs
      autorun_on_torrent_added_enabled: preferences.autorun_on_torrent_added_enabled,
      autorun_on_torrent_added_program: preferences.autorun_on_torrent_added_program,
      autorun_enabled: preferences.autorun_enabled,
      autorun_program: preferences.autorun_program,
    },
    mode: 'onBlur', // Performance optimization for large forms
  })

  // Watch values for conditional rendering
  const autoTmmEnabled = watch('auto_tmm_enabled')
  const tempPathEnabled = watch('temp_path_enabled')
  const mailNotificationEnabled = watch('mail_notification_enabled')
  const mailAuthEnabled = watch('mail_notification_auth_enabled')
  const autorunOnAddedEnabled = watch('autorun_on_torrent_added_enabled')
  const autorunEnabled = watch('autorun_enabled')
  const excludedFileNamesEnabled = watch('excluded_file_names_enabled')

  // Handle form submission
  const onSubmit = (data: DownloadsFormData) => {
    const payload: AppPreferencesPayload = {
      ...data,
      scan_dirs: scanDirs,
      // Only include password if it was changed
      mail_notification_password: data.mail_notification_password || undefined,
    }

    // Remove empty password if not changed
    if (!data.mail_notification_password) {
      delete payload.mail_notification_password
    }

    updatePreferences.mutate(payload)
  }

  const hasScanDirsChanges = JSON.stringify(scanDirs) !== JSON.stringify(preferences.scan_dirs)

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Adding Torrents Section */}
      <SettingsSection
        title={t('qbittorrent.downloads.addingTorrents.title', 'Adding Torrents')}
        description={t('qbittorrent.downloads.addingTorrents.description', 'Configure how new torrents are added')}
      >
        {/* Content Layout */}
        <div className="grid gap-2">
          <Label htmlFor="torrent_content_layout">
            {t('qbittorrent.downloads.contentLayout', 'Torrent content layout')}
          </Label>
          <Controller
            name="torrent_content_layout"
            control={control}
            render={({ field }) => (
              <select
                {...field}
                id="torrent_content_layout"
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] dark:bg-input/30"
              >
                {Object.entries(ContentLayoutLabels).map(([value, labelKey]) => (
                  <option key={value} value={value}>
                    {t(labelKey, value)}
                  </option>
                ))}
              </select>
            )}
          />
        </div>

        {/* Stop Condition */}
        <div className="grid gap-2">
          <Label htmlFor="torrent_stop_condition">
            {t('qbittorrent.downloads.stopCondition', 'Torrent stop condition')}
          </Label>
          <Controller
            name="torrent_stop_condition"
            control={control}
            render={({ field }) => (
              <select
                {...field}
                id="torrent_stop_condition"
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] dark:bg-input/30"
              >
                {Object.entries(TorrentStopConditionLabels).map(([value, labelKey]) => (
                  <option key={value} value={value}>
                    {t(labelKey, value)}
                  </option>
                ))}
              </select>
            )}
          />
        </div>

        {/* Checkboxes */}
        <div className="space-y-3">
          <Controller
            name="add_to_top_of_queue"
            control={control}
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="add_to_top_of_queue"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
                <Label htmlFor="add_to_top_of_queue" className="font-normal cursor-pointer">
                  {t('qbittorrent.downloads.addToTopOfQueue', 'Add torrents to top of queue')}
                </Label>
              </div>
            )}
          />

          <Controller
            name="add_stopped_enabled"
            control={control}
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="add_stopped_enabled"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
                <Label htmlFor="add_stopped_enabled" className="font-normal cursor-pointer">
                  {t('qbittorrent.downloads.addStopped', 'Do not start the download automatically')}
                </Label>
              </div>
            )}
          />

          <Controller
            name="merge_trackers"
            control={control}
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="merge_trackers"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
                <Label htmlFor="merge_trackers" className="font-normal cursor-pointer">
                  {t('qbittorrent.downloads.mergeTrackers', 'Merge trackers to existing torrent when adding duplicate')}
                </Label>
              </div>
            )}
          />

          <Controller
            name="preallocate_all"
            control={control}
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="preallocate_all"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
                <Label htmlFor="preallocate_all" className="font-normal cursor-pointer">
                  {t('qbittorrent.downloads.preallocateAll', 'Pre-allocate disk space for all files')}
                </Label>
              </div>
            )}
          />

          <Controller
            name="incomplete_files_ext"
            control={control}
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="incomplete_files_ext"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
                <Label htmlFor="incomplete_files_ext" className="font-normal cursor-pointer">
                  {t('qbittorrent.downloads.incompleteFilesExt', 'Append .!qB extension to incomplete files')}
                </Label>
              </div>
            )}
          />

          <Controller
            name="use_unwanted_folder"
            control={control}
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="use_unwanted_folder"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
                <Label htmlFor="use_unwanted_folder" className="font-normal cursor-pointer">
                  {t('qbittorrent.downloads.useUnwantedFolder', 'Use separate folder for unwanted files')}
                </Label>
              </div>
            )}
          />
        </div>
      </SettingsSection>

      {/* Saving Management Section */}
      <SettingsSection
        title={t('qbittorrent.downloads.savingManagement.title', 'Saving Management')}
        description={t('qbittorrent.downloads.savingManagement.description', 'Configure save paths and automatic management')}
      >
        {/* Default Save Path */}
        <div className="grid gap-2">
          <Label htmlFor="save_path">
            {t('qbittorrent.downloads.defaultSavePath', 'Default save path')}
          </Label>
          <Controller
            name="save_path"
            control={control}
            render={({ field }) => (
              <Input
                {...field}
                id="save_path"
                placeholder="/downloads"
              />
            )}
          />
        </div>

        {/* Incomplete Downloads Path */}
        <Controller
          name="temp_path_enabled"
          control={control}
          render={({ field }) => (
            <div className="flex items-center gap-2">
              <Checkbox
                id="temp_path_enabled"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
              <Label htmlFor="temp_path_enabled" className="font-normal cursor-pointer">
                {t('qbittorrent.downloads.keepIncompleteIn', 'Keep incomplete torrents in:')}
              </Label>
            </div>
          )}
        />

        {tempPathEnabled && (
          <div className="grid gap-2 ml-6">
            <Controller
              name="temp_path"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  id="temp_path"
                  placeholder="/downloads/incomplete"
                />
              )}
            />
          </div>
        )}

        {/* Automatic Torrent Management */}
        <Controller
          name="auto_tmm_enabled"
          control={control}
          render={({ field }) => (
            <div className="flex items-center gap-2">
              <Checkbox
                id="auto_tmm_enabled"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
              <Label htmlFor="auto_tmm_enabled" className="font-normal cursor-pointer">
                {t('qbittorrent.downloads.autoTmm', 'Enable Automatic Torrent Management (ATM)')}
              </Label>
            </div>
          )}
        />

        {autoTmmEnabled && (
          <div className="space-y-3 ml-6 p-3 bg-muted/30 rounded-md">
            <Controller
              name="torrent_changed_tmm_enabled"
              control={control}
              render={({ field }) => (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="torrent_changed_tmm_enabled"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                  <Label htmlFor="torrent_changed_tmm_enabled" className="font-normal cursor-pointer text-sm">
                    {t('qbittorrent.downloads.relocateOnCategoryChange', 'Relocate torrent when category changes')}
                  </Label>
                </div>
              )}
            />

            <Controller
              name="save_path_changed_tmm_enabled"
              control={control}
              render={({ field }) => (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="save_path_changed_tmm_enabled"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                  <Label htmlFor="save_path_changed_tmm_enabled" className="font-normal cursor-pointer text-sm">
                    {t('qbittorrent.downloads.relocateOnDefaultSavePathChange', 'Relocate torrent when default save path changes')}
                  </Label>
                </div>
              )}
            />

            <Controller
              name="category_changed_tmm_enabled"
              control={control}
              render={({ field }) => (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="category_changed_tmm_enabled"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                  <Label htmlFor="category_changed_tmm_enabled" className="font-normal cursor-pointer text-sm">
                    {t('qbittorrent.downloads.relocateOnCategorySavePathChange', "Relocate torrent when category's save path changes")}
                  </Label>
                </div>
              )}
            />
          </div>
        )}

        <Controller
          name="use_category_paths_in_manual_mode"
          control={control}
          render={({ field }) => (
            <div className="flex items-center gap-2">
              <Checkbox
                id="use_category_paths_in_manual_mode"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
              <Label htmlFor="use_category_paths_in_manual_mode" className="font-normal cursor-pointer">
                {t('qbittorrent.downloads.useCategoryPathsInManualMode', 'Use category paths in manual mode')}
              </Label>
            </div>
          )}
        />

        {/* Export Paths */}
        <div className="grid gap-2">
          <Label htmlFor="export_dir">
            {t('qbittorrent.downloads.copyTorrentFilesTo', 'Copy .torrent files to:')}
          </Label>
          <Controller
            name="export_dir"
            control={control}
            render={({ field }) => (
              <Input
                {...field}
                id="export_dir"
                placeholder={t('qbittorrent.downloads.leaveEmptyToDisable', 'Leave empty to disable')}
              />
            )}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="export_dir_fin">
            {t('qbittorrent.downloads.copyTorrentFilesFinishedTo', 'Copy .torrent files for finished downloads to:')}
          </Label>
          <Controller
            name="export_dir_fin"
            control={control}
            render={({ field }) => (
              <Input
                {...field}
                id="export_dir_fin"
                placeholder={t('qbittorrent.downloads.leaveEmptyToDisable', 'Leave empty to disable')}
              />
            )}
          />
        </div>

        {/* Excluded File Names */}
        <Controller
          name="excluded_file_names_enabled"
          control={control}
          render={({ field }) => (
            <div className="flex items-center gap-2">
              <Checkbox
                id="excluded_file_names_enabled"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
              <Label htmlFor="excluded_file_names_enabled" className="font-normal cursor-pointer">
                {t('qbittorrent.downloads.excludeFileNames', 'Exclude files by name patterns')}
              </Label>
            </div>
          )}
        />

        {excludedFileNamesEnabled && (
          <div className="grid gap-2 ml-6">
            <Controller
              name="excluded_file_names"
              control={control}
              render={({ field }) => (
                <Textarea
                  {...field}
                  id="excluded_file_names"
                  placeholder={t('qbittorrent.downloads.excludedFileNamesPlaceholder', '*.txt\n*.nfo\nSample/*')}
                  rows={4}
                  className="font-mono text-sm"
                />
              )}
            />
            <p className="text-xs text-muted-foreground">
              {t('qbittorrent.downloads.excludedFileNamesHint', 'One pattern per line. Supports wildcards.')}
            </p>
          </div>
        )}
      </SettingsSection>

      {/* Monitored Folders Section */}
      <SettingsSection
        title={t('qbittorrent.downloads.monitoredFolders.title', 'Monitored Folders')}
        description={t('qbittorrent.downloads.monitoredFolders.description', 'Automatically add torrents from watched folders')}
        defaultOpen={false}
      >
        <ScanDirsManager value={scanDirs} onChange={setScanDirs} />
      </SettingsSection>

      {/* Email Notifications Section */}
      <SettingsSection
        title={t('qbittorrent.downloads.emailNotifications.title', 'Email Notifications')}
        description={t('qbittorrent.downloads.emailNotifications.description', 'Send email when torrent completes')}
        defaultOpen={false}
      >
        <Controller
          name="mail_notification_enabled"
          control={control}
          render={({ field }) => (
            <div className="flex items-center gap-2">
              <Checkbox
                id="mail_notification_enabled"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
              <Label htmlFor="mail_notification_enabled" className="font-normal cursor-pointer">
                {t('qbittorrent.downloads.enableEmailNotification', 'Enable email notification upon download completion')}
              </Label>
            </div>
          )}
        />

        {mailNotificationEnabled && (
          <div className="space-y-4 ml-6">
            <div className="grid gap-2">
              <Label htmlFor="mail_notification_sender">
                {t('qbittorrent.downloads.emailFrom', 'From')}
              </Label>
              <Controller
                name="mail_notification_sender"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    id="mail_notification_sender"
                    type="email"
                    placeholder="sender@example.com"
                  />
                )}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="mail_notification_email">
                {t('qbittorrent.downloads.emailTo', 'To')}
              </Label>
              <Controller
                name="mail_notification_email"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    id="mail_notification_email"
                    type="email"
                    placeholder="recipient@example.com"
                  />
                )}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="mail_notification_smtp">
                {t('qbittorrent.downloads.smtpServer', 'SMTP server')}
              </Label>
              <Controller
                name="mail_notification_smtp"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    id="mail_notification_smtp"
                    placeholder="smtp.example.com"
                  />
                )}
              />
            </div>

            <Controller
              name="mail_notification_ssl_enabled"
              control={control}
              render={({ field }) => (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="mail_notification_ssl_enabled"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                  <Label htmlFor="mail_notification_ssl_enabled" className="font-normal cursor-pointer">
                    {t('qbittorrent.downloads.useSsl', 'Use SSL for SMTP connection')}
                  </Label>
                </div>
              )}
            />

            <Controller
              name="mail_notification_auth_enabled"
              control={control}
              render={({ field }) => (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="mail_notification_auth_enabled"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                  <Label htmlFor="mail_notification_auth_enabled" className="font-normal cursor-pointer">
                    {t('qbittorrent.downloads.smtpAuth', 'SMTP authentication required')}
                  </Label>
                </div>
              )}
            />

            {mailAuthEnabled && (
              <div className="space-y-4 ml-6">
                <div className="grid gap-2">
                  <Label htmlFor="mail_notification_username">
                    {t('qbittorrent.downloads.smtpUsername', 'Username')}
                  </Label>
                  <Controller
                    name="mail_notification_username"
                    control={control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        id="mail_notification_username"
                      />
                    )}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="mail_notification_password">
                    {t('qbittorrent.downloads.smtpPassword', 'Password')}
                  </Label>
                  <Controller
                    name="mail_notification_password"
                    control={control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        id="mail_notification_password"
                        type="password"
                        placeholder={t('qbittorrent.downloads.passwordPlaceholder', 'Enter to change')}
                      />
                    )}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </SettingsSection>

      {/* External Programs Section */}
      <SettingsSection
        title={t('qbittorrent.downloads.externalPrograms.title', 'Run External Program')}
        description={t('qbittorrent.downloads.externalPrograms.description', 'Run commands when torrents are added or completed')}
        defaultOpen={false}
      >
        <Controller
          name="autorun_on_torrent_added_enabled"
          control={control}
          render={({ field }) => (
            <div className="flex items-center gap-2">
              <Checkbox
                id="autorun_on_torrent_added_enabled"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
              <Label htmlFor="autorun_on_torrent_added_enabled" className="font-normal cursor-pointer">
                {t('qbittorrent.downloads.runOnAdded', 'Run external program on torrent added')}
              </Label>
            </div>
          )}
        />

        {autorunOnAddedEnabled && (
          <div className="grid gap-2 ml-6">
            <Controller
              name="autorun_on_torrent_added_program"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  id="autorun_on_torrent_added_program"
                  placeholder="/path/to/script.sh %N"
                  className="font-mono text-sm"
                />
              )}
            />
          </div>
        )}

        <Controller
          name="autorun_enabled"
          control={control}
          render={({ field }) => (
            <div className="flex items-center gap-2">
              <Checkbox
                id="autorun_enabled"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
              <Label htmlFor="autorun_enabled" className="font-normal cursor-pointer">
                {t('qbittorrent.downloads.runOnFinished', 'Run external program on torrent finished')}
              </Label>
            </div>
          )}
        />

        {autorunEnabled && (
          <div className="grid gap-2 ml-6">
            <Controller
              name="autorun_program"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  id="autorun_program"
                  placeholder="/path/to/script.sh %N"
                  className="font-mono text-sm"
                />
              )}
            />
          </div>
        )}

        <div className="p-3 bg-muted/50 rounded-md text-sm">
          <p className="font-medium mb-2">
            {t('qbittorrent.downloads.supportedParameters', 'Supported parameters:')}
          </p>
          <ul className="space-y-1 text-muted-foreground text-xs font-mono">
            <li>%N - {t('qbittorrent.downloads.paramTorrentName', 'Torrent name')}</li>
            <li>%L - {t('qbittorrent.downloads.paramCategory', 'Category')}</li>
            <li>%G - {t('qbittorrent.downloads.paramTags', 'Tags (comma-separated)')}</li>
            <li>%F - {t('qbittorrent.downloads.paramContentPath', 'Content path')}</li>
            <li>%R - {t('qbittorrent.downloads.paramRootPath', 'Root path')}</li>
            <li>%D - {t('qbittorrent.downloads.paramSavePath', 'Save path')}</li>
            <li>%C - {t('qbittorrent.downloads.paramFileCount', 'Number of files')}</li>
            <li>%Z - {t('qbittorrent.downloads.paramTorrentSize', 'Torrent size (bytes)')}</li>
            <li>%T - {t('qbittorrent.downloads.paramCurrentTracker', 'Current tracker')}</li>
            <li>%I - {t('qbittorrent.downloads.paramHash', 'Info hash (v1)')}</li>
            <li>%J - {t('qbittorrent.downloads.paramHashV2', 'Info hash (v2)')}</li>
            <li>%K - {t('qbittorrent.downloads.paramTorrentId', 'Torrent ID')}</li>
          </ul>
        </div>
      </SettingsSection>

      {/* Save Button */}
      <div className="flex justify-end pt-4 border-t">
        <Button
          type="submit"
          disabled={(!isDirty && !hasScanDirsChanges) || isSubmitting || updatePreferences.isPending}
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
            : t('qbittorrent.downloads.saveFailed', 'Failed to save settings')}
        </div>
      )}

      {/* Success Display */}
      {updatePreferences.isSuccess && (
        <div className="text-sm text-green-600 bg-green-500/10 rounded-md px-3 py-2">
          {t('qbittorrent.downloads.saveSuccess', 'Settings saved successfully')}
        </div>
      )}
    </form>
  )
}

/**
 * Downloads settings tab wrapper that handles loading state
 */
export function DownloadsSettingsTab() {
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
          {t('qbittorrent.downloads.errorLoading', 'Failed to load downloads settings')}
        </p>
        {error instanceof Error && (
          <p className="text-sm text-muted-foreground">{error.message}</p>
        )}
      </div>
    )
  }

  return <DownloadsSettings preferences={preferences} />
}
