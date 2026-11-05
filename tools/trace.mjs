// tools/trace.mjs — T1: one real run, recorded for the page's "How it works". Three bots write through the real
// append() (fixed clock) into a temporary feed; the real buildRollup() reads it back. Every stage of the first two
// lines is recorded with the kernel's own functions, so the page's diagram shows what the code did, not a drawing.
//   node tools/trace.mjs           write receipts/trace.json
//   node tools/trace.mjs --check   re-derive and compare byte for byte (CI)
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { append } from '../src/feed.mjs';
import { buildRollup } from '../src/rollup.mjs';
import { redactLine, flagsFor, validateLine } from '../src/kernel.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'receipts', 'trace.json');
const DATE = '2026-11-04';

// what each bot hands the writer (the second carries an email and a password, the third claims work with no proof)
const RUN = [
  { at: '2026-11-04T07:10:00.000Z', input: { agent: 'BUILDER', kind: 'build', what: 'built the rollup, every test passed', link: 'receipts/step1b.json' } },
  { at: '2026-11-04T07:20:00.000Z', input: { agent: 'REACH', kind: 'post', what: 'draft post ready; reply to ops@example.com, login password: hunter2-on-the-box' } },
  { at: '2026-11-04T07:30:00.000Z', input: { agent: 'BUILDER', kind: 'build', what: 'shipped the page' } },
  { at: '2026-11-04T07:40:00.000Z', input: { agent: 'AUDITOR', kind: 'note', what: 'PASS: the rollup build, receipt re-run clean', link: 'receipts/step1b.json' } },
];

const dir = mkdtempSync(join(tmpdir(), 'btk-trace-'));
let trace;
try {
  const feed = join(dir, 'feed.jsonl');
  const steps = RUN.map(({ at, input }) => {
    const stamped = { ts: at, ...input };
    const redacted = redactLine(stamped);
    const flags = flagsFor(redacted);
    const res = append(input, feed, new Date(at));
    return { input, stamped, redacted, flags, valid: validateLine(res.line), stored: res.ok ? res.line : null };
  });
  const disk = readFileSync(feed, 'utf8');
  const rollup = buildRollup(feed, DATE);
  trace = {
    receipt: 'bot-team-kit T1 — one real run through append() and buildRollup(), fixed clock',
    date: DATE,
    steps,
    feedFile: disk.trimEnd().split('\n').map((l) => JSON.parse(l)),
    rollup,
    counts: {
      lines: steps.length,
      stored: steps.filter((s) => s.stored).length,
      redactedFields: steps.reduce((n, s) => n + Object.keys(s.stamped).filter((k) => JSON.stringify(s.stamped[k]) !== JSON.stringify(s.redacted[k])).length, 0),
      flagged: steps.filter((s) => s.flags.length > 0).length,
      needsSimon: rollup.slice(rollup.indexOf('## NEEDS SIMON'), rollup.indexOf('\n\n', rollup.indexOf('## NEEDS SIMON'))).split('\n').filter((l) => l.startsWith('- [')).length,
    },
    reproduce: 'node tools/trace.mjs --check',
  };
} finally {
  rmSync(dir, { recursive: true, force: true });
}

const text = JSON.stringify(trace, null, 2) + '\n';
if (process.argv.includes('--check')) {
  let committed = '';
  try { committed = readFileSync(OUT, 'utf8'); } catch { /* none */ }
  if (committed !== text) { console.error('receipts/trace.json does not re-derive from the code:\n' + text); process.exit(1); }
  console.error('receipts/trace.json re-derived byte for byte');
} else {
  writeFileSync(OUT, text);
  console.error(`wrote receipts/trace.json: ${trace.counts.lines} lines, ${trace.counts.flagged} flagged, ${trace.counts.needsSimon} for Simon`);
}
