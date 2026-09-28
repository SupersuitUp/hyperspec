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

test("I2: every relative example path in SPEC.md ships in the npm tarball", async () => {
  const { loadSpec } = await import("../src/load.mjs");
  const files = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).files;
  const spec = loadSpec(join(ROOT, "SPEC.md"));
  const paths = (spec.data.examples || []).map((e) => e.path).filter((p) => !/^https?:\/\//.test(p));
  assert.ok(paths.length, "SPEC.md lists at least one local example");
  for (const p of paths) {
    const shipped = files.some((f) => (f.endsWith("/") ? p.startsWith(f) : p === f));
    assert.ok(shipped, `${p} is not inside anything package.json "files" ships`);
  }
});
