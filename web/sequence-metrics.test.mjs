import assert from 'node:assert/strict';
import { test } from 'node:test';
import './sequence-metrics.js';

const analyze = globalThis.NodiviumSequence.nucleotide;

test('GC uses only canonical bases and reports ambiguity', () => {
  const stats = analyze('ACGTNN', 3);
  assert.equal(stats.gcPercent, 50);
  assert.equal(stats.ambiguous, 2);
  assert.deepEqual(stats.windows.map(window => window.percent), [50, 50, null]);
});

test('RNA uracil contributes to canonical denominator', () => {
  const stats = analyze('ACGU', 2);
  assert.equal(stats.canonical, 4);
  assert.equal(stats.gcPercent, 50);
  assert.equal(stats.counts.U, 1);
});

test('protein composition counts only the 20 standard amino acids', () => {
  const stats = globalThis.NodiviumSequence.protein('MMAACX*');
  assert.equal(stats.length, 7);
  assert.equal(stats.counts.M, 2);
  assert.equal(stats.counts.A, 2);
  assert.equal(stats.canonical, 5);
  assert.equal(stats.other, 2);
});
