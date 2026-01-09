import React from 'react'
import { useTranslation } from 'react-i18next'
import { Controller, useForm } from 'react-hook-form'
import { AlertTriangle, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import type {
  AppPreferences,
  AppPreferencesPayload,
  DiskIOReadWriteMode,
  DiskIOType,
  ResumeDataStorageType,
  TorrentContentRemoveOption,
  UploadChokingAlgorithm,
  UploadSlotsBehavior,
  UtpTcpMixedMode,
} from '@/types/preferences'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { usePreferences, useUpdatePreferences } from '@/hooks/use-preferences'
import {
  DiskIOReadWriteModeLabels,
  DiskIOTypeLabels,
  ResumeDataStorageTypeLabels,
  TorrentContentRemoveOptionLabels,
  UploadChokingAlgorithmLabels,
  UploadSlotsBehaviorLabels,
  UtpTcpMixedModeLabels,
} from '@/types/preferences'

/**
 * Form data type for Advanced settings
 * Based on AppPreferences fields related to advanced qBittorrent and libtorrent configuration (~70+ parameters)
 */
type AdvancedFormData = {
  // qBittorrent Settings
  resume_data_storage_type: string
  torrent_content_remove_option: string
  memory_working_set_limit: number
  current_network_interface: string
  current_interface_address: string
  save_resume_data_interval: number
  save_statistics_interval: number
  torrent_file_size_limit: number
  recheck_completed_torrents: boolean
  resolve_peer_countries: boolean
  reannounce_when_address_changed: boolean
  enable_embedded_tracker: boolean
  embedded_tracker_port: number
  embedded_tracker_port_forwarding: boolean
  mark_of_the_web: boolean
  ignore_ssl_errors: boolean
  python_executable_path: string

  // Libtorrent - Limits
  bdecode_depth_limit: number
  bdecode_token_limit: number

  // Libtorrent - Threading
  async_io_threads: number
  hashing_threads: number
  file_pool_size: number
  checking_memory_use: number

  // Libtorrent - Disk Cache
  disk_cache: number
  disk_cache_ttl: number
  disk_queue_size: number
  disk_io_type: number
  disk_io_read_mode: number
  disk_io_write_mode: number
  enable_coalesce_read_write: boolean
  enable_piece_extent_affinity: boolean

  // Libtorrent - Network Buffers
  send_buffer_watermark: number
  send_buffer_low_watermark: number
  send_buffer_watermark_factor: number
  socket_send_buffer_size: number
  socket_receive_buffer_size: number
  socket_backlog_size: number

  // Libtorrent - Connections
  connection_speed: number
  outgoing_ports_min: number
  outgoing_ports_max: number
  upnp_lease_duration: number
  peer_tos: number
  utp_tcp_mixed_mode: number
  enable_multi_connections_from_same_ip: boolean
  validate_https_tracker_certificate: boolean
  ssrf_mitigation: boolean
  block_peers_on_privileged_ports: boolean
  hostname_cache_ttl: number
  idn_support_enabled: boolean

  // Libtorrent - Upload/Choking
  upload_slots_behavior: number
  upload_choking_algorithm: number
  enable_upload_suggestions: boolean

  // Libtorrent - Trackers
  announce_to_all_trackers: boolean
  announce_to_all_tiers: boolean
  announce_ip: string
  announce_port: number
  max_concurrent_http_announces: number
  stop_tracker_timeout: number

  // Libtorrent - Peers
  peer_turnover: number
  peer_turnover_cutoff: number
  peer_turnover_interval: number
  request_queue_size: number

  // Libtorrent - DHT
  dht_bootstrap_nodes: string
}

interface AdvancedSettingsProps {
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
 * Advanced settings form component
 * Handles ~70+ parameters for advanced qBittorrent and libtorrent configuration
 */
export function AdvancedSettings({ preferences }: AdvancedSettingsProps) {
  const { t } = useTranslation()
  const updatePreferences = useUpdatePreferences()

  // Initialize form with current preferences
  const {
    control,
    handleSubmit,
    formState: { isDirty, isSubmitting },
  } = useForm<AdvancedFormData>({
    defaultValues: {
      // qBittorrent Settings
      resume_data_storage_type: preferences.resume_data_storage_type,
      torrent_content_remove_option: preferences.torrent_content_remove_option,
      memory_working_set_limit: preferences.memory_working_set_limit,
      current_network_interface: preferences.current_network_interface,
      current_interface_address: preferences.current_interface_address,
      save_resume_data_interval: preferences.save_resume_data_interval,
      save_statistics_interval: preferences.save_statistics_interval,
      torrent_file_size_limit: preferences.torrent_file_size_limit,
      recheck_completed_torrents: preferences.recheck_completed_torrents,
      resolve_peer_countries: preferences.resolve_peer_countries,
      reannounce_when_address_changed:
        preferences.reannounce_when_address_changed,
      enable_embedded_tracker: preferences.enable_embedded_tracker,
      embedded_tracker_port: preferences.embedded_tracker_port,
      embedded_tracker_port_forwarding:
        preferences.embedded_tracker_port_forwarding,
      mark_of_the_web: preferences.mark_of_the_web,
      ignore_ssl_errors: preferences.ignore_ssl_errors,
      python_executable_path: preferences.python_executable_path,

      // Libtorrent - Limits
      bdecode_depth_limit: preferences.bdecode_depth_limit,
      bdecode_token_limit: preferences.bdecode_token_limit,

      // Libtorrent - Threading
      async_io_threads: preferences.async_io_threads,
      hashing_threads: preferences.hashing_threads,
      file_pool_size: preferences.file_pool_size,
      checking_memory_use: preferences.checking_memory_use,

      // Libtorrent - Disk Cache
      disk_cache: preferences.disk_cache,
      disk_cache_ttl: preferences.disk_cache_ttl,
      disk_queue_size: preferences.disk_queue_size,
      disk_io_type: preferences.disk_io_type,
      disk_io_read_mode: preferences.disk_io_read_mode,
      disk_io_write_mode: preferences.disk_io_write_mode,
      enable_coalesce_read_write: preferences.enable_coalesce_read_write,
      enable_piece_extent_affinity: preferences.enable_piece_extent_affinity,

      // Libtorrent - Network Buffers
      send_buffer_watermark: preferences.send_buffer_watermark,
      send_buffer_low_watermark: preferences.send_buffer_low_watermark,
      send_buffer_watermark_factor: preferences.send_buffer_watermark_factor,
      socket_send_buffer_size: preferences.socket_send_buffer_size,
      socket_receive_buffer_size: preferences.socket_receive_buffer_size,
      socket_backlog_size: preferences.socket_backlog_size,

      // Libtorrent - Connections
      connection_speed: preferences.connection_speed,
      outgoing_ports_min: preferences.outgoing_ports_min,
      outgoing_ports_max: preferences.outgoing_ports_max,
      upnp_lease_duration: preferences.upnp_lease_duration,
      peer_tos: preferences.peer_tos,
      utp_tcp_mixed_mode: preferences.utp_tcp_mixed_mode,
      enable_multi_connections_from_same_ip:
        preferences.enable_multi_connections_from_same_ip,
      validate_https_tracker_certificate:
        preferences.validate_https_tracker_certificate,
      ssrf_mitigation: preferences.ssrf_mitigation,
      block_peers_on_privileged_ports:
        preferences.block_peers_on_privileged_ports,
      hostname_cache_ttl: preferences.hostname_cache_ttl,
      idn_support_enabled: preferences.idn_support_enabled,

      // Libtorrent - Upload/Choking
      upload_slots_behavior: preferences.upload_slots_behavior,
      upload_choking_algorithm: preferences.upload_choking_algorithm,
      enable_upload_suggestions: preferences.enable_upload_suggestions,

      // Libtorrent - Trackers
      announce_to_all_trackers: preferences.announce_to_all_trackers,
      announce_to_all_tiers: preferences.announce_to_all_tiers,
      announce_ip: preferences.announce_ip,
      announce_port: preferences.announce_port,
      max_concurrent_http_announces: preferences.max_concurrent_http_announces,
      stop_tracker_timeout: preferences.stop_tracker_timeout,

      // Libtorrent - Peers
      peer_turnover: preferences.peer_turnover,
      peer_turnover_cutoff: preferences.peer_turnover_cutoff,
      peer_turnover_interval: preferences.peer_turnover_interval,
      request_queue_size: preferences.request_queue_size,

      // Libtorrent - DHT
      dht_bootstrap_nodes: preferences.dht_bootstrap_nodes,
    },
    mode: 'onBlur', // Performance optimization for large forms
  })

  // Handle form submission
  const onSubmit = (data: AdvancedFormData) => {
    const payload: AppPreferencesPayload = {
      // qBittorrent Settings
      current_network_interface: data.current_network_interface,
      current_interface_address: data.current_interface_address,
      save_resume_data_interval: data.save_resume_data_interval,
      recheck_completed_torrents: data.recheck_completed_torrents,
      resolve_peer_countries: data.resolve_peer_countries,
      enable_embedded_tracker: data.enable_embedded_tracker,
      embedded_tracker_port: data.embedded_tracker_port,

      // Libtorrent - Threading
      async_io_threads: data.async_io_threads,
      file_pool_size: data.file_pool_size,
      checking_memory_use: data.checking_memory_use,

      // Libtorrent - Disk Cache
      disk_cache: data.disk_cache,
      disk_cache_ttl: data.disk_cache_ttl,
      enable_coalesce_read_write: data.enable_coalesce_read_write,

      // Libtorrent - Network Buffers
      send_buffer_watermark: data.send_buffer_watermark,
      send_buffer_low_watermark: data.send_buffer_low_watermark,
      send_buffer_watermark_factor: data.send_buffer_watermark_factor,
      socket_backlog_size: data.socket_backlog_size,

      // Libtorrent - Connections
      outgoing_ports_min: data.outgoing_ports_min,
      outgoing_ports_max: data.outgoing_ports_max,
      upnp_lease_duration: data.upnp_lease_duration,
      utp_tcp_mixed_mode: data.utp_tcp_mixed_mode as UtpTcpMixedMode,
      enable_multi_connections_from_same_ip:
        data.enable_multi_connections_from_same_ip,

      // Libtorrent - Upload/Choking
      upload_slots_behavior: data.upload_slots_behavior as UploadSlotsBehavior,
      upload_choking_algorithm:
        data.upload_choking_algorithm as UploadChokingAlgorithm,

      // Libtorrent - Trackers
      announce_to_all_trackers: data.announce_to_all_trackers,
      announce_to_all_tiers: data.announce_to_all_tiers,
      announce_ip: data.announce_ip,
      stop_tracker_timeout: data.stop_tracker_timeout,
    }

    // Only include optional fields if the feature is supported
    if (preferences.resume_data_storage_type !== undefined) {
      payload.resume_data_storage_type =
        data.resume_data_storage_type as ResumeDataStorageType
    }
    if (preferences.torrent_content_remove_option !== undefined) {
      payload.torrent_content_remove_option =
        data.torrent_content_remove_option as TorrentContentRemoveOption
    }
    if (preferences.memory_working_set_limit !== undefined) {
      payload.memory_working_set_limit = data.memory_working_set_limit
    }
    if (preferences.save_statistics_interval !== undefined) {
      payload.save_statistics_interval = data.save_statistics_interval
    }
    if (preferences.torrent_file_size_limit !== undefined) {
      payload.torrent_file_size_limit = data.torrent_file_size_limit
    }
    if (preferences.reannounce_when_address_changed !== undefined) {
      payload.reannounce_when_address_changed =
        data.reannounce_when_address_changed
    }
    if (preferences.embedded_tracker_port_forwarding !== undefined) {
      payload.embedded_tracker_port_forwarding =
        data.embedded_tracker_port_forwarding
    }
    if (preferences.mark_of_the_web !== undefined) {
      payload.mark_of_the_web = data.mark_of_the_web
    }
    if (preferences.ignore_ssl_errors !== undefined) {
      payload.ignore_ssl_errors = data.ignore_ssl_errors
    }
    if (preferences.python_executable_path !== undefined) {
      payload.python_executable_path = data.python_executable_path
    }
    if (preferences.bdecode_depth_limit !== undefined) {
      payload.bdecode_depth_limit = data.bdecode_depth_limit
    }
    if (preferences.bdecode_token_limit !== undefined) {
      payload.bdecode_token_limit = data.bdecode_token_limit
    }
    if (preferences.hashing_threads !== undefined) {
      payload.hashing_threads = data.hashing_threads
    }
    if (preferences.disk_queue_size !== undefined) {
      payload.disk_queue_size = data.disk_queue_size
    }
    if (preferences.disk_io_type !== undefined) {
      payload.disk_io_type = data.disk_io_type as DiskIOType
    }
    if (preferences.disk_io_read_mode !== undefined) {
      payload.disk_io_read_mode = data.disk_io_read_mode as DiskIOReadWriteMode
    }
    if (preferences.disk_io_write_mode !== undefined) {
      payload.disk_io_write_mode =
        data.disk_io_write_mode as DiskIOReadWriteMode
    }
    if (preferences.enable_piece_extent_affinity !== undefined) {
      payload.enable_piece_extent_affinity = data.enable_piece_extent_affinity
    }
    if (preferences.socket_send_buffer_size !== undefined) {
      payload.socket_send_buffer_size = data.socket_send_buffer_size
    }
    if (preferences.socket_receive_buffer_size !== undefined) {
      payload.socket_receive_buffer_size = data.socket_receive_buffer_size
    }
    if (preferences.connection_speed !== undefined) {
      payload.connection_speed = data.connection_speed
    }
    if (preferences.peer_tos !== undefined) {
      payload.peer_tos = data.peer_tos
    }
    if (preferences.validate_https_tracker_certificate !== undefined) {
      payload.validate_https_tracker_certificate =
        data.validate_https_tracker_certificate
    }
    if (preferences.ssrf_mitigation !== undefined) {
      payload.ssrf_mitigation = data.ssrf_mitigation
    }
    if (preferences.block_peers_on_privileged_ports !== undefined) {
      payload.block_peers_on_privileged_ports =
        data.block_peers_on_privileged_ports
    }
    if (preferences.hostname_cache_ttl !== undefined) {
      payload.hostname_cache_ttl = data.hostname_cache_ttl
    }
    if (preferences.idn_support_enabled !== undefined) {
      payload.idn_support_enabled = data.idn_support_enabled
    }
    if (preferences.enable_upload_suggestions !== undefined) {
      payload.enable_upload_suggestions = data.enable_upload_suggestions
    }
    if (preferences.announce_port !== undefined) {
      payload.announce_port = data.announce_port
    }
    if (preferences.max_concurrent_http_announces !== undefined) {
      payload.max_concurrent_http_announces = data.max_concurrent_http_announces
    }
    if (preferences.peer_turnover !== undefined) {
      payload.peer_turnover = data.peer_turnover
    }
    if (preferences.peer_turnover_cutoff !== undefined) {
      payload.peer_turnover_cutoff = data.peer_turnover_cutoff
    }
    if (preferences.peer_turnover_interval !== undefined) {
      payload.peer_turnover_interval = data.peer_turnover_interval
    }
    if (preferences.request_queue_size !== undefined) {
      payload.request_queue_size = data.request_queue_size
    }
    if (preferences.dht_bootstrap_nodes !== undefined) {
      payload.dht_bootstrap_nodes = data.dht_bootstrap_nodes
    }

    updatePreferences.mutate(payload)
  }

  // Feature detection for optional fields
  const hasResumeDataStorageType =
    preferences.resume_data_storage_type !== undefined
  const hasTorrentContentRemoveOption =
    preferences.torrent_content_remove_option !== undefined
  const hasMemoryWorkingSetLimit =
    preferences.memory_working_set_limit !== undefined
  const hasSaveStatisticsInterval =
    preferences.save_statistics_interval !== undefined
  const hasTorrentFileSizeLimit =
    preferences.torrent_file_size_limit !== undefined
  const hasReannounceWhenAddressChanged =
    preferences.reannounce_when_address_changed !== undefined
  const hasEmbeddedTrackerPortForwarding =
    preferences.embedded_tracker_port_forwarding !== undefined
  const hasMarkOfTheWeb = preferences.mark_of_the_web !== undefined
  const hasIgnoreSslErrors = preferences.ignore_ssl_errors !== undefined
  const hasPythonExecutablePath =
    preferences.python_executable_path !== undefined
  const hasBdecodeDepthLimit = preferences.bdecode_depth_limit !== undefined
  const hasBdecodeTokenLimit = preferences.bdecode_token_limit !== undefined
  const hasHashingThreads = preferences.hashing_threads !== undefined
  const hasDiskQueueSize = preferences.disk_queue_size !== undefined
  const hasDiskIOType = preferences.disk_io_type !== undefined
  const hasDiskIOReadMode = preferences.disk_io_read_mode !== undefined
  const hasDiskIOWriteMode = preferences.disk_io_write_mode !== undefined
  const hasPieceExtentAffinity =
    preferences.enable_piece_extent_affinity !== undefined
  const hasSocketSendBufferSize =
    preferences.socket_send_buffer_size !== undefined
  const hasSocketReceiveBufferSize =
    preferences.socket_receive_buffer_size !== undefined
  const hasConnectionSpeed = preferences.connection_speed !== undefined
  const hasPeerTos = preferences.peer_tos !== undefined
  const hasValidateHttpsTrackerCertificate =
    preferences.validate_https_tracker_certificate !== undefined
  const hasSsrfMitigation = preferences.ssrf_mitigation !== undefined
  const hasBlockPeersOnPrivilegedPorts =
    preferences.block_peers_on_privileged_ports !== undefined
  const hasHostnameCacheTtl = preferences.hostname_cache_ttl !== undefined
  const hasIdnSupportEnabled = preferences.idn_support_enabled !== undefined
  const hasUploadSuggestions =
    preferences.enable_upload_suggestions !== undefined
  const hasAnnouncePort = preferences.announce_port !== undefined
  const hasMaxConcurrentHttpAnnounces =
    preferences.max_concurrent_http_announces !== undefined
  const hasPeerTurnover = preferences.peer_turnover !== undefined
  const hasPeerTurnoverCutoff = preferences.peer_turnover_cutoff !== undefined
  const hasPeerTurnoverInterval =
    preferences.peer_turnover_interval !== undefined
  const hasRequestQueueSize = preferences.request_queue_size !== undefined
  const hasDhtBootstrapNodes = preferences.dht_bootstrap_nodes !== undefined

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Performance Warning Banner */}
      <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
        <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
        <div>
          <p className="font-medium text-amber-600 dark:text-amber-400">
            {t(
              'qbittorrent.advanced.warning.title',
              'Caution: Advanced Settings',
            )}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {t(
              'qbittorrent.advanced.warning.message',
              'These settings can significantly impact performance and stability. Only modify them if you understand their effects. Incorrect values may cause poor performance, connection issues, or data corruption.',
            )}
          </p>
        </div>
      </div>

      {/* qBittorrent Section */}
      <SettingsSection
        title={t('qbittorrent.advanced.qbittorrent.title', 'qBittorrent')}
        description={t(
          'qbittorrent.advanced.qbittorrent.description',
          'General qBittorrent application settings',
        )}
      >
        <div className="space-y-4">
          {/* Resume Data Storage */}
          {hasResumeDataStorageType && (
            <div className="grid gap-2">
              <Label htmlFor="resume_data_storage_type">
                {t(
                  'qbittorrent.advanced.resumeDataStorage',
                  'Resume data storage type',
                )}
              </Label>
              <Controller
                name="resume_data_storage_type"
                control={control}
                render={({ field }) => (
                  <select
                    {...field}
                    id="resume_data_storage_type"
                    className="h-9 w-full max-w-[300px] rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] dark:bg-input/30"
                  >
                    {Object.entries(ResumeDataStorageTypeLabels).map(
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

          {/* Torrent Content Remove Option */}
          {hasTorrentContentRemoveOption && (
            <div className="grid gap-2">
              <Label htmlFor="torrent_content_remove_option">
                {t(
                  'qbittorrent.advanced.torrentContentRemoveOption',
                  'Default action when deleting torrent content',
                )}
              </Label>
              <Controller
                name="torrent_content_remove_option"
                control={control}
                render={({ field }) => (
                  <select
                    {...field}
                    id="torrent_content_remove_option"
                    className="h-9 w-full max-w-[300px] rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] dark:bg-input/30"
                  >
                    {Object.entries(TorrentContentRemoveOptionLabels).map(
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

          {/* Memory Working Set Limit */}
          {hasMemoryWorkingSetLimit && (
            <div className="grid gap-2">
              <Label htmlFor="memory_working_set_limit">
                {t(
                  'qbittorrent.advanced.memoryLimit',
                  'Physical memory (RAM) usage limit (MiB)',
                )}
              </Label>
              <Controller
                name="memory_working_set_limit"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    id="memory_working_set_limit"
                    type="number"
                    min={0}
                    className="max-w-[200px]"
                    onChange={(e) =>
                      field.onChange(parseInt(e.target.value, 10) || 0)
                    }
                  />
                )}
              />
              <p className="text-xs text-muted-foreground">
                {t(
                  'qbittorrent.advanced.memoryLimitHint',
                  '0 = unlimited. Limits the amount of physical memory qBittorrent can use.',
                )}
              </p>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Network Interface */}
            <div className="grid gap-2">
              <Label htmlFor="current_network_interface">
                {t(
                  'qbittorrent.advanced.networkInterface',
                  'Network interface',
                )}
              </Label>
              <Controller
                name="current_network_interface"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    id="current_network_interface"
                    placeholder={t(
                      'qbittorrent.advanced.anyInterface',
                      'Any interface',
                    )}
                  />
                )}
              />
            </div>

            {/* Interface Address */}
            <div className="grid gap-2">
              <Label htmlFor="current_interface_address">
                {t('qbittorrent.advanced.interfaceAddress', 'IP address')}
              </Label>
              <Controller
                name="current_interface_address"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    id="current_interface_address"
                    placeholder={t(
                      'qbittorrent.advanced.allAddresses',
                      'All addresses',
                    )}
                  />
                )}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Save Resume Data Interval */}
            <div className="grid gap-2">
              <Label htmlFor="save_resume_data_interval">
                {t(
                  'qbittorrent.advanced.saveResumeInterval',
                  'Save resume data interval (min)',
                )}
              </Label>
              <Controller
                name="save_resume_data_interval"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    id="save_resume_data_interval"
                    type="number"
                    min={1}
                    max={1440}
                    onChange={(e) =>
                      field.onChange(parseInt(e.target.value, 10) || 60)
                    }
                  />
                )}
              />
            </div>

            {/* Save Statistics Interval */}
            {hasSaveStatisticsInterval && (
              <div className="grid gap-2">
                <Label htmlFor="save_statistics_interval">
                  {t(
                    'qbittorrent.advanced.saveStatisticsInterval',
                    'Save statistics interval (min)',
                  )}
                </Label>
                <Controller
                  name="save_statistics_interval"
                  control={control}
                  render={({ field }) => (
                    <Input
                      {...field}
                      id="save_statistics_interval"
                      type="number"
                      min={1}
                      max={1440}
                      onChange={(e) =>
                        field.onChange(parseInt(e.target.value, 10) || 60)
                      }
                    />
                  )}
                />
              </div>
            )}
          </div>

          {/* Torrent File Size Limit */}
          {hasTorrentFileSizeLimit && (
            <div className="grid gap-2">
              <Label htmlFor="torrent_file_size_limit">
                {t(
                  'qbittorrent.advanced.torrentFileSizeLimit',
                  'Torrent file size limit (bytes)',
                )}
              </Label>
              <Controller
                name="torrent_file_size_limit"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    id="torrent_file_size_limit"
                    type="number"
                    min={0}
                    className="max-w-[300px]"
                    onChange={(e) =>
                      field.onChange(parseInt(e.target.value, 10) || 0)
                    }
                  />
                )}
              />
              <p className="text-xs text-muted-foreground">
                {t(
                  'qbittorrent.advanced.torrentFileSizeLimitHint',
                  'Maximum .torrent file size to accept (0 = unlimited)',
                )}
              </p>
            </div>
          )}

          {/* Checkboxes */}
          <div className="space-y-3">
            <Controller
              name="recheck_completed_torrents"
              control={control}
              render={({ field }) => (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="recheck_completed_torrents"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                  <Label
                    htmlFor="recheck_completed_torrents"
                    className="font-normal cursor-pointer"
                  >
                    {t(
                      'qbittorrent.advanced.recheckCompleted',
                      'Recheck torrents on completion',
                    )}
                  </Label>
                </div>
              )}
            />

            <Controller
              name="resolve_peer_countries"
              control={control}
              render={({ field }) => (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="resolve_peer_countries"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                  <Label
                    htmlFor="resolve_peer_countries"
                    className="font-normal cursor-pointer"
                  >
                    {t(
                      'qbittorrent.advanced.resolvePeerCountries',
                      'Resolve peer countries',
                    )}
                  </Label>
                </div>
              )}
            />

            {hasReannounceWhenAddressChanged && (
              <Controller
                name="reannounce_when_address_changed"
                control={control}
                render={({ field }) => (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="reannounce_when_address_changed"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                    <Label
                      htmlFor="reannounce_when_address_changed"
                      className="font-normal cursor-pointer"
                    >
                      {t(
                        'qbittorrent.advanced.reannounceOnIpChange',
                        'Reannounce to all trackers when IP changes',
                      )}
                    </Label>
                  </div>
                )}
              />
            )}

            {hasMarkOfTheWeb && (
              <Controller
                name="mark_of_the_web"
                control={control}
                render={({ field }) => (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="mark_of_the_web"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                    <Label
                      htmlFor="mark_of_the_web"
                      className="font-normal cursor-pointer"
                    >
                      {t(
                        'qbittorrent.advanced.markOfTheWeb',
                        'Add Windows Mark of the Web to downloaded files',
                      )}
                    </Label>
                  </div>
                )}
              />
            )}

            {hasIgnoreSslErrors && (
              <Controller
                name="ignore_ssl_errors"
                control={control}
                render={({ field }) => (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="ignore_ssl_errors"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                    <Label
                      htmlFor="ignore_ssl_errors"
                      className="font-normal cursor-pointer text-amber-600 dark:text-amber-400"
                    >
                      {t(
                        'qbittorrent.advanced.ignoreSslErrors',
                        'Ignore SSL certificate errors (not recommended)',
                      )}
                    </Label>
                  </div>
                )}
              />
            )}
          </div>

          {/* Python Executable Path */}
          {hasPythonExecutablePath && (
            <div className="grid gap-2">
              <Label htmlFor="python_executable_path">
                {t(
                  'qbittorrent.advanced.pythonPath',
                  'Python executable path (for search plugins)',
                )}
              </Label>
              <Controller
                name="python_executable_path"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    id="python_executable_path"
                    placeholder={t(
                      'qbittorrent.advanced.pythonPathPlaceholder',
                      '/usr/bin/python3',
                    )}
                  />
                )}
              />
            </div>
          )}
        </div>
      </SettingsSection>

      {/* Embedded Tracker Section */}
      <SettingsSection
        title={t(
          'qbittorrent.advanced.embeddedTracker.title',
          'Embedded Tracker',
        )}
        description={t(
          'qbittorrent.advanced.embeddedTracker.description',
          'Built-in BitTorrent tracker server',
        )}
        defaultOpen={false}
      >
        <Controller
          name="enable_embedded_tracker"
          control={control}
          render={({ field }) => (
            <div className="flex items-center gap-2">
              <Checkbox
                id="enable_embedded_tracker"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
              <Label
                htmlFor="enable_embedded_tracker"
                className="font-normal cursor-pointer"
              >
                {t(
                  'qbittorrent.advanced.enableEmbeddedTracker',
                  'Enable embedded tracker',
                )}
              </Label>
            </div>
          )}
        />

        <div className="grid gap-2">
          <Label htmlFor="embedded_tracker_port">
            {t(
              'qbittorrent.advanced.embeddedTrackerPort',
              'Embedded tracker port',
            )}
          </Label>
          <Controller
            name="embedded_tracker_port"
            control={control}
            render={({ field }) => (
              <Input
                {...field}
                id="embedded_tracker_port"
                type="number"
                min={1}
                max={65535}
                className="max-w-[200px]"
                onChange={(e) =>
                  field.onChange(parseInt(e.target.value, 10) || 9000)
                }
              />
            )}
          />
        </div>

        {hasEmbeddedTrackerPortForwarding && (
          <Controller
            name="embedded_tracker_port_forwarding"
            control={control}
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="embedded_tracker_port_forwarding"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
                <Label
                  htmlFor="embedded_tracker_port_forwarding"
                  className="font-normal cursor-pointer"
                >
                  {t(
                    'qbittorrent.advanced.embeddedTrackerPortForwarding',
                    'Enable port forwarding for embedded tracker',
                  )}
                </Label>
              </div>
            )}
          />
        )}
      </SettingsSection>

      {/* Disk I/O Section */}
      <SettingsSection
        title={t('qbittorrent.advanced.diskIO.title', 'Disk I/O')}
        description={t(
          'qbittorrent.advanced.diskIO.description',
          'Disk cache and I/O settings',
        )}
        defaultOpen={false}
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Disk Cache */}
            <div className="grid gap-2">
              <Label htmlFor="disk_cache">
                {t('qbittorrent.advanced.diskCache', 'Disk cache size (MiB)')}
              </Label>
              <Controller
                name="disk_cache"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    id="disk_cache"
                    type="number"
                    min={-1}
                    onChange={(e) =>
                      field.onChange(parseInt(e.target.value, 10) || -1)
                    }
                  />
                )}
              />
              <p className="text-xs text-muted-foreground">
                {t('qbittorrent.advanced.diskCacheHint', '-1 = automatic')}
              </p>
            </div>

            {/* Disk Cache TTL */}
            <div className="grid gap-2">
              <Label htmlFor="disk_cache_ttl">
                {t(
                  'qbittorrent.advanced.diskCacheTtl',
                  'Disk cache expiry (seconds)',
                )}
              </Label>
              <Controller
                name="disk_cache_ttl"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    id="disk_cache_ttl"
                    type="number"
                    min={1}
                    onChange={(e) =>
                      field.onChange(parseInt(e.target.value, 10) || 60)
                    }
                  />
                )}
              />
            </div>
          </div>

          {/* Disk Queue Size */}
          {hasDiskQueueSize && (
            <div className="grid gap-2">
              <Label htmlFor="disk_queue_size">
                {t(
                  'qbittorrent.advanced.diskQueueSize',
                  'Disk queue size (bytes)',
                )}
              </Label>
              <Controller
                name="disk_queue_size"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    id="disk_queue_size"
                    type="number"
                    min={0}
                    className="max-w-[300px]"
                    onChange={(e) =>
                      field.onChange(parseInt(e.target.value, 10) || 0)
                    }
                  />
                )}
              />
            </div>
          )}

          {/* Disk I/O Type */}
          {hasDiskIOType && (
            <div className="grid gap-2">
              <Label htmlFor="disk_io_type">
                {t('qbittorrent.advanced.diskIOType', 'Disk I/O type')}
              </Label>
              <Controller
                name="disk_io_type"
                control={control}
                render={({ field }) => (
                  <select
                    {...field}
                    id="disk_io_type"
                    onChange={(e) =>
                      field.onChange(parseInt(e.target.value, 10))
                    }
                    className="h-9 w-full max-w-[300px] rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] dark:bg-input/30"
                  >
                    {Object.entries(DiskIOTypeLabels).map(
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

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Disk I/O Read Mode */}
            {hasDiskIOReadMode && (
              <div className="grid gap-2">
                <Label htmlFor="disk_io_read_mode">
                  {t(
                    'qbittorrent.advanced.diskIOReadMode',
                    'Disk I/O read mode',
                  )}
                </Label>
                <Controller
                  name="disk_io_read_mode"
                  control={control}
                  render={({ field }) => (
                    <select
                      {...field}
                      id="disk_io_read_mode"
                      onChange={(e) =>
                        field.onChange(parseInt(e.target.value, 10))
                      }
                      className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] dark:bg-input/30"
                    >
                      {Object.entries(DiskIOReadWriteModeLabels).map(
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

            {/* Disk I/O Write Mode */}
            {hasDiskIOWriteMode && (
              <div className="grid gap-2">
                <Label htmlFor="disk_io_write_mode">
                  {t(
                    'qbittorrent.advanced.diskIOWriteMode',
                    'Disk I/O write mode',
                  )}
                </Label>
                <Controller
                  name="disk_io_write_mode"
                  control={control}
                  render={({ field }) => (
                    <select
                      {...field}
                      id="disk_io_write_mode"
                      onChange={(e) =>
                        field.onChange(parseInt(e.target.value, 10))
                      }
                      className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] dark:bg-input/30"
                    >
                      {Object.entries(DiskIOReadWriteModeLabels).map(
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
          </div>

          {/* Checkboxes */}
          <div className="space-y-3">
            <Controller
              name="enable_coalesce_read_write"
              control={control}
              render={({ field }) => (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="enable_coalesce_read_write"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                  <Label
                    htmlFor="enable_coalesce_read_write"
                    className="font-normal cursor-pointer"
                  >
                    {t(
                      'qbittorrent.advanced.coalesceReadWrite',
                      'Coalesce reads and writes',
                    )}
                  </Label>
                </div>
              )}
            />

            {hasPieceExtentAffinity && (
              <Controller
                name="enable_piece_extent_affinity"
                control={control}
                render={({ field }) => (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="enable_piece_extent_affinity"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                    <Label
                      htmlFor="enable_piece_extent_affinity"
                      className="font-normal cursor-pointer"
                    >
                      {t(
                        'qbittorrent.advanced.pieceExtentAffinity',
                        'Use piece extent affinity',
                      )}
                    </Label>
                  </div>
                )}
              />
            )}
          </div>
        </div>
      </SettingsSection>

      {/* Threading & Memory Section */}
      <SettingsSection
        title={t('qbittorrent.advanced.threading.title', 'Threading & Memory')}
        description={t(
          'qbittorrent.advanced.threading.description',
          'Thread pool and memory allocation settings',
        )}
        defaultOpen={false}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Async I/O Threads */}
          <div className="grid gap-2">
            <Label htmlFor="async_io_threads">
              {t('qbittorrent.advanced.asyncIoThreads', 'Async I/O threads')}
            </Label>
            <Controller
              name="async_io_threads"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  id="async_io_threads"
                  type="number"
                  min={1}
                  max={128}
                  onChange={(e) =>
                    field.onChange(parseInt(e.target.value, 10) || 10)
                  }
                />
              )}
            />
          </div>

          {/* Hashing Threads */}
          {hasHashingThreads && (
            <div className="grid gap-2">
              <Label htmlFor="hashing_threads">
                {t('qbittorrent.advanced.hashingThreads', 'Hashing threads')}
              </Label>
              <Controller
                name="hashing_threads"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    id="hashing_threads"
                    type="number"
                    min={1}
                    max={64}
                    onChange={(e) =>
                      field.onChange(parseInt(e.target.value, 10) || 2)
                    }
                  />
                )}
              />
            </div>
          )}

          {/* File Pool Size */}
          <div className="grid gap-2">
            <Label htmlFor="file_pool_size">
              {t('qbittorrent.advanced.filePoolSize', 'File pool size')}
            </Label>
            <Controller
              name="file_pool_size"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  id="file_pool_size"
                  type="number"
                  min={1}
                  onChange={(e) =>
                    field.onChange(parseInt(e.target.value, 10) || 5000)
                  }
                />
              )}
            />
          </div>

          {/* Checking Memory Use */}
          <div className="grid gap-2">
            <Label htmlFor="checking_memory_use">
              {t(
                'qbittorrent.advanced.checkingMemory',
                'Outstanding memory for checking (MiB)',
              )}
            </Label>
            <Controller
              name="checking_memory_use"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  id="checking_memory_use"
                  type="number"
                  min={1}
                  onChange={(e) =>
                    field.onChange(parseInt(e.target.value, 10) || 256)
                  }
                />
              )}
            />
          </div>
        </div>

        {/* Bdecode Limits */}
        {(hasBdecodeDepthLimit || hasBdecodeTokenLimit) && (
          <div className="grid gap-4 sm:grid-cols-2 pt-4">
            {hasBdecodeDepthLimit && (
              <div className="grid gap-2">
                <Label htmlFor="bdecode_depth_limit">
                  {t(
                    'qbittorrent.advanced.bdecodeDepthLimit',
                    'Bdecode depth limit',
                  )}
                </Label>
                <Controller
                  name="bdecode_depth_limit"
                  control={control}
                  render={({ field }) => (
                    <Input
                      {...field}
                      id="bdecode_depth_limit"
                      type="number"
                      min={1}
                      onChange={(e) =>
                        field.onChange(parseInt(e.target.value, 10) || 100)
                      }
                    />
                  )}
                />
              </div>
            )}

            {hasBdecodeTokenLimit && (
              <div className="grid gap-2">
                <Label htmlFor="bdecode_token_limit">
                  {t(
                    'qbittorrent.advanced.bdecodeTokenLimit',
                    'Bdecode token limit',
                  )}
                </Label>
                <Controller
                  name="bdecode_token_limit"
                  control={control}
                  render={({ field }) => (
                    <Input
                      {...field}
                      id="bdecode_token_limit"
                      type="number"
                      min={1}
                      onChange={(e) =>
                        field.onChange(parseInt(e.target.value, 10) || 10000000)
                      }
                    />
                  )}
                />
              </div>
            )}
          </div>
        )}
      </SettingsSection>

      {/* Network Buffers Section */}
      <SettingsSection
        title={t(
          'qbittorrent.advanced.networkBuffers.title',
          'Network Buffers',
        )}
        description={t(
          'qbittorrent.advanced.networkBuffers.description',
          'Send/receive buffer configuration',
        )}
        defaultOpen={false}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          {/* Send Buffer Watermark */}
          <div className="grid gap-2">
            <Label htmlFor="send_buffer_watermark">
              {t(
                'qbittorrent.advanced.sendBufferWatermark',
                'Send buffer watermark (KiB)',
              )}
            </Label>
            <Controller
              name="send_buffer_watermark"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  id="send_buffer_watermark"
                  type="number"
                  min={1}
                  onChange={(e) =>
                    field.onChange(parseInt(e.target.value, 10) || 500)
                  }
                />
              )}
            />
          </div>

          {/* Send Buffer Low Watermark */}
          <div className="grid gap-2">
            <Label htmlFor="send_buffer_low_watermark">
              {t(
                'qbittorrent.advanced.sendBufferLowWatermark',
                'Send buffer low watermark (KiB)',
              )}
            </Label>
            <Controller
              name="send_buffer_low_watermark"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  id="send_buffer_low_watermark"
                  type="number"
                  min={1}
                  onChange={(e) =>
                    field.onChange(parseInt(e.target.value, 10) || 10)
                  }
                />
              )}
            />
          </div>

          {/* Send Buffer Watermark Factor */}
          <div className="grid gap-2">
            <Label htmlFor="send_buffer_watermark_factor">
              {t(
                'qbittorrent.advanced.sendBufferWatermarkFactor',
                'Send buffer factor (%)',
              )}
            </Label>
            <Controller
              name="send_buffer_watermark_factor"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  id="send_buffer_watermark_factor"
                  type="number"
                  min={1}
                  max={100}
                  onChange={(e) =>
                    field.onChange(parseInt(e.target.value, 10) || 50)
                  }
                />
              )}
            />
          </div>
        </div>

        {(hasSocketSendBufferSize || hasSocketReceiveBufferSize) && (
          <div className="grid gap-4 sm:grid-cols-2 pt-4">
            {hasSocketSendBufferSize && (
              <div className="grid gap-2">
                <Label htmlFor="socket_send_buffer_size">
                  {t(
                    'qbittorrent.advanced.socketSendBufferSize',
                    'Socket send buffer size (bytes)',
                  )}
                </Label>
                <Controller
                  name="socket_send_buffer_size"
                  control={control}
                  render={({ field }) => (
                    <Input
                      {...field}
                      id="socket_send_buffer_size"
                      type="number"
                      min={0}
                      onChange={(e) =>
                        field.onChange(parseInt(e.target.value, 10) || 0)
                      }
                    />
                  )}
                />
                <p className="text-xs text-muted-foreground">
                  {t('qbittorrent.advanced.socketBufferHint', '0 = OS default')}
                </p>
              </div>
            )}

            {hasSocketReceiveBufferSize && (
              <div className="grid gap-2">
                <Label htmlFor="socket_receive_buffer_size">
                  {t(
                    'qbittorrent.advanced.socketReceiveBufferSize',
                    'Socket receive buffer size (bytes)',
                  )}
                </Label>
                <Controller
                  name="socket_receive_buffer_size"
                  control={control}
                  render={({ field }) => (
                    <Input
                      {...field}
                      id="socket_receive_buffer_size"
                      type="number"
                      min={0}
                      onChange={(e) =>
                        field.onChange(parseInt(e.target.value, 10) || 0)
                      }
                    />
                  )}
                />
              </div>
            )}
          </div>
        )}

        <div className="grid gap-2 pt-4">
          <Label htmlFor="socket_backlog_size">
            {t('qbittorrent.advanced.socketBacklogSize', 'Socket backlog size')}
          </Label>
          <Controller
            name="socket_backlog_size"
            control={control}
            render={({ field }) => (
              <Input
                {...field}
                id="socket_backlog_size"
                type="number"
                min={1}
                className="max-w-[200px]"
                onChange={(e) =>
                  field.onChange(parseInt(e.target.value, 10) || 30)
                }
              />
            )}
          />
        </div>
      </SettingsSection>

      {/* Connections Section */}
      <SettingsSection
        title={t('qbittorrent.advanced.connections.title', 'Connections')}
        description={t(
          'qbittorrent.advanced.connections.description',
          'Connection handling and limits',
        )}
        defaultOpen={false}
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Outgoing Ports */}
            <div className="grid gap-2">
              <Label htmlFor="outgoing_ports_min">
                {t(
                  'qbittorrent.advanced.outgoingPortsMin',
                  'Outgoing port min',
                )}
              </Label>
              <Controller
                name="outgoing_ports_min"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    id="outgoing_ports_min"
                    type="number"
                    min={0}
                    max={65535}
                    onChange={(e) =>
                      field.onChange(parseInt(e.target.value, 10) || 0)
                    }
                  />
                )}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="outgoing_ports_max">
                {t(
                  'qbittorrent.advanced.outgoingPortsMax',
                  'Outgoing port max',
                )}
              </Label>
              <Controller
                name="outgoing_ports_max"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    id="outgoing_ports_max"
                    type="number"
                    min={0}
                    max={65535}
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
              'qbittorrent.advanced.outgoingPortsHint',
              '0 = any port. Restricts outgoing connections to this port range.',
            )}
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Connection Speed */}
            {hasConnectionSpeed && (
              <div className="grid gap-2">
                <Label htmlFor="connection_speed">
                  {t(
                    'qbittorrent.advanced.connectionSpeed',
                    'Connection speed (connections/s)',
                  )}
                </Label>
                <Controller
                  name="connection_speed"
                  control={control}
                  render={({ field }) => (
                    <Input
                      {...field}
                      id="connection_speed"
                      type="number"
                      min={1}
                      onChange={(e) =>
                        field.onChange(parseInt(e.target.value, 10) || 30)
                      }
                    />
                  )}
                />
              </div>
            )}

            {/* UPnP Lease Duration */}
            <div className="grid gap-2">
              <Label htmlFor="upnp_lease_duration">
                {t(
                  'qbittorrent.advanced.upnpLeaseDuration',
                  'UPnP lease duration (seconds)',
                )}
              </Label>
              <Controller
                name="upnp_lease_duration"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    id="upnp_lease_duration"
                    type="number"
                    min={0}
                    onChange={(e) =>
                      field.onChange(parseInt(e.target.value, 10) || 0)
                    }
                  />
                )}
              />
              <p className="text-xs text-muted-foreground">
                {t(
                  'qbittorrent.advanced.upnpLeaseDurationHint',
                  '0 = permanent',
                )}
              </p>
            </div>
          </div>

          {/* uTP-TCP Mixed Mode */}
          <div className="grid gap-2">
            <Label htmlFor="utp_tcp_mixed_mode">
              {t('qbittorrent.advanced.utpTcpMixedMode', 'uTP-TCP mixed mode')}
            </Label>
            <Controller
              name="utp_tcp_mixed_mode"
              control={control}
              render={({ field }) => (
                <select
                  {...field}
                  id="utp_tcp_mixed_mode"
                  onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                  className="h-9 w-full max-w-[300px] rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] dark:bg-input/30"
                >
                  {Object.entries(UtpTcpMixedModeLabels).map(
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

          {/* Peer ToS */}
          {hasPeerTos && (
            <div className="grid gap-2">
              <Label htmlFor="peer_tos">
                {t(
                  'qbittorrent.advanced.peerTos',
                  'Type of Service (ToS) for peer connections',
                )}
              </Label>
              <Controller
                name="peer_tos"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    id="peer_tos"
                    type="number"
                    min={0}
                    max={255}
                    className="max-w-[200px]"
                    onChange={(e) =>
                      field.onChange(parseInt(e.target.value, 10) || 0)
                    }
                  />
                )}
              />
            </div>
          )}

          {/* DNS / Hostname Settings */}
          {(hasHostnameCacheTtl || hasIdnSupportEnabled) && (
            <div className="grid gap-4 sm:grid-cols-2 pt-2">
              {hasHostnameCacheTtl && (
                <div className="grid gap-2">
                  <Label htmlFor="hostname_cache_ttl">
                    {t(
                      'qbittorrent.advanced.hostnameCacheTtl',
                      'DNS cache TTL (seconds)',
                    )}
                  </Label>
                  <Controller
                    name="hostname_cache_ttl"
                    control={control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        id="hostname_cache_ttl"
                        type="number"
                        min={0}
                        onChange={(e) =>
                          field.onChange(parseInt(e.target.value, 10) || 3600)
                        }
                      />
                    )}
                  />
                </div>
              )}
            </div>
          )}

          {/* Checkboxes */}
          <div className="space-y-3 pt-2">
            <Controller
              name="enable_multi_connections_from_same_ip"
              control={control}
              render={({ field }) => (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="enable_multi_connections_from_same_ip"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                  <Label
                    htmlFor="enable_multi_connections_from_same_ip"
                    className="font-normal cursor-pointer"
                  >
                    {t(
                      'qbittorrent.advanced.multiConnectionsSameIp',
                      'Allow multiple connections from same IP',
                    )}
                  </Label>
                </div>
              )}
            />

            {hasIdnSupportEnabled && (
              <Controller
                name="idn_support_enabled"
                control={control}
                render={({ field }) => (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="idn_support_enabled"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                    <Label
                      htmlFor="idn_support_enabled"
                      className="font-normal cursor-pointer"
                    >
                      {t(
                        'qbittorrent.advanced.idnSupport',
                        'Enable IDN (Internationalized Domain Names) support',
                      )}
                    </Label>
                  </div>
                )}
              />
            )}

            {hasValidateHttpsTrackerCertificate && (
              <Controller
                name="validate_https_tracker_certificate"
                control={control}
                render={({ field }) => (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="validate_https_tracker_certificate"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                    <Label
                      htmlFor="validate_https_tracker_certificate"
                      className="font-normal cursor-pointer"
                    >
                      {t(
                        'qbittorrent.advanced.validateHttpsTracker',
                        'Validate HTTPS tracker certificates',
                      )}
                    </Label>
                  </div>
                )}
              />
            )}

            {hasSsrfMitigation && (
              <Controller
                name="ssrf_mitigation"
                control={control}
                render={({ field }) => (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="ssrf_mitigation"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                    <Label
                      htmlFor="ssrf_mitigation"
                      className="font-normal cursor-pointer"
                    >
                      {t(
                        'qbittorrent.advanced.ssrfMitigation',
                        'Enable SSRF mitigation',
                      )}
                    </Label>
                  </div>
                )}
              />
            )}

            {hasBlockPeersOnPrivilegedPorts && (
              <Controller
                name="block_peers_on_privileged_ports"
                control={control}
                render={({ field }) => (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="block_peers_on_privileged_ports"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                    <Label
                      htmlFor="block_peers_on_privileged_ports"
                      className="font-normal cursor-pointer"
                    >
                      {t(
                        'qbittorrent.advanced.blockPrivilegedPorts',
                        'Block peers on privileged ports (below 1024)',
                      )}
                    </Label>
                  </div>
                )}
              />
            )}
          </div>
        </div>
      </SettingsSection>

      {/* Upload & Choking Section */}
      <SettingsSection
        title={t(
          'qbittorrent.advanced.uploadChoking.title',
          'Upload & Choking',
        )}
        description={t(
          'qbittorrent.advanced.uploadChoking.description',
          'Upload slot and choking algorithm configuration',
        )}
        defaultOpen={false}
      >
        <div className="space-y-4">
          {/* Upload Slots Behavior */}
          <div className="grid gap-2">
            <Label htmlFor="upload_slots_behavior">
              {t(
                'qbittorrent.advanced.uploadSlotsBehavior',
                'Upload slots behavior',
              )}
            </Label>
            <Controller
              name="upload_slots_behavior"
              control={control}
              render={({ field }) => (
                <select
                  {...field}
                  id="upload_slots_behavior"
                  onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                  className="h-9 w-full max-w-[300px] rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] dark:bg-input/30"
                >
                  {Object.entries(UploadSlotsBehaviorLabels).map(
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

          {/* Upload Choking Algorithm */}
          <div className="grid gap-2">
            <Label htmlFor="upload_choking_algorithm">
              {t(
                'qbittorrent.advanced.uploadChokingAlgorithm',
                'Upload choking algorithm',
              )}
            </Label>
            <Controller
              name="upload_choking_algorithm"
              control={control}
              render={({ field }) => (
                <select
                  {...field}
                  id="upload_choking_algorithm"
                  onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                  className="h-9 w-full max-w-[300px] rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] dark:bg-input/30"
                >
                  {Object.entries(UploadChokingAlgorithmLabels).map(
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

          {hasUploadSuggestions && (
            <Controller
              name="enable_upload_suggestions"
              control={control}
              render={({ field }) => (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="enable_upload_suggestions"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                  <Label
                    htmlFor="enable_upload_suggestions"
                    className="font-normal cursor-pointer"
                  >
                    {t(
                      'qbittorrent.advanced.uploadSuggestions',
                      'Enable upload suggestions',
                    )}
                  </Label>
                </div>
              )}
            />
          )}
        </div>
      </SettingsSection>

      {/* Tracker Settings Section */}
      <SettingsSection
        title={t('qbittorrent.advanced.trackers.title', 'Tracker Settings')}
        description={t(
          'qbittorrent.advanced.trackers.description',
          'Tracker announcement configuration',
        )}
        defaultOpen={false}
      >
        <div className="space-y-4">
          {/* Checkboxes */}
          <div className="space-y-3">
            <Controller
              name="announce_to_all_trackers"
              control={control}
              render={({ field }) => (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="announce_to_all_trackers"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                  <Label
                    htmlFor="announce_to_all_trackers"
                    className="font-normal cursor-pointer"
                  >
                    {t(
                      'qbittorrent.advanced.announceToAllTrackers',
                      'Announce to all trackers in a tier',
                    )}
                  </Label>
                </div>
              )}
            />

            <Controller
              name="announce_to_all_tiers"
              control={control}
              render={({ field }) => (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="announce_to_all_tiers"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                  <Label
                    htmlFor="announce_to_all_tiers"
                    className="font-normal cursor-pointer"
                  >
                    {t(
                      'qbittorrent.advanced.announceToAllTiers',
                      'Announce to all tiers',
                    )}
                  </Label>
                </div>
              )}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Announce IP */}
            <div className="grid gap-2">
              <Label htmlFor="announce_ip">
                {t(
                  'qbittorrent.advanced.announceIp',
                  'IP to report to trackers',
                )}
              </Label>
              <Controller
                name="announce_ip"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    id="announce_ip"
                    placeholder={t(
                      'qbittorrent.advanced.announceIpPlaceholder',
                      'Automatic',
                    )}
                  />
                )}
              />
            </div>

            {/* Announce Port */}
            {hasAnnouncePort && (
              <div className="grid gap-2">
                <Label htmlFor="announce_port">
                  {t(
                    'qbittorrent.advanced.announcePort',
                    'Port to report to trackers',
                  )}
                </Label>
                <Controller
                  name="announce_port"
                  control={control}
                  render={({ field }) => (
                    <Input
                      {...field}
                      id="announce_port"
                      type="number"
                      min={0}
                      max={65535}
                      onChange={(e) =>
                        field.onChange(parseInt(e.target.value, 10) || 0)
                      }
                    />
                  )}
                />
                <p className="text-xs text-muted-foreground">
                  {t(
                    'qbittorrent.advanced.announcePortHint',
                    '0 = use listen port',
                  )}
                </p>
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Max Concurrent HTTP Announces */}
            {hasMaxConcurrentHttpAnnounces && (
              <div className="grid gap-2">
                <Label htmlFor="max_concurrent_http_announces">
                  {t(
                    'qbittorrent.advanced.maxConcurrentAnnounces',
                    'Max concurrent HTTP announces',
                  )}
                </Label>
                <Controller
                  name="max_concurrent_http_announces"
                  control={control}
                  render={({ field }) => (
                    <Input
                      {...field}
                      id="max_concurrent_http_announces"
                      type="number"
                      min={1}
                      onChange={(e) =>
                        field.onChange(parseInt(e.target.value, 10) || 50)
                      }
                    />
                  )}
                />
              </div>
            )}

            {/* Stop Tracker Timeout */}
            <div className="grid gap-2">
              <Label htmlFor="stop_tracker_timeout">
                {t(
                  'qbittorrent.advanced.stopTrackerTimeout',
                  'Stop tracker timeout (seconds)',
                )}
              </Label>
              <Controller
                name="stop_tracker_timeout"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    id="stop_tracker_timeout"
                    type="number"
                    min={0}
                    onChange={(e) =>
                      field.onChange(parseInt(e.target.value, 10) || 5)
                    }
                  />
                )}
              />
            </div>
          </div>
        </div>
      </SettingsSection>

      {/* Peer Settings Section */}
      <SettingsSection
        title={t('qbittorrent.advanced.peers.title', 'Peer Settings')}
        description={t(
          'qbittorrent.advanced.peers.description',
          'Peer turnover and request queue configuration',
        )}
        defaultOpen={false}
      >
        <div className="space-y-4">
          {(hasPeerTurnover ||
            hasPeerTurnoverCutoff ||
            hasPeerTurnoverInterval) && (
            <div className="grid gap-4 sm:grid-cols-3">
              {hasPeerTurnover && (
                <div className="grid gap-2">
                  <Label htmlFor="peer_turnover">
                    {t(
                      'qbittorrent.advanced.peerTurnover',
                      'Peer turnover (%)',
                    )}
                  </Label>
                  <Controller
                    name="peer_turnover"
                    control={control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        id="peer_turnover"
                        type="number"
                        min={0}
                        max={100}
                        onChange={(e) =>
                          field.onChange(parseInt(e.target.value, 10) || 0)
                        }
                      />
                    )}
                  />
                </div>
              )}

              {hasPeerTurnoverCutoff && (
                <div className="grid gap-2">
                  <Label htmlFor="peer_turnover_cutoff">
                    {t(
                      'qbittorrent.advanced.peerTurnoverCutoff',
                      'Peer turnover cutoff (%)',
                    )}
                  </Label>
                  <Controller
                    name="peer_turnover_cutoff"
                    control={control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        id="peer_turnover_cutoff"
                        type="number"
                        min={0}
                        max={100}
                        onChange={(e) =>
                          field.onChange(parseInt(e.target.value, 10) || 0)
                        }
                      />
                    )}
                  />
                </div>
              )}

              {hasPeerTurnoverInterval && (
                <div className="grid gap-2">
                  <Label htmlFor="peer_turnover_interval">
                    {t(
                      'qbittorrent.advanced.peerTurnoverInterval',
                      'Peer turnover interval (s)',
                    )}
                  </Label>
                  <Controller
                    name="peer_turnover_interval"
                    control={control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        id="peer_turnover_interval"
                        type="number"
                        min={0}
                        onChange={(e) =>
                          field.onChange(parseInt(e.target.value, 10) || 0)
                        }
                      />
                    )}
                  />
                </div>
              )}
            </div>
          )}

          {hasRequestQueueSize && (
            <div className="grid gap-2">
              <Label htmlFor="request_queue_size">
                {t(
                  'qbittorrent.advanced.requestQueueSize',
                  'Request queue size',
                )}
              </Label>
              <Controller
                name="request_queue_size"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    id="request_queue_size"
                    type="number"
                    min={1}
                    className="max-w-[200px]"
                    onChange={(e) =>
                      field.onChange(parseInt(e.target.value, 10) || 500)
                    }
                  />
                )}
              />
            </div>
          )}
        </div>
      </SettingsSection>

      {/* DHT Section */}
      <SettingsSection
        title={t('qbittorrent.advanced.dht.title', 'DHT Bootstrap Nodes')}
        description={t(
          'qbittorrent.advanced.dht.description',
          'Custom DHT bootstrap nodes for peer discovery',
        )}
        defaultOpen={false}
      >
        {hasDhtBootstrapNodes && (
          <div className="grid gap-2">
            <Controller
              name="dht_bootstrap_nodes"
              control={control}
              render={({ field }) => (
                <Textarea
                  {...field}
                  id="dht_bootstrap_nodes"
                  placeholder={t(
                    'qbittorrent.advanced.dhtPlaceholder',
                    'router.bittorrent.com:6881\ndht.transmissionbt.com:6881',
                  )}
                  rows={4}
                  className="font-mono text-sm"
                />
              )}
            />
            <p className="text-xs text-muted-foreground">
              {t(
                'qbittorrent.advanced.dhtHint',
                'Enter one node per line in host:port format. Leave empty to use default nodes.',
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
                'qbittorrent.advanced.saveFailed',
                'Failed to save Advanced settings',
              )}
        </div>
      )}

      {/* Success Display */}
      {updatePreferences.isSuccess && (
        <div className="text-sm text-green-600 bg-green-500/10 rounded-md px-3 py-2">
          {t(
            'qbittorrent.advanced.saveSuccess',
            'Advanced settings saved successfully',
          )}
        </div>
      )}
    </form>
  )
}

/**
 * Advanced settings tab wrapper that handles loading state
 */
export function AdvancedSettingsTab() {
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
            'qbittorrent.advanced.errorLoading',
            'Failed to load Advanced settings',
          )}
        </p>
        {error instanceof Error && (
          <p className="text-sm text-muted-foreground">{error.message}</p>
        )}
      </div>
    )
  }

  return <AdvancedSettings preferences={preferences} />
}
