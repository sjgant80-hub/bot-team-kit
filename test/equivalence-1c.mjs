// test/equivalence-1c.mjs — the check behind the one survivor tools/witness.baseline.json exempts (CLAIMS-1c G3).
// An exemption must be checked, not argued. This builds the exact mutant witness reports — the outer loop bound of
// jsStrings' code walker, `while (i < s.length) {` flipped to `<=` — and compares it with the real rules on every
// string the walker can branch on: exhaustive over the characters it tests for, up to length 6, then random strings.
// Any difference fails, and the exemption with it. Run by CI as its own step, outside the suites witness runs.
//   node test/equivalence-1c.mjs
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'tools', 'page-rules.mjs');
const LINE = 'while (i < s.length) {';
const MUTANT = 'while (i <= s.length) {';

const src = readFileSync(SRC, 'utf8');
const baseline = JSON.parse(readFileSync(join(root, 'tools', 'witness.baseline.json'), 'utf8'));
const entry = baseline.find((e) => e.snippet === LINE && e.mutation === '< → <=');
if (!entry) { console.error('no baseline entry for the outer bound — nothing to check'); process.exit(1); }
const hits = src.split('\n').filter((l) => l.trim() === LINE).length;
if (hits !== 1) { console.error(`expected the baselined line exactly once in tools/page-rules.mjs, found ${hits}`); process.exit(1); }

const tmp = mkdtempSync(join(tmpdir(), 'btk-equiv-'));
try {
  const real = join(tmp, 'real.mjs'), mutant = join(tmp, 'mutant.mjs');
  writeFileSync(real, src);
  writeFileSync(mutant, src.replace(LINE, MUTANT));
  const A = (await import(pathToFileURL(real).href)).jsStrings;
  const B = (await import(pathToFileURL(mutant).href)).jsStrings;

  // every character the walker and its two readers compare against, plus one ordinary letter
  const ALPHA = ['/', '*', "'", '"', '`', '\\', '$', '{', '}', '\n', 'a'];
  let n = 0, diff = null;
  const same = (s) => { n++; const a = JSON.stringify(A(s)), b = JSON.stringify(B(s)); if (a !== b && !diff) diff = { s, a, b }; };
  const walk = (prefix, depth) => { same(prefix); if (depth === 0) return; for (const c of ALPHA) walk(prefix + c, depth - 1); };
  walk('', 6);
  let seed = 7;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let k = 0; k < 100000; k++) {
    let s = '';
    const len = 7 + Math.floor(rand() * 18);
    for (let j = 0; j < len; j++) s += ALPHA[Math.floor(rand() * ALPHA.length)];
    same(s);
  }
  for (const g of [undefined, null, 0, {}, [], 'x']) same(g);
  if (diff) { console.error(`NOT equivalent on ${JSON.stringify(diff.s)}: real ${diff.a}, mutant ${diff.b}`); process.exitCode = 1; }
  else console.error(`equivalent on all ${n} inputs: the baselined mutant of jsStrings' outer bound changes no output`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
