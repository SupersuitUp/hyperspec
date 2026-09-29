// Attribution (fiction only): a blind test of whether the characters' voices can be told apart. The
// packet holds the draft's dialogue lines whose speaker hyperspec can determine mechanically, with
// the speaker and all the narration around them removed, plus each character's speech block,
// golden and rejected lines. The judge names a speaker for every line; record compares the answers
// with the true speakers, which live only in the answer key (attribution.key.json, rebuilt at record
// time, never read back). The station passes when accuracy averaged per speaker is 80 percent or
// more, so naming one speaker for every line cannot pass.
//
// Dialogue lines. The draft's double-quoted spans, straight ("...") or curly (U+201C ... U+201D),
// paired within one paragraph with code masked first: the quotes station's own quotedSpans
// (src/stations/quotes.mjs). A span with no letter or digit is not a line. A quote split by a
// speech tag ("Twenty minutes," Ines said, "then we fold it.") is one line: the first part ends in
// a comma, and the narration between the parts is a speech tag ending in a comma. That narration is
// read as a tag in both directions, after the part it follows and before the part it precedes, and
// it may hold only one speech verb, so a second speaker in it ("Ines said, and Theo said,", "Ines
// said to Theo, who said,") makes the merged line a conflict, left out.
// Lines keep draft order and are numbered L1..Ln over the lines that are attributed.
//
// The true speaker comes ONLY from a speech tag: narration in the same paragraph that
// sits right against the quote, directly after its closing mark (`"...," Ines said`, `"...," said
// Ines`) or directly before its opening mark, ending in a comma or colon (`Ines said, "..."`). A
// tag is a subject next to a verb from SPEECH_VERBS; the inverted form, verb before name ("said
// Ines"), only with INVERTED_VERBS, since "Ines told Theo" names Theo as the one spoken to. The
// subject can be:
//   - a character's id or name, whole words, any case ("Ines said", "said Ines"); a possessive
//     ("Ines's") is not a name, and an action beat ("Theo nodded") is not a tag;
//   - "I", when persona.identity is character:<id>: the narrator speaks;
//   - "she" or "he" (lower case after a quote, either case before one), only when exactly two
//     characters have speech blocks and one of them is the narrator: the other one speaks.
// Anything else leaves the line out, counted in the packet (excluded) and listed in the key with its
// reason. The key must never be wrong, so every doubt excludes: no tag, a tag whose subject cannot
// be resolved to a character with a speech block, and any line whose tags yield two different
// candidate speakers, by any of the rules above.
//
// A line of three or more words that contains, or is contained in, any character's golden or
// rejected line (compared as lower-cased words) is left out too: shown beside the
// speech lines, it would give its speaker away.

import { str } from "../placeholder.mjs";
import { quotedSpans } from "../stations/quotes.mjs";
import { lineAt, maskCode } from "../stations/util.mjs";

export const name = "attribution";

// Pass at 80 percent or more, compared exactly: mean per-speaker accuracy >= 4 / 5.
export const PASS_NUMERATOR = 4;
export const PASS_DENOMINATOR = 5;

// The verbs that make narration a speech tag, one closed list. Everything else ("nodded", "laughed",
// "did not look up") is an action beat and names nobody.
export const SPEECH_VERBS = Object.freeze([
  "said", "says", "asked", "asks", "told", "tells", "replied", "replies", "called", "calls",
  "whispered", "whispers", "shouted", "shouts", "answered", "answers", "added", "adds", "went on", "goes on",
]);

// The speech verbs that also make an inverted tag, verb before name ("said Ines"). The
// rest (told, asked, called, answered, added) take a person as their object as often as they tag
// speech ("Ines told Theo"), so for them only the name-then-verb form counts: an inversion there
// would credit the person spoken to.
export const INVERTED_VERBS = Object.freeze(["said", "says", "replied", "replies", "whispered", "whispers", "shouted", "shouts", "went on", "goes on"]);

// Why a dialogue line was left out, as the key records it.
export const EXCLUDED = Object.freeze({
  noTag: "no speech tag",
  unknown: "the speech tag names no character with a speech block",
  conflict: "speech tags name more than one speaker",
  repeats: "repeats a golden or rejected line",
});

export const ATTRIBUTION_INSTRUCTIONS = [
  "Each entry in inputs.lines is one line of dialogue from the draft, with its speaker and the narration around it removed.",
  "Using only how each character in inputs.characters speaks (their speech block, golden_lines and rejected_lines), name who says each line.",
  "Judge from the packet's inputs alone: do not open the spec, the draft or any other file the packet names.",
  "Answer in lines: one { id, speaker } per line id, each id exactly once, where speaker is a character id from inputs.characters.",
  "Answer only in the verdict shape given in verdict_schema.",
].join(" ");

const isObject = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const texts = (v) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
const WORD = "\\p{L}\\p{N}";
const HAS_WORD = new RegExp(`[${WORD}]`, "u");
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const verbAlternation = (verbs) => `(?:${verbs.map((v) => v.split(" ").map(escapeRe).join("\\s+")).join("|")})`;
const VERB = verbAlternation(SPEECH_VERBS);
const INVERTED = verbAlternation(INVERTED_VERBS);
// A second speaker, as tagged() cannot resolve it: two speech verbs in the narration joining the
// parts of a split quote mean two tags, whoever the second names ("who said").
const SECOND_SPEAKER = Symbol("second speaker");
// A name or verb ends at a non-word character, and an apostrophe is not an end: "Ines's" is not "Ines".
const END = `(?![${WORD}'’])`;
const START = `(?<![${WORD}'’])`;
const UNKNOWN = Symbol("unknown speaker");
const SPEECH_VERB_ANYWHERE = new RegExp(`${START}${VERB}${END}`, "giu");
const speechVerbCount = (narration) => (narration.match(SPEECH_VERB_ANYWHERE) ?? []).length;

// A character's id or name as the pattern source of its words (split on anything that is not a
// letter or digit, so the id "old-man" reads as "old man"), joined in the text by whitespace,
// hyphens or underscores; null when the value has no words.
function nameSource(value) {
  const words = String(value).split(new RegExp(`[^${WORD}]+`, "u")).filter(Boolean);
  return words.length ? words.map(escapeRe).join("[\\s_-]+") : null;
}

// The tag matchers for one cast: each { after, before, speaker }, where after is anchored at the
// start of the narration following a quote and before at the end of the narration preceding one;
// speaker is a character id, or UNKNOWN when the subject cannot be resolved (a first-person tag with
// no narrator, a pronoun outside a two-hander). cast: [{ id, name, speech }]; narrator: an id or null.
function tagMatchers(cast, narrator) {
  const speaking = cast.filter((c) => c.speech);
  const speakerOr = (id) => (id && speaking.some((c) => c.id === id) ? id : UNKNOWN);
  const narratorId = narrator && cast.some((c) => c.id === narrator) ? narrator : null;
  const other = narratorId && speaking.length === 2 && speaking.some((c) => c.id === narratorId) ? speaking.find((c) => c.id !== narratorId).id : null;
  const out = [];
  for (const c of cast) {
    for (const src of [nameSource(c.id), c.name ? nameSource(c.name) : null].filter(Boolean)) {
      const speaker = speakerOr(c.id);
      out.push({ after: new RegExp(`^\\s*(?:${src}\\s+${VERB}|${INVERTED}\\s+${src})${END}`, "iu"), before: new RegExp(`${START}(?:${src}\\s+${VERB}|${INVERTED}\\s+${src})\\s*[,:]\\s*$`, "iu"), speaker });
    }
  }
  out.push({ after: new RegExp(`^\\s*I\\s+${VERB}${END}`, "u"), before: new RegExp(`${START}I\\s+${VERB}\\s*[,:]\\s*$`, "u"), speaker: speakerOr(narratorId) });
  out.push({ after: new RegExp(`^\\s*(?:she|he)\\s+${VERB}${END}`, "u"), before: new RegExp(`${START}(?:[Ss]he|[Hh]e)\\s+${VERB}\\s*[,:]\\s*$`, "u"), speaker: speakerOr(other) });
  return out;
}

// The speakers a stretch of narration tags: `side` is "after" (it follows a quote) or "before" (it
// precedes one).
function tagged(matchers, narration, side) {
  return matchers.filter((m) => m[side].test(narration)).map((m) => m.speaker);
}

// A text as its lower-cased words, space-joined, for comparing a line with the speech lines.
const wordsKey = (text) => (String(text).toLowerCase().replace(/[‘’]/g, "'").match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu) ?? []).join(" ");

// Whether a line repeats a golden or rejected line: three or more words, contained in one or
// containing one, compared as words.
function repeatsSpeechLine(text, speechKeys) {
  const key = wordsKey(text);
  if (key.split(" ").filter(Boolean).length < 3) return false;
  const k = ` ${key} `;
  return speechKeys.some((s) => s && (` ${s} `.includes(k) || k.includes(` ${s} `)));
}

// The draft's dialogue lines split into the attributed and the left out: { lines: [{ id, text,
// speaker, line }], excluded: [{ line, text, reason }] }. cast: [{ id, name, speech, golden,
// rejected }] (speech null for a character with no speech block); narrator: the persona's character
// id, or null.
export function dialogueLines(draftText, cast, { narrator = null } = {}) {
  const masked = maskCode(draftText);
  const matchers = tagMatchers(cast, narrator);
  const speechKeys = cast.flatMap((c) => [...(c.golden ?? []), ...(c.rejected ?? [])]).map(wordsKey);

  // Every quoted span once, grouped by paragraph in draft order; spans with no word are dropped
  // here, after they have bounded their neighbours' narration.
  const paragraphs = [];
  for (const s of quotedSpans(masked)) {
    const last = paragraphs.at(-1);
    if (last && last.start === s.para.start) last.spans.push(s);
    else paragraphs.push({ start: s.para.start, end: s.para.end, spans: [s] });
  }

  const lines = [];
  const excluded = [];
  for (const para of paragraphs) {
    const { spans } = para;
    const narrationBefore = (i) => masked.slice(i === 0 ? para.start : spans[i - 1].end, spans[i].start);
    const narrationAfter = (i) => masked.slice(spans[i].end, i + 1 < spans.length ? spans[i + 1].start : para.end);
    for (let i = 0; i < spans.length; i++) {
      if (!HAS_WORD.test(spans[i].inner)) continue;
      // Merge a quote split by a speech tag: this part ends in a comma, and the narration up to the
      // next part is a tag that ends in a comma.
      let j = i;
      while (j + 1 < spans.length && /,\s*$/.test(spans[j].inner) && HAS_WORD.test(spans[j + 1].inner)
        && /,\s*$/.test(narrationAfter(j)) && tagged(matchers, narrationAfter(j), "after").length) j += 1;
      const speakers = new Set([...tagged(matchers, narrationBefore(i), "before")]);
      for (let k = i; k <= j; k++) for (const s of tagged(matchers, narrationAfter(k), "after")) speakers.add(s);
      // The narration joining two merged parts also sits before the later part, so it is read as a
      // tag for that part too; and one speech verb is all a joining tag may hold.
      for (let k = i + 1; k <= j; k++) {
        const joining = narrationBefore(k);
        for (const s of tagged(matchers, joining, "before")) speakers.add(s);
        if (speechVerbCount(joining) > 1) speakers.add(SECOND_SPEAKER);
      }
      const text = spans.slice(i, j + 1).map((s) => s.inner.replace(/\s+/g, " ").trim()).join(" ");
      const line = lineAt(draftText, spans[i].start);
      let reason = null;
      if (repeatsSpeechLine(text, speechKeys)) reason = EXCLUDED.repeats;
      else if (!speakers.size) reason = EXCLUDED.noTag;
      else if (speakers.size > 1) reason = EXCLUDED.conflict;
      else if ([...speakers][0] === UNKNOWN) reason = EXCLUDED.unknown;
      if (reason) excluded.push({ line, text, reason });
      else lines.push({ id: `L${lines.length + 1}`, text, speaker: [...speakers][0], line });
      i = j;
    }
  }
  return { lines, excluded };
}

// Every character entry with an id, as { id, name, speech, golden, rejected, raw }: speech is the
// character's speech block when it is an object with at least one entry, else null.
function castOf(spec) {
  const list = Array.isArray(spec.data?.writing?.characters) ? spec.data.writing.characters : [];
  return list.filter((c) => isObject(c) && str(c.id)).map((c) => {
    const speech = isObject(c.speech) && (texts(c.speech.uses).length || texts(c.speech.never).length || str(c.speech.rhythm)) ? c.speech : null;
    return { id: str(c.id), name: str(c.name), speech, golden: texts(c.golden_lines), rejected: texts(c.rejected_lines), raw: c };
  });
}

// The narrator: persona.identity character:<id>, or null.
function narratorOf(spec) {
  const m = /^character:(.+)$/.exec(str(spec.data?.writing?.persona?.identity));
  return m ? m[1].trim() : null;
}

// "2 with no speech tag, 1 repeating a golden or rejected line": how many lines were left out, why.
function excludedBreakdown(excluded) {
  const counts = new Map();
  for (const e of excluded) counts.set(e.reason, (counts.get(e.reason) ?? 0) + 1);
  const said = { [EXCLUDED.noTag]: "with no speech tag", [EXCLUDED.unknown]: "whose tag names no character with a speech block", [EXCLUDED.conflict]: "whose tags name more than one speaker", [EXCLUDED.repeats]: "repeating a golden or rejected line" };
  return [...counts].map(([reason, n]) => `${n} ${said[reason]}`).join(", ");
}

// The rubric: the distinct check.rubric texts of the characters in the test, in their order, one per
// line (a story whose characters share one rubric gets that rubric verbatim), or "" when none has one.
function rubricOf(chars) {
  return [...new Set(chars.map((c) => str(c.raw.check?.rubric)).filter(Boolean))].join("\n");
}

function plan(spec, draft) {
  if (str(spec.data?.fiction) !== "true") return { skip: "the spec is not fiction; attribution applies only with fiction: true" };
  const cast = castOf(spec);
  if (!cast.length) return { skip: "writing.characters has no character" };
  const speaking = cast.filter((c) => c.speech);
  if (speaking.length < 2) return { skip: `attribution needs at least two characters with a speech block; writing.characters has ${speaking.length}` };
  const rubric = rubricOf(speaking);
  if (!rubric) return { skip: "no character's check has a rubric" };
  const { lines, excluded } = dialogueLines(draft.text, cast, { narrator: narratorOf(spec) });
  const total = lines.length + excluded.length;
  if (!total) return { skip: "the draft has no dialogue line (a double-quoted span)" };
  if (!lines.length) return { skip: `none of the draft's ${total} dialogue line${total === 1 ? "" : "s"} can be attributed mechanically (${excludedBreakdown(excluded)})` };
  const speakers = [...new Set(lines.map((l) => l.speaker))];
  if (speakers.length < 2) {
    return { skip: `attribution needs attributable lines from at least two speakers; all ${lines.length} of the draft's attributable dialogue line${lines.length === 1 ? " is" : "s are"} ${speakers[0]}'s${excluded.length ? ` (${excluded.length} left out: ${excludedBreakdown(excluded)})` : ""}` };
  }
  return { speaking, rubric, lines, excluded };
}

// null when attribution applies: fiction, at least two characters with a speech block, a rubric on
// one of them, and attributable lines from at least two speakers.
export function skipReason(spec, draft) {
  return plan(spec, draft).skip ?? null;
}

// The packet (the lines' text only, and how many lines were left out) and the key (every line's
// true speaker and draft line, and the lines left out with why).
export function packet(spec, draft) {
  const p = plan(spec, draft);
  const ids = p.lines.map((l) => l.id);
  const charIds = p.speaking.map((c) => c.id);
  return {
    rubric: p.rubric,
    inputs: {
      characters: p.speaking.map((c) => ({
        id: c.id,
        ...(c.name ? { name: c.name } : {}),
        speech: { uses: texts(c.speech.uses), never: texts(c.speech.never), rhythm: str(c.speech.rhythm) },
        golden_lines: c.golden,
        rejected_lines: c.rejected,
      })),
      lines: p.lines.map((l) => ({ id: l.id, text: l.text })),
      excluded: p.excluded.length,
    },
    verdict_schema: {
      type: "object",
      required: ["lines"],
      properties: {
        lines: {
          type: "array",
          description: "one entry per line id, each exactly once",
          items: {
            type: "object",
            required: ["id", "speaker"],
            properties: { id: { enum: ids }, speaker: { enum: charIds } },
          },
        },
      },
    },
    key: {
      station: name,
      lines: p.lines.map((l) => ({ id: l.id, speaker: l.speaker, line: l.line })),
      excluded: p.excluded,
    },
  };
}

// A speaker as the verdict wrote it, resolved to a character id: an id or a name, trimmed, any case.
function speakerId(value, characters) {
  if (typeof value !== "string" || !value.trim()) return null;
  const v = value.trim().toLowerCase();
  const c = characters.find((ch) => ch.id.toLowerCase() === v || (ch.name && ch.name.toLowerCase() === v));
  return c ? c.id : null;
}

// Every problem with the verdict, as findings: every line id exactly once, each with a known speaker.
export function validate(verdict, pkt, t) {
  if (!isObject(verdict)) return [t.shape("the verdict is not a JSON object", "Write one object: { lines }.")];
  if (!Array.isArray(verdict.lines)) return [t.shape("lines is missing or not a list", "Give lines: one { id, speaker } per line id.")];
  const expected = pkt.inputs.lines.map((l) => l.id);
  const known = pkt.inputs.characters.map((c) => c.id);
  const out = [];
  const seen = new Map();
  verdict.lines.forEach((l, i) => {
    const at = `lines[${i}]`;
    if (!isObject(l)) { out.push(t.shape(`${at} is not an object`, "Each line is { id, speaker }.")); return; }
    if (typeof l.id !== "string") out.push(t.shape(`${at}.id is not a string`, "Give the line's id, as the packet lists it."));
    else seen.set(l.id, (seen.get(l.id) ?? 0) + 1);
    if (typeof l.speaker !== "string") out.push(t.shape(`${at}.speaker is not a string`, "Give the speaker's character id."));
    else if (!speakerId(l.speaker, pkt.inputs.characters)) out.push(t.finding("judge-attribution-speaker-unknown", `${at}.speaker "${l.speaker}" is not a character in the packet`, `Name one of: ${known.join(", ")}.`));
  });
  for (const id of expected) if (!seen.has(id)) out.push(t.finding("judge-attribution-line-missing", `line ${id} has no entry in lines`, "Attribute every line the packet lists, each exactly once."));
  for (const [id, n] of seen) {
    if (!expected.includes(id)) out.push(t.finding("judge-attribution-line-unknown", `lines names ${id}, which is not a line in the packet`, `Attribute only the packet's lines: ${expected.join(", ")}.`));
    else if (n > 1) out.push(t.finding("judge-attribution-line-duplicate", `line ${id} appears ${n} times in lines`, "Attribute each line exactly once."));
  }
  return out;
}

const pctFloor = (num, den) => Number((BigInt(num) * 100n) / BigInt(den));

// Accuracy against the rebuilt key, per speaker: each speaker's share of their own
// lines named correctly, averaged over the speakers with lines. Pass when that mean is 80 percent or
// more, compared exactly. Every misattributed line is a warning at its draft line; a mean under 80
// percent is the failure. summary reports every speaker's accuracy as a fraction and a percentage,
// and the mean (percentages round down, so a failing mean never prints as 80%).
export function derive(verdict, pkt, t, key) {
  const said = new Map(verdict.lines.map((l) => [l.id, speakerId(l.speaker, pkt.inputs.characters)]));
  const order = pkt.inputs.characters.map((c) => c.id).filter((id) => key.lines.some((l) => l.speaker === id));
  const per = new Map(order.map((id) => [id, { right: 0, total: 0 }]));
  const findings = [];
  for (const l of key.lines) {
    const got = said.get(l.id);
    const s = per.get(l.speaker);
    s.total += 1;
    if (got === l.speaker) { s.right += 1; continue; }
    findings.push({ ...t.finding("judge-attribution-miss", `${l.id} was attributed to ${got}; its speech tag names ${l.speaker}`, `Make this line sound like ${l.speaker} (their speech block and golden lines), and unlike ${got}.`, l.line), severity: "warn" });
  }
  // mean = (sum over speakers of right_s / total_s) / k, kept as one exact fraction num / den.
  const totals = order.map((id) => BigInt(per.get(id).total));
  const product = totals.reduce((a, b) => a * b, 1n);
  const num = order.reduce((acc, id) => acc + BigInt(per.get(id).right) * (product / BigInt(per.get(id).total)), 0n);
  const den = product * BigInt(order.length);
  const pass = num * BigInt(PASS_DENOMINATOR) >= den * BigInt(PASS_NUMERATOR);
  const mean = Number((num * 100n) / den);
  const perText = order.map((id) => { const s = per.get(id); return `${id} ${s.right}/${s.total} (${pctFloor(s.right, s.total)}%)`; }).join(", ");
  if (!pass) {
    findings.unshift(t.finding("judge-attribution-accuracy", `the judge's accuracy averaged over speakers is ${mean}% (${perText}), under the 80% that tells the voices apart`, "Make the voices more distinct, each line in its character's speech (see the misattributed lines), then prepare and judge again."));
  }
  const left = key.excluded.length;
  const summary = `accuracy per speaker: ${perText}; mean ${mean}%, passing at 80%${left ? `; ${left} dialogue line${left === 1 ? "" : "s"} left out (${excludedBreakdown(key.excluded)})` : ""}`;
  return { status: pass ? "pass" : "fail", findings, summary };
}
