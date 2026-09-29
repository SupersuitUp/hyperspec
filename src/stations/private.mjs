// Station "private" (hyperspec 0.6, build 6a task 3). No run of 8 or more consecutive words from
// any `private` segment of a marked material may appear in the draft. Pure and deterministic: a
// word-level match over normalized text, no model call and no judgment about what would count as
// a paraphrase (a paraphrase is not caught, by design; a verbatim run is).
//
// Normalization, applied the same way to the draft and to every private segment: split into words
// with dna.mjs's wordsOf (already lowercased, the one word definition every station shares), then
// drop apostrophes from each word, so case, punctuation and whitespace never decide a match and
// "don't", "don’t" and "dont" are one word. Fenced code and inline code are masked out of the
// draft first (util.mjs's maskCode), like every other station that reads prose.
//
// A private segment of 8 or more words fails when any 8-word window of it appears in the draft. One
// of 4 to 7 words is checked as a whole: all of its words, in order, anywhere in the draft. One
// under 4 words is not checked at all (ruling R6): two or three words ("Yes, Tuesday.") match
// ordinary prose, so checking them would fail drafts that leak nothing. Skipping silently would
// hide that a private passage went unchecked, so the station reports how many it skipped as ONE
// warning, station-private-short-skipped, carrying the count and never the text (the text is
// the private part). Each leak is reported once, as the longest run the segment and the draft share from where
// the match starts, so a whole pasted paragraph is one finding rather than one per window; a
// segment that leaks in two separate places is two findings. Every finding names the material, the
// segment and the leaked run (normalized words, at most 80 characters), with the draft line where
// the run starts.

import { wordsOf } from "../dna.mjs";
import { lineAt, maskCode, markedSegments, truncate } from "./util.mjs";

export const name = "private";

const WINDOW = 8;
const MIN_CHECKED = 4;
// dna.mjs's WORD_RE, repeated here only because wordsOf returns words without their offsets and a
// finding needs the line a leak starts on; the segment side goes through wordsOf itself.
const WORD_RE = /[\p{L}\p{N}'’]+/gu;
const stripApostrophes = (w) => w.replace(/['’]/g, "");

// The draft's words, normalized, each with the offset it starts at (for the finding's line).
function draftWords(text) {
  const out = [];
  WORD_RE.lastIndex = 0;
  let m;
  while ((m = WORD_RE.exec(text))) {
    const w = stripApostrophes(m[0].toLowerCase());
    if (w) out.push({ w, at: m.index });
  }
  return out;
}

const segmentWords = (text) => wordsOf(text).map(stripApostrophes).filter(Boolean);

// The first index in `words` (draft word objects) where `seq` (strings) appears contiguously, or -1.
function findSequence(words, seq) {
  outer: for (let i = 0; i + seq.length <= words.length; i++) {
    for (let k = 0; k < seq.length; k++) if (words[i + k].w !== seq[k]) continue outer;
    return i;
  }
  return -1;
}

export function run(spec, draft, ctx) {
  const words = draftWords(maskCode(draft.text));
  // First draft position of every 8-word window, so each private window is one map lookup.
  const windows = new Map();
  for (let i = 0; i + WINDOW <= words.length; i++) {
    const key = words.slice(i, i + WINDOW).map((x) => x.w).join(" ");
    if (!windows.has(key)) windows.set(key, i);
  }

  const findings = [];
  let skippedShort = 0;
  const leak = (material, segId, run, at) => findings.push({
    station: name,
    id: "station-private-leak",
    severity: "fail",
    line: lineAt(draft.text, at),
    message: `material ${material}, segment ${segId} is private, and the draft repeats it: "${truncate(run.join(" "), 80)}"`,
    fix: "Rewrite the passage in words that do not repeat the private material, or relabel the segment if it is not private.",
  });

  for (const { material, segments } of markedSegments(spec, ctx)) {
    for (const seg of segments) {
      if (seg.label !== "private" || typeof seg.text !== "string") continue;
      const segId = typeof seg.id === "string" && seg.id.trim() ? seg.id.trim() : "(no id)";
      const tokens = segmentWords(seg.text);
      if (!tokens.length) continue;
      if (tokens.length < MIN_CHECKED) { skippedShort++; continue; }

      if (tokens.length < WINDOW) {
        const at = findSequence(words, tokens);
        if (at !== -1) leak(material, segId, tokens, words[at].at);
        continue;
      }

      let i = 0;
      while (i + WINDOW <= tokens.length) {
        const start = windows.get(tokens.slice(i, i + WINDOW).join(" "));
        if (start === undefined) { i++; continue; }
        // Extend the shared run as far as the segment and the draft keep agreeing.
        let len = WINDOW;
        while (i + len < tokens.length && start + len < words.length && tokens[i + len] === words[start + len].w) len++;
        leak(material, segId, tokens.slice(i, i + len), words[start].at);
        i += len;
      }
    }
  }

  if (skippedShort) {
    findings.push({
      station: name,
      id: "station-private-short-skipped",
      severity: "warn",
      message: `${skippedShort} private segment${skippedShort === 1 ? " is" : "s are"} under ${MIN_CHECKED} words and ${skippedShort === 1 ? "was" : "were"} not checked`,
      fix: `Check the draft against ${skippedShort === 1 ? "it" : "them"} by hand, or widen the private segment to ${MIN_CHECKED} or more words.`,
    });
  }

  return { station: name, status: findings.some((x) => x.severity === "fail") ? "fail" : "pass", findings };
}
