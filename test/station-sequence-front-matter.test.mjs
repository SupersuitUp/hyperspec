import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "../src/stations/sequence.mjs";
import { tempDir } from "./tmp.mjs";

// writing.form.sequence.front_matter (0.11): the pages a work opens with before its first unit,
// such as a book on one page and the book in five pages. Each must appear as a heading, in the
// order listed, before the first unit. Front matter is not a unit: the order guard and the pointer
// warning read units only, so whether a summary page explains a later term in the sentence that
// uses it stays a judgment for the doctor.

const specWith = (sequence) => ({ dir: ".", data: { writing: { form: { sequence }, audience: {} } } });
const draftOf = (text) => ({ path: "draft.md", text, lines: text.split("\n"), sha256: "" });
const lesson = (n, terms, body) =>
  `## Lesson ${n}: T${n}\n\n**After this lesson you can:** x.\n\n**New terms:**\n${terms.map((t) => `- **${t}:** def.`).join("\n")}\n\n${body}\n\n**Try this:** y.\n`;
const FRONT = ["The book on one page", "The book in five pages"];
const page = (title, body = "A summary of the book.") => `## ${title}\n\n${body}\n`;
const check = (text, front = FRONT) => run(specWith({ front_matter: front }), draftOf(text));
const fails = (r) => r.findings.filter((f) => f.severity === "fail");

test("front matter present and in order, before the first lesson, passes", () => {
  const r = check(`# A book\n\n${page(FRONT[0])}\n${page(FRONT[1])}\n${lesson(1, ["Widget"], "A widget.")}`);
  assert.equal(r.status, "pass", JSON.stringify(r.findings));
  assert.deepEqual(r.findings, []);
});

test("a front-matter heading that is absent fails station-sequence-front-matter-missing, naming it", () => {
  const r = check(`${page(FRONT[0])}\n${lesson(1, ["Widget"], "A widget.")}`);
  assert.equal(r.status, "fail");
  assert.deepEqual(fails(r).map((f) => f.id), ["station-sequence-front-matter-missing"]);
  assert.match(fails(r)[0].message, /"The book in five pages"/);
});

test("front matter out of order fails station-sequence-front-matter-order, at the heading", () => {
  const text = `${page(FRONT[1])}\n${page(FRONT[0])}\n${lesson(1, ["Widget"], "A widget.")}`;
  const r = check(text);
  assert.deepEqual(fails(r).map((f) => f.id), ["station-sequence-front-matter-order"]);
  assert.match(fails(r)[0].message, /"The book in five pages"/);
  assert.equal(fails(r)[0].line, text.split("\n").indexOf("## The book in five pages") + 1);
});

test("a front-matter heading after the first lesson fails station-sequence-front-matter-order", () => {
  const text = `${page(FRONT[0])}\n${lesson(1, ["Widget"], "A widget.")}\n${page(FRONT[1])}`;
  const r = check(text);
  const f = fails(r);
  assert.deepEqual(f.map((x) => x.id), ["station-sequence-front-matter-order"]);
  assert.match(f[0].message, /Lesson 1/);
  assert.equal(f[0].line, text.split("\n").indexOf("## The book in five pages") + 1);
});

test("front matter is not a unit: a later lesson's term in it is neither a use before definition nor a pointer", () => {
  const text = `${page(FRONT[0], "By Lesson 2 you will build a gadget.")}\n${page(FRONT[1])}\n${lesson(1, ["Widget"], "A widget.")}\n${lesson(2, ["Gadget"], "A gadget.")}`;
  const r = check(text);
  assert.equal(r.status, "pass", JSON.stringify(r.findings));
  assert.deepEqual(r.findings, []);
});

test("only a heading counts: a bold line naming the page, or a heading inside code, is not the page", () => {
  const bold = check(`**The book on one page** gives the argument in a paragraph.\n\n${page(FRONT[1])}\n${lesson(1, ["Widget"], "A widget.")}`, [FRONT[0]]);
  assert.deepEqual(fails(bold).map((f) => f.id), ["station-sequence-front-matter-missing"]);
  const fenced = check("```markdown\n## The book on one page\n```\n\n" + lesson(1, ["Widget"], "A widget."), [FRONT[0]]);
  assert.deepEqual(fails(fenced).map((f) => f.id), ["station-sequence-front-matter-missing"]);
});

test("a heading is matched in any case, at any level, with or without a closing colon", () => {
  const r = check(`### the book on one page:\n\nx\n\n# THE BOOK IN FIVE PAGES\n\ny\n\n${lesson(1, ["Widget"], "A widget.")}`);
  assert.deepEqual(r.findings, []);
});

test("with no front_matter declared the guard does not run", () => {
  const r = run(specWith({}), draftOf(lesson(1, ["Widget"], "A widget.")));
  assert.deepEqual(r.findings, []);
});

// ---------------------------------------------------------------------------------------------
// End to end, and the key's lint.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const hyperspec = (args, cwd) => spawnSync(process.execPath, [join(ROOT, "bin", "hyperspec.mjs"), ...args], { cwd, encoding: "utf8" });
const copy = () => {
  const d = tempDir("hs-front-matter-");
  cpSync(join(ROOT, "examples", "writing"), d, { recursive: true });
  return d;
};

test("a sequence read from files names the file and its own line for a front-matter finding", () => {
  const d = copy();
  const course = join(d, "course.hyperspec.md");
  writeFileSync(course, readFileSync(course, "utf8").replace("      quiz: Check yourself\n", "      quiz: Check yourself\n      front_matter:\n        - Bread from zero\n        - \"Part 1: Dough\"\n"));
  const ok = hyperspec(["check", "course.hyperspec.md", "--only", "sequence"], d);
  assert.equal(ok.status, 0, ok.stdout);
  writeFileSync(course, readFileSync(course, "utf8").replace("        - \"Part 1: Dough\"\n", "        - \"Part 1: Dough\"\n        - \"Part 2: The bake\"\n"));
  const r = hyperspec(["check", "course.hyperspec.md", "--only", "sequence"], d);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /fail \[station-sequence-front-matter-order\] "Part 2: The bake" comes after Lesson 1.*\(course\/part-2\.md line \d+\)/);
});

test("lint: front_matter present has to be a list of real headings", () => {
  const d = copy();
  const course = join(d, "course.hyperspec.md");
  const original = readFileSync(course, "utf8");
  for (const value of ["      front_matter: The book on one page\n", "      front_matter: []\n", "      front_matter:\n        - TODO\n"]) {
    writeFileSync(course, original.replace("      quiz: Check yourself\n", `      quiz: Check yourself\n${value}`));
    const r = hyperspec(["lint", "course.hyperspec.md", "--json"], d);
    assert.equal(r.status, 1, `${value}: ${r.stdout}`);
    const found = JSON.parse(r.stdout).files[0].findings.map((f) => `${f.id} ${f.test}`);
    assert.ok(found.includes("writing-form-sequence-front-matter 1"), `${value}: ${found.join(", ")}`);
  }
});
