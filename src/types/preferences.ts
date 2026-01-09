/**
 * TypeScript type definitions for qBittorrent AppPreferences
 * Data structure from qBittorrent Web API v2 /api/v2/app/preferences endpoint
 *
 * @see https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-4.1)#get-application-preferences
 */

// =============================================================================
// ENUMS
// =============================================================================

/**
 * Torrent content layout when adding new torrents
 */
export enum ContentLayout {
  ORIGINAL = 'Original',
  SUBFOLDER = 'Subfolder',
  NO_SUBFOLDER = 'NoSubfolder',
}

/**
 * Labels for ContentLayout enum for UI display
 */
export const ContentLayoutLabels: Record<ContentLayout, string> = {
  [ContentLayout.ORIGINAL]: 'preferences.contentLayout.original',
  [ContentLayout.SUBFOLDER]: 'preferences.contentLayout.subfolder',
  [ContentLayout.NO_SUBFOLDER]: 'preferences.contentLayout.noSubfolder',
}

/**
 * Torrent stop condition after metadata is retrieved
 */
export enum TorrentStopCondition {
  NONE = 'None',
  METADATA_RECEIVED = 'MetadataReceived',
}

/**
 * Labels for TorrentStopCondition enum for UI display
 */
export const TorrentStopConditionLabels: Record<TorrentStopCondition, string> = {
  [TorrentStopCondition.NONE]: 'preferences.stopCondition.none',
  [TorrentStopCondition.METADATA_RECEIVED]: 'preferences.stopCondition.metadataReceived',
}

/**
 * Proxy type for connections
 */
export enum ProxyType {
  NONE = 'None',
  HTTP = 'HTTP',
  SOCKS5 = 'SOCKS5',
  SOCKS4 = 'SOCKS4',
}

/**
 * Labels for ProxyType enum for UI display
 */
export const ProxyTypeLabels: Record<ProxyType, string> = {
  [ProxyType.NONE]: 'preferences.proxy.none',
  [ProxyType.HTTP]: 'preferences.proxy.http',
  [ProxyType.SOCKS5]: 'preferences.proxy.socks5',
  [ProxyType.SOCKS4]: 'preferences.proxy.socks4',
}

/**
 * BitTorrent protocol encryption mode
 * 0 = Prefer encryption, 1 = Force encryption, 2 = Disable encryption
 */
export enum Encryption {
  PREFER = 0,
  FORCE_ON = 1,
  FORCE_OFF = 2,
}

/**
 * Labels for Encryption enum for UI display
 */
export const EncryptionLabels: Record<Encryption, string> = {
  [Encryption.PREFER]: 'preferences.encryption.prefer',
  [Encryption.FORCE_ON]: 'preferences.encryption.forceOn',
  [Encryption.FORCE_OFF]: 'preferences.encryption.forceOff',
}

/**
 * BitTorrent protocol version
 * 0 = TCP and uTP, 1 = TCP only, 2 = uTP only
 */
export enum BitTorrentProtocol {
  BOTH = 0,
  TCP = 1,
  UTP = 2,
}

/**
 * Labels for BitTorrentProtocol enum for UI display
 */
export const BitTorrentProtocolLabels: Record<BitTorrentProtocol, string> = {
  [BitTorrentProtocol.BOTH]: 'preferences.protocol.both',
  [BitTorrentProtocol.TCP]: 'preferences.protocol.tcp',
  [BitTorrentProtocol.UTP]: 'preferences.protocol.utp',
}

/**
 * Days for bandwidth scheduler
 * Bitmask: 0=Every day, 1=Weekdays, 2=Weekends, 3-9=Specific days
 */
export enum SchedulerDays {
  EVERY_DAY = 0,
  WEEKDAYS = 1,
  WEEKENDS = 2,
  MONDAY = 3,
  TUESDAY = 4,
  WEDNESDAY = 5,
  THURSDAY = 6,
  FRIDAY = 7,
  SATURDAY = 8,
  SUNDAY = 9,
}

/**
 * Labels for SchedulerDays enum for UI display
 */
export const SchedulerDaysLabels: Record<SchedulerDays, string> = {
  [SchedulerDays.EVERY_DAY]: 'preferences.scheduler.everyDay',
  [SchedulerDays.WEEKDAYS]: 'preferences.scheduler.weekdays',
  [SchedulerDays.WEEKENDS]: 'preferences.scheduler.weekends',
  [SchedulerDays.MONDAY]: 'preferences.scheduler.monday',
  [SchedulerDays.TUESDAY]: 'preferences.scheduler.tuesday',
  [SchedulerDays.WEDNESDAY]: 'preferences.scheduler.wednesday',
  [SchedulerDays.THURSDAY]: 'preferences.scheduler.thursday',
  [SchedulerDays.FRIDAY]: 'preferences.scheduler.friday',
  [SchedulerDays.SATURDAY]: 'preferences.scheduler.saturday',
  [SchedulerDays.SUNDAY]: 'preferences.scheduler.sunday',
}

/**
 * Action to take when max ratio or seeding time is reached
 */
export enum MaxRatioAction {
  PAUSE = 0,
  REMOVE = 1,
  REMOVE_WITH_CONTENT = 3,
  ENABLE_SUPER_SEEDING = 2,
}

/**
 * Labels for MaxRatioAction enum for UI display
 */
export const MaxRatioActionLabels: Record<MaxRatioAction, string> = {
  [MaxRatioAction.PAUSE]: 'preferences.maxRatioAction.pause',
  [MaxRatioAction.REMOVE]: 'preferences.maxRatioAction.remove',
  [MaxRatioAction.REMOVE_WITH_CONTENT]: 'preferences.maxRatioAction.removeWithContent',
  [MaxRatioAction.ENABLE_SUPER_SEEDING]: 'preferences.maxRatioAction.enableSuperSeeding',
}

/**
 * Dynamic DNS service provider
 */
export enum DynDnsService {
  DYNDNS = 0,
  NOIP = 1,
}

/**
 * Labels for DynDnsService enum for UI display
 */
export const DynDnsServiceLabels: Record<DynDnsService, string> = {
  [DynDnsService.DYNDNS]: 'preferences.dyndns.dyndns',
  [DynDnsService.NOIP]: 'preferences.dyndns.noip',
}

/**
 * Upload slots behavior
 */
export enum UploadSlotsBehavior {
  FIXED_SLOTS = 0,
  UPLOAD_RATE_BASED = 1,
}

/**
 * Labels for UploadSlotsBehavior enum for UI display
 */
export const UploadSlotsBehaviorLabels: Record<UploadSlotsBehavior, string> = {
  [UploadSlotsBehavior.FIXED_SLOTS]: 'preferences.uploadSlots.fixedSlots',
  [UploadSlotsBehavior.UPLOAD_RATE_BASED]: 'preferences.uploadSlots.uploadRateBased',
}

/**
 * Upload choking algorithm
 */
export enum UploadChokingAlgorithm {
  ROUND_ROBIN = 0,
  FASTEST_UPLOAD = 1,
  ANTI_LEECH = 2,
}

/**
 * Labels for UploadChokingAlgorithm enum for UI display
 */
export const UploadChokingAlgorithmLabels: Record<UploadChokingAlgorithm, string> = {
  [UploadChokingAlgorithm.ROUND_ROBIN]: 'preferences.uploadChoking.roundRobin',
  [UploadChokingAlgorithm.FASTEST_UPLOAD]: 'preferences.uploadChoking.fastestUpload',
  [UploadChokingAlgorithm.ANTI_LEECH]: 'preferences.uploadChoking.antiLeech',
}

/**
 * uTP-TCP mixed mode algorithm
 */
export enum UtpTcpMixedMode {
  PREFER_TCP = 0,
  PEER_PROPORTIONAL = 1,
}

/**
 * Labels for UtpTcpMixedMode enum for UI display
 */
export const UtpTcpMixedModeLabels: Record<UtpTcpMixedMode, string> = {
  [UtpTcpMixedMode.PREFER_TCP]: 'preferences.utpTcpMixed.preferTcp',
  [UtpTcpMixedMode.PEER_PROPORTIONAL]: 'preferences.utpTcpMixed.peerProportional',
}

/**
 * Disk I/O type
 */
export enum DiskIOType {
  DEFAULT = 0,
  MEMORY_MAPPED_FILES = 1,
  POSIX_COMPLIANT = 2,
}

/**
 * Labels for DiskIOType enum for UI display
 */
export const DiskIOTypeLabels: Record<DiskIOType, string> = {
  [DiskIOType.DEFAULT]: 'preferences.diskIO.default',
  [DiskIOType.MEMORY_MAPPED_FILES]: 'preferences.diskIO.memoryMapped',
  [DiskIOType.POSIX_COMPLIANT]: 'preferences.diskIO.posixCompliant',
}

/**
 * Disk I/O read/write mode
 */
export enum DiskIOReadWriteMode {
  ENABLE_OS_CACHE = 0,
  DISABLE_OS_CACHE = 1,
  WRITE_THROUGH = 2,
}

/**
 * Labels for DiskIOReadWriteMode enum for UI display
 */
export const DiskIOReadWriteModeLabels: Record<DiskIOReadWriteMode, string> = {
  [DiskIOReadWriteMode.ENABLE_OS_CACHE]: 'preferences.diskIOMode.enableOsCache',
  [DiskIOReadWriteMode.DISABLE_OS_CACHE]: 'preferences.diskIOMode.disableOsCache',
  [DiskIOReadWriteMode.WRITE_THROUGH]: 'preferences.diskIOMode.writeThrough',
}

/**
 * Resume data storage type
 */
export enum ResumeDataStorageType {
  LEGACY = 'Legacy',
  SQLITE = 'SQLite',
}

/**
 * Labels for ResumeDataStorageType enum for UI display
 */
export const ResumeDataStorageTypeLabels: Record<ResumeDataStorageType, string> = {
  [ResumeDataStorageType.LEGACY]: 'preferences.resumeDataStorage.legacy',
  [ResumeDataStorageType.SQLITE]: 'preferences.resumeDataStorage.sqlite',
}

/**
 * Torrent content remove option when deleting
 */
export enum TorrentContentRemoveOption {
  DELETE = 'Delete',
  MOVE_TO_TRASH = 'MoveToTrash',
}

/**
 * Labels for TorrentContentRemoveOption enum for UI display
 */
export const TorrentContentRemoveOptionLabels: Record<TorrentContentRemoveOption, string> = {
  [TorrentContentRemoveOption.DELETE]: 'preferences.contentRemove.delete',
  [TorrentContentRemoveOption.MOVE_TO_TRASH]: 'preferences.contentRemove.moveToTrash',
}

/**
 * File log age type unit
 */
export enum FileLogAgeType {
  DAYS = 0,
  MONTHS = 1,
  YEARS = 2,
}

/**
 * Labels for FileLogAgeType enum for UI display
 */
export const FileLogAgeTypeLabels: Record<FileLogAgeType, string> = {
  [FileLogAgeType.DAYS]: 'preferences.fileLogAge.days',
  [FileLogAgeType.MONTHS]: 'preferences.fileLogAge.months',
  [FileLogAgeType.YEARS]: 'preferences.fileLogAge.years',
}

/**
 * Scan directory download type
 * 0 = Download to default save path
 * 1 = Download to monitored folder
 * Custom string = Download to specified path
 */
export type ScanDirDownloadType = 0 | 1 | string

/**
 * Scan directories configuration
 * Key: monitored folder path
 * Value: download type (0 = default path, 1 = monitored folder, string = custom path)
 */
export type ScanDirs = Record<string, ScanDirDownloadType>

// =============================================================================
// MAIN PREFERENCES INTERFACE
// =============================================================================

/**
 * Complete qBittorrent application preferences
 * Data structure from qBittorrent Web API v2 /api/v2/app/preferences endpoint
 *
 * Note: Fields marked with comments indicate their category and any special handling
 */
export type AppPreferences = {
  // ---------------------------------------------------------------------------
  // Behavior Settings
  // ---------------------------------------------------------------------------
  /** Application locale (e.g., "en", "zh_TW") */
  locale: string
  /** Show performance warning on startup */
  performance_warning?: boolean
  /** Show external IP in status bar */
  status_bar_external_ip?: boolean
  /** Confirm when deleting torrents */
  confirm_torrent_deletion?: boolean
  /** Confirm before rechecking torrents */
  confirm_torrent_recheck?: boolean
  /** Application instance name for identifying multiple qBittorrent instances */
  app_instance_name?: string
  /** UI refresh interval in milliseconds */
  refresh_interval?: number

  // ---------------------------------------------------------------------------
  // File Logging Settings
  // ---------------------------------------------------------------------------
  /** Enable logging to file */
  file_log_enabled: boolean
  /** Path for log file */
  file_log_path: string
  /** Enable log file backup */
  file_log_backup_enabled: boolean
  /** Maximum log file size in KB */
  file_log_max_size: number
  /** Delete old log files */
  file_log_delete_old: boolean
  /** Age threshold for deleting old logs */
  file_log_age: number
  /** Unit for file_log_age (0=days, 1=months, 2=years) */
  file_log_age_type: FileLogAgeType
  /** Delete torrent content files when removing torrent */
  delete_torrent_content_files?: boolean

  // ---------------------------------------------------------------------------
  // Downloads - Adding Torrents
  // ---------------------------------------------------------------------------
  /** Default content layout for new torrents */
  torrent_content_layout: ContentLayout | string
  /** Add new torrents to top of queue */
  add_to_top_of_queue: boolean
  /** Add new torrents in stopped/paused state */
  add_stopped_enabled: boolean
  /** Condition to stop torrent after adding */
  torrent_stop_condition: TorrentStopCondition | string
  /** Merge trackers when adding duplicate torrent */
  merge_trackers: boolean
  /** Auto-delete mode (0=never, 1=on completion) */
  auto_delete_mode: number
  /** Pre-allocate disk space for all files */
  preallocate_all: boolean
  /** Append .!qB extension to incomplete files */
  incomplete_files_ext: boolean
  /** Use separate folder for unwanted files */
  use_unwanted_folder?: boolean

  // ---------------------------------------------------------------------------
  // Downloads - Saving Management
  // ---------------------------------------------------------------------------
  /** Enable automatic torrent management */
  auto_tmm_enabled: boolean
  /** Relocate torrent when its category changes */
  torrent_changed_tmm_enabled: boolean
  /** Relocate torrent when default save path changes */
  save_path_changed_tmm_enabled: boolean
  /** Relocate torrent when its category's save path changes */
  category_changed_tmm_enabled: boolean
  /** Default save path for downloads */
  save_path: string
  /** Enable separate path for incomplete downloads */
  temp_path_enabled: boolean
  /** Path for incomplete downloads */
  temp_path: string
  /** Use category paths in manual mode */
  use_category_paths_in_manual_mode?: boolean
  /** Path to copy .torrent files after adding */
  export_dir: string
  /** Path to copy .torrent files after completion */
  export_dir_fin: string
  /** Watched folders configuration (deprecated, use scan_dirs) */
  scan_dirs: ScanDirs
  /** Enable file name exclusion filter */
  excluded_file_names_enabled?: boolean
  /** Excluded file name patterns (one per line) */
  excluded_file_names?: string

  // ---------------------------------------------------------------------------
  // Downloads - Email Notifications
  // ---------------------------------------------------------------------------
  /** Enable email notification on torrent completion */
  mail_notification_enabled: boolean
  /** Sender email address */
  mail_notification_sender: string
  /** Recipient email address */
  mail_notification_email: string
  /** SMTP server address */
  mail_notification_smtp: string
  /** Enable SSL for SMTP */
  mail_notification_ssl_enabled: boolean
  /** Enable SMTP authentication */
  mail_notification_auth_enabled: boolean
  /** SMTP username */
  mail_notification_username: string
  /** SMTP password (write-only, not returned by GET) */
  mail_notification_password: string

  // ---------------------------------------------------------------------------
  // Downloads - External Programs
  // ---------------------------------------------------------------------------
  /** Run external program when torrent is added */
  autorun_on_torrent_added_enabled?: boolean
  /** External program to run when torrent is added */
  autorun_on_torrent_added_program?: string
  /** Run external program on torrent completion */
  autorun_enabled: boolean
  /** External program to run on torrent completion */
  autorun_program: string

  // ---------------------------------------------------------------------------
  // Connection - Listening Port
  // ---------------------------------------------------------------------------
  /** Port for incoming connections */
  listen_port: number
  /** Enable SSL for BitTorrent connections (since qBit 5.0) */
  ssl_enabled?: boolean
  /** SSL listen port (since qBit 5.0) */
  ssl_listen_port?: number
  /** Use random port on startup (deprecated) */
  random_port?: boolean
  /** Enable UPnP / NAT-PMP port forwarding */
  upnp: boolean

  // ---------------------------------------------------------------------------
  // Connection - Connection Limits
  // ---------------------------------------------------------------------------
  /** Maximum global connections */
  max_connec: number
  /** Maximum connections per torrent */
  max_connec_per_torrent: number
  /** Maximum upload slots globally */
  max_uploads: number
  /** Maximum upload slots per torrent */
  max_uploads_per_torrent: number

  // ---------------------------------------------------------------------------
  // Connection - I2P Settings (since qBit 5.0)
  // ---------------------------------------------------------------------------
  /** Enable I2P anonymous network */
  i2p_enabled?: boolean
  /** I2P SAM bridge address */
  i2p_address?: string
  /** I2P SAM bridge port */
  i2p_port?: number
  /** Enable mixed mode (I2P and regular connections) */
  i2p_mixed_mode?: boolean
  /** Number of inbound I2P tunnels */
  i2p_inbound_quantity?: number
  /** Number of outbound I2P tunnels */
  i2p_outbound_quantity?: number
  /** Length of inbound I2P tunnels (hops) */
  i2p_inbound_length?: number
  /** Length of outbound I2P tunnels (hops) */
  i2p_outbound_length?: number

  // ---------------------------------------------------------------------------
  // Connection - Proxy Settings
  // ---------------------------------------------------------------------------
  /** Proxy type (None, HTTP, SOCKS5, SOCKS4) */
  proxy_type: ProxyType | string
  /** Proxy server address */
  proxy_ip: string
  /** Proxy server port */
  proxy_port: number
  /** Enable proxy authentication */
  proxy_auth_enabled: boolean
  /** Proxy username */
  proxy_username: string
  /** Proxy password (write-only, not returned by GET) */
  proxy_password: string
  /** Use proxy for hostname lookups */
  proxy_hostname_lookup?: boolean
  /** Use proxy for BitTorrent connections */
  proxy_bittorrent?: boolean
  /** Use proxy for peer connections */
  proxy_peer_connections: boolean
  /** Use proxy for RSS feeds */
  proxy_rss?: boolean
  /** Use proxy for miscellaneous connections */
  proxy_misc?: boolean
  /** Only use proxy for torrent purposes (deprecated, use proxy_bittorrent) */
  proxy_torrents_only?: boolean

  // ---------------------------------------------------------------------------
  // Connection - IP Filtering
  // ---------------------------------------------------------------------------
  /** Enable IP filtering */
  ip_filter_enabled: boolean
  /** Path to IP filter file (e.g., ipfilter.dat) */
  ip_filter_path: string
  /** Apply IP filter to trackers */
  ip_filter_trackers: boolean
  /** Manually banned IP addresses (newline-separated) */
  banned_IPs: string

  // ---------------------------------------------------------------------------
  // Speed - Global Rate Limits
  // ---------------------------------------------------------------------------
  /** Global download speed limit in bytes/s (0 = unlimited) */
  dl_limit: number
  /** Global upload speed limit in bytes/s (0 = unlimited) */
  up_limit: number
  /** Alternative download speed limit in bytes/s */
  alt_dl_limit: number
  /** Alternative upload speed limit in bytes/s */
  alt_up_limit: number
  /** BitTorrent protocol (0=TCP+uTP, 1=TCP, 2=uTP) */
  bittorrent_protocol: BitTorrentProtocol
  /** Apply rate limit to uTP connections */
  limit_utp_rate: boolean
  /** Apply rate limit to transport overhead */
  limit_tcp_overhead: boolean
  /** Apply rate limit to peers on LAN */
  limit_lan_peers: boolean

  // ---------------------------------------------------------------------------
  // Speed - Scheduler
  // ---------------------------------------------------------------------------
  /** Enable bandwidth scheduler */
  scheduler_enabled: boolean
  /** Scheduler start hour (0-23) */
  schedule_from_hour: number
  /** Scheduler start minute (0-59) */
  schedule_from_min: number
  /** Scheduler end hour (0-23) */
  schedule_to_hour: number
  /** Scheduler end minute (0-59) */
  schedule_to_min: number
  /** Days to apply scheduler (see SchedulerDays enum) */
  scheduler_days: SchedulerDays

  // ---------------------------------------------------------------------------
  // BitTorrent - Privacy
  // ---------------------------------------------------------------------------
  /** Enable DHT (Distributed Hash Table) */
  dht: boolean
  /** Enable PEX (Peer Exchange) */
  pex: boolean
  /** Enable LSD (Local Service Discovery) */
  lsd: boolean
  /** Encryption mode (0=prefer, 1=force on, 2=force off) */
  encryption: Encryption
  /** Enable anonymous mode (no identifying info sent) */
  anonymous_mode: boolean

  // ---------------------------------------------------------------------------
  // BitTorrent - Torrent Queueing
  // ---------------------------------------------------------------------------
  /** Maximum number of active checking torrents */
  max_active_checking_torrents?: number
  /** Enable torrent queueing */
  queueing_enabled: boolean
  /** Maximum active downloads */
  max_active_downloads: number
  /** Maximum active torrents (upload + download) */
  max_active_torrents: number
  /** Maximum active uploads */
  max_active_uploads: number
  /** Don't count slow torrents in queue limits */
  dont_count_slow_torrents: boolean
  /** Download rate threshold for slow torrents (KiB/s) */
  slow_torrent_dl_rate_threshold: number
  /** Upload rate threshold for slow torrents (KiB/s) */
  slow_torrent_ul_rate_threshold: number
  /** Inactivity timer for slow torrents (seconds) */
  slow_torrent_inactive_timer: number

  // ---------------------------------------------------------------------------
  // BitTorrent - Share Ratio Limiting
  // ---------------------------------------------------------------------------
  /** Enable global max share ratio limit */
  max_ratio_enabled: boolean
  /** Global maximum share ratio (-1 = unlimited) */
  max_ratio: number
  /** Enable global max seeding time limit */
  max_seeding_time_enabled: boolean
  /** Global maximum seeding time in minutes (-1 = unlimited) */
  max_seeding_time: number
  /** Enable max inactive seeding time limit */
  max_inactive_seeding_time_enabled?: boolean
  /** Maximum inactive seeding time in minutes */
  max_inactive_seeding_time?: number
  /** Action when ratio/time limit is reached */
  max_ratio_act: MaxRatioAction

  // ---------------------------------------------------------------------------
  // BitTorrent - Trackers
  // ---------------------------------------------------------------------------
  /** Enable automatic tracker addition */
  add_trackers_enabled: boolean
  /** Trackers to add to new torrents (newline-separated URLs) */
  add_trackers: string
  /** Enable adding trackers from URL */
  add_trackers_from_url_enabled?: boolean
  /** URL to fetch additional trackers */
  add_trackers_url?: string
  /** List of tracker URLs to add (newline-separated) */
  add_trackers_url_list?: string

  // ---------------------------------------------------------------------------
  // WebUI - HTTP Server
  // ---------------------------------------------------------------------------
  /** WebUI allowed domain list (comma-separated) */
  web_ui_domain_list: string
  /** WebUI listen address (empty = all interfaces) */
  web_ui_address: string
  /** WebUI listen port */
  web_ui_port: number
  /** Enable UPnP for WebUI port */
  web_ui_upnp: boolean
  /** Enable HTTPS for WebUI */
  use_https: boolean
  /** Path to HTTPS certificate file */
  web_ui_https_cert_path: string
  /** Path to HTTPS private key file */
  web_ui_https_key_path: string

  // ---------------------------------------------------------------------------
  // WebUI - Authentication
  // ---------------------------------------------------------------------------
  /** WebUI username */
  web_ui_username: string
  /** WebUI password (write-only, not returned by GET) */
  web_ui_password?: string
  /** Bypass authentication for localhost */
  bypass_local_auth: boolean
  /** Enable authentication bypass for specific subnets */
  bypass_auth_subnet_whitelist_enabled: boolean
  /** Subnets to bypass authentication (newline-separated CIDR) */
  bypass_auth_subnet_whitelist: string
  /** Max authentication failures before ban */
  web_ui_max_auth_fail_count: number
  /** Ban duration after max auth failures (seconds) */
  web_ui_ban_duration: number
  /** Session timeout (seconds) */
  web_ui_session_timeout: number

  // ---------------------------------------------------------------------------
  // WebUI - Security
  // ---------------------------------------------------------------------------
  /** API key for authentication (since qBit 5.0) */
  web_ui_api_key?: string
  /** Enable alternative WebUI */
  alternative_webui_enabled: boolean
  /** Path to alternative WebUI files */
  alternative_webui_path: string
  /** Enable clickjacking protection */
  web_ui_clickjacking_protection_enabled: boolean
  /** Enable CSRF protection */
  web_ui_csrf_protection_enabled: boolean
  /** Enable secure cookie flag */
  web_ui_secure_cookie_enabled: boolean
  /** Enable host header validation */
  web_ui_host_header_validation_enabled: boolean

  // ---------------------------------------------------------------------------
  // WebUI - Custom Headers & Reverse Proxy
  // ---------------------------------------------------------------------------
  /** Enable custom HTTP headers */
  web_ui_use_custom_http_headers_enabled: boolean
  /** Custom HTTP headers (one per line, format: Header: Value) */
  web_ui_custom_http_headers: string
  /** Enable reverse proxy support */
  web_ui_reverse_proxy_enabled?: boolean
  /** Trusted reverse proxies (comma-separated) */
  web_ui_reverse_proxies_list?: string

  // ---------------------------------------------------------------------------
  // WebUI - Dynamic DNS
  // ---------------------------------------------------------------------------
  /** Enable dynamic DNS */
  dyndns_enabled: boolean
  /** DynDNS service (0=DynDNS, 1=NO-IP) */
  dyndns_service: DynDnsService
  /** DynDNS username */
  dyndns_username: string
  /** DynDNS password (write-only, not returned by GET) */
  dyndns_password: string
  /** DynDNS domain name */
  dyndns_domain: string

  // ---------------------------------------------------------------------------
  // RSS Settings
  // ---------------------------------------------------------------------------
  /** RSS feed refresh interval in minutes */
  rss_refresh_interval: number
  /** Delay between RSS feed fetches in milliseconds */
  rss_fetch_delay?: number
  /** Maximum articles per feed */
  rss_max_articles_per_feed: number
  /** Enable RSS processing */
  rss_processing_enabled: boolean
  /** Enable RSS auto-downloading */
  rss_auto_downloading_enabled: boolean
  /** Download repack/proper episodes */
  rss_download_repack_proper_episodes: boolean
  /** Smart episode filters (newline-separated regex patterns) */
  rss_smart_episode_filters: string

  // ---------------------------------------------------------------------------
  // Advanced - qBittorrent Settings
  // ---------------------------------------------------------------------------
  /** Resume data storage type (Legacy or SQLite) */
  resume_data_storage_type?: ResumeDataStorageType | string
  /** Torrent content remove option when deleting */
  torrent_content_remove_option?: TorrentContentRemoveOption | string
  /** Memory working set limit in MiB */
  memory_working_set_limit?: number
  /** Network interface to bind to */
  current_network_interface: string
  /** Display name of current network interface (read-only) */
  current_interface_name?: string
  /** IP address of current network interface */
  current_interface_address: string
  /** Save resume data interval in minutes */
  save_resume_data_interval: number
  /** Save statistics interval in minutes */
  save_statistics_interval?: number
  /** Maximum torrent file size in bytes */
  torrent_file_size_limit?: number
  /** Recheck torrents on completion */
  recheck_completed_torrents: boolean
  /** Resolve peer country using GeoIP */
  resolve_peer_countries: boolean
  /** Re-announce when IP address changes */
  reannounce_when_address_changed?: boolean
  /** Enable embedded tracker */
  enable_embedded_tracker: boolean
  /** Embedded tracker port */
  embedded_tracker_port: number
  /** Enable port forwarding for embedded tracker */
  embedded_tracker_port_forwarding?: boolean
  /** Mark downloaded files with Mark of the Web (Windows) */
  mark_of_the_web?: boolean
  /** Ignore SSL certificate errors */
  ignore_ssl_errors?: boolean
  /** Path to Python executable (for search plugins) */
  python_executable_path?: string

  // ---------------------------------------------------------------------------
  // Advanced - libtorrent Settings
  // ---------------------------------------------------------------------------
  /** Bdecode depth limit */
  bdecode_depth_limit?: number
  /** Bdecode token limit */
  bdecode_token_limit?: number
  /** Number of asynchronous I/O threads */
  async_io_threads: number
  /** Number of hashing threads */
  hashing_threads?: number
  /** File pool size */
  file_pool_size: number
  /** Memory for checking torrents (MiB) */
  checking_memory_use: number
  /** Disk cache size in MiB (-1 = auto) */
  disk_cache: number
  /** Disk cache TTL in seconds */
  disk_cache_ttl: number
  /** Disk queue size in bytes */
  disk_queue_size?: number
  /** Disk I/O type */
  disk_io_type?: DiskIOType
  /** Disk I/O read mode */
  disk_io_read_mode?: DiskIOReadWriteMode
  /** Disk I/O write mode */
  disk_io_write_mode?: DiskIOReadWriteMode
  /** Enable coalesced reads and writes */
  enable_coalesce_read_write: boolean
  /** Enable piece extent affinity */
  enable_piece_extent_affinity?: boolean
  /** Enable upload suggestions */
  enable_upload_suggestions?: boolean
  /** Send buffer high watermark (KiB) */
  send_buffer_watermark: number
  /** Send buffer low watermark (KiB) */
  send_buffer_low_watermark: number
  /** Send buffer watermark factor (%) */
  send_buffer_watermark_factor: number
  /** Connection speed (connections/second) */
  connection_speed?: number
  /** Socket send buffer size (bytes, 0 = OS default) */
  socket_send_buffer_size?: number
  /** Socket receive buffer size (bytes, 0 = OS default) */
  socket_receive_buffer_size?: number
  /** Socket backlog size */
  socket_backlog_size: number
  /** Minimum outgoing port */
  outgoing_ports_min: number
  /** Maximum outgoing port */
  outgoing_ports_max: number
  /** UPnP lease duration (seconds, 0 = permanent) */
  upnp_lease_duration: number
  /** Type of service (ToS) field value for peer connections */
  peer_tos?: number
  /** uTP-TCP mixed mode algorithm */
  utp_tcp_mixed_mode: UtpTcpMixedMode
  /** DNS cache TTL in seconds */
  hostname_cache_ttl?: number
  /** Enable IDN (Internationalized Domain Names) support */
  idn_support_enabled?: boolean
  /** Allow multiple connections from same IP */
  enable_multi_connections_from_same_ip: boolean
  /** Validate HTTPS tracker certificates */
  validate_https_tracker_certificate?: boolean
  /** Enable SSRF mitigation */
  ssrf_mitigation?: boolean
  /** Block peers on privileged ports */
  block_peers_on_privileged_ports?: boolean
  /** Upload slots behavior */
  upload_slots_behavior: UploadSlotsBehavior
  /** Upload choking algorithm */
  upload_choking_algorithm: UploadChokingAlgorithm
  /** Announce to all trackers in a tier */
  announce_to_all_trackers: boolean
  /** Announce to all tiers */
  announce_to_all_tiers: boolean
  /** IP address to announce to trackers */
  announce_ip: string
  /** Port to announce to trackers (0 = use listen port) */
  announce_port?: number
  /** Maximum concurrent HTTP announces */
  max_concurrent_http_announces?: number
  /** Stop tracker timeout in seconds */
  stop_tracker_timeout: number
  /** Peer turnover percentage */
  peer_turnover?: number
  /** Peer turnover cutoff percentage */
  peer_turnover_cutoff?: number
  /** Peer turnover interval (seconds) */
  peer_turnover_interval?: number
  /** Request queue size */
  request_queue_size?: number
  /** DHT bootstrap nodes (newline-separated host:port) */
  dht_bootstrap_nodes?: string

  // ---------------------------------------------------------------------------
  // Deprecated / Legacy Fields
  // ---------------------------------------------------------------------------
  /** @deprecated Use add_stopped_enabled instead */
  start_paused_enabled?: boolean
  /** @deprecated Use torrent_content_layout instead */
  create_subfolder_enabled?: boolean
  /** @deprecated Disk cache settings are now automatic in newer versions */
  enable_os_cache?: boolean
}

// =============================================================================
// PAYLOAD TYPES FOR API
// =============================================================================

/**
 * Partial preferences for updating via setPreferences API
 * All fields are optional - only send fields that need to be updated
 */
export type AppPreferencesPayload = Partial<AppPreferences>

/**
 * Category definition for qBittorrent
 */
export type Category = {
  /** Category name */
  name: string
  /** Save path for torrents in this category */
  savePath: string
  /** Download path for incomplete torrents (optional, since qBit 4.4) */
  downloadPath?: string
}

/**
 * Categories response from API
 * Key: category name
 * Value: category details
 */
export type CategoriesResponse = Record<string, Category>

/**
 * Network interface information
 */
export type NetworkInterface = {
  /** Interface identifier */
  id: string
  /** Display name */
  name: string
  /** IP addresses on this interface */
  addresses: Array<string>
}
