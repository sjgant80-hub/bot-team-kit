// claims.test.mjs — tools/claims.mjs gives every claim CLAIMS-1b seals a verdict against the seal's own bar, and each
// verdict bites: a planted fault in a receipt or a walk turns it, and a sealed claim with nothing to measure it is
// refused. Pure functions only (tools/verdicts.mjs, witness-gated as CLAIMS-1c G3): nothing here spawns a process or
// writes a file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sealTable, hashPairs, g1Verdict, g2Verdict, g3Verdict, g4Record, gateIds, w1Verdict, roundVerdict, sameVerdicts, verdicts, summary, BUYERS, SEALED_KERNELS, WITNESS_TAG, WITNESS_CAP, KERNEL_TIMEOUT } from '../tools/verdicts.mjs';

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
  assert.deepEqual(c.claims.slice(0, rows.length).map((x) => [x.id, x.claim, x.bar]), rows.map((r) => [r.id, r.claim, r.bar]));
  const rows1c = sealTable(rd('CLAIMS-1c.md'));
  assert.deepEqual(c.claims.slice(rows.length).map((x) => [x.id, x.claim, x.bar]), rows1c.map((r) => [r.id, r.claim, r.bar]));
  assert.deepEqual(c.summary, summary(c.claims));
  const step1b = j('receipts/step1b.json');
  for (const s of step1b.claims) assert.equal(c.claims.find((x) => x.id === s.id).held, s.held, s.id);
});

// ---- CLAIMS-1c G3: tools/verdicts.mjs is witness-gated; these pin each verdict's edges --------------------------
const run3 = (kernels, kernelRun = { tag: 'v0.6', cap: 800, timeout: 30000 }) => ({ kernelRun, kernels });
const ran = (o = {}) => ({ total: 4, killed: 4, survived: 0, capped: false, survivors: [], ignored: [], clean: true, ...o });
const three = () => SEALED_KERNELS.map((file) => ({ file, witness: ran() }));

test('G1 · an empty organ list, or an organ with no result, is not clean', () => {
  const empty = clone(WITNESS); empty.organs = [];
  assert.equal(g1Verdict(empty).held, false);
  assert.equal(g1Verdict(empty).evidence.organs, 0);
  const gone = clone(WITNESS); delete gone.organs[1].witness;
  assert.equal(g1Verdict(gone).held, false);
  const odd = clone(WITNESS); odd.organs[1] = 'x';
  assert.equal(g1Verdict(odd).held, false);
  const nan = clone(WITNESS); nan.organs[0].witness.killed = 'x'; nan.organs[1].witness.total = Number.NaN;
  assert.equal(g1Verdict(nan).evidence.killed, WITNESS.organs.slice(1).reduce((n, o) => n + o.witness.killed, 0));
  assert.equal(g1Verdict(nan).evidence.total, WITNESS.organs.reduce((n, o, i) => n + (i === 1 ? 0 : o.witness.total), 0));
});

test('G3 · clean on exactly the three sealed files, in order, at the pinned tag, cap and timeout', () => {
  assert.deepEqual(SEALED_KERNELS, ['page/facts.mjs', 'tools/verdicts.mjs', 'tools/page-rules.mjs']);
  assert.deepEqual([WITNESS_TAG, WITNESS_CAP, KERNEL_TIMEOUT], ['v0.6', 800, 30000]);
  const good = g3Verdict(run3(three()));
  assert.equal(good.held, true);
  assert.deepEqual(good.evidence, { files: 3, killed: 12, total: 12, baselined: 0, tag: 'v0.6' });
  const k = three();
  assert.equal(g3Verdict(run3([k[1], k[0], k[2]])).held, false, 'order');
  assert.equal(g3Verdict(run3(k.slice(0, 2))).held, false, 'missing');
  assert.equal(g3Verdict(run3([...k, { file: 'x.mjs', witness: ran() }])).held, false, 'extra');
  assert.equal(g3Verdict(run3([k[0], { file: 'tools/verdicts.mjs' }, k[2]])).held, false, 'no result');
  assert.equal(g3Verdict(run3([k[0], 'x', k[2]])).held, false, 'not an entry');
  for (const bad of [{ clean: false }, { capped: true }, { survivors: [{ line: 1 }] }, { ignored: [{ line: 1, mutation: 'a', reason: ' ' }] }]) {
    const b = three(); b[2].witness = ran(bad);
    assert.equal(g3Verdict(run3(b)).held, false, JSON.stringify(bad));
  }
  const reasoned = three(); reasoned[0].witness = ran({ ignored: [{ line: 3, mutation: '< → <=', reason: 'equivalent: the loop ends either way' }] });
  assert.equal(g3Verdict(run3(reasoned)).held, true);
  assert.equal(g3Verdict(run3(reasoned)).evidence.baselined, 1);
  for (const r of [{ tag: 'v0.5', cap: 800, timeout: 30000 }, { tag: 'v0.6', cap: 50, timeout: 30000 }, { tag: 'v0.6', cap: 800, timeout: 20000 }, null]) {
    assert.equal(g3Verdict(run3(three(), r)).held, false, JSON.stringify(r));
  }
  for (const g of [undefined, null, 'x', {}, { kernels: 'x' }]) assert.equal(g3Verdict(g).held, false);
});

test('G4 · recorded only: no verdict, the sums of what witness found', () => {
  const r = g4Record({ g4: [{ witness: { total: 9, killed: 2, survived: 7 } }, { witness: { total: 3, killed: 3, survived: 0 } }, { witness: null }] });
  assert.deepEqual(r, { held: null, evidence: { files: 3, killed: 5, total: 12, survived: 7 } });
  assert.deepEqual(g4Record({ g4: [{ witness: { total: 'x', killed: Number.NaN, survived: undefined } }] }).evidence, { files: 1, killed: 0, total: 0, survived: 0 });
  for (const g of [undefined, null, 'x', { g4: 'x' }]) assert.deepEqual(g4Record(g), { held: null, evidence: { files: 0, killed: 0, total: 0, survived: 0 } });
});

test('W1 · the four buyers with no gap at all do not hold; the counts are exact', () => {
  const none = { walks: BUYERS.map((persona) => ({ persona, gaps: [] })) };
  assert.equal(w1Verdict(none).held, false);
  const real = w1Verdict(WALKS).evidence;
  const gaps = WALKS.walks.flatMap((w) => w.gaps);
  assert.equal(real.fixed, gaps.filter((g) => g.status === 'fixed').length);
  assert.equal(real.needsSimon, gaps.filter((g) => g.status === 'needs Simon').length);
  const mixed = { walks: [{ persona: 'CFO', gaps: [null, { status: 'fixed', change: 'x' }, { status: 'needs Simon', decision: 'y' }, { status: 'open' }] }] };
  assert.deepEqual(w1Verdict(mixed).evidence, { walks: 1, rounds: 1, gaps: 4, fixed: 1, needsSimon: 1, unanswered: 2 });
});

test('W2 · in its round, every buyer walked and said what they checked; every gap of that round answered', () => {
  const walk = (persona, round, o = {}) => ({ persona, round, checked: ['the cost case'], gaps: [{ status: 'fixed', change: 'done' }], ...o });
  const ok = { walks: [...BUYERS.map((p) => walk(p, 3)), walk('CFO', 2, { gaps: [{ status: 'open' }] })] };
  assert.equal(roundVerdict(ok, 3).held, true);
  assert.deepEqual(roundVerdict(ok, 3).evidence, { round: 3, walks: 4, gaps: 4, fixed: 4, needsSimon: 0, unanswered: 0 });
  assert.equal(roundVerdict(ok, 2).held, false, 'round 2 has one buyer and an open gap');
  const clean = { walks: BUYERS.map((p) => walk(p, 3, { gaps: [] })) };
  assert.equal(roundVerdict(clean, 3).held, true, 'a round with nothing found holds, when every buyer says what they checked');
  const missing = { walks: BUYERS.slice(1).map((p) => walk(p, 3)) };
  assert.equal(roundVerdict(missing, 3).held, false);
  for (const checked of [[], [' '], undefined, 'x']) {
    const c = { walks: BUYERS.map((p, i) => walk(p, 3, i === 2 ? { checked } : {})) };
    assert.equal(roundVerdict(c, 3).held, false, JSON.stringify(checked));
  }
  const open = { walks: BUYERS.map((p, i) => walk(p, 3, i === 1 ? { gaps: [{ status: 'needs Simon', decision: '' }] } : {})) };
  assert.equal(roundVerdict(open, 3).held, false);
  assert.equal(roundVerdict(open, 3).evidence.unanswered, 1);
  const roundless = { walks: BUYERS.map((p) => ({ persona: p, checked: ['x'], gaps: [] })) };
  assert.equal(roundVerdict(roundless, 1).held, true, 'a walk with no round is round 1');
  assert.equal(roundVerdict(roundless, 3).held, false);
  for (const r of [undefined, '3', 3.5]) assert.equal(roundVerdict(ok, r).held, false, String(r));
  for (const g of [undefined, null, 'x', { walks: 'x' }]) assert.equal(roundVerdict(g, 3).held, false);
});

test('V1 · every earlier verdict kept holds; a changed or missing verdict is named', () => {
  const before = { claims: [{ id: 'A1', held: true }, { id: 'B1', held: null }, { id: 'C1', held: false }] };
  const now = [{ id: 'A1', held: true }, { id: 'B1', held: null }, { id: 'C1', held: false }, { id: 'D1', held: true }];
  assert.deepEqual(sameVerdicts(before, now), { held: true, evidence: { compared: 3, changed: [] } });
  assert.deepEqual(sameVerdicts(before, [{ id: 'A1', held: false }, { id: 'B1', held: null }]), { held: false, evidence: { compared: 3, changed: ['A1', 'C1'] } });
  assert.deepEqual(sameVerdicts(before, [{ id: 'A1', held: true }, { id: 'B1', held: false }, { id: 'C1', held: false }]).evidence.changed, ['B1']);
  assert.equal(sameVerdicts({ claims: [] }, now).held, false, 'nothing to compare is not a pass');
  for (const g of [undefined, null, 'x', { claims: 'x' }]) assert.equal(sameVerdicts(g, now).held, false);
  assert.equal(sameVerdicts(before, 'x').held, false);
  assert.equal(sameVerdicts(before, [null, 'x', ...now]).held, true);
});

test('receipts/claims.json · CLAIMS-1b first, then CLAIMS-1c, each row with its seal; V1 holds the CLAIMS-1b verdicts', () => {
  const c = j('receipts/claims.json');
  const seal1c = rd('CLAIMS-1c.md');
  const rows = [...sealTable(SEAL).map((r) => ['CLAIMS-1b.md', r.id]), ...sealTable(seal1c).map((r) => ['CLAIMS-1c.md', r.id])];
  assert.deepEqual(c.claims.map((x) => [x.seal, x.id]), rows);
  assert.deepEqual(c.seals.map((s) => [s.file, s.claims]), [['CLAIMS-1b.md', sealTable(SEAL).length], ['CLAIMS-1c.md', sealTable(seal1c).length]]);
  assert.deepEqual(sealTable(seal1c).map((r) => r.id), ['G3', 'G4', 'V1', 'W2']);
});
