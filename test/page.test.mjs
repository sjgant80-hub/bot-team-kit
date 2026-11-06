// page.test.mjs — the page check (tools/page-check.mjs, CLAIMS-1b P1) bites, and page/facts.mjs (every number the page
// shows) is total. The real page and receipts must pass; each planted fault must be caught.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prose, jsStrings, numbersIn, check, CREDIT, SECTIONS } from '../tools/page-rules.mjs';
import { facts } from '../page/facts.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(root, p), 'utf8');
const j = (p) => JSON.parse(rd(p));
const HTML = rd('index.html');
const APP = rd('page/app.mjs');
const FACTS = facts({ step1b: j('receipts/step1b.json'), witness: j('receipts/witness.json'), trace: j('receipts/trace.json'), walks: existsSync(join(root, 'data/persona-walks.json')) ? j('data/persona-walks.json') : undefined, claims: j('receipts/claims.json') });
const exists = (p) => existsSync(join(root, p));
const run = (patch = {}) => check({ html: HTML, app: APP, facts: FACTS, exists, ...patch });

test('P1 · the real page and its receipts pass', () => {
  assert.deepEqual(run(), []);
});

test('P1 · a number typed into the prose, or into the page script, is caught', () => {
  const html = HTML.replace('<h2 id="what">', '<p>witness killed 84 mutants</p><h2 id="what">');
  assert.ok(run({ html }).some((f) => f.includes('"84"')));
  const app = APP + "\nconst x = 'all 74 tests pass';\n";
  assert.ok(run({ app }).some((f) => f.startsWith('page/app.mjs text') && f.includes('"74"')));
  const tpl = APP + '\nconst y = `${a} of 36 leaked`;\n';
  assert.ok(run({ app: tpl }).some((f) => f.includes('"36"')));
});

test('P1 · our prices, per-seat, tier, crypto and earnings wording are caught', () => {
  for (const planted of ['only £29 a month', 'from 49 USD', 'billed per seat', 'the Pro plan', 'three tiers', 'a token airdrop', 'passive income']) {
    const html = HTML.replace('<h2 id="what">', `<p>${planted}</p><h2 id="what">`);
    assert.ok(run({ html }).length > 0, planted);
  }
});

test('P1 · a missing credit, supplier, section or bound value is caught', () => {
  assert.ok(run({ html: HTML.split(CREDIT).join('Powered by us') }).includes('the Konomi credit is missing'));
  assert.ok(run({ html: HTML.split('href="https://www.ai-nativesolutions.com"').join('href="#"') }).some((f) => f.startsWith('the supplier')));
  for (const id of SECTIONS) assert.ok(run({ html: HTML.split(`id="${id}"`).join('id="gone"') }).includes(`section #${id} is missing`), id);
  assert.ok(run({ facts: { ...FACTS, kernelKilled: '—' } }).includes('data-r="kernelKilled" has no value in the receipts'));
  assert.ok(run({ html: HTML.replace('<h2 id="what">', '<span data-r="noSuchFact"></span><h2 id="what">') }).includes('data-r="noSuchFact" has no value in the receipts'));
});

test('P1 · a dead local link or a typed-in receipt hash is caught', () => {
  assert.ok(run({ html: HTML.replace('<h2 id="what">', '<a href="receipts/nope.json">x</a><h2 id="what">') }).includes('a local link is dead: receipts/nope.json'));
  assert.ok(run({ html: HTML.replace('<h2 id="what">', `<!-- ${'a'.repeat(64)} --><h2 id="what">`) }).some((f) => f.startsWith('a receipt hash is typed in')));
});

test('prose · drops tags, code, pre, script and style; keeps title text and the description; decodes entities', () => {
  const t = prose('<meta name="description" content="the desc"><style>.a{}</style><p>a&nbsp;b &amp; <code>x 12</code> <pre>13</pre><script>14</script> c</p>');
  assert.equal(t, 'the desc a b & c');
  assert.equal(prose(null), '');
});

test('jsStrings · plain, escaped and template strings; ${…} parts and comments are not text', () => {
  assert.deepEqual(jsStrings(`const a = 'one'; // 'not' \n const b = "t\\"wo"; /* 'no' */ const c = \`x \${'in' + n} y\`;`), ['one', 't"wo', 'x ', 'in', ' y']);
  assert.deepEqual(jsStrings(''), []);
});

test('numbersIn · standalone numbers only; names that hold digits are not numbers', () => {
  assert.deepEqual(numbersIn('84 of 84, 1,000 lines, 0.5 and 3'), ['84', '84', '1,000', '0.5', '3']);
  assert.deepEqual(numbersIn('step1b.json v0.6 SHA-256 #3 a1 receipts/x2.json @kar2'), []);
});

test('facts · total on garbage: every value is a number, text or the dash', () => {
  for (const g of [undefined, null, 5, 'x', {}, { step1b: { claims: 'x' }, witness: { organs: [null] }, trace: [], walks: { walks: [null, { gaps: 'x' }] } }]) {
    const f = facts(g);
    for (const [k, v] of Object.entries(f)) assert.ok(typeof v === 'number' || (typeof v === 'string' && v.length > 0), `${k}: ${v}`);
  }
  assert.equal(facts({}).kernelKilled, '—');
});

test('facts · reads the committed receipts', () => {
  const w = j('receipts/witness.json');
  assert.equal(FACTS.kernelKilled, w.organs[0].witness.killed);
  assert.equal(FACTS.organMutants, w.organs.reduce((n, o) => n + o.witness.total, 0));
  assert.equal(FACTS.allClean, w.allClean ? 'clean' : 'not clean');
  const c = j('receipts/claims.json');
  assert.equal(FACTS.claimsSealed, c.summary.sealed);
  assert.equal(FACTS.claimsHeld, c.summary.held);
  assert.equal(FACTS.claimsFailed, c.summary.failed);
  assert.equal(FACTS.claimsRecorded, c.summary.recorded);
  assert.equal(FACTS.leaksNow, j('receipts/step1b.json').claims.find((x) => x.id === 'L2').measured.now.leaked);
  assert.equal(FACTS.traceLines, j('receipts/trace.json').counts.lines);
  const wk = j('data/persona-walks.json').walks;
  assert.equal(FACTS.walkGaps, wk.flatMap((w) => w.gaps).length);
  assert.equal(FACTS.walkRounds, new Set(wk.map((w) => w.round ?? 1)).size);
});

test('facts · the badge counts every claim the seal names, not only the battery claims', () => {
  const rows = (f) => readFileSync(join(root, f), 'utf8').split('\n').filter((l) => /^\|\s*[A-Z]\d+\s*\|/.test(l)).length;
  const sealed = rows('CLAIMS-1b.md') + rows('CLAIMS-1c.md');
  assert.equal(FACTS.claimsSealed, sealed);
  assert.equal(FACTS.claimsHeld + FACTS.claimsFailed + FACTS.claimsRecorded, sealed);
});

// ---- CLAIMS-1c G3: page/facts.mjs is witness-gated; these pin what each number must be, not only that it is one ----
const W = () => JSON.parse(rd('receipts/witness.json'));
const organ = (total, killed) => ({ witness: { total, killed } });
const four = (o) => ['src/kernel.mjs', 'src/feed.mjs', 'src/rollup.mjs', 'src/mintcase.mjs'].map((file) => ({ file, ...o }));

test('facts · shows the dash, never a blank or a non-finite number', () => {
  for (const v of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '']) {
    assert.equal(facts({ witness: { tests: { total: v }, witness: { tag: v } } }).testsTotal, '—', String(v));
    assert.equal(facts({ witness: { witness: { tag: v } } }).witnessTag, '—', String(v));
  }
  assert.equal(facts({ witness: { tests: { total: 0 } } }).testsTotal, 0);
  assert.equal(facts({ witness: { witness: { tag: 'v0.6' } } }).witnessTag, 'v0.6');
});

test('facts · the organ sums: the dash when nothing ran, the real sums when it did', () => {
  for (const organs of [[], four({ witness: { total: 0, killed: 0 } })]) {
    const f = facts({ witness: { organs } });
    assert.equal(f.organMutants, '—');
    assert.equal(f.organKilled, '—');
    assert.equal(f.witnessMutants, '—');
    assert.equal(f.witnessKilled, '—');
  }
  const organs = [organ(5, 4), organ(3, 3), organ(2, 1), organ(1, 1)].map((o, i) => ({ file: ['src/kernel.mjs', 'src/feed.mjs', 'src/rollup.mjs', 'src/mintcase.mjs'][i], ...o }));
  const f = facts({ witness: { organs } });
  assert.equal(f.organMutants, 11);
  assert.equal(f.organKilled, 9);
  assert.equal(f.witnessMutants, 11);
  assert.equal(f.witnessKilled, 9);
  const w = W();
  assert.equal(FACTS.organKilled, w.organs.reduce((n, o) => n + o.witness.killed, 0));
});

test('facts · the page modules (G3) and their before-picture (G4) are summed over the runs that exist', () => {
  const organs = [organ(5, 4), organ(3, 3), organ(2, 1), organ(1, 1)].map((o, i) => ({ file: ['src/kernel.mjs', 'src/feed.mjs', 'src/rollup.mjs', 'src/mintcase.mjs'][i], ...o }));
  const kernels = [{ witness: { total: 7, killed: 6 } }, { witness: null }, null, { witness: 5 }, { witness: { total: 4, killed: 4 } }];
  const g4 = [{ witness: { total: 9, killed: 2, survived: 7 } }, { witness: { total: 3, killed: 3, survived: 0 } }];
  const f = facts({ witness: { organs, kernels, g4 } });
  assert.equal(f.pageFiles, 2);
  assert.equal(f.pageMutants, 11);
  assert.equal(f.pageKilled, 10);
  assert.equal(f.pageBeforeMutants, 12);
  assert.equal(f.pageBeforeKilled, 5);
  assert.equal(f.pageBeforeSurvived, 7);
  assert.equal(f.witnessMutants, 22);
  assert.equal(f.witnessKilled, 19);
  const none = facts({ witness: { organs, kernels: [null, { witness: null }], g4: 'x' } });
  for (const k of ['pageFiles', 'pageMutants', 'pageKilled', 'pageBeforeMutants', 'pageBeforeKilled', 'pageBeforeSurvived']) assert.equal(none[k], '—', k);
  assert.equal(none.witnessMutants, 11);
  assert.equal(none.witnessKilled, 9);
  const zero = facts({ witness: { organs, kernels: [{ witness: { total: 0, killed: 0 } }] } });
  assert.equal(zero.pageMutants, 0);
  assert.equal(zero.witnessMutants, 11);
});

test('facts · clean, not clean, or the dash; walk statuses counted exactly', () => {
  assert.equal(facts({ witness: { allClean: true } }).allClean, 'clean');
  assert.equal(facts({ witness: { allClean: false } }).allClean, 'not clean');
  for (const v of [undefined, null, 'true', 1]) assert.equal(facts({ witness: { allClean: v } }).allClean, '—', String(v));
  const walks = { walks: [{ gaps: [{ status: 'fixed' }, { status: 'needs Simon' }, null, { status: 'fixed' }, { status: 'open' }] }, { round: 2, gaps: [{ status: 'fixed' }] }] };
  const f = facts({ walks });
  assert.equal(f.walkGaps, 6);
  assert.equal(f.walkFixed, 3);
  assert.equal(f.walkNeedsSimon, 1);
  assert.equal(f.walkRounds, 2);
  const real = j('data/persona-walks.json').walks.flatMap((w) => w.gaps);
  assert.equal(FACTS.walkFixed, real.filter((g) => g.status === 'fixed').length);
  assert.equal(FACTS.walkNeedsSimon, real.filter((g) => g.status === 'needs Simon').length);
});

// ---- CLAIMS-1c G3: tools/page-rules.mjs is witness-gated ----------------------------------------------------------
test('prose · numeric entities, decimal and hex in either case; past the last code point it is kept, never a throw', () => {
  assert.equal(prose('<p>&#65;&#x42;&#X43;&#x10ffff;</p>'), 'ABC\u{10ffff}');
  assert.equal(prose('<p>a &#x110000; b &#99999999; c</p>'), 'a &#x110000; b &#99999999; c');
  assert.equal(prose('<p>&unknown; &AMP;</p>'), '&unknown; &');
});

test('jsStrings · empty strings, unterminated strings and templates, escapes in templates, a lone $', () => {
  assert.deepEqual(jsStrings("const a = ''; const b = \"\";"), []);
  assert.deepEqual(jsStrings("x = 'abc"), ['abc']);
  assert.deepEqual(jsStrings('x = "abc'), ['abc']);
  assert.deepEqual(jsStrings('x = `abc'), ['abc']);
  assert.deepEqual(jsStrings('x = `a\\`b`'), ['a`b']);
  assert.deepEqual(jsStrings("x = 'a\\'b' + \"c\\\"d\""), ["a'b", 'c"d']);
  assert.deepEqual(jsStrings('x = `cost $5 and ${n} more`'), ['cost $5 and ', ' more']);
  assert.deepEqual(jsStrings("x = 'one\ntwo'"), ['one']);
  assert.deepEqual(jsStrings("} const b = 'after';"), ['after']);
  assert.deepEqual(jsStrings('x = `a ${ f({ k: 1 }) + \'in\' } b`; y = \'z\';'), ['a ', 'in', ' b', 'z']);
  assert.deepEqual(jsStrings("// 'not this'\nconst c = 'this';"), ['this']);
  assert.deepEqual(jsStrings("a /* 'no' */ b 'yes' /* open"), ['yes']);
});

test('check · a protocol-relative or outside link is not a local link; a failure names what it found', () => {
  const outside = HTML.replace('<h2 id="what">', '<a href="//example.org/x.js">x</a><a href="https://example.org/y">y</a><h2 id="what">');
  assert.deepEqual(run({ html: outside }), []);
  const priced = run({ html: HTML.replace('<h2 id="what">', '<p>only £29 here</p><h2 id="what">') });
  assert.ok(priced.some((f) => f === 'index.html prose: a price — £2'), priced.join(' | '));
  const appPriced = run({ app: APP + "\nconst p = 'billed per seat';\n" });
  assert.ok(appPriced.some((f) => f.startsWith('page/app.mjs text: per-seat wording — "billed per seat"')), appPriced.join(' | '));
});

test('facts · total on garbage page-module receipts too', () => {
  for (const witness of [{ kernels: [null, 5, 'x', { witness: 'x' }, { witness: [] }], g4: [{}, { witness: { total: 'x' } }] }, { kernels: {}, g4: null }, { organs: 'x', kernels: 'x' }]) {
    const f = facts({ witness });
    for (const [k, v] of Object.entries(f)) assert.ok(typeof v === 'number' || (typeof v === 'string' && v.length > 0), `${k}: ${v}`);
  }
});
