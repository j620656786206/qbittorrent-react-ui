# Specification: Add Torrents via Magnet Links and Torrent Files

## Overview

This feature enables users to add new torrents to qBittorrent through the react-torrent web UI. Users will be able to add torrents via magnet link input or .torrent file upload, with options to specify save path, category assignment, and whether to start immediately or paused. This is a critical missing feature that allows users to use react-torrent as a complete daily-driver interface without needing to switch to another tool.

## Workflow Type

**Type**: feature

**Rationale**: This is a new user-facing feature that requires adding UI components (modal dialog), new API functions, state management, and integration with existing data flow. It involves creating new files and modifying existing components to add the "Add Torrent" trigger.

## Task Scope

### Services Involved
- **main** (primary) - React frontend application that interfaces with qBittorrent WebUI API

### This Task Will:
- [ ] Create an "Add Torrent" modal dialog component
- [ ] Add API function to add torrents via magnet link
- [ ] Add API function to add torrents via .torrent file upload
- [ ] Add API function to fetch available categories from qBittorrent
- [ ] Add "Add Torrent" button to sidebar and/or main UI
- [ ] Support optional save path, category, and start paused options
- [ ] Refresh torrent list immediately after successful add
- [ ] Add i18n translations for new UI text (English and zh-Hant)

### Out of Scope:
- Batch torrent adding (adding multiple at once)
- URL downloading (fetching .torrent from a URL)
- Advanced options like bandwidth limits, sequential download, etc.
- Drag-and-drop torrent file upload
- Deep linking / magnet protocol handler registration

## Service Context

### Main (React Frontend)

**Tech Stack:**
- Language: TypeScript
- Framework: React 18 with Vite
- State Management: TanStack Query (React Query)
- Routing: TanStack Router
- Styling: Tailwind CSS
- UI Components: Radix UI primitives
- Internationalization: i18next

**Key directories:**
- `src/components/` - React components
- `src/components/ui/` - Reusable UI primitives (Button, Dialog, Input, etc.)
- `src/lib/` - Utility functions and API client
- `src/locales/` - i18n translation files
- `src/routes/` - TanStack Router route components

**Entry Point:** `src/main.tsx`

**How to Run:**
```bash
npm run dev
```

**Port:** 3000

## Files to Modify

| File | Service | What to Change |
|------|---------|---------------|
| `src/lib/api.ts` | main | Add `addTorrentMagnet()`, `addTorrentFile()`, and `getCategories()` API functions |
| `src/routes/index.tsx` | main | Import and wire up AddTorrentModal, add state and handlers |
| `src/components/sidebar.tsx` | main | Add "Add Torrent" button to sidebar UI |
| `src/locales/en.json` | main | Add translations for add torrent UI text |
| `src/locales/zh-Hant.json` | main | Add translations for add torrent UI text |

## Files to Create

| File | Service | Purpose |
|------|---------|---------|
| `src/components/add-torrent-modal.tsx` | main | Modal dialog for adding torrents via magnet link or file upload |

## Files to Reference

These files show patterns to follow:

| File | Pattern to Copy |
|------|----------------|
| `src/components/settings-modal.tsx` | Modal structure with Dialog, form fields, controlled inputs |
| `src/lib/api.ts` | API function structure, fetch with credentials, URL-encoded form data |
| `src/components/torrent-table.tsx` | useMutation pattern with queryClient.invalidateQueries |
| `src/components/ui/dialog.tsx` | Dialog component usage and available props |
| `src/components/sidebar.tsx` | Button placement and styling in sidebar |

## Patterns to Follow

### API Function Pattern

From `src/lib/api.ts`:

```typescript
export async function pauseTorrent(baseUrl: string, hashes: string | string[]): Promise<boolean> {
  const effectiveBaseUrl = getApiBaseUrl(baseUrl);
  const formData = new URLSearchParams();
  formData.append('hashes', Array.isArray(hashes) ? hashes.join('|') : hashes);

  const res = await fetch(`${effectiveBaseUrl}/api/v2/torrents/pause`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  });

  if (!res.ok) {
    throw new Error(`Failed to pause torrent(s) with status: ${res.status}`);
  }
  return true;
}
```

**Key Points:**
- Use `getApiBaseUrl(baseUrl)` to handle dev proxy
- Use `URLSearchParams` for form data (or `FormData` for file uploads)
- Include `credentials: 'include'` for session cookies
- Throw errors on non-ok responses with status code

### Modal Dialog Pattern

From `src/components/settings-modal.tsx`:

```typescript
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export function SettingsModal({ isOpen, onClose, onSave }: SettingsModalProps) {
  const [username, setUsername] = React.useState('')

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Title</DialogTitle>
          <DialogDescription>Description</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {/* Form fields */}
        </div>
        <DialogFooter>
          <Button onClick={handleSubmit}>Submit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

**Key Points:**
- Use `open` prop to control visibility
- Use `onOpenChange` for close handler
- Standard structure: Header, Content, Footer
- Use controlled form inputs with React.useState

### Mutation with Query Invalidation Pattern

From `src/components/torrent-table.tsx`:

```typescript
const pauseMutation = useMutation({
  mutationFn: (hash: string) => pauseTorrent(getBaseUrl(), hash),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['maindata'] })
  },
})
```

**Key Points:**
- Use TanStack Query's `useMutation` hook
- Invalidate `maindata` query on success to refresh torrent list
- Get baseUrl from localStorage helper function

### Translation Pattern

From `src/locales/en.json`:

```json
{
  "torrent": {
    "actions": {
      "delete": "Delete",
      "confirmDelete": "Are you sure you want to delete?"
    }
  }
}
```

**Key Points:**
- Nest translations under feature/component namespaces
- Use the same keys in both `en.json` and `zh-Hant.json`
- Access via `t('torrent.actions.delete')` in components

## Requirements

### Functional Requirements

1. **Add Torrent via Magnet Link**
   - Description: User can paste a magnet link into an input field and submit to add the torrent
   - Acceptance: Magnet link starting with `magnet:?` is validated and sent to qBittorrent API

2. **Add Torrent via File Upload**
   - Description: User can select a .torrent file from their device to upload
   - Acceptance: File input accepts `.torrent` files and uploads via FormData

3. **Optional Save Path**
   - Description: User can specify a custom download path before adding
   - Acceptance: If provided, the `savepath` parameter is sent to the API

4. **Category Assignment**
   - Description: User can select an existing category or leave empty
   - Acceptance: Categories are fetched from API and displayed in a dropdown; selected category is sent with request

5. **Start Paused Option**
   - Description: User can choose to add the torrent in paused state
   - Acceptance: A checkbox/toggle controls the `paused` parameter (default: false = start immediately)

6. **Immediate List Update**
   - Description: The new torrent appears in the list immediately after adding
   - Acceptance: `maindata` query is invalidated on success, triggering a refresh

7. **Mobile-Friendly Add**
   - Description: Mobile users can easily paste magnet links
   - Acceptance: Modal is responsive, input fields are properly sized for mobile

### Edge Cases

1. **Invalid Magnet Link** - Validate that input starts with `magnet:?` before submission; show error message if invalid
2. **Invalid/Corrupt .torrent File** - Handle API error response gracefully and display user-friendly message
3. **Network Error During Upload** - Display error toast/message and allow retry
4. **Empty Category List** - Handle case where no categories exist; show option to proceed without category
5. **Save Path Doesn't Exist** - qBittorrent will create it, but handle any API errors
6. **Duplicate Torrent** - qBittorrent API handles this; display any error message returned

## Implementation Notes

### DO
- Follow the modal pattern in `src/components/settings-modal.tsx`
- Use `FormData` (not URLSearchParams) for file upload since files require multipart/form-data
- Reuse existing UI components: Dialog, Button, Input, Label from `src/components/ui/`
- Use `useMutation` from TanStack Query for the add torrent operation
- Invalidate `maindata` query on success so the list refreshes
- Add translations for both `en.json` and `zh-Hant.json`
- Use tabs or toggle to switch between Magnet Link and File Upload modes
- Close modal and reset form state on successful add

### DON'T
- Don't create new UI primitive components when existing ones work
- Don't store the uploaded file in state longer than needed
- Don't forget to include `credentials: 'include'` in API calls
- Don't hardcode strings - use i18n translations

## qBittorrent API Reference

### Add Torrent (Magnet Link)
```
POST /api/v2/torrents/add
Content-Type: application/x-www-form-urlencoded

Parameters:
- urls: magnet link(s), one per line
- savepath: (optional) download path
- category: (optional) category name
- paused: (optional) "true" or "false"
```

### Add Torrent (File)
```
POST /api/v2/torrents/add
Content-Type: multipart/form-data

Parameters:
- torrents: .torrent file(s)
- savepath: (optional) download path
- category: (optional) category name
- paused: (optional) "true" or "false"
```

### Get Categories
```
GET /api/v2/torrents/categories

Response: { "category_name": { "name": "...", "savePath": "..." }, ... }
```

## Development Environment

### Start Services

```bash
npm run dev
```

### Service URLs
- React App: http://localhost:3000
- qBittorrent API (proxied via Vite in dev): http://localhost:3000/api/v2/

### Required Environment Variables
- `VITE_QBIT_BASE_URL`: qBittorrent WebUI base URL (e.g., http://192.168.50.52:8080)
- `VITE_QBIT_USERNAME`: qBittorrent username
- `VITE_QBIT_PASSWORD`: qBittorrent password

Or set via localStorage:
- `qbit_baseUrl`
- `qbit_username`
- `qbit_password`

## Success Criteria

The task is complete when:

1. [ ] Users can paste a magnet link into an input field and add it to qBittorrent
2. [ ] Users can upload a .torrent file from their device
3. [ ] Users can optionally specify a save path before adding
4. [ ] Users can assign a category when adding a torrent
5. [ ] Users can choose to start paused or start immediately
6. [ ] The new torrent appears in the list immediately after adding
7. [ ] Mobile users can easily tap to add magnet links from other apps
8. [ ] No console errors during add torrent flow
9. [ ] Existing tests still pass
10. [ ] New functionality verified via browser

## QA Acceptance Criteria

**CRITICAL**: These criteria must be verified by the QA Agent before sign-off.

### Unit Tests
| Test | File | What to Verify |
|------|------|----------------|
| API addTorrentMagnet | `src/lib/api.test.ts` | Function sends correct parameters and handles responses |
| API addTorrentFile | `src/lib/api.test.ts` | Function uses FormData and handles file upload |
| API getCategories | `src/lib/api.test.ts` | Function returns parsed category data |

### Integration Tests
| Test | Services | What to Verify |
|------|----------|----------------|
| AddTorrentModal with mutations | frontend ↔ mock API | Modal triggers mutations and refreshes on success |

### End-to-End Tests
| Flow | Steps | Expected Outcome |
|------|-------|------------------|
| Add magnet link | 1. Click "Add Torrent" 2. Paste magnet link 3. Click Add | Torrent appears in list |
| Add .torrent file | 1. Click "Add Torrent" 2. Select file tab 3. Choose file 4. Click Add | Torrent appears in list |
| Add with category | 1. Open modal 2. Add magnet 3. Select category 4. Submit | Torrent added with category |
| Add paused | 1. Open modal 2. Check "Start Paused" 3. Add torrent | Torrent added in paused state |

### Browser Verification (if frontend)
| Page/Component | URL | Checks |
|----------------|-----|--------|
| Home Page with Sidebar | `http://localhost:3000/` | "Add Torrent" button visible in sidebar |
| Add Torrent Modal | Open modal | Modal opens, tabs work, form fields present |
| Mobile View | Resize to mobile width | Modal is responsive, inputs usable |
| After Adding | Submit valid torrent | Modal closes, list refreshes, torrent appears |

### Error Handling Verification
| Scenario | Expected Behavior |
|----------|------------------|
| Invalid magnet format | Error message shown, form not submitted |
| API returns error | Error message displayed, modal stays open |
| Network failure | Error message with retry option |

### QA Sign-off Requirements
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] All E2E tests pass
- [ ] Browser verification complete
- [ ] No regressions in existing functionality
- [ ] Code follows established patterns (Dialog, useMutation, i18n)
- [ ] No security vulnerabilities introduced
- [ ] Translations added for both en and zh-Hant
