<div align="center">

<img src="web/assets/nodivium-mark.png" alt="Nodivium DNA and connected records mark" width="96">

# 🧬 Nodivium

**Explore, visualize, and export NCBI · UniProt · PDB records**

[![Tests](https://github.com/Eswar-mse/Nodivium/actions/workflows/ci.yml/badge.svg)](https://github.com/Eswar-mse/Nodivium/actions)
![Python](https://img.shields.io/badge/python-3.10%2B-blue)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-lightgrey)](#)
[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.24271314.svg)](https://doi.org/10.5281/zenodo.24271314)

</div>

**New here?** Read the [complete Nodivium user guide](docs/USER_GUIDE.md) for installation on Linux and Windows, web and CLI workflows, supported formats, troubleshooting, and issue reporting.

## Install the release

For a command you can run from any directory, install Nodivium with [uv](https://docs.astral.sh/uv/concepts/tools/) or [pipx](https://pipx.pypa.io/). Both give the app its own Python environment. The wheel includes the web assets, so Node.js is not needed for a normal install.

```bash
uv tool install 'nodivium[web]'
nodivium web
```

Alternatively, run `pipx install 'nodivium[web]'`. To install only the CLI, omit `[web]`. If uv says the executable directory is not on `PATH`, run `uv tool update-shell`, restart your terminal, and try `nodivium version`.

If you need Nodivium as an importable Python library in a project, create and activate a virtual environment first:

```bash
python -m venv .venv
# Linux: source .venv/bin/activate
# Windows PowerShell: .venv\Scripts\Activate.ps1
python -m pip install "nodivium[web]"
nodivium web
```

`nodivium web` opens <http://127.0.0.1:8765> in your browser when the server is ready. If you are using SSH or a machine without a browser, run `nodivium web --no-browser` and open the printed URL yourself. Set `NODIVIUM_NCBI_EMAIL` to your real contact address before requesting NCBI records, as shown below. On Linux distributions that mark system Python as externally managed, bare `pip install nodivium` fails by design; use uv, pipx, or the activated virtual environment above.

## Try the web workspace from source

From a source checkout, use Python 3.10+, Node.js, and npm for the one-time browser asset build.

```bash
python -m venv .venv
# Linux: source .venv/bin/activate
# Windows PowerShell: .venv\Scripts\Activate.ps1
python -m pip install -e ".[web]"
cd web
npm ci
npm run build
cd ..
nodivium web
```

The command opens <http://127.0.0.1:8765> automatically. Search UniProt, NCBI, or RCSB PDB; inspect records, sequences, structures, and source-backed UniProt cross-references; add records to a ZIP collection with a manifest that includes per-file SHA-256 checksums and retrieval failures. Local FASTA, PDB, and mmCIF files are read in the browser and are not uploaded to Nodivium. Multi-record FASTA files have a sequence picker and a nucleotide/protein interpretation control. The web service listens on the local computer only.

For NCBI access, set a real contact address before starting Nodivium. NCBI's usage policy requires an identifiable tool contact. An optional NCBI API key can be provided for higher rate limits:

```bash
# Linux
export NODIVIUM_NCBI_EMAIL="you@example.org"
export NODIVIUM_NCBI_API_KEY="your-key"   # optional

# Windows PowerShell
$env:NODIVIUM_NCBI_EMAIL="you@example.org"
$env:NODIVIUM_NCBI_API_KEY="your-key"     # optional
```

These values are read from the environment; do not commit your API key to the repository. The initial web workspace limits a collection to 25 records and 20 MB of retrieved text. Public hosting needs additional shared rate limiting and performance checks before deployment. The complete upgrade contract and remaining work are in [docs/WEB_UPGRADE.md](docs/WEB_UPGRADE.md).

The release scope and required checks are in [docs/RELEASE.md](docs/RELEASE.md). An installed release wheel includes the browser assets; Node.js is only needed when rebuilding those assets from source.

For a clean install, provider, browser, CLI, collection, and Windows/Linux acceptance pass, follow the [Nodivium test runbook](docs/TEST_RUNBOOK.md).

Existing NCBI environment settings remain supported as fallbacks. Nodivium migrates the previous cache directory when possible and reads existing browser theme, viewer, and collection preferences. Use the `NODIVIUM_` variables for new setups. The GitHub repository is now named Nodivium.

## Choose web or CLI

| | Local web workspace | Command line |
| --- | --- | --- |
| Best for | Exploring unfamiliar records, viewing sequences and 3D structures, comparing source details, and assembling a small mixed-source collection. | Repeated downloads, shell scripts, remote/SSH sessions, and saving many records to a chosen folder. |
| Strengths | Search cards, source-aware record views, dark/light theme, resizable inspector, local file inspection, interactive structure colors, representations and visibility, and ZIP export with a provenance manifest. | Fast repeat access through the local cache, clear text output, NCBI FASTA batch retrieval, and automation-friendly commands. |
| Tradeoffs | Needs a browser, local web dependencies, and WebGL for 3D viewing; collections currently have a 25-record/20 MB limit and discovery shows up to 50 results. | No interactive 3D viewer or browser charts; users choose IDs, formats, and output paths through command options. |
| Install | `uv tool install 'nodivium[web]'` | `uv tool install nodivium` |

Both modes use the same NCBI, UniProt, and RCSB PDB providers and share the local cache. Start the web workspace with `nodivium web`; type `nodivium` for the CLI command guide.

---

Nodivium is a cross-platform research workspace for **NCBI**, **UniProt**, and **RCSB PDB** records, with a browser interface and CLI. Search, inspect, visualize, connect, and export biological records by accession ID; a local cache speeds up repeat access.

No conda required. A virtual environment is recommended when testing this source checkout.

---

## ✨ Features

| | Feature | Description |
|---|---|---|
| 🔍 | **Search** | Query NCBI, UniProt, and PDB with ranked results |
| ⬇️ | **Fetch** | Download sequences and structures by accession ID |
| 📋 | **Info** | Rich metadata panels — no full download needed |
| 📦 | **Batch** | Bulk fetch hundreds of records with progress bar |
| ⚡ | **Cache** | 7-day local disk cache — instant repeat lookups |
| 🎨 | **Rich UI** | Beautiful terminal tables, spinners, and panels |
| 🔄 | **Formats** | FASTA · GenBank · JSON · XML · PDB · mmCIF · TSV |
| 🌍 | **Cross-platform** | Windows and Linux — Python package with bundled web assets |

---

## 🚀 Quick Start

```bash
# Fetch a protein sequence from UniProt
nodivium fetch P68871 --source uniprot

# Fetch with full metadata panel
nodivium fetch P68871 --source uniprot --info

# Download a PDB structure file
nodivium fetch 1HHO --source pdb --format pdb --output 1HHO.pdb

# Fetch a gene from NCBI
nodivium fetch NM_007294 --source ncbi --db nucleotide

# Search UniProt (Swiss-Prot reviewed only)
nodivium search "hemoglobin" --source uniprot --reviewed --limit 5

# Search PDB for insulin structures
nodivium search "insulin" --source pdb --limit 5

# Search NCBI
nodivium search "BRCA1 human mRNA" --source ncbi --db nucleotide --limit 8

# Batch fetch and save to folder
nodivium batch P68871 P69905 P68873 --source uniprot --outdir ./sequences

# Cache management
nodivium cache stats
nodivium cache list
nodivium cache clear
```

---

## 📖 Commands

| Command | Description |
|---|---|
| `nodivium fetch <ID>` | Fetch a single record by accession |
| `nodivium search <query>` | Search a database |
| `nodivium info <ID>` | Rich metadata summary |
| `nodivium batch <IDs...>` | Bulk fetch and save |
| `nodivium cache stats` | Cache size and entry count |
| `nodivium cache list` | List all cached keys |
| `nodivium cache clear` | Wipe the cache |
| `nodivium cache delete <ID>` | Remove one cached entry |
| `nodivium version` | Print version |

---

## ⚙️ Fetch Options

| Flag | Description |
|---|---|
| `--source` / `-s` | `ncbi`, `uniprot`, or `pdb` |
| `--format` / `-f` | `fasta`, `genbank`, `json`, `xml`, `pdb`, `cif`, `tsv` |
| `--db` | NCBI database: `nucleotide`, `protein`, `gene`, `pubmed` |
| `--output` / `-o` | Save to file |
| `--info` / `-i` | Show metadata panel |
| `--no-preview` | Skip terminal preview |
| `--no-cache` | Force fresh API call |

---

## 💾 Cache

Results are cached locally for 7 days:

- **Linux/Mac**: `~/.cache/nodivium/`
- **Windows**: `%LOCALAPPDATA%\nodivium\`

```bash
nodivium cache stats   # see how much is cached
nodivium cache clear   # wipe everything
```

---

## 📦 Dependencies

| Package | Purpose |
|---|---|
| `biopython` | NCBI Entrez, sequence parsing |
| `requests` | UniProt & PDB REST APIs |
| `diskcache` | Local disk-based caching |
| `rich` | Terminal formatting & tables |
| `typer` | CLI framework |

The CLI dependencies install with pip or uv; the web workspace adds FastAPI, Uvicorn, and bundled browser assets.

---

## 🧪 Tests

```bash
git clone https://github.com/Eswar-mse/Nodivium.git nodivium
cd nodivium
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[web,test]'
python tests.py
python -m pytest -q tests_upgrade.py
```

The 34 legacy checks and focused upgrade checks use mocked provider requests; no network is required to run them. On Windows, use `py -m venv .venv` and `.\.venv\Scripts\Activate.ps1` in place of the Linux virtual-environment commands above.

---

## 📄 License

MIT © [Eswar-mse](https://github.com/Eswar-mse)

---

## Cite Nodivium

If you use Nodivium in research, cite the archived **2.0.0** release: [Moparti, Sri Venkata Satya Sai Eswar. *Nodivium 2.0.0: Biological Record Exploration and Visualization*. Zenodo. DOI: 10.5281/zenodo.24271314](https://doi.org/10.5281/zenodo.24271314). GitHub's **Cite this repository** menu uses [CITATION.cff](CITATION.cff), which also records the author's [ORCID](https://orcid.org/0009-0005-4635-7368).

---

<div align="center">

Built with 🧬 by [Sri Venkata Satya Sai Eswar Moparti](https://github.com/Eswar-mse)

**[User guide](docs/USER_GUIDE.md) · [Issues](https://github.com/Eswar-mse/Nodivium/issues) · [Changelog](CHANGELOG.md)**

</div>
