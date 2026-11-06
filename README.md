# bot-team-kit

**Live page: https://sjgant80-hub.github.io/bot-team-kit/** — what it is, start here (with the real kernel running in
your browser), how it works traced from a real run, the blueprint, adoption, the white paper and the brochure.

**One shared feed for a team of AI bots overseen by a person.** Every bot writes what it did to one file the kit only
appends to; a writer strips every secret shape it has a rule for from every string (at any depth) and flags an
unproven "done" *before* anything reaches disk; a deterministic morning rollup puts **NEEDS SIMON** at the top and can
be neither forged by a line break nor leak a known secret shape another tool wrote. MIT, Node.js, no dependencies, no
network.

Powered by the Konomi architecture, created by Thomas Frumkin. Supplied by
[AI Native Solutions](https://www.ai-nativesolutions.com).

## Proof — re-run it, don't take our word
```bash
npm run check                               # all of the below, in this order
node --test test/*.test.mjs test/test.mjs   # every suite (npm test)
node gate.mjs                               # the kit's curated mutation gate (its list may grow, never shrink)
node tools/measure.mjs --check              # the battery claims re-derive from the sealed batteries
node tools/trace.mjs --check                # the traced run on the page re-derives
node tools/page-check.mjs                   # the page carries no typed-in number, no price, the credits, every section
node tools/claims.mjs --check               # every claim every seal names has its verdict, against its own seal's bar
```
CI (`.github/workflows/ci.yml`) runs all of these on GitHub's runner on every push, plus
[witness](https://github.com/sjgant80-hub/witness) **v0.6** (pinned tag) on every organ and on the page's own three
modules (the numbers, the verdicts, the page check) — clean or the job fails — and on the first build's kernel and the
page modules as they were before CLAIMS-1c, for the before-pictures. The counts live in the receipts, not in this README:

| receipt | what it holds |
|---|---|
| [`receipts/claims.json`](receipts/claims.json) | every claim CLAIMS-1b and CLAIMS-1c seal, each with its verdict against its own seal's bar and where it is measured |
| [`receipts/step1b.json`](receipts/step1b.json) | CLAIMS-1b's L, F and R claims, measured once against the first build (read from git) and the code now |
| [`receipts/witness.json`](receipts/witness.json) | tests, the curated gate (G2), witness on every organ (G1), on the first build's kernel (G0), on the page's own modules (G3) and on them before CLAIMS-1c (G4) |
| [`receipts/trace.json`](receipts/trace.json) | one real run through `append()` and `buildRollup()`, fixed clock (T1) |
| [`receipts/build-step1.json`](receipts/build-step1.json) | the first build's receipt, kept as it was |

The claims were sealed before the code that measures them: [`CLAIMS-1b.md`](CLAIMS-1b.md) and
[`data/probe-1b.json`](data/probe-1b.json), then [`CLAIMS-1c.md`](CLAIMS-1c.md) for gating the page's own modules
(never edited after the seal; a failed claim stays failed).

## What's in the kit
| file | does |
|---|---|
| `src/kernel.mjs` | pure, total functions: `redact` / `redactLine` (deep), `claimsDone`, `isProof`, `flagsFor`, `validateLine`, `normalizeLine`, `rollup`. The gated surface. |
| `src/feed.mjs` | append one redacted, flagged, valid JSON line to the feed; read it back counting unreadable lines (CLI + library). |
| `src/rollup.mjs` | read the feed → write `AGENT_FEED.md` (NEEDS SIMON first, then each bot, newest first). |
| `src/mintcase.mjs` | the cost case on the page — liveware's gated kernel and its sourced basis, vendored byte for byte (`vendor/VENDOR.json`). |
| `schema.json` | JSON Schema for a feed line. |
| `gate.mjs` | the curated mutation gate over `test/checks.mjs` (the first build's suite, unchanged) and `test/checks-1b.mjs`. |
| `test/` | the first build's suite, the kernel suite, the I/O suite (temp folders only), the cost case, the pins, the page check. |
| `skills/feed-write/SKILL.md` | the skill a bot loads to write the feed; pinned to the kernel's SHA-256 (`test/pins.test.mjs`). |
| `page/` · `index.html` | the live page; every number on it comes from the receipts (`page/facts.mjs`, witness-gated) or a kernel. |
| `tools/` | measure, trace, gates, page-check and claims — each with a `--check` mode CI runs; the pure logic of the last two is `tools/page-rules.mjs` and `tools/verdicts.mjs`, witness-gated. |

## The feed line
```json
{"ts":"2026-11-01T11:00:00Z","agent":"BUILDER","kind":"build",
 "what":"feed writer gated","receipt_sha256":"…64 hex…","needs_owner":"AUDITOR"}
```
`kind` ∈ task · handoff · build · receipt · listing · post · lead · decision · blocker · note. A line that claims work
is finished (a finishing word that is not negated, or kind `build` / `receipt`) with no 64-hex receipt and no proof link
(an http(s) URL, a repository path or a file name) is flagged `done-without-receipt`. A line that fails the schema is
refused and not written — and comes back redacted.

## Usage
```bash
# write a line (the feed defaults to ~/.estate/feed.jsonl; override with BOT_TEAM_FEED or --feed)
node src/feed.mjs --agent KAR --kind decision --what "route listing to Simon"

# build the morning rollup
node src/rollup.mjs --out AGENT_FEED.md
```

## What it does not claim
The batteries were written after reading the code: they show which shapes are covered, not how a stranger's wording
fares. Lines are not signed here (the signed team feed, with each bot's key, is
[ai-first-company](https://sjgant80-hub.github.io/ai-first-company/#team)). The kit checks that a proof looks like one;
the auditor re-runs it.

## The team it was built for
**KAR** conducts, **BUILDER** builds against the gate, **MONEY TIME** sells, **REACH** posts, **SCOUT** watches,
**CLIENT LEAD** takes enquiries, **CARD KEEPER** signs releases, **AUDITOR** (a separate judge) checks every claim
against its receipt. One role per bot; hand-offs through the feed; anything public, paid or risky waits for the person.
