// Test helpers shared by the judge tests: a copy of the writing-valid fixture with a short draft in
// it, the CLI, and a filled doctor verdict whose every evidence span really is in that draft.

import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { tempDir } from "./tmp.mjs";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = join(ROOT, "test", "fixtures", "writing-valid");

export const cli = (args, opts = {}) => spawnSync(process.execPath, [join(ROOT, "bin", "hyperspec.mjs"), ...args], { encoding: "utf8", ...opts });

export const DRAFT = [
  "# Claim",
  "",
  "A hyperspec is a contract a linter can check, not a prompt someone wrote once.",
  "",
  "# Evidence",
  "",
  "The nine tests run on every spec, and each one names what fails it. \"Progress\" is read from disk.",
  "",
  "# Close",
  "",
  "Read the schema section next.",
  "",
].join("\n");

// The claims ledger the fixture spec declares (writing.sources.ledger: essay.claims.jsonl), with two
// claims that are in DRAFT word for word; the persona judge hands their texts to the judge.
export const CLAIMS = [
  { text: "The nine tests run on every spec, and each one names what fails it.", source: "m1#s1" },
  { text: "\"Progress\" is read from disk.", source: "m1#s1" },
];
export const claimsJsonl = (claims = CLAIMS) => claims.map((c) => `${JSON.stringify(c)}\n`).join("");

// A fresh copy of the fixture holding draft.md (DRAFT unless `draft` is given), the claims ledger
// (CLAIMS) and an empty judge/ output folder. Returns the paths.
export function workspace({ draft = DRAFT, prefix = "hs-judge-" } = {}) {
  const dir = tempDir(prefix);
  cpSync(FIXTURE, dir, { recursive: true });
  writeFileSync(join(dir, "essay.claims.jsonl"), claimsJsonl());
  const draftPath = join(dir, "draft.md");
  writeFileSync(draftPath, draft);
  const out = join(dir, "judge");
  mkdirSync(out);
  return { dir, spec: join(dir, "spec.md"), draft: draftPath, out, ledger: join(dir, "runs.jsonl"), packet: join(out, "doctor.packet.json"), verdict: join(dir, "doctor.verdict.json") };
}

// A doctor verdict on DRAFT that passes every condition; `edit` changes it before it is written.
export function doctorVerdict(edit = (v) => v) {
  const v = {
    conditions: [
      { id: "r1", pass: true, evidence: "A hyperspec is a contract a linter can check", note: "the claim is restated in the first line" },
      { id: "r2", pass: true, evidence: "The nine tests run on every spec", note: "no claim outside the ledger" },
      { id: "r3", pass: true, evidence: "# Evidence The nine tests", note: "short, inside the form" },
      { id: "r4", pass: true, evidence: "not a prompt someone wrote once", note: "argues only c1" },
      { id: "r5", pass: true, evidence: "each one names what fails it", note: "no unsourced fact" },
    ],
    would_take_next_step: true,
    evidence: "Read the schema section next.",
  };
  return edit(v) ?? v;
}

export function writeVerdict(path, verdict) {
  writeFileSync(path, typeof verdict === "string" ? verdict : `${JSON.stringify(verdict, null, 2)}\n`);
}

export function ledgerLines(path) {
  let text = "";
  try { text = readFileSync(path, "utf8"); } catch { return []; }
  return text.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
}

export const prepare = (w, ...extra) => cli(["judge", "prepare", w.spec, "--draft", w.draft, "--out", w.out, ...extra]);
export const record = (w, ...extra) => cli(["judge", "record", w.packet, "--verdict", w.verdict, ...extra]);

// The same workspace, pointed at another station's files: its packet and key in judge/, and a
// verdict file of its own beside the spec, so prepare() and record() work for that station.
export function forStation(w, station) {
  return { ...w, packet: join(w.out, `${station}.packet.json`), key: join(w.out, `${station}.key.json`), verdict: join(w.dir, `${station}.verdict.json`) };
}

// A reader verdict on DRAFT that passes: read to the end, nothing lost, would take the next step.
export function readerVerdict(edit = (v) => v) {
  const v = {
    lost_at: [],
    stopped_at: null,
    would_take_next_step: true,
    next_step: "open the schema section",
  };
  return edit(v) ?? v;
}

// A persona verdict that passes: no break.
export function personaVerdict(edit = (v) => v) {
  const v = { breaks: [] };
  return edit(v) ?? v;
}

// ---- fiction: the story example ----------------------------------------------------------------

const STORY = join(ROOT, "examples", "writing");

// A short scene for the story example's two characters (ines, theo). The story's persona is
// character:theo, so Theo narrates: "I said" is Theo, and with exactly two speaking characters
// "she said" is Ines. Its dialogue lines, in order:
//   L1 line 5  "Scale first,"                                 ines ("Ines said"; the action beat after it names nobody)
//   L2 line 7  "Is it the big bowl or the small one, ..."     theo ("I asked": the narrator)
//   L3 line 9  "Big bowl,"                                    ines ("she said"; "Theo nodded" is an action beat)
//   L4 line 11 "Water at twenty-six degrees, then salt,"      ines ("said Ines")
//   -- line 13 "You're late."                                 left out: an action beat, no speech tag
//   L5 line 15 "Twenty minutes, then we fold it."             ines (one quote split by "Ines said,")
//   L6 line 17 "The bus was late again, ..."                  theo (curly quotes, "I said")
//   -- line 19 "Sold means sold,"                             left out: part of Ines's golden line
//   -- line 21 "Weigh it twice,"                              left out: "said Ines's mother" is a possessive, not Ines
export const STORY_DRAFT = [
  "# The Rye",
  "",
  "## 3:40",
  "",
  "\"Scale first,\" Ines said, and did not look up.",
  "",
  "\"Is it the big bowl or the small one, or does it matter?\" I asked.",
  "",
  "\"Big bowl,\" she said. Theo nodded and fetched it.",
  "",
  "\"Water at twenty-six degrees, then salt,\" said Ines.",
  "",
  "\"You're late.\" Ines did not look round.",
  "",
  "\"Twenty minutes,\" Ines said, \"then we fold it.\"",
  "",
  "\u201CThe bus was late again, kind of, I mean it was on time but I wasn't?\u201D I said.",
  "",
  "\"Sold means sold,\" she said.",
  "",
  "\"Weigh it twice,\" said Ines's mother, every morning of my first year.",
  "",
].join("\n");

// A fresh copy of the story example (story.hyperspec.md, story/, style-rules.md) with the draft
// written to scene.md and an empty judge/ output folder. Same shape as workspace().
export function storyWorkspace({ draft = STORY_DRAFT, prefix = "hs-judge-story-" } = {}) {
  const dir = tempDir(prefix);
  cpSync(join(STORY, "story.hyperspec.md"), join(dir, "story.hyperspec.md"));
  cpSync(join(STORY, "style-rules.md"), join(dir, "style-rules.md"));
  cpSync(join(STORY, "story"), join(dir, "story"), { recursive: true });
  const draftPath = join(dir, "scene.md");
  writeFileSync(draftPath, draft);
  const out = join(dir, "judge");
  mkdirSync(out);
  return { dir, spec: join(dir, "story.hyperspec.md"), draft: draftPath, out, ledger: join(dir, "story", "runs.jsonl"), packet: join(out, "doctor.packet.json"), verdict: join(dir, "doctor.verdict.json") };
}
