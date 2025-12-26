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
