// checks.mjs — the assertion suite, shared by test.mjs (node:test) and gate.mjs
// (mutation gate). Each check takes a kernel module and returns; on failure it
// throws an Error. runChecks collects pass/fail so the gate can score mutants.
//
// Deterministic by construction: the fuzz uses a seeded PRNG (no Math.random),
// so "1000 lines, 0 leaks" is reproducible on any runner.

// --- seeded PRNG (mulberry32) — deterministic, no global randomness ---
function prng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A set of secret generators. Each returns { secret, kind }.
// The fuzz asserts none of `secret` survives verbatim in the redacted output.
const SECRET_GENS = [
  (r) => ({ kind: 'gh-token', secret: 'ghp_' + alnum(r, 36) }),
  (r) => ({ kind: 'gh-token', secret: 'gho_' + alnum(r, 36) }),
  (r) => ({ kind: 'openai-key', secret: 'sk-' + alnum(r, 32) }),
  (r) => ({ kind: 'openai-key', secret: 'sk-ant-' + alnum(r, 40) }),
  (r) => ({ kind: 'aws-key', secret: 'AKIA' + upnum(r, 16) }),
  (r) => ({ kind: 'google-key', secret: 'AIza' + alnum(r, 35) }),
  (r) => ({ kind: 'slack-token', secret: 'xoxb-' + digits(r, 12) + '-' + alnum(r, 20) }),
  (r) => ({ kind: 'email', secret: word(r, 6) + '@' + word(r, 5) + '.com' }),
  (r) => ({ kind: 'jwt', secret: 'eyJ' + alnum(r, 20) + '.eyJ' + alnum(r, 30) + '.' + alnum(r, 20) }),
  (r) => ({ kind: 'card', secret: cardNumber(r) }),
  (r) => ({ kind: 'labelled-secret', secret: 'api_key=' + alnum(r, 20) }),
];

const AL = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const UP = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const LO = 'abcdefghijklmnopqrstuvwxyz';
const pick = (r, set) => set[Math.floor(r() * set.length)];
const alnum = (r, n) => Array.from({ length: n }, () => pick(r, AL)).join('');
const upnum = (r, n) => Array.from({ length: n }, () => pick(r, UP)).join('');
const digits = (r, n) => Array.from({ length: n }, () => String(Math.floor(r() * 10))).join('');
const word = (r, n) => Array.from({ length: n }, () => pick(r, LO)).join('');

// Generate a 16-digit Luhn-valid card number deterministically.
function cardNumber(r) {
  const body = digits(r, 15).split('').map(Number);
  let sum = 0, dbl = true;
  for (let i = body.length - 1; i >= 0; i--) {
    let d = body[i];
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d; dbl = !dbl;
  }
  const chk = (10 - (sum % 10)) % 10;
  return body.join('') + String(chk);
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }

// Slice one "## HEADING" section out of rollup markdown (up to the next "## ").
function section(md, heading) {
  const start = md.indexOf(`## ${heading}`);
  if (start < 0) return '';
  const rest = md.slice(start + heading.length + 3);
  const next = rest.indexOf('\n## ');
  return next < 0 ? rest : rest.slice(0, next);
}

export const CHECKS = {
  // 1000-line redaction fuzz: NO secret survives the redactor, verbatim. 0 leaks.
  'redaction-fuzz-1000-zero-leaks': (K) => {
    const r = prng(0x5EED);
    let leaks = 0;
    const samples = [];
    for (let i = 0; i < 1000; i++) {
      const gen = SECRET_GENS[i % SECRET_GENS.length];
      const { secret } = gen(r);
      const filler = word(r, 4) + ' ' + word(r, 7);
      const what = `shipped ${filler} value=${secret} trailing ${word(r, 5)}`;
      const out = K.redact(what);
      if (out.includes(secret)) { leaks++; if (samples.length < 3) samples.push(secret); }
    }
    assert(leaks === 0, `redaction leaked ${leaks}/1000 secrets, e.g. ${samples.join(', ')}`);
  },

  // redact never throws on garbage — pure kernel invariant.
  'redact-total-on-garbage': (K) => {
    for (const g of [null, undefined, 42, {}, [], true, Symbol.iterator, NaN]) {
      // eslint-disable-next-line no-unused-expressions
      K.redact(g); // must not throw
    }
    assert(K.redact(null) === null, 'redact(null) should pass through');
    assert(typeof K.redact('x') === 'string', 'redact(string) returns string');
  },

  // flag BOTH branches: done-without-receipt flagged; done-with-receipt clean.
  'flag-branch-flagged': (K) => {
    const flags = K.flagsFor({ what: 'shipped the parser, all done', kind: 'build' });
    assert(flags.includes('done-without-receipt'), `expected done-without-receipt flag, got ${JSON.stringify(flags)}`);
  },
  'flag-branch-clean-with-receipt': (K) => {
    const flags = K.flagsFor({ what: 'shipped the parser, all done', kind: 'build', receipt_sha256: 'a'.repeat(64) });
    assert(flags.length === 0, `expected no flags with receipt, got ${JSON.stringify(flags)}`);
  },
  'flag-branch-clean-with-link': (K) => {
    const flags = K.flagsFor({ what: 'done', kind: 'build', link: 'https://x/y' });
    assert(flags.length === 0, `expected no flags with link, got ${JSON.stringify(flags)}`);
  },
  'flag-branch-non-done-clean': (K) => {
    const flags = K.flagsFor({ what: 'starting on the parser', kind: 'task' });
    assert(flags.length === 0, `non-done line should not flag, got ${JSON.stringify(flags)}`);
  },

  // validate: required fields + receipt hash shape.
  'validate-rejects-missing': (K) => {
    assert(K.validateLine({}).ok === false, 'empty line must be invalid');
    assert(K.validateLine({ ts: '2026-11-01T00:00:00Z', agent: 'KAR', kind: 'note', what: 'hi' }).ok === true, 'valid line must pass');
    assert(K.validateLine({ ts: 't', agent: 'KAR', kind: 'nope', what: 'x' }).ok === false, 'bad kind must fail');
    assert(K.validateLine({ ts: 't', agent: 'KAR', kind: 'note', what: 'x', receipt_sha256: 'short' }).ok === false, 'bad receipt hash must fail');
  },

  // rollup: NEEDS SIMON surfaces decisions/blockers/flags; grouped by persona.
  'rollup-needs-simon-and-groups': (K) => {
    const lines = [
      { ts: '2026-11-01T09:00:00Z', agent: 'BUILDER', kind: 'build', what: 'early build', receipt_sha256: 'b'.repeat(64) },
      { ts: '2026-11-01T10:00:00Z', agent: 'MONEY TIME', kind: 'listing', what: 'list it' },
      { ts: '2026-11-01T11:00:00Z', agent: 'BUILDER', kind: 'build', what: 'late build done', flags: ['done-without-receipt'] },
    ];
    const md = K.rollup(lines, '2026-11-01');
    assert(md.includes('## NEEDS SIMON'), 'rollup missing NEEDS SIMON');
    assert(md.indexOf('## NEEDS SIMON') < md.indexOf('## BUILDER'), 'NEEDS SIMON must be at the top');
    assert(md.includes('## MONEY TIME') && md.includes('## BUILDER'), 'persona groups missing');
    // the flagged build (kind=build, not inherently escalating) must surface to
    // Simon ONLY via its flag — isolates the needs-simon-flags path.
    const simonSection = section(md, 'NEEDS SIMON');
    assert(simonSection.includes('list it'), 'listing should be in NEEDS SIMON');
    assert(simonSection.includes('late build done'), 'a FLAGGED line must surface to NEEDS SIMON');
    assert(simonSection.includes('⚑ FLAGGED'), 'flagged line must render its flag in NEEDS SIMON');
  },

  // rollup ordering is newest-first, in BOTH the NEEDS SIMON block and persona
  // groups — pins the sort direction.
  'rollup-newest-first': (K) => {
    // three items, input already newest-first, so a stable correct sort is a
    // no-op while a flipped comparator reorders — exercises the a<b branch.
    const lines = [
      { ts: '2026-11-01T12:00:00Z', agent: 'KAR', kind: 'decision', what: 'NEW decision' },
      { ts: '2026-11-01T10:00:00Z', agent: 'KAR', kind: 'decision', what: 'MID decision' },
      { ts: '2026-11-01T09:00:00Z', agent: 'KAR', kind: 'decision', what: 'OLD decision' },
    ];
    const md = K.rollup(lines, '2026-11-01');
    const order = (s, t) => s.indexOf('NEW decision') < s.indexOf('MID decision') && s.indexOf('MID decision') < s.indexOf('OLD decision') ? true : false;
    const simonSection = section(md, 'NEEDS SIMON');
    assert(order(simonSection), 'NEEDS SIMON must list newest first (NEW, MID, OLD)');
    const karSection = section(md, 'KAR');
    assert(order(karSection), 'persona group must list newest first (NEW, MID, OLD)');
  },
};

// Run every check against a kernel. Returns { total, passed, failures:[{name,err}] }.
export function runChecks(K) {
  const names = Object.keys(CHECKS);
  const failures = [];
  for (const name of names) {
    try { CHECKS[name](K); } catch (e) { failures.push({ name, err: e.message }); }
  }
  return { total: names.length, passed: names.length - failures.length, failures };
}
