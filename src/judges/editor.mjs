// The editor (hyperspec 0.13): a judge reads the draft as a senior editor at a top book publisher
// and business magazine would, and marks every passage a professional editor would mark: the
// passage, the fault, and why. Every other judge asks whether the draft is understood, in voice,
// persuasive or sourced; none asks whether a sentence is well written, so a draft could pass all of
// them and still read like a machine wrote it. The editor is the one that asks.
//
// Three things in the design come from research on AI editing, and each is a rule here:
//
// - The editor FLAGS and never rewrites. In the CHI 2025 study of 1,057 AI paragraphs edited by
//   professional writers, AI found flawed passages nearly as well as two experts agreed with each
//   other, and its rewrites were weak (a cliche swapped for another). So the verdict has no field
//   for replacement text, and the instructions forbid it.
// - The faults are a closed set: the seven those writers kept finding (cliche, unnecessary
//   exposition, purple prose, poor sentence structure, lack of specificity, awkward word choice,
//   tense inconsistency), plus four of ours: wrong register, overclaim, machine cadence, order.
// - Untrained AI judges of prose are near chance; trained on human edits they reach 74%. So the
//   spec can name a file of human line edits (writing.editor.examples, JSONL, one { passage, fault,
//   why, edited? } per line) and every one goes in the packet as calibration. That file is neither
//   the spec nor the draft, so the station names it in inputSources: an examples file changed after
//   prepare makes the packet stale, as lineup's goldens and persona's claims ledger do.
// - AI judges favor AI writing, their own most of all. The packet carries judge_model, a note that
//   it is to be judged on a different model family from the one that drafted the piece. hyperspec
//   calls no model, so it cannot enforce that; it says it where the caller will read it.
//
// The status: pass when would_publish is true (a senior editor would send it to print without a
// line edit). Every mark is a warning at its passage's line and a finding for the triage file, so
// `hyperspec triage` must answer each one, as it answers the panel's.
//
// Applies to every writing spec with a draft unless writing.editor.off is true. The mechanical
// tells (AI vocabulary, contrast pairs, lists of three, overclaiming words) are the tells
// station's (src/stations/tells.mjs), found by a word list before any judge reads the draft, so
// the editor's attention goes to what only judgment can see.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { str } from "../placeholder.mjs";

export const name = "editor";

// The eleven faults, a closed set, in the order the verdict schema lists them.
export const EDITOR_FAULTS = Object.freeze({
  "cliche": "a stock phrase or image the reader has met too often to see",
  "unnecessary-exposition": "explains what the reader already has, or what the passage already showed",
  "purple-prose": "ornament past what the sentence needs; the writing calls attention to itself",
  "sentence-structure": "a sentence that is hard to follow, monotonous with its neighbours, or built backwards",
  "lack-of-specificity": "a general word where a specific one, a number or an example would carry it",
  "awkward-word-choice": "a word that is wrong, imprecise or jarring in context",
  "tense-inconsistency": "the tense shifts without reason",
  "wrong-register": "sounds amateur to this reader, or is a phrase no one in the reader's seat says",
  "overclaim": "a word or claim that invites a skeptic: more than the evidence or the reader will bear",
  "machine-cadence": "an aphorism or punchline ending doing an argument's work, a tidy triplet, a \"not X but Y\" turn",
  "order": "a list or argument in an order this reader would not choose",
});
export const FAULT_IDS = Object.freeze(Object.keys(EDITOR_FAULTS));

export const DEFAULT_RUBRIC = "Would a senior editor at a top book publisher and business magazine send this draft to print without a line edit? Mark every passage such an editor would mark, by its fault.";

export const JUDGE_MODEL = "Judge this packet on a different model family from the one that drafted the piece: AI judges favor AI writing, their own most of all.";

export const EDITOR_INSTRUCTIONS = [
  "Read inputs.draft as a senior editor at a top book publisher and a business magazine would, for the reader inputs.audience describes (when it is not null).",
  "Mark every passage a professional editor would mark: add an entry to findings with the passage as evidence, copied verbatim from inputs.draft, at least three whole words; its fault, one of the ids in verdict_schema; and why, in a sentence.",
  "Flag; never rewrite. Do not suggest replacement text, in why or anywhere else: say what is wrong and why, and leave the fix to the writer.",
  "inputs.examples are line edits a human editor made for this house, each a passage, its fault and why (and sometimes the edited text). Use them as calibration for what this house marks and how hard; do not mark the draft for resembling them.",
  "Then set would_publish: true only if you would send the draft to print as it stands, without a line edit.",
  "Answer only in the verdict shape given in verdict_schema.",
].join(" ");

const isObject = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const nonEmpty = (v) => typeof v === "string" && v.trim().length > 0;
const editorBlock = (spec) => (isObject(spec?.data?.writing?.editor) ? spec.data.writing.editor : {});

// { path, missing, lines }: the examples file writing.editor.examples names, read relative to the
// spec's folder. lines are { n, example } for a usable line and { n, problem } for any other; lint
// reports the problems (writing-editor-examples-line) and the packet carries only the usable ones.
// path is null when the spec names no file.
export function readEditorExamples(spec) {
  const path = str(editorBlock(spec).examples);
  if (!path) return { path: null, missing: false, lines: [] };
  let raw;
  try { raw = readFileSync(resolve(spec?.dir || ".", path), "utf8").replace(/^﻿/, ""); }
  catch { return { path, missing: true, lines: [] }; }
  const lines = [];
  raw.split("\n").forEach((text, i) => {
    if (!text.trim()) return;
    const n = i + 1;
    let obj;
    try { obj = JSON.parse(text); } catch { lines.push({ n, problem: "is not valid JSON" }); return; }
    if (!isObject(obj)) { lines.push({ n, problem: "is not a JSON object" }); return; }
    if (!nonEmpty(obj.passage)) { lines.push({ n, problem: "has no passage" }); return; }
    if (!FAULT_IDS.includes(obj.fault)) { lines.push({ n, problem: `has fault ${JSON.stringify(obj.fault ?? null)}, not one of ${FAULT_IDS.join(", ")}` }); return; }
    if (!nonEmpty(obj.why)) { lines.push({ n, problem: "has no why" }); return; }
    if ("edited" in obj && !nonEmpty(obj.edited)) { lines.push({ n, problem: "has an edited field that is empty or not a string" }); return; }
    lines.push({ n, example: { passage: obj.passage, fault: obj.fault, why: obj.why, ...(nonEmpty(obj.edited) ? { edited: obj.edited } : {}) } });
  });
  return { path, missing: false, lines };
}

const examplesSkip = (path) => `writing.editor.examples "${path}" cannot be read (run \`hyperspec lint\` for details)`;

// null when the editor applies: every writing spec with a draft, unless writing.editor.off is true
// or the examples file it names cannot be read.
export function skipReason(spec, draft) {
  if (str(editorBlock(spec).off) === "true") return "writing.editor.off is true";
  if (draft && !String(draft.text ?? "").trim()) return "the draft is empty";
  const ex = readEditorExamples(spec);
  if (ex.missing) return examplesSkip(ex.path);
  return null;
}

// The skip reason when the station skips because of its source file (the examples file cannot be
// read), else null: record calls such a packet stale rather than altered.
export function sourceSkip(spec) {
  if (str(editorBlock(spec).off) === "true") return null;
  const ex = readEditorExamples(spec);
  return ex.missing ? examplesSkip(ex.path) : null;
}

// The file besides the spec and the draft this station's inputs come from, or null when there is none.
export function inputSources(spec) {
  const path = readEditorExamples(spec).path;
  return path ? `the editor examples (${path})` : null;
}

// The packet's rubric (writing.editor.check.rubric, else DEFAULT_RUBRIC), inputs (the draft, the
// audience's who and reader when the audience block is written, the examples) and verdict schema,
// plus judge_model. No answer key.
export function packet(spec, draft) {
  const block = editorBlock(spec);
  const a = spec.data?.writing?.audience;
  return {
    rubric: str(block.check?.rubric) || DEFAULT_RUBRIC,
    inputs: {
      draft: draft.text,
      audience: isObject(a) ? { who: str(a.who), reader: str(a.reader) } : null,
      examples: readEditorExamples(spec).lines.filter((l) => l.example).map((l) => l.example),
    },
    verdict_schema: {
      type: "object",
      required: ["findings", "would_publish"],
      properties: {
        findings: {
          type: "array",
          description: "every passage a professional editor would mark; empty when there is none",
          items: {
            type: "object",
            required: ["evidence", "fault", "why"],
            properties: {
              evidence: { type: "string", description: "the passage, copied verbatim from the draft, at least three words" },
              fault: { enum: [...FAULT_IDS], description: FAULT_IDS.map((id) => `${id}: ${EDITOR_FAULTS[id]}`).join("; ") },
              why: { type: "string", description: "what is wrong and why, in a sentence; never replacement text" },
            },
          },
        },
        would_publish: { type: "boolean", description: "whether a senior editor at a top publisher would send this draft to print without a line edit" },
      },
    },
    judge_model: JUDGE_MODEL,
    key: null,
  };
}

// Every problem with the verdict, as findings; every evidence span must be in the draft.
export function validate(verdict, pkt, t) {
  if (!isObject(verdict)) return [t.shape("the verdict is not a JSON object", "Write one object: { findings, would_publish }.")];
  const out = [];
  if (!Array.isArray(verdict.findings)) out.push(t.shape("findings is missing or not a list", "Give findings: one { evidence, fault, why } per passage marked, or [] when there is none."));
  else verdict.findings.forEach((m, i) => {
    const at = `findings[${i}]`;
    if (!isObject(m)) { out.push(t.shape(`${at} is not an object`, "Write each finding as { evidence, fault, why }.")); return; }
    if (!FAULT_IDS.includes(m.fault)) {
      const shown = typeof m.fault === "string" ? `"${m.fault}"` : m.fault === undefined ? "(missing)" : JSON.stringify(m.fault);
      out.push(t.finding("judge-editor-fault-unknown", `${at}.fault ${shown} is not one of ${FAULT_IDS.join(", ")}`, `Set fault to one of ${FAULT_IDS.join(", ")}.`));
    }
    if (!nonEmpty(m.why)) out.push(t.shape(`${at}.why is missing or empty`, "Say what is wrong and why, in a sentence."));
    out.push(...t.evidence(m.evidence, `${at}.evidence`));
  });
  if (typeof verdict.would_publish !== "boolean") out.push(t.shape("would_publish is missing or not true or false", "Set would_publish to the JSON boolean true or false."));
  else if (verdict.would_publish === false && Array.isArray(verdict.findings) && !verdict.findings.length) {
    out.push(t.finding("judge-editor-unmarked", "would_publish is false and findings is empty: an editor who would not print the draft marks what stops it", "Mark the passages that stop it going to print, or set would_publish to true."));
  }
  return out;
}

// Passes when the editor would publish; every mark is a warning at its passage's line and a finding
// for the triage file, its kind the fault id.
export function derive(verdict, pkt, t) {
  const findings = verdict.findings.map((m) => ({ ...t.finding("judge-editor-mark", `the editor marks ${m.fault}: ${m.why.trim()}`, "Answer it in the triage file: take it, keep the passage with a reason, show it is already true, or leave it open for a decision.", t.lineOf(m.evidence)), severity: "warn" }));
  if (!verdict.would_publish) {
    findings.push(t.finding("judge-editor-would-not-publish", "the editor would not send this draft to print without a line edit", "Revise the marked passages, answer each in the triage file, then prepare and judge again."));
  }
  const triage = verdict.findings.map((m) => ({ kind: m.fault, text: m.why.trim(), evidence: m.evidence }));
  const counts = new Map();
  for (const m of verdict.findings) counts.set(m.fault, (counts.get(m.fault) ?? 0) + 1);
  const by = [...counts].map(([f, n]) => `${f} ${n}`).join(", ");
  const summary = `${verdict.findings.length} marked${by ? ` (${by})` : ""}; would publish: ${verdict.would_publish ? "yes" : "no"}`;
  return { status: verdict.would_publish ? "pass" : "fail", findings, summary, triage };
}
