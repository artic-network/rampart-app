#!/usr/bin/env node
/**
 * RAMPART Annotation Script (Node.js)
 *
 * Maps FASTQ reads to references using minimap2 (spawned directly) and produces
 * RAMPART-compatible CSV annotations. Replaces the mappy-based Python version so
 * no Python installation is required on any platform.
 *
 * CLI usage (mirrors the Python version):
 *   node rampart_annotate.js -i reads.fastq -r references.fasta -o out.csv -b barcode01
 *
 * Can also be required as a module:
 *   const { run } = require('./rampart_annotate');
 *   await run({ inputFile, referenceFile, outputFile, ... });
 */

'use strict';

const { spawn }  = require('child_process');
const fs         = require('fs');
const path       = require('path');
const zlib       = require('zlib');
const readline   = require('readline');

// ─── FASTA reference parser ───────────────────────────────────────────────────

/**
 * Read a FASTA file and extract per-sequence metadata.
 * Header format expected:  >seqId key1=value1 key2=value2 ...
 * Returns { refInfo: {seqId: {key: val}}, refLengths: {seqId: number} }
 */
function parseReferenceFasta(refPath) {
    const refInfo    = {};
    const refLengths = {};
    let   currentId  = null;

    const content = fs.readFileSync(refPath, 'utf8');
    for (const rawLine of content.split('\n')) {
        const line = rawLine.trim();
        if (!line) continue;

        if (line.startsWith('>')) {
            const tokens  = line.slice(1).split(/\s+/);
            currentId     = tokens[0];
            refInfo[currentId]    = {};
            refLengths[currentId] = 0;

            for (const token of tokens.slice(1)) {
                const eq = token.indexOf('=');
                if (eq !== -1) {
                    refInfo[currentId][token.slice(0, eq)] = token.slice(eq + 1);
                }
            }
            // Fallback: display_name defaults to sequence id
            if (!refInfo[currentId].display_name) {
                refInfo[currentId].display_name = currentId;
            }
        } else if (currentId) {
            refLengths[currentId] += line.length;
        }
    }

    return { refInfo, refLengths };
}

// ─── FASTQ header scanner ─────────────────────────────────────────────────────

/**
 * Stream through a FASTQ or FASTQ.gz and build a Map<readName, startTime>.
 * Only the header lines (every 4th line starting at 0) are examined.
 */
function buildStartTimeIndex(fastqPath) {
    return new Promise((resolve, reject) => {
        const index = new Map();
        const raw   = fs.createReadStream(fastqPath);
        const src   = fastqPath.endsWith('.gz') ? raw.pipe(zlib.createGunzip()) : raw;
        const rl    = readline.createInterface({ input: src, crlfDelay: Infinity });

        let lineNum = 0;
        rl.on('line', (line) => {
            if (lineNum % 4 === 0 && line.startsWith('@')) {
                const readName = line.slice(1).split(/\s/)[0];
                const m = line.match(/start_time=(\S+)/);
                index.set(readName, m ? m[1] : '?');
            }
            lineNum++;
        });

        rl.on('close', () => resolve(index));
        rl.on('error', reject);
        src.on('error', reject);
        raw.on('error', reject);
    });
}

// ─── Reference-fields spec parser ────────────────────────────────────────────

/**
 * Parse a reference-fields spec like "display_name[display_name],taxon[taxon_id]"
 * Returns [{ outputField, inputKey }, ...]
 */
function parseRefFieldsSpec(spec) {
    if (!spec || !spec.trim()) {
        return [{ outputField: 'display_name', inputKey: 'display_name' }];
    }
    const fields = [];
    for (const item of spec.replace(/;/g, ',').split(',')) {
        const t = item.trim();
        if (!t) continue;
        const bOpen = t.indexOf('[');
        if (bOpen !== -1 && t.endsWith(']')) {
            fields.push({ outputField: t.slice(0, bOpen), inputKey: t.slice(bOpen + 1, -1) });
        } else {
            fields.push({ outputField: t, inputKey: t });
        }
    }
    return fields.length ? fields : [{ outputField: 'display_name', inputKey: 'display_name' }];
}

// ─── Main run function ────────────────────────────────────────────────────────

/**
 * Run the annotation pipeline.
 *
 * @param {object}   opts
 * @param {string}   opts.inputFile      FASTQ or FASTQ.gz path
 * @param {string}   opts.referenceFile  FASTA reference path
 * @param {string}   opts.outputFile     Output CSV path
 * @param {string}   [opts.barcode]      Barcode label (default: 'unknown')
 * @param {number}   [opts.threads]      minimap2 threads (default: 2)
 * @param {string}   [opts.minimap2Path] Path to minimap2 binary (default: 'minimap2')
 * @param {string}   [opts.refFieldsSpec] Reference fields spec (default: 'display_name[display_name]')
 * @param {number}   [opts.minIdentity]  Minimum alignment identity 0–1 (default: 0)
 * @param {function} [opts.onMessage]    Progress callback (string) -> void
 * @returns {Promise<{total, mapped, unmapped}>}
 */
async function run({
    inputFile,
    referenceFile,
    outputFile,
    barcode      = 'unknown',
    threads      = 2,
    minimap2Path = 'minimap2',
    refFieldsSpec = 'display_name[display_name]',
    minIdentity  = 0.0,
    onMessage    = () => {},
}) {
    // 1. Parse reference FASTA for metadata
    onMessage('Loading reference FASTA...');
    const { refInfo, refLengths } = parseReferenceFasta(referenceFile);
    const maxRefLen = Object.values(refLengths).reduce((a, b) => Math.max(a, b), 0);
    const refFields = parseRefFieldsSpec(refFieldsSpec);

    // 2. Scan FASTQ headers to build readName → startTime index
    onMessage('Scanning FASTQ headers for timestamps...');
    const startTimeIndex = await buildStartTimeIndex(inputFile);

    // 3. Prepare output CSV
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    const csvHeader = [
        'read_name', 'read_len', 'start_time', 'barcode',
        'best_reference', 'ref_len', 'start_coords', 'end_coords',
        'num_matches', 'mapping_len',
        ...refFields.map(f => f.outputField),
    ].join(',');

    const outStream = fs.createWriteStream(outputFile);
    outStream.write(csvHeader + '\n');

    // 4. Run minimap2 in PAF mode
    //    --paf-no-hit  → one output line per query even if unmapped
    //    --cs          → include cs tag (for future identity from cigars)
    //    -N 1          → report at most 1 (best) alignment per read
    const mm2Args = [
        '-x', 'map-ont',
        '--cs',
        '--paf-no-hit',
        '-N', '1',
        '-t', String(threads),
        referenceFile,
        inputFile,
    ];

    onMessage(`Mapping with minimap2 (${threads} threads)...`);

    const counts = { total: 0, mapped: 0, unmapped: 0 };

    await new Promise((resolve, reject) => {
        // On Windows, the bundled minimap2.exe co-locates its MinGW/MSYS2 runtime DLLs
        // next to the binary. We must add that directory to PATH so Windows finds them.
        const spawnEnv = { ...process.env };
        const mm2Dir = path.dirname(minimap2Path);
        if (mm2Dir && mm2Dir !== '.') {
            spawnEnv.PATH = mm2Dir + path.delimiter + (spawnEnv.PATH || '');
        }
        const mm2 = spawn(minimap2Path, mm2Args, { env: spawnEnv });

        let pafBuf = '';

        const processLine = (line) => {
            if (!line.trim()) return;
            const cols = line.split('\t');
            if (cols.length < 12) return;

            const readName     = cols[0];
            const readLen      = cols[1];
            const targetName   = cols[5];   // '*' when unmapped
            const targetLen    = cols[6];
            const targetStart  = cols[7];
            const targetEnd    = cols[8];
            const numMatches   = cols[9];
            const alignBlockLen = parseInt(cols[10], 10) || 0;

            const startTime  = startTimeIndex.get(readName) || '?';
            const mappingLen = parseInt(targetEnd, 10) - parseInt(targetStart, 10);

            counts.total++;

            if (targetName === '*') {
                // Unmapped read
                counts.unmapped++;
                const row = [
                    readName, readLen, startTime, barcode,
                    '?', String(maxRefLen), '0', '0', '0', '0',
                    ...refFields.map(() => '?'),
                ];
                outStream.write(row.join(',') + '\n');
            } else {
                // Check identity threshold
                const identity = alignBlockLen > 0
                    ? (parseInt(numMatches, 10) / alignBlockLen)
                    : 0;

                if (identity < minIdentity) {
                    counts.unmapped++;
                    const row = [
                        readName, readLen, startTime, barcode,
                        '*', '0', '0', '0', '0', '0',
                        ...refFields.map(() => '*'),
                    ];
                    outStream.write(row.join(',') + '\n');
                } else {
                    counts.mapped++;
                    const meta = refInfo[targetName] || {};
                    const row = [
                        readName, readLen, startTime, barcode,
                        targetName, targetLen, targetStart, targetEnd,
                        numMatches, String(mappingLen),
                        ...refFields.map(f => meta[f.inputKey] || '?'),
                    ];
                    outStream.write(row.join(',') + '\n');
                }
            }
        };

        // Buffer stdout and flush complete lines
        mm2.stdout.on('data', (chunk) => {
            pafBuf += chunk.toString();
            const lines = pafBuf.split('\n');
            pafBuf = lines.pop(); // hold the (possibly incomplete) last fragment
            for (const line of lines) processLine(line);
        });

        mm2.stdout.on('end', () => {
            // Flush any remaining complete line
            if (pafBuf.trim()) processLine(pafBuf);
            outStream.end();
        });

        const stderrChunks = [];
        mm2.stderr.on('data', (d) => stderrChunks.push(d.toString()));

        mm2.on('error', (err) => {
            reject(new Error(
                `minimap2 failed to start (path: "${minimap2Path}"): ${err.message}\n` +
                'Check that minimap2 is installed and on PATH, or the bundled binary is intact.'
            ));
        });

        mm2.on('exit', (code) => {
            if (code !== 0) {
                const stderr = stderrChunks.join('').trim();
                reject(new Error(`minimap2 exited with code ${code}. stderr:\n${stderr}`));
                return;
            }
            onMessage(
                `Done: ${counts.total} reads processed ` +
                `(${counts.mapped} mapped, ${counts.unmapped} unmapped/low-identity)`
            );
            resolve();
        });
    });

    return counts;
}

// ─── CLI entry point ──────────────────────────────────────────────────────────

function parseCLIArgs(argv) {
    const args = {};
    let i = 2; // skip 'node' and script path
    while (i < argv.length) {
        const flag = argv[i];
        const val  = argv[i + 1];
        switch (flag) {
            case '-i': case '--input':            args.inputFile      = val; i += 2; break;
            case '-r': case '--reference':        args.referenceFile  = val; i += 2; break;
            case '-o': case '--output':           args.outputFile     = val; i += 2; break;
            case '-b': case '--barcode':          args.barcode        = val; i += 2; break;
            case '-t': case '--threads':          args.threads        = parseInt(val, 10); i += 2; break;
            case '--minimap2':                    args.minimap2Path   = val; i += 2; break;
            case '--reference-fields':            args.refFieldsSpec  = val; i += 2; break;
            case '-m': case '--min-identity':     args.minIdentity    = parseFloat(val); i += 2; break;
            default: i++;
        }
    }
    return args;
}

if (require.main === module) {
    const opts = parseCLIArgs(process.argv);

    if (!opts.inputFile || !opts.referenceFile || !opts.outputFile) {
        console.error('Usage: node rampart_annotate.js -i <fastq> -r <ref.fasta> -o <out.csv> [-b barcode] [-t threads] [--minimap2 path] [--reference-fields spec] [-m min_identity]');
        process.exit(1);
    }

    run({ ...opts, onMessage: (msg) => process.stderr.write(msg + '\n') })
        .then((counts) => {
            process.stderr.write(
                `Summary: ${counts.total} reads, ${counts.mapped} mapped, ${counts.unmapped} unmapped\n`
            );
            process.exit(0);
        })
        .catch((err) => {
            process.stderr.write(`Error: ${err.message}\n`);
            process.exit(1);
        });
}

module.exports = { run };
