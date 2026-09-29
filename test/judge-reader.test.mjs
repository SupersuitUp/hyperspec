// The reader station: its packet (the audience block and the draft), how its verdict is validated
// (every quoted passage must be in the draft), and what a valid verdict derives: pass when the
// reader read to the end and would take the next step; each place it got lost is a warning.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { cli, workspace, forStation, readerVerdict, doctorVerdict, writeVerdict, ledgerLines, prepare, record, DRAFT } from "./judge-fixture.mjs";
import { READER_INSTRUCTIONS } from "../src/judges/reader.mjs";

const json = (path) => JSON.parse(readFileSync(path, "utf8"));
function ready() {
  const w = forStation(workspace(), "reader");
  const r = prepare(w, "--only", "reader");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return w;
}
function recordJson(w, verdict) {
  writeVerdict(w.verdict, verdict);
  const r = record(w, "--json");
  return { r, j: JSON.parse(r.stdout) };
}
const ids = (findings) => findings.map((f) => f.id);
const lost = (evidence, why = "a term I do not know") => ({ evidence, why });

// ---- the packet ------------------------------------------------------------------------------------

test("the reader packet: the audience rubric verbatim, fixed instructions, the audience and the draft", () => {
  const w = ready();
  const p = json(w.packet);
  assert.equal(p.station, "reader");
  assert.equal(p.rubric, "simulated reader reports where it got lost and where it stopped");
  assert.equal(p.instructions, READER_INSTRUCTIONS);
  for (const s of ["lost_at", "stopped_at", "null", "verbatim", "next_step", "verdict shape"]) assert.ok(p.instructions.includes(s), s);
  assert.deepEqual(Object.keys(p.inputs), ["audience", "draft"]);
  assert.deepEqual(p.inputs.audience, {
    who: "an operator who has read one hyperspec and wants to know whether the next one is worth adopting",
    funnel_now: "reading the standard's README",
    knows: ["hyperspec", "lint"],
    terms: [],
    believes_now: "a spec is a prompt someone wrote once",
    wants: "to know whether a writing spec is worth adopting",
    reads_on: "a phone, in ninety seconds",
    reader: "person",
  });
  assert.equal(p.inputs.draft, DRAFT);
  assert.deepEqual(p.verdict_schema.required, ["lost_at", "stopped_at", "would_take_next_step", "next_step"]);
  assert.deepEqual(readdirSync(w.out), ["reader.packet.json"], "the reader has no key");
});

test("the same spec and draft give a byte-identical reader packet", () => {
  const w = ready();
  const first = readFileSync(w.packet);
  assert.equal(prepare(w, "--only", "reader", "--force").status, 0);
  assert.ok(first.equals(readFileSync(w.packet)));
});

test("the reader is skipped when the audience check has no rubric", () => {
  const w = forStation(workspace(), "reader");
  const text = readFileSync(w.spec, "utf8");
  const edited = text.replace("      rubric: simulated reader reports where it got lost and where it stopped\n", "");
  assert.notEqual(edited, text);
  writeFileSync(w.spec, edited);
  const r = prepare(w, "--only", "reader");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^reader: skip \(writing\.audience\.check has no rubric\)$/m);
  assert.deepEqual(readdirSync(w.out), []);
});

// ---- the verdict -----------------------------------------------------------------------------------

test("read to the end, nothing lost, would take the next step: pass with no findings", () => {
  const w = ready();
  const { r, j } = recordJson(w, readerVerdict());
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(j.status, "pass");
  assert.deepEqual(j.findings, []);
});

test("each place the reader got lost is a warning at its line, and the station still passes", () => {
  const w = ready();
  const { r, j } = recordJson(w, readerVerdict((v) => {
    v.lost_at = [lost("The nine tests run on every spec"), lost("“Progress” is read from disk", "read from what disk?")];
  }));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(j.status, "pass");
  assert.deepEqual(ids(j.findings), ["judge-reader-lost", "judge-reader-lost"]);
  assert.deepEqual(j.findings.map((f) => [f.severity, f.line]), [["warn", 7], ["warn", 7]]);
  assert.match(j.findings[1].message, /read from what disk\?/);
  const human = record(w);
  assert.match(human.stdout, /^ {2}warn \[judge-reader-lost\] the reader got lost here: a term I do not know \(line 7\)$/m);
});

test("stopping before the end fails, at the passage the reader stopped on", () => {
  const w = ready();
  const { r, j } = recordJson(w, readerVerdict((v) => { v.stopped_at = { evidence: "The nine tests run on every spec", why: "too abstract on a phone" }; }));
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.equal(j.status, "fail");
  assert.deepEqual(ids(j.findings), ["judge-reader-stopped"]);
  assert.equal(j.findings[0].severity, "fail");
  assert.equal(j.findings[0].line, 7);
  assert.match(j.findings[0].message, /too abstract on a phone/);
});

test("a reader who would not take the next step fails, naming the step they would take instead", () => {
  const w = ready();
  const { r, j } = recordJson(w, readerVerdict((v) => { v.would_take_next_step = false; v.next_step = "close the tab"; }));
  assert.equal(r.status, 1);
  assert.deepEqual(ids(j.findings), ["judge-reader-next-step"]);
  assert.match(j.findings[0].message, /close the tab/);
});

test("every quoted passage must be in the draft, three whole words or more", () => {
  const w = ready();
  const cases = [
    [readerVerdict((v) => { v.lost_at = [lost("The ten tests run on every spec")]; }), ["judge-evidence-not-found"]],
    [readerVerdict((v) => { v.lost_at = [lost("nine tests")]; }), ["judge-evidence-too-short"]],
    [readerVerdict((v) => { v.lost_at = [lost("")]; }), ["judge-evidence-missing"]],
    [readerVerdict((v) => { v.stopped_at = { evidence: "Read the whole schema section next.", why: "stopped" }; }), ["judge-evidence-not-found"]],
    [readerVerdict((v) => { v.stopped_at = { why: "stopped" }; }), ["judge-evidence-missing"]],
  ];
  for (const [verdict, want] of cases) {
    const { r, j } = recordJson(w, verdict);
    assert.equal(r.status, 1, JSON.stringify(verdict));
    assert.equal(j.invalid, true);
    assert.deepEqual(ids(j.findings), want, JSON.stringify(verdict));
  }
  assert.deepEqual(ledgerLines(w.ledger).filter((l) => l.kind === "judge"), [], "an invalid verdict records nothing");
});

test("the verdict's shape: lists, a present stopped_at, booleans and a next step", () => {
  const w = ready();
  const cases = [
    ["not an object", []],
    ["lost_at not a list", readerVerdict((v) => { v.lost_at = "nowhere"; })],
    ["lost_at item not an object", readerVerdict((v) => { v.lost_at = ["The nine tests run"]; })],
    ["lost_at item with no why", readerVerdict((v) => { v.lost_at = [{ evidence: "The nine tests run", why: " " }]; })],
    ["stopped_at missing", readerVerdict((v) => { delete v.stopped_at; })],
    ["stopped_at not an object", readerVerdict((v) => { v.stopped_at = "line 7"; })],
    ["stopped_at with no why", readerVerdict((v) => { v.stopped_at = { evidence: "The nine tests run" }; })],
    ["would_take_next_step not a boolean", readerVerdict((v) => { v.would_take_next_step = "yes"; })],
    ["next_step empty", readerVerdict((v) => { v.next_step = ""; })],
    ["next_step missing", readerVerdict((v) => { delete v.next_step; })],
  ];
  for (const [what, verdict] of cases) {
    const { r, j } = recordJson(w, verdict);
    assert.equal(r.status, 1, what);
    assert.deepEqual(ids(j.findings), ["judge-verdict-shape"], what);
  }
});

// ---- the ledger ------------------------------------------------------------------------------------

test("reader and doctor keep separate histories for the same draft; the spec still lints 9/9", () => {
  const w = workspace();
  assert.equal(prepare(w).status, 0);
  const reader = forStation(w, "reader");
  writeVerdict(w.verdict, doctorVerdict());
  assert.match(record(w).stdout, /^verdict: one-shot$/m);
  writeVerdict(reader.verdict, readerVerdict((v) => { v.stopped_at = { evidence: "The nine tests run on every spec", why: "lost interest" }; }));
  let r = record(reader);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^reader: fail$/m);
  assert.match(r.stdout, /verdict: not-improved \(failing stations: reader\)/);
  const revised = forStation({ ...w, draft: w.draft }, "reader");
  writeFileSync(w.draft, DRAFT.replace("Read the schema section next.", "Read the schema section next; it is short."));
  assert.equal(prepare(w, "--only", "reader", "--force").status, 0);
  writeVerdict(revised.verdict, readerVerdict());
  r = record(revised);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /verdict: improved \(draft changed; stations now pass: reader\)/);
  for (let i = 0; i < 8; i++) record(revised);
  const lines = ledgerLines(w.ledger).filter((l) => l.kind === "judge");
  assert.deepEqual(lines.slice(0, 3).map((l) => [l.station, l.status, l.verdict]), [["doctor", "pass", "one-shot"], ["reader", "fail", "not-improved"], ["reader", "pass", "improved"]]);
  assert.equal(lines.length, 11);
  assert.match(cli(["lint", w.spec]).stdout, /pass \(9\/9\)/);
});
