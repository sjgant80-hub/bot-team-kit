// gen-golden.mjs — regenerate test/golden/rollup.md from the fixed feed in
// test.mjs. Run only when the rollup format intentionally changes.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as K from '../src/kernel.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const GOLDEN_FEED = [
  { ts: '2026-11-01T08:00:00Z', agent: 'SCOUT', kind: 'lead', what: 'witness interest from a vercel maintainer', link: 'https://example/thread' },
  { ts: '2026-11-01T09:00:00Z', agent: 'BUILDER', kind: 'build', what: 'feed writer gated', receipt_sha256: 'c'.repeat(64) },
  { ts: '2026-11-01T09:30:00Z', agent: 'BUILDER', kind: 'build', what: 'all done, shipped it', needs_owner: 'AUDITOR' },
  { ts: '2026-11-01T10:00:00Z', agent: 'MONEY TIME', kind: 'listing', what: 'draft Agensi listing for the verifier skill', needs_owner: 'Simon' },
  { ts: '2026-11-01T10:15:00Z', agent: 'AUDITOR', kind: 'note', what: 'PASS: feed writer, receipts re-run clean', link: 'https://example/audit' },
  { ts: '2026-11-01T11:00:00Z', agent: 'KAR', kind: 'decision', what: 'route listing to Simon for sign-off' },
];
writeFileSync(join(here, 'golden', 'rollup.md'), K.rollup(GOLDEN_FEED, '2026-11-01'), 'utf8');
console.error('wrote test/golden/rollup.md');
