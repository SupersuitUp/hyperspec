// The lineup: a blind test of voice. Up to three goldens from the spec's DNA scope (passages a
// person approved as this writer, in this scope) go in a lineup with one passage of the draft,
// shuffled and labelled; a judge who can pick the draft's passage out has found that the draft does
// not yet sound like the writer. The station passes when the judge picks a golden.
//
// Every candidate is built the same way, so none can be told apart by its formatting:
// ONE prose paragraph (proseParagraphs below), reflowed to a single line. The target length is the
// median, in characters, of every prose paragraph of every golden in the scope. Each of the scope's
// first three goldens with a prose paragraph (by file name, the order src/dna.mjs's reader returns
// them in) contributes its paragraph closest to that target; the draft contributes its paragraph
// closest to the same target, skipping any that is already a golden paragraph word for word
//, since a lineup of two identical passages tests nothing. Ties go to the earliest.
//
// The shuffle is seeded from the draft's full text (lineupSeed below), so the same draft always gets
// the same labels and a revised draft gets a fresh draw. The seed is never a value the packet
// carries: the packet holds the draft's hash and one paragraph of it, and a seed taken from the
// hash would let anyone holding the packet rerun the shuffle and read off the answer. The draft's
// label is the hidden answer: it goes only in the station's key, which prepare writes to
// lineup.key.json for a person to read and record rebuilds rather than reading.

import { resolve } from "node:path";
import { sha256 } from "../hash.mjs";
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
  "Judge from the packet's inputs alone: do not open the spec, the draft or any other file the packet names.",
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

// reflow(text): the paragraph on one line, every run of whitespace (line breaks included) collapsed
// to one space. Lineup carries no evidence, so nothing in a candidate has to stay verbatim.
export const reflow = (text) => String(text).replace(/\s+/g, " ").trim();

// pickPassage(paragraphs, lengths, { exclude }): the paragraph whose length in characters is
// closest to the median of `lengths`; on a tie, the earliest. A paragraph whose text is in
// `exclude` (a Set) is never picked. null when no paragraph is left.
export function pickPassage(paragraphs, lengths, { exclude } = {}) {
  const target = median(lengths);
  let best = null;
  let bestDistance = Infinity;
  for (const p of paragraphs) {
    if (exclude?.has(p.text)) continue;
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

// lineupSeed(draftText): the hash the shuffle is seeded with. It is taken from the draft's whole
// text under a fixed prefix, never from draft_sha256 or anything else the packet carries, since the
// packet does not carry the draft's text: a judge holding only the packet cannot recompute the
// order, while the same draft always gets the same labels.
export const LINEUP_SEED_PREFIX = "hyperspec lineup seed\n";
export const lineupSeed = (draftText) => sha256(LINEUP_SEED_PREFIX + String(draftText));

// ---- the station ---------------------------------------------------------------------------------

// Every prose paragraph of a text, reflowed to one line: [{ line, text }].
const reflowedParagraphs = (text) => proseParagraphs(text).map((p) => ({ line: p.line, text: reflow(p.text) }));

// What the lineup would hold for this spec and draft, or why it cannot be built: { skip } or
// { scope, goldens: [{ source, text }], passage: { line, text } }. The one plan both skipReason and
// packet read, so a station that applies always has a packet to build. Without a draft (never the
// case from prepare or record) only the scope's half is checked.
function lineupPlan(spec, draft) {
  const dna = spec.data?.writing?.dna;
  if (!isObject(dna)) return { skip: "writing.dna is not written (deferred)" };
  const scopeDir = str(dna.scope_dir);
  if (!scopeDir) return { skip: "writing.dna.scope_dir is not set" };
  if (!str(dna.check?.rubric)) return { skip: "writing.dna.check has no rubric" };

  const disk = readScope(resolve(spec.dir || ".", scopeDir), { displayDir: scopeDir });
  if (disk.findings.some((x) => x.id === "writing-dna-goldens-missing" || x.id === "writing-dna-goldens-outside")) {
    return { skip: `writing.dna.scope_dir "${scopeDir}": its goldens cannot be read (run \`hyperspec lint\` for details)`, fromSources: true };
  }
  const read = disk.goldens.filter((g) => g.text).map((g) => ({ source: g.path, paragraphs: reflowedParagraphs(g.text) }));
  if (!read.length) return { skip: `writing.dna.scope_dir "${scopeDir}" has no goldens`, fromSources: true };
  const withProse = read.filter((g) => g.paragraphs.length);
  if (!withProse.length) return { skip: `writing.dna.scope_dir "${scopeDir}" has no golden with a prose paragraph`, fromSources: true };

  const all = withProse.flatMap((g) => g.paragraphs);
  const lengths = all.map((p) => chars(p.text));
  const goldens = withProse.slice(0, MAX_GOLDENS).map((g) => ({ source: g.source, text: pickPassage(g.paragraphs, lengths).text }));
  if (!draft) return { scope: disk.scope, goldens, passage: null };

  const drafted = reflowedParagraphs(draft.text);
  if (!drafted.length) return { skip: "the draft has no prose paragraph to put in the lineup" };
  const passage = pickPassage(drafted, lengths, { exclude: new Set(all.map((p) => p.text)) });
  if (!passage) return { skip: "every prose paragraph of the draft is already a golden in the scope, word for word", fromSources: true };
  // A draft that is nothing but this paragraph would give the answer away: the packet carries the
  // draft's hash, and the candidate's text (with or without a line break) is the whole draft.
  if (reflow(draft.text) === passage.text) return { skip: "the draft is one paragraph, the passage the lineup would show, so the packet's draft_sha256 could identify it" };
  return { scope: disk.scope, goldens, passage };
}

// null when the lineup applies, otherwise why not: it needs a written dna block whose scope_dir is
// set and whose check names a rubric, a golden with a prose paragraph in that scope, and a prose
// paragraph in the draft that is not already a golden and is not the whole draft.
export function skipReason(spec, draft) {
  return lineupPlan(spec, draft).skip ?? null;
}

// The skip reason when lineup skips because of its goldens (unreadable, none, none with prose, or
// every draft paragraph already one of them), else null: record calls such a packet stale rather
// than altered.
export function sourceSkip(spec, draft) {
  const p = lineupPlan(spec, draft);
  return p.fromSources ? p.skip : null;
}

// Where the lineup's inputs come from beyond the spec and the draft: record names them when the
// packet's inputs no longer match while neither hash changed.
export function inputSources(spec) {
  const dir = str(spec.data?.writing?.dna?.scope_dir);
  return dir ? `the DNA scope (${dir}: scope.md and goldens)` : null;
}

// The packet's rubric (dna.check.rubric, verbatim), inputs (the scope and the labelled candidates,
// text only) and verdict schema, and the key: which label is the draft's, and where every
// candidate came from.
export function packet(spec, draft) {
  const { scope, goldens, passage } = lineupPlan(spec, draft);
  const pool = [...goldens, { source: "draft", text: passage.text }];
  const order = seededShuffle(pool, lineupSeed(draft.text));
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
