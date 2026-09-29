import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tempDir } from "./tmp.mjs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startRecipe } from "../src/writer.mjs";
import { regenerate } from "../src/regenerate.mjs";

// Tests for the recipe-standard verbs wired into bin/hyperspec.mjs: recipe check, recipe
// approve, reproduce, regenerate, compare. cli.test.mjs (lint/init) is untouched by this file.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const run = (...a) => spawnSync(process.execPath, [join(ROOT, "bin", "hyperspec.mjs"), ...a], { encoding: "utf8" });

// A tmp project dir with a .git folder, so storeRoot's walk-up finds a root with no --store or
// HYPERSPEC_STORE. Same convention as test/writer.test.mjs, test/regenerate.test.mjs, etc.
function project() {
  const dir = tempDir("hs-cli-recipe-");
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

// One input, one stage, a single content string the tests can control the byte-length of.
function buildSimpleParent(dir, { content = "0123456789", approve = true } = {}) {
  const specPath = writeSpec(dir);
  mkdirSync(join(dir, "materials"));
  writeFileSync(join(dir, "materials", "note.txt"), "hello");
  const outputPath = join(dir, "essay.md");
  const r = startRecipe({ output: outputPath, factory: { name: "compose", version: "0.1.0" }, spec: specPath, clicker: "gary-sheng" });
  r.input("note", join(dir, "materials", "note.txt"));
  r.stage({ id: "compose", reads: ["input:note"], output: content, verdict: { station: "compose-ok", pass: true, note: "" } });
  const { path } = r.finish(approve ? { approver: "gary-sheng" } : {});
  return { recipePath: path, outputPath, specPath, dir };
}

// Three stages so add-input --reads can be proven to touch only what it names: outline and notes
// both read only the input, draft reads both of them.
function buildThreeStageParent(dir) {
  const specPath = writeSpec(dir);
  mkdirSync(join(dir, "materials"));
  writeFileSync(join(dir, "materials", "note.txt"), "hello");
  const outputPath = join(dir, "essay.md");
  const r = startRecipe({ output: outputPath, factory: { name: "compose", version: "0.1.0" }, spec: specPath, clicker: "gary-sheng" });
  r.input("note", join(dir, "materials", "note.txt"));
  r.stage({ id: "outline", reads: ["input:note"], output: "outline body", verdict: { station: "s", pass: true, note: "" } });
  r.stage({ id: "notes", reads: ["input:note"], output: "notes body", verdict: { station: "s", pass: true, note: "" } });
  r.stage({ id: "draft", reads: ["stage:outline", "stage:notes"], output: "draft body", verdict: { station: "s", pass: true, note: "" } });
  const { path } = r.finish({ approver: "gary-sheng" });
  return { recipePath: path, outputPath, specPath, dir };
}

const sq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

// A pass-through runner: prints the bytes of the first (only) read and a passing verdict.
// Deterministic, always exits 0. With silent, it reports no verdict at all.
function passThroughRunner(dir, { silent = false } = {}) {
  const path = join(dir, silent ? "pass-through-silent.sh" : "pass-through.sh");
  writeFileSync(
    path,
    `input=$(cat)
first=$(printf '%s' "$input" | sed 's/.*"reads":\\[{"ref":"[^"]*","sha256":"[^"]*","path":"\\([^"]*\\)".*/\\1/')
cat "$first"
${silent ? "" : `printf 'VERDICT {"pass":true}\\n' >&2`}
`,
  );
  return `/bin/sh ${sq(path)}`;
}

// Exits nonzero when the named stage is the one running.
function failingRunner(dir, failStage) {
  const path = join(dir, "failing.sh");
  writeFileSync(
    path,
    `input=$(cat)
stage=$(printf '%s' "$input" | sed 's/^{"stage":"\\([^"]*\\)".*/\\1/')
if [ "$stage" = "${failStage}" ]; then echo "boom" >&2; exit 4; fi
printf 'ok'
printf 'VERDICT {"pass":true}\\n' >&2
`,
  );
  return `/bin/sh ${sq(path)}`;
}

// Pass-through, but reports a failing verdict (pass:false) for the named stage.
function failingVerdictRunner(dir, failStage) {
  const path = join(dir, "failing-verdict.sh");
  writeFileSync(
    path,
    `input=$(cat)
stage=$(printf '%s' "$input" | sed 's/^{"stage":"\\([^"]*\\)".*/\\1/')
first=$(printf '%s' "$input" | sed 's/.*"reads":\\[{"ref":"[^"]*","sha256":"[^"]*","path":"\\([^"]*\\)".*/\\1/')
cat "$first"
if [ "$stage" = "${failStage}" ]; then printf 'VERDICT {"station":"s","pass":false,"note":"nope"}\\n' >&2; else printf 'VERDICT {"pass":true}\\n' >&2; fi
`,
  );
  return `/bin/sh ${sq(path)}`;
}

// The doctor: scores an output by its byte length.
function doctorCmd(dir) {
  const path = join(dir, "doctor.sh");
  writeFileSync(
    path,
    `input=$(cat)
output=$(printf '%s' "$input" | sed 's/.*"output":"\\([^"]*\\)".*/\\1/')
n=$(wc -c < "$output" | tr -d ' ')
printf '{"score":%s}\\n' "$n"
`,
  );
  return `/bin/sh ${sq(path)}`;
}

// =============================================== recipe check ================================

test("recipe check: a clean, approved recipe exits 0", () => {
  const dir = project();
  const { outputPath } = buildSimpleParent(dir);
  const r = run("recipe", "check", outputPath);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /ok/);
});

test("recipe check: warn-only (a stage that reads everything) still exits 0", () => {
  const dir = project();
  const specPath = writeSpec(dir);
  mkdirSync(join(dir, "materials"));
  writeFileSync(join(dir, "materials", "note.txt"), "hello");
  const outputPath = join(dir, "essay.md");
  const w = startRecipe({ output: outputPath, factory: { name: "compose", version: "0.1.0" }, spec: specPath, clicker: "gary-sheng" });
  w.input("note", join(dir, "materials", "note.txt"));
  w.stage({ id: "compose", reads: [], output: "body", verdict: { station: "s", pass: true, note: "" } });
  w.finish({ approver: "gary-sheng" });
  const r = run("recipe", "check", outputPath);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /warn.*declares no reads/);
});

test("recipe check: no recipe beside the output exits 1", () => {
  const dir = project();
  const outputPath = join(dir, "nope.md");
  writeFileSync(outputPath, "hi");
  const r = run("recipe", "check", outputPath);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /no recipe beside/);
});

test("recipe check: an unapproved recipe (approver missing) is a fail, exit 1", () => {
  const dir = project();
  const { outputPath } = buildSimpleParent(dir, { approve: false });
  const r = run("recipe", "check", outputPath);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /fail \[approver\]/);
});

test("recipe check: invalid JSON in the recipe file exits 2", () => {
  const dir = project();
  const { outputPath, recipePath } = buildSimpleParent(dir);
  writeFileSync(recipePath, "{ not json");
  const r = run("recipe", "check", outputPath);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /invalid JSON/);
});

test("recipe check: a path already ending .recipe.json is used as-is", () => {
  const dir = project();
  const { recipePath } = buildSimpleParent(dir);
  const r = run("recipe", "check", recipePath);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("recipe check: --json prints one document with the findings, same exit code", () => {
  const dir = project();
  const { outputPath } = buildSimpleParent(dir, { approve: false });
  const r = run("recipe", "check", outputPath, "--json");
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const out = JSON.parse(r.stdout);
  assert.ok(Array.isArray(out.findings));
  assert.ok(out.findings.some((f) => f.field === "approver" && f.severity === "fail"));
});

test("recipe check: an unknown flag is a usage error, exit 2", () => {
  const dir = project();
  const { outputPath } = buildSimpleParent(dir);
  const r = run("recipe", "check", outputPath, "--bogus");
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /unknown flag: --bogus/);
});

// =============================================== recipe approve ==============================

test("recipe approve: sets the approver and prints remaining findings, exit 0", () => {
  const dir = project();
  const { recipePath } = buildSimpleParent(dir, { approve: false });
  const r = run("recipe", "approve", recipePath, "--by", "gary-sheng");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /approver set to gary-sheng/);
  assert.match(r.stdout, /ok/);
  const data = JSON.parse(readFileSync(recipePath, "utf8"));
  assert.equal(data.approver, "gary-sheng");
});

test("recipe approve: missing --by exits 2", () => {
  const dir = project();
  const { recipePath } = buildSimpleParent(dir, { approve: false });
  const r = run("recipe", "approve", recipePath);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /--by/);
});

test("recipe approve: an unreadable recipe exits 2", () => {
  const dir = project();
  const r = run("recipe", "approve", join(dir, "nope.recipe.json"), "--by", "gary-sheng");
  assert.equal(r.status, 2, r.stdout + r.stderr);
});

test("recipe approve: --json prints the findings and approver, same exit code", () => {
  const dir = project();
  const { recipePath } = buildSimpleParent(dir, { approve: false });
  const r = run("recipe", "approve", recipePath, "--by", "gary-sheng", "--json");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.approver, "gary-sheng");
  assert.deepEqual(out.findings, []);
});

test("recipe approve: an unknown flag is a usage error, exit 2", () => {
  const dir = project();
  const { recipePath } = buildSimpleParent(dir, { approve: false });
  const r = run("recipe", "approve", recipePath, "--by", "gary-sheng", "--bogus");
  assert.equal(r.status, 2, r.stdout + r.stderr);
});

// =============================================== reproduce ====================================

test("reproduce: a clean recipe reproduces cleanly, exit 0", () => {
  const dir = project();
  const { recipePath } = buildSimpleParent(dir);
  const r = run("reproduce", recipePath);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /reproduces cleanly/);
});

test("reproduce: an edited output file is the first mismatch, exit 1", () => {
  const dir = project();
  const { recipePath, outputPath } = buildSimpleParent(dir);
  writeFileSync(outputPath, "tampered");
  const r = run("reproduce", recipePath);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /first mismatch: output:file/);
});

test("reproduce: --restore fixes an edited output file and exits 0", () => {
  const dir = project();
  const { recipePath, outputPath } = buildSimpleParent(dir, { content: "original bytes" });
  writeFileSync(outputPath, "tampered");
  const r = run("reproduce", recipePath, "--restore");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /restored the output file/);
  assert.equal(readFileSync(outputPath, "utf8"), "original bytes");
});

test("reproduce: an unreadable recipe exits 2", () => {
  const dir = project();
  const r = run("reproduce", join(dir, "nope.recipe.json"));
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /cannot read/);
});

test("reproduce: an explicit empty --store makes every blob check fail, exit 1", () => {
  const dir = project();
  const { recipePath } = buildSimpleParent(dir);
  const emptyStore = tempDir("hs-cli-empty-store-");
  const r = run("reproduce", recipePath, "--store", emptyStore);
  assert.equal(r.status, 1, r.stdout + r.stderr);
});

test("reproduce: --json prints the full result, same exit code", () => {
  const dir = project();
  const { recipePath } = buildSimpleParent(dir);
  const r = run("reproduce", recipePath, "--json");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.ok, true);
  assert.equal(out.firstMismatch, null);
});

test("reproduce: an unknown flag is a usage error, exit 2", () => {
  const dir = project();
  const { recipePath } = buildSimpleParent(dir);
  const r = run("reproduce", recipePath, "--bogus");
  assert.equal(r.status, 2, r.stdout + r.stderr);
});

// =============================================== regenerate ===================================

test("regenerate: with a runner, an unpending, fully-passing run exits 0 and writes the child", () => {
  const dir = project();
  const { recipePath } = buildSimpleParent(dir);
  const swapped = join(dir, "materials", "swapped.txt");
  writeFileSync(swapped, "x".repeat(20));
  const out = join(dir, "essay-v2.md");
  const r = run(
    "regenerate", recipePath,
    "--out", out, "--clicker", "gary-sheng",
    "--swap-input", `note=${swapped}`,
    "--run", passThroughRunner(dir),
  );
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /compose: rerun/);
  assert.match(r.stdout, /child recipe:/);
  assert.ok(existsSync(`${out}.recipe.json`));
  assert.ok(existsSync(out));
});

test("regenerate: --reads only touches the named stage; a sibling stage is reused", () => {
  const dir = project();
  const { recipePath } = buildThreeStageParent(dir);
  const extra = join(dir, "materials", "extra.txt");
  writeFileSync(extra, "extra");
  const out = join(dir, "essay-v2.md");
  const r = run(
    "regenerate", recipePath,
    "--out", out, "--clicker", "gary-sheng",
    "--add-input", `extra=${extra}`,
    "--reads", "outline",
    "--run", passThroughRunner(dir),
  );
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /outline: rerun/);
  assert.match(r.stdout, /notes: reuse/);
  assert.match(r.stdout, /draft: rerun/); // transitive reader of outline
});

test("regenerate: --reads given twice attaches the new input to both named stages", () => {
  const dir = project();
  const { recipePath } = buildThreeStageParent(dir);
  const extra = join(dir, "materials", "extra.txt");
  writeFileSync(extra, "extra");
  const out = join(dir, "essay-v2.md");
  const r = run(
    "regenerate", recipePath,
    "--out", out, "--clicker", "gary-sheng",
    "--add-input", `extra=${extra}`,
    "--reads", "outline", "--reads", "notes",
    "--run", passThroughRunner(dir),
  );
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /outline: rerun/);
  assert.match(r.stdout, /notes: rerun/);
  assert.match(r.stdout, /draft: rerun/);
  const child = JSON.parse(readFileSync(`${out}.recipe.json`, "utf8"));
  const reads = Object.fromEntries(child.stages.map((st) => [st.id, st.reads]));
  assert.deepEqual(reads.outline, ["input:note", "input:extra"]);
  assert.deepEqual(reads.notes, ["input:note", "input:extra"]);
  assert.deepEqual(reads.draft, ["stage:outline", "stage:notes"]);
});

test("regenerate: a --swap-input path containing = keeps everything after the first =", () => {
  const dir = project();
  const { recipePath } = buildSimpleParent(dir);
  const swapped = join(dir, "materials", "a=b.txt");
  writeFileSync(swapped, "different bytes");
  const out = join(dir, "essay-v2.md");
  const r = run("regenerate", recipePath, "--out", out, "--clicker", "gary-sheng", "--swap-input", `note=${swapped}`, "--run", passThroughRunner(dir));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const child = JSON.parse(readFileSync(`${out}.recipe.json`, "utf8"));
  assert.equal(child.inputs[0].path, "materials/a=b.txt");
});

test("regenerate: no --run leaves the changed stage pending, exit 3", () => {
  const dir = project();
  const { recipePath } = buildSimpleParent(dir);
  const swapped = join(dir, "materials", "swapped.txt");
  writeFileSync(swapped, "different bytes");
  const out = join(dir, "essay-v2.md");
  const r = run("regenerate", recipePath, "--out", out, "--clicker", "gary-sheng", "--swap-input", `note=${swapped}`);
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.match(r.stdout, /pending; stages waiting for a runner: compose/);
  assert.match(r.stdout, /rerun regenerate on the parent with --run <command> and a new --out/);
  assert.ok(existsSync(`${out}.recipe.json`));
  assert.ok(!existsSync(out));
});

test("regenerate: a runner that fails the stage exits 1 and writes nothing", () => {
  const dir = project();
  const { recipePath } = buildSimpleParent(dir);
  const swapped = join(dir, "materials", "swapped.txt");
  writeFileSync(swapped, "different bytes");
  const out = join(dir, "essay-v2.md");
  const r = run(
    "regenerate", recipePath,
    "--out", out, "--clicker", "gary-sheng",
    "--swap-input", `note=${swapped}`,
    "--run", failingRunner(dir, "compose"),
  );
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /stage compose failed/);
  assert.ok(!existsSync(`${out}.recipe.json`));
});

test("regenerate: a failing verdict still writes the child, exit 1", () => {
  const dir = project();
  const { recipePath } = buildSimpleParent(dir);
  const swapped = join(dir, "materials", "swapped.txt");
  writeFileSync(swapped, "different bytes");
  const out = join(dir, "essay-v2.md");
  const r = run(
    "regenerate", recipePath,
    "--out", out, "--clicker", "gary-sheng",
    "--swap-input", `note=${swapped}`,
    "--run", failingVerdictRunner(dir, "compose"),
  );
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /child written despite failing verdict\(s\): compose/);
  assert.ok(existsSync(`${out}.recipe.json`));
});

test("regenerate: a runner that reports no verdict is a failing verdict, exit 1", () => {
  const dir = project();
  const { recipePath } = buildSimpleParent(dir);
  const swapped = join(dir, "materials", "swapped.txt");
  writeFileSync(swapped, "different bytes");
  const out = join(dir, "essay-v2.md");
  const r = run(
    "regenerate", recipePath,
    "--out", out, "--clicker", "gary-sheng",
    "--swap-input", `note=${swapped}`,
    "--run", passThroughRunner(dir, { silent: true }),
  );
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /child written despite failing verdict\(s\): compose/);
  const child = JSON.parse(readFileSync(`${out}.recipe.json`, "utf8"));
  assert.deepEqual(child.stages[0].verdict, { station: "runner", pass: false, note: "runner reported no verdict" });
});

test("regenerate: --add-input that no stage reads is a usage error, exit 2", () => {
  const dir = project();
  const { recipePath } = buildThreeStageParent(dir);
  writeFileSync(join(dir, "materials", "extra.txt"), "an extra input");
  const out = join(dir, "essay-v2.md");
  const r = run("regenerate", recipePath, "--out", out, "--clicker", "gary-sheng", "--add-input", `extra=${join(dir, "materials", "extra.txt")}`, "--run", passThroughRunner(dir));
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /no stage reads input extra; add --reads <stage>/);
  assert.ok(!existsSync(`${out}.recipe.json`));
});

test("regenerate: no change flag is a usage error, exit 2", () => {
  const dir = project();
  const { recipePath } = buildSimpleParent(dir);
  const out = join(dir, "essay-v2.md");
  const r = run("regenerate", recipePath, "--out", out, "--clicker", "gary-sheng");
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /exactly one change is required/);
});

test("regenerate: --reads without --add-input is a usage error, exit 2", () => {
  const dir = project();
  const { recipePath } = buildSimpleParent(dir);
  const swapped = join(dir, "materials", "swapped.txt");
  writeFileSync(swapped, "different bytes");
  const out = join(dir, "essay-v2.md");
  const r = run("regenerate", recipePath, "--out", out, "--clicker", "gary-sheng", "--swap-input", `note=${swapped}`, "--reads", "compose");
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /--reads is only valid with --add-input/);
});

test("regenerate: a malformed --add-input (no name=path) is a usage error, exit 2", () => {
  const dir = project();
  const { recipePath } = buildSimpleParent(dir);
  const out = join(dir, "essay-v2.md");
  const r = run("regenerate", recipePath, "--out", out, "--clicker", "gary-sheng", "--add-input", "nameOnlyNoPath");
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /name=path/);
});

test("regenerate: an unknown flag is a usage error, exit 2", () => {
  const dir = project();
  const { recipePath } = buildSimpleParent(dir);
  const out = join(dir, "essay-v2.md");
  const r = run("regenerate", recipePath, "--out", out, "--clicker", "gary-sheng", "--factory-version", "0.2.0", "--bogus");
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /unknown flag: --bogus/);
});

test("regenerate: a value-taking flag with no value (followed by another flag) is a usage error, exit 2", () => {
  const dir = project();
  const { recipePath } = buildSimpleParent(dir);
  const r = run("regenerate", recipePath, "--out", "--clicker", "gary-sheng", "--factory-version", "0.2.0");
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /--out needs a value/);
});

test("regenerate: --json prints the full result, same exit code", () => {
  const dir = project();
  const { recipePath } = buildSimpleParent(dir);
  const out = join(dir, "essay-v2.md");
  const r = run("regenerate", recipePath, "--out", out, "--clicker", "gary-sheng", "--factory-version", "0.2.0", "--json");
  assert.equal(r.status, 3, r.stdout + r.stderr); // no --run, so the changed factory version leaves the stage pending
  const parsed = JSON.parse(r.stdout);
  assert.equal(parsed.pending, true);
  assert.ok(parsed.childRecipe);
});

// =============================================== compare ======================================

test("compare: an improved child is not regressed, exit 0", () => {
  const dir = project();
  const { recipePath } = buildSimpleParent(dir, { content: "0123456789" }); // 10 bytes
  const swapped = join(dir, "materials", "swapped.txt");
  writeFileSync(swapped, "x".repeat(33));
  const out = join(dir, "essay-v2.md");
  const res = regenerate(recipePath, { out, clicker: "gary-sheng", change: { swapInput: { name: "note", path: swapped } }, run: passThroughRunner(dir) });
  assert.equal(res.ok, true, res.error);

  const r = run("compare", res.childRecipe, "--doctor", doctorCmd(dir));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /child scored 33 vs parent 10/);
});

test("compare: a regressed child names the suspect, exit 1", () => {
  const dir = project();
  const { recipePath } = buildSimpleParent(dir, { content: "0123456789" }); // 10 bytes
  const swapped = join(dir, "materials", "swapped.txt");
  writeFileSync(swapped, "ab"); // 2 bytes
  const out = join(dir, "essay-v2.md");
  const res = regenerate(recipePath, { out, clicker: "gary-sheng", change: { swapInput: { name: "note", path: swapped } }, run: passThroughRunner(dir) });
  assert.equal(res.ok, true, res.error);

  const r = run("compare", res.childRecipe, "--doctor", doctorCmd(dir));
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /regression: child scored 2 vs parent 10; suspect:/);
});

test("compare: a missing doctor is a usage error, exit 2", () => {
  const dir = project();
  const { recipePath } = buildSimpleParent(dir);
  const swapped = join(dir, "materials", "swapped.txt");
  writeFileSync(swapped, "x".repeat(5));
  const out = join(dir, "essay-v2.md");
  const res = regenerate(recipePath, { out, clicker: "gary-sheng", change: { swapInput: { name: "note", path: swapped } }, run: passThroughRunner(dir) });
  assert.equal(res.ok, true, res.error);

  const r = run("compare", res.childRecipe);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /doctor/);
});

test("compare: a missing output file is a check-failed error, exit 2 (unreadable input)", () => {
  const dir = project();
  const { recipePath } = buildSimpleParent(dir);
  const swapped = join(dir, "materials", "swapped.txt");
  writeFileSync(swapped, "x".repeat(5));
  const out = join(dir, "essay-v2.md");
  const res = regenerate(recipePath, { out, clicker: "gary-sheng", change: { swapInput: { name: "note", path: swapped } }, run: passThroughRunner(dir) });
  assert.equal(res.ok, true, res.error);
  unlinkSync(out);

  const r = run("compare", res.childRecipe, "--doctor", doctorCmd(dir));
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /cannot read the child's output/);
});

test("compare: a declared ledger gets a line appended and its path printed", () => {
  const dir = project();
  const specPath = writeSpec(dir, { ledger: "runs.jsonl" });
  mkdirSync(join(dir, "materials"));
  writeFileSync(join(dir, "materials", "note.txt"), "hello");
  const outputPath = join(dir, "essay.md");
  const w = startRecipe({ output: outputPath, factory: { name: "compose", version: "0.1.0" }, spec: specPath, clicker: "gary-sheng" });
  w.input("note", join(dir, "materials", "note.txt"));
  w.stage({ id: "compose", reads: ["input:note"], output: "0123456789", verdict: { station: "s", pass: true, note: "" } });
  const { path: recipePath } = w.finish({ approver: "gary-sheng" });

  const swapped = join(dir, "materials", "swapped.txt");
  writeFileSync(swapped, "x".repeat(33));
  const out = join(dir, "essay-v2.md");
  const res = regenerate(recipePath, { out, clicker: "gary-sheng", change: { swapInput: { name: "note", path: swapped } }, run: passThroughRunner(dir) });
  assert.equal(res.ok, true, res.error);

  const r = run("compare", res.childRecipe, "--doctor", doctorCmd(dir));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /ledger: /);
  const ledgerPath = join(dir, "runs.jsonl");
  assert.ok(existsSync(ledgerPath));
  const lines = readFileSync(ledgerPath, "utf8").trim().split("\n");
  assert.equal(JSON.parse(lines[lines.length - 1]).verdict, "improved");
});

test("compare: --json prints the full result, same exit code", () => {
  const dir = project();
  const { recipePath } = buildSimpleParent(dir, { content: "0123456789" });
  const swapped = join(dir, "materials", "swapped.txt");
  writeFileSync(swapped, "x".repeat(33));
  const out = join(dir, "essay-v2.md");
  const res = regenerate(recipePath, { out, clicker: "gary-sheng", change: { swapInput: { name: "note", path: swapped } }, run: passThroughRunner(dir) });
  assert.equal(res.ok, true, res.error);

  const r = run("compare", res.childRecipe, "--doctor", doctorCmd(dir), "--json");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const out2 = JSON.parse(r.stdout);
  assert.equal(out2.ok, true);
  assert.equal(out2.regressed, false);
});

test("compare: an unknown flag is a usage error, exit 2", () => {
  const dir = project();
  const { recipePath } = buildSimpleParent(dir);
  const swapped = join(dir, "materials", "swapped.txt");
  writeFileSync(swapped, "x".repeat(5));
  const out = join(dir, "essay-v2.md");
  const res = regenerate(recipePath, { out, clicker: "gary-sheng", change: { swapInput: { name: "note", path: swapped } }, run: passThroughRunner(dir) });
  assert.equal(res.ok, true, res.error);

  const r = run("compare", res.childRecipe, "--doctor", doctorCmd(dir), "--bogus");
  assert.equal(r.status, 2, r.stdout + r.stderr);
});

test("compare: a parent output edited by hand since its recipe exits 2 and names the fix", () => {
  const dir = project();
  const { recipePath, outputPath } = buildSimpleParent(dir, { content: "0123456789" });
  const swapped = join(dir, "materials", "swapped.txt");
  writeFileSync(swapped, "x".repeat(12));
  const out = join(dir, "essay-v2.md");
  const res = regenerate(recipePath, { out, clicker: "gary-sheng", change: { swapInput: { name: "note", path: swapped } }, run: passThroughRunner(dir) });
  assert.equal(res.ok, true, res.error);
  writeFileSync(outputPath, "0123456789 and a paragraph added by hand");

  const r = run("compare", res.childRecipe, "--doctor", doctorCmd(dir));
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /parent output does not match its recipe; run hyperspec reproduce --restore/);
});

test("compare: text mode warns when the spec moved since the parent was made", () => {
  const dir = project();
  const { recipePath } = buildSimpleParent(dir, { content: "0123456789" });
  const swapped = join(dir, "materials", "swapped.txt");
  writeFileSync(swapped, "x".repeat(12));
  const out = join(dir, "essay-v2.md");
  const res = regenerate(recipePath, { out, clicker: "gary-sheng", change: { swapInput: { name: "note", path: swapped } }, run: passThroughRunner(dir) });
  assert.equal(res.ok, true, res.error);
  writeSpec(dir, { ledger: "runs.jsonl" }); // the spec on disk now differs from the one both were made from

  const r = run("compare", res.childRecipe, "--doctor", doctorCmd(dir));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /warn: spec changed since the parent was made; both outputs graded against the current file/);
});
