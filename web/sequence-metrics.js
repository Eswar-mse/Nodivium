/* Small, source-neutral sequence calculations for the browser inspector. */
globalThis.NodiviumSequence = {
  nucleotide(sequence, maxWindows = 48) {
    const upper = sequence.toUpperCase();
    const counts = { A: 0, C: 0, G: 0, T: 0, U: 0, other: 0 };
    for (const base of upper) {
      if (Object.hasOwn(counts, base) && base !== 'other') counts[base]++;
      else counts.other++;
    }
    const canonical = counts.A + counts.C + counts.G + counts.T + counts.U;
    const gc = counts.G + counts.C;
    const windowSize = Math.max(1, Math.ceil(upper.length / maxWindows));
    const windows = [];
    for (let start = 0; start < upper.length; start += windowSize) {
      const segment = upper.slice(start, start + windowSize);
      const usable = (segment.match(/[ACGTU]/g) || []).length;
      const gcCount = (segment.match(/[GC]/g) || []).length;
      windows.push({ start: start + 1, end: start + segment.length,
        percent: usable ? gcCount / usable * 100 : null, canonical: usable });
    }
    return { length: upper.length, counts, canonical, gcPercent: canonical ? gc / canonical * 100 : null,
      ambiguous: counts.other, windows };
  },
  protein(sequence) {
    const upper = sequence.toUpperCase();
    const counts = Object.fromEntries([..."ACDEFGHIKLMNPQRSTVWY"].map(residue => [residue, 0]));
    let other = 0;
    for (const residue of upper) {
      if (Object.hasOwn(counts, residue)) counts[residue]++;
      else other++;
    }
    const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return { length: upper.length, counts, other, canonical: upper.length - other, ranked };
  },
};
