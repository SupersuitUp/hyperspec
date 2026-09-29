// Sentence units: the grain `hyperspec learn` diffs two drafts at. Deterministic, no judgment.
//
// A unit is one sentence, one markdown heading line, or one list item. Built from the splitters
// src/segments.mjs already ships, so "what is a sentence" never disagrees between commands:
// paragraphs first (a blank line always ends a unit, punctuation or not), then, inside each
// paragraph, every heading line on its own and every run of other lines through the sentence
// splitter (". ! ?" followed by whitespace, never inside a quotation on the same line, each list
// item on its own). On top of that one rule of its own: a unit that ends in a common abbreviation
// ("Dr.", "e.g.", an initial) is joined to the next unit of the same run, since the period there
// ends a word, not a sentence.

import { splitSegments } from "./segments.mjs";

const HEADING = /^ {0,3}#{1,6}(?:[ \t]|$)/;

// Lowercased, leading punctuation stripped ("(e.g." reads as "e.g.").
const ABBREVIATIONS = new Set(["mr.", "mrs.", "ms.", "dr.", "prof.", "sr.", "jr.", "st.", "vs.", "cf.", "e.g.", "i.e."]);

function endsInAbbreviation(text) {
  const last = text.trimEnd().split(/\s+/).at(-1) ?? "";
  const word = last.replace(/^[^\p{L}]+/u, "");
  return ABBREVIATIONS.has(word.toLowerCase()) || /^\p{Lu}\.$/u.test(word);
}

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

// Sentences of text[start, end), abbreviation splits joined back.
function sentencesOf(text, start, end) {
  const units = splitSegments(text.slice(start, end), { by: "sentence" }).map((s) => ({ start: start + s.start, end: start + s.end }));
  const out = [];
  for (const u of units) {
    const prev = out.at(-1);
    if (prev && endsInAbbreviation(text.slice(prev.start, prev.end))) prev.end = u.end;
    else out.push({ ...u });
  }
  return out;
}

// sentenceUnits(text): [{ text, start, end }] in document order, text exactly text.slice(start, end).
export function sentenceUnits(text) {
  const out = [];
  for (const para of splitSegments(text)) {
    let run = null;
    const flush = () => { if (run) out.push(...sentencesOf(text, run.start, run.end)); run = null; };
    for (const line of lines(text, para.start, para.end)) {
      if (HEADING.test(text.slice(line.start, line.end))) { flush(); out.push({ start: line.start, end: line.end }); continue; }
      if (run) run.end = line.end; else run = { ...line };
    }
    flush();
  }
  return out.map((u) => ({ text: text.slice(u.start, u.end), start: u.start, end: u.end }));
}

// The form two units are compared in: every whitespace run one space, trimmed. For comparison
// only; a hunk carries its units as written.
export const normalizeSentence = (s) => s.replace(/\s+/g, " ").trim();
