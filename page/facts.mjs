// page/facts.mjs — every number the page shows, read from the repository's own receipts. The page never types a count
// into its prose: each <span data-r="name"> is filled from facts(receipts)[name], and tools/page-check.mjs fails CI when
// a name the page uses is missing here or the prose carries a digit. Pure and total: a missing or broken receipt gives
// '—' for the facts it would have supplied, never a throw.
//   receipts = { step1b: receipts/step1b.json, witness: receipts/witness.json, trace: receipts/trace.json,
//                walks: data/persona-walks.json }

const pick = (o, path) => { try { return path.split('.').reduce((v, k) => (v == null ? undefined : v[k]), o); } catch { return undefined; } };
const claim = (step1b, id) => { try { return step1b.claims.find((c) => c.id === id) || {}; } catch { return {}; } };
const organ = (witness, file) => { try { return witness.organs.find((o) => o.file === file) || {}; } catch { return {}; } };
const shown = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.length > 0 ? v : '—');

export function facts(receipts) {
  const r = receipts && typeof receipts === 'object' ? receipts : {};
  const s = r.step1b, w = r.witness, t = r.trace;
  const m = (id, path) => pick(claim(s, id).measured, path);
  const ow = (file, k) => pick(organ(w, file).witness, k);
  const out = {
    // the claims, as measured once
    claimsHeld: pick(s, 'summary.held'),
    claimsFailed: pick(s, 'summary.failed'),
    claimsRecorded: pick(s, 'summary.recorded'),
    leakShapes: m('L1', 'step1.items'),
    leaksStep1: m('L1', 'step1.leaked'),
    leaksNow: m('L2', 'now.leaked'),
    cleanLines: m('L3', 'now.items'),
    cleanUnchangedNow: m('L3', 'now.unchanged'),
    cleanUnchangedStep1: m('L3', 'step1.unchanged'),
    fuzzLines: m('L4', 'now.lines'),
    claimLines: m('F1', 'now.items'),
    claimsFlaggedStep1: m('F1', 'step1.flagged'),
    claimsFlaggedNow: m('F1', 'now.flagged'),
    plainLines: m('F2', 'now.items'),
    plainFlaggedNow: m('F2', 'now.flagged'),
    proofCases: m('F3', 'now.items'),
    proofRightStep1: m('F3', 'step1.asStated'),
    proofRightNow: m('F3', 'now.asStated'),
    forgeChecks: m('R1', 'now.checks'),
    forgeFailedStep1: (() => { const f = m('R1', 'step1.failedChecks'); return Array.isArray(f) ? f.length : undefined; })(),
    unreadableLines: m('R2', 'now.unreadable'),
    // the gates
    testsTotal: pick(w, 'tests.total'),
    testsPassed: pick(w, 'tests.passed'),
    testsFailed: pick(w, 'tests.failed'),
    curatedKilled: pick(w, 'g2.killed'),
    curatedListed: pick(w, 'g2.listed'),
    witnessTag: pick(w, 'witness.tag'),
    witnessCap: pick(w, 'witness.cap'),
    kernelKilled: ow('src/kernel.mjs', 'killed'),
    kernelMutants: ow('src/kernel.mjs', 'total'),
    feedKilled: ow('src/feed.mjs', 'killed'),
    feedMutants: ow('src/feed.mjs', 'total'),
    rollupKilled: ow('src/rollup.mjs', 'killed'),
    rollupMutants: ow('src/rollup.mjs', 'total'),
    costKilled: ow('src/mintcase.mjs', 'killed'),
    costMutants: ow('src/mintcase.mjs', 'total'),
    step1Mutants: pick(w, 'g0.witness.total'),
    step1Killed: pick(w, 'g0.witness.killed'),
    step1Survived: pick(w, 'g0.witness.survived'),
    // the traced run
    traceLines: pick(t, 'counts.lines'),
    traceStored: pick(t, 'counts.stored'),
    traceRedacted: pick(t, 'counts.redactedFields'),
    traceFlagged: pick(t, 'counts.flagged'),
    traceForSimon: pick(t, 'counts.needsSimon'),
    traceDate: pick(t, 'date'),
    traceBots: (() => { const s = pick(t, 'steps'); return Array.isArray(s) && s.length ? new Set(s.map((x) => pick(x, 'input.agent'))).size : undefined; })(),
  };
  // the buyer walks (W1)
  const wk = Array.isArray(pick(r.walks, 'walks')) ? r.walks.walks : null;
  const gaps = wk ? wk.flatMap((x) => (Array.isArray(x && x.gaps) ? x.gaps : [])) : null;
  const status = (st) => (gaps ? gaps.filter((g) => g && g.status === st).length : undefined);
  out.walks = wk ? wk.length : undefined;
  out.walkGaps = gaps ? gaps.length : undefined;
  out.walkFixed = status('fixed');
  out.walkNeedsSimon = status('needs Simon');
  const organs = ['src/kernel.mjs', 'src/feed.mjs', 'src/rollup.mjs', 'src/mintcase.mjs'];
  const all = organs.reduce((n, f) => n + (Number(ow(f, 'total')) || 0), 0);
  out.organMutants = all > 0 ? all : undefined;
  out.organKilled = all > 0 ? organs.reduce((n, f) => n + (Number(ow(f, 'killed')) || 0), 0) : undefined;
  out.allClean = pick(w, 'allClean') === true ? 'clean' : pick(w, 'allClean') === false ? 'not clean' : undefined;
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, shown(v)]));
}

export default { facts };
