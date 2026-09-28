import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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
  for (const f of ["README.md", "SPEC.md", "CHANGELOG.md"]) assert.ok(!read(f).includes("—"), f);
});
