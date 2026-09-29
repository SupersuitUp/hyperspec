// The doctor station: its packet (the goal block, each goal condition as its requirement, the draft),
// how its verdict is validated, and the findings a valid verdict derives.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { cli, workspace, doctorVerdict, writeVerdict, ledgerLines, prepare, record, DRAFT } from "./judge-fixture.mjs";
import { DOCTOR_INSTRUCTIONS } from "../src/judges/doctor.mjs";
import { normalizeForEvidence } from "../src/judge.mjs";

const packetOf = (w) => JSON.parse(readFileSync(w.packet, "utf8"));
const ready = () => { const w = workspace(); prepare(w); return w; };
// Records `verdict` and returns the CLI result plus the parsed --json output.
function recordJson(w, verdict) {
  writeVerdict(w.verdict, verdict);
  const r = record(w, "--json");
  return { r, j: JSON.parse(r.stdout) };
}
const ids = (findings) => findings.map((f) => f.id);

// ---- the packet ----------------------------------------------------------------------------------

test("the doctor packet carries the goal rubric verbatim and the fixed instructions", () => {
  const w = ready();
  const p = packetOf(w);
  assert.equal(p.station, "doctor");
  assert.equal(p.rubric, "the doctor grades the draft against every condition; the simulated reader is asked whether it would take the next step now");
  assert.equal(p.instructions, DOCTOR_INSTRUCTIONS);
  for (const s of ["each condition", "quote the draft", "next step", "verdict shape"]) assert.ok(p.instructions.includes(s), s);
});

test("the doctor inputs are the goal block, each condition as its requirement, and the draft", () => {
  const w = ready();
  const { inputs } = packetOf(w);
  assert.deepEqual(Object.keys(inputs), ["goal", "conditions", "draft"]);
  assert.deepEqual(inputs.goal, {
    from: "believes a spec is a prompt someone wrote once",
    to: "believes a spec is a contract a linter can check",
    next_if_worked: "reads the schema section",
    change: { kind: "belief", text: "a hyperspec is a contract, not a prompt" },
  });
  assert.deepEqual(inputs.conditions.map((c) => c.id), ["r1", "r2", "r3", "r4", "r5"]);
  assert.deepEqual(inputs.conditions[2], {
    id: "r3",
    text: "the draft stays inside its declared length",
    fails_when: "the word count falls outside form.length.min to form.length.max",
  });
  assert.equal(inputs.draft, DRAFT);
});

test("the verdict schema names the shape and the condition ids", () => {
  const w = ready();
  const s = packetOf(w).verdict_schema;
  assert.deepEqual(s.required, ["conditions", "would_take_next_step", "evidence"]);
  const item = s.properties.conditions.items;
  assert.deepEqual(item.required, ["id", "pass", "evidence", "note"]);
  assert.deepEqual(item.properties.id.enum, ["r1", "r2", "r3", "r4", "r5"]);
  assert.equal(item.properties.pass.type, "boolean");
  assert.equal(s.properties.would_take_next_step.type, "boolean");
});

test("the draft in the packet has its BOM stripped", () => {
  const w = workspace({ draft: `﻿${DRAFT}` });
  prepare(w);
  assert.equal(packetOf(w).inputs.draft, DRAFT);
});

test("doctor is skipped, and no packet written, when the goal's check has no rubric", () => {
  const w = workspace();
  const text = readFileSync(w.spec, "utf8");
  const edited = text.replace(
    "      rubric: the doctor grades the draft against every condition; the simulated reader is asked whether it would take the next step now",
    "      station: every condition is graded elsewhere",
  );
  assert.notEqual(edited, text);
  writeFileSync(w.spec, edited);
  const r = prepare(w);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /doctor: skip \(writing\.goal\.check has no rubric\)/);
  assert.ok(!readdirSync(w.out).includes("doctor.packet.json"), "no doctor packet; the other stations still apply");
});

// ---- validation ----------------------------------------------------------------------------------

test("a missing, a duplicated and an unknown condition id are each named; nothing appended", () => {
  const w = ready();
  const { r, j } = recordJson(w, doctorVerdict((v) => {
    v.conditions = v.conditions.filter((c) => c.id !== "r5");
    v.conditions.push({ ...v.conditions[0] });
    v.conditions.push({ id: "r9", pass: true, evidence: "Read the schema section next.", note: "extra" });
  }));
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.equal(j.invalid, true);
  const byId = (id) => j.findings.filter((f) => f.id === id).map((f) => f.message).join(" | ");
  assert.match(byId("judge-doctor-condition-missing"), /r5/);
  assert.match(byId("judge-doctor-condition-duplicate"), /r1/);
  assert.match(byId("judge-doctor-condition-unknown"), /r9/);
  assert.deepEqual(ledgerLines(w.ledger), []);
});

test("pass and would_take_next_step must be JSON booleans", () => {
  const w = ready();
  const { r, j } = recordJson(w, doctorVerdict((v) => { v.conditions[0].pass = "yes"; v.would_take_next_step = 1; }));
  assert.equal(r.status, 1);
  const messages = j.findings.filter((f) => f.id === "judge-verdict-shape").map((f) => f.message).join(" | ");
  assert.match(messages, /conditions\[0\]\.pass/);
  assert.match(messages, /would_take_next_step/);
});

test("a verdict that is not an object, or is missing its fields, is judge-verdict-shape", () => {
  const w = ready();
  let { j } = recordJson(w, [1, 2]);
  assert.deepEqual(ids(j.findings), ["judge-verdict-shape"]);
  ({ j } = recordJson(w, {}));
  const messages = j.findings.map((f) => f.message).join(" | ");
  for (const k of ["conditions", "would_take_next_step", "evidence"]) assert.ok(messages.includes(k), k);
});

test("a failing condition needs a note; a passing one may leave it empty", () => {
  const w = ready();
  let { r } = recordJson(w, doctorVerdict((v) => { v.conditions[0].note = ""; }));
  assert.equal(r.status, 0, r.stdout);
  ({ r } = recordJson(w, doctorVerdict((v) => { v.conditions[0].pass = false; v.conditions[0].note = " "; })));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /conditions\[0\]\.note/);
});

test("evidence that is empty, or not in the draft, makes the verdict invalid; every problem is named", () => {
  const w = ready();
  const { r, j } = recordJson(w, doctorVerdict((v) => {
    v.conditions[1].evidence = "  ";
    v.conditions[3].evidence = "a sentence the draft never says";
    v.evidence = "Read the index next.";
  }));
  assert.equal(r.status, 1);
  assert.deepEqual(ids(j.findings), ["judge-evidence-missing", "judge-evidence-not-found", "judge-evidence-not-found"]);
  assert.match(j.findings[0].message, /conditions\[1\]\.evidence/);
  assert.match(j.findings[1].message, /conditions\[3\]\.evidence/);
  assert.match(j.findings[1].message, /a sentence the draft never says/);
  assert.match(j.findings[2].message, /Read the index next\./);
  assert.deepEqual(ledgerLines(w.ledger), []);
});

test("evidence is found after whitespace and quote-character normalization", () => {
  const w = ready();
  const { r } = recordJson(w, doctorVerdict((v) => {
    // Across the blank line between two paragraphs, with extra spaces.
    v.conditions[0].evidence = "wrote once.   # Evidence  The nine tests";
    // Curly quotes where the draft has straight ones.
    v.conditions[1].evidence = "“Progress” is read from disk.";
  }));
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("evidence is checked against a CRLF draft with a BOM", () => {
  const w = workspace({ draft: `﻿${DRAFT.replace(/\n/g, "\r\n")}` });
  prepare(w);
  const { r } = recordJson(w, doctorVerdict((v) => { v.conditions[0].evidence = "# Claim\n\nA hyperspec is a contract"; }));
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

// ---- findings from a valid verdict --------------------------------------------------------------

test("a failing condition is judge-doctor-condition, naming the id and the judge's note, at the evidence's line", () => {
  const w = ready();
  const { r, j } = recordJson(w, doctorVerdict((v) => {
    v.conditions[1] = { id: "r2", pass: false, evidence: "\"Progress\" is read from disk.", note: "this fact has no ledger entry" };
  }));
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.equal(j.invalid, undefined);
  assert.equal(j.status, "fail");
  assert.deepEqual(ids(j.findings), ["judge-doctor-condition"]);
  const [f] = j.findings;
  assert.equal(f.severity, "fail");
  assert.equal(f.station, "doctor");
  assert.match(f.message, /r2/);
  assert.match(f.message, /this fact has no ledger entry/);
  assert.equal(f.line, 7);
  assert.equal(ledgerLines(w.ledger)[0].status, "fail");
});

test("would_take_next_step false is judge-doctor-next-step, naming the next step", () => {
  const w = ready();
  const { j } = recordJson(w, doctorVerdict((v) => { v.would_take_next_step = false; v.evidence = "# Close Read the schema"; }));
  assert.deepEqual(ids(j.findings), ["judge-doctor-next-step"]);
  assert.match(j.findings[0].message, /reads the schema section/);
  assert.equal(j.findings[0].line, 9);
});

test("the human output prints each finding with its line and fix", () => {
  const w = ready();
  writeVerdict(w.verdict, doctorVerdict((v) => { v.conditions[4].pass = false; v.conditions[4].note = "names nothing"; }));
  const r = record(w);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^doctor: fail$/m);
  assert.match(r.stdout, /fail \[judge-doctor-condition\] .*r5.*names nothing.*\(line 7\)/);
  assert.match(r.stdout, /fix: /);
});

test("doctor alone passes every condition with a willing reader: exit 0", () => {
  const w = ready();
  const { r, j } = recordJson(w, doctorVerdict());
  assert.equal(r.status, 0);
  assert.equal(j.status, "pass");
  assert.deepEqual(j.findings, []);
});

test("--only doctor prepares the doctor packet", () => {
  const w = workspace();
  const r = cli(["judge", "prepare", w.spec, "--draft", w.draft, "--out", w.out, "--only", "doctor"]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(readdirSync(w.out), ["doctor.packet.json"]);
});

test("evidence needs at least three words: \"e\" and \".\" are judge-evidence-too-short", () => {
  const w = ready();
  const { r, j } = recordJson(w, doctorVerdict((v) => {
    for (const c of v.conditions) c.evidence = "e";
    v.evidence = ".";
  }));
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.equal(j.invalid, true);
  assert.deepEqual(ids(j.findings), Array(6).fill("judge-evidence-too-short"));
  assert.match(j.findings[5].message, /^evidence /);
  assert.deepEqual(ledgerLines(w.ledger), []);
});

test("two words are too short; three whole words are enough", () => {
  const w = ready();
  let { j } = recordJson(w, doctorVerdict((v) => { v.evidence = "schema section"; }));
  assert.deepEqual(ids(j.findings), ["judge-evidence-too-short"]);
  ({ j } = recordJson(w, doctorVerdict((v) => { v.evidence = "the schema section"; })));
  assert.deepEqual(j.findings, []);
});

test("evidence must match on word boundaries: a span starting or ending mid-word is not found", () => {
  const w = ready();
  let { j } = recordJson(w, doctorVerdict((v) => { v.evidence = "ead the schema"; }));
  assert.deepEqual(ids(j.findings), ["judge-evidence-not-found"]);
  ({ j } = recordJson(w, doctorVerdict((v) => { v.evidence = "Read the schem"; })));
  assert.deepEqual(ids(j.findings), ["judge-evidence-not-found"]);
});

test("quote folding: curly and angle quotes and apostrophes become straight; primes stay primes", () => {
  assert.equal(normalizeForEvidence("\u201Ca\u201D \u2018b\u2019 \u00ABc\u00BB \u2039d\u203A").norm, "\"a\" 'b' \"c\" 'd'");
  assert.equal(normalizeForEvidence("5\u2032 6\u2033").norm, "5\u2032 6\u2033");
});
