import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tempDir } from "./tmp.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const run = (...a) => spawnSync(process.execPath, [join(ROOT, "bin", "hyperspec.mjs"), ...a], { encoding: "utf8" });
// Like run(), but in a chosen working directory, so a relative scope-dir argument stays relative
// end to end (run() always executes from wherever the test runner's own cwd is, which is not
// useful for proving a CLI prints paths as given rather than resolved).
const runIn = (cwd, ...a) => spawnSync(process.execPath, [join(ROOT, "bin", "hyperspec.mjs"), ...a], { encoding: "utf8", cwd });

const INIT_ARGS = ["--writer", "example-author", "--form", "essay", "--audience", "builders", "--purpose", "explain the idea"];

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
  assert.match(readFileSync(join(scope, "scope.md"), "utf8"), /writer: example-author/);
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
  const r = run("dna", "init", join(dir, "scope"), "--writer", "example-author", "--form", "essay", "--audience", "builders");
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /--purpose/);
  assert.ok(!existsSync(join(dir, "scope")));
});

test("dna init needs a scope-dir path (exit 2)", () => {
  const r = run("dna", "init", ...INIT_ARGS);
  assert.equal(r.status, 2, r.stdout + r.stderr);
});

// dna init once built its "wrote ..."/"refusing to overwrite ..." messages from the
// resolved absolute scope-dir instead of the relative string the operator actually typed. Only a
// RELATIVE scope-dir argument, run from a chosen cwd, exercises this: an already-absolute
// tempDir()-built path (every other dna init test in this file) resolves to itself, so it cannot
// tell "prints as given" apart from "prints resolved".
test("dna init prints every path as given (relative), never resolved to an absolute path", () => {
  const dir = tempDir("hs-cli-dna-");
  const escapedDir = dir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const r = runIn(dir, "dna", "init", "scope", ...INIT_ARGS);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^wrote scope\/scope\.md and scope\/goldens\/\./m);
  assert.doesNotMatch(r.stdout, new RegExp(escapedDir), "must never print the resolved absolute scope-dir");

  const r2 = runIn(dir, "dna", "init", "scope", ...INIT_ARGS);
  assert.equal(r2.status, 2, r2.stdout + r2.stderr);
  assert.match(r2.stderr, /^refusing to overwrite scope\/scope\.md$/m);
  assert.doesNotMatch(r2.stderr, new RegExp(escapedDir), "must never print the resolved absolute scope-dir");
});

// A placeholder-looking flag value used to write straight through to
// scope.md and only fail on the next `dna measure`. It is refused here instead, naming the flag,
// so the placeholder never lands on disk.
test("dna init refuses a placeholder flag value (exit 2), naming the flag, and writes nothing", () => {
  const dir = tempDir("hs-cli-dna-");
  const scope = join(dir, "scope");
  const r = run("dna", "init", scope, "--writer", "TODO", "--form", "essay", "--audience", "builders", "--purpose", "explain the idea");
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /--writer/);
  assert.ok(!existsSync(scope));
});

test("dna init refuses a placeholder flag value for any of the four flags, not only --writer", () => {
  const dir = tempDir("hs-cli-dna-");
  for (const flag of ["--form", "--audience", "--purpose"]) {
    const args = INIT_ARGS.map((v, i) => (INIT_ARGS[i - 1] === flag ? "???" : v));
    const scope = join(dir, `scope-${flag.slice(2)}`);
    const r = run("dna", "init", scope, ...args);
    assert.equal(r.status, 2, `${flag}: ${r.stdout + r.stderr}`);
    assert.match(r.stderr, new RegExp(flag), flag);
    assert.ok(!existsSync(scope), flag);
  }
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

// ---------------------------------------------------------------------------------------------
// A goldens/ folder that resolves outside its scope, and an operator's own goldens/README.md

test("dna measure refuses a goldens/ folder that is a symlink to another scope's goldens (exit 1), naming the real target, and writes nothing", () => {
  const dir = tempDir("hs-cli-dna-");
  assert.equal(runIn(dir, "dna", "init", "theology", ...INIT_ARGS).status, 0);
  writeGolden(join(dir, "theology"), "grace.md");
  assert.equal(runIn(dir, "dna", "init", "memo", ...INIT_ARGS).status, 0);
  rmSync(join(dir, "memo", "goldens"), { recursive: true });
  symlinkSync(join(dir, "theology", "goldens"), join(dir, "memo", "goldens"));
  const r = runIn(dir, "dna", "measure", "memo");
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /\.\.\/theology\/goldens/);
  assert.doesNotMatch(r.stdout, /\/private\/|\/tmp\/|\/Users\//);
  assert.ok(!existsSync(join(dir, "memo", "features.json")));
});

test("dna init over a folder with no scope.md never overwrites an existing goldens/README.md", () => {
  const dir = tempDir("hs-cli-dna-");
  const scope = join(dir, "scope");
  mkdirSync(join(scope, "goldens"), { recursive: true });
  writeFileSync(join(scope, "goldens", "README.md"), "my own notes on these goldens\n");
  writeGolden(scope, "kept.md");
  const r = run("dna", "init", scope, ...INIT_ARGS);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(existsSync(join(scope, "scope.md")));
  assert.equal(readFileSync(join(scope, "goldens", "README.md"), "utf8"), "my own notes on these goldens\n");
});
