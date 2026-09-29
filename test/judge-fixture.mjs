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

// A fresh copy of the fixture holding draft.md (DRAFT unless `draft` is given) and an empty
// judge/ output folder. Returns the paths.
export function workspace({ draft = DRAFT, prefix = "hs-judge-" } = {}) {
  const dir = tempDir(prefix);
  cpSync(FIXTURE, dir, { recursive: true });
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
      { id: "r3", pass: true, evidence: "# Claim", note: "short, inside the form" },
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
