# RAMPART User Requirements

## For Running RAMPART (Users)

### Minimal Requirements

**Python 3.9 or later** with **mappy**

That's it! The RAMPART app bundles everything else.

### Installation Options

#### Option 1: Simple pip install (Recommended)

```bash
# Check Python version (needs 3.9+)
python3 --version

# Install mappy
pip install mappy

# Or with pip3
pip3 install mappy
```

#### Option 2: Using conda (Alternative)

If you prefer conda environments:

```bash
conda env create -f environment.yml
conda activate artic-rampart
```

Or create manually:

```bash
conda create -n artic-rampart python=3.9
conda activate artic-rampart
pip install mappy
```

### Verification

```bash
python3 -c "import mappy; print(f'mappy {mappy.__version__} installed')"
```

Should output: `mappy 2.30 installed` (or similar version)

### What's Bundled in the App

- ✅ minimap2 binary (284KB) - No separate installation needed!
- ✅ Node.js runtime (built into Electron)
- ✅ React frontend
- ✅ Server code

### Platform-Specific Notes

**macOS:**
- Use system Python or Homebrew: `brew install python3`
- Or use conda if you prefer

**Windows:**
- Download Python from python.org
- Or use Conda/Miniconda
- Or use bundled Python (in fully-packaged Windows builds)

**Linux:**
- Use system Python (usually pre-installed)
- Or use conda if you prefer

---

## For Development

### Requirements

- Node.js 18+ (for building the Electron app)
- Python 3.9+ with mappy (for pipeline)
- npm packages (installed via `npm install`)

### Setup

```bash
# Clone repository
git clone https://github.com/artic-network/rampart.git
cd rampart

# Install Node dependencies
npm install

# Install Python dependencies
pip install mappy

# Or use conda
conda env create -f environment.yml
conda activate artic-rampart

# Run in development
npm run electron
```

---

## Migration from Previous Versions

If you previously installed RAMPART with conda and had:
- ❌ snakemake-minimal (no longer needed)
- ❌ biopython (no longer needed)
- ❌ porechop (no longer needed)  
- ❌ minimap2 (now bundled in app)
- ✅ mappy (still needed)

You can simply:
```bash
pip install mappy
```

No conda environment required!

---

## Size Comparison

| Setup | Size | Notes |
|-------|------|-------|
| **pip install mappy** | **~3MB** | ✅ Recommended |
| conda environment | ~495MB | Overkill for just mappy |
| Old conda (with snakemake) | ~500MB+ | No longer needed |

---

## Troubleshooting

### "mappy not found" error

```bash
# Make sure it's installed
pip install mappy

# Verify
python3 -c "import mappy"
```

### "minimap2 not found" error

This shouldn't happen with bundled app, but if it does:
- The app bundles minimap2 automatically
- Check BUNDLED_RESOURCES.md for details
- As fallback, you can: `brew install minimap2` (macOS) or download from GitHub releases

### Python version too old

```bash
# Check version (needs 3.9+)
python3 --version

# Update Python:
# - macOS: brew upgrade python3
# - Windows: Download from python.org
# - Linux: Use system package manager
```

---

## Summary

**TL;DR for users:**

```bash
# That's it! Just one command:
pip install mappy

# Then run RAMPART
```

The RAMPART Electron app handles everything else automatically!
