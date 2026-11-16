const $ = (selector) => document.querySelector(selector);
const storage = {
  get(key) { try { return localStorage.getItem(key) ?? localStorage.getItem(key.replace(/^nodivium-/, 'biofetch-')); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch {} },
};
const viewerDefaults = { bg: '#000000', polymer: '#5de0c0', ligand: '#f4bd62' };
const savedColor = (key, fallback) => /^#[0-9a-fA-F]{6}$/.test(storage.get(key) || '') ? storage.get(key) : fallback;
const state = { record: null, collection: [], tab: 'overview', raw: '', viewer: null, searchSeq: 0, openSeq: 0, resultLimit: 15,
  viewerIsolation: null, viewerHiddenResidues: false,
  viewerColors: { bg: savedColor('nodivium-viewer-bg', viewerDefaults.bg), polymer: savedColor('nodivium-viewer-polymer', viewerDefaults.polymer), ligand: savedColor('nodivium-viewer-ligand', viewerDefaults.ligand) },
  viewerColorMode: storage.get('nodivium-viewer-color-mode') === 'custom' ? 'custom' : 'source' };
const safe = (value) => value == null || value === '' ? 'Not reported' : String(value);
const node = (tag, className = '', value = '') => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = value;
  return element;
};
const append = (parent, ...children) => children.forEach(child => parent.append(child));

function message(text) {
  const box = $('#message');
  box.textContent = text;
  box.hidden = false;
  clearTimeout(message.timer);
  message.timer = setTimeout(() => { box.hidden = true; }, 5000);
}

async function api(path, options) {
  if (location.protocol === 'file:') throw new Error('Live database search needs the Nodivium server. Run “nodivium web” and open its local address.');
  const response = await fetch(path, options);
  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    try { detail = (await response.json()).detail || detail; } catch {}
    throw new Error(detail);
  }
  return response;
}

function currentSource() { return $('#source').value; }
function currentDb() { return currentSource() === 'ncbi' ? $('#database').value : ''; }
function params(record, extra = {}) {
  return new URLSearchParams({ db: record.db || '', ...extra });
}
function recordPath(record) {
  return `/api/records/${encodeURIComponent(record.source)}/${encodeURIComponent(record.id)}`;
}
function updateSource() {
  state.searchSeq++;
  state.resultLimit = 15;
  $('#result-count').textContent = '—';
  $('#results').replaceChildren(node('div', 'empty-results', 'Search a source to see matching records here.'));
  $('#more-results').hidden = true;
  $('#db-field').hidden = currentSource() !== 'ncbi';
  $('#reviewed-field').hidden = currentSource() !== 'uniprot';
  $('#query').placeholder = currentSource() === 'pdb' ? 'Try hemoglobin or 1HHO' : currentSource() === 'ncbi' ? 'Try BRCA1 or NM_007294' : 'Try hemoglobin or P68871';
}

async function searchRecords(limit = 15) {
  const query = $('#query').value.trim();
  if (!query) return;
  const seq = ++state.searchSeq;
  state.resultLimit = limit;
  $('#results').replaceChildren(node('div', 'empty-results', 'Searching source…'));
  $('#result-count').textContent = 'Loading';
  $('#more-results').hidden = true;
  const request = new URLSearchParams({ q: query, source: currentSource(), db: currentDb(), limit: String(limit), reviewed: String($('#reviewed').checked) });
  try {
    const data = await (await api(`/api/search?${request}`)).json();
    if (seq !== state.searchSeq) return;
    $('#result-count').textContent = data.total == null ? `Showing ${data.results.length}` : `Showing ${data.results.length} of ${data.total}`;
    $('#more-results').hidden = !data.has_more || limit >= 50;
    $('#results').replaceChildren();
    if (!data.results.length) $('#results').append(node('div', 'empty-results', 'No records found. Try another term or source.'));
    for (const row of data.results) {
      const button = node('button', 'result');
      button.type = 'button';
      append(button, node('strong', '', row.title), node('span', '', row.subtitle), node('small', '', `${row.source.toUpperCase()} · ${row.id}${row.reviewed ? ' · Reviewed' : ''}`));
      button.addEventListener('click', () => openRecord(row.source, row.id, row.db));
      $('#results').append(button);
    }
  } catch (error) {
    if (seq !== state.searchSeq) return;
    $('#result-count').textContent = 'Error';
    $('#results').replaceChildren(node('div', 'empty-results', error.message));
    message(error.message);
  }
}

async function openRecord(source, id, db = '') {
  const seq = ++state.openSeq;
  $('#record-empty').hidden = true;
  $('#record-detail').hidden = true;
  message(`Loading ${source.toUpperCase()} record ${id}…`);
  try {
    const record = await (await api(`/api/records/${encodeURIComponent(source)}/${encodeURIComponent(id)}?${new URLSearchParams({ db })}`)).json();
    if (seq !== state.openSeq) return;
    state.record = record;
    state.raw = '';
    state.tab = 'overview';
    renderRecord();
    $('#message').hidden = true;
    $('#record').focus();
  } catch (error) {
    if (seq !== state.openSeq) return;
    $('#record-empty').hidden = false;
    message(error.message);
  }
}

function renderRecord() {
  const record = state.record;
  if (!record) return;
  $('#record-empty').hidden = true;
  $('#record-detail').hidden = false;
  $('#record-source').textContent = record.source === 'local' ? 'LOCAL FILE' : record.source === 'ncbi' ? `NCBI ${record.db}`.toUpperCase() : record.source === 'pdb' ? 'RCSB PDB' : 'UNIPROTKB';
  $('#record-kicker').textContent = record.source === 'local' ? 'LOCAL FILE' : record.source === 'pdb' ? 'STRUCTURAL RECORD' : record.db === 'pubmed' ? 'LITERATURE RECORD' : record.db === 'gene' ? 'GENE RECORD' : 'BIOLOGICAL RECORD';
  $('#record-title').textContent = safe(record.title);
  $('#record-id').textContent = `${record.source.toUpperCase()} ${record.db ? `${record.db} · ` : '· '}${record.id}`;
  $('#source-link').href = record.source_url || '#';
  $('#source-link').hidden = !record.source_url;
  $('#add-item').hidden = record.source === 'local';
  $('#structure-controls').hidden = !(record.source === 'pdb' || record.localStructure);
  $('#representation-controls').hidden = !(record.source === 'pdb' || record.localStructure);
  $('#measurement-tools').hidden = !(record.source === 'pdb' || record.localStructure);
  $('.download-strip').hidden = record.source === 'local';
  $('#format').replaceChildren(...record.formats.map(fmt => { const option = node('option', '', fmt.toUpperCase()); option.value = fmt; return option; }));
  $('#format').value = record.default_format;
  $('#feature-count').textContent = record.features?.length || '';
  $('#link-count').textContent = record.links?.length || '';
  document.querySelectorAll('.tab').forEach(button => {
    const active = button.dataset.tab === state.tab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  renderTab();
  renderVisual();
}

function renderTab() {
  const area = $('#tab-content');
  const record = state.record;
  area.replaceChildren();
  if (!record) return;
  if (state.tab === 'overview') {
    const list = node('dl', 'summary-grid');
    const preferred = record.source === 'uniprot' ? ['protein_name', 'gene', 'organism', 'length', 'mass', 'reviewed', 'function', 'keywords'] :
      record.source === 'pdb' ? ['method', 'resolution', 'r_free', 'r_work', 'polymer_count', 'atom_count', 'deposition_date'] :
      ['Title', 'Name', 'Description', 'Organism', 'Length', 'Status', 'Author', 'Source'];
    const entries = Object.entries(record.summary || {});
    entries.sort((a, b) => (preferred.indexOf(a[0]) < 0 ? 100 : preferred.indexOf(a[0])) - (preferred.indexOf(b[0]) < 0 ? 100 : preferred.indexOf(b[0])));
    for (const [key, value] of entries.slice(0, 22)) {
      if (value == null || value === '') continue;
      const fact = node('div', 'fact');
      append(fact, node('dt', '', key.replaceAll('_', ' ')), node('dd', '', Array.isArray(value) ? value.join(', ') : safe(value)));
      list.append(fact);
    }
    area.append(list);
    const when = node('p', 'gc-label', `Source: ${record.source_url || 'local file'} · Retrieved ${record.retrieved_at ? new Date(record.retrieved_at).toLocaleString() : 'locally'}`);
    area.append(when);
  } else if (state.tab === 'annotations') {
    if (!record.features?.length) area.append(node('p', 'empty-results', 'This record has no feature annotations available in Nodivium.'));
    for (const feature of (record.features || []).slice(0, 200)) {
      const item = node('div', 'annotation');
      append(item, node('strong', '', feature.type || 'Feature'), node('span', '', `${feature.start ?? '?'}–${feature.end ?? '?'}  ${feature.description || ''}`));
      area.append(item);
    }
  } else if (state.tab === 'connections') {
    if (!record.links?.length) area.append(node('p', 'empty-results', 'No supported cross-references were reported for this record.'));
    for (const link of (record.links || []).slice(0, 100)) {
      const item = node('a', 'connection');
      item.href = link.url;
      item.target = '_blank';
      item.rel = 'noopener noreferrer';
      append(item, node('strong', '', `${link.database} · ${link.id}`), node('span', '', 'Open linked source record ↗'));
      area.append(item);
    }
  } else if (state.tab === 'raw') {
    const button = node('button', 'secondary-button', 'Load original content');
    button.type = 'button';
    const pre = node('pre', 'raw', state.raw || 'Original source content loads on request.');
    button.addEventListener('click', async () => {
      if (record.source === 'local') { pre.textContent = record.raw || ''; return; }
      button.disabled = true; pre.textContent = 'Loading…';
      try {
        const result = await (await api(`${recordPath(record)}/content?${params(record, { fmt: $('#format').value })}`)).json();
        state.raw = result.content;
        pre.textContent = result.content;
      } catch (error) { pre.textContent = error.message; }
      button.disabled = false;
    });
    append(area, button, pre);
  }
}

async function renderVisual() {
  const record = state.record;
  const area = $('#visual');
  state.measureSubscription?.unsubscribe?.();
  state.measureSelectionSubscription?.unsubscribe?.();
  state.measureModeSubscription?.unsubscribe?.();
  state.measureSubscription = null;
  state.measureSelectionSubscription = null;
  state.measureModeSubscription = null;
  state.viewer?.plugin?.dispose?.();
  state.viewer = null;
  state.viewerIsolation = null;
  state.viewerHiddenResidues = false;
  updateMeasurementControls();
  $('#representation-options').replaceChildren(node('p', 'empty-results', 'Load a structure to choose representations.'));
  area.replaceChildren();
  area.className = '';
  $('#expand-visual').hidden = !record || (record.db === 'pubmed' || record.db === 'gene');
  if (!record) return;
  if (record.source === 'pdb' || record.localStructure) {
    $('#inspect-caption').textContent = 'Rotate, zoom, and inspect the 3D structure.';
    const host = node('div', 'mol-host');
    area.append(host);
    try {
      await loadMolstar();
      if (state.record !== record) return;
      const viewer = await window.molstar.Viewer.create(host, { layoutIsExpanded: false, layoutShowControls: false, layoutShowSequence: false, layoutShowLog: false, layoutShowLeftPanel: false, layoutShowRemoteState: false, collapseRightPanel: true, viewportShowExpand: false, viewportShowControls: false, viewportShowSettings: false, viewportShowSelectionMode: false, viewportShowAnimation: false, viewportShowTrajectoryControls: false });
      if (state.record !== record) { viewer.plugin?.dispose?.(); return; }
      state.viewer = viewer;
      simplifyViewer(viewer.plugin);
      state.measureSubscription = viewer.plugin.managers.structure.selection.events.additionsHistoryUpdated.subscribe(() => updateMeasurementControls());
      state.measureSelectionSubscription = viewer.plugin.managers.structure.selection.events.changed.subscribe(() => updateMeasurementControls());
      state.measureModeSubscription = viewer.plugin.behaviors.interaction.selectionMode.subscribe(() => updateMeasurementControls());
      updateMeasurementControls();
      applyViewerTheme();
      if (record.localStructure) await viewer.loadStructureFromData(record.raw, record.localStructure === 'cif' ? 'mmcif' : 'pdb');
      else await viewer.loadStructureFromUrl(`${recordPath(record)}/download?${params(record, { fmt: 'cif' })}`, 'mmcif', false);
      if (state.viewer === viewer) {
        simplifyViewer(viewer.plugin);
        try { await applyViewerColors(viewer); }
        catch (error) { message(`Structure loaded, but custom colors could not be applied: ${error.message}`); }
        renderRepresentationControls(viewer.plugin);
        requestAnimationFrame(() => fitStructure(viewer.plugin));
      }
    } catch (error) { host.replaceChildren(node('p', 'empty-results', `3D viewer could not load: ${error.message}`)); }
  } else if (record.sequence) {
    $('#inspect-caption').textContent = record.source === 'local' ? 'Inspect a sequence from your file. Nothing is uploaded.' : 'Sequence and reported feature positions.';
    if (record.localRecords?.length > 1) {
      const picker = document.createElement('select');
      picker.className = 'local-record-picker';
      picker.setAttribute('aria-label', 'Choose a sequence from this FASTA file');
      picker.replaceChildren(...record.localRecords.map((entry, index) => {
        const option = node('option', '', `${index + 1}. ${entry.id} · ${entry.sequence.length.toLocaleString()} positions`);
        option.value = String(index);
        return option;
      }));
      picker.value = String(record.localIndex);
      picker.addEventListener('change', () => selectLocalSequence(Number(picker.value)));
      area.append(picker);
    }
    if (record.source === 'local') {
      const type = document.createElement('select');
      type.className = 'local-type-picker';
      type.setAttribute('aria-label', 'Interpret this sequence as');
      for (const value of ['nucleotide', 'protein']) {
        const option = node('option', '', value === 'nucleotide' ? 'Nucleotide sequence' : 'Protein sequence');
        option.value = value; type.append(option);
      }
      type.value = record.localSequence;
      type.addEventListener('change', () => {
        record.localRecords[record.localIndex].type = type.value;
        record.localSequence = record.db = type.value;
        record.summary.Type = type.value === 'nucleotide' ? 'Nucleotide' : 'Protein';
        renderRecord();
      });
      area.append(type);
    }
    area.append(sequenceView(record));
  } else if (record.db === 'nucleotide' || record.db === 'protein') {
    $('#inspect-caption').textContent = 'Loading the source sequence for inspection.';
    area.append(node('p', 'empty-results', 'Loading sequence…'));
    try {
      const data = await (await api(`${recordPath(record)}/content?${params(record, { fmt: 'fasta' })}`)).json();
      if (state.record !== record) return;
      record.sequence = data.content.split(/\r?\n/).filter(line => !line.startsWith('>')).join('').replace(/\s/g, '');
      area.replaceChildren(sequenceView(record));
      try {
        const annotationData = await (await api(`${recordPath(record)}/annotations?${params(record)}`)).json();
        if (state.record !== record) return;
        record.features = annotationData.features;
        $('#feature-count').textContent = record.features.length || '';
        area.replaceChildren(sequenceView(record));
        if (state.tab === 'annotations') renderTab();
      } catch { /* Sequence inspection remains available when annotations are unavailable. */ }
    } catch (error) { area.replaceChildren(node('p', 'empty-results', error.message)); }
  } else if (record.db === 'pubmed') {
    $('#inspect-caption').textContent = 'Citation and abstract from PubMed.';
    area.append(literatureView(record));
  } else if (record.db === 'gene') {
    $('#inspect-caption').textContent = 'Source-reported genomic location and strand.';
    area.append(geneView(record));
  } else {
    $('#inspect-caption').textContent = 'Only source-reported visuals are shown.';
    area.append(node('p', 'empty-results', 'No sequence or structure is available for this record.'));
  }
}

function literatureView(record) {
  const summary = record.summary || {};
  const card = node('div', 'literature-card');
  append(card, node('p', 'eyebrow', `PUBMED · PMID ${record.id}`), node('h3', '', record.title),
    node('p', 'literature-authors', summary.Authors || 'Authors not reported'),
    node('p', 'literature-journal', [summary.Journal, summary.Published, summary.Volume ? `${summary.Volume}${summary.Issue ? `(${summary.Issue})` : ''}` : '', summary.Pages].filter(Boolean).join(' · ')));
  const facts = node('div', 'literature-facts');
  for (const [label, value] of [['Journal', summary.Journal], ['Published', summary.Published], ['Volume / issue', [summary.Volume, summary.Issue ? `(${summary.Issue})` : ''].join('')], ['Pages', summary.Pages]]) {
    if (value) append(facts, node('span', '', label), node('strong', '', value));
  }
  card.append(facts);
  const doi = record.links?.find(link => link.database === 'DOI');
  const actions = node('div', 'literature-actions');
  if (doi) {
    const link = node('a', '', `DOI ${doi.id} ↗`);
    link.href = doi.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
    actions.append(link);
  }
  const source = node('a', '', 'Open PubMed ↗'); source.href = record.source_url; source.target = '_blank'; source.rel = 'noopener noreferrer'; actions.append(source);
  const copy = node('button', 'secondary-button', 'Copy citation'); copy.type = 'button';
  copy.addEventListener('click', async () => {
    const citation = [summary.Authors, record.title, summary.Journal, summary.Published, summary.Volume ? `${summary.Volume}${summary.Issue ? `(${summary.Issue})` : ''}` : '', summary.Pages, doi?.id ? `doi:${doi.id}` : '', `PMID:${record.id}`].filter(Boolean).join('. ');
    try { await navigator.clipboard.writeText(citation); message('Citation copied.'); }
    catch { message('Clipboard unavailable in this browser.'); }
  }); actions.append(copy); card.append(actions);
  const button = node('button', 'secondary-button', 'Load PubMed abstract view'); button.type = 'button';
  const abstract = node('pre', 'literature-abstract'); abstract.hidden = true;
  button.addEventListener('click', async () => {
    abstract.hidden = false;
    button.disabled = true; abstract.textContent = 'Loading from PubMed…';
    try {
      const data = await (await api(`${recordPath(record)}/content?${params(record, { fmt: 'abstract' })}`)).json();
      abstract.textContent = data.content || 'No abstract text was returned.';
    } catch (error) { abstract.textContent = error.message; }
    button.disabled = false;
  });
  card.append(button, abstract);
  return card;
}

function geneView(record) {
  const wrap = node('div', 'gene-view');
  append(wrap, node('p', 'eyebrow', `NCBI GENE · ${record.id}`), node('h3', '', record.summary?.Name || record.title));
  if (record.summary?.Description) wrap.append(node('p', '', record.summary.Description));
  if (record.summary?.Organism) wrap.append(node('p', 'gc-label', `${record.summary.Organism}${record.summary.Chromosome ? ` · chromosome ${record.summary.Chromosome}` : ''}`));
  if (record.summary?.Summary) {
    const detail = document.createElement('details'); detail.className = 'gene-summary';
    append(detail, node('summary', '', 'Read NCBI gene summary'), node('p', '', record.summary.Summary)); wrap.append(detail);
  }
  const source = node('a', 'gene-source', 'Open NCBI Gene ↗'); source.href = record.source_url; source.target = '_blank'; source.rel = 'noopener noreferrer'; wrap.append(source);
  if (!record.genomic_locations?.length) {
    wrap.append(node('p', 'empty-results', 'NCBI did not provide genomic coordinates for this record.'));
    return wrap;
  }
  for (const location of record.genomic_locations.slice(0, 8)) {
    const card = node('div', 'gene-location');
    const heading = node('div', 'gene-location-heading');
    append(heading, node('strong', '', location.accession), node('b', 'gene-strand', `${location.strand === '-' ? '← Reverse' : 'Forward →'} strand`));
    card.append(heading);
    card.append(node('span', 'gene-coordinates', `${location.start.toLocaleString()}–${location.end.toLocaleString()} · ${(location.end - location.start + 1).toLocaleString()} bases`));
    const track = node('div', `gene-track ${location.strand === '-' ? 'reverse' : 'forward'}`);
    track.append(node('div', '', location.strand === '-' ? '←' : '→'));
    card.append(track);
    const axis = node('div', 'gene-axis');
    append(axis, node('span', '', location.start.toLocaleString()), node('span', '', location.end.toLocaleString()));
    card.append(axis);
    wrap.append(card);
  }
  wrap.append(node('p', 'gc-label', 'Orientation diagram only; the bar is not a scaled chromosome map. Coordinates are 1-based inclusive.'));
  return wrap;
}

function sequenceView(record) {
  const sequence = record.sequence.toUpperCase();
  const wrap = node('div', 'sequence-view');
  append(wrap, node('h3', '', `${sequence.length.toLocaleString()} ${record.db === 'nucleotide' ? 'bases' : 'residues'}`), node('p', '', `${record.source === 'local' ? 'Local' : 'Source'} sequence · positions are 1-based`));
  const dashboard = record.db === 'nucleotide' || record.localSequence === 'nucleotide'
    ? nucleotideDashboard(sequence) : proteinDashboard(sequence, record);
  wrap.append(dashboard);
  if (record.features?.length) {
    const track = node('div', 'feature-track');
    track.append(node('span'));
    for (const feature of record.features.slice(0, 100)) {
      if (!Number.isFinite(feature.start) || !Number.isFinite(feature.end)) continue;
      const segment = node('button', 'feature-segment');
      segment.type = 'button';
      segment.style.left = `${Math.max(0, (feature.start - 1) / sequence.length * 100)}%`;
      segment.style.width = `${Math.max(.5, (feature.end - feature.start + 1) / sequence.length * 100)}%`;
      segment.title = `${feature.type}: ${feature.start}–${feature.end}`;
      segment.setAttribute('aria-label', `Inspect ${segment.title}`);
      segment.addEventListener('click', () => dashboard.focusRange?.(feature.start, feature.end));
      track.append(segment);
    }
    wrap.append(track, node('p', 'gc-label', `${record.features.length} reported features · open Annotations for details`));
  }
  return wrap;
}

function nucleotideDashboard(sequence) {
  const stats = window.NodiviumSequence.nucleotide(sequence);
  const dashboard = node('div', 'nucleotide-dashboard');
  const cards = node('div', 'nucleotide-metrics');
  for (const [label, value] of [
    ['GC content', stats.gcPercent == null ? '—' : `${stats.gcPercent.toFixed(1)}%`],
    ['A / T(U)', `${stats.counts.A.toLocaleString()} / ${(stats.counts.T + stats.counts.U).toLocaleString()}`],
    ['G / C', `${stats.counts.G.toLocaleString()} / ${stats.counts.C.toLocaleString()}`],
    ['Ambiguous / gaps', stats.ambiguous.toLocaleString()],
  ]) {
    const card = node('div', 'nucleotide-metric');
    append(card, node('strong', '', value), node('span', '', label));
    cards.append(card);
  }
  dashboard.append(cards);
  const composition = node('div', 'base-composition');
  for (const [base, count] of [['A', stats.counts.A], ['C', stats.counts.C], ['G', stats.counts.G], ['T/U', stats.counts.T + stats.counts.U], ['Other', stats.ambiguous]]) {
    if (!count) continue;
    const segment = node('div', `base-${base === 'T/U' ? 'tu' : base.toLowerCase()}`);
    segment.style.width = `${count / stats.length * 100}%`;
    segment.title = `${base}: ${count.toLocaleString()} (${(count / stats.length * 100).toFixed(1)}%)`;
    composition.append(segment);
  }
  dashboard.append(node('h4', '', 'Base composition'), composition,
    node('p', 'gc-label', 'A · mint   C · blue   G · violet   T/U · amber   ambiguous or gaps · grey'));

  const range = node('div', 'sequence-range');
  const start = document.createElement('input');
  const end = document.createElement('input');
  for (const input of [start, end]) { input.type = 'number'; input.min = '1'; input.max = String(stats.length); input.step = '1'; }
  start.value = '1'; end.value = String(Math.min(stats.length, 500));
  start.setAttribute('aria-label', 'First sequence position');
  end.setAttribute('aria-label', 'Last sequence position');
  const apply = node('button', 'secondary-button', 'Inspect range'); apply.type = 'button';
  append(range, node('span', '', 'Positions'), start, node('span', '', 'to'), end, apply);
  const detail = node('div', 'range-detail');
  const renderRange = () => {
    const from = Math.max(1, Math.min(stats.length, Math.trunc(Number(start.value) || 1)));
    const to = Math.max(from, Math.min(stats.length, Math.trunc(Number(end.value) || from)));
    start.value = String(from); end.value = String(to);
    const selected = sequence.slice(from - 1, Math.min(to, from + 4999));
    const selectedStats = window.NodiviumSequence.nucleotide(selected);
    detail.replaceChildren(node('p', 'gc-label', `${from.toLocaleString()}–${to.toLocaleString()} · ${(to - from + 1).toLocaleString()} bases · GC ${selectedStats.gcPercent == null ? 'not available' : `${selectedStats.gcPercent.toFixed(1)}%`} in the displayed range`));
    const lines = node('div', 'sequence-lines');
    for (let i = 0; i < selected.length; i += 50) lines.append(node('div', '', `${String(from + i).padStart(6)}  ${selected.slice(i, i + 50)}`));
    detail.append(lines);
    if (to - from + 1 > 5000) detail.append(node('p', 'gc-label', 'Displaying the first 5,000 selected positions. Narrow the range to inspect later positions.'));
  };
  apply.addEventListener('click', renderRange);
  for (const input of [start, end]) input.addEventListener('keydown', event => { if (event.key === 'Enter') renderRange(); });
  const chart = node('div', 'gc-chart');
  for (const window of stats.windows) {
    const bar = node('button', 'gc-window'); bar.type = 'button';
    bar.style.height = `${Math.max(4, window.percent ?? 4)}%`;
    bar.title = `Positions ${window.start}–${window.end}: ${window.percent == null ? 'no canonical bases' : `${window.percent.toFixed(1)}% GC`}`;
    bar.setAttribute('aria-label', `${bar.title}; inspect this range`);
    bar.addEventListener('click', () => { start.value = String(window.start); end.value = String(window.end); renderRange(); });
    chart.append(bar);
  }
  dashboard.append(node('h4', '', 'GC across the sequence'), node('p', 'gc-label', `Click a window to inspect its bases · ${stats.windows.length} windows · ambiguous bases excluded`), chart, range, detail);
  dashboard.focusRange = (from, to) => { start.value = String(from); end.value = String(to); renderRange(); detail.scrollIntoView?.({ block: 'nearest' }); };
  renderRange();
  return dashboard;
}

function proteinDashboard(sequence, record) {
  const stats = window.NodiviumSequence.protein(sequence);
  const dashboard = node('div', 'protein-dashboard');
  const cards = node('div', 'nucleotide-metrics');
  const top = stats.ranked.find(([, count]) => count > 0);
  for (const [label, value] of [
    ['Standard residues', stats.canonical.toLocaleString()],
    ['Other symbols', stats.other.toLocaleString()],
    ['Most common', top ? `${top[0]} · ${top[1].toLocaleString()}` : '—'],
    ['Source features', (record.features?.length || 0).toLocaleString()],
  ]) {
    const card = node('div', 'nucleotide-metric');
    append(card, node('strong', '', value), node('span', '', label)); cards.append(card);
  }
  dashboard.append(cards, node('h4', '', 'Amino acid composition'));
  const rows = node('div', 'amino-acid-composition');
  let highlighted = '';
  const range = node('div', 'sequence-range');
  const start = document.createElement('input'); const end = document.createElement('input');
  for (const input of [start, end]) { input.type = 'number'; input.min = '1'; input.max = String(stats.length); input.step = '1'; }
  start.value = '1'; end.value = String(Math.min(stats.length, 500));
  start.setAttribute('aria-label', 'First residue position'); end.setAttribute('aria-label', 'Last residue position');
  const apply = node('button', 'secondary-button', 'Inspect range'); apply.type = 'button';
  append(range, node('span', '', 'Residues'), start, node('span', '', 'to'), end, apply);
  const detail = node('div', 'range-detail');
  const renderRange = () => {
    const from = Math.max(1, Math.min(stats.length, Math.trunc(Number(start.value) || 1)));
    const to = Math.max(from, Math.min(stats.length, Math.trunc(Number(end.value) || from)));
    start.value = String(from); end.value = String(to);
    const selected = sequence.slice(from - 1, Math.min(to, from + 4999));
    const count = highlighted ? [...selected].filter(residue => residue === highlighted).length : 0;
    detail.replaceChildren(node('p', 'gc-label', `${from.toLocaleString()}–${to.toLocaleString()} · ${(to - from + 1).toLocaleString()} residues${highlighted ? ` · ${highlighted}: ${count} in displayed range` : ''}`));
    const lines = node('div', 'sequence-lines');
    for (let i = 0; i < selected.length; i += 50) {
      const row = node('div', '', `${String(from + i).padStart(6)}  `);
      const part = selected.slice(i, i + 50);
      if (highlighted) for (const residue of part) row.append(node('span', residue === highlighted ? 'residue-highlight' : '', residue));
      else row.append(document.createTextNode(part));
      lines.append(row);
    }
    detail.append(lines);
    if (to - from + 1 > 5000) detail.append(node('p', 'gc-label', 'Displaying the first 5,000 selected positions. Narrow the range to inspect later residues.'));
  };
  for (const [residue, count] of stats.ranked) {
    const row = node('button', 'amino-acid-row'); row.type = 'button';
    row.setAttribute('aria-label', `${residue}: ${count} residues; highlight in selected range`);
    const track = node('span', 'amino-acid-track');
    const fill = node('span', 'amino-acid-fill'); fill.style.width = `${top?.[1] ? count / top[1] * 100 : 0}%`; track.append(fill);
    append(row, node('strong', '', residue), track, node('span', '', `${count.toLocaleString()} · ${stats.length ? (count / stats.length * 100).toFixed(1) : '0.0'}%`));
    row.addEventListener('click', () => { highlighted = highlighted === residue ? '' : residue; rows.querySelectorAll('.amino-acid-row').forEach(button => button.classList.toggle('active', button === row && Boolean(highlighted))); renderRange(); });
    rows.append(row);
  }
  dashboard.append(node('p', 'gc-label', 'Select a residue to highlight its positions. Bars are scaled to the most common residue; percentages use total length. Nonstandard symbols are counted separately.'), rows, range, detail);
  apply.addEventListener('click', renderRange);
  for (const input of [start, end]) input.addEventListener('keydown', event => { if (event.key === 'Enter') renderRange(); });
  dashboard.focusRange = (from, to) => { start.value = String(from); end.value = String(to); renderRange(); detail.scrollIntoView?.({ block: 'nearest' }); };
  renderRange();
  return dashboard;
}

async function loadMolstar() {
  if (window.molstar) return;
  if (!loadMolstar.pending) loadMolstar.pending = new Promise((resolve, reject) => {
    const vendor = location.protocol === 'file:' ? '../nodivium/static/vendor/' : './vendor/';
    const style = document.createElement('link'); style.rel = 'stylesheet'; style.href = `${vendor}molstar.css`; document.head.append(style);
    const script = document.createElement('script'); script.src = `${vendor}molstar.js`; script.onload = resolve; script.onerror = () => reject(new Error('Bundled Mol* assets are unavailable.')); document.head.append(script);
  });
  await loadMolstar.pending;
}

function addCurrent() {
  const record = state.record;
  if (!record || record.source === 'local') return message('Local files are inspected in this browser and cannot be added to a source collection.');
  if (state.collection.length >= 25) return message('A collection can contain up to 25 records.');
  const item = { source: record.source, identifier: record.id, db: record.db || '', fmt: $('#format').value, formats: record.formats };
  if (state.collection.some(existing => JSON.stringify(existing) === JSON.stringify(item))) return message('That record and format is already in the collection.');
  state.collection.push(item);
  updateCollection();
  message(`${record.id} added to collection.`);
}

function updateCollection() {
  storage.set('nodivium-collection', JSON.stringify(state.collection));
  $('#collection-count').textContent = String(state.collection.length);
  const list = $('#collection-list'); list.replaceChildren();
  if (!state.collection.length) list.append(node('p', 'empty-results', 'Your collection is empty. Add records as you inspect them.'));
  state.collection.forEach((item, index) => {
    const row = node('div', 'collection-row');
    append(row, node('span', '', `${item.identifier} · ${item.source}${item.db ? ` ${item.db}` : ''}`));
    const formats = Array.isArray(item.formats) && item.formats.includes(item.fmt) ? item.formats : [item.fmt];
    const format = document.createElement('select');
    format.setAttribute('aria-label', `Export format for ${item.identifier}`);
    format.replaceChildren(...formats.map(value => { const option = node('option', '', value.toUpperCase()); option.value = value; return option; }));
    format.value = item.fmt;
    format.addEventListener('change', () => { item.fmt = format.value; updateCollection(); });
    row.append(format);
    const remove = node('button', '', '✕'); remove.type = 'button'; remove.setAttribute('aria-label', `Remove ${item.identifier}`); remove.addEventListener('click', () => { state.collection.splice(index, 1); updateCollection(); });
    row.append(remove); list.append(row);
  });
  $('#collection-export').disabled = !state.collection.length;
}

async function exportCollection() {
  if (!state.collection.length) return;
  const button = $('#collection-export'); button.disabled = true; button.textContent = 'Preparing ZIP…';
  try {
    const response = await api('/api/collections/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: state.collection }) });
    saveBlob(await response.blob(), 'nodivium-collection.zip');
    const failed = Number(response.headers.get('X-Nodivium-Failed') || 0);
    message(failed ? `Collection downloaded with ${failed} failed record(s); see manifest.json.` : 'Collection downloaded with manifest.json.');
  } catch (error) { message(error.message); }
  button.disabled = false; button.textContent = 'Download ZIP';
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function selectLocalSequence(index, shouldRender = true) {
  const record = state.record;
  if (!record?.localRecords?.[index]) return;
  const entry = record.localRecords[index];
  record.localIndex = index;
  record.id = entry.id;
  record.title = entry.description || entry.id;
  record.sequence = entry.sequence;
  record.db = record.localSequence = entry.type;
  record.summary = { File: record.localFile, Record: `${index + 1} of ${record.localRecords.length}`,
    Description: entry.description || '', Length: entry.sequence.length,
    Type: entry.type === 'nucleotide' ? 'Nucleotide' : 'Protein' };
  if (shouldRender) renderRecord();
}

async function inspectFile(file) {
  if (!file || file.size > 20_000_000) return message('Choose a file smaller than 20 MB for browser inspection.');
  const seq = ++state.openSeq;
  const name = file.name.toLowerCase();
  const raw = await file.text();
  if (seq !== state.openSeq) return;
  if (/\.(fasta|fa|faa|fna)$/.test(name)) {
    const records = window.NodiviumFasta.parse(raw);
    state.record = { source: 'local', db: '', id: '', title: '', summary: {}, sequence: '',
      localFile: file.name, localRecords: records, localIndex: 0, raw,
      formats: [], features: [], links: [], retrieved_at: null };
    selectLocalSequence(0, false);
  } else if (/\.(pdb|cif|mmcif)$/.test(name)) {
    const format = name.endsWith('.pdb') ? 'pdb' : 'cif';
    state.record = { source: 'local', db: '', id: file.name, title: file.name, summary: { file: file.name, size: `${file.size.toLocaleString()} bytes`, type: format.toUpperCase() },
      sequence: '', localStructure: format, raw, formats: [], features: [], links: [], retrieved_at: null };
  } else return message('Choose a FASTA, PDB, or mmCIF file.');
  state.tab = 'overview'; state.raw = raw;
  renderRecord();
  $('#add-item').hidden = true; $('.download-strip').hidden = true;
  $('#record').focus();
}

$('#source').addEventListener('change', updateSource);
$('#database').addEventListener('change', updateSource);
$('#reviewed').addEventListener('change', updateSource);
$('#search-form').addEventListener('submit', event => { event.preventDefault(); searchRecords(); });
$('#more-results').addEventListener('click', () => searchRecords(Math.min(state.resultLimit + 15, 50)));
$('#open-id').addEventListener('click', () => { const id = $('#query').value.trim(); if (id) openRecord(currentSource(), id, currentDb()); });
document.querySelectorAll('[data-example]').forEach(button => button.addEventListener('click', () => {
  $('#source').value = button.dataset.source; updateSource();
  if (button.dataset.db) $('#database').value = button.dataset.db;
  $('#query').value = button.dataset.example;
  if (button.dataset.db) searchRecords(); else openRecord(button.dataset.source, button.dataset.example);
}));
document.querySelectorAll('.tab').forEach(button => button.addEventListener('click', () => {
  state.tab = button.dataset.tab;
  document.querySelectorAll('.tab').forEach(tab => { tab.classList.toggle('active', tab === button); tab.setAttribute('aria-selected', String(tab === button)); });
  renderTab();
}));
$('#add-item').addEventListener('click', addCurrent);
$('#copy-id').addEventListener('click', async () => {
  if (!state.record) return;
  try {
    await navigator.clipboard.writeText(state.record.id);
    message(`Copied ${state.record.id} to clipboard.`);
  } catch { message('Clipboard access is unavailable here. Select the ID shown beneath the record title to copy it.'); }
});
$('#format').addEventListener('change', () => { state.raw = ''; if (state.tab === 'raw') renderTab(); });
$('#download').addEventListener('click', () => {
  const record = state.record; if (!record || record.source === 'local') return;
  window.location.href = `${recordPath(record)}/download?${params(record, { fmt: $('#format').value })}`;
});
$('#local-file').addEventListener('change', event => { inspectFile(event.target.files[0]).catch(error => message(error.message)); event.target.value = ''; });
$('#collection-toggle').addEventListener('click', () => $('#collection-dialog').showModal());
$('#collection-close').addEventListener('click', () => $('#collection-dialog').close());
$('#collection-clear').addEventListener('click', () => { state.collection = []; updateCollection(); });
$('#collection-export').addEventListener('click', exportCollection);
$('#theme-toggle').addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme; storage.set('nodivium-theme', theme);
  updateThemeButton();
  applyViewerTheme();
});
for (const [part, id] of [['bg', 'viewer-bg'], ['polymer', 'viewer-polymer'], ['ligand', 'viewer-ligand']]) {
  const input = $(`#${id}`);
  input.value = state.viewerColors[part];
  input.addEventListener('input', () => {
    state.viewerColors[part] = input.value;
    storage.set(`nodivium-viewer-${part}`, input.value);
    if (part === 'bg') applyViewerTheme();
    else {
      state.viewerColorMode = 'custom';
      storage.set('nodivium-viewer-color-mode', 'custom');
      applyViewerColors().catch(error => message(`Could not recolor the structure: ${error.message}`));
    }
  });
}
$('#viewer-reset').addEventListener('click', () => {
  state.viewerColorMode = 'source';
  storage.set('nodivium-viewer-color-mode', 'source');
  for (const part of ['bg', 'polymer', 'ligand']) {
    state.viewerColors[part] = viewerDefaults[part];
    storage.set(`nodivium-viewer-${part}`, viewerDefaults[part]);
    $(`#viewer-${part}`).value = viewerDefaults[part];
  }
  applyViewerTheme();
  resetViewerColors().catch(error => message(`Could not reset structure colors: ${error.message}`));
});
for (const [id, cssVar, fallback] of [['inspector-width', '--inspector-width', 350], ['inspector-height', '--inspector-height', 420]]) {
  const input = $(`#${id}`);
  const saved = Number(storage.get(`nodivium-${id}`));
  input.value = Number.isFinite(saved) && saved >= Number(input.min) && saved <= Number(input.max) ? String(saved) : String(fallback);
  document.documentElement.style.setProperty(cssVar, `${input.value}px`);
  input.addEventListener('input', () => {
    document.documentElement.style.setProperty(cssVar, `${input.value}px`);
    storage.set(`nodivium-${id}`, input.value);
    window.dispatchEvent(new Event('resize'));
  });
}
function updateThemeButton() {
  const dark = document.documentElement.dataset.theme === 'dark';
  $('#theme-toggle').textContent = dark ? '☀ Light mode' : '☾ Dark mode';
  $('#theme-toggle').setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
  $('meta[name="theme-color"]').content = dark ? '#0B181A' : '#F7F7F2';
}
function simplifyViewer(plugin) {
  if (!plugin?.layout) return;
  plugin.layout.updateProps({ showControls: false,
    regionState: { top: 'hidden', bottom: 'hidden', left: 'hidden', right: 'hidden' } });
}
const representationParts = [
  { id: 'polymer', label: 'Protein & nucleic acid', tags: ['static-polymer', 'selection-protein', 'selection-nucleic'] },
  { id: 'ligand', label: 'Ligands & modified residues', tags: ['static-ligand', 'static-non-standard'] },
  { id: 'carbohydrate', label: 'Carbohydrates', tags: ['static-branched'] },
  { id: 'ion', label: 'Ions', tags: ['static-ion'] },
  { id: 'water', label: 'Water', tags: ['static-water'] },
  { id: 'lipid', label: 'Lipids', tags: ['static-lipid'] },
  { id: 'coarse', label: 'Coarse particles', tags: ['static-coarse'] },
];
function representationGroups(plugin) {
  const groups = plugin?.managers?.structure?.hierarchy?.currentComponentGroups || [];
  const result = representationParts.map(part => ({ ...part,
    groups: groups.filter(group => group.some(component => part.tags.some(tag => component.key?.includes(tag)))) }));
  const named = new Set(result.flatMap(part => part.groups));
  result.push({ id: 'other', label: 'Other components', groups: groups.filter(group => !named.has(group)) });
  return result.filter(part => part.groups.length);
}
function renderRepresentationControls(plugin = state.viewer?.plugin) {
  const area = $('#representation-options');
  area.replaceChildren();
  if (!plugin) return;
  if (state.viewerIsolation?.plugin === plugin) return;
  const registry = plugin.representation.structure.registry;
  for (const part of representationGroups(plugin)) {
    const components = part.groups.flat();
    const applicable = components.map(component => new Set(registry.getApplicableTypes(component.cell.obj?.data).map(([name]) => name)));
    const options = registry.types.filter(([name]) => applicable.every(types => types.has(name)));
    if (!options.length) continue;
    const types = new Set(components.flatMap(component => component.representations.map(repr => repr.cell.transform.params?.type?.name)).filter(Boolean));
    const select = document.createElement('select');
    select.setAttribute('aria-label', `${part.label} representation`);
    if (types.size !== 1 || !options.some(([name]) => types.has(name))) {
      const mixed = node('option', '', 'Mixed / as loaded');
      mixed.value = '';
      select.append(mixed);
    }
    for (const [name, label] of options) {
      const option = node('option', '', label);
      option.value = name;
      select.append(option);
    }
    select.value = types.size === 1 && options.some(([name]) => types.has(name)) ? [...types][0] : '';
    select.addEventListener('change', async () => {
      const type = select.value;
      if (!type) return;
      area.querySelectorAll('select').forEach(input => { input.disabled = true; });
      try {
        await changeRepresentation(plugin, part, type);
        if (state.viewer?.plugin === plugin) renderRepresentationControls(plugin);
      } catch (error) {
        message(`Could not change ${part.label.toLowerCase()} representation: ${error.message}`);
        if (state.viewer?.plugin === plugin) renderRepresentationControls(plugin);
      }
    });
    const label = node('label', '', part.label);
    label.append(select);
    const visibility = node('label', 'component-visibility', 'Show');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.setAttribute('aria-label', `Show ${part.label.toLowerCase()}`);
    checkbox.checked = components.every(component => !component.cell.state.isHidden);
    checkbox.indeterminate = components.some(component => component.cell.state.isHidden) && components.some(component => !component.cell.state.isHidden);
    checkbox.addEventListener('change', () => {
      if (state.viewer?.plugin !== plugin) return;
      plugin.managers.structure.hierarchy.toggleVisibility(components, checkbox.checked ? 'show' : 'hide');
      renderRepresentationControls(plugin);
    });
    visibility.prepend(checkbox);
    const row = node('div', 'representation-row');
    row.append(label, visibility);
    area.append(row);
  }
  if (!area.childElementCount) area.append(node('p', 'empty-results', 'No separate structure components were found.'));
}
async function changeRepresentation(plugin, part, type) {
  if (state.viewer?.plugin !== plugin) return;
  const registry = plugin.representation.structure.registry;
  const components = part.groups.flat();
  if (!components.length || components.some(component => !registry.getApplicableTypes(component.cell.obj?.data).some(([name]) => name === type))) return;
  const previous = components.map(component => ({ component,
    color: component.representations[0]?.cell.transform.params?.colorTheme }));
  await plugin.dataTransaction(async () => {
    await plugin.managers.structure.component.removeRepresentations(components);
    for (const { component, color } of previous) {
      await plugin.builders.structure.representation.addRepresentation(component.cell, {
        type, color: color?.name, colorParams: color?.params
      });
    }
  }, { canUndo: `Change ${part.label} representation`, rethrowErrors: true });
  if (state.viewer?.plugin === plugin) await applyViewerColors(state.viewer);
}
function fitStructure(plugin = state.viewer?.plugin) {
  if (!plugin?.canvas3d) return;
  plugin.handleResize();
  plugin.managers.camera.focusObject({ durationMs: 250 });
}
function applyViewerTheme() {
  const color = state.viewerColors.bg;
  document.documentElement.style.setProperty('--canvas-bg', color);
  if (/^#[0-9a-fA-F]{6}$/.test(color)) {
    state.viewer?.plugin?.canvas3d?.setProps({ renderer: { backgroundColor: Number.parseInt(color.slice(1), 16) } });
  }
}
async function applyViewerColors(viewer = state.viewer) {
  if (!viewer?.plugin?.managers?.structure || state.viewerColorMode !== 'custom') return;
  const manager = viewer.plugin.managers.structure;
  const groups = manager.hierarchy.currentComponentGroups;
  for (const [part, matches] of [['polymer', ['static-polymer']], ['ligand', ['static-ligand', 'static-non-standard', 'static-ion']]]) {
    const selected = groups.filter(group => group.some(component => matches.some(match => component.key?.includes(match))));
    const color = Number.parseInt(state.viewerColors[part].slice(1), 16);
    for (const group of selected) await manager.component.updateRepresentationsTheme(group, { color: 'uniform', colorParams: { value: color } });
  }
}
async function resetViewerColors(viewer = state.viewer) {
  if (!viewer?.plugin?.managers?.structure) return;
  const manager = viewer.plugin.managers.structure;
  for (const group of manager.hierarchy.currentComponentGroups) {
    if (group.some(component => ['static-polymer', 'static-ligand', 'static-non-standard', 'static-ion'].some(match => component.key?.includes(match)))) {
      await manager.component.updateRepresentationsTheme(group, { color: 'default' });
    }
  }
}
function selectedResidues(plugin = state.viewer?.plugin) {
  const selection = plugin?.managers?.structure?.selection;
  return selection ? selection.additionsHistory.filter(entry => selection.has(entry.loci)) : [];
}
const currentResidueQuery = {
  label: 'Selected residues', referencesCurrent: true,
  async getSelection(plugin, _runtime, structure) {
    const selected = plugin.managers.structure.selection.getStructure(structure);
    return { kind: 'sequence', source: structure, structures: selected ? [selected] : [] };
  }
};
function allStructureComponents(plugin) {
  return (plugin.managers.structure.hierarchy.currentComponentGroups || []).flat();
}
async function restoreStructureView(plugin = state.viewer?.plugin) {
  if (!plugin || state.viewer?.plugin !== plugin) return;
  const isolation = state.viewerIsolation?.plugin === plugin ? state.viewerIsolation : null;
  if (isolation) {
    const added = allStructureComponents(plugin).filter(component => isolation.addedRefs.has(component.cell.transform.ref));
    if (added.length) await plugin.managers.structure.hierarchy.remove(added, true);
    for (const component of allStructureComponents(plugin)) {
      const hidden = isolation.originalVisibility.get(component.cell.transform.ref);
      if (hidden !== undefined) plugin.managers.structure.hierarchy.toggleVisibility([component], hidden ? 'hide' : 'show');
    }
    state.viewerIsolation = null;
  }
  if (state.viewerHiddenResidues) {
    const data = plugin.state.data;
    const update = data.build();
    for (const component of allStructureComponents(plugin)) {
      for (const repr of component.representations) {
        for (const ref of data.tree.children.get(repr.cell.transform.ref) || []) {
          const cell = data.cells.get(ref);
          if (cell?.transform.tags?.has('transparency-controls')) update.delete(ref);
        }
      }
    }
    await update.commit();
    state.viewerHiddenResidues = false;
  }
  $('#representation-controls').hidden = false;
  renderRepresentationControls(plugin);
  updateMeasurementControls();
  fitStructure(plugin);
}
function updateMeasurementControls() {
  const plugin = state.viewer?.plugin;
  const count = selectedResidues(plugin).length;
  $('#measurement-count').textContent = `${count} selected`;
  $('#measure-select').setAttribute('aria-pressed', String(Boolean(plugin?.selectionMode)));
  $('#measure-select').textContent = plugin?.selectionMode ? 'Finish selecting' : 'Select residues';
  $('#measure-label').disabled = count < 1;
  $('#measure-distance').disabled = count < 2;
  $('#measure-clear').disabled = count < 1;
  $('#hide-selected').disabled = count < 1 || Boolean(state.viewerIsolation);
  $('#isolate-selected').disabled = count < 1 || Boolean(state.viewerIsolation);
  $('#restore-view').disabled = !state.viewerIsolation && !state.viewerHiddenResidues;
}
$('#viewer-fit').addEventListener('click', () => fitStructure());
$('#measure-select').addEventListener('click', () => {
  const plugin = state.viewer?.plugin;
  if (!plugin) return message('Load a structure before selecting residues.');
  plugin.managers.interactivity.setProps({ granularity: 'residue' });
  plugin.selectionMode = !plugin.selectionMode;
  updateMeasurementControls();
});
$('#measure-label').addEventListener('click', async () => {
  const plugin = state.viewer?.plugin;
  const loci = selectedResidues(plugin);
  if (!loci?.length) return message('Select one residue first.');
  try { await plugin.managers.structure.measurement.addLabel(loci[0].loci); message('Residue label added.'); }
  catch (error) { message(`Could not label that selection: ${error.message}`); }
});
$('#measure-distance').addEventListener('click', async () => {
  const plugin = state.viewer?.plugin;
  const loci = selectedResidues(plugin);
  if (!loci || loci.length < 2) return message('Select two residues first.');
  try { await plugin.managers.structure.measurement.addDistance(loci[0].loci, loci[1].loci); message('Distance measurement added.'); }
  catch (error) { message(`Could not measure that distance: ${error.message}`); }
});
$('#measure-clear').addEventListener('click', () => {
  const plugin = state.viewer?.plugin;
  plugin?.managers?.interactivity?.lociSelects?.deselectAll();
  updateMeasurementControls();
});
$('#hide-selected').addEventListener('click', async () => {
  const plugin = state.viewer?.plugin;
  if (!plugin || !selectedResidues(plugin).length) return;
  try {
    await plugin.managers.structure.component.applyTheme({
      selection: currentResidueQuery, action: { name: 'transparency', params: { value: 1 } }, representations: []
    }, plugin.managers.structure.hierarchy.current.structures);
    state.viewerHiddenResidues = true;
    plugin.selectionMode = false;
    plugin.managers.interactivity.lociSelects.deselectAll();
    updateMeasurementControls();
    message('Selected residues hidden. Use Restore full view to show them again.');
  } catch (error) { message(`Could not hide selected residues: ${error.message}`); }
});
$('#isolate-selected').addEventListener('click', async () => {
  const plugin = state.viewer?.plugin;
  if (!plugin || !selectedResidues(plugin).length || state.viewerIsolation) return;
  const original = allStructureComponents(plugin);
  const originalVisibility = new Map(original.map(component => [component.cell.transform.ref, component.cell.state.isHidden]));
  try {
    await plugin.managers.structure.component.add({
      selection: currentResidueQuery, representation: 'ball-and-stick',
      options: { checkExisting: false, label: 'Selected residues' }
    }, plugin.managers.structure.hierarchy.current.structures);
    const added = allStructureComponents(plugin).filter(component => !originalVisibility.has(component.cell.transform.ref));
    if (!added.length) throw new Error('No selected residue component was created.');
    for (const component of original) plugin.managers.structure.hierarchy.toggleVisibility([component], 'hide');
    state.viewerIsolation = { plugin, originalVisibility, addedRefs: new Set(added.map(component => component.cell.transform.ref)) };
    plugin.selectionMode = false;
    plugin.managers.interactivity.lociSelects.deselectAll();
    $('#representation-controls').hidden = true;
    updateMeasurementControls();
    fitStructure(plugin);
    message('Showing selected residues only. Use Restore full view to return.');
  } catch (error) { message(`Could not isolate selected residues: ${error.message}`); }
});
$('#restore-view').addEventListener('click', () => {
  restoreStructureView().catch(error => message(`Could not restore the structure: ${error.message}`));
});
$('#expand-visual').addEventListener('click', () => {
  const expanded = $('.inspect-panel').classList.toggle('expanded');
  $('#expand-visual').textContent = expanded ? 'Close ✕' : 'Expand ↗';
  $('#expand-visual').setAttribute('aria-expanded', String(expanded));
  window.dispatchEvent(new Event('resize'));
  if (!expanded && state.viewer?.plugin) {
    const plugin = state.viewer.plugin;
    plugin.selectionMode = false;
    plugin.managers.interactivity.lociSelects.deselectAll();
    simplifyViewer(plugin);
    setTimeout(() => {
      if (!$('.inspect-panel').classList.contains('expanded') && state.viewer?.plugin === plugin) fitStructure(plugin);
    }, 220);
  }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && $('.inspect-panel').classList.contains('expanded')) $('#expand-visual').click();
});
document.documentElement.dataset.theme = storage.get('nodivium-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
updateThemeButton();
try {
  const saved = JSON.parse(storage.get('nodivium-collection') || '[]');
  if (Array.isArray(saved)) state.collection = saved.filter(item => item && typeof item.identifier === 'string' && typeof item.source === 'string').slice(0, 25);
} catch { /* A damaged browser preference should not block the workspace. */ }
updateSource(); updateCollection();
if (location.protocol === 'file:') {
  const banner = node('div', 'preview-banner', 'Layout preview · Local FASTA/PDB/mmCIF inspection and theme switching work here. Live database search needs “nodivium web”.');
  $('.topbar').after(banner);
}
