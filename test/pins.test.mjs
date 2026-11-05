// pins.test.mjs — C1 (the cost case is liveware's gated kernel and sourced basis, byte for byte) and the skill's drift
// pin (skills/feed-write/SKILL.md names the sha256 of the kernel it was audited against; a changed kernel fails here
// until the skill is re-audited and the pin moved).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url));
const sha = (b) => createHash('sha256').update(b).digest('hex');

test('C1 · vendored cost case, its test and its basis match the pins in vendor/VENDOR.json and CLAIMS-1b.md', () => {
  const v = JSON.parse(read('vendor/VENDOR.json'));
  const seal = read('CLAIMS-1b.md').toString();
  assert.equal(v.files.length, 3);
  for (const f of v.files) {
    assert.equal(sha(read(f.path)), f.sha256, f.path);
    assert.ok(seal.includes(f.sha256), `${f.path}: pin not in the seal`);
  }
});

test('skill drift pin · SKILL.md is pinned to the kernel as it stands', () => {
  const skill = read('skills/feed-write/SKILL.md').toString();
  const pin = (skill.match(/^hash_pin: src\/kernel\.mjs@sha256:([0-9a-f]{64})$/m) || [])[1];
  assert.equal(pin, sha(read('src/kernel.mjs')), 'the kernel changed: re-audit the skill, then move its hash_pin');
});
