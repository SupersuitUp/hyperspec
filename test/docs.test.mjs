import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tempDir } from "./tmp.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

test("CHANGELOG has an entry for the package version", () => {
  const v = JSON.parse(read("package.json")).version;
  assert.match(read("CHANGELOG.md"), new RegExp(`^## ${v.replace(/\./g, "\\.")}`, "m"));
});

test("README shows both commands and the exit codes", () => {
  const r = read("README.md");
  for (const s of ["hyperspec lint", "hyperspec init", "exit"]) assert.ok(r.includes(s), s);
});

test("no em dash in the docs", () => {
  for (const f of ["README.md", "SPEC.md", "CHANGELOG.md", "WRITING.md"]) assert.ok(!read(f).includes("—"), f);
});

test("the README's sample output is exactly what lint prints for a passing spec.md", async () => {
  const { spawnSync } = await import("node:child_process");
  const { cpSync } = await import("node:fs");
  const d = tempDir("hs-readme-");
  cpSync(join(ROOT, "examples"), d, { recursive: true });
  cpSync(join(d, "minimal.hyperspec.md"), join(d, "spec.md"));
  const r = spawnSync(process.execPath, [join(ROOT, "bin", "hyperspec.mjs"), "lint", "spec.md"], { cwd: d, encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const readme = read("README.md");
  assert.ok(readme.includes("lint spec.md"), "README runs lint on spec.md");
  assert.ok(readme.includes("```\n" + r.stdout + "```"), `README sample must be exactly:\n${r.stdout}`);
});

test("no workflow echoes backticks inside double quotes, where the shell would run them", () => {
  for (const f of [".github/workflows/ci.yml", ".github/workflows/publish.yml"]) {
    const bad = read(f).split("\n").filter((l) => /\becho\s+"[^"]*`[^"]*"/.test(l));
    assert.deepEqual(bad, [], f);
  }
});

test("no em dash in any shipped code or example file", async () => {
  const { readdirSync, statSync } = await import("node:fs");
  const walk = (dir) => readdirSync(join(ROOT, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    return statSync(join(ROOT, rel)).isDirectory() ? walk(rel) : [rel];
  });
  const files = ["bin", "src", "examples"].flatMap(walk);
  assert.ok(files.length > 20, `walked ${files.length} files`);
  assert.deepEqual(files.filter((f) => read(f).includes("—")), []);
});
