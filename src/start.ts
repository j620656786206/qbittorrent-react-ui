import { createStart } from '@tanstack/react-start'
import { requestMiddleware } from '#/server/gate'
// Start bundles a server function only when some module in the app graph
// imports it. Nothing in the browser calls getMaindata until story 1.6, so
// this keeps it in the built server (smoke rows B9, B10). Drop this line once
// a screen imports it.
import '#/server/functions/get-maindata'

// https://tanstack.com/start/latest/docs/framework/react/guide/middleware
// The router generator registers this instance's types in routeTree.gen.ts.
export const startInstance = createStart(() => ({ requestMiddleware }))
