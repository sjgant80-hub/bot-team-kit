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
import { runChecks1b } from './test/checks-1b.mjs';

// step 1's checks (test/checks.mjs, unchanged) and step 1b's (test/checks-1b.mjs), scored together
function runAll(K) {
  const a = runChecks(K), b = runChecks1b(K);
  return { total: a.total + b.total, passed: a.passed + b.passed, failures: [...a.failures, ...b.failures] };
}

const KERNEL = new URL('./src/kernel.mjs', import.meta.url);
const SRC = readFileSync(KERNEL, 'utf8');

// Each mutation: { id, find, replace, note }. `find` MUST occur exactly once in
// the source (sync check) so a refactor can't silently make a mutation a no-op.
const MUTATIONS = [
  { id: 'luhn-invert', find: 'return sum % 10 === 0;', replace: 'return sum % 10 !== 0;', note: 'break Luhn gate -> card redaction fails' },
  { id: 'flag-and-to-or', find: 'if (claimed && !hasReceipt && !hasLink) {', replace: 'if (claimed && !hasReceipt || !hasLink) {', note: 'flag logic && -> || should mis-flag clean lines' },
  { id: 'flag-drop-done', find: 'const claimed = claimsDone(src.kind, src.what);', replace: 'const claimed = false;', note: 'never detect done -> flagged branch dies' },
  { id: 'card-range', find: '(?:\\d[ -]?){13,19}', replace: '(?:\\d[ -]?){19,19}', note: 'only 19-digit runs -> 16-digit cards leak' },
  { id: 'email-break', find: "s = s.replace(/\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}\\b/g, '[REDACTED:email]');", replace: 's = s;', note: 'drop email redaction -> emails leak' },
  { id: 'gh-token-break', find: "['gh-token', /\\bgh[pousr]_[A-Za-z0-9]{20,}\\b/g],", replace: "['gh-token', /\\bZZNOMATCHZZ\\b/g],", note: 'disable gh-token rule -> tokens leak' },
  { id: 'validate-require', find: "if (!KINDS.includes(src.kind)) errors.push(`kind: must be one of ${KINDS.join('|')}`);", replace: 'if (false) errors.push("x");', note: 'stop validating kind -> bad kind accepted' },
  { id: 'rollup-sort', find: 'return [...by.keys()].sort().reverse().flatMap((ts) => by.get(ts));', replace: 'return [...by.keys()].sort().flatMap((ts) => by.get(ts));', note: 'flip sort order -> golden/ordering checks fail' },
  { id: 'needs-simon-flags', find: 'if (Array.isArray(line.flags) && line.flags.length > 0) return true;', replace: 'if (false) return true;', note: 'flagged lines no longer surface to Simon' },
  // step 1b (CLAIMS-1b): the list grows, never shrinks
  { id: 'list-redact-off', find: 'out.push(scrub(read(v, i), depth + 1, seen));', replace: 'out.push(read(v, i));', note: 'lists stored unread -> a token in a list reaches disk' },
  { id: 'card-neighbour-off', find: "return luhnValid(groups.join('')) || luhnValid(groups.slice(1).join('')) || luhnValid(groups.slice(0, -1).join(''));", replace: "return luhnValid(groups.join(''));", note: 'whole run only -> a card followed by its security code leaks' },
  { id: 'key-end-required', find: 'PRIVATE KEY(?: BLOCK)?-----|$)/g]', replace: 'PRIVATE KEY(?: BLOCK)?-----)/g]', note: 'a private key without its end line leaks' },
  { id: 'password-rule-off', find: "['password', /(?<![A-Za-z0-9])pass(?:word|wd|phrase|code)", replace: "['password', /ZZNOMATCHZZ(?:word|wd|phrase|code)", note: 'a passphrase of plain words leaks' },
  { id: 'negation-off', find: '!w.slice(Math.max(0, i - 3), i).some(negates)', replace: 'true', note: '"not merged yet" is flagged as a claim' },
  { id: 'proof-any-text', find: 'const hasLink = isProof(src.link);', replace: "const hasLink = typeof src.link === 'string' && src.link.trim().length > 0;", note: 'any non-empty link counts as proof again' },
  { id: 'oneline-off', find: "safeText(v).replace(/[\\r\\n\\u2028\\u2029\\u0085\\v\\f]+/g, ' ')", replace: 'safeText(v)', note: 'a line break in a field forges a heading in the rollup' },
  { id: 'printed-no-redact', find: 'export const printed = (v) => redact(oneLine(v));', replace: 'export const printed = (v) => oneLine(v);', note: 'a secret written straight to the feed reaches the rollup' },
  { id: 'unreadable-silent', find: 'if (lost) out.push(', replace: 'if (false) out.push(', note: 'unreadable lines vanish without telling Simon' },
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
  return runAll(mod);
}

const dir = mkdtempSync(join(tmpdir(), 'bot-team-gate-'));
let killed = 0;
const survivors = [];
try {
  // sanity: the real kernel must pass every check first.
  const base = await import(KERNEL.href);
  const clean = runAll(base);
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
