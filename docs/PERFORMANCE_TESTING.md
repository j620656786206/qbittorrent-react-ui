# Virtual Scrolling Performance Testing Guide

This document provides comprehensive instructions for testing the virtual scrolling implementation with 1000+ torrents.

## Prerequisites

- Chrome browser (for DevTools performance profiling)
- Development server running (`npm run dev`)
- Access to browser DevTools (F12)

## Quick Start

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Open Chrome DevTools console and inject mock torrents:
   ```javascript
   // Inject 2000 mock torrents
   window.__injectMockTorrents(2000)
   ```

3. The mock torrents can be accessed via `window.__getMockTorrents()` and passed to components for testing.

## Performance Test Utilities

### Browser Console Commands

In development mode, the following commands are available in the browser console:

```javascript
// Generate and inject mock torrents
window.__injectMockTorrents(count)  // Default: 1000 torrents

// Clear mock torrents
window.__clearMockTorrents()

// Get performance report (DOM nodes, memory usage)
window.__getPerformanceReport()

// Access generated mock torrents
window.__getMockTorrents()
```

### Performance Metrics API

```javascript
// Access the performance test utilities
const { generateMockTorrents, PerformanceMetrics } = window.__PERF_TEST__

// Generate torrents for testing
const torrents = generateMockTorrents(2000)

// Count DOM nodes in table body
PerformanceMetrics.countDOMNodes()

// Get memory usage
PerformanceMetrics.getMemoryUsage()

// Log full performance report
PerformanceMetrics.logPerformanceReport(torrents.length)
```

## Manual Verification Tests

### Test 1: 60fps Scrolling Performance

**Objective:** Verify smooth 60fps scrolling with 1000+ torrents

**Steps:**
1. Open the application in Chrome
2. Open DevTools > Performance tab
3. Inject 2000 mock torrents using console
4. Click the "Record" button (or press Ctrl+E)
5. Scroll rapidly up and down through the torrent list for 5 seconds
6. Stop recording

**Expected Results:**
- Average FPS >= 58 (green in the FPS chart)
- No significant frame drops (red bars in FPS chart)
- No long task markers (> 50ms)

**How to Read Results:**
- Look at the "Frames" section - green bars indicate good performance
- Check the "Summary" panel for total scripting/rendering time
- Hover over the FPS chart to see exact frame rates

### Test 2: Sub-linear Memory Scaling

**Objective:** Verify memory usage doesn't scale linearly with torrent count

**Steps:**
1. Open DevTools > Memory tab
2. Clear existing data and force garbage collection (click trash icon)
3. Take heap snapshot #1 with 100 torrents
4. Record the "Shallow Size" of the snapshot
5. Repeat for 500, 1000, and 2000 torrents

**Test Script:**
```javascript
// Run this sequence, taking heap snapshots between each
window.__injectMockTorrents(100)
// Take snapshot, record size

window.__injectMockTorrents(500)
// Take snapshot, record size

window.__injectMockTorrents(1000)
// Take snapshot, record size

window.__injectMockTorrents(2000)
// Take snapshot, record size
```

**Expected Results:**
| Torrent Count | Expected Memory Range |
|---------------|----------------------|
| 100           | Baseline             |
| 500           | < 3x baseline        |
| 1000          | < 4x baseline        |
| 2000          | < 6x baseline        |

**Key Verification:**
Memory at 2000 torrents should be LESS than 2x the memory at 1000 torrents.

### Test 3: DOM Node Count Verification

**Objective:** Verify only ~15-20 rows are rendered regardless of total count

**Steps:**
1. Open DevTools > Elements tab
2. Inject 2000 mock torrents
3. Locate the torrent table body container
4. Count the number of row elements

**Console Verification:**
```javascript
// Count DOM rows in table view
window.__getPerformanceReport()
// Check "domNodes" value in output
```

**Expected Results:**
- DOM rows: 15-20 elements (visible + overscan)
- This count should remain constant regardless of total torrent count
- Scrolling should not significantly change this count

### Test 4: Search/Filter Response Time

**Objective:** Verify search results appear within 100ms

**Steps:**
1. Inject 2000 mock torrents
2. Open DevTools > Performance tab
3. Start recording
4. Type a search query in the search input
5. Stop recording
6. Measure time from input event to render complete

**Alternative Console Test:**
```javascript
// Test filter performance
const startTime = performance.now()
// Type in search box
// Wait for results
const endTime = performance.now()
console.log(`Filter time: ${endTime - startTime}ms`)
```

**Expected Results:**
- Filter/search response time < 100ms
- No visible lag when typing
- Results update smoothly without flickering

### Test 5: Mobile Card View Verification

**Objective:** Verify card view virtualization works correctly

**Steps:**
1. Open DevTools and toggle device toolbar (Ctrl+Shift+M)
2. Select a mobile viewport (e.g., iPhone 12 Pro)
3. Inject 1000 mock torrents
4. Verify card view is displayed
5. Scroll through the list rapidly
6. Check DOM node count

**Expected Results:**
- Only visible cards rendered (typically 4-8 cards depending on viewport)
- Smooth scrolling at 60fps
- Cards maintain proper height after scrolling

## Performance Benchmarks

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Scrolling FPS | >= 60fps | Chrome DevTools Performance tab |
| DOM Node Count | <= 30 items | Browser Inspector element count |
| Initial Render Time | < 500ms | Performance.mark() timing |
| Search Response | < 100ms | Time from input to render |
| Memory Scaling | Sub-linear | Heap snapshots comparison |

## Troubleshooting

### Issue: Low FPS during scrolling
- Check for expensive re-renders using React DevTools Profiler
- Verify `overscan` value is not too high (should be 5 for table, 3 for cards)
- Look for non-virtualized content inside the virtualized container

### Issue: Memory usage too high
- Ensure only visible rows are being rendered
- Check for memory leaks in event listeners
- Verify mutation observers are properly cleaned up

### Issue: Incorrect DOM node count
- Verify virtualizer is properly initialized
- Check that parent container has `overflow: auto` and defined height
- Ensure `estimateSize` values are accurate

### Issue: Search feels slow
- Verify filtering happens on memoized data
- Check for expensive calculations in filter logic
- Consider debouncing search input for very large lists

## Creating Test Reports

To create a formal performance test report, use this template:

```markdown
# Performance Test Report

**Date:** [Date]
**Torrent Count Tested:** [Count]
**Browser:** [Browser/Version]

## Results

### 1. Scrolling Performance
- Average FPS: [X] fps
- Frame drops: [Yes/No]
- Status: [PASS/FAIL]

### 2. Memory Scaling
- 100 torrents: [X] MB
- 500 torrents: [X] MB
- 1000 torrents: [X] MB
- 2000 torrents: [X] MB
- 2000/1000 ratio: [X] (target: < 2.0)
- Status: [PASS/FAIL]

### 3. DOM Node Count
- Total torrents: [X]
- DOM nodes rendered: [X]
- Status: [PASS/FAIL]

### 4. Search Response Time
- Response time: [X] ms
- Status: [PASS/FAIL]

### Overall: [PASS/FAIL]
```

## Integration with Automated Testing

For automated performance testing, consider adding these to your test suite:

```typescript
import { generateMockTorrents, PerformanceMetrics } from '@/lib/performance-test-utils'

describe('Performance Tests', () => {
  it('should render only visible rows with 1000 torrents', () => {
    const torrents = generateMockTorrents(1000)
    // Render component with torrents
    // Verify DOM node count
    expect(PerformanceMetrics.countDOMNodes()).toBeLessThanOrEqual(30)
  })
})
```

## Conclusion

Virtual scrolling is verified as working correctly when:
1. Scrolling maintains 60fps with 1000+ torrents
2. Memory at 2000 torrents < 2x memory at 1000 torrents
3. DOM contains only ~15-20 rows regardless of total count
4. Search/filter results appear within 100ms
