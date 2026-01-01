/**
 * Represents a user-created tag for organizing torrents
 * Tags are stored in localStorage with metadata (color, id)
 * Tag-torrent relationships are managed via qBittorrent API
 */
export type Tag = {
  id: string; // UUID v4
  name: string; // Display name (unique, case-insensitive)
  color?: string; // Optional Tailwind color class (e.g., "blue", "green")
  createdAt: number; // Unix timestamp
};

/**
 * Available Tailwind color classes for tag color selection
 * These map to Tailwind's color palette (e.g., bg-blue-500, text-blue-500)
 */
export const TagColors = [
  'slate',
  'gray',
  'red',
  'orange',
  'yellow',
  'lime',
  'green',
  'teal',
  'cyan',
  'blue',
  'indigo',
  'purple',
  'pink',
  'rose',
] as const;

/**
 * Type for valid tag color values
 */
export type TagColor = (typeof TagColors)[number];
