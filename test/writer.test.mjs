import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tempDir } from "./tmp.mjs";
import { join, resolve } from "node:path";
import { sha256 } from "../src/hash.mjs";
import { blobPath } from "../src/blobs.mjs";
import { checkRecipe, readRecipe } from "../src/recipe.mjs";
import { approve, startRecipe } from "../src/writer.mjs";
import { approve as approveSelfRef, startRecipe as startRecipeSelfRef } from "@supersuit/hyperspec/recipe";

// A tmp project dir with a .git folder, so storeRoot's walk-up finds a root without --store or
// HYPERSPEC_STORE.
function project() {
  const dir = tempDir("hs-writer-");
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

// ---- input() / stage() basics ----

test("input() stores the file's bytes as a blob and records name/path/sha256/order", () => {
  const dir = project();
  const specPath = writeSpec(dir);
  writeFileSync(join(dir, "call.md"), "the call transcript");
  const r = startRecipe({ output: join(dir, "essay.md"), factory: { name: "compose-a-piece", version: "0.3.0" }, spec: specPath, clicker: "gary-sheng" });
  const entry = r.input("transcript-1", join(dir, "call.md"));
  assert.equal(entry.name, "transcript-1");
  assert.equal(entry.order, 1);
  assert.equal(entry.sha256, sha256("the call transcript"));
  assert.ok(existsSync(blobPath(dir, entry.sha256)));
});

test("input() assigns order by call order, starting at 1", () => {
  const dir = project();
  const specPath = writeSpec(dir);
  writeFileSync(join(dir, "a.md"), "a");
  writeFileSync(join(dir, "b.md"), "b");
  const r = startRecipe({ output: join(dir, "essay.md"), factory: { name: "f", version: "1" }, spec: specPath, clicker: "gary-sheng" });
  const first = r.input("first", join(dir, "a.md"));
  const second = r.input("second", join(dir, "b.md"));
  assert.equal(first.order, 1);
  assert.equal(second.order, 2);
});

test("input() throws on a duplicate name", () => {
  const dir = project();
  const specPath = writeSpec(dir);
  writeFileSync(join(dir, "a.md"), "a");
  const r = startRecipe({ output: join(dir, "essay.md"), factory: { name: "f", version: "1" }, spec: specPath, clicker: "gary-sheng" });
  r.input("transcript-1", join(dir, "a.md"));
  assert.throws(() => r.input("transcript-1", join(dir, "a.md")), /duplicate input name/);
});

test("stage() throws on an unknown read ref, by delegating to stageKey/resolveReads", () => {
  const dir = project();
  const specPath = writeSpec(dir);
  const r = startRecipe({ output: join(dir, "essay.md"), factory: { name: "f", version: "1" }, spec: specPath, clicker: "gary-sheng" });
  assert.throws(
    () => r.stage({ id: "outline", reads: ["input:does-not-exist"], output: "outline text", verdict: { station: "s", pass: true, note: "" } }),
    /unknown read "input:does-not-exist"/,
  );
});

test("stage() throws on a duplicate stage id", () => {
  const dir = project();
  const specPath = writeSpec(dir);
  const r = startRecipe({ output: join(dir, "essay.md"), factory: { name: "f", version: "1" }, spec: specPath, clicker: "gary-sheng" });
  r.stage({ id: "outline", reads: ["spec"], output: "outline text", verdict: { station: "s", pass: true, note: "" } });
  assert.throws(
    () => r.stage({ id: "outline", reads: ["spec"], output: "again", verdict: { station: "s", pass: true, note: "" } }),
    /duplicate stage id/,
  );
});

test("stage() throws a domain error, not a raw TypeError, when called with no id", () => {
  const dir = project();
  const specPath = writeSpec(dir);
  const r = startRecipe({ output: join(dir, "essay.md"), factory: { name: "f", version: "1" }, spec: specPath, clicker: "gary-sheng" });
  assert.throws(() => r.stage(), /stage needs an id/);
  assert.throws(() => r.stage({ reads: ["spec"], output: "text", verdict: { station: "s", pass: true, note: "" } }), /stage needs an id/);
});

test("startRecipe throws with the loader's message when the spec is unreadable or not a hyperspec", () => {
  const dir = project();
  assert.throws(
    () => startRecipe({ output: join(dir, "essay.md"), factory: { name: "f", version: "1" }, spec: join(dir, "missing.md"), clicker: "gary-sheng" }),
    /cannot read/,
  );
  writeFileSync(join(dir, "plain.md"), "---\ntitle: T\n---\n");
  assert.throws(
    () => startRecipe({ output: join(dir, "essay.md"), factory: { name: "f", version: "1" }, spec: join(dir, "plain.md"), clicker: "gary-sheng" }),
    /not a hyperspec/,
  );
});

test("startRecipe throws when a decision and a requirement share an id, even with different authors", () => {
  const dir = project();
  const specPath = join(dir, "essay.hyperspec.md");
  writeFileSync(
    specPath,
    `---
hyperspec: "0.1"
title: An essay
decisions:
  - id: shared
    state: decided
    value: gary-sheng
    source: interview
    author: gary-sheng
    chosen_by: human
requirements:
  - id: shared
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
  assert.throws(
    () => startRecipe({ output: join(dir, "essay.md"), factory: { name: "f", version: "1" }, spec: specPath, clicker: "gary-sheng" }),
    /spec id shared is used twice; ids must be unique across decisions and requirements/,
  );
});

test("startRecipe throws on a shared id even when both entries name the same author", () => {
  const dir = project();
  const specPath = join(dir, "essay.hyperspec.md");
  writeFileSync(
    specPath,
    `---
hyperspec: "0.1"
title: An essay
decisions:
  - id: shared
    state: decided
    value: gary-sheng
    source: interview
    author: gary-sheng
    chosen_by: human
requirements:
  - id: shared
    text: short
    fails_when: too long
    check:
      rubric: word count under 1200
    source: design doc
    author: gary-sheng
---
# Body
`,
  );
  assert.throws(
    () => startRecipe({ output: join(dir, "essay.md"), factory: { name: "f", version: "1" }, spec: specPath, clicker: "gary-sheng" }),
    /spec id shared is used twice/,
  );
});

// ---- finish() ----

test("finish() throws on a stage-less recipe, before writing the output file or the recipe file", () => {
  const dir = project();
  const specPath = writeSpec(dir);
  const outputPath = join(dir, "essay.md");
  const recipePath = `${outputPath}.recipe.json`;
  const r = startRecipe({ output: outputPath, factory: { name: "f", version: "1" }, spec: specPath, clicker: "gary-sheng" });
  assert.throws(() => r.finish({ approver: "gary-sheng" }), /a recipe needs at least one stage/);
  assert.ok(!existsSync(outputPath), "no output file should have been written");
  assert.ok(!existsSync(recipePath), "no recipe file should have been written");
});

test("finish() writes the output file from the last stage's blob when it does not exist yet", () => {
  const dir = project();
  const specPath = writeSpec(dir);
  const outputPath = join(dir, "essay.md");
  const r = startRecipe({ output: outputPath, factory: { name: "f", version: "1" }, spec: specPath, clicker: "gary-sheng" });
  r.stage({ id: "outline", reads: ["spec"], output: "the final text", verdict: { station: "s", pass: true, note: "" } });
  const { path, findings } = r.finish({ approver: null });
  assert.equal(path, `${outputPath}.recipe.json`);
  assert.equal(readFileSync(outputPath, "utf8"), "the final text");
  // Unapproved: the only expected fail is the approver.
  assert.deepEqual(
    findings.filter((f) => f.severity === "fail"),
    [{ severity: "fail", field: "approver", message: "approver is missing" }],
  );
});

test("finish() accepts a pre-existing output file that matches the last stage's bytes", () => {
  const dir = project();
  const specPath = writeSpec(dir);
  const outputPath = join(dir, "essay.md");
  writeFileSync(outputPath, "the final text");
  const r = startRecipe({ output: outputPath, factory: { name: "f", version: "1" }, spec: specPath, clicker: "gary-sheng" });
  r.stage({ id: "outline", reads: ["spec"], output: "the final text", verdict: { station: "s", pass: true, note: "" } });
  const { findings } = r.finish({ approver: "gary-sheng" });
  assert.deepEqual(findings, []);
});

test("finish() throws when a pre-existing output file's bytes differ from the last stage's output", () => {
  const dir = project();
  const specPath = writeSpec(dir);
  const outputPath = join(dir, "essay.md");
  writeFileSync(outputPath, "something else entirely");
  const r = startRecipe({ output: outputPath, factory: { name: "f", version: "1" }, spec: specPath, clicker: "gary-sheng" });
  r.stage({ id: "outline", reads: ["spec"], output: "the final text", verdict: { station: "s", pass: true, note: "" } });
  assert.throws(() => r.finish({ approver: null }), /does not match the recipe's last stage output/);
});

// ---- approve() ----

test("approve() sets approver and rewrites the recipe, clearing the approver fail", () => {
  const dir = project();
  const specPath = writeSpec(dir);
  const outputPath = join(dir, "essay.md");
  const r = startRecipe({ output: outputPath, factory: { name: "f", version: "1" }, spec: specPath, clicker: "gary-sheng" });
  r.stage({ id: "outline", reads: ["spec"], output: "the final text", verdict: { station: "s", pass: true, note: "" } });
  const { path, findings: before } = r.finish({ approver: null });
  assert.ok(before.some((f) => f.field === "approver"));

  const after = approve(path, "gary-sheng");
  assert.deepEqual(after, []);
  const { data } = readRecipe(path);
  assert.equal(data.approver, "gary-sheng");
});

// ---- end-to-end: two inputs, three stages, finish, approve, blobs everywhere ----

test("end to end: two inputs, three stages, finish, approve; blobs exist for every input, stage output and the spec", () => {
  const dir = project();
  const specPath = writeSpec(dir);
  mkdirSync(join(dir, "materials"));
  writeFileSync(join(dir, "materials", "call.md"), "the call transcript");
  writeFileSync(join(dir, "materials", "notes.md"), "the notes");
  const outputPath = join(dir, "essay.md");

  const r = startRecipe({
    output: outputPath,
    factory: { name: "compose-a-piece", version: "0.3.0" },
    spec: specPath,
    clicker: "gary-sheng",
  });

  const transcript = r.input("transcript-1", join(dir, "materials", "call.md"));
  const notes = r.input("notes-1", join(dir, "materials", "notes.md"));

  const outline = r.stage({
    id: "outline",
    reads: ["input:transcript-1", "input:notes-1", "spec"],
    model: { name: "claude-x", temperature: 0.7 },
    output: "the outline",
    verdict: { station: "outline-has-claim-chain", pass: true, note: "" },
  });
  const draft = r.stage({
    id: "draft",
    reads: ["stage:outline", "spec"],
    model: { name: "claude-x", temperature: 0.5 },
    output: "the draft",
    verdict: { station: "draft-has-outline-claims", pass: true, note: "" },
  });
  const final = r.stage({
    id: "final",
    reads: ["stage:draft", "spec"],
    model: { name: "claude-x", temperature: 0.2 },
    output: "the final text",
    verdict: { station: "final-reads-clean", pass: true, note: "" },
  });

  const { path, findings } = r.finish({ approver: null });
  assert.deepEqual(
    findings.filter((f) => f.severity === "fail"),
    [{ severity: "fail", field: "approver", message: "approver is missing" }],
  );

  const cleared = approve(path, "gary-sheng");
  assert.deepEqual(cleared, []);

  const { data } = readRecipe(path);
  assert.deepEqual(checkRecipe(data), []);
  assert.equal(data.output.sha256, final.output.sha256);
  assert.equal(readFileSync(outputPath, "utf8"), "the final text");

  // Blobs: every input, every stage output, and the spec itself.
  assert.ok(existsSync(blobPath(dir, transcript.sha256)));
  assert.ok(existsSync(blobPath(dir, notes.sha256)));
  assert.ok(existsSync(blobPath(dir, outline.output.sha256)));
  assert.ok(existsSync(blobPath(dir, draft.output.sha256)));
  assert.ok(existsSync(blobPath(dir, final.output.sha256)));
  assert.ok(existsSync(blobPath(dir, data.spec.sha256)));

  // spec.authors carries every decision and requirement id from the spec file.
  assert.deepEqual(data.spec.authors, { audience: "gary-sheng", length: "agent:claude" });

  // Paths inside the recipe are relative to the recipe file's own directory (== dir here).
  assert.equal(data.output.path, "essay.md");
  assert.equal(data.spec.path, "essay.hyperspec.md");
  assert.equal(data.inputs[0].path, join("materials", "call.md"));
});

test("output, spec and input paths resolve against process.cwd() when given as relative paths", () => {
  const dir = project();
  writeSpec(dir); // essay.hyperspec.md, relative to dir
  mkdirSync(join(dir, "materials"));
  writeFileSync(join(dir, "materials", "call.md"), "the call transcript");
  const cwd = process.cwd();
  process.chdir(dir);
  try {
    const r = startRecipe({ output: "essay.md", factory: { name: "f", version: "1" }, spec: "essay.hyperspec.md", clicker: "gary-sheng" });
    const input = r.input("transcript-1", join("materials", "call.md"));
    r.stage({ id: "outline", reads: ["input:transcript-1", "spec"], output: "the final text", verdict: { station: "s", pass: true, note: "" } });
    const { path } = r.finish({ approver: "gary-sheng" });
    // process.cwd() itself may resolve the tmpdir symlink (e.g. /var -> /private/var on macOS),
    // so compare against a fresh resolve() of the same relative path rather than the original dir.
    assert.equal(path, resolve(process.cwd(), "essay.md.recipe.json"));
    assert.equal(readFileSync(resolve(process.cwd(), "essay.md"), "utf8"), "the final text");
    const { data } = readRecipe(path);
    assert.equal(data.output.path, "essay.md");
    assert.equal(data.spec.path, "essay.hyperspec.md");
    assert.equal(data.inputs[0].path, join("materials", "call.md"));
    assert.equal(input.path, join("materials", "call.md"));
  } finally {
    process.chdir(cwd);
  }
});

test("stored paths are relative to the recipe's own directory even when cwd differs from it", () => {
  const dir = project();
  writeSpec(dir); // essay.hyperspec.md, relative to dir (== cwd)
  mkdirSync(join(dir, "out"));
  mkdirSync(join(dir, "materials"));
  writeFileSync(join(dir, "materials", "call.md"), "the call transcript");
  const cwd = process.cwd();
  process.chdir(dir);
  try {
    // output lives in out/, one level below cwd, so recipeDir (out/) diverges from cwd (dir).
    const r = startRecipe({ output: join("out", "essay.md"), factory: { name: "f", version: "1" }, spec: "essay.hyperspec.md", clicker: "gary-sheng" });
    const input = r.input("transcript-1", join("materials", "call.md"));
    r.stage({ id: "outline", reads: ["input:transcript-1", "spec"], output: "the final text", verdict: { station: "s", pass: true, note: "" } });
    const { path } = r.finish({ approver: "gary-sheng" });
    const { data } = readRecipe(path);
    // Every stored path is relative to out/ (the recipe's directory), not to cwd (dir).
    assert.equal(data.output.path, "essay.md");
    assert.equal(data.spec.path, join("..", "essay.hyperspec.md"));
    assert.equal(data.inputs[0].path, join("..", "materials", "call.md"));
    assert.equal(input.path, join("..", "materials", "call.md"));
  } finally {
    process.chdir(cwd);
  }
});

// ---- exports wiring: import("@supersuit/hyperspec/recipe") resolves ----

test("@supersuit/hyperspec/recipe resolves via the package's own self-reference and exposes startRecipe/approve", () => {
  assert.equal(typeof startRecipeSelfRef, "function");
  assert.equal(typeof approveSelfRef, "function");
  assert.equal(startRecipeSelfRef, startRecipe);
  assert.equal(approveSelfRef, approve);
});
