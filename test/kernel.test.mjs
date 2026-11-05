// kernel.test.mjs — step 1b's kernel suite: every rule, both sides of every branch, the edges witness flips, and
// totality on garbage. Secrets are assembled at run time (fill), so no whole token is ever committed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as K from '../src/kernel.mjs';
import { CHECKS_1B } from './checks-1b.mjs';

// step 1b's curated checks (the ones gate.mjs scores mutants against) run here too
for (const name of Object.keys(CHECKS_1B)) test(`curated · ${name}`, () => { CHECKS_1B[name](K); });

const A ='Zq7Xw3Kp9Lm2Rt5Vb8Nc4Hd6Jf1Gs0YaEuIoPy';
const fill = (n, set = A) => Array.from({ length: n }, (_, i) => set[i % set.length]).join('');
const UP = A.toUpperCase();
const gone = (text, secret) => !K.redact(text).includes(secret);
const LINE = { ts: '2026-11-04T09:00:00Z', agent: 'KAR', kind: 'note', what: 'hello' };

// ---- luhn + cards ------------------------------------------------------------
test('luhnValid · length bounds 13 to 19 are inclusive, outside them false even when the sum checks', () => {
  assert.equal(K.luhnValid('4222222222222'), true);           // 13, valid
  assert.equal(K.luhnValid('4111111111111111003'), true);     // 19, valid
  assert.equal(K.luhnValid('411111111117'), false);           // 12, sum checks
  assert.equal(K.luhnValid('41111111111111110000'), false);   // 20, sum checks
  assert.equal(K.luhnValid('123'), false);
  assert.equal(K.luhnValid('4111111111111112'), false);
  assert.equal(K.luhnValid('378282246310005'), true);
  assert.equal(K.luhnValid('4111 1111 1111 1111'), true);
  assert.equal(K.luhnValid(4111111111111111), true);
});

test('luhnValid · total on garbage', () => {
  const toxic = { toString() { throw new Error('x'); } };
  assert.equal(K.luhnValid(toxic), false);
  assert.equal(K.luhnValid(null), false);
  assert.equal(K.luhnValid(undefined), false);
});

test('cardIn · whole run, without its last group, without its first group', () => {
  assert.equal(K.cardIn('4111111111111111'), true);
  assert.equal(K.cardIn('4111111111111111 123'), true);        // card then its security code
  assert.equal(K.cardIn('4111111111111111 123 '), true);       // with the trailing separator the scan leaves
  assert.equal(K.cardIn('7 4111 1111 1111 1111'), true);       // a short reference first
  assert.equal(K.cardIn('1234 5678 9012 3456'), false);
  assert.equal(K.cardIn('1234567890123'), false);
  assert.equal(K.cardIn({ toString() { throw new Error('x'); } }), false);
});

test('redact · cards in text go, the same digits inside a link stay', () => {
  assert.equal(K.redact('paid 4111 1111 1111 1111 ok'), 'paid [REDACTED:card] ok');
  assert.equal(K.redact('card 4111111111111111 123 on file'), 'card [REDACTED:card] on file');
  assert.equal(K.redact('card 4111-1111-1111-1111-x'), 'card [REDACTED:card]-x');
  const link = 'https://x.com/someone/status/1853012345678901238';
  assert.equal(K.redact(`see ${link}`), `see ${link}`);
  assert.equal(K.redact('id 1853012345678901238'), 'id [REDACTED:card]');
  assert.equal(K.redact('order 1234 5678 9012 3456 here'), 'order 1234 5678 9012 3456 here');
});

test('redact · inside a link only the query string is scanned for cards', () => {
  assert.equal(K.redact('pay https://pay.example/c?card=4111111111111111&x=1 now'), 'pay https://pay.example/c?card=[REDACTED:card]&x=1 now');
  assert.equal(K.redact('https://x.com/s/1853012345678901238?ref=4111111111111111'), 'https://x.com/s/1853012345678901238?ref=[REDACTED:card]');
  assert.equal(K.redact('https://x.com/s/1853012345678901238'), 'https://x.com/s/1853012345678901238');
  assert.equal(K.redact('https://x.com/s/1853012345678901238?page=2'), 'https://x.com/s/1853012345678901238?page=2');
  assert.equal(K.redact('https://x.com/a 4111111111111111'), 'https://x.com/a [REDACTED:card]');
});

// ---- token rules -------------------------------------------------------------
test('redact · every named rule removes its shape', () => {
  const cases = [
    ['ghp_' + fill(36), 'gh-token'],
    ['github_pat_' + fill(22) + '_' + fill(59), 'gh-fine-grained'],
    ['sk' + '_live_' + fill(24), 'stripe-key'],
    ['rk' + '_test_' + fill(24), 'stripe-key'],
    ['sk-proj-' + fill(38), 'openai-key'],
    ['sk-ant-api03-' + fill(38), 'openai-key'],
    ['AKIA' + fill(16, UP), 'aws-key'],
    ['AIza' + fill(35), 'google-key'],
    ['xoxb-' + fill(12) + '-' + fill(24), 'slack-token'],
    ['xai-' + fill(38), 'xai-key'],
    ['npm_' + fill(36), 'npm-token'],
    ['hf_' + fill(34), 'hf-token'],
    ['whsec_' + fill(32), 'webhook-secret'],
    ['eyJ' + fill(20) + '.eyJ' + fill(30) + '.' + fill(20), 'jwt'],
  ];
  for (const [secret, rule] of cases) {
    const out = K.redact(`x ${secret} y`);
    assert.equal(out, `x [REDACTED:${rule}] y`, rule);
  }
});

test('redact · slack webhooks, auth headers and bearer tokens', () => {
  const hook = 'https://hooks.slack.com/services/T' + fill(8, UP) + '/B' + fill(8, UP) + '/' + fill(24);
  assert.equal(K.redact(`post to ${hook}`), 'post to [REDACTED:slack-webhook]');
  assert.equal(K.redact('Authorization: Basic ' + fill(22) + '=='), '[REDACTED:auth-header]');
  assert.equal(K.redact('authorization:bearer ' + fill(30)), '[REDACTED:auth-header]');
  assert.equal(K.redact('send Bearer ' + fill(30) + ' now'), 'send [REDACTED:bearer] now');
  assert.equal(K.redact('the bearer of news'), 'the bearer of news');
});

test('redact · private keys whole, without their end line, and PGP blocks', () => {
  const body = fill(64);
  assert.equal(K.redact(`a -----BEGIN RSA PRIVATE KEY-----\n${body}\n-----END RSA PRIVATE KEY----- b`), 'a [REDACTED:private-key] b');
  assert.equal(K.redact(`-----BEGIN OPENSSH PRIVATE KEY-----\n${body}`), '[REDACTED:private-key]');
  assert.equal(K.redact(`-----BEGIN PGP PRIVATE KEY BLOCK-----\n${body}\n-----END PGP PRIVATE KEY BLOCK-----`), '[REDACTED:private-key]');
  assert.equal(K.redact(`-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----`), '[REDACTED:private-key]');
});

test('redact · labelled values, also when the label sits inside a longer name', () => {
  const v = fill(30);
  assert.equal(K.redact(`set GITHUB_TOKEN=${v} now`), 'set GITHUB_[REDACTED:labelled-secret] now');
  assert.equal(K.redact(`AWS_SECRET_ACCESS_KEY=${v}/x`), 'AWS_[REDACTED:labelled-secret]');
  assert.equal(K.redact(`{"client_secret": "${v}"}`), '{"client_[REDACTED:labelled-secret]"}');
  assert.equal(K.redact(`https://a.example/v1?access_token=${v}&page=2`), 'https://a.example/v1?access_[REDACTED:labelled-secret]&page=2');
  assert.equal(K.redact('api key: ' + v), '[REDACTED:labelled-secret]');
  assert.equal(K.redact('apikey=' + v), '[REDACTED:labelled-secret]');
  assert.equal(K.redact('the bearer: ' + v), 'the [REDACTED:labelled-secret]');
  // prose that only mentions the words stays
  for (const ok of ['the token budget was 1500 in', 'tokens processed: 123456789012', 'the password reset email went out',
    'secret: the launch date', 'token=short', 'mytoken=' + v, 'token=[REDACTED:gh-token]']) {
    assert.equal(K.redact(ok), ok, ok);
  }
});

test('redact · a password or passphrase after its label is taken whole, to the end of its clause', () => {
  assert.equal(K.redact('password: s3cr3t!Pass#99'), '[REDACTED:password]');
  assert.equal(K.redact('password=hunter2!x'), '[REDACTED:password]');
  assert.equal(K.redact('pw is password: abc'), 'pw is [REDACTED:password]');
  assert.equal(K.redact('login password: correct horse battery staple'), 'login [REDACTED:password]');
  assert.equal(K.redact('DB_PASSWORD=hunter2, then restart'), 'DB_[REDACTED:password], then restart');
  assert.equal(K.redact('passwd=' + fill(30)), '[REDACTED:password]');
  assert.equal(K.redact('passphrase: blue river stone'), '[REDACTED:password]');
  assert.equal(K.redact('the passcode=4471; done'), 'the [REDACTED:password]; done');
  assert.equal(K.redact('{"password": "two words"}'), '{"[REDACTED:password]"}');
  assert.equal(K.redact('https://a.example/login?user=k&password=hunter2&next=/'), 'https://a.example/login?user=k&[REDACTED:password]&next=/');
  assert.equal(K.redact('password: one\nnext line stays'), '[REDACTED:password]\nnext line stays');
  // prose that only mentions passwords stays
  for (const ok of ['the password reset email went out', 'passwords rotate monthly', 'a passwordless login', 'mypassword: x', 'passport: GB']) {
    assert.equal(K.redact(ok), ok, ok);
  }
});

test('redact · emails go, handles stay; null and undefined pass through; unreadable values are marked', () => {
  assert.equal(K.redact('from dana.r@example.org today'), 'from [REDACTED:email] today');
  assert.equal(K.redact('thanks @kar_builder'), 'thanks @kar_builder');
  assert.equal(K.redact(null), null);
  assert.equal(K.redact(undefined), undefined);
  assert.equal(K.redact(42), '42');
  assert.equal(K.redact({ toString() { throw new Error('x'); } }), '[REDACTED:unreadable]');
});

// ---- deep redaction ------------------------------------------------------------
test('redactLine · nested objects, lists and keys are redacted; the input is not touched', () => {
  const tok = 'ghp_' + fill(36);
  const src = { what: 'x', meta: { owner: 'dana.r@example.org', list: ['ci', tok] }, [tok]: 1, n: 3, ok: true, none: null };
  const out = K.redactLine(src);
  assert.deepEqual(out, { what: 'x', meta: { owner: '[REDACTED:email]', list: ['ci', '[REDACTED:gh-token]'] }, '[REDACTED:gh-token]': 1, n: 3, ok: true, none: null });
  assert.equal(src.meta.list[1], tok);
  assert.equal(JSON.stringify(out).includes(tok), false);
});

test('redactLine · lists keep their length and order', () => {
  assert.deepEqual(K.redactLine({ a: [1, 'b', [2, 'c']] }), { a: [1, 'b', [2, 'c']] });
  assert.deepEqual(K.redactLine({ a: [] }), { a: [] });
});

test('redactLine · anything that is not an object line gives {}', () => {
  for (const g of [null, undefined, 5, 'x', [1, 2], true]) assert.deepEqual(K.redactLine(g), {}, String(g));
});

test('redactLine · cycles, depth, bigint, toxic getters, __proto__ keys', () => {
  const c = { what: 'loop' }; c.self = c;
  assert.deepEqual(K.redactLine(c), { what: 'loop', self: '[circular]' });
  const shared = { s: 'same' };
  assert.deepEqual(K.redactLine({ a: shared, b: shared }), { a: { s: 'same' }, b: { s: 'same' } });
  // depth: the line is depth 0; a value at depth MAX_DEPTH is kept, one level deeper is dropped
  const nest = (n) => { let o = { leaf: 'dana.r@example.org' }; for (let i = 0; i < n; i++) o = { o }; return o; };
  const atMax = K.redactLine(nest(K.MAX_DEPTH));
  let p = atMax; for (let i = 0; i < K.MAX_DEPTH; i++) p = p.o;
  assert.deepEqual(p, { leaf: '[REDACTED:email]' });
  const over = K.redactLine(nest(K.MAX_DEPTH + 1));
  let q = over; for (let i = 0; i < K.MAX_DEPTH; i++) q = q.o;
  assert.equal(q.o, '[REDACTED:too-deep]');
  // the same bound holds for lists
  const deepList = (n) => { let o = ['dana.r@example.org']; for (let i = 0; i < n; i++) o = [o]; return { o }; };
  let r = K.redactLine(deepList(K.MAX_DEPTH - 1)).o; for (let i = 0; i < K.MAX_DEPTH - 1; i++) r = r[0];
  assert.deepEqual(r, ['[REDACTED:email]']);
  let s = K.redactLine(deepList(K.MAX_DEPTH)).o; for (let i = 0; i < K.MAX_DEPTH - 1; i++) s = s[0];
  assert.deepEqual(s, ['[REDACTED:too-deep]']);
  assert.deepEqual(K.redactLine({ n: 10n }), { n: '10' });
  const toxic = { what: 'x', get bad() { throw new Error('boom'); } };
  assert.deepEqual(K.redactLine(toxic), { what: 'x', bad: '[unreadable]' });
  const proto = JSON.parse('{"__proto__": {"what": "evil"}, "what": "fine"}');
  const out = K.redactLine(proto);
  assert.equal(Object.getPrototypeOf(out), Object.prototype);
  assert.deepEqual(Object.keys(out), ['__proto__', 'what']);
  assert.equal({}.what, undefined);
});

// ---- done claims and proof ----------------------------------------------------------
test('claimsDone · done-words, negation within three words, claim kinds', () => {
  for (const w of K.DONE_WORDS) assert.equal(K.claimsDone('note', `we ${w} it`), true, w);
  assert.equal(K.claimsDone('note', 'Done: the rollup'), true);
  assert.equal(K.claimsDone('note', 'not merged yet'), false);
  assert.equal(K.claimsDone('note', 'never deployed this one'), false);
  assert.equal(K.claimsDone('note', 'the tests haven\u2019t passed'), false);
  assert.equal(K.claimsDone('note', "the tests haven't passed"), false);
  assert.equal(K.claimsDone('note', 'not that one: the build is now green'), true);  // negation four words back does not count
  assert.equal(K.claimsDone('note', 'start on the parser'), false);
  assert.equal(K.claimsDone('note', 'plan: deploy tomorrow'), false);
  assert.equal(K.claimsDone('build', 'the parser'), true);
  assert.equal(K.claimsDone('receipt', 'witness run'), true);
  assert.equal(K.claimsDone('task', 'the parser'), false);
  assert.equal(K.claimsDone('note', 42), false);
  assert.equal(K.claimsDone(undefined, undefined), false);
});

test('isProof · URLs, repository paths and file names; nothing with spaces, nothing blank', () => {
  for (const ok of ['https://github.com/sjgant80-hub/bot-team-kit/actions', 'http://x/y', 'receipts/build-step1.json', 'README.md', 'docs/', ' https://x/y ']) assert.equal(K.isProof(ok), true, ok);
  for (const no of ['see above', 'trust me', ' ', '', 'abc', 'https://', 42, null, undefined, {}]) assert.equal(K.isProof(no), false, String(no));
});

test('flagsFor · claim without proof is flagged; a receipt, a URL, a path each clear it; a bad hash or non-proof link does not', () => {
  const claim = { kind: 'build', what: 'shipped the parser' };
  assert.deepEqual(K.flagsFor(claim), ['done-without-receipt']);
  assert.deepEqual(K.flagsFor({ ...claim, receipt_sha256: 'a'.repeat(64) }), []);
  assert.deepEqual(K.flagsFor({ ...claim, receipt_sha256: 'A'.repeat(64) }), []);
  assert.deepEqual(K.flagsFor({ ...claim, link: 'https://x/y' }), []);
  assert.deepEqual(K.flagsFor({ ...claim, link: 'receipts/r.json' }), []);
  assert.deepEqual(K.flagsFor({ ...claim, link: 'see above' }), ['done-without-receipt']);
  assert.deepEqual(K.flagsFor({ ...claim, link: 42 }), ['done-without-receipt']);
  assert.deepEqual(K.flagsFor({ ...claim, receipt_sha256: 'abc' }), ['done-without-receipt']);
  assert.deepEqual(K.flagsFor({ ...claim, receipt_sha256: 5 }), ['done-without-receipt']);
  assert.deepEqual(K.flagsFor({ kind: 'task', what: 'start the parser' }), []);
  assert.deepEqual(K.flagsFor({ kind: 'note', what: 'deployed the page' }), ['done-without-receipt']);
  assert.deepEqual(K.flagsFor({ kind: 'note', what: 'not deployed yet' }), []);
  assert.deepEqual(K.flagsFor({ kind: 'note', what: 42 }), []);
  assert.deepEqual(K.flagsFor(null), []);
  assert.deepEqual(K.flagsFor([claim]), []);
});

// ---- validate ---------------------------------------------------------------------
test('validateLine · ts must be an ISO 8601 time that parses', () => {
  const v = (patch) => K.validateLine({ ...LINE, ...patch });
  assert.deepEqual(v({}), { ok: true, errors: [] });
  assert.equal(v({ ts: '2026-11-04T09:00:00.123+01:00' }).ok, true);
  assert.equal(v({ ts: '2026-11-04T09:00Z' }).ok, true);
  for (const bad of ['yesterday', '2026-11-04', '2026-13-45T25:61:00Z', '', 5, null, new String('2026-11-04T09:00:00Z')]) {
    assert.deepEqual(v({ ts: bad }).errors, ['ts: required ISO 8601 time'], String(bad));
  }
  assert.deepEqual(K.validateLine({ agent: 'KAR', kind: 'note', what: 'x' }).errors, ['ts: required ISO 8601 time']);
});

test('validateLine · agent and what must be non-blank text; kind from the list', () => {
  const v = (patch) => K.validateLine({ ...LINE, ...patch });
  for (const bad of ['', '   ', 5, null]) {
    assert.deepEqual(v({ agent: bad }).errors, ['agent: required non-empty string'], String(bad));
    assert.deepEqual(v({ what: bad }).errors, ['what: required non-empty string'], String(bad));
  }
  assert.equal(v({ kind: 'nope' }).ok, false);
  for (const k of K.KINDS) assert.equal(v({ kind: k }).ok, true, k);
});

test('validateLine · optional receipt, link and needs_owner are checked only when present', () => {
  const v = (patch) => K.validateLine({ ...LINE, ...patch });
  assert.equal(v({ receipt_sha256: 'f'.repeat(64) }).ok, true);
  assert.deepEqual(v({ receipt_sha256: 'f'.repeat(63) }).errors, ['receipt_sha256: must be 64 hex chars when present']);
  assert.deepEqual(v({ receipt_sha256: 5 }).errors, ['receipt_sha256: must be 64 hex chars when present']);
  assert.equal(v({ link: 'anything' }).ok, true);
  assert.deepEqual(v({ link: 42 }).errors, ['link: must be text when present']);
  assert.equal(v({ needs_owner: 'Simon' }).ok, true);
  assert.deepEqual(v({ needs_owner: true }).errors, ['needs_owner: must be text when present']);
  assert.deepEqual(K.validateLine(null).ok, false);
  assert.deepEqual(K.validateLine([LINE]).ok, false);
});

// ---- normalize ------------------------------------------------------------------
test('normalizeLine · redacts deep, computes flags, ignores flags a caller set', () => {
  const tok = 'ghp_' + fill(36);
  assert.deepEqual(K.normalizeLine({ ...LINE, kind: 'build', what: `built with ${tok}` }),
    { ...LINE, kind: 'build', what: 'built with [REDACTED:gh-token]', flags: ['done-without-receipt'] });
  assert.deepEqual(K.normalizeLine({ ...LINE, flags: ['done-without-receipt'] }), { ...LINE });
  assert.equal('flags' in K.normalizeLine(LINE), false);
  assert.deepEqual(K.normalizeLine(null), {});
});

// ---- rollup -----------------------------------------------------------------------
const lines = (md) => md.split('\n');

test('rollup · needs_owner Simon on any kind, escalating kinds, and flags each reach NEEDS SIMON; empty flags do not', () => {
  const md = K.rollup([
    { ts: '2026-11-04T09:00:00Z', agent: 'KAR', kind: 'note', what: 'please sign', needs_owner: ' simon ' },
    { ts: '2026-11-04T09:01:00Z', agent: 'KAR', kind: 'note', what: 'plain note', flags: [] },
    { ts: '2026-11-04T09:02:00Z', agent: 'KAR', kind: 'blocker', what: 'stuck' },
  ], '2026-11-04');
  const top = md.slice(0, md.indexOf('\n## KAR'));
  assert.ok(top.includes('please sign'));
  assert.ok(top.includes('stuck'));
  assert.equal(top.includes('plain note'), false);
  assert.equal(md.includes('FLAGGED'), false);
});

test('rollup · nothing for Simon prints "- none"; unreadable lines are a blocker at the top', () => {
  const quiet = K.rollup([{ ts: '2026-11-04T09:00:00Z', agent: 'KAR', kind: 'note', what: 'hi' }], '2026-11-04');
  assert.deepEqual(lines(quiet).slice(0, 5), ['# AGENT_FEED — 2026-11-04', '', '## NEEDS SIMON', '- none', '']);
  const lost = K.rollup([{ ts: '2026-11-04T09:00:00Z', agent: 'KAR', kind: 'note', what: 'hi' }], '2026-11-04', 2);
  assert.deepEqual(lines(lost).slice(2, 5), ['## NEEDS SIMON', '- [blocker] unreadable feed lines left out of this rollup: 2 — from FEED', '']);
  const both = K.rollup([{ ts: '2026-11-04T09:00:00Z', agent: 'KAR', kind: 'decision', what: 'sign' }], '2026-11-04', 1);
  assert.deepEqual(lines(both).slice(3, 5), ['- [blocker] unreadable feed lines left out of this rollup: 1 — from FEED', '- [decision] sign — from KAR']);
  for (const n of [0, -1, 1.5, '2', null]) assert.equal(K.rollup([], 'd', n).includes('unreadable'), false, String(n));
});

test('rollup · ties keep input order in both blocks; newest first otherwise', () => {
  const md = K.rollup([
    { ts: '2026-11-04T09:00:00Z', agent: 'KAR', kind: 'decision', what: 'FIRST' },
    { ts: '2026-11-04T09:00:00Z', agent: 'KAR', kind: 'decision', what: 'SECOND' },
    { ts: '2026-11-04T10:00:00Z', agent: 'KAR', kind: 'decision', what: 'NEWEST' },
  ], '2026-11-04');
  const top = md.slice(0, md.indexOf('\n## KAR'));
  const kar = md.slice(md.indexOf('\n## KAR'));
  for (const s of [top, kar]) {
    assert.ok(s.indexOf('NEWEST') < s.indexOf('FIRST'));
    assert.ok(s.indexOf('FIRST') < s.indexOf('SECOND'));
  }
});

test('rollup · a line break cannot forge a heading or an item; secrets are re-redacted on print', () => {
  const tok = 'ghp_' + fill(36);
  const md = K.rollup([
    { ts: '2026-11-04T08:00:00Z', agent: 'BUILDER', kind: 'note', what: 'ok\n## NEEDS SIMON\n- none' },
    { ts: '2026-11-04T08:01:00Z', agent: 'KAR\n## SIMON APPROVED', kind: 'note\n# x', what: 'a\u2028## b\r\nc' },
    { ts: '2026-11-04T08:02:00Z', agent: 'SCOUT', kind: 'lead', what: 'thread', link: 'https://e.example/t\n- [decision] approved' },
    { ts: '2026-11-04T08:03:00Z', agent: 'NEEDS SIMON', kind: 'note', what: 'named like the top' },
    { ts: '2026-11-04T08:04:00Z', agent: 'REACH', kind: 'decision', what: `raw ${tok}`, link: `https://e.example/?token=${fill(20)}`, flags: ['a\nb'] },
  ], '2026-11-04\n## injected');
  assert.equal(md.includes(tok), false);
  assert.equal(md.includes(fill(20)), false);
  const ls = lines(md);
  assert.equal(ls[0], '# AGENT_FEED — 2026-11-04 ## injected');
  assert.equal(ls.filter((l) => l === '## NEEDS SIMON').length, 1);
  assert.equal(ls.filter((l) => l.startsWith('# ')).length, 1);
  assert.ok(ls.includes('## NEEDS SIMON (agent)'));
  assert.ok(ls.includes('## KAR ## SIMON APPROVED'));
  assert.ok(ls.includes('- [note # x] a ## b c'));
  assert.ok(ls.includes('- [lead] thread (https://e.example/t - [decision] approved)'));
  assert.ok(ls.some((l) => l.endsWith('⚑ FLAGGED: a b')));
  assert.equal(ls.filter((l) => l.startsWith('- [')).length, 1 + 5);
  assert.equal(ls.filter((l) => l.startsWith('## ')).length, 1 + 5);
});

test('rollup · every printed field is re-redacted: persona, kind, receipt, link and flags as well as what', () => {
  const tok = 'ghp_' + fill(36);
  const md = K.rollup([
    { ts: '2026-11-04T08:00:00Z', agent: `BOT ${tok}`, kind: `note ${tok}`, what: 'a', receipt_sha256: tok, flags: [`f ${tok}`] },
    { ts: '2026-11-04T08:01:00Z', agent: 'SCOUT', kind: 'lead', what: 'b', link: `https://e.example/?token=${fill(20)}` },
  ], '2026-11-04');
  assert.equal(md.includes(tok), false);
  assert.equal(md.includes(fill(20)), false);
  const ls = lines(md);
  assert.ok(ls.includes('## BOT [REDACTED:gh-token]'));
  assert.ok(ls.includes('- [note [REDACTED:gh-token]] a [receipt:[REDACTED:gh] ⚑ FLAGGED: f [REDACTED:gh-token]'));
  assert.ok(ls.includes('- [lead] b (https://e.example/?[REDACTED:labelled-secret])'));
  assert.equal(K.printed('x\ny ' + tok), 'x y [REDACTED:gh-token]');
  assert.equal(K.printed(null), '');
});

test('rollup · oneLine and persona fallbacks', () => {
  assert.equal(K.oneLine('a\r\nb\u2028c\u2029d\u0085e\vf\fg'), 'a b c d e f g');
  assert.equal(K.oneLine(null), '');
  assert.equal(K.oneLine(undefined), '');
  assert.equal(K.oneLine(7), '7');
  assert.equal(K.oneLine({ toString() { throw new Error('x'); } }), '');
  const md = K.rollup([{ ts: '2026-11-04T09:00:00Z', kind: 'note', what: 'no agent' }, { ts: 5, agent: '  ', what: 'blank agent' }, 'junk', null], 'd');
  assert.ok(md.includes('## unknown\n- [note] no agent\n- [note] blank agent'));
});

test('rollup · total on garbage', () => {
  for (const g of [null, undefined, 5, 'x', {}, [null, 1, 'x', [], { kind: {} }]]) assert.equal(typeof K.rollup(g, 'd'), 'string');
  const toxic = { toString() { throw new Error('x'); } };
  assert.equal(typeof K.rollup([{ agent: toxic, kind: toxic, what: toxic, link: toxic, needs_owner: toxic, ts: toxic }], toxic), 'string');
});
