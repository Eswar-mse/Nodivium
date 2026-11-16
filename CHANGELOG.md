# Changelog

## [2.0.0.dev0] - Unreleased
### In progress
- Rebranded the source package, CLI command, web workspace, downloadable files, and documentation as Nodivium; added the user-inspired transparent mark and compatibility for previous NCBI environment settings and browser preferences.
- Local web workspace with search, record inspection, interactive nucleotide composition/GC/range views, PubMed citation/abstract and NCBI gene-location cards, and browser-local FASTA/PDB/mmCIF inspection.
- Resizable visual inspector, dark/light themes, Mol* structure viewing with a configurable black canvas and optional protein/ligand colors.
- Cross-source collection export with provenance, checksums, and per-record failures.
- Record-aware format validation, NCBI configuration, safer filenames, more accurate PDB metadata, NCBI FASTA batch retrieval, and an ASCII CLI launch wordmark.
- Updated the PDB FASTA endpoint to RCSB's documented download path; added gene, PubMed, and wheel content checks, and modernized package license metadata.
- Simplified the 3D inspector to the model and Nodivium's controls; fixed Mol* panel contrast, added explicit residue selection feedback and a fit action, and restored the compact view on collapse.
- Added applicable Mol* representation choices for protein/polymer, ligands, carbohydrates, ions, water, lipids, and other present structure components while preserving their colors.
- Added independent component visibility switches, selected-residue hiding and isolation, and a full-view restore action.
- Ubuntu CLI and earlier browser workflow passed locally; the latest branding and visual controls need a fresh browser pass. Live provider checks and Windows CI remain before a stable release. Shared public hosting and sequence-to-structure position mapping are future enhancements.

## [1.0.1] - 2025-06-07
### Fixed
- Renamed the former BioFetch PyPI package to `biofetch-cli` (name `biofetch` was taken)
- Fixed UniProt `--info` flag metadata parsing
- Fixed PDB polymer chain count display

## [1.0.0] - 2025-06-07
### Added
- Initial release
- `fetch` command — NCBI, UniProt, PDB by accession ID
- `search` command — full-text search across all three databases
- `info` command — rich metadata panels without downloading sequences
- `batch` command — bulk fetch with progress bar and rate limiting
- `cache` subcommands — stats, list, clear, delete
- Local disk cache with 7-day TTL via diskcache
- Multiple output formats: FASTA, GenBank, JSON, XML, PDB, mmCIF, TSV
- 34 unit tests with mocked API responses
- Cross-platform: Windows and Linux
