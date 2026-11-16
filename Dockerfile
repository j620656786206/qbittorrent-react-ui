# AR-8: built only in CI (.github/workflows), never pushed from a local machine.
# Node 26 pinned by the multi-arch index digest; Dependabot keeps it current.

FROM node:26.13.1-trixie-slim@sha256:e6bedef217677b276c591795e169840edd9096dbf13f29df8ef8d1856b8820bc AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# vite.config.ts reads COMMIT_SHA (the context has no .git); the startup log
# line carries it.
# ipv4first: in Debian `localhost` resolves to ::1 first, the SPA prerender's
# preview server then cannot be reached and the build silently skips the shell.
ARG COMMIT_SHA=unknown
RUN COMMIT_SHA=$COMMIT_SHA NODE_OPTIONS=--dns-result-order=ipv4first npm run build

FROM node:26.13.1-trixie-slim@sha256:e6bedef217677b276c591795e169840edd9096dbf13f29df8ef8d1856b8820bc AS runtime
ARG COMMIT_SHA=unknown
LABEL org.opencontainers.image.source="https://github.com/j620656786206/qbittorrent-react-ui" \
      org.opencontainers.image.revision="$COMMIT_SHA"
ENV NODE_ENV=production
WORKDIR /app
# settings.json lives here (CONFIG_DIR defaults to /config); Unraid mounts it.
# The runtime never installs packages: drop npm, npx and corepack (keep sh).
RUN mkdir /config && chown 99:100 /config \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
# Nitro traces every runtime dependency into .output/server, so the build
# output is all the runtime needs. Owned by root: the app cannot change it.
COPY --from=build /app/.output /app/.output
USER 99:100
EXPOSE 3000
# The image has no curl or wget; /healthz never touches qBittorrent.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --start-interval=2s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.NITRO_PORT||process.env.PORT||3000)+'/healthz',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "/app/.output/server/index.mjs"]
