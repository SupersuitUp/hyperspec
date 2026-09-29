import { test } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { run, compareFeatures } from "../src/stations/dna.mjs";
import { workspace, draftOf, crlf, cli } from "./station-fixture.mjs";

// The fixture's scope has two one-sentence goldens; a draft made of exactly those two passages
// measures to exactly the scope's recorded features, so it sits inside every band.
const OPENING = "A hyperspec is a contract a linter can check, not a prompt you hope holds.";
const CLOSING = "A hyperspec is a contract you can check today, and a contract you can keep tomorrow.";
const IN_SCOPE = `${OPENING}\n\n${CLOSING}\n`;
// The same, plus one em dash and one word: every compared feature stays in its band except the em
// dash rate, which the scope has at 0.
const WITH_EM_DASH = `A hyperspec is a contract a linter can check, not a prompt you hope holds \u2014 always.\n\n${CLOSING}\n`;

const setup = () => workspace(null, "hs-dna-");

test("no writing.dna.scope_dir: skip, with the reason", () => {
  const { spec } = setup();
  delete spec.data.writing.dna.scope_dir;
  const r = run(spec, draftOf(IN_SCOPE));
  assert.equal(r.station, "dna");
  assert.equal(r.status, "skip");
  assert.match(r.reason, /writing\.dna\.scope_dir is not set/);
});

test("a missing features.json: skip, naming the scope as written and the fix, never an absolute path", () => {
  const { spec, dir } = setup();
  rmSync(join(dir, "dna-scope", "features.json"));
  const r = run(spec, draftOf(IN_SCOPE));
  assert.equal(r.status, "skip");
  assert.match(r.reason, /"dna-scope" has no features\.json/);
  assert.match(r.reason, /hyperspec dna measure dna-scope/);
  assert.ok(!r.reason.includes(dir), r.reason);
});

test("a stale features.json (a golden changed since it was measured): skip, saying what changed", () => {
  const { spec, dir } = setup();
  appendFileSync(join(dir, "dna-scope", "goldens", "opening.md"), "\nOne more sentence here.\n");
  const r = run(spec, draftOf(IN_SCOPE));
  assert.equal(r.status, "skip");
  assert.match(r.reason, /features\.json is stale: changed goldens\/opening\.md/);
  assert.ok(!r.reason.includes(dir), r.reason);
});

test("a draft that measures like the scope's goldens passes", () => {
  const { spec } = setup();
  const r = run(spec, draftOf(IN_SCOPE));
  assert.equal(r.status, "pass", JSON.stringify(r.findings));
  assert.deepEqual(r.findings, []);
});

test("a draft far from the scope fails with one drift finding per feature, each carrying both values", () => {
  const { spec } = setup();
  const long = Array.from({ length: 60 }, (_, i) => `w${i}`).join(" ");
  const r = run(spec, draftOf(`${long}.\n`));
  assert.equal(r.status, "fail");
  assert.ok(r.findings.every((f) => f.id === "station-dna-drift" && f.station === "dna" && f.severity === "fail"));
  const sentence = r.findings.find((f) => /sentence_length\.mean/.test(f.message));
  assert.ok(sentence, JSON.stringify(r.findings));
  assert.match(sentence.message, /60/);
  assert.match(sentence.message, /15\.5/);
  assert.match(sentence.message, /10\.333 to 23\.25/);
});

test("an em dash in a draft whose scope never uses one is station-dna-em-dash, not also a drift", () => {
  const { spec } = setup();
  const r = run(spec, draftOf(WITH_EM_DASH));
  assert.equal(r.status, "fail");
  assert.equal(r.findings.length, 1, JSON.stringify(r.findings));
  assert.equal(r.findings[0].id, "station-dna-em-dash");
  assert.match(r.findings[0].message, /31\.25/);
});

test("an em dash inside fenced or inline code is not measured", () => {
  const { spec } = setup();
  const r = run(spec, draftOf(`${OPENING}\n\n\`\`\`\nx \u2014 y\n\`\`\`\n\n${CLOSING}\n`));
  assert.equal(r.status, "pass", JSON.stringify(r.findings));
});

test("CRLF: the in-scope draft still passes and the em dash draft still fails", () => {
  const { spec } = setup();
  assert.equal(run(spec, draftOf(crlf(IN_SCOPE))).status, "pass");
  const bad = run(spec, draftOf(crlf(WITH_EM_DASH)));
  assert.equal(bad.status, "fail");
  assert.equal(bad.findings[0].id, "station-dna-em-dash");
});

// compareFeatures is the band rule on its own, over features objects shaped like measureFeatures'.

test("band: above max(v * 1.5, v + 5) or below v / 1.5 is drift; the edges are inside", () => {
  const scope = { sentence_length: { mean: 10 }, rates_per_1000_words: { comma: 2 } };
  const at = (mean, comma) => compareFeatures(scope, { sentence_length: { mean }, rates_per_1000_words: { comma } });
  assert.deepEqual(at(15, 7), []); // 10 * 1.5 = 15 beats 10 + 5; 2 + 5 = 7 beats 2 * 1.5
  assert.deepEqual(at(10 / 1.5, 2 / 1.5), []);
  assert.deepEqual(at(15.001, 7).map((f) => f.feature), ["sentence_length.mean"]);
  assert.deepEqual(at(15, 7.001).map((f) => f.feature), ["rates_per_1000_words.comma"]);
  assert.deepEqual(at(6.66, 1.3).map((f) => f.feature), ["sentence_length.mean", "rates_per_1000_words.comma"]);
});

test("band: the lower bound floors at 0, so a scope value of 0 only bounds from above (at 5)", () => {
  const scope = { contraction_rate: 0 };
  assert.deepEqual(compareFeatures(scope, { contraction_rate: 5 }), []);
  assert.equal(compareFeatures(scope, { contraction_rate: 5.5 }).length, 1);
});

test("only features the scope's features.json records are compared", () => {
  const r = compareFeatures({ sentence_length: { mean: 10 } }, { sentence_length: { mean: 10 }, contraction_rate: 900, rates_per_1000_words: { comma: 900 } });
  assert.deepEqual(r, []);
});

test("compared: sentence and paragraph means and every per-1000 rate, never counts or word lists", () => {
  const scope = {
    word_count: 10, sentence_length: { mean: 1, median: 1, p90: 1 }, paragraph_length: { mean_sentences: 1, mean_words: 1 },
    rates_per_1000_words: { comma: 0, em_dash: 1 }, contraction_rate: 0, first_person_singular_rate: 0,
    first_person_plural_rate: 0, second_person_rate: 0, mean_word_length: 1, signature_words: ["x"],
  };
  const draft = {
    word_count: 999, sentence_length: { mean: 99, median: 99, p90: 99 }, paragraph_length: { mean_sentences: 99, mean_words: 99 },
    rates_per_1000_words: { comma: 99, em_dash: 99 }, contraction_rate: 99, first_person_singular_rate: 99,
    first_person_plural_rate: 99, second_person_rate: 99, mean_word_length: 99, signature_words: ["y"],
  };
  assert.deepEqual(compareFeatures(scope, draft).map((f) => f.feature), [
    "sentence_length.mean",
    "paragraph_length.mean_sentences",
    "paragraph_length.mean_words",
    "rates_per_1000_words.comma",
    "rates_per_1000_words.em_dash",
    "contraction_rate",
    "first_person_singular_rate",
    "first_person_plural_rate",
    "second_person_rate",
  ]);
});

test("hyperspec check --only dna passes an in-scope draft on the lint-clean fixture", () => {
  const ws = setup();
  writeFileSync(ws.draftPath, IN_SCOPE);
  const r = cli("check", ws.specPath, "--draft", ws.draftPath, "--only", "dna");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /dna: pass/);
  writeFileSync(ws.draftPath, WITH_EM_DASH);
  const r2 = cli("check", ws.specPath, "--draft", ws.draftPath, "--only", "dna");
  assert.equal(r2.status, 1, r2.stdout + r2.stderr);
  assert.match(r2.stdout, /station-dna-em-dash/);
});
