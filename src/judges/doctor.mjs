// The doctor: a judge grades the draft against every goal condition and says whether this reader
// would take the next step now. hyperspec never calls the judge; it writes what the judge needs
// (packet), checks what the judge wrote (validate), and derives the station's status from it
// (derive). See src/judge.mjs for the framework and the evidence rule.

import { str } from "../placeholder.mjs";

export const name = "doctor";

export const DOCTOR_INSTRUCTIONS = [
  "Grade the draft (inputs.draft) against each condition in inputs.conditions: a condition passes unless the draft does what its fails_when describes.",
  "For every judgment, quote the draft as evidence: each evidence field is a span copied verbatim from inputs.draft.",
  "Then answer whether this reader, having read the draft, would take the next step (inputs.goal.next_if_worked) now, and quote the passage that decided it.",
  "Answer only in the verdict shape given in verdict_schema: one entry per condition id, each exactly once, with pass and would_take_next_step as true or false, and a note saying why for every condition that fails.",
].join(" ");

const list = (v) => (Array.isArray(v) ? v : []);
const text = (v) => (typeof v === "string" ? v : "");
const isObject = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);

// The goal's condition ids, in the order the spec lists them, each once. Lint (test 2) already
// requires 5 to 10 distinct ids that exist under requirements.
function conditionIds(goal) {
  return [...new Set(list(goal?.conditions).map(str).filter(Boolean))];
}

// null when the doctor applies to this spec, otherwise the reason it does not: it needs a written
// goal block (a deferred one has nothing to grade against) whose check names a rubric.
export function skipReason(spec) {
  const goal = spec.data?.writing?.goal;
  if (!isObject(goal)) return "writing.goal is not written (deferred)";
  if (!str(goal.check?.rubric)) return "writing.goal.check has no rubric";
  return null;
}

// What goes in the packet beyond the framework's own fields: the rubric (goal.check.rubric,
// verbatim), the inputs and the verdict schema. No answer key: the doctor has nothing hidden.
export function packet(spec, draft) {
  const goal = spec.data.writing.goal;
  const change = isObject(goal.change) ? goal.change : {};
  const requirements = new Map(list(spec.data.requirements).filter(isObject).map((r) => [str(r.id), r]));
  const ids = conditionIds(goal);
  return {
    rubric: goal.check.rubric,
    inputs: {
      goal: {
        from: text(goal.from),
        to: text(goal.to),
        next_if_worked: text(goal.next_if_worked),
        change: { kind: text(change.kind), text: text(change.text) },
      },
      conditions: ids.map((id) => ({ id, text: text(requirements.get(id)?.text), fails_when: text(requirements.get(id)?.fails_when) })),
      draft: draft.text,
    },
    verdict_schema: {
      type: "object",
      required: ["conditions", "would_take_next_step", "evidence"],
      properties: {
        conditions: {
          type: "array",
          description: "one entry per condition id, each exactly once",
          items: {
            type: "object",
            required: ["id", "pass", "evidence", "note"],
            properties: {
              id: { enum: ids },
              pass: { type: "boolean" },
              evidence: { type: "string", description: "a span copied verbatim from the draft" },
              note: { type: "string", description: "why; required when pass is false" },
            },
          },
        },
        would_take_next_step: { type: "boolean", description: "whether this reader would take inputs.goal.next_if_worked now" },
        evidence: { type: "string", description: "a span copied verbatim from the draft that decided would_take_next_step" },
      },
    },
    key: null,
  };
}

// Every problem with the verdict, as findings (see src/judge.mjs for the helpers in t). An empty
// list means the verdict is valid.
export function validate(verdict, pkt, t) {
  if (!isObject(verdict)) return [t.shape("the verdict is not a JSON object", "Write one object: { conditions, would_take_next_step, evidence }.")];
  const out = [];
  const expected = pkt.inputs.conditions.map((c) => c.id);
  if (!Array.isArray(verdict.conditions)) {
    out.push(t.shape("conditions is missing or not a list", "Give conditions: one { id, pass, evidence, note } per condition id."));
  } else {
    const seen = new Map();
    verdict.conditions.forEach((c, i) => {
      const at = `conditions[${i}]`;
      if (!isObject(c)) { out.push(t.shape(`${at} is not an object`, "Each condition is { id, pass, evidence, note }.")); return; }
      if (typeof c.id !== "string") out.push(t.shape(`${at}.id is not a string`, "Give the condition's id, as the packet lists it."));
      else seen.set(c.id, (seen.get(c.id) ?? 0) + 1);
      if (typeof c.pass !== "boolean") out.push(t.shape(`${at}.pass is not true or false`, "Set pass to the JSON boolean true or false."));
      if (typeof c.note !== "string") out.push(t.shape(`${at}.note is not a string`, "Give a note, a string; it may be empty when the condition passes."));
      else if (c.pass === false && !c.note.trim()) out.push(t.shape(`${at}.note is empty on a failing condition`, "Say why the condition fails."));
      out.push(...t.evidence(c.evidence, `${at}.evidence`));
    });
    for (const id of expected) if (!seen.has(id)) out.push(t.finding("judge-doctor-condition-missing", `condition ${id} has no entry in conditions`, "Grade every condition the packet lists, each exactly once."));
    for (const [id, n] of seen) {
      if (!expected.includes(id)) out.push(t.finding("judge-doctor-condition-unknown", `conditions names ${id}, which is not a condition in the packet`, `Grade only the packet's conditions: ${expected.join(", ")}.`));
      else if (n > 1) out.push(t.finding("judge-doctor-condition-duplicate", `condition ${id} appears ${n} times in conditions`, "Grade each condition exactly once."));
    }
  }
  if (typeof verdict.would_take_next_step !== "boolean") out.push(t.shape("would_take_next_step is missing or not true or false", "Set would_take_next_step to the JSON boolean true or false."));
  out.push(...t.evidence(verdict.evidence, "evidence"));
  return out;
}

// The station's status and findings from a valid verdict: passes when every condition passes and
// the reader would take the next step now.
export function derive(verdict, pkt, t) {
  const findings = [];
  const byId = new Map(verdict.conditions.map((c) => [c.id, c]));
  for (const { id } of pkt.inputs.conditions) {
    const c = byId.get(id);
    if (c.pass) continue;
    findings.push(t.finding("judge-doctor-condition", `condition ${id} fails: ${c.note.trim()}`, `Revise the draft until ${id} holds, then prepare and judge it again.`, t.lineOf(c.evidence)));
  }
  if (!verdict.would_take_next_step) {
    findings.push(t.finding("judge-doctor-next-step", `the reader would not take the next step now (${pkt.inputs.goal.next_if_worked})`, "Revise the draft so the passage the judge quoted moves the reader to the next step.", t.lineOf(verdict.evidence)));
  }
  return { status: findings.length ? "fail" : "pass", findings };
}
