import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, statSync, symlinkSync } from "node:fs";
import { tempDir } from "./tmp.mjs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The README's Recipes walkthrough IS this test: the bash block is extracted and run verbatim, and
// every line of the output block after it must appear in what it printed. Edit one and not the
// other and this fails, so the docs cannot drift from the example.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const readme = readFileSync(join(ROOT, "README.md"), "utf8");
const section = readme.slice(readme.indexOf("\n## Recipes\n")).split(/\n## (?!#)/)[1];
const blocks = [...section.matchAll(/```(\w*)\n([\s\S]*?)```/g)].map(([, lang, body]) => ({ lang, body }));
const scriptAt = blocks.findIndex((b) => b.lang === "bash");
const script = blocks[scriptAt].body;
const expected = blocks[scriptAt + 1].body.split("\n").filter((l) => l.trim());

// A throwaway project with the package installed the way npm would: node_modules/@supersuit/hyperspec
// and its bin in node_modules/.bin. npx runs a locally installed bin from there; the npx() shell
// function below does exactly that, so the walkthrough runs without the network.
function installedProject() {
  const dir = tempDir("hs-example-");
  mkdirSync(join(dir, ".git"));
  mkdirSync(join(dir, "node_modules", "@supersuit"), { recursive: true });
  mkdirSync(join(dir, "node_modules", ".bin"));
  symlinkSync(ROOT, join(dir, "node_modules", "@supersuit", "hyperspec"));
  symlinkSync(join(ROOT, "bin", "hyperspec.mjs"), join(dir, "node_modules", ".bin", "hyperspec"));
  return dir;
}

test("the README walkthrough runs the full recipe loop against examples/recipe", () => {
  assert.ok(script.includes("node factory.mjs"), "README walkthrough runs the factory");
  for (const verb of ["recipe approve", "reproduce", "regenerate", "compare"]) assert.ok(script.includes(`hyperspec ${verb}`), verb);

  const dir = installedProject();
  const env = { ...process.env, PATH: `${join(dir, "node_modules", ".bin")}:${dirname(process.execPath)}:${process.env.PATH}` };
  delete env.HYPERSPEC_STORE;
  const r = spawnSync("/bin/sh", ["-c", `set -e\nnpx() { "$@"; }\n${script}`], { cwd: dir, env, encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);

  const printed = r.stdout.split("\n");
  for (const line of expected) assert.ok(printed.includes(line), `README shows "${line}" but the walkthrough printed:\n${r.stdout}`);
  assert.match(r.stdout, /reproduces cleanly/);

  // What the walkthrough claims, checked on disk: the untouched stage kept its parent's bytes, the
  // changed one read the new call, and the child names its parent and the change.
  const demo = join(dir, "recipe-demo");
  const parent = JSON.parse(readFileSync(join(demo, "essay.md.recipe.json"), "utf8"));
  const child = JSON.parse(readFileSync(join(demo, "essay-2.md.recipe.json"), "utf8"));
  const stage = (rec, id) => rec.stages.find((s) => s.id === id);
  assert.equal(stage(child, "terms").output.sha256, stage(parent, "terms").output.sha256);
  assert.equal(stage(child, "terms").key, stage(parent, "terms").key);
  assert.notEqual(stage(child, "claims").output.sha256, stage(parent, "claims").output.sha256);
  assert.deepEqual(stage(child, "claims").reads, ["input:call", "input:call-2"]);
  assert.equal(child.parent.path, "essay.md.recipe.json");
  assert.equal(child.change, "added input call-2 (materials/call-2.md)");
  assert.equal(parent.approver, "you");

  const ledger = readFileSync(join(demo, "runs.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(ledger.map((l) => [l.kind, l.verdict]), [["compare", "improved"]]);

  // The ledger compare wrote still lints: the example spec passes all nine tests with nothing to warn.
  const lint = spawnSync(process.execPath, [join(ROOT, "bin", "hyperspec.mjs"), "lint", join(demo, "essay.hyperspec.md"), "--json"], { encoding: "utf8" });
  assert.equal(lint.status, 0, lint.stdout + lint.stderr);
  assert.deepEqual(JSON.parse(lint.stdout).files[0].findings, []);
});

test("the example spec, as shipped, lints with zero findings", () => {
  const r = spawnSync(process.execPath, [join(ROOT, "bin", "hyperspec.mjs"), "lint", join(ROOT, "examples", "recipe", "essay.hyperspec.md"), "--json"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(JSON.parse(r.stdout).files[0].findings, []);
});

test("the example ships no generated output and no personal path", () => {
  const base = join(ROOT, "examples", "recipe");
  const files = readdirSync(base, { recursive: true }).filter((f) => statSync(join(base, f)).isFile());
  assert.ok(files.includes("factory.mjs") && files.includes("runner.mjs") && files.includes("doctor.mjs"));
  for (const f of files) {
    assert.ok(!/\.recipe\.json$|^essay(-2)?\.md$|^\.hyperspec/.test(f), `${f} is generated output`);
    const text = readFileSync(join(base, f), "utf8");
    assert.ok(!/\/Users\/|\/home\/|[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/.test(text), `${f} holds a personal path or email`);
  }
});
