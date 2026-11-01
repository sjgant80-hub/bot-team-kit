---
name: feed-write
owner: KAR
also_allowed: [BUILDER, MONEY TIME, REACH, SCOUT, CLIENT LEAD, CARD KEEPER, AUDITOR]
version: 0.1.0
hash_pin: src/kernel.mjs@sha256  # re-audit on drift
runtimes: [claude-code, codex, grok]
tools: [node]
inputs: { agent: string, kind: enum, what: string, link?: url, receipt_sha256?: hex64, needs_owner?: string }
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
- You finished something — attach the receipt (`receipt_sha256`) or a proof `link`,
  or the writer will FLAG it `done-without-receipt`.

## Inputs
| field | required | notes |
|---|---|---|
| `agent` | yes | your persona name |
| `kind` | yes | task · handoff · build · receipt · listing · post · lead · decision · blocker · note |
| `what` | yes | plain language; keys/tokens/emails/card numbers are auto-redacted before disk |
| `link` | no | URL/path to the artifact or proof |
| `receipt_sha256` | no | 64-hex hash of the re-runnable receipt |
| `needs_owner` | no | next persona, or `Simon` for sign-off |

## Outputs
One JSON line appended to the feed (master lives on the box at
`~/.estate/feed.jsonl`; estate-continuity mirrors it). The writer sets `ts`, runs
redaction, and adds `flags` if needed — callers never set `flags`.

## Allowed tools
`node` only. No network, no secrets. The writer refuses nothing but redacts
everything sensitive; a "done" claim with no receipt/link is flagged, not blocked.

## How
```bash
node src/feed.mjs --agent BUILDER --kind build \
  --what "feed writer gated, 9/9 mutants killed" \
  --receipt 9b15d4ff54fb189cf942fae1528037d3bcb496d5ca84c1bbe6af840e98dd57c5
```
Library form:
```js
import { append } from 'bot-team-kit/src/feed.mjs';
append({ agent: 'KAR', kind: 'decision', what: 'route listing to Simon' });
```

## Receipt
See `receipts/sample-receipt.json` for the receipt shape this skill's tests emit,
and `receipts/build-step1.json` for this kit's own build receipt.

## Rules this skill enforces (from RULES.md)
- Rule 3: every claim links a re-runnable receipt — `done` without one is flagged.
- Rule 6: `needs_owner: Simon` for anything public/paid/risky.
- Secrets never reach disk: redaction runs before validation, so a rejected line
  is still redacted.
