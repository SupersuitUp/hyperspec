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

// R3: "delegated (with a rule)" is a precondition on the exemption, not a description of
// delegated's normal shape. A rule-less delegated decision has deferred to nothing, so it does
// not stand in for the block: writing-<block>-missing still fires, alongside the ordinary
// decision-level delegated-rule finding (test 1) the ordinary decision rules already produce for
// any delegated decision with no rule.
test("R3: a delegated decision with no rule does NOT exempt the block: writing-<block>-missing fires alongside delegated-rule", () => {
  const s = variant((t) => t
    .replace(/  goal:\n(    .*\n|      .*\n)+  form:/, "  form:")
    .replace("decisions:\n", 'decisions:\n  - id: writing-goal\n    state: delegated\n    source: goal interview\n    author: gary-sheng\n    chosen_by: human\n'));
  const f = fails(s);
  assert.deepEqual(f.map((x) => [x.test, x.id]).sort(), [[1, "delegated-rule"], [1, "writing-goal-missing"]].sort());
  const sc = score(lintSpec(s), s.data);
  assert.equal(sc.status, "fail");
  assert.equal(exitCode(sc.status), 1);
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

// Fix round 1, Finding 1: a PRESENT but unrequired block (characters, with fiction: false) still
// gets its content validated and still counts against completeness when broken. Before the fix,
// `required()` gated the whole per-block loop body, so a written-but-broken characters block with
// fiction: false produced zero findings and was credited complete.
test("fix 1: a present characters block with fiction: false is still validated: missing check/source/author fails and is not counted complete", () => {
  const s = variant((t) => t.replace("fiction: false", [
    "  characters:",
    "    - id: jerry",
    "fiction: false",
  ].join("\n") + "\n"));
  const f = fails(s);
  assert.deepEqual(f.map((x) => [x.test, x.id]), [
    [3, "writing-characters-0-check"],
    [4, "writing-characters-0-source"],
    [4, "writing-characters-0-author"],
  ]);
  const sc = score(lintSpec(s), s.data);
  assert.equal(sc.status, "fail");
  // Every other block is complete (8), and the broken-but-written characters block is NOT
  // credited just because it was unrequired: 8 of 9, not 9 of 9.
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

// =============================================================================================
// Task 2: field rules for materials, dna, persona, audience, goal (writing-fields.mjs), on top of the
// generic presence/check/source/author rules above. Each test edits a copy of the valid fixture
// so it breaks exactly one thing, per the fixture's own discipline.
// =============================================================================================

// ---- Task 2: materials, dna, persona, audience, goal ------------------------------------------

test("materials: an item with no id fails test 1", () => {
  // Also cascades into spine's own materials-ref check (its claims point at "m1", which no
  // longer exists once the item's id is gone) — a real, correct consequence, not the thing this
  // test is about, so it checks membership rather than the exact set.
  const s = variant((t) => t.replace(
    "      - id: m1\n        path: materials/call-2026-09-28.md",
    "      - path: materials/call-2026-09-28.md",
  ));
  const f = fails(s);
  assert.ok(f.some((x) => x.test === 1 && x.id === "writing-materials-item-0-id"));
});

test("materials: two items sharing an id fail test 1", () => {
  const s = variant((t) => t.replace(
    "        trust: raw\n    check:",
    [
      "        trust: raw",
      "      - id: m1",
      "        path: materials/call-2026-09-28.md",
      "        produced_by: gary-sheng",
      '        captured: "2026-09-28"',
      "        how: voice memo transcript",
      "        trust: raw",
      "    check:",
    ].join("\n"),
  ));
  assert.deepEqual(failIds(s), ["writing-materials-item-id"]);
});

test("materials: an item missing produced_by, captured or how fails test 1", () => {
  const s = variant((t) => t.replace(
    '        produced_by: gary-sheng\n        captured: "2026-09-28"\n        how: voice memo transcript\n',
    "",
  ));
  const f = fails(s);
  assert.deepEqual(f.map((x) => x.test), [1, 1, 1]);
  assert.deepEqual(f.map((x) => x.id).sort(), [
    "writing-materials-item-0-captured", "writing-materials-item-0-how", "writing-materials-item-0-produced-by",
  ]);
});

test("materials: an item with trust outside raw/considered/verified fails test 1", () => {
  const s = variant((t) => t.replace("trust: raw", "trust: unverified"));
  assert.deepEqual(fails(s).map((x) => [x.test, x.id]), [[1, "writing-materials-item-0-trust"]]);
});

test("materials: an item path that does not exist fails test 6", () => {
  const s = variant((t) => t.replace("materials/call-2026-09-28.md", "materials/does-not-exist.md"));
  assert.deepEqual(fails(s).map((x) => [x.test, x.id]), [[6, "writing-materials-item-0-path-missing"]]);
});

test("dna: no writer fails test 1", () => {
  const s = variant((t) => t.replace("    writer: gary-sheng\n", ""));
  assert.deepEqual(failIds(s), ["writing-dna-writer"]);
});

test("dna: scope missing form, audience or purpose fails test 1", () => {
  const s = variant((t) => t.replace(
    "    scope:\n      form: essay\n      audience: builders\n      purpose: persuade\n",
    "    scope:\n      form: essay\n",
  ));
  const f = fails(s);
  assert.deepEqual(f.map((x) => x.test), [1, 1]);
  assert.deepEqual(f.map((x) => x.id).sort(), ["writing-dna-scope-audience", "writing-dna-scope-purpose"]);
});

test("dna: a rules path that does not exist fails test 6", () => {
  const s = variant((t) => t.replace("rules: WRITING-STYLE.md", "rules: NO-SUCH-STYLE.md"));
  assert.deepEqual(fails(s).map((x) => [x.test, x.id]), [[6, "writing-dna-rules-missing"]]);
});

test("dna: no goldens fails test 1", () => {
  const s = variant((t) => t.replace(
    "    goldens:\n      - path: goldens/opening.md\n        why: the claim lands in the first line and the second line earns it\n",
    "    goldens: []\n",
  ));
  assert.deepEqual(failIds(s), ["writing-dna-goldens"]);
});

test("dna: a golden path that does not exist fails test 6", () => {
  const s = variant((t) => t.replace("path: goldens/opening.md", "path: goldens/does-not-exist.md"));
  assert.deepEqual(fails(s).map((x) => [x.test, x.id]), [[6, "writing-dna-golden-0-missing"]]);
});

test("dna: a golden with no why fails test 6", () => {
  const s = variant((t) => t.replace(
    "      - path: goldens/opening.md\n        why: the claim lands in the first line and the second line earns it\n",
    "      - path: goldens/opening.md\n",
  ));
  assert.deepEqual(fails(s).map((x) => [x.test, x.id]), [[6, "writing-dna-golden-0-why"]]);
});

test("persona: identity that is not self, role:<name> or character:<id> fails test 1", () => {
  const s = variant((t) => t.replace("identity: self", "identity: narrator"));
  assert.deepEqual(fails(s).map((x) => [x.test, x.id]), [[1, "writing-persona-identity"]]);
});

test("persona: identity naming a character not in writing.characters fails test 1", () => {
  const s = variant((t) => t.replace("identity: self", "identity: character:jerry"));
  assert.deepEqual(fails(s).map((x) => [x.test, x.id]), [[1, "writing-persona-identity"]]);
});

test("persona: identity naming a character that IS in writing.characters passes (fiction: true)", () => {
  const s = variant((t) => t
    .replace("identity: self", "identity: character:jerry")
    .replace("fiction: false", [
      "  characters:",
      "    - id: jerry",
      "      check:",
      "        rubric: blind attribution test against the timeline",
      "      source: story bible",
      "      author: gary-sheng",
      "      knowledge:",
      "        - by: chapter-1",
      "          knows: something",
      "      golden_lines:",
      "        - a good line",
      "      rejected_lines:",
      "        - a rejected line",
      "fiction: true",
    ].join("\n") + "\n"));
  assert.deepEqual(fails(s).filter((x) => x.id.startsWith("writing-persona")), []);
});

test("persona: no stance fails test 1", () => {
  const s = variant((t) => t.replace("    stance: peer\n", ""));
  assert.deepEqual(fails(s).map((x) => [x.test, x.id]), [[1, "writing-persona-stance"]]);
});

test("persona: stance outside peer/mentor/witness/guide warns, does not fail", () => {
  const s = variant((t) => t.replace("stance: peer", "stance: confidant"));
  assert.deepEqual(fails(s), []);
  const warnings = lintSpec(s).filter((x) => x.severity === "warn");
  assert.ok(warnings.some((x) => x.id === "writing-persona-stance"));
});

test("persona: empty will_not_say fails test 5", () => {
  const s = variant((t) => t.replace(
    "    will_not_say:\n      - a claim about someone else's internal numbers\n",
    "    will_not_say: []\n",
  ));
  assert.deepEqual(fails(s).map((x) => [x.test, x.id]), [[5, "writing-persona-will-not-say"]]);
});

test("persona: facts_from not exactly sources fails test 5", () => {
  const s = variant((t) => t.replace("facts_from: sources", "facts_from: gary's memory"));
  assert.deepEqual(fails(s).map((x) => [x.test, x.id]), [[5, "writing-persona-facts-from"]]);
});

test("audience: missing who, funnel_now, believes_now, wants or reads_on fails test 1", () => {
  const s = variant((t) => t.replace(
    "    who: an operator who has read one hyperspec and wants to know whether the next one is worth adopting\n",
    "",
  ));
  assert.deepEqual(fails(s).map((x) => [x.test, x.id]), [[1, "writing-audience-who"]]);
});

test("audience: empty knows fails test 1", () => {
  const s = variant((t) => t.replace("    knows:\n      - hyperspec\n      - lint\n", "    knows: []\n"));
  assert.deepEqual(fails(s).map((x) => [x.test, x.id]), [[1, "writing-audience-knows"]]);
});

test("audience: reader outside person/agent fails test 1", () => {
  const s = variant((t) => t.replace("reader: person", "reader: everyone"));
  assert.deepEqual(fails(s).map((x) => [x.test, x.id]), [[1, "writing-audience-reader"]]);
});

test("goal: change.kind outside belief/action/feeling fails test 1", () => {
  const s = variant((t) => t.replace("kind: belief", "kind: mindset"));
  assert.deepEqual(fails(s).map((x) => [x.test, x.id]), [[1, "writing-goal-change-kind"]]);
});

test("goal: conditions with fewer than 5 ids fails test 2", () => {
  const s = variant((t) => t.replace("conditions: [r1, r2, r3, r4, r5]", "conditions: [r1, r2]"));
  assert.deepEqual(fails(s).map((x) => [x.test, x.id]), [[2, "writing-goal-conditions-count"]]);
});

test("goal: conditions naming a requirement id that does not exist fails test 2", () => {
  const s = variant((t) => t.replace("conditions: [r1, r2, r3, r4, r5]", "conditions: [r1, r2, r3, r4, r9]"));
  assert.deepEqual(fails(s).map((x) => [x.test, x.id]), [[2, "writing-goal-conditions-unknown"]]);
});

