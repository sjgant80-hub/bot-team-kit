// kernel.mjs — pure functions for the shared bot-team feed.
// No I/O, no clock, no randomness. Every function is total: it never throws on
// garbage input (coerces instead). This is the gated surface: witness v0.6 flips
// every operator in it on GitHub's runner, and gate.mjs targets the named lines
// below, so keep those stable.
//
// Step 1b (CLAIMS-1b.md) closed what reading step 1 found: redaction now reaches
// nested fields and lists, more secret shapes have rules (a password is taken
// whole, a card in a link's query string is found), a card number next to
// another number is still found, a done-claim is read word by word (and not when
// negated) and by kind, proof has to look like a receipt, a link or a path, and
// the rollup can neither be forged by a line break nor re-print a secret. Several
// rules are ported from ai-first-company's src/feed.mjs (the signed team feed).

export const KINDS = [
  'task', 'handoff', 'build', 'receipt',
  'listing', 'post', 'lead', 'decision', 'blocker', 'note',
];

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const SHA_RE = /^[0-9a-f]{64}$/i;

// ---- redaction -------------------------------------------------------------
// Each rule is [name, regex]. Applied in order; later rules see earlier output.
// Order matters: block-structured secrets (keys, JWTs) before loose tokens,
// loose tokens before labelled values, emails after, cards last (digit-group
// scan; inside a link only the query string is scanned: a post id is not a card).
export const REDACTIONS = [
  ['private-key', /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----[\s\S]*?(?:-----END (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----|$)/g],
  ['jwt', /\beyJ[A-Za-z0-9_-]{6,}\.eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/g],
  ['gh-token', /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g],
  ['gh-fine-grained', /\bgithub_pat_[A-Za-z0-9_]{22,}/g],
  ['slack-token', /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g],
  ['slack-webhook', /\bhttps:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9\/_-]+/g],
  ['aws-key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
  ['google-key', /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ['openai-key', /\bsk-(?:ant-)?[A-Za-z0-9_-]{16,}\b/g],
  ['stripe-key', /\b[rsp]k_(?:live|test)_[A-Za-z0-9]{10,}/g],
  ['xai-key', /\bxai-[A-Za-z0-9]{20,}/g],
  ['npm-token', /\bnpm_[A-Za-z0-9]{30,}/g],
  ['hf-token', /\bhf_[A-Za-z0-9]{30,}/g],
  ['webhook-secret', /\bwhsec_[A-Za-z0-9+\/=]{20,}/g],
  ['auth-header', /\b(?:Proxy-)?Authorization\s*:\s*(?:[A-Za-z]+\s+)?[A-Za-z0-9._~+\/=-]{8,}/gi],
  ['bearer', /\bBearer\s+[A-Za-z0-9._~+\/=-]{12,}/gi],
  // a password or passphrase after its label is taken whole, spaces and all, to the end of its clause — a short
  // password or a phrase of plain words is still a password
  ['password', /(?<![A-Za-z0-9])pass(?:word|wd|phrase|code)(?:[_-][A-Za-z0-9]+)*(?![A-Za-z0-9])["']?\s*[:=]\s*["']?[^\r\n"'<>&,;]+/gi],
  // a labelled value: the label may sit inside a longer name (GITHUB_TOKEN=, client_secret, ?access_token=)
  ['labelled-secret', /(?<![A-Za-z0-9])(?:api[_ -]?key|apikey|secret|token|password|passwd|bearer)(?:[_-][A-Za-z0-9]+)*(?![A-Za-z0-9])["']?\s*[:=]\s*["']?[^\s"'<>\[\]&,;]{8,}/gi],
];

// Luhn check for card-number candidates. Pure, total.
export function luhnValid(digits) {
  let s;
  try { s = String(digits).replace(/\D/g, ''); } catch { return false; }
  if (s.length < 13 || s.length > 19) return false;
  let sum = 0;
  for (let i = 0; i < s.length; i++) {
    const d = s.charCodeAt(s.length - 1 - i) - 48;
    sum += i % 2 === 1 ? (d > 4 ? d * 2 - 9 : d * 2) : d;
  }
  return sum % 10 === 0;
}

// A run of digits holds a card when the whole run, or the run without its first
// or its last group, passes Luhn — so a card followed by its security code or
// expiry, or after a short reference, is still found.
export function cardIn(run) {
  let groups;
  try { groups = String(run).split(/[ -]+/).filter(Boolean); } catch { return false; }
  return luhnValid(groups.join('')) || luhnValid(groups.slice(1).join('')) || luhnValid(groups.slice(0, -1).join(''));
}

const CARD_RUN = /\b(?:\d[ -]?){13,19}\b/g;
const URL_SPLIT = /(\bhttps?:\/\/[^\s<>"']+)/;

const cardsOut = (s) => s.replace(CARD_RUN, (m) => (cardIn(m) ? '[REDACTED:card]' + m.slice(m.replace(/[ -]+$/, '').length) : m));

// Outside links every digit run is scanned. Inside a link only its query string
// is: a post id in a path is not a card, a card pasted as ?card=… still is.
function redactCards(s) {
  return s.split(URL_SPLIT).map((seg, i) => {
    if (i % 2 === 0) return cardsOut(seg);
    const q = seg.indexOf('?');
    return q === -1 ? seg : seg.slice(0, q) + cardsOut(seg.slice(q));
  }).join('');
}

// Replace keys/tokens/emails/card numbers with [REDACTED:type]. Never throws.
export function redact(value) {
  if (value === null || value === undefined) return value;
  let s;
  try { s = String(value); } catch { return '[REDACTED:unreadable]'; }
  for (const [name, re] of REDACTIONS) {
    s = s.replace(re, `[REDACTED:${name}]`);
  }
  // emails, after token rules so key-looking locals are already gone
  s = s.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[REDACTED:email]');
  return redactCards(s);
}

// Deep redaction: every string in the line, in nested objects and lists, keys
// included. A cycle becomes "[circular]"; anything nested deeper than MAX_DEPTH
// is dropped as "[REDACTED:too-deep]" rather than stored unread.
export const MAX_DEPTH = 8;

const read = (v, k) => { try { return v[k]; } catch { return '[unreadable]'; } };
const keysOf = (v) => { try { return Object.keys(v); } catch { return []; } };
const put = (o, k, v) => Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });

function scrub(v, depth, seen) {
  if (typeof v === 'string') return redact(v);
  if (typeof v === 'bigint') return String(v);
  if (v === null || typeof v !== 'object') return v;
  if (seen.has(v)) return '[circular]';
  if (depth > MAX_DEPTH) return '[REDACTED:too-deep]';
  seen.add(v);
  const out = Array.isArray(v) ? [] : {};
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) out.push(scrub(read(v, i), depth + 1, seen));
  } else {
    for (const k of keysOf(v)) put(out, redact(k), scrub(read(v, k), depth + 1, seen));
  }
  seen.delete(v);
  return out;
}

// Deep-redact a feed line (object). Returns a new object; anything else gives {}.
export function redactLine(line) {
  return isObj(line) ? scrub(line, 0, new Set()) : {};
}

// ---- flag ------------------------------------------------------------------
// §3: a "done" claim with no receipt and no proof link is auto-flagged.
// A claim is a done-word that is not negated in the three words before it, or a
// line whose kind is itself a claim (build, receipt).
export const DONE_WORDS = Object.freeze(['done', 'finished', 'complete', 'completed', 'shipped', 'live', 'fixed', 'passed', 'built', 'merged', 'released', 'published', 'deployed', 'delivered', 'verified', 'proven', 'green', 'landed', 'resolved', 'sealed', 'posted', 'sent', 'submitted']);
const NEGATE = Object.freeze(['not', 'no', 'never', 'yet', 'until']);
const CLAIM_KINDS = Object.freeze(['build', 'receipt']);

const wordsOf = (s) => (typeof s === 'string' ? s : '').toLowerCase().replace(/[\u2018\u2019]/g, "'").split(/[^a-z']+/).map((w) => w.replace(/^'+|'+$/g, '')).filter(Boolean);
const negates = (w) => NEGATE.includes(w) || w.endsWith("n't");

export function claimsDone(kind, what) {
  if (CLAIM_KINDS.includes(kind)) return true;
  const w = wordsOf(what);
  return w.some((x, i) => DONE_WORDS.includes(x) && !w.slice(Math.max(0, i - 3), i).some(negates));
}

// Proof is a link that looks like one: an http(s) URL, a repository path, or a
// file name — not "see above", not blank.
export function isProof(link) {
  if (typeof link !== 'string') return false;
  const t = link.trim();
  if (/\s/.test(t)) return false;
  return /^https?:\/\/\S+/i.test(t) || /^[\w.~-]+(?:\/[\w.~-]*)+$/.test(t) || /^[\w~-]+(?:\.[\w~-]+)*\.[A-Za-z0-9]{1,8}$/.test(t);
}

export function flagsFor(line) {
  const src = isObj(line) ? line : {};
  const hasReceipt = typeof src.receipt_sha256 === 'string' && SHA_RE.test(src.receipt_sha256);
  const hasLink = isProof(src.link);
  const flags = [];
  const claimed = claimsDone(src.kind, src.what);
  if (claimed && !hasReceipt && !hasLink) {
    flags.push('done-without-receipt');
  }
  return flags;
}

// ---- validate --------------------------------------------------------------
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const filled = (v) => typeof v === 'string' && v.trim().length > 0;

export function validateLine(line) {
  const errors = [];
  const src = isObj(line) ? line : {};
  if (typeof src.ts !== 'string' || !ISO.test(src.ts) || !Number.isFinite(Date.parse(src.ts))) errors.push('ts: required ISO 8601 time');
  if (!filled(src.agent)) errors.push('agent: required non-empty string');
  if (!KINDS.includes(src.kind)) errors.push(`kind: must be one of ${KINDS.join('|')}`);
  if (!filled(src.what)) errors.push('what: required non-empty string');
  if (src.receipt_sha256 !== undefined && !(typeof src.receipt_sha256 === 'string' && SHA_RE.test(src.receipt_sha256))) {
    errors.push('receipt_sha256: must be 64 hex chars when present');
  }
  if (src.link !== undefined && typeof src.link !== 'string') errors.push('link: must be text when present');
  if (src.needs_owner !== undefined && typeof src.needs_owner !== 'string') errors.push('needs_owner: must be text when present');
  return { ok: errors.length === 0, errors };
}

// Build the canonical line to persist: redacted + flagged. Pure. Callers never
// set flags; the writer computes them from what the line says.
export function normalizeLine(line) {
  const out = redactLine(line);
  delete out.flags;
  const flags = flagsFor(out);
  if (flags.length > 0) out.flags = flags;
  return out;
}

// ---- rollup ----------------------------------------------------------------
// Deterministic daily rollup grouped by persona, NEEDS SIMON at the top.
// Pure: given the same lines + date string, returns byte-identical markdown.
// Every field is printed on one physical line and re-redacted, so a line break
// cannot forge a heading or an item, and a secret written to the feed by some
// other tool does not reach Simon's brief.
const NEEDS_SIMON = new Set(['decision', 'blocker', 'listing', 'post']);
const TOP = 'NEEDS SIMON';

const safeText = (v) => { if (typeof v === 'string') return v; if (v === null || v === undefined) return ''; try { return String(v); } catch { return ''; } };
export const oneLine = (v) => safeText(v).replace(/[\r\n\u2028\u2029\u0085\v\f]+/g, ' ');
// what the rollup prints of any field: one physical line, then redacted again
export const printed = (v) => redact(oneLine(v));
const personaOf = (line) => printed(line.agent).trim() || 'unknown';

function needsSimon(line) {
  if (oneLine(line.needs_owner).trim().toLowerCase() === 'simon') return true;
  if (NEEDS_SIMON.has(line.kind)) return true;
  if (Array.isArray(line.flags) && line.flags.length > 0) return true;
  return false;
}

function fmtLine(line) {
  const kind = printed(line.kind) || 'note';
  const what = printed(line.what);
  const receipt = printed(line.receipt_sha256);
  const link = printed(line.link);
  const ref = receipt ? ` [receipt:${receipt.slice(0, 12)}]` : (link ? ` (${link})` : '');
  const flagged = Array.isArray(line.flags) && line.flags.length > 0 ? ` ⚑ FLAGGED: ${line.flags.map(printed).join(', ')}` : '';
  return `- [${kind}] ${what}${ref}${flagged}`;
}

// Newest first; lines with the same ts keep their input order. Grouped by ts and
// the distinct stamps sorted as plain strings (ISO 8601 sorts as text), so the
// order never depends on how an engine calls a comparator on ties.
function newestFirst(items) {
  const by = new Map();
  for (const x of items) {
    if (!by.has(x.ts)) by.set(x.ts, []);
    by.get(x.ts).push(x);
  }
  return [...by.keys()].sort().reverse().flatMap((ts) => by.get(ts));
}

// unreadable: how many feed lines could not be parsed (the I/O layer counts
// them); when there are any, Simon is told first.
export function rollup(lines, dateStr, unreadable = 0) {
  const arr = Array.isArray(lines) ? lines : [];
  const indexed = arr
    .filter((l) => isObj(l))
    .map((line) => ({ line, ts: typeof line.ts === 'string' ? line.ts : '' }));

  const simon = newestFirst(indexed.filter((x) => needsSimon(x.line)));

  const personas = [...new Set(indexed.map((x) => personaOf(x.line)))].sort();

  const out = [];
  out.push(`# AGENT_FEED — ${oneLine(dateStr)}`);
  out.push('');
  out.push(`## ${TOP}`);
  const lost = Number.isInteger(unreadable) && unreadable > 0;
  if (lost) out.push(`- [blocker] unreadable feed lines left out of this rollup: ${unreadable} — from FEED`);
  if (simon.length === 0 && !lost) {
    out.push('- none');
  } else {
    for (const x of simon) out.push(`${fmtLine(x.line)} — from ${personaOf(x.line)}`);
  }
  out.push('');
  for (const p of personas) {
    const rows = newestFirst(indexed.filter((x) => personaOf(x.line) === p));
    out.push(p.toUpperCase() === TOP ? `## ${p} (agent)` : `## ${p}`);
    for (const x of rows) out.push(fmtLine(x.line));
    out.push('');
  }
  return out.join('\n').replace(/\n+$/, '\n');
}
