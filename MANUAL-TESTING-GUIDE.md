# Manual Testing Guide - Language Switching Feature

## Test Environment Status

✅ **Dev Server**: Running on http://localhost:3000
⚠️  **Note**: There are some unrelated import warnings for API functions (addTorrentTags, addTrackers, etc.), but these do not affect the language switching feature.

## Prerequisites

1. Dev server is running at http://localhost:3000
2. Browser with developer console access (Chrome, Firefox, Safari, Edge)

## Test Procedure

### Test 1: Language Switcher UI

1. Open http://localhost:3000 in your browser
2. Click the **Settings** icon (gear icon in the toolbar)
3. Verify the Settings modal opens
4. Locate the **Language** dropdown field
5. Click on the dropdown

**Expected Results:**
- ✓ Dropdown opens and shows all 7 language options:
  - English
  - 繁體中文 (Traditional Chinese)
  - 简体中文 (Simplified Chinese)
  - Español (Spanish)
  - Deutsch (German)
  - Français (French)
  - 日本語 (Japanese)
- ✓ Current language has a checkmark/radio indicator
- ✓ No console errors when opening dropdown

### Test 2: Language Switching (Each Language)

For **each** of the 7 languages, perform the following:

#### 2.1 English
1. Select "English" from dropdown
2. **Immediate UI Update**: Verify UI text changes to English immediately
3. **Console Check**: Open browser DevTools → Console tab, verify NO errors
4. **UI Elements to Check**:
   - Sidebar status labels (All, Downloading, Seeding, Completed, etc.)
   - Torrent table headers (Name, Size, Progress, Status, etc.)
   - Settings modal fields (Dark Mode, Language, etc.)
   - Buttons (Pause, Resume, Delete, etc.)
5. **Page Refresh**: Refresh the page (F5 or Cmd+R)
6. **Persistence**: Verify language remains English after refresh
7. **Number Formatting**: Check if byte sizes use English formatting (e.g., "1,234.56 MB")

#### 2.2 繁體中文 (Traditional Chinese)
1. Select "繁體中文" from dropdown
2. Repeat steps 2-7 from English test
3. Verify UI displays Traditional Chinese characters
4. Example checks:
   - "All" → "全部"
   - "Downloading" → "下載中"
   - "Name" → "名稱"

#### 2.3 简体中文 (Simplified Chinese)
1. Select "简体中文" from dropdown
2. Repeat steps 2-7 from English test
3. Verify UI displays Simplified Chinese characters
4. Example checks:
   - "All" → "全部"
   - "Downloading" → "下载中"
   - "Name" → "名称"

#### 2.4 Español (Spanish)
1. Select "Español" from dropdown
2. Repeat steps 2-7 from English test
3. Verify UI displays Spanish text
4. Example checks:
   - "All" → "Todos"
   - "Downloading" → "Descargando"
   - "Name" → "Nombre"
5. **Number Formatting**: Check if byte sizes use Spanish formatting (e.g., "1.234,56 MB")

#### 2.5 Deutsch (German)
1. Select "Deutsch" from dropdown
2. Repeat steps 2-7 from English test
3. Verify UI displays German text
4. Example checks:
   - "All" → "Alle"
   - "Downloading" → "Wird heruntergeladen"
   - "Name" → "Name"
5. **Number Formatting**: Check if byte sizes use German formatting (e.g., "1.234,56 MB")

#### 2.6 Français (French)
1. Select "Français" from dropdown
2. Repeat steps 2-7 from English test
3. Verify UI displays French text
4. Example checks:
   - "All" → "Tous"
   - "Downloading" → "Téléchargement"
   - "Name" → "Nom"
5. **Number Formatting**: Check if byte sizes use French formatting (e.g., "1 234,56 Mo")

#### 2.7 日本語 (Japanese)
1. Select "日本語" from dropdown
2. Repeat steps 2-7 from English test
3. Verify UI displays Japanese text
4. Example checks:
   - "All" → "すべて"
   - "Downloading" → "ダウンロード中"
   - "Name" → "名前"

### Test 3: Cross-Browser Testing (Optional but Recommended)

Repeat Test 2 for at least 2-3 languages in different browsers:
- Chrome/Edge
- Firefox
- Safari (if on macOS)

### Test 4: Locale-Specific Number Formatting

1. Navigate to torrent list (if available)
2. Find torrents with file sizes displayed
3. For each language, verify `formatBytes()` displays numbers with appropriate locale formatting:
   - **English (en)**: 1,234.56 MB (comma thousands, period decimal)
   - **Chinese (zh-Hant, zh-CN)**: 1,234.56 MB (may vary)
   - **Spanish (es)**: 1.234,56 MB (period thousands, comma decimal)
   - **German (de)**: 1.234,56 MB (period thousands, comma decimal)
   - **French (fr)**: 1 234,56 MB (space thousands, comma decimal)
   - **Japanese (ja)**: 1,234.56 MB (may vary)

## Test Results Checklist

Mark each item when verified:

- [ ] Settings modal opens without errors
- [ ] Language dropdown displays all 7 options
- [ ] English - UI updates immediately
- [ ] English - No console errors
- [ ] English - Language persists after refresh
- [ ] 繁體中文 - UI updates immediately
- [ ] 繁體中文 - No console errors
- [ ] 繁體中文 - Language persists after refresh
- [ ] 简体中文 - UI updates immediately
- [ ] 简体中文 - No console errors
- [ ] 简体中文 - Language persists after refresh
- [ ] Español - UI updates immediately
- [ ] Español - No console errors
- [ ] Español - Language persists after refresh
- [ ] Deutsch - UI updates immediately
- [ ] Deutsch - No console errors
- [ ] Deutsch - Language persists after refresh
- [ ] Français - UI updates immediately
- [ ] Français - No console errors
- [ ] Français - Language persists after refresh
- [ ] 日本語 - UI updates immediately
- [ ] 日本語 - No console errors
- [ ] 日本語 - Language persists after refresh
- [ ] Number formatting is locale-aware

## Known Issues

⚠️ **Unrelated Import Warnings**: The dev server shows warnings about missing API exports (addTorrentTags, addTrackers, recheckTorrent, etc.). These are unrelated to the language switching feature and do not affect this testing.

## Reporting Results

After completing all tests, document:
1. ✅ **Pass**: All items in checklist are verified
2. ❌ **Fail**: Which specific tests failed and error details
3. 📝 **Notes**: Any observations or issues discovered

## Completion

Once all tests pass, respond with "Manual verification complete - all tests passed" to confirm subtask completion.
