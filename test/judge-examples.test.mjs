import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tempDir } from "./tmp.mjs";
import { JUDGE_NAMES } from "../src/judges/index.mjs";
import { lineupSeed, seededShuffle } from "../src/judges/lineup.mjs";
import { writeFileSync, appendFileSync } from "node:fs";

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
// The panel writes one packet per reader, panel-<reader>, and every one of them passes: the panel
// never fails a draft, it hands its findings to triage.
const PANEL = { "panel-skeptic": "pass", "panel-novice": "pass", "panel-expert": "pass", "panel-buyer": "pass" };
const EXAMPLES = {
  essay: { spec: "essay.hyperspec.md", draft: "essay/draft.md", status: { doctor: "pass", lineup: "fail", reader: "pass", persona: "pass", ...PANEL } },
  story: { spec: "story.hyperspec.md", draft: "story/draft.md", status: { doctor: "pass", reader: "pass", persona: "fail", attribution: "pass", knowledge: "pass", ...PANEL } },
};
// The station (and reader) a packet name stands for, as the ledger writes them.
const ledgerName = (l) => (l.reader ? `${l.station}-${l.reader}` : l.station);

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
    for (const s of JUDGE_NAMES) if (!Object.keys(ex.status).some((k) => k === s || k.startsWith(`${s}-`))) assert.ok(r.stdout.includes(`${s}: skip (`), `${name}: ${s} skips`);
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
    assert.deepEqual(lines.map((l) => [l.kind, ledgerName(l), l.status]), Object.entries(ex.status).map(([s, st]) => ["judge", s, st]));
    // The spec still lints 9/9 with the judge lines in its ledger.
    const lint = cli(["lint", ex.spec], d);
    assert.equal(lint.status, 0, lint.stdout + lint.stderr);
  });
}

test("no answer key is committed anywhere in the examples", () => {
  const all = readdirSync(join(ROOT, "examples"), { recursive: true }).map(String);
  assert.deepEqual(all.filter((f) => f.endsWith(".key.json")), []);
});

test("the story's attribution sample names every line right, the essay's lineup sample picks the draft, and the essay's doctor passes", () => {
  const d = copy("hs-judge-ex-detail-");
  const attr = JSON.parse(cli(["judge", "record", "story/judge/attribution.packet.json", "--verdict", "story/sample-verdicts/attribution.verdict.json", "--json"], d).stdout);
  assert.equal(attr.summary, "accuracy per speaker: ines 10/10 (100%), theo 9/9 (100%); mean 100%, passing at 80%; 17 dialogue lines left out (8 repeating a golden or rejected line, 9 with no speech tag)");
  const lineup = JSON.parse(cli(["judge", "record", "essay/judge/lineup.packet.json", "--verdict", "essay/sample-verdicts/lineup.verdict.json", "--json"], d).stdout);
  assert.deepEqual(lineup.findings.map((f) => f.id), ["judge-lineup-picked"]);
  const doctor = JSON.parse(cli(["judge", "record", "essay/judge/doctor.packet.json", "--verdict", "essay/sample-verdicts/doctor.verdict.json", "--json"], d).stdout);
  assert.deepEqual([doctor.status, doctor.findings], ["pass", []], "the essay's goal asks for the card its draft ends on");
  const persona = JSON.parse(cli(["judge", "record", "story/judge/persona.packet.json", "--verdict", "story/sample-verdicts/persona.verdict.json", "--json"], d).stdout);
  assert.deepEqual(persona.findings.map((f) => f.id), ["judge-persona-break", "judge-persona-break", "judge-persona-break"]);
  const reader = JSON.parse(cli(["judge", "record", "story/judge/reader.packet.json", "--verdict", "story/sample-verdicts/reader.verdict.json", "--json"], d).stdout);
  assert.deepEqual(reader.findings.map((f) => [f.id, f.severity]), [["judge-reader-lost", "warn"], ["judge-reader-lost", "warn"]]);
});

// ---- the lineup's answer is not in its packet -------------------------------------------------------

test("essay: the lineup's labels come from the draft's text, and rerunning the shuffle from the packet's own hash gives a wrong answer", () => {
  const d = copy("hs-judge-ex-seed-");
  const draftText = readFileSync(join(d, "essay", "draft.md"), "utf8");
  assert.equal(lineupSeed(draftText), "e7539fd6cafd810316a24d95d8a57c3c2d0c1990a4d94e6d5391dd3a6fde5200");
  assert.equal(cli(["judge", "prepare", "essay.hyperspec.md", "--draft", "essay/draft.md", "--out", "essay/judge", "--only", "lineup", "--force"], d).status, 0);
  const key = JSON.parse(readFileSync(join(d, "essay", "judge", "lineup.key.json"), "utf8"));
  const packet = JSON.parse(readFileSync(join(BASE, "essay", "judge", "lineup.packet.json"), "utf8"));
  assert.equal(key.draft_label, "D");
  // The attack a judge that can run code would try: the pool is the goldens then the draft, so the
  // draft is the last index; shuffle the indexes with the hash the packet carries.
  const n = packet.inputs.candidates.length;
  const fromPacket = ["A", "B", "C", "D"][seededShuffle([...Array(n).keys()], packet.draft_sha256).indexOf(n - 1)];
  assert.equal(fromPacket, "B");
  assert.notEqual(fromPacket, key.draft_label);
  assert.equal(["A", "B", "C", "D"][seededShuffle([...Array(n).keys()], lineupSeed(draftText)).indexOf(n - 1)], key.draft_label, "only the draft's text gives the order");
  assert.equal(JSON.parse(readFileSync(join(BASE, "essay", "sample-verdicts", "lineup.verdict.json"), "utf8")).pick, "D", "the sample picks the draft's label");
});

// ---- a judge line names what the judge was shown that changed ---------------------------------------

const recordJson = (d, packet, verdict) => {
  const r = cli(["judge", "record", packet, "--verdict", verdict, "--json"], d);
  return { r, j: JSON.parse(r.stdout) };
};

test("essay: a lineup that failed, re-judged after a golden is added, is improved, naming the DNA scope", () => {
  const d = copy("hs-judge-ex-golden-");
  let { j } = recordJson(d, "essay/judge/lineup.packet.json", "essay/sample-verdicts/lineup.verdict.json");
  assert.equal(j.status, "fail");
  // The fix the finding and learn's dna move both name: add a golden that covers this kind of passage.
  writeFileSync(join(d, "dna", "essay-new-managers-teach", "goldens", "a-survey.md"), [
    "---",
    "why: a passage that rests on a figure, in this writer's voice",
    "approved_by: example-author",
    "source: an earlier newsletter essay for new managers by the same writer",
    "approved_on: \"2026-09-29\"",
    "---",
    "",
    "Ask the people who report to you and the count comes back plain. Most of them said the meeting was about the work, not about them. That is the number to beat.",
    "",
  ].join("\n"));
  assert.equal(cli(["dna", "measure", "dna/essay-new-managers-teach"], d).status, 0);
  assert.equal(cli(["lint", "essay.hyperspec.md"], d).status, 0);
  // The old packet is stale now, and says what it reads.
  ({ j } = recordJson(d, "essay/judge/lineup.packet.json", "essay/sample-verdicts/lineup.verdict.json"));
  assert.equal(j.stale, true);
  assert.match(j.findings[0].message, /the DNA scope \(dna\/essay-new-managers-teach: scope\.md and goldens\) changed since the packet was prepared/);
  assert.equal(cli(["judge", "prepare", "essay.hyperspec.md", "--draft", "essay/draft.md", "--out", "essay/judge", "--only", "lineup", "--force"], d).status, 0);
  const key = JSON.parse(readFileSync(join(d, "essay", "judge", "lineup.key.json"), "utf8"));
  const golden = key.candidates.find((c) => c.source !== "draft").label;
  writeFileSync(join(d, "pass.verdict.json"), JSON.stringify({ pick: golden, confidence: 0.3, reason: "a guess between two that sound alike" }));
  ({ j } = recordJson(d, "essay/judge/lineup.packet.json", "pass.verdict.json"));
  assert.equal(j.status, "pass");
  assert.equal(j.verdict, "improved");
  assert.equal(j.verdictDetail.change, "the DNA scope (dna/essay-new-managers-teach: scope.md and goldens) changed; stations now pass: lineup");
  const lines = ledger(d, "essay").filter((l) => l.station === "lineup");
  assert.notEqual(lines[0].packet_sha256, lines[1].packet_sha256);
  assert.notEqual(lines[0].inputs_sha256, lines[1].inputs_sha256);
  assert.equal(lines[0].draft_sha256, lines[1].draft_sha256);
  assert.equal(lines[0].spec_sha256, lines[1].spec_sha256);
  // Recorded again on the same packet, a different answer is the judge, not the work.
  writeFileSync(join(d, "fail.verdict.json"), JSON.stringify({ pick: key.draft_label, confidence: 0.6, reason: "the survey figure" }));
  recordJson(d, "essay/judge/lineup.packet.json", "fail.verdict.json");
  ({ j } = recordJson(d, "essay/judge/lineup.packet.json", "pass.verdict.json"));
  assert.equal(j.verdict, "not-improved");
  assert.equal(j.verdictDetail.reason, "the verdict changed; nothing the judge was shown changed");
});

test("essay: after a release rewords a station's instructions, the improved line says the packet's fixed text changed, not the DNA scope", () => {
  const d = copy("hs-judge-ex-reworded-");
  let { j } = recordJson(d, "essay/judge/lineup.packet.json", "essay/sample-verdicts/lineup.verdict.json");
  assert.equal(j.status, "fail");
  // A later hyperspec whose lineup instructions differ by one word, the DNA scope untouched.
  const next = tempDir("hs-judge-next-release-");
  for (const f of ["bin", "src", "package.json"]) cpSync(join(ROOT, f), join(next, f), { recursive: true });
  symlinkSync(join(ROOT, "node_modules"), join(next, "node_modules"), "dir");
  const lineupSrc = join(next, "src", "judges", "lineup.mjs");
  const before = readFileSync(lineupSrc, "utf8");
  const after = before.replace("judging by voice alone", "judging by the voice alone");
  assert.notEqual(after, before);
  writeFileSync(lineupSrc, after);
  const nextCli = (args) => spawnSync(process.execPath, [join(next, "bin", "hyperspec.mjs"), ...args], { cwd: d, encoding: "utf8" });
  assert.equal(nextCli(["judge", "prepare", "essay.hyperspec.md", "--draft", "essay/draft.md", "--out", "essay/judge", "--only", "lineup", "--force"]).status, 0);
  const key = JSON.parse(readFileSync(join(d, "essay", "judge", "lineup.key.json"), "utf8"));
  writeFileSync(join(d, "pass.verdict.json"), JSON.stringify({ pick: key.candidates.find((c) => c.source !== "draft").label, confidence: 0.3, reason: "a guess" }));
  j = JSON.parse(nextCli(["judge", "record", "essay/judge/lineup.packet.json", "--verdict", "pass.verdict.json", "--json"]).stdout);
  assert.equal(j.verdict, "improved");
  assert.equal(j.verdictDetail.change, "the packet's fixed text (hyperspec's instructions or format) changed; stations now pass: lineup");
  const lines = ledger(d, "essay").filter((l) => l.station === "lineup");
  assert.equal(lines[0].inputs_sha256, lines[1].inputs_sha256);
  assert.notEqual(lines[0].packet_sha256, lines[1].packet_sha256);
});

test("story: a persona that failed, re-judged after the missing claims are added, is improved, naming the claims ledger", () => {
  const d = copy("hs-judge-ex-claims-");
  let { j } = recordJson(d, "story/judge/persona.packet.json", "story/sample-verdicts/persona.verdict.json");
  assert.equal(j.status, "fail");
  // The fix the finding names: add each unsourced process detail to the claims ledger.
  for (const text of ["The deck oven takes the better part of an hour to heat.", "Rolls come out at sixteen minutes.", "The starter is fed equal weights of flour and water."]) {
    appendFileSync(join(d, "story", "claims.jsonl"), `${JSON.stringify({ text, source: "bakery-visit#s10", span: "Flour is weighed, never scooped." })}\n`);
  }
  assert.equal(cli(["judge", "prepare", "story.hyperspec.md", "--draft", "story/draft.md", "--out", "story/judge", "--only", "persona", "--force"], d).status, 0);
  writeFileSync(join(d, "pass.verdict.json"), JSON.stringify({ breaks: [] }));
  ({ j } = recordJson(d, "story/judge/persona.packet.json", "pass.verdict.json"));
  assert.equal(j.status, "pass");
  assert.equal(j.verdict, "improved");
  assert.equal(j.verdictDetail.change, "the claims ledger (story/claims.jsonl) changed; stations now pass: persona");
  // Passing again on the same packet: nothing changed, in a judge line's own words.
  ({ j } = recordJson(d, "story/judge/persona.packet.json", "pass.verdict.json"));
  assert.equal(j.verdictDetail.reason, "no change since the last passing judgment");
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
