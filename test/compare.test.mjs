import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startRecipe } from "../src/writer.mjs";
import { regenerate } from "../src/regenerate.mjs";
import { readRecipe } from "../src/recipe.mjs";
import { compare } from "../src/compare.mjs";

// Same tmp-project convention as writer/regenerate tests: a .git folder so storeRoot's walk-up
// finds a root without --store or HYPERSPEC_STORE.
function project() {
  const dir = mkdtempSync(join(tmpdir(), "hs-compare-"));
  mkdirSync(join(dir, ".git"));
  return dir;
}

function writeSpec(dir, { ledger } = {}) {
  const path = join(dir, "essay.hyperspec.md");
  writeFileSync(
    path,
    `---
hyperspec: "0.1"
title: An essay
decisions:
  - id: audience
    state: decided
    value: gary-sheng
    source: interview
    author: gary-sheng
    chosen_by: human
requirements:
  - id: length
    text: short
    fails_when: too long
    check:
      rubric: word count under 1200
    source: design doc
    author: agent:claude
${ledger ? `improvement:\n  ledger: ${ledger}\n` : ""}---
# Body
`,
  );
  return path;
}

// A single-input, single-stage parent, with the stage's output set to an exact string so the test
// controls its byte length directly (the fake doctor below scores by length).
function buildParent(dir, { content = "0123456789", noteContent = "original note" } = {}) {
  const specPath = writeSpec(dir, { ledger: "runs.jsonl" });
  mkdirSync(join(dir, "materials"));
  writeFileSync(join(dir, "materials", "note.txt"), noteContent);
  const outputPath = join(dir, "essay.md");
  const r = startRecipe({ output: outputPath, factory: { name: "compose-a-piece", version: "0.3.0" }, spec: specPath, clicker: "gary-sheng" });
  r.input("note", join(dir, "materials", "note.txt"));
  r.stage({ id: "compose", reads: ["input:note"], output: content, verdict: { station: "compose-ok", pass: true, note: "" } });
  const { path } = r.finish({ approver: "gary-sheng" });
  return { recipePath: path, outputPath, specPath };
}

// A pass-through runner: it re-emits the bytes of the first (only) read, so the rerun stage's
// output is exactly the swapped input's bytes — letting a test control the child's output length
// by choosing the swapped file's content length.
function writeRunner(dir) {
  const path = join(dir, "runner.sh");
  writeFileSync(
    path,
    `input=$(cat)
first=$(printf '%s' "$input" | sed 's/.*"reads":\\[{"ref":"[^"]*","sha256":"[^"]*","path":"\\([^"]*\\)".*/\\1/')
cat "$first"
`,
  );
  return path;
}

// The fake doctor: scores by byte length of the output file named on stdin.
function writeDoctor(dir) {
  const path = join(dir, "doctor.sh");
  writeFileSync(
    path,
    `input=$(cat)
output=$(printf '%s' "$input" | sed 's/.*"output":"\\([^"]*\\)".*/\\1/')
n=$(wc -c < "$output" | tr -d ' ')
printf '{"score":%s}\\n' "$n"
`,
  );
  return path;
}

const sq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
const doctorCmd = (dir) => `/bin/sh ${sq(writeDoctor(dir))}`;

// Regenerates the parent by swapping the "note" input for a file of the given content, via the
// pass-through runner, producing a child whose output is exactly that content.
function buildChild(dir, { recipePath }, content) {
  const runner = writeRunner(dir);
  writeFileSync(join(dir, "materials", "swapped.txt"), content);
  const out = join(dir, "essay-v2.md");
  const res = regenerate(recipePath, {
    out,
    clicker: "gary-sheng",
    change: { swapInput: { name: "note", path: join(dir, "materials", "swapped.txt") } },
    run: `/bin/sh ${sq(runner)}`,
  });
  assert.equal(res.ok, true, res.error);
  assert.equal(res.pending, false);
  return res.childRecipe;
}

test("an improved child: not regressed, positive delta, no suspect", () => {
  const dir = project();
  const parent = buildParent(dir, { content: "0123456789" }); // 10 bytes
  const childRecipe = buildChild(dir, parent, "x".repeat(33)); // 33 bytes

  const res = compare(childRecipe, { doctor: doctorCmd(dir) });

  assert.equal(res.ok, true, res.error);
  assert.equal(res.parent.score, 10);
  assert.equal(res.child.score, 33);
  assert.equal(res.delta, 23);
  assert.equal(res.regressed, false);
  assert.equal(res.suspect, null);
  assert.equal(res.specChanged, false);
  assert.deepEqual(res.warnings, []);
});

test("a regressed child: regressed flag set, suspect names the change", () => {
  const dir = project();
  const parent = buildParent(dir, { content: "0123456789" }); // 10 bytes
  const childRecipe = buildChild(dir, parent, "ab"); // 2 bytes

  const res = compare(childRecipe, { doctor: doctorCmd(dir) });

  assert.equal(res.ok, true, res.error);
  assert.equal(res.parent.score, 10);
  assert.equal(res.child.score, 2);
  assert.equal(res.delta, -8);
  assert.equal(res.regressed, true);
  const child = readRecipe(childRecipe).data;
  assert.equal(res.suspect, child.change);
  assert.ok(res.suspect.includes("swapped input note"), res.suspect);
});

test("ledger: one compare line is appended when the spec declares improvement.ledger", () => {
  const dir = project();
  const parent = buildParent(dir, { content: "0123456789" });
  const childRecipe = buildChild(dir, parent, "ab");

  const res = compare(childRecipe, { doctor: doctorCmd(dir) });

  assert.equal(res.ok, true, res.error);
  assert.ok(res.ledger, "ledger path expected");
  const lines = readFileSync(res.ledger, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(lines.length, 1);
  const line = lines[0];
  assert.equal(line.kind, "compare");
  assert.equal(line.regressed, true);
  assert.deepEqual(line.scores, { parent: 10, child: 2 });
  assert.equal(typeof line.at, "string");
  assert.ok(line.change.includes("swapped input note"));
  assert.equal(typeof line.parent, "string");
  assert.equal(typeof line.child, "string");
});

test("no ledger line, and ledger stays null, when the spec declares no improvement.ledger", () => {
  const dir = project();
  const specPath = writeSpec(dir); // no ledger declared
  mkdirSync(join(dir, "materials"));
  writeFileSync(join(dir, "materials", "note.txt"), "original note");
  const outputPath = join(dir, "essay.md");
  const r = startRecipe({ output: outputPath, factory: { name: "compose-a-piece", version: "0.3.0" }, spec: specPath, clicker: "gary-sheng" });
  r.input("note", join(dir, "materials", "note.txt"));
  r.stage({ id: "compose", reads: ["input:note"], output: "0123456789", verdict: { station: "compose-ok", pass: true, note: "" } });
  const { path: recipePath } = r.finish({ approver: "gary-sheng" });
  const childRecipe = buildChild(dir, { recipePath }, "ab");

  const res = compare(childRecipe, { doctor: doctorCmd(dir) });

  assert.equal(res.ok, true, res.error);
  assert.equal(res.ledger, null);
});

test("specChanged is true when the spec graded against differs from the parent's recorded spec", () => {
  const dir = project();
  const parent = buildParent(dir, { content: "0123456789" });
  const childRecipe = buildChild(dir, parent, "abcdefghij"); // 10 bytes, same length -> delta 0
  // A different (but still valid) spec file to grade against, in place of the recorded one.
  const otherSpecPath = writeSpec(dir, { ledger: "other-runs.jsonl" });

  const res = compare(childRecipe, { doctor: doctorCmd(dir), spec: otherSpecPath });

  assert.equal(res.ok, true, res.error);
  assert.equal(res.specChanged, true);
});

test("specChanged is false when grading against the same spec the parent recorded", () => {
  const dir = project();
  const parent = buildParent(dir, { content: "0123456789" });
  const childRecipe = buildChild(dir, parent, "abcdefghij");

  const res = compare(childRecipe, { doctor: doctorCmd(dir) });

  assert.equal(res.ok, true, res.error);
  assert.equal(res.specChanged, false);
});

test("a doctor whose last stdout line is not JSON is a usage error naming which output", () => {
  const dir = project();
  const parent = buildParent(dir, { content: "0123456789" });
  const childRecipe = buildChild(dir, parent, "ab");

  const res = compare(childRecipe, { doctor: "cat >/dev/null; echo not-json-at-all" });

  assert.equal(res.ok, false);
  assert.equal(res.usage, true);
  assert.match(res.error, /^parent: /);
  assert.match(res.error, /not JSON/);
});

test("a doctor that exits non-zero is a usage error", () => {
  const dir = project();
  const parent = buildParent(dir, { content: "0123456789" });
  const childRecipe = buildChild(dir, parent, "ab");

  const res = compare(childRecipe, { doctor: "cat >/dev/null; exit 5" });

  assert.equal(res.ok, false);
  assert.equal(res.usage, true);
  assert.match(res.error, /exited 5/);
});

test("parent defaults to the child's recorded parent.path when no parent is given", () => {
  const dir = project();
  const parent = buildParent(dir, { content: "0123456789" });
  const childRecipe = buildChild(dir, parent, "ab");

  const withDefault = compare(childRecipe, { doctor: doctorCmd(dir) });
  const withExplicit = compare(childRecipe, { doctor: doctorCmd(dir), parent: parent.recipePath });

  assert.equal(withDefault.ok, true, withDefault.error);
  assert.equal(withDefault.parent.recipe, withExplicit.parent.recipe);
  assert.equal(withDefault.parent.score, withExplicit.parent.score);
});

test("a child with no recorded parent and none given is a usage error", () => {
  const dir = project();
  const specPath = writeSpec(dir);
  mkdirSync(join(dir, "materials"));
  writeFileSync(join(dir, "materials", "note.txt"), "original note");
  const outputPath = join(dir, "essay.md");
  const r = startRecipe({ output: outputPath, factory: { name: "compose-a-piece", version: "0.3.0" }, spec: specPath, clicker: "gary-sheng" });
  r.input("note", join(dir, "materials", "note.txt"));
  r.stage({ id: "compose", reads: ["input:note"], output: "hello", verdict: { station: "compose-ok", pass: true, note: "" } });
  const { path: recipePath } = r.finish({ approver: "gary-sheng" }); // recipe.parent is null: never regenerated

  const res = compare(recipePath, { doctor: doctorCmd(dir) });

  assert.equal(res.ok, false);
  assert.equal(res.usage, true);
  assert.match(res.error, /no parent/);
});

test("a warning is surfaced, and the compare still runs, when the parent recipe changed since the child was made", () => {
  const dir = project();
  const parent = buildParent(dir, { content: "0123456789" });
  const childRecipe = buildChild(dir, parent, "ab");
  // Re-approve the parent after the child was made: rewrites the parent recipe file's bytes
  // (a real, legitimate edit), so its sha256 no longer matches what the child recorded.
  const parentData = readRecipe(parent.recipePath).data;
  parentData.approver = "someone-else";
  writeFileSync(parent.recipePath, `${JSON.stringify(parentData, null, 2)}\n`);

  const res = compare(childRecipe, { doctor: doctorCmd(dir) });

  assert.equal(res.ok, true, res.error);
  assert.deepEqual(res.warnings, ["parent recipe changed since the child was made"]);
});

test("a missing output file is a non-usage error", () => {
  const dir = project();
  const parent = buildParent(dir, { content: "0123456789" });
  const childRecipe = buildChild(dir, parent, "ab");
  unlinkSync(parent.outputPath); // the recipe still names it; the file itself is gone

  const res = compare(childRecipe, { doctor: doctorCmd(dir) });

  assert.equal(res.ok, false);
  assert.equal(res.usage, undefined);
  assert.match(res.error, /cannot read the parent's output/);
});

test("a missing doctor option is a usage error", () => {
  const dir = project();
  const parent = buildParent(dir, { content: "0123456789" });
  const childRecipe = buildChild(dir, parent, "ab");

  const res = compare(childRecipe, {});

  assert.equal(res.ok, false);
  assert.equal(res.usage, true);
  assert.match(res.error, /doctor/);
});
