#!/usr/bin/env python3
"""
RAMPART Annotation Script
Standalone script to map FASTQ reads to references using mappy and produce RAMPART-compatible CSV annotations.
"""

import argparse
import gzip
import sys
from collections import defaultdict
from pathlib import Path

try:
    import mappy
except ImportError:
    print("Error: mappy is not installed. Install it with: pip install mappy", file=sys.stderr)
    sys.exit(1)


def parse_args():
    parser = argparse.ArgumentParser(
        description='Map FASTQ reads to references and create RAMPART annotation CSV'
    )
    parser.add_argument(
        '-i', '--input',
        required=True,
        help='Input FASTQ or FASTQ.gz file'
    )
    parser.add_argument(
        '-r', '--reference',
        required=True,
        help='Reference FASTA file'
    )
    parser.add_argument(
        '-o', '--output',
        required=True,
        help='Output CSV file'
    )
    parser.add_argument(
        '-b', '--barcode',
        default='unknown',
        help='Barcode name (default: unknown)'
    )
    parser.add_argument(
        '-m', '--min-identity',
        type=float,
        default=0.0,
        help='Minimum mapping identity (0.0-1.0, default: 0.0)'
    )
    parser.add_argument(
        '-t', '--threads',
        type=int,
        default=2,
        help='Number of threads (default: 2)'
    )
    parser.add_argument(
        '--reference-fields',
        default='display_name',
        help='Reference fields to extract from FASTA headers (format: field_name[header_key], default: display_name[display_name])'
    )

    # Mappy / minimap2 sensitivity options
    parser.add_argument(
        '-k', '--kmer',
        type=int,
        default=None,
        help='Minimizer k-mer length (default: preset value, typically 15 for map-ont). '
             'Lower values (e.g. 13) increase sensitivity for divergent sequences.'
    )
    parser.add_argument(
        '-w', '--window',
        type=int,
        default=None,
        help='Minimizer window size (default: preset value). '
             'Lower values increase sensitivity at the cost of speed.'
    )
    parser.add_argument(
        '--min-cnt',
        type=int,
        default=None,
        help='Minimum number of minimizers on a chain (default: preset value, typically 3). '
             'Lower values (e.g. 2) increase sensitivity.'
    )
    parser.add_argument(
        '--min-chain-score',
        type=int,
        default=None,
        help='Minimum chaining score (default: preset value). '
             'Lower values allow shorter/weaker alignments through.'
    )
    parser.add_argument(
        '--min-dp-score',
        type=int,
        default=None,
        help='Minimum dynamic programming alignment score (default: preset value). '
             'Lower values allow weaker DP alignments.'
    )
    parser.add_argument(
        '--best-n',
        type=int,
        default=1,
        help='Report at most this many alignments per read (default: 1, i.e. best hit only).'
    )
    parser.add_argument(
        '--score-n',
        type=int,
        default=1,
        help='Penalty for aligning against ambiguous bases (N). '
             'Set to 0 (--score-n 0) to ignore N mismatches, which is useful for '
             'viral reference genomes with N-padded regions. '
             'Corresponds to the 7th element of the minimap2 scoring vector (default: 1).'
    )
    return parser.parse_args()


def open_fastq(filepath):
    """Open FASTQ or FASTQ.gz file."""
    filepath = Path(filepath)
    if filepath.suffix == '.gz':
        return gzip.open(filepath, 'rt')
    return open(filepath, 'r')


def parse_fastq_simple(file_handle):
    """Simple FASTQ parser that yields (name, sequence, quality, header)."""
    while True:
        header = file_handle.readline().strip()
        if not header:
            break
        seq = file_handle.readline().strip()
        plus = file_handle.readline().strip()
        qual = file_handle.readline().strip()
        
        # Parse read name (first field before space)
        read_name = header[1:].split()[0]
        yield read_name, seq, qual, header[1:]


def parse_reference_fasta_headers(reference_file):
    """Parse reference FASTA headers to extract metadata."""
    ref_info = defaultdict(dict)
    ref_lengths = {}
    
    with open(reference_file, 'r') as f:
        current_id = None
        for line in f:
            line = line.strip()
            if line.startswith('>'):
                # Parse header
                header = line[1:]
                tokens = header.split()
                current_id = tokens[0]  # First token is the sequence ID
                
                # Parse key=value pairs
                for token in tokens[1:]:
                    if '=' in token:
                        key, value = token.split('=', 1)
                        ref_info[current_id][key] = value
                
                # If no display_name, use the ID
                if 'display_name' not in ref_info[current_id]:
                    ref_info[current_id]['display_name'] = current_id
                
                ref_lengths[current_id] = 0
            elif current_id:
                ref_lengths[current_id] += len(line)
    
    return ref_info, ref_lengths


def parse_reference_fields_spec(spec):
    """Parse reference fields specification.
    Format: field1[key1],field2[key2];field3[key3]
    Returns: dict of {output_field: input_key}
    """
    if not spec:
        return {}
    
    fields = {}
    for item in spec.replace(';', ',').split(','):
        item = item.strip()
        if '[' in item and ']' in item:
            field_name = item[:item.index('[')]
            key_name = item[item.index('[')+1:item.index(']')]
            fields[field_name] = key_name
        else:
            # Default: use same name for both
            fields[item] = item
    
    return fields


def calculate_identity_from_cigar(cs_tag):
    """Calculate identity from minimap2 cs tag.
    Format: cs:Z::10*ag:5+tc:3-cc:2
    """
    if not cs_tag:
        return 0, 0
    
    # Remove cs:Z: prefix
    if cs_tag.startswith('cs:Z:'):
        cs_tag = cs_tag[5:]
    
    matches = 0
    mismatches = 0
    
    i = 0
    while i < len(cs_tag):
        if cs_tag[i] == ':':
            # Match run
            i += 1
            num_str = ''
            while i < len(cs_tag) and cs_tag[i].isdigit():
                num_str += cs_tag[i]
                i += 1
            if num_str:
                matches += int(num_str)
        elif cs_tag[i] == '*':
            # Substitution
            mismatches += 1
            i += 3  # Skip *XY
        elif cs_tag[i] == '+':
            # Insertion (no penalty for identity calc)
            i += 1
            while i < len(cs_tag) and cs_tag[i].islower():
                i += 1
        elif cs_tag[i] == '-':
            # Deletion (no penalty for identity calc)
            i += 1
            while i < len(cs_tag) and cs_tag[i].islower():
                i += 1
        else:
            i += 1
    
    if matches + mismatches == 0:
        return 0, 0
    
    identity = matches / (matches + mismatches)
    return matches, identity


def annotate_reads(args):
    """Main annotation function."""
    
    # Load reference information
    print(f"Loading reference: {args.reference}", file=sys.stderr)
    ref_info, ref_lengths = parse_reference_fasta_headers(args.reference)
    
    # Parse reference fields specification
    ref_fields_spec = parse_reference_fields_spec(args.reference_fields)
    
    # Initialize minimap2 aligner with mappy
    print(f"Initializing minimap2 with {args.threads} threads...", file=sys.stderr)

    # Build aligner kwargs — only pass values that were explicitly set
    aligner_kwargs = {
        'preset': 'map-ont',
        'n_threads': args.threads,
        'best_n': args.best_n,
    }

    if args.kmer is not None:
        aligner_kwargs['k'] = args.kmer
    if args.window is not None:
        aligner_kwargs['w'] = args.window
    if args.min_cnt is not None:
        aligner_kwargs['min_cnt'] = args.min_cnt
    if args.min_chain_score is not None:
        aligner_kwargs['min_chain_score'] = args.min_chain_score
    if args.min_dp_score is not None:
        aligner_kwargs['min_dp_score'] = args.min_dp_score

    # Build the scoring vector if N-penalty differs from default (1), or if any
    # explicit scoring option requires it.  minimap2 default scoring for map-ont is
    # approximately [2, 4, 4, 2, 24, 1, 1]. We only construct the vector when
    # score_n != 1 to avoid overriding the preset's other scoring defaults.
    if args.score_n != 1:
        # [match, mismatch, gap_open, gap_extend, long_gap_open, long_gap_extend, N_penalty]
        aligner_kwargs['scoring'] = [2, 4, 4, 2, 24, 1, args.score_n]
        print(f"  N-mismatch penalty set to {args.score_n} (scoring vector: {aligner_kwargs['scoring']})",
              file=sys.stderr)

    aligner = mappy.Aligner(args.reference, **aligner_kwargs)
    
    if not aligner:
        print(f"Error: Failed to load reference {args.reference}", file=sys.stderr)
        sys.exit(1)
    
    # Create output directory if it doesn't exist
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    print(f"Created output directory: {output_path.parent}", file=sys.stderr)
    
    # Open input and output files
    print(f"Processing: {args.input}", file=sys.stderr)
    
    counts = {'total': 0, 'mapped': 0, 'unmapped': 0}
    
    with open_fastq(args.input) as fq, open(args.output, 'w') as csv_out:
        # Write CSV header
        header_fields = ['read_name', 'read_len', 'start_time', 'barcode', 
                        'best_reference', 'ref_len', 'start_coords', 'end_coords', 
                        'num_matches', 'mapping_len']
        
        # Add reference fields to header
        for field_name in ref_fields_spec.keys():
            header_fields.append(field_name)
        
        csv_out.write(','.join(header_fields) + '\n')
        
        # Process each read
        for read_name, seq, qual, full_header in parse_fastq_simple(fq):
            counts['total'] += 1
            
            read_len = len(seq)
            
            # Extract start_time from header if present
            start_time = '?'
            if 'start_time=' in full_header:
                for token in full_header.split():
                    if token.startswith('start_time='):
                        start_time = token.split('=', 1)[1]
                        break
            
            # Map the read (cs=True requests the cs tag for identity calculation)
            alignments = list(aligner.map(seq, cs=True))
            
            # Handle mappings
            if not alignments:
                # No mapping
                counts['unmapped'] += 1
                row = [
                    read_name, str(read_len), start_time, args.barcode,
                    '?', str(max(ref_lengths.values()) if ref_lengths else 0),
                    '0', '0', '0', '0'
                ]
                # Add '?' for reference fields
                for _ in ref_fields_spec:
                    row.append('?')
                csv_out.write(','.join(row) + '\n')
                
            elif len(alignments) > 1:
                # Multiple primary mappings - ambiguous
                row = [
                    read_name, str(read_len), start_time, args.barcode,
                    '?', str(alignments[0].ctg_len),
                    '0', '0', '0', '0'
                ]
                for _ in ref_fields_spec:
                    row.append('?')
                csv_out.write(','.join(row) + '\n')
                
            else:
                # Single best mapping
                aln = alignments[0]
                
                # mappy provides cs tag via the cs attribute if available
                cs_tag = None
                if hasattr(aln, 'cs') and aln.cs:
                    cs_tag = f"cs:Z:{aln.cs}"
                
                if cs_tag:
                    num_matches, identity = calculate_identity_from_cigar(cs_tag)
                else:
                    # Fallback: use match count from alignment
                    # aln.mlen is the number of matching bases
                    # aln.blen is the alignment block length
                    num_matches = aln.mlen if hasattr(aln, 'mlen') else 0
                    if hasattr(aln, 'blen') and aln.blen > 0:
                        identity = aln.mlen / aln.blen
                    else:
                        # Use NM (edit distance) if available
                        mapping_len = aln.r_en - aln.r_st
                        if hasattr(aln, 'NM'):
                            identity = 1.0 - (aln.NM / mapping_len) if mapping_len > 0 else 0
                        else:
                            identity = aln.mapq / 60.0 if hasattr(aln, 'mapq') else 0
                        num_matches = int(mapping_len * identity)
                
                # Check identity threshold
                if identity < args.min_identity:
                    counts['unmapped'] += 1
                    row = [
                        read_name, str(read_len), start_time, args.barcode,
                        '*', '0', '0', '0', '0', '0'
                    ]
                    for _ in ref_fields_spec:
                        row.append('*')
                    csv_out.write(','.join(row) + '\n')
                    continue
                
                counts['mapped'] += 1
                
                # Calculate mapping length
                mapping_len = aln.r_en - aln.r_st
                
                row = [
                    read_name,
                    str(read_len),
                    start_time,
                    args.barcode,
                    aln.ctg,
                    str(aln.ctg_len),
                    str(aln.r_st),
                    str(aln.r_en),
                    str(num_matches),
                    str(mapping_len)
                ]
                
                # Add reference fields
                for field_name, key_name in ref_fields_spec.items():
                    value = ref_info.get(aln.ctg, {}).get(key_name, '?')
                    row.append(value)
                
                csv_out.write(','.join(row) + '\n')
            
            if counts['total'] % 1000 == 0:
                print(f"Processed {counts['total']} reads...", file=sys.stderr)
    
    # Print summary
    print(f"\nSummary:", file=sys.stderr)
    print(f"  Total reads: {counts['total']}", file=sys.stderr)
    print(f"  Mapped: {counts['mapped']} ({100*counts['mapped']/counts['total']:.1f}%)", file=sys.stderr)
    print(f"  Unmapped: {counts['unmapped']} ({100*counts['unmapped']/counts['total']:.1f}%)", file=sys.stderr)
    print(f"\nOutput written to: {args.output}", file=sys.stderr)


if __name__ == '__main__':
    args = parse_args()
    annotate_reads(args)
