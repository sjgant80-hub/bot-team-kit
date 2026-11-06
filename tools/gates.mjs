// tools/gates.mjs — G0, G1, G2 (CLAIMS-1b), G3, G4 (CLAIMS-1c) and the test count, as one receipt the page reads
// (receipts/witness.json, as both seals name it).
//   node tools/gates.mjs --witness-dir DIR           write the receipt from witness JSON outputs in DIR
//   node tools/gates.mjs --witness-dir DIR --check   re-derive from CI's own witness run and compare byte for byte
// DIR holds one witness v0.6 JSON output per gated file, named after it (kernel.json, feed.json, rollup.json,
// mintcase.json; facts.json, verdicts.json, page-rules.json) plus step1-kernel.json for G0 and before-facts.json,
// before-claims.json, before-page-check.json for G4. Tests and gate.mjs are run here, fresh.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'receipts', 'witness.json');
const sha = (s) => createHash('sha256').update(s).digest('hex');
const arg = (k) => { const i = process.argv.indexOf(k); return i === -1 ? undefined : process.argv[i + 1]; };
const dir = arg('--witness-dir');
if (!dir) { console.error('usage: node tools/gates.mjs --witness-dir DIR [--check]'); process.exit(2); }

const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
const run = (args) => spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', env });

// the organs, their tests, and how witness was asked to gate them (CI runs exactly these commands)
export const ORGANS = [
  { file: 'src/kernel.mjs', witness: 'kernel.json', tests: ['test/test.mjs', 'test/kernel.test.mjs'], job: 'redact, flag, validate, normalize, roll up — the pure gated surface' },
  { file: 'src/feed.mjs', witness: 'feed.json', tests: ['test/io.test.mjs'], job: 'append one redacted, flagged, valid line; read the feed and count unreadable lines; the CLI' },
  { file: 'src/rollup.mjs', witness: 'rollup.json', tests: ['test/io.test.mjs'], job: 'read the feed, write AGENT_FEED.md with NEEDS SIMON first; the CLI' },
  { file: 'src/mintcase.mjs', witness: 'mintcase.json', tests: ['test/mintcase.test.mjs'], job: 'the cost case from the sourced basis (liveware’s gated kernel, vendored byte for byte)' },
];

// CLAIMS-1c G3: the page's three pure modules, each with the suite that holds it, at a per-mutant timeout of 30000 ms
export const KERNELS = [
  { file: 'page/facts.mjs', witness: 'facts.json', tests: ['test/page.test.mjs'], job: 'every number on the page, read from the receipts; a missing or broken receipt gives the dash' },
  { file: 'tools/verdicts.mjs', witness: 'verdicts.json', tests: ['test/claims.test.mjs'], job: 'the verdict of every sealed claim, against its own seal’s bar' },
  { file: 'tools/page-rules.mjs', witness: 'page-rules.json', tests: ['test/page.test.mjs'], job: 'the page check (P1): no typed-in number, no price, the credits, every section' },
];
export const KERNEL_RUN = { tag: 'v0.6', cap: 800, timeout: 30000 };
// CLAIMS-1c G4: the same three jobs as they were at the fold's base, with that commit's tests (recorded only)
const BASE_1C = 'f1d8e7038b7f0d05f922eb939550d932edb928b0';
export const BEFORE = [
  { file: 'page/facts.mjs', witness: 'before-facts.json', tests: ['test/page.test.mjs'] },
  { file: 'tools/claims.mjs', witness: 'before-claims.json', tests: ['test/claims.test.mjs'] },
  { file: 'tools/page-check.mjs', witness: 'before-page-check.json', tests: ['test/page.test.mjs'] },
];

function readWitness(name) {
  const p = join(dir, name);
  if (!existsSync(p)) return null;
  const r = JSON.parse(readFileSync(p, 'utf8'));
  return {
    total: r.total, killed: r.killed, survived: r.survived.length, capped: r.capped !== false,
    survivors: r.survived.map((x) => ({ line: x.line, mutation: x.mutation, snippet: x.snippet })),
    ignored: (r.ignored || []).map((x) => ({ line: x.line, mutation: x.mutation, reason: x.reason })),
    clean: r.clean === true,
  };
}

// every test file, counted by node's own TAP reporter
const testFiles = ['test/test.mjs', 'test/kernel.test.mjs', 'test/io.test.mjs', 'test/mintcase.test.mjs', 'test/pins.test.mjs', 'test/page.test.mjs', 'test/claims.test.mjs'];
const t = run(['--test', '--test-reporter=tap', ...testFiles]);
const count = (k) => Number((t.stdout.match(new RegExp(`^# ${k} (\\d+)$`, 'm')) || [])[1]);
const tests = { files: testFiles, total: count('tests'), passed: count('pass'), failed: count('fail') };

const g = run(['gate.mjs']);
const gm = (g.stderr.match(/mutation gate: (\d+)\/(\d+) mutants killed/) || []);
const g2 = { killed: Number(gm[1]), listed: Number(gm[2]), green: g.status === 0 };

const organs = ORGANS.map((o) => ({ file: o.file, sha256: sha(readFileSync(join(root, o.file), 'utf8')), tests: o.tests, job: o.job, witness: readWitness(o.witness) }));
const g0 = readWitness('step1-kernel.json');
const kernels = KERNELS.map((o) => ({ file: o.file, sha256: sha(readFileSync(join(root, o.file), 'utf8')), tests: o.tests, job: o.job, witness: readWitness(o.witness) }));
const g4 = BEFORE.map((o) => ({ file: o.file, at: BASE_1C.slice(0, 7), tests: o.tests, witness: readWitness(o.witness) }));
const clean = (list) => list.every((o) => o.witness && o.witness.clean && !o.witness.capped);

const receipt = {
  receipt: 'bot-team-kit gates — tests, step 1’s curated gate (G2), witness v0.6 on every organ (G1) and on step 1’s kernel (G0), on the page’s own modules (G3) and on them before CLAIMS-1c (G4)',
  witness: { repo: 'https://github.com/sjgant80-hub/witness', tag: 'v0.6', cap: 800 },
  tests,
  g2,
  organs,
  g0: { file: 'src/kernel.mjs at 4c20fd9, with step 1’s tests', witness: g0 },
  kernelRun: KERNEL_RUN,
  kernels,
  g4,
  allClean: clean(organs) && clean(kernels) && g2.green && tests.failed === 0 && tests.total > 0,
  reproduce: 'see .github/workflows/ci.yml — CI runs witness on each organ, then node tools/gates.mjs --witness-dir <dir> --check',
};

const text = JSON.stringify(receipt, null, 2) + '\n';
if (process.argv.includes('--check')) {
  let committed = '';
  try { committed = readFileSync(OUT, 'utf8'); } catch { /* none */ }
  if (committed !== text) { console.error('receipts/witness.json does not re-derive from this run:\n' + text); process.exit(1); }
  console.error(`receipts/witness.json re-derived byte for byte (allClean: ${receipt.allClean})`);
} else {
  writeFileSync(OUT, text);
  console.error(`wrote receipts/witness.json (allClean: ${receipt.allClean})`);
}
