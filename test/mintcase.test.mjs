// the For-business cost case: every figure from the sourced basis, floors not top ends, like for like, never a throw
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULTS, BASIS_KEYS, sourcesOf, over, mintCase } from '../src/mintcase.mjs';

const BASIS = JSON.parse(readFileSync(new URL('../vendor/ai-first-company/vendor/sovereign-enterprise/data/basis.json', import.meta.url), 'utf8'));
const base = (patch) => ({ ...BASIS, ...patch });

test('mintCase · the default case, every line from the sourced basis', () => {
  const r = mintCase(BASIS, {});
  assert.equal(r.ok, true);
  assert.deepEqual(r.inputs, DEFAULTS);
  assert.deepEqual(r.lines, { staff: 20456.8, takenOff: 10228.4, seats: 1386, api: 117.62, power: 32.21 });
  assert.deepEqual(r.perYear, { today: 20456.8, rentSeats: 21842.8, cloudApi: 10346.02, own: 10260.61 });
  assert.deepEqual(r.over, { today: 63292.54, rentSeats: 67580.77, cloudApi: 32010.18, own: 31745.93 });
  assert.deepEqual([r.savingPerYear, r.savingOver, r.versusCloudOver], [10196.19, 31546.61, 264.25]);
});

test('mintCase · like for like: rented seats take nothing off; cloud and owned take the same share off', () => {
  const r = mintCase(BASIS, { share: 0.8, seats: 2, casesPerWeek: 1000, tokensIn: 2000, tokensOut: 500 });
  assert.equal(r.perYear.rentSeats, Math.round((r.lines.staff + r.lines.seats) * 100) / 100);
  assert.equal(r.perYear.cloudApi, Math.round((r.lines.staff - r.lines.takenOff + r.lines.api) * 100) / 100);
  assert.equal(r.perYear.own, Math.round((r.lines.staff - r.lines.takenOff + r.lines.power) * 100) / 100);
  assert.equal(r.lines.takenOff, Math.round(r.lines.staff * 0.8 * 100) / 100);
  assert.equal(r.lines.seats, Math.round(2 * 12 * BASIS['seat.copilot'].value * 100) / 100);
});

test('mintCase · the figures move with the basis, not with anything typed', () => {
  const dear = mintCase(base({ wageMedianHourly: { ...BASIS.wageMedianHourly, value: 30 } }), {});
  assert.equal(dear.lines.staff, 20 * 52 * 30);
  const cheapPower = mintCase(base({ electricityPencePerKwh: { ...BASIS.electricityPencePerKwh, value: 10 } }), {});
  assert.equal(cheapPower.lines.power, Math.round(15 * 8760 / 1000 * 10 / 100 * 100) / 100);
  const fx = mintCase(base({ fxGbpPerUsd: { ...BASIS.fxGbpPerUsd, value: 1 } }), {});
  assert.equal(fx.lines.api, Math.round(500 * 52 * (1500 * 2 + 300 * 10) / 1e6 * 100) / 100);
});

test('mintCase · boundaries hold at both ends of every input', () => {
  for (const ok of [{ hoursPerWeek: 0 }, { hoursPerWeek: 168 }, { share: 0 }, { share: 1 }, { seats: 0 }, { years: 1 }, { years: 10 }, { casesPerWeek: 0, tokensIn: 0, tokensOut: 0 }]) assert.equal(mintCase(BASIS, ok).ok, true, JSON.stringify(ok));
  assert.equal(mintCase(BASIS, { share: 1 }).perYear.own, mintCase(BASIS, { share: 1 }).lines.power);
  assert.equal(mintCase(BASIS, { share: 0 }).savingPerYear, -32.21);
  assert.equal(mintCase(BASIS, { years: 1 }).over.today, 20456.8);
});

test('mintCase · each bad input refused with its reason', () => {
  const why = (i) => mintCase(BASIS, i).why;
  assert.equal(why({ hoursPerWeek: 168.5 }), 'hours a week: 0 to 168');
  assert.equal(why({ hoursPerWeek: -1 }), 'hours a week: 0 to 168');
  assert.equal(why({ hoursPerWeek: '20' }), 'hours a week: 0 to 168');
  assert.equal(why({ share: 1.01 }), 'the share of the work taken off: 0 to 1');
  assert.equal(why({ share: -0.1 }), 'the share of the work taken off: 0 to 1');
  assert.equal(why({ seats: 2.5 }), 'seats: a whole number');
  assert.equal(why({ seats: -1 }), 'seats: a whole number');
  assert.equal(why({ casesPerWeek: -1 }), 'cases and tokens: numbers');
  assert.equal(why({ tokensIn: NaN }), 'cases and tokens: numbers');
  assert.equal(why({ tokensOut: 'x' }), 'cases and tokens: numbers');
  assert.equal(why({ years: 0 }), 'years: 1 to 10');
  assert.equal(why({ years: 11 }), 'years: 1 to 10');
  assert.equal(why({ years: 2.5 }), 'years: 1 to 10');
});

test('mintCase · refuses a basis missing any figure it reads', () => {
  const refused = { ok: false, why: 'a sourced basis with every figure the case reads' };
  assert.deepEqual(mintCase(null, {}), refused);
  for (const k of BASIS_KEYS) { const b = { ...BASIS }; delete b[k]; assert.deepEqual(mintCase(b, {}), refused, k); }
  assert.deepEqual(mintCase(base({ cpi: { value: -0.1 } }), {}), refused);
  assert.deepEqual(mintCase(base({ frontier: { inPerM: 2 } }), {}), refused);
});

test('over · CPI on every year after the first, compounding', () => {
  assert.equal(over(100, 0.1, 1), 100);
  assert.equal(over(100, 0.1, 2), 210);
  assert.equal(over(100, 0.1, 3), 331);
  assert.equal(over(100, 0, 4), 400);
  assert.equal(over(100, 0.1, 0), 0);
});

test('sourcesOf · every figure the case reads, with what it is and where it came from', () => {
  const s = sourcesOf(BASIS);
  assert.deepEqual(s.map((x) => x.key), [...BASIS_KEYS]);
  assert.match(s.find((x) => x.key === 'wageMedianHourly').source, /^https:\/\/www\.ons\.gov\.uk\//);
  assert.equal(s.find((x) => x.key === 'seat.copilot').what, 'Microsoft 365 Copilot (enterprise)');
  assert.ok(s.filter((x) => x.key !== 'hoursPerYear').every((x) => /^https:\/\//.test(x.source)));
  assert.deepEqual(sourcesOf(null), []);
});

test('mintCase · totality: garbage never throws', () => {
  const G = [undefined, null, 0, 'x', [], {}, { hoursPerWeek: {} }, { years: Infinity }, true, () => 1];
  for (const a of G) for (const b of G) assert.doesNotThrow(() => mintCase(a, b));
  for (const g of G) { assert.doesNotThrow(() => sourcesOf(g)); assert.doesNotThrow(() => over(g, g, 3)); }
  assert.equal(mintCase(BASIS, { hoursPerWeek: {} }).ok, false);
});
