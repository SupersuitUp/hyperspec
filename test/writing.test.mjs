import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, readFileSync, cpSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tempDir } from "./tmp.mjs";
import { loadSpec } from "../src/load.mjs";
import { lintSpec } from "../src/rules.mjs";
import { score, exitCode } from "../src/score.mjs";
import { MATERIAL_LABELS, BLOCKS, lintWriting, blockStatus } from "../src/writing.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const VALID = join(HERE, "fixtures", "writing-valid");
const valid = () => loadSpec(join(VALID, "spec.md"));
// A copy of the writing-valid fixture folder, so each test breaks exactly one thing without
// touching the shared fixture other tests (and Tasks 2-3) read.
function variant(edit) {
  const d = tempDir("hs-writing-");
  cpSync(VALID, d, { recursive: true });
  const p = join(d, "spec.md");
  writeFileSync(p, edit(readFileSync(p, "utf8")));
  return loadSpec(p);
}
const fails = (spec) => lintSpec(spec).filter((x) => x.severity === "fail");
const failIds = (spec) => fails(spec).map((x) => x.id).sort();

test("MATERIAL_LABELS is the closed vocabulary, exported for build 4", () => {
  assert.deepEqual(MATERIAL_LABELS, ["claim", "story", "quote", "stance", "question", "aside", "private"]);
  assert.ok(Object.isFrozen(MATERIAL_LABELS));
});

test("BLOCKS is the nine writing blocks in schema order", () => {
  assert.deepEqual(BLOCKS, ["materials", "dna", "persona", "audience", "goal", "form", "spine", "sources", "characters"]);
  assert.ok(Object.isFrozen(BLOCKS));
});

test("the writing-valid fixture lints with zero findings, and writing 9/9 blocks complete", () => {
  const s = valid();
  const findings = lintSpec(s);
  assert.deepEqual(findings, []);
  const sc = score(findings, s.data);
  assert.equal(sc.status, "pass");
  assert.deepEqual(sc.profile, { name: "writing", complete: 9, total: 9 });
});

test("R1: profile writing with no writing: map fails test 1 once per required block, 8 when fiction is false", () => {
  const s = variant((t) => t.replace(/writing:\n([ \t].*\n)+fiction: false\n/, "fiction: false\n"));
  const f = fails(s);
  assert.deepEqual(f.map((x) => x.test), Array(8).fill(1));
  assert.deepEqual(f.map((x) => x.id).sort(), [
    "writing-audience-missing", "writing-dna-missing", "writing-form-missing", "writing-goal-missing",
    "writing-materials-missing", "writing-persona-missing", "writing-sources-missing", "writing-spine-missing",
  ]);
});

test("R1: the same, with fiction: true, fails once per required block including characters: 9 findings", () => {
  const s = variant((t) => t.replace(/writing:\n([ \t].*\n)+fiction: false\n/, "fiction: true\n"));
  const f = fails(s);
  assert.deepEqual(f.map((x) => x.test), Array(9).fill(1));
  assert.ok(f.some((x) => x.id === "writing-characters-missing"));
});

test("fiction: false never requires characters: an essay with no characters: block still passes", () => {
  assert.deepEqual(failIds(valid()), []);
  assert.ok(!("characters" in valid().data.writing));
});

test("deferring a block with an open decision blocks the spec (exit 3), rather than failing it", () => {
  const s = variant((t) => t
    .replace(/  goal:\n(    .*\n|      .*\n)+  form:/, "  form:")
    .replace("decisions:\n", 'decisions:\n  - id: writing-goal\n    state: open\n    question: what step down the funnel does this piece take the reader?\n    source: goal interview\n    author: gary-sheng\n    chosen_by: human\n'));
  const findings = lintSpec(s);
  assert.deepEqual(findings.filter((x) => x.severity === "fail"), []);
  assert.ok(!findings.some((x) => x.id.startsWith("writing-goal")));
  const sc = score(findings, s.data);
  assert.equal(sc.status, "blocked");
  assert.equal(exitCode(sc.status), 3);
  assert.deepEqual(sc.open, ["writing-goal"]);
  assert.deepEqual(sc.profile, { name: "writing", complete: 8, total: 9 });
});

test("deferring a block with a delegated decision (and a rule) is not blocked and not a failure, but is not counted complete", () => {
  const s = variant((t) => t
    .replace(/  goal:\n(    .*\n|      .*\n)+  form:/, "  form:")
    .replace("decisions:\n", 'decisions:\n  - id: writing-goal\n    state: delegated\n    rule: pick the smallest step the audience block already supports\n    source: goal interview\n    author: gary-sheng\n    chosen_by: human\n'));
  const findings = lintSpec(s);
  assert.deepEqual(findings.filter((x) => x.severity === "fail"), []);
  const sc = score(findings, s.data);
  assert.equal(sc.status, "pass");
  assert.deepEqual(sc.profile, { name: "writing", complete: 8, total: 9 });
});

test("a delegated decision with no rule still fails test 1, the ordinary decision rule, not a writing- id", () => {
  const s = variant((t) => t
    .replace(/  goal:\n(    .*\n|      .*\n)+  form:/, "  form:")
    .replace("decisions:\n", 'decisions:\n  - id: writing-goal\n    state: delegated\n    source: goal interview\n    author: gary-sheng\n    chosen_by: human\n'));
  const f = fails(s);
  assert.deepEqual(f.map((x) => [x.test, x.id]), [[1, "delegated-rule"]]);
});

test("writing.progress is forbidden: stored progress fails test 7 as writing-progress", () => {
  const s = variant((t) => t.replace("fiction: false", "  progress: draft 2 of 3\nfiction: false"));
  assert.deepEqual(fails(s).map((x) => [x.test, x.id]), [[7, "writing-progress"]]);
});

for (const block of ["materials", "dna", "persona", "audience", "goal", "form", "spine", "sources"]) {
  test(`${block}: a present block with no check fails test 3 as writing-${block}-check`, () => {
    const s = variant((t) => t.replace(new RegExp(`(  ${block}:\\n(?:    .*\\n|      .*\\n)*?)    check:\\n(?:      .*\\n)+`), "$1"));
    assert.deepEqual(failIds(s), [`writing-${block}-check`]);
  });
  test(`${block}: a present block with no source, or no author, fails test 4`, () => {
    const noSource = variant((t) => t.replace(new RegExp(`(  ${block}:\\n(?:.*\\n)*?)    source: .*\\n`), "$1"));
    assert.deepEqual(failIds(noSource), [`writing-${block}-source`]);
    const noAuthor = variant((t) => t.replace(new RegExp(`(  ${block}:\\n(?:.*\\n)*?)    author: .*\\n`), "$1"));
    assert.deepEqual(failIds(noAuthor), [`writing-${block}-author`]);
  });
}

test("characters: each character entry carries its own check, source and author, checked per entry", () => {
  const s = variant((t) => t.replace("fiction: false", [
    "  characters:",
    "    - id: jerry",
    "      check:",
    "        rubric: blind attribution test against the timeline",
    "      source: story bible",
    "      author: gary-sheng",
    "    - id: wisp",
    "      source: story bible",
    "fiction: true",
  ].join("\n") + "\n"));
  const f = fails(s);
  assert.deepEqual(f.map((x) => [x.test, x.id]), [[3, "writing-characters-1-check"], [4, "writing-characters-1-author"]]);
  const sc = score(lintSpec(s), s.data);
  assert.deepEqual(sc.profile, { name: "writing", complete: 8, total: 9 });
});

test("unknown profile is a warning under test 7, and runs no writing rules at all", () => {
  const s = variant((t) => t.replace("profile: writing", "profile: storyboard"));
  const findings = lintSpec(s);
  assert.deepEqual(findings.filter((x) => x.severity === "fail"), []);
  assert.deepEqual(findings.map((x) => [x.test, x.id, x.severity]), [[7, "unknown-profile", "warn"]]);
  assert.match(findings[0].message, /does not know profile "storyboard"/);
  const sc = score(findings, s.data);
  assert.equal(sc.profile, undefined);
});

test("no profile: at all runs no writing rules, and score() carries no profile key", () => {
  const s = variant((t) => t.replace(/^profile: writing\n/m, ""));
  const findings = lintSpec(s);
  assert.deepEqual(findings, []);
  const sc = score(findings, s.data);
  assert.equal(sc.profile, undefined);
});

test("lintWriting and blockStatus agree directly, off the same findings, with no profile dispatch involved", () => {
  const s = valid();
  const findings = lintWriting(s);
  assert.deepEqual(findings, []);
  assert.deepEqual(blockStatus(s.data, findings), { complete: 9, total: 9 });
});

test("a spec with no writing: at all and no profile: still lints clean (the core format, untouched)", () => {
  mkdirSync(tempDir("hs-writing-noop-"), { recursive: true });
  const p = join(HERE, "fixtures", "valid", "spec.md");
  const s = loadSpec(p);
  const findings = lintSpec(s);
  assert.deepEqual(findings.filter((x) => x.severity === "fail"), []);
  assert.equal(score(findings, s.data).profile, undefined);
});
