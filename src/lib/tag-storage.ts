import type { Tag, TagColor } from '@/types/tag';
import { TagColors } from '@/types/tag';

/**
 * localStorage key for persisting tag metadata
 * Follows existing pattern (e.g., 'qbit_baseUrl')
 */
const STORAGE_KEY = 'qbit_tags';

/**
 * Generates a UUID v4 for tag IDs
 * Uses crypto.randomUUID when available, fallback for older browsers
 */
function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Validates if a color is a valid Tailwind color class
 * @param color - The color to validate
 * @returns True if valid Tailwind color, false otherwise
 */
export function isValidTagColor(color: string | undefined): color is TagColor {
  if (!color) return false;
  return TagColors.includes(color as TagColor);
}

/**
 * Retrieves all tags from localStorage
 * @returns Array of Tag objects, empty array if none exist or on parse error
 */
export function getTags(): Array<Tag> {
  try {
    const storedTags = localStorage.getItem(STORAGE_KEY);
    if (!storedTags) {
      return [];
    }
    const parsed = JSON.parse(storedTags);
    // Validate that parsed data is an array of tags
    if (!Array.isArray(parsed)) {
      return [];
    }
    // Filter out any invalid entries
    return parsed.filter(
      (tag): tag is Tag =>
        typeof tag === 'object' &&
        tag !== null &&
        typeof tag.id === 'string' &&
        typeof tag.name === 'string' &&
        typeof tag.createdAt === 'number'
    );
  } catch {
    return [];
  }
}

/**
 * Persists tags array to localStorage
 * @param tags - Array of Tag objects to store
 */
function saveTags(tags: Array<Tag>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tags));
}

/**
 * Gets a single tag by ID
 * @param id - The tag ID to find
 * @returns The Tag if found, undefined otherwise
 */
export function getTagById(id: string): Tag | undefined {
  const tags = getTags();
  return tags.find((tag) => tag.id === id);
}

/**
 * Gets a single tag by name (case-insensitive)
 * @param name - The tag name to find
 * @returns The Tag if found, undefined otherwise
 */
export function getTagByName(name: string): Tag | undefined {
  const tags = getTags();
  const normalizedName = name.toLowerCase().trim();
  return tags.find((tag) => tag.name.toLowerCase() === normalizedName);
}

/**
 * Checks if a tag name already exists (case-insensitive)
 * @param name - The tag name to check
 * @param excludeId - Optional tag ID to exclude from check (for updates)
 * @returns True if name exists, false otherwise
 */
export function tagNameExists(name: string, excludeId?: string): boolean {
  const tags = getTags();
  const normalizedName = name.toLowerCase().trim();
  return tags.some(
    (tag) => tag.name.toLowerCase() === normalizedName && tag.id !== excludeId
  );
}

/**
 * Validates a tag name
 * @param name - The tag name to validate
 * @returns Error message if invalid, undefined if valid
 */
export function validateTagName(name: string): string | undefined {
  const trimmedName = name.trim();

  if (!trimmedName) {
    return 'Tag name cannot be empty';
  }

  if (trimmedName.length > 50) {
    return 'Tag name cannot exceed 50 characters';
  }

  // Prevent commas in tag names since qBittorrent uses comma-separated tags
  if (trimmedName.includes(',')) {
    return 'Tag name cannot contain commas';
  }

  return undefined;
}

/**
 * Creates a new tag
 * @param name - The display name for the tag
 * @param color - Optional Tailwind color class
 * @returns The created Tag object
 * @throws Error if tag name is empty or already exists
 */
export function createTag(name: string, color?: string): Tag {
  const trimmedName = name.trim();

  const validationError = validateTagName(trimmedName);
  if (validationError) {
    throw new Error(validationError);
  }

  if (tagNameExists(trimmedName)) {
    throw new Error(`Tag "${trimmedName}" already exists`);
  }

  const newTag: Tag = {
    id: generateId(),
    name: trimmedName,
    color: isValidTagColor(color) ? color : undefined,
    createdAt: Date.now(),
  };

  const tags = getTags();
  tags.push(newTag);
  saveTags(tags);

  return newTag;
}

/**
 * Updates an existing tag
 * @param id - The ID of the tag to update
 * @param updates - Partial tag object with properties to update
 * @returns The updated Tag object
 * @throws Error if tag not found, or if new name is invalid/duplicate
 */
export function updateTag(
  id: string,
  updates: Partial<Pick<Tag, 'name' | 'color'>>
): Tag {
  const tags = getTags();
  const index = tags.findIndex((tag) => tag.id === id);

  if (index === -1) {
    throw new Error(`Tag with ID "${id}" not found`);
  }

  const existingTag = tags[index];

  // Validate new name if provided
  if (updates.name !== undefined) {
    const trimmedName = updates.name.trim();

    const validationError = validateTagName(trimmedName);
    if (validationError) {
      throw new Error(validationError);
    }

    if (tagNameExists(trimmedName, id)) {
      throw new Error(`Tag "${trimmedName}" already exists`);
    }

    existingTag.name = trimmedName;
  }

  // Validate and update color if provided
  if (updates.color !== undefined) {
    existingTag.color = isValidTagColor(updates.color) ? updates.color : undefined;
  }

  tags[index] = existingTag;
  saveTags(tags);

  return existingTag;
}

/**
 * Deletes a tag by ID
 * Note: This only removes the tag from localStorage.
 * Tag-torrent relationships should be cleaned up via qBittorrent API.
 * @param id - The ID of the tag to delete
 * @returns True if deleted, false if tag not found
 */
export function deleteTag(id: string): boolean {
  const tags = getTags();
  const filteredTags = tags.filter((tag) => tag.id !== id);

  if (filteredTags.length === tags.length) {
    return false;
  }

  saveTags(filteredTags);
  return true;
}

/**
 * Deletes all tags from localStorage
 * Use with caution - primarily for testing or reset functionality
 */
export function clearAllTags(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Gets tags by their names
 * Useful for converting qBittorrent's comma-separated tag string to Tag objects
 * @param names - Array of tag names to look up
 * @returns Array of matching Tag objects (may be shorter if some names don't exist)
 */
export function getTagsByNames(names: Array<string>): Array<Tag> {
  const tags = getTags();
  const normalizedNames = names.map((n) => n.toLowerCase().trim());
  return tags.filter((tag) =>
    normalizedNames.includes(tag.name.toLowerCase())
  );
}

/**
 * Parses a comma-separated tag string from qBittorrent API
 * @param tagString - Comma-separated string of tag names (e.g., "Movies,HD,4K")
 * @returns Array of tag names
 */
export function parseTagString(tagString: string): Array<string> {
  if (!tagString || !tagString.trim()) {
    return [];
  }
  return tagString
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/**
 * Converts an array of tag names to a comma-separated string for qBittorrent API
 * @param tags - Array of tag names
 * @returns Comma-separated string
 */
export function formatTagString(tags: Array<string>): string {
  return tags.filter((t) => t.trim().length > 0).join(',');
}
