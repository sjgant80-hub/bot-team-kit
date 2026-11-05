// tools/page-check.mjs — CLAIMS-1b P1: the live page carries no number typed into its prose (every count is read from
// receipts/ through page/facts.mjs, or computed by a kernel in the page), none of our prices, no tier / per-seat /
// crypto / earnings wording, the Konomi credit and the supplier, every section the page must explain itself with, a
// value for every number it binds, and no dead local link.
//   node tools/page-check.mjs        check index.html + page/app.mjs against the committed receipts (CI)
// "Prose" is what a reader reads: the page's text outside <code>, <pre>, <script> and <style>, its title and
// description, and every string the page script writes. A number counts as typed in when it stands as its own token
// (so "step1b.json", "v0.6" and "SHA-256" are names, while "84 killed" and "£29" are numbers).
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export const SECTIONS = Object.freeze(['what', 'start', 'how', 'blueprint', 'adoption', 'paper', 'brochure', 'roles', 'cost', 'security', 'ownership', 'rollout', 'risks', 'board']);
export const CREDIT = 'Powered by the Konomi architecture, created by Thomas Frumkin';
export const SUPPLIER = { name: 'AI Native Solutions', href: 'https://www.ai-nativesolutions.com' };
// a reviewed name that holds a standalone number would be listed here with its reason; there is none
export const ALLOWED_NUMBERS = Object.freeze({});
export const FORBIDDEN = Object.freeze([
  ['a price', /[£$€]\s?\d/],
  ['a price', /\b\d[\d,.]*\s?(?:GBP|USD|EUR)\b/],
  ['per-seat wording', /\bper[- ](?:seat|user|head|month|year)\b/i],
  ['per-month wording', /\/\s?mo(?:nth)?\b/i],
  ['pricing wording', /\bpricing\b|\bprice list\b|\bpriceCurrency\b|"@type"\s*:\s*"Offer"/i],
  ['tier wording', /\btiers?\b|\bfree plan\b|\bpro plan\b|\bsubscriptions?\b/i],
  ['crypto wording', /\bcrypto\b|\bcryptocurrenc|\bbitcoin\b|\btoken sale\b|\bairdrop\b|\bNFTs?\b/i],
  ['earnings wording', /\bearnings?\b|\bpassive income\b|\bget rich\b|\bguaranteed returns?\b/i],
]);

const ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘' };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
  return ENTITIES[e.toLowerCase()] ?? m;
});

/** the text a reader reads, from the page's HTML: tags, code, pre, script and style removed; title and description kept */
export function prose(html) {
  const h = String(html ?? '');
  const desc = (h.match(/<meta\s+name="description"\s+content="([^"]*)"/i) || [])[1] || '';
  const body = h
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|pre|code)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  return decode(desc + ' ' + body).replace(/\s+/g, ' ').trim();
}

/** every string literal's text in a script (template literals without their ${…} parts); comments skipped */
export function jsStrings(src) {
  const s = String(src ?? '');
  const out = [];
  let i = 0;
  const readQuoted = (q) => { let t = ''; i++; while (i < s.length && s[i] !== q) { if (s[i] === '\\') { t += s[i + 1] ?? ''; i += 2; continue; } if (s[i] === '\n') break; t += s[i++]; } i++; return t; };
  const readTemplate = () => {
    let t = ''; i++;
    while (i < s.length && s[i] !== '`') {
      if (s[i] === '\\') { t += s[i + 1] ?? ''; i += 2; continue; }
      if (s[i] === '$' && s[i + 1] === '{') { out.push(t); t = ''; i += 2; skipCode('}'); continue; }
      t += s[i++];
    }
    i++; out.push(t);
  };
  // walk code until the closing brace that ends a ${…} (or the end of the file), collecting nested strings
  const skipCode = (closer) => {
    let depth = 0;
    while (i < s.length) {
      const c = s[i], d = s[i + 1];
      if (c === '/' && d === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
      if (c === '/' && d === '*') { const e = s.indexOf('*/', i + 2); i = e === -1 ? s.length : e + 2; continue; }
      if (c === "'" || c === '"') { out.push(readQuoted(c)); continue; }
      if (c === '`') { readTemplate(); continue; }
      if (c === '{') depth++;
      if (c === '}') { if (depth === 0 && closer === '}') { i++; return; } depth--; }
      i++;
    }
  };
  skipCode(null);
  return out.filter((t) => t.length > 0);
}

const NUMBER = /(?<![\w.\/#:@-])\d+(?:[.,]\d+)*(?![\w\/-])/g;
/** the standalone numbers in a text, minus the reviewed names */
export function numbersIn(text) {
  let t = String(text ?? '');
  for (const name of Object.keys(ALLOWED_NUMBERS)) t = t.split(name).join(' ');
  return t.match(NUMBER) || [];
}

/** every check; returns the list of failures (empty = pass) */
export function check({ html, app, facts, exists }) {
  const fails = [];
  const text = prose(html);
  const strings = jsStrings(app);
  const seen = (where, s) => { for (const n of numbersIn(s)) fails.push(`${where}: a number is typed in — "${n}" in "${s.slice(0, 80)}"`); };
  seen('index.html prose', text);
  for (const s of strings) seen('page/app.mjs text', s);
  for (const [what, re] of FORBIDDEN) {
    if (re.test(text)) fails.push(`index.html prose: ${what} — ${(text.match(re) || [])[0]}`);
    for (const s of strings) if (re.test(s)) fails.push(`page/app.mjs text: ${what} — "${s.slice(0, 80)}"`);
  }
  if (!text.includes(CREDIT)) fails.push('the Konomi credit is missing');
  if (!text.includes(SUPPLIER.name) || !String(html).includes(`href="${SUPPLIER.href}"`)) fails.push('the supplier (AI Native Solutions, linked) is missing');
  for (const id of SECTIONS) if (!new RegExp(`\\bid="${id}"`).test(html)) fails.push(`section #${id} is missing`);
  const keys = [...String(html).matchAll(/data-r="([^"]+)"/g)].map((m) => m[1]);
  if (keys.length === 0) fails.push('the page binds no receipt numbers at all');
  for (const k of new Set(keys)) if (!(k in facts) || facts[k] === '—') fails.push(`data-r="${k}" has no value in the receipts`);
  const local = [...String(html).matchAll(/\b(?:href|src)="([^"#:?]+)(?:[?#][^"]*)?"/g)].map((m) => m[1]).filter((p) => p && !p.startsWith('//'));
  const fetched = strings.filter((s) => /^(?:receipts|data|vendor)\/[\w./-]+\.json$/.test(s));
  for (const p of new Set([...local, ...fetched])) if (!exists(p)) fails.push(`a local link is dead: ${p}`);
  for (const h of String(html + '\n' + app).match(/\b[0-9a-f]{64}\b/g) || []) fails.push(`a receipt hash is typed in: ${h.slice(0, 16)}…`);
  return fails;
}

async function main() {
  const rd = (p) => readFileSync(join(root, p), 'utf8');
  const j = (p) => { try { return JSON.parse(rd(p)); } catch { return null; } };
  const { facts } = await import(pathToFileURL(join(root, 'page', 'facts.mjs')).href);
  const f = facts({ step1b: j('receipts/step1b.json'), witness: j('receipts/witness.json'), trace: j('receipts/trace.json'), walks: j('data/persona-walks.json') });
  const fails = check({ html: rd('index.html'), app: rd('page/app.mjs'), facts: f, exists: (p) => existsSync(join(root, p)) });
  if (fails.length) { console.error(`P1 FAILED — ${fails.length} problem(s):\n  ` + fails.join('\n  ')); return 1; }
  const n = new Set([...rd('index.html').matchAll(/data-r="([^"]+)"/g)].map((m) => m[1])).size;
  console.error(`P1 held: no typed-in number, no price or tier wording, credit and supplier present, ${SECTIONS.length} sections, ${n} bound numbers all read from the receipts`);
  return 0;
}

const isMain = (() => { try { return pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url; } catch { return false; } })();
if (isMain) process.exitCode = await main();
