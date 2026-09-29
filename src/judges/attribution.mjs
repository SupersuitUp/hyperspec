// Attribution (fiction only): a blind test of whether the characters' voices can be told apart. The
// packet holds every dialogue line of the draft whose speaker hyperspec can determine mechanically,
// with the speaker and all the narration around it removed, plus each character's speech block,
// golden and rejected lines. The judge names a speaker for every line; record compares the answers
// with the true speakers, which live only in the answer key (attribution.key.json, rebuilt at record
// time, never read back), and the station passes when at least 80 percent are right.
//
// Dialogue lines are the draft's double-quoted spans, straight ("...") or curly (U+201C ...
// U+201D), paired within one paragraph with code masked first: the quotes station's own
// quotedSpans (src/stations/quotes.mjs), so both stations read the same spans. A span with no
// letter or digit in it is not a line. Lines are numbered L1..Ln in draft order, counting only the
// lines that are attributed.
//
// The true speaker comes from the paragraph holding the line, with every quoted span in that
// paragraph blanked out (what a character says is not who says it): if exactly one character is
// named there, by id or by name, as whole words and case-insensitively, that character spoke the
// line. A paragraph that names no character, or two or more, cannot be attributed mechanically: the
// line is left out, and the packet carries only how many were (excluded), never their text. A
// character named there who has no speech block leaves the line out too, since the judge is never
// shown that character.

import { str } from "../placeholder.mjs";
import { quotedSpans } from "../stations/quotes.mjs";
import { lineAt, maskCode, maskRanges } from "../stations/util.mjs";

export const name = "attribution";

// Pass at 80 percent or more, compared as whole numbers: correct / included >= 4 / 5.
export const PASS_NUMERATOR = 4;
export const PASS_DENOMINATOR = 5;

export const ATTRIBUTION_INSTRUCTIONS = [
  "Each entry in inputs.lines is one line of dialogue from the draft, with its speaker and the narration around it removed.",
  "Using only how each character in inputs.characters speaks (their speech block, golden_lines and rejected_lines), name who says each line.",
  "Answer in lines: one { id, speaker } per line id, each id exactly once, where speaker is a character id from inputs.characters.",
  "Answer only in the verdict shape given in verdict_schema.",
].join(" ");

const isObject = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const texts = (v) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
const WORD = "\\p{L}\\p{N}";
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// A character's id or name as a whole-word, case-insensitive pattern: its words (split on anything
// that is not a letter or digit, so the id "old-man" reads as "old man") joined in the text by
// whitespace, hyphens or underscores. An apostrophe ends a word, so "Ines's" names ines. null when
// the value has no words.
export function namePattern(value) {
  const words = String(value).split(new RegExp(`[^${WORD}]+`, "u")).filter(Boolean);
  if (!words.length) return null;
  return new RegExp(`(?<![${WORD}])${words.map(escapeRe).join("[\\s_-]+")}(?![${WORD}])`, "iu");
}

// Every character entry with an id, as { id, name, patterns, speech }: speech is the character's
// speech block when it is an object with at least one entry, else null.
function castOf(spec) {
  const list = Array.isArray(spec.data?.writing?.characters) ? spec.data.writing.characters : [];
  return list.filter((c) => isObject(c) && str(c.id)).map((c) => {
    const id = str(c.id);
    const nm = str(c.name);
    const speech = isObject(c.speech) && (texts(c.speech.uses).length || texts(c.speech.never).length || str(c.speech.rhythm)) ? c.speech : null;
    return { id, name: nm, patterns: [namePattern(id), nm ? namePattern(nm) : null].filter(Boolean), speech, raw: c };
  });
}

// The draft's dialogue lines split into the attributed and the left out: { lines: [{ id, text,
// speaker, line }], excluded: [{ line, text, named }] }. cast is castOf(spec); a line is attributed
// only to a character with speech.
export function dialogueLines(draftText, cast) {
  const masked = maskCode(draftText);
  const spans = quotedSpans(masked).filter((s) => new RegExp(`[${WORD}]`, "u").test(s.inner));
  const byPara = new Map();
  for (const s of quotedSpans(masked)) {
    const key = s.para.start;
    if (!byPara.has(key)) byPara.set(key, []);
    byPara.get(key).push(s);
  }
  const lines = [];
  const excluded = [];
  for (const s of spans) {
    const siblings = byPara.get(s.para.start);
    const around = maskRanges(masked, siblings).slice(s.para.start, s.para.end);
    const named = cast.filter((c) => c.patterns.some((re) => re.test(around))).map((c) => c.id);
    const text = s.inner.replace(/\s+/g, " ").trim();
    const line = lineAt(draftText, s.start);
    const speaker = named.length === 1 ? cast.find((c) => c.id === named[0]) : null;
    if (speaker?.speech) lines.push({ id: `L${lines.length + 1}`, text, speaker: speaker.id, line });
    else excluded.push({ line, text, named });
  }
  return { lines, excluded };
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
  const { lines, excluded } = dialogueLines(draft.text, cast);
  if (!lines.length) {
    return { skip: excluded.length
      ? `none of the draft's ${excluded.length} dialogue line${excluded.length === 1 ? "" : "s"} can be attributed mechanically: each paragraph holding one names no character, or more than one`
      : "the draft has no dialogue line (a double-quoted span)" };
  }
  return { speaking, rubric, lines, excluded };
}

// null when attribution applies: fiction, at least two characters with a speech block, a rubric on
// one of them, and at least one line whose speaker the draft names mechanically.
export function skipReason(spec, draft) {
  return plan(spec, draft).skip ?? null;
}

// The packet (the lines' text only, and how many lines were left out) and the key (every line's
// true speaker and draft line, and the lines left out with what was named around them).
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
        golden_lines: texts(c.raw.golden_lines),
        rejected_lines: texts(c.raw.rejected_lines),
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

// Accuracy against the rebuilt key: pass at 80 percent or more. Every misattributed line is a
// warning at its draft line; falling under 80 percent is the failure. summary reports the accuracy
// as a fraction and a percentage (rounded down, so a failing score never prints as 80%).
export function derive(verdict, pkt, t, key) {
  const said = new Map(verdict.lines.map((l) => [l.id, speakerId(l.speaker, pkt.inputs.characters)]));
  const total = key.lines.length;
  const findings = [];
  let correct = 0;
  for (const l of key.lines) {
    const got = said.get(l.id);
    if (got === l.speaker) { correct += 1; continue; }
    findings.push({ ...t.finding("judge-attribution-miss", `${l.id} was attributed to ${got}; the narration around it names ${l.speaker}`, `Make this line sound like ${l.speaker} (their speech block and golden lines), and unlike ${got}.`, l.line), severity: "warn" });
  }
  const pct = Math.floor((correct * 100) / total);
  const fraction = `${correct}/${total} (${pct}%)`;
  const pass = correct * PASS_DENOMINATOR >= total * PASS_NUMERATOR;
  if (!pass) {
    findings.unshift(t.finding("judge-attribution-accuracy", `the judge attributed ${fraction} of the dialogue lines correctly, under the 80% that tells the voices apart`, "Make the voices more distinct, each line in its character's speech (see the misattributed lines), then prepare and judge again."));
  }
  const left = key.excluded.length;
  const summary = `accuracy ${fraction}, passing at 80%${left ? `; ${left} dialogue line${left === 1 ? "" : "s"} left out (no single character named around ${left === 1 ? "it" : "them"})` : ""}`;
  return { status: pass ? "pass" : "fail", findings, summary };
}
