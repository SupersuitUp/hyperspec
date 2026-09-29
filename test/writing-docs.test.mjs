import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tempDir } from "./tmp.mjs";
import { MATERIAL_LABELS, BLOCKS } from "../src/writing.mjs";

// WRITING.md is the public description of the writing profile. These tests hold it to what the
// linter actually does, so the page cannot promise a shape the reader will not parse or a rule the
// linter does not enforce.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const doc = readFileSync(join(ROOT, "WRITING.md"), "utf8");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

test("WRITING.md ships in the npm tarball, and so do the worked examples", () => {
  assert.ok(pkg.files.includes("WRITING.md"), "package.json files lists WRITING.md");
  assert.ok(pkg.files.some((f) => "examples/writing/essay.hyperspec.md".startsWith(f)), "examples/ ships");
});

// Build 4, task 2: materials.items[].segments is now required (marking is required once 0.4
// ships). The "## The schema" block in WRITING.md does not carry one yet; that is task 4's job
// (the schema doc gains segments: alongside the materials-labels section). Until then this splice
// fails on a true positive (an unmarked material), not a regression.
test("the schema block, spliced into the essay example, lints with zero findings", { todo: "task 4: WRITING.md schema gains segments" }, () => {
  const schema = doc.split("\n## The schema\n")[1].match(/```yaml\n([\s\S]*?)```/)[1];
  const essay = readFileSync(join(ROOT, "examples", "writing", "essay.hyperspec.md"), "utf8");
  // The essay's core frontmatter (decisions through improvement), then the schema block in place of
  // the essay's own profile and writing blocks.
  const core = essay.slice(0, essay.indexOf("\nwriting:\n") + 1).replace("profile: writing\n", "");
  const d = tempDir("hs-writing-doc-");
  cpSync(join(ROOT, "examples", "writing"), d, { recursive: true });
  for (const [p, text] of [["materials/voice-memo.md", "memo\n"], ["goldens/opening.md", "golden\n"], ["world/ines.json", "{}\n"]]) {
    mkdirSync(join(d, dirname(p)), { recursive: true });
    writeFileSync(join(d, p), text);
  }
  writeFileSync(join(d, "spec.md"), `${core}${schema}---\n\n# Schema\n`);
  const r = spawnSync(process.execPath, [join(ROOT, "bin", "hyperspec.mjs"), "lint", "spec.md", "--json"], { cwd: d, encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const file = JSON.parse(r.stdout).files[0];
  assert.deepEqual(file.findings, []);
  assert.deepEqual(file.profile, { name: "writing", complete: 9, total: 9 });
});

test("the materials labels table lists exactly MATERIAL_LABELS, in order", () => {
  const section = doc.split("\n## Materials labels\n")[1].split("\n## ")[0];
  const labels = [...section.matchAll(/^\| `([a-z]+)` \|/gm)].map((m) => m[1]);
  assert.deepEqual(labels, [...MATERIAL_LABELS]);
});

test("the schema names every block the linter checks", () => {
  for (const b of BLOCKS) assert.match(doc, new RegExp(`^  ${b}:`, "m"), b);
});

test("WRITING.md names no personal path and no email", () => {
  assert.ok(!/\/Users\/|\/home\/|[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/.test(doc));
});

test("the test mapping table has one row for each of the nine tests", () => {
  const section = doc.split("\n## The test mapping\n")[1].split("\n## ")[0];
  const rows = [...section.matchAll(/^\| ([1-9]) /gm)].map((m) => Number(m[1]));
  assert.deepEqual(rows, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});
