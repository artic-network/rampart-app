# Python-based RAMPART Pipeline

## Overview

RAMPART now runs a standalone Python script (`rampart_annotate.py`) directly instead of using Snakemake pipelines. This simplifies the architecture, reduces dependencies, and makes debugging easier.

## Changes Made

### 1. Pipeline Configuration (`example-mpxv/protocol/pipelines.json`)

```json
{
  "annotation": {
    "name": "Annotate reads",
    "path": "pipelines/python_annotate",
    "type": "python",
    "script": "rampart_annotate.py",
    "configOptions": {
      "reference_fields": "display_name[display_name]",
      "min_identity": 0.0
    },
    "requires": [
      {
        "file": "references.fasta",
        "config_key": "references_file"
      }
    ]
  }
}
```

**Key changes:**
- Added `"type": "python"` to indicate Python script pipeline
- Added `"script": "rampart_annotate.py"` to specify the script name
- Removed `"config_file"` (no longer using Snakemake config.yaml)
- Added `configOptions` for script parameters

### 2. PipelineRunner (`server/PipelineRunner.js`)

Modified to support both Snakemake and Python pipelines:

- **Constructor**: Added `this._type` and `this._pythonScript` properties
- **_runPipeline()**: Detects pipeline type and calls appropriate handler
- **_runPythonScript()**: New method to execute Python scripts directly

Key features of Python script execution:
- Extracts barcode from directory path
- Builds script arguments from job parameters
- Uses conda environment's Python (`/opt/miniconda3/envs/artic-rampart-mpxv/bin/python3`)
- Creates output directories automatically
- Handles stdio/stderr for debugging

### 3. Pipeline Validation (`server/config/pipeline.js`)

Updated `checkPipeline()` function:
- Checks for Python script existence when `type === 'python'`
- Falls back to Snakefile check for traditional pipelines
- Validates script path: `path.join(pipeline.path, pipeline.script)`

### 4. Python Script (`rampart_annotate.py`)

Self-contained script using `mappy` (Python minimap2 bindings):

**Features:**
- Maps FASTQ reads to reference sequences
- Handles gzipped FASTQ files
- Extracts metadata from reference headers
- Parses barcode and timestamps from read headers
- Creates output directories automatically using `Path().mkdir(parents=True)`
- Produces RAMPART-compatible CSV format

**CSV Output Format:**
```
read_name,read_len,start_time,barcode,best_reference,ref_len,start_coords,end_coords,num_matches,mapping_len,display_name
```

**Dependencies:**
- `mappy` (Python minimap2 bindings) - installed via `pip install mappy`
- Python 3.12+ (from conda environment)

## Installation

1. **Install mappy in conda environment:**
   ```bash
   source /opt/miniconda3/etc/profile.d/conda.sh
   conda activate artic-rampart-mpxv
   pip install mappy
   ```

2. **Script location:**
   - Main script: `rampart_annotate.py` (root directory)
   - Pipeline copy: `example-mpxv/protocol/pipelines/python_annotate/rampart_annotate.py`

## Usage

### Through RAMPART

RAMPART automatically runs the script when processing FASTQ files. The workflow:

1. RAMPART watches basecalled directory
2. Detects new FASTQ files
3. Adds them to annotation queue
4. Runs `rampart_annotate.py` with appropriate arguments
5. Parses output CSV and displays in UI

### Standalone

```bash
source /opt/miniconda3/etc/profile.d/conda.sh
conda activate artic-rampart-mpxv

python3 rampart_annotate.py \
  -i example-mpxv/mpox_simulated_data/barcode01/barcode01.fastq.gz \
  -r example-mpxv/protocol/references.fasta \
  -o annotations/barcode01/barcode01.csv \
  -b barcode01 \
  --threads 4 \
  --reference-fields "display_name[display_name]"
```

## Benefits Over Snakemake

1. **Simpler**: No workflow management overhead
2. **Fewer dependencies**: No snakemake, no porechop issues
3. **Easier debugging**: Direct Python execution with clear error messages
4. **Self-contained**: All logic in one file
5. **Faster startup**: No Snakemake initialization
6. **More maintainable**: Standard Python code vs. Snakemake DSL

## Performance

Example results from barcode01 (51,544 reads):
- **Total reads**: 51,544
- **Mapped reads**: 457 (0.89%)
- **Reference**: KJ642613 (MPXV reference)
- **Processing time**: ~15-20 seconds with 1 thread

Mapping rate depends on:
- Data quality
- Reference compatibility
- Barcode assignment accuracy

## Troubleshooting

### mappy not installed
```
Error: mappy is not installed. Install it with: pip install mappy
```
**Solution**: Activate conda environment and install mappy:
```bash
conda activate artic-rampart-mpxv
pip install mappy
```

### Output directory error
```
FileNotFoundError: [Errno 2] No such file or directory: '/path/to/output.csv'
```
**Solution**: Script now creates directories automatically with `Path().mkdir(parents=True, exist_ok=True)`

### Low mapping rate
- Check reference sequences match expected organism
- Verify barcode assignment is correct
- Try lowering `--min-identity` threshold

## Future Enhancements

Potential improvements:
1. Multi-threading support for large FASTQ files
2. Progress reporting during processing
3. Quality filtering options
4. Custom alignment parameters
5. Support for different sequencing technologies (currently tuned for ONT with `preset='map-ont'`)

## Files Modified

- `server/PipelineRunner.js` - Added Python pipeline support
- `server/config/pipeline.js` - Added Python script validation
- `example-mpxv/protocol/pipelines.json` - Configured Python pipeline
- `example-mpxv/protocol/pipelines/python_annotate/rampart_annotate.py` - Created script
- `example-mpxv/protocol/pipelines/python_annotate/README.md` - Documentation

## Conda Environment

The script runs in the `artic-rampart-mpxv` conda environment:
- **Python**: 3.13
- **minimap2**: 2.30 (bioconda)
- **mappy**: 2.30 (pip)
- **snakemake-minimal**: 9.16.3 (conda-forge) - optional, no longer required

## Testing

Test the pipeline:
```bash
# Start RAMPART
npm run electron

# In settings UI:
# - Basecalled Path: example-mpxv/mpox_simulated_data
# - Annotated Path: example-mpxv/annotations
# - Protocol: example-mpxv/protocol
# - Click "Start RAMPART"

# Check generated CSVs:
ls -la annotations/barcode*/
head annotations/barcode01/barcode01.csv
```

## Migration from Snakemake

To migrate existing protocols from Snakemake to Python:

1. Create `pipelines/python_annotate/` directory in protocol
2. Copy `rampart_annotate.py` to that directory
3. Update `pipelines.json` with:
   - `"type": "python"`
   - `"script": "rampart_annotate.py"`
   - Remove `"config_file"`
4. Test with sample data

The Snakemake pipelines in `default_protocol/` remain for backward compatibility but are not actively used.
