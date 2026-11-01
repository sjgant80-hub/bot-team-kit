// kernel.mjs — pure functions for the shared bot-team feed.
// No I/O, no clock, no randomness. Every function is total: it never throws on
// garbage input (coerces instead). This is the gated surface — the mutation gate
// (gate.mjs) targets the named constants and operators below, so keep them stable.

export const KINDS = [
  'task', 'handoff', 'build', 'receipt',
  'listing', 'post', 'lead', 'decision', 'blocker', 'note',
];

// ---- redaction -------------------------------------------------------------
// Each rule is [name, regex]. Applied in order; later rules see earlier output.
// Order matters: block-structured secrets (keys, JWTs) before loose tokens,
// loose tokens before emails, cards last (digit-group scan).
export const REDACTIONS = [
  ['private-key', /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z]+ )?PRIVATE KEY-----/g],
  ['jwt', /\beyJ[A-Za-z0-9_-]{6,}\.eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/g],
  ['gh-token', /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g],
  ['slack-token', /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g],
  ['aws-key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
  ['google-key', /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ['openai-key', /\bsk-(?:ant-)?[A-Za-z0-9_-]{16,}\b/g],
  ['labelled-secret', /\b(?:api[_-]?key|secret|token|password|passwd|bearer)\b["':=\s]+[A-Za-z0-9._\/+-]{12,}/gi],
];

// Luhn check for card-number candidates. Pure, total.
export function luhnValid(digits) {
  const s = String(digits).replace(/\D/g, '');
  if (s.length < 13 || s.length > 19) return false;
  let sum = 0;
  let dbl = false;
  for (let i = s.length - 1; i >= 0; i--) {
    let d = s.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return false;
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

// Replace keys/tokens/emails/card numbers with [REDACTED:type]. Never throws.
export function redact(value) {
  if (value === null || value === undefined) return value;
  let s = String(value);
  for (const [name, re] of REDACTIONS) {
    s = s.replace(re, `[REDACTED:${name}]`);
  }
  // emails, after token rules so key-looking locals are already gone
  s = s.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[REDACTED:email]');
  // card numbers: scan 13-19 digit runs (allowing space/dash separators), Luhn-gate
  s = s.replace(/\b(?:\d[ -]?){13,19}\b/g, (m) => (luhnValid(m) ? '[REDACTED:card]' : m));
  return s;
}

// Deep-redact every string in a feed line (object). Returns a new object.
export function redactLine(line) {
  const out = {};
  const src = (line && typeof line === 'object') ? line : {};
  for (const k of Object.keys(src)) {
    const v = src[k];
    out[k] = (typeof v === 'string') ? redact(v) : v;
  }
  return out;
}

// ---- flag ------------------------------------------------------------------
// §3: a "done" claim with no receipt link is auto-flagged.
const DONE_RE = /\b(?:done|shipped|complete(?:d)?|finished|landed)\b/i;

export function flagsFor(line) {
  const src = (line && typeof line === 'object') ? line : {};
  const what = typeof src.what === 'string' ? src.what : '';
  const hasReceipt = typeof src.receipt_sha256 === 'string' && /^[0-9a-f]{64}$/i.test(src.receipt_sha256);
  const hasLink = typeof src.link === 'string' && src.link.trim().length > 0;
  const flags = [];
  const claimsDone = DONE_RE.test(what);
  if (claimsDone && !hasReceipt && !hasLink) {
    flags.push('done-without-receipt');
  }
  return flags;
}

// ---- validate --------------------------------------------------------------
export function validateLine(line) {
  const errors = [];
  const src = (line && typeof line === 'object') ? line : {};
  if (typeof src.ts !== 'string' || src.ts.length === 0) errors.push('ts: required non-empty string (ISO 8601)');
  if (typeof src.agent !== 'string' || src.agent.length === 0) errors.push('agent: required non-empty string');
  if (!KINDS.includes(src.kind)) errors.push(`kind: must be one of ${KINDS.join('|')}`);
  if (typeof src.what !== 'string' || src.what.length === 0) errors.push('what: required non-empty string');
  if (src.receipt_sha256 !== undefined && !/^[0-9a-f]{64}$/i.test(String(src.receipt_sha256))) {
    errors.push('receipt_sha256: must be 64 hex chars when present');
  }
  return { ok: errors.length === 0, errors };
}

// Build the canonical line to persist: redacted + flagged. Pure.
export function normalizeLine(line) {
  const redacted = redactLine(line);
  const flags = flagsFor(redacted);
  const out = { ...redacted };
  if (flags.length > 0) out.flags = flags;
  return out;
}

// ---- rollup ----------------------------------------------------------------
// Deterministic daily rollup grouped by persona, NEEDS SIMON at the top.
// Pure: given the same lines + date string, returns byte-identical markdown.
const NEEDS_SIMON = new Set(['decision', 'blocker', 'listing', 'post']);

function needsSimon(line) {
  if (line && line.needs_owner && String(line.needs_owner).toLowerCase() === 'simon') return true;
  if (line && NEEDS_SIMON.has(line.kind)) return true;
  if (line && Array.isArray(line.flags) && line.flags.length > 0) return true;
  return false;
}

function fmtLine(line) {
  const kind = line.kind || 'note';
  const what = line.what || '';
  const ref = line.receipt_sha256 ? ` [receipt:${String(line.receipt_sha256).slice(0, 12)}]` : (line.link ? ` (${line.link})` : '');
  const flagged = Array.isArray(line.flags) && line.flags.length ? ` ⚑ FLAGGED: ${line.flags.join(', ')}` : '';
  return `- [${kind}] ${what}${ref}${flagged}`;
}

// Stable descending sort by ts (newest first); ties keep input order.
function byTsDesc(a, b) {
  if (a.line.ts < b.line.ts) return 1;
  if (a.line.ts > b.line.ts) return -1;
  return a.i - b.i;
}

export function rollup(lines, dateStr) {
  const arr = Array.isArray(lines) ? lines : [];
  const indexed = arr
    .filter((l) => l && typeof l === 'object')
    .map((line, i) => ({ line, i }));

  const simon = indexed.filter((x) => needsSimon(x.line)).sort(byTsDesc);

  const personas = [...new Set(indexed.map((x) => String(x.line.agent || 'unknown')))].sort();

  const out = [];
  out.push(`# AGENT_FEED — ${dateStr}`);
  out.push('');
  out.push('## NEEDS SIMON');
  if (simon.length === 0) {
    out.push('- none');
  } else {
    for (const x of simon) out.push(`${fmtLine(x.line)} — from ${x.line.agent || 'unknown'}`);
  }
  out.push('');
  for (const p of personas) {
    const rows = indexed.filter((x) => String(x.line.agent || 'unknown') === p).sort(byTsDesc);
    out.push(`## ${p}`);
    for (const x of rows) out.push(fmtLine(x.line));
    out.push('');
  }
  return out.join('\n').replace(/\n+$/, '\n');
}
