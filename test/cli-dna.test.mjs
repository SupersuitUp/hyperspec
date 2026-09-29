import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tempDir } from "./tmp.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const run = (...a) => spawnSync(process.execPath, [join(ROOT, "bin", "hyperspec.mjs"), ...a], { encoding: "utf8" });

const INIT_ARGS = ["--writer", "gary", "--form", "essay", "--audience", "builders", "--purpose", "explain the idea"];

function writeGolden(scopeDir, name, { why = "teaches the move", approved_by = "example-author", source = "draft", body = "A real passage of real text, worth keeping." } = {}) {
  writeFileSync(join(scopeDir, "goldens", name), `---\nwhy: ${why}\napproved_by: ${approved_by}\nsource: ${source}\n---\n\n${body}\n`);
}

// ---------------------------------------------------------------------------------------------
// dna init

test("dna init writes scope.md and an empty goldens/ folder with a README, and prints the next step", () => {
  const dir = tempDir("hs-cli-dna-");
  const scope = join(dir, "scope");
  const r = run("dna", "init", scope, ...INIT_ARGS);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(existsSync(join(scope, "scope.md")));
  assert.ok(existsSync(join(scope, "goldens", "README.md")));
  assert.match(readFileSync(join(scope, "scope.md"), "utf8"), /writer: gary/);
  assert.match(readFileSync(join(scope, "scope.md"), "utf8"), /purpose: explain the idea/);
  assert.match(r.stdout, /dna measure/);
});

test("dna init refuses to overwrite an existing scope.md (exit 2), and writes nothing new", () => {
  const dir = tempDir("hs-cli-dna-");
  const scope = join(dir, "scope");
  assert.equal(run("dna", "init", scope, ...INIT_ARGS).status, 0);
  const before = readFileSync(join(scope, "scope.md"), "utf8");
  const r = run("dna", "init", scope, ...INIT_ARGS);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /refusing to overwrite/);
  assert.equal(readFileSync(join(scope, "scope.md"), "utf8"), before);
});

test("dna init exits 2 on a missing parent folder, and never crashes with a stack trace", () => {
  const dir = tempDir("hs-cli-dna-");
  const r = run("dna", "init", join(dir, "nope", "scope"), ...INIT_ARGS);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.doesNotMatch(r.stderr, /at file:|node:internal/, "must not print a stack trace");
  assert.ok(!existsSync(join(dir, "nope")));
});

test("dna init exits 2 when a required flag is missing, naming which one", () => {
  const dir = tempDir("hs-cli-dna-");
  const r = run("dna", "init", join(dir, "scope"), "--writer", "gary", "--form", "essay", "--audience", "builders");
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /--purpose/);
  assert.ok(!existsSync(join(dir, "scope")));
});

test("dna init needs a scope-dir path (exit 2)", () => {
  const r = run("dna", "init", ...INIT_ARGS);
  assert.equal(r.status, 2, r.stdout + r.stderr);
});

// ---------------------------------------------------------------------------------------------
// dna measure

test("dna measure on a scope with a golden missing why exits 1, prints the finding, and writes no features.json", () => {
  const dir = tempDir("hs-cli-dna-");
  const scope = join(dir, "scope");
  assert.equal(run("dna", "init", scope, ...INIT_ARGS).status, 0);
  writeGolden(scope, "a.md", { why: "" });
  const r = run("dna", "measure", scope, "--json");
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const out = JSON.parse(r.stdout);
  assert.ok(out.findings.some((x) => x.id === "writing-dna-golden-why"));
  assert.ok(!existsSync(join(scope, "features.json")));
});

test("dna measure on a complete scope exits 0 and writes features.json", () => {
  const dir = tempDir("hs-cli-dna-");
  const scope = join(dir, "scope");
  assert.equal(run("dna", "init", scope, ...INIT_ARGS).status, 0);
  writeGolden(scope, "opening.md");
  const r = run("dna", "measure", scope);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(existsSync(join(scope, "features.json")));
  const written = JSON.parse(readFileSync(join(scope, "features.json"), "utf8"));
  assert.equal(written.dna, "0.1");
  assert.equal(written.goldens.length, 1);
  assert.equal(written.goldens[0].path, "goldens/opening.md");
});

test("dna measure --json prints the features and the written path, machine-readable", () => {
  const dir = tempDir("hs-cli-dna-");
  const scope = join(dir, "scope");
  assert.equal(run("dna", "init", scope, ...INIT_ARGS).status, 0);
  writeGolden(scope, "opening.md");
  const r = run("dna", "measure", scope, "--json");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.goldens, 1);
  assert.equal(out.features.word_count > 0, true);
  assert.match(out.wrote, /features\.json$/);
});

test("dna measure --json on a failing scope prints findings as JSON and exits 1", () => {
  const dir = tempDir("hs-cli-dna-");
  const scope = join(dir, "scope");
  assert.equal(run("dna", "init", scope, ...INIT_ARGS).status, 0);
  // No goldens at all.
  const r = run("dna", "measure", scope, "--json");
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const out = JSON.parse(r.stdout);
  assert.ok(out.findings.some((x) => x.id === "writing-dna-goldens-empty"));
});

test("dna measure on a scope whose approved_by is an agent exits 1 and writes nothing", () => {
  const dir = tempDir("hs-cli-dna-");
  const scope = join(dir, "scope");
  assert.equal(run("dna", "init", scope, ...INIT_ARGS).status, 0);
  writeGolden(scope, "a.md", { approved_by: "agent:claude" });
  const r = run("dna", "measure", scope, "--json");
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const out = JSON.parse(r.stdout);
  assert.ok(out.findings.some((x) => x.id === "writing-dna-golden-approved-by-agent"));
  assert.ok(!existsSync(join(scope, "features.json")));
});

test("dna measure needs a scope-dir path (exit 2)", () => {
  const r = run("dna", "measure");
  assert.equal(r.status, 2, r.stdout + r.stderr);
});

test("dna measure on a scope-dir that does not exist at all exits 1 (a finding, not a crash)", () => {
  const dir = tempDir("hs-cli-dna-");
  const r = run("dna", "measure", join(dir, "nowhere"), "--json");
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const out = JSON.parse(r.stdout);
  assert.ok(out.findings.some((x) => x.id === "writing-dna-scope-missing"));
  assert.doesNotMatch(r.stderr, /at file:|node:internal/, "must not print a stack trace");
});

// ---------------------------------------------------------------------------------------------
// unknown subcommand, and re-measuring after a golden is fixed writes a fresh features.json.

test("unknown dna subcommand is a usage error (exit 2) that prints the general help", () => {
  const r = run("dna", "bogus");
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /unknown dna subcommand: bogus/);
  assert.match(r.stderr, /hyperspec <command>/);
});

test("dna measure re-run after fixing a golden's missing field writes features.json on the second run", () => {
  const dir = tempDir("hs-cli-dna-");
  const scope = join(dir, "scope");
  assert.equal(run("dna", "init", scope, ...INIT_ARGS).status, 0);
  writeGolden(scope, "a.md", { source: "" });
  assert.equal(run("dna", "measure", scope).status, 1);
  assert.ok(!existsSync(join(scope, "features.json")));
  writeGolden(scope, "a.md", { source: "fixed" });
  const r = run("dna", "measure", scope);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(existsSync(join(scope, "features.json")));
});
