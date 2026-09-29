// Station "form" (hyperspec 0.6, build 6a task 1). The first of hyperspec check's deterministic
// stations: it checks a draft's word count against writing.form.length, and checks that every
// writing.form.required_parts entry actually shows up in the draft. Pure and deterministic, like
// every station: (spec, draft) in, a result out, no filesystem access beyond what the caller
// already read, no model call.
//
// Length: writing.form.length.unit is only measured when it is exactly "words" (lint already
// requires the key to be present; a spec naming an unmeasured unit, e.g. "characters" or
// "minutes", is not wrong, this build just cannot grade it yet). When the unit is not "words"
// the whole station skips, findings included, rather than silently passing or half-checking: a
// length this build cannot read is not evidence the length is fine, and running required_parts
// alone while staying silent about length would read as a check that covered more than it did.
//
// Required parts: a required part is judged present two ways, either one is enough, because
// required_parts sometimes names a heading-shaped thing ("claim", "evidence", "close") and
// sometimes names a field a form fills in inline rather than under its own heading (a memo's
// "To:", an email's "Subject:"). Neither the schema nor the draft says which kind a given part
// is, so both checks always run for every part, regardless of the form's name:
//   - an ATX heading (1 to 6 "#" characters, no leading whitespace, then exactly one space)
//     whose text, trimmed and case-folded, equals the part name; or
//   - a line whose text, trimmed and case-folded, starts with the part name immediately
//     followed by ":".
// This is a literal, narrow reading on purpose: it will miss a heading spelled "## The Claim"
// against a required part "claim", or one styled "**Claim**". Widening the match is a later
// station's decision once real drafts show what this narrow reading actually misses.

import { wordsOf } from "../dna.mjs";

export const name = "form";

const ATX_HEADING = /^(#{1,6}) (.*)$/;

// A finding id's slug half: lowercase, non [a-z0-9] runs collapsed to one "-", no leading or
// trailing "-". Falls back to `fallback` when nothing alphanumeric survives (e.g. a required
// part that is pure punctuation), so an id is never left with a trailing "station-form-required-part-".
function slug(text, fallback) {
  const s = String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s || fallback;
}

// Whether `part` shows up in the draft, either as a matching ATX heading or as a line starting
// "<part>:" (both compared trimmed and case-folded).
function partPresent(lines, part) {
  const needle = part.trim().toLowerCase();
  for (const line of lines) {
    const heading = ATX_HEADING.exec(line);
    if (heading && heading[2].trim().toLowerCase() === needle) return true;
    if (line.trim().toLowerCase().startsWith(`${needle}:`)) return true;
  }
  return false;
}

// run(spec, draft): spec is a loadSpec()-shaped object (spec.data.writing.form is what this
// station reads); draft is { path, text, lines, sha256 } as src/check.mjs builds it. ctx (a
// third argument every station receives) is unused here; task 1 has only this one station, so
// there is nothing yet for stations to share through it.
export function run(spec, draft) {
  const form = spec?.data?.writing?.form ?? {};
  const length = form.length && typeof form.length === "object" ? form.length : {};
  // Trimmed and case-folded for the comparison: lint only requires length.unit to be non-
  // placeholder text (writing-fields.mjs's formFields), not literally the lowercase word
  // "words", so a spec author who writes "Words" or "WORDS" still gets the word count checked
  // rather than a silent skip. The reason message on a genuine skip still shows the unit as
  // written, never lowercased, since that is what the spec actually says.
  const rawUnit = typeof length.unit === "string" ? length.unit.trim() : "";
  const unit = rawUnit.toLowerCase();

  if (unit !== "words") {
    return { station: name, status: "skip", findings: [], reason: `length unit ${rawUnit || "(none)"} is not measured yet` };
  }

  const findings = [];
  const min = Number(length.min);
  const max = Number(length.max);
  const count = wordsOf(draft.text).length;
  if (!(count >= min && count <= max)) {
    findings.push({
      station: name,
      id: "station-form-length",
      severity: "fail",
      message: `word count ${count} is outside writing.form.length (${min} to ${max} words)`,
      fix: `Trim or expand the draft to ${min}-${max} words; it is currently ${count}.`,
    });
  }

  const parts = Array.isArray(form.required_parts) ? form.required_parts.filter((p) => typeof p === "string" && p.trim()) : [];
  const usedIds = new Set();
  for (const part of parts) {
    if (partPresent(draft.lines, part)) continue;
    let id = `station-form-required-part-${slug(part, "part")}`;
    // Two required parts that slug to the same string (e.g. "Close" and "close!") would
    // otherwise collide on one finding id; the second and later ones get a numeric suffix so
    // every missing part still gets its own finding.
    let n = 2;
    while (usedIds.has(id)) { id = `station-form-required-part-${slug(part, "part")}-${n}`; n += 1; }
    usedIds.add(id);
    findings.push({
      station: name,
      id,
      severity: "fail",
      message: `required part "${part}" does not appear as a heading or a "${part}:" line`,
      fix: `Add a heading ("# ${part}") or a line starting "${part}:" for required part "${part}".`,
    });
  }

  return { station: name, status: findings.length ? "fail" : "pass", findings };
}
