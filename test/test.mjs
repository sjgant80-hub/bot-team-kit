// test.mjs — node:test runner. Wraps the shared CHECKS suite and adds the
// golden-rollup determinism test (same input -> byte-identical output, and it
// matches the committed golden file).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as K from '../src/kernel.mjs';
import { CHECKS } from './checks.mjs';

const here = dirname(fileURLToPath(import.meta.url));

for (const name of Object.keys(CHECKS)) {
  test(name, () => { CHECKS[name](K); });
}

// Fixed feed for the golden test — no clock, no randomness.
const GOLDEN_FEED = [
  { ts: '2026-11-01T08:00:00Z', agent: 'SCOUT', kind: 'lead', what: 'witness interest from a vercel maintainer', link: 'https://example/thread' },
  { ts: '2026-11-01T09:00:00Z', agent: 'BUILDER', kind: 'build', what: 'feed writer gated', receipt_sha256: 'c'.repeat(64) },
  { ts: '2026-11-01T09:30:00Z', agent: 'BUILDER', kind: 'build', what: 'all done, shipped it', needs_owner: 'AUDITOR' },
  { ts: '2026-11-01T10:00:00Z', agent: 'MONEY TIME', kind: 'listing', what: 'draft Agensi listing for the verifier skill', needs_owner: 'Simon' },
  { ts: '2026-11-01T10:15:00Z', agent: 'AUDITOR', kind: 'note', what: 'PASS: feed writer, receipts re-run clean', link: 'https://example/audit' },
  { ts: '2026-11-01T11:00:00Z', agent: 'KAR', kind: 'decision', what: 'route listing to Simon for sign-off' },
];

test('golden rollup is deterministic', () => {
  const a = K.rollup(GOLDEN_FEED, '2026-11-01');
  const b = K.rollup([...GOLDEN_FEED], '2026-11-01');
  assert.equal(a, b, 'rollup must be byte-identical across runs');
});

test('golden rollup matches committed golden file', () => {
  const got = K.rollup(GOLDEN_FEED, '2026-11-01');
  const want = readFileSync(join(here, 'golden', 'rollup.md'), 'utf8');
  assert.equal(got, want, 'rollup output drifted from test/golden/rollup.md — regenerate with: node test/gen-golden.mjs');
});
