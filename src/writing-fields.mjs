// Field-level rules for the nine writing blocks. src/writing.mjs owns the generic shape (a block
// is present or openly deferred, and every present block carries a check, a source and an
// author); this file owns what's INSIDE each block once it is present — the schema in
// constraints.md, block by block. Every finding here still reports under one of the nine core
// tests, with an id prefixed writing-<block>- (or writing-characters-<index>- for a character
// entry), so writing.mjs's blockStatus (which reads findings by id prefix, not by calling back
// into this file) keeps attributing brokenness correctly with no change on its side.
//
// Scope, stated once rather than re-argued at each block: every field shown in constraints.md's
// schema without an explicit "optional" annotation is required, and its absence fails test 1 ("a
// missing block or missing required field"), unless the test-mapping paragraph names a more
// specific test for that exact violation.
//
// Paths (materials/dna/audience/... path-bearing fields) resolve the same way examples do
// elsewhere in this linter: relative to the spec file. That resolver (here) is supplied by
// writing.mjs, which already has spec.dir in scope; this file never touches spec directly.
//
// Ruling R5 (fix round 1, progress.md): a character's speech.uses, speech.never, wants, fears,
// hides and arc_state are required (test 1) — the design names them as what makes dialogue
// hyperspecified. relationships stays optional: a character may genuinely relate to no one yet,
// and nothing in the schema gives it a closed set or a count to check.

import { statSync } from "node:fs";
import { str } from "./placeholder.mjs";

const f = (test, id, severity, message, fix) => ({ test, id, severity, message, fix });
const list = (v) => (Array.isArray(v) ? v : []);
const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
// "file", "other" (a directory or a device), or null when nothing is there at all — the same
// three-way classification the core examples rule uses (src/rules.mjs's kind()), so a real
// directory is reported as "is not a file" rather than the misleading "does not exist".
const pathKind = (here, p) => { try { return statSync(here(p)).isFile() ? "file" : "other"; } catch { return null; } };
// The two-finding shape every path-bearing field in this file shares: idBase-missing when
// nothing is there, idBase-not-file when something is there but it is not a file (a directory).
// subject is the human-readable name used in the message ("material", "dna.rules", "golden",
// "character ... entity"); fixHint is the same for both branches, since the fix is the same path
// edit either way.
function pathFindings(here, p, idBase, subject, fixHint) {
  const k = pathKind(here, p);
  if (!k) return [f(6, `${idBase}-missing`, "fail", `${subject} "${p}" does not exist`, fixHint)];
  if (k !== "file") return [f(6, `${idBase}-not-file`, "fail", `${subject} "${p}" is not a file`, fixHint)];
  return [];
}

const TRUST_VALUES = ["raw", "considered", "verified"];
const READER_VALUES = ["person", "agent"];
const CHANGE_KINDS = ["belief", "action", "feeling"];
const STANCE_VALUES = ["peer", "mentor", "witness", "guide"];
const IDENTITY_SHAPE = /^(role|character):(.+)$/;

// ---------------------------------------------------------------- 1. materials ----------------

function materialsFields(raw, d, here, idPrefix) {
  const out = [];
  const items = list(raw.items);
  const seen = new Set();
  // A third (or later) item sharing an already-duplicated id must not produce a second,
  // textually identical finding: report each duplicated id once, the first time it repeats.
  const reportedDup = new Set();
  items.forEach((it, i) => {
    const id = str(it?.id);
    const tag = id || `#${i + 1}`;
    if (!id) out.push(f(1, `${idPrefix}-item-${i}-id`, "fail", `materials item ${tag} has no id`, "Give it a short id, e.g. m1."));
    else if (seen.has(id)) {
      if (!reportedDup.has(id)) out.push(f(1, `${idPrefix}-item-id`, "fail", `materials id "${id}" is used twice`, "Ids must be unique across materials.items; rename one."));
      reportedDup.add(id);
    }
    seen.add(id);
    if (!str(it?.produced_by)) out.push(f(1, `${idPrefix}-item-${i}-produced-by`, "fail", `material ${tag} does not say who produced it`, "Add produced_by:."));
    if (!str(it?.captured)) out.push(f(1, `${idPrefix}-item-${i}-captured`, "fail", `material ${tag} does not say when it was captured`, "Add captured:."));
    if (!str(it?.how)) out.push(f(1, `${idPrefix}-item-${i}-how`, "fail", `material ${tag} does not say how it was captured`, "Add how:."));
    const trust = str(it?.trust);
    if (!TRUST_VALUES.includes(trust)) out.push(f(1, `${idPrefix}-item-${i}-trust`, "fail", `material ${tag} has trust "${trust || "(none)"}"`, "Set trust to raw, considered or verified."));
    const p = str(it?.path);
    if (!p) out.push(f(1, `${idPrefix}-item-${i}-path`, "fail", `material ${tag} has no path`, "Add path: to the material."));
    else out.push(...pathFindings(here, p, `${idPrefix}-item-${i}-path`, "material", "Fix the path, or add the material file."));
  });
  return out;
}

// ---------------------------------------------------------------- 2. dna ----------------------

function dnaFields(raw, d, here, idPrefix) {
  const out = [];
  if (!str(raw.writer)) out.push(f(1, `${idPrefix}-writer`, "fail", "writing.dna has no writer", "Add writer:."));
  const scope = isObj(raw.scope) ? raw.scope : {};
  if (!str(scope.form)) out.push(f(1, `${idPrefix}-scope-form`, "fail", "writing.dna.scope has no form", "Add scope.form:."));
  if (!str(scope.audience)) out.push(f(1, `${idPrefix}-scope-audience`, "fail", "writing.dna.scope has no audience", "Add scope.audience:."));
  if (!str(scope.purpose)) out.push(f(1, `${idPrefix}-scope-purpose`, "fail", "writing.dna.scope has no purpose", "Add scope.purpose:."));
  const rulesPath = str(raw.rules);
  if (!rulesPath) out.push(f(1, `${idPrefix}-rules`, "fail", "writing.dna has no rules", "Add rules: the path to the always-on writing style."));
  else out.push(...pathFindings(here, rulesPath, `${idPrefix}-rules`, "dna.rules", "Fix the path, or add the file."));
  const goldens = list(raw.goldens);
  if (!goldens.length) out.push(f(1, `${idPrefix}-goldens`, "fail", "writing.dna has no goldens", "Add at least one golden under dna.goldens."));
  goldens.forEach((g, i) => {
    const p = str(g?.path);
    if (!p) out.push(f(1, `${idPrefix}-golden-${i}-path`, "fail", `dna.goldens[${i + 1}] has no path`, "Add path: to the golden."));
    else out.push(...pathFindings(here, p, `${idPrefix}-golden-${i}`, "golden", "Fix the path, or add the golden file."));
    if (!str(g?.why)) out.push(f(6, `${idPrefix}-golden-${i}-why`, "fail", `golden "${p || `#${i + 1}`}" has no why`, "Add why: what it shows that an adjective could not."));
  });
  return out;
}

// ---------------------------------------------------------------- 3. persona ------------------

function personaFields(raw, d, here, idPrefix) {
  const out = [];
  const identity = str(raw.identity);
  if (!identity) {
    out.push(f(1, `${idPrefix}-identity`, "fail", "writing.persona has no identity", "Add identity: self, role:<name>, or character:<id>."));
  } else if (identity !== "self") {
    const m = IDENTITY_SHAPE.exec(identity);
    if (!m || !m[2].trim()) {
      out.push(f(1, `${idPrefix}-identity`, "fail", `writing.persona.identity "${identity}" is not self, role:<name> or character:<id>`, "Set identity to self, role:<name>, or character:<id>."));
    } else if (m[1] === "character") {
      const cid = m[2].trim();
      const chars = list(d.writing?.characters);
      if (!chars.some((c) => str(c?.id) === cid)) {
        out.push(f(1, `${idPrefix}-identity`, "fail", `writing.persona.identity names character "${cid}", which is not in writing.characters`, "Point identity at a character id that exists in writing.characters."));
      }
    }
  }
  const stance = str(raw.stance);
  if (!stance) out.push(f(1, `${idPrefix}-stance`, "fail", "writing.persona has no stance", "Add stance: peer, mentor, witness or guide."));
  else if (!STANCE_VALUES.includes(stance)) out.push(f(1, `${idPrefix}-stance`, "warn", `writing.persona.stance "${stance}" is outside peer, mentor, witness, guide`, "Consider peer, mentor, witness or guide."));
  if (!list(raw.may_assert).some((x) => str(x))) out.push(f(1, `${idPrefix}-may-assert`, "fail", "writing.persona has no may_assert", "List at least one thing the persona may assert."));
  if (!list(raw.will_not_say).some((x) => str(x))) out.push(f(5, `${idPrefix}-will-not-say`, "fail", "writing.persona.will_not_say is empty", "List at least one thing the persona will not say."));
  const factsFrom = str(raw.facts_from);
  if (factsFrom !== "sources") out.push(f(5, `${idPrefix}-facts-from`, "fail", `writing.persona.facts_from is "${factsFrom || "(none)"}", not "sources"`, "Set facts_from: sources."));
  return out;
}

// ---------------------------------------------------------------- 4. audience -----------------

const AUDIENCE_REQUIRED = ["who", "funnel_now", "believes_now", "wants", "reads_on"];

function audienceFields(raw, d, here, idPrefix) {
  const out = [];
  for (const field of AUDIENCE_REQUIRED) {
    if (!str(raw[field])) out.push(f(1, `${idPrefix}-${field.replace(/_/g, "-")}`, "fail", `writing.audience has no ${field}`, `Add ${field}:.`));
  }
  if (!list(raw.knows).some((x) => str(x))) out.push(f(1, `${idPrefix}-knows`, "fail", "writing.audience has no knows", "List at least one term the reader already has."));
  const reader = str(raw.reader);
  if (!READER_VALUES.includes(reader)) out.push(f(1, `${idPrefix}-reader`, "fail", `writing.audience.reader is "${reader || "(none)"}"`, "Set reader to person or agent."));
  return out;
}

// ---------------------------------------------------------------- 5. goal ---------------------

const GOAL_REQUIRED = ["from", "to", "next_if_worked"];

function goalFields(raw, d, here, idPrefix) {
  const out = [];
  for (const field of GOAL_REQUIRED) {
    if (!str(raw[field])) out.push(f(1, `${idPrefix}-${field.replace(/_/g, "-")}`, "fail", `writing.goal has no ${field}`, `Add ${field}:.`));
  }
  const change = isObj(raw.change) ? raw.change : {};
  const kind = str(change.kind);
  if (!CHANGE_KINDS.includes(kind)) out.push(f(1, `${idPrefix}-change-kind`, "fail", `writing.goal.change.kind is "${kind || "(none)"}"`, "Set change.kind to belief, action or feeling."));
  if (!str(change.text)) out.push(f(1, `${idPrefix}-change-text`, "fail", "writing.goal.change has no text", "Add change.text:."));

  const conditions = list(raw.conditions).map(str).filter(Boolean);
  if (conditions.length < 5 || conditions.length > 10) {
    out.push(f(2, `${idPrefix}-conditions-count`, "fail", `writing.goal.conditions has ${conditions.length} ids, outside 5 to 10`, "List 5 to 10 requirement ids under goal.conditions."));
  }
  const reqIds = new Set(list(d.requirements).map((r) => str(r?.id)).filter(Boolean));
  conditions.forEach((cid) => {
    if (!reqIds.has(cid)) out.push(f(2, `${idPrefix}-conditions-unknown`, "fail", `writing.goal.conditions names "${cid}", which is not a requirement id`, "Point conditions at ids that exist under requirements:."));
  });
  return out;
}

// ---------------------------------------------------------------- 6. form ---------------------

function formFields(raw, d, here, idPrefix) {
  const out = [];
  if (!str(raw.name)) out.push(f(1, `${idPrefix}-name`, "fail", "writing.form has no name", "Add name:."));
  const length = isObj(raw.length) ? raw.length : {};
  const minStr = str(length.min);
  const maxStr = str(length.max);
  // The YAML reader returns every scalar as a string, min: 600 included, so a numeric field is
  // parsed explicitly here rather than compared as a closed-set string; a non-numeric length is a
  // test 1 fail like any other malformed required field.
  const min = Number(minStr);
  const max = Number(maxStr);
  const minOk = minStr !== "" && Number.isFinite(min);
  const maxOk = maxStr !== "" && Number.isFinite(max);
  if (!minOk) out.push(f(1, `${idPrefix}-length-min`, "fail", `writing.form.length.min "${minStr || "(none)"}" is not a number`, "Set length.min to a number."));
  if (!maxOk) out.push(f(1, `${idPrefix}-length-max`, "fail", `writing.form.length.max "${maxStr || "(none)"}" is not a number`, "Set length.max to a number."));
  if (minOk && maxOk && min > max) out.push(f(1, `${idPrefix}-length-range`, "fail", `writing.form.length.min (${min}) is greater than length.max (${max})`, "Set min to no more than max."));
  if (!str(length.unit)) out.push(f(1, `${idPrefix}-length-unit`, "fail", "writing.form.length has no unit", "Add length.unit:, e.g. words."));
  if (!list(raw.required_parts).some((x) => str(x))) out.push(f(1, `${idPrefix}-required-parts`, "fail", "writing.form has no required_parts", "List at least one required part."));
  return out;
}

// ---------------------------------------------------------------- 7. spine --------------------

function spineFields(raw, d, here, idPrefix) {
  const out = [];
  if (!str(raw.kind)) out.push(f(1, `${idPrefix}-kind`, "fail", "writing.spine has no kind", "Add kind:."));
  const claims = list(raw.claims);
  if (claims.length < 3 || claims.length > 7) out.push(f(1, `${idPrefix}-claims-count`, "fail", `writing.spine has ${claims.length} claims, outside 3 to 7`, "List 3 to 7 claims under spine.claims."));
  const materialIds = new Set(list(d.writing?.materials?.items).map((m) => str(m?.id)).filter(Boolean));
  claims.forEach((c, i) => {
    const cid = str(c?.id) || `#${i + 1}`;
    if (!str(c?.id)) out.push(f(1, `${idPrefix}-claim-${i}-id`, "fail", `spine claim ${cid} has no id`, "Give it a short id, e.g. c1."));
    if (!str(c?.text)) out.push(f(1, `${idPrefix}-claim-${i}-text`, "fail", `spine claim "${cid}" has no text`, "Add text: to the claim."));
    const refs = list(c?.materials).map(str).filter(Boolean);
    if (!refs.length) {
      out.push(f(4, `${idPrefix}-claim-${i}-materials`, "fail", `spine claim "${cid}" has no materials`, "Point materials: at one or more material ids."));
    } else {
      refs.forEach((ref) => {
        const mid = ref.split("#")[0];
        if (!materialIds.has(mid)) out.push(f(4, `${idPrefix}-claim-${i}-materials-unknown`, "fail", `spine claim "${cid}" points at material "${ref}", which is not in writing.materials.items`, "Point materials: at an id that exists in writing.materials.items."));
      });
    }
  });
  return out;
}

// ---------------------------------------------------------------- 8. sources ------------------

function sourcesFields(raw, d, here, idPrefix) {
  const out = [];
  if (!str(raw.ledger)) out.push(f(1, `${idPrefix}-ledger`, "fail", "writing.sources has no ledger", "Add ledger: the path each run's claims are checked against."));
  // sources.ledger is a path that need not exist before drafting: no existence check here, unlike
  // every other path in this file.
  const unsourced = str(raw.unsourced_claim);
  if (!["fail", "warn"].includes(unsourced)) {
    out.push(f(1, `${idPrefix}-unsourced-claim`, "fail", `writing.sources.unsourced_claim is "${unsourced || "(none)"}"`, "Set unsourced_claim to fail or warn."));
  } else if (unsourced === "warn") {
    out.push(f(1, `${idPrefix}-unsourced-claim-warn`, "warn", "writing.sources.unsourced_claim is warn; an unsourced claim will only warn, not fail the draft", "Set unsourced_claim: fail if an unsourced claim should block the draft."));
  }
  return out;
}

// ---------------------------------------------------------------- 9. characters ---------------

// One character entry, called per-entry from writing.mjs the same way checkOwner is. idPrefix is
// already writing-characters-<index>, matching the block-attribution prefix blockStatus expects.
function characterFields(c, here, idPrefix) {
  const out = [];
  const tag = str(c?.id) || "?";
  if (!str(c?.id)) out.push(f(1, `${idPrefix}-id`, "fail", "character has no id", "Give it a short id."));

  // Raw array length, matching dnaFields' goldens.length check: a present-but-malformed entry
  // (missing by or knows) must not ALSO trigger "has no knowledge" — that's only true when the
  // list is literally empty.
  const knowledge = list(c?.knowledge);
  if (!knowledge.length) out.push(f(1, `${idPrefix}-knowledge`, "fail", `character "${tag}" has no knowledge`, "Add at least one { by, knows } entry under knowledge."));
  knowledge.forEach((k, i) => {
    if (!str(k?.by)) out.push(f(1, `${idPrefix}-knowledge-${i}-by`, "fail", `character "${tag}" knowledge entry ${i + 1} has no by`, "Add by: to the knowledge entry."));
    if (!str(k?.knows)) out.push(f(1, `${idPrefix}-knowledge-${i}-knows`, "fail", `character "${tag}" knowledge entry ${i + 1} has no knows`, "Add knows: to the knowledge entry."));
  });

  if (!list(c?.golden_lines).some((x) => str(x))) out.push(f(6, `${idPrefix}-golden-lines`, "fail", `character "${tag}" has no golden_lines`, "Add at least one golden line."));
  if (!list(c?.rejected_lines).some((x) => str(x))) out.push(f(6, `${idPrefix}-rejected-lines`, "fail", `character "${tag}" has no rejected_lines`, "Add at least one rejected line."));

  // R5: speech.uses, speech.never, wants, fears, hides and arc_state are what make dialogue
  // hyperspecified, per the design. relationships is deliberately not required here: a character
  // may genuinely relate to no one yet.
  const speech = isObj(c?.speech) ? c.speech : {};
  if (!list(speech.uses).some((x) => str(x))) out.push(f(1, `${idPrefix}-speech-uses`, "fail", `character "${tag}" speech.uses is empty`, "List at least one thing the character says."));
  if (!list(speech.never).some((x) => str(x))) out.push(f(1, `${idPrefix}-speech-never`, "fail", `character "${tag}" speech.never is empty`, "List at least one thing the character never says."));
  if (!str(c?.wants)) out.push(f(1, `${idPrefix}-wants`, "fail", `character "${tag}" has no wants`, "Add wants:."));
  if (!str(c?.fears)) out.push(f(1, `${idPrefix}-fears`, "fail", `character "${tag}" has no fears`, "Add fears:."));
  if (!str(c?.hides)) out.push(f(1, `${idPrefix}-hides`, "fail", `character "${tag}" has no hides`, "Add hides:."));
  if (!str(c?.arc_state)) out.push(f(1, `${idPrefix}-arc-state`, "fail", `character "${tag}" has no arc_state`, "Add arc_state:."));

  const entity = str(c?.entity);
  if (entity) out.push(...pathFindings(here, entity, `${idPrefix}-entity`, `character "${tag}" entity`, "Fix the path, or remove entity."));

  return out;
}

// The eight object blocks' field rules, keyed by block name. characters is a list and is called
// per-entry (characterFields) directly from writing.mjs, not through this map.
export const BLOCK_FIELD_RULES = Object.freeze({
  materials: materialsFields,
  dna: dnaFields,
  persona: personaFields,
  audience: audienceFields,
  goal: goalFields,
  form: formFields,
  spine: spineFields,
  sources: sourcesFields,
});

export { characterFields };
