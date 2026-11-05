// tools/claims.mjs — every claim CLAIMS-1b sealed, with its verdict, in one receipt the page reads (receipts/claims.json).
// Nothing is measured anew here: each verdict is read from the receipt that measured it, or re-run from the check that
// holds it, against the bar the seal states.
//   L1–L4, F1–F3, R1, R2   receipts/step1b.json (tools/measure.mjs, re-derived in CI from the sealed batteries)
//   G0, G1, G2             receipts/witness.json (tools/gates.mjs, re-derived in CI from CI's own witness run); G2's
//                          "never shrink" is read against step 1's gate.mjs, from git
//   E1, C1                 their named tests, run here; C1's three hashes are also recomputed against the seal's text
//   T1, P1                 their CI checks (tools/trace.mjs --check, tools/page-check.mjs), run here
//   W1                     data/persona-walks.json: every gap fixed on the page, or needing Simon with the decision
// The bar shown for each claim is the seal's own text, read from the table in CLAIMS-1b.md. A sealed claim with no
// measurer here is refused, never skipped.
//   node tools/claims.mjs           write receipts/claims.json
//   node tools/claims.mjs --check   re-derive and compare byte for byte (CI, after every other check)
import { readFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'receipts', 'claims.json');
const STEP1 = '4c20fd942289916e2a75dd443b83d32c13805c62';
export const BUYERS = Object.freeze(['CFO', 'CTO / CISO', 'COO', 'Procurement']);

const sha = (b) => createHash('sha256').update(b).digest('hex');
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v : []);
const text = (v) => (typeof v === 'string' ? v.trim() : '');

/** the seal's table: one { id, claim, bar } per row, in the seal's order, backticks dropped */
export function sealTable(seal) {
  const rows = [];
  for (const line of String(seal ?? '').split(/\r?\n/)) {
    const m = line.match(/^\|\s*([A-Z]\d+)\s*\|(.*)\|\s*$/);
    if (!m) continue;
    const cells = m[2].split(/\s\|\s/).map((c) => c.replace(/`/g, '').trim());
    if (cells.length < 2) continue;
    rows.push({ id: m[1], claim: cells.slice(0, -1).join(' | '), bar: cells[cells.length - 1] });
  }
  return rows;
}

/** C1: every `path` … `hash` pair the seal's C1 row names, and whether the file's bytes still hash to it */
export function hashPairs(row) {
  return [...String(row ?? '').matchAll(/`([\w./-]+\.(?:mjs|json))`(?:\s+sha256)?\s+`([0-9a-f]{64})`/g)].map((m) => ({ path: m[1], sha256: m[2] }));
}

/** G1: witness clean on every organ, at the pinned tag and cap, nothing capped, every baselined survivor with a reason */
export function g1Verdict(witness) {
  const w = isObj(witness) ? witness : {};
  const organs = list(w.organs);
  const ws = organs.map((o) => (isObj(o) && isObj(o.witness) ? o.witness : null));
  const ran = ws.length > 0 && ws.every((x) => x !== null);
  const baselined = ws.reduce((n, x) => n + (x ? list(x.ignored).length : 0), 0);
  const reasoned = ws.every((x) => !x || list(x.ignored).every((i) => isObj(i) && text(i.reason).length > 0));
  const pinned = isObj(w.witness) && w.witness.tag === 'v0.6' && w.witness.cap === 800;
  const clean = ran && ws.every((x) => x.clean === true && x.capped === false && list(x.survivors).length === 0);
  return {
    held: ran && pinned && clean && reasoned,
    evidence: {
      organs: organs.length,
      killed: ws.reduce((n, x) => n + (x && Number.isFinite(x.killed) ? x.killed : 0), 0),
      total: ws.reduce((n, x) => n + (x && Number.isFinite(x.total) ? x.total : 0), 0),
      baselined,
      tag: isObj(w.witness) ? w.witness.tag : undefined,
    },
  };
}

/** the mutant ids a gate.mjs lists */
export const gateIds = (src) => [...String(src ?? '').matchAll(/\{\s*id:\s*'([^']+)'/g)].map((m) => m[1]);

/** G2: the curated gate is green, kills every mutant it lists, and still lists every mutant step 1's gate listed */
export function g2Verdict(g2, step1Src, nowSrc) {
  const g = isObj(g2) ? g2 : {};
  const before = gateIds(step1Src), now = new Set(gateIds(nowSrc));
  const kept = before.length > 0 && before.every((id) => now.has(id));
  const killedAll = Number.isInteger(g.listed) && g.listed > 0 && g.killed === g.listed && g.listed === now.size;
  return { held: g.green === true && killedAll && kept, evidence: { killed: g.killed, listed: g.listed, step1Listed: before.length, step1Kept: kept } };
}

/** W1: the four buyers walked; every gap is fixed (with the change) or needs Simon (with the decision) */
export function w1Verdict(walks) {
  const wk = list(isObj(walks) ? walks.walks : undefined).filter(isObj);
  const gaps = wk.flatMap((w) => list(w.gaps));
  const ok = (g) => isObj(g) && ((g.status === 'fixed' && text(g.change).length > 0) || (g.status === 'needs Simon' && text(g.decision).length > 0));
  const personas = new Set(wk.map((w) => w.persona));
  const rounds = new Set(wk.map((w) => (Number.isInteger(w.round) ? w.round : 1)));
  return {
    held: BUYERS.every((b) => personas.has(b)) && gaps.length > 0 && gaps.every(ok),
    evidence: {
      walks: wk.length,
      rounds: rounds.size,
      gaps: gaps.length,
      fixed: gaps.filter((g) => isObj(g) && g.status === 'fixed').length,
      needsSimon: gaps.filter((g) => isObj(g) && g.status === 'needs Simon').length,
      unanswered: gaps.filter((g) => !ok(g)).length,
    },
  };
}

/** one verdict per sealed row; `m` holds the measurers' results by id. A row with no measurer is refused. */
export function verdicts(rows, m) {
  const missing = rows.filter((r) => !(r.id in m)).map((r) => r.id);
  if (missing.length) throw new Error(`no measurer for sealed claim(s): ${missing.join(', ')}`);
  return rows.map((r) => ({ id: r.id, claim: r.claim, bar: r.bar, held: m[r.id].held, where: m[r.id].where, evidence: m[r.id].evidence }));
}

export function summary(claims) {
  return {
    sealed: claims.length,
    held: claims.filter((c) => c.held === true).length,
    failed: claims.filter((c) => c.held === false).length,
    recorded: claims.filter((c) => c.held === null).length,
  };
}

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
  const rows = sealTable(sealText);
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

  const claims = verdicts(rows, m);
  return {
    receipt: 'bot-team-kit — every claim CLAIMS-1b sealed, with its verdict and where it is measured',
    sealedIn: 'CLAIMS-1b.md',
    sealSha256: sha(sealText),
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
