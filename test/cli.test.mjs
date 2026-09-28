import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const run = (...a) => spawnSync(process.execPath, [join(ROOT, "bin", "hyperspec.mjs"), ...a], { encoding: "utf8" });
const VALID = join(ROOT, "test", "fixtures", "valid", "spec.md");

test("lint on the valid fixture exits 0 and says 9/9", () => {
  const r = run("lint", VALID);
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /9\/9/);
});

test("lint --json prints one document with status and tests", () => {
  const out = JSON.parse(run("lint", VALID, "--json").stdout);
  assert.equal(out.files[0].status, "pass"); assert.equal(out.files[0].tests.length, 9);
});

test("init writes a spec that lint reports as not passing, and refuses to overwrite", () => {
  const p = join(mkdtempSync(join(tmpdir(), "hs-")), "new.md");
  assert.equal(run("init", p, "--title", "My piece", "--kind", "essay").status, 0);
  assert.ok(existsSync(p)); assert.match(readFileSync(p, "utf8"), /title: My piece/);
  assert.notEqual(run("lint", p).status, 0);
  assert.equal(run("init", p).status, 2);
});

test("a file that is not a hyperspec, and no arguments, are usage errors (exit 2)", () => {
  assert.equal(run("lint", join(ROOT, "package.json")).status, 2);
  assert.equal(run().status, 2);
});
