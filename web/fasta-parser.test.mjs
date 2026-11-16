import assert from 'node:assert/strict';
import { test } from 'node:test';
import './fasta-parser.js';

const parse = globalThis.NodiviumFasta.parse;

test('keeps every FASTA record and its identity', () => {
  const records = parse('\uFEFF>seq1 nucleotide sample\r\nACGT N\r\n>seq2 protein sample\r\nMEF\r\n');
  assert.deepEqual(records.map(({ id, description, sequence, type }) => ({ id, description, sequence, type })), [
    { id: 'seq1', description: 'nucleotide sample', sequence: 'ACGTN', type: 'nucleotide' },
    { id: 'seq2', description: 'protein sample', sequence: 'MEF', type: 'protein' },
  ]);
});

test('rejects missing identifiers, empty records, and invalid sequence symbols', () => {
  assert.throws(() => parse('>\nACGT'), /header needs an identifier/);
  assert.throws(() => parse('>first\n>second\nACGT'), /first has no sequence/);
  assert.throws(() => parse('>sample\nAC1GT'), /Unsupported character/);
  assert.throws(() => parse('ACGT'), /must start with a > identifier/);
});
