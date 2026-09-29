import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { tempDir } from "./tmp.mjs";
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
  const p = join(tempDir("hs-"), "new.md");
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
  const d = tempDir("hs-cli-");
  cpSync(dirname(VALID), d, { recursive: true });
  const p = join(d, `${name}.md`);
  _write(p, edit(readFileSync(VALID, "utf8")));
  return p;
}

test("a stray init flag before the files never swallows a file", () => {
  const a = fixture("a", (t) => t.replace(/rejects:\n  - .*\n/, ""));
  const b = fixture("b");
  const r = run("lint", "--kind", a, b);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /a\.md: fail/);
  assert.match(r.stdout, /b\.md: pass/);
});

// Blocked end to end, and the worst-result ranking across files.
const blocked = () => fixture("blocked", (t) => t.replace(/    state: delegated\n    rule: .*\n/, "    state: open\n    question: how long?\n"));
const failing = () => fixture("failing", (t) => t.replace(/rejects:\n  - .*\n/, ""));
test("a spec whose only problem is one open decision exits 3 and names it", () => {
  const r = run("lint", blocked());
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.match(r.stdout, /blocked \(9\/9\), open: length/);
});
test("lint exits with the worst result across files: 2 over 1 over 3 over 0", () => {
  assert.equal(run("lint", VALID, blocked()).status, 3);
  assert.equal(run("lint", blocked(), failing()).status, 1);
  assert.equal(run("lint", failing(), blocked()).status, 1);
  assert.equal(run("lint", VALID, "/nope/missing.md").status, 2);
  assert.equal(run("lint", "/nope/missing.md", failing()).status, 2);
  assert.equal(run("lint", blocked(), "/nope/missing.md", VALID).status, 2);
});
test("broken frontmatter, and a file with no hyperspec key, exit 2", () => {
  const d = tempDir("hs-cli-");
  const broken = join(d, "broken.md"); _write(broken, '---\nhyperspec: "0.1"\ntitle: [unclosed\n');
  const plain = join(d, "plain.md"); _write(plain, "---\ntitle: T\n---\n# Not a hyperspec\n");
  assert.equal(run("lint", broken).status, 2);
  assert.equal(run("lint", plain).status, 2);
});

// One broken ledger never aborts the other files or empties --json.
test("a directory ledger is reported as a failure and the next file is still linted", () => {
  const bad = fixture("bad", (t) => t.replace("ledger: runs.jsonl", "ledger: goldens"));
  const r = run("lint", bad, VALID, "--json");
  assert.equal(r.status, 1, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.deepEqual(out.files.map((x) => x.status), ["fail", "pass"]);
});

// hyperspec init quotes a title or kind a YAML reader would misread, so what lint reads back is what was typed.
test("init quotes titles with YAML-special characters, and the title reads back exactly", async () => {
  const { loadSpec } = await import("../src/load.mjs");
  const titles = ["My # piece", "[draft] essay", '"Quoted" rest', "- dash", "ok: colon", "*star", "{brace}", "trailing ", "@at", "`tick", "!bang", "|pipe", ">gt", "?q", "%pct", "&amp", "null", "true", "123", "line\nbreak", "back\\slash"];
  for (const title of titles) {
    const p = join(tempDir("hs-"), "new.md");
    assert.equal(run("init", p, "--title", title, "--kind", "essay: long").status, 0, title);
    const s = loadSpec(p);
    assert.equal(s.error, undefined, title);
    assert.equal(s.data.title, title, title);
    assert.equal(s.data.kind, "essay: long", title);
    assert.equal(s.body.split("\n").filter((l) => l.startsWith("# ")).length, 1, `one heading line for ${JSON.stringify(title)}`);
  }
});
test("a plain title is left unquoted", () => {
  const p = join(tempDir("hs-"), "new.md");
  assert.equal(run("init", p, "--title", "My piece, part 2 (draft)", "--kind", "essay").status, 0);
  assert.match(readFileSync(p, "utf8"), /^title: My piece, part 2 \(draft\)$/m);
  assert.match(readFileSync(p, "utf8"), /^kind: essay$/m);
});
