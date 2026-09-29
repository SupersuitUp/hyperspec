// The writing profile (profile: writing). Ten blocks live under writing:; nine of them are
// checked by this file (materials, dna, persona, audience, goal, form, spine, sources,
// characters). "progress" is the tenth word in the design and is not a block at all: it is
// forbidden, because stored progress goes stale the moment a session dies mid-arc, and this file
// is the one place that refusal is enforced.
//
// This module carries the GENERIC rules, the ones true of every block regardless which one it is:
// present or openly deferred, carrying a check and a source and an author. Each block's own field
// rules (a golden's why, a claim's material refs, a character's golden and rejected lines, ...)
// live in writing-fields.mjs and are dispatched from the loop below, under the same ids and the
// same nine tests; they do not change the shape here.

import { resolve } from "node:path";
import { BLOCK_FIELD_RULES, characterFields } from "./writing-fields.mjs";
import { str } from "./placeholder.mjs";

const f = (test, id, severity, message, fix) => ({ test, id, severity, message, fix });
const list = (v) => (Array.isArray(v) ? v : []);
const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);

// The closed vocabulary every segment of a material is labeled from. Defined once, in the leaf
// module src/labels.mjs (see there for why it is not defined here), and re-exported so existing
// imports from this file keep working.
export { MATERIAL_LABELS } from "./labels.mjs";

// The nine writing blocks, in schema order. "characters" is the one block that is not always
// required: it is required only when fiction: true, everywhere else in this file and in
// blockStatus below.
export const BLOCKS = Object.freeze(["materials", "dna", "persona", "audience", "goal", "form", "spine", "sources", "characters"]);

const required = (block, fiction) => block !== "characters" || fiction;

// Whether a block's raw value under writing: counts as present at all, before any of its own
// fields are checked. materials is present when it has at least one item; characters is present
// when the list has at least one entry; every other block is present when it is an object with at
// least one field. This is deliberately shallow: it is the bar for "something was written here",
// not the bar for "this block is correct", which is what checkOwner and the field rules in
// writing-fields.mjs are for.
export function blockPresent(block, raw) {
  if (block === "characters") return Array.isArray(raw) && raw.length > 0;
  if (block === "materials") return isObj(raw) && Array.isArray(raw.items) && raw.items.length > 0;
  return isObj(raw) && Object.keys(raw).length > 0;
}

// A block is deferred when a decision with id "writing-<block>" exists in state open, or in
// state delegated WITH a rule. Open defers it to a question only a human can answer, so the spec
// is blocked on that decision the same way any open decision blocks a spec (score.mjs already
// does this; no separate mechanism is needed here); it exempts the block on state alone, since
// whether it also carries a well-formed question is the ordinary decision rule's job (test 1),
// not this one's. Delegated defers it to a standing rule the agent follows instead of writing the
// block out, and "delegated (with a rule)" is a precondition on the exemption, not just a
// description of delegated's normal shape: a delegated decision with no rule has deferred to
// nothing, so it does not stand in for the block, and writing-<block>-missing still fires
// alongside the decision's own delegated-rule finding (test 1). Either way, when a deferral does
// apply, the block's absence from writing: is not itself a finding.
function deferredBy(decisions, block) {
  const d = decisions.find((x) => str(x?.id) === `writing-${block}`);
  if (!d) return null;
  const st = str(d.state);
  if (st === "open") return st;
  if (st === "delegated" && str(d.rule)) return st;
  return null;
}

// check: (station: or rubric:), source: and author: on one owner object (a block, or one
// character entry). idPrefix becomes the finding id's prefix (kept unique per owner so
// blockStatus below can attribute a failure to the right block); label is the human-readable name
// used in every message.
function checkOwner(idPrefix, label, owner) {
  const out = [];
  const check = isObj(owner?.check) ? owner.check : {};
  if (!str(check.station) && !str(check.rubric)) {
    out.push(f(3, `${idPrefix}-check`, "fail", `${label} names no check`, "Add check: with station: <a deterministic check> or rubric: <what a grader applies>."));
  }
  if (!str(owner?.source)) {
    out.push(f(4, `${idPrefix}-source`, "fail", `${label} does not say where it came from`, `Add source: to ${label}.`));
  }
  if (!str(owner?.author)) {
    out.push(f(4, `${idPrefix}-author`, "fail", `${label} does not say who wrote it`, `Add author: to ${label}.`));
  }
  return out;
}

export function lintWriting(spec) {
  const d = spec.data || {};
  const out = [];
  const decisions = list(d.decisions);
  const writing = isObj(d.writing) ? d.writing : {};
  // Paths inside writing: resolve the same way examples: does elsewhere in this linter: relative
  // to the spec file, never to process.cwd().
  const here = (p) => resolve(spec.dir || ".", p);
  // The frontmatter reader (parseSkillFile) treats every scalar as a string, so "fiction: true"
  // is read back as the string "true", never the boolean; comparing through str() is the same
  // discipline every closed-set field in this file and in rules.mjs already follows.
  const fiction = str(d.fiction) === "true";

  // fiction is a closed set: absent means false; present, it must be exactly true or false. A
  // typo here would otherwise drop the whole characters block from a story without a word.
  if (d.fiction !== undefined) {
    const raw = typeof d.fiction === "string" ? d.fiction.trim() : "";
    if (str(d.fiction) !== "true" && str(d.fiction) !== "false") {
      out.push(f(1, "writing-fiction", "fail", `fiction is "${raw || "(none)"}", not true or false`, "Set fiction: true or fiction: false, or remove it (absent means false)."));
    }
  }

  // Progress is never stored, under any key spelled writing.progress: test 7, stale state.
  if ("progress" in writing) {
    out.push(f(7, "writing-progress", "fail", "writing.progress is stored state; progress is derived from disk, never saved", "Remove writing.progress; derive progress by reading the drafted work itself, not by saving a record of it."));
  }

  for (const block of BLOCKS) {
    const raw = writing[block];
    if (!blockPresent(block, raw)) {
      // Missing is only ever a finding for a REQUIRED block; an unrequired, unwritten block (only
      // characters, only with fiction: false) is simply absent, nothing to check and nothing to
      // defer. A required block's absence fails test 1, unless deferred.
      if (!required(block, fiction)) continue;
      if (deferredBy(decisions, block)) continue;
      out.push(f(1, `writing-${block}-missing`, "fail", `writing.${block} is missing`, `Add writing.${block}, or defer it with a decision id "writing-${block}" in state open (a question) or delegated (a rule).`));
      continue;
    }
    // Present, so its content is checked whether or not the block was required: an author who
    // wrote a characters: list with fiction: false still owes it a real check/source/author on
    // every entry, the same as any other present block. Ownership (check/source/author) is
    // generic, from this file; a block's own field rules (the schema inside it) live in
    // writing-fields.mjs and are applied right alongside it, under the same id prefix, so a
    // block's completeness (blockStatus below) reflects both without either file needing to know
    // about the other's findings.
    if (block === "characters") {
      // A character id names one person: persona.identity: character:<id> and every later check
      // resolve through it, so a repeated id is reported once per id, like a repeated material.
      const seen = new Set();
      const reported = new Set();
      raw.forEach((c) => {
        const id = str(c?.id);
        if (!id) return;
        if (seen.has(id) && !reported.has(id)) {
          out.push(f(1, "writing-characters-id", "fail", `character id "${id}" is used twice`, "Ids must be unique across writing.characters; rename one."));
          reported.add(id);
        }
        seen.add(id);
      });
      raw.forEach((c, i) => {
        const cid = str(c?.id) || `#${i + 1}`;
        const idPrefix = `writing-characters-${i}`;
        out.push(...checkOwner(idPrefix, `character "${cid}"`, c));
        out.push(...characterFields(c, here, idPrefix));
      });
    } else {
      out.push(...checkOwner(`writing-${block}`, `writing.${block}`, raw));
      const fieldRule = BLOCK_FIELD_RULES[block];
      if (fieldRule) out.push(...fieldRule(raw, d, here, `writing-${block}`));
    }
  }

  return out;
}

// Derives the "writing: k/9 blocks complete" count from the same data and findings lintWriting
// just produced, so the two can never disagree. A block counts complete when it has no
// fail-severity finding attributed to it AND (it is present, or it is simply not required, only
// characters with fiction: false). A block that is present but unrequired is still held to the
// same bar as any other present block: writing it with broken content does not count as complete
// just because nothing required it to be written at all.
export function blockStatus(data, findings) {
  const d = data || {};
  const writing = isObj(d.writing) ? d.writing : {};
  const fiction = str(d.fiction) === "true";
  const failedIds = new Set((Array.isArray(findings) ? findings : []).filter((x) => x.severity === "fail").map((x) => x.id));
  let complete = 0;
  for (const block of BLOCKS) {
    const present = blockPresent(block, writing[block]);
    if (!present) {
      if (!required(block, fiction)) complete += 1;
      continue;
    }
    const broken = [...failedIds].some((id) => typeof id === "string" && id.startsWith(`writing-${block}-`));
    if (!broken) complete += 1;
  }
  return { complete, total: BLOCKS.length };
}
