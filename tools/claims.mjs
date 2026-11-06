// tools/claims.mjs — every claim every seal names (CLAIMS-1b.md, then CLAIMS-1c.md), with its verdict, in one receipt
// the page reads (receipts/claims.json). Nothing is measured anew here: each verdict is read from the receipt that
// measured it, or re-run from the check that holds it, against the bar its own seal states. The verdict logic is pure
// and lives in tools/verdicts.mjs (witness-gated, CLAIMS-1c G3); this file reads, runs the named checks and writes.
//   CLAIMS-1b
//   L1–L4, F1–F3, R1, R2   receipts/step1b.json (tools/measure.mjs, re-derived in CI from the sealed batteries)
//   G0, G1, G2             receipts/witness.json (tools/gates.mjs, re-derived in CI from CI's own witness run); G2's
//                          "never shrink" is read against step 1's gate.mjs, from git
//   E1, C1                 their named tests, run here; C1's three hashes are also recomputed against the seal's text
//   T1, P1                 their CI checks (tools/trace.mjs --check, tools/page-check.mjs), run here
//   W1                     data/persona-walks.json: every gap fixed on the page, or needing Simon with the decision
//   CLAIMS-1c
//   G3, G4                 receipts/witness.json (the page's three pure modules now; the same files before the fold)
//   V1                     this receipt: every CLAIMS-1b verdict compared with the receipt at the seal's base, from git
//   W2                     data/persona-walks.json, round 3: every buyer walked and said what they checked
// A sealed claim with no measurer here is refused, never skipped.
//   node tools/claims.mjs           write receipts/claims.json
//   node tools/claims.mjs --check   re-derive and compare byte for byte (CI, after every other check)
import { readFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { sealTable, hashPairs, g1Verdict, g2Verdict, g3Verdict, g4Record, w1Verdict, roundVerdict, sameVerdicts, verdicts, summary } from './verdicts.mjs';

export { BUYERS, sealTable, hashPairs, g1Verdict, g2Verdict, g3Verdict, g4Record, gateIds, w1Verdict, roundVerdict, sameVerdicts, verdicts, summary } from './verdicts.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'receipts', 'claims.json');
const STEP1 = '4c20fd942289916e2a75dd443b83d32c13805c62';
// CLAIMS-1c's base: step 1b and its walks as pushed, before this fold
const BASE_1C = 'f1d8e7038b7f0d05f922eb939550d932edb928b0';
export const SEALS = Object.freeze(['CLAIMS-1b.md', 'CLAIMS-1c.md']);

const sha = (b) => createHash('sha256').update(b).digest('hex');
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v : []);

// ---- the run ----------------------------------------------------------------------------------------------------
function main() {
  const rd = (p) => readFileSync(join(root, p));
  const J = (p) => JSON.parse(rd(p).toString());
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  const node = (args) => spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', env });
  const named = (file, id) => {
    const name = (rd(file).toString().match(new RegExp(`test\\('(${id} ·[^']*)'`)) || [])[1];
    if (!name) return { name: null, passed: false };
    const r = node(['--test', '--test-reporter=tap', `--test-name-pattern=^${id} ·`, file]);
    const n = (k) => Number((r.stdout.match(new RegExp(`^# ${k} (\\d+)$`, 'm')) || [])[1]);
    return { name, passed: r.status === 0 && n('pass') >= 1 && n('fail') === 0 };
  };

  const sealText = rd('CLAIMS-1b.md').toString();
  const seals = SEALS.map((file) => { const t = rd(file).toString(); return { file, text: t, rows: sealTable(t) }; });
  const step1b = J('receipts/step1b.json');
  const witness = J('receipts/witness.json');
  const walks = J('data/persona-walks.json');

  const m = {};
  for (const c of list(step1b.claims)) m[c.id] = { held: c.held, where: 'receipts/step1b.json' };

  const e1 = named('test/io.test.mjs', 'E1');
  m.E1 = { held: e1.passed, where: 'test/io.test.mjs', evidence: { test: e1.name, passed: e1.passed } };

  const g0 = isObj(witness.g0) && isObj(witness.g0.witness) ? witness.g0.witness : {};
  m.G0 = { held: null, where: 'receipts/witness.json', evidence: { killed: g0.killed, total: g0.total, survived: g0.survived } };
  m.G1 = { ...g1Verdict(witness), where: 'receipts/witness.json' };
  const step1Gate = execFileSync('git', ['-C', root, 'show', `${STEP1}:gate.mjs`], { encoding: 'utf8' });
  m.G2 = { ...g2Verdict(witness.g2, step1Gate, rd('gate.mjs').toString()), where: 'receipts/witness.json' };

  const c1Row = (sealText.split(/\r?\n/).find((l) => /^\|\s*C1\s*\|/.test(l))) || '';
  const pairs = hashPairs(c1Row);
  const matched = pairs.filter((p) => existsSync(join(root, p.path)) && sha(rd(p.path)) === p.sha256).length;
  const c1 = named('test/pins.test.mjs', 'C1');
  m.C1 = { held: c1.passed && pairs.length === 3 && matched === pairs.length, where: 'test/pins.test.mjs', evidence: { test: c1.name, passed: c1.passed, files: pairs.length, matched } };

  const t1 = node(['tools/trace.mjs', '--check']);
  m.T1 = { held: t1.status === 0, where: 'receipts/trace.json', evidence: { rederived: t1.status === 0 } };
  const p1 = node(['tools/page-check.mjs']);
  m.P1 = { held: p1.status === 0, where: 'tools/page-check.mjs', evidence: { passed: p1.status === 0 } };
  m.W1 = { ...w1Verdict(walks), where: 'data/persona-walks.json' };

  // CLAIMS-1c
  m.G3 = { ...g3Verdict(witness), where: 'receipts/witness.json' };
  m.G4 = { ...g4Record(witness), where: 'receipts/witness.json' };
  m.W2 = { ...roundVerdict(walks, 3), where: 'data/persona-walks.json' };
  // V1 is measured on the CLAIMS-1b verdicts this run gives, against the receipt at CLAIMS-1c's base, read from git
  const before = JSON.parse(execFileSync('git', ['-C', root, 'show', `${BASE_1C}:receipts/claims.json`], { encoding: 'utf8' }));
  m.V1 = { held: null, where: 'receipts/claims.json' };
  const first = verdicts(seals[0].rows, m);
  const v1 = sameVerdicts(before, first);
  const everyRow = seals.every((x) => x.rows.length > 0);
  m.V1 = { held: v1.held && everyRow, where: 'receipts/claims.json', evidence: { seals: seals.length, ...v1.evidence } };

  const claims = seals.flatMap((x) => verdicts(x.rows, m).map((c) => ({ seal: x.file, ...c })));
  return {
    receipt: 'bot-team-kit — every claim every seal names, with its verdict and where it is measured',
    seals: seals.map((x) => ({ file: x.file, sha256: sha(x.text), claims: x.rows.length })),
    reproduce: 'node tools/claims.mjs --check (CI runs it after every other check)',
    claims,
    summary: summary(claims),
  };
}

const isMain = (() => { try { return pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url; } catch { return false; } })();
if (isMain) {
  let r;
  try { r = main(); } catch (e) { console.error('REFUSED: ' + e.message); process.exit(2); }
  const out = JSON.stringify(r, null, 2) + '\n';
  const s = r.summary;
  if (process.argv.includes('--check')) {
    let committed = '';
    try { committed = readFileSync(OUT, 'utf8'); } catch { /* none */ }
    if (committed !== out) { console.error('receipts/claims.json does not re-derive:\n' + out); process.exit(1); }
    console.error(`receipts/claims.json re-derived byte for byte: ${s.sealed} sealed — ${s.held} held, ${s.failed} failed, ${s.recorded} recorded`);
  } else {
    writeFileSync(OUT, out);
    console.error(`wrote receipts/claims.json: ${s.sealed} sealed — ${s.held} held, ${s.failed} failed, ${s.recorded} recorded`);
    for (const c of r.claims) console.error(`  ${c.id} ${c.held === null ? 'recorded' : c.held ? 'HELD' : 'FAILED'} — ${c.bar}`);
  }
}
