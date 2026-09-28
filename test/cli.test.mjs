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

// A copy of the valid fixture folder with one edit to spec.md, written as <name>.md beside it.
import { cpSync, writeFileSync as _write } from "node:fs";
function fixture(name, edit = (t) => t) {
  const d = mkdtempSync(join(tmpdir(), "hs-cli-"));
  cpSync(dirname(VALID), d, { recursive: true });
  const p = join(d, `${name}.md`);
  _write(p, edit(readFileSync(VALID, "utf8")));
  return p;
}

test("I1: a stray init flag before the files never swallows a file", () => {
  const a = fixture("a", (t) => t.replace(/rejects:\n  - .*\n/, ""));
  const b = fixture("b");
  const r = run("lint", "--kind", a, b);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /a\.md: fail/);
  assert.match(r.stdout, /b\.md: pass/);
});

// I4: blocked end to end, and the worst-result ranking across files.
const blocked = () => fixture("blocked", (t) => t.replace(/    state: delegated\n    rule: .*\n/, "    state: open\n    question: how long?\n"));
const failing = () => fixture("failing", (t) => t.replace(/rejects:\n  - .*\n/, ""));
test("I4: a spec whose only problem is one open decision exits 3 and names it", () => {
  const r = run("lint", blocked());
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.match(r.stdout, /blocked \(9\/9\), open: length/);
});
test("I4: lint exits with the worst result across files: 2 over 1 over 3 over 0", () => {
  assert.equal(run("lint", VALID, blocked()).status, 3);
  assert.equal(run("lint", blocked(), failing()).status, 1);
  assert.equal(run("lint", failing(), blocked()).status, 1);
  assert.equal(run("lint", VALID, "/nope/missing.md").status, 2);
  assert.equal(run("lint", "/nope/missing.md", failing()).status, 2);
  assert.equal(run("lint", blocked(), "/nope/missing.md", VALID).status, 2);
});
test("I4: broken frontmatter, and a file with no hyperspec key, exit 2", () => {
  const d = mkdtempSync(join(tmpdir(), "hs-cli-"));
  const broken = join(d, "broken.md"); _write(broken, '---\nhyperspec: "0.1"\ntitle: [unclosed\n');
  const plain = join(d, "plain.md"); _write(plain, "---\ntitle: T\n---\n# Not a hyperspec\n");
  assert.equal(run("lint", broken).status, 2);
  assert.equal(run("lint", plain).status, 2);
});
