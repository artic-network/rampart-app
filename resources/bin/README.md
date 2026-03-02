# Bundled Binaries

This directory contains platform-specific binaries that are bundled with the RAMPART Electron app.

## minimap2

minimap2 is a versatile sequence alignment program for aligning DNA/RNA sequences against a large sequence database.

### Obtaining binaries:

#### macOS (darwin)
```bash
# Already included if you have conda installed
conda install -c bioconda minimap2
cp $(which minimap2) resources/bin/darwin/minimap2
chmod +x resources/bin/darwin/minimap2
```

Or download from: https://github.com/lh3/minimap2/releases

#### Windows (win32)
Download from: https://github.com/lh3/minimap2/releases
- Get `minimap2-X.XX_x64-win.zip`
- Extract `minimap2.exe` to `resources/bin/win32/`

#### Linux
```bash
# Download precompiled binary
wget https://github.com/lh3/minimap2/releases/download/v2.27/minimap2-2.27_x64-linux.tar.bz2
tar -xjf minimap2-2.27_x64-linux.tar.bz2
cp minimap2-2.27_x64-linux/minimap2 resources/bin/linux/
chmod +x resources/bin/linux/minimap2
```

## Directory structure:
```
resources/
├── bin/
│   ├── darwin/         # macOS binaries
│   │   └── minimap2
│   ├── win32/          # Windows binaries
│   │   └── minimap2.exe
│   └── linux/          # Linux binaries
│       └── minimap2
└── python/
    └── win32/          # Windows Python embeddable (for full bundling)
        ├── python.exe
        ├── python312.dll
        └── Lib/
```

## Usage

These binaries are automatically detected and used by the Electron app at runtime.
The app will:
1. First try bundled binary in app resources
2. Fall back to system PATH if bundled version not found
3. Fall back to conda environment if available
