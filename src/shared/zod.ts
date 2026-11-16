import { z } from 'zod'

// AD-10: the CSP has no 'unsafe-eval'. zod decides at schema construction
// whether to compile parsers with `new Function`, and its probe for that is
// reported by the browser as a CSP violation even though zod catches it.
// Schemas that reach the browser import `z` from here, so the config is set
// before any of them is built.
z.config({ jitless: true })

export { z }
