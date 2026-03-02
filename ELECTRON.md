# RAMPART Electron Desktop Application

This guide explains how to build and package RAMPART as a desktop application for macOS and Windows using Electron.

## Prerequisites

### All Platforms
- Node.js (v14 or later)
- npm
- Python (for Snakemake pipelines)
- Snakemake installed and available in PATH

### macOS
- Xcode Command Line Tools
- For code signing (optional): Apple Developer account

### Windows
- For building on Windows: Windows 10/11
- For cross-compilation from Mac/Linux: Wine (see Cross-Platform Building below)

## Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

   This will install all required packages including Electron and electron-builder.

2. **Build the React frontend:**
   ```bash
   npm run build
   ```

## Development

### Running in Development Mode

**Option 1: Using two terminals (recommended for development)**

Terminal 1 - Start the React dev server:
```bash
npm start
```

Terminal 2 - Start Electron (once React server is ready):
```bash
npm run electron-dev
```

**Option 2: Using the helper script**

In one terminal:
```bash
npm start
```

In another terminal:
```bash
node electron-start.js
```

This script will wait for the React dev server to be ready before launching Electron.

### Running in Production Mode

```bash
npm run build
npm run electron
```

## Building Distributable Packages

### Build for Current Platform

To create a distributable package for your current platform:

```bash
npm run dist
```

This will create installers in the `dist/` directory.

### Build for macOS

```bash
npm run dist:mac
```

**Output formats:**
- **DMG**: Drag-and-drop installer (`dist/RAMPART-1.2.1.dmg`)
- **ZIP**: Portable app (`dist/RAMPART-1.2.1-mac.zip`)

Supports both Intel (x64) and Apple Silicon (arm64).

### Build for Windows

```bash
npm run dist:win
```

**Output formats:**
- **NSIS Installer**: Traditional Windows installer (`dist/RAMPART Setup 1.2.1.exe`)
- **Portable**: Standalone executable (`dist/RAMPART 1.2.1.exe`)

### Build for All Platforms

```bash
npm run dist:all
```

Builds macOS and Windows packages. Note: Building Windows packages from macOS/Linux requires Wine.

## Cross-Platform Building

### Building Windows Apps on macOS/Linux

electron-builder can create Windows installers from macOS or Linux, but requires Wine:

**On macOS:**
```bash
brew install wine-stable
npm run dist:win
```

**On Ubuntu/Debian:**
```bash
sudo dpkg --add-architecture i386
sudo apt update
sudo apt install wine64 wine32
npm run dist:win
```

### Building macOS Apps on Windows/Linux

Building macOS apps requires macOS or a macOS VM due to Apple's restrictions.

## Configuration

### Electron Builder Configuration

The build configuration is in [package.json](package.json) under the `"build"` key. Key settings:

- **appId**: `network.artic.rampart`
- **productName**: RAMPART
- **Files included**: React build, server code, protocol files, dependencies

### Icons

App icons should be placed in `public/`:
- **macOS**: `icon.icns` (512x512 or higher)
- **Windows**: `icon.ico` (256x256, multiple sizes)
- **Linux**: `icon.png` (512x512)

Currently using favicon.ico as fallback. For production, create proper icons:

**Creating icons from a PNG:**
```bash
# macOS (requires iconutil)
mkdir icon.iconset
# Add various sizes (16x16 through 512x512)
iconutil -c icns icon.iconset -o public/icon.icns

# Windows (requires ImageMagick)
convert icon.png -define icon:auto-resize=256,128,64,48,32,16 public/icon.ico
```

## Code Signing

### macOS

For distribution outside the App Store, you should code sign your app:

1. Get an Apple Developer account
2. Create a Developer ID Application certificate
3. Add to package.json build config:
   ```json
   "mac": {
     "identity": "Developer ID Application: Your Name (TEAM_ID)"
   }
   ```

### Windows

For Windows, you can use a code signing certificate:

1. Obtain a code signing certificate
2. Add to package.json:
   ```json
   "win": {
     "certificateFile": "path/to/cert.pfx",
     "certificatePassword": "your_password"
   }
   ```

Or use environment variables for security.

## Troubleshooting

### "Electron failed to install correctly"

Try:
```bash
rm -rf node_modules
npm cache clean --force
npm install
```

### "Cannot find module" errors

Ensure you've built the React app first:
```bash
npm run build
```

### Port already in use

The Electron app uses ports 3555 and 3556. If these are in use, the app will fail to start. Close other applications using these ports.

### Snakemake not found

Ensure Snakemake is installed and in your system PATH:
```bash
which snakemake  # macOS/Linux
where snakemake  # Windows
```

### Build fails on macOS with "Cannot find package"

Try cleaning the build cache:
```bash
rm -rf dist
npm run dist:mac
```

### Windows build fails with "wine: not found"

Install Wine (see Cross-Platform Building above) or build on a Windows machine.

## App Structure

```
RAMPART.app (or RAMPART.exe)
├── Electron runtime
├── React frontend (in build/)
├── Node.js server (in server/)
└── All node_modules
```

The packaged app is completely standalone and includes:
- Embedded Chromium browser
- Node.js runtime
- All dependencies
- Server code and protocols

Users only need to have Snakemake and Python installed separately.

## File Sizes

Expected package sizes:
- **macOS DMG**: ~200-250 MB
- **Windows installer**: ~150-200 MB
- **Unpacked app**: ~400-500 MB

## Distribution

### macOS
- Share the `.dmg` file
- Users drag RAMPART.app to Applications folder
- First launch may require right-click > Open (unsigned apps)

### Windows
- Share the `.exe` installer or portable `.exe`
- Installer creates Start Menu shortcuts
- May trigger SmartScreen on first run (unsigned apps)

## Next Steps

1. Create proper app icons for all platforms
2. Set up code signing for trusted distribution
3. Consider creating a GitHub Release with automated builds
4. Add auto-update functionality (using electron-updater)

## Resources

- [electron-builder documentation](https://www.electron.build/)
- [Electron documentation](https://www.electronjs.org/docs)
- [Code signing guide](https://www.electron.build/code-signing)
