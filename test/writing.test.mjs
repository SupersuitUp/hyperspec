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

// Every field a complete, fully-valid character entry needs: check/source/author (generic
// ownership, from writing.mjs), Task 3's knowledge/golden_lines/rejected_lines, and R5's
// speech.uses/speech.never/wants/fears/hides/arc_state. relationships is deliberately absent —
// it stays optional. Lines are pre-indented for a "    - id: <id>" list item under characters:.
const CHAR_FIELD = Object.freeze({
  check: ["      check:", "        rubric: blind attribution test against the timeline"],
  source: ["      source: story bible"],
  author: ["      author: gary-sheng"],
  knowledge: ["      knowledge:", "        - by: chapter-1", "          knows: something"],
  goldenLines: ["      golden_lines:", "        - a good line"],
  rejectedLines: ["      rejected_lines:", "        - a rejected line"],
  speech: ["      speech:", "        uses:", "          - short declaratives", "        never:", "          - swears"],
  wants: ["      wants: to be believed"],
  fears: ["      fears: being forgotten"],
  hides: ["      hides: the year it lost"],
  arcState: ["      arc_state: still deciding"],
});
const CHAR_FIELD_ORDER = ["check", "source", "author", "knowledge", "goldenLines", "rejectedLines", "speech", "wants", "fears", "hides", "arcState"];

// Builds one character entry's YAML lines. `omit` drops named fields entirely (to produce a
// "field missing" failing case); `id: null` drops the id line itself, moving the list marker
// onto the next present field. `overrides.speech` / `overrides.knowledge` replace those two
// fields' lines wholesale, for the sub-field cases (e.g. speech present but speech.uses empty)
// that a plain omit can't express.
function characterYaml(id, { omit = [], overrides = {} } = {}) {
  const body = [];
  for (const key of CHAR_FIELD_ORDER) {
    if (omit.includes(key)) continue;
    body.push(...(overrides[key] || CHAR_FIELD[key]));
  }
  if (id == null) {
    const [first, ...rest] = body;
    return [`    - ${first.trim()}`, ...rest];
  }
  return [`    - id: ${id}`, ...body];
}

test("characters: each character entry carries its own check, source and author, checked per entry", () => {
  // Both entries are otherwise fully valid (Task 3's knowledge/golden_lines/rejected_lines and
  // R5's speech/wants/fears/hides/arc_state), so the only findings left are the ones this test is
  // actually about: wisp's missing check and author.
  const s = variant((t) => t.replace("fiction: false", [
    "  characters:",
    ...characterYaml("jerry"),
    ...characterYaml("wisp", { omit: ["check", "author"] }),
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
  // Every content rule (Task 3's + R5's) is satisfied here so this regression test keeps
  // isolating exactly what it always did: check/source/author.
  const s = variant((t) => t.replace("fiction: false", [
    "  characters:",
    ...characterYaml("jerry", { omit: ["check", "source", "author"] }),
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
// Tasks 2 and 3: field rules for each block's own schema (writing-fields.mjs), on top of the
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
      "        segments: materials/call-2026-09-28.md.segments.jsonl",
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
    .replace("fiction: false", ["  characters:", ...characterYaml("jerry"), "fiction: true"].join("\n") + "\n"));
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

// ---- Task 3: form, spine, sources, characters --------------------------------------------------

test("form: a non-numeric length.min or length.max fails test 1", () => {
  const s = variant((t) => t.replace("      min: 600\n", "      min: about six hundred\n"));
  assert.deepEqual(fails(s).map((x) => [x.test, x.id]), [[1, "writing-form-length-min"]]);
});

test("form: length.min greater than length.max fails test 1", () => {
  const s = variant((t) => t.replace("      min: 600\n      max: 1200\n", "      min: 1200\n      max: 600\n"));
  assert.deepEqual(fails(s).map((x) => [x.test, x.id]), [[1, "writing-form-length-range"]]);
});

test("form: length with no unit fails test 1", () => {
  const s = variant((t) => t.replace("      unit: words\n", ""));
  assert.deepEqual(fails(s).map((x) => [x.test, x.id]), [[1, "writing-form-length-unit"]]);
});

test("form: empty required_parts fails test 1", () => {
  const s = variant((t) => t.replace(
    "    required_parts:\n      - claim\n      - evidence\n      - close\n",
    "    required_parts: []\n",
  ));
  assert.deepEqual(fails(s).map((x) => [x.test, x.id]), [[1, "writing-form-required-parts"]]);
});

test("spine: claims outside 3 to 7 fails test 1", () => {
  const s = variant((t) => t.replace(
    "      - id: c3\n        text: progress is derived from disk, never stored\n        materials: [m1]\n",
    "",
  ));
  assert.deepEqual(fails(s).map((x) => [x.test, x.id]), [[1, "writing-spine-claims-count"]]);
});

test("spine: a claim with no materials fails test 4", () => {
  const s = variant((t) => t.replace(
    "      - id: c1\n        text: a hyperspec is a contract a linter can check, not a prompt someone wrote once\n        materials: [m1]\n",
    "      - id: c1\n        text: a hyperspec is a contract a linter can check, not a prompt someone wrote once\n        materials: []\n",
  ));
  assert.deepEqual(fails(s).map((x) => [x.test, x.id]), [[4, "writing-spine-claim-0-materials"]]);
});

test("spine: a claim materials ref naming a material id that does not exist fails test 4", () => {
  const s = variant((t) => t.replace(
    "      - id: c1\n        text: a hyperspec is a contract a linter can check, not a prompt someone wrote once\n        materials: [m1]\n",
    "      - id: c1\n        text: a hyperspec is a contract a linter can check, not a prompt someone wrote once\n        materials: [m9]\n",
  ));
  assert.deepEqual(fails(s).map((x) => [x.test, x.id]), [[4, "writing-spine-claim-0-materials-unknown"]]);
});

test("spine: a claim materials ref with a #segment still resolves against the material id", () => {
  const s = variant((t) => t.replace(
    "      - id: c1\n        text: a hyperspec is a contract a linter can check, not a prompt someone wrote once\n        materials: [m1]\n",
    "      - id: c1\n        text: a hyperspec is a contract a linter can check, not a prompt someone wrote once\n        materials: [m1#claim-2]\n",
  ));
  assert.deepEqual(fails(s).filter((x) => x.id.startsWith("writing-spine")), []);
});

// =============================================================================================
// Task 2: readSegments wired into lint (src/writing-fields.mjs). The valid fixture's m1 material
// now carries a real, fully labeled segments file (materials/call-2026-09-28.md.segments.jsonl:
// s1 "aside", claim-2 "claim" with own: true). These tests break exactly the item's segments:
// field, the segments file itself, or a spine ref, the same way the rest of this suite breaks
// exactly one thing at a time.
// =============================================================================================

const SEGMENTS_FILE = join("materials", "call-2026-09-28.md.segments.jsonl");

// Like variant(), but also lets the real segments file be rewritten in the temp copy, for tests
// that need to break a segment's own label or shape rather than the spec.md item that points at it.
function segmentsVariant(specEdit, segmentsEdit) {
  const d = tempDir("hs-writing-segs-");
  cpSync(VALID, d, { recursive: true });
  const specPath = join(d, "spec.md");
  if (specEdit) writeFileSync(specPath, specEdit(readFileSync(specPath, "utf8")));
  const segPath = join(d, SEGMENTS_FILE);
  if (segmentsEdit) writeFileSync(segPath, segmentsEdit(readFileSync(segPath, "utf8")));
  return loadSpec(specPath);
}

test("materials: an item with no segments field fails test 1 as writing-materials-unmarked, naming the material and hyperspec segments init", () => {
  const s = variant((t) => t.replace("        segments: materials/call-2026-09-28.md.segments.jsonl\n", ""));
  const found = fails(s).find((x) => x.id === "writing-materials-unmarked");
  assert.ok(found, JSON.stringify(fails(s)));
  assert.equal(found.test, 1);
  assert.match(found.message, /\bm1\b/);
  assert.match(found.fix, /hyperspec segments init/);
});

test("materials: a still-unlabeled segment in the real segments file surfaces as a materials finding, and the block is not complete", () => {
  const s = segmentsVariant(null, (t) => t.replace('"label":"aside"', '"label":"unlabeled"'));
  const f = fails(s);
  assert.ok(f.some((x) => x.id === "writing-materials-label-s1" && x.test === 1), JSON.stringify(f));
  const sc = score(lintSpec(s), s.data);
  assert.deepEqual(sc.profile, { name: "writing", complete: 8, total: 9 });
});

test("spine: a bare material ref (no #segment) stays valid even when the material is unmarked", () => {
  const s = variant((t) => t.replace("        segments: materials/call-2026-09-28.md.segments.jsonl\n", ""));
  const f = fails(s);
  assert.deepEqual(f.filter((x) => x.id.startsWith("writing-spine")), []);
  assert.ok(f.some((x) => x.id === "writing-materials-unmarked"));
});

test("spine: a materials ref naming a segment id that does not exist in the real segments file fails test 4", () => {
  const s = variant((t) => t.replace(
    "      - id: c1\n        text: a hyperspec is a contract a linter can check, not a prompt someone wrote once\n        materials: [m1]\n",
    "      - id: c1\n        text: a hyperspec is a contract a linter can check, not a prompt someone wrote once\n        materials: [m1#s9]\n",
  ));
  assert.deepEqual(fails(s).map((x) => [x.test, x.id]), [[4, "writing-spine-claim-0-materials-segment-unknown"]]);
});

test("spine: a materials ref to a segment labeled private fails test 5, naming private", () => {
  const s = segmentsVariant(
    (t) => t.replace(
      "      - id: c1\n        text: a hyperspec is a contract a linter can check, not a prompt someone wrote once\n        materials: [m1]\n",
      "      - id: c1\n        text: a hyperspec is a contract a linter can check, not a prompt someone wrote once\n        materials: [m1#s1]\n",
    ),
    (t) => t.replace('"label":"aside"', '"label":"private"'),
  );
  const f = fails(s);
  assert.deepEqual(f.map((x) => [x.test, x.id]), [[5, "writing-spine-claim-0-materials-segment-private"]]);
  assert.match(f[0].message, /private/);
});

test("spine: a materials ref to a segment labeled question fails test 5, naming question", () => {
  const s = segmentsVariant(
    (t) => t.replace(
      "      - id: c1\n        text: a hyperspec is a contract a linter can check, not a prompt someone wrote once\n        materials: [m1]\n",
      "      - id: c1\n        text: a hyperspec is a contract a linter can check, not a prompt someone wrote once\n        materials: [m1#s1]\n",
    ),
    (t) => t.replace('"label":"aside"', '"label":"question"'),
  );
  const f = fails(s);
  assert.deepEqual(f.map((x) => [x.test, x.id]), [[5, "writing-spine-claim-0-materials-segment-question"]]);
  assert.match(f[0].message, /question/);
});

test("spine: two claims referencing the same unmarked material's segments report the unresolvable ref once, not once per ref", () => {
  const s = variant((t) => t
    .replace("        segments: materials/call-2026-09-28.md.segments.jsonl\n", "")
    .replace(
      "      - id: c1\n        text: a hyperspec is a contract a linter can check, not a prompt someone wrote once\n        materials: [m1]\n",
      "      - id: c1\n        text: a hyperspec is a contract a linter can check, not a prompt someone wrote once\n        materials: [m1#s1]\n",
    )
    .replace(
      "      - id: c2\n        text: the nine tests generalize to a profile without adding a tenth\n        materials: [m1]\n",
      "      - id: c2\n        text: the nine tests generalize to a profile without adding a tenth\n        materials: [m1#s2]\n",
    ));
  const f = fails(s);
  assert.deepEqual(f.map((x) => x.id).sort(), ["writing-materials-unmarked", "writing-spine-materials-segments-unresolvable-m1"]);
});

test("sources: unsourced_claim outside fail/warn fails test 1", () => {
  const s = variant((t) => t.replace("unsourced_claim: fail", "unsourced_claim: ignore"));
  assert.deepEqual(fails(s).map((x) => [x.test, x.id]), [[1, "writing-sources-unsourced-claim"]]);
});

test("sources: unsourced_claim: warn is not a failure, but produces a lint warning", () => {
  const s = variant((t) => t.replace("unsourced_claim: fail", "unsourced_claim: warn"));
  assert.deepEqual(fails(s), []);
  const warnings = lintSpec(s).filter((x) => x.severity === "warn");
  assert.ok(warnings.some((x) => x.id === "writing-sources-unsourced-claim-warn"));
  const sc = score(lintSpec(s), s.data);
  assert.equal(sc.status, "pass");
});

test("characters: an entity path that does not exist fails test 6", () => {
  const s = variant((t) => {
    const lines = characterYaml("jerry");
    lines.splice(1, 0, "      entity: cast/jerry.json"); // right after the "- id: jerry" line
    return t.replace("fiction: false", ["  characters:", ...lines, "fiction: true"].join("\n") + "\n");
  });
  assert.deepEqual(fails(s).map((x) => [x.test, x.id]), [[6, "writing-characters-0-entity-missing"]]);
});

test("characters: an entity path that is a directory, not a file, fails test 6 as not-file (distinct from missing)", () => {
  const s = variant((t) => {
    const lines = characterYaml("jerry");
    lines.splice(1, 0, "      entity: materials"); // "materials" exists, but is a directory
    return t.replace("fiction: false", ["  characters:", ...lines, "fiction: true"].join("\n") + "\n");
  });
  const f = fails(s);
  assert.deepEqual(f.map((x) => [x.test, x.id]), [[6, "writing-characters-0-entity-not-file"]]);
  assert.match(f[0].message, /is not a file/);
});

// Fix round 1, Finding 2: a present-but-malformed knowledge entry (has by, missing knows) must
// produce only its own entry-level finding, not ALSO the block-level "has no knowledge" (the
// list is not empty, it has one broken entry) — matching dnaFields' goldens.length pattern.
test("characters: a knowledge entry with no knows fails only test 1's entry-level finding, not the block-level one", () => {
  const s = variant((t) => t.replace("fiction: false", [
    "  characters:",
    ...characterYaml("jerry", { overrides: { knowledge: ["      knowledge:", "        - by: chapter-1"] } }),
    "fiction: true",
  ].join("\n") + "\n"));
  assert.deepEqual(fails(s).map((x) => [x.test, x.id]), [[1, "writing-characters-0-knowledge-0-knows"]]);
});

test("characters: a knowledge entry with no by fails test 1", () => {
  const s = variant((t) => t.replace("fiction: false", [
    "  characters:",
    ...characterYaml("jerry", { overrides: { knowledge: ["      knowledge:", "        - knows: something"] } }),
    "fiction: true",
  ].join("\n") + "\n"));
  assert.deepEqual(fails(s).map((x) => [x.test, x.id]), [[1, "writing-characters-0-knowledge-0-by"]]);
});

test("characters: an empty knowledge list fails test 1, with no entry-level findings alongside it", () => {
  const s = variant((t) => t.replace("fiction: false", [
    "  characters:",
    ...characterYaml("jerry", { overrides: { knowledge: ["      knowledge: []"] } }),
    "fiction: true",
  ].join("\n") + "\n"));
  assert.deepEqual(fails(s).map((x) => [x.test, x.id]), [[1, "writing-characters-0-knowledge"]]);
});

test("characters: no id fails test 1", () => {
  const s = variant((t) => t.replace("fiction: false", [
    "  characters:",
    ...characterYaml(null),
    "fiction: true",
  ].join("\n") + "\n"));
  assert.deepEqual(fails(s).map((x) => [x.test, x.id]), [[1, "writing-characters-0-id"]]);
});

test("characters: empty golden_lines fails test 6", () => {
  const s = variant((t) => t.replace("fiction: false", [
    "  characters:",
    ...characterYaml("jerry", { omit: ["goldenLines"] }),
    "fiction: true",
  ].join("\n") + "\n"));
  assert.deepEqual(fails(s).map((x) => [x.test, x.id]), [[6, "writing-characters-0-golden-lines"]]);
});

test("characters: empty rejected_lines fails test 6", () => {
  const s = variant((t) => t.replace("fiction: false", [
    "  characters:",
    ...characterYaml("jerry", { omit: ["rejectedLines"] }),
    "fiction: true",
  ].join("\n") + "\n"));
  assert.deepEqual(fails(s).map((x) => [x.test, x.id]), [[6, "writing-characters-0-rejected-lines"]]);
});

// ---- R5: speech.uses, speech.never, wants, fears, hides, arc_state (each test 1); relationships
// stays optional ------------------------------------------------------------------------------

test("characters: empty speech.uses fails test 1", () => {
  const s = variant((t) => t.replace("fiction: false", [
    "  characters:",
    ...characterYaml("jerry", { overrides: { speech: ["      speech:", "        never:", "          - swears"] } }),
    "fiction: true",
  ].join("\n") + "\n"));
  assert.deepEqual(fails(s).map((x) => [x.test, x.id]), [[1, "writing-characters-0-speech-uses"]]);
});

test("characters: empty speech.never fails test 1", () => {
  const s = variant((t) => t.replace("fiction: false", [
    "  characters:",
    ...characterYaml("jerry", { overrides: { speech: ["      speech:", "        uses:", "          - short declaratives"] } }),
    "fiction: true",
  ].join("\n") + "\n"));
  assert.deepEqual(fails(s).map((x) => [x.test, x.id]), [[1, "writing-characters-0-speech-never"]]);
});

test("characters: no wants fails test 1", () => {
  const s = variant((t) => t.replace("fiction: false", [
    "  characters:",
    ...characterYaml("jerry", { omit: ["wants"] }),
    "fiction: true",
  ].join("\n") + "\n"));
  assert.deepEqual(fails(s).map((x) => [x.test, x.id]), [[1, "writing-characters-0-wants"]]);
});

test("characters: no fears fails test 1", () => {
  const s = variant((t) => t.replace("fiction: false", [
    "  characters:",
    ...characterYaml("jerry", { omit: ["fears"] }),
    "fiction: true",
  ].join("\n") + "\n"));
  assert.deepEqual(fails(s).map((x) => [x.test, x.id]), [[1, "writing-characters-0-fears"]]);
});

test("characters: no hides fails test 1", () => {
  const s = variant((t) => t.replace("fiction: false", [
    "  characters:",
    ...characterYaml("jerry", { omit: ["hides"] }),
    "fiction: true",
  ].join("\n") + "\n"));
  assert.deepEqual(fails(s).map((x) => [x.test, x.id]), [[1, "writing-characters-0-hides"]]);
});

test("characters: no arc_state fails test 1", () => {
  const s = variant((t) => t.replace("fiction: false", [
    "  characters:",
    ...characterYaml("jerry", { omit: ["arcState"] }),
    "fiction: true",
  ].join("\n") + "\n"));
  assert.deepEqual(fails(s).map((x) => [x.test, x.id]), [[1, "writing-characters-0-arc-state"]]);
});

test("characters: relationships stays optional (R5) — a fully valid character with none still passes clean", () => {
  const s = variant((t) => t.replace("fiction: false", [
    "  characters:",
    ...characterYaml("jerry"),
    "fiction: true",
  ].join("\n") + "\n"));
  assert.deepEqual(fails(s).filter((x) => x.id.startsWith("writing-characters")), []);
  assert.ok(!/relationships/i.test(JSON.stringify(fails(s))));
});

// =============================================================================================
// Fix round 1, Finding 1: table-driven failing-case tests for the ~18 rules the review found
// implemented but untested. Each row edits the valid fixture to break exactly one field and
// asserts the exact [test, id] pair the rule is supposed to produce.
// =============================================================================================

const FIELD_RULE_CASES = [
  {
    name: "materials: an item with no path (the field itself absent) fails test 1",
    edit: (t) => t.replace("        path: materials/call-2026-09-28.md\n", ""),
    expect: [[1, "writing-materials-item-0-path"]],
  },
  // R6 (fix round 1, Task 4): a writing field set to the bare placeholder word "tbd" fails the
  // same as the field being absent — str() in src/placeholder.mjs blanks it before writing-fields
  // ever sees a non-empty string. dna.writer never had a closed set to violate, so before R6 this
  // passed silently.
  {
    name: "dna: writer set to the placeholder word \"tbd\" fails test 1, same as writer being absent",
    edit: (t) => t.replace("    writer: gary-sheng\n", "    writer: tbd\n"),
    expect: [[1, "writing-dna-writer"]],
  },
  {
    name: "dna: scope with no form fails test 1",
    edit: (t) => t.replace("      form: essay\n", ""),
    expect: [[1, "writing-dna-scope-form"]],
  },
  {
    name: "dna: no rules field at all (distinct from a rules path that does not exist) fails test 1",
    edit: (t) => t.replace("    rules: WRITING-STYLE.md\n", ""),
    expect: [[1, "writing-dna-rules"]],
  },
  {
    name: "dna: a golden with no path at all (distinct from a path that does not exist) fails test 1",
    edit: (t) => t.replace(
      "      - path: goldens/opening.md\n        why:",
      "      - why:",
    ),
    expect: [[1, "writing-dna-golden-0-path"]],
  },
  {
    name: "persona: empty may_assert fails test 1",
    edit: (t) => t.replace(
      "    may_assert:\n      - what gary has shipped and measured himself\n",
      "    may_assert: []\n",
    ),
    expect: [[1, "writing-persona-may-assert"]],
  },
  {
    name: "audience: no funnel_now fails test 1",
    edit: (t) => t.replace("    funnel_now: reading the standard's README\n", ""),
    expect: [[1, "writing-audience-funnel-now"]],
  },
  {
    name: "audience: no believes_now fails test 1",
    edit: (t) => t.replace("    believes_now: a spec is a prompt someone wrote once\n", ""),
    expect: [[1, "writing-audience-believes-now"]],
  },
  {
    name: "audience: no wants fails test 1",
    edit: (t) => t.replace("    wants: to know whether a writing spec is worth adopting\n", ""),
    expect: [[1, "writing-audience-wants"]],
  },
  {
    name: "audience: no reads_on fails test 1",
    edit: (t) => t.replace("    reads_on: a phone, in ninety seconds\n", ""),
    expect: [[1, "writing-audience-reads-on"]],
  },
  {
    name: "goal: no from fails test 1",
    edit: (t) => t.replace("    from: believes a spec is a prompt someone wrote once\n", ""),
    expect: [[1, "writing-goal-from"]],
  },
  {
    name: "goal: no to fails test 1",
    edit: (t) => t.replace("    to: believes a spec is a contract a linter can check\n", ""),
    expect: [[1, "writing-goal-to"]],
  },
  {
    name: "goal: no next_if_worked fails test 1",
    edit: (t) => t.replace("    next_if_worked: reads the schema section\n", ""),
    expect: [[1, "writing-goal-next-if-worked"]],
  },
  {
    name: "goal: change with no text fails test 1",
    edit: (t) => t.replace("      text: a hyperspec is a contract, not a prompt\n", ""),
    expect: [[1, "writing-goal-change-text"]],
  },
  {
    name: "form: no name fails test 1",
    edit: (t) => t.replace("    name: essay\n", ""),
    expect: [[1, "writing-form-name"]],
  },
  {
    name: "form: a non-numeric length.max specifically fails test 1 (min stays untouched)",
    edit: (t) => t.replace("      max: 1200\n", "      max: a lot\n"),
    expect: [[1, "writing-form-length-max"]],
  },
  {
    name: "spine: no kind fails test 1",
    edit: (t) => t.replace("    kind: thesis\n", ""),
    expect: [[1, "writing-spine-kind"]],
  },
  {
    name: "spine: a claim with no id (the field itself absent) fails test 1",
    edit: (t) => t.replace(
      "      - id: c1\n        text: a hyperspec is a contract a linter can check, not a prompt someone wrote once\n",
      "      - text: a hyperspec is a contract a linter can check, not a prompt someone wrote once\n",
    ),
    expect: [[1, "writing-spine-claim-0-id"]],
  },
  {
    name: "spine: a claim with no text fails test 1",
    edit: (t) => t.replace(
      "        text: a hyperspec is a contract a linter can check, not a prompt someone wrote once\n",
      "",
    ),
    expect: [[1, "writing-spine-claim-0-text"]],
  },
  {
    name: "sources: no ledger fails test 1",
    edit: (t) => t.replace("    ledger: essay.claims.jsonl\n", ""),
    expect: [[1, "writing-sources-ledger"]],
  },
];

for (const c of FIELD_RULE_CASES) {
  test(c.name, () => {
    const s = variant(c.edit);
    assert.deepEqual(fails(s).map((x) => [x.test, x.id]), c.expect);
  });
}

// ---- Fix round 1, Findings 3 and 4: path-vs-directory, and duplicate materials ids -----------

test("materials: an item path that resolves to a directory, not a file, fails test 6 as not-file (distinct from missing)", () => {
  const s = variant((t) => t.replace("materials/call-2026-09-28.md", "materials"));
  const f = fails(s);
  assert.deepEqual(f.map((x) => [x.test, x.id]), [[6, "writing-materials-item-0-path-not-file"]]);
  assert.match(f[0].message, /is not a file/);
});

test("dna: a rules path that resolves to a directory fails test 6 as not-file", () => {
  const s = variant((t) => t.replace("rules: WRITING-STYLE.md", "rules: materials"));
  assert.deepEqual(fails(s).map((x) => [x.test, x.id]), [[6, "writing-dna-rules-not-file"]]);
});

test("dna: a golden path that resolves to a directory fails test 6 as not-file", () => {
  const s = variant((t) => t.replace("path: goldens/opening.md", "path: materials"));
  assert.deepEqual(fails(s).map((x) => [x.test, x.id]), [[6, "writing-dna-golden-0-not-file"]]);
});

test("materials: three items sharing an id produce exactly one duplicate finding, not one per extra occurrence", () => {
  const s = variant((t) => t.replace(
    "        trust: raw\n    check:",
    [
      "        trust: raw",
      "      - id: m1",
      "        path: materials/call-2026-09-28.md",
      "        segments: materials/call-2026-09-28.md.segments.jsonl",
      "        produced_by: gary-sheng",
      '        captured: "2026-09-28"',
      "        how: voice memo transcript",
      "        trust: raw",
      "      - id: m1",
      "        path: materials/call-2026-09-28.md",
      "        segments: materials/call-2026-09-28.md.segments.jsonl",
      "        produced_by: gary-sheng",
      '        captured: "2026-09-28"',
      "        how: voice memo transcript",
      "        trust: raw",
      "    check:",
    ].join("\n"),
  ));
  const f = fails(s);
  assert.deepEqual(f.map((x) => [x.test, x.id]), [[1, "writing-materials-item-id"]]);
});
