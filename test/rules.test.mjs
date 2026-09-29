import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, cpSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSpec } from "../src/load.mjs";
import { lintSpec, TESTS } from "../src/rules.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const VALID = join(HERE, "fixtures", "valid");
const valid = () => loadSpec(join(VALID, "spec.md"));
// A copy of the valid fixture with one frontmatter edit, so each test breaks exactly one thing.
function variant(edit) {
  const d = mkdtempSync(join(tmpdir(), "hs-"));
  cpSync(VALID, d, { recursive: true });
  const p = join(d, "spec.md");
  writeFileSync(p, edit(readFileSync(p, "utf8")));
  return loadSpec(p);
}
const failsOn = (spec) => [...new Set(lintSpec(spec).filter((f) => f.severity === "fail").map((f) => f.test))].sort();

test("TESTS is the nine tests, numbered 1 to 9, frozen", () => {
  assert.deepEqual(TESTS.map((t) => t.n), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.ok(Object.isFrozen(TESTS) && TESTS.every(Object.isFrozen));
});

test("the valid fixture fails nothing", () => {
  assert.deepEqual(failsOn(valid()), []);
});

test("1: a delegated decision with no rule fails test 1 only", () => {
  assert.deepEqual(failsOn(variant((t) => t.replace(/    rule: .*\n/, ""))), [1]);
});

test("1: an unknown state, and a duplicate id, fail test 1", () => {
  assert.deepEqual(failsOn(variant((t) => t.replace("state: decided", "state: maybe"))), [1]);
  assert.deepEqual(failsOn(variant((t) => t.replace("id: length", "id: audience"))), [1]);
});

test("2: a requirement with no fails_when fails test 2", () => {
  assert.deepEqual(failsOn(variant((t) => t.replace(/    fails_when: .*\n/, ""))), [2]);
});

test("2: a vague fails_when is a warning, never a failure", () => {
  const s = variant((t) => t.replace(/fails_when: .*/, "fails_when: the section is not engaging"));
  assert.deepEqual(failsOn(s), []);
  assert.ok(lintSpec(s).some((f) => f.test === 2 && f.severity === "warn"));
});

test("3: a check with neither station nor rubric fails test 3", () => {
  assert.deepEqual(failsOn(variant((t) => t.replace(/      rubric: .*\n/, "      note: none\n"))), [3]);
});

test("4: a decision with no author, or no chosen_by, fails test 4", () => {
  assert.deepEqual(failsOn(variant((t) => t.replace("    author: gary-sheng\n    chosen_by: human\n", "    chosen_by: human\n"))), [4]);
  assert.deepEqual(failsOn(variant((t) => t.replace("chosen_by: human", "chosen_by: nobody"))), [4]);
});

test("5: no rejects fails test 5", () => {
  assert.deepEqual(failsOn(variant((t) => t.replace(/rejects:\n  - .*\n/, ""))), [5]);
});

test("6: an example whose file does not exist fails test 6", () => {
  assert.deepEqual(failsOn(variant((t) => t.replace("goldens/opening.md", "goldens/missing.md"))), [6]);
});

test("7: a next action that names no action fails test 7", () => {
  assert.deepEqual(failsOn(variant((t) => t.replace(/next_action: .*/, "next_action: continue"))), [7]);
});

test("8: no fork line fails test 8", () => {
  assert.deepEqual(failsOn(variant((t) => t.replace(/  fork: .*\n/, ""))), [8]);
});

test("9: an improved verdict with no change fails test 9", () => {
  const s = variant((t) => t);
  writeFileSync(join(s.dir, "runs.jsonl"), '{"verdict":"improved"}\n');
  assert.deepEqual(failsOn(loadSpec(s.path)), [9]);
});

test("9: no ledger declared fails test 9; a declared ledger not yet written is a warning, never a failure (M5)", () => {
  assert.deepEqual(failsOn(variant((t) => t.replace(/improvement:\n  ledger: .*\n/, ""))), [9]);
  const s = variant((t) => t.replace("ledger: runs.jsonl", "ledger: later.jsonl"));
  assert.deepEqual(failsOn(s), []);
  const warns = lintSpec(s).filter((x) => x.severity === "warn");
  assert.deepEqual(warns.map((x) => [x.test, x.id]), [[9, "ledger-missing"]]);
  assert.match(warns[0].message, /later\.jsonl/);
});

test("every finding names its test, a severity, a message and a fix", () => {
  const s = variant((t) => t.replace(/rejects:\n  - .*\n/, "").replace(/    fails_when: .*\n/, ""));
  for (const f of lintSpec(s)) {
    assert.ok(f.test >= 1 && f.test <= 9 && ["fail", "warn"].includes(f.severity) && f.message && f.fix, JSON.stringify(f));
  }
});

// C1: a value that is only a YAML comment, or null / ~, is a placeholder and never counts as present.
const PLACEHOLDERS = ["# TODO fill in", "null", "~", "# none yet"];
const PLACEHOLDER_FIELDS = [
  // [field, the fixture text to replace, the replacement (with $ for the placeholder), the test that must fail]
  ["decision id", "  - id: audience\n", "  - id: $\n", 1],
  ["decision state", "    state: decided\n", "    state: $\n", 1],
  ["decided value", /    value: .*\n/, "    value: $\n", 1],
  ["delegated rule", /    rule: .*\n/, "    rule: $\n", 1],
  ["open question", /    state: delegated\n    rule: .*\n/, "    state: open\n    question: $\n", 1],
  ["decision source", "    source: interview A2\n", "    source: $\n", 4],
  ["decision author", "    author: gary-sheng\n    chosen_by: human\n", "    author: $\n    chosen_by: human\n", 4],
  ["decision chosen_by", "    chosen_by: human\n", "    chosen_by: $\n", 4],
  ["requirement text", /    text: .*\n/, "    text: $\n", 2],
  ["requirement fails_when", /    fails_when: .*\n/, "    fails_when: $\n", 2],
  ["check rubric", /      rubric: .*\n/, "      rubric: $\n", 3],
  ["check station", /      rubric: .*\n/, "      station: $\n", 3],
  ["requirement source", "    source: design doc, audience block\n", "    source: $\n", 4],
  ["requirement author", "    author: gary-sheng\nrejects:", "    author: $\nrejects:", 4],
  ["rejects item", "  - hype words about AI\n", "  - $\n", 5],
  ["example path", "  - path: goldens/opening.md\n", "  - path: $\n", 6],
  ["example why", /    why: .*\n/, "    why: $\n", 6],
  ["resume.next_action", /  next_action: .*\n/, "  next_action: $\n", 7],
  ["feedback.issues", /  issues: .*\n/, "  issues: $\n", 8],
  ["feedback.fork", /  fork: .*\n/, "  fork: $\n", 8],
  ["improvement.ledger", "  ledger: runs.jsonl\n", "  ledger: $\n", 9],
];
for (const [field, find, repl, n] of PLACEHOLDER_FIELDS) {
  test(`C1: a placeholder in ${field} fails test ${n}`, () => {
    for (const ph of PLACEHOLDERS) {
      const s = variant((t) => { const out = t.replace(find, repl.replace("$", ph)); assert.notEqual(out, t, `${field}: fixture edit did not apply`); return out; });
      assert.deepEqual(failsOn(s), [n], `${field} = ${ph}`);
    }
  });
}

// C2: a QUOTED value that merely starts with '#' is real text (superskill 0.2.1 reads it back as
// the string "# literal", quotes stripped), not a placeholder, and must count as present.
test('C2: a quoted value starting with "#" counts as present, not a placeholder', () => {
  const s = variant((t) => t.replace("source: interview A2\n", 'source: "# literal"\n'));
  assert.deepEqual(failsOn(s), []);
});

// I3: the no-action words match only the WHOLE next_action; a conversation pointer fails anywhere in it.
const nextAction = (v) => variant((t) => t.replace(/next_action: .*/, `next_action: ${v}`));
test("I3/7: a real next action that starts with 'continue' passes", () => {
  assert.deepEqual(failsOn(nextAction("continue drafting section two from the outline")), []);
});
test("I3/7: a bare no-action word fails test 7, whatever its case or trailing punctuation", () => {
  for (const v of ["continue", "Continue.", "follow up", "follow-up", "TBD", "todo", "keep going", "pick it back up", "n/a", "none"]) {
    const ids = lintSpec(nextAction(v)).filter((x) => x.severity === "fail").map((x) => x.id);
    assert.deepEqual(ids, ["next-action-vague"], v);
  }
});
test("I3/7: a next action that points into a conversation fails test 7", () => {
  for (const v of ["do it as discussed", "as we discussed, write the outline", "write the outline as mentioned above", "fix it as mentioned earlier"]) {
    assert.deepEqual(failsOn(nextAction(v)), [7], v);
  }
});
test("I3/5: a rejects item that is not a plain string names the item", () => {
  const s = variant((t) => t.replace("  - hype words about AI", "  - text: hype words about AI"));
  const fails = lintSpec(s).filter((x) => x.severity === "fail");
  assert.deepEqual(fails.map((x) => [x.test, x.id]), [[5, "rejects-item"]]);
  assert.equal(fails[0].message, "rejects item 1 is not a plain string");
});

// I4: one variant per finding id. Each breaks exactly one thing, and must raise exactly that finding
// as its only failure, and fail exactly that finding's test.
const cut = (re) => (t) => { const out = t.replace(re, ""); assert.notEqual(out, t, `edit ${re} did not apply`); return out; };
const sub = (a, b) => (t) => { const out = t.replace(a, b); assert.notEqual(out, t, `edit ${a} did not apply`); return out; };
const ledger = (text) => (s) => { writeFileSync(join(s.dir, "runs.jsonl"), text); return loadSpec(s.path); };
const BY_ID = [
  ["decisions", 1, cut(/decisions:\n(  .*\n)+/)],
  ["decision-id", 1, sub("  - id: audience\n    state", "  - state")],
  ["requirement-id", 1, sub("  - id: r1", "  - id: audience")],
  ["decision-state", 1, sub("state: decided", "state: maybe")],
  ["decided-value", 1, cut(/    value: .*\n/)],
  ["delegated-rule", 1, cut(/    rule: .*\n/)],
  ["open-question", 1, sub(/    state: delegated\n    rule: .*\n/, "    state: open\n")],
  ["requirements", 2, cut(/requirements:\n(  .*\n)+/)],
  ["requirement-text", 2, cut(/    text: .*\n/)],
  ["fails-when", 2, cut(/    fails_when: .*\n/)],
  ["check", 3, sub(/      rubric: .*\n/, "      note: none\n")],
  ["decision-source", 4, cut("    source: interview A2\n")],
  ["decision-author", 4, sub("    author: gary-sheng\n    chosen_by: human\n", "    chosen_by: human\n")],
  ["decision-chosen-by", 4, sub("chosen_by: human", "chosen_by: nobody")],
  ["requirement-source", 4, cut("    source: design doc, audience block\n")],
  ["requirement-author", 4, sub("    author: gary-sheng\nrejects:", "rejects:")],
  ["rejects", 5, cut(/rejects:\n(  .*\n)+/)],
  ["rejects-item", 5, sub("  - hype words about AI", "  - text: hype words about AI")],
  ["examples", 6, cut(/examples:\n(  .*\n)+/)],
  ["example-path", 6, sub("  - path: goldens/opening.md\n    why", "  - why")],
  ["example-missing", 6, sub("goldens/opening.md", "goldens/missing.md")],
  ["example-not-file", 6, sub("goldens/opening.md", "goldens")],
  ["example-self", 6, sub("goldens/opening.md", "spec.md")],
  ["example-why", 6, cut(/    why: .*\n/)],
  ["next-action", 7, cut(/resume:\n(  .*\n)+/)],
  ["next-action-vague", 7, sub(/next_action: .*/, "next_action: tbd")],
  ["feedback-issues", 8, cut(/  issues: .*\n/)],
  ["feedback-fork", 8, cut(/  fork: .*\n/)],
  ["ledger", 9, cut(/improvement:\n(  .*\n)+/)],
  ["ledger-line", 9, null, ledger("not json\n")],
  ["verdict", 9, null, ledger('{"verdict":"maybe"}\n')],
  ["verdict-change", 9, null, ledger('{"verdict":"improved"}\n')],
  ["verdict-reason", 9, null, ledger('{"verdict":"not-improved"}\n')],
];
for (const [id, n, edit, after] of BY_ID) {
  test(`I4: finding "${id}" fires alone and fails test ${n} only`, () => {
    let s = variant(edit || ((t) => t));
    if (after) s = after(s);
    const fails = lintSpec(s).filter((x) => x.severity === "fail");
    assert.deepEqual(fails.map((x) => x.id), [id]);
    assert.deepEqual(failsOn(s), [n]);
  });
}

// I5: no ledger may crash the linter.
test("I5: a ledger path that is a directory fails test 9 with 'not a file', never throws", () => {
  const s = variant((t) => t.replace("ledger: runs.jsonl", "ledger: goldens"));
  const fails = lintSpec(s).filter((x) => x.severity === "fail");
  assert.deepEqual(fails.map((x) => [x.test, x.id, x.message]), [[9, "ledger-not-file", "ledger path goldens is not a file"]]);
});
test("I5: a ledger path that is a device, such as /dev/null, is not a file", () => {
  const s = variant((t) => t.replace("ledger: runs.jsonl", "ledger: /dev/null"));
  assert.deepEqual(lintSpec(s).filter((x) => x.severity === "fail").map((x) => x.id), ["ledger-not-file"]);
});
test("I5: a ledger line that parses to anything but an object is a ledger-line failure", () => {
  for (const line of ["null", "42", '"one-shot"', "[]", "true"]) {
    const s = variant((t) => t);
    writeFileSync(join(s.dir, "runs.jsonl"), `${line}\n`);
    const fails = lintSpec(loadSpec(s.path)).filter((x) => x.severity === "fail");
    assert.deepEqual(fails.map((x) => [x.test, x.id]), [[9, "ledger-line"]], line);
  }
});
test("I5: a ledger file that cannot be read fails test 9, never throws", { skip: process.getuid?.() === 0 && "root reads anything" }, () => {
  const s = variant((t) => t);
  chmodSync(join(s.dir, "runs.jsonl"), 0o000);
  try {
    const fails = lintSpec(s).filter((x) => x.severity === "fail");
    assert.deepEqual(fails.map((x) => [x.test, x.id]), [[9, "ledger-unreadable"]]);
  } finally { chmodSync(join(s.dir, "runs.jsonl"), 0o644); }
});

// I6: the body scan ignores code, so a spec can quote the phrases it bans.
const withBody = (body) => { const s = valid(); return { ...s, body }; };
const pointerWarns = (body) => lintSpec(withBody(body)).filter((x) => x.id === "conversation-pointer").length;
test("I6: 'as discussed' in plain prose warns; inside an inline code span or a fenced block it does not", () => {
  assert.equal(pointerWarns("We will ship it as discussed."), 1);
  assert.equal(pointerWarns("| 7 | a next action that says `as discussed` |"), 0);
  assert.equal(pointerWarns("Avoid ``as mentioned above`` in a spec."), 0);
  assert.equal(pointerWarns("Before.\n\n```md\nas discussed\n```\n\nAfter."), 0);
  assert.equal(pointerWarns("~~~\nas we discussed\n~~~\n"), 0);
  assert.equal(pointerWarns("`code` then as discussed in prose"), 1);
  assert.equal(pointerWarns("| a table row | as mentioned earlier |"), 1);
});

// R8: one id namespace across decisions and requirements, because a recipe's spec.authors maps
// every id to its author and a shared id would lose one of them.
test("R8: an id shared by a decision and a requirement fails test 1, naming the id", () => {
  const s = variant((t) => t.replace("  - id: r1", "  - id: audience"));
  const fails = lintSpec(s).filter((x) => x.severity === "fail");
  assert.deepEqual(fails.map((x) => [x.test, x.id]), [[1, "requirement-id"]]);
  assert.match(fails[0].message, /"audience"/);
  assert.match(fails[0].fix, /unique across decisions and requirements/);
});
test("R8: two requirements sharing an id fail test 1, naming the id", () => {
  const s = variant((t) => t.replace("rejects:", `  - id: r1
    text: a second requirement
    fails_when: it is missing
    check:
      station: a check
    source: design doc
    author: gary-sheng
rejects:`));
  const fails = lintSpec(s).filter((x) => x.severity === "fail");
  assert.deepEqual(fails.map((x) => [x.test, x.id]), [[1, "requirement-id"]]);
  assert.match(fails[0].message, /"r1" is used twice/);
});
test("R8: a duplicate decision id says ids are unique across decisions and requirements", () => {
  const f = lintSpec(variant((t) => t.replace("id: length", "id: audience"))).find((x) => x.id === "decision-id");
  assert.match(f.fix, /unique across decisions and requirements/);
});

// M4: a hyperspec version this linter does not know is a warning, never a failure.
test("M4: an unknown hyperspec version is a warning under test 7, never a failure", () => {
  const s = variant((t) => t.replace('hyperspec: "0.1"', 'hyperspec: "0.9"'));
  assert.deepEqual(failsOn(s), []);
  const warns = lintSpec(s).filter((x) => x.severity === "warn");
  assert.deepEqual(warns.map((x) => [x.test, x.id]), [[7, "hyperspec-version"]]);
  assert.match(warns[0].message, /"0\.9"/);
});
test("M4: the known version, quoted or not, raises nothing", () => {
  assert.deepEqual(lintSpec(valid()), []);
  assert.deepEqual(lintSpec(variant((t) => t.replace('hyperspec: "0.1"', "hyperspec: 0.1"))), []);
});

// M5: an example must be a file other than the spec itself.
test("M5: an example that is a directory fails test 6 with 'not a file'", () => {
  const fails = lintSpec(variant((t) => t.replace("goldens/opening.md", "goldens"))).filter((x) => x.severity === "fail");
  assert.deepEqual(fails.map((x) => [x.test, x.id, x.message]), [[6, "example-not-file", 'example "goldens" is not a file']]);
});
test("M5: an example that points at the spec itself fails test 6, by relative or absolute path", () => {
  const rel = variant((t) => t.replace("goldens/opening.md", "spec.md"));
  assert.deepEqual(lintSpec(rel).filter((x) => x.severity === "fail").map((x) => [x.test, x.id]), [[6, "example-self"]]);
  const abs = variant((t) => t);
  writeFileSync(abs.path, readFileSync(abs.path, "utf8").replace("goldens/opening.md", abs.path));
  assert.deepEqual(lintSpec(loadSpec(abs.path)).filter((x) => x.severity === "fail").map((x) => x.id), ["example-self"]);
});
