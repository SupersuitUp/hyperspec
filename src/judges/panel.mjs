// The panel (hyperspec 0.9): the draft read by several readers at once, each through their own
// lens, the way a draft is pressure-tested by hand before it ships. Every other judgment station
// asks one question with a right answer; the panel asks each reader what works, what to improve,
// what is missing and what to remove, and every answer is a finding somebody has to answer.
//
// One packet per reader (panel-<id>.packet.json): the readers writing.panel declares, or with none
// declared the default three (a skeptic, a newcomer and an expert), and always the spec's own
// audience reader, added last as "buyer", because a panel that never includes the person the piece
// is for tests everything except whether it works. Every item a reader lists carries evidence
// copied from the draft (src/evidence.mjs's rule; a missing item anchors to the passage nearest
// where it belongs), so a review can never be of a stale or truncated copy.
//
// The panel never fails a draft: its findings are warnings, and each improve, missing and remove
// item goes to the triage file (src/triage.mjs), where the operator answers it and `check` holds
// every answer to the draft. What works is counted, never triaged: there is nothing to answer.

import { str } from "../placeholder.mjs";

export const name = "panel";

export const PANEL_INSTRUCTIONS = [
  "Read inputs.draft as inputs.reader: the person inputs.reader.who describes, knowing only what inputs.reader.knows lists and what anyone would, reading for inputs.reader.lens.",
  "List what works for this reader under good, what should change under improve, what this reader needs that the draft does not give under missing, and what should go under remove.",
  "Every item is { evidence, note }. evidence is a passage copied verbatim from inputs.draft, at least three whole words; for a missing item, quote the passage nearest to where the missing thing belongs. note says what and why, in a sentence, in this reader's terms.",
  "A list may be empty. Report what this reader would say, not what another reader would.",
  "Answer only in the verdict shape given in verdict_schema.",
].join(" ");

// The default panel, used when writing.panel is not declared. The buyer is added to it, as to any.
export const DEFAULT_PANEL = Object.freeze([
  Object.freeze({ id: "skeptic", who: "a skeptic who doubts the piece's central claim and wants it earned", knows: Object.freeze([]), lens: "what is asserted without support, overstated, or does not follow" }),
  Object.freeze({ id: "novice", who: "a newcomer to the subject, meeting its ideas for the first time", knows: Object.freeze([]), lens: "every term, step or assumption the piece does not explain" }),
  Object.freeze({ id: "expert", who: "an expert in the piece's subject", knows: Object.freeze([]), lens: "what is wrong, out of date, oversimplified or missing for someone who knows the field" }),
]);

export const KINDS = Object.freeze(["good", "improve", "missing", "remove"]);

const isObject = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const texts = (v) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
const nonEmpty = (v) => typeof v === "string" && v.trim().length > 0;

// null when the panel applies: its buyer is the audience's reader, so it needs a written audience
// block whose check names a rubric, the reader station's own condition.
export function skipReason(spec) {
  const audience = spec.data?.writing?.audience;
  if (!isObject(audience)) return "writing.audience is not written (deferred); the panel's buyer is the audience's reader";
  if (!str(audience.check?.rubric)) return "writing.audience.check has no rubric";
  return null;
}

// Every reader on this spec's panel, in order: the declared readers (or the default three), then
// the buyer. Each is { id, who, knows, lens }.
export function variants(spec) {
  const declared = spec.data?.writing?.panel;
  const readers = Array.isArray(declared) && declared.length
    ? declared.filter(isObject).map((r) => ({ id: str(r.id), who: str(r.who), knows: texts(r.knows), lens: str(r.lens) })).filter((r) => r.id && r.id !== "buyer")
    : DEFAULT_PANEL.map((r) => ({ id: r.id, who: r.who, knows: [...r.knows], lens: r.lens }));
  const a = spec.data.writing.audience;
  const buyer = { id: "buyer", who: str(a.who), knows: texts(a.knows), lens: `what they want from this piece: ${str(a.wants)}` };
  return [...readers, buyer];
}

// Which reader a packet is for, as it says; record rebuilds the packet for that reader and
// compares every byte, so a changed name is caught with the rest.
export const variantOf = (packet) => packet?.inputs?.reader?.id;

const itemSchema = {
  type: "object",
  required: ["evidence", "note"],
  properties: {
    evidence: { type: "string", description: "a passage copied verbatim from the draft, at least three words; for a missing item, the passage nearest where it belongs" },
    note: { type: "string", description: "what and why, in a sentence" },
  },
};

// The packet's rubric (audience.check.rubric, verbatim: the buyer's test is the piece's), inputs
// (the reader and the draft) and verdict schema. No answer key.
export function packet(spec, draft, reader) {
  return {
    rubric: spec.data.writing.audience.check.rubric,
    inputs: {
      reader: { id: reader.id, who: reader.who, knows: reader.knows, lens: reader.lens },
      draft: draft.text,
    },
    verdict_schema: {
      type: "object",
      required: [...KINDS],
      properties: {
        good: { type: "array", description: "what works for this reader; empty when nothing does", items: itemSchema },
        improve: { type: "array", description: "what should change", items: itemSchema },
        missing: { type: "array", description: "what this reader needs that the draft does not give", items: itemSchema },
        remove: { type: "array", description: "what should go", items: itemSchema },
      },
    },
    key: null,
  };
}

// Every problem with the verdict, as findings; every evidence span must be in the draft.
export function validate(verdict, pkt, t) {
  if (!isObject(verdict)) return [t.shape("the verdict is not a JSON object", "Write one object: { good, improve, missing, remove }.")];
  const out = [];
  for (const kind of KINDS) {
    if (!Array.isArray(verdict[kind])) { out.push(t.shape(`${kind} is missing or not a list`, `Give ${kind}: one { evidence, note } per item, or [] when there is none.`)); continue; }
    verdict[kind].forEach((item, i) => {
      const at = `${kind}[${i}]`;
      if (!isObject(item)) { out.push(t.shape(`${at} is not an object`, "Write it as { evidence, note }.")); return; }
      if (!nonEmpty(item.note)) out.push(t.shape(`${at}.note is missing or empty`, "Say what and why, in a sentence."));
      out.push(...t.evidence(item.evidence, `${at}.evidence`));
    });
  }
  return out;
}

const WORD = { improve: "would improve", missing: "misses", remove: "would remove" };

// Always passes: every improve, missing and remove item is a warning at its evidence's line, and a
// finding for the triage file. The summary counts all four lists.
export function derive(verdict, pkt, t) {
  const reader = pkt.inputs.reader.id;
  const findings = [];
  const triage = [];
  for (const kind of ["improve", "missing", "remove"]) {
    for (const item of verdict[kind]) {
      const note = item.note.trim();
      if (kind === "improve") findings.push({ ...t.finding("judge-panel-improve", `${reader} ${WORD[kind]} this: ${note}`, "Answer it in the triage file: take it, keep the passage with a reason, show it is already true, or leave it open for a decision.", t.lineOf(item.evidence)), severity: "warn" });
      if (kind === "missing") findings.push({ ...t.finding("judge-panel-missing", `${reader} ${WORD[kind]} something here: ${note}`, "Answer it in the triage file: take it, keep the passage with a reason, show it is already true, or leave it open for a decision.", t.lineOf(item.evidence)), severity: "warn" });
      if (kind === "remove") findings.push({ ...t.finding("judge-panel-remove", `${reader} ${WORD[kind]} this: ${note}`, "Answer it in the triage file: take it, keep the passage with a reason, show it is already true, or leave it open for a decision.", t.lineOf(item.evidence)), severity: "warn" });
      triage.push({ kind, text: note, evidence: item.evidence });
    }
  }
  const n = (k) => verdict[k].length;
  const summary = `${reader}: ${n("good")} good, ${n("improve")} to improve, ${n("missing")} missing, ${n("remove")} to remove`;
  return { status: "pass", findings, summary, triage };
}
