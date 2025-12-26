import type { LoginPayload } from '@/types/qbit/payloads'
import type { Torrent } from '@/components/torrent-table'; // Re-use our Torrent type for full data

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