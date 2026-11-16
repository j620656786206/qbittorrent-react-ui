// A torrent's id (AD-12, spine 慣例「種子的 id」): qBittorrent's `hash`, 40 or
// 64 lowercase hex. Shared so the URL's `hash` search param (src/shared,
// which may not import src/lib) and the container use the same rule.

export const TORRENT_HASH_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/
