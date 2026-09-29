// Sentence units: the grain `hyperspec learn` diffs two drafts at. Deterministic, no judgment.
//
// A unit is one sentence, one markdown heading line, or one list item. Built from the splitters
// src/segments.mjs already ships, so "what is a sentence" never disagrees between commands:
// paragraphs first (a blank line always ends a unit, punctuation or not), then, inside each
// paragraph, its first line on its own when it is a heading, and the other lines through the sentence
// splitter (". ! ?" followed by whitespace, never inside a quotation on the same line, each list
// item on its own). Three rules of its own on top:
//   - curly double quotes count as quotes, the same as straight ones (the shared splitter only
//     knows '"'; each curly mark is one UTF-16 unit, so mapping them keeps every offset);
//   - a unit that ends in a common abbreviation ("Dr.", "e.g.", an initial like "J.") is joined
//     to the next unit of the same run, since that period ends a word, not a sentence;
//   - so is any unit followed by one that starts with a lowercase letter ("the U.S. economy",
//     "9 a.m. in"), since a sentence does not start lowercase.

import { splitSegments } from "./segments.mjs";

const HEADING = /^ {0,3}#{1,6}(?:[ \t]|$)/;

// Lowercased, leading punctuation stripped ("(e.g." reads as "e.g.").
const ABBREVIATIONS = new Set(["mr.", "mrs.", "ms.", "dr.", "prof.", "sr.", "jr.", "st.", "vs.", "cf.", "e.g.", "i.e."]);

function endsInAbbreviation(text) {
  const last = text.trimEnd().split(/\s+/).at(-1) ?? "";
  const word = last.replace(/^[^\p{L}]+/u, "");
  return ABBREVIATIONS.has(word.toLowerCase()) || /^\p{Lu}\.$/u.test(word);
}

const startsLowercase = (text) => /^\p{Ll}/u.test(text);

// The lines of text[start, end) as { start, end } spans, a CRLF line's "\r" outside its span.
function lines(text, start, end) {
  const out = [];
  let at = start;
  while (at <= end) {
    let nl = text.indexOf("\n", at);
    if (nl < 0 || nl > end) nl = end;
    let e = nl;
    if (e > at && text[e - 1] === "\r") e -= 1;
    out.push({ start: at, end: e });
    at = nl + 1;
  }
  return out;
}

// Sentences of text[start, end), split on `scan` (the text with curly double quotes straightened,
// same offsets), with abbreviation and lowercase splits joined back.
function sentencesOf(text, scan, start, end) {
  const units = splitSegments(scan.slice(start, end), { by: "sentence" }).map((s) => ({ start: start + s.start, end: start + s.end }));
  const out = [];
  for (const u of units) {
    const prev = out.at(-1);
    if (prev && (endsInAbbreviation(text.slice(prev.start, prev.end)) || startsLowercase(text.slice(u.start, u.end)))) prev.end = u.end;
    else out.push({ ...u });
  }
  return out;
}

// sentenceUnits(text): [{ text, start, end, para, heading }] in document order, text exactly
// text.slice(start, end). para is the 0-based index of the paragraph the unit is in; heading is
// true for a markdown heading line.
export function sentenceUnits(text) {
  const scan = text.replace(/[“”]/g, '"');
  const out = [];
  splitSegments(text).forEach((para, p) => {
    let run = null;
    const flush = () => { if (run) out.push(...sentencesOf(text, scan, run.start, run.end).map((u) => ({ ...u, para: p, heading: false }))); run = null; };
    // Only a paragraph's first line can be a heading: a later line that starts with
    // "#" is a hard wrap inside the text and is split into sentences like the rest of it.
    lines(text, para.start, para.end).forEach((line, k) => {
      if (k === 0 && HEADING.test(text.slice(line.start, line.end))) { out.push({ start: line.start, end: line.end, para: p, heading: true }); return; }
      if (run) run.end = line.end; else run = { ...line };
    });
    flush();
  });
  return out.map((u) => ({ text: text.slice(u.start, u.end), start: u.start, end: u.end, para: u.para, heading: u.heading }));
}

// The form two units are compared in: every whitespace run one space, trimmed. For comparison
// only; a hunk carries its units as written.
export const normalizeSentence = (s) => s.replace(/\s+/g, " ").trim();
