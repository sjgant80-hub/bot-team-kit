# CLAIMS-1b — finishing step 1 (sealed before the code that measures it)

Sealed 2026-11-04 by Kar, on top of `4c20fd9` (step 1 as it was built and merged). This file and
`data/probe-1b.json` (sha256 `d7bf3efd7728e953f65254dc48a5332fffc2b6dcce1e07ca572a774f23a9ce7f`) are committed
before any code that measures them and are never edited afterwards. Results go to `receipts/step1b.json` and
`receipts/witness.json`. A claim that fails stays failed on the record; a fix is a new claim in a new file.

## Why this fold exists

Reading step 1's code on 2026-11-04 found gaps between what the page says and what the code does:

1. "Deep-redact every string" redacts top-level strings only; a secret in a nested field or a list reaches disk.
2. Common secret shapes have no rule: GitHub fine-grained tokens, Stripe keys, xAI / npm / Hugging Face tokens,
   webhook secrets, Slack webhook URLs, `Basic` auth headers, a private key pasted without its end line, PGP key
   blocks, and any labelled secret whose label is part of a longer name (`GITHUB_TOKEN=`, `client_secret`,
   `access_token=`), because the label rule needs a word boundary that `_` does not give.
3. A card number followed by a short number (its security code, its expiry) is read as one longer number, fails
   the Luhn check, and is left in.
4. The done-claim words miss `deployed`, `merged`, `released`, `fixed`, `passed`, `built`, `live`, ...; a `build` or
   `receipt` line with no receipt is not flagged; and any non-empty `link` (even "see above") counts as proof.
5. The rollup copies text into Markdown unchanged, so a line break inside a field can forge a heading
   (`## NEEDS SIMON`) or an item in Simon's brief; and it re-prints whatever is in the file, so a secret written
   to the feed by some other tool reaches `AGENT_FEED.md`.
6. Unreadable feed lines are skipped in silence; Simon never learns that part of the feed was lost.
7. Both CLIs run when imported by any script whose name merely ends in `feed.mjs` / `rollup.mjs`.
8. Step 1's own gate (`gate.mjs`, nine hand-picked mutants) is good but narrow; the estate's gate (witness v0.6,
   every operator) has never run on this repository, and `feed.mjs` / `rollup.mjs` have no tests at all.

The batteries in `data/probe-1b.json` were written by the same hand that will fix the code, after reading it.
They are targeted, not held out; they show which shapes are covered, not how a stranger's wording would fare.

## The claims

Each is measured once by `tools/measure.mjs` (and re-derived by CI byte for byte) unless it says otherwise.
"Step 1" means `src/kernel.mjs` (and `src/rollup.mjs` for R2) exactly as at `4c20fd9`; "now" means the fixed code.

| id | claim | bar |
|---|---|---|
| L1 | the `leaks` battery (36 shapes) against step 1 | recorded only — the before-picture |
| L2 | the `leaks` battery against now | 0 of 36 leak |
| L3 | the `clean` battery (16 lines that hold no secret) against now: every field comes out byte-identical (flags aside) | 16 of 16 unchanged; step 1 recorded |
| L4 | step 1's 1000-line redaction fuzz (`test/checks.mjs`, unchanged) against now | 0 leaks |
| F1 | the `claims` battery (20 lines saying work is finished, no receipt, no link) against now | 20 of 20 flagged; step 1 recorded |
| F2 | the `plain` battery (10 lines that do not say work is finished, two of them negated) against now | 0 of 10 flagged; step 1 recorded |
| F3 | the `proof` battery: a 64-hex receipt, an `https` link or a repository path is proof; "see above", "trust me", a malformed hash or a blank link is not | 7 of 7 as stated; step 1 recorded |
| R1 | the `forge` lines rolled up by now: every output line is the title, a blank, `## NEEDS SIMON` (exactly once), a persona heading, or an item (`- [`); items = lines needing Simon + all lines; the battery's secret appears nowhere | all hold; step 1 recorded |
| R2 | the `corrupt` feed (2 unreadable lines among 2 good) rolled up by now | NEEDS SIMON carries a blocker naming 2; step 1 recorded |
| E1 | `src/kernel.mjs`, `src/feed.mjs`, `src/rollup.mjs` import nothing but `node:fs`, `node:path`, `node:os`, `node:url` and each other; no network, no child processes | a test in CI |
| G0 | witness v0.6 on step 1's `src/kernel.mjs` with step 1's tests, on GitHub's runner | recorded only |
| G1 | witness v0.6 (the pinned tag), cap 800, on GitHub's runner, on `src/kernel.mjs`, `src/feed.mjs`, `src/rollup.mjs` and `src/mintcase.mjs` | clean on every file; any baselined survivor carries its written reason in `witness.baseline.json` and is shown on the page |
| G2 | `gate.mjs` (step 1's curated gate) | kills every mutation it lists; its list may grow, never shrink |
| C1 | the cost case is liveware's gated kernel and sourced basis, vendored byte for byte: `src/mintcase.mjs` sha256 `890be73fd6ece622ccb424e0c191c22738198a01bc177ebe5b362b9ddcb69eef`, `test/mintcase.test.mjs` `347b15b84f84f7870b34137b2f77cc292f70047e43f326995ccbbbe428f87c63`, `vendor/ai-first-company/vendor/sovereign-enterprise/data/basis.json` `83e9c2effa2f81596dcfa7110f030940032c1910cdf928d27d628ae59d73bb42` (liveware `ee580e4`) | CI checks the three hashes |
| T1 | `receipts/trace.json`: one real line through the real `append()` and the real rollup, fixed clock | CI re-derives it byte for byte |
| P1 | `tools/page-check.mjs` on `index.html`: no number typed into the page's prose (every count is read from `receipts/` or computed by a kernel in the page), none of our prices, no tier / per-seat / crypto / earnings wording, the Konomi credit present, and the sections what-it-is, start-here, how-it-works, blueprint, adoption, white paper and the brochure present | passes in CI |
| W1 | four buyer walks of the served page (CFO, CTO/CISO, COO, procurement), kept in `data/persona-walks.json` | every gap fixed on the page, or listed as needing Simon with the exact decision |

Nothing here claims held-out recall, a stranger's wording, signed lines (this kit's lines are not signed; the signed
team feed is `ai-first-company`'s `src/feed.mjs`), or that the kit verifies a receipt (it checks the shape; the
auditor re-runs it).
