// tools/verdicts.mjs — the verdict half of tools/claims.mjs (CLAIMS-1c G3): pure and total, no file, no process, no
// clock. Every function takes what was already read and returns a verdict; tools/claims.mjs does the reading and the
// writing. Witness gates this file on GitHub's runner with test/claims.test.mjs.

export const BUYERS = Object.freeze(['CFO', 'CTO / CISO', 'COO', 'Procurement']);
// the settings every witness run in this repository is pinned to (CLAIMS-1b G1, CLAIMS-1c G3)
export const WITNESS_TAG = 'v0.6';
export const WITNESS_CAP = 800;
export const KERNEL_TIMEOUT = 30000;
// the three files CLAIMS-1c G3 names, in its order
export const SEALED_KERNELS = Object.freeze(['page/facts.mjs', 'tools/verdicts.mjs', 'tools/page-rules.mjs']);

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v : []);
const text = (v) => (typeof v === 'string' ? v.trim() : '');
const num = (v) => (Number.isFinite(v) ? v : 0);

/** the seal's table: one { id, claim, bar } per row, in the seal's order, backticks dropped */
export function sealTable(seal) {
  const rows = [];
  for (const line of String(seal ?? '').split(/\r?\n/)) {
    const m = line.match(/^\|\s*([A-Z]\d+)\s*\|(.*)\|\s*$/);
    if (!m) continue;
    const cells = m[2].split(/\s\|\s/).map((c) => c.replace(/`/g, '').trim());
    if (cells.length < 2) continue;
    rows.push({ id: m[1], claim: cells.slice(0, -1).join(' | '), bar: cells[cells.length - 1] });
  }
  return rows;
}

/** C1: every `path` … `hash` pair the seal's C1 row names */
export function hashPairs(row) {
  return [...String(row ?? '').matchAll(/`([\w./-]+\.(?:mjs|json))`(?:\s+sha256)?\s+`([0-9a-f]{64})`/g)].map((m) => ({ path: m[1], sha256: m[2] }));
}

// one witness result per entry: null when the entry or its result is missing or not an object
const results = (entries) => list(entries).map((o) => (isObj(o) && isObj(o.witness) ? o.witness : null));
// clean: it ran, and nothing survived, nothing was capped; every baselined survivor has a written reason
function allClean(ws) {
  const ran = ws.length > 0 && ws.every((x) => x !== null);
  const reasoned = ws.every((x) => !x || list(x.ignored).every((i) => isObj(i) && text(i.reason).length > 0));
  const clean = ran && ws.every((x) => x.clean === true && x.capped === false && list(x.survivors).length === 0);
  return { ran, reasoned, clean };
}
const tally = (ws) => ({
  killed: ws.reduce((n, x) => n + (x ? num(x.killed) : 0), 0),
  total: ws.reduce((n, x) => n + (x ? num(x.total) : 0), 0),
  baselined: ws.reduce((n, x) => n + (x ? list(x.ignored).length : 0), 0),
});

/** G1: witness clean on every organ, at the pinned tag and cap, nothing capped, every baselined survivor with a reason */
export function g1Verdict(witness) {
  const w = isObj(witness) ? witness : {};
  const organs = list(w.organs);
  const ws = results(organs);
  const { ran, reasoned, clean } = allClean(ws);
  const pinned = isObj(w.witness) && w.witness.tag === WITNESS_TAG && w.witness.cap === WITNESS_CAP;
  const t = tally(ws);
  return {
    held: ran && pinned && clean && reasoned,
    evidence: { organs: organs.length, killed: t.killed, total: t.total, baselined: t.baselined, tag: isObj(w.witness) ? w.witness.tag : undefined },
  };
}

/** G3: witness clean on exactly the three files the seal names, in its order, at the pinned tag, cap and timeout */
export function g3Verdict(witness) {
  const w = isObj(witness) ? witness : {};
  const kernels = list(w.kernels);
  const files = kernels.map((k) => (isObj(k) ? k.file : undefined));
  const named = files.length === SEALED_KERNELS.length && SEALED_KERNELS.every((f, i) => files[i] === f);
  const ws = results(kernels);
  const { ran, reasoned, clean } = allClean(ws);
  const run = isObj(w.kernelRun) ? w.kernelRun : {};
  const pinned = run.tag === WITNESS_TAG && run.cap === WITNESS_CAP && run.timeout === KERNEL_TIMEOUT;
  const t = tally(ws);
  return {
    held: named && ran && pinned && clean && reasoned,
    evidence: { files: kernels.length, killed: t.killed, total: t.total, baselined: t.baselined, tag: run.tag },
  };
}

/** G4: the before-picture — recorded only, so the verdict is null; the evidence is what witness found */
export function g4Record(witness) {
  const w = isObj(witness) ? witness : {};
  const ws = results(w.g4);
  const t = tally(ws);
  return {
    held: null,
    evidence: { files: list(w.g4).length, killed: t.killed, total: t.total, survived: ws.reduce((n, x) => n + (x ? num(x.survived) : 0), 0) },
  };
}

/** the mutant ids a gate.mjs lists */
export const gateIds = (src) => [...String(src ?? '').matchAll(/\{\s*id:\s*'([^']+)'/g)].map((m) => m[1]);

/** G2: the curated gate is green, kills every mutant it lists, and still lists every mutant step 1's gate listed */
export function g2Verdict(g2, step1Src, nowSrc) {
  const g = isObj(g2) ? g2 : {};
  const before = gateIds(step1Src), now = new Set(gateIds(nowSrc));
  const kept = before.length > 0 && before.every((id) => now.has(id));
  // no separate "listed is above zero" test: kept needs at least one id now, and listed must equal the ids now
  const killedAll = Number.isInteger(g.listed) && g.killed === g.listed && g.listed === now.size;
  return { held: g.green === true && killedAll && kept, evidence: { killed: g.killed, listed: g.listed, step1Listed: before.length, step1Kept: kept } };
}

const answered = (g) => isObj(g) && ((g.status === 'fixed' && text(g.change).length > 0) || (g.status === 'needs Simon' && text(g.decision).length > 0));
const roundOf = (w) => (Number.isInteger(w.round) ? w.round : 1);
const walkCounts = (gaps) => ({
  gaps: gaps.length,
  fixed: gaps.filter((g) => isObj(g) && g.status === 'fixed').length,
  needsSimon: gaps.filter((g) => isObj(g) && g.status === 'needs Simon').length,
  unanswered: gaps.filter((g) => !answered(g)).length,
});

/** W1: the four buyers walked; every gap is fixed (with the change) or needs Simon (with the decision) */
export function w1Verdict(walks) {
  const wk = list(isObj(walks) ? walks.walks : undefined).filter(isObj);
  const gaps = wk.flatMap((w) => list(w.gaps));
  const personas = new Set(wk.map((w) => w.persona));
  const rounds = new Set(wk.map(roundOf));
  return {
    held: BUYERS.every((b) => personas.has(b)) && gaps.length > 0 && gaps.every(answered),
    evidence: { walks: wk.length, rounds: rounds.size, ...walkCounts(gaps) },
  };
}

/** W2: in the given round every buyer walked and said what they checked; every gap of that round is answered */
export function roundVerdict(walks, round) {
  const wk = list(isObj(walks) ? walks.walks : undefined).filter((w) => isObj(w) && roundOf(w) === round);
  const gaps = wk.flatMap((w) => list(w.gaps));
  const personas = new Set(wk.map((w) => w.persona));
  const checked = wk.every((w) => list(w.checked).some((c) => text(c).length > 0));
  return {
    held: Number.isInteger(round) && BUYERS.every((b) => personas.has(b)) && checked && gaps.every(answered),
    evidence: { round, walks: wk.length, ...walkCounts(gaps) },
  };
}

/** V1: every claim the earlier receipt held keeps its verdict now; the ones that changed are named */
export function sameVerdicts(before, now) {
  const was = list(isObj(before) ? before.claims : undefined).filter(isObj);
  const is = new Map(list(now).filter(isObj).map((c) => [c.id, c.held]));
  const changed = was.filter((c) => !is.has(c.id) || is.get(c.id) !== c.held).map((c) => c.id);
  return { held: was.length > 0 && changed.length === 0, evidence: { compared: was.length, changed } };
}

/** one verdict per sealed row; `m` holds the measurers' results by id. A row with no measurer is refused. */
export function verdicts(rows, m) {
  const missing = rows.filter((r) => !(r.id in m)).map((r) => r.id);
  if (missing.length) throw new Error(`no measurer for sealed claim(s): ${missing.join(', ')}`);
  return rows.map((r) => ({ id: r.id, claim: r.claim, bar: r.bar, held: m[r.id].held, where: m[r.id].where, evidence: m[r.id].evidence }));
}

export function summary(claims) {
  return {
    sealed: claims.length,
    held: claims.filter((c) => c.held === true).length,
    failed: claims.filter((c) => c.held === false).length,
    recorded: claims.filter((c) => c.held === null).length,
  };
}
