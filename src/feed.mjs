// feed.mjs — I/O wrapper around the pure kernel. Appends one redacted, flagged,
// validated JSON line to the shared feed. The MASTER feed lives on the box
// (default ~/.estate/feed.jsonl); estate-continuity mirrors it.
//
// Library use:
//   import { append } from './feed.mjs'
//   append({ agent: 'BUILDER', kind: 'build', what: '...', receipt_sha256: '...' })
//
// CLI:
//   node src/feed.mjs --agent BUILDER --kind build --what "..." [--link URL]
//       [--receipt SHA256] [--needs-owner Simon] [--feed PATH]

import { appendFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { homedir } from 'node:os';
import { normalizeLine, validateLine } from './kernel.mjs';

export function defaultFeedPath() {
  return process.env.BOT_TEAM_FEED || `${homedir()}/.estate/feed.jsonl`;
}

// Append a line. Returns { ok, line, errors }. Redacts + flags before validate,
// so a secret in `what` can never reach disk even if the line is rejected.
export function append(input, feedPath = defaultFeedPath(), now = new Date()) {
  const withTs = { ts: now.toISOString(), ...input };
  if (!withTs.ts || typeof withTs.ts !== 'string') withTs.ts = now.toISOString();
  const line = normalizeLine(withTs);
  const check = validateLine(line);
  if (!check.ok) return { ok: false, line, errors: check.errors };
  mkdirSync(dirname(feedPath), { recursive: true });
  appendFileSync(feedPath, JSON.stringify(line) + '\n', 'utf8');
  return { ok: true, line, errors: [] };
}

// Read + parse the feed into an array of lines (skips blank/corrupt lines).
export function readFeed(feedPath = defaultFeedPath()) {
  if (!existsSync(feedPath)) return [];
  const raw = readFileSync(feedPath, 'utf8');
  const out = [];
  for (const l of raw.split('\n')) {
    const t = l.trim();
    if (!t) continue;
    try { out.push(JSON.parse(t)); } catch { /* skip corrupt line */ }
  }
  return out;
}

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i];
    if (!k || !k.startsWith('--')) continue;
    a[k.slice(2)] = argv[i + 1];
  }
  return a;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('feed.mjs')) {
  const a = parseArgs(process.argv.slice(2));
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
    process.exit(1);
  }
  console.log(JSON.stringify(res.line));
}
