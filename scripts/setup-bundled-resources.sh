#!/bin/bash
# Setup script to prepare bundled resources for macOS builds

echo "🔧 Setting up bundled resources for RAMPART build..."

# Create directories
mkdir -p resources/bin/darwin
mkdir -p resources/bin/win32
mkdir -p resources/bin/linux

# Copy macOS minimap2 if available
if command -v minimap2 &> /dev/null; then
    echo "📦 Copying minimap2 for macOS..."
    cp $(which minimap2) resources/bin/darwin/
    chmod +x resources/bin/darwin/minimap2
    echo "✅ macOS minimap2 bundled: $(ls -lh resources/bin/darwin/minimap2 | awk '{print $5}')"
else
    echo "⚠️  minimap2 not found in PATH. Install with: conda install -c bioconda minimap2"
    echo "   Or download from: https://github.com/lh3/minimap2/releases"
fi

# Instructions for Windows binaries
echo ""
echo "📝 For Windows builds, you need to manually download:"
echo "   1. minimap2 for Windows:"
echo "      https://github.com/lh3/minimap2/releases"
echo "      Extract minimap2.exe to resources/bin/win32/"
echo ""
echo "   2. Python embeddable for Windows (optional, for fully self-contained Windows app):"
echo "      https://www.python.org/downloads/windows/"
echo "      Get: Python 3.12.x embeddable package (64-bit)"
echo "      Extract to resources/python/win32/"
echo "      See resources/python/README.md for setup instructions"
echo ""

# Check what we have
echo "📊 Current bundled resources:"
echo "   macOS minimap2: $([ -f resources/bin/darwin/minimap2 ] && echo '✅ Present' || echo '❌ Missing')"
echo "   Windows minimap2: $([ -f resources/bin/win32/minimap2.exe ] && echo '✅ Present' || echo '❌ Missing')"
echo "   Linux minimap2: $([ -f resources/bin/linux/minimap2 ] && echo '✅ Present' || echo '❌ Missing')"
echo "   Windows Python: $([ -f resources/python/win32/python.exe ] && echo '✅ Present' || echo '❌ Missing')"
echo ""
echo "✨ Setup complete! You can now build with: npm run dist:mac"
