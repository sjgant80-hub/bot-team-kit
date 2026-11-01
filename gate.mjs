// gate.mjs — mutation gate (proof-of-play). We do not trust the test suite until
// it can KILL deliberately broken versions of the kernel. Each mutation is a
// surgical edit to a real operator/constant in src/kernel.mjs that SHOULD break
// at least one check. A mutant that survives all checks = a hole in the tests;
// the gate goes red and names it. Pure kernels must also never throw on garbage.
//
// Usage: node gate.mjs   (exit 0 = clean, exit 1 = survivors)
// Baselining a survivor requires a written reason in BASELINE below.

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runChecks } from './test/checks.mjs';

const KERNEL = new URL('./src/kernel.mjs', import.meta.url);
const SRC = readFileSync(KERNEL, 'utf8');

// Each mutation: { id, find, replace, note }. `find` MUST occur exactly once in
// the source (sync check) so a refactor can't silently make a mutation a no-op.
const MUTATIONS = [
  { id: 'luhn-invert', find: 'return sum % 10 === 0;', replace: 'return sum % 10 !== 0;', note: 'break Luhn gate -> card redaction fails' },
  { id: 'flag-and-to-or', find: 'if (claimsDone && !hasReceipt && !hasLink) {', replace: 'if (claimsDone && !hasReceipt || !hasLink) {', note: 'flag logic && -> || should mis-flag clean lines' },
  { id: 'flag-drop-done', find: 'const claimsDone = DONE_RE.test(what);', replace: 'const claimsDone = false;', note: 'never detect done -> flagged branch dies' },
  { id: 'card-range', find: '(?:\\d[ -]?){13,19}', replace: '(?:\\d[ -]?){19,19}', note: 'only 19-digit runs -> 16-digit cards leak' },
  { id: 'email-break', find: "s = s.replace(/\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}\\b/g, '[REDACTED:email]');", replace: 's = s;', note: 'drop email redaction -> emails leak' },
  { id: 'gh-token-break', find: "['gh-token', /\\bgh[pousr]_[A-Za-z0-9]{20,}\\b/g],", replace: "['gh-token', /\\bZZNOMATCHZZ\\b/g],", note: 'disable gh-token rule -> tokens leak' },
  { id: 'validate-require', find: "if (!KINDS.includes(src.kind)) errors.push(`kind: must be one of ${KINDS.join('|')}`);", replace: 'if (false) errors.push("x");', note: 'stop validating kind -> bad kind accepted' },
  { id: 'rollup-sort', find: 'if (a.line.ts < b.line.ts) return 1;', replace: 'if (a.line.ts < b.line.ts) return -1;', note: 'flip sort order -> golden/ordering checks fail' },
  { id: 'needs-simon-flags', find: 'if (line && Array.isArray(line.flags) && line.flags.length > 0) return true;', replace: 'if (false) return true;', note: 'flagged lines no longer surface to Simon' },
];

const BASELINE = {
  // id: 'reason the survivor is acceptable' — none. Empty = zero tolerated.
};

function assertSingleOccurrence(id, find) {
  const n = SRC.split(find).length - 1;
  if (n !== 1) throw new Error(`mutation ${id}: find-string occurs ${n}x (need exactly 1) — gate is out of sync with kernel`);
}

async function runMutant(dir, id, mutatedSrc) {
  const file = join(dir, `kernel.${id}.mjs`);
  writeFileSync(file, mutatedSrc, 'utf8');
  const mod = await import(pathToFileURL(file).href);
  return runChecks(mod);
}

const dir = mkdtempSync(join(tmpdir(), 'bot-team-gate-'));
let killed = 0;
const survivors = [];
try {
  // sanity: the real kernel must pass every check first.
  const base = await import(KERNEL.href);
  const clean = runChecks(base);
  if (clean.failures.length) {
    console.error('GATE ABORT — the real kernel fails its own checks:');
    for (const f of clean.failures) console.error(`  ✗ ${f.name}: ${f.err}`);
    process.exit(1);
  }

  for (const m of MUTATIONS) {
    assertSingleOccurrence(m.id, m.find);
    const mutated = SRC.replace(m.find, m.replace);
    let res;
    try { res = await runMutant(dir, m.id, mutated); }
    catch (e) { res = { total: 0, passed: 0, failures: [{ name: 'import/throw', err: e.message }] }; }
    if (res.failures.length > 0) { killed++; console.error(`  ✓ killed ${m.id} (${res.failures.length} check(s) caught it) — ${m.note}`); }
    else if (BASELINE[m.id]) { killed++; console.error(`  ~ baselined ${m.id}: ${BASELINE[m.id]}`); }
    else { survivors.push(m); console.error(`  ✗ SURVIVED ${m.id} — ${m.note}`); }
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

const total = MUTATIONS.length;
console.error(`\nmutation gate: ${killed}/${total} mutants killed`);
if (survivors.length) {
  console.error(`RED — ${survivors.length} survivor(s): ${survivors.map((s) => s.id).join(', ')}`);
  process.exit(1);
}
console.error('GREEN — gate clean');
