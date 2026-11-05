// feed.mjs — I/O wrapper around the pure kernel. Appends one redacted, flagged,
// validated JSON line to the shared feed. The MASTER feed lives on the box
// (default ~/.estate/feed.jsonl); a private shared repository can mirror it.
//
// Library use:
//   import { append } from './feed.mjs'
//   append({ agent: 'BUILDER', kind: 'build', what: '...', receipt_sha256: '...' })
//
// CLI:
//   node src/feed.mjs --agent BUILDER --kind build --what "..." [--link URL]
//       [--receipt SHA256] [--needs-owner Simon] [--feed PATH]

import { appendFileSync, mkdirSync, readFileSync, existsSync, realpathSync } from 'node:fs';
import { dirname } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { normalizeLine, validateLine } from './kernel.mjs';

export function defaultFeedPath() {
  return process.env.BOT_TEAM_FEED || `${homedir()}/.estate/feed.jsonl`;
}

// Append a line. Returns { ok, line, errors }. Redacts + flags before validate,
// so a secret in any field can never reach disk, and a rejected line comes back
// redacted too. The caller may pass `now` (a Date) for a fixed clock.
export function append(input, feedPath = defaultFeedPath(), now = new Date()) {
  let line;
  try {
    const withTs = { ts: now.toISOString(), ...input };
    if (typeof withTs.ts !== 'string' || withTs.ts.length === 0) withTs.ts = now.toISOString();
    line = normalizeLine(withTs);
  } catch {
    return { ok: false, line: {}, errors: ['input: could not be read'] };
  }
  const check = validateLine(line);
  if (!check.ok) return { ok: false, line, errors: check.errors };
  mkdirSync(dirname(feedPath), { recursive: true });
  appendFileSync(feedPath, JSON.stringify(line) + '\n', 'utf8');
  return { ok: true, line, errors: [] };
}

// Read + parse the feed. { lines, unreadable }: every parsed object line, and how
// many non-blank lines could not be read (so the rollup can tell Simon).
export function readFeedReport(feedPath = defaultFeedPath()) {
  if (!existsSync(feedPath)) return { lines: [], unreadable: 0 };
  const raw = readFileSync(feedPath, 'utf8');
  const lines = [];
  let unreadable = 0;
  for (const l of raw.split('\n')) {
    const t = l.trim();
    if (!t) continue;
    let v;
    try { v = JSON.parse(t); } catch { unreadable++; continue; }
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) lines.push(v);
    else unreadable++;
  }
  return { lines, unreadable };
}

// Read + parse the feed into an array of lines (skips blank/corrupt lines).
export function readFeed(feedPath = defaultFeedPath()) {
  return readFeedReport(feedPath).lines;
}

// --name value pairs; a flag with no value (or followed by another flag) is
// left out rather than swallowing the next flag.
export function parseArgs(argv) {
  const a = {};
  let key = null;
  for (const t of Array.isArray(argv) ? argv : []) {
    if (typeof t === 'string' && t.startsWith('--')) { key = t.slice(2); continue; }
    if (key !== null && typeof t === 'string') a[key] = t;
    key = null;
  }
  return a;
}

// Is this module the program being run (not merely imported by a script whose
// name happens to end the same way)?
export function isMain(metaUrl, argv1) {
  if (typeof argv1 !== 'string' || argv1.length === 0) return false;
  try { return pathToFileURL(realpathSync(argv1)).href === metaUrl; } catch { return false; }
}

export function main(argv) {
  const a = parseArgs(argv);
  const input = {
    agent: a.agent,
    kind: a.kind,
    what: a.what,
    link: a.link,
    receipt_sha256: a.receipt,
    needs_owner: a['needs-owner'],
  };
  for (const k of Object.keys(input)) if (input[k] === undefined) delete input[k];
  const res = append(input, a.feed || defaultFeedPath());
  if (!res.ok) {
    console.error('REJECTED:', res.errors.join('; '));
    console.error('redacted line:', JSON.stringify(res.line));
    return 1;
  }
  console.log(JSON.stringify(res.line));
  return 0;
}

if (isMain(import.meta.url, process.argv[1])) process.exitCode = main(process.argv.slice(2));
