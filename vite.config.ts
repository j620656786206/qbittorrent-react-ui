import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

// AR-31: the exact string for static assets, which Nitro serves without Start.
// Never put a CSP under `/**`: it would replace the nonce CSP on HTML.
import { STATIC_CSP } from './src/shared/csp'

const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string }

// Story 1.9 passes COMMIT_SHA (the image build has no .git).
function commitSha(): string {
  const isSha = (value: string | undefined) =>
    typeof value === 'string' && /^[0-9a-f]{7,40}$/.test(value)
  const fromEnv = process.env.COMMIT_SHA?.trim().toLowerCase()
  if (isSha(fromEnv)) return fromEnv as string
  try {
    const fromGit = execSync('git rev-parse HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()
    return isSha(fromGit) ? fromGit : 'unknown'
  } catch {
    return 'unknown'
  }
}

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __COMMIT_SHA__: JSON.stringify(commitSha()),
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      spa: { enabled: true },
      // Keep vitest files next to routes without making them routes.
      router: { routeFileIgnorePattern: '\\.test\\.tsx?$' },
    }),
    // https://nitro.build/docs/plugins, https://nitro.build/docs/routing#route-rules
    nitro({
      plugins: ['./src/server/env/startup-plugin.ts'],
      routeRules: {
        '/**': {
          headers: {
            'x-content-type-options': 'nosniff',
            'referrer-policy': 'no-referrer',
          },
        },
        '/assets/**': {
          headers: { 'content-security-policy': STATIC_CSP },
        },
      },
    }),
    viteReact(),
  ],
})

export default config
