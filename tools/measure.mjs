// tools/measure.mjs — measures CLAIMS-1b's L, F and R claims once, against step 1's code (read from git at 4c20fd9)
// and against the code now, from the sealed batteries in data/probe-1b.json. Writes receipts/step1b.json.
//   node tools/measure.mjs           measure and write the receipt
//   node tools/measure.mjs --check   re-derive and compare byte for byte with the committed receipt (CI)
// Deterministic: no clock, no randomness; the receipt never contains an assembled secret, only item ids.
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const STEP1 = '4c20fd942289916e2a75dd443b83d32c13805c62';
const sha = (s) => createHash('sha256').update(s).digest('hex');
const git = (...a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8' });
const RECEIPT = join(root, 'receipts', 'step1b.json');

// ---- the seal: the batteries must be the ones it names ----------------------------------------------------------
const seal = readFileSync(join(root, 'CLAIMS-1b.md'), 'utf8');
const probeText = readFileSync(join(root, 'data', 'probe-1b.json'), 'utf8');
const sealedProbe = (seal.match(/data\/probe-1b\.json` \(sha256 `([0-9a-f]{64})`\)/) || [])[1];
if (sealedProbe !== sha(probeText)) { console.error(`REFUSED: data/probe-1b.json is not the battery CLAIMS-1b.md sealed (${sealedProbe})`); process.exit(2); }
const sealCommit = git('log', '--diff-filter=A', '--format=%H', '--', 'CLAIMS-1b.md').trim().split('\n').pop();
const P = JSON.parse(probeText);

// ---- the two versions of the code -----------------------------------------------------------------------------
const tmp = mkdtempSync(join(tmpdir(), 'btk-measure-'));
let result;
try {
  mkdirSync(join(tmp, 'src'));
  mkdirSync(join(tmp, 'test'));
  const step1 = {};
  for (const f of ['src/kernel.mjs', 'src/feed.mjs', 'src/rollup.mjs', 'test/checks.mjs']) {
    const body = git('show', `${STEP1}:${f}`);
    writeFileSync(join(tmp, f), body);
    step1[f] = sha(body);
  }
  const old = {
    K: await import(pathToFileURL(join(tmp, 'src', 'kernel.mjs')).href),
    R: await import(pathToFileURL(join(tmp, 'src', 'rollup.mjs')).href),
  };
  const now = {
    K: await import(pathToFileURL(join(root, 'src', 'kernel.mjs')).href),
    R: await import(pathToFileURL(join(root, 'src', 'rollup.mjs')).href),
  };
  const oldChecks = await import(pathToFileURL(join(tmp, 'test', 'checks.mjs')).href);

  // ---- assembling a secret from its parts ---------------------------------------------------------------------
  const cyc = (set, n) => Array.from({ length: n }, (_, i) => set[i % set.length]).join('');
  const assemble = (parts) => parts.map((p) => (typeof p === 'string' ? p : p.fill !== undefined ? cyc(P.FILL, p.fill) : cyc(P.UPFILL, p.upfill))).join('');
  const place = (v, s) => (typeof v === 'string' ? v.split('{S}').join(s) : Array.isArray(v) ? v.map((x) => place(x, s)) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, place(x, s)])) : v);

  const leaks = (K) => {
    const leaked = P.leaks.filter((it) => { const s = assemble(it.secret); return JSON.stringify(K.normalizeLine(place(it.line, s))).includes(s); }).map((it) => it.id);
    return { items: P.leaks.length, leaked: leaked.length, leakedIds: leaked };
  };
  const clean = (K) => {
    const changed = P.clean.filter((it) => { const out = K.normalizeLine(it.line); delete out.flags; return JSON.stringify(out) !== JSON.stringify(it.line); }).map((it) => it.id);
    return { items: P.clean.length, unchanged: P.clean.length - changed.length, changedIds: changed };
  };
  const fuzz = (K) => { try { oldChecks.CHECKS['redaction-fuzz-1000-zero-leaks'](K); return { lines: 1000, leaks: 0, passed: true }; } catch (e) { return { lines: 1000, passed: false, why: e.message.replace(/ e\.g\..*$/, '') }; } };
  const flagged = (K, line) => K.flagsFor(line).includes('done-without-receipt');
  const claims = (K) => { const missed = P.claims.filter((it) => !flagged(K, it.line)).map((it) => it.id); return { items: P.claims.length, flagged: P.claims.length - missed.length, missedIds: missed }; };
  const plain = (K) => { const wrong = P.plain.filter((it) => flagged(K, it.line)).map((it) => it.id); return { items: P.plain.length, flagged: wrong.length, flaggedIds: wrong }; };
  const proof = (K) => { const wrong = P.proof.filter((it) => flagged(K, it.line) !== it.flagged).map((it) => it.id); return { items: P.proof.length, asStated: P.proof.length - wrong.length, wrongIds: wrong }; };

  const forge = (K) => {
    const s = assemble(P.forge.secret);
    const lines = place(P.forge.lines, s);
    const md = K.rollup(lines, P.forge.date);
    const ls = md.replace(/\n$/, '').split('\n');
    const agents = new Set(lines.map((l) => l.agent)).size;
    const simon = lines.filter((l) => ['decision', 'blocker', 'listing', 'post'].includes(l.kind) || String(l.needs_owner || '').toLowerCase() === 'simon').length;
    const headings = ls.filter((l) => l.startsWith('## '));
    const checks = {
      titleFirst: ls[0] === `# AGENT_FEED — ${P.forge.date}`,
      onlyKnownLineShapes: ls.slice(1).every((l) => l === '' || l.startsWith('## ') || l.startsWith('- [')),
      oneTitle: ls.filter((l) => l.startsWith('# ')).length === 1,
      needsSimonOnceAndFirst: ls.filter((l) => l === '## NEEDS SIMON').length === 1 && headings[0] === '## NEEDS SIMON',
      headingsArePersonas: headings.length === 1 + agents,
      itemsAreLines: ls.filter((l) => l.startsWith('- [')).length === simon + lines.length,
      secretAbsent: !md.includes(s),
    };
    const failed = Object.keys(checks).filter((k) => !checks[k]);
    return { lines: lines.length, checks: Object.keys(checks).length, held: failed.length === 0, failedChecks: failed };
  };
  const corrupt = (R) => {
    const f = join(tmp, `corrupt-${R === now.R ? 'now' : 'step1'}.jsonl`);
    writeFileSync(f, P.corrupt.text);
    const md = R.buildRollup(f, P.corrupt.date);
    const top = md.slice(md.indexOf('## NEEDS SIMON'), md.indexOf('\n\n', md.indexOf('## NEEDS SIMON')));
    const told = top.split('\n').some((l) => l.startsWith('- [blocker]') && l.includes(String(P.corrupt.unreadable)));
    return { unreadable: P.corrupt.unreadable, toldSimon: told };
  };

  const m = {
    L1: { step1: leaks(old.K) },
    L2: { now: leaks(now.K) },
    L3: { step1: clean(old.K), now: clean(now.K) },
    L4: { now: fuzz(now.K) },
    F1: { step1: claims(old.K), now: claims(now.K) },
    F2: { step1: plain(old.K), now: plain(now.K) },
    F3: { step1: proof(old.K), now: proof(now.K) },
    R1: { step1: forge(old.K), now: forge(now.K) },
    R2: { step1: corrupt(old.R), now: corrupt(now.R) },
  };
  const verdict = {
    L1: { bar: 'recorded only', held: null },
    L2: { bar: '0 of 36 leak', held: m.L2.now.leaked === 0 },
    L3: { bar: '16 of 16 unchanged', held: m.L3.now.unchanged === P.clean.length },
    L4: { bar: '0 leaks', held: m.L4.now.passed },
    F1: { bar: '20 of 20 flagged', held: m.F1.now.flagged === P.claims.length },
    F2: { bar: '0 of 10 flagged', held: m.F2.now.flagged === 0 },
    F3: { bar: '7 of 7 as stated', held: m.F3.now.asStated === P.proof.length },
    R1: { bar: 'every structural check holds', held: m.R1.now.held },
    R2: { bar: 'NEEDS SIMON names the unreadable count', held: m.R2.now.toldSimon },
  };
  const claims_ = Object.keys(verdict).map((id) => ({ id, ...verdict[id], measured: m[id] }));
  result = {
    receipt: 'bot-team-kit step 1b — CLAIMS-1b L, F and R claims, measured once',
    sealedIn: 'CLAIMS-1b.md',
    sealCommit,
    sealSha256: sha(seal),
    probe: { file: 'data/probe-1b.json', sha256: sha(probeText) },
    step1: { commit: STEP1, sha256: step1 },
    now: { sha256: { 'src/kernel.mjs': sha(readFileSync(join(root, 'src', 'kernel.mjs'), 'utf8')), 'src/feed.mjs': sha(readFileSync(join(root, 'src', 'feed.mjs'), 'utf8')), 'src/rollup.mjs': sha(readFileSync(join(root, 'src', 'rollup.mjs'), 'utf8')) } },
    reproduce: 'node tools/measure.mjs --check',
    claims: claims_,
    summary: { held: claims_.filter((c) => c.held === true).length, failed: claims_.filter((c) => c.held === false).length, recorded: claims_.filter((c) => c.held === null).length },
  };
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

const text = JSON.stringify(result, null, 2) + '\n';
if (process.argv.includes('--check')) {
  let committed = '';
  try { committed = readFileSync(RECEIPT, 'utf8'); } catch { /* none */ }
  if (committed !== text) { console.error('receipts/step1b.json does not re-derive from the sealed batteries and the code:\n' + text); process.exit(1); }
  console.error(`receipts/step1b.json re-derived byte for byte: ${result.summary.held} held, ${result.summary.failed} failed, ${result.summary.recorded} recorded`);
} else {
  writeFileSync(RECEIPT, text);
  console.error(`wrote receipts/step1b.json: ${result.summary.held} held, ${result.summary.failed} failed, ${result.summary.recorded} recorded`);
  for (const c of result.claims) console.error(`  ${c.id} ${c.held === null ? 'recorded' : c.held ? 'HELD' : 'FAILED'} — ${c.bar}`);
}
