import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tempDir } from "./tmp.mjs";
import { STATION_NAMES } from "../src/stations/index.mjs";

// A sequential work end to end: the course example lists its parts as writing.form.sequence.files,
// so `hyperspec check` needs no --draft, every station reads the parts joined in order, and a
// finding names the part and its own line. Every run is against a copy of the examples.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = join(ROOT, "examples", "writing");
const hyperspec = (args, cwd) => spawnSync(process.execPath, [join(ROOT, "bin", "hyperspec.mjs"), ...args], { cwd, encoding: "utf8" });
const copy = () => {
  const d = tempDir("hs-seq-check-");
  cpSync(BASE, d, { recursive: true });
  return d;
};
const edit = (d, file, fn) => writeFileSync(join(d, file), fn(readFileSync(join(d, file), "utf8")));
const seqOf = (out) => out.stations.find((s) => s.station === "sequence");

test("the course example checks with no --draft: its parts, joined in order, pass every station", () => {
  const shipped = readFileSync(join(BASE, "course", "runs.jsonl"), "utf8");
  const d = copy();
  const r = hyperspec(["check", "course.hyperspec.md", "--json"], d);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const out = JSON.parse(r.stdout);
  assert.deepEqual(out.stations.map((s) => s.station), [...STATION_NAMES]);
  assert.deepEqual(Object.fromEntries(out.stations.map((s) => [s.station, s.status])), { form: "pass", terms: "skip", claims: "pass", quotes: "pass", private: "pass", dna: "skip", links: "pass", sequence: "pass" });
  assert.deepEqual(out.files, ["course/part-1.md", "course/part-2.md"]);
  assert.equal(out.draftPath, "course/part-*.md");
  assert.deepEqual(seqOf(out).findings.map((f) => [f.id, f.severity, f.file, f.line]), [
    ["station-sequence-forward-pointer", "warn", "course/part-1.md", 25],
    ["station-sequence-forward-pointer", "warn", "course/part-2.md", 24],
  ]);
  assert.match(readFileSync(join(d, "course", "part-1.md"), "utf8").split("\n")[24], /Lesson 4 shows you/);
  const line = JSON.parse(readFileSync(join(d, "course", "runs.jsonl"), "utf8").trim());
  assert.equal(line.draft, "course/part-*.md", "the ledger keys the work by its files entry");
  assert.equal(line.verdict, "one-shot");
  assert.equal(readFileSync(join(BASE, "course", "runs.jsonl"), "utf8"), shipped, "the repo's ledger is untouched");
  const lint = hyperspec(["lint", "course.hyperspec.md", "--json"], d);
  assert.equal(lint.status, 0, lint.stdout);
  assert.deepEqual(JSON.parse(lint.stdout).files[0].findings, []);
});

test("GUARD, end to end: a lesson that uses a later lesson's term fails, naming the part and its line", () => {
  const d = copy();
  edit(d, "course/part-1.md", (t) => t.replace("It will look wrong: shaggy", "It will look wrong, and nothing like a crumb: shaggy"));
  const r = hyperspec(["check", "course.hyperspec.md"], d);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /^sequence: fail$/m);
  assert.match(r.stdout, /fail \[station-sequence-used-before-defined\] Lesson 1 uses "crumb" before Lesson 4 defines it \(course\/part-1\.md line 23\)/);
});

test("a part's frontmatter is not prose: a term in its title is not a use", () => {
  const d = copy();
  edit(d, "course/part-1.md", (t) => t.replace('title: "Bread from zero, Part 1: Dough"', 'title: "Bread from zero, Part 1: Dough, on the way to a good crumb"'));
  const r = hyperspec(["check", "course.hyperspec.md", "--only", "sequence"], d);
  assert.equal(r.status, 0, r.stdout);
});

test("a new part matching the files pattern is read in number order, part-2 before part-10", () => {
  const d = copy();
  writeFileSync(join(d, "course", "part-10.md"), "## Lesson 5: Scoring\n\n**After this lesson you can:** score a loaf.\n\n**New terms:**\n- **Lame:** a razor for scoring.\n\nScore the loaf before the oven spring.\n\n**Try this:** score one loaf.\n");
  const r = hyperspec(["check", "course.hyperspec.md", "--only", "sequence", "--json"], d);
  assert.equal(r.status, 0, r.stdout);
  assert.deepEqual(JSON.parse(r.stdout).files, ["course/part-1.md", "course/part-2.md", "course/part-10.md"]);
});

test("a relative link resolves beside the part that holds it", () => {
  const d = copy();
  mkdirSync(join(d, "course", "extra"));
  writeFileSync(join(d, "course", "extra", "notes.md"), "notes\n");
  writeFileSync(join(d, "course", "extra", "part-9.md"), "## Lesson 9: Notes\n\n**After this lesson you can:** x.\n\n**New terms:**\n- **Note:** y.\n\nSee [the notes](notes.md).\n\n**Try this:** z.\n");
  edit(d, "course.hyperspec.md", (t) => t.replace("        - course/part-*.md\n", "        - course/part-*.md\n        - course/extra/part-9.md\n"));
  const r = hyperspec(["check", "course.hyperspec.md", "--only", "links,sequence", "--json"], d);
  assert.equal(r.status, 0, r.stdout);
  assert.deepEqual(JSON.parse(r.stdout).stations.map((s) => s.status), ["pass", "pass"]);
});

test("--draft still names one file for a sequence spec: a single file of lessons is checked on its own", () => {
  const d = copy();
  const r = hyperspec(["check", "course.hyperspec.md", "--draft", "course/part-2.md", "--only", "sequence", "--json"], d);
  assert.equal(r.status, 0, r.stdout);
  const out = JSON.parse(r.stdout);
  assert.equal(out.draftPath, "course/part-2.md");
  assert.equal(out.files, undefined);
});

test("a spec that lists no sequence files still needs --draft: exit 2", () => {
  const d = copy();
  const r = hyperspec(["check", "essay.hyperspec.md"], d);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /check needs --draft <file>/);
});

test("lint: every sequence key present has to be usable", () => {
  const d = copy();
  const cases = [
    [(t) => t.replace(/    sequence:\n[\s\S]*?      teaser: Next,\n/, "    sequence: yes\n"), "writing-form-sequence", 1],
    [(t) => t.replace("        - course/part-*.md\n", "        - course/chapter-*.md\n"), "writing-form-sequence-files-missing", 6],
    [(t) => t.replace("      outline: course/outline.md\n", "      outline: course/nowhere.md\n"), "writing-form-sequence-outline-missing", 6],
    [(t) => t.replace(/      sections:\n(        - .*\n)+/, "      sections: []\n"), "writing-form-sequence-sections", 1],
    [(t) => t.replace("      unit: Lesson\n", "      unit: TODO\n"), "writing-form-sequence-unit", 1],
  ];
  const original = readFileSync(join(d, "course.hyperspec.md"), "utf8");
  for (const [change, id, testNo] of cases) {
    const changed = change(original);
    assert.notEqual(changed, original, id);
    writeFileSync(join(d, "course.hyperspec.md"), changed);
    const r = hyperspec(["lint", "course.hyperspec.md", "--json"], d);
    assert.equal(r.status, 1, `${id}: ${r.stdout}`);
    const found = JSON.parse(r.stdout).files[0].findings.map((f) => `${f.id} ${f.test}`);
    assert.ok(found.includes(`${id} ${testNo}`), `${id}: ${found.join(", ")}`);
  }
});
