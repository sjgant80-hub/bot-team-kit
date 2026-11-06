// tools/page-check.mjs — CLAIMS-1b P1: the live page carries no number typed into its prose (every count is read from
// receipts/ through page/facts.mjs, or computed by a kernel in the page), none of our prices, no tier / per-seat /
// crypto / earnings wording, the Konomi credit and the supplier, every section the page must explain itself with, a
// value for every number it binds, and no dead local link.
//   node tools/page-check.mjs        check index.html + page/app.mjs against the committed receipts (CI)
// The rules are pure and live in tools/page-rules.mjs (witness-gated, CLAIMS-1c G3); this file reads the files and
// runs them.
import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { check, SECTIONS } from './page-rules.mjs';

export { SECTIONS, CREDIT, SUPPLIER, ALLOWED_NUMBERS, FORBIDDEN, prose, jsStrings, numbersIn, check } from './page-rules.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  const rd = (p) => readFileSync(join(root, p), 'utf8');
  const j = (p) => { try { return JSON.parse(rd(p)); } catch { return null; } };
  const { facts } = await import(pathToFileURL(join(root, 'page', 'facts.mjs')).href);
  const f = facts({ step1b: j('receipts/step1b.json'), witness: j('receipts/witness.json'), trace: j('receipts/trace.json'), walks: j('data/persona-walks.json'), claims: j('receipts/claims.json') });
  const fails = check({ html: rd('index.html'), app: rd('page/app.mjs'), facts: f, exists: (p) => existsSync(join(root, p)) });
  if (fails.length) { console.error(`P1 FAILED — ${fails.length} problem(s):\n  ` + fails.join('\n  ')); return 1; }
  const n = new Set([...rd('index.html').matchAll(/data-r="([^"]+)"/g)].map((m) => m[1])).size;
  console.error(`P1 held: no typed-in number, no price or tier wording, credit and supplier present, ${SECTIONS.length} sections, ${n} bound numbers all read from the receipts`);
  return 0;
}

const isMain = (() => { try { return pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url; } catch { return false; } })();
if (isMain) process.exitCode = await main();
