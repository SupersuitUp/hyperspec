import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { tempDir } from "./tmp.mjs";
import { join } from "node:path";
import { sha256 } from "../src/hash.mjs";
import { checkRecipe, readRecipe, resolveReads, stageKey, writeRecipe } from "../src/recipe.mjs";

// A minimal, otherwise-valid recipe with one stage that reads the one input plus the spec.
// stages[0].key and output.sha256 are filled in after construction, since key depends on the
// recipe's own shape (spec/factory/reads) and output must equal the last stage's output.
function validRecipe() {
  const recipe = {
    recipe: "0.1",
    created: "2026-09-28T18:00:00.000Z",
    output: { path: "essay.md", sha256: "" },
    factory: { name: "compose-a-piece", version: "0.3.0" },
    spec: { path: "essay.hyperspec.md", sha256: sha256("spec-bytes"), authors: { audience: "gary-sheng", length: "agent:claude" } },
    inputs: [
      { name: "transcript-1", path: "materials/call.md", sha256: sha256("call-bytes"), order: 1 },
    ],
    stages: [
      {
        id: "outline",
        reads: ["input:transcript-1", "spec"],
        model: { name: "claude-x", temperature: 0.7 },
        key: "",
        output: { sha256: sha256("outline-bytes") },
        verdict: { station: "outline-has-claim-chain", pass: true, note: "" },
      },
    ],
    clicker: "gary-sheng",
    approver: "gary-sheng",
    parent: null,
    change: null,
  };
  recipe.stages[0].key = stageKey(recipe, 0);
  recipe.output.sha256 = recipe.stages[0].output.sha256;
  return recipe;
}

// A two-stage variant: "outline" (reads the input + spec) then "draft" (reads stage:outline,
// declared explicitly), so tests can exercise earlier-stage reads and forward-reference refusal.
function twoStageRecipe() {
  const recipe = validRecipe();
  recipe.stages.push({
    id: "draft",
    reads: ["stage:outline"],
    model: { name: "claude-x", temperature: 0.5 },
    key: "",
    output: { sha256: sha256("draft-bytes") },
    verdict: { station: "draft-has-outline-claims", pass: true, note: "" },
  });
  recipe.stages[1].key = stageKey(recipe, 1);
  recipe.output.sha256 = recipe.stages[1].output.sha256;
  return recipe;
}

const tmpFile = (name) => join(tempDir("hs-recipe-"), name);

// ---- readRecipe / writeRecipe ----

test("writeRecipe writes pretty-printed JSON (2-space indent) with a trailing newline", () => {
  const path = tmpFile("essay.md.recipe.json");
  writeRecipe(path, { a: 1, b: [1, 2] });
  assert.equal(readFileSync(path, "utf8"), '{\n  "a": 1,\n  "b": [\n    1,\n    2\n  ]\n}\n');
});

test("readRecipe round-trips what writeRecipe wrote, and reports the recipe's directory", () => {
  const path = tmpFile("essay.md.recipe.json");
  const recipe = validRecipe();
  writeRecipe(path, recipe);
  const { data, dir, error } = readRecipe(path);
  assert.equal(error, undefined);
  assert.deepEqual(data, recipe);
  assert.equal(dir, join(path, ".."));
});

test("readRecipe reports a missing file as an error, never a throw", () => {
  const { error } = readRecipe("/nope/missing.recipe.json");
  assert.match(error, /cannot read/);
});

test("readRecipe reports invalid JSON as an error, never a throw", () => {
  const path = tmpFile("broken.recipe.json");
  writeFileSync(path, "{ not json");
  const { error } = readRecipe(path);
  assert.match(error, /invalid JSON/);
});

// ---- resolveReads ----

test("resolveReads resolves declared refs (input:, stage:, spec) to their hex, in declared order", () => {
  const recipe = twoStageRecipe();
  assert.deepEqual(resolveReads(recipe, 1), [["stage:outline", recipe.stages[0].output.sha256]]);
  assert.deepEqual(resolveReads(recipe, 0), [
    ["input:transcript-1", recipe.inputs[0].sha256],
    ["spec", recipe.spec.sha256],
  ]);
});

test("resolveReads expands an empty reads array to every input (in order), every earlier stage, then spec", () => {
  const recipe = twoStageRecipe();
  recipe.stages[1].reads = [];
  assert.deepEqual(resolveReads(recipe, 1), [
    ["input:transcript-1", recipe.inputs[0].sha256],
    ["stage:outline", recipe.stages[0].output.sha256],
    ["spec", recipe.spec.sha256],
  ]);
});

test("resolveReads expands a missing reads field the same as an empty array", () => {
  const recipe = twoStageRecipe();
  delete recipe.stages[1].reads;
  assert.deepEqual(resolveReads(recipe, 1), [
    ["input:transcript-1", recipe.inputs[0].sha256],
    ["stage:outline", recipe.stages[0].output.sha256],
    ["spec", recipe.spec.sha256],
  ]);
});

test("resolveReads honors input order over array order when expanding", () => {
  const recipe = validRecipe();
  recipe.inputs = [
    { name: "second", path: "b.md", sha256: sha256("b"), order: 2 },
    { name: "first", path: "a.md", sha256: sha256("a"), order: 1 },
  ];
  recipe.stages[0].reads = [];
  assert.deepEqual(resolveReads(recipe, 0), [
    ["input:first", sha256("a")],
    ["input:second", sha256("b")],
    ["spec", recipe.spec.sha256],
  ]);
});

test("resolveReads throws a clear error for an unknown input ref", () => {
  const recipe = validRecipe();
  recipe.stages[0].reads = ["input:does-not-exist"];
  assert.throws(() => resolveReads(recipe, 0), /unknown read "input:does-not-exist"/);
});

test("resolveReads throws a clear error for an unknown stage ref", () => {
  const recipe = twoStageRecipe();
  recipe.stages[1].reads = ["stage:does-not-exist"];
  assert.throws(() => resolveReads(recipe, 1), /unknown read "stage:does-not-exist"/);
});

test("resolveReads throws for a forward stage: reference (a later stage)", () => {
  const recipe = twoStageRecipe();
  recipe.stages[0].reads = ["stage:draft"];
  assert.throws(() => resolveReads(recipe, 0), /not an earlier stage/);
});

test("resolveReads throws for a stage: reference to itself", () => {
  const recipe = twoStageRecipe();
  recipe.stages[1].reads = ["stage:draft"];
  assert.throws(() => resolveReads(recipe, 1), /not an earlier stage/);
});

// ---- stageKey ----

test("stageKey is deterministic: recomputing it twice on the same recipe gives the same hex", () => {
  const recipe = validRecipe();
  assert.equal(stageKey(recipe, 0), stageKey(recipe, 0));
});

test("stageKey changes when an upstream input's hash changes", () => {
  const recipe = validRecipe();
  const before = stageKey(recipe, 0);
  recipe.inputs[0].sha256 = sha256("different call bytes");
  assert.notEqual(stageKey(recipe, 0), before);
});

test("stageKey changes when the factory version changes", () => {
  const recipe = validRecipe();
  const before = stageKey(recipe, 0);
  recipe.factory.version = "0.3.1";
  assert.notEqual(stageKey(recipe, 0), before);
});

test("stageKey changes when the stage's model settings change, and is stable (model: null) when there are none", () => {
  const recipe = validRecipe();
  const before = stageKey(recipe, 0);
  recipe.stages[0].model = { name: "claude-x", temperature: 0.9 };
  assert.notEqual(stageKey(recipe, 0), before);

  delete recipe.stages[0].model;
  const withNoModel = stageKey(recipe, 0);
  recipe.stages[0].model = null;
  assert.equal(stageKey(recipe, 0), withNoModel);
});

// ---- checkRecipe ----

test("checkRecipe on a fully valid recipe reports no findings", () => {
  assert.deepEqual(checkRecipe(validRecipe()), []);
});

test("checkRecipe fails on missing factory.version", () => {
  const recipe = validRecipe();
  delete recipe.factory.version;
  const findings = checkRecipe(recipe);
  assert.ok(findings.some((f) => f.severity === "fail" && f.field === "factory.version"));
});

test("checkRecipe fails on empty factory.version", () => {
  const recipe = validRecipe();
  recipe.factory.version = "  ";
  const findings = checkRecipe(recipe);
  assert.ok(findings.some((f) => f.severity === "fail" && f.field === "factory.version"));
});

test("checkRecipe fails on missing spec.sha256", () => {
  const recipe = validRecipe();
  delete recipe.spec.sha256;
  const findings = checkRecipe(recipe);
  assert.ok(findings.some((f) => f.severity === "fail" && f.field === "spec.sha256"));
});

test("checkRecipe fails on missing spec.authors", () => {
  const recipe = validRecipe();
  delete recipe.spec.authors;
  const findings = checkRecipe(recipe);
  assert.ok(findings.some((f) => f.severity === "fail" && f.field === "spec.authors"));
});

test("checkRecipe treats an empty spec.authors object as missing", () => {
  const recipe = validRecipe();
  recipe.spec.authors = {};
  const findings = checkRecipe(recipe);
  assert.ok(findings.some((f) => f.severity === "fail" && f.field === "spec.authors"));
});

test("checkRecipe fails on an input with no sha256", () => {
  const recipe = validRecipe();
  delete recipe.inputs[0].sha256;
  const findings = checkRecipe(recipe);
  assert.ok(findings.some((f) => f.severity === "fail" && f.field === "inputs[0].sha256"));
});

test("checkRecipe fails on a stage with no verdict", () => {
  const recipe = validRecipe();
  delete recipe.stages[0].verdict;
  const findings = checkRecipe(recipe);
  assert.ok(findings.some((f) => f.severity === "fail" && f.field === "stages[0].verdict"));
});

test("checkRecipe fails when verdict.pass is not a boolean", () => {
  const recipe = validRecipe();
  recipe.stages[0].verdict.pass = "yes";
  const findings = checkRecipe(recipe);
  assert.ok(findings.some((f) => f.severity === "fail" && f.field === "stages[0].verdict.pass"));
});

test("checkRecipe fails on missing clicker", () => {
  const recipe = validRecipe();
  delete recipe.clicker;
  const findings = checkRecipe(recipe);
  assert.ok(findings.some((f) => f.severity === "fail" && f.field === "clicker"));
});

test("checkRecipe fails on missing approver", () => {
  const recipe = validRecipe();
  delete recipe.approver;
  const findings = checkRecipe(recipe);
  assert.ok(findings.some((f) => f.severity === "fail" && f.field === "approver"));
});

test("checkRecipe fails a null approver (unapproved is incomplete, per the schema note on approver)", () => {
  const recipe = validRecipe();
  recipe.approver = null;
  const findings = checkRecipe(recipe);
  assert.ok(findings.some((f) => f.severity === "fail" && f.field === "approver"));
});

test("checkRecipe fails when the last stage's output does not match output.sha256", () => {
  const recipe = validRecipe();
  recipe.output.sha256 = sha256("some other output entirely");
  const findings = checkRecipe(recipe);
  assert.ok(findings.some((f) => f.severity === "fail" && f.field === "output.sha256"));
});

test("checkRecipe fails when parent is set but change is null", () => {
  const recipe = validRecipe();
  recipe.parent = { path: "../parent.recipe.json", sha256: sha256("parent bytes") };
  const findings = checkRecipe(recipe);
  assert.ok(findings.some((f) => f.severity === "fail" && f.field === "parent"));
});

test("checkRecipe fails when change is set but parent is null", () => {
  const recipe = validRecipe();
  recipe.change = "swapped the transcript";
  const findings = checkRecipe(recipe);
  assert.ok(findings.some((f) => f.severity === "fail" && f.field === "parent"));
});

test("checkRecipe passes parent/change when both are set", () => {
  const recipe = validRecipe();
  recipe.parent = { path: "../parent.recipe.json", sha256: sha256("parent bytes") };
  recipe.change = "swapped the transcript";
  const findings = checkRecipe(recipe);
  assert.ok(!findings.some((f) => f.field === "parent"));
});

test("checkRecipe fails when a stage's recorded key does not match its recomputed key", () => {
  const recipe = validRecipe();
  recipe.stages[0].key = "0".repeat(64);
  const findings = checkRecipe(recipe);
  assert.ok(findings.some((f) => f.severity === "fail" && f.field === "stages[0].key"));
});

test("checkRecipe fails a stage with pending: true as pending", () => {
  const recipe = validRecipe();
  recipe.stages[0].pending = true;
  const findings = checkRecipe(recipe);
  assert.ok(findings.some((f) => f.severity === "fail" && f.field === "stages[0]" && /is pending/.test(f.message)));
});

test("checkRecipe fails a stage with a null output as pending", () => {
  const recipe = validRecipe();
  recipe.stages[0].output = null;
  const findings = checkRecipe(recipe);
  assert.ok(findings.some((f) => f.severity === "fail" && f.field === "stages[0]" && /is pending/.test(f.message)));
});

test("checkRecipe fails on an empty stages array (a recipe needs at least one stage)", () => {
  const recipe = validRecipe();
  recipe.stages = [];
  const findings = checkRecipe(recipe);
  assert.ok(findings.some((f) => f.severity === "fail" && f.field === "stages" && f.message === "a recipe needs at least one stage"));
});

test("checkRecipe fails on a missing stages field the same as an empty array", () => {
  const recipe = validRecipe();
  delete recipe.stages;
  const findings = checkRecipe(recipe);
  assert.ok(findings.some((f) => f.severity === "fail" && f.field === "stages" && f.message === "a recipe needs at least one stage"));
});

test("checkRecipe warns (never fails) on a stage that declares no reads", () => {
  const recipe = validRecipe();
  recipe.stages[0].reads = [];
  const findings = checkRecipe(recipe);
  const finding = findings.find((f) => f.field === "stages[0].reads");
  assert.equal(finding.severity, "warn");
  assert.match(finding.message, /declares no reads/);
});

test("checkRecipe does not warn on a stage with declared reads", () => {
  const findings = checkRecipe(validRecipe());
  assert.ok(!findings.some((f) => f.field === "stages[0].reads"));
});

test("checkRecipe accepts a { root } option without throwing", () => {
  assert.deepEqual(checkRecipe(validRecipe(), { root: "/some/store/root" }), []);
});

test("checkRecipe surfaces a bad read ref as a stages[i].key fail rather than throwing", () => {
  const recipe = validRecipe();
  recipe.stages[0].reads = ["input:does-not-exist"];
  const findings = checkRecipe(recipe);
  assert.ok(findings.some((f) => f.severity === "fail" && f.field === "stages[0].key" && /could not be recomputed/.test(f.message)));
});

test("checkRecipe never puts the reads-warn and a key-recompute fail on the same field", () => {
  // Reproduces the exact collision from the review: an empty-reads stage (warn) in a recipe
  // whose spec.sha256 is missing, so expanding "everything" throws while resolving "spec" (fail).
  // Before the fix both landed on stages[0].reads; now the warn stays there and the fail moves
  // to stages[0].key, so a caller grouping findings by field can tell them apart.
  const recipe = validRecipe();
  recipe.stages[0].reads = [];
  delete recipe.spec.sha256;
  const findings = checkRecipe(recipe);
  const warn = findings.find((f) => f.severity === "warn" && f.field === "stages[0].reads");
  const fail = findings.find((f) => f.severity === "fail" && f.field === "stages[0].key");
  assert.ok(warn, "expected the empty-reads warn on stages[0].reads");
  assert.ok(fail, "expected the key-recompute fail on stages[0].key");
  assert.ok(!findings.some((f) => f.severity === "fail" && f.field === "stages[0].reads"), "no fail should land on stages[0].reads");
});

test("checkRecipe on a two-stage recipe with everything correct reports no findings", () => {
  assert.deepEqual(checkRecipe(twoStageRecipe()), []);
});
