// The knowledge station (fiction only): its packet (each character's knowledge timeline and the
// draft), how its verdict is validated (every leak names a known character, quotes the draft and
// says what is known too early), and what a valid verdict derives: pass when there is no leak.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { cli, workspace, storyWorkspace, forStation, writeVerdict, ledgerLines, prepare, record, STORY_DRAFT } from "./judge-fixture.mjs";
import { KNOWLEDGE_INSTRUCTIONS, skipReason } from "../src/judges/knowledge.mjs";

const json = (path) => JSON.parse(readFileSync(path, "utf8"));
function ready(w = storyWorkspace()) {
  const p = forStation(w, "knowledge");
  const r = prepare(p, "--only", "knowledge");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return p;
}
function recordJson(w, verdict) {
  writeVerdict(w.verdict, verdict);
  const r = record(w, "--json");
  return { r, j: JSON.parse(r.stdout) };
}
const ids = (findings) => findings.map((f) => f.id);
const leak = (character = "ines", evidence = "Sold means sold", knows_too_early = "that the bakery is sold, before scene-1 ends") => ({ character, evidence, knows_too_early });

test("the knowledge packet: the characters' rubric, fixed instructions, every timeline and the draft", () => {
  const w = ready();
  const p = json(w.packet);
  assert.equal(p.station, "knowledge");
  assert.equal(p.rubric, "blind attribution test, knowledge-leak check against the timeline, consistency against golden and rejected lines");
  assert.equal(p.instructions, KNOWLEDGE_INSTRUCTIONS);
  for (const s of ["inputs.characters", "knows", "by", "leaks", "verbatim", "three whole words", "knows_too_early", "verdict shape"]) assert.ok(p.instructions.includes(s), s);
  assert.deepEqual(Object.keys(p.inputs), ["characters", "draft"]);
  assert.deepEqual(p.inputs.characters, [
    { id: "ines", knowledge: [
      { by: "scene-1", knows: "the sale closes on Friday, and the new owners will not keep it a bakery" },
      { by: "scene-4", knows: "Theo has a place at a baking school in another city and leaves in the autumn" },
    ] },
    { id: "theo", knowledge: [
      { by: "scene-1", knows: "the oven has made the noise since March, and he leaves for school in the autumn" },
      { by: "scene-3", knows: "the bakery is sold, and the new owners will not keep it a bakery" },
    ] },
  ]);
  assert.equal(p.inputs.draft, STORY_DRAFT);
  assert.deepEqual(p.verdict_schema.required, ["leaks"]);
  assert.deepEqual(p.verdict_schema.properties.leaks.items.properties.character.enum, ["ines", "theo"]);
  assert.deepEqual(readdirSync(w.out), ["knowledge.packet.json"], "knowledge has no key");
});

test("the same spec and draft give a byte-identical knowledge packet", () => {
  const w = ready();
  const first = readFileSync(w.packet);
  assert.equal(prepare(w, "--only", "knowledge", "--force").status, 0);
  assert.ok(first.equals(readFileSync(w.packet)));
});

test("knowledge is skipped when the spec is not fiction", () => {
  const w = forStation(workspace(), "knowledge");
  const r = prepare(w, "--only", "knowledge");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^knowledge: skip \(the spec is not fiction; knowledge applies only with fiction: true\)$/m);
  assert.deepEqual(readdirSync(w.out), []);
});

test("knowledge needs a character with a timeline and a rubric (lint refuses the first, so asked directly)", () => {
  const ch = (id, extra = {}) => ({ id, knowledge: [{ by: "scene-1", knows: "x" }], check: { rubric: "leak check" }, ...extra });
  const spec = (characters) => ({ data: { fiction: "true", writing: { characters } } });
  assert.equal(skipReason(spec([ch("ines", { knowledge: [] }), ch("theo", { knowledge: [{ by: "scene-1" }] })])), "no character in writing.characters has a knowledge timeline");
  assert.equal(skipReason(spec([ch("ines", { check: { station: "s" } })])), "no character's check has a rubric");
  assert.equal(skipReason(spec([ch("ines", { knowledge: [] }), ch("theo")])), null, "one character with a timeline is enough");
  assert.equal(skipReason({ data: { writing: { characters: [ch("ines")] } } }), "the spec is not fiction; knowledge applies only with fiction: true");
});

test("no leak: pass with no findings", () => {
  const w = ready();
  const { r, j } = recordJson(w, { leaks: [] });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(j.status, "pass");
  assert.deepEqual(j.findings, []);
});

test("each leak is a failure at its line, naming the character and what they know too early", () => {
  const w = ready();
  const { r, j } = recordJson(w, { leaks: [leak(), leak("Theo", "Is it the big bowl", "that he can bake the rye alone")] });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.equal(j.status, "fail");
  assert.deepEqual(j.findings.map((f) => [f.id, f.severity, f.line]), [["judge-knowledge-leak", "fail", 19], ["judge-knowledge-leak", "fail", 7]]);
  assert.equal(j.findings[0].message, "ines knows too early: that the bakery is sold, before scene-1 ends");
  assert.equal(j.findings[1].message, "theo knows too early: that he can bake the rye alone", "a name is normalized to the id");
  const human = record(w);
  assert.match(human.stdout, /^ {2}fail \[judge-knowledge-leak\] ines knows too early: that the bakery is sold, before scene-1 ends \(line 19\)$/m);
});

test("every leak names a character with a timeline, quotes the draft and says what is known too early", () => {
  const w = ready();
  const cases = [
    ["an unknown character", { leaks: [leak("mara")] }, ["judge-knowledge-character-unknown"]],
    ["evidence not in the draft", { leaks: [leak("ines", "Sold means bought")] }, ["judge-evidence-not-found"]],
    ["evidence too short", { leaks: [leak("ines", "means sold")] }, ["judge-evidence-too-short"]],
    ["evidence missing", { leaks: [{ character: "ines", knows_too_early: "the sale" }] }, ["judge-evidence-missing"]],
    ["knows_too_early empty", { leaks: [leak("ines", undefined, " ")] }, ["judge-verdict-shape"]],
    ["knows_too_early missing", { leaks: [{ character: "ines", evidence: "Sold means sold" }] }, ["judge-verdict-shape"]],
    ["character not a string", { leaks: [leak(3)] }, ["judge-verdict-shape"]],
    ["a leak not an object", { leaks: ["ines"] }, ["judge-verdict-shape"]],
    ["leaks not a list", { leaks: "none" }, ["judge-verdict-shape"]],
    ["leaks missing", {}, ["judge-verdict-shape"]],
    ["not an object", null, ["judge-verdict-shape"]],
  ];
  for (const [what, verdict, want] of cases) {
    const { r, j } = recordJson(w, verdict);
    assert.equal(r.status, 1, what);
    assert.equal(j.invalid, true, what);
    assert.deepEqual(ids(j.findings), want, what);
  }
  const { j } = recordJson(w, { leaks: [leak("mara")] });
  assert.equal(j.findings[0].message, 'leaks[0].character "mara" is not a character with a knowledge timeline in the packet');
  assert.deepEqual(ledgerLines(w.ledger).filter((l) => l.kind === "judge"), [], "an invalid verdict records nothing");
});

test("knowledge lines keep their own history: fail, then a revised draft passes and is improved", () => {
  const w = ready();
  writeVerdict(w.verdict, { leaks: [leak()] });
  let r = record(w);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^knowledge: fail$/m);
  assert.match(r.stdout, /verdict: not-improved \(failing stations: knowledge\)/);
  writeFileSync(w.draft, STORY_DRAFT.replace("\"Sold means sold,\" she said.", "\"Shape it,\" she said."));
  assert.equal(prepare(w, "--only", "knowledge", "--force").status, 0);
  writeVerdict(w.verdict, { leaks: [] });
  r = record(w);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /verdict: improved \(draft changed; stations now pass: knowledge\)/);
  const lines = ledgerLines(w.ledger).filter((l) => l.kind === "judge");
  assert.deepEqual(lines.map((l) => [l.station, l.status, l.verdict]), [["knowledge", "fail", "not-improved"], ["knowledge", "pass", "improved"]]);
  assert.match(cli(["lint", w.spec]).stdout, /pass \(9\/9\)/);
});
