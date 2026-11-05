---
name: feed-write
owner: KAR
also_allowed: [BUILDER, MONEY TIME, REACH, SCOUT, CLIENT LEAD, CARD KEEPER, AUDITOR]
version: 0.2.0
hash_pin: src/kernel.mjs@sha256:0551256cf813718698718b6c03e0c32fb7a95d9b2b8c0b6ebfbc3223065d39a7
runtimes: [claude-code, codex, grok]
tools: [node]
inputs: { agent: string, kind: enum, what: string, link?: url-or-path, receipt_sha256?: hex64, needs_owner?: string }
outputs: [.estate/feed.jsonl line]
---

# feed-write — write one line to the shared bot-team feed

## What
Append a single, redacted, flagged, schema-valid JSON line to the shared feed
(`.estate/feed.jsonl`). This is how every persona records an action and hands off.
The feed is the team's single source of truth — hand-offs happen here, not in
private chats.

## When
- You (a persona) did something another persona or Simon needs to see or act on.
- You are handing work to the next persona (`needs_owner`) or escalating to Simon
  (`needs_owner: "Simon"`).
- You finished something — attach the receipt (`receipt_sha256`) or a proof `link`
  (an `https` URL or a repository path), or the writer will FLAG it
  `done-without-receipt`. A `build` or `receipt` line is always a claim.

## Inputs
| field | required | notes |
|---|---|---|
| `agent` | yes | your persona name |
| `kind` | yes | task · handoff · build · receipt · listing · post · lead · decision · blocker · note |
| `what` | yes | plain language; keys, tokens, passwords, emails and card numbers are redacted before disk |
| `link` | no | an `https` URL, a repository path or a file name for the artifact or proof ("see above" is not proof) |
| `receipt_sha256` | no | 64-hex hash of the re-runnable receipt |
| `needs_owner` | no | next persona, or `Simon` for sign-off |

Any other field may be added (an object, a list); every string in it, at any
depth, is redacted too.

## Outputs
One JSON line appended to the feed (the master lives on the box at
`~/.estate/feed.jsonl`; a private shared repository can mirror it). The writer
sets `ts`, runs redaction, and adds `flags` if needed — flags a caller sets are
ignored and recomputed.

## Allowed tools
`node` only. No network, no secrets. The writer redacts every secret shape it
has a rule for (the list is in `src/kernel.mjs`, `REDACTIONS`, plus emails and
card numbers) and rejects a line that fails the schema (a missing field, a kind
not on the list, a time that is not ISO 8601): a rejected line is not written.
A "done" claim with no receipt or proof link is flagged, not blocked.

## How
```bash
node src/feed.mjs --agent BUILDER --kind build \
  --what "rollup gated" --link receipts/witness.json
```
Library form:
```js
import { append } from 'bot-team-kit/src/feed.mjs';
append({ agent: 'KAR', kind: 'decision', what: 'route listing to Simon' });
```

## Receipt
See `receipts/sample-receipt.json` for the receipt shape this skill's tests emit,
`receipts/build-step1.json` for the kit's first build receipt, and
`receipts/step1b.json` / `receipts/witness.json` for the current ones.

## Drift pin
`hash_pin` names the sha256 of `src/kernel.mjs` this skill was audited against.
`test/pins.test.mjs` fails the moment the kernel changes, until the skill is
re-audited and the pin moved.

## Rules this skill enforces (from RULES.md)
- Rule 3: every claim links a re-runnable receipt — `done` without one is flagged.
- Rule 6: `needs_owner: Simon` for anything public/paid/risky.
- Secrets never reach disk: redaction runs before validation, so a rejected line
  is still redacted.
