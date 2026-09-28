import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { blobPath } from "../src/blobs.mjs";
import { readRecipe, writeRecipe } from "../src/recipe.mjs";
import { approve, startRecipe } from "../src/writer.mjs";
import { reproduce } from "../src/reproduce.mjs";

// A tmp project dir with a .git folder, so storeRoot's walk-up finds a root without --store or
// HYPERSPEC_STORE. Same convention as test/writer.test.mjs.
function project() {
  const dir = mkdtempSync(join(tmpdir(), "hs-reproduce-"));
  mkdirSync(join(dir, ".git"));
  return dir;
}

function writeSpec(dir, name = "essay.hyperspec.md") {
  const path = join(dir, name);
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
---
# Body
`,
  );
  return path;
}

// Builds a complete, approved, two-stage recipe (one input, two stages) and returns everything
// a test might need to tamper with: the recipe path, the project dir, the stages, and the
// recipe's own directory (== dir here, since output lives at the project root).
function buildRecipe(dir) {
  const specPath = writeSpec(dir);
  mkdirSync(join(dir, "materials"));
  writeFileSync(join(dir, "materials", "call.md"), "the call transcript");
  const outputPath = join(dir, "essay.md");

  const r = startRecipe({
    output: outputPath,
    factory: { name: "compose-a-piece", version: "0.3.0" },
    spec: specPath,
    clicker: "gary-sheng",
  });

  const transcript = r.input("transcript-1", join(dir, "materials", "call.md"));

  const outline = r.stage({
    id: "outline",
    reads: ["input:transcript-1", "spec"],
    model: { name: "claude-x", temperature: 0.7 },
    output: "the outline",
    verdict: { station: "outline-has-claim-chain", pass: true, note: "" },
  });
  const draft = r.stage({
    id: "draft",
    reads: ["stage:outline", "spec"],
    model: { name: "claude-x", temperature: 0.2 },
    output: "the final text",
    verdict: { station: "draft-reads-clean", pass: true, note: "" },
  });

  const { path } = r.finish({ approver: null });
  approve(path, "gary-sheng");

  return { dir, outputPath, recipePath: path, transcript, outline, draft };
}

// ---- clean reproduction ----

test("reproduce() returns ok:true, firstMismatch:null for a clean, complete recipe", () => {
  const dir = project();
  const { recipePath } = buildRecipe(dir);

  const result = reproduce(recipePath);

  assert.equal(result.ok, true);
  assert.equal(result.firstMismatch, null);
  assert.equal(result.restored, false);
  assert.ok(result.steps.length > 0);
  assert.ok(result.steps.every((s) => s.ok === true));
  assert.deepEqual(
    result.steps.map((s) => s.ref),
    ["input:transcript-1", "spec", "stage:outline", "stage:outline#key", "stage:draft", "stage:draft#key", "output:blob", "output:file"],
  );
});

// ---- tampered stage blob ----

test("reproduce() names a tampered stage blob as the first mismatch", () => {
  const dir = project();
  const { recipePath, outline } = buildRecipe(dir);

  // Corrupt the outline stage's blob in place.
  writeFileSync(blobPath(dir, outline.output.sha256), "tampered bytes");

  const result = reproduce(recipePath);

  assert.equal(result.ok, false);
  assert.equal(result.firstMismatch, "stage:outline");
  const step = result.steps.find((s) => s.ref === "stage:outline");
  assert.equal(step.ok, false);
  assert.ok(step.why, "tampered stage blob step should carry a why");
});

// ---- missing blob ----

test("reproduce() names a missing blob", () => {
  const dir = project();
  const { recipePath, transcript } = buildRecipe(dir);

  unlinkSync(blobPath(dir, transcript.sha256));

  const result = reproduce(recipePath);

  assert.equal(result.ok, false);
  assert.equal(result.firstMismatch, "input:transcript-1");
  const step = result.steps.find((s) => s.ref === "input:transcript-1");
  assert.equal(step.ok, false);
  assert.match(step.why, /missing/);
});

// ---- edited output file + restore ----

test("reproduce() fails on an edited output file, and --restore restores it byte-for-byte", () => {
  const dir = project();
  const { recipePath, outputPath } = buildRecipe(dir);

  writeFileSync(outputPath, "someone typed over the finished essay");

  const failed = reproduce(recipePath);
  assert.equal(failed.ok, false);
  assert.equal(failed.firstMismatch, "output:file");
  assert.equal(failed.restored, false);
  const fileStep = failed.steps.find((s) => s.ref === "output:file");
  assert.equal(fileStep.ok, false);
  assert.ok(fileStep.why);
  // A plain (non-restoring) run never touches the file on disk.
  assert.equal(readFileSync(outputPath, "utf8"), "someone typed over the finished essay");

  const restored = reproduce(recipePath, { restore: true });
  assert.equal(restored.ok, true);
  assert.equal(restored.firstMismatch, null);
  assert.equal(restored.restored, true);
  assert.equal(restored.steps.find((s) => s.ref === "output:file").ok, true);
  // Byte-for-byte back to the last stage's recorded output.
  assert.equal(readFileSync(outputPath, "utf8"), "the final text");
});

// ---- restore never fires against an unverified blob ----

test("reproduce() never restores from a blob that itself does not verify", () => {
  const dir = project();
  const { recipePath, outputPath, draft } = buildRecipe(dir);

  // Corrupt the very blob the output file would be restored from, and edit the file too.
  writeFileSync(blobPath(dir, draft.output.sha256), "tampered");
  writeFileSync(outputPath, "edited on disk too");

  const result = reproduce(recipePath, { restore: true });

  assert.equal(result.ok, false);
  assert.equal(result.restored, false);
  // The file on disk is left exactly as the test edited it — never overwritten with tampered bytes.
  assert.equal(readFileSync(outputPath, "utf8"), "edited on disk too");
});

// ---- pending stage (R2) ----

test("reproduce() reports a pending stage as a failing step, why 'stage is pending'", () => {
  const dir = project();
  const { recipePath } = buildRecipe(dir);

  const { data } = readRecipe(recipePath);
  data.stages[0].output = null;
  writeRecipe(recipePath, data);

  const result = reproduce(recipePath);

  assert.equal(result.ok, false);
  assert.equal(result.firstMismatch, "stage:outline");
  const step = result.steps.find((s) => s.ref === "stage:outline");
  assert.equal(step.ok, false);
  assert.equal(step.why, "stage is pending");
});

// ---- unreadable / invalid recipe file ----

test("reproduce() reports ok:false with an error and no steps when the recipe is unreadable", () => {
  const dir = project();
  const result = reproduce(join(dir, "does-not-exist.recipe.json"));
  assert.deepEqual(result, { ok: false, error: `cannot read ${join(dir, "does-not-exist.recipe.json")}`, steps: [], firstMismatch: null });
});

test("reproduce() reports ok:false with an error when the recipe file is not valid JSON", () => {
  const dir = project();
  const badPath = join(dir, "bad.recipe.json");
  writeFileSync(badPath, "{ not json");
  const result = reproduce(badPath);
  assert.equal(result.ok, false);
  assert.match(result.error, /invalid JSON/);
  assert.deepEqual(result.steps, []);
  assert.equal(result.firstMismatch, null);
});

// ---- store resolution: explicit --store honored ----

test("reproduce() honors an explicit store root", () => {
  const dir = project();
  const { recipePath } = buildRecipe(dir);

  // Without an explicit store, storeRoot would walk up to dir's own .git and find it fine —
  // so instead prove the explicit store IS the one consulted by pointing it at a directory with
  // no blobs at all, which must make every blob check fail.
  const emptyStore = mkdtempSync(join(tmpdir(), "hs-empty-store-"));
  const result = reproduce(recipePath, { store: emptyStore });

  assert.equal(result.ok, false);
  const step = result.steps.find((s) => s.ref === "stage:outline");
  assert.equal(step.ok, false);
});
