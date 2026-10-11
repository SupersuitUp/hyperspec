// Station "tells" (hyperspec 0.13): the mechanical tells of machine prose, found by a word list
// before any judge reads the draft, so the editor judge (src/judges/editor.mjs) spends its
// attention on what only judgment can see. Expert readers spot AI text from a short list of tells
// (AI vocabulary, lists of three, over-polish, over-explaining; Russell et al., ACL 2025); the ones a
// list can find without reading for meaning are here. Pure and deterministic like every station: no
// model call.
//
// Four categories, every list in TELLS below so a new tell is one line:
//
//   ai-vocabulary   a word or phrase from TELLS.ai_vocabulary, whole word, ignoring case
//   contrast-pair   "not X, but Y", "not only X but also Y", "isn't just X, it's Y",
//                   "it's not about X, it's about Y" (TELLS.contrast_pairs, one regex each)
//   overclaim       a word from TELLS.overclaim, whole word, ignoring case
//   lists-of-three  "A, B and C" or "A, B, or C" with short items, flagged only when the draft has
//                   at least LISTS_OF_THREE_MIN of them and more than lists_of_three_per_1000 per
//                   1,000 words (default DEFAULT_LISTS_OF_THREE_PER_1000)
//
// Every hit is a WARNING with its line and the matched text: a tell is a reason to look, not proof,
// and a human writer uses every one of them sometimes. writing.tells may set:
//
//   allow:  words or phrases never flagged (matched against the hit's text, ignoring case)
//   fail_on: categories whose hits fail the station instead of warning
//   lists_of_three_per_1000: the density threshold, a number
//   off: true, which skips the station
//
// Fenced code and inline code are masked out first (util.mjs's maskCode), which keeps every line
// number the draft's own.

import { str } from "../placeholder.mjs";
import { wordsOf } from "../dna.mjs";
import { lineAt, maskCode, maskRanges, truncate } from "./util.mjs";

export const name = "tells";

export const CATEGORIES = Object.freeze(["ai-vocabulary", "contrast-pair", "overclaim", "lists-of-three"]);

// The lists. Words are matched whole and ignoring case; each inflection a writer would use is
// listed, rather than guessed by a stemmer, so what is flagged is exactly what is here. Kept to
// words that are tells in nearly any context: "landscape" and "navigate" are left out because the
// literal sense is common, and "testament" appears only as "a testament to" (the Old Testament is
// not a tell).
export const TELLS = Object.freeze({
  ai_vocabulary: Object.freeze([
    "delve", "delves", "delved", "delving",
    "tapestry", "tapestries",
    "a testament to", "stands as a testament",
    "seamless", "seamlessly",
    "robust",
    "realm", "realms",
    "unlock", "unlocks", "unlocked", "unlocking",
    "elevate", "elevates", "elevated", "elevating",
    "empower", "empowers", "empowered", "empowering",
    "embark", "embarks", "embarked", "embarking",
    "foster", "fosters", "fostered", "fostering",
    "pivotal",
    "synergy", "synergies",
    "cutting-edge",
    "game-changer", "game-changers",
    "ever-evolving",
    "multifaceted",
    "in today's fast-paced world",
    "it's worth noting", "it is worth noting",
  ]),
  overclaim: Object.freeze([
    "miracle", "miracles", "miraculous", "miraculously",
    "magic", "magical", "magically",
    "revolutionary",
    "unprecedented",
    "groundbreaking",
    "game-changing",
    "mind-blowing",
    "alien", "alien-level",
  ]),
  // One regex per construction; each is matched within a sentence (no "." "!" "?" or line break
  // inside X), case-insensitively, straight or curly apostrophes.
  contrast_pairs: Object.freeze([
    /\bit[’']?s not about\b[^.!?\n]{1,80}?[,;.]\s*it[’']?s about\b/giu,
    /\b(?:is|are|was|were|isn[’']t|aren[’']t|wasn[’']t|weren[’']t|is not|are not)\s+(?:not\s+)?(?:just|only|merely|simply)\b[^.!?\n]{1,80}?[,;]\s*(?:it[’']?s|it is|they[’']re|they are|this is|that[’']s)\b/giu,
    /\bnot only\b[^.!?\n]{1,80}?\bbut(?: also)?\b/giu,
    /\bnot\b[^.!?\n,;]{1,80}?,\s*but\b/giu,
    /\bnot\s+(?:a|an|the)\s+[^.!?\n,;]{1,60}?\s+but\s+(?:a|an|the)\b/giu,
  ]),
});

export const DEFAULT_LISTS_OF_THREE_PER_1000 = 3;
export const LISTS_OF_THREE_MIN = 2;

const WORD = "[\\p{L}\\p{N}'’-]+";
const items = (max) => `${WORD}(?:[ \\t]+${WORD}){0,${max - 1}}`;
// Three short items, the last joined by "and" or "or". With the Oxford comma ("A, B, and C") an
// item may run to three words; without it ("A, B and C") to two, since "clause, clause and word"
// reads the same way and is usually not a list. The lookbehind keeps a match from starting
// mid-word.
const LISTS_OF_THREE = Object.freeze([
  new RegExp(`(?<![\\p{L}\\p{N}'’-])${items(3)},[ \\t]+${items(3)},[ \\t]+(?:and|or)[ \\t]+${WORD}`, "giu"),
  new RegExp(`(?<![\\p{L}\\p{N}'’-])${items(2)},[ \\t]+${items(2)}[ \\t]+(?:and|or)[ \\t]+${WORD}`, "giu"),
]);

// One rule per category: its finding id, message and fix.
const RULES = Object.freeze({
  "ai-vocabulary": {
    id: "station-tells-ai-vocabulary",
    message: (q) => `"${q}" is AI vocabulary, a word expert readers take as a sign of machine prose`,
    fix: "Say the plain thing this word stands in for, or add it to writing.tells.allow if it is the right word here.",
  },
  "contrast-pair": {
    id: "station-tells-contrast-pair",
    message: (q) => `"${q}" is a contrast pair, a turn machine prose reaches for`,
    fix: "State the claim directly; the reader does not need the version you are not making.",
  },
  "overclaim": {
    id: "station-tells-overclaim",
    message: (q) => `"${q}" overclaims; it invites a skeptic`,
    fix: "Say what happened, at the size it happened, or add the word to writing.tells.allow if it is literal here.",
  },
  "lists-of-three": {
    id: "station-tells-lists-of-three",
    message: (q, d) => `"${q}" is a list of three, one of ${d.count} in ${d.words} words (${d.rate.toFixed(1)} per 1,000; the threshold is ${d.per1000})`,
    fix: "Cut the list to the items that matter, or vary its shape; tidy triplets in a row read as machine cadence.",
  },
});

const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
const strings = (v) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const norm = (s) => s.toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim();

function phraseRegex(phrase) {
  const body = escapeRegExp(phrase).replace(/'/g, "['’]").replace(/\s+/g, "\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}'’-])${body}(?![\\p{L}\\p{N}'’-])`, "giu");
}

// The tells settings a spec declares, read the way lint checks them (writing-fields.mjs's
// tellsFields): { off, allow, failOn, per1000 }.
export function tellsSettings(spec) {
  const raw = isObj(spec?.data?.writing?.tells) ? spec.data.writing.tells : {};
  const n = Number(str(String(raw.lists_of_three_per_1000 ?? "")));
  return {
    off: str(raw.off) === "true",
    allow: new Set(strings(raw.allow).map(norm)),
    failOn: new Set(strings(raw.fail_on).filter((c) => CATEGORIES.includes(c))),
    per1000: str(String(raw.lists_of_three_per_1000 ?? "")) && Number.isFinite(n) && n >= 0 ? n : DEFAULT_LISTS_OF_THREE_PER_1000,
  };
}

// Every hit in `text`, as { category, start, text }, in draft order. Masks each hit out after it
// is found, so one span is never reported twice.
export function findTells(text) {
  let scan = maskCode(text);
  const hits = [];
  const take = (category, re) => {
    re.lastIndex = 0;
    const ranges = [];
    let m;
    while ((m = re.exec(scan))) {
      if (!m[0]) { re.lastIndex++; continue; }
      hits.push({ category, start: m.index, text: text.slice(m.index, m.index + m[0].length) });
      ranges.push({ start: m.index, end: m.index + m[0].length });
    }
    scan = maskRanges(scan, ranges);
  };
  // Longest phrases first, so "a testament to" is found before any word inside it could be.
  const byLength = (list) => [...list].sort((a, b) => b.length - a.length);
  for (const re of TELLS.contrast_pairs) take("contrast-pair", new RegExp(re.source, re.flags));
  for (const p of byLength(TELLS.ai_vocabulary)) take("ai-vocabulary", phraseRegex(p));
  for (const p of byLength(TELLS.overclaim)) take("overclaim", phraseRegex(p));
  // A list of three is only that when the list does not run on: the text before it must not end in
  // a comma, which would make it the tail of a longer list.
  for (const re of LISTS_OF_THREE) {
    re.lastIndex = 0;
    const ranges = [];
    let m;
    while ((m = re.exec(scan))) {
      if (/,[ \t]*$/.test(scan.slice(0, m.index))) continue;
      // The pattern cannot tell where the first item begins ("We want red, green, and blue" reads
      // "We want red" as an item), so it is trimmed to the second item's length: items in a list
      // are parallel, and the quote then shows the list rather than the clause before it.
      const [first, second] = m[0].split(",");
      const keep = second.trim().split(/[ \t]+/).length;
      const words = [...first.matchAll(new RegExp(WORD, "gu"))];
      const start = m.index + (words.length > keep ? words[words.length - keep].index : 0);
      hits.push({ category: "lists-of-three", start, text: text.slice(start, m.index + m[0].length) });
      ranges.push({ start: m.index, end: m.index + m[0].length });
    }
    scan = maskRanges(scan, ranges);
  }
  return hits.sort((a, b) => a.start - b.start);
}

export function run(spec, draft) {
  const settings = tellsSettings(spec);
  if (settings.off) return { station: name, status: "skip", findings: [], reason: "writing.tells.off is true" };

  const hits = findTells(draft.text).filter((h) => !settings.allow.has(norm(h.text)));
  const words = wordsOf(maskCode(draft.text)).length;
  const count = hits.filter((h) => h.category === "lists-of-three").length;
  const rate = words ? (count / words) * 1000 : 0;
  const listsOver = count >= LISTS_OF_THREE_MIN && rate > settings.per1000;

  const findings = [];
  for (const h of hits) {
    if (h.category === "lists-of-three" && !listsOver) continue;
    const rule = RULES[h.category];
    const severity = settings.failOn.has(h.category) ? "fail" : "warn";
    findings.push({ station: name, id: rule.id, severity, line: lineAt(draft.text, h.start), message: rule.message(truncate(h.text.replace(/\s+/g, " "), 80), { count, words, rate, per1000: settings.per1000 }), fix: rule.fix });
  }
  const failed = findings.some((f) => f.severity === "fail");
  return { station: name, status: failed ? "fail" : "pass", findings };
}
