// The panel judge (hyperspec 0.9): one packet per reader, the audience's own reader always added as
// the buyer, every item quoting the draft, and every improve, missing and remove item handed to the
// triage file. The framework it shares with every judge (stale, altered, the evidence rule) is in
// test/judge.test.mjs; this file holds what is the panel's own.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { cli, workspace, writeVerdict, ledgerLines, prepare } from "./judge-fixture.mjs";
import { DEFAULT_PANEL } from "../src/judges/panel.mjs";

const panelFiles = (w) => readdirSync(w.out).filter((f) => f.startsWith("panel-")).sort();
const packetOf = (w, reader) => join(w.out, `panel-${reader}.packet.json`);
const recordPanel = (w, reader, verdict, ...extra) => {
  const path = join(w.dir, `panel-${reader}.verdict.json`);
  writeVerdict(path, verdict);
  return cli(["judge", "record", packetOf(w, reader), "--verdict", path, ...extra]);
};
const triageLines = (w) => (existsSync(join(w.dir, "triage.jsonl")) ? readFileSync(join(w.dir, "triage.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)) : []);

// A verdict on the fixture's DRAFT, every span in it word for word.
const VERDICT = {
  good: [{ evidence: "A hyperspec is a contract a linter can check", note: "The claim is in the first line." }],
  improve: [{ evidence: "not a prompt someone wrote once", note: "The contrast with a prompt is asserted, not shown." }],
  missing: [{ evidence: "Read the schema section next.", note: "No example of a spec before sending the reader to the schema." }],
  remove: [],
};

const addPanel = (w, yaml) => {
  const spec = readFileSync(w.spec, "utf8");
  writeFileSync(w.spec, spec.replace("\nwriting:\n", `\nwriting:\n${yaml}`));
};

test("prepare writes one panel packet per default reader, then the buyer", () => {
  const w = workspace();
  const r = prepare(w, "--only", "panel");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(r.stdout.trim().split("\n").map((l) => l.replace(w.out, "<out>")), [
    ...DEFAULT_PANEL.map((p) => `<out>/panel-${p.id}.packet.json`),
    "<out>/panel-buyer.packet.json",
  ]);
  assert.deepEqual(DEFAULT_PANEL.map((p) => p.id), ["skeptic", "novice", "expert"]);
});

test("the buyer is the audience's own reader: its who, what it knows, and what it wants", () => {
  const w = workspace();
  prepare(w, "--only", "panel");
  const p = JSON.parse(readFileSync(packetOf(w, "buyer"), "utf8"));
  assert.equal(p.station, "panel");
  assert.equal(p.inputs.reader.id, "buyer");
  const spec = readFileSync(w.spec, "utf8");
  assert.ok(spec.includes(`who: ${p.inputs.reader.who}`), p.inputs.reader.who);
  assert.match(p.inputs.reader.lens, /^what they want from this piece: /);
  assert.equal(p.rubric, "simulated reader reports where it got lost and where it stopped", "the audience's rubric, verbatim");
});

test("a declared panel replaces the default three, and the buyer is still added last", () => {
  const w = workspace();
  addPanel(w, "  panel:\n    - id: editor\n      who: a magazine editor\n      lens: whether the piece earns its length\n      knows:\n        - hyperspec\n");
  const r = prepare(w, "--only", "panel");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(panelFiles(w), ["panel-buyer.packet.json", "panel-editor.packet.json"]);
  const p = JSON.parse(readFileSync(packetOf(w, "editor"), "utf8"));
  assert.deepEqual(p.inputs.reader, { id: "editor", who: "a magazine editor", knows: ["hyperspec"], lens: "whether the piece earns its length" });
});

test("a valid verdict passes, warns once per item to answer, and hands those items to the triage file", () => {
  const w = workspace();
  prepare(w, "--only", "panel");
  const r = recordPanel(w, "skeptic", VERDICT, "--json");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.status, "pass");
  assert.equal(out.reader, "skeptic");
  assert.deepEqual(out.findings.map((f) => [f.id, f.severity, f.line]), [["judge-panel-improve", "warn", 3], ["judge-panel-missing", "warn", 11]]);
  assert.equal(out.summary, "skeptic: 1 good, 1 to improve, 1 missing, 0 to remove; 2 added to triage (triage.jsonl)");
  const lines = triageLines(w);
  assert.deepEqual(lines.map((l) => [l.source, l.reader, l.kind, l.evidence, l.disposition, l.answer]), [
    ["panel", "skeptic", "improve", "not a prompt someone wrote once", null, null],
    ["panel", "skeptic", "missing", "Read the schema section next.", null, null],
  ]);
  for (const l of lines) assert.match(l.finding_id, /^panel-skeptic-[0-9a-f]{8}$/);
  assert.deepEqual(Object.keys(lines[0]), ["finding_id", "source", "reader", "kind", "text", "evidence", "draft_sha256", "disposition", "answer"]);
});

test("recording the same verdict again adds nothing to triage: a finding is one finding", () => {
  const w = workspace();
  prepare(w, "--only", "panel");
  recordPanel(w, "skeptic", VERDICT);
  const again = JSON.parse(recordPanel(w, "skeptic", VERDICT, "--json").stdout);
  assert.equal(again.summary, "skeptic: 1 good, 1 to improve, 1 missing, 0 to remove; 0 added to triage (triage.jsonl), 2 already there");
  assert.equal(triageLines(w).length, 2);
});

test("GUARD: an item whose evidence is not in the draft makes the verdict invalid, and nothing reaches triage", () => {
  const w = workspace();
  prepare(w, "--only", "panel");
  const r = recordPanel(w, "novice", { ...VERDICT, remove: [{ evidence: "a sentence the draft never had", note: "cut it" }] }, "--json");
  assert.equal(r.status, 1);
  const out = JSON.parse(r.stdout);
  assert.equal(out.invalid, true);
  assert.deepEqual(out.findings.map((f) => f.id), ["judge-evidence-not-found"]);
  assert.deepEqual(triageLines(w), []);
  assert.deepEqual(ledgerLines(w.ledger), []);
});

test("GUARD: a verdict missing one of the four lists, or an item with no note, is invalid", () => {
  const w = workspace();
  prepare(w, "--only", "panel");
  const { remove, ...noRemove } = VERDICT;
  assert.deepEqual(JSON.parse(recordPanel(w, "expert", noRemove, "--json").stdout).findings.map((f) => f.id), ["judge-verdict-shape"]);
  const noNote = { ...VERDICT, good: [{ evidence: "A hyperspec is a contract a linter can check", note: " " }] };
  assert.deepEqual(JSON.parse(recordPanel(w, "expert", noNote, "--json").stdout).findings.map((f) => f.id), ["judge-verdict-shape"]);
});

test("GUARD: a packet renamed to a reader the spec does not name is refused as altered", () => {
  const w = workspace();
  prepare(w, "--only", "panel");
  const path = packetOf(w, "skeptic");
  const p = JSON.parse(readFileSync(path, "utf8"));
  p.inputs.reader.id = "editor";
  writeFileSync(path, `${JSON.stringify(p, null, 2)}\n`);
  const out = JSON.parse(recordPanel(w, "skeptic", VERDICT, "--json").stdout);
  assert.deepEqual(out.findings.map((f) => f.id), ["judge-packet-altered"]);
  assert.match(out.findings[0].message, /a panel reader this spec does not name \(editor\)/);
});

test("GUARD: a packet whose reader was swapped for another reader on the panel is refused as altered", () => {
  const w = workspace();
  prepare(w, "--only", "panel");
  const path = packetOf(w, "skeptic");
  const p = JSON.parse(readFileSync(path, "utf8"));
  p.inputs.reader.id = "novice";
  writeFileSync(path, `${JSON.stringify(p, null, 2)}\n`);
  assert.deepEqual(JSON.parse(recordPanel(w, "skeptic", VERDICT, "--json").stdout).findings.map((f) => f.id), ["judge-packet-altered"]);
});

test("each reader keeps its own history in the ledger: two readers' first judgments are both one-shot", () => {
  const w = workspace();
  prepare(w, "--only", "panel");
  recordPanel(w, "skeptic", VERDICT);
  recordPanel(w, "buyer", VERDICT);
  const lines = ledgerLines(w.ledger);
  assert.deepEqual(lines.map((l) => [l.station, l.reader, l.verdict]), [["panel", "skeptic", "one-shot"], ["panel", "buyer", "one-shot"]]);
  assert.deepEqual(Object.keys(lines[0]).slice(0, 5), ["at", "kind", "station", "reader", "draft"]);
});

test("with no written audience rubric the panel skips, since its buyer is the audience's reader", () => {
  const w = workspace();
  const spec = readFileSync(w.spec, "utf8");
  const without = spec.replace("      rubric: simulated reader reports where it got lost and where it stopped\n", "");
  assert.notEqual(without, spec);
  writeFileSync(w.spec, without);
  const r = prepare(w, "--only", "panel");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout.trim(), "panel: skip (writing.audience.check has no rubric)");
});

test("lint: every writing.panel reader needs an id, who and lens; ids are unique slugs, and buyer is taken", () => {
  const reader = (fields) => `    - ${fields.join("\n      ")}\n`;
  const cases = [
    ["  panel: yes\n", "writing-panel"],
    ["  panel: []\n", "writing-panel"],
    [`  panel:\n${reader(["who: a critic", "lens: weak claims"])}`, "writing-panel-id"],
    [`  panel:\n${reader(["id: Big Critic", "who: a critic", "lens: weak claims"])}`, "writing-panel-id"],
    [`  panel:\n${reader(["id: buyer", "who: a critic", "lens: weak claims"])}`, "writing-panel-buyer"],
    [`  panel:\n${reader(["id: critic", "who: a critic", "lens: weak claims"])}${reader(["id: critic", "who: another", "lens: tone"])}`, "writing-panel-id-duplicate"],
    [`  panel:\n${reader(["id: critic", "lens: weak claims"])}`, "writing-panel-who"],
    [`  panel:\n${reader(["id: critic", "who: a critic"])}`, "writing-panel-lens"],
    [`  panel:\n${reader(["id: critic", "who: a critic", "lens: weak claims", "knows: everything"])}`, "writing-panel-knows"],
  ];
  for (const [yaml, id] of cases) {
    const w = workspace();
    addPanel(w, yaml);
    const r = cli(["lint", w.spec, "--json"]);
    assert.equal(r.status, 1, `${id}: ${r.stdout}`);
    const found = JSON.parse(r.stdout).files[0].findings.map((f) => `${f.id} ${f.test}`);
    assert.ok(found.includes(`${id} 1`), `${id}: ${found.join(", ")}`);
  }
});
