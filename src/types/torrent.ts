/**
 * Represents a torrent in the qBittorrent client
 * Data structure from qBittorrent Web API v2 /sync/maindata endpoint
 */
export type Torrent = {
  added_on: number; // Unix timestamp
  amount_left: number; // bytes
  auto_tmm: boolean;
  availability: number; // eg. 0.0071655581634163
  category: string;
  comment: string;
  completed: number; // bytes
  completion_on: number; // Unix timestamp
  content_path: string;
  dl_limit: number; // bytes/s
  dlspeed: number; // bytes/s
  download_path: string;
  downloaded: number; // bytes
  downloaded_session: number; // bytes
  eta: number; // seconds (remaining time)
  f_l_piece_prio: boolean; // First Last Piece Priority
  force_start: boolean;
  has_metadata: boolean;
  hash: string;
  inactive_seeding_time_limit: number;
  infohash_v1: string;
  infohash_v2: string;
  last_activity: number; // Unix timestamp
  magnet_uri: string;
  max_inactive_seeding_time: number; // minutes, -1 for infinite
  max_ratio: number; // eg. -1 (infinite)
  max_seeding_time: number; // minutes, -1 for infinite
  name: string;
  num_complete: number; // number of seeds in the swarm
  num_incomplete: number; // number of leechers in the swarm
  num_leechs: number; // number of leechers connected to
  num_seeds: number; // number of seeds connected to
  popularity: number;
  priority: number;
  private: boolean;
  progress: number; // [0, 1]
  ratio: number;
  ratio_limit: number;
  reannounce: number; // seconds
  root_path: string;
  save_path: string;
  seeding_time: number; // seconds
  seeding_time_limit: number; // seconds, -2 for infinite
  seen_complete: number; // Unix timestamp
  seq_dl: boolean; // Sequential Download
  size: number; // bytes (total size of torrent)
  state: string; // e.g., "downloading", "uploading", "pausedDL", "missingFiles"
  super_seeding: boolean;
  tags: string;
  time_active: number; // seconds
  total_size: number; // bytes
  tracker: string;
  trackers_count: number;
  up_limit: number; // bytes/s
  uploaded: number; // bytes
  uploaded_session: number; // bytes
  upspeed: number; // bytes/s
};

/**
 * File priority values for qBittorrent API
 * NOTE: Priority values are NOT sequential (0, 1, 6, 7)
 */
export enum FilePriority {
  DO_NOT_DOWNLOAD = 0,
  NORMAL = 1,
  HIGH = 6,
  MAXIMUM = 7, // Available in API but not typically exposed in UI
}

/**
 * Priority labels for display in the UI
 */
export const FilePriorityLabels: Record<FilePriority, string> = {
  [FilePriority.DO_NOT_DOWNLOAD]: 'priority.doNotDownload',
  [FilePriority.NORMAL]: 'priority.normal',
  [FilePriority.HIGH]: 'priority.high',
  [FilePriority.MAXIMUM]: 'priority.maximum',
};

/**
 * Represents a single file within a torrent
 * Data structure from qBittorrent Web API v2 /torrents/files endpoint
 */
export type TorrentFile = {
  index: number; // File index (use this for priority API, NOT array position)
  name: string; // File path relative to torrent root (e.g., "folder/subfolder/file.txt")
  size: number; // File size in bytes
  progress: number; // Download progress [0, 1]
  priority: FilePriority; // Current download priority
  is_seed: boolean; // Whether the file has already been fully downloaded
  piece_range: [number, number]; // Piece indexes [first, last] that contain this file
  availability: number; // Percentage of file pieces available in the swarm [0, 1]
};

/**
 * Parsed node for file tree structure
 * Used to convert flat file list into hierarchical tree for display
 */
export type FileTreeNode = {
  name: string; // Display name (file or folder name, not full path)
  path: string; // Full path for this node
  isFolder: boolean; // Whether this node is a folder
  size: number; // Size in bytes (for files) or sum of children (for folders)
  progress: number; // Download progress [0, 1] (for files) or weighted average (for folders)
  priority?: FilePriority; // Priority (only for files, undefined for folders)
  fileIndex?: number; // Original file index (only for files, undefined for folders)
  children?: Array<FileTreeNode>; // Child nodes (only for folders)
  file?: TorrentFile; // Original file data (only for leaf nodes)
};
