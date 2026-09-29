// Station "quotes" (hyperspec 0.6). Every double-quoted span in the draft of 4 or
// more words must appear in a `quote` or `story` segment of a marked material; a quote the draft
// attributes to someone by name must appear in a `quote` segment whose speaker is that someone.
// Pure and deterministic: no model call, no judgment about what counts as quoting, just the closed
// rules below.
//
// What counts as a quoted span: text between a pair of straight double quotes ("...") or a pair of
// curly ones (U+201C ... U+201D), paired left to right WITHIN one paragraph, so a stray quote mark
// can never pair with one in a later paragraph and swallow everything between. Fenced code and
// inline code are masked first (util.mjs's maskCode): a quote inside example syntax is not the
// writer quoting anyone. A span is checked only when it holds 4 or more words (dna.mjs's wordsOf,
// the one word definition every station shares); shorter spans are scare quotes and titles as
// often as they are quotations.
//
// Matching: both sides are normalized the same way (curly quotes and apostrophes to straight,
// whitespace runs to one space, ends trimmed; case is kept, so a changed capital is a changed
// quote). The span also drops trailing commas and periods before matching, because typographic
// convention puts a sentence's own comma or period inside the closing quote ("...at a time," he
// said) whether or not the speaker's sentence ended there. The normalized span must then appear as
// a substring of some quote or story segment's text, in any marked material of the spec.
//
// Attribution: a speaker is any `speaker` value on a quote segment. It is named in the draft
// when the sentence that holds the quote contains, case-insensitively and as whole
// words, EITHER the full value (split on anything that is not a letter, digit or apostrophe, so the
// slug "maria-lopez" reads as "maria lopez", its words joined in the draft by whitespace, hyphens or
// underscores) OR the value's first word alone ("Maria said" names maria-lopez; "Mariana" does not),
// with the quote itself blanked out (a name inside the quoted words is what was said, not who said it). A named speaker
// means the span must be in a quote segment with that speaker; matching only some other speaker's
// quote, or only a story, is `station-quotes-misattributed`. With no speaker named, any quote or
// story segment is enough. Sentences come from splitSegments(text, { by: "sentence" }), and every
// sentence the span overlaps is read, so a curly quote the splitter cuts in two still keeps its
// attribution.

import { splitSegments } from "../segments.mjs";
import { wordsOf } from "../dna.mjs";
import { lineAt, maskCode, markedSegments, truncate } from "./util.mjs";

export const name = "quotes";

const QUOTE_RE = /"([^"]*)"|“([^“”]*)”/g;
const WORD_CLASS = "\\p{L}\\p{N}'’";

function normalize(text) {
  return String(text)
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

// What a quoted span is matched on: normalized, then trailing commas and periods dropped.
// Typographic convention puts the writer's own comma or period inside the closing quote
// ("...at a time," he said) whether or not the speaker's sentence ended there, so keeping them
// would fail nearly every quotation used mid-sentence. "?" and "!" are kept: adding either changes
// what was said.
const matchKey = (inner) => normalize(inner).replace(/[.,]+$/, "").trim();

// Every quoted span in `text`, as { start, end, inner }: start/end bound the whole span including
// its quote marks, inner is the text between them. Paired per paragraph (see the header).
function quotedSpans(text) {
  const spans = [];
  for (const para of splitSegments(text, { by: "paragraph" })) {
    QUOTE_RE.lastIndex = 0;
    let m;
    while ((m = QUOTE_RE.exec(para.text))) {
      spans.push({ start: para.start + m.index, end: para.start + m.index + m[0].length, inner: m[1] ?? m[2] ?? "" });
    }
  }
  return spans;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// A speaker value as a whole-word, case-insensitive pattern matching its full words or its first
// word alone, or null when it has no words at all.
function speakerPattern(value) {
  const words = value.split(new RegExp(`[^${WORD_CLASS}]+`, "u")).filter(Boolean);
  if (!words.length) return null;
  const full = words.map(escapeRe).join("[\\s_-]+");
  const first = escapeRe(words[0]);
  return new RegExp(`(?<![${WORD_CLASS}])(?:${full}|${first})(?![${WORD_CLASS}])`, "iu");
}

// The text of every sentence the span overlaps, with the span itself blanked out.
function attributionContext(text, sentences, span) {
  const over = sentences.filter((s) => s.start < span.end && s.end > span.start);
  const from = over.length ? Math.min(span.start, over[0].start) : span.start;
  const to = over.length ? Math.max(span.end, over[over.length - 1].end) : span.end;
  return `${text.slice(from, span.start)} ${text.slice(span.end, to)}`;
}

export function run(spec, draft, ctx) {
  const text = maskCode(draft.text);
  const spans = quotedSpans(text).filter((s) => wordsOf(s.inner).length >= 4);
  if (!spans.length) return { station: name, status: "pass", findings: [] };

  // Every quote and story segment across every marked material, normalized once. A speaker's key
  // is its value lowercased; shownSpeaker keeps the first spelling the material wrote, for findings.
  const sources = [];
  const shownSpeaker = new Map();
  for (const { segments } of markedSegments(spec, ctx)) {
    for (const seg of segments) {
      if ((seg.label !== "quote" && seg.label !== "story") || typeof seg.text !== "string") continue;
      const speaker = seg.label === "quote" && typeof seg.speaker === "string" ? seg.speaker.trim() : "";
      const key = speaker.toLowerCase();
      if (key && !shownSpeaker.has(key)) shownSpeaker.set(key, speaker);
      sources.push({ label: seg.label, speaker: key, norm: normalize(seg.text) });
    }
  }
  const speakers = [...shownSpeaker.keys()]
    .map((key) => ({ key, re: speakerPattern(key) }))
    .filter((sp) => sp.re);

  const sentences = splitSegments(text, { by: "sentence" });
  const findings = [];
  for (const span of spans) {
    const key = matchKey(span.inner);
    if (!key) continue;
    const shown = truncate(span.inner.replace(/\s+/g, " "), 80);
    const line = lineAt(draft.text, span.start);
    const hits = sources.filter((s) => s.norm.includes(key));
    if (!hits.length) {
      findings.push({
        station: name,
        id: "station-quotes-unmatched",
        severity: "fail",
        line,
        message: `quoted span "${shown}" does not appear in any quote or story segment of a marked material`,
        fix: "Quote the material verbatim, or drop the quotation marks and paraphrase.",
      });
      continue;
    }
    const around = attributionContext(text, sentences, span);
    const named = speakers.filter((sp) => sp.re.test(around)).map((sp) => sp.key);
    if (named.length && !hits.some((h) => h.label === "quote" && named.includes(h.speaker))) {
      const who = named.map((k) => shownSpeaker.get(k) ?? k).join(", ");
      findings.push({
        station: name,
        id: "station-quotes-misattributed",
        severity: "fail",
        line,
        message: `quoted span "${shown}" is attributed to ${who} in its sentence, but no quote segment by ${who} contains it`,
        fix: `Attribute the quote to whoever the material records saying it, or quote what ${who} actually said.`,
      });
    }
  }

  return { station: name, status: findings.length ? "fail" : "pass", findings };
}
