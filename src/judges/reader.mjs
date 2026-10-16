// The reader: a judge reads the draft as the person the audience block describes, knowing only
// what they know, and reports every place it got lost, where (if anywhere) it stopped reading, and
// what it would do next. hyperspec writes the packet, checks every quoted span against the draft
// (src/judge.mjs's evidence rule) and derives the status: pass when the reader read to the end and
// would take the next step now. A place the reader got lost is a warning, not a failure: it is where
// to look first, and a reader who got lost and kept going still arrived.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { str } from "../placeholder.mjs";

export const name = "reader";

export const READER_INSTRUCTIONS = [
  "Read inputs.draft as the reader inputs.audience describes: where and how they read it, knowing only what they know and believing what they believe now.",
  "When inputs.reader_folder is present, it is that reader in full, in files: READER.md (who they are) first, then their points of view on the piece's topics and the passages in their own words those cite. Be that person: where a point of view says they push back, push back.",
  "For every place you got lost (a term you do not know, a step that does not follow, a sentence you had to read twice), add an entry to lost_at: the passage as evidence, copied verbatim from inputs.draft, at least three whole words, and why.",
  "If you would stop reading before the end, set stopped_at to the passage where you stopped, quoted the same way, and why; if you would read to the end, set stopped_at to null.",
  "Then say in next_step what you would do next, in your own words, and whether you would do it now (would_take_next_step).",
  "Answer only in the verdict shape given in verdict_schema.",
].join(" ");

const isObject = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const texts = (v) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
const nonEmpty = (v) => typeof v === "string" && v.trim().length > 0;

// THE READER FOLDER (0.15): writing.audience.reader_folder, relative to the spec, a folder of reader
// material: READER.md first, then every other .md under it in path order. Which files are in it is
// the caller's choice (a host copies in the points of view a piece touches and the excerpts they
// cite); the judge reads all of it. { path, files: [{ path, text }] }, files null when unreadable;
// null when no folder is declared.
function mdFiles(dir, prefix = "") {
  const out = [];
  for (const n of readdirSync(dir).sort()) {
    if (n.startsWith(".")) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...mdFiles(p, `${prefix}${n}/`));
    else if (n.endsWith(".md")) out.push(`${prefix}${n}`);
  }
  return out;
}
export function readReaderFolder(spec) {
  const path = str(spec.data?.writing?.audience?.reader_folder);
  if (!path) return null;
  const abs = resolve(spec.dir || ".", path);
  try {
    const names = mdFiles(abs);
    if (!names.includes("READER.md")) return { path, files: null };
    const ordered = ["READER.md", ...names.filter((n) => n !== "READER.md")];
    return { path, files: ordered.map((n) => ({ path: n, text: readFileSync(join(abs, n), "utf8").replace(/^\uFEFF/, "") })) };
  } catch { return { path, files: null }; }
}

const folderSkip = (path) => `writing.audience.reader_folder "${path}" cannot be read or has no READER.md (run \`hyperspec lint\` for details)`;

// null when the reader applies: it needs a written audience block whose check names a rubric, and a
// reader folder that is either not declared or readable.
export function skipReason(spec) {
  const audience = spec.data?.writing?.audience;
  if (!isObject(audience)) return "writing.audience is not written (deferred)";
  if (!str(audience.check?.rubric)) return "writing.audience.check has no rubric";
  return sourceSkip(spec);
}

// The skip reason when the station skips because its reader folder cannot be read, else null:
// record calls such a packet stale rather than altered.
export function sourceSkip(spec) {
  const folder = readReaderFolder(spec);
  return folder && !folder.files ? folderSkip(folder.path) : null;
}

// The files besides the spec and the draft this station's inputs come from, or null.
export function inputSources(spec) {
  const folder = readReaderFolder(spec);
  return folder ? `the reader folder (${folder.path})` : null;
}

const passageSchema = (what) => ({
  type: "object",
  required: ["evidence", "why"],
  properties: {
    evidence: { type: "string", description: `the passage ${what}, copied verbatim from the draft, at least three words` },
    why: { type: "string" },
  },
});

// The packet's rubric (audience.check.rubric, verbatim), inputs (the audience block's reader fields
// and the draft) and verdict schema. No answer key.
export function packet(spec, draft) {
  const a = spec.data.writing.audience;
  const folder = readReaderFolder(spec);
  return {
    rubric: a.check.rubric,
    inputs: {
      audience: {
        who: str(a.who),
        funnel_now: str(a.funnel_now),
        knows: texts(a.knows),
        terms: texts(a.terms),
        believes_now: str(a.believes_now),
        wants: str(a.wants),
        reads_on: str(a.reads_on),
        reader: str(a.reader),
      },
      ...(folder ? { reader_folder: folder.files } : {}),
      draft: draft.text,
    },
    verdict_schema: {
      type: "object",
      required: ["lost_at", "stopped_at", "would_take_next_step", "next_step"],
      properties: {
        lost_at: { type: "array", description: "every place the reader got lost; empty when nowhere", items: passageSchema("where the reader got lost") },
        stopped_at: { anyOf: [{ type: "null" }, passageSchema("where the reader stopped reading")], description: "null when the reader read to the end" },
        would_take_next_step: { type: "boolean", description: "whether the reader would take next_step now" },
        next_step: { type: "string", description: "what the reader would do next, in their own words" },
      },
    },
    key: null,
  };
}

// The problems with one quoted passage ({ evidence, why }) at `at`.
function passageProblems(p, at, t) {
  if (!isObject(p)) return [t.shape(`${at} is not an object`, "Write it as { evidence, why }.")];
  const out = [];
  if (!nonEmpty(p.why)) out.push(t.shape(`${at}.why is missing or empty`, "Say why, in a sentence."));
  out.push(...t.evidence(p.evidence, `${at}.evidence`));
  return out;
}

// Every problem with the verdict, as findings; every evidence span must be in the draft.
export function validate(verdict, pkt, t) {
  if (!isObject(verdict)) return [t.shape("the verdict is not a JSON object", "Write one object: { lost_at, stopped_at, would_take_next_step, next_step }.")];
  const out = [];
  if (!Array.isArray(verdict.lost_at)) out.push(t.shape("lost_at is missing or not a list", "Give lost_at: one { evidence, why } per place the reader got lost, or [] when there is none."));
  else verdict.lost_at.forEach((p, i) => out.push(...passageProblems(p, `lost_at[${i}]`, t)));
  if (!Object.hasOwn(verdict, "stopped_at")) out.push(t.shape("stopped_at is missing", "Set stopped_at to { evidence, why } where the reader stopped, or to null when they read to the end."));
  else if (verdict.stopped_at !== null) out.push(...passageProblems(verdict.stopped_at, "stopped_at", t));
  if (typeof verdict.would_take_next_step !== "boolean") out.push(t.shape("would_take_next_step is missing or not true or false", "Set would_take_next_step to the JSON boolean true or false."));
  if (!nonEmpty(verdict.next_step)) out.push(t.shape("next_step is missing or empty", "Say what the reader would do next, in their words."));
  return out;
}

// Passes when the reader read to the end and would take the next step now; every place it got lost
// is a warning at the passage's line.
export function derive(verdict, pkt, t) {
  const findings = verdict.lost_at.map((p) => ({
    ...t.finding("judge-reader-lost", `the reader got lost here: ${p.why.trim()}`, "Define, cut or reorder what lost this reader, for what they know now.", t.lineOf(p.evidence)),
    severity: "warn",
  }));
  if (verdict.stopped_at) {
    findings.push(t.finding("judge-reader-stopped", `the reader stopped reading here: ${verdict.stopped_at.why.trim()}`, "Revise the passage the reader stopped at so this reader keeps going, then prepare and judge again.", t.lineOf(verdict.stopped_at.evidence)));
  }
  if (!verdict.would_take_next_step) {
    findings.push(t.finding("judge-reader-next-step", `the reader would not take the next step now (their next step: ${verdict.next_step.trim()})`, "Revise the draft so this reader wants to act on it now, then prepare and judge again."));
  }
  const status = verdict.stopped_at || !verdict.would_take_next_step ? "fail" : "pass";
  return { status, findings };
}
