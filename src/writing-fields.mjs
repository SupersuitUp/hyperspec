// Field-level rules for the nine writing blocks. src/writing.mjs owns the generic shape (a block
// is present or openly deferred, and every present block carries a check, a source and an
// author); this file owns what is INSIDE each block once it is present, block by block, as
// WRITING.md's schema documents it. Every finding here still reports under one of the nine core
// tests, with an id prefixed writing-<block>- (or writing-characters-<index>- for a character
// entry), so writing.mjs's blockStatus (which reads findings by id prefix, not by calling back
// into this file) keeps attributing brokenness correctly with no change on its side.
//
// Scope, stated once rather than re-argued at each block: every schema field not marked optional
// is required, and its absence fails test 1 (a missing required field), unless a more specific
// test owns that exact violation (a golden's why is test 6, goal.conditions is test 2, and so on).
//
// Paths (materials/dna/audience/... path-bearing fields) resolve the same way examples do
// elsewhere in this linter: relative to the spec file. That resolver (here) is supplied by
// writing.mjs, which already has spec.dir in scope; this file never touches spec directly.
//
// A character's speech.uses, speech.never, wants, fears, hides and arc_state are required
// (test 1), because dialogue cannot be specified without them. relationships stays optional: a
// character may genuinely relate to no one yet, and nothing gives it a closed set or a count.

import { readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, join, sep } from "node:path";
import { str } from "./placeholder.mjs";
import { readSegments } from "./segments.mjs";
import { readScope, isGoldenFileName, measureFeatures, featuresText, DNA_FORMAT } from "./dna.mjs";

const f = (test, id, severity, message, fix) => ({ test, id, severity, message, fix });
const list = (v) => (Array.isArray(v) ? v : []);
const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
// "file", "other" (a directory or a device), or null when nothing is there at all. This is the same
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

    // Marking is required from 0.4 on. A material item with no segments: field is not
    // marked at all (the design puts marking before specifying), so it fails on its own, distinct
    // from the segments file existing but being broken (readSegments' own findings below). The
    // material's text-dependent checks (verbatim, coverage, overlap, staleness) only run when the
    // path itself already resolved to a real file, so a broken path is never reported twice: once
    // here for the path field and again for the material readSegments could not read.
    const segPath = str(it?.segments);
    if (!segPath) {
      out.push(f(1, "writing-materials-unmarked", "fail",
        `material ${tag} is not marked (no segments field)`,
        "Run `hyperspec segments init <material> --id <id>`, then add segments: to the material item."));
    } else {
      const { findings: segFindings } = readSegments(here(segPath), { materialPath: materialFilePath(it, here), materialId: id || undefined, ...shownPaths(it, segPath) });
      out.push(...segFindings);
    }
  });
  return out;
}

// The material file readSegments checks segment text against, or undefined when the item's own
// path is missing or is not a file. That broken path is already reported by pathFindings (test 6);
// passing it on would make readSegments report the same root cause a second time, under test 1.
// materialsFields and resolveMaterialSegments both resolve through here, so they cannot disagree.
function materialFilePath(item, here) {
  const p = str(item?.path);
  return p && pathKind(here, p) === "file" ? here(p) : undefined;
}

// The paths readSegments' messages print: exactly as the spec wrote them, the way every other path
// finding in the linter reads, never resolved against the spec's folder. A finding pasted into a
// public issue then names no one's home folder, and --json is the same on every machine.
function shownPaths(item, segPath) {
  return { displayPath: segPath, materialDisplayPath: str(item?.path) || undefined };
}

// Resolves ONE material item's segments (for spine ref resolution below). Never pushes
// readSegments' own findings: those are already reported once, by materialsFields, under the
// materials block; this is read-only lookup. When nothing resolves, `why` says which of the three
// causes it was, because each needs a different fix: "unmarked" (no segments: field), "unreadable"
// (the segments file does not exist or cannot be read) or "empty" (read, but no segment lines).
function resolveMaterialSegments(item, here) {
  const segPath = str(item?.segments);
  if (!segPath) return { segments: [], loaded: false, why: "unmarked" };
  const { segments, findings } = readSegments(here(segPath), { materialPath: materialFilePath(item, here), materialId: str(item?.id) || undefined, ...shownPaths(item, segPath) });
  if (segments.length > 0) return { segments, loaded: true };
  const unreadable = findings.some((x) => x.id === "writing-materials-segments-missing");
  return { segments, loaded: false, why: unreadable ? "unreadable" : "empty" };
}

const UNRESOLVABLE_BECAUSE = {
  unmarked: "it is not marked (no segments field)",
  unreadable: "its segments file could not be read",
  empty: "its segments file has no segments",
};

// ---------------------------------------------------------------- 2. dna ----------------------

// writing.dna.scope_dir (0.5, optional): the path (relative to the spec, like every other path in
// this file) to a scoped-DNA folder built by `hyperspec dna init`/`dna measure` (src/dna.mjs).
// The KEY being absent means none of the checks below run: 0.4 behavior, unchanged. A key that IS
// present but placeholder-ish (TODO, tbd, an empty string) fails on its own (test 1,
// writing-dna-scope-dir, naming the value) before any of this runs, since a real value is what
// every check below needs. Present with a real value, four things must all hold:
// - scope.md's writer/form/audience/purpose agree with dna.writer/dna.scope (test 1);
// - every dna.goldens[].path is one of the goldens readScope actually reads: resolved through
//   any symlink, a golden-named file directly in the scope's REAL goldens/ folder (test 5,
//   writing-dna-golden-leak, naming the golden and the scope). Anything else feeds the spec a
//   passage that is never checked or measured under this scope. A goldens/ folder that itself
//   resolves outside the scope is readScope's own finding (writing-dna-goldens-outside), which
//   stands in for the per-golden findings it would otherwise cause;
// - every golden IN the scope passes its own field checks, exactly readScope's findings, reused
//   rather than re-derived, with displayDir set to the scope_dir string the spec wrote (never a
//   resolved filesystem path, so a finding here never names this machine's folders);
// - <scope_dir>/features.json is current: byte for byte what `dna measure` would write now
//   (test 6), with the stale finding naming what differs.
function isInsideDir(parentAbs, childAbs) {
  return childAbs === parentAbs || childAbs.startsWith(parentAbs + sep);
}

const realOrNull = (p) => { try { return realpathSync(p); } catch { return null; } };

// Why a listed golden is not one of the scope's goldens, as the words of the leak finding, or
// null when it is one. lexicalGoldens is <scope_dir>/goldens as written; realGoldens is where
// that folder really is.
function leakReason(lexicalGoldens, realGoldens, goldenAbs) {
  const real = realOrNull(goldenAbs);
  if (real && realGoldens && dirname(real) === realGoldens && isGoldenFileName(basename(real))) return null;
  if (!isInsideDir(lexicalGoldens, goldenAbs)) return "outside";
  if (!real || !realGoldens || !isInsideDir(realGoldens, real)) return "symlink";
  return "not-a-golden";
}

function leakFinding(idPrefix, reason, p, i, scopeDirRaw) {
  const where = `${scopeDirRaw}/goldens/`;
  if (reason === "outside") {
    return f(5, `${idPrefix}-golden-leak`, "fail",
      `golden "${p}" feeds only work that shares its scope; it does not live under ${where}`,
      `Move ${p} into ${where}, or point dna.goldens[${i + 1}].path at a golden already there.`);
  }
  if (reason === "symlink") {
    return f(5, `${idPrefix}-golden-leak`, "fail",
      `golden "${p}" is a symlink that resolves outside ${where} (or sits in a folder that does), so it feeds this scope a passage from somewhere else`,
      `Replace the link at ${p} with the passage itself, as a file in ${where} with why, approved_by and source.`);
  }
  return f(5, `${idPrefix}-golden-leak`, "fail",
    `golden "${p}" is not one of the scope's goldens: only .md files directly in ${where}, other than README.md, are read, checked and measured`,
    `Put the passage in its own .md file directly in ${where}, with why, approved_by and source, and point dna.goldens[${i + 1}].path at it.`);
}

// One field of the spec's own dna claim against the same field read off scope.md. Silent when
// either side is empty: an empty spec-side value already fails its own presence check above (e.g.
// writing-dna-writer), and an empty disk-side value already fails as one of readScope's own
// findings (e.g. writing-dna-scope-file-writer); comparing two things when one is already known-broken
// would just be a second name for the same defect, not a second defect.
function scopeMismatch(out, idPrefix, scopeDirRaw, label, idSuffix, specVal, diskVal) {
  const a = str(specVal);
  const b = str(diskVal);
  if (!a || !b || a.trim().toLowerCase() === b.trim().toLowerCase()) return;
  out.push(f(1, `${idPrefix}-scope-mismatch-${idSuffix}`, "fail",
    `writing.dna.scope_dir "${scopeDirRaw}": ${label} "${a}" does not match ${scopeDirRaw}/scope.md's ${label} "${b}"`,
    `Make writing.dna's ${label} and ${scopeDirRaw}/scope.md's ${label} agree; one of them is wrong.`));
}

// Whether <scope>/features.json is what `dna measure` would write now. Returns "missing" (absent
// or not JSON), null (current), or the words naming what differs: goldens added, removed or
// changed by hash; scope fields that differ from scope.md; a dna format this linter does not
// know; features that differ from a fresh measurement (only named when the goldens themselves
// are unchanged, since changed goldens explain every number); and, when nothing more specific
// differs, bytes dna measure would not have written.
function featuresStaleness(featuresPath, diskScope, diskGoldens) {
  let text;
  let recorded;
  try {
    text = readFileSync(featuresPath, "utf8");
    recorded = JSON.parse(text);
  } catch {
    return "missing";
  }
  if (!recorded || typeof recorded !== "object" || Array.isArray(recorded)) return "missing";
  const parts = [];
  const recordedGoldens = new Map(list(recorded.goldens).map((g) => [str(g?.path), str(g?.sha256)]));
  const current = new Map(diskGoldens.map((g) => [g.path, g.sha256]));
  const added = [...current.keys()].filter((p) => !recordedGoldens.has(p)).sort();
  const removed = [...recordedGoldens.keys()].filter((p) => !current.has(p)).sort();
  const changed = [...current.keys()].filter((p) => recordedGoldens.has(p) && recordedGoldens.get(p) !== current.get(p)).sort();
  if (added.length) parts.push(`added ${added.join(", ")}`);
  if (removed.length) parts.push(`removed ${removed.join(", ")}`);
  if (changed.length) parts.push(`changed ${changed.join(", ")}`);
  if (recorded.dna !== DNA_FORMAT) parts.push(`dna version ${JSON.stringify(recorded.dna ?? null)} is not the "${DNA_FORMAT}" this linter knows`);
  if (!diskScope) return parts.length ? parts.join("; ") : null;

  const recordedScope = isObj(recorded.scope) ? recorded.scope : {};
  const scopeFields = ["writer", "form", "audience", "purpose"].filter((k) => recordedScope[k] !== diskScope[k]);
  if (scopeFields.length) parts.push(`scope changed: ${scopeFields.join(", ")}`);
  const features = measureFeatures(diskGoldens.map((g) => g.text));
  if (!added.length && !removed.length && !changed.length) {
    const recordedFeatures = isObj(recorded.features) ? recorded.features : {};
    const keys = [...new Set([...Object.keys(features), ...Object.keys(recordedFeatures)])];
    const differ = keys.filter((k) => JSON.stringify(features[k]) !== JSON.stringify(recordedFeatures[k]));
    if (differ.length) parts.push(`features differ from a fresh measurement: ${differ.join(", ")}`);
  }
  if (!parts.length && text !== featuresText({ scope: diskScope, goldens: diskGoldens, features }).text) {
    parts.push("the file is not byte for byte what `hyperspec dna measure` writes");
  }
  return parts.length ? parts.join("; ") : null;
}

function dnaFields(raw, d, here, idPrefix) {
  const out = [];
  if (!str(raw.writer)) out.push(f(1, `${idPrefix}-writer`, "fail", "writing.dna has no writer", "Add writer:."));
  const scope = isObj(raw.scope) ? raw.scope : {};
  // scope-<field> is the spec's own writing.dna.scope, the id 0.4.0 shipped; scope-file-<field>
  // (src/dna.mjs) is a scope folder's scope.md.
  if (!str(scope.form)) out.push(f(1, `${idPrefix}-scope-form`, "fail", "writing.dna.scope has no form", "Add scope.form:."));
  if (!str(scope.audience)) out.push(f(1, `${idPrefix}-scope-audience`, "fail", "writing.dna.scope has no audience", "Add scope.audience:."));
  if (!str(scope.purpose)) out.push(f(1, `${idPrefix}-scope-purpose`, "fail", "writing.dna.scope has no purpose", "Add scope.purpose:."));
  const rulesPath = str(raw.rules);
  if (!rulesPath) out.push(f(1, `${idPrefix}-rules`, "fail", "writing.dna has no rules", "Add rules: the path to the always-on writing style."));
  else out.push(...pathFindings(here, rulesPath, `${idPrefix}-rules`, "dna.rules", "Fix the path, or add the file."));

  // scope_dir is optional, so its KEY being absent from writing.dna is never a finding (the
  // whole scope_dir section below simply does not run). But a key that IS present with a
  // placeholder-ish value (TODO, tbd, an empty string, ...) is a different situation: the operator
  // wrote something and str() silently reads it as "not there", which would otherwise make a
  // half-filled skeleton lint clean by accident. That gets its own finding, naming the value, and
  // is why this check reads raw.scope_dir directly rather than through scopeDirRaw.
  if (raw.scope_dir !== undefined && !str(raw.scope_dir)) {
    out.push(f(1, `${idPrefix}-scope-dir`, "fail",
      `writing.dna.scope_dir "${raw.scope_dir}" looks like a placeholder`,
      "Point scope_dir: at a real scope folder (built with hyperspec dna init), or remove the field entirely; it is optional."));
  }
  const scopeDirRaw = str(raw.scope_dir);
  const scopeDirAbs = scopeDirRaw ? here(scopeDirRaw) : null;
  const disk = scopeDirRaw ? readScope(scopeDirAbs, { displayDir: scopeDirRaw }) : null;
  const diskIds = new Set((disk?.findings ?? []).map((x) => x.id));
  const goldensOutside = diskIds.has("writing-dna-goldens-outside");
  const lexicalGoldens = scopeDirRaw ? here(join(scopeDirRaw, "goldens")) : null;
  const realScope = scopeDirRaw ? realOrNull(scopeDirAbs) : null;
  const realGoldens = realScope ? join(realScope, "goldens") : null;

  const goldens = list(raw.goldens);
  if (!goldens.length) out.push(f(1, `${idPrefix}-goldens`, "fail", "writing.dna has no goldens", "Add at least one golden under dna.goldens."));
  goldens.forEach((g, i) => {
    const p = str(g?.path);
    if (!p) out.push(f(1, `${idPrefix}-golden-${i}-path`, "fail", `dna.goldens[${i + 1}] has no path`, "Add path: to the golden."));
    else out.push(...pathFindings(here, p, `${idPrefix}-golden-${i}`, "golden", "Fix the path, or add the golden file."));
    if (!str(g?.why)) out.push(f(6, `${idPrefix}-golden-${i}-why`, "fail", `golden "${p || `#${i + 1}`}" has no why`, "Add why: what it shows that an adjective could not."));
    // Checked only once the path resolves to a real file: a missing or non-file path is already
    // reported above under test 6, and is not also a leak.
    if (scopeDirRaw && p && pathKind(here, p) === "file") {
      const reason = leakReason(lexicalGoldens, realGoldens, here(p));
      // A goldens/ folder that resolves outside the scope already has its own finding, which
      // names the cause for every golden listed through it.
      const coveredByFolder = goldensOutside && isInsideDir(lexicalGoldens, here(p));
      if (reason && !coveredByFolder) out.push(leakFinding(idPrefix, reason, p, i, scopeDirRaw));
    }
  });

  if (scopeDirRaw) {
    const { scope: diskScope, goldens: diskGoldens, findings: diskFindings } = disk;
    out.push(...diskFindings);

    if (diskScope) {
      scopeMismatch(out, idPrefix, scopeDirRaw, "writer", "writer", raw.writer, diskScope.writer);
      scopeMismatch(out, idPrefix, scopeDirRaw, "form", "form", scope.form, diskScope.form);
      scopeMismatch(out, idPrefix, scopeDirRaw, "audience", "audience", scope.audience, diskScope.audience);
      scopeMismatch(out, idPrefix, scopeDirRaw, "purpose", "purpose", scope.purpose, diskScope.purpose);
    }

    // With the goldens folder unreadable or somewhere else, there is nothing to compare
    // features.json against; that folder's own finding says what to fix first.
    if (!goldensOutside && !diskIds.has("writing-dna-goldens-missing")) {
      const stale = featuresStaleness(join(scopeDirAbs, "features.json"), diskScope, diskGoldens);
      if (stale === "missing") {
        out.push(f(6, `${idPrefix}-features-missing`, "fail",
          `writing.dna.scope_dir "${scopeDirRaw}" has no features.json (or it is not valid JSON)`,
          `Run \`hyperspec dna measure ${scopeDirRaw}\`.`));
      } else if (stale) {
        out.push(f(6, `${idPrefix}-features-stale`, "fail",
          `writing.dna.scope_dir "${scopeDirRaw}"'s features.json is stale: ${stale}`,
          `Run \`hyperspec dna measure ${scopeDirRaw}\` again.`));
      }
    }
  }

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

  const listed = list(raw.conditions).map(str).filter(Boolean);
  // Distinct ids only: five copies of one requirement are one condition, not five.
  const conditions = [...new Set(listed)];
  const repeated = [...new Set(listed.filter((cid, i) => listed.indexOf(cid) !== i))];
  repeated.forEach((cid) => {
    out.push(f(2, `${idPrefix}-conditions-duplicate`, "fail", `writing.goal.conditions lists "${cid}" more than once`, "List each requirement id once."));
  });
  if (conditions.length < 5 || conditions.length > 10) {
    out.push(f(2, `${idPrefix}-conditions-count`, "fail", `writing.goal.conditions has ${conditions.length} distinct ids, outside 5 to 10`, "List 5 to 10 distinct requirement ids under goal.conditions."));
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
  // Both bounds are whole numbers of at least 1: a length of zero, a negative length or half a
  // word describes no piece anyone could write.
  const positiveInt = (s) => /^\d+$/.test(s) && Number(s) >= 1;
  const min = Number(minStr);
  const max = Number(maxStr);
  const minOk = positiveInt(minStr);
  const maxOk = positiveInt(maxStr);
  if (!minOk) out.push(f(1, `${idPrefix}-length-min`, "fail", `writing.form.length.min "${minStr || "(none)"}" is not a whole number of at least 1`, "Set length.min to a whole number, 1 or more."));
  if (!maxOk) out.push(f(1, `${idPrefix}-length-max`, "fail", `writing.form.length.max "${maxStr || "(none)"}" is not a whole number of at least 1`, "Set length.max to a whole number, 1 or more."));
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
  // A repeated claim id is reported once per id and counts once toward 3 to 7: three copies of
  // one claim are one claim. A claim with no id still counts (its own finding says what is wrong).
  const seenClaims = new Set();
  const reportedClaims = new Set();
  let distinct = 0;
  claims.forEach((c) => {
    const id = str(c?.id);
    if (id && seenClaims.has(id)) {
      if (!reportedClaims.has(id)) out.push(f(1, `${idPrefix}-claim-id`, "fail", `spine claim id "${id}" is used twice`, "Ids must be unique across spine.claims; rename one, or merge the claims."));
      reportedClaims.add(id);
      return;
    }
    if (id) seenClaims.add(id);
    distinct += 1;
  });
  if (distinct < 3 || distinct > 7) out.push(f(1, `${idPrefix}-claims-count`, "fail", `writing.spine has ${distinct} distinct claims, outside 3 to 7`, "List 3 to 7 claims, each with its own id, under spine.claims."));
  const items = list(d.writing?.materials?.items);
  const itemsById = new Map(items.map((m) => [str(m?.id), m]).filter(([id]) => id));
  const materialIds = new Set(itemsById.keys());
  // A material whose segments cannot be resolved at all (no segments: field, a segments file that
  // cannot be read, or one with no segment lines) makes every #segment ref against it equally
  // unresolvable. Report that once per material, not once per ref: two claims both pointing at
  // "m1#s1" and "m1#s2" when m1 is unmarked are the same underlying problem, not two.
  const segmentsCache = new Map();
  const segmentsFor = (mid) => {
    if (!segmentsCache.has(mid)) segmentsCache.set(mid, resolveMaterialSegments(itemsById.get(mid), here));
    return segmentsCache.get(mid);
  };
  const reportedUnresolvable = new Set();
  claims.forEach((c, i) => {
    const cid = str(c?.id) || `#${i + 1}`;
    if (!str(c?.id)) out.push(f(1, `${idPrefix}-claim-${i}-id`, "fail", `spine claim ${cid} has no id`, "Give it a short id, e.g. c1."));
    if (!str(c?.text)) out.push(f(1, `${idPrefix}-claim-${i}-text`, "fail", `spine claim "${cid}" has no text`, "Add text: to the claim."));
    const refs = list(c?.materials).map(str).filter(Boolean);
    if (!refs.length) {
      out.push(f(4, `${idPrefix}-claim-${i}-materials`, "fail", `spine claim "${cid}" has no materials`, "Point materials: at one or more material ids."));
    } else {
      refs.forEach((ref) => {
        const hashIdx = ref.indexOf("#");
        const mid = hashIdx === -1 ? ref : ref.slice(0, hashIdx);
        const segId = hashIdx === -1 ? "" : ref.slice(hashIdx + 1);
        if (!materialIds.has(mid)) {
          out.push(f(4, `${idPrefix}-claim-${i}-materials-unknown`, "fail", `spine claim "${cid}" points at material "${ref}", which is not in writing.materials.items`, "Point materials: at an id that exists in writing.materials.items."));
          return;
        }
        // A bare material id (no "#") stays valid on its own; only a ref naming a specific segment
        // needs resolving against that material's segments file. "m1#" names an empty segment id,
        // which is not a bare ref, so it goes on to fail as an unknown segment.
        if (hashIdx === -1) return;
        const { segments, loaded, why } = segmentsFor(mid);
        if (!loaded) {
          if (!reportedUnresolvable.has(mid)) {
            out.push(f(4, `${idPrefix}-materials-segments-unresolvable-${mid}`, "fail",
              `spine claims point at material "${mid}"'s segments, but ${UNRESOLVABLE_BECAUSE[why]}`,
              "Run `hyperspec segments init` on the material, label every segment, then re-check the spine refs."));
            reportedUnresolvable.add(mid);
          }
          return;
        }
        const seg = segId ? segments.find((s) => str(s?.id) === segId) : undefined;
        if (!seg) {
          out.push(f(4, `${idPrefix}-claim-${i}-materials-segment-unknown`, "fail",
            `spine claim "${cid}" points at material "${ref}", which is not a segment in "${mid}"'s segments file`,
            "Point materials: at a segment id that exists in the material's segments file, or drop the #segment suffix to reference the whole material."));
          return;
        }
        const label = typeof seg.label === "string" ? seg.label : "";
        if (label === "private") {
          out.push(f(5, `${idPrefix}-claim-${i}-materials-segment-private`, "fail",
            `spine claim "${cid}" points at material "${ref}", which is labeled private (private is never used)`,
            "Point materials: at a different segment, or drop this ref."));
        } else if (label === "question") {
          out.push(f(5, `${idPrefix}-claim-${i}-materials-segment-question`, "fail",
            `spine claim "${cid}" points at material "${ref}", which is labeled question (a question is never an assertion)`,
            "Point materials: at a different segment, or drop this ref."));
        }
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
  // (missing by or knows) must not ALSO trigger "has no knowledge"; that is only true when the
  // list is literally empty.
  const knowledge = list(c?.knowledge);
  if (!knowledge.length) out.push(f(1, `${idPrefix}-knowledge`, "fail", `character "${tag}" has no knowledge`, "Add at least one { by, knows } entry under knowledge."));
  knowledge.forEach((k, i) => {
    if (!str(k?.by)) out.push(f(1, `${idPrefix}-knowledge-${i}-by`, "fail", `character "${tag}" knowledge entry ${i + 1} has no by`, "Add by: to the knowledge entry."));
    if (!str(k?.knows)) out.push(f(1, `${idPrefix}-knowledge-${i}-knows`, "fail", `character "${tag}" knowledge entry ${i + 1} has no knows`, "Add knows: to the knowledge entry."));
  });

  if (!list(c?.golden_lines).some((x) => str(x))) out.push(f(6, `${idPrefix}-golden-lines`, "fail", `character "${tag}" has no golden_lines`, "Add at least one golden line."));
  if (!list(c?.rejected_lines).some((x) => str(x))) out.push(f(6, `${idPrefix}-rejected-lines`, "fail", `character "${tag}" has no rejected_lines`, "Add at least one rejected line."));
  // A line cannot be both how the character speaks and how they never would: the consistency
  // check has nothing to grade against. Compared trimmed and case-folded.
  const fold = (x) => str(x).toLowerCase();
  const golden = new Set(list(c?.golden_lines).map(fold).filter(Boolean));
  const clash = list(c?.rejected_lines).map(fold).filter((x) => x && golden.has(x));
  if (clash.length) out.push(f(6, `${idPrefix}-line-conflict`, "fail", `character "${tag}" has "${clash[0]}" as both a golden and a rejected line`, "Remove the line from one of golden_lines or rejected_lines."));

  // speech.uses, speech.never, wants, fears, hides and arc_state are what make dialogue
  // specifiable. relationships is deliberately not required here: a character may genuinely
  // relate to no one yet.
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
