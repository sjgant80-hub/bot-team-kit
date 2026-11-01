// rollup.mjs — I/O wrapper: read the feed, write AGENT_FEED.md (daily rollup by
// persona, NEEDS SIMON at the top). The rendering is pure (kernel.rollup), so a
// given feed + date always produces byte-identical markdown (golden-tested).
//
// CLI:
//   node src/rollup.mjs [--feed PATH] [--out PATH] [--date YYYY-MM-DD]

import { writeFileSync } from 'node:fs';
import { rollup } from './kernel.mjs';
import { readFeed, defaultFeedPath } from './feed.mjs';

export function buildRollup(feedPath = defaultFeedPath(), dateStr) {
  const lines = readFeed(feedPath);
  const d = dateStr || new Date().toISOString().slice(0, 10);
  return rollup(lines, d);
}

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i];
    if (!k || !k.startsWith('--')) continue;
    a[k.slice(2)] = argv[i + 1];
  }
  return a;
}

if (process.argv[1]?.endsWith('rollup.mjs')) {
  const a = parseArgs(process.argv.slice(2));
  const md = buildRollup(a.feed || defaultFeedPath(), a.date);
  if (a.out) { writeFileSync(a.out, md, 'utf8'); console.error(`wrote ${a.out}`); }
  else process.stdout.write(md);
}
