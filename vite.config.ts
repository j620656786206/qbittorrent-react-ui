import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    tanstackStart({
      spa: { enabled: true },
      // Keep vitest files next to routes without making them routes.
      router: { routeFileIgnorePattern: '\\.test\\.tsx?$' },
    }),
    nitro(),
    viteReact(),
  ],
})

export default config
