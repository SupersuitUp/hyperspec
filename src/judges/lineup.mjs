// The lineup: a blind test of voice. Up to three goldens from the spec's DNA scope (passages a
// person approved as this writer, in this scope) go in a lineup with one passage of the draft,
// shuffled and labelled; a judge who can pick the draft's passage out has found that the draft does
// not yet sound like the writer. The station passes when the judge picks a golden.
//
// Everything here is deterministic. The goldens are the scope's first three by file name (the order
// src/dna.mjs's reader returns them in). The draft's passage is its prose paragraph whose length in
// characters is closest to the goldens' median length, ties to the earliest. The shuffle is seeded
// from the draft's sha256, so the same draft always gets the same labels and a revised draft gets a
// fresh draw. The draft's label is the hidden answer: it goes only in the station's key, which
// prepare writes to lineup.key.json for a person to read and record rebuilds rather than reading.

import { resolve } from "node:path";
import { str } from "../placeholder.mjs";
import { readScope } from "../dna.mjs";
import { splitLines } from "../draft.mjs";

export const name = "lineup";

export const MAX_GOLDENS = 3;
export const LABELS = Object.freeze(["A", "B", "C", "D"]);

export const LINEUP_INSTRUCTIONS = [
  "Each passage in inputs.candidates carries a capital-letter label.",
  "All but one were written by the writer of inputs.scope, for this form, audience and purpose, and approved by a person; exactly one comes from a new draft.",
  "Pick the label of the passage you believe comes from the new draft, judging by voice alone: rhythm, diction, sentence shape, what this writer would and would not say.",
  "Give your confidence from 0 (a guess) to 1 (certain), and in reason say what in the candidates decided it.",
  "Answer only in the verdict shape given in verdict_schema.",
].join(" ");

const isObject = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const chars = (s) => [...s].length;

// ---- the draft's prose paragraphs ----------------------------------------------------------------

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING = /^ {0,3}#{1,6}(?:[ \t]|$)/;
// A line that makes its block something other than a prose paragraph: a list item, a blockquote, a
// table row, a thematic break or setext underline (front matter's --- too), or an HTML line.
const NOT_PROSE = [
  /^ {0,3}(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)/,
  /^ {0,3}>/,
  /^\s*\|/,
  /^ {0,3}(?:(?:[-*_][ \t]*){3,}|=+[ \t]*)$/,
  /^ {0,3}<[A-Za-z/!?]/,
];
const INDENTED_CODE = /^(?: {4}|\t)/;

// proseParagraphs(text): [{ line, text }] for every prose paragraph of a markdown draft, in order.
// A block is a run of non-blank lines; fenced code (blank lines inside it included) and ATX headings
// end a block and are never part of one. A block is prose only when every one of its lines is plain
// text: a block holding a list item, a quotation, a table row, a break or HTML is left out whole
// (a paragraph that runs into a list is not a passage a golden could stand beside), and so is a
// block opening with indented code. text is the block's lines, trailing whitespace trimmed, joined
// with "\n"; line is the 1-based draft line it starts on.
export function proseParagraphs(text) {
  const lines = splitLines(String(text));
  const out = [];
  let block = [];
  let fence = null;
  const flush = () => {
    if (block.length && !INDENTED_CODE.test(block[0].text) && block.every((l) => !NOT_PROSE.some((re) => re.test(l.text)))) {
      out.push({ line: block[0].line, text: block.map((l) => l.text.trimEnd()).join("\n") });
    }
    block = [];
  };
  lines.forEach((raw, i) => {
    const m = raw.match(FENCE);
    if (fence) {
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length && !raw.slice(m[0].length).trim()) fence = null;
      return;
    }
    if (m) { flush(); fence = m[1]; return; }
    if (!raw.trim() || HEADING.test(raw)) { flush(); return; }
    block.push({ line: i + 1, text: raw });
  });
  flush();
  return out;
}

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// pickPassage(paragraphs, goldenLengths): the paragraph whose length in characters is closest to
// the median of goldenLengths; on a tie, the earliest. null when there is no paragraph.
export function pickPassage(paragraphs, goldenLengths) {
  const target = median(goldenLengths);
  let best = null;
  let bestDistance = Infinity;
  for (const p of paragraphs) {
    const d = Math.abs(chars(p.text) - target);
    if (d < bestDistance) { best = p; bestDistance = d; }
  }
  return best;
}

// ---- the shuffle ---------------------------------------------------------------------------------

// mulberry32: a small, well-mixed 32-bit PRNG, so the shuffle needs no dependency and gives the
// same sequence on every Node version.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// seededShuffle(items, sha256Hex): a new array, items in a Fisher-Yates order drawn from a PRNG
// seeded with the first 32 bits of the hash. The same items and hash always give the same order.
export function seededShuffle(items, sha256Hex) {
  const random = mulberry32(parseInt(String(sha256Hex).slice(0, 8), 16) || 0);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---- the station ---------------------------------------------------------------------------------

// The scope as written in the spec, and what is on disk there: { scopeDir, scope, goldens, unreadable }.
function readLineupScope(spec) {
  const scopeDir = str(spec.data?.writing?.dna?.scope_dir);
  const disk = readScope(resolve(spec.dir || ".", scopeDir), { displayDir: scopeDir });
  const unreadable = disk.findings.some((x) => x.id === "writing-dna-goldens-missing" || x.id === "writing-dna-goldens-outside");
  const goldens = disk.goldens.filter((g) => g.text).slice(0, MAX_GOLDENS);
  return { scopeDir, scope: disk.scope, goldens, unreadable };
}

// null when the lineup applies, otherwise why not: it needs a written dna block whose scope_dir is
// set and whose check names a rubric, at least one golden in that scope, and a prose paragraph in the
// draft to stand among them.
export function skipReason(spec, draft) {
  const dna = spec.data?.writing?.dna;
  if (!isObject(dna)) return "writing.dna is not written (deferred)";
  if (!str(dna.scope_dir)) return "writing.dna.scope_dir is not set";
  if (!str(dna.check?.rubric)) return "writing.dna.check has no rubric";
  const { scopeDir, goldens, unreadable } = readLineupScope(spec);
  if (unreadable) return `writing.dna.scope_dir "${scopeDir}": its goldens cannot be read (run \`hyperspec lint\` for details)`;
  if (!goldens.length) return `writing.dna.scope_dir "${scopeDir}" has no goldens`;
  if (draft && !proseParagraphs(draft.text).length) return "the draft has no prose paragraph to put in the lineup";
  return null;
}

// The packet's rubric (dna.check.rubric, verbatim), inputs (the scope and the labelled candidates,
// text only) and verdict schema, and the key: which label is the draft's, and where every
// candidate came from.
export function packet(spec, draft) {
  const { scope, goldens } = readLineupScope(spec);
  const passage = pickPassage(proseParagraphs(draft.text), goldens.map((g) => chars(g.text)));
  const pool = [...goldens.map((g) => ({ source: g.path, text: g.text })), { source: "draft", text: passage.text }];
  const order = seededShuffle(pool, draft.sha256);
  const labels = LABELS.slice(0, order.length);
  return {
    rubric: spec.data.writing.dna.check.rubric,
    inputs: {
      scope: { writer: str(scope?.writer), form: str(scope?.form), audience: str(scope?.audience), purpose: str(scope?.purpose) },
      candidates: order.map((c, i) => ({ label: labels[i], text: c.text })),
    },
    verdict_schema: {
      type: "object",
      required: ["pick", "confidence", "reason"],
      properties: {
        pick: { enum: labels, description: "the label of the passage you believe comes from the new draft" },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        reason: { type: "string", description: "what in the candidates decided the pick" },
      },
    },
    key: {
      station: name,
      draft_label: labels[order.findIndex((c) => c.source === "draft")],
      draft_line: passage.line,
      candidates: order.map((c, i) => ({ label: labels[i], source: c.source })),
    },
  };
}

// Every problem with the verdict, as findings. The reason describes the candidates rather than
// quoting the draft, so it carries no evidence.
export function validate(verdict, pkt, t) {
  if (!isObject(verdict)) return [t.shape("the verdict is not a JSON object", "Write one object: { pick, confidence, reason }.")];
  const out = [];
  const labels = pkt.inputs.candidates.map((c) => c.label);
  if (typeof verdict.pick !== "string") out.push(t.shape("pick is missing or not a string", `Set pick to one candidate's label: ${labels.join(", ")}.`));
  else if (!labels.includes(verdict.pick)) out.push(t.finding("judge-lineup-pick-unknown", `pick "${verdict.pick}" is not a label in the lineup`, `Pick one of the labels: ${labels.join(", ")}.`));
  if (typeof verdict.confidence !== "number" || !Number.isFinite(verdict.confidence) || verdict.confidence < 0 || verdict.confidence > 1) {
    out.push(t.shape("confidence is missing or not a number from 0 to 1", "Set confidence to a number from 0 (a guess) to 1 (certain)."));
  }
  if (typeof verdict.reason !== "string" || !verdict.reason.trim()) out.push(t.shape("reason is missing or empty", "Say what in the candidates decided the pick."));
  return out;
}

// Passes when the pick is a golden: the judge could not tell the draft from the writer.
export function derive(verdict, pkt, t, key) {
  if (verdict.pick !== key.draft_label) return { status: "pass", findings: [] };
  const n = pkt.inputs.candidates.length;
  return {
    status: "fail",
    findings: [t.finding(
      "judge-lineup-picked",
      `the judge picked the draft's passage (${verdict.pick}) out of ${n} candidates with confidence ${verdict.confidence}: ${verdict.reason.trim()}`,
      "Revise this passage toward the goldens' voice, where the reason points; if the goldens do not cover this kind of passage, add one that does. Then prepare and judge again.",
      key.draft_line,
    )],
  };
}
