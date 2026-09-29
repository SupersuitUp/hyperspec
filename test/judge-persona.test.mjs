// The persona station: its packet (the persona block, the claims ledger's texts and the draft), how
// its verdict is validated (every break quotes the draft, its kind is one of four, and says why),
// and what a valid verdict derives: pass when there is no break. The claims ledger is a file
// besides the spec and the draft, so a changed ledger makes the packet stale, never altered.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { cli, workspace, storyWorkspace, forStation, personaVerdict, writeVerdict, ledgerLines, prepare, record, claimsJsonl, CLAIMS, DRAFT, STORY_DRAFT } from "./judge-fixture.mjs";
import { PERSONA_INSTRUCTIONS, PERSONA_KINDS, packet as personaPacket, skipReason } from "../src/judges/persona.mjs";

const json = (path) => JSON.parse(readFileSync(path, "utf8"));
function ready(w = workspace()) {
  const p = forStation(w, "persona");
  const r = prepare(p, "--only", "persona");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return p;
}
function recordJson(w, verdict) {
  writeVerdict(w.verdict, verdict);
  const r = record(w, "--json");
  return { r, j: JSON.parse(r.stdout) };
}
const ids = (findings) => findings.map((f) => f.id);
const brk = (evidence, kind = "stance", why = "the voice turns into a lecture") => ({ evidence, kind, why });

// ---- the packet ------------------------------------------------------------------------------------

test("the persona packet: the persona rubric verbatim, fixed instructions, the persona, the claims' texts and the draft", () => {
  const w = ready();
  const p = json(w.packet);
  assert.equal(p.station, "persona");
  assert.equal(p.rubric, "persona-consistency judge; stance and voice hold, no fact appears that is not in the claims ledger");
  assert.equal(p.instructions, PERSONA_INSTRUCTIONS);
  for (const s of ["inputs.persona", "inputs.claims", "stance", "assertion", "will_not_say", "unsourced_fact", "verbatim", "three whole words", "verdict shape", "When inputs.claims is null, no claims ledger is declared and facts cannot be checked against sources: do not report unsourced_fact."]) assert.ok(p.instructions.includes(s), s);
  assert.deepEqual(Object.keys(p.inputs), ["persona", "claims", "draft"]);
  assert.deepEqual(p.inputs.persona, {
    identity: "self",
    stance: "peer",
    may_assert: ["what the author has shipped and measured themselves"],
    will_not_say: ["a claim about someone else's internal numbers"],
  });
  assert.deepEqual(p.inputs.claims, CLAIMS.map((c) => c.text));
  assert.equal(p.inputs.draft, DRAFT);
  assert.deepEqual(p.verdict_schema.required, ["breaks"]);
  assert.deepEqual(p.verdict_schema.properties.breaks.items.properties.kind.enum, ["stance", "assertion", "will_not_say", "unsourced_fact"]);
  assert.deepEqual(PERSONA_KINDS, ["stance", "assertion", "will_not_say", "unsourced_fact"]);
  assert.deepEqual(readdirSync(w.out), ["persona.packet.json"], "the persona has no key");
});

test("the same spec, draft and claims ledger give a byte-identical persona packet", () => {
  const w = ready();
  const first = readFileSync(w.packet);
  assert.equal(prepare(w, "--only", "persona", "--force").status, 0);
  assert.ok(first.equals(readFileSync(w.packet)));
});

test("claims come from the ledger the claims station reads: in file order, malformed lines and empty texts left out", () => {
  const w = workspace();
  writeFileSync(join(w.dir, "essay.claims.jsonl"), [
    "﻿" + JSON.stringify({ text: "First claim, with a BOM before it.", source: "m1" }),
    "not json",
    "",
    JSON.stringify(["an array"]),
    JSON.stringify({ text: "  ", source: "m1" }),
    JSON.stringify({ text: "An unsourced claim still counts as a claim." }),
    "",
  ].join("\n"));
  const p = json(ready(w).packet);
  assert.deepEqual(p.inputs.claims, ["First claim, with a BOM before it.", "An unsourced claim still counts as a claim."]);
});

test("a story's persona packet carries its claims ledger's texts", () => {
  const w = ready(storyWorkspace());
  const p = json(w.packet);
  assert.equal(p.inputs.persona.identity, "character:theo");
  assert.equal(p.inputs.persona.stance, "witness");
  assert.equal(p.inputs.claims.length, 9);
  assert.equal(p.inputs.claims[0], "Flour is weighed at Ines's, never scooped.");
  assert.equal(p.inputs.draft, STORY_DRAFT);
});

test("with no claims ledger declared, the claims are null (asked directly)", () => {
  const persona = { identity: "self", stance: "peer", may_assert: ["x"], will_not_say: ["y"], check: { rubric: "hold the stance" } };
  const spec = { dir: ".", data: { writing: { persona } } };
  assert.equal(skipReason(spec, { text: DRAFT }), null);
  assert.equal(personaPacket(spec, { text: DRAFT }).inputs.claims, null);
  const deferred = { dir: ".", data: { writing: { persona, sources: "deferred" } } };
  assert.equal(personaPacket(deferred, { text: DRAFT }).inputs.claims, null);
  assert.equal(skipReason({ dir: ".", data: { writing: {} } }, { text: DRAFT }), "writing.persona is not written (deferred)");
});

test("persona is skipped when its check has no rubric", () => {
  const w = forStation(workspace(), "persona");
  const text = readFileSync(w.spec, "utf8");
  const edited = text.replace("      rubric: persona-consistency judge; stance and voice hold, no fact appears that is not in the claims ledger\n", "      station: a stance check\n");
  assert.notEqual(edited, text);
  writeFileSync(w.spec, edited);
  const r = prepare(w, "--only", "persona");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^persona: skip \(writing\.persona\.check has no rubric\)$/m);
  assert.deepEqual(readdirSync(w.out), []);
});

test("persona is skipped when the declared claims ledger cannot be read", () => {
  const w = forStation(workspace(), "persona");
  rmSync(join(w.dir, "essay.claims.jsonl"));
  const r = prepare(w, "--only", "persona");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^persona: skip \(writing\.sources\.ledger "essay\.claims\.jsonl" cannot be read \(run `hyperspec check` for details\)\)$/m);
  assert.deepEqual(readdirSync(w.out), []);
});

// ---- the verdict -----------------------------------------------------------------------------------

test("no break: pass with no findings", () => {
  const w = ready();
  const { r, j } = recordJson(w, personaVerdict());
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(j.status, "pass");
  assert.deepEqual(j.findings, []);
});

test("each break is a failure at its line, named by its kind", () => {
  const w = ready();
  const { r, j } = recordJson(w, personaVerdict((v) => {
    v.breaks = [
      brk("A hyperspec is a contract a linter can check", "stance", "talks down to a peer"),
      brk("each one names what fails it", "assertion", "the author has not measured this"),
      brk("The nine tests run on every spec", "will_not_say", "someone else's internal numbers"),
      brk("“Progress” is read from disk", "unsourced_fact", "no claim covers it"),
    ];
  }));
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.equal(j.status, "fail");
  assert.deepEqual(ids(j.findings), ["judge-persona-break", "judge-persona-break", "judge-persona-break", "judge-persona-break"]);
  assert.deepEqual(j.findings.map((f) => [f.severity, f.line]), [["fail", 3], ["fail", 7], ["fail", 7], ["fail", 7]]);
  assert.equal(j.findings[0].message, "the persona leaves its stance (peer): talks down to a peer");
  assert.equal(j.findings[1].message, "the persona asserts what it may not: the author has not measured this");
  assert.equal(j.findings[2].message, "the persona says what it will not say: someone else's internal numbers");
  assert.equal(j.findings[3].message, "the persona states a fact the claims ledger does not hold: no claim covers it");
  const human = record(w);
  assert.match(human.stdout, /^ {2}fail \[judge-persona-break\] the persona leaves its stance \(peer\): talks down to a peer \(line 3\)$/m);
});

test("every break quotes the draft, three whole words or more", () => {
  const w = ready();
  const cases = [
    [brk("A hyperspec is a promise a linter can check"), ["judge-evidence-not-found"]],
    [brk("nine tests"), ["judge-evidence-too-short"]],
    [brk(""), ["judge-evidence-missing"]],
    [{ kind: "stance", why: "no evidence" }, ["judge-evidence-missing"]],
  ];
  for (const [b, want] of cases) {
    const { r, j } = recordJson(w, personaVerdict((v) => { v.breaks = [b]; }));
    assert.equal(r.status, 1, JSON.stringify(b));
    assert.equal(j.invalid, true);
    assert.deepEqual(ids(j.findings), want, JSON.stringify(b));
  }
  assert.deepEqual(ledgerLines(w.ledger).filter((l) => l.kind === "judge"), [], "an invalid verdict records nothing");
});

test("the verdict's shape: a list of breaks, each with a kind from the closed set and a why", () => {
  const w = ready();
  const ok = "The nine tests run on every spec";
  const cases = [
    ["not an object", [], ["judge-verdict-shape"]],
    ["breaks missing", {}, ["judge-verdict-shape"]],
    ["breaks not a list", { breaks: "none" }, ["judge-verdict-shape"]],
    ["break not an object", { breaks: [ok] }, ["judge-verdict-shape"]],
    ["why empty", { breaks: [brk(ok, "stance", " ")] }, ["judge-verdict-shape"]],
    ["why missing", { breaks: [{ evidence: ok, kind: "stance" }] }, ["judge-verdict-shape"]],
    ["kind outside the set", { breaks: [brk(ok, "tone")] }, ["judge-persona-kind-unknown"]],
    ["kind missing", { breaks: [{ evidence: ok, why: "x" }] }, ["judge-persona-kind-unknown"]],
    ["kind in capitals", { breaks: [brk(ok, "Stance")] }, ["judge-persona-kind-unknown"]],
  ];
  for (const [what, verdict, want] of cases) {
    const { r, j } = recordJson(w, verdict);
    assert.equal(r.status, 1, what);
    assert.equal(j.invalid, true, what);
    assert.deepEqual(ids(j.findings), want, what);
  }
  const { j } = recordJson(w, { breaks: [brk(ok, "tone")] });
  assert.match(j.findings[0].message, /breaks\[0\]\.kind "tone" is not one of stance, assertion, will_not_say, unsourced_fact/);
});

// ---- the claims ledger is an input: changed means stale ----------------------------------------------

test("a claims ledger changed after prepare makes the packet stale, naming the ledger, and records nothing", () => {
  const w = ready();
  writeFileSync(join(w.dir, "essay.claims.jsonl"), claimsJsonl([...CLAIMS, { text: "A third claim.", source: "m1" }]));
  const { r, j } = recordJson(w, personaVerdict());
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.equal(j.stale, true);
  assert.deepEqual(ids(j.findings), ["judge-stale"]);
  assert.match(j.findings[0].message, /the claims ledger \(essay\.claims\.jsonl\) changed since the packet was prepared, or the packet was edited/);
  assert.deepEqual(ledgerLines(w.ledger).filter((l) => l.kind === "judge"), []);
  assert.match(record(w).stdout, /^persona: stale packet, nothing recorded$/m);
});

test("a claims ledger deleted after prepare is stale too: the station no longer applies, and the ledger is named", () => {
  const w = ready();
  rmSync(join(w.dir, "essay.claims.jsonl"));
  const { r, j } = recordJson(w, personaVerdict());
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.equal(j.stale, true);
  assert.deepEqual(ids(j.findings), ["judge-stale"]);
  assert.match(j.findings[0].message, /^persona no longer applies \(writing\.sources\.ledger "essay\.claims\.jsonl" cannot be read .*\): the claims ledger \(essay\.claims\.jsonl\) changed since the packet was prepared, or the packet was edited$/);
  assert.equal(j.findings[0].fix, "Restore the claims ledger (essay.claims.jsonl) and record this verdict again; as they are now, judge prepare skips persona for this spec and draft.");
  assert.deepEqual(ledgerLines(w.ledger).filter((l) => l.kind === "judge"), []);
});

test("a hand-edited claims list with the ledger unchanged is caught the same way; editing outside inputs is altered", () => {
  const w = ready();
  const p = json(w.packet);
  const inputs = structuredClone(p.inputs);
  p.inputs.claims = [];
  writeFileSync(w.packet, `${JSON.stringify(p, null, 2)}\n`);
  let { j } = recordJson(w, personaVerdict());
  assert.deepEqual(ids(j.findings), ["judge-stale"]);
  p.inputs = inputs;
  p.rubric = "anything goes";
  writeFileSync(w.packet, `${JSON.stringify(p, null, 2)}\n`);
  ({ j } = recordJson(w, personaVerdict()));
  assert.deepEqual(ids(j.findings), ["judge-packet-altered"]);
});

// ---- the ledger ------------------------------------------------------------------------------------

test("persona lines keep their own history: one-shot, then a failing verdict on the same bytes is not-improved", () => {
  const w = ready();
  writeVerdict(w.verdict, personaVerdict());
  let r = record(w);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^persona: pass$/m);
  assert.match(r.stdout, /^verdict: one-shot$/m);
  writeVerdict(w.verdict, personaVerdict((v) => { v.breaks = [brk("The nine tests run on every spec")]; }));
  r = record(w);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /verdict: not-improved \(failing stations: persona\)/);
  const lines = ledgerLines(w.ledger).filter((l) => l.kind === "judge");
  assert.deepEqual(lines.map((l) => [l.station, l.status, l.verdict]), [["persona", "pass", "one-shot"], ["persona", "fail", "not-improved"]]);
  assert.match(cli(["lint", w.spec]).stdout, /pass \(9\/9\)/);
});

// ---- no claims ledger declared (writing.sources deferred) -----------------------------------------

// The fixture with writing.sources deferred by a delegated decision: it still lints 9/9.
function withoutLedger() {
  const w = workspace();
  const text = readFileSync(w.spec, "utf8");
  const edited = text
    .replace(/  sources:\n(?: {4}.*\n)+/, "")
    .replace("decisions:\n", "decisions:\n  - id: writing-sources\n    state: delegated\n    rule: no factual claims are made; nothing needs a ledger\n    source: sourcing pass\n    author: gary-sheng\n    chosen_by: human\n");
  assert.ok(!edited.includes("essay.claims.jsonl"));
  writeFileSync(w.spec, edited);
  assert.match(cli(["lint", w.spec]).stdout, /pass \(9\/9\)/);
  return ready(w);
}

test("with no claims ledger declared, the packet's claims are null and unsourced_fact leaves the schema", () => {
  const w = withoutLedger();
  const p = json(w.packet);
  assert.equal(p.inputs.claims, null);
  assert.deepEqual(p.verdict_schema.properties.breaks.items.properties.kind.enum, ["stance", "assertion", "will_not_say"]);
});

test("with no claims ledger declared, a break of kind unsourced_fact is an invalid verdict; other kinds still record", () => {
  const w = withoutLedger();
  let { r, j } = recordJson(w, personaVerdict((v) => { v.breaks = [brk("The nine tests run on every spec", "unsourced_fact", "inputs.claims is null")]; }));
  assert.equal(r.status, 1);
  assert.equal(j.invalid, true);
  assert.deepEqual(ids(j.findings), ["judge-persona-no-ledger"]);
  assert.equal(j.findings[0].message, "breaks[0].kind is unsourced_fact, but the spec declares no claims ledger, so no fact can be checked against sources");
  assert.deepEqual(ledgerLines(w.ledger).filter((l) => l.kind === "judge"), []);
  ({ r, j } = recordJson(w, personaVerdict((v) => { v.breaks = [brk("The nine tests run on every spec", "stance")]; })));
  assert.equal(r.status, 1);
  assert.equal(j.status, "fail");
  assert.deepEqual(ids(j.findings), ["judge-persona-break"]);
});

test("a skip that is not the ledger's (the rubric removed, the spec hash forged) is an altered packet, never 'judge the new packet'", () => {
  const w = ready();
  const text = readFileSync(w.spec, "utf8");
  writeFileSync(w.spec, text.replace("      rubric: persona-consistency judge; stance and voice hold, no fact appears that is not in the claims ledger\n", "      station: a stance check\n"));
  const p = json(w.packet);
  p.spec_sha256 = createHash("sha256").update(readFileSync(w.spec)).digest("hex");
  writeFileSync(w.packet, `${JSON.stringify(p, null, 2)}\n`);
  const { r, j } = recordJson(w, personaVerdict());
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.equal(j.invalid, true);
  assert.deepEqual(ids(j.findings), ["judge-packet-altered"]);
  assert.match(j.findings[0].message, /is for a station that does not apply to this spec and draft \(writing\.persona\.check has no rubric\)$/);
  assert.equal(j.findings[0].fix, "judge prepare writes no persona packet for this spec and draft; record verdicts only on packets prepare writes, and never edit one.");
  assert.ok(!/claims ledger/.test(j.findings[0].message));
  assert.deepEqual(ledgerLines(w.ledger).filter((l) => l.kind === "judge"), []);
});
