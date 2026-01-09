/**
 * Zod validation schemas for qBittorrent preferences settings
 *
 * Provides client-side validation for all settings forms with:
 * - Port validation (1-65535)
 * - Path validation
 * - Number ranges (including -1 for "unlimited" values)
 * - Enum validations
 * - Email validation
 *
 * @see src/types/preferences.ts for TypeScript types
 */

import { z } from 'zod'
import {
  BitTorrentProtocol,
  ContentLayout,
  DiskIOReadWriteMode,
  DiskIOType,
  DynDnsService,
  Encryption,
  FileLogAgeType,
  MaxRatioAction,
  ProxyType,
  ResumeDataStorageType,
  SchedulerDays,
  TorrentContentRemoveOption,
  TorrentStopCondition,
  UploadChokingAlgorithm,
  UploadSlotsBehavior,
  UtpTcpMixedMode,
} from '@/types/preferences'

// =============================================================================
// HELPER VALIDATORS
// =============================================================================

/**
 * Port number validator (1-65535)
 */
export const portSchema = z
  .number()
  .int()
  .min(1, 'Port must be at least 1')
  .max(65535, 'Port must be at most 65535')

/**
 * Optional port number (allows 0 to mean "use default" or "disabled")
 */
export const optionalPortSchema = z
  .number()
  .int()
  .min(0, 'Port must be at least 0')
  .max(65535, 'Port must be at most 65535')

/**
 * Non-negative integer (0 or positive)
 */
export const nonNegativeIntSchema = z
  .number()
  .int()
  .min(0, 'Value must be 0 or greater')

/**
 * Integer that allows -1 as "unlimited" along with 0 or positive values
 */
export const unlimitedOrPositiveSchema = z
  .number()
  .int()
  .min(-1, 'Value must be -1 (unlimited) or 0 or greater')

/**
 * Float that allows -1 as "unlimited" along with 0 or positive values
 */
export const unlimitedOrPositiveFloatSchema = z
  .number()
  .min(-1, 'Value must be -1 (unlimited) or 0 or greater')

/**
 * Positive integer (1 or greater)
 */
export const positiveIntSchema = z
  .number()
  .int()
  .min(1, 'Value must be at least 1')

/**
 * Hour validator (0-23)
 */
export const hourSchema = z
  .number()
  .int()
  .min(0, 'Hour must be 0-23')
  .max(23, 'Hour must be 0-23')

/**
 * Minute validator (0-59)
 */
export const minuteSchema = z
  .number()
  .int()
  .min(0, 'Minute must be 0-59')
  .max(59, 'Minute must be 0-59')

/**
 * Optional email validation (empty string is allowed)
 */
export const optionalEmailSchema = z
  .string()
  .refine(
    (val) => val === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val),
    'Invalid email address'
  )

/**
 * Path string validation (allows empty string)
 */
export const pathSchema = z.string()

/**
 * Non-empty path string validation
 */
export const requiredPathSchema = z.string().min(1, 'Path is required')

/**
 * Percentage validator (0-100)
 */
export const percentageSchema = z
  .number()
  .int()
  .min(0, 'Percentage must be 0-100')
  .max(100, 'Percentage must be 0-100')

/**
 * Timeout/duration in seconds (non-negative)
 */
export const durationSecondsSchema = z
  .number()
  .int()
  .min(0, 'Duration must be 0 or greater')

/**
 * Timeout/duration in minutes (non-negative)
 */
export const durationMinutesSchema = z
  .number()
  .int()
  .min(0, 'Duration must be 0 or greater')

/**
 * Size in bytes (non-negative)
 */
export const bytesSchema = nonNegativeIntSchema

/**
 * Size in KiB (non-negative)
 */
export const kibSchema = nonNegativeIntSchema

/**
 * Size in MiB (non-negative)
 */
export const mibSchema = nonNegativeIntSchema

// =============================================================================
// ENUM SCHEMAS
// =============================================================================

/**
 * ContentLayout enum schema
 */
export const contentLayoutSchema = z.nativeEnum(ContentLayout)

/**
 * TorrentStopCondition enum schema
 */
export const torrentStopConditionSchema = z.nativeEnum(TorrentStopCondition)

/**
 * ProxyType enum schema
 */
export const proxyTypeSchema = z.nativeEnum(ProxyType)

/**
 * Encryption enum schema
 */
export const encryptionSchema = z.nativeEnum(Encryption)

/**
 * SchedulerDays enum schema
 */
export const schedulerDaysSchema = z.nativeEnum(SchedulerDays)

/**
 * MaxRatioAction enum schema
 */
export const maxRatioActionSchema = z.nativeEnum(MaxRatioAction)

/**
 * DynDnsService enum schema
 */
export const dynDnsServiceSchema = z.nativeEnum(DynDnsService)

/**
 * BitTorrentProtocol enum schema
 */
export const bitTorrentProtocolSchema = z.nativeEnum(BitTorrentProtocol)

/**
 * UploadSlotsBehavior enum schema
 */
export const uploadSlotsBehaviorSchema = z.nativeEnum(UploadSlotsBehavior)

/**
 * UploadChokingAlgorithm enum schema
 */
export const uploadChokingAlgorithmSchema = z.nativeEnum(UploadChokingAlgorithm)

/**
 * UtpTcpMixedMode enum schema
 */
export const utpTcpMixedModeSchema = z.nativeEnum(UtpTcpMixedMode)

/**
 * DiskIOType enum schema
 */
export const diskIOTypeSchema = z.nativeEnum(DiskIOType)

/**
 * DiskIOReadWriteMode enum schema
 */
export const diskIOReadWriteModeSchema = z.nativeEnum(DiskIOReadWriteMode)

/**
 * ResumeDataStorageType enum schema
 */
export const resumeDataStorageTypeSchema = z.nativeEnum(ResumeDataStorageType)

/**
 * TorrentContentRemoveOption enum schema
 */
export const torrentContentRemoveOptionSchema = z.nativeEnum(TorrentContentRemoveOption)

/**
 * FileLogAgeType enum schema
 */
export const fileLogAgeTypeSchema = z.nativeEnum(FileLogAgeType)

// =============================================================================
// DOWNLOADS SETTINGS SCHEMA
// =============================================================================

/**
 * Downloads settings validation schema
 * ~30 parameters for torrent downloading configuration
 */
export const downloadsSettingsSchema = z.object({
  // Adding Torrents
  torrent_content_layout: z.union([contentLayoutSchema, z.string()]),
  add_to_top_of_queue: z.boolean(),
  add_stopped_enabled: z.boolean(),
  torrent_stop_condition: z.union([torrentStopConditionSchema, z.string()]),
  merge_trackers: z.boolean(),
  auto_delete_mode: nonNegativeIntSchema,
  preallocate_all: z.boolean(),
  incomplete_files_ext: z.boolean(),
  use_unwanted_folder: z.boolean().optional(),

  // Saving Management
  auto_tmm_enabled: z.boolean(),
  torrent_changed_tmm_enabled: z.boolean(),
  save_path_changed_tmm_enabled: z.boolean(),
  category_changed_tmm_enabled: z.boolean(),
  save_path: pathSchema,
  temp_path_enabled: z.boolean(),
  temp_path: pathSchema,
  use_category_paths_in_manual_mode: z.boolean().optional(),
  export_dir: pathSchema,
  export_dir_fin: pathSchema,
  excluded_file_names_enabled: z.boolean().optional(),
  excluded_file_names: z.string().optional(),

  // Email Notifications
  mail_notification_enabled: z.boolean(),
  mail_notification_sender: optionalEmailSchema,
  mail_notification_email: optionalEmailSchema,
  mail_notification_smtp: z.string(),
  mail_notification_ssl_enabled: z.boolean(),
  mail_notification_auth_enabled: z.boolean(),
  mail_notification_username: z.string(),
  mail_notification_password: z.string(), // Write-only, can be empty

  // External Programs
  autorun_on_torrent_added_enabled: z.boolean().optional(),
  autorun_on_torrent_added_program: z.string().optional(),
  autorun_enabled: z.boolean(),
  autorun_program: z.string(),
})

export type DownloadsSettingsFormData = z.infer<typeof downloadsSettingsSchema>

// =============================================================================
// SPEED SETTINGS SCHEMA
// =============================================================================

/**
 * Speed settings validation schema
 * ~12 parameters for speed limits and scheduler configuration
 */
export const speedSettingsSchema = z.object({
  // Global Rate Limits (in KiB/s, 0 = unlimited)
  dl_limit: kibSchema,
  up_limit: kibSchema,

  // Alternative Rate Limits (in KiB/s, 0 = unlimited)
  alt_dl_limit: kibSchema,
  alt_up_limit: kibSchema,

  // Rate Limit Options
  limit_utp_rate: z.boolean(),
  limit_tcp_overhead: z.boolean(),
  limit_lan_peers: z.boolean(),

  // Scheduler
  scheduler_enabled: z.boolean(),
  schedule_from_hour: hourSchema,
  schedule_from_min: minuteSchema,
  schedule_to_hour: hourSchema,
  schedule_to_min: minuteSchema,
  scheduler_days: z.union([schedulerDaysSchema, z.number().int().min(0).max(9)]),
})

export type SpeedSettingsFormData = z.infer<typeof speedSettingsSchema>

// =============================================================================
// CONNECTION SETTINGS SCHEMA
// =============================================================================

/**
 * Connection settings validation schema
 * ~30 parameters for connection configuration
 */
export const connectionSettingsSchema = z.object({
  // Listening Port
  listen_port: portSchema,
  upnp: z.boolean(),

  // Connection Limits (-1 = unlimited)
  max_connec: unlimitedOrPositiveSchema,
  max_connec_per_torrent: unlimitedOrPositiveSchema,
  max_uploads: unlimitedOrPositiveSchema,
  max_uploads_per_torrent: unlimitedOrPositiveSchema,

  // Proxy Settings
  proxy_type: z.union([proxyTypeSchema, z.string()]),
  proxy_ip: z.string(),
  proxy_port: optionalPortSchema,
  proxy_auth_enabled: z.boolean(),
  proxy_username: z.string(),
  proxy_password: z.string(), // Write-only, can be empty
  proxy_peer_connections: z.boolean(),
  proxy_hostname_lookup: z.boolean().optional(),
  proxy_bittorrent: z.boolean().optional(),
  proxy_rss: z.boolean().optional(),
  proxy_misc: z.boolean().optional(),

  // IP Filtering
  ip_filter_enabled: z.boolean(),
  ip_filter_path: pathSchema,
  ip_filter_trackers: z.boolean(),
  banned_IPs: z.string(), // Newline-separated IP addresses

  // I2P Settings (qBit 5.0+, optional)
  i2p_enabled: z.boolean().optional(),
  i2p_address: z.string().optional(),
  i2p_port: optionalPortSchema.optional(),
  i2p_mixed_mode: z.boolean().optional(),
  i2p_inbound_quantity: z.number().int().min(1).max(16).optional(),
  i2p_outbound_quantity: z.number().int().min(1).max(16).optional(),
  i2p_inbound_length: z.number().int().min(0).max(7).optional(),
  i2p_outbound_length: z.number().int().min(0).max(7).optional(),
})

export type ConnectionSettingsFormData = z.infer<typeof connectionSettingsSchema>

// =============================================================================
// BITTORRENT SETTINGS SCHEMA
// =============================================================================

/**
 * BitTorrent settings validation schema
 * ~25 parameters for BitTorrent protocol configuration
 */
export const bittorrentSettingsSchema = z.object({
  // Privacy
  dht: z.boolean(),
  pex: z.boolean(),
  lsd: z.boolean(),
  encryption: z.union([encryptionSchema, z.number().int().min(0).max(2)]),
  anonymous_mode: z.boolean(),

  // Torrent Queueing
  queueing_enabled: z.boolean(),
  max_active_checking_torrents: positiveIntSchema.optional(),
  max_active_downloads: unlimitedOrPositiveSchema,
  max_active_uploads: unlimitedOrPositiveSchema,
  max_active_torrents: unlimitedOrPositiveSchema,
  dont_count_slow_torrents: z.boolean(),
  slow_torrent_dl_rate_threshold: nonNegativeIntSchema, // KiB/s
  slow_torrent_ul_rate_threshold: nonNegativeIntSchema, // KiB/s
  slow_torrent_inactive_timer: nonNegativeIntSchema, // seconds

  // Share Ratio Limiting
  max_ratio_enabled: z.boolean(),
  max_ratio: unlimitedOrPositiveFloatSchema,
  max_seeding_time_enabled: z.boolean(),
  max_seeding_time: unlimitedOrPositiveSchema, // minutes
  max_inactive_seeding_time_enabled: z.boolean().optional(),
  max_inactive_seeding_time: unlimitedOrPositiveSchema.optional(),
  max_ratio_act: z.union([maxRatioActionSchema, z.number().int().min(0).max(3)]),

  // Automatic Trackers
  add_trackers_enabled: z.boolean(),
  add_trackers: z.string(), // Newline-separated tracker URLs
})

export type BitTorrentSettingsFormData = z.infer<typeof bittorrentSettingsSchema>

// =============================================================================
// WEBUI SETTINGS SCHEMA
// =============================================================================

/**
 * WebUI settings validation schema
 * ~25 parameters for WebUI security and configuration
 */
export const webuiSettingsSchema = z.object({
  // Interface
  web_ui_address: z.string(),
  web_ui_port: portSchema,
  web_ui_upnp: z.boolean(),
  alternative_webui_enabled: z.boolean(),
  alternative_webui_path: pathSchema,

  // Authentication
  web_ui_username: z.string().min(1, 'Username is required'),
  web_ui_password: z.string(), // Write-only, can be empty (means no change)
  bypass_local_auth: z.boolean(),
  bypass_auth_subnet_whitelist_enabled: z.boolean(),
  bypass_auth_subnet_whitelist: z.string(), // Newline-separated CIDR subnets
  web_ui_max_auth_fail_count: positiveIntSchema,
  web_ui_ban_duration: durationSecondsSchema,
  web_ui_session_timeout: durationSecondsSchema,

  // HTTPS
  use_https: z.boolean(),
  web_ui_https_cert_path: pathSchema,
  web_ui_https_key_path: pathSchema,

  // Security
  web_ui_clickjacking_protection_enabled: z.boolean(),
  web_ui_csrf_protection_enabled: z.boolean(),
  web_ui_secure_cookie_enabled: z.boolean(),
  web_ui_host_header_validation_enabled: z.boolean(),
  web_ui_domain_list: z.string(), // Comma-separated domains
  web_ui_use_custom_http_headers_enabled: z.boolean(),
  web_ui_custom_http_headers: z.string(), // Newline-separated headers

  // DDNS
  dyndns_enabled: z.boolean(),
  dyndns_service: z.union([dynDnsServiceSchema, z.number().int().min(0).max(1)]),
  dyndns_domain: z.string(),
  dyndns_username: z.string(),
  dyndns_password: z.string(), // Write-only, can be empty
})

export type WebUISettingsFormData = z.infer<typeof webuiSettingsSchema>

// =============================================================================
// RSS SETTINGS SCHEMA
// =============================================================================

/**
 * RSS settings validation schema
 * ~8 parameters for RSS processing and auto-downloading
 */
export const rssSettingsSchema = z.object({
  // RSS Processing
  rss_processing_enabled: z.boolean(),
  rss_refresh_interval: positiveIntSchema, // minutes
  rss_fetch_delay: nonNegativeIntSchema.optional(), // milliseconds (newer qBit)
  rss_max_articles_per_feed: positiveIntSchema,

  // Auto-Downloading
  rss_auto_downloading_enabled: z.boolean(),
  rss_download_repack_proper_episodes: z.boolean(),

  // Smart Episode Filters
  rss_smart_episode_filters: z.string(), // Newline-separated regex patterns
})

export type RssSettingsFormData = z.infer<typeof rssSettingsSchema>

// =============================================================================
// BEHAVIOR SETTINGS SCHEMA
// =============================================================================

/**
 * Behavior settings validation schema
 * ~13 parameters for general behavior and logging
 */
export const behaviorSettingsSchema = z.object({
  // General Behavior (all optional as they vary by qBit version)
  locale: z.string().optional(),
  performance_warning: z.boolean().optional(),
  confirm_torrent_deletion: z.boolean().optional(),
  confirm_torrent_recheck: z.boolean().optional(),
  app_instance_name: z.string().optional(),
  refresh_interval: positiveIntSchema.optional(), // milliseconds

  // File Logging
  file_log_enabled: z.boolean(),
  file_log_path: pathSchema,
  file_log_backup_enabled: z.boolean(),
  file_log_max_size: positiveIntSchema, // KB
  file_log_delete_old: z.boolean(),
  file_log_age: positiveIntSchema,
  file_log_age_type: z.union([fileLogAgeTypeSchema, z.number().int().min(0).max(2)]),
})

export type BehaviorSettingsFormData = z.infer<typeof behaviorSettingsSchema>

// =============================================================================
// ADVANCED SETTINGS SCHEMA
// =============================================================================

/**
 * Advanced settings validation schema
 * ~70+ parameters for libtorrent and qBittorrent tuning
 */
export const advancedSettingsSchema = z.object({
  // qBittorrent Settings
  resume_data_storage_type: z.union([resumeDataStorageTypeSchema, z.string()]).optional(),
  torrent_content_remove_option: z.union([torrentContentRemoveOptionSchema, z.string()]).optional(),
  memory_working_set_limit: mibSchema.optional(),
  current_network_interface: z.string(),
  current_interface_address: z.string(),
  save_resume_data_interval: durationMinutesSchema,
  save_statistics_interval: durationMinutesSchema.optional(),
  torrent_file_size_limit: bytesSchema.optional(),
  recheck_completed_torrents: z.boolean(),
  resolve_peer_countries: z.boolean(),
  reannounce_when_address_changed: z.boolean().optional(),

  // Embedded Tracker
  enable_embedded_tracker: z.boolean(),
  embedded_tracker_port: portSchema,
  embedded_tracker_port_forwarding: z.boolean().optional(),

  // libtorrent Disk I/O
  bdecode_depth_limit: positiveIntSchema.optional(),
  bdecode_token_limit: positiveIntSchema.optional(),
  async_io_threads: positiveIntSchema,
  hashing_threads: positiveIntSchema.optional(),
  file_pool_size: positiveIntSchema,
  checking_memory_use: mibSchema,
  disk_cache: unlimitedOrPositiveSchema, // MiB, -1 = auto
  disk_cache_ttl: durationSecondsSchema,
  disk_queue_size: bytesSchema.optional(),
  disk_io_type: z.union([diskIOTypeSchema, z.number().int().min(0).max(2)]).optional(),
  disk_io_read_mode: z.union([diskIOReadWriteModeSchema, z.number().int().min(0).max(2)]).optional(),
  disk_io_write_mode: z.union([diskIOReadWriteModeSchema, z.number().int().min(0).max(2)]).optional(),
  enable_coalesce_read_write: z.boolean(),
  enable_piece_extent_affinity: z.boolean().optional(),
  enable_upload_suggestions: z.boolean().optional(),

  // Network Buffers
  send_buffer_watermark: kibSchema,
  send_buffer_low_watermark: kibSchema,
  send_buffer_watermark_factor: percentageSchema,
  socket_send_buffer_size: bytesSchema.optional(), // 0 = OS default
  socket_receive_buffer_size: bytesSchema.optional(), // 0 = OS default
  socket_backlog_size: nonNegativeIntSchema,

  // Connections
  connection_speed: positiveIntSchema.optional(), // connections/second
  outgoing_ports_min: optionalPortSchema,
  outgoing_ports_max: optionalPortSchema,
  upnp_lease_duration: durationSecondsSchema, // 0 = permanent
  peer_tos: nonNegativeIntSchema.optional(), // ToS field value
  utp_tcp_mixed_mode: z.union([utpTcpMixedModeSchema, z.number().int().min(0).max(1)]),
  hostname_cache_ttl: durationSecondsSchema.optional(),
  idn_support_enabled: z.boolean().optional(),
  enable_multi_connections_from_same_ip: z.boolean(),
  validate_https_tracker_certificate: z.boolean().optional(),
  ssrf_mitigation: z.boolean().optional(),
  block_peers_on_privileged_ports: z.boolean().optional(),

  // Upload & Choking
  upload_slots_behavior: z.union([uploadSlotsBehaviorSchema, z.number().int().min(0).max(1)]),
  upload_choking_algorithm: z.union([uploadChokingAlgorithmSchema, z.number().int().min(0).max(2)]),

  // Tracker Settings
  announce_to_all_trackers: z.boolean(),
  announce_to_all_tiers: z.boolean(),
  announce_ip: z.string(),
  announce_port: optionalPortSchema.optional(), // 0 = use listen port
  max_concurrent_http_announces: positiveIntSchema.optional(),
  stop_tracker_timeout: durationSecondsSchema,

  // Peer Settings
  peer_turnover: percentageSchema.optional(),
  peer_turnover_cutoff: percentageSchema.optional(),
  peer_turnover_interval: durationSecondsSchema.optional(),
  request_queue_size: positiveIntSchema.optional(),

  // DHT Bootstrap Nodes
  dht_bootstrap_nodes: z.string().optional(), // Newline-separated host:port

  // Security
  mark_of_the_web: z.boolean().optional(),
  ignore_ssl_errors: z.boolean().optional(),
  python_executable_path: pathSchema.optional(),
})

export type AdvancedSettingsFormData = z.infer<typeof advancedSettingsSchema>

// =============================================================================
// CATEGORY SCHEMA
// =============================================================================

/**
 * Category creation/edit validation schema
 */
export const categorySchema = z.object({
  name: z.string().min(1, 'Category name is required'),
  savePath: pathSchema,
  downloadPath: pathSchema.optional(),
})

export type CategoryFormData = z.infer<typeof categorySchema>

// =============================================================================
// TAG SCHEMA
// =============================================================================

/**
 * Tag creation validation schema
 */
export const tagSchema = z.object({
  name: z.string().min(1, 'Tag name is required').max(100, 'Tag name is too long'),
})

export type TagFormData = z.infer<typeof tagSchema>

// =============================================================================
// COMPLETE PREFERENCES SCHEMA
// =============================================================================

/**
 * Combined complete preferences schema for full validation
 * This merges all settings schemas into one comprehensive schema
 */
export const completePreferencesSchema = z.object({
  // Behavior Settings
  locale: z.string().optional(),
  performance_warning: z.boolean().optional(),
  confirm_torrent_deletion: z.boolean().optional(),
  confirm_torrent_recheck: z.boolean().optional(),
  app_instance_name: z.string().optional(),
  refresh_interval: positiveIntSchema.optional(),

  // File Logging
  file_log_enabled: z.boolean(),
  file_log_path: pathSchema,
  file_log_backup_enabled: z.boolean(),
  file_log_max_size: positiveIntSchema,
  file_log_delete_old: z.boolean(),
  file_log_age: positiveIntSchema,
  file_log_age_type: z.union([fileLogAgeTypeSchema, z.number().int().min(0).max(2)]),

  // Downloads - Adding Torrents
  torrent_content_layout: z.union([contentLayoutSchema, z.string()]),
  add_to_top_of_queue: z.boolean(),
  add_stopped_enabled: z.boolean(),
  torrent_stop_condition: z.union([torrentStopConditionSchema, z.string()]).optional(),
  merge_trackers: z.boolean(),
  auto_delete_mode: nonNegativeIntSchema,
  preallocate_all: z.boolean(),
  incomplete_files_ext: z.boolean(),
  use_unwanted_folder: z.boolean().optional(),

  // Downloads - Saving Management
  auto_tmm_enabled: z.boolean(),
  torrent_changed_tmm_enabled: z.boolean(),
  save_path_changed_tmm_enabled: z.boolean(),
  category_changed_tmm_enabled: z.boolean(),
  save_path: pathSchema,
  temp_path_enabled: z.boolean(),
  temp_path: pathSchema,
  use_category_paths_in_manual_mode: z.boolean().optional(),
  export_dir: pathSchema,
  export_dir_fin: pathSchema,
  excluded_file_names_enabled: z.boolean().optional(),
  excluded_file_names: z.string().optional(),

  // Downloads - Email Notifications
  mail_notification_enabled: z.boolean(),
  mail_notification_sender: z.string(),
  mail_notification_email: z.string(),
  mail_notification_smtp: z.string(),
  mail_notification_ssl_enabled: z.boolean(),
  mail_notification_auth_enabled: z.boolean(),
  mail_notification_username: z.string(),
  mail_notification_password: z.string().optional(),

  // Downloads - External Programs
  autorun_on_torrent_added_enabled: z.boolean().optional(),
  autorun_on_torrent_added_program: z.string().optional(),
  autorun_enabled: z.boolean(),
  autorun_program: z.string(),

  // Connection - Listening Port
  listen_port: portSchema,
  ssl_enabled: z.boolean().optional(),
  ssl_listen_port: portSchema.optional(),
  random_port: z.boolean().optional(),
  upnp: z.boolean(),

  // Connection - Connection Limits
  max_connec: unlimitedOrPositiveSchema,
  max_connec_per_torrent: unlimitedOrPositiveSchema,
  max_uploads: unlimitedOrPositiveSchema,
  max_uploads_per_torrent: unlimitedOrPositiveSchema,

  // Connection - I2P (qBit 5.0+)
  i2p_enabled: z.boolean().optional(),
  i2p_address: z.string().optional(),
  i2p_port: optionalPortSchema.optional(),
  i2p_mixed_mode: z.boolean().optional(),
  i2p_inbound_quantity: z.number().int().min(1).max(16).optional(),
  i2p_outbound_quantity: z.number().int().min(1).max(16).optional(),
  i2p_inbound_length: z.number().int().min(0).max(7).optional(),
  i2p_outbound_length: z.number().int().min(0).max(7).optional(),

  // Connection - Proxy Settings
  proxy_type: z.union([proxyTypeSchema, z.string()]),
  proxy_ip: z.string(),
  proxy_port: optionalPortSchema,
  proxy_auth_enabled: z.boolean(),
  proxy_username: z.string(),
  proxy_password: z.string().optional(),
  proxy_hostname_lookup: z.boolean().optional(),
  proxy_bittorrent: z.boolean().optional(),
  proxy_peer_connections: z.boolean(),
  proxy_rss: z.boolean().optional(),
  proxy_misc: z.boolean().optional(),
  proxy_torrents_only: z.boolean().optional(),

  // Connection - IP Filtering
  ip_filter_enabled: z.boolean(),
  ip_filter_path: pathSchema,
  ip_filter_trackers: z.boolean(),
  banned_IPs: z.string(),

  // Speed - Global Rate Limits (bytes/s)
  dl_limit: nonNegativeIntSchema,
  up_limit: nonNegativeIntSchema,
  alt_dl_limit: nonNegativeIntSchema,
  alt_up_limit: nonNegativeIntSchema,
  bittorrent_protocol: z.union([bitTorrentProtocolSchema, z.number().int().min(0).max(2)]),
  limit_utp_rate: z.boolean(),
  limit_tcp_overhead: z.boolean(),
  limit_lan_peers: z.boolean(),

  // Speed - Scheduler
  scheduler_enabled: z.boolean(),
  schedule_from_hour: hourSchema,
  schedule_from_min: minuteSchema,
  schedule_to_hour: hourSchema,
  schedule_to_min: minuteSchema,
  scheduler_days: z.union([schedulerDaysSchema, z.number().int().min(0).max(9)]),

  // BitTorrent - Privacy
  dht: z.boolean(),
  pex: z.boolean(),
  lsd: z.boolean(),
  encryption: z.union([encryptionSchema, z.number().int().min(0).max(2)]),
  anonymous_mode: z.boolean(),

  // BitTorrent - Torrent Queueing
  max_active_checking_torrents: positiveIntSchema.optional(),
  queueing_enabled: z.boolean(),
  max_active_downloads: unlimitedOrPositiveSchema,
  max_active_torrents: unlimitedOrPositiveSchema,
  max_active_uploads: unlimitedOrPositiveSchema,
  dont_count_slow_torrents: z.boolean(),
  slow_torrent_dl_rate_threshold: nonNegativeIntSchema,
  slow_torrent_ul_rate_threshold: nonNegativeIntSchema,
  slow_torrent_inactive_timer: nonNegativeIntSchema,

  // BitTorrent - Share Ratio Limiting
  max_ratio_enabled: z.boolean(),
  max_ratio: unlimitedOrPositiveFloatSchema,
  max_seeding_time_enabled: z.boolean(),
  max_seeding_time: unlimitedOrPositiveSchema,
  max_inactive_seeding_time_enabled: z.boolean().optional(),
  max_inactive_seeding_time: unlimitedOrPositiveSchema.optional(),
  max_ratio_act: z.union([maxRatioActionSchema, z.number().int().min(0).max(3)]),

  // BitTorrent - Trackers
  add_trackers_enabled: z.boolean(),
  add_trackers: z.string(),
  add_trackers_from_url_enabled: z.boolean().optional(),
  add_trackers_url: z.string().optional(),
  add_trackers_url_list: z.string().optional(),

  // WebUI - HTTP Server
  web_ui_domain_list: z.string(),
  web_ui_address: z.string(),
  web_ui_port: portSchema,
  web_ui_upnp: z.boolean(),
  use_https: z.boolean(),
  web_ui_https_cert_path: pathSchema,
  web_ui_https_key_path: pathSchema,

  // WebUI - Authentication
  web_ui_username: z.string(),
  web_ui_password: z.string().optional(),
  bypass_local_auth: z.boolean(),
  bypass_auth_subnet_whitelist_enabled: z.boolean(),
  bypass_auth_subnet_whitelist: z.string(),
  web_ui_max_auth_fail_count: positiveIntSchema,
  web_ui_ban_duration: durationSecondsSchema,
  web_ui_session_timeout: durationSecondsSchema,

  // WebUI - Security
  web_ui_api_key: z.string().optional(),
  alternative_webui_enabled: z.boolean(),
  alternative_webui_path: pathSchema,
  web_ui_clickjacking_protection_enabled: z.boolean(),
  web_ui_csrf_protection_enabled: z.boolean(),
  web_ui_secure_cookie_enabled: z.boolean(),
  web_ui_host_header_validation_enabled: z.boolean(),
  web_ui_use_custom_http_headers_enabled: z.boolean(),
  web_ui_custom_http_headers: z.string(),
  web_ui_reverse_proxy_enabled: z.boolean().optional(),
  web_ui_reverse_proxies_list: z.string().optional(),

  // WebUI - Dynamic DNS
  dyndns_enabled: z.boolean(),
  dyndns_service: z.union([dynDnsServiceSchema, z.number().int().min(0).max(1)]),
  dyndns_username: z.string(),
  dyndns_password: z.string().optional(),
  dyndns_domain: z.string(),

  // RSS Settings
  rss_refresh_interval: positiveIntSchema,
  rss_fetch_delay: nonNegativeIntSchema.optional(),
  rss_max_articles_per_feed: positiveIntSchema,
  rss_processing_enabled: z.boolean(),
  rss_auto_downloading_enabled: z.boolean(),
  rss_download_repack_proper_episodes: z.boolean(),
  rss_smart_episode_filters: z.string(),

  // Advanced - qBittorrent Settings
  resume_data_storage_type: z.union([resumeDataStorageTypeSchema, z.string()]).optional(),
  torrent_content_remove_option: z.union([torrentContentRemoveOptionSchema, z.string()]).optional(),
  memory_working_set_limit: mibSchema.optional(),
  current_network_interface: z.string(),
  current_interface_name: z.string().optional(),
  current_interface_address: z.string(),
  save_resume_data_interval: durationMinutesSchema,
  save_statistics_interval: durationMinutesSchema.optional(),
  torrent_file_size_limit: bytesSchema.optional(),
  recheck_completed_torrents: z.boolean(),
  resolve_peer_countries: z.boolean(),
  reannounce_when_address_changed: z.boolean().optional(),
  enable_embedded_tracker: z.boolean(),
  embedded_tracker_port: portSchema,
  embedded_tracker_port_forwarding: z.boolean().optional(),
  mark_of_the_web: z.boolean().optional(),
  ignore_ssl_errors: z.boolean().optional(),
  python_executable_path: pathSchema.optional(),

  // Advanced - libtorrent Settings
  bdecode_depth_limit: positiveIntSchema.optional(),
  bdecode_token_limit: positiveIntSchema.optional(),
  async_io_threads: positiveIntSchema,
  hashing_threads: positiveIntSchema.optional(),
  file_pool_size: positiveIntSchema,
  checking_memory_use: mibSchema,
  disk_cache: unlimitedOrPositiveSchema,
  disk_cache_ttl: durationSecondsSchema,
  disk_queue_size: bytesSchema.optional(),
  disk_io_type: z.union([diskIOTypeSchema, z.number().int().min(0).max(2)]).optional(),
  disk_io_read_mode: z.union([diskIOReadWriteModeSchema, z.number().int().min(0).max(2)]).optional(),
  disk_io_write_mode: z.union([diskIOReadWriteModeSchema, z.number().int().min(0).max(2)]).optional(),
  enable_coalesce_read_write: z.boolean(),
  enable_piece_extent_affinity: z.boolean().optional(),
  enable_upload_suggestions: z.boolean().optional(),
  send_buffer_watermark: kibSchema,
  send_buffer_low_watermark: kibSchema,
  send_buffer_watermark_factor: percentageSchema,
  connection_speed: positiveIntSchema.optional(),
  socket_send_buffer_size: bytesSchema.optional(),
  socket_receive_buffer_size: bytesSchema.optional(),
  socket_backlog_size: nonNegativeIntSchema,
  outgoing_ports_min: optionalPortSchema,
  outgoing_ports_max: optionalPortSchema,
  upnp_lease_duration: durationSecondsSchema,
  peer_tos: nonNegativeIntSchema.optional(),
  utp_tcp_mixed_mode: z.union([utpTcpMixedModeSchema, z.number().int().min(0).max(1)]),
  hostname_cache_ttl: durationSecondsSchema.optional(),
  idn_support_enabled: z.boolean().optional(),
  enable_multi_connections_from_same_ip: z.boolean(),
  validate_https_tracker_certificate: z.boolean().optional(),
  ssrf_mitigation: z.boolean().optional(),
  block_peers_on_privileged_ports: z.boolean().optional(),
  upload_slots_behavior: z.union([uploadSlotsBehaviorSchema, z.number().int().min(0).max(1)]),
  upload_choking_algorithm: z.union([uploadChokingAlgorithmSchema, z.number().int().min(0).max(2)]),
  announce_to_all_trackers: z.boolean(),
  announce_to_all_tiers: z.boolean(),
  announce_ip: z.string(),
  announce_port: optionalPortSchema.optional(),
  max_concurrent_http_announces: positiveIntSchema.optional(),
  stop_tracker_timeout: durationSecondsSchema,
  peer_turnover: percentageSchema.optional(),
  peer_turnover_cutoff: percentageSchema.optional(),
  peer_turnover_interval: durationSecondsSchema.optional(),
  request_queue_size: positiveIntSchema.optional(),
  dht_bootstrap_nodes: z.string().optional(),

  // Deprecated fields (for backwards compatibility)
  start_paused_enabled: z.boolean().optional(),
  create_subfolder_enabled: z.boolean().optional(),
  enable_os_cache: z.boolean().optional(),
})

export type CompletePreferencesFormData = z.infer<typeof completePreferencesSchema>

// =============================================================================
// VALIDATION UTILITIES
// =============================================================================

/**
 * Validates port number
 */
export function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535
}

/**
 * Validates port number allowing 0
 */
export function isValidOptionalPort(port: number): boolean {
  return Number.isInteger(port) && port >= 0 && port <= 65535
}

/**
 * Validates email address
 */
export function isValidEmail(email: string): boolean {
  if (!email) return true // Empty is allowed
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/**
 * Validates hour value (0-23)
 */
export function isValidHour(hour: number): boolean {
  return Number.isInteger(hour) && hour >= 0 && hour <= 23
}

/**
 * Validates minute value (0-59)
 */
export function isValidMinute(minute: number): boolean {
  return Number.isInteger(minute) && minute >= 0 && minute <= 59
}

/**
 * Validates percentage value (0-100)
 */
export function isValidPercentage(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 100
}

/**
 * Validates unlimited or positive value (-1 or >= 0)
 */
export function isValidUnlimitedOrPositive(value: number): boolean {
  return Number.isInteger(value) && value >= -1
}

/**
 * Partial schema for validating only changed fields
 * Use this with z.object() schemas to make all fields optional
 */
export function createPartialSchema<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  return schema.partial()
}
