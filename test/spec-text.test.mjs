import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSkillFile } from "@supersuit/superskill/yaml";
import { specText } from "../src/spec-text.mjs";
import { writingTemplate } from "../src/writing-template.mjs";
import { specText as exported } from "@supersuit/hyperspec/writing";

// specText (0.10): a tool that BUILDS a spec (a drafting loop filling the mechanical blocks, a
// renderer writing one spec per audience) needs frontmatter hyperspec's own reader reads back
// exactly. Hand-written YAML lost text silently (letter BUILD-NOTES item 1: " #" read as a
// comment, a value opening with a quoted phrase cut at the quote), and lint passed the truncated
// spec. specText writes, reads back, and throws rather than hand over a lossy file.
const back = (t) => parseSkillFile(t).data;

test("the values that truncated by hand survive whole", () => {
  const data = {
    hyperspec: "0.1", title: "A piece", profile: "writing",
    decisions: [{ id: "form", state: "decided", value: '"MJ to PJ" means Michael Jordan to Phil Jackson', source: "materials/notes.md#s19 and #s3", author: "gary-sheng", chosen_by: "human" }],
    writing: { audience: { who: "a parent: who reads slowly", knows: ["one-on-one", "it's fine"], reader: "person" }, form: { length: { min: 600, max: 900, unit: "words" } } },
    fiction: false,
  };
  const text = specText(data, "\n# A piece\n");
  const d = back(text);
  assert.equal(d.decisions[0].value, data.decisions[0].value);
  assert.equal(d.decisions[0].source, data.decisions[0].source);
  assert.equal(d.writing.audience.who, data.writing.audience.who);
  assert.deepEqual(d.writing.audience.knows, data.writing.audience.knows);
  assert.equal(String(d.writing.form.length.max), "900");
  assert.equal(String(d.fiction), "false");
  assert.match(text, /\n# A piece\n$/, "the body follows the frontmatter");
});

test("the writing skeleton round-trips: read it, write it, read it again, same data", () => {
  const data = back(writingTemplate({ title: "Skeleton", form: "letter" }));
  assert.deepEqual(back(specText(data)), data);
});

test("a value the reader cannot carry is refused, never written lossy", () => {
  assert.equal(back(specText({ hyperspec: "0.1", title: "x", note: "line one\nline two" })).note, "line one\nline two");
  assert.throws(() => specText({ hyperspec: "0.1", title: "x", gone: null }), /gone/);
  assert.throws(() => specText({ hyperspec: "0.1", title: "x", bad: { deep: [[1, 2]] } }), /bad/);
});

test("it is exported for tools outside this package", () => {
  assert.equal(exported, specText);
});

test("parseSpecText reads a spec's text exactly as lint does, so a builder can edit a skeleton", async () => {
  const { parseSpecText } = await import("@supersuit/hyperspec/writing");
  const text = writingTemplate({ title: "Edit me", form: "essay" });
  const { data, body } = parseSpecText(text);
  assert.deepEqual(data, back(text));
  data.title = "Edited";
  assert.equal(parseSpecText(specText(data, body)).data.title, "Edited");
  assert.ok(parseSpecText("no frontmatter at all").error || !("hyperspec" in parseSpecText("no frontmatter at all").data));
});
