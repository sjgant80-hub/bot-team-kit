# CLAIMS-1c — gating the page's own modules (sealed before the code that measures it)

Sealed 2026-11-06 by Kar, on top of `f1d8e70` (step 1b and its two rounds of buyer walks, as pushed). This file is
committed before any code that measures it and is never edited afterwards. `CLAIMS-1b.md` is not touched: its claims
and verdicts stand as they are. Results go to `receipts/witness.json` (G3, G4), `receipts/claims.json` (V1) and
`data/persona-walks.json` (W2). A claim that fails stays failed on the record; a fix is a new claim in a new file.

## Why this fold exists

Re-checking the finished step 1b strictly on 2026-11-06 found that the page's own logic is tested but has never been
mutation-gated. Witness gates the four organs in `src/`; it has never run on the three modules that decide what a
buyer reads on the live page:

1. `page/facts.mjs` fills every number on the page from the receipts.
2. The verdict half of `tools/claims.mjs` (`sealTable`, `hashPairs`, the G1, G2 and W1 verdicts, `verdicts`,
   `summary`) gives every sealed claim the verdict the page shows.
3. The rule half of `tools/page-check.mjs` (`prose`, `jsStrings`, `numbersIn`, `check`) is P1: the check that the page
   carries no typed-in number, none of our prices, the credits and every section.

A local witness v0.6 run (this laptop, not GitHub's runner, so not a measurement and not a claim) left mutants alive
in all three: an empty string or a non-finite number would show instead of the dash; an empty organ list would pass
G1's "ran" check; an unterminated string in the page script would be read with a stray word on its end. Those runs
only located the work. The before-picture on the record is G4, measured on GitHub's runner.

The CLI halves of `tools/claims.mjs` and `tools/page-check.mjs` (reading files, spawning the named checks, writing or
comparing the receipt) stay where they are and are held the way `tools/measure.mjs`, `tools/trace.mjs` and
`tools/gates.mjs` are held: CI re-derives what they write byte for byte, or runs them as the check. The pure halves
move into their own files so witness gates exactly the logic, with no behaviour change: every receipt the CLIs write
must re-derive unchanged except where this seal says it changes.

## The claims

"Before" means the files exactly as at `f1d8e70`, with that commit's tests; "now" means this fold's code.

| id | claim | bar |
|---|---|---|
| G3 | witness v0.6 (the pinned tag), cap 800, per-mutant timeout 30000 ms, on GitHub's runner, on `page/facts.mjs` (with `test/page.test.mjs`), `tools/verdicts.mjs` — the verdict half of `tools/claims.mjs` — (with `test/claims.test.mjs`) and `tools/page-rules.mjs` — the rule half of `tools/page-check.mjs` — (with `test/page.test.mjs`) | clean on every file, nothing capped; any baselined survivor carries its written reason in `witness.baseline.json` and is shown on the page |
| G4 | witness v0.6, the same settings, on GitHub's runner, on `page/facts.mjs`, `tools/claims.mjs` and `tools/page-check.mjs` as at `f1d8e70`, with that commit's tests | recorded only — the before-picture |
| V1 | `receipts/claims.json` carries a verdict for every claim in every seal (`CLAIMS-1b.md`, then `CLAIMS-1c.md`), each against its own seal's bar, and every CLAIMS-1b verdict is the one it had at `f1d8e70` | CI re-derives it byte for byte; a test compares each CLAIMS-1b verdict with `f1d8e70`'s receipt, read from git |
| W2 | a third round of the four buyer walks (CFO, CTO / CISO, COO, procurement) of the page as served after this fold, kept in `data/persona-walks.json` beside rounds 1 and 2 | every buyer walked, with what each checked; every gap fixed on the page, or listed as needing Simon with the exact decision |

Nothing here claims that the CLI halves are mutation-gated (they are held by re-derivation), that witness's operator
set is every possible fault, or anything about the batteries beyond what CLAIMS-1b already says.
