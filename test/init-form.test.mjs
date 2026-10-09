import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tempDir } from "./tmp.mjs";
import { loadSpec } from "../src/load.mjs";
import { lintSpec } from "../src/rules.mjs";
import { writingTemplate } from "../src/writing-template.mjs";
import { parseSpecText } from "../src/spec-text.mjs";

// `hyperspec init <file> --form <form spec>` (0.11): a work skeleton that names the form and shows
// only what the form leaves for the work, so the author fills the work's own blocks and nothing
// they would have to delete again to avoid contradicting the form. `--form <name>` (a value that
// is not a path to a .md file) keeps its meaning from 0.4: the skeleton's kind.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = (args, cwd) => spawnSync(process.execPath, [join(ROOT, "bin", "hyperspec.mjs"), ...args], { cwd, encoding: "utf8" });
const FORM = "forms/course.form.hyperspec.md";
const copy = () => {
  const d = tempDir("hs-init-form-");
  cpSync(join(ROOT, "examples", "writing"), d, { recursive: true });
  return d;
};

test("init --form <form spec> writes a work skeleton that names the form and shows only what the form leaves", () => {
  const d = copy();
  const r = cli(["init", "pottery.hyperspec.md", "--form", FORM, "--title", "Pottery from zero"], d);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const raw = loadSpec(join(d, "pottery.hyperspec.md"));
  const text = readFileSync(join(d, "pottery.hyperspec.md"), "utf8");
  assert.match(text, /^form: forms\/course\.form\.hyperspec\.md$/m);
  assert.equal(raw.data.title, "Pottery from zero");
  assert.equal(raw.data.kind, "course", "the kind is the form's writing.form.name");
  assert.ok(!/^profile:/m.test(text), "the form sets the profile");
  assert.ok(!/^fiction:/m.test(text), "the form sets fiction");
  // Merged, the skeleton is the form plus the work's placeholders: read the work's own text.
  const own = parseSpecText(text).data;
  assert.deepEqual(Object.keys(own.writing), ["materials", "dna", "audience", "goal", "form", "spine", "sources"], "persona is wholly the form's");
  assert.deepEqual(Object.keys(own.writing.form), ["length", "required_parts"]);
  assert.deepEqual(Object.keys(own.writing.sources), ["ledger"]);
  assert.ok(!("rules" in own.writing.dna), "the form names the style rules");
  assert.deepEqual(own.decisions.map((x) => x.id), ["writing-audience", "writing-goal"], "an open decision only for a block left whole to the work");
});

test("the skeleton fits its form: merged, it fails only on its own placeholders, never on the form", () => {
  const d = copy();
  assert.equal(cli(["init", "pottery.hyperspec.md", "--form", FORM], d).status, 0);
  const spec = loadSpec(join(d, "pottery.hyperspec.md"));
  const ids = lintSpec(spec).map((x) => x.id);
  assert.deepEqual(ids.filter((id) => id.startsWith("form-")), [], ids.join(", "));
  assert.deepEqual(ids.filter((id) => id.startsWith("writing-persona")), [], "the form's persona carries over whole");
  assert.equal(spec.data.writing.form.sequence.front_matter[0], "This course on one page");
  const lint = cli(["lint", "pottery.hyperspec.md"], d);
  assert.equal(lint.status, 1, "the placeholders still fail");
});

test("the form path is written relative to the new spec's own folder", () => {
  const d = copy();
  mkdirSync(join(d, "courses"));
  assert.equal(cli(["init", "courses/pottery.hyperspec.md", "--form", FORM], d).status, 0);
  assert.match(readFileSync(join(d, "courses", "pottery.hyperspec.md"), "utf8"), /^form: "?\.\.\/forms\/course\.form\.hyperspec\.md"?$/m);
  const spec = loadSpec(join(d, "courses", "pottery.hyperspec.md"));
  assert.equal(spec.form?.path, "../forms/course.form.hyperspec.md");
  const ids = lintSpec(spec).map((x) => x.id);
  assert.ok(!ids.includes("form-missing"), ids.join(", "));
});

test("--form with a name keeps today's behavior: the skeleton's kind, with --profile writing", () => {
  const d = tempDir("hs-init-form-name-");
  const r = cli(["init", "essay.hyperspec.md", "--profile", "writing", "--form", "essay", "--title", "T"], d);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(join(d, "essay.hyperspec.md"), "utf8"), writingTemplate({ title: "T", form: "essay" }));
});

test("init --form <path> refuses a file that is missing or is not a form spec, writing nothing", () => {
  const d = copy();
  const missing = cli(["init", "a.hyperspec.md", "--form", "forms/nowhere.md"], d);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /forms\/nowhere\.md/);
  assert.ok(!existsSync(join(d, "a.hyperspec.md")));
  const notForm = cli(["init", "b.hyperspec.md", "--form", "essay.hyperspec.md"], d);
  assert.equal(notForm.status, 2);
  assert.match(notForm.stderr, /kind: form/);
  assert.ok(!existsSync(join(d, "b.hyperspec.md")));
});

test("init --form <path> refuses --fiction, which the form decides", () => {
  const d = copy();
  const r = cli(["init", "c.hyperspec.md", "--form", FORM, "--fiction"], d);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--fiction does not apply with a form spec/);
});
