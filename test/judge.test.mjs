// `hyperspec judge prepare` and `judge record`: the framework every judgment station shares
// (packets, the stale check, verdict validation, the evidence rule, the runs ledger), exercised
// through the first station, doctor. The doctor's own inputs, validation and findings are in
// test/judge-doctor.test.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { ROOT, cli, workspace, storyWorkspace, doctorVerdict, writeVerdict, ledgerLines, prepare, record, DRAFT } from "./judge-fixture.mjs";

// ---- prepare -------------------------------------------------------------------------------------

test("prepare writes one packet per applicable station, plus lineup's key, and prints each path", () => {
  const w = workspace();
  const r = prepare(w);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(existsSync(w.packet));
  assert.deepEqual(r.stdout.trim().split("\n").map((l) => l.replace(w.out, "<out>")), [
    "<out>/doctor.packet.json",
    "<out>/lineup.packet.json",
    "<out>/lineup.key.json",
    "<out>/reader.packet.json",
    "<out>/persona.packet.json",
    "attribution: skip (the spec is not fiction; attribution applies only with fiction: true)",
    "knowledge: skip (the spec is not fiction; knowledge applies only with fiction: true)",
  ]);
  assert.deepEqual(readdirSync(w.out).sort(), ["doctor.packet.json", "lineup.key.json", "lineup.packet.json", "persona.packet.json", "reader.packet.json"]);
});

test("a story gets the fiction stations too: attribution with its key, and knowledge", () => {
  const w = storyWorkspace();
  const r = prepare(w);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(r.stdout.trim().split("\n").map((l) => l.replace(w.out, "<out>")), [
    "<out>/doctor.packet.json",
    "<out>/reader.packet.json",
    "<out>/persona.packet.json",
    "<out>/attribution.packet.json",
    "<out>/attribution.key.json",
    "<out>/knowledge.packet.json",
    "lineup: skip (writing.dna.scope_dir is not set)",
  ]);
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
  assert.match(r.stdout, /the draft does not match the hash the packet recorded: it changed since prepare, or the packet was edited/);
  assert.deepEqual(ledgerLines(w.ledger), []);
});

test("a stale refusal has learn record's shape: { invalid, stale } in --json, \"stale packet\" on the terminal", () => {
  const w = workspace();
  prepare(w);
  writeVerdict(w.verdict, doctorVerdict());
  writeFileSync(w.draft, `${DRAFT}\nOne more line.\n`);
  const j = JSON.parse(record(w, "--json").stdout);
  assert.equal(j.ok, false);
  assert.equal(j.invalid, true, "a script testing result.invalid treats judge and learn alike");
  assert.equal(j.stale, true);
  assert.equal(j.findings[0].id, "judge-stale");
  assert.match(record(w).stdout, /^doctor: stale packet, nothing recorded$/m);
  assert.deepEqual(ledgerLines(w.ledger), []);
});

test("a stale verdict names the spec, or both, when those changed", () => {
  const w = workspace();
  prepare(w);
  writeVerdict(w.verdict, doctorVerdict());
  writeFileSync(w.spec, `${readFileSync(w.spec, "utf8")}\nA new closing line.\n`);
  let r = record(w);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /the spec does not match the hash the packet recorded: it changed since prepare, or the packet was edited/);
  writeFileSync(w.draft, `${DRAFT}\nOne more line.\n`);
  r = record(w);
  assert.match(r.stdout, /the spec and the draft do not match the hashes the packet recorded: they changed since prepare, or the packet was edited/);
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
  assert.deepEqual(Object.keys(line), ["at", "kind", "station", "draft", "draft_sha256", "spec_sha256", "packet_sha256", "inputs_sha256", "status", "verdict"]);
  assert.equal(line.kind, "judge");
  assert.equal(line.station, "doctor");
  assert.equal(line.draft, "draft.md", "relative to the spec's folder");
  assert.equal(line.status, "pass");
  assert.equal(line.verdict, "one-shot");
  const packet = JSON.parse(readFileSync(w.packet, "utf8"));
  assert.equal(line.draft_sha256, packet.draft_sha256);
  assert.equal(line.spec_sha256, packet.spec_sha256);
  // The packet's hash is taken with its paths as the ledger writes them; prepared with those paths,
  // it is the file's own hash.
  assert.equal(line.packet_sha256, createHash("sha256").update(`${JSON.stringify({ ...packet, spec: "spec.md", draft: "draft.md" }, null, 2)}\n`).digest("hex"));
  assert.equal(line.inputs_sha256, createHash("sha256").update(JSON.stringify(packet.inputs)).digest("hex"));
});

test("fail then pass on an identical packet is not-improved: only the verdict changed", () => {
  const w = workspace();
  prepare(w);
  writeVerdict(w.verdict, doctorVerdict((v) => { v.would_take_next_step = false; }));
  let r = record(w);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /verdict: not-improved \(failing stations: doctor\)/);
  writeVerdict(w.verdict, doctorVerdict());
  r = record(w);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /verdict: not-improved \(the verdict changed; nothing the judge was shown changed\)/);
  r = record(w);
  assert.match(r.stdout, /verdict: not-improved \(no change since the last passing judgment\)/);
  const lines = ledgerLines(w.ledger);
  assert.deepEqual(lines.map((l) => l.verdict), ["not-improved", "not-improved", "not-improved"]);
  assert.equal(lines[0].reason, "failing stations: doctor");
  assert.equal(lines[1].reason, "the verdict changed; nothing the judge was shown changed");
  assert.equal(lines[2].reason, "no change since the last passing judgment");
});

test("fail, then a revised draft that passes, is improved", () => {
  const w = workspace();
  prepare(w);
  writeVerdict(w.verdict, doctorVerdict((v) => { v.would_take_next_step = false; }));
  record(w);
  writeFileSync(w.draft, `${DRAFT}\nOne more line.\n`);
  prepare(w, "--force");
  writeVerdict(w.verdict, doctorVerdict());
  const r = record(w);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /verdict: improved \(draft changed; stations now pass: doctor\)/);
  assert.equal(ledgerLines(w.ledger)[1].change, "draft changed; stations now pass: doctor");
});

test("draft bytes judged before under another name never earn one-shot", () => {
  const w = workspace();
  prepare(w);
  writeVerdict(w.verdict, doctorVerdict((v) => { v.would_take_next_step = false; }));
  record(w);
  const copy = join(w.dir, "draft2.md");
  writeFileSync(copy, readFileSync(w.draft));
  const w2 = { ...w, draft: copy };
  let r = prepare(w2, "--force");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  writeVerdict(w.verdict, doctorVerdict());
  r = record(w2);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /verdict: not-improved \(these draft bytes were judged before as draft\.md: fail\)/);
  const lines = ledgerLines(w.ledger);
  assert.equal(lines[1].draft, "draft2.md");
  assert.equal(lines[1].verdict, "not-improved");
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
  assert.match(r.stdout, /verdict: not-improved \(no change since the last judgment; still failing: doctor\)/);
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
  assert.match(r.stdout, /verdict: not-improved \(no change since the last passing judgment\)/, "draft.md continues the ./draft.md history, and the path's spelling is no change");
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

test("a packet edited after prepare is judge-packet-altered: zero conditions cannot pass", () => {
  const w = workspace();
  prepare(w);
  const packet = JSON.parse(readFileSync(w.packet, "utf8"));
  packet.inputs.conditions = [];
  writeFileSync(w.packet, `${JSON.stringify(packet, null, 2)}\n`);
  writeVerdict(w.verdict, { conditions: [], would_take_next_step: true, evidence: "Read the schema section next." });
  const r = record(w);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /doctor: invalid verdict, nothing recorded/);
  assert.match(r.stdout, /judge-packet-altered/);
  assert.match(r.stdout, /judge prepare/);
  assert.deepEqual(ledgerLines(w.ledger), []);
});

test("re-hashing a packet to get past the stale check is judge-packet-altered", () => {
  const w = workspace();
  prepare(w);
  writeFileSync(w.draft, `${DRAFT}Buy now today, friends.\n`);
  const packet = JSON.parse(readFileSync(w.packet, "utf8"));
  packet.draft_sha256 = createHash("sha256").update(readFileSync(w.draft)).digest("hex");
  writeFileSync(w.packet, `${JSON.stringify(packet, null, 2)}\n`);
  writeVerdict(w.verdict, doctorVerdict((v) => {
    for (const c of v.conditions) c.evidence = "Buy now today, friends.";
    v.evidence = "Buy now today, friends.";
  }));
  const r = record(w);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /judge-packet-altered/);
  assert.ok(!/judge-stale/.test(r.stdout));
  assert.deepEqual(ledgerLines(w.ledger), []);
});

test("a packet with the same content but different formatting is judge-packet-altered", () => {
  const w = workspace();
  prepare(w);
  writeFileSync(w.packet, JSON.stringify(JSON.parse(readFileSync(w.packet, "utf8"))));
  writeVerdict(w.verdict, doctorVerdict());
  const r = record(w);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /judge-packet-altered/);
});

test("judge lines leave check's verdict history alone: the first full check still has no prior check", () => {
  const w = workspace();
  writeFileSync(join(w.dir, "essay.claims.jsonl"), "");
  prepare(w);
  writeVerdict(w.verdict, doctorVerdict());
  record(w);
  writeVerdict(w.verdict, doctorVerdict((v) => { v.would_take_next_step = false; }));
  record(w);
  let r = cli(["check", w.spec, "--draft", w.draft, "--json"]);
  let j = JSON.parse(r.stdout);
  assert.equal(j.verdict, "not-improved");
  assert.match(j.verdictDetail.reason, /^failing stations: /, "compared with no earlier check");
  r = cli(["check", w.spec, "--draft", w.draft, "--json"]);
  j = JSON.parse(r.stdout);
  assert.match(j.verdictDetail.reason, /^no change since the last check; still failing: /);
});
