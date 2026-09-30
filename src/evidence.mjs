// The evidence rule, shared by every command that holds a quoted span to a draft: `judge record`
// (every passage a judge cites), and `triage` (every answer that says where the draft now does
// what a finding asked, and every finding an outside review quotes). One rule, so a span that
// counts for a judge counts for a triage answer, and the reverse.
//
// A span of evidence counts as quoted from the draft when, after both are normalized, the draft
// contains it. Normalization collapses every run of whitespace (spaces, tabs, line breaks, CRLF) to
// one space and turns curly, low and angle quotation marks and apostrophes into their straight
// forms (primes are not quotation marks and are left alone), so a judge that reflows a quotation or
// types typographic quotes is still quoting; changing a single word is not.
//
// A span must also carry at least MIN_EVIDENCE_WORDS word tokens (runs of letters and digits), and
// match on word boundaries: a match may not start or end in the middle of a word. A one-letter or
// one-word "quotation" is found almost anywhere and so checks nothing.

import { lineAt } from "./stations/util.mjs";

export const MIN_EVIDENCE_WORDS = 3;
const WORD_CHAR = /[\p{L}\p{N}]/u;
export const WORD_TOKENS = /[\p{L}\p{N}]+/gu;

const QUOTE_CHARS = new Map([
  ["‘", "'"], ["’", "'"], ["‚", "'"], ["‛", "'"], ["‹", "'"], ["›", "'"],
  ["“", '"'], ["”", '"'], ["„", '"'], ["‟", '"'], ["«", '"'], ["»", '"'],
]);

// { norm, map }: the normalized text, and for each of its characters the offset in `text` it came
// from, so a match in the normalized text can be traced back to a line of the original.
export function normalizeForEvidence(text) {
  let norm = "";
  const map = [];
  let pendingSpace = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (/\s/.test(ch)) { if (norm && pendingSpace < 0) pendingSpace = i; continue; }
    if (pendingSpace >= 0) { norm += " "; map.push(pendingSpace); pendingSpace = -1; }
    norm += QUOTE_CHARS.get(ch) ?? ch;
    map.push(i);
  }
  return { norm, map };
}

// The number of word tokens in `span`, as the rule counts them.
export const evidenceWords = (span) => (normalizeForEvidence(String(span)).norm.match(WORD_TOKENS) ?? []).length;

// A locator bound to one text: locate(span) is the first whole-word match of `span`, as
// { line, start, end } (1-based line; start and end are offsets into the original text, end
// exclusive), or null. Build it once per text: normalizing is the cost.
export function evidenceLocator(text) {
  const { norm, map } = normalizeForEvidence(text);
  return (span) => {
    const needle = normalizeForEvidence(String(span ?? "")).norm;
    if (!needle) return null;
    const startsWord = WORD_CHAR.test(needle[0]);
    const endsWord = WORD_CHAR.test(needle[needle.length - 1]);
    for (let at = norm.indexOf(needle); at >= 0; at = norm.indexOf(needle, at + 1)) {
      const before = at > 0 ? norm[at - 1] : "";
      const after = norm[at + needle.length] ?? "";
      if (startsWord && before && WORD_CHAR.test(before)) continue;
      if (endsWord && after && WORD_CHAR.test(after)) continue;
      const start = map[at];
      return { line: lineAt(text, start), start, end: map[at + needle.length - 1] + 1 };
    }
    return null;
  };
}

// Why `span` is not evidence of `locate`'s text: "missing" (empty or not a string), "too-short"
// (fewer than MIN_EVIDENCE_WORDS words) or "not-found"; null when it is evidence.
export function evidenceProblem(locate, span) {
  if (typeof span !== "string" || !span.trim()) return "missing";
  if (evidenceWords(span) < MIN_EVIDENCE_WORDS) return "too-short";
  return locate(span) ? null : "not-found";
}
