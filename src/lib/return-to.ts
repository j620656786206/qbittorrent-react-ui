// AD-9: after login, go back to the original URL, but only a same-site path.
// Anything else (absolute or protocol-relative URLs, backslashes, `javascript:`,
// over-long values, the login page itself) returns to `/`.

export const MAX_RETURN_TO_LENGTH = 2048
const PROBE_ORIGIN = 'http://return.invalid'
const LOGIN_PATH = '/login'

export function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string') return '/'
  if (value.length === 0 || value.length > MAX_RETURN_TO_LENGTH) return '/'
  if (!value.startsWith('/') || value.startsWith('//')) return '/'
  if (value.includes('\\')) return '/'

  let url: URL
  try {
    url = new URL(value, PROBE_ORIGIN)
  } catch {
    return '/'
  }
  // The URL parser drops tabs and newlines, so `/\t/evil.example` becomes
  // protocol-relative; the origin check catches that and anything similar.
  if (url.origin !== PROBE_ORIGIN) return '/'
  // The router matches paths case-insensitively and decoded, so compare the
  // same way: `/LOGIN`, `/Login/` and `/%6Cogin` are the login page too.
  let path: string
  try {
    path = decodeURIComponent(url.pathname).toLowerCase()
  } catch {
    return '/'
  }
  if (path === LOGIN_PATH || path.startsWith(`${LOGIN_PATH}/`)) return '/'
  return url.pathname + url.search + url.hash
}
