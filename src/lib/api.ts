// Note: This is a simplified API client. In a real-world app, this would be more robust,
// with better error handling and potentially a class-based structure.

/**
 * Logs into the qBittorrent API.
 * The browser will automatically handle the session cookie (SID) for subsequent requests.
 * @param {string} baseUrl - The base URL of the qBittorrent WebUI.
 * @param {string} username - The username.
 * @param {string} password - The password.
 * @returns {Promise<boolean>} - True if login is successful, otherwise throws an error.
 */
export async function login(baseUrl: string, username?: string, password?: string): Promise<boolean> {
  const formData = new URLSearchParams();
  formData.append('username', username || '');
  formData.append('password', password || '');

  const res = await fetch(`${baseUrl}/api/v2/auth/login`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`Login failed with status: ${res.status}`);
  }

  const text = await res.text();
  if (text.trim() === 'Ok.') {
    return true;
  } else {
    throw new Error('Login failed: Invalid credentials or other issue.');
  }
}

/**
 * Fetches all torrents from the qBittorrent API.
 * This should be called after a successful login.
 * @param {string} baseUrl - The base URL of the qBittorrent WebUI.
 * @returns {Promise<any[]>} - An array of torrent objects.
 */
export async function getTorrents(baseUrl: string): Promise<any[]> {
    const res = await fetch(`${baseUrl}/api/v2/torrents/info`);
    if (!res.ok) {
        throw new Error('Failed to fetch torrents');
    }
    return res.json();
}
