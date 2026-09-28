import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

test("SPEC.md is a hyperspec and passes its own lint", () => {
  const r = spawnSync(process.execPath, [join(ROOT, "bin", "hyperspec.mjs"), "lint", join(ROOT, "SPEC.md")], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("SPEC.md and package.json agree on the version", () => {
  const v = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;
  assert.match(readFileSync(join(ROOT, "SPEC.md"), "utf8"), new RegExp(`\\*\\*Version ${v.replace(/\./g, "\\.")}\\*\\*`));
});

test("SPEC.md states all nine tests by the names the linter uses", async () => {
  const { TESTS } = await import("../src/rules.mjs");
  const spec = readFileSync(join(ROOT, "SPEC.md"), "utf8").toLowerCase();
  for (const t of TESTS) assert.ok(spec.includes(t.name), t.name);
});
