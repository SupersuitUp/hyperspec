// Form specs (hyperspec 0.11). A form is the set of decisions true of every work of one kind: a
// book's front matter and the sections every chapter carries, a persona, how claims are sourced.
// Written as prose those decisions are advice an agent can skip, so a form is a hyperspec of its
// own (kind: form), and a work builds on it with one top-level key, form: <path>, relative to the
// work's spec. src/load.mjs merges the two, so every command (lint, check, judge, ready, learn)
// reads the merged spec and no station needs to know forms exist.
//
// This module is the merge itself, pure: data in, data and findings out. Reading the form file,
// and the findings for a form that cannot be used at all, live in load.mjs beside the reader. The
// contract, whole:
//
//   lists in ACCUMULATE   the form's entries first, then the work's. A work entry that is exactly
//                         a form entry collapses into it; one that reuses an id the form uses is
//                         refused (form-id-collision), since a work cannot redefine a form's
//                         decision or requirement. Decisions and requirements share one id space,
//                         as lint's own rule has it.
//   maps                  merge key by key, recursively.
//   anything else         (a scalar, or a list outside ACCUMULATE, which is one value) is the
//                         form's. The work fills what the form leaves unset; the work setting it
//                         to a different value is form-contradiction, naming the field and both
//                         values, and the form's value stands. The form is binding: a work that
//                         needs a different rule changes the form, and every work under it, on
//                         purpose, or does not use the form.
//   OWN_KEYS              are about the file rather than the kind of work (its format version,
//                         title and kind, its next action, where to push back, its own ledger), so
//                         each file keeps its own and the form's are never inherited.
//
// A path a form writes is the form's file, resolved against the form's folder like every path in
// any spec, so before the merge each one is rewritten relative to the work's folder (rebase).
// A form that names a file every work should hold for itself (a claims ledger, a work's own parts)
// would point every work at the same one; those are left for the work to set.

import { isAbsolute, relative, resolve, sep } from "node:path";
import { canonical } from "./hash.mjs";
import { str } from "./placeholder.mjs";

export const FORM_KIND = "form";

// The lists that accumulate, by dotted path from the top of the frontmatter.
export const ACCUMULATE = Object.freeze([
  "decisions",
  "requirements",
  "rejects",
  "examples",
  "writing.persona.may_assert",
  "writing.persona.will_not_say",
  "writing.form.sequence.sections",
  "writing.form.sequence.knows",
  "writing.form.sequence.front_matter",
  "writing.form.stations",
]);

// Keys every file keeps for itself. form is among them: a form names no form (load.mjs refuses one
// that does), so nothing under it is ever merged.
export const OWN_KEYS = Object.freeze(["hyperspec", "title", "kind", "form", "resume", "feedback", "improvement"]);

// The writing blocks only a work can fill: what it is made from, who reads it, what it changes,
// what it argues. A form is not required to hold them (src/writing.mjs).
export const WORK_ONLY_BLOCKS = Object.freeze(["materials", "spine", "goal", "audience"]);

export const isForm = (data) => str(data?.kind) === FORM_KIND;

const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v : []);
// Unset: absent, a blank or placeholder string, or an empty list or map. The work fills it.
const unset = (v) => v === undefined || (typeof v === "string" && !str(v)) || (Array.isArray(v) && !v.length) || (isObj(v) && !Object.keys(v).length);
const show = (v) => (typeof v === "string" ? `"${v}"` : JSON.stringify(v));
const f = (test, id, severity, message, fix) => ({ test, id, severity, message, fix });

// Every path a writing spec holds, as [the list or map it sits in, the key that holds it]. A null
// key means the list's entries are themselves paths.
const PATH_FIELDS = Object.freeze([
  ["examples", "path"],
  ["writing.materials.items", "path"],
  ["writing.materials.items", "segments"],
  ["writing.dna.goldens", "path"],
  ["writing.characters", "entity"],
  ["writing.form.sequence.files", null],
  ["writing.dna", "scope_dir"],
  ["writing.dna", "rules"],
  ["writing.form.sequence", "outline"],
  ["writing.sources", "ledger"],
]);

const at = (data, dotted) => dotted.split(".").reduce((v, k) => (isObj(v) ? v[k] : undefined), data);

// The form's data with every relative path it writes rewritten to resolve the same from the work's
// folder: "../style-rules.md" in forms/ becomes "style-rules.md" for a work one folder up. A URL, an
// absolute path and a blank value are left as they are. Returns a copy; the form's data is
// untouched.
export function rebase(data, formDir, workDir) {
  const out = JSON.parse(JSON.stringify(data ?? {}));
  const move = (p) => {
    if (typeof p !== "string" || !str(p) || /^https?:\/\//i.test(p) || isAbsolute(p)) return p;
    return relative(resolve(workDir), resolve(formDir, p)).split(sep).join("/");
  };
  for (const [owner, key] of PATH_FIELDS) {
    const holder = at(out, owner);
    if (key === null) {
      if (Array.isArray(holder)) holder.forEach((p, i) => { holder[i] = move(p); });
    } else if (Array.isArray(holder)) {
      holder.forEach((item) => { if (isObj(item) && key in item) item[key] = move(item[key]); });
    } else if (isObj(holder) && key in holder) holder[key] = move(holder[key]);
  }
  return out;
}

// mergeForm(form, work, { formPath }): form is the form's data (already rebased), work the work's
// own; formPath is the form as the work names it, for messages. { data, findings }: the merged
// data and every form-contradiction and form-id-collision, under test 1, since each is a decision
// made two ways.
export function mergeForm(form, work, { formPath }) {
  const findings = [];
  const named = `the form (${formPath})`;
  // One id space across decisions and requirements, as rules.mjs holds it.
  const formIds = new Set([...list(form?.decisions), ...list(form?.requirements)].map((x) => (isObj(x) ? str(x.id) : "")).filter(Boolean));
  const noun = { decisions: "decision", requirements: "requirement" };

  const accumulate = (formList, workList, path) => {
    const out = [...formList];
    const seen = new Set(formList.map((x) => canonical(x)));
    const ids = noun[path] ? formIds : new Set(formList.map((x) => (isObj(x) ? str(x.id) : "")).filter(Boolean));
    for (const item of workList) {
      if (seen.has(canonical(item))) continue;
      const id = isObj(item) ? str(item.id) : "";
      if (id && ids.has(id)) {
        findings.push(f(1, "form-id-collision", "fail",
          `${noun[path] ?? `${path} entry`} "${id}" reuses an id ${named} uses, with different content`,
          `Delete it here to take the form's entry, or give it an id of its own; a work cannot redefine a form's ${noun[path] ?? "entry"}.`));
        continue;
      }
      out.push(item);
    }
    return out;
  };

  const merge = (fv, wv, path) => {
    if (unset(fv)) return wv !== undefined ? wv : fv;
    if (unset(wv)) return fv;
    if (ACCUMULATE.includes(path) && Array.isArray(fv) && Array.isArray(wv)) return accumulate(fv, wv, path);
    if (isObj(fv) && isObj(wv)) return mergeMaps(fv, wv, path);
    if (canonical(fv) !== canonical(wv)) {
      findings.push(f(1, "form-contradiction", "fail",
        `${path} is ${show(fv)} in ${named} and ${show(wv)} here`,
        `Delete ${path} here to take the form's value. The form is binding: a work that needs a different value changes the form, and every work under it, on purpose, or does not use the form.`));
    }
    return fv;
  };

  const mergeMaps = (fm, wm, prefix, own = []) => {
    const out = {};
    for (const k of new Set([...Object.keys(fm), ...Object.keys(wm)])) {
      const path = prefix ? `${prefix}.${k}` : k;
      if (own.includes(k)) { if (k in wm) out[k] = wm[k]; continue; }
      const v = merge(fm[k], wm[k], path);
      if (v !== undefined) out[k] = v;
    }
    return out;
  };

  return { data: mergeMaps(isObj(form) ? form : {}, isObj(work) ? work : {}, "", OWN_KEYS), findings };
}
