// `hyperspec judge prepare` and `judge record`: the framework every judgment station shares
// (packets, the stale check, verdict validation, the evidence rule, the runs ledger), exercised
// through the first station, doctor. The doctor's own inputs, validation and findings are in
// test/judge-doctor.test.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { ROOT, cli, workspace, doctorVerdict, writeVerdict, ledgerLines, prepare, record, DRAFT } from "./judge-fixture.mjs";

// ---- prepare -------------------------------------------------------------------------------------

test("prepare writes one packet per applicable station and prints its path", () => {
  const w = workspace();
  const r = prepare(w);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(existsSync(w.packet));
  assert.match(r.stdout, /doctor\.packet\.json/);
  assert.deepEqual(readdirSync(w.out), ["doctor.packet.json"]);
});

test("the packet is 2-space JSON with a trailing newline and its keys in the fixed order", () => {
  const w = workspace();
  prepare(w);
  const text = readFileSync(w.packet, "utf8");
  assert.ok(text.endsWith("}\n"));
  const p = JSON.parse(text);
  assert.equal(text, `${JSON.stringify(p, null, 2)}\n`);
  assert.deepEqual(Object.keys(p), ["hyperspec_judge", "station", "spec", "spec_sha256", "draft", "draft_sha256", "rubric", "instructions", "inputs", "verdict_schema"]);
  assert.equal(p.hyperspec_judge, "0.1");
  assert.equal(p.spec, w.spec, "the spec path as given");
  assert.equal(p.draft, w.draft, "the draft path as given");
  assert.match(p.spec_sha256, /^[0-9a-f]{64}$/);
  assert.match(p.draft_sha256, /^[0-9a-f]{64}$/);
});

test("the same spec and draft produce byte-identical packets", () => {
  const w = workspace();
  prepare(w);
  const first = readFileSync(w.packet);
  const r = prepare(w, "--force");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(first.equals(readFileSync(w.packet)));
});

test("an existing packet is overwritten only with --force; without it, exit 2 naming the file", () => {
  const w = workspace();
  prepare(w);
  writeFileSync(w.packet, "mine\n");
  const r = prepare(w);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /doctor\.packet\.json/);
  assert.match(r.stderr, /--force/);
  assert.equal(readFileSync(w.packet, "utf8"), "mine\n", "left untouched");
  assert.equal(prepare(w, "--force").status, 0);
  assert.notEqual(readFileSync(w.packet, "utf8"), "mine\n");
});

test("--out must name an existing folder: missing flag, missing folder and a file are exit 2", () => {
  const w = workspace();
  let r = cli(["judge", "prepare", w.spec, "--draft", w.draft]);
  assert.equal(r.status, 2); assert.match(r.stderr, /--out/);
  r = cli(["judge", "prepare", w.spec, "--draft", w.draft, "--out", join(w.dir, "nope")]);
  assert.equal(r.status, 2); assert.match(r.stderr, /does not exist/);
  r = cli(["judge", "prepare", w.spec, "--draft", w.draft, "--out", w.draft]);
  assert.equal(r.status, 2); assert.match(r.stderr, /not a folder/);
});

test("prepare usage: no spec, no --draft, an unreadable draft, an unknown --only name", () => {
  const w = workspace();
  let r = cli(["judge", "prepare"]);
  assert.equal(r.status, 2); assert.match(r.stderr, /needs a spec path/);
  r = cli(["judge", "prepare", w.spec, "--out", w.out]);
  assert.equal(r.status, 2); assert.match(r.stderr, /--draft/);
  r = cli(["judge", "prepare", w.spec, "--draft", join(w.dir, "missing.md"), "--out", w.out]);
  assert.equal(r.status, 2); assert.match(r.stderr, /cannot read draft/);
  r = prepare(w, "--only", "doctor,nope");
  assert.equal(r.status, 2); assert.match(r.stderr, /unknown judge: nope/); assert.match(r.stderr, /known judges: doctor/);
  assert.deepEqual(readdirSync(w.out), []);
});

test("prepare refuses a spec without the writing profile (exit 2)", () => {
  const w = workspace();
  const r = cli(["judge", "prepare", join(ROOT, "examples", "minimal.hyperspec.md"), "--draft", w.draft, "--out", w.out]);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /judge prepare needs a writing spec/);
});

test("prepare refuses a spec that does not lint clean, with lint's code, and writes nothing", () => {
  const w = workspace();
  const text = readFileSync(w.spec, "utf8");
  const broken = text.replace("rejects:\n  - hype words about AI\n  - a claim with no material behind it\n", "");
  assert.notEqual(broken, text);
  writeFileSync(w.spec, broken);
  const r = prepare(w);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /fail \(8\/9\)/);
  assert.match(r.stdout, /no packets written/);
  assert.deepEqual(readdirSync(w.out), []);
});

test("an unknown judge subcommand is exit 2", () => {
  const r = cli(["judge", "grade"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown judge subcommand: grade/);
});

// ---- record: usage and staleness ---------------------------------------------------------------

test("record usage: no packet, no --verdict, a missing packet, a missing verdict, a file that is not a packet", () => {
  const w = workspace();
  prepare(w);
  writeVerdict(w.verdict, doctorVerdict());
  let r = cli(["judge", "record"]);
  assert.equal(r.status, 2); assert.match(r.stderr, /needs a packet path/);
  r = cli(["judge", "record", w.packet]);
  assert.equal(r.status, 2); assert.match(r.stderr, /--verdict/);
  r = cli(["judge", "record", join(w.out, "missing.packet.json"), "--verdict", w.verdict]);
  assert.equal(r.status, 2); assert.match(r.stderr, /cannot read packet/);
  r = cli(["judge", "record", w.packet, "--verdict", join(w.dir, "missing.json")]);
  assert.equal(r.status, 2); assert.match(r.stderr, /cannot read verdict/);
  r = cli(["judge", "record", w.spec, "--verdict", w.verdict]);
  assert.equal(r.status, 2); assert.match(r.stderr, /not a hyperspec judge packet/);
  assert.deepEqual(ledgerLines(w.ledger), []);
});

test("a verdict for a draft that changed since the packet is stale: exit 1, names the draft, nothing appended", () => {
  const w = workspace();
  prepare(w);
  writeVerdict(w.verdict, doctorVerdict());
  writeFileSync(w.draft, `${DRAFT}\nOne more line.\n`);
  const r = record(w);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /judge-stale/);
  assert.match(r.stdout, /the draft changed since the packet was prepared/);
  assert.deepEqual(ledgerLines(w.ledger), []);
});

test("a stale verdict names the spec, or both, when those changed", () => {
  const w = workspace();
  prepare(w);
  writeVerdict(w.verdict, doctorVerdict());
  writeFileSync(w.spec, `${readFileSync(w.spec, "utf8")}\nA new closing line.\n`);
  let r = record(w);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /the spec changed since the packet was prepared/);
  writeFileSync(w.draft, `${DRAFT}\nOne more line.\n`);
  r = record(w);
  assert.match(r.stdout, /the spec and the draft changed since the packet was prepared/);
  assert.deepEqual(ledgerLines(w.ledger), []);
});

test("a verdict that is not JSON is invalid: exit 1, judge-verdict-not-json, nothing appended", () => {
  const w = workspace();
  prepare(w);
  writeVerdict(w.verdict, "{ conditions: nope");
  const r = record(w);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /doctor: invalid verdict, nothing recorded/);
  assert.match(r.stdout, /judge-verdict-not-json/);
  assert.deepEqual(ledgerLines(w.ledger), []);
});

// ---- record: the ledger ------------------------------------------------------------------------

test("a passing verdict: exit 0, one judge line, one-shot", () => {
  const w = workspace();
  prepare(w);
  writeVerdict(w.verdict, doctorVerdict());
  const r = record(w);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^doctor: pass$/m);
  assert.match(r.stdout, /^verdict: one-shot$/m);
  const [line, ...rest] = ledgerLines(w.ledger);
  assert.equal(rest.length, 0);
  assert.deepEqual(Object.keys(line), ["at", "kind", "station", "draft", "draft_sha256", "spec_sha256", "status", "verdict"]);
  assert.equal(line.kind, "judge");
  assert.equal(line.station, "doctor");
  assert.equal(line.draft, "draft.md", "relative to the spec's folder");
  assert.equal(line.status, "pass");
  assert.equal(line.verdict, "one-shot");
  const packet = JSON.parse(readFileSync(w.packet, "utf8"));
  assert.equal(line.draft_sha256, packet.draft_sha256);
  assert.equal(line.spec_sha256, packet.spec_sha256);
});

test("fail then pass on the same draft is improved; pass again with nothing changed is not-improved", () => {
  const w = workspace();
  prepare(w);
  writeVerdict(w.verdict, doctorVerdict((v) => { v.would_take_next_step = false; }));
  let r = record(w);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /verdict: not-improved \(failing stations: doctor\)/);
  writeVerdict(w.verdict, doctorVerdict());
  r = record(w);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /verdict: improved \(stations now pass: doctor\)/);
  r = record(w);
  assert.match(r.stdout, /verdict: not-improved \(no change since the last passing check\)/);
  const lines = ledgerLines(w.ledger);
  assert.deepEqual(lines.map((l) => l.verdict), ["not-improved", "improved", "not-improved"]);
  assert.equal(lines[0].reason, "failing stations: doctor");
  assert.equal(lines[1].change, "stations now pass: doctor");
  assert.equal(lines[2].reason, "no change since the last passing check");
});

test("a changed draft, re-prepared and passing again, says the draft changed", () => {
  const w = workspace();
  prepare(w);
  writeVerdict(w.verdict, doctorVerdict());
  record(w);
  writeFileSync(w.draft, `${DRAFT}\nOne more line.\n`);
  prepare(w, "--force");
  const r = record(w);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /verdict: not-improved \(draft changed; every station still passes\)/);
});

test("failing twice with nothing changed says still failing", () => {
  const w = workspace();
  prepare(w);
  writeVerdict(w.verdict, doctorVerdict((v) => { v.would_take_next_step = false; }));
  record(w);
  const r = record(w);
  assert.match(r.stdout, /verdict: not-improved \(no change since the last check; still failing: doctor\)/);
});

test("judge history is its own: a check line for the same draft does not change the first judgment's verdict", () => {
  const w = workspace();
  writeFileSync(join(w.dir, "essay.claims.jsonl"), "");
  cli(["check", w.spec, "--draft", w.draft]);
  assert.equal(ledgerLines(w.ledger).length, 1);
  prepare(w);
  writeVerdict(w.verdict, doctorVerdict());
  const r = record(w);
  assert.match(r.stdout, /verdict: one-shot/);
});

test("relative paths: the packet keeps them as given, and ./draft.md and draft.md are one history", () => {
  const w = workspace();
  let r = cli(["judge", "prepare", "spec.md", "--draft", "./draft.md", "--out", "judge"], { cwd: w.dir });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^judge\/doctor\.packet\.json$/m);
  const packet = JSON.parse(readFileSync(w.packet, "utf8"));
  assert.equal(packet.spec, "spec.md");
  assert.equal(packet.draft, "./draft.md");
  writeVerdict(w.verdict, doctorVerdict());
  r = cli(["judge", "record", "judge/doctor.packet.json", "--verdict", "doctor.verdict.json"], { cwd: w.dir });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  r = cli(["judge", "prepare", "spec.md", "--draft", "draft.md", "--out", "judge", "--force"], { cwd: w.dir });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  r = cli(["judge", "record", "judge/doctor.packet.json", "--verdict", "doctor.verdict.json"], { cwd: w.dir });
  assert.match(r.stdout, /no change since the last passing check/, "draft.md continues the ./draft.md history");
  assert.ok(!readFileSync(w.ledger, "utf8").includes(w.dir), "no absolute path in the ledger");
});

test("relative paths in a packet resolve against the working folder: recorded from elsewhere, exit 2 naming the spec", () => {
  const w = workspace();
  cli(["judge", "prepare", "spec.md", "--draft", "draft.md", "--out", "judge"], { cwd: w.dir });
  writeVerdict(w.verdict, doctorVerdict());
  const r = cli(["judge", "record", w.packet, "--verdict", w.verdict], { cwd: w.out });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /the packet's spec: cannot read spec\.md/);
  assert.deepEqual(ledgerLines(w.ledger), []);
});

test("--json prints the whole result: station, status, findings and the ledger verdict", () => {
  const w = workspace();
  prepare(w);
  writeVerdict(w.verdict, doctorVerdict());
  const r = record(w, "--json");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.station, "doctor");
  assert.equal(j.status, "pass");
  assert.deepEqual(j.findings, []);
  assert.equal(j.verdict, "one-shot");
  assert.equal(j.ledgerPath, "runs.jsonl");
});

test("--json on a usage error prints { packet, verdict, error } and exits 2", () => {
  const w = workspace();
  const r = cli(["judge", "record", join(w.out, "missing.packet.json"), "--verdict", w.verdict, "--json"]);
  assert.equal(r.status, 2);
  const j = JSON.parse(r.stdout);
  assert.match(j.error, /cannot read packet/);
});

test("the spec still lints 9/9 after many judge lines", () => {
  const w = workspace();
  prepare(w);
  for (let i = 0; i < 12; i++) {
    writeVerdict(w.verdict, doctorVerdict((v) => { v.would_take_next_step = i % 2 === 0; }));
    record(w);
  }
  assert.equal(ledgerLines(w.ledger).length, 12);
  const r = cli(["lint", w.spec]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /pass \(9\/9\)/);
});

test("a ledger that leads outside the spec's folder is not written, and record says so", () => {
  const w = workspace();
  prepare(w);
  writeVerdict(w.verdict, doctorVerdict());
  // Lint would refuse this spec, so the packet is prepared first and the spec's ledger edited
  // after; the spec's hash then changes, so the packet is re-pointed at the edited spec's bytes.
  writeFileSync(w.spec, readFileSync(w.spec, "utf8").replace("ledger: runs.jsonl", "ledger: ../outside.jsonl"));
  const packet = JSON.parse(readFileSync(w.packet, "utf8"));
  packet.spec_sha256 = createHash("sha256").update(readFileSync(w.spec)).digest("hex");
  writeFileSync(w.packet, `${JSON.stringify(packet, null, 2)}\n`);
  const r = record(w);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /warn: improvement\.ledger escapes the spec's directory; not appended/);
  assert.ok(!existsSync(join(w.dir, "..", "outside.jsonl")));
});
