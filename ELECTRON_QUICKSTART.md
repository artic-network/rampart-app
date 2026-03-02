# RAMPART Electron Quick Start

## What Was Set Up

Your RAMPART app has been configured for Electron desktop packaging with the following changes:

### Files Created/Modified:
1. ✅ [src/electron.js](src/electron.js) - Updated to properly load server and handle production builds
2. ✅ [package.json](package.json) - Added Electron dependencies and build configuration
3. ✅ [electron-start.js](electron-start.js) - Development helper script
4. ✅ [ELECTRON.md](ELECTRON.md) - Complete documentation
5. ✅ [.gitignore](.gitignore) - Added Electron build artifacts

### Dependencies Installed:
- `electron` v28.0.0
- `electron-builder` v24.13.0

## Quick Commands

### Development
```bash
# Terminal 1: Start React dev server
npm start

# Terminal 2: Start Electron (once React is ready)
npm run electron-dev
```

### Build Desktop Apps

```bash
# Build for current platform (Mac or Windows)
npm run dist

# Build for macOS only (DMG + ZIP)
npm run dist:mac

# Build for Windows only (Installer + Portable)
npm run dist:win

# Build for both Mac and Windows
npm run dist:all
```

## What You Get

After running `npm run dist:mac`, you'll find in the `dist/` folder:
- **RAMPART-1.2.1.dmg** - Installer for macOS (Intel + Apple Silicon)
- **RAMPART-1.2.1-mac.zip** - Portable app

After running `npm run dist:win`:
- **RAMPART Setup 1.2.1.exe** - Windows installer
- **RAMPART 1.2.1.exe** - Portable executable

## Next Steps

### 1. Test It Out
First, build the React app then try running Electron:
```bash
npm run build
npm run electron
```

The app should open in a desktop window. You can then configure basecalled directories through the UI.

### 2. Create Icons (Recommended)
The build configuration expects app icons at:
- `public/icon.icns` (macOS) - 512x512 or larger
- `public/icon.ico` (Windows) - 256x256, multiple sizes

Without these, it will use the default Electron icon.

### 3. Build Distributablepackages
```bash
npm run dist:mac     # On Mac, builds .dmg installer
npm run dist:win     # Requires Wine on Mac/Linux
```

Packages appear in the `dist/` directory.

### 4. Optional: Code Signing
For trusted distribution (no security warnings):
- **macOS**: Get Apple Developer ID (see [ELECTRON.md](ELECTRON.md))
- **Windows**: Get code signing certificate

### 5. Distribution
Share the `.dmg` (Mac) or `.exe` (Windows) files with users. The apps are completely self-contained with:
- Electron runtime
- Node.js server
- React frontend  
- All dependencies

**Note**: Users still need Python and Snakemake installed separately for the analysis pipelines to work.

## Important Notes

### Port Configuration
The Electron app uses ports **3555** and **3556** (instead of 3000/3001 used by CLI mode). This avoids conflicts with the development server.

### Protocol Configuration
On first run, users will need to configure:
- Basecalled FASTQ directory path
- Protocol directory (e.g., example-mpxv/protocol/)
- Output paths

These are typically configured through the RAMPART UI.

### Troubleshooting

**"Electron failed to install"**
```bash
rm -rf node_modules package-lock.json
npm install
```

**"Cannot find module"**
```bash
npm run build  # Build React app first
```

**Build fails**
See the detailed troubleshooting section in [ELECTRON.md](ELECTRON.md).

## Full Documentation

For complete details, configuration options, cross-platform building, code signing, and more, see:

📖 **[ELECTRON.md](ELECTRON.md)**

## Architecture

The packaged app contains:
- **Electron Shell**: Provides the desktop window
- **Node.js Server**: Runs in main process (server/ directory)
- **React Frontend**: Rendered in browser window (build/ directory)
- **Python Pipelines**: Custom annotation scripts (protocol/pipelines/)

The server starts automatically when the app launches and communicates with the frontend via Socket.IO on localhost.

## Questions?

- Server code: [server/](server/)
- Electron main process: [src/electron.js](src/electron.js)
- Full docs: [ELECTRON.md](ELECTRON.md)
- Project README: [README.md](README.md)
