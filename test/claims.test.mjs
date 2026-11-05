// claims.test.mjs — tools/claims.mjs gives every claim CLAIMS-1b seals a verdict against the seal's own bar, and each
// verdict bites: a planted fault in a receipt or a walk turns it, and a sealed claim with nothing to measure it is
// refused. Pure functions only: nothing here spawns a process or writes a file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sealTable, hashPairs, g1Verdict, g2Verdict, gateIds, w1Verdict, verdicts, summary, BUYERS } from '../tools/claims.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(root, p), 'utf8');
const j = (p) => JSON.parse(rd(p));
const clone = (v) => JSON.parse(JSON.stringify(v));
const SEAL = rd('CLAIMS-1b.md');
const WITNESS = j('receipts/witness.json');
const WALKS = j('data/persona-walks.json');
const GATE = rd('gate.mjs');

test('sealTable · reads every row of the seal, in order, backticks dropped', () => {
  const rows = sealTable(SEAL);
  const ids = SEAL.split('\n').filter((l) => /^\|\s*[A-Z]\d+\s*\|/.test(l)).map((l) => l.match(/^\|\s*([A-Z]\d+)/)[1]);
  assert.deepEqual(rows.map((r) => r.id), ids);
  assert.ok(ids.length > 0);
  for (const r of rows) {
    assert.ok(r.claim.length > 0 && r.bar.length > 0, r.id);
    assert.equal(/`/.test(r.claim + r.bar), false, r.id);
  }
  assert.equal(rows.find((r) => r.id === 'L2').bar, '0 of 36 leak');
  assert.deepEqual(sealTable('| id | claim | bar |\n|---|---|---|\nprose | with | pipes'), []);
  for (const g of [undefined, null, 5, {}]) assert.deepEqual(sealTable(g), []);
});

test('hashPairs · the C1 row names the three vendored files and their pins', () => {
  const row = SEAL.split('\n').find((l) => /^\|\s*C1\s*\|/.test(l));
  const pairs = hashPairs(row);
  const vendor = j('vendor/VENDOR.json').files.map((f) => ({ path: f.path, sha256: f.sha256 }));
  assert.deepEqual(pairs, vendor);
  assert.deepEqual(hashPairs(null), []);
});

test('G1 · clean on every organ at the pinned tag holds; a survivor, a cap, a reasonless baseline or the wrong tag does not', () => {
  assert.equal(g1Verdict(WITNESS).held, true);
  assert.equal(g1Verdict(WITNESS).evidence.organs, WITNESS.organs.length);
  const survivor = clone(WITNESS); survivor.organs[1].witness.clean = false; survivor.organs[1].witness.survivors = [{ line: 1 }];
  assert.equal(g1Verdict(survivor).held, false);
  const capped = clone(WITNESS); capped.organs[0].witness.capped = true;
  assert.equal(g1Verdict(capped).held, false);
  const tag = clone(WITNESS); tag.witness.tag = 'v0.5';
  assert.equal(g1Verdict(tag).held, false);
  const cap = clone(WITNESS); cap.witness.cap = 50;
  assert.equal(g1Verdict(cap).held, false);
  const unrun = clone(WITNESS); unrun.organs[2].witness = null;
  assert.equal(g1Verdict(unrun).held, false);
  const noReason = clone(WITNESS); noReason.organs[0].witness.ignored = [{ line: 3, mutation: '> → >=', reason: ' ' }];
  assert.equal(g1Verdict(noReason).held, false);
  const reasoned = clone(WITNESS); reasoned.organs[0].witness.ignored = [{ line: 3, mutation: '> → >=', reason: 'equivalent: both branches return the same' }];
  assert.equal(g1Verdict(reasoned).held, true);
  assert.equal(g1Verdict(reasoned).evidence.baselined, 1);
  for (const g of [undefined, null, 'x', { organs: [] }, { organs: 'x' }]) assert.equal(g1Verdict(g).held, false);
});

test('G2 · the curated gate holds only green, every listed break killed, and every first-build break still listed', () => {
  const step1 = GATE.split('\n').filter((l) => !/id: '(?:list-redact-off|card-neighbour-off)'/.test(l)).join('\n');
  assert.equal(g2Verdict(WITNESS.g2, step1, GATE).held, true);
  assert.equal(g2Verdict(WITNESS.g2, step1, GATE).evidence.step1Kept, true);
  const shrunk = GATE.split('\n').filter((l) => !l.includes("id: 'luhn-invert'")).join('\n');
  assert.equal(g2Verdict({ ...WITNESS.g2, listed: WITNESS.g2.listed - 1, killed: WITNESS.g2.killed - 1 }, step1, shrunk).held, false);
  assert.equal(g2Verdict({ ...WITNESS.g2, killed: WITNESS.g2.listed - 1 }, step1, GATE).held, false);
  assert.equal(g2Verdict({ ...WITNESS.g2, green: false }, step1, GATE).held, false);
  assert.equal(g2Verdict({ ...WITNESS.g2, listed: WITNESS.g2.listed + 1, killed: WITNESS.g2.listed + 1 }, step1, GATE).held, false);
  assert.equal(g2Verdict(WITNESS.g2, '', GATE).held, false);
  assert.equal(gateIds(GATE).length, WITNESS.g2.listed);
  for (const g of [undefined, null, 'x']) assert.equal(g2Verdict(g, g, g).held, false);
});

test('W1 · the four buyers, every gap fixed with its change or needing Simon with the decision', () => {
  assert.deepEqual(BUYERS, ['CFO', 'CTO / CISO', 'COO', 'Procurement']);
  const real = w1Verdict(WALKS);
  assert.equal(real.held, true);
  assert.equal(real.evidence.gaps, WALKS.walks.flatMap((w) => w.gaps).length);
  assert.equal(real.evidence.unanswered, 0);
  const open = clone(WALKS); open.walks[0].gaps[0].status = 'open';
  assert.equal(w1Verdict(open).held, false);
  assert.equal(w1Verdict(open).evidence.unanswered, 1);
  const noChange = clone(WALKS); const fixed = noChange.walks.flatMap((w) => w.gaps).find((g) => g.status === 'fixed'); fixed.change = '';
  assert.equal(w1Verdict(noChange).held, false);
  const noDecision = clone(WALKS); const simon = noDecision.walks.flatMap((w) => w.gaps).find((g) => g.status === 'needs Simon'); delete simon.decision;
  assert.equal(w1Verdict(noDecision).held, false);
  const missing = clone(WALKS); missing.walks = missing.walks.filter((w) => w.persona !== 'COO');
  assert.equal(w1Verdict(missing).held, false);
  for (const g of [undefined, null, 'x', { walks: [] }, { walks: [null, 'x'] }]) assert.equal(w1Verdict(g).held, false);
});

test('verdicts · a sealed claim with nothing to measure it is refused; the summary counts held, failed and recorded', () => {
  const rows = [{ id: 'A1', claim: 'a', bar: 'b' }, { id: 'B1', claim: 'c', bar: 'd' }];
  assert.throws(() => verdicts(rows, { A1: { held: true } }), /no measurer for sealed claim\(s\): B1/);
  const v = verdicts(rows, { A1: { held: true, where: 'x' }, B1: { held: null, where: 'y' } });
  assert.deepEqual(summary(v), { sealed: 2, held: 1, failed: 0, recorded: 1 });
  assert.deepEqual(summary([...v, { held: false }]), { sealed: 3, held: 1, failed: 1, recorded: 1 });
});

test('receipts/claims.json · one verdict per sealed row, in the seal\'s order, with the seal\'s own bar', () => {
  const c = j('receipts/claims.json');
  const rows = sealTable(SEAL);
  assert.deepEqual(c.claims.map((x) => [x.id, x.claim, x.bar]), rows.map((r) => [r.id, r.claim, r.bar]));
  assert.deepEqual(c.summary, summary(c.claims));
  const step1b = j('receipts/step1b.json');
  for (const s of step1b.claims) assert.equal(c.claims.find((x) => x.id === s.id).held, s.held, s.id);
});
