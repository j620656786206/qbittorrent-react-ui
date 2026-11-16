# react-torrent

A self-hosted web UI for qBittorrent, rebuilt from scratch on TanStack Start (SPA mode, Node server via Nitro). The container serves the page and is the only thing that talks to qBittorrent. To run it locally: `nvm use` (Node 26), `npm ci`, copy `.env.example` to `.env` and fill in your own values, then `npm run dev` and open http://localhost:3000.

Deployment on Unraid is described in [docs/deployment.md](docs/deployment.md); images are built and pushed to GHCR only by CI.
