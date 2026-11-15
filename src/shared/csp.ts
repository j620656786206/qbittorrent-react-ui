// AD-10 / AR-31. No imports: vite.config.ts and the request middleware share it.

const CSP_REST =
  "object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"

/** The exact AR-31 string; served on static assets via Nitro route rules. */
export const STATIC_CSP = `default-src 'self'; script-src 'self'; ${CSP_REST}`

/** HTML responses: Start's inline scripts carry this per-request nonce. */
export function buildCsp(nonce: string): string {
  return `default-src 'self'; script-src 'self' 'nonce-${nonce}'; ${CSP_REST}`
}
