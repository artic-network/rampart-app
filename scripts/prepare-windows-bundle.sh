#!/bin/bash
# Windows build helper - Downloads and prepares all Windows binaries for bundling

set -e

echo "🪟 Setting up Windows bundled resources..."
echo ""

RESOURCES_DIR="resources"
BIN_WIN32="$RESOURCES_DIR/bin/win32"
PYTHON_WIN32="$RESOURCES_DIR/python/win32"

mkdir -p "$BIN_WIN32"
mkdir -p "$PYTHON_WIN32"

# ===== minimap2 =====
echo "📦 Downloading minimap2 for Windows..."

MINIMAP2_VERSION="2.27"
MINIMAP2_URL="https://github.com/lh3/minimap2/releases/download/v${MINIMAP2_VERSION}/minimap2-${MINIMAP2_VERSION}_x64-win.zip"

if [ ! -f "$BIN_WIN32/minimap2.exe" ]; then
    curl -L "$MINIMAP2_URL" -o /tmp/minimap2-win.zip
    unzip -j /tmp/minimap2-win.zip "minimap2-${MINIMAP2_VERSION}_x64-win/minimap2.exe" -d "$BIN_WIN32/"
    rm /tmp/minimap2-win.zip
    echo "✅ minimap2.exe downloaded ($(ls -lh $BIN_WIN32/minimap2.exe | awk '{print $5}'))"
else
    echo "✅ minimap2.exe already present"
fi

echo ""

# ===== Python Embeddable (Optional) =====
read -p "📝 Do you want to download Python embeddable for fully self-contained Windows build? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "📦 Downloading Python embeddable package..."
    
    PYTHON_VERSION="3.12.2"
    PYTHON_URL="https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip"
    
    if [ ! -f "$PYTHON_WIN32/python.exe" ]; then
        curl -L "$PYTHON_URL" -o /tmp/python-embed.zip
        unzip /tmp/python-embed.zip -d "$PYTHON_WIN32/"
        rm /tmp/python-embed.zip
        echo "✅ Python ${PYTHON_VERSION} downloaded"
        
        # Configure Python to allow pip
        echo "🔧 Configuring Python..."
        echo "import site" >> "$PYTHON_WIN32/python312._pth"
        
        # Download and install pip
        echo "📦 Installing pip..."
        curl https://bootstrap.pypa.io/get-pip.py -o "$PYTHON_WIN32/get-pip.py"
        
        # Note: This requires Wine on macOS/Linux, or needs to be done on Windows
        echo "⚠️  To complete setup, run on Windows:"
        echo "    cd $PYTHON_WIN32"
        echo "    python.exe get-pip.py"
        echo "    python.exe -m pip install mappy --target ./Lib/site-packages"
    else
        echo "✅ Python already present"
    fi
else
    echo "⏭️  Skipping Python download. Windows build will require user to install Python/conda."
fi

echo ""
echo "📊 Bundled resources status:"
echo "   ✅ Windows minimap2: $([ -f $BIN_WIN32/minimap2.exe ] && echo 'Ready' || echo 'Missing')"
echo "   $([ -f $PYTHON_WIN32/python.exe ] && echo '✅' || echo '⏭️ ') Windows Python: $([ -f $PYTHON_WIN32/python.exe ] && echo 'Ready (needs mappy)' || echo 'Skipped')"
echo ""

if [ -f "$PYTHON_WIN32/python.exe" ]; then
    echo "⚠️  Remember to install mappy on Windows:"
    echo "    cd $PYTHON_WIN32"
    echo "    python.exe -m pip install mappy --target ./Lib/site-packages"
    echo ""
fi

echo "✨ Windows resources prepared! Build with: npm run dist:win"
