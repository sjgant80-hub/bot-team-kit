// page.test.mjs — the page check (tools/page-check.mjs, CLAIMS-1b P1) bites, and page/facts.mjs (every number the page
// shows) is total. The real page and receipts must pass; each planted fault must be caught.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prose, jsStrings, numbersIn, check, CREDIT, SECTIONS } from '../tools/page-check.mjs';
import { facts } from '../page/facts.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(root, p), 'utf8');
const j = (p) => JSON.parse(rd(p));
const HTML = rd('index.html');
const APP = rd('page/app.mjs');
const FACTS = facts({ step1b: j('receipts/step1b.json'), witness: j('receipts/witness.json'), trace: j('receipts/trace.json'), walks: existsSync(join(root, 'data/persona-walks.json')) ? j('data/persona-walks.json') : undefined });
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
  assert.equal(FACTS.claimsHeld, j('receipts/step1b.json').summary.held);
  assert.equal(FACTS.traceLines, j('receipts/trace.json').counts.lines);
});
