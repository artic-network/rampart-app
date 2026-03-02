# RAMPART Electron Settings UI

## Overview

The Electron app now launches with an initial settings UI that allows users to configure RAMPART before starting the server. This replaces the need for command-line arguments.

## Features

### Settings Page
The settings UI provides a clean, user-friendly interface to configure:

**Required Settings:**
- **Run Title** - A descriptive name for the sequencing run
- **Basecalled FASTQ Directory** - Path to MinKNOW basecalled files (*required*)

**Standard Settings:**
- **Output Directory** - Where annotation CSVs are saved (default: `./annotations`)
- **Protocol Directory** - Path to custom protocol (optional, uses default if empty)

**Advanced Options:**
- **References FASTA File** - Reference sequences panel path
- **Clear Existing Annotations** - Remove annotation files on startup
- **Verbose Logging** - Enable detailed console output

### File/Folder Browser
Each path field has a "Browse" button that opens the native macOS/Windows file picker:
- Folder picker for directories
- File picker for FASTA files

### Settings Persistence
- Settings are automatically saved to: `~/Library/Application Support/artic-rampart/rampart-settings.json` (macOS)
- Settings are loaded automatically on next launch
- "Use Defaults" button resets to default values

## User Flow

1. **Launch App** → Settings page appears
2. **Configure Paths** → Use text input or Browse buttons
3. **Click "Start RAMPART"** → Settings are validated and saved
4. **Server Starts** → Loading screen appears
5. **Main App Loads** → RAMPART interface opens when server is ready

## Implementation Details

### Files Created/Modified

**New Files:**
- `public/settings.html` - Settings UI (HTML/CSS/JS)
- `src/preload.js` - Secure IPC bridge between renderer and main process

**Modified Files:**
- `src/electron.js` - Added settings management, IPC handlers, modified startup flow

### Settings Storage

Settings are stored as JSON in the Electron userData directory:
```json
{
  "title": "EBOV Run 2026-03-02",
  "basecalledPath": "/path/to/fastq/pass",
  "annotatedPath": "./annotations",
  "protocol": "",
  "referencesPath": "/path/to/references.fasta",
  "clearAnnotated": false,
  "verbose": false
}
```

### IPC Communication

The settings page communicates with the main process using these secure IPC methods:

```javascript
// Exposed via contextBridge in preload.js
window.electronAPI.loadSettings()      // Load saved settings
window.electronAPI.selectPath(isFile)  // Open file/folder picker
window.electronAPI.startServer(settings) // Start RAMPART with config
```

### Security

- **Context Isolation**: Enabled for security
- **Context Bridge**: Safe IPC exposure via preload script
- **No Node Integration**: Renderer process cannot access Node.js directly

## Development

### Testing Settings UI
```bash
npm run electron
```

The app will open with the settings page. Configure and test.

### Modifying the UI

Edit `public/settings.html` to change:
- Styling (embedded CSS in `<style>` tag)
- Layout (HTML structure)
- Behavior (JavaScript in `<script>` tag)

Changes take effect on next app launch (no rebuild needed for HTML/CSS/JS changes).

### Adding New Settings

1. Add form field to `settings.html`
2. Include in settings object on form submit
3. Pass to `startServer()` in `src/electron.js`
4. Use in `getInitialConfig()` args

## Troubleshooting

### Settings not saving
- Check file permissions in userData directory
- Look for errors in DevTools console (View → Toggle Developer Tools)

### Browse button not working
- Verify preload.js is loaded (check webPreferences in electron.js)
- Check IPC handler is registered in main process

### Server fails to start
- Verify basecalledPath exists
- Check server console logs (visible in terminal)
- Ensure required files (references.fasta) are accessible

## Future Enhancements

Potential improvements:
- [ ] Recent paths dropdown
- [ ] Protocol templates/presets
- [ ] Server status indicator
- [ ] Settings validation before server start
- [ ] Example data path with one-click setup
- [ ] Import/export settings profiles
