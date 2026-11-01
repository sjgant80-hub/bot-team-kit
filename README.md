# bot-team-kit

**A company run by bots, overseen by a human — this is its nervous system.** One
shared feed every bot reads and writes, a redaction+flag writer so secrets never
reach disk and a "done" with no proof gets flagged, a deterministic daily rollup
with **NEEDS SIMON** at the top, and a mutation gate that proves the tests actually
catch breakage. MIT.

> **Live page (enable on merge):** https://sjgant80-hub.github.io/bot-team-kit/ —
> explains what it is, how it works, and the blueprint, on the page.

## Proof (re-run it — don't take our word)
```bash
node --test test/test.mjs   # 11 passed / 0 failed
node gate.mjs               # 9/9 mutants killed — GREEN
```
CI runs both on every push (`.github/workflows/ci.yml`). Build receipt with source
hashes and anchor: [`receipts/build-step1.json`](receipts/build-step1.json)
(anchor `9b15d4ff…57c5`).

## What's in the kit
| file | does |
|---|---|
| `src/kernel.mjs` | pure, total functions: `redact`, `flagsFor`, `validateLine`, `rollup`. The gated surface. |
| `src/feed.mjs` | append one redacted+flagged+valid JSON line to `.estate/feed.jsonl` (CLI + library). |
| `src/rollup.mjs` | read the feed → write `AGENT_FEED.md` (daily rollup, NEEDS SIMON at top). |
| `schema.json` | JSON Schema for a feed line. |
| `gate.mjs` | mutation gate: breaks the kernel 9 ways, proves the tests kill each. |
| `test/` | node:test suite — 1000-line redaction fuzz (0 leaks), flag both branches, golden rollup determinism. |
| `skills/feed-write/SKILL.md` | the first team skill: what/when/inputs/outputs/allowed-tools, multi-runtime frontmatter. |
| `receipts/` | sample receipt shape + this build's receipt. |

## The feed line
```json
{"ts":"2026-11-01T11:00:00Z","agent":"BUILDER","kind":"build",
 "what":"feed writer gated","receipt_sha256":"…64 hex…","needs_owner":"AUDITOR"}
```
`kind` ∈ task · handoff · build · receipt · listing · post · lead · decision ·
blocker · note. The writer **auto-redacts** keys/tokens/emails/card numbers from
every string field *before* anything is written, and **auto-flags** a `done`-style
claim with no `receipt_sha256` and no `link`.

## Usage
```bash
# write a line (master feed defaults to ~/.estate/feed.jsonl; override with --feed)
node src/feed.mjs --agent KAR --kind decision --what "route listing to Simon"

# build the morning rollup
node src/rollup.mjs --out AGENT_FEED.md
```

## The model (full spec)
See the live page. Roster: **KAR** conducts, **BUILDER** builds against the gate,
**MONEY TIME** sells, **REACH** posts, **SCOUT** watches, **CLIENT LEAD** runs
intake, **CARD KEEPER** signs releases, **AUDITOR** (separate judge) checks every
claim against its receipt. One role per bot; hand off via the feed; anything
public/paid/risky waits for Simon.
