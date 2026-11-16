import { createStart } from '@tanstack/react-start'
import { requestMiddleware } from '#/server/gate'

// https://tanstack.com/start/latest/docs/framework/react/guide/middleware
// The router generator registers this instance's types in routeTree.gen.ts.
export const startInstance = createStart(() => ({ requestMiddleware }))
