// io.test.mjs — the two I/O organs (src/feed.mjs, src/rollup.mjs): what reaches disk, what comes back, the CLIs, the
// import guard, and the egress claim (E1: nothing but the filesystem). Temp folders only; secrets assembled at run time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { append, readFeed, readFeedReport, defaultFeedPath, parseArgs, isMain, main as feedMain } from '../src/feed.mjs';
import { buildRollup, main as rollupMain } from '../src/rollup.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const FEED = join(root, 'src', 'feed.mjs');
const ROLL = join(root, 'src', 'rollup.mjs');
const A = 'Zq7Xw3Kp9Lm2Rt5Vb8Nc4Hd6Jf1Gs0YaEuIoPy';
const fill = (n) => Array.from({ length: n }, (_, i) => A[i % A.length]).join('');
const NOW = new Date('2026-11-04T09:00:00.000Z');
const tmp = () => mkdtempSync(join(tmpdir(), 'btk-io-'));
const env = (extra) => { const e = { ...process.env, ...extra }; delete e.NODE_TEST_CONTEXT; return e; };
const run = (file, args, extra = {}) => spawnSync(process.execPath, [file, ...args], { encoding: 'utf8', env: env(extra) });

// The default feed is pinned to a temp file for this whole suite (and every CLI it spawns), so no test — and no
// mutant witness makes of these organs — can ever write to the real ~/.estate/feed.jsonl.
const SANDBOX = tmp();
process.env.BOT_TEAM_FEED = join(SANDBOX, 'default-feed.jsonl');
process.on('exit', () => rmSync(SANDBOX, { recursive: true, force: true }));

test('append · writes one redacted, flagged line with the clock it was given, and creates the folder', () => {
  const d = tmp();
  try {
    const feed = join(d, 'deep', 'feed.jsonl');
    const tok = 'ghp_' + fill(36);
    const r = append({ agent: 'BUILDER', kind: 'build', what: `shipped with ${tok}`, meta: { mail: 'dana.r@example.org' } }, feed, NOW);
    assert.equal(r.ok, true);
    assert.deepEqual(r.errors, []);
    const want = { ts: '2026-11-04T09:00:00.000Z', agent: 'BUILDER', kind: 'build', what: 'shipped with [REDACTED:gh-token]', meta: { mail: '[REDACTED:email]' }, flags: ['done-without-receipt'] };
    assert.deepEqual(r.line, want);
    const disk = readFileSync(feed, 'utf8');
    assert.equal(disk, JSON.stringify(want) + '\n');
    assert.equal(disk.includes(tok), false);
    append({ agent: 'KAR', kind: 'note', what: 'second' }, feed, NOW);
    assert.equal(readFileSync(feed, 'utf8').split('\n').length, 3);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('append · a caller ts is kept when it is text, replaced when missing, blank or not text', () => {
  const d = tmp();
  try {
    const feed = join(d, 'f.jsonl');
    assert.equal(append({ ts: '2026-01-01T00:00:00Z', agent: 'KAR', kind: 'note', what: 'x' }, feed, NOW).line.ts, '2026-01-01T00:00:00Z');
    for (const ts of [undefined, '', 5, null]) {
      assert.equal(append({ ts, agent: 'KAR', kind: 'note', what: 'x' }, feed, NOW).line.ts, '2026-11-04T09:00:00.000Z', String(ts));
    }
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('append · a rejected line is not written, and comes back redacted', () => {
  const d = tmp();
  try {
    const feed = join(d, 'f.jsonl');
    const tok = 'ghp_' + fill(36);
    const r = append({ agent: 'KAR', kind: 'nope', what: `bad ${tok}` }, feed, NOW);
    assert.equal(r.ok, false);
    assert.equal(r.errors.length, 1);
    assert.equal(r.line.what, 'bad [REDACTED:gh-token]');
    assert.equal(existsSync(feed), false);
    const bad = append({ get agent() { throw new Error('x'); } }, feed, NOW);
    assert.deepEqual(bad, { ok: false, line: {}, errors: ['input: could not be read'] });
    assert.deepEqual(append({ agent: 'KAR', kind: 'note', what: 'x' }, feed, new Date('nope')).ok, false);
    assert.equal(existsSync(feed), false);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('readFeedReport · counts every unreadable non-blank line; skips blanks; non-object JSON is unreadable too', () => {
  const d = tmp();
  try {
    const feed = join(d, 'f.jsonl');
    assert.deepEqual(readFeedReport(feed), { lines: [], unreadable: 0 });
    assert.deepEqual(readFeed(feed), []);
    writeFileSync(feed, '{"a":1}\n\n   \n{"b":\nnot json\n[1,2]\n42\nnull\n{"c":3}\n');
    assert.deepEqual(readFeedReport(feed), { lines: [{ a: 1 }, { c: 3 }], unreadable: 5 });
    assert.deepEqual(readFeed(feed), [{ a: 1 }, { c: 3 }]);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('buildRollup · the unreadable count reaches NEEDS SIMON; the date defaults to today', () => {
  const d = tmp();
  try {
    const feed = join(d, 'f.jsonl');
    writeFileSync(feed, '{"ts":"2026-11-04T09:00:00Z","agent":"KAR","kind":"note","what":"good"}\n{"broken\n');
    const md = buildRollup(feed, '2026-11-04');
    assert.ok(md.startsWith('# AGENT_FEED — 2026-11-04\n\n## NEEDS SIMON\n- [blocker] unreadable feed lines left out of this rollup: 1 — from FEED\n'));
    assert.ok(md.includes('## KAR\n- [note] good\n'));
    const today = new Date().toISOString().slice(0, 10);
    assert.ok(buildRollup(feed).startsWith(`# AGENT_FEED — ${today}\n`));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('defaultFeedPath · BOT_TEAM_FEED wins, else ~/.estate/feed.jsonl', () => {
  const saved = process.env.BOT_TEAM_FEED;
  try {
    process.env.BOT_TEAM_FEED = '/x/y.jsonl';
    assert.equal(defaultFeedPath(), '/x/y.jsonl');
    delete process.env.BOT_TEAM_FEED;
    assert.ok(defaultFeedPath().endsWith('/.estate/feed.jsonl'));
  } finally { process.env.BOT_TEAM_FEED = saved; }
});

test('the suite never touches the real default feed: a --feed flag always wins over the default', () => {
  const d = tmp();
  const log = console.log;
  try {
    console.log = () => {};
    const feed = join(d, 'own.jsonl');
    assert.equal(feedMain(['--feed', feed, '--agent', 'KAR', '--kind', 'note', '--what', 'mine']), 0);
    assert.equal(existsSync(feed), true);
    assert.equal(existsSync(process.env.BOT_TEAM_FEED), false);
  } finally { console.log = log; rmSync(d, { recursive: true, force: true }); }
});

test('parseArgs · pairs, a flag without a value is left out, stray words skipped', () => {
  assert.deepEqual(parseArgs(['--agent', 'KAR', 'stray', '--what', 'x y']), { agent: 'KAR', what: 'x y' });
  assert.deepEqual(parseArgs(['--what', '--kind', 'note']), { kind: 'note' });
  assert.deepEqual(parseArgs(['--kind', 'note', '--what']), { kind: 'note' });
  assert.deepEqual(parseArgs([5, '--a', 'b']), { a: 'b' });
  assert.deepEqual(parseArgs(null), {});
});

test('isMain · true only for the file actually run', () => {
  assert.equal(isMain(pathToFileURL(FEED).href, FEED), true);
  assert.equal(isMain(pathToFileURL(FEED).href, ROLL), false);
  assert.equal(isMain(pathToFileURL(FEED).href, ''), false);
  assert.equal(isMain(pathToFileURL(FEED).href, undefined), false);
  assert.equal(isMain(pathToFileURL(FEED).href, join(root, 'no-such-file.mjs')), false);
});

test('feed main · writes and prints the line (0); a bad line prints REJECTED and the redacted line (1)', () => {
  const d = tmp();
  const log = console.log, err = console.error;
  const out = [];
  try {
    console.log = (...a) => out.push(['log', a.join(' ')]);
    console.error = (...a) => out.push(['err', a.join(' ')]);
    const feed = join(d, 'f.jsonl');
    assert.equal(feedMain(['--feed', feed, '--agent', 'KAR', '--kind', 'note', '--what', 'hello', '--link', 'https://x/y', '--needs-owner', 'Simon']), 0);
    const line = JSON.parse(out[0][1]);
    assert.deepEqual([line.agent, line.kind, line.what, line.link, line.needs_owner], ['KAR', 'note', 'hello', 'https://x/y', 'Simon']);
    assert.equal('receipt_sha256' in line, false);
    assert.equal(feedMain(['--feed', feed, '--agent', 'KAR', '--kind', 'build', '--what', 'gated', '--receipt', 'a'.repeat(64)]), 0);
    assert.equal(JSON.parse(out[1][1]).receipt_sha256, 'a'.repeat(64));
    out.length = 0;
    assert.equal(feedMain(['--feed', feed, '--agent', 'KAR', '--kind', 'nope', '--what', 'x']), 1);
    assert.equal(out[0][0], 'err');
    assert.ok(out[0][1].startsWith('REJECTED: kind'));
    assert.ok(out[1][1].startsWith('redacted line: {'));
    assert.equal(readFileSync(feed, 'utf8').trim().split('\n').length, 2);
  } finally { console.log = log; console.error = err; rmSync(d, { recursive: true, force: true }); }
});

test('rollup main · --out writes the file, otherwise stdout', () => {
  const d = tmp();
  const write = process.stdout.write, err = console.error;
  let printed = '';
  try {
    const feed = join(d, 'f.jsonl');
    writeFileSync(feed, '{"ts":"2026-11-04T09:00:00Z","agent":"KAR","kind":"decision","what":"sign it"}\n');
    console.error = () => {};
    assert.equal(rollupMain(['--feed', feed, '--date', '2026-11-04', '--out', join(d, 'AGENT_FEED.md')]), 0);
    assert.ok(readFileSync(join(d, 'AGENT_FEED.md'), 'utf8').includes('- [decision] sign it — from KAR'));
    process.stdout.write = (s) => { printed += s; return true; };
    assert.equal(rollupMain(['--feed', feed, '--date', '2026-11-04']), 0);
    process.stdout.write = write;
    assert.ok(printed.startsWith('# AGENT_FEED — 2026-11-04\n'));
  } finally { process.stdout.write = write; console.error = err; rmSync(d, { recursive: true, force: true }); }
});

test('the CLIs run as programs, and do not run when a script merely named like them imports them', () => {
  const d = tmp();
  try {
    const feed = join(d, 'f.jsonl');
    const w = run(FEED, ['--feed', feed, '--agent', 'KAR', '--kind', 'note', '--what', 'from the cli']);
    assert.equal(w.status, 0, w.stderr);
    assert.equal(JSON.parse(w.stdout).what, 'from the cli');
    const bad = run(FEED, ['--feed', feed, '--agent', 'KAR', '--kind', 'nope', '--what', 'x']);
    assert.equal(bad.status, 1);
    assert.ok(bad.stderr.includes('REJECTED'));
    const r = run(ROLL, ['--feed', feed, '--date', '2026-11-04']);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('- [note] from the cli'));
    // a bot's own script called my-feed.mjs / my-rollup.mjs that imports the kit must not trigger either CLI
    mkdirSync(join(d, 'bot'));
    for (const name of ['my-feed.mjs', 'my-rollup.mjs']) {
      const script = join(d, 'bot', name);
      writeFileSync(script, `import '${pathToFileURL(FEED).href}';\nimport '${pathToFileURL(ROLL).href}';\nconsole.log('imported');\n`);
      const s = run(script, ['--feed', join(d, 'never.jsonl'), '--agent', 'KAR', '--kind', 'note', '--what', 'x']);
      assert.equal(s.status, 0, s.stderr);
      assert.equal(s.stdout, 'imported\n');
      assert.equal(existsSync(join(d, 'never.jsonl')), false);
    }
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('E1 · the three organs import nothing but the filesystem helpers and each other: no network, no processes', () => {
  const allowed = new Set(['node:fs', 'node:path', 'node:os', 'node:url', './kernel.mjs', './feed.mjs']);
  for (const f of ['kernel.mjs', 'feed.mjs', 'rollup.mjs']) {
    const src = readFileSync(join(root, 'src', f), 'utf8');
    const specs = [...src.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
    for (const s of specs) assert.ok(allowed.has(s), `${f} imports ${s}`);
    assert.equal(/\bimport\s*\(/.test(src), false, `${f} has a dynamic import`);
    assert.equal(/\b(?:fetch|XMLHttpRequest|WebSocket|require)\s*\(/.test(src), false, `${f} reaches for the network or require`);
    assert.equal(/child_process|node:net|node:http|node:https|node:dgram|node:tls/.test(src), false, `${f} names a network or process module`);
  }
});
