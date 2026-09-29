// Station "terms" (hyperspec 0.6). Checks that every term in
// writing.audience.terms (the new optional list: terms the piece uses that the reader may not
// know) is defined the first time it appears in the draft. Pure and deterministic like every
// station: no model call, no judgment about which words are jargon, just the closed rule below.
//
// Matching a term against the draft is case-insensitive and whole-word (Unicode-aware: a match
// cannot start or end mid-word, using the same letter/number/apostrophe class dna.mjs's own word
// definition uses, so "AI" does not match inside "said" and a multi-word term like "context
// window" matches only as that exact phrase).
//
// "Defined at its first appearance" is read as: the sentence containing
// the term's first appearance, OR the sentence right after it, contains an occurrence of the term
// followed (within the next 6 words of that same sentence, or by a colon among them) by one of
// "is", "means", "refers to"; OR the term is immediately followed by a parenthetical ("term
// (short gloss)"). Sentence boundaries come from splitSegments(text, { by: "sentence" }) in
// src/segments.mjs, the same splitter every other station that reads sentences uses, so "which
// sentence is this in" never disagrees between stations.
//
// A term also listed in writing.audience.knows is never flagged, whatever the draft does with it:
// the reader is assumed to already have it. A term that never appears in the draft at all is not
// flagged either (nothing to define); writing.audience.terms with no real entries, or missing
// entirely, skips the whole station.
//
// Fenced code blocks and inline code spans are masked out (src/stations/util.mjs's maskCode)
// before any of the above runs: a term's only appearance inside example syntax like
// `` `ledger: check` `` is not a prose use, and the mechanical colon/`is` rule below would
// otherwise read that code span's own punctuation as a definition it never gave. Masking
// preserves every character offset, so every 1-based line number reported below is still a line
// of the ORIGINAL draft, never the masked copy.

import { str } from "../placeholder.mjs";
import { splitSegments } from "../segments.mjs";
import { lineAt, maskCode } from "./util.mjs";

export const name = "terms";

// The same word/number class dna.mjs's WORD_RE tokenizes with (letters, digits, straight or
// curly apostrophe for contractions), Unicode-aware so an accented or non-Latin term's edges are
// read correctly too.
const WORD_CHARS = "\\p{L}\\p{N}'’";

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// A case-insensitive, whole-phrase, Unicode-aware matcher for `term`: it cannot start or end
// mid-word (a lookbehind/lookahead against the word-char class above), but the term itself may
// contain internal spaces (a multi-word term matches only as that exact phrase, spaces and all).
function termRegex(term, flags) {
  const body = escapeRegExp(term.trim()).replace(/\s+/g, "\\s+");
  return new RegExp(`(?<![${WORD_CHARS}])${body}(?![${WORD_CHARS}])`, flags);
}

// Every { word, start, end } token in `text`, in order, using the same word-char class as above.
function tokenize(text) {
  const re = new RegExp(`[${WORD_CHARS}]+`, "gu");
  const out = [];
  let m;
  while ((m = re.exec(text))) out.push({ word: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length });
  return out;
}

// Whether `sentenceText` contains a definition of `term`: some occurrence of the term followed,
// within the next 6 words of the SAME sentence (or by a colon somewhere among them), by "is",
// "means" or "refers"+"to"; or immediately (skipping only whitespace) followed by "(".
function definesTerm(sentenceText, term) {
  const re = termRegex(term, "giu");
  let m;
  while ((m = re.exec(sentenceText))) {
    const tailStart = m.index + m[0].length;
    const tail = sentenceText.slice(tailStart);
    if (/^\s*\(/.test(tail)) return true;

    const tokens = tokenize(tail).slice(0, 6);
    const windowEnd = tokens.length ? tokens[tokens.length - 1].end : tail.length;
    const window = tail.slice(0, windowEnd);
    if (window.includes(":")) return true;
    const words = tokens.map((t) => t.word);
    if (words.includes("is") || words.includes("means")) return true;
    if (words.some((w, i) => w === "refers" && words[i + 1] === "to")) return true;
    // re is not global-sticky across iterations by construction (lastIndex advances past this
    // match automatically since the "g" flag is set), so a term repeated in one sentence is
    // still checked occurrence by occurrence rather than looping forever.
  }
  return false;
}

export function run(spec, draft) {
  const audience = spec?.data?.writing?.audience ?? {};
  const terms = Array.isArray(audience.terms) ? audience.terms.map(str).filter(Boolean) : [];
  if (!terms.length) {
    return { station: name, status: "skip", findings: [], reason: "writing.audience.terms is empty or not set" };
  }

  const knows = new Set((Array.isArray(audience.knows) ? audience.knows : []).map((x) => str(x).toLowerCase()).filter(Boolean));

  const scanText = maskCode(draft.text);
  const sentences = splitSegments(scanText, { by: "sentence" });
  const findings = [];
  const usedIds = new Set();

  for (const term of terms) {
    if (knows.has(term.toLowerCase())) continue;

    const first = termRegex(term, "iu").exec(scanText);
    if (!first) continue; // the term never appears outside code; nothing to define

    const pos = first.index;
    const idx = sentences.findIndex((s) => pos >= s.start && pos < s.end);
    const candidates = idx === -1 ? [] : [sentences[idx], sentences[idx + 1]].filter(Boolean);
    const defined = candidates.some((s) => definesTerm(s.text, term));
    if (defined) continue;

    const slug = term.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "term";
    let id = `station-terms-undefined-${slug}`;
    let n = 2;
    while (usedIds.has(id)) { id = `station-terms-undefined-${slug}-${n}`; n += 1; }
    usedIds.add(id);

    findings.push({
      station: name,
      id,
      severity: "fail",
      line: lineAt(draft.text, pos),
      message: `term "${term}" is not defined at its first appearance (need "is", "means", "refers to", a colon within a few words, or an immediate parenthetical, in that sentence or the next)`,
      fix: `Define "${term}" where it first appears, e.g. "${term} is ..." or "${term} (a short gloss)".`,
    });
  }

  return { station: name, status: findings.length ? "fail" : "pass", findings };
}
