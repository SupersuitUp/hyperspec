// The attribution station (fiction only): which dialogue lines go in the packet and which are left
// out, that no narration travels with them, the answer key record rebuilds and never reads, how the
// verdict is validated (every line exactly once, a known speaker), and the accuracy it derives: pass
// at 80 percent or more.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { cli, workspace, storyWorkspace, forStation, writeVerdict, ledgerLines, prepare, record, STORY_DRAFT } from "./judge-fixture.mjs";
import { ATTRIBUTION_INSTRUCTIONS, dialogueLines, namePattern, skipReason } from "../src/judges/attribution.mjs";

const json = (path) => JSON.parse(readFileSync(path, "utf8"));
function ready(w = storyWorkspace()) {
  const p = forStation(w, "attribution");
  const r = prepare(p, "--only", "attribution");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return p;
}
function recordJson(w, verdict) {
  writeVerdict(w.verdict, verdict);
  const r = record(w, "--json");
  return { r, j: JSON.parse(r.stdout) };
}
const ids = (findings) => findings.map((f) => f.id);
// A verdict naming these speakers for L1..L5 (the true speakers are ines, theo, ines, ines, ines).
const TRUTH = ["ines", "theo", "ines", "ines", "ines"];
const verdictOf = (speakers = TRUTH) => ({ lines: speakers.map((speaker, i) => ({ id: `L${i + 1}`, speaker })) });
const cast = (...list) => list.map(({ id, name, speech = true }) => ({ id, name: name ?? "", patterns: [namePattern(id), name ? namePattern(name) : null].filter(Boolean), speech: speech ? { uses: ["x"] } : null }));

// ---- which lines, and who spoke them ------------------------------------------------------------

test("the attribution packet: the characters' rubric, fixed instructions, the characters and the lines' text only", () => {
  const w = ready();
  const p = json(w.packet);
  assert.equal(p.station, "attribution");
  assert.equal(p.rubric, "blind attribution test, knowledge-leak check against the timeline, consistency against golden and rejected lines");
  assert.equal(p.instructions, ATTRIBUTION_INSTRUCTIONS);
  for (const s of ["inputs.lines", "inputs.characters", "golden_lines", "rejected_lines", "each id exactly once", "verdict shape"]) assert.ok(p.instructions.includes(s), s);
  assert.deepEqual(Object.keys(p.inputs), ["characters", "lines", "excluded"]);
  assert.deepEqual(p.inputs.characters.map((c) => [c.id, Object.keys(c)]), [["ines", ["id", "speech", "golden_lines", "rejected_lines"]], ["theo", ["id", "speech", "golden_lines", "rejected_lines"]]]);
  assert.deepEqual(p.inputs.characters[0].speech.never, ["an apology in words", "a sentence about her own feelings", "a question she does not need answered"]);
  assert.equal(p.inputs.characters[1].speech.rhythm, "long sentences that double back on themselves and end in a question");
  assert.deepEqual(p.inputs.characters[0].golden_lines[0], "Flour first. Then you can talk.");
  assert.deepEqual(p.inputs.lines, [
    { id: "L1", text: "Flour first. Then you can talk." },
    { id: "L2", text: "I can do the rye. I mean, I think I can do the rye." },
    { id: "L3", text: "Left side runs hot," },
    { id: "L4", text: "Turn them at eight minutes." },
    { id: "L5", text: "Sold means sold. Shape the rye," },
  ]);
  assert.equal(p.inputs.excluded, 2, "a count, not the lines");
  assert.deepEqual(p.verdict_schema.required, ["lines"]);
  assert.deepEqual(p.verdict_schema.properties.lines.items.properties.id.enum, ["L1", "L2", "L3", "L4", "L5"]);
  assert.deepEqual(p.verdict_schema.properties.lines.items.properties.speaker.enum, ["ines", "theo"]);
});

test("no narration and no speaker travels in the packet: the answer is only in the key", () => {
  const w = ready();
  const text = readFileSync(w.packet, "utf8");
  for (const s of ["did not look up", "Ines said", "said Ines", "Theo laughed", "watched", "You're late", "Is that a yes", "the oven ticked", "draft_line", "\"speaker\": \"ines\""]) {
    assert.ok(!text.includes(s), `the packet carries "${s}"`);
  }
  assert.ok(!Object.hasOwn(json(w.packet).inputs, "draft"));
  const key = json(w.key);
  assert.deepEqual(key, {
    station: "attribution",
    lines: [
      { id: "L1", speaker: "ines", line: 5 },
      { id: "L2", speaker: "theo", line: 7 },
      { id: "L3", speaker: "ines", line: 9 },
      { id: "L4", speaker: "ines", line: 9 },
      { id: "L5", speaker: "ines", line: 15 },
    ],
    excluded: [
      { line: 11, text: "You're late,", named: [] },
      { line: 13, text: "Is that a yes?", named: ["ines", "theo"] },
    ],
  });
  assert.deepEqual(readdirSync(w.out).sort(), ["attribution.key.json", "attribution.packet.json"]);
});

test("the same spec and draft give a byte-identical packet and key", () => {
  const w = ready();
  const packet = readFileSync(w.packet);
  const key = readFileSync(w.key);
  assert.equal(prepare(w, "--only", "attribution", "--force").status, 0);
  assert.ok(packet.equals(readFileSync(w.packet)));
  assert.ok(key.equals(readFileSync(w.key)));
});

test("a speaker is named by id or name, whole words, any case, with every quote in the paragraph blanked", () => {
  const people = cast({ id: "ines" }, { id: "theo" }, { id: "old-man", name: "Walter" });
  const draft = [
    "\"One,\" said INES.",
    "",
    "\"Two,\" said Inesa, who is nobody.",
    "",
    "\"Three,\" Ines's voice said.",
    "",
    "\"Four, Theo,\" she said.",
    "",
    "\"Five,\" said the old man.",
    "",
    "\"Six,\" said Walter. \"Theo, stop.\"",
    "",
    "\"\" said Ines.",
    "",
    "“Seven,” said Theo,",
    "hard-wrapped. \"And",
    "eight.\"",
    "",
    "```",
    "\"code\" said Ines",
    "```",
    "",
    "Ines typed `\"inline\"` and nothing else.",
  ].join("\n");
  const { lines, excluded } = dialogueLines(draft, people);
  assert.deepEqual(lines.map((l) => [l.id, l.text, l.speaker, l.line]), [
    ["L1", "One,", "ines", 1],
    ["L2", "Three,", "ines", 5],
    ["L3", "Five,", "old-man", 9],
    ["L4", "Six,", "old-man", 11],
    ["L5", "Theo, stop.", "old-man", 11],
    ["L6", "Seven,", "theo", 15],
    ["L7", "And eight.", "theo", 16],
  ]);
  assert.deepEqual(excluded.map((e) => [e.text, e.named]), [["Two,", []], ["Four, Theo,", []]]);
});

test("a named character with no speech block leaves the line out", () => {
  const people = cast({ id: "ines" }, { id: "theo" }, { id: "mara", speech: false });
  const { lines, excluded } = dialogueLines("\"Morning,\" said Mara.\n\n\"Morning,\" said Theo.\n", people);
  assert.deepEqual(lines.map((l) => l.speaker), ["theo"]);
  assert.deepEqual(excluded, [{ line: 1, text: "Morning,", named: ["mara"] }]);
});

test("attribution is skipped when the spec is not fiction", () => {
  const w = forStation(workspace(), "attribution");
  const r = prepare(w, "--only", "attribution");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^attribution: skip \(the spec is not fiction; attribution applies only with fiction: true\)$/m);
  assert.deepEqual(readdirSync(w.out), []);
});

test("attribution is skipped when no dialogue line can be attributed, saying how many there were", () => {
  let w = forStation(storyWorkspace({ draft: "\"You're late,\" she said.\n\n\"The bus,\" I said.\n" }), "attribution");
  let r = prepare(w, "--only", "attribution");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^attribution: skip \(none of the draft's 2 dialogue lines can be attributed mechanically: each paragraph holding one names no character, or more than one\)$/m);
  w = forStation(storyWorkspace({ draft: "Ines shaped the rye. Theo watched.\n" }), "attribution");
  r = prepare(w, "--only", "attribution");
  assert.match(r.stdout, /^attribution: skip \(the draft has no dialogue line \(a double-quoted span\)\)$/m);
  assert.deepEqual(readdirSync(w.out), []);
});

test("attribution needs two characters with speech and a rubric (lint refuses the first, so asked directly)", () => {
  const draft = { text: STORY_DRAFT };
  const ch = (id, extra = {}) => ({ id, speech: { uses: ["x"], never: ["y"] }, check: { rubric: "blind test" }, ...extra });
  assert.equal(skipReason({ data: { fiction: "true", writing: { characters: [ch("ines")] } } }, draft), "attribution needs at least two characters with a speech block; writing.characters has 1");
  assert.equal(skipReason({ data: { fiction: "true", writing: { characters: [ch("ines"), ch("theo", { speech: {} })] } } }, draft), "attribution needs at least two characters with a speech block; writing.characters has 1");
  assert.equal(skipReason({ data: { fiction: "true", writing: { characters: [ch("ines", { check: { station: "s" } }), ch("theo", { check: { station: "s" } })] } } }, draft), "no character's check has a rubric");
  assert.equal(skipReason({ data: { fiction: "true", writing: {} } }, draft), "writing.characters has no character");
  assert.equal(skipReason({ data: { fiction: "true", writing: { characters: [ch("ines"), ch("theo")] } } }, draft), null);
});

// ---- the verdict and the accuracy -------------------------------------------------------------------

test("every line right: pass, reporting the accuracy as a fraction and a percentage", () => {
  const w = ready();
  const { r, j } = recordJson(w, verdictOf());
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(j.status, "pass");
  assert.deepEqual(j.findings, []);
  assert.equal(j.summary, "accuracy 5/5 (100%), passing at 80%; 2 dialogue lines left out (no single character named around them)");
  const human = record(w);
  assert.match(human.stdout, /^attribution: pass\n {2}accuracy 5\/5 \(100%\), passing at 80%; 2 dialogue lines left out/m);
});

test("four of five right is exactly 80 percent: pass, with the miss as a warning at its line", () => {
  const w = ready();
  const { r, j } = recordJson(w, verdictOf(["ines", "ines", "ines", "ines", "ines"]));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(j.status, "pass");
  assert.match(j.summary, /^accuracy 4\/5 \(80%\)/);
  assert.deepEqual(j.findings.map((f) => [f.id, f.severity, f.line, f.message]), [["judge-attribution-miss", "warn", 7, "L2 was attributed to ines; the narration around it names theo"]]);
});

test("three of five is under 80 percent: fail, naming the accuracy, with each miss", () => {
  const w = ready();
  const { r, j } = recordJson(w, verdictOf(["theo", "ines", "ines", "ines", "ines"]));
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.equal(j.status, "fail");
  assert.deepEqual(ids(j.findings), ["judge-attribution-accuracy", "judge-attribution-miss", "judge-attribution-miss"]);
  assert.equal(j.findings[0].severity, "fail");
  assert.equal(j.findings[0].message, "the judge attributed 3/5 (60%) of the dialogue lines correctly, under the 80% that tells the voices apart");
  assert.deepEqual(j.findings.slice(1).map((f) => [f.line, f.severity]), [[5, "warn"], [7, "warn"]]);
  assert.match(j.summary, /^accuracy 3\/5 \(60%\)/);
});

test("the percentage rounds down, so a failing score never prints as 80", () => {
  // 7 lines, 5 right: 71.4%. A draft with seven attributable lines, the last two by theo.
  const draft = `${STORY_DRAFT}\n"One more," Theo said.\n\n"And one more?" Theo asked.\n`;
  const w = ready(storyWorkspace({ draft }));
  const { r, j } = recordJson(w, verdictOf(["ines", "theo", "ines", "ines", "ines", "ines", "ines"]));
  assert.equal(r.status, 1);
  assert.match(j.summary, /^accuracy 5\/7 \(71%\)/);
});

test("a speaker may be given by id or name in any case; the key on disk is never read", () => {
  const w = ready();
  writeFileSync(w.key, JSON.stringify({ station: "attribution", lines: TRUTH.map((_, i) => ({ id: `L${i + 1}`, speaker: "theo" })), excluded: [] }));
  const { r, j } = recordJson(w, verdictOf([" INES ", "Theo", "ines", "Ines", "ines"]));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(j.status, "pass");
  assert.match(j.summary, /^accuracy 5\/5 \(100%\)/);
});

test("every line id exactly once, each with a speaker the packet knows", () => {
  const w = ready();
  const cases = [
    ["a line missing", { lines: verdictOf().lines.slice(1) }, ["judge-attribution-line-missing"]],
    ["a line twice", { lines: [...verdictOf().lines, { id: "L2", speaker: "theo" }] }, ["judge-attribution-line-duplicate"]],
    ["an unknown line", { lines: [...verdictOf().lines, { id: "L9", speaker: "theo" }] }, ["judge-attribution-line-unknown"]],
    ["an unknown speaker", verdictOf(["ines", "narrator", "ines", "ines", "ines"]), ["judge-attribution-speaker-unknown"]],
    ["not an object", [], ["judge-verdict-shape"]],
    ["lines missing", {}, ["judge-verdict-shape"]],
    ["lines not a list", { lines: "L1 ines" }, ["judge-verdict-shape"]],
    ["a line not an object", { lines: ["L1", ...verdictOf().lines.slice(1)] }, ["judge-verdict-shape", "judge-attribution-line-missing"]],
    ["an id not a string", { lines: [{ id: 1, speaker: "ines" }, ...verdictOf().lines.slice(1)] }, ["judge-verdict-shape", "judge-attribution-line-missing"]],
    ["a speaker not a string", verdictOf(["ines", null, "ines", "ines", "ines"]), ["judge-verdict-shape"]],
  ];
  for (const [what, verdict, want] of cases) {
    const { r, j } = recordJson(w, verdict);
    assert.equal(r.status, 1, what);
    assert.equal(j.invalid, true, what);
    assert.deepEqual(ids(j.findings), want, what);
  }
  const { j } = recordJson(w, verdictOf(["ines", "narrator", "ines", "ines", "ines"]));
  assert.equal(j.findings[0].message, 'lines[1].speaker "narrator" is not a character in the packet');
  assert.deepEqual(ledgerLines(w.ledger).filter((l) => l.kind === "judge"), [], "an invalid verdict records nothing");
});

test("an edited packet is refused: a line's text changed, or the excluded count", () => {
  for (const edit of [(p) => { p.inputs.lines[0].text = "Flour first."; }, (p) => { p.inputs.excluded = 0; }]) {
    const w = ready();
    const p = json(w.packet);
    edit(p);
    writeFileSync(w.packet, `${JSON.stringify(p, null, 2)}\n`);
    const { r, j } = recordJson(w, verdictOf());
    assert.equal(r.status, 1);
    assert.deepEqual(ids(j.findings), ["judge-packet-altered"]);
  }
});

// ---- the ledger ------------------------------------------------------------------------------------

test("attribution lines keep their own history; the summary stays out of the ledger; the spec still lints 9/9", () => {
  const w = ready();
  writeVerdict(w.verdict, verdictOf());
  let r = record(w);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^verdict: one-shot$/m);
  writeVerdict(w.verdict, verdictOf(["theo", "ines", "theo", "ines", "ines"]));
  r = record(w);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /verdict: not-improved \(failing stations: attribution\)/);
  const lines = ledgerLines(w.ledger).filter((l) => l.kind === "judge");
  assert.deepEqual(lines.map((l) => [l.station, l.status, l.verdict]), [["attribution", "pass", "one-shot"], ["attribution", "fail", "not-improved"]]);
  assert.ok(lines.every((l) => !Object.hasOwn(l, "summary")));
  assert.match(cli(["lint", w.spec]).stdout, /pass \(9\/9\)/);
});
