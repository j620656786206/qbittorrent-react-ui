import { definePlugin } from 'nitro'
import { runStartupCheck } from '#/server/env'

// Nitro runs plugins at boot, before listening; Start loads `src/start.ts`
// only on the first request, so the env check lives here.
// https://nitro.build/docs/plugins
export default definePlugin(() => {
  runStartupCheck({
    source: process.env,
    exit: (code) => process.exit(code),
    version: __APP_VERSION__,
    commit: __COMMIT_SHA__,
    isPrerender: process.env.TSS_PRERENDERING === 'true',
    isDev: process.env.TSS_DEV_SERVER === 'true',
  })
})
