# CLAUDE.md

This file provides guidance to Claude Code and Auto Claude when working with the react-torrent project.

## Project Overview

react-torrent is a modern web UI for qBittorrent built with React, Vite, TanStack Router, and TanStack Query.

## Environment Requirements

### Node.js Version

**CRITICAL**: This project requires Node.js **20.19+** or **22.12+** for Vite 7.x compatibility.

The project uses `.nvmrc` to specify the Node version:

```
lts/iron  # Currently resolves to v20.19.6
```

### Setup Node.js with nvm

Before running any commands, **always** ensure you're using the correct Node.js version:

```bash
# Load nvm (if not already loaded)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Use the version specified in .nvmrc
nvm use

# Verify version (should be v20.19.6 or higher)
node --version
```

**IMPORTANT for Auto Claude**: When executing commands (build, dev, test), always prefix with nvm:

```bash
# Instead of: npm run build
# Use:
bash -c 'source ~/.nvm/nvm.sh && nvm use && npm run build'

# Or use the init.sh script which handles this automatically
./init.sh
```

## qBittorrent Connection

### Configuration

The project connects to a qBittorrent instance. Connection details are configured in `.env`:

```env
VITE_QBIT_BASE_URL=http://192.168.50.52:8080
VITE_QBIT_USERNAME=j620656786206
VITE_QBIT_PASSWORD=H9j7kEpJecaq
```

**Note**: The `.env` file is gitignored. Use `.env.example` as a template.

### Testing Connection

To test features that interact with qBittorrent (add torrents, fetch data, etc.), ensure:

1. qBittorrent is running at the configured URL
2. Credentials in `.env` are correct
3. Network access to the qBittorrent instance is available

## Commands

### Development

```bash
# Start dev server (with correct Node version)
bash -c 'source ~/.nvm/nvm.sh && nvm use && npm run dev'

# Or use init.sh which handles environment setup
./init.sh
```

The dev server runs on **http://localhost:3000**

### Build

```bash
# Build for production
bash -c 'source ~/.nvm/nvm.sh && nvm use && npm run build'
```

### Testing

```bash
# Run tests
bash -c 'source ~/.nvm/nvm.sh && nvm use && npm test'

# Lint
bash -c 'source ~/.nvm/nvm.sh && nvm use && npm run lint'
```

## Project Structure

```
react-torrent/
├── src/
│   ├── components/     # React components (UI, modals, etc.)
│   ├── lib/            # Utilities and API client
│   │   └── api.ts      # qBittorrent API functions
│   ├── locales/        # i18n translations (en.json, zh-Hant.json)
│   ├── routes/         # TanStack Router routes
│   └── main.tsx        # App entry point
├── .nvmrc              # Node.js version specification
├── .env                # Environment variables (gitignored)
├── .env.example        # Environment template
└── vite.config.ts      # Vite configuration
```

## Common Tasks for Auto Claude

### Adding API Functions

When adding new qBittorrent API endpoints:

1. Add function to `src/lib/api.ts`
2. Follow existing patterns (getMaindata, pauseTorrent, etc.)
3. Use TypeScript types for requests/responses
4. Use `getApiBaseUrl()` helper for URL construction

Example:

```typescript
export async function myNewApiFunction(param: string): Promise<Response> {
  return fetch(`${getApiBaseUrl()}/api/v2/endpoint/${param}`, {
    method: 'POST',
    credentials: 'include',
  })
}
```

### Adding UI Components

1. Create component in `src/components/`
2. Use existing shadcn/ui components from `src/components/ui/`
3. Add translations to `src/locales/en.json` and `src/locales/zh-Hant.json`
4. Use TanStack Query for data fetching:
   ```typescript
   const { data } = useQuery({
     queryKey: ['myData'],
     queryFn: () => api.myFunction(),
   })
   ```

### TypeScript Compilation

Always verify TypeScript compiles without errors:

```bash
bash -c 'source ~/.nvm/nvm.sh && nvm use && npx tsc --noEmit'
```

## Troubleshooting

### "Vite requires Node.js version 20.19+ or 22.12+"

This warning means the wrong Node.js version is active. Fix:

1. Run `nvm use` to activate the correct version from `.nvmrc`
2. Verify with `node --version` (should show v20.19.6 or higher)

### qBittorrent Connection Errors

1. Verify qBittorrent is running: `curl http://192.168.50.52:8080/api/v2/app/version`
2. Check credentials in `.env`
3. Ensure network connectivity to the NAS

### Build Errors

1. Ensure correct Node version: `nvm use && node --version`
2. Clear node_modules and reinstall: `rm -rf node_modules package-lock.json && npm install`
3. Run lint: `npm run lint`

## Notes for Auto Claude

- **Always use nvm**: Prefix commands with `bash -c 'source ~/.nvm/nvm.sh && nvm use && YOUR_COMMAND'`
- **Use init.sh**: For starting the dev environment, use `./init.sh` which handles Node version switching
- **Verify builds**: Always run `npx tsc --noEmit` to catch TypeScript errors
- **Test with real qBittorrent**: Features should be tested against the actual qBittorrent instance (http://192.168.50.52:8080)
