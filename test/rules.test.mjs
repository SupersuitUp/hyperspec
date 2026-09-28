import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, cpSync } from "node:fs";
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

test("9: no ledger declared fails test 9; a declared ledger not yet written is fine", () => {
  assert.deepEqual(failsOn(variant((t) => t.replace(/improvement:\n  ledger: .*\n/, ""))), [9]);
  assert.deepEqual(failsOn(variant((t) => t.replace("ledger: runs.jsonl", "ledger: later.jsonl"))), []);
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
