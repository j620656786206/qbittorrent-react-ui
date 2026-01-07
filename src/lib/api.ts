import type { Torrent } from '@/types/torrent';
import type { TorrentFile } from '@/types/torrent';

// Define types for sync/maindata response
export type TorrentPartialUpdate = Partial<Torrent> & {
    hash: string;
};

export type MaindataResponse = {
    rid: number;
    server_state: {
        alltime_dl: number;
        alltime_ul: number;
        total_buffers_size: number;
        total_peer_connections: number;
        up_info_data: number;
        up_info_speed: number;
        // ... many other server state properties
    };
    torrents: { [hash: string]: TorrentPartialUpdate }; // Torrents that have changed
    torrents_removed: string[]; // Hashes of removed torrents
    full_update: boolean; // True if it's a full update, false for incremental
};

// Define types for categories response
export type Category = {
    name: string;
    savePath: string;
};

export type CategoriesResponse = {
    [categoryName: string]: Category;
};

// Tracker status codes from qBittorrent API
export const TrackerStatus = {
    Disabled: 0,      // Tracker is disabled (used for DHT, PeX, LSD)
    NotContacted: 1,  // Tracker has not been contacted yet
    Working: 2,       // Tracker has been contacted and is working
    Updating: 3,      // Tracker is updating
    NotWorking: 4,    // Tracker has been contacted but is not working
} as const;

export type TrackerStatusType = typeof TrackerStatus[keyof typeof TrackerStatus];

// Define types for tracker response
export type Tracker = {
    url: string;                  // Tracker URL
    status: TrackerStatusType;    // Tracker status code (0-4)
    tier: number;                 // Tracker tier
    num_peers: number;            // Number of peers for this torrent reported by tracker
    num_seeds: number;            // Number of seeds for this torrent reported by tracker
    num_leeches: number;          // Number of leeches for this torrent reported by tracker
    num_downloaded: number;       // Number of completed downloads reported by tracker
    msg: string;                  // Tracker message (error message or description)
};

// Helper function to get the actual base URL for fetches
function getApiBaseUrl(providedBaseUrl: string): string {
  if (import.meta.env.DEV) {
    // In development, use window.location.origin as the base for URL construction.
    // The Vite proxy is configured to intercept /api requests from this origin.
    return window.location.origin; // e.g., http://localhost:3000
  } else {
    // In production, use the full base URL (from localStorage/env)
    return providedBaseUrl;
  }
}

/**
 * Logs into the qBittorrent API.
 * The browser will automatically handle the session cookie (SID) for subsequent requests.
 * @param {string} baseUrl - The base URL of the qBittorrent WebUI.
 * @param {string} username - The username.
 * @param {string} password - The password.
 * @returns {Promise<boolean>} - True if login is successful, otherwise throws an error.
 */
export async function login(baseUrl: string, username?: string, password?: string): Promise<boolean> {
  const effectiveBaseUrl = getApiBaseUrl(baseUrl);
  const formData = new URLSearchParams();
  formData.append('username', username || '');
  formData.append('password', password || '');

  const res = await fetch(`${effectiveBaseUrl}/api/v2/auth/login`, {
    method: 'POST',
    body: formData,
    credentials: 'include', // Important: allows browser to save and send cookies
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json, text/plain, */*'
    }
  });

  const text = await res.text(); // Read text even if not ok

  if (!res.ok) {
    console.error('Failed to login:', text); // Log raw response text
    throw new Error(`Login failed with status: ${res.status}. Server response: ${text || 'No response body'}`);
  }

  if (text.trim() === 'Ok.') {
    return true;
  } else {
    // This case might be hit if res.ok is true but text is not 'Ok.'
    throw new Error('Login failed: Invalid credentials or other issue. Server response: ' + text);
  }
}

/**
 * Fetches maindata (torrent info, server state) from the qBittorrent API.
 * This can fetch full data or incremental updates based on 'rid'.
 * @param {string} baseUrl - The base URL of the qBittorrent WebUI.
 * @param {number} [rid] - The request ID for incremental updates.
 * @returns {Promise<MaindataResponse>}
 */
export async function getMaindata(baseUrl: string, rid?: number): Promise<MaindataResponse> {
  const effectiveBaseUrl = getApiBaseUrl(baseUrl);
  const url = new URL(`${effectiveBaseUrl}/api/v2/sync/maindata`);
  if (rid !== undefined) {
    url.searchParams.append('rid', rid.toString());
  }

  const res = await fetch(url.toString(), {
    credentials: 'include', // Include cookies for authentication
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch maindata with status: ${res.status}`);
  }
  const jsonResponse = await res.json();
  console.log('Raw maindata response:', jsonResponse); // Log raw response
  return jsonResponse;
}


/**
 * Pauses one or more torrents.
 * @param {string} baseUrl - The base URL of the qBittorrent WebUI.
 * @param {string | string[]} hashes - Single hash or array of hashes of torrents to pause.
 * @returns {Promise<boolean>} - True if successful, throws error otherwise.
 */
export async function pauseTorrent(baseUrl: string, hashes: string | string[]): Promise<boolean> {
  const effectiveBaseUrl = getApiBaseUrl(baseUrl);
  const formData = new URLSearchParams();
  formData.append('hashes', Array.isArray(hashes) ? hashes.join('|') : hashes);

  const res = await fetch(`${effectiveBaseUrl}/api/v2/torrents/pause`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  });

  if (!res.ok) {
    throw new Error(`Failed to pause torrent(s) with status: ${res.status}`);
  }
  return true;
}

/**
 * Resumes one or more torrents.
 * @param {string} baseUrl - The base URL of the qBittorrent WebUI.
 * @param {string | string[]} hashes - Single hash or array of hashes of torrents to resume.
 * @returns {Promise<boolean>} - True if successful, throws error otherwise.
 */
export async function resumeTorrent(baseUrl: string, hashes: string | string[]): Promise<boolean> {
  const effectiveBaseUrl = getApiBaseUrl(baseUrl);
  const formData = new URLSearchParams();
  formData.append('hashes', Array.isArray(hashes) ? hashes.join('|') : hashes);

  const res = await fetch(`${effectiveBaseUrl}/api/v2/torrents/resume`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  });

  if (!res.ok) {
    throw new Error(`Failed to resume torrent(s) with status: ${res.status}`);
  }
  return true;
}

/**
 * Deletes one or more torrents.
 * @param {string} baseUrl - The base URL of the qBittorrent WebUI.
 * @param {string | string[]} hashes - Single hash or array of hashes of torrents to delete.
 * @param {boolean} deleteFiles - Whether to delete the associated files from disk.
 * @returns {Promise<boolean>} - True if successful, throws error otherwise.
 */
export async function deleteTorrent(
  baseUrl: string,
  hashes: string | string[],
  deleteFiles: boolean = false
): Promise<boolean> {
  const effectiveBaseUrl = getApiBaseUrl(baseUrl);
  const formData = new URLSearchParams();
  formData.append('hashes', Array.isArray(hashes) ? hashes.join('|') : hashes);
  formData.append('deleteFiles', deleteFiles ? 'true' : 'false');

  const res = await fetch(`${effectiveBaseUrl}/api/v2/torrents/delete`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  });

  if (!res.ok) {
    throw new Error(`Failed to delete torrent(s) with status: ${res.status}`);
  }
  return true;
}

/**
 * Fetches all categories from the qBittorrent API.
 * @param {string} baseUrl - The base URL of the qBittorrent WebUI.
 * @returns {Promise<CategoriesResponse>} - Object mapping category names to their details.
 */
export async function getCategories(baseUrl: string): Promise<CategoriesResponse> {
  const effectiveBaseUrl = getApiBaseUrl(baseUrl);

  const res = await fetch(`${effectiveBaseUrl}/api/v2/torrents/categories`, {
    credentials: 'include', // Include cookies for authentication
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch categories with status: ${res.status}`);
  }

  return res.json();
}

/**
 * Sets the category for one or more torrents.
 * @param {string} baseUrl - The base URL of the qBittorrent WebUI.
 * @param {string | string[]} hashes - Single hash or array of hashes of torrents to update.
 * @param {string} category - The category name to assign. Use empty string to remove category.
 * @returns {Promise<boolean>} - True if successful, throws error otherwise.
 */
export async function setTorrentCategory(
  baseUrl: string,
  hashes: string | string[],
  category: string
): Promise<boolean> {
  const effectiveBaseUrl = getApiBaseUrl(baseUrl);
  const formData = new URLSearchParams();
  formData.append('hashes', Array.isArray(hashes) ? hashes.join('|') : hashes);
  formData.append('category', category);

  const res = await fetch(`${effectiveBaseUrl}/api/v2/torrents/setCategory`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  });

  if (!res.ok) {
    throw new Error(`Failed to set category for torrent(s) with status: ${res.status}`);
  }
  return true;
}

// Options for adding a torrent via magnet link
export type AddTorrentMagnetOptions = {
  savepath?: string;
  category?: string;
  tags?: string;
  paused?: boolean;
};

/**
 * Adds a torrent via magnet link.
 * @param {string} baseUrl - The base URL of the qBittorrent WebUI.
 * @param {string} magnetLink - The magnet link to add.
 * @param {AddTorrentMagnetOptions} [options] - Optional parameters for save path, category, and paused state.
 * @returns {Promise<boolean>} - True if successful, throws error otherwise.
 */
export async function addTorrentMagnet(
  baseUrl: string,
  magnetLink: string,
  options?: AddTorrentMagnetOptions
): Promise<boolean> {
  const effectiveBaseUrl = getApiBaseUrl(baseUrl);
  const formData = new URLSearchParams();
  formData.append('urls', magnetLink);

  if (options?.savepath) {
    formData.append('savepath', options.savepath);
  }
  if (options?.category) {
    formData.append('category', options.category);
  }
  if (options?.tags) {
    formData.append('tags', options.tags);
  }
  if (options?.paused !== undefined) {
    formData.append('paused', options.paused ? 'true' : 'false');
  }

  const res = await fetch(`${effectiveBaseUrl}/api/v2/torrents/add`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  });

  if (!res.ok) {
    throw new Error(`Failed to add torrent via magnet link with status: ${res.status}`);
  }
  return true;
}

// Options for adding a torrent via .torrent file
export type AddTorrentFileOptions = {
  savepath?: string;
  category?: string;
  tags?: string;
  paused?: boolean;
};

/**
 * Adds a torrent via .torrent file upload.
 * @param {string} baseUrl - The base URL of the qBittorrent WebUI.
 * @param {File} file - The .torrent file to upload.
 * @param {AddTorrentFileOptions} [options] - Optional parameters for save path, category, and paused state.
 * @returns {Promise<boolean>} - True if successful, throws error otherwise.
 */
export async function addTorrentFile(
  baseUrl: string,
  file: File,
  options?: AddTorrentFileOptions
): Promise<boolean> {
  const effectiveBaseUrl = getApiBaseUrl(baseUrl);
  const formData = new FormData();
  formData.append('torrents', file);

  if (options?.savepath) {
    formData.append('savepath', options.savepath);
  }
  if (options?.category) {
    formData.append('category', options.category);
  }
  if (options?.tags) {
    formData.append('tags', options.tags);
  }
  if (options?.paused !== undefined) {
    formData.append('paused', options.paused ? 'true' : 'false');
  }

  const res = await fetch(`${effectiveBaseUrl}/api/v2/torrents/add`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  });

  if (!res.ok) {
    throw new Error(`Failed to add torrent via file with status: ${res.status}`);
  }
  return true;
}

/**
 * Fetches the list of files for a specific torrent.
 * @param {string} baseUrl - The base URL of the qBittorrent WebUI.
 * @param {string} hash - The hash of the torrent to get files for.
 * @returns {Promise<TorrentFile[]>} - Array of file objects with index, name, size, progress, and priority.
 * @throws {Error} - Throws with status 409 if torrent metadata is not yet downloaded.
 */
export async function getTorrentFiles(baseUrl: string, hash: string): Promise<Array<TorrentFile>> {
  const effectiveBaseUrl = getApiBaseUrl(baseUrl);
  const url = new URL(`${effectiveBaseUrl}/api/v2/torrents/files`);
  url.searchParams.append('hash', hash);

  const res = await fetch(url.toString(), {
    credentials: 'include', // Include cookies for authentication
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch torrent files with status: ${res.status}`);
  }

  return res.json();
}

/**
 * Sets the download priority for one or more files within a torrent.
 * @param {string} baseUrl - The base URL of the qBittorrent WebUI.
 * @param {string} hash - The hash of the torrent containing the files.
 * @param {number | number[]} fileIds - Single file index or array of file indexes (use `index` field from API, not array position).
 * @param {number} priority - The priority to set (0 = Do Not Download, 1 = Normal, 6 = High, 7 = Maximum).
 * @returns {Promise<boolean>} - True if successful, throws error otherwise.
 */
export async function setFilePriority(
  baseUrl: string,
  hash: string,
  fileIds: number | number[],
  priority: number
): Promise<boolean> {
  const effectiveBaseUrl = getApiBaseUrl(baseUrl);
  const formData = new URLSearchParams();
  formData.append('hash', hash);
  formData.append('id', Array.isArray(fileIds) ? fileIds.join('|') : fileIds.toString());
  formData.append('priority', priority.toString());

  const res = await fetch(`${effectiveBaseUrl}/api/v2/torrents/filePrio`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  });

  if (!res.ok) {
    throw new Error(`Failed to set file priority with status: ${res.status}`);
  }
  return true;
}

/**
 * Fetches the list of trackers for a specific torrent.
 * @param {string} baseUrl - The base URL of the qBittorrent WebUI.
 * @param {string} hash - The hash of the torrent to get trackers for.
 * @returns {Promise<Tracker[]>} - Array of tracker objects with URL, status, tier, and peer statistics.
 */
export async function getTrackers(baseUrl: string, hash: string): Promise<Tracker[]> {
  const effectiveBaseUrl = getApiBaseUrl(baseUrl);
  const url = new URL(`${effectiveBaseUrl}/api/v2/torrents/trackers`);
  url.searchParams.append('hash', hash);

  const res = await fetch(url.toString(), {
    credentials: 'include', // Include cookies for authentication
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch trackers with status: ${res.status}`);
  }

  return res.json();
}