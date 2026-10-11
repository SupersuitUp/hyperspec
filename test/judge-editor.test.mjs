// The editor judge (hyperspec 0.13): applies to every writing spec with a draft unless
// writing.editor.off is true; flags, never rewrites; every finding names one of eleven faults and
// quotes the draft; the human line edits in writing.editor.examples go in the packet as
// calibration, and a changed examples file makes the packet stale; every finding goes to triage.
// The framework it shares with every judge (stale, altered, the evidence rule) is in
// test/judge.test.mjs; this file holds what is the editor's own.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cli, workspace, writeVerdict, ledgerLines, prepare, record, forStation } from "./judge-fixture.mjs";
import { DEFAULT_RUBRIC, EDITOR_FAULTS, FAULT_IDS, JUDGE_MODEL } from "../src/judges/editor.mjs";

const ed = (w) => forStation(w, "editor");
const readPacket = (w) => JSON.parse(readFileSync(ed(w).packet, "utf8"));
const ids = (findings) => findings.map((f) => f.id);
const triageLines = (w) => (existsSync(join(w.dir, "triage.jsonl")) ? readFileSync(join(w.dir, "triage.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)) : []);
const addEditor = (w, yaml) => {
  const spec = readFileSync(w.spec, "utf8");
  writeFileSync(w.spec, spec.replace("\nwriting:\n", `\nwriting:\n${yaml}`));
};
const recordJson = (w, verdict) => {
  const e = ed(w);
  writeVerdict(e.verdict, verdict);
  const r = record(e, "--json");
  return { r, j: JSON.parse(r.stdout) };
};

const EXAMPLES = [
  { passage: "In today's fast-paced world, every manager wears many hats.", fault: "cliche", why: "Two stock phrases.", edited: "A new manager runs eleven meetings a week." },
  { passage: "A slightly faster inbox means the setup is wrong.", fault: "machine-cadence", why: "An aphorism doing an argument's work." },
];
const jsonl = (rows) => rows.map((r) => `${typeof r === "string" ? r : JSON.stringify(r)}\n`).join("");

test("the editor applies to a writing spec with a draft: its packet carries the default rubric, the draft, the audience, no examples and judge_model", () => {
  const w = workspace();
  const r = prepare(w, "--only", "editor");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(readdirSync(w.out), ["editor.packet.json"], "the editor has no key");
  const p = readPacket(w);
  assert.equal(p.station, "editor");
  assert.equal(p.rubric, DEFAULT_RUBRIC);
  assert.match(p.instructions, /never rewrite/i);
  assert.equal(p.inputs.draft, readFileSync(w.draft, "utf8"));
  assert.deepEqual(Object.keys(p.inputs.audience), ["who", "reader"]);
  assert.ok(p.inputs.audience.who.length > 0);
  assert.deepEqual(p.inputs.examples, []);
  assert.equal(p.judge_model, JUDGE_MODEL);
  assert.match(p.judge_model, /different model family/);
  assert.deepEqual(Object.keys(p), ["hyperspec_judge", "station", "spec", "spec_sha256", "draft", "draft_sha256", "rubric", "instructions", "inputs", "verdict_schema", "judge_model"]);
  assert.deepEqual(p.verdict_schema.properties.findings.items.properties.fault.enum, FAULT_IDS);
  assert.equal(FAULT_IDS.length, 11);
  assert.deepEqual(FAULT_IDS, ["cliche", "unnecessary-exposition", "purple-prose", "sentence-structure", "lack-of-specificity", "awkward-word-choice", "tense-inconsistency", "wrong-register", "overclaim", "machine-cadence", "order"]);
  for (const id of FAULT_IDS) assert.ok(EDITOR_FAULTS[id].length > 10, id);
  assert.deepEqual(p.verdict_schema.required, ["findings", "would_publish"]);
});

test("no other judge's packet carries judge_model", () => {
  const w = workspace();
  prepare(w);
  for (const f of readdirSync(w.out).filter((x) => x.endsWith(".packet.json") && x !== "editor.packet.json")) {
    assert.ok(!("judge_model" in JSON.parse(readFileSync(join(w.out, f), "utf8"))), f);
  }
});

test("writing.editor.check.rubric replaces the default rubric", () => {
  const w = workspace();
  addEditor(w, "  editor:\n    check:\n      rubric: would the house editor at a trade magazine print it\n");
  assert.equal(prepare(w, "--only", "editor").status, 0);
  assert.equal(readPacket(w).rubric, "would the house editor at a trade magazine print it");
});

test("writing.editor.off: true skips the editor, and no packet is written", () => {
  const w = workspace();
  addEditor(w, "  editor:\n    off: true\n");
  const r = prepare(w, "--only", "editor");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout.trim(), "editor: skip (writing.editor.off is true)");
  assert.deepEqual(readdirSync(w.out), []);
});

test("an empty draft skips the editor", () => {
  const w = workspace({ draft: "\n\n" });
  const r = prepare(w, "--only", "editor");
  assert.equal(r.stdout.trim(), "editor: skip (the draft is empty)");
});

test("a verdict with would_publish true and nothing marked passes, exit 0, and adds nothing to triage", () => {
  const w = workspace();
  prepare(w, "--only", "editor");
  const { r, j } = recordJson(w, { findings: [], would_publish: true });
  assert.equal(r.status, 0, r.stdout);
  assert.equal(j.status, "pass");
  assert.deepEqual(j.findings, []);
  assert.equal(j.summary, "0 marked; would publish: yes; 0 added to triage (triage.jsonl)");
  assert.deepEqual(ledgerLines(w.ledger).map((l) => [l.kind, l.station, l.status]), [["judge", "editor", "pass"]]);
});

test("would_publish false fails: each mark is a warning at its line, and every mark goes to triage with its fault as the kind", () => {
  const w = workspace();
  prepare(w, "--only", "editor");
  const { r, j } = recordJson(w, {
    findings: [
      { evidence: "not a prompt someone wrote once", fault: "machine-cadence", why: "A \"not X\" turn doing the work of an argument." },
      { evidence: "Read the schema section next.", fault: "lack-of-specificity", why: "Which section, and why now, is not said." },
    ],
    would_publish: false,
  });
  assert.equal(r.status, 1, r.stdout);
  assert.equal(j.status, "fail");
  assert.deepEqual(j.findings.map((f) => [f.id, f.severity, f.line ?? null]), [
    ["judge-editor-mark", "warn", 3],
    ["judge-editor-mark", "warn", 11],
    ["judge-editor-would-not-publish", "fail", null],
  ]);
  assert.match(j.findings[0].message, /^the editor marks machine-cadence: /);
  assert.equal(j.summary, "2 marked (machine-cadence 1, lack-of-specificity 1); would publish: no; 2 added to triage (triage.jsonl)");
  assert.deepEqual(triageLines(w).map((l) => [l.source, l.reader, l.kind, l.evidence, l.disposition]), [
    ["editor", null, "machine-cadence", "not a prompt someone wrote once", null],
    ["editor", null, "lack-of-specificity", "Read the schema section next.", null],
  ]);
  assert.ok(triageLines(w).every((l) => l.finding_id.startsWith("editor-")));
  // The marks are answered like any triage finding: check's triage station fails until they are.
  const c = cli(["check", w.spec, "--draft", w.draft, "--only", "triage", "--json"]);
  assert.equal(JSON.parse(c.stdout).stations[0].status, "fail");
  // Recording the same verdict again adds nothing to triage.
  const again = recordJson(w, JSON.parse(readFileSync(ed(w).verdict, "utf8")));
  assert.match(again.j.summary, /0 added to triage \(triage\.jsonl\), 2 already there$/);
});

test("would_publish true with marks still passes; the marks are warnings and go to triage", () => {
  const w = workspace();
  prepare(w, "--only", "editor");
  const { j } = recordJson(w, { findings: [{ evidence: "each one names what fails it", fault: "awkward-word-choice", why: "\"names what fails it\" is hard to parse." }], would_publish: true });
  assert.equal(j.status, "pass");
  assert.deepEqual(ids(j.findings), ["judge-editor-mark"]);
  assert.equal(triageLines(w).length, 1);
});

test("a fault outside the eleven is an invalid verdict: nothing recorded, nothing triaged", () => {
  const w = workspace();
  prepare(w, "--only", "editor");
  const { r, j } = recordJson(w, { findings: [{ evidence: "not a prompt someone wrote once", fault: "boring", why: "It is dull." }], would_publish: false });
  assert.equal(r.status, 1);
  assert.equal(j.invalid, true);
  assert.deepEqual(ids(j.findings), ["judge-editor-fault-unknown"]);
  assert.match(j.findings[0].message, /findings\[0\]\.fault "boring" is not one of cliche, /);
  assert.deepEqual(ledgerLines(w.ledger), []);
  assert.deepEqual(triageLines(w), []);
});

test("evidence that is not verbatim in the draft is an invalid verdict", () => {
  const w = workspace();
  prepare(w, "--only", "editor");
  const { j } = recordJson(w, { findings: [{ evidence: "not a prompt anyone wrote once", fault: "cliche", why: "Stock phrase." }], would_publish: false });
  assert.equal(j.invalid, true);
  assert.deepEqual(ids(j.findings), ["judge-evidence-not-found"]);
  assert.deepEqual(ledgerLines(w.ledger), []);
});

test("the verdict's shape is held: findings a list, why non-empty, would_publish a boolean, and a refusal to publish names what stops it", () => {
  const w = workspace();
  prepare(w, "--only", "editor");
  const cases = [
    [[], ["judge-verdict-shape"]],
    [{ would_publish: true }, ["judge-verdict-shape"]],
    [{ findings: [], would_publish: "no" }, ["judge-verdict-shape"]],
    [{ findings: [{ evidence: "not a prompt someone wrote once", fault: "cliche", why: " " }], would_publish: false }, ["judge-verdict-shape"]],
    [{ findings: ["cliche"], would_publish: false }, ["judge-verdict-shape"]],
    [{ findings: [], would_publish: false }, ["judge-editor-unmarked"]],
  ];
  for (const [verdict, expected] of cases) {
    const { j } = recordJson(w, verdict);
    assert.equal(j.invalid, true, JSON.stringify(verdict));
    assert.deepEqual(ids(j.findings), expected, JSON.stringify(verdict));
  }
});

test("writing.editor.examples feeds every usable line of the examples file into the packet, in order", () => {
  const w = workspace();
  writeFileSync(join(w.dir, "edits.jsonl"), jsonl(EXAMPLES));
  addEditor(w, "  editor:\n    examples: edits.jsonl\n");
  assert.equal(prepare(w, "--only", "editor").status, 0);
  assert.deepEqual(readPacket(w).inputs.examples, EXAMPLES);
});

test("an examples file changed after prepare makes the packet stale, naming the file; restored, it records", () => {
  const w = workspace();
  const path = join(w.dir, "edits.jsonl");
  writeFileSync(path, jsonl(EXAMPLES));
  addEditor(w, "  editor:\n    examples: edits.jsonl\n");
  prepare(w, "--only", "editor");
  writeFileSync(path, jsonl([...EXAMPLES, { passage: "It feels like magic.", fault: "overclaim", why: "Invites a skeptic." }]));
  const { r, j } = recordJson(w, { findings: [], would_publish: true });
  assert.equal(r.status, 1);
  assert.equal(j.stale, true);
  assert.deepEqual(ids(j.findings), ["judge-stale"]);
  assert.match(j.findings[0].message, /the editor examples \(edits\.jsonl\) changed since the packet was prepared/);
  assert.deepEqual(ledgerLines(w.ledger), []);
  writeFileSync(path, jsonl(EXAMPLES));
  assert.equal(recordJson(w, { findings: [], would_publish: true }).j.status, "pass");
});

test("an examples file deleted after prepare is stale too: the editor no longer applies, and the file is named", () => {
  const w = workspace();
  const path = join(w.dir, "edits.jsonl");
  writeFileSync(path, jsonl(EXAMPLES));
  addEditor(w, "  editor:\n    examples: edits.jsonl\n");
  prepare(w, "--only", "editor");
  rmSync(path);
  const { j } = recordJson(w, { findings: [], would_publish: true });
  assert.equal(j.stale, true);
  assert.match(j.findings[0].message, /^editor no longer applies \(writing\.editor\.examples "edits\.jsonl" cannot be read/);
});

test("lint: writing.editor must be usable: a map, off true or false, a rubric when check is given, an examples file that exists and whose every line is an example", () => {
  const cases = [
    ["  editor: yes\n", "writing-editor", 1],
    ["  editor:\n    off: maybe\n", "writing-editor-off", 1],
    ["  editor:\n    check:\n      station: x\n", "writing-editor-rubric", 1],
    ["  editor:\n    examples: TODO\n", "writing-editor-examples", 1],
    ["  editor:\n    examples: nowhere.jsonl\n", "writing-editor-examples-missing", 6],
  ];
  for (const [yaml, id, testNo] of cases) {
    const w = workspace();
    addEditor(w, yaml);
    const r = cli(["lint", w.spec, "--json"]);
    assert.equal(r.status, 1, `${id}: ${r.stdout}`);
    const found = JSON.parse(r.stdout).files[0].findings.map((f) => `${f.id} ${f.test}`);
    assert.ok(found.includes(`${id} ${testNo}`), `${id}: ${found.join(", ")}`);
  }
  const w = workspace();
  writeFileSync(join(w.dir, "edits.jsonl"), jsonl([EXAMPLES[0], "not json", { passage: "x y z", fault: "dull", why: "w" }, { passage: "x y z", fault: "cliche" }]));
  addEditor(w, "  editor:\n    examples: edits.jsonl\n");
  const r = cli(["lint", w.spec, "--json"]);
  const lines = JSON.parse(r.stdout).files[0].findings.filter((f) => f.id === "writing-editor-examples-line").map((f) => f.message);
  assert.equal(lines.length, 3, lines.join("\n"));
  assert.match(lines[0], /line 2 is not valid JSON/);
  assert.match(lines[1], /line 3 has fault "dull", not one of cliche/);
  assert.match(lines[2], /line 4 has no why/);
  // A valid editor block lints clean.
  const ok = workspace();
  writeFileSync(join(ok.dir, "edits.jsonl"), jsonl(EXAMPLES));
  addEditor(ok, "  editor:\n    off: false\n    examples: edits.jsonl\n    check:\n      rubric: would the house print it\n");
  assert.equal(cli(["lint", ok.spec]).status, 0);
});
