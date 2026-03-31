# Installation

These instructions assume that you have installed [MinKNOW](https://community.nanoporetech.com/downloads) and are able to run it.


## Option 1: Desktop app (Electron) — recommended

Download the pre-built installer for your platform from the [latest GitHub release](https://github.com/artic-network/rampart-app/releases/latest):

| Platform | File |
|----------|------|
| macOS (Apple Silicon) | `RAMPART-<version>-arm64.dmg` |
| macOS (Intel) | `RAMPART-<version>-x64.dmg` |
| Windows | `RAMPART-Setup-<version>.exe` |
| Linux | `RAMPART-<version>.AppImage` or `.deb` |

The Electron app bundles everything needed — no conda, Node.js or Python install required. minimap2 is included for macOS and Windows; on Linux the AppImage is self-contained.

On **macOS** you may need to allow the app through Gatekeeper on first launch:
1. Open **System Settings → Privacy & Security**
2. Scroll down to the security section and click **Open Anyway** next to the RAMPART entry

On **Windows** you may see a SmartScreen prompt — click **More info → Run anyway**.


## Option 2: Install from source (command-line usage)

This approach is suitable for running RAMPART as a command-line tool on a server or for development.

### Requirements

- [Node.js](https://nodejs.org/) ≥ 20 (≥ 22 recommended)
- [conda](https://conda.io/projects/conda/en/latest/user-guide/install/index.html) (recommended for managing Python dependencies)
- minimap2 ≥ 2.17 (available via `conda install -c bioconda minimap2`)

### Step 1: Clone the repository

```bash
git clone https://github.com/artic-network/rampart-app.git
cd rampart-app
```

### Step 2: Create and activate the conda environment

```bash
conda env create -f environment.yml
conda activate artic-rampart
```

Or manually install Node.js into an existing environment:

```bash
conda install -y nodejs  # version >=20
```

### Step 3: Install Node.js dependencies and build the client

```bash
npm install
npm run build
```

### Step 4: (Optional) Install globally within the conda environment

```bash
npm install --global .
```

Verify with:

```bash
rampart --help
```

### Step 5: Run RAMPART

```bash
rampart --protocol /path/to/protocol --basecalledPath /path/to/fastq/pass
```

Then open [http://localhost:3000](http://localhost:3000) in a browser.


## Option 3: Development mode (hot-reloading UI)

Useful when modifying the frontend source code:

```bash
# Terminal 1 — start the RAMPART server
node rampart.js --devClient --protocol /path/to/protocol --basecalledPath /path/to/fastq/pass

# Terminal 2 — start the React dev server
npm run start
```

Then open [http://localhost:3000](http://localhost:3000). The UI will hot-reload on source changes; server changes still require a server restart.

