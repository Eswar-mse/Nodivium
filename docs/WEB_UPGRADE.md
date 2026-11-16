# Nodivium web upgrade — product and interface contract

## Current implementation checkpoint

The local preview contains the responsive search/record/inspector workspace, light and dark themes, source-aware search cards, record-specific format choices, UniProt feature tracks, NCBI sequence and GenBank/GenPept feature previews, nucleotide composition/GC/range inspection, protein composition/residue highlighting/range inspection, source-backed gene location and PubMed citation views, a resizable inspector, a bundled Mol* structure viewer with canvas and structure color controls, applicable representation and visibility choices for each present component, residue hiding and isolation, and residue label and distance controls, local FASTA/PDB/mmCIF inspection, source links, and a 25-record ZIP collection with provenance and per-record failures. The CLI has a `nodivium web` command, an ASCII launch wordmark, and shared record validation and fetch rules. The Ubuntu source build and browser workflow were manually checked on 2026-11-15; the latest visual controls still require a fresh browser pass.

The remaining release gates are a fresh browser/GPU pass of the latest controls, live provider checks for all record types, and a passing Windows/Linux CI run after push. Shared public hosting, source-backed sequence-to-structure position synchronization, and batch optimization beyond NCBI FASTA are outside this local-first release. See [RELEASE.md](RELEASE.md) for the exact checks.

## Product

Nodivium helps a student or researcher find a biological record, inspect what its source actually reports, follow documented cross-references, and export records with enough provenance to reproduce the retrieval. The CLI remains supported and shares provider, validation, and cache logic with the web app.

## Record types

| Source | Record | Primary inspection | Visualization |
| --- | --- | --- | --- |
| NCBI nucleotide | Sequence and annotations | Accession, organism, length, features, source link | Bases, GC window plot, annotated feature track |
| NCBI protein | Sequence and annotations | Accession, organism, length, features, source link | Residue sequence and feature track |
| NCBI gene | Gene record | Identifier, name, organism, genomic context, source link | Genomic location only when coordinates are supplied |
| NCBI PubMed | Literature record | Title, authors, journal, identifiers, source link | Citation card; no molecular viewer |
| UniProtKB | Protein entry | Name, organism, review status, function, features, cross-references | Annotated residue track |
| RCSB PDB | Structure entry | Title, method, resolution where applicable, entities, chains | Interactive 3D structure, sourced from mmCIF |

Never present inferred biological relationships as source annotations. Sequence-to-structure position linking requires an explicit mapping from the provider.

## Main workspace

1. **Search rail:** source and database tabs, query, relevant filters, results with type-specific metadata, paging, and add-to-collection action. IDs can be opened directly.
2. **Record canvas:** readable scientific summary, source and retrieval timestamp, tabs for overview, sequence/structure, annotations, raw data, and linked records. Action row for copy ID, visit source, choose format, and download.
3. **Inspector:** sequence, feature, and structure controls; selection details; accessible text equivalents for plotted values.
4. **Collection drawer:** selected IDs across sources, format per record, validation, batch progress, and ZIP export with a manifest and per-record failures.
5. **Local file entry:** parse FASTA or PDB/mmCIF in the browser for inspection without silently uploading a user file to a public service. Local files are clearly labelled and are not mistaken for database records.

Desktop uses a three-column workspace, allowing the inspector to expand. Narrow screens place search, record, and inspector in a single column with persistent tabs. Keyboard focus, reduced motion, sufficient contrast, and empty/error/loading states are required.

## Visual direction

Nodivium is a precise scientific desk. The chosen light palette is Ivory + Deep Teal (`#F7F7F2` canvas, `#FFFFFF` panels, `#0D766C` accent, `#18312E` text). The chosen dark palette is Deep Ocean + Mint (`#0B181A` canvas, `#14272A` panels, `#5DE0C0` accent, `#E8F5F0` text). Data labels, units, and provenance take priority over decoration. The opening state uses three short example journeys rather than a marketing hero. The explicit theme control persists the user's choice, and sequence charts and the molecular viewport follow the active palette.

The product mark is documented in [BRAND.md](BRAND.md).

## Delivery and release

- Shared Python core, separate CLI and FastAPI web adapters; local launch on Windows and Linux.
- A public web deployment is a later step after rate limiting, caching, data size caps, and NCBI tool identity are configured for shared use.
- CI on Windows and Linux, isolated tests, provider contract fixtures, package build and install check, accessible browser review, and source-attributed documentation.
- Release the upgraded GitHub repository with screenshots, a short demo, changelog, and versioned package. Prepare a LinkedIn announcement after the release is verifiable.

## Implementation order

1. Correct record-specific formats, cache identity, metadata fields, filenames, and version metadata.
2. Normalize search and record data; add source URLs, retrieval times, and explicit missing values.
3. Build web search, record, local FASTA inspection, downloads, and collection export.
4. Add UniProt annotations, NCBI sequence features, Mol* structure viewing, and source-backed cross-references.
5. Improve CLI presentation and batch efficiency; verify Windows/Linux; deploy, document, and announce.
