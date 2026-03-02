# Bundled Python (Windows Only)

For Windows builds, we bundle a minimal Python environment to make the app fully self-contained.

## Setup for Windows builds:

### 1. Download Python Embeddable Package

Download from: https://www.python.org/downloads/windows/

- Get **Windows embeddable package (64-bit)** for Python 3.12.x
- Example: `python-3.12.2-embed-amd64.zip`

### 2. Extract to resources/python/win32/

```bash
# Extract the zip
unzip python-3.12.2-embed-amd64.zip -d resources/python/win32/

# Should contain:
# - python.exe
# - python312.dll  
# - python312.zip (stdlib)
# - etc.
```

### 3. Install pip (in embeddable package)

```bash
cd resources/python/win32

# Download get-pip.py
curl https://bootstrap.pypa.io/get-pip.py -o get-pip.py

# Uncomment import site in python312._pth
# (This allows pip to work)
echo "import site" >> python312._pth

# Install pip
python.exe get-pip.py
```

### 4. Install mappy

```bash
cd resources/python/win32

# Install mappy
python.exe -m pip install mappy --target ./Lib/site-packages
```

### 5. Verify

```bash
cd resources/python/win32
python.exe -c "import mappy; print(mappy.__version__)"
# Should print: 2.30 (or similar)
```

## Directory structure after setup:

```
resources/python/win32/
├── python.exe                    # Python interpreter
├── python312.dll                 # Python runtime
├── python312._pth                # Path configuration
├── python312.zip                 # Standard library
├── get-pip.py                    # pip installer
├── Scripts/
│   └── pip.exe                   # pip executable
└── Lib/
    └── site-packages/
        └── mappy/                # mappy module
            ├── __init__.py
            └── mappy.*.pyd       # C extension
```

## Size estimate:
- Python embeddable: ~15MB
- mappy: ~2MB
- **Total: ~17MB** (adds to Windows build only)

## macOS/Linux:
These platforms do NOT bundle Python - they use the system Python or conda environment.
This is the preferred approach for these platforms.

## Alternative: Pre-download for CI/CD

For automated builds, you can download and cache these in your build pipeline:

```bash
# In your GitHub Actions or build script:
mkdir -p resources/python/win32
cd resources/python/win32
curl -O https://www.python.org/ftp/python/3.12.2/python-3.12.2-embed-amd64.zip
unzip python-3.12.2-embed-amd64.zip
# ... continue with pip and mappy installation
```
