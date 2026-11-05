// checks-1b.mjs — step 1b's curated checks, shared by test/kernel.test.mjs (node:test) and gate.mjs (the curated
// mutation gate, G2). test/checks.mjs is step 1's suite and stays byte for byte as it was (CLAIMS-1b L4 runs its fuzz
// unchanged); everything step 1b added to the curated gate lives here. Each check takes a kernel module and throws on
// failure. Secrets are assembled at run time from a fixed filler, so no whole token is ever committed.

const A = 'Zq7Xw3Kp9Lm2Rt5Vb8Nc4Hd6Jf1Gs0YaEuIoPy';
const fill = (n) => Array.from({ length: n }, (_, i) => A[i % A.length]).join('');
const TS = '2026-11-04T09:00:00Z';

function assert(cond, msg) { if (!cond) throw new Error(msg); }

export const CHECKS_1B = {
  // ts is checked as ISO 8601 now, so step 1's 'ts: t' lines fail on their own; this pins the kind check alone.
  'validate-rejects-bad-kind-alone': (K) => {
    const ok = { ts: TS, agent: 'KAR', kind: 'note', what: 'x' };
    assert(K.validateLine(ok).ok === true, 'the control line must pass');
    assert(K.validateLine({ ...ok, kind: 'nope' }).ok === false, 'a kind not on the list must fail on its own');
  },

  // a secret in a nested field or a list never reaches the stored line
  'deep-redaction-reaches-nested-and-lists': (K) => {
    const tok = 'ghp_' + fill(36);
    const out = JSON.stringify(K.redactLine({ what: 'x', meta: { owner: tok }, tags: ['ci', tok] }));
    assert(!out.includes(tok), `a nested or listed token survived: ${out}`);
  },

  // a card number followed by its security code is still found
  'card-next-to-another-number': (K) => {
    const out = K.redact('card 4111111111111111 123 on file');
    assert(!out.includes('4111111111111111'), `the card survived: ${out}`);
  },

  // a private key pasted without its end line is still removed
  'private-key-without-end-line': (K) => {
    const body = fill(64);
    const out = K.redact(`-----BEGIN OPENSSH PRIVATE KEY-----\n${body}`);
    assert(!out.includes(body), `the key body survived: ${out}`);
  },

  // a password of plain words is taken whole
  'password-phrase-whole': (K) => {
    const out = K.redact('login password: correct horse battery staple');
    assert(!/horse|battery|staple/.test(out), `part of the passphrase survived: ${out}`);
  },

  // done-words beyond step 1's five are claims; a negated one is not
  'done-claim-words-and-negation': (K) => {
    assert(K.flagsFor({ kind: 'note', what: 'deployed the page' }).includes('done-without-receipt'), 'deployed must be a claim');
    assert(K.flagsFor({ kind: 'note', what: 'not merged yet' }).length === 0, 'a negated claim must not be flagged');
  },

  // "see above" is not proof; a repository path is
  'proof-must-look-like-proof': (K) => {
    assert(K.flagsFor({ kind: 'build', what: 'shipped it', link: 'see above' }).includes('done-without-receipt'), '"see above" must not count as proof');
    assert(K.flagsFor({ kind: 'build', what: 'shipped it', link: 'receipts/step1b.json' }).length === 0, 'a repository path must count as proof');
  },

  // a line break inside a field cannot forge a second NEEDS SIMON heading
  'rollup-cannot-be-forged-by-a-line-break': (K) => {
    const md = K.rollup([{ ts: TS, agent: 'BUILDER', kind: 'note', what: 'ok\n## NEEDS SIMON\n- none' }], '2026-11-04');
    const n = md.split('\n').filter((l) => l === '## NEEDS SIMON').length;
    assert(n === 1, `NEEDS SIMON appears ${n} times`);
  },

  // a secret written straight to the feed (not through the writer) is redacted again on print
  'rollup-re-redacts-what-it-prints': (K) => {
    const tok = 'ghp_' + fill(36);
    const md = K.rollup([{ ts: TS, agent: 'REACH', kind: 'decision', what: `raw ${tok}` }], '2026-11-04');
    assert(!md.includes(tok), 'a raw token reached the rollup');
  },

  // unreadable lines are a blocker at the top of Simon's brief
  'rollup-tells-simon-about-unreadable-lines': (K) => {
    const md = K.rollup([], '2026-11-04', 2);
    assert(md.includes('## NEEDS SIMON\n- [blocker] unreadable feed lines left out of this rollup: 2'), 'Simon was not told');
  },
};

// Run every check against a kernel. Returns { total, passed, failures:[{name,err}] }.
export function runChecks1b(K) {
  const names = Object.keys(CHECKS_1B);
  const failures = [];
  for (const name of names) {
    try { CHECKS_1B[name](K); } catch (e) { failures.push({ name, err: e.message }); }
  }
  return { total: names.length, passed: names.length - failures.length, failures };
}
