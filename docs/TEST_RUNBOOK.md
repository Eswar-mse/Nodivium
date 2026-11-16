# Nodivium 2.0 local test runbook

Use this runbook on the current source checkout before a public release. Run the stages in order. For each failure, save the exact command or action, the full error, and a screenshot when the problem is visual. Do not include an NCBI API key in screenshots or logs.

## 1. Clean setup on Linux

Run these commands in a normal terminal with network access. Python 3.12 matches the current CI matrix. The machine used to develop this preview currently defaults to Python 3.14, so select 3.12 explicitly.

```bash
cd /home/eswar-mse/Documents/Projects/nodivium
uv python install 3.12
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -e '.[web,test]'
source .venv/bin/activate
python --version
nodivium version
cd web
npm ci
npm run build
node fasta-parser.test.mjs
node sequence-metrics.test.mjs
cd ..
python tests.py
python -m pytest -q tests_upgrade.py
```

Expected: Python reports 3.12.x; `nodivium version` reports `2.0.0`; npm build succeeds; parser, legacy, and focused Python checks pass. Stop and report the exact command/output if any step fails.

## 2. Start the local web app

Set your actual contact email for NCBI requests in the **same terminal**. Replace the example address; it must be a real address you control. An API key is optional.

```bash
export NODIVIUM_NCBI_EMAIL='your-real-address@example.org'
nodivium web
```

Leave that terminal running. In a second terminal, run:

```bash
curl -fsS http://127.0.0.1:8765/api/health
```

Expected: `nodivium web` opens the browser after the server is ready, and the health check returns JSON with `"status":"ok"` and version `2.0.0`. If browser opening is unavailable, open **http://127.0.0.1:8765/** yourself. Use this address, not `web/index.html` opened as a file. The page should show the Nodivium logo, three-column workspace on desktop, and styled light/dark themes.

If port 8765 is busy, stop the app with Ctrl+C and run `nodivium web --port 8766`; use port 8766 in the browser and health check. For SSH or headless use, add `--no-browser`.

## 3. Browser test matrix

Record each row as pass/fail and note the browser name and version.

| Test | Action | Expected result |
| --- | --- | --- |
| UniProt direct record | Click **Explore hemoglobin β** or choose UniProt and **Open ID** `P68871`. | Title, organism, sequence inspector, source link, and available formats appear. No console error. |
| UniProt search | Search `hemoglobin`, then turn on **Reviewed UniProt entries only** and search again. Use **Show more results**. | Search cards match the chosen filter; the count says **Showing N**; more results load up to the current 50-result cap. |
| UniProt annotations and links | Open `P68871`; inspect **Annotations** and **Linked records**. | Only source-reported features and cross-references appear. Links open the matching source site. |
| NCBI nucleotide | Choose NCBI → Nucleotide; **Open ID** `NM_007294`. | Record loads with a nucleotide sequence, 1-based positions, GC plot, and feature annotations when supplied. FASTA, GenBank, and XML are offered. |
| NCBI protein | Choose NCBI → Protein; search `human hemoglobin beta` and open one result. | Protein sequence loads with amino acid composition, range inspection, and clickable residue highlighting; **GenPept** is offered; **GenBank** is not offered for a protein. |
| NCBI gene | Choose NCBI → Gene; search `BRCA1 Homo sapiens` and open a result. | Gene summary and source link appear; FASTA is not offered. Source-provided genomic coordinates show a 1-based position/orientation card with strand and endpoint labels. |
| PubMed | Choose NCBI → PubMed literature; search `CRISPR genome editing` and open a result. | Citation card, authors, journal/date and DOI appear when supplied. **Copy citation** copies source details, and **Load PubMed abstract view** returns text from NCBI; no molecular viewer. |
| RCSB PDB | Click **Inspect a structure** (`1HHO`). Rotate and zoom the model; use **Expand** and close it. | The structure loads in a focused 3D canvas, without Mol*'s internal structure/measurement panels. Closing the expanded view fits the whole structure again while retaining chosen colors. Structure formats include mmCIF and PDB. |
| Structure measurement | Open `1HHO`, press **Select residues**, click one residue in the model, then **Label selection**. Clear selection, select two different residues, then press **Measure distance**. | The selected count changes to 1 or 2. A label or distance appears on the structure; **Clear selection** resets the count. The same actions work after expanding the inspector. |
| Viewer themes and sizing | Switch light/dark themes while viewing a structure, change canvas/protein colors, resize the inspector, and press **Fit structure**. | Controls remain readable; the whole model fits in the viewport. Colors persist when the expanded view closes. |
| Structure representations | Open `1HHO`, expand **Representations**, and change the protein to **Ball & Stick**, then **Cartoon**. Change a ligand or other listed component if present. | Only components in the record are listed; each menu offers applicable Mol* styles. The selected component changes style and keeps its color. The model remains rotatable and measurable. |
| Structure visibility | Open a structure containing water and ions. Under **Show components**, turn their switches off and on. Select two residues, press **Hide selected**, then **Restore full view**. Select again, press **Show only selected**, then restore. | Water and ions toggle independently. Absent components have disabled switches. Hidden residues disappear, and isolate shows only the picked residues. Restore brings back the full structure while respecting component switches and color choices. |
| Empty search | Choose RCSB PDB and search an unlikely string such as `zzzxxyy-no-hit-test-2026`. | **No records found**, not a JSON parsing error. |
| Single download | Download `P68871` as FASTA, `NM_007294` as GenBank, and `1HHO` as mmCIF. | Files save with sensible names and nonempty original content. |
| Local multi-FASTA | Use **Choose a file** and select `docs/test-data/multi.fasta`. | The picker lists two records. Changing records changes title, sequence, and length. The nucleotide record has a GC chart; the protein record does not. Try the sequence-type selector. |
| Local structure | Select the downloaded `1HHO.cif` or `.pdb` file with **Choose a file**. | Structure loads locally in Mol* without a Nodivium upload. |
| Raw record | Open a remote record and its **Raw data** tab; use **Load original content**. | Raw source content appears; changing the selected format reloads the appropriate content. |
| Error messages | In **Open ID**, try `invalid!!` or an ID that does not exist. | A clear error appears; the page remains usable. |
| Race handling | Quickly open two different search results, or start opening a remote record and immediately choose a local file. | The last chosen record remains visible. |

Use Developer Tools → Console while doing the browser tests. Report red errors with the action that triggered them. A failed upstream request may be visible in Network; record its URL path and HTTP status, but remove any API key from shared output.

## 4. Collection and provenance

1. Open `P68871`, set FASTA, click **Collect**.
2. Open `1HHO`, set mmCIF, click **Collect**.
3. Open `NM_007294`, set GenBank, click **Collect**.
4. Open **Collection**. Change one format there, remove and re-add one item, then click **Download ZIP**.
5. Confirm the ZIP contains `manifest.json` and one file for each successful record. A failed source should appear as a failed manifest row rather than silently disappearing.

On Linux, inspect the downloaded ZIP with:

```bash
python - <<'PY'
from pathlib import Path
from zipfile import ZipFile
from hashlib import sha256
import json

archive_path = Path.home() / 'Downloads' / 'nodivium-collection.zip'
with ZipFile(archive_path) as archive:
    manifest = json.loads(archive.read('manifest.json'))
    for row in manifest['records']:
        print(row['source'], row['id'], row['format'], row['status'])
        if row['status'] == 'ok':
            data = archive.read(row['file'])
            assert len(data) == row['bytes']
            assert sha256(data).hexdigest() == row['sha256']
print('Manifest and checksums verified')
PY
```

If your browser renamed the download to `nodivium-collection (1).zip`, change `archive_path` to that exact filename.

## 5. Theme, responsive layout, and accessibility

- Switch dark → light → dark; reload. The chosen theme should remain and the logo, text, sequence chart, and molecular viewport should stay readable.
- On `1HHO`, confirm the Nodivium viewer controls remain readable in dark mode and Mol*'s internal side panels stay hidden. Change canvas, protein, and ligand/ion colors; reload to check they persist. **Reset colors** should restore a black canvas.
- On `1HHO` or `2PGH`, confirm the 3D canvas has no internal Mol* side panels in either theme. Click **Select residues**, select two different residues in the 3D model, and check the selection count and **Measure distance** button. Add the distance and one label; the result should appear in the structure. Repeat after switching themes and after expanding and closing the inspector.
- Move the inspector width and height sliders without using **Expand**; the viewer should grow or shrink smoothly. Then use **Expand** to confirm it still works.
- On `NM_007294` and local `multi.fasta`, check base counts, the GC chart, tooltips, and click a GC window to inspect its exact positions. A window with only ambiguous bases should not claim a GC percentage.
- On UniProt `P68871`, NCBI Protein, and the protein record in local `multi.fasta`, click an amino acid row to highlight that residue, inspect a different range, and click a source feature bar when features exist. Counts and positions should follow the selected record.
- Resize the browser to approximately 390 px wide, then 768 px and desktop width. Search, record, inspector, download controls, and collection dialog should remain usable without horizontal scrolling.
- Use Tab and Shift+Tab to reach search, results, record tabs, format choice, collection, theme control, and inspector. Focus must be visible. Press Enter/Space on buttons and Escape to close the collection dialog or expanded inspector.
- Check the browser at 200% zoom. Text and controls should remain readable. If you have a screen reader, confirm that buttons and selectors have useful names and the status/error message is announced.
- Try both Chrome and Firefox if available, especially for the 3D viewer and local file picker.

## 6. CLI checks

Use the same activated environment and contact email:

```bash
nodivium search hemoglobin --source uniprot --reviewed --limit 5
nodivium fetch P68871 --source uniprot --info
nodivium fetch P68871 --source uniprot --info
nodivium fetch 1HHO --source pdb --format cif --output /tmp/nodivium-1HHO.cif
nodivium batch NM_007294 NM_000546 --source ncbi --db nucleotide --format fasta --outdir /tmp/nodivium-batch
nodivium cache stats
nodivium
```

Expected: readable terminal output; the second UniProt fetch says it came from cache; the PDB file is nonempty; batch writes separate FASTA files for both IDs. Also try an invalid format, for example `nodivium fetch P68871 --source uniprot --format pdb`; it should explain supported formats without a traceback.

For the missing-contact error path, stop the server with Ctrl+C, run `unset NODIVIUM_NCBI_EMAIL`, restart `nodivium web`, and try an NCBI record. It should explain that a contact email is needed while UniProt and PDB remain usable. Stop the server, restore your actual email, and restart before continuing.

## 7. Windows acceptance pass

After Linux passes, repeat a clean install and representative web/CLI cases on Windows 10/11 with Python 3.12 and Node.js installed:

```powershell
cd <path-to-nodivium-repository>
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[web,test]"
cd web
npm ci
npm run build
node fasta-parser.test.mjs
node sequence-metrics.test.mjs
cd ..
python tests.py
python -m pytest -q tests_upgrade.py
$env:NODIVIUM_NCBI_EMAIL = "your-real-address@example.org"
nodivium web
```

Open `http://127.0.0.1:8765/` on Windows. Test at least one record from every source, theme switching, local FASTA and structure files, collection ZIP, and `nodivium fetch P68871 --source uniprot`. Record any difference from Linux. The expanded GitHub Actions matrix will be checked separately after the changes are pushed.

## Known unfinished features

The current release scope has a 50-result discovery cap and no full pagination. It does not have source-backed sequence-to-structure position synchronization or per-record collection progress. The gene card is an orientation diagram, not a scaled genome browser. These are documented future enhancements, not regressions.

## When something fails

Send: **stage/row**, **OS + browser**, **exact steps**, **expected vs actual**, **terminal output**, and **screenshot or browser Console/Network error** if relevant. Start with the first failing stage; we will fix that before moving on. Keep your API key out of shared logs.
