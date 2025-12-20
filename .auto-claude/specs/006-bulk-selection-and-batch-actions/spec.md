# Specification: Bulk Selection and Batch Actions

## Overview

This feature implements multi-select functionality for torrents, enabling users to perform batch operations (pause, resume, delete, category assignment) on multiple torrents simultaneously. The implementation addresses a critical performance issue where VueTorrent users experience UI freezing during bulk operations (pain-2-5). All batch operations will execute asynchronously to maintain UI responsiveness while managing dozens of torrents efficiently.

## Workflow Type

**Type**: feature

**Rationale**: This is new functionality that adds bulk selection capabilities and batch action handlers to the existing torrent management interface. It requires new UI components (checkboxes, batch action toolbar), state management for selections, and optimized async API call patterns.

## Task Scope

### Services Involved
- **main** (primary) - React frontend implementing selection UI, state management, and batch operation handlers

### This Task Will:
- [x] Add checkbox selection to individual torrents in the torrent list
- [x] Implement "select all" functionality for visible/filtered torrents
- [x] Display selected torrent count in the UI
- [x] Add batch action buttons (pause, resume, delete) that appear when torrents are selected
- [x] Implement asynchronous batch operations to prevent UI freezing
- [x] Add category assignment for multiple torrents
- [x] Auto-clear selection after batch action completion
- [x] Provide visual feedback during batch operation execution

### Out of Scope:
- Batch torrent upload/addition (only operations on existing torrents)
- Undo functionality for batch operations
- Batch editing of torrent settings beyond category assignment
- Cross-page selection persistence (selections clear on navigation)

## Service Context

### main

**Tech Stack:**
- Language: TypeScript
- Framework: React
- Build Tool: Vite
- Styling: Tailwind CSS
- State Management: TanStack Query (React Query)
- Routing: TanStack Router
- UI Components: Radix UI (@radix-ui/react-*)
- Icons: lucide-react

**Key Directories:**
- `src/` - Source code directory

**How to Run:**
```bash
npm run dev
```

**Port:** 3000

**External Dependencies:**
- qBittorrent API (base URL: VITE_QBIT_BASE_URL environment variable)

## Files to Modify

| File | Service | What to Change |
|------|---------|---------------|
| *Torrent list component* | main | Add checkbox column for individual torrent selection |
| *Torrent list state/context* | main | Add selection state management (selectedHashes Set, selectAll, clearSelection) |
| *Action toolbar/header* | main | Add batch action buttons (visible when selections exist) with pause/resume/delete/category actions |
| *qBittorrent API client* | main | Add/optimize batch operation methods (pauseTorrents, resumeTorrents, deleteTorrents, setCategoryBatch) |

**Note**: Specific file paths to be identified during implementation phase by exploring the `src/` directory structure.

## Files to Reference

These patterns should guide the implementation:

| Pattern | What to Look For |
|---------|------------------|
| Existing torrent list rendering | Component structure, row rendering, data mapping |
| Single torrent actions (pause/resume/delete) | API call patterns, error handling, UI feedback |
| TanStack Query usage | Mutation patterns, cache invalidation, optimistic updates |
| Radix UI component patterns | Dialog, DropdownMenu, AlertDialog usage for confirmation flows |
| Tailwind CSS conventions | Styling patterns, responsive design, component composition |

**Note**: Reference files to be identified during implementation phase.

## Patterns to Follow

### TanStack Query Mutations

Expected pattern for batch operations:

```typescript
const { mutate: batchPause, isPending } = useMutation({
  mutationFn: async (hashes: string[]) => {
    // Async batch API call
    return await qBitAPI.pauseTorrents(hashes);
  },
  onSuccess: () => {
    // Invalidate torrent list cache
    queryClient.invalidateQueries({ queryKey: ['torrents'] });
    // Clear selections
    clearSelection();
  },
  onError: (error) => {
    // Show error notification
  }
});
```

**Key Points:**
- Use mutations for state-changing operations
- Invalidate relevant queries after success
- Clear selections on completion
- Provide loading states (isPending) for UI feedback
- Handle errors gracefully with user notifications

### Selection State Management

```typescript
// Local state or context
const [selectedHashes, setSelectedHashes] = useState<Set<string>>(new Set());

const toggleSelection = (hash: string) => {
  setSelectedHashes(prev => {
    const next = new Set(prev);
    if (next.has(hash)) {
      next.delete(hash);
    } else {
      next.add(hash);
    }
    return next;
  });
};

const selectAll = (torrents: Torrent[]) => {
  setSelectedHashes(new Set(torrents.map(t => t.hash)));
};

const clearSelection = () => {
  setSelectedHashes(new Set());
};
```

**Key Points:**
- Use Set for O(1) lookup performance
- Provide toggle, selectAll, and clear helpers
- Pass selection state down to list items and action toolbar

### Async Batch Operations

```typescript
// Prevent UI blocking by batching API calls efficiently
const batchOperation = async (hashes: string[], operation: (hash: string) => Promise<void>) => {
  // Option 1: Check if qBittorrent API supports batch endpoints
  // Option 2: Use Promise.all for parallel execution (better than sequential)
  await Promise.all(hashes.map(hash => operation(hash)));
};
```

**Key Points:**
- Use Promise.all for parallel execution instead of sequential loops
- Check if qBittorrent API has native batch endpoints
- Implement proper error handling for partial failures

### Radix UI Checkbox Pattern

```typescript
import * as Checkbox from '@radix-ui/react-checkbox';

<Checkbox.Root
  checked={selectedHashes.has(torrent.hash)}
  onCheckedChange={() => toggleSelection(torrent.hash)}
  className="..."
>
  <Checkbox.Indicator>
    <CheckIcon />
  </Checkbox.Indicator>
</Checkbox.Root>
```

**Key Points:**
- Use Radix UI Checkbox for accessibility
- Bind checked state to selection Set
- Style with Tailwind CSS classes

## Requirements

### Functional Requirements

1. **Individual Torrent Selection**
   - Description: Each torrent row displays a checkbox allowing individual selection
   - Acceptance: Clicking checkbox toggles selection state; visual indicator shows selected torrents

2. **Select All Functionality**
   - Description: Header checkbox or button selects all currently visible/filtered torrents
   - Acceptance: "Select all" toggles all visible torrents; respects current filters/search

3. **Selection Count Display**
   - Description: UI shows count of currently selected torrents
   - Acceptance: Counter updates in real-time as selections change; displays "X selected"

4. **Batch Pause Action**
   - Description: Pause all selected torrents simultaneously
   - Acceptance: Button appears when selections exist; pauses all selected torrents asynchronously; clears selections on completion

5. **Batch Resume Action**
   - Description: Resume all selected torrents simultaneously
   - Acceptance: Button appears when selections exist; resumes all selected torrents asynchronously; clears selections on completion

6. **Batch Delete Action**
   - Description: Delete all selected torrents with confirmation dialog
   - Acceptance: Shows confirmation dialog; deletes all selected torrents on confirm; clears selections on completion; option to delete files included

7. **Batch Category Assignment**
   - Description: Assign category to multiple selected torrents
   - Acceptance: Category selector appears for selected torrents; applies category to all selections; clears selections on completion

8. **Asynchronous Execution**
   - Description: All batch operations run without blocking the UI
   - Acceptance: UI remains responsive during operations; loading indicators show progress; users can cancel/navigate away

9. **Auto-Clear Selections**
   - Description: Selection state clears after batch action completes
   - Acceptance: Checkboxes reset after successful operation; selections clear after navigation

### Edge Cases

1. **Partial Operation Failures** - If some torrents fail batch operation, show error notification listing failed items; don't clear selections for failed items
2. **Empty Selection** - Batch action buttons disabled when no torrents selected
3. **Filter Changes During Selection** - Selections persist if torrents still visible; clear selections that become hidden by filters
4. **Concurrent Operations** - Disable batch actions while operation in progress; show loading state
5. **Large Selection Sets** - Optimize for selections of 50+ torrents; consider chunked API calls if needed
6. **Delete Confirmation** - Always show confirmation dialog for delete; include option to delete files from disk

## Implementation Notes

### DO
- Use TanStack Query mutations for all batch operations
- Implement selection state with Set data structure for performance
- Add Radix UI Checkbox components for accessibility
- Show loading indicators (disabled checkboxes, button spinners) during operations
- Invalidate torrent list query cache after batch operations
- Add confirmation dialog for destructive actions (delete)
- Use Promise.all for parallel API calls to prevent UI blocking
- Clear selections automatically after successful operations
- Display selected count prominently in the UI
- Disable batch action buttons when no selections exist

### DON'T
- Use sequential loops for batch operations (blocks UI)
- Forget to handle partial failures in batch operations
- Keep selections after successful completion
- Allow batch actions while another batch operation is running
- Forget to check if qBittorrent API has native batch endpoints
- Skip confirmation dialogs for destructive actions
- Mutate selection state directly (use Set immutably)

## Development Environment

### Start Services

```bash
# Install dependencies (if needed)
npm install

# Start development server
npm run dev
```

### Service URLs
- main: http://localhost:3000

### Required Environment Variables
- `VITE_QBIT_BASE_URL`: qBittorrent API base URL (e.g., "http://192.168.50.52:8080")
- `VITE_QBIT_USERNAME`: qBittorrent API username (e.g., "admin")
- `VITE_QBIT_PASSWORD`: qBittorrent API password

**Note**: Set these in `.env` file in project root (see `.env.example` for template)

## Success Criteria

The task is complete when:

1. [x] Users can select individual torrents via checkbox
2. [x] "Select all" checkbox/button selects all visible/filtered torrents
3. [x] Selected count displays in the UI (e.g., "5 selected")
4. [x] Batch pause button pauses all selected torrents asynchronously
5. [x] Batch resume button resumes all selected torrents asynchronously
6. [x] Batch delete button deletes selected torrents (with confirmation)
7. [x] Category can be assigned to multiple selected torrents
8. [x] Selections clear automatically after batch action completes
9. [x] UI remains responsive during batch operations (no freezing)
10. [x] Loading indicators appear during operations
11. [x] No console errors during selection or batch operations
12. [x] Existing tests still pass
13. [x] Feature verified via browser at http://localhost:3000

## QA Acceptance Criteria

**CRITICAL**: These criteria must be verified by the QA Agent before sign-off.

### Unit Tests
| Test | File | What to Verify |
|------|------|----------------|
| Selection state management | `src/**/*.test.ts(x)` | toggleSelection, selectAll, clearSelection functions work correctly |
| Batch operation mutations | `src/**/*.test.ts(x)` | TanStack Query mutations call correct API methods with selected hashes |
| Edge case handling | `src/**/*.test.ts(x)` | Empty selections disable actions; partial failures handled |

### Integration Tests
| Test | Services | What to Verify |
|------|----------|----------------|
| Batch API calls | main ↔ qBittorrent API | Batch operations call API correctly; cache invalidation triggers |
| Selection + Filter interaction | main | Selections respect current filters; hidden items not selected by "select all" |

### End-to-End Tests
| Flow | Steps | Expected Outcome |
|------|-------|------------------|
| Bulk Delete Flow | 1. Select 3 torrents 2. Click delete 3. Confirm dialog | Confirmation shown, 3 torrents deleted, selections cleared |
| Bulk Pause Flow | 1. Select 5 downloading torrents 2. Click pause | All 5 torrents paused, selections cleared, UI responsive |
| Bulk Category Assignment | 1. Select 10 torrents 2. Choose category 3. Apply | Category applied to all 10, selections cleared |
| Select All + Action | 1. Click "select all" 2. Click resume | All visible torrents selected and resumed |

### Browser Verification
| Component | URL | Checks |
|-----------|-----|--------|
| Torrent List | `http://localhost:3000` | Checkboxes appear on each torrent row |
| Batch Action Toolbar | `http://localhost:3000` | Toolbar/buttons appear when torrents selected, show selected count |
| Selection Feedback | `http://localhost:3000` | Selected torrents have visual highlight; checkboxes checked |
| Loading States | `http://localhost:3000` | Spinners/disabled states during batch operations |
| Confirmation Dialogs | `http://localhost:3000` | Delete confirmation dialog appears with correct count |

### Performance Verification
| Scenario | Test | Expected |
|----------|------|----------|
| Large selection (50+ torrents) | Select 50 torrents, click pause | Operation completes in <3s, UI remains responsive |
| UI Responsiveness | Initiate batch delete of 20 torrents | User can scroll, select other torrents during operation |
| No Freezing | Batch operation on 30 torrents | No browser "page unresponsive" warnings |

### QA Sign-off Requirements
- [x] All unit tests pass
- [x] Integration tests verify API interactions
- [x] All E2E flows complete successfully
- [x] Browser verification confirms UI elements render correctly
- [x] Performance tests show no UI freezing (addresses pain-2-5)
- [x] Checkboxes accessible via keyboard navigation
- [x] Loading states provide clear feedback
- [x] Confirmation dialogs prevent accidental destructive actions
- [x] Selections clear automatically after operations
- [x] No console errors or warnings
- [x] No regressions in existing torrent management functionality
- [x] Code follows React/TypeScript/TanStack patterns
- [x] Tailwind CSS classes used consistently with existing styles
