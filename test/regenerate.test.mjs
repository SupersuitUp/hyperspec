import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { sha256 } from "../src/hash.mjs";
import { blobPath, getBlob } from "../src/blobs.mjs";
import { checkRecipe, readRecipe, writeRecipe } from "../src/recipe.mjs";
import { approve, startRecipe } from "../src/writer.mjs";
import { reproduce } from "../src/reproduce.mjs";
import { regenerate } from "../src/regenerate.mjs";

// A tmp project dir with a .git folder, so storeRoot's walk-up finds a root without --store or
// HYPERSPEC_STORE. Same convention as the writer and reproduce tests.
function project() {
  const dir = mkdtempSync(join(tmpdir(), "hs-regenerate-"));
  mkdirSync(join(dir, ".git"));
  return dir;
}

function writeSpec(dir) {
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
---
# Body
`,
  );
  return path;
}

// The fake runner: reads the stdin JSON, appends it to a log (so a test can see which stages ran
// and what they were handed), and prints the upper-cased bytes of its first read. An optional
// second argument names a stage to fail on, and an optional third a verdict line to print.
function writeRunner(dir) {
  const path = join(dir, "runner.mjs");
  writeFileSync(
    path,
    `import { appendFileSync, readFileSync } from "node:fs";
const [log, failOn, verdict] = process.argv.slice(2);
let s = "";
process.stdin.on("data", (d) => (s += d)).on("end", () => {
  const job = JSON.parse(s);
  const firstBytes = readFileSync(job.reads[0].path, "utf8");
  appendFileSync(log, JSON.stringify({ ...job, firstBytes }) + "\\n");
  if (failOn === job.stage) { process.stderr.write("runner blew up on " + job.stage + "\\n"); process.exit(4); }
  process.stdout.write(firstBytes.toUpperCase() + " [" + job.stage + "]");
  if (verdict && verdict !== "-") process.stderr.write("some noise\\n" + verdict.replaceAll("\\\\n", "\\n") + "\\n");
});
`,
  );
  return path;
}

const q = (s) => JSON.stringify(s);
function runCmd(dir, { failOn = "-", verdict = "-" } = {}) {
  return `node ${q(join(dir, "runner.mjs"))} ${q(join(dir, "run.log"))} ${q(failOn)} ${q(verdict)}`;
}
function runLog(dir) {
  const p = join(dir, "run.log");
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

// A complete, approved parent: two inputs, three stages.
//   outline reads input:transcript-1 + spec
//   notes   reads input:transcript-2 only (not downstream of outline)
//   draft   reads stage:outline + spec (the last stage, so the final output)
function buildParent(dir) {
  const specPath = writeSpec(dir);
  mkdirSync(join(dir, "materials"));
  writeFileSync(join(dir, "materials", "call.md"), "the call transcript");
  writeFileSync(join(dir, "materials", "notes.md"), "side notes");
  writeFileSync(join(dir, "materials", "call-2.md"), "a second call");
  writeFileSync(join(dir, "materials", "call-v2.md"), "the corrected call transcript");
  writeRunner(dir);
  const outputPath = join(dir, "essay.md");

  const r = startRecipe({ output: outputPath, factory: { name: "compose-a-piece", version: "0.3.0" }, spec: specPath, clicker: "gary-sheng" });
  r.input("transcript-1", join(dir, "materials", "call.md"));
  r.input("transcript-2", join(dir, "materials", "notes.md"));
  r.stage({ id: "outline", reads: ["input:transcript-1", "spec"], model: { name: "claude-x", temperature: 0.7 }, output: "the outline", verdict: { station: "outline-ok", pass: true, note: "" } });
  r.stage({ id: "notes", reads: ["input:transcript-2"], model: { name: "claude-x" }, output: "the notes", verdict: { station: "notes-ok", pass: true, note: "" } });
  r.stage({ id: "draft", reads: ["stage:outline", "spec"], model: { name: "claude-x", temperature: 0.2 }, output: "the final text", verdict: { station: "draft-ok", pass: true, note: "" } });
  const { path } = r.finish({ approver: "gary-sheng" });
  return { recipePath: path, outputPath };
}

function snapshotTree(dir) {
  // Hash of every file under the project, keyed by relative path (runner log and tmp excluded by
  // the caller). Used to prove the parent's recipe, output and blobs are never touched.
  const out = {};
  const walk = (d, rel) => {
    for (const name of readdirSync(d)) {
      const abs = join(d, name);
      const r = rel ? `${rel}/${name}` : name;
      if (statSync(abs).isDirectory()) walk(abs, r);
      else out[r] = sha256(readFileSync(abs));
    }
  };
  walk(dir, "");
  return out;
}

const actions = (plan) => Object.fromEntries(plan.map((p) => [p.id, p.action]));

test("add-input with reads [draft] reruns only draft and reuses outline and notes", () => {
  const dir = project();
  const { recipePath } = buildParent(dir);
  const parent = readRecipe(recipePath).data;
  const out = join(dir, "essay-v2.md");

  const res = regenerate(recipePath, {
    out,
    clicker: "gary-sheng",
    change: { addInput: { name: "transcript-3", path: join(dir, "materials", "call-2.md"), reads: ["draft"] } },
    run: runCmd(dir),
  });

  assert.equal(res.ok, true, res.error);
  assert.equal(res.pending, false);
  assert.deepEqual(actions(res.plan), { outline: "reuse", notes: "reuse", draft: "rerun" });
  assert.deepEqual(runLog(dir).map((j) => j.stage), ["draft"]);

  const child = readRecipe(res.childRecipe).data;
  assert.equal(res.childRecipe, `${out}.recipe.json`);
  assert.equal(child.stages[0].output.sha256, parent.stages[0].output.sha256);
  assert.equal(child.stages[0].key, parent.stages[0].key);
  assert.deepEqual(child.stages[2].reads, ["stage:outline", "spec", "input:transcript-3"]);
  assert.deepEqual(child.inputs[2], { name: "transcript-3", path: "materials/call-2.md", sha256: sha256("a second call"), order: 3 });
  assert.equal(child.change, "added input transcript-3 (materials/call-2.md)");
  assert.deepEqual(child.parent, { path: "essay.md.recipe.json", sha256: sha256(readFileSync(recipePath)) });
  assert.equal(child.clicker, "gary-sheng");
  assert.equal(child.approver, null);
  assert.notEqual(child.created, parent.created);

  // The draft was handed the reused outline's bytes, and the output file is the last stage's blob.
  assert.equal(runLog(dir)[0].firstBytes, "the outline");
  assert.equal(readFileSync(out, "utf8"), "THE OUTLINE [draft]");
  assert.equal(child.output.sha256, sha256(readFileSync(out)));
  assert.equal(child.output.path, "essay-v2.md");
});

test("a stage with empty reads reads the added input, so it reruns without --reads", () => {
  const dir = project();
  const specPath = writeSpec(dir);
  writeRunner(dir);
  writeFileSync(join(dir, "a.md"), "alpha");
  writeFileSync(join(dir, "b.md"), "beta");
  const r = startRecipe({ output: join(dir, "out.md"), factory: { name: "f", version: "1" }, spec: specPath, clicker: "gary-sheng" });
  r.input("a", join(dir, "a.md"));
  r.stage({ id: "one", reads: ["input:a"], output: "one", verdict: { station: "s", pass: true, note: "" } });
  r.stage({ id: "all", reads: [], output: "everything", verdict: { station: "s", pass: true, note: "" } });
  const { path } = r.finish({ approver: "gary-sheng" });

  const res = regenerate(path, { out: join(dir, "out-2.md"), clicker: "gary-sheng", change: { addInput: { name: "b", path: join(dir, "b.md") } }, run: runCmd(dir) });
  assert.equal(res.ok, true, res.error);
  assert.deepEqual(actions(res.plan), { one: "reuse", all: "rerun" });
  // The expanded read list hands the runner every input in order, every earlier stage, and the spec.
  assert.deepEqual(runLog(dir)[0].reads.map((x) => x.ref), ["input:a", "input:b", "stage:one", "spec"]);
});

test("swap-input of an input read only by stage 1 reruns its transitive readers, not every later stage", () => {
  const dir = project();
  const { recipePath } = buildParent(dir);
  const out = join(dir, "essay-v2.md");

  const res = regenerate(recipePath, {
    out,
    clicker: "gary-sheng",
    change: { swapInput: { name: "transcript-1", path: join(dir, "materials", "call-v2.md") } },
    run: runCmd(dir),
  });

  assert.equal(res.ok, true, res.error);
  // notes reads only transcript-2, so it is not downstream of outline (R5) and is reused.
  assert.deepEqual(actions(res.plan), { outline: "rerun", notes: "reuse", draft: "rerun" });
  assert.deepEqual(runLog(dir).map((j) => j.stage), ["outline", "draft"]);
  const child = readRecipe(res.childRecipe).data;
  assert.equal(child.inputs[0].path, "materials/call-v2.md");
  assert.equal(child.inputs[0].sha256, sha256("the corrected call transcript"));
  assert.equal(child.inputs[0].order, 1);
  assert.equal(child.change, "swapped input transcript-1 to materials/call-v2.md");
  assert.equal(readFileSync(out, "utf8"), "THE CORRECTED CALL TRANSCRIPT [OUTLINE] [draft]");
});

test("factory-version reruns every stage", () => {
  const dir = project();
  const { recipePath } = buildParent(dir);
  const res = regenerate(recipePath, { out: join(dir, "essay-v2.md"), clicker: "gary-sheng", change: { factoryVersion: "0.4.0" }, run: runCmd(dir) });
  assert.equal(res.ok, true, res.error);
  assert.deepEqual(actions(res.plan), { outline: "rerun", notes: "rerun", draft: "rerun" });
  const child = readRecipe(res.childRecipe).data;
  assert.equal(child.factory.version, "0.4.0");
  assert.equal(child.factory.name, "compose-a-piece");
  assert.equal(child.change, "factory 0.3.0 to 0.4.0");
});

test("rerun stages carry the parent's model and recompute their key with the child's hashes", () => {
  const dir = project();
  const { recipePath } = buildParent(dir);
  const res = regenerate(recipePath, { out: join(dir, "essay-v2.md"), clicker: "gary-sheng", change: { factoryVersion: "0.4.0" }, run: runCmd(dir) });
  const parent = readRecipe(recipePath).data;
  const child = readRecipe(res.childRecipe).data;
  assert.deepEqual(runLog(dir).map((j) => j.model), parent.stages.map((s) => s.model));
  child.stages.forEach((s, i) => {
    assert.deepEqual(s.model, parent.stages[i].model);
    assert.notEqual(s.key, parent.stages[i].key);
  });
  // No reported verdict: the default one.
  assert.deepEqual(child.stages[0].verdict, { station: "runner", pass: true, note: "no verdict reported" });
});

test("the child passes checkRecipe except approver, and reproduces once approved", () => {
  const dir = project();
  const { recipePath } = buildParent(dir);
  const res = regenerate(recipePath, {
    out: join(dir, "essay-v2.md"),
    clicker: "gary-sheng",
    change: { addInput: { name: "transcript-3", path: join(dir, "materials", "call-2.md"), reads: ["draft"] } },
    run: runCmd(dir),
  });
  const child = readRecipe(res.childRecipe).data;
  const fails = checkRecipe(child).filter((f) => f.severity === "fail");
  assert.deepEqual(fails.map((f) => f.field), ["approver"]);

  approve(res.childRecipe, "gary-sheng");
  const rep = reproduce(res.childRecipe);
  assert.equal(rep.ok, true, JSON.stringify(rep.steps.filter((s) => !s.ok)));
});

test("without a runner: pending child written, output not written, pending stages and downstream keys", () => {
  const dir = project();
  const { recipePath } = buildParent(dir);
  const out = join(dir, "essay-v2.md");
  const res = regenerate(recipePath, {
    out,
    clicker: "gary-sheng",
    change: { swapInput: { name: "transcript-1", path: join(dir, "materials", "call-v2.md") } },
  });

  assert.equal(res.ok, true, res.error);
  assert.equal(res.pending, true);
  assert.deepEqual(actions(res.plan), { outline: "rerun", notes: "reuse", draft: "rerun" });
  assert.equal(existsSync(out), false);
  assert.equal(existsSync(`${out}.recipe.json`), true);

  const child = readRecipe(res.childRecipe).data;
  const [outline, notes, draft] = child.stages;
  assert.equal(outline.pending, true);
  assert.equal(outline.output, null);
  assert.match(outline.key, /^[0-9a-f]{64}$/); // its reads are all known, so its key is computable
  assert.equal(notes.pending, undefined);
  assert.equal(draft.pending, true);
  assert.equal(draft.output, null);
  assert.equal(draft.key, null); // reads a pending stage, so its key cannot be computed yet
  assert.equal(child.output.sha256, null);

  const fails = checkRecipe(child).filter((f) => f.severity === "fail").map((f) => f.message);
  assert.ok(fails.includes("stage outline is pending"));
  assert.ok(fails.includes("stage draft is pending"));
  assert.equal(runLog(dir).length, 0);
  // The new input bytes are in the store, so a later run can pick the child up.
  const root = dir;
  assert.equal(getBlob(root, child.inputs[0].sha256).toString(), "the corrected call transcript");
});

test("the parent's recipe, output and blobs are never modified", () => {
  const dir = project();
  const { recipePath, outputPath } = buildParent(dir);
  const before = snapshotTree(dir);
  const recipeBefore = sha256(readFileSync(recipePath));
  const outputBefore = sha256(readFileSync(outputPath));

  for (const [i, change] of [
    { factoryVersion: "0.4.0" },
    { swapInput: { name: "transcript-1", path: join(dir, "materials", "call-v2.md") } },
    { addInput: { name: "transcript-3", path: join(dir, "materials", "call-2.md"), reads: ["draft"] } },
  ].entries()) {
    const res = regenerate(recipePath, { out: join(dir, `child-${i}.md`), clicker: "gary-sheng", change, run: runCmd(dir) });
    assert.equal(res.ok, true, res.error);
  }
  regenerate(recipePath, { out: join(dir, "child-pending.md"), clicker: "gary-sheng", change: { factoryVersion: "9" } });

  assert.equal(sha256(readFileSync(recipePath)), recipeBefore);
  assert.equal(sha256(readFileSync(outputPath)), outputBefore);
  const after = snapshotTree(dir);
  for (const [rel, hex] of Object.entries(before)) {
    if (rel === "run.log") continue;
    assert.equal(after[rel], hex, `${rel} changed`);
  }
});

test("a runner failure stops regeneration, names the stage, and writes nothing", () => {
  const dir = project();
  const { recipePath } = buildParent(dir);
  const blobsBefore = snapshotTree(join(dir, ".hyperspec"));
  const out = join(dir, "essay-v2.md");
  const res = regenerate(recipePath, { out, clicker: "gary-sheng", change: { factoryVersion: "0.4.0" }, run: runCmd(dir, { failOn: "notes" }) });

  assert.equal(res.ok, false);
  assert.equal(res.failedStage, "notes");
  assert.match(res.error, /notes/);
  assert.match(res.error, /runner blew up on notes/);
  assert.deepEqual(runLog(dir).map((j) => j.stage), ["outline", "notes"]);
  assert.equal(existsSync(out), false);
  assert.equal(existsSync(`${out}.recipe.json`), false);
  // Not even a blob: outline's rerun output is held until every stage has run.
  assert.deepEqual(snapshotTree(join(dir, ".hyperspec")), blobsBefore);
});

test("reuse is proven by a key match, not by the stage's name", () => {
  const dir = project();
  const { recipePath } = buildParent(dir);
  // Hand-edit the parent so outline's recorded key no longer matches what its reads would give.
  // Same id, same reads, same input bytes: only the key disagrees, and that alone forces a rerun.
  const loaded = readRecipe(recipePath);
  loaded.data.stages[0].key = "0".repeat(64);
  writeRecipe(recipePath, loaded.data);

  const res = regenerate(recipePath, {
    out: join(dir, "essay-v2.md"),
    clicker: "gary-sheng",
    change: { addInput: { name: "transcript-3", path: join(dir, "materials", "call-2.md"), reads: ["notes"] } },
    run: runCmd(dir),
  });
  assert.equal(res.ok, true, res.error);
  // outline reruns (key mismatch), notes reruns (the change), draft reruns (reads outline).
  assert.deepEqual(actions(res.plan), { outline: "rerun", notes: "rerun", draft: "rerun" });
});

test("an unchanged key is reused even when the stage is not what the change named", () => {
  const dir = project();
  const { recipePath } = buildParent(dir);
  // --reads names notes; outline and draft never read transcript-3, so their keys match and they are reused.
  const res = regenerate(recipePath, {
    out: join(dir, "essay-v2.md"),
    clicker: "gary-sheng",
    change: { addInput: { name: "transcript-3", path: join(dir, "materials", "call-2.md"), reads: ["notes"] } },
    run: runCmd(dir),
  });
  assert.equal(res.ok, true, res.error);
  assert.deepEqual(actions(res.plan), { outline: "reuse", notes: "rerun", draft: "reuse" });
  // The last stage was reused, so the child's output is the parent's bytes.
  assert.equal(readFileSync(join(dir, "essay-v2.md"), "utf8"), "the final text");
});

test("the runner's last VERDICT line is recorded; invalid JSON there fails the stage", () => {
  const dir = project();
  const { recipePath } = buildParent(dir);
  const verdictLine = `VERDICT ${JSON.stringify({ station: "caps", pass: false, note: "shouting" })}`;
  const res = regenerate(recipePath, { out: join(dir, "a.md"), clicker: "gary-sheng", change: { factoryVersion: "0.4.0" }, run: runCmd(dir, { verdict: `VERDICT {"station":"first","pass":true}\n${verdictLine}` }) });
  assert.equal(res.ok, true, res.error);
  const child = readRecipe(res.childRecipe).data;
  assert.deepEqual(child.stages[0].verdict, { station: "caps", pass: false, note: "shouting" });

  const bad = regenerate(recipePath, { out: join(dir, "b.md"), clicker: "gary-sheng", change: { factoryVersion: "0.4.0" }, run: runCmd(dir, { verdict: "VERDICT {not json" }) });
  assert.equal(bad.ok, false);
  assert.equal(bad.failedStage, "outline");
  assert.match(bad.error, /VERDICT/);
  assert.equal(existsSync(join(dir, "b.md.recipe.json")), false);
});

test("temp files handed to the runner are cleaned up afterwards", () => {
  const dir = project();
  const { recipePath } = buildParent(dir);
  const res = regenerate(recipePath, { out: join(dir, "a.md"), clicker: "gary-sheng", change: { factoryVersion: "0.4.0" }, run: runCmd(dir) });
  assert.equal(res.ok, true, res.error);
  const paths = runLog(dir).flatMap((j) => j.reads.map((x) => x.path));
  assert.ok(paths.length > 0);
  for (const p of paths) assert.equal(existsSync(p), false, `${p} left behind`);
});

test("a child in another directory stores its paths relative to itself", () => {
  const dir = project();
  const { recipePath } = buildParent(dir);
  mkdirSync(join(dir, "v2"));
  const out = join(dir, "v2", "essay.md");
  const res = regenerate(recipePath, {
    out,
    clicker: "gary-sheng",
    change: { swapInput: { name: "transcript-1", path: join(dir, "materials", "call-v2.md") } },
    run: runCmd(dir),
  });
  assert.equal(res.ok, true, res.error);
  const child = readRecipe(res.childRecipe).data;
  const childDir = join(dir, "v2");
  assert.equal(child.output.path, "essay.md");
  assert.equal(child.parent.path, "../essay.md.recipe.json");
  assert.equal(resolve(childDir, child.spec.path), join(dir, "essay.hyperspec.md"));
  assert.equal(resolve(childDir, child.inputs[0].path), join(dir, "materials", "call-v2.md"));
  assert.equal(resolve(childDir, child.inputs[1].path), join(dir, "materials", "notes.md"));
});

test("relative out and input paths resolve against the working directory", () => {
  const dir = project();
  const { recipePath } = buildParent(dir);
  const cwd = process.cwd();
  process.chdir(dir);
  try {
    const res = regenerate(recipePath, { out: "rel.md", clicker: "gary-sheng", change: { swapInput: { name: "transcript-1", path: "materials/call-v2.md" } }, run: runCmd(dir) });
    assert.equal(res.ok, true, res.error);
    assert.equal(res.childRecipe, join(realpathSync(dir), "rel.md.recipe.json"));
    assert.equal(readRecipe(res.childRecipe).data.inputs[0].path, "materials/call-v2.md");
  } finally {
    process.chdir(cwd);
  }
});

test("a reused stage whose blob is missing fails clearly instead of being reused unverified", () => {
  const dir = project();
  const { recipePath } = buildParent(dir);
  const parent = readRecipe(recipePath).data;
  unlinkSync(blobPath(dir, parent.stages[0].output.sha256));
  const out = join(dir, "essay-v2.md");
  const res = regenerate(recipePath, {
    out,
    clicker: "gary-sheng",
    change: { addInput: { name: "transcript-3", path: join(dir, "materials", "call-2.md"), reads: ["notes"] } },
    run: runCmd(dir),
  });
  assert.equal(res.ok, false);
  assert.match(res.error, /outline/);
  assert.match(res.error, /blob/);
  assert.equal(existsSync(`${out}.recipe.json`), false);
});

test("usage errors refuse before writing anything", () => {
  const dir = project();
  const { recipePath, outputPath } = buildParent(dir);
  const call2 = join(dir, "materials", "call-2.md");
  const base = { out: join(dir, "new.md"), clicker: "gary-sheng" };
  const cases = [
    ["no change", { ...base }],
    ["two changes", { ...base, change: { factoryVersion: "0.4.0", swapInput: { name: "transcript-1", path: call2 } } }],
    ["unknown change", { ...base, change: { rename: "x" } }],
    ["no clicker", { out: base.out, change: { factoryVersion: "0.4.0" } }],
    ["no out", { clicker: "gary-sheng", change: { factoryVersion: "0.4.0" } }],
    ["out is the parent output", { ...base, out: outputPath, change: { factoryVersion: "0.4.0" } }],
    ["out exists", { ...base, out: join(dir, "materials", "notes.md"), change: { factoryVersion: "0.4.0" } }],
    ["same factory version", { ...base, change: { factoryVersion: "0.3.0" } }],
    ["add an input that exists", { ...base, change: { addInput: { name: "transcript-1", path: call2 } } }],
    ["add-input reads an unknown stage", { ...base, change: { addInput: { name: "t3", path: call2, reads: ["nope"] } } }],
    ["add-input path unreadable", { ...base, change: { addInput: { name: "t3", path: join(dir, "missing.md") } } }],
    ["swap an unknown input", { ...base, change: { swapInput: { name: "nope", path: call2 } } }],
  ];
  for (const [label, opts] of cases) {
    const res = regenerate(recipePath, opts);
    assert.equal(res.ok, false, label);
    assert.equal(res.usage, true, label);
    assert.ok(res.error, label);
  }
  assert.equal(existsSync(join(dir, "new.md.recipe.json")), false);

  const missing = regenerate(join(dir, "nope.recipe.json"), { ...base, change: { factoryVersion: "0.4.0" } });
  assert.equal(missing.ok, false);
  assert.equal(missing.usage, true);
});

test("changeText overrides the generated change line", () => {
  const dir = project();
  const { recipePath } = buildParent(dir);
  const res = regenerate(recipePath, { out: join(dir, "a.md"), clicker: "gary-sheng", change: { factoryVersion: "0.4.0" }, changeText: "new model factory" });
  assert.equal(res.ok, true, res.error);
  assert.equal(readRecipe(res.childRecipe).data.change, "new model factory");
});
