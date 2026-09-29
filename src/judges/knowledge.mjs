// Knowledge (fiction only): a judge reads the draft against each character's knowledge timeline (what
// they know, and by which point of the story) and reports every place a character shows they know
// something before they could: a leak. hyperspec writes the packet, checks every quoted span
// against the draft (src/judge.mjs's evidence rule) and derives the status: pass when there is no
// leak.

import { str } from "../placeholder.mjs";

export const name = "knowledge";

export const KNOWLEDGE_INSTRUCTIONS = [
  "Read inputs.draft in order, against each character's knowledge timeline in inputs.characters: each entry says what the character knows (knows) by a point in the story (by).",
  "Report every leak, a place where a character says, thinks or acts on something before the point their timeline gives them it, as an entry in leaks: the character's id; the passage as evidence, copied verbatim from inputs.draft, at least three whole words; and knows_too_early, what they know too early.",
  "If no character knows anything too early, leaks is an empty list.",
  "Answer only in the verdict shape given in verdict_schema.",
].join(" ");

const isObject = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const nonEmpty = (v) => typeof v === "string" && v.trim().length > 0;

// The characters that carry a knowledge timeline, each with its complete { by, knows } entries.
function timelines(spec) {
  const list = Array.isArray(spec.data?.writing?.characters) ? spec.data.writing.characters : [];
  return list.filter((c) => isObject(c) && str(c.id)).map((c) => ({
    raw: c,
    id: str(c.id),
    name: str(c.name),
    knowledge: (Array.isArray(c.knowledge) ? c.knowledge : []).filter((k) => isObject(k) && str(k.by) && str(k.knows)).map((k) => ({ by: str(k.by), knows: str(k.knows) })),
  })).filter((c) => c.knowledge.length);
}

// The rubric: the distinct check.rubric texts of the characters with a timeline, in order, one per line.
function rubricOf(chars) {
  return [...new Set(chars.map((c) => str(c.raw.check?.rubric)).filter(Boolean))].join("\n");
}

// null when knowledge applies: fiction, at least one character with a knowledge timeline, and a
// rubric on one of them.
export function skipReason(spec) {
  if (str(spec.data?.fiction) !== "true") return "the spec is not fiction; knowledge applies only with fiction: true";
  const chars = timelines(spec);
  if (!chars.length) return "no character in writing.characters has a knowledge timeline";
  if (!rubricOf(chars)) return "no character's check has a rubric";
  return null;
}

// The packet's rubric, inputs (each timeline and the draft) and verdict schema. No answer key.
export function packet(spec, draft) {
  const chars = timelines(spec);
  return {
    rubric: rubricOf(chars),
    inputs: {
      characters: chars.map((c) => ({ id: c.id, ...(c.name ? { name: c.name } : {}), knowledge: c.knowledge })),
      draft: draft.text,
    },
    verdict_schema: {
      type: "object",
      required: ["leaks"],
      properties: {
        leaks: {
          type: "array",
          description: "every place a character knows something too early; empty when there is none",
          items: {
            type: "object",
            required: ["character", "evidence", "knows_too_early"],
            properties: {
              character: { enum: chars.map((c) => c.id) },
              evidence: { type: "string", description: "the passage, copied verbatim from the draft, at least three words" },
              knows_too_early: { type: "string", description: "what the character knows before their timeline gives it to them" },
            },
          },
        },
      },
    },
    key: null,
  };
}

// A character as the verdict wrote it, resolved to an id: an id or a name, trimmed, any case.
function characterId(value, characters) {
  if (typeof value !== "string" || !value.trim()) return null;
  const v = value.trim().toLowerCase();
  const c = characters.find((ch) => ch.id.toLowerCase() === v || (ch.name && ch.name.toLowerCase() === v));
  return c ? c.id : null;
}

// Every problem with the verdict, as findings; every evidence span must be in the draft.
export function validate(verdict, pkt, t) {
  if (!isObject(verdict)) return [t.shape("the verdict is not a JSON object", "Write one object: { leaks }.")];
  if (!Array.isArray(verdict.leaks)) return [t.shape("leaks is missing or not a list", "Give leaks: one { character, evidence, knows_too_early } per leak, or [] when there is none.")];
  const known = pkt.inputs.characters.map((c) => c.id);
  const out = [];
  verdict.leaks.forEach((l, i) => {
    const at = `leaks[${i}]`;
    if (!isObject(l)) { out.push(t.shape(`${at} is not an object`, "Write each leak as { character, evidence, knows_too_early }.")); return; }
    if (typeof l.character !== "string") out.push(t.shape(`${at}.character is not a string`, "Give the character's id."));
    else if (!characterId(l.character, pkt.inputs.characters)) out.push(t.finding("judge-knowledge-character-unknown", `${at}.character "${l.character}" is not a character with a knowledge timeline in the packet`, `Name one of: ${known.join(", ")}.`));
    if (!nonEmpty(l.knows_too_early)) out.push(t.shape(`${at}.knows_too_early is missing or empty`, "Say what the character knows too early."));
    out.push(...t.evidence(l.evidence, `${at}.evidence`));
  });
  return out;
}

// Passes when there is no leak; each leak is a failure at its passage's line.
export function derive(verdict, pkt, t) {
  const findings = verdict.leaks.map((l) => {
    const id = characterId(l.character, pkt.inputs.characters);
    return t.finding("judge-knowledge-leak", `${id} knows too early: ${l.knows_too_early.trim()}`, `Cut or move what ${id} could not know yet, to the point their knowledge timeline gives it to them.`, t.lineOf(l.evidence));
  });
  return { status: findings.length ? "fail" : "pass", findings };
}
