// `hyperspec init <file> --form <form spec>` (0.11): the skeleton of a work that builds on a form.
//
// It names the form (form: <path>, relative to the new file) and shows only what the form leaves
// for the work: a writing block the form neither writes nor defers appears whole, as the writing
// skeleton has it; a block the form writes appears with only the fields the form leaves unset; a
// block the form writes in full does not appear. The skeleton's open decisions are the writing
// skeleton's own, kept only for a block left whole to the work and never for an id the form
// already uses. The work's own keys (title, kind, resume, feedback, improvement) are always shown,
// since a form's are never inherited, and the core lists (requirements, rejects, examples) are
// shown empty, for the work to add to what the form lists. profile and fiction appear only when
// the form leaves them unset.
//
// Built from the plain or writing skeleton's data rather than its text, and written with specText,
// so what init writes reads back exactly as it was built.
import { parseSkillFile } from "@supersuit/superskill/yaml";
import { template } from "./template.mjs";
import { writingTemplate } from "./writing-template.mjs";
import { specText } from "./spec-text.mjs";
import { str } from "./placeholder.mjs";

const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v : []);
const unset = (v) => v === undefined || (typeof v === "string" && !str(v)) || (Array.isArray(v) && !v.length) || (isObj(v) && !Object.keys(v).length);

// The skeleton's fields the form leaves unset, recursively; {} when the form sets them all.
function leftBy(skeleton, form) {
  const out = {};
  for (const [k, v] of Object.entries(skeleton)) {
    if (unset(form?.[k])) out[k] = v;
    else if (isObj(v) && isObj(form[k])) {
      const rest = leftBy(v, form[k]);
      if (Object.keys(rest).length) out[k] = rest;
    }
  }
  return out;
}

// Whether the form defers a writing block to a decision, as src/writing.mjs reads a deferral.
const deferred = (form, block) => list(form.decisions).some((x) => str(x?.id) === `writing-${block}` && (str(x.state) === "open" || (str(x.state) === "delegated" && str(x.rule))));

// formWorkTemplate({ title, kind, formRef, form }): form is the form's own data, formRef the path
// the skeleton names it by. kind defaults to the form's writing.form.name.
export function formWorkTemplate({ title = "Untitled", kind, formRef, form }) {
  const writing = str(form.profile) === "writing";
  const theKind = kind ?? (str(form.writing?.form?.name) || "document");
  const base = parseSkillFile(writing
    ? writingTemplate({ title, form: theKind, fiction: str(form.fiction) === "true" })
    : template({ title, kind: theKind })).data;

  const usedIds = new Set([...list(form.decisions), ...list(form.requirements)].map((x) => str(x?.id)).filter(Boolean));
  const shown = {};
  if (writing) {
    for (const [block, value] of Object.entries(base.writing)) {
      if (deferred(form, block)) continue;
      const left = isObj(form.writing?.[block]) ? leftBy(value, form.writing[block]) : value;
      if (Object.keys(left).length) shown[block] = left;
    }
  }
  const wholeBlocks = new Set(Object.keys(shown).filter((b) => !isObj(form.writing?.[b])));
  const decisions = list(base.decisions).filter((x) => {
    const id = str(x.id);
    if (usedIds.has(id)) return false;
    return !id.startsWith("writing-") || wholeBlocks.has(id.slice("writing-".length));
  });

  const data = {
    hyperspec: base.hyperspec,
    title: base.title,
    kind: base.kind,
    form: formRef,
    ...(unset(form.profile) && "profile" in base ? { profile: base.profile } : {}),
    decisions,
    requirements: [],
    rejects: [],
    examples: [],
    resume: base.resume,
    feedback: base.feedback,
    improvement: base.improvement,
    ...(Object.keys(shown).length ? { writing: shown } : {}),
    ...(unset(form.fiction) && "fiction" in base ? { fiction: base.fiction } : {}),
  };
  const heading = String(title).replace(/\s+/g, " ").trim();
  return specText(data, `\n# ${heading}\n`);
}
