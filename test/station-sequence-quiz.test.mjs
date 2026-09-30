import { test } from "node:test";
import assert from "node:assert/strict";
import { run, parseQuizzes } from "../src/stations/sequence.mjs";

// The quiz rules (hyperspec 0.9), promoted from the checker the first book written this way used:
// with writing.form.sequence.quiz naming the quiz heading, every defined term is tested by some
// question (a simple plural counts), no question uses a term defined after the lesson it is tagged
// with, every question is tagged, and every answer names one of its question's options. Each GUARD
// below is a case the rule exists to refuse; the clean cases around them prove it refuses nothing
// else. The shapes are the reference checker's own test cases.

const specWith = (sequence, knows) => ({ dir: ".", data: { writing: { form: { sequence }, audience: knows ? { knows } : {} } } });
const draftOf = (text) => ({ path: "draft.md", text, lines: text.split("\n"), sha256: "" });
const lesson = (n, terms, body, extra = "") =>
  `## Lesson ${n}: T${n}\n\n**After this lesson you can:** x.\n\n**New terms:**\n${terms.map((t) => `- **${t}:** def.`).join("\n")}\n\n${body}\n\n**Try this:** y.\n${extra}`;
const quiz = (qs, answers, heading = "Check yourself: Part 1") =>
  `\n## ${heading}\n\n${qs.map(([tag, q], i) => `${i + 1}. *(Lesson ${tag})* ${q}\n   - a) yes\n   - b) no`).join("\n")}\n\n**Answers:** ${answers}\n`;
const twoLessons = (q) => [lesson(1, ["Widget"], "A widget."), lesson(2, ["Gadget"], "A gadget.", q)].join("\n---\n\n");
const QUIZ = { quiz: "Check yourself" };
const check = (text, sequence = QUIZ, knows) => run(specWith(sequence, knows), draftOf(text));
const ids = (r) => r.findings.filter((f) => f.severity === "fail").map((f) => f.id);

test("a quiz that tests every term, in order, with a real key, passes", () => {
  const r = check(twoLessons(quiz([[1, "What is a widget?"], [2, "What is a gadget?"]], "1 a · 2 b")));
  assert.equal(r.status, "pass", JSON.stringify(r.findings));
  assert.deepEqual(r.findings, []);
});

test("GUARD: a question that uses a term its lesson has not reached yet fails, at the question's line", () => {
  const text = twoLessons(quiz([[1, "Is a widget a gadget?"], [2, "What is a gadget?"]], "1 a · 2 b"));
  const r = check(text);
  assert.deepEqual(ids(r), ["station-sequence-quiz-used-before-defined"]);
  const f = r.findings[0];
  assert.equal(f.line, text.split("\n").findIndex((l) => l.includes("Is a widget a gadget?")) + 1);
  assert.match(f.message, /question 1, tagged Lesson 1, uses "gadget", which Lesson 2 defines later/);
});

test("GUARD: a term an option uses before its lesson counts too: options are part of the question", () => {
  const text = [lesson(1, ["Widget"], "A widget."), lesson(2, ["Gadget"], "A gadget.", "\n## Check yourself\n\n1. *(Lesson 1)* What is a widget?\n   - a) a gadget\n   - b) a part\n2. *(Lesson 2)* And a gadget?\n   - a) yes\n   - b) no\n\n**Answers:** 1 b · 2 a\n")].join("\n");
  assert.deepEqual(ids(check(text)), ["station-sequence-quiz-used-before-defined"]);
});

test("GUARD: a defined term no question tests fails, naming the term and the lesson that defines it", () => {
  const r = check(twoLessons(quiz([[1, "What is a widget?"]], "1 a")));
  assert.deepEqual(ids(r), ["station-sequence-quiz-untested"]);
  assert.match(r.findings[0].message, /no quiz question tests "gadget", which Lesson 2 defines/);
  assert.equal(r.findings[0].line, twoLessons("").split("\n").findIndex((l) => l.startsWith("## Lesson 2")) + 1);
});

test("a simple plural tests the term: \"gadgets\" tests gadget", () => {
  assert.deepEqual(ids(check(twoLessons(quiz([[1, "What is a widget?"], [2, "Name two gadgets."]], "1 a · 2 b")))), []);
});

test("GUARD: an answer key that names no option fails", () => {
  const r = check(twoLessons(quiz([[1, "What is a widget?"], [2, "What is a gadget?"]], "1 a · 2 d")));
  assert.deepEqual(ids(r), ["station-sequence-quiz-answer"]);
  assert.match(r.findings[0].message, /question 2's answer is d, which is not one of its options \(a, b\)/);
});

test("GUARD: a question with no answer on the answers line fails", () => {
  const r = check(twoLessons(quiz([[1, "What is a widget?"], [2, "What is a gadget?"]], "1 a")));
  assert.deepEqual(ids(r), ["station-sequence-quiz-answer"]);
  assert.match(r.findings[0].message, /question 2 has no answer/);
});

test("GUARD: a numbered question with no lesson tag fails", () => {
  const text = twoLessons("\n## Check yourself\n\n1. *(Lesson 1)* What is a widget?\n   - a) yes\n   - b) no\n2. What is a gadget?\n   - a) yes\n   - b) no\n\n**Answers:** 1 a · 2 b\n");
  assert.ok(ids(check(text)).includes("station-sequence-quiz-untagged"));
});

test("GUARD: quiz declared and no quiz heading in the draft fails", () => {
  assert.deepEqual(ids(check(twoLessons(""))), ["station-sequence-quiz-missing"]);
});

test("the quiz rules are off unless sequence.quiz names the heading", () => {
  assert.deepEqual(ids(check(twoLessons(quiz([[1, "Is a widget a gadget?"]], "1 d")), {})), []);
});

test("a term inside code in a question is not a use of the word", () => {
  const r = check(twoLessons(quiz([[1, "What does `gadget --go` print for a widget?"], [2, "What is a gadget?"]], "1 a · 2 b")));
  assert.deepEqual(ids(r), []);
});

test("a word in sequence.knows may appear in any question", () => {
  const r = check(twoLessons(quiz([[1, "Is a widget a gadget?"], [2, "What is a gadget?"]], "1 a · 2 b")), { ...QUIZ, knows: ["gadget"] });
  assert.deepEqual(ids(r), []);
});

test("parseQuizzes reads every quiz across files, and a quiz ends at its file's end", () => {
  const part1 = `${lesson(1, ["Widget"], "A widget.")}${quiz([[1, "What is a widget?"]], "1 a")}`;
  const part2 = `${lesson(2, ["Gadget"], "A gadget.")}${quiz([[2, "What is a gadget?"]], "1 b", "Check yourself: Part 2")}`;
  const text = `${part1}${part2}`;
  const lines1 = part1.split("\n").length - 1;
  const draft = { ...draftOf(text), sources: [{ file: "p1.md", startLine: 1, lineCount: lines1 }, { file: "p2.md", startLine: lines1 + 1, lineCount: text.split("\n").length - 1 - lines1 }] };
  const q = parseQuizzes(draft, { unit: "Lesson", quiz: "Check yourself" });
  assert.equal(q.quizzes, 2);
  assert.deepEqual(q.questions.map((x) => [x.n, x.unit, x.answer, x.options]), [[1, 1, "a", ["a", "b"]], [1, 2, "b", ["a", "b"]]]);
  assert.deepEqual(run(specWith(QUIZ), draft).findings.filter((f) => f.severity === "fail"), []);
});
