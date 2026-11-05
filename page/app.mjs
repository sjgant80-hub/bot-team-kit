// page/app.mjs — the live page. Every number shown comes from the repository's receipts (through page/facts.mjs) or is
// computed here by a gated kernel: src/kernel.mjs for the try-it panel, src/mintcase.mjs for the cost case. Nothing is
// typed in; tools/page-check.mjs fails CI if a number turns up in this file's text or in the page's prose.
// Modules are imported fresh, keyed to the receipt, so a cached old kernel can never sit beside a new page.

const $ = (id) => document.getElementById(id);
const el = (tag, attrs, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v);
  for (const k of kids) n.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return n;
};
const code = (s) => el('code', {}, s);
const getJSON = async (p) => { try { const r = await fetch(p, { cache: 'no-cache' }); return r.ok ? await r.json() : null; } catch { return null; } };

const [step1b, witness, trace, basis] = await Promise.all([
  getJSON('receipts/step1b.json'), getJSON('receipts/witness.json'), getJSON('receipts/trace.json'),
  getJSON('vendor/ai-first-company/vendor/sovereign-enterprise/data/basis.json'),
]);
const shaOf = (file) => { try { return witness.organs.find((o) => o.file === file).sha256.slice(0, 16); } catch { return String(Date.now()); } };
const fresh = (path, file) => import(`${path}?v=${shaOf(file)}`);
const [K, M, F] = await Promise.all([
  fresh('../src/kernel.mjs', 'src/kernel.mjs'), fresh('../src/mintcase.mjs', 'src/mintcase.mjs'), import(`./facts.mjs?v=${shaOf('src/kernel.mjs')}`),
]);

// ── the numbers in the prose ───────────────────────────────────────────────────────────────────
const facts = F.facts({ step1b, witness, trace });
for (const n of document.querySelectorAll('[data-r]')) n.textContent = facts[n.dataset.r] ?? '—';

// ── start here: the try-it panel, on the real kernel ───────────────────────────────────────────
const today = () => new Date().toISOString().slice(0, 10);
let feed = [];
let feedDate = today();
for (const k of K.KINDS) $('t-kind').append(el('option', { value: k }, k));
$('t-agent').value = 'BUILDER';
$('t-kind').value = 'build';

function readForm() {
  const input = { agent: $('t-agent').value, kind: $('t-kind').value, what: $('t-what').value };
  const opt = { link: $('t-link').value, receipt_sha256: $('t-receipt').value.trim(), needs_owner: $('t-owner').value };
  for (const [k, v] of Object.entries(opt)) if (v !== '') input[k] = v;
  return input;
}

function renderRollup() {
  $('t-rollup').textContent = feed.length ? K.rollup(feed, feedDate) : 'The feed is empty. Write a line, or load the traced run.';
}

// exactly what append() in src/feed.mjs does, minus the file: stamp, normalize (redact + flag), validate
function writeLine() {
  const input = readForm();
  const stamped = { ts: new Date().toISOString(), ...input };
  const line = K.normalizeLine(stamped);
  const check = K.validateLine(line);
  const changed = Object.keys(stamped).filter((k) => JSON.stringify(stamped[k]) !== JSON.stringify(line[k]));
  $('t-line').textContent = JSON.stringify(line, null, 2);
  const v = $('t-verdict');
  v.textContent = '';
  if (!check.ok) {
    v.append(el('span', { class: 'bad' }, 'Refused — not written. '), check.errors.join('; ') + '. The line above is what came back: redacted, never saved.');
  } else {
    feedDate = today();
    feed.push(line);
    v.append(el('span', { class: 'ok' }, 'Saved. '));
    if (changed.length) v.append(el('span', { class: 'flag' }, 'Redacted: ' + changed.join(', ') + '. '));
    if (line.flags) v.append(el('span', { class: 'flag' }, '⚑ Flagged: ' + line.flags.join(', ') + ' — it goes to the top of the morning page. '));
    if (!changed.length && !line.flags) v.append('Nothing to redact, nothing to flag.');
  }
  renderRollup();
}

const ALNUM = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const randomTail = (n) => Array.from(crypto.getRandomValues(new Uint32Array(n)), (x) => ALNUM[x % ALNUM.length]).join('');
$('t-write').addEventListener('click', writeLine);
$('t-secret').addEventListener('click', () => {
  $('t-kind').value = 'note';
  $('t-what').value = 'pushed with ' + ['gh', 'p_'].join('') + randomTail(36) + ' — reply to dana@example.org, login password: blue river stone';
  $('t-link').value = ''; $('t-receipt').value = '';
  writeLine();
});
$('t-claim').addEventListener('click', () => {
  $('t-kind').value = 'note';
  $('t-what').value = 'deployed the page, all tests passed';
  $('t-link').value = 'see above'; $('t-receipt').value = '';
  writeLine();
});
$('t-trace').addEventListener('click', () => {
  if (!trace) { $('t-verdict').textContent = 'The traced run could not be loaded — reconnect and reload.'; return; }
  feed = trace.feedFile.slice();
  feedDate = trace.date;
  $('t-line').textContent = JSON.stringify(feed[feed.length - 1], null, 2);
  $('t-verdict').textContent = 'Loaded the traced run: the stored lines from receipts/trace.json.';
  renderRollup();
});
$('t-clear').addEventListener('click', () => { feed = []; $('t-line').textContent = ''; $('t-verdict').textContent = 'The feed is empty.'; renderRollup(); });
renderRollup();

// ── how it works: the traced run ───────────────────────────────────────────────────────────────
if (trace) {
  const tb = $('trace-table').querySelector('tbody');
  for (const s of trace.steps) {
    const saved = s.stored ? s.stored.what : 'refused: ' + s.valid.errors.join('; ');
    tb.append(el('tr', {}, el('td', {}, s.input.agent, el('br', {}), el('span', { class: 'mut' }, s.input.kind)), el('td', {}, s.input.what), el('td', {}, saved, s.stored && s.stored.link ? el('div', { class: 'mut' }, 'proof: ', code(s.stored.link)) : ''), el('td', { class: s.flags.length ? 'flag' : 'mut' }, s.flags.length ? '⚑ ' + s.flags.join(', ') : 'none')));
  }
  $('trace-rollup').textContent = trace.rollup;
} else {
  $('trace-rollup').textContent = 'receipts/trace.json could not be loaded — reconnect and reload.';
}

// ── blueprint: organs and claims, from the receipts ────────────────────────────────────────────
if (witness) {
  const tb = $('organ-table').querySelector('tbody');
  for (const o of witness.organs) {
    const w = o.witness;
    const verdict = w ? el('span', { class: w.clean ? 'ok' : 'bad' }, w.killed + ' / ' + w.total + (w.clean ? ' · clean' : ' · ' + w.survived + ' survived')) : el('span', { class: 'mut' }, 'not run');
    tb.append(el('tr', {}, el('td', {}, code(o.file)), el('td', {}, o.job), el('td', {}, ...o.tests.flatMap((t, i) => (i ? [el('br', {}), code(t)] : [code(t)]))), el('td', { class: 'num' }, verdict)));
  }
}

const said = {
  L1: (m) => [m.step1 && `${m.step1.leaked} of ${m.step1.items} leaked`, ''],
  L2: (m) => ['', m.now && `${m.now.leaked} of ${m.now.items} leaked`],
  L3: (m) => [m.step1 && `${m.step1.unchanged} of ${m.step1.items} unchanged`, m.now && `${m.now.unchanged} of ${m.now.items} unchanged`],
  L4: (m) => ['', m.now && (m.now.passed ? `${m.now.lines} lines, none leaked` : `${m.now.lines} lines: ${m.now.why}`)],
  F1: (m) => [m.step1 && `${m.step1.flagged} of ${m.step1.items} flagged`, m.now && `${m.now.flagged} of ${m.now.items} flagged`],
  F2: (m) => [m.step1 && `${m.step1.flagged} of ${m.step1.items} flagged`, m.now && `${m.now.flagged} of ${m.now.items} flagged`],
  F3: (m) => [m.step1 && `${m.step1.asStated} of ${m.step1.items} right`, m.now && `${m.now.asStated} of ${m.now.items} right`],
  R1: (m) => [m.step1 && `${m.step1.checks - m.step1.failedChecks.length} of ${m.step1.checks} checks hold`, m.now && `${m.now.checks - m.now.failedChecks.length} of ${m.now.checks} checks hold`],
  R2: (m) => [m.step1 && (m.step1.toldSimon ? 'Simon told' : 'lost in silence'), m.now && (m.now.toldSimon ? `Simon told: ${m.now.unreadable} unreadable` : 'lost in silence')],
};
const meaning = {
  L1: 'secret shapes, first build', L2: 'secret shapes, now', L3: 'lines holding no secret pass untouched', L4: 'the first build’s own fuzz, now',
  F1: 'unproven claims are flagged', F2: 'lines that claim nothing are not', F3: 'what counts as proof', R1: 'a forged rollup', R2: 'a damaged feed',
};
if (step1b) {
  const tb = $('claim-table').querySelector('tbody');
  for (const c of step1b.claims) {
    const [a, b] = (said[c.id] || (() => ['', '']))(c.measured || {});
    const v = c.held === null ? el('span', { class: 'mut' }, 'recorded') : el('span', { class: c.held ? 'ok' : 'bad' }, c.held ? 'held' : 'failed');
    tb.append(el('tr', {}, el('td', {}, el('b', {}, c.id), ' ', el('span', { class: 'mut' }, meaning[c.id] || '')), el('td', {}, c.bar), el('td', {}, a || '—'), el('td', {}, b || '—'), el('td', {}, v)));
  }
}

// ── for business: the cost case, computed by src/mintcase.mjs from the sourced basis ───────────
const gbp = (n) => '£' + Math.round(n).toLocaleString('en-GB');
const D = M.DEFAULTS;
const inputs = { 'c-hours': D.hoursPerWeek, 'c-share': D.share * 100, 'c-seats': D.seats, 'c-cases': D.casesPerWeek, 'c-tin': D.tokensIn, 'c-tout': D.tokensOut, 'c-years': D.years };
for (const [id, v] of Object.entries(inputs)) $(id).value = v;
const product = (k) => { try { return basis[k].product; } catch { return ''; } };

function renderCost() {
  if (!basis) { $('c-head').textContent = 'The sourced figures could not be loaded — reconnect and reload.'; return; }
  if (Object.keys(inputs).some((id) => $(id).value.trim() === '')) { $('c-head').textContent = 'Fill in every box to see the case.'; return; }
  const v = (id) => Number($(id).value);
  const r = M.mintCase(basis, { hoursPerWeek: v('c-hours'), share: v('c-share') / 100, seats: v('c-seats'), casesPerWeek: v('c-cases'), tokensIn: v('c-tin'), tokensOut: v('c-tout'), years: v('c-years') });
  if (!r.ok) { $('c-head').textContent = 'Check the inputs: ' + r.why + '.'; return; }
  const n = r.inputs.years, yrs = n + (n === 1 ? ' year' : ' years');
  $('c-overh').textContent = 'Over ' + yrs;
  $('c-head').textContent = '';
  if (r.savingPerYear > 0) $('c-head').append('Checking on the bots costs you ', el('b', {}, gbp(r.perYear.today)), ' a year in staff time today. With the feed: ', el('b', {}, gbp(r.perYear.own)), ' a year — ', el('b', { class: 'win' }, gbp(r.savingPerYear) + ' a year back'), ', ' + gbp(r.savingOver) + ' over ' + yrs + '.');
  else $('c-head').append('At these inputs the feed takes no staff time off, so there is nothing back in hours: running it costs about ', el('b', {}, gbp(r.lines.power)), ' a year, and the case rests on what it catches — leaked secrets and unproven claims.');
  const rows = [
    ['Today', 'Someone checks on the bots by hand: reads their logs, asks what they did, writes it up.', 'today'],
    ['Rent AI assistant licences', product('seat.copilot') + ' for ' + r.inputs.seats + (r.inputs.seats === 1 ? ' person' : ' people') + ' (' + gbp(r.lines.seats) + ' a year). It helps each person write; the checking, and the staff time, stay.', 'rentSeats'],
    ['Send every line to a cloud AI', 'A cloud model reads every feed line to redact, flag and sum it up, at ' + product('frontier') + ' rates (' + gbp(r.lines.api) + ' a year at your volume), taking the same share off — and every line, secrets and all, leaves your building first.', 'cloudApi'],
    ['Own it — bot-team-kit', 'The feed takes the same share off on a machine you already have, for about ' + gbp(r.lines.power) + ' a year of electricity (an always-on laptop’s extra draw — more than the kit needs). No licences, no meter, nothing leaves.', 'own'],
  ];
  const tb = $('c-table').querySelector('tbody');
  tb.textContent = '';
  for (const [route, what, k] of rows) tb.append(el('tr', { class: k === 'own' ? 'own' : '' }, el('td', {}, el('b', {}, route)), el('td', {}, what), el('td', { class: 'num' }, gbp(r.perYear[k])), el('td', { class: 'num' }, gbp(r.over[k]))));
  $('c-note').textContent = 'Owning beats the cloud route by ' + gbp(r.versusCloudOver) + ' over ' + yrs + ' at this volume; the bigger difference is that with the kit no line leaves your machine. The cloud route assumes ' + r.inputs.tokensIn.toLocaleString('en-GB') + ' tokens read and ' + r.inputs.tokensOut.toLocaleString('en-GB') + ' written per line. Staff time is priced at the median hourly pay with no employer on-costs, so every saving here is a floor; the share taken off is your estimate.';
  if (!(r.savingPerYear > 0)) { $('c-board').textContent = 'With no staff time to take off at these inputs, the case for the board is not about hours: it is that every agent’s action is on one page, unproven claims are flagged before anyone relies on them, and secrets never reach the record — for about ' + gbp(r.lines.power) + ' a year to run, on our own machine, MIT-licensed.'; return; }
  $('c-board').textContent = 'Our AI agents’ work is checked by hand today, at about ' + gbp(r.perYear.today) + ' a year in staff time — a floor, at the UK median hourly pay. One shared feed that strips secrets and flags unproven claims, with one page each morning for the person who signs off, takes off the share we estimate: ' + gbp(r.savingPerYear) + ' a year back, ' + gbp(r.savingOver) + ' over ' + yrs + ' with inflation, for about ' + gbp(r.lines.power) + ' a year of electricity. Renting AI assistant licences instead would add ' + gbp(r.lines.seats) + ' a year and leave the checking where it is; sending every line to a cloud model instead would cost ' + gbp(r.lines.api) + ' a year in model fees and send every line outside. The kit is MIT-licensed, runs on our own machine, and every claim about it is a receipt that GitHub’s runner re-derives. The board is not asked to trust a vendor — only to read the page.';
}
if (basis) {
  $('c-src').append(...M.sourcesOf(basis).map((s) => el('li', {}, s.what || '', s.source ? ' — ' : '', s.source ? el('a', { href: s.source, target: '_blank', rel: 'noopener' }, new URL(s.source).hostname) : '')));
}
for (const id of Object.keys(inputs)) $(id).addEventListener('input', renderCost);
renderCost();
