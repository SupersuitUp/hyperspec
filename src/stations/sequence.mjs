// Station "sequence" (hyperspec 0.8). Every other station checks one piece against its spec. A
// work read in order (a course, a primer, a textbook, a book of lessons) makes promises ACROSS its
// pieces: lesson 5 is written for someone who has read lessons 1 to 4 and nothing else. This
// station holds the draft to those promises, and runs only when the spec declares
// writing.form.sequence.
//
// A unit is one lesson (or chapter, or whatever sequence.unit names): an ATX heading "<unit> <n>",
// optionally followed by ":" or "." and a title, running until the next unit heading, the next
// heading of its own level or above (a part's heading, whose introduction belongs to no lesson), or
// the end of the file it sits in. Headings inside fenced code are not headings.
//
// The guards, every one deterministic:
//   sections   every unit carries each of sequence.sections, as a "**Label:**" line or a heading
//   defined    every term is defined in exactly one unit's terms section
//   order      no unit uses a term before the unit that defines it; code is not prose, the terms
//              section is not a use, and neither is the unit's closing teaser (a "**<teaser>" line
//              and everything after it). Words in audience.knows and sequence.knows are exempt:
//              listing a word there is a decision that the reader already has it
//   outline    each unit defines every term the outline promises for it
//   numbering  unit numbers increase through the work
//   pointers   (warning) a "<unit> N" pointer to a later unit is reported, so it stays a pointer
//              and never becomes a dependency
//   quiz       (hyperspec 0.9, only when sequence.quiz names the quiz heading) every defined term is
//              tested by some question, a simple plural counting; no question uses a term defined
//              after the unit it is tagged with; every question is tagged; every answer names one
//              of its question's options. Promoted from the checker the first book written this
//              way used, so the rules and the question shape are that checker's.
//
// A use is a whole-word, case-insensitive match, where a hyphen is part of a word: "context-aware"
// does not use "context", and "skills" does not use "skill". The station reads the outline from
// disk, resolved against the spec's folder, the way claims reads its ledger. It never reads a
// part's text for meaning: a term used in a sense other than its definition still counts as a use.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { str } from "../placeholder.mjs";
import { maskCode } from "./util.mjs";

export const name = "sequence";

export const DEFAULTS = Object.freeze({
  unit: "Lesson",
  sections: Object.freeze(["After this lesson you can", "New terms", "Try this"]),
  terms_section: "New terms",
  teaser: "Next,",
});

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const list = (v) => (Array.isArray(v) ? v : []);
const ATX = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;

// A term as the station compares it: lower case, no code or emphasis marks, no parenthetical, one
// space between words.
export const normTerm = (s) => String(s).toLowerCase().replace(/[`*]/g, "").replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+/g, " ").trim();

// The sequence block with every default filled in. null when the spec declares none.
export function sequenceOf(spec) {
  const raw = spec?.data?.writing?.form?.sequence;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const sections = list(raw.sections).map(str).filter(Boolean);
  const knows = [...list(raw.knows), ...list(spec?.data?.writing?.audience?.knows)].map(str).filter(Boolean).map(normTerm);
  return {
    unit: str(raw.unit) || DEFAULTS.unit,
    sections: sections.length ? sections : [...DEFAULTS.sections],
    termsSection: str(raw.terms_section) || DEFAULTS.terms_section,
    teaser: str(raw.teaser) || DEFAULTS.teaser,
    outline: str(raw.outline) || null,
    quiz: str(raw.quiz) || null,
    knows: new Set(knows),
  };
}

// Every unit in the draft, in document order: { n, title, line, startLine, text, lines }, where
// line is the heading's 1-based line, and text is everything after the heading up to where the
// unit ends (see the header). startLine is the line text begins on. A draft assembled from several
// files (draft.sources, see src/sequence-draft.mjs) ends a unit at its file's end too.
export function parseUnits(draft, { unit }) {
  const lines = draft.text.split("\n");
  const masked = maskCode(draft.text).split("\n");
  const unitRe = new RegExp(`^${escapeRe(unit)}[ \\t]+(\\d+)\\b[ \\t]*[:.]?[ \\t]*(.*)$`, "i");
  const fileEnds = new Set(list(draft.sources).map((s) => s.startLine + s.lineCount - 1));
  const units = [];
  let open = null;
  const close = (endLine) => {
    if (!open) return;
    const body = lines.slice(open.line, endLine);
    units.push({ n: open.n, title: open.title, line: open.line, startLine: open.line + 1, lines: body, text: body.join("\n") });
    open = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const h = ATX.exec(masked[i].replace(/\r$/, ""));
    if (h) {
      const level = h[1].length;
      const m = unitRe.exec((h[2] ?? "").replace(/(^|[ \t]+)#+[ \t]*$/, "").trim());
      if (m) {
        close(i);
        open = { n: Number(m[1]), title: m[2].trim(), line: i + 1, level };
      } else if (open && level <= open.level) close(i);
    }
    if (open && fileEnds.has(i + 1)) close(i + 1);
  }
  close(lines.length);
  return units;
}

// A section label line: "**Label:**", "**Label**:" or "**Label**" at the start of a line (text may
// follow), or a heading whose text is the label, with or without a closing colon. Case-insensitive.
function labelRe(label) {
  const l = escapeRe(label);
  return new RegExp(`^(?:[ \\t]*\\*\\*${l}(?::\\*\\*|\\*\\*:?)|[ \\t]{0,3}#{1,6}[ \\t]+${l}:?[ \\t]*#*[ \\t]*$)`, "i");
}

// The index (into unit.lines) of the first line carrying `label`, or -1. Code is masked first, so a
// label shown in an example is not the unit's own.
function labelLine(unit, label) {
  const masked = maskCode(unit.text).split("\n");
  const re = labelRe(label);
  return masked.findIndex((l) => re.test(l.replace(/\r$/, "")));
}

// The [start, end) range of unit.lines holding the terms section: its label line, then the list
// under it, up to the first blank line after the list begins. null when the unit has no such section.
function termsRange(unit, termsSection) {
  const at = labelLine(unit, termsSection);
  if (at < 0) return null;
  let end = at + 1;
  while (end < unit.lines.length && !unit.lines[end].trim()) end++; // blank lines before the list
  while (end < unit.lines.length && unit.lines[end].trim()) end++;
  return { start: at, end };
}

// The terms a unit's terms section defines, normalized, each once, in order. A list item that
// reminds the reader of an earlier term, "(from Lesson 3)", defines nothing. Several bold terms
// before the item's first ":**" are all defined, so "- **A**, **B** and **C:** ..." defines three.
export function newTerms(unit, { unit: unitWord, termsSection }) {
  const range = termsRange(unit, termsSection);
  if (!range) return [];
  const reminder = new RegExp(`\\(\\s*from\\s+${escapeRe(unitWord)}\\s+\\d+\\s*\\)`, "i");
  const out = [];
  for (const raw of unit.lines.slice(range.start + 1, range.end)) {
    const line = raw.replace(/^[ \t]*[-*+][ \t]+/, "");
    if (reminder.test(line)) continue;
    let head;
    if (line.includes(":**")) head = `${line.split(":**")[0]}**`;
    else if (line.includes("**:")) head = line.split("**:")[0] + "**";
    else head = (line.match(/\*\*(.+?)\*\*/) || [""])[0];
    for (const m of head.matchAll(/\*\*(.+?)\*\*/g)) {
      const t = normTerm(m[1]);
      if (t && !out.includes(t)) out.push(t);
    }
  }
  return out;
}

// The terms an outline promises per unit: { n: [term, ...] }. An outline item is a numbered list
// line, "N. ...", running until the next numbered item at its indent or less, or a heading; its
// promise is an emphasized "*Terms: a, b, c.*" anywhere in the item.
export function outlineTerms(text) {
  const out = {};
  const lines = String(text).replace(/\r/g, "").split("\n");
  let cur = null;
  const flush = () => {
    if (!cur) return;
    const m = cur.text.match(/\*Terms:\s*([^*]*?)\.?\s*\*/);
    if (m) out[cur.n] = m[1].split(/,\s*/).map(normTerm).filter(Boolean);
    cur = null;
  };
  for (const line of lines) {
    const item = /^([ \t]*)(\d+)\.[ \t]/.exec(line);
    if (item && (!cur || item[1].length <= cur.indent)) {
      flush();
      cur = { n: Number(item[2]), indent: item[1].length, text: line };
    } else if (/^ {0,3}#{1,6}[ \t]/.test(line)) flush();
    else if (cur) cur.text += `\n${line}`;
  }
  flush();
  return out;
}

// The unit's prose as the order and pointer guards read it: code masked and the closing teaser
// (from its "**<teaser>" line to the unit's end) blanked, lines kept so a position still maps to a
// line. withTerms false blanks the terms section too, for the order guard: a unit's terms section
// is where it defines words, and a reminder there names an earlier unit's word on purpose. The
// pointer guard keeps it, since "(Lesson 18 covers this)" in a definition is still a pointer.
function proseOf(unit, seq, { withTerms }) {
  const lines = maskCode(unit.text).split("\n");
  const range = withTerms ? null : termsRange(unit, seq.termsSection);
  if (range) for (let i = range.start; i < range.end; i++) lines[i] = "";
  const teaserRe = new RegExp(`^[ \\t]*\\*\\*${escapeRe(seq.teaser)}`, "i");
  const t = lines.findIndex((l) => teaserRe.test(l));
  if (t >= 0) for (let i = t; i < lines.length; i++) lines[i] = "";
  return lines;
}

// The 1-based draft line of the first whole-word use of `term` in the unit's prose, or 0.
function firstUse(unit, prose, term) {
  const re = new RegExp(`(^|[^a-z0-9-])${escapeRe(term)}([^a-z0-9-]|$)`, "i");
  const i = prose.findIndex((l) => re.test(l));
  return i < 0 ? 0 : unit.startLine + i;
}

// Whether `text` (code already masked) uses `term`, by the same whole-word rule as firstUse.
const usesTerm = (text, term) => new RegExp(`(^|[^a-z0-9-])${escapeRe(term)}([^a-z0-9-]|$)`, "i").test(text);

// Every quiz in the draft, read the way the first book written to this shape wrote it:
//
//   ## Check yourself: Part 1
//
//   1. *(Lesson 1)* You type "draft an email" into a chat app. What did you just send?
//      - a) A file on your computer
//      - b) A prompt, sent to a chat app
//   ...
//   **Answers:** 1 b · 2 c
//
// A quiz starts at an ATX heading whose text starts with `quiz` (any case) and runs to the next
// heading of its own level or above, or the end of its file. A question is a numbered line tagged
// "*(<unit> N)*"; it runs to the next numbered line, the answers line or the quiz's end, and its
// options are the indented "- a) " lines inside it. The answers line is "**Answers:**" followed by
// "<number> <letter>" pairs, in any separator. Returns { quizzes, questions, untagged }: quizzes
// counts the quiz headings; each question is { n, unit, line, text, options, answer }, text with
// code masked (code is not prose), line 1-based in the draft; untagged lists { n, line } for a
// numbered line in a quiz that carries no tag.
export function parseQuizzes(draft, { unit, quiz }) {
  const lines = maskCode(draft.text).split("\n").map((l) => l.replace(/\r$/, ""));
  const quizRe = new RegExp(`^${escapeRe(quiz)}`, "i");
  const fileEnds = new Set(list(draft.sources).map((s) => s.startLine + s.lineCount - 1));
  const numbered = /^[ \t]{0,3}(\d+)\.[ \t]/;
  const tagged = new RegExp(`^[ \\t]{0,3}(\\d+)\\.[ \\t]+\\*\\([ \\t]*${escapeRe(unit)}[ \\t]+(\\d+)[ \\t]*\\)\\*`, "i");
  const answersRe = /^[ \t]*\*\*Answers:?\*\*:?(.*)$/i;
  const optionRe = /^[ \t]+[-*+][ \t]+([a-z])\)[ \t]/i;
  const out = { quizzes: 0, questions: [], untagged: [] };
  for (let i = 0; i < lines.length; i++) {
    const h = ATX.exec(lines[i]);
    if (!h || !quizRe.test((h[2] ?? "").replace(/(^|[ \t]+)#+[ \t]*$/, "").trim())) continue;
    out.quizzes += 1;
    const level = h[1].length;
    // [i + 1, end): stops before a heading of its level or above, or after its file's last line
    // (fileEnds holds 1-based line numbers, so fileEnds.has(end) says line index end - 1 was one).
    let end = i + 1;
    while (end < lines.length && !fileEnds.has(end)) {
      const next = ATX.exec(lines[end]);
      if (next && next[1].length <= level) break;
      end++;
    }
    const answers = new Map();
    let cur = null;
    const qs = [];
    const flush = () => { if (cur) qs.push(cur); cur = null; };
    for (let j = i + 1; j < end; j++) {
      const a = answersRe.exec(lines[j]);
      if (a) {
        flush();
        for (const m of a[1].matchAll(/(\d+)[ \t]+([a-z])(?![a-z])/gi)) answers.set(Number(m[1]), m[2].toLowerCase());
        continue;
      }
      const t = tagged.exec(lines[j]);
      if (t) {
        flush();
        cur = { n: Number(t[1]), unit: Number(t[2]), line: j + 1, text: lines[j], options: [] };
        continue;
      }
      const u = numbered.exec(lines[j]);
      if (u) { flush(); out.untagged.push({ n: Number(u[1]), line: j + 1 }); continue; }
      if (!cur) continue;
      cur.text += `\n${lines[j]}`;
      const o = optionRe.exec(lines[j]);
      if (o) cur.options.push(o[1].toLowerCase());
    }
    flush();
    for (const q of qs) out.questions.push({ ...q, answer: answers.get(q.n) ?? null });
    i = end - 1;
  }
  return out;
}

// One finding, in the shape every station returns; line only when there is one to point at.
const finding = ({ id, severity, message, fix, line }) => ({ station: name, id, severity, ...(line ? { line } : {}), message, fix });

export function run(spec, draft) {
  const seq = sequenceOf(spec);
  if (!seq) return { station: name, status: "skip", findings: [], reason: "the spec declares no writing.form.sequence" };
  const U = seq.unit;
  const findings = [];
  const units = parseUnits(draft, seq);
  if (!units.length) {
    findings.push(finding({ id: "station-sequence-no-units", severity: "fail", message: `no "${U} <n>" heading in the draft`, fix: `Head each ${U.toLowerCase()} "## ${U} 1: <title>", or set writing.form.sequence.unit to the word the headings use.` }));
    return { station: name, status: "fail", findings };
  }

  // numbering: each unit's number is greater than the one before it.
  for (let i = 1; i < units.length; i++) {
    if (units[i].n <= units[i - 1].n) {
      findings.push(finding({ id: "station-sequence-numbering", severity: "fail", message: `${U} ${units[i].n} comes after ${U} ${units[i - 1].n}`, fix: `Number the ${U.toLowerCase()}s in reading order, or reorder writing.form.sequence.files.`, line: units[i].line }));
    }
  }

  // sections, and where each term is defined.
  const definedAt = new Map();
  for (const u of units) {
    for (const s of seq.sections) {
      if (labelLine(u, s) < 0) findings.push(finding({ id: "station-sequence-missing-section", severity: "fail", message: `${U} ${u.n} has no "${s}" section`, fix: `Add a "**${s}:**" line (or a "${s}" heading) to ${U} ${u.n}.`, line: u.line }));
    }
    for (const t of newTerms(u, seq)) {
      const first = definedAt.get(t);
      if (first && first !== u) findings.push(finding({ id: "station-sequence-defined-twice", severity: "fail", message: `"${t}" is defined in ${U} ${first.n} and again in ${U} ${u.n}`, fix: `Define "${t}" once; later ${U.toLowerCase()}s remind the reader with "- **${t}** (from ${U} ${first.n}): ...".`, line: u.line }));
      else if (!first) definedAt.set(t, u);
    }
  }

  // order: no unit before the defining one uses the term.
  const prose = new Map(units.map((u) => [u, proseOf(u, seq, { withTerms: false })]));
  for (const [t, at] of definedAt) {
    if (seq.knows.has(t)) continue;
    for (const u of units) {
      if (u === at) break;
      const line = firstUse(u, prose.get(u), t);
      if (line) findings.push(finding({ id: "station-sequence-used-before-defined", severity: "fail", message: `${U} ${u.n} uses "${t}" before ${U} ${at.n} defines it`, fix: `Rewrite ${U} ${u.n} without "${t}", define it earlier, or add it to writing.form.sequence.knows if the reader already has the word.`, line: line }));
    }
  }

  // outline: each unit defines what the outline promises for it. A unit the outline promises that
  // the draft does not hold yet is not a finding: a work is checked while it is being written.
  if (seq.outline) {
    let text = null;
    try { text = readFileSync(resolve(spec?.dir || ".", seq.outline), "utf8"); } catch { /* reported below */ }
    if (text === null) {
      findings.push(finding({ id: "station-sequence-outline-unreadable", severity: "fail", message: `the outline "${seq.outline}" cannot be read`, fix: "Point writing.form.sequence.outline at the outline file, relative to the spec." }));
    } else {
      const promised = outlineTerms(text);
      for (const u of units) {
        const have = newTerms(u, seq);
        for (const t of promised[u.n] ?? []) {
          if (!have.includes(t)) findings.push(finding({ id: "station-sequence-outline-unkept", severity: "fail", message: `the outline promises "${t}" in ${U} ${u.n}, and ${U} ${u.n} does not define it`, fix: `Define "${t}" in ${U} ${u.n}'s ${seq.termsSection}, or change the outline.`, line: u.line }));
        }
      }
    }
  }

  // pointers: a mention of a later unit, once per pair.
  const pointerRe = new RegExp(`\\b${escapeRe(U)}\\s+(\\d+)`, "gi");
  for (const u of units) {
    const seen = new Set();
    proseOf(u, seq, { withTerms: true }).forEach((l, i) => {
      for (const m of l.matchAll(pointerRe)) {
        const n = Number(m[1]);
        if (n <= u.n || seen.has(n)) continue;
        seen.add(n);
        findings.push(finding({ id: "station-sequence-forward-pointer", severity: "warn", message: `${U} ${u.n} points forward to ${U} ${n}`, fix: `Keep it a pointer ("more in ${U} ${n}"): ${U} ${u.n} must make sense to a reader who has not read ${U} ${n}.`, line: u.startLine + i }));
      }
    });
  }

  // quiz: only when the spec names the quiz heading.
  if (seq.quiz) findings.push(...quizFindings(draft, seq, definedAt));

  const status = findings.some((f) => f.severity === "fail") ? "fail" : "pass";
  return { station: name, status, findings };
}

// The quiz guards, against the terms the units define (term -> defining unit).
function quizFindings(draft, seq, definedAt) {
  const U = seq.unit;
  const out = [];
  const { quizzes, questions, untagged } = parseQuizzes(draft, seq);
  if (!quizzes) {
    return [finding({ id: "station-sequence-quiz-missing", severity: "fail", message: `no "${seq.quiz}" heading in the draft, and writing.form.sequence.quiz names one`, fix: `Add a "## ${seq.quiz}" section of questions, or delete quiz: from the spec.` })];
  }
  for (const q of untagged) {
    out.push(finding({ id: "station-sequence-quiz-untagged", severity: "fail", message: `question ${q.n} names no ${U.toLowerCase()} it tests`, fix: `Start the question "${q.n}. *(${U} N)* ...", naming the ${U.toLowerCase()} it tests.`, line: q.line }));
  }
  for (const q of questions) {
    if (!q.answer || !q.options.includes(q.answer)) {
      const has = q.options.length ? q.options.join(", ") : "none";
      out.push(finding({ id: "station-sequence-quiz-answer", severity: "fail", message: q.answer ? `question ${q.n}'s answer is ${q.answer}, which is not one of its options (${has})` : `question ${q.n} has no answer on the quiz's "**Answers:**" line`, fix: `Give question ${q.n} one answer, "${q.n} <letter>", naming one of its options.`, line: q.line }));
    }
    for (const [t, at] of definedAt) {
      if (seq.knows.has(t) || at.n <= q.unit) continue;
      if (usesTerm(q.text, t)) out.push(finding({ id: "station-sequence-quiz-used-before-defined", severity: "fail", message: `question ${q.n}, tagged ${U} ${q.unit}, uses "${t}", which ${U} ${at.n} defines later`, fix: `Rewrite the question without "${t}", or tag it with ${U} ${at.n} or later.`, line: q.line }));
    }
  }
  // coverage: a simple plural counts, so "skills" tests "skill".
  for (const [t, at] of definedAt) {
    if (!questions.some((q) => usesTerm(q.text, t) || usesTerm(q.text, `${t}s`))) {
      out.push(finding({ id: "station-sequence-quiz-untested", severity: "fail", message: `no quiz question tests "${t}", which ${U} ${at.n} defines`, fix: `Add a question that uses "${t}", tagged ${U} ${at.n} or later.`, line: at.line }));
    }
  }
  return out;
}
