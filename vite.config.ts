import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'

const config = defineConfig(({ command }) => ({
  base: command === 'build' ? './' : '/',
  plugins: [
    devtools(),
    // this is the plugin that enables path aliases
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tanstackRouter(),
    tailwindcss(),
    viteReact(),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://192.168.50.52:8080', // Your qBittorrent server
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/api'),
        ws: true, // Enable websocket proxying (not directly related to login, but good for some qBittorrent features)
        secure: false, // Set to false if your target (qBittorrent) is HTTP
        cookiePathRewrite: '/', // Ensure cookies are rewritten for the root path
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log(
              `[Vite Proxy] Forwarding Request: ${req.method} ${proxyReq.protocol}//${proxyReq.host}${proxyReq.path}`,
            )
            console.log(
              '[Vite Proxy] Outgoing Request Headers:',
              JSON.stringify(proxyReq.getHeaders(), null, 2),
            )

            // Remove Origin and Referer for ALL proxied requests to prevent CSRF checks by qBittorrent
            proxyReq.removeHeader('origin')
            proxyReq.removeHeader('referer')

            // Remove the Cookie header ONLY if it's the login endpoint
            if (req.url && req.url.includes('/api/v2/auth/login')) {
              proxyReq.removeHeader('cookie')
              console.log(
                '[Vite Proxy] Cookie header removed for login request.',
              )
            }
          })
          proxy.on('proxyRes', (proxyRes, _req, _res) => {
            // Rewrite Set-Cookie header to remove Domain attribute and ensure correct Path
            if (proxyRes.headers['set-cookie']) {
              const cookies = proxyRes.headers['set-cookie'].map((cookie) => {
                return cookie
                  .replace(/Domain=[^;]+(;\s*)?/gi, '') // Remove Domain attribute
                  .replace(/Path=\/[^;]+(;\s*)?/gi, `Path=/`) // Ensure Path is root
              })
              proxyRes.headers['set-cookie'] = cookies
            }
          })
        },
        cookieDomainRewrite: '', // <--- ADD THIS LINE: Ensures cookies are forwarded
      },
    },
  },
}))

export default config
