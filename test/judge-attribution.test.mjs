// The attribution station (fiction only): which dialogue lines go in the packet and which are left
// out (a speaker only from a speech tag against the quote, the narrator's "I", the other speaker's
// "she"/"he" in a two-hander, never a line that repeats a speech line), that no narration travels
// with them, the answer key record rebuilds and never reads, how the verdict is validated (every
// line exactly once, a known speaker), and the accuracy it derives: pass when the accuracy averaged
// per speaker is 80 percent or more.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { cli, workspace, storyWorkspace, forStation, writeVerdict, ledgerLines, prepare, record, STORY_DRAFT } from "./judge-fixture.mjs";
import { ATTRIBUTION_INSTRUCTIONS, EXCLUDED, SPEECH_VERBS, derive, dialogueLines, skipReason } from "../src/judges/attribution.mjs";

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
// A verdict naming these speakers for L1..L6 (the true speakers are ines, theo, ines, ines, ines, theo).
const TRUTH = ["ines", "theo", "ines", "ines", "ines", "theo"];
const verdictOf = (speakers = TRUTH) => ({ lines: speakers.map((speaker, i) => ({ id: `L${i + 1}`, speaker })) });
const INES = { id: "ines", name: "", speech: { uses: ["x"] }, golden: ["Sold means sold. Shape the rye."], rejected: [] };
const THEO = { id: "theo", name: "", speech: { uses: ["x"] }, golden: [], rejected: ["Left side runs hot, turn them early."] };
const lines = (draft, cast = [INES, THEO], narrator = "theo") => dialogueLines(draft, cast, { narrator });
const keyed = (r) => r.lines.map((l) => [l.text, l.speaker]);
const left = (r) => r.excluded.map((e) => [e.text, e.reason]);

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
  assert.deepEqual(p.inputs.lines, [
    { id: "L1", text: "Scale first," },
    { id: "L2", text: "Is it the big bowl or the small one, or does it matter?" },
    { id: "L3", text: "Big bowl," },
    { id: "L4", text: "Water at twenty-six degrees, then salt," },
    { id: "L5", text: "Twenty minutes, then we fold it." },
    { id: "L6", text: "The bus was late again, kind of, I mean it was on time but I wasn't?" },
  ]);
  assert.equal(p.inputs.excluded, 3, "a count, not the lines");
  assert.deepEqual(p.verdict_schema.required, ["lines"]);
  assert.deepEqual(p.verdict_schema.properties.lines.items.properties.id.enum, ["L1", "L2", "L3", "L4", "L5", "L6"]);
  assert.deepEqual(p.verdict_schema.properties.lines.items.properties.speaker.enum, ["ines", "theo"]);
});

test("no narration and no speaker travels in the packet: the answer is only in the key, with why each line was left out", () => {
  const w = ready();
  const text = readFileSync(w.packet, "utf8");
  for (const s of ["did not look up", "Ines said", "said Ines", "she said", "I asked", "Theo nodded", "You're late", "Sold means sold,", "Weigh it twice", "mother", "\"speaker\": \"ines\""]) {
    assert.ok(!text.includes(s), `the packet carries "${s}"`);
  }
  assert.ok(!Object.hasOwn(json(w.packet).inputs, "draft"));
  assert.deepEqual(json(w.key), {
    station: "attribution",
    lines: [
      { id: "L1", speaker: "ines", line: 5 },
      { id: "L2", speaker: "theo", line: 7 },
      { id: "L3", speaker: "ines", line: 9 },
      { id: "L4", speaker: "ines", line: 11 },
      { id: "L5", speaker: "ines", line: 15 },
      { id: "L6", speaker: "theo", line: 17 },
    ],
    excluded: [
      { line: 13, text: "You're late.", reason: "no speech tag" },
      { line: 19, text: "Sold means sold,", reason: "repeats a golden or rejected line" },
      { line: 21, text: "Weigh it twice,", reason: "no speech tag" },
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

test("the speech verbs are one closed list", () => {
  assert.deepEqual(SPEECH_VERBS, ["said", "says", "asked", "asks", "told", "tells", "replied", "replies", "called", "calls", "whispered", "whispers", "shouted", "shouts", "answered", "answers", "added", "adds", "went on", "goes on"]);
});

test("a speaker is only who a speech tag names: being mentioned, a possessive or an action beat names nobody", () => {
  // The reviewer's draft: without a narrator, "she said" resolves to nobody and is left out.
  const draft = [
    "\"Big bowl,\" she said. Theo nodded and fetched it.",
    "",
    "\"Is the rye going in the big bowl?\" Theo asked.",
    "",
    "\"Water,\" she said, and Theo poured.",
    "",
    "\"Okay, I mean, is that enough?\" Theo asked.",
    "",
    "\"Scrape the bowl,\" Ines said.",
    "",
    "\"Weigh it,\" Ines said.",
  ].join("\n");
  let r = lines(draft, [INES, THEO], null);
  assert.deepEqual(keyed(r), [["Is the rye going in the big bowl?", "theo"], ["Okay, I mean, is that enough?", "theo"], ["Scrape the bowl,", "ines"], ["Weigh it,", "ines"]]);
  assert.deepEqual(left(r), [["Big bowl,", EXCLUDED.unknown], ["Water,", EXCLUDED.unknown]]);
  // With Theo narrating a two-hander, "she said" is Ines, whoever else the narration mentions.
  r = lines(draft);
  assert.deepEqual(keyed(r).map(([, s]) => s), ["ines", "theo", "ines", "theo", "ines", "ines"]);

  r = lines([
    "\"I can do the rye,\" I said. Nobody at Ines's had let me try.",
    "",
    "\"Three,\" Ines's voice said.",
    "",
    "\"Four,\" said Ines's mother.",
    "",
    "Theo laughed. \"Five.\"",
    "",
    "\"Six.\" She said nothing after that.",
    "",
    "\"Seven,\" INES SAID.",
    "",
    "\"Eight,\" Inesa said.",
  ].join("\n"));
  assert.deepEqual(keyed(r), [["I can do the rye,", "theo"], ["Seven,", "ines"]]);
  assert.deepEqual(left(r).map(([t, why]) => [t, why]), [["Three,", EXCLUDED.noTag], ["Four,", EXCLUDED.noTag], ["Five.", EXCLUDED.noTag], ["Six.", EXCLUDED.noTag], ["Eight,", EXCLUDED.noTag]]);
});

test("a tag before a quote counts when it ends in a comma or colon; tags naming two speakers leave the line out", () => {
  const r = lines([
    "Ines said, \"Water now.\"",
    "",
    "Then Theo asked: \"Why the big one?\"",
    "",
    "Ines said nothing. \"Water.\"",
    "",
    "Theo said, \"Hold on,\" Ines said.",
    "",
    "She whispered, \"Not yet.\"",
  ].join("\n"));
  assert.deepEqual(keyed(r), [["Water now.", "ines"], ["Why the big one?", "theo"], ["Not yet.", "ines"]]);
  assert.deepEqual(left(r), [["Water.", EXCLUDED.noTag], ["Hold on,", EXCLUDED.conflict]]);
});

test("the narrator and the pronoun rules: \"I\" needs a narrator, \"she\" needs a two-hander with the narrator in it", () => {
  const MARA = { id: "mara", name: "", speech: { uses: ["x"] }, golden: [], rejected: [] };
  const draft = "\"One,\" I said.\n\n\"Two,\" she said.\n\n\"Three,\" he asked.\n";
  assert.deepEqual(keyed(lines(draft)), [["One,", "theo"], ["Two,", "ines"], ["Three,", "ines"]]);
  assert.deepEqual(keyed(lines(draft, [INES, THEO, MARA])), [["One,", "theo"]], "three speakers: a pronoun resolves to nobody");
  assert.deepEqual(left(lines(draft, [INES, THEO, MARA])).map(([, why]) => why), [EXCLUDED.unknown, EXCLUDED.unknown]);
  assert.deepEqual(keyed(lines(draft, [INES, THEO], null)), [], "no narrator: neither \"I\" nor \"she\" resolves");
  assert.deepEqual(keyed(lines(draft, [INES, THEO], "mara")), [], "a narrator who is not a character resolves nobody");
  const silent = { ...MARA, speech: null };
  assert.deepEqual(left(lines("\"Morning,\" said Mara.\n\n\"Morning,\" I said.\n", [INES, THEO, silent], "mara")), [["Morning,", EXCLUDED.unknown], ["Morning,", EXCLUDED.unknown]], "a character with no speech block, named or narrating");
});

test("names by id words or by name, and the two-word verbs", () => {
  const OLD = { id: "old-man", name: "Walter", speech: { uses: ["x"] }, golden: [], rejected: [] };
  const r = dialogueLines("\"Six,\" Walter said.\n\n\"Seven,\" Old Man replied.\n\n\"Eight,\" said the old man.\n\n\"And then,\" Ines went on, \"we wait.\"\n", [INES, OLD], { narrator: null });
  assert.deepEqual(keyed(r), [["Six,", "old-man"], ["Seven,", "old-man"], ["And then, we wait.", "ines"]]);
  assert.deepEqual(left(r), [["Eight,", EXCLUDED.noTag]]);
});

test("a quote split by a speech tag is one line; two tagged quotes in one paragraph stay two", () => {
  const r = lines([
    "\"Twenty minutes,\" Ines said, wiping her hands, \"then we fold it.\"",
    "",
    "\"Hi,\" Ines said. \"Hello,\" Theo said.",
    "",
    "\"Left side,\" Ines said. \"Turn them.\"",
    "",
    "\"First,\" \"then second,\" Ines said.",
  ].join("\n"));
  assert.deepEqual(r.lines.map((l) => [l.text, l.speaker, l.line]), [
    ["Twenty minutes, then we fold it.", "ines", 1],
    ["Hi,", "ines", 3],
    ["Hello,", "theo", 3],
    ["Left side,", "ines", 5],
    ["then second,", "ines", 7],
  ]);
  assert.deepEqual(left(r), [["Turn them.", EXCLUDED.noTag], ["First,", EXCLUDED.noTag]]);
});

test("a line of three or more words inside, or containing, a golden or rejected line is left out", () => {
  const r = lines([
    "\"Sold means sold,\" Ines said.",
    "",
    "\"SOLD MEANS SOLD. Shape the rye, now, and then the rolls,\" Ines said.",
    "",
    "\"Left side runs hot,\" Ines said.",
    "",
    "\"Sold means,\" Ines said.",
    "",
    "\"Sold means gone,\" Ines said.",
  ].join("\n"));
  assert.deepEqual(left(r), [["Sold means sold,", EXCLUDED.repeats], ["SOLD MEANS SOLD. Shape the rye, now, and then the rolls,", EXCLUDED.repeats], ["Left side runs hot,", EXCLUDED.repeats]]);
  assert.deepEqual(keyed(r), [["Sold means,", "ines"], ["Sold means gone,", "ines"]], "two words is too short to compare; a changed word is not a repeat");
});

test("code is not dialogue", () => {
  const r = lines("```\n\"code,\" Ines said\n```\n\nInes typed `\"inline\"` and nothing else.\n\n\"Real,\" Ines said.\n");
  assert.deepEqual(keyed(r), [["Real,", "ines"]]);
  assert.deepEqual(r.excluded, []);
});

test("attribution is skipped when the spec is not fiction", () => {
  const w = forStation(workspace(), "attribution");
  const r = prepare(w, "--only", "attribution");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^attribution: skip \(the spec is not fiction; attribution applies only with fiction: true\)$/m);
  assert.deepEqual(readdirSync(w.out), []);
});

test("attribution is skipped with no attributable line, with lines from one speaker only, and with no dialogue", () => {
  const skipOf = (draft) => {
    const w = forStation(storyWorkspace({ draft }), "attribution");
    const r = prepare(w, "--only", "attribution");
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.deepEqual(readdirSync(w.out), []);
    return r.stdout;
  };
  assert.match(skipOf("\"You're late.\" She did not look up.\n\n\"Sold means sold,\" she said.\n"), /^attribution: skip \(none of the draft's 2 dialogue lines can be attributed mechanically \(1 with no speech tag, 1 repeating a golden or rejected line\)\)$/m);
  assert.match(skipOf("\"Scale first,\" Ines said.\n\n\"Water,\" she said.\n\n\"Late.\" She looked up.\n"), /^attribution: skip \(attribution needs attributable lines from at least two speakers; all 2 of the draft's attributable dialogue lines are ines's \(1 left out: 1 with no speech tag\)\)$/m);
  assert.match(skipOf("Ines shaped the rye. Theo watched.\n"), /^attribution: skip \(the draft has no dialogue line \(a double-quoted span\)\)$/m);
});

test("attribution needs two characters with speech and a rubric (lint refuses the first, so asked directly)", () => {
  const draft = { text: STORY_DRAFT };
  const ch = (id, extra = {}) => ({ id, speech: { uses: ["x"], never: ["y"] }, check: { rubric: "blind test" }, ...extra });
  const spec = (characters) => ({ data: { fiction: "true", writing: { characters, persona: { identity: "character:theo" } } } });
  assert.equal(skipReason(spec([ch("ines")]), draft), "attribution needs at least two characters with a speech block; writing.characters has 1");
  assert.equal(skipReason(spec([ch("ines"), ch("theo", { speech: {} })]), draft), "attribution needs at least two characters with a speech block; writing.characters has 1");
  assert.equal(skipReason(spec([ch("ines", { check: { station: "s" } }), ch("theo", { check: { station: "s" } })]), draft), "no character's check has a rubric");
  assert.equal(skipReason(spec([]), draft), "writing.characters has no character");
  assert.equal(skipReason(spec([ch("ines"), ch("theo")]), draft), null);
});

// ---- the verdict and the accuracy -------------------------------------------------------------------

test("every line right: pass, reporting each speaker's accuracy as a fraction and a percentage, and the mean", () => {
  const w = ready();
  const { r, j } = recordJson(w, verdictOf());
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(j.status, "pass");
  assert.deepEqual(j.findings, []);
  assert.equal(j.summary, "accuracy per speaker: ines 4/4 (100%), theo 2/2 (100%); mean 100%, passing at 80%; 3 dialogue lines left out (2 with no speech tag, 1 repeating a golden or rejected line)");
  const human = record(w);
  assert.match(human.stdout, /^attribution: pass\n {2}accuracy per speaker: ines 4\/4 \(100%\), theo 2\/2 \(100%\); mean 100%/m);
});

test("naming one speaker for every line fails: the mean per speaker counts theo's lines as much as ines's", () => {
  const w = ready();
  const { r, j } = recordJson(w, verdictOf(["ines", "ines", "ines", "ines", "ines", "ines"]));
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.equal(j.status, "fail");
  assert.deepEqual(ids(j.findings), ["judge-attribution-accuracy", "judge-attribution-miss", "judge-attribution-miss"]);
  assert.equal(j.findings[0].message, "the judge's accuracy averaged over speakers is 50% (ines 4/4 (100%), theo 0/2 (0%)), under the 80% that tells the voices apart");
  assert.deepEqual(j.findings.slice(1).map((f) => [f.severity, f.line, f.message]), [["warn", 7, "L2 was attributed to ines; its speech tag names theo"], ["warn", 17, "L6 was attributed to ines; its speech tag names theo"]]);
  assert.match(j.summary, /^accuracy per speaker: ines 4\/4 \(100%\), theo 0\/2 \(0%\); mean 50%/);
});

test("one of ines's four lines missed passes (mean 87%); one of theo's two missed fails (mean 75%)", () => {
  const w = ready();
  let { r, j } = recordJson(w, verdictOf(["theo", "theo", "ines", "ines", "ines", "theo"]));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(j.status, "pass");
  assert.deepEqual(j.findings.map((f) => [f.id, f.severity, f.line]), [["judge-attribution-miss", "warn", 5]]);
  assert.match(j.summary, /^accuracy per speaker: ines 3\/4 \(75%\), theo 2\/2 \(100%\); mean 87%/);
  ({ r, j } = recordJson(w, verdictOf(["ines", "theo", "ines", "ines", "ines", "ines"])));
  assert.equal(r.status, 1);
  assert.equal(j.status, "fail");
  assert.match(j.summary, /^accuracy per speaker: ines 4\/4 \(100%\), theo 1\/2 \(50%\); mean 75%/);
});

test("the mean is compared exactly, and percentages round down", () => {
  const t = { finding: (id, message, fix, line) => ({ id, severity: "fail", message, fix, ...(line ? { line } : {}) }) };
  const pkt = { inputs: { characters: [{ id: "ines" }, { id: "theo" }] } };
  const run = (inesRight, inesTotal, theoRight, theoTotal) => {
    const key = { lines: [], excluded: [] };
    const verdict = { lines: [] };
    let n = 0;
    for (const [who, right, total, other] of [["ines", inesRight, inesTotal, "theo"], ["theo", theoRight, theoTotal, "ines"]]) {
      for (let i = 0; i < total; i++) { n += 1; key.lines.push({ id: `L${n}`, speaker: who, line: n }); verdict.lines.push({ id: `L${n}`, speaker: i < right ? who : other }); }
    }
    return derive(verdict, pkt, t, key);
  };
  const exact = run(3, 5, 5, 5);
  assert.equal(exact.status, "pass", "60% and 100% average to exactly 80%");
  assert.match(exact.summary, /mean 80%/);
  const under = run(4, 5, 79, 100);
  assert.equal(under.status, "fail", "80% and 79% average to 79.5%");
  assert.match(under.summary, /^accuracy per speaker: ines 4\/5 \(80%\), theo 79\/100 \(79%\); mean 79%, passing at 80%$/, "rounded down, never shown as 80%");
  assert.match(run(2, 3, 1, 1).summary, /ines 2\/3 \(66%\)/);
});

test("a speaker may be given by id or name in any case; the key on disk is never read", () => {
  const w = ready();
  writeFileSync(w.key, JSON.stringify({ station: "attribution", lines: TRUTH.map((_, i) => ({ id: `L${i + 1}`, speaker: "theo" })), excluded: [] }));
  const { r, j } = recordJson(w, verdictOf([" INES ", "Theo", "ines", "Ines", "ines", "THEO"]));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(j.status, "pass");
  assert.match(j.summary, /^accuracy per speaker: ines 4\/4 \(100%\), theo 2\/2 \(100%\); mean 100%/);
});

test("every line id exactly once, each with a speaker the packet knows", () => {
  const w = ready();
  const cases = [
    ["a line missing", { lines: verdictOf().lines.slice(1) }, ["judge-attribution-line-missing"]],
    ["a line twice", { lines: [...verdictOf().lines, { id: "L2", speaker: "theo" }] }, ["judge-attribution-line-duplicate"]],
    ["an unknown line", { lines: [...verdictOf().lines, { id: "L9", speaker: "theo" }] }, ["judge-attribution-line-unknown"]],
    ["an unknown speaker", verdictOf(["ines", "narrator", "ines", "ines", "ines", "theo"]), ["judge-attribution-speaker-unknown"]],
    ["not an object", [], ["judge-verdict-shape"]],
    ["lines missing", {}, ["judge-verdict-shape"]],
    ["lines not a list", { lines: "L1 ines" }, ["judge-verdict-shape"]],
    ["a line not an object", { lines: ["L1", ...verdictOf().lines.slice(1)] }, ["judge-verdict-shape", "judge-attribution-line-missing"]],
    ["an id not a string", { lines: [{ id: 1, speaker: "ines" }, ...verdictOf().lines.slice(1)] }, ["judge-verdict-shape", "judge-attribution-line-missing"]],
    ["a speaker not a string", verdictOf(["ines", null, "ines", "ines", "ines", "theo"]), ["judge-verdict-shape"]],
  ];
  for (const [what, verdict, want] of cases) {
    const { r, j } = recordJson(w, verdict);
    assert.equal(r.status, 1, what);
    assert.equal(j.invalid, true, what);
    assert.deepEqual(ids(j.findings), want, what);
  }
  const { j } = recordJson(w, verdictOf(["ines", "narrator", "ines", "ines", "ines", "theo"]));
  assert.equal(j.findings[0].message, 'lines[1].speaker "narrator" is not a character in the packet');
  assert.deepEqual(ledgerLines(w.ledger).filter((l) => l.kind === "judge"), [], "an invalid verdict records nothing");
});

test("an edited packet is refused: a line's text changed, or the excluded count", () => {
  for (const edit of [(p) => { p.inputs.lines[0].text = "Scale first."; }, (p) => { p.inputs.excluded = 0; }]) {
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
  writeVerdict(w.verdict, verdictOf(["ines", "ines", "ines", "ines", "ines", "ines"]));
  r = record(w);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /verdict: not-improved \(failing stations: attribution\)/);
  const lines = ledgerLines(w.ledger).filter((l) => l.kind === "judge");
  assert.deepEqual(lines.map((l) => [l.station, l.status, l.verdict]), [["attribution", "pass", "one-shot"], ["attribution", "fail", "not-improved"]]);
  assert.ok(lines.every((l) => !Object.hasOwn(l, "summary")));
  assert.match(cli(["lint", w.spec]).stdout, /pass \(9\/9\)/);
});
