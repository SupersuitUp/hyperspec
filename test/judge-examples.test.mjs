import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tempDir } from "./tmp.mjs";
import { JUDGE_NAMES } from "../src/judges/index.mjs";

// The worked examples ship what `judge prepare` and `learn prepare` write for their drafts, and one
// sample verdict per packet, filled in by hand. These tests keep all of it true: every committed
// packet is exactly what prepare writes now, no answer key is committed anywhere, and every sample
// verdict records, on a fresh copy, with the status the docs describe.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BIN = join(ROOT, "bin", "hyperspec.mjs");
const BASE = join(ROOT, "examples", "writing");
const cli = (args, cwd) => spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: "utf8" });

// What each sample verdict records. A station missing here fails the test below that pairs every
// committed packet with a sample, so a new packet cannot ship without its expected status.
const EXAMPLES = {
  essay: { spec: "essay.hyperspec.md", draft: "essay/draft.md", status: { doctor: "fail", lineup: "fail", reader: "pass", persona: "pass" } },
  story: { spec: "story.hyperspec.md", draft: "story/draft.md", status: { doctor: "pass", reader: "pass", persona: "fail", attribution: "pass", knowledge: "pass" } },
};

const copy = (prefix) => {
  const d = tempDir(prefix);
  cpSync(BASE, d, { recursive: true });
  return d;
};
const files = (dir) => readdirSync(dir).filter((f) => statSync(join(dir, f)).isFile()).sort();
const ledger = (d, name) => readFileSync(join(d, name, "runs.jsonl"), "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));

for (const [name, ex] of Object.entries(EXAMPLES)) {
  test(`${name}: the committed packets are exactly what judge prepare writes for the shipped draft`, () => {
    const d = copy(`hs-judge-ex-${name}-`);
    const out = join(d, name, "judge");
    rmSync(out, { recursive: true });
    mkdirSync(out);
    const r = cli(["judge", "prepare", ex.spec, "--draft", ex.draft, "--out", `${name}/judge`], d);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const committed = files(join(BASE, name, "judge"));
    assert.deepEqual(committed, Object.keys(ex.status).map((s) => `${s}.packet.json`).sort());
    for (const f of committed) assert.equal(readFileSync(join(out, f), "utf8"), readFileSync(join(BASE, name, "judge", f), "utf8"), f);
    // prepare also writes answer keys; they are never committed beside the packets.
    const written = files(out);
    assert.deepEqual(written.filter((f) => !f.endsWith(".key.json")), committed);
    for (const s of JUDGE_NAMES) if (!ex.status[s]) assert.ok(r.stdout.includes(`${s}: skip (`), `${name}: ${s} skips`);
  });

  test(`${name}: every sample verdict is marked as a sample and pairs with a committed packet`, () => {
    const samples = files(join(BASE, name, "sample-verdicts")).filter((f) => f !== "learn.verdict.json");
    assert.deepEqual(samples, Object.keys(ex.status).map((s) => `${s}.verdict.json`).sort());
    for (const f of files(join(BASE, name, "sample-verdicts"))) {
      const v = JSON.parse(readFileSync(join(BASE, name, "sample-verdicts", f), "utf8"));
      assert.match(v.sample, /^A sample judgment for the worked example, filled in by hand/, `${f} says it is a sample`);
    }
  });

  test(`${name}: each sample verdict records on a fresh copy with its documented status`, () => {
    const d = copy(`hs-judge-ex-rec-${name}-`);
    for (const [station, status] of Object.entries(ex.status)) {
      const r = cli(["judge", "record", `${name}/judge/${station}.packet.json`, "--verdict", `${name}/sample-verdicts/${station}.verdict.json`, "--json"], d);
      const result = JSON.parse(r.stdout);
      assert.equal(result.ok, true, `${station}: ${r.stdout}`);
      assert.equal(result.status, status, station);
      assert.equal(r.status, status === "pass" ? 0 : 1, station);
    }
    const lines = ledger(d, name);
    assert.deepEqual(lines.map((l) => [l.kind, l.station, l.status]), Object.entries(ex.status).map(([s, st]) => ["judge", s, st]));
    // The spec still lints 9/9 with the judge lines in its ledger.
    const lint = cli(["lint", ex.spec], d);
    assert.equal(lint.status, 0, lint.stdout + lint.stderr);
  });
}

test("no answer key is committed anywhere in the examples", () => {
  const all = readdirSync(join(ROOT, "examples"), { recursive: true }).map(String);
  assert.deepEqual(all.filter((f) => f.endsWith(".key.json")), []);
});

test("the story's attribution sample names every line right, and the essay's lineup sample picks the draft", () => {
  const d = copy("hs-judge-ex-detail-");
  const attr = JSON.parse(cli(["judge", "record", "story/judge/attribution.packet.json", "--verdict", "story/sample-verdicts/attribution.verdict.json", "--json"], d).stdout);
  assert.equal(attr.summary, "accuracy per speaker: ines 10/10 (100%), theo 9/9 (100%); mean 100%, passing at 80%; 17 dialogue lines left out (8 repeating a golden or rejected line, 9 with no speech tag)");
  const lineup = JSON.parse(cli(["judge", "record", "essay/judge/lineup.packet.json", "--verdict", "essay/sample-verdicts/lineup.verdict.json", "--json"], d).stdout);
  assert.deepEqual(lineup.findings.map((f) => f.id), ["judge-lineup-picked"]);
  const doctor = JSON.parse(cli(["judge", "record", "essay/judge/doctor.packet.json", "--verdict", "essay/sample-verdicts/doctor.verdict.json", "--json"], d).stdout);
  assert.deepEqual(doctor.findings.map((f) => f.id), ["judge-doctor-next-step"]);
  const persona = JSON.parse(cli(["judge", "record", "story/judge/persona.packet.json", "--verdict", "story/sample-verdicts/persona.verdict.json", "--json"], d).stdout);
  assert.deepEqual(persona.findings.map((f) => f.id), ["judge-persona-break", "judge-persona-break", "judge-persona-break"]);
  const reader = JSON.parse(cli(["judge", "record", "story/judge/reader.packet.json", "--verdict", "story/sample-verdicts/reader.verdict.json", "--json"], d).stdout);
  assert.deepEqual(reader.findings.map((f) => [f.id, f.severity]), [["judge-reader-lost", "warn"], ["judge-reader-lost", "warn"]]);
});

// ---- learn --------------------------------------------------------------------------------------

test("essay: the committed learn packet is exactly what learn prepare writes for the first and approved drafts", () => {
  const d = copy("hs-learn-ex-");
  rmSync(join(d, "essay", "learn", "learn.packet.json"));
  const r = cli(["learn", "prepare", "essay.hyperspec.md", "--first", "essay/learn/first-draft.md", "--approved", "essay/draft.md", "--out", "essay/learn"], d);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout, "essay/learn/learn.packet.json\n5 edits over 8 sentences: 3 replaced, 2 deleted\n");
  assert.equal(readFileSync(join(d, "essay", "learn", "learn.packet.json"), "utf8"), readFileSync(join(BASE, "essay", "learn", "learn.packet.json"), "utf8"));
  assert.deepEqual(files(join(BASE, "essay", "learn")), ["first-draft.md", "learn.packet.json"]);
});

test("essay: the sample learn verdict records the tally and suggests the dna move", () => {
  const d = copy("hs-learn-ex-rec-");
  const r = cli(["learn", "record", "essay/learn/learn.packet.json", "--verdict", "essay/sample-verdicts/learn.verdict.json", "--json"], d);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const result = JSON.parse(r.stdout);
  assert.deepEqual(result.tally, {
    dna: { edits: 2, sentences: 4 },
    materials: { edits: 1, sentences: 2 },
    persona: { edits: 1, sentences: 1 },
    none: { edits: 1, sentences: 1 },
  });
  assert.deepEqual(result.suggestion, { block: "dna", edits: 2, sentences: 4, move: "add a golden or a style rule" });
  assert.equal(result.next, "dna, 4 of 8 sentences (2 of 5 edits): add a golden or a style rule");
  const [line] = ledger(d, "essay");
  assert.equal(line.kind, "learn");
  assert.equal(line.verdict, "not-improved");
  assert.deepEqual(line.tally, result.tally);
  assert.equal(line.first, "essay/learn/first-draft.md");
  const lint = cli(["lint", "essay.hyperspec.md"], d);
  assert.equal(lint.status, 0, lint.stdout + lint.stderr);
  assert.ok(!existsSync(join(BASE, "essay", "learn", "runs.jsonl")));
});
