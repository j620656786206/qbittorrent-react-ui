import { ok } from '#/shared/errors'

// Test-only: an export that did not come from the factory.
export const notAServerFn = () => ok('plain')
