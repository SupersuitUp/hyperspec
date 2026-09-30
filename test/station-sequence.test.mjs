import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { run, parseUnits, newTerms, outlineTerms } from "../src/stations/sequence.mjs";
import { tempDir } from "./tmp.mjs";

// The sequence station holds a work read in order (a course, a primer, a textbook) to the
// guarantees a reader of lesson 5 depends on: lessons 1 to 4 taught every word lesson 5 uses. The
// guards: every lesson carries its sections, every term is defined in exactly one lesson, no lesson
// uses a term before the lesson that defines it, each lesson defines what the outline promises.

function specWith(sequence, { dir = ".", knows } = {}) {
  return { dir, data: { writing: { form: { sequence }, audience: knows ? { knows } : {} } } };
}
const draftOf = (text) => ({ path: "draft.md", text, lines: text.split("\n"), sha256: "" });

// One lesson in the default shape: its three sections, its New terms list, a body, and optionally
// something after it (a part's closing teaser).
const lesson = (n, terms, body, extra = "") =>
  `## Lesson ${n}: T${n}\n\n**After this lesson you can:** x.\n\n**New terms:**\n${terms.map((t) => `- **${t}:** def.`).join("\n")}\n\n${body}\n\n**Try this:** y.\n${extra}`;
const book = (...ls) => ls.join("\n---\n\n");
const check = (text, sequence = {}, opts) => run(specWith(sequence, opts), draftOf(text));
const ids = (r) => r.findings.filter((f) => f.severity === "fail").map((f) => f.id);

test("a clean sequence passes", () => {
  const r = check(book(lesson(1, ["Widget"], "A widget."), lesson(2, ["Gadget"], "A gadget uses a widget.")));
  assert.equal(r.station, "sequence");
  assert.equal(r.status, "pass", JSON.stringify(r.findings));
  assert.deepEqual(r.findings, []);
});

test("a spec with no writing.form.sequence skips, with a reason", () => {
  const r = run({ data: { writing: { form: {} } } }, draftOf("# Anything"));
  assert.equal(r.status, "skip");
  assert.match(r.reason, /writing\.form\.sequence/);
});

test("GUARD: a term used before the lesson that defines it fails, pointing at the use", () => {
  const text = book(lesson(1, ["Widget"], "Mind the gadget."), lesson(2, ["Gadget"], "A gadget."));
  const r = check(text);
  assert.equal(r.status, "fail");
  const f = r.findings.find((x) => x.id === "station-sequence-used-before-defined");
  assert.ok(f, JSON.stringify(r.findings));
  assert.match(f.message, /Lesson 1 uses "gadget" before Lesson 2 defines it/);
  assert.equal(f.line, text.split("\n").findIndex((l) => l.includes("Mind the gadget")) + 1);
});

test("GUARD: a term defined in two lessons fails", () => {
  const r = check(book(lesson(1, ["Widget"], "a"), lesson(2, ["Widget"], "b")));
  assert.deepEqual(ids(r), ["station-sequence-defined-twice"]);
  assert.match(r.findings[0].message, /"widget" is defined in Lesson 1 and again in Lesson 2/);
});

test("GUARD: a lesson missing a required section fails, naming the lesson and the section", () => {
  const r = check(book(lesson(1, ["Widget"], "a").replace("**Try this:** y.", "")));
  assert.deepEqual(ids(r), ["station-sequence-missing-section"]);
  assert.match(r.findings[0].message, /Lesson 1 has no "Try this" section/);
});

test("GUARD: a term the outline promises and the lesson does not define fails", () => {
  const dir = tempDir("hs-seq-outline-");
  writeFileSync(join(dir, "outline.md"), "# Outline\n\n1. **T1.** words. *Terms: widget, sprocket.*\n");
  const r = check(book(lesson(1, ["Widget"], "a")), { outline: "outline.md" }, { dir });
  assert.deepEqual(ids(r), ["station-sequence-outline-unkept"]);
  assert.match(r.findings[0].message, /the outline promises "sprocket" in Lesson 1, and Lesson 1 does not define it/);
});

test("a term named in the part's closing teaser is allowed", () => {
  const r = check(book(lesson(1, ["Widget"], "A widget.", "\n---\n\n**Next, Part 2: gadgets.** What a gadget is."), lesson(2, ["Gadget"], "A gadget.")));
  assert.deepEqual(r.findings, []);
});

test("a \"(from Lesson N)\" reminder is not a second definition, and not a use before definition", () => {
  const l2 = "## Lesson 2: T2\n\n**After this lesson you can:** x.\n\n**New terms:**\n- **Widget** (from Lesson 1): reminder.\n- **Gadget:** def.\n\nA gadget.\n\n**Try this:** y.\n";
  const r = check(book(lesson(1, ["Widget"], "a"), l2));
  assert.deepEqual(r.findings, []);
});

test("a term inside code is not a use of the word", () => {
  const r = check(book(lesson(1, ["Widget"], "Run `npx @gadget/tool` now.\n\n```\ngadget --go\n```"), lesson(2, ["Gadget"], "A gadget.")));
  assert.deepEqual(r.findings, []);
});

test("a word in audience.knows or sequence.knows may be used before a lesson defines it", () => {
  const text = book(lesson(1, ["Widget"], "Mind the gadget and the sprocket."), lesson(2, ["Gadget", "Sprocket"], "A gadget and a sprocket."));
  assert.deepEqual(ids(check(text)), ["station-sequence-used-before-defined", "station-sequence-used-before-defined"]);
  assert.deepEqual(ids(check(text, { knows: ["gadget"] }, { knows: ["Sprocket"] })), []);
});

test("a forward pointer to a later lesson warns and never fails", () => {
  const r = check(book(lesson(1, ["Widget"], "More in Lesson 2."), lesson(2, ["Gadget"], "Back to Lesson 1.")));
  assert.equal(r.status, "pass");
  assert.deepEqual(r.findings.map((f) => [f.id, f.severity]), [["station-sequence-forward-pointer", "warn"]]);
  assert.match(r.findings[0].message, /Lesson 1 points forward to Lesson 2/);
});

test("a pointer inside the closing teaser is not reported", () => {
  const r = check(book(lesson(1, ["Widget"], "a", "\n**Next, Part 2: Lesson 2 and on.**"), lesson(2, ["Gadget"], "b")));
  assert.deepEqual(r.findings, []);
});

test("GUARD: lessons out of order, or numbered twice, fail", () => {
  assert.deepEqual(ids(check(book(lesson(2, ["Widget"], "a"), lesson(1, ["Gadget"], "b")))), ["station-sequence-numbering"]);
  assert.deepEqual(ids(check(book(lesson(1, ["Widget"], "a"), lesson(1, ["Gadget"], "b")))), ["station-sequence-numbering"]);
});

test("a draft with no lesson heading fails", () => {
  assert.deepEqual(ids(check("# A book\n\nNo lessons here.\n")), ["station-sequence-no-units"]);
});

test("a lesson ends at the next heading of its level or above, so a part's introduction belongs to no lesson", () => {
  const text = `${lesson(1, ["Widget"], "a")}\n## Part 2\n\nThis part is about the gadget.\n\n${lesson(2, ["Gadget"], "A gadget.")}`;
  assert.deepEqual(check(text).findings, []);
});

test("a heading inside a fenced code block does not end a lesson", () => {
  const units = parseUnits(draftOf(lesson(1, ["Widget"], "```markdown\n# Example\n```\n\nA widget.")), { unit: "Lesson" });
  assert.equal(units.length, 1);
  assert.match(units[0].text, /\*\*Try this:\*\*/);
});

test("unit, sections, terms section and teaser are the spec's to name", () => {
  const ch = (n, terms, body, extra = "") => `# Chapter ${n}. C${n}\n\n## Goals\n\nx\n\n**Vocabulary:**\n${terms.map((t) => `- **${t}:** def.`).join("\n")}\n\n${body}\n${extra}`;
  const seq = { unit: "Chapter", sections: ["Goals", "Vocabulary"], terms_section: "Vocabulary", teaser: "Coming up" };
  assert.deepEqual(check(`${ch(1, ["Widget"], "A widget.", "\n**Coming up: the gadget.**")}\n${ch(2, ["Gadget"], "A gadget.")}`, seq).findings, []);
  assert.deepEqual(ids(check(`${ch(1, ["Widget"], "A gadget.")}\n${ch(2, ["Gadget"], "A gadget.")}`, seq)), ["station-sequence-used-before-defined"]);
});

test("newTerms reads several bold terms on one line, drops parentheticals and code marks", () => {
  const [u] = parseUnits(draftOf("## Lesson 4: T\n\n**New terms:**\n- **Claude Code**, **Codex** and **Claude Cowork:** agents.\n- **Context window (the desk):** what it sees.\n- **`SKILL.md`:** the file.\n\nx\n"), { unit: "Lesson" });
  assert.deepEqual(newTerms(u, { unit: "Lesson", termsSection: "New terms" }), ["claude code", "codex", "claude cowork", "context window", "skill.md"]);
});

test("outlineTerms reads an item's promise even when it sits on a later line of the item", () => {
  const map = outlineTerms("1. **One.** Words. *Terms: chat app, prompt.*\n2. **Two.** Words:\n    - a sub point\n    *Terms: model, app.*\n3. **Three.** No terms here.\n");
  assert.deepEqual(map, { 1: ["chat app", "prompt"], 2: ["model", "app"] });
});

test("an outline that cannot be read fails rather than passing unchecked", () => {
  const r = check(book(lesson(1, ["Widget"], "a")), { outline: "nowhere.md" }, { dir: tempDir("hs-seq-noout-") });
  assert.deepEqual(ids(r), ["station-sequence-outline-unreadable"]);
});
