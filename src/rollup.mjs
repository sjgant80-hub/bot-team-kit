// rollup.mjs — I/O wrapper: read the feed, write AGENT_FEED.md (daily rollup by
// persona, NEEDS SIMON at the top). The rendering is pure (kernel.rollup), so a
// given feed + date always produces byte-identical markdown (golden-tested).
// Lines that cannot be read are counted and reported to Simon first.
//
// CLI:
//   node src/rollup.mjs [--feed PATH] [--out PATH] [--date YYYY-MM-DD]

import { writeFileSync } from 'node:fs';
import { rollup } from './kernel.mjs';
import { readFeedReport, defaultFeedPath, parseArgs, isMain } from './feed.mjs';

export function buildRollup(feedPath = defaultFeedPath(), dateStr) {
  const { lines, unreadable } = readFeedReport(feedPath);
  const d = dateStr || new Date().toISOString().slice(0, 10);
  return rollup(lines, d, unreadable);
}

export function main(argv) {
  const a = parseArgs(argv);
  const md = buildRollup(a.feed || defaultFeedPath(), a.date);
  if (a.out) { writeFileSync(a.out, md, 'utf8'); console.error(`wrote ${a.out}`); }
  else process.stdout.write(md);
  return 0;
}

if (isMain(import.meta.url, process.argv[1])) process.exitCode = main(process.argv.slice(2));
