# Nodivium 2.0 release preparation

## What ships

- Local browser workspace launched with `nodivium web`, bound to `127.0.0.1`.
- Search, inspect, visualize, and export NCBI, UniProtKB, and RCSB PDB records; inspect local FASTA, PDB, and mmCIF files in the browser.
- CLI search, fetch, info, batch, cache, and version commands.
- Windows and Linux source install with bundled Mol* browser assets. Node.js is needed to rebuild the web assets from source, but users installing a release wheel do not need Node.js.

## Release gates

1. Build web assets: `cd web && npm ci && npm run build && node fasta-parser.test.mjs && node sequence-metrics.test.mjs`.
2. Run Python checks: `python tests.py && python -m pytest -q tests_upgrade.py`.
3. Build an sdist and wheel, then run `python scripts/check_wheel.py`. Test the installed wheel from a working directory outside the source checkout.
4. Complete the browser review in [TEST_RUNBOOK.md](TEST_RUNBOOK.md), especially both themes, Mol* controls, structure selection and measurement, nucleotide/protein inspectors, local files, and collection export.
5. Confirm one live record in each provider and each NCBI view (nucleotide, protein, gene, PubMed). A real NCBI contact email is required.
6. Push a release candidate and confirm the GitHub Actions matrix passes on Windows and Linux. The current local environment cannot substitute for the Windows run.
7. Confirm the renamed GitHub repository, remote, and repository links after push, then repeat the link and package checks. Capture new Nodivium screenshots after the browser pass. Publish the versioned package and GitHub release only after these gates pass.

## Release scope

The first release uses a local web server. Public shared hosting requires a separate request budget, shared cache strategy, and provider policy review. Source-backed residue mapping between UniProt and PDB, full result pagination, and per-record collection progress are future enhancements. The interface must never imply that two residue positions correspond without a verified alignment.

## Provider references

- [NCBI E-utilities](https://www.ncbi.nlm.nih.gov/books/NBK25500/) and [gene coordinate conventions](https://www.ncbi.nlm.nih.gov/books/NBK179288/)
- [UniProt sequence annotations](https://www.uniprot.org/help/sequence_annotation)
- [RCSB PDB APIs](https://www.rcsb.org/docs/programmatic-access/web-apis-overview) and [FASTA download paths](https://www.rcsb.org/docs/programmatic-access/file-download-services)
