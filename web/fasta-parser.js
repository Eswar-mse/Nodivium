/* FASTA validation shared by the browser workspace and its parser checks. */
globalThis.NodiviumFasta = {
  parse(text) {
    const records = [];
    let current = null;
    for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
      if (!line.trim()) continue;
      if (line.startsWith('>')) {
        const match = /^>(\S+)(?:\s+(.*))?$/.exec(line.trimEnd());
        if (!match) throw new Error('A FASTA header needs an identifier after >.');
        if (records.length >= 10000) throw new Error('Choose a FASTA file with at most 10,000 records.');
        current = { id: match[1], description: match[2] || '', sequence: '', type: '' };
        records.push(current);
      } else {
        if (!current) throw new Error('A FASTA sequence must start with a > identifier header.');
        const fragment = line.replace(/\s/g, '');
        if (/[^A-Za-z*.-]/.test(fragment)) throw new Error(`Unsupported character in FASTA record ${current.id}.`);
        current.sequence += fragment;
      }
    }
    if (!records.length) throw new Error('This file has no FASTA records.');
    for (const entry of records) {
      if (!entry.sequence) throw new Error(`FASTA record ${entry.id} has no sequence.`);
      entry.type = /^[ACGTUNRYKMSWBDHV.-]+$/i.test(entry.sequence) ? 'nucleotide' : 'protein';
    }
    return records;
  },
};
