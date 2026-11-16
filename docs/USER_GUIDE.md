# Nodivium user guide

Nodivium helps you find, inspect, visualize, and export records from **NCBI**, **UniProtKB**, and **RCSB PDB**. It has a local browser workspace and a command-line interface (CLI). Both use your computer and contact the source databases when you request remote records.

This guide covers installation, everyday use, supported formats, common errors, and how to report a problem. For release details, see the [changelog](../CHANGELOG.md). For developer and acceptance checks, see the [test runbook](TEST_RUNBOOK.md).

## Contents

1. [Choose an install](#1-choose-an-install)
2. [Start the web workspace](#2-start-the-web-workspace)
3. [Explore records in the browser](#3-explore-records-in-the-browser)
4. [Use the visual inspector](#4-use-the-visual-inspector)
5. [Inspect your own files](#5-inspect-your-own-files)
6. [Download records and collections](#6-download-records-and-collections)
7. [Use the CLI](#7-use-the-cli)
8. [Supported sources and formats](#8-supported-sources-and-formats)
9. [Cache, settings, and privacy](#9-cache-settings-and-privacy)
10. [Troubleshooting](#10-troubleshooting)
11. [Report an issue](#11-report-an-issue)

## 1. Choose an install

Nodivium needs Python 3.10 or newer. A normal PyPI installation includes the built browser assets; **Node.js is not needed**. Internet access is needed to install dependencies and to retrieve remote records. Browser inspection of a local file does not send that file to Nodivium's server.

### App install with uv (recommended)

If [uv](https://docs.astral.sh/uv/) is installed, run this from any directory on Linux or Windows:

```bash
uv tool install nodivium
nodivium version
nodivium web
```

The standard installation includes the browser workspace and CLI. Older commands using `nodivium[web]` still work. If `nodivium` is not found after installation, run `uv tool update-shell`, open a new terminal, and try `nodivium version` again. To update a uv-managed installation later, use `uv tool upgrade nodivium`.

### App install with pipx

If you use [pipx](https://pipx.pypa.io/), the equivalent command is:

```bash
pipx install nodivium
nodivium web
```

Install **either** with uv or pipx for a given command name; there is no need to install it with both.

### Project virtual environment with pip

Use this route if you need `import nodivium` inside a Python project, or if uv and pipx are unavailable. Activate the environment before running `nodivium`.

**Linux:**

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install nodivium
nodivium web
```

**Windows PowerShell:**

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install nodivium
nodivium web
```

If PowerShell does not allow activation, you can run `.\.venv\Scripts\python.exe -m pip install nodivium` and `.\.venv\Scripts\nodivium.exe web` directly.

On Ubuntu and other distributions with an **externally managed** system Python, plain `pip install nodivium` outside a virtual environment is blocked by design. Use uv, pipx, or a virtual environment. Do not use `--break-system-packages` for this app.

### Install from source

If you are developing Nodivium or testing a repository checkout, use the [source setup in the README](../README.md#try-the-web-workspace-from-source). Source development needs Node.js and npm to rebuild `web/`; users of the PyPI wheel do not.

## 2. Start the web workspace

Run:

```bash
nodivium web
```

Nodivium starts a local server at `http://127.0.0.1:8765` and opens your default browser after the server is ready. Keep that terminal open while using the page; **Ctrl+C** stops the server. You can paste the printed address into a browser yourself if it does not open automatically. Open the `http://127.0.0.1` address, not a `web/index.html` file.

If port 8765 is busy, choose another port:

```bash
nodivium web --port 8766
```

For a remote terminal, SSH session, or computer without a graphical browser, use `nodivium web --no-browser`. The server binds to the computer's loopback address (`127.0.0.1`), so a browser on another computer cannot reach it directly. `--no-browser` only stops automatic opening; it does not change where the server listens.

### NCBI contact email

Before using **NCBI** search, record, or download features, set a real contact email in the same terminal that starts Nodivium. An NCBI API key is optional.

**Linux:**

```bash
export NODIVIUM_NCBI_EMAIL='you@example.org'
nodivium web
```

**Windows PowerShell:**

```powershell
$env:NODIVIUM_NCBI_EMAIL='you@example.org'
nodivium web
```

Replace the example with an address you control. If you have an NCBI API key, set `NODIVIUM_NCBI_API_KEY` in the same way. These variables are read from the process environment; merely writing them in a `.env` file does not configure Nodivium. Keep API keys out of screenshots and Git commits. Previous `BIOFETCH_NCBI_EMAIL` and `BIOFETCH_NCBI_API_KEY` values are accepted as fallbacks, but new setups should use the `NODIVIUM_` names.

## 3. Explore records in the browser

The workspace has **Discover** on the left, the selected **record** in the center, and the **Visual inspector** on the right.

1. Select **UniProtKB**, **NCBI**, or **RCSB PDB**. For NCBI, also choose **Nucleotide**, **Protein**, **Gene**, or **PubMed literature**.
2. Enter a search term and choose **Search records**, or enter a known accession and choose **Open ID**.
3. Select a result. Use **Overview**, **Annotations**, **Linked records**, and **Raw data** to inspect what the source reported.
4. Use **View source** to open the upstream record when you need to check its original context.

Try UniProt `P68871`, RCSB PDB `1HHO`, or an NCBI nucleotide record such as `NM_007294`. Search results can show more rows up to the current 50-result interface limit. The **Reviewed UniProt entries only** switch applies only to UniProt searches.

Record IDs and source labels remain visible while you inspect a record. Linked records are included only when a source explicitly reports a cross-reference; Nodivium does not infer equivalence between unrelated accession numbers or residue positions. Missing annotations are shown as missing rather than invented.

## 4. Use the visual inspector

### Sequence and literature views

- **Nucleotide sequences:** inspect base composition, GC content, plotted windows, reported features, and exact sequence positions. Ambiguous bases are counted separately; a window without canonical bases does not receive a GC percentage.
- **Protein sequences:** inspect amino-acid composition and a selected residue range. Choose an amino-acid row or a reported feature to highlight relevant positions.
- **NCBI Gene:** inspect source-provided gene details and genomic locations. Displayed coordinates are 1-based; the strand shown comes from the source orientation.
- **PubMed:** inspect citation details and the abstract view when available. It is a literature record, so no molecular sequence or 3D model is implied.

### PDB structure view

For a PDB entry or a local PDB/mmCIF file, the inspector loads a Mol* 3D view. Drag to rotate and use your browser's normal pointer controls to zoom. **Fit structure** returns the whole model to view. **Expand** gives the viewer more room; closing it fits the model again while keeping chosen colors.

- **Canvas**, **Protein**, and **Ligands & ions** color controls change the displayed colors. **Reset colors** returns to Mol* colors and a black canvas.
- **Show components** has independent Protein/polymer, Ligands, Ions, and Water switches. A disabled switch means that component is absent from the loaded structure. Any available combination can be shown.
- **Representations** offers the applicable Mol* rendering styles for each component present. Surface styles can take longer to render on larger structures.
- To annotate a residue, click **Select residues**, click one residue in the model, and then click **Label selection**. To measure, select two residues and click **Measure distance**. The selected count should change as you click. **Clear selection** clears the current picks.
- **Hide selected** makes selected residues invisible; **Show only selected** isolates them. **Restore full view** reverses those actions while preserving component visibility choices.

The width and height sliders resize the inspector without using Expand. The theme button changes between light and dark modes. Structure rendering requires a browser and graphics environment with WebGL support.

## 5. Inspect your own files

Choose **Inspect locally → Choose a file**. Supported extensions are `.fasta`, `.fa`, `.faa`, `.fna`, `.pdb`, `.cif`, and `.mmcif`. Files can be up to **20,000,000 bytes** for browser inspection.

- Multi-record FASTA files get a record picker. You can switch the selected entry and, where needed, its nucleotide/protein interpretation.
- PDB and mmCIF files open in the 3D viewer. Their presence does not automatically establish sequence-to-database links.
- Local files are read by the browser. They are not uploaded to the Nodivium server, and local entries cannot be added to a remote-record collection.

If a FASTA file is rejected, check that each record starts with a `>` header containing an identifier and has nonempty sequence text. The parser reports invalid sequence symbols rather than silently dropping records.

## 6. Download records and collections

For a single remote record, choose an available format in **Export original record** and click **Download**. The format menu depends on the record type; for example, PubMed does not offer FASTA. Large original records may be downloadable even when the **Raw data** preview is limited.

To make a small multi-source collection:

1. Open a remote record, choose its export format, and click **Collect**.
2. Repeat for other records, then open **Collection** at the top of the page.
3. Change a row's format or remove it if needed; click **Download ZIP**.

The ZIP contains a `manifest.json` and a file for each successful retrieval. Each manifest row records the source, ID, format, status, and, for a successful file, its size and SHA-256 checksum. If a source request fails, its row records a failure instead of silently disappearing. **Review the manifest before assuming every requested record was exported.** A collection accepts up to **25 records** and **20 MB of retrieved text**. The browser remembers the collection between visits on the same browser profile.

## 7. Use the CLI

Type `nodivium` to see the command guide and ASCII wordmark, or use `nodivium COMMAND --help` for exact options. The CLI is useful for scripts, remote terminals, and repeated downloads. Set `NODIVIUM_NCBI_EMAIL` before any NCBI command.

| Task | Example |
| --- | --- |
| Check version | `nodivium version` |
| Search UniProt | `nodivium search hemoglobin --source uniprot --reviewed --limit 5` |
| Search NCBI Gene | `nodivium search BRCA1 --source ncbi --db gene --limit 5` |
| View UniProt metadata | `nodivium info P68871 --source uniprot` |
| Preview a sequence | `nodivium fetch P68871 --source uniprot` |
| Save a sequence | `nodivium fetch P68871 --source uniprot --format fasta --output P68871.fasta` |
| Save a structure | `nodivium fetch 1HHO --source pdb --format cif --output 1HHO.cif` |
| Save an NCBI protein | `nodivium fetch NP_000509.1 --source ncbi --db protein --format genpept --output NP_000509.1.gp` |
| Save several records | `nodivium batch P68871 P69905 --source uniprot --outdir ./sequences` |
| Inspect cache | `nodivium cache stats` and `nodivium cache list` |

`fetch`, `info`, and `batch` require `--source`. `search` defaults to NCBI nucleotide if no source is given. `--db` matters only for NCBI. `fetch` and `batch` choose the record type's default format if `--format` is omitted. Use `--no-cache` to request a fresh remote copy. `batch` saves one file per ID in its output directory and reports failures per record. For a complete local copy, use `--output`; a normal terminal fetch shows a preview.

Cache maintenance commands:

```bash
nodivium cache stats
nodivium cache list
nodivium cache delete P68871 --source uniprot --format fasta
nodivium cache clear
```

`cache clear` asks before deleting; `nodivium cache clear --force` skips that prompt.

## 8. Supported sources and formats

The format list below is implemented in Nodivium 2.0. Availability in the web menu follows the selected record type.

| Source and record type | Formats | Default |
| --- | --- | --- |
| NCBI Nucleotide | `fasta`, `genbank`, `xml` | `fasta` |
| NCBI Protein | `fasta`, `genpept`, `xml` | `fasta` |
| NCBI Gene | `xml`, `gene_table` | `xml` |
| NCBI PubMed | `xml`, `medline`, `abstract` | `xml` |
| UniProtKB | `fasta`, `json`, `txt`, `xml`, `tsv` | `fasta` |
| RCSB PDB | `cif`, `pdb`, `fasta` | `cif` |

Use `cif` for the mmCIF structure format. A Gene or PubMed record is not a nucleotide/protein sequence; neither offers a FASTA export here. Browser search terms must be 2–250 characters, and direct IDs must contain at most 80 letters, numbers, `.`, `_`, or `-` (starting with a letter or number).

## 9. Cache, settings, and privacy

Remote content fetched through Nodivium is cached locally for **7 days**, which can make repeat fetches faster. `--no-cache` bypasses an existing CLI entry and refreshes it. `nodivium cache stats` prints the actual cache directory. On Linux the default is `~/.cache/nodivium/` (or `$XDG_CACHE_HOME/nodivium/`); on Windows it is under `%LOCALAPPDATA%\nodivium\` when that variable exists.

The web page stores the chosen theme, viewer preferences, and collection list in that browser's local storage. Clearing browser site data can remove those preferences and the list. Collection contents are fetched when you export the ZIP; saving a list is not the same as preserving downloaded source files. Local files chosen for inspection remain in the browser session and are not stored in the Nodivium cache.

The web service listens on `127.0.0.1`, not on a public network interface. Requests for remote data still go from the local service to NCBI, UniProt, or RCSB PDB. The **View source** link opens the provider's website. Inspect each provider's usage terms when distributing downloaded content.

## 10. Troubleshooting

| Symptom | What to check or do |
| --- | --- |
| `externally-managed-environment` from `pip install` | You are using system Python. Install the app with `uv tool install nodivium` or `pipx install nodivium`, or activate a virtual environment before using pip. |
| `nodivium: command not found` | Run `uv tool update-shell` and open a new terminal, or activate the virtual environment used for installation. Check `uv tool list`, `pipx list`, or the environment's `bin/` / `Scripts/` directory. |
| `Web dependencies are missing` | You likely have version 2.0.0, which required the `[web]` extra. Upgrade to 2.0.1 or newer with `uv tool upgrade nodivium`, `pipx upgrade nodivium`, or `python -m pip install --upgrade nodivium` in the active virtual environment. |
| `NCBI access needs a contact email` | Set `NODIVIUM_NCBI_EMAIL` to your real address in the terminal that runs the command or server. Restart `nodivium web` after changing it. |
| Browser did not open | Copy the printed `http://127.0.0.1:8765` address into a browser on the same computer. Check your default browser and graphical session. `--no-browser` is available for SSH/headless use. |
| `Address already in use` or the page shows another app | Stop the other server, or run `nodivium web --port 8766` and open the new printed address. |
| Page appears unstyled or API calls fail | Open the `http://127.0.0.1` URL printed by the running server; do not open `web/index.html` as a local file. Refresh the page after updating the installed package. |
| `Web assets are not built` in a source checkout | From the repository's `web/` directory, run `npm ci` then `npm run build`. A normal PyPI wheel already includes these assets. |
| PDB structure stays blank or rendering is slow | Try a current Chrome or Firefox build with WebGL enabled, then a smaller structure. Surface representations can be expensive. A remote structure also needs the upstream download to succeed. |
| Ion or Water switch is disabled | That component is not present in the currently loaded structure. Choose a structure that contains it if you want to test the switch. |
| Residue count stays at zero | Click **Select residues** first, then click residues in the 3D model. The label action needs one selected residue; distance needs two. Use **Fit structure** if the model is out of view. |
| Local FASTA/PDB/mmCIF file is rejected | Use one of the supported extensions, stay at or below 20,000,000 bytes, and check that the file content is valid. FASTA entries need a `>` header and nonempty sequence. |
| A requested export format is absent | Formats depend on the source and record type. Check [the table above](#8-supported-sources-and-formats); for example, NCBI Protein uses `genpept` and PubMed has no FASTA. |
| ZIP has fewer record files than requested | Open `manifest.json` and inspect each row's `status` and `error`. The 25-record/20 MB limits or an upstream request failure can produce failed rows. |
| Upstream request fails or a record is missing | Confirm the source, database, and exact ID on the provider's website. Check network access and retry later. Use `--no-cache` in CLI if you need a fresh copy. NCBI also needs the contact email. |
| Output file cannot be saved | Check the destination directory and write permission. For CLI `fetch --output`, the parent directory must exist; `batch --outdir` creates its directory. |

For a quick local server check, leave `nodivium web` running and request `http://127.0.0.1:8765/api/health` in another terminal or browser. A healthy server returns JSON with `"status":"ok"` and the installed version. If you chose another port, use that port instead.

## 11. Report an issue

Open a [GitHub issue](https://github.com/Eswar-mse/Nodivium/issues) with:

1. `nodivium version`, your OS, Python version, install method (uv, pipx, or virtual environment), and browser version if the issue is visual.
2. The exact command or browser steps, the selected source/database/record ID, the expected result, and what happened instead.
3. The full error text or a screenshot, plus whether the problem also occurs after a fresh restart or with another record.

Remove API keys, private file contents, email addresses you do not want public, and other sensitive data before posting logs. A small public record ID or a minimal non-sensitive FASTA/PDB example makes the issue easier to reproduce.
