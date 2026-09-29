import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tempDir } from "./tmp.mjs";
import {
  STOPWORDS, measureFeatures, readGoldens, readScope, writeFeatures, scopeTemplate, GOLDENS_README,
} from "../src/dna.mjs";

// ---------------------------------------------------------------------------------------------
// measureFeatures: every feature on small, hand-computed texts.

test("word_count, mean word length: a single short sentence", () => {
  // Words: "hello", "there", "world" — 5, 5, 5 letters, mean length 5.
  const feats = measureFeatures(["hello there world."]);
  assert.equal(feats.word_count, 3);
  assert.equal(feats.mean_word_length, 5);
});

test("sentence_length mean/median/p90, nearest-rank, hand-computed", () => {
  // Three sentences, 2/4/6 words each. sorted [2,4,6]: mean (2+4+6)/3=4, median 4 (middle of 3).
  // p90: rank = ceil(0.9*3) = 3 -> the 3rd smallest -> 6.
  const feats = measureFeatures(["Hi there. One two three four. A b c d e f."]);
  assert.equal(feats.word_count, 12);
  assert.equal(feats.sentence_length.mean, 4);
  assert.equal(feats.sentence_length.median, 4);
  assert.equal(feats.sentence_length.p90, 6);
});

test("sentence_length p90, ten sentences of 1..10 words: nearest-rank picks the 9th smallest (9), not 10 and not an interpolated 9.1", () => {
  const words = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
  const sentences = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `${words.slice(0, n).join(" ")}.`);
  const feats = measureFeatures([sentences.join(" ")]);
  assert.equal(feats.sentence_length.p90, 9);
});

test("paragraph_length: mean sentences and mean words per paragraph, two paragraphs", () => {
  // Paragraph 1: two sentences, 2 + 3 words = 5 words. Paragraph 2: one sentence, 4 words.
  // mean_sentences = (2+1)/2 = 1.5. mean_words = (5+4)/2 = 4.5.
  const text = "One two. Three four five.\n\nSix seven eight nine.";
  const feats = measureFeatures([text]);
  assert.equal(feats.paragraph_length.mean_sentences, 1.5);
  assert.equal(feats.paragraph_length.mean_words, 4.5);
});

test("punctuation rates per 1000 words, hand-computed on a 10-word text", () => {
  // "Wait, no: really? Yes! (Sure.) “Fine” — or – not."
  // words: wait, no, really, yes, sure, fine, or, not -> 8 words? let's count precisely below.
  const text = 'Wait, no: really? Yes! (Sure.) “Fine” — or – not.';
  const feats = measureFeatures([text]);
  // words: Wait, no, really, Yes, Sure, Fine, or, not = 8 words
  assert.equal(feats.word_count, 8);
  const per = (n) => Math.round((n / 8) * 1000 * 1000) / 1000;
  assert.equal(feats.rates_per_1000_words.comma, per(1));
  assert.equal(feats.rates_per_1000_words.colon, per(1));
  assert.equal(feats.rates_per_1000_words.question_mark, per(1));
  assert.equal(feats.rates_per_1000_words.exclamation, per(1));
  assert.equal(feats.rates_per_1000_words.parentheses, per(2)); // ( and )
  assert.equal(feats.rates_per_1000_words.quotation_marks, per(2)); // “ and ”
  assert.equal(feats.rates_per_1000_words.em_dash, per(1));
  assert.equal(feats.rates_per_1000_words.en_dash, per(1));
});

test("contraction_rate: only an apostrophe strictly between two letters counts", () => {
  // "don't" is a contraction. "'tis" (leading apostrophe) and a quote-wrapped 'word' are not.
  const feats = measureFeatures(["Don't 'tis 'word' really."]);
  // words tokenized: don't, tis (or 'tis captured with leading apostrophe, still not "between
  // letters" so not a contraction), word (quotes stripped since they are not between letters
  // either), really.
  assert.equal(feats.word_count, 4);
  assert.equal(feats.contraction_rate, Math.round((1 / 4) * 1000 * 1000) / 1000);
});

test("first-person singular/plural and second-person rates, on the closed word sets", () => {
  const feats = measureFeatures(["I told you my plan. We shared our thoughts with you."]);
  // words: i, told, you, my, plan, we, shared, our, thoughts, with, you = 11
  assert.equal(feats.word_count, 11);
  assert.equal(feats.first_person_singular_rate, Math.round((2 / 11) * 1000 * 1000) / 1000); // i, my
  assert.equal(feats.first_person_plural_rate, Math.round((2 / 11) * 1000 * 1000) / 1000); // we, our
  assert.equal(feats.second_person_rate, Math.round((2 / 11) * 1000 * 1000) / 1000); // you, you
});

test("empty input: every feature is zero, never NaN or a thrown error", () => {
  const feats = measureFeatures([]);
  assert.equal(feats.word_count, 0);
  assert.equal(feats.sentence_length.mean, 0);
  assert.equal(feats.sentence_length.median, 0);
  assert.equal(feats.sentence_length.p90, 0);
  assert.equal(feats.paragraph_length.mean_sentences, 0);
  assert.equal(feats.paragraph_length.mean_words, 0);
  assert.equal(feats.mean_word_length, 0);
  assert.deepEqual(feats.signature_words, []);
  for (const rate of Object.values(feats.rates_per_1000_words)) assert.equal(rate, 0);
});

test("rounding: every numeric feature is rounded to 3 decimals", () => {
  const feats = measureFeatures(["One, two, three."]); // 3 words, 1 comma... actually 2 commas
  const nums = [
    feats.sentence_length.mean, feats.sentence_length.median, feats.sentence_length.p90,
    feats.paragraph_length.mean_sentences, feats.paragraph_length.mean_words,
    ...Object.values(feats.rates_per_1000_words),
    feats.contraction_rate, feats.first_person_singular_rate, feats.first_person_plural_rate,
    feats.second_person_rate, feats.mean_word_length,
  ];
  for (const n of nums) {
    const rounded = Math.round(n * 1000) / 1000;
    assert.equal(n, rounded, `${n} is not rounded to 3 decimals`);
  }
});

// ---------------------------------------------------------------------------------------------
// signature words: stopword exclusion, the >=2 floor, and the alphabetical tie-break.

test("signature_words: a word appearing once never qualifies, regardless of length or stopword status", () => {
  const feats = measureFeatures(["Unique appears only once here in this passage of words."]);
  assert.ok(!feats.signature_words.includes("unique"));
});

test("signature_words: a stopword is excluded even when it repeats and is 4+ letters", () => {
  assert.ok(STOPWORDS.includes("about"));
  const feats = measureFeatures(["Think about it. Then think about it again, about that."]);
  assert.ok(!feats.signature_words.includes("about"), "about repeats 3x and is 4+ letters, but is a stopword");
});

test("signature_words: a short word (under 4 letters) never qualifies even repeated many times", () => {
  const feats = measureFeatures(["Run and run and run and run."]);
  assert.ok(!feats.signature_words.includes("run"));
});

test("signature_words: ties broken alphabetically, ranked by frequency first", () => {
  // "zebra" and "apple" each appear twice (tie); "banana" appears three times (ranks first).
  const text = "zebra apple banana zebra apple banana banana.";
  const feats = measureFeatures([text]);
  assert.deepEqual(feats.signature_words.slice(0, 3), ["banana", "apple", "zebra"]);
});

test("signature_words: pooled across every golden passed in, not per-text", () => {
  // "compound" appears once in each of two texts: qualifies only when pooled.
  const feats = measureFeatures(["The compound sentence works.", "Another compound idea follows."]);
  assert.ok(feats.signature_words.includes("compound"));
});

// ---------------------------------------------------------------------------------------------
// determinism: same input, byte-identical output.

test("measureFeatures is pure: the same texts produce a deep-equal object every call, in any order", () => {
  const texts = ["First passage here, with punctuation! Second sentence.", "Second passage.\n\nWith two paragraphs."];
  const a = measureFeatures(texts);
  const b = measureFeatures([...texts]);
  assert.deepEqual(a, b);
});

test("writeFeatures writes byte-identical JSON across repeated runs on the same goldens", () => {
  const dir = tempDir("hs-dna-");
  const goldens = [
    { path: "goldens/b.md", why: "x", approved_by: "p", source: "s", approved_on: "", text: "Second one here.", sha256: "bb" },
    { path: "goldens/a.md", why: "x", approved_by: "p", source: "s", approved_on: "", text: "First one here.", sha256: "aa" },
  ];
  const scope = { writer: "gary", form: "essay", audience: "builders", purpose: "explain" };
  const features = measureFeatures(goldens.map((g) => g.text));
  const { path: p1 } = writeFeatures(dir, { scope, goldens, features });
  const first = readFileSync(p1, "utf8");
  const { path: p2 } = writeFeatures(dir, { scope, goldens, features });
  const second = readFileSync(p2, "utf8");
  assert.equal(first, second);
  assert.equal(first, `${JSON.stringify(JSON.parse(first), null, 2)}\n`, "2-space JSON with a trailing newline");
});

test("writeFeatures sorts goldens by path regardless of input order", () => {
  const dir = tempDir("hs-dna-");
  const goldens = [
    { path: "goldens/z.md", sha256: "zz" },
    { path: "goldens/a.md", sha256: "aa" },
    { path: "goldens/m.md", sha256: "mm" },
  ];
  const { data } = writeFeatures(dir, { scope: {}, goldens, features: {} });
  assert.deepEqual(data.goldens.map((g) => g.path), ["goldens/a.md", "goldens/m.md", "goldens/z.md"]);
});

test("writeFeatures: features.json shape carries dna version, scope, goldens (path+sha256 only), features", () => {
  const dir = tempDir("hs-dna-");
  const scope = { writer: "gary", form: "essay", audience: "builders", purpose: "explain", notes: "extra, not written" };
  const goldens = [{ path: "goldens/a.md", why: "w", approved_by: "p", source: "s", text: "hi", sha256: "aa" }];
  const { data } = writeFeatures(dir, { scope, goldens, features: { word_count: 1 } });
  assert.deepEqual(Object.keys(data), ["dna", "scope", "goldens", "features"]);
  assert.equal(data.dna, "0.1");
  assert.deepEqual(data.scope, { writer: "gary", form: "essay", audience: "builders", purpose: "explain" });
  assert.deepEqual(data.goldens, [{ path: "goldens/a.md", sha256: "aa" }]);
  assert.deepEqual(data.features, { word_count: 1 });
});

// ---------------------------------------------------------------------------------------------
// readGoldens / readScope: the refusals, and the happy path, on real folders.

function makeScope(dir, { writer = "gary", form = "essay", audience = "builders", purpose = "explain" } = {}) {
  mkdirSync(join(dir, "goldens"), { recursive: true });
  writeFileSync(join(dir, "scope.md"), scopeTemplate({ writer, form, audience, purpose }));
  writeFileSync(join(dir, "goldens", "README.md"), GOLDENS_README);
}

function writeGolden(dir, name, { why = "teaches the move", approved_by = "example-author", source = "draft", approved_on, body = "A real passage of real text." } = {}) {
  const fm = [
    "---",
    `why: ${why}`,
    `approved_by: ${approved_by}`,
    `source: ${source}`,
    approved_on !== undefined ? `approved_on: ${approved_on}` : null,
    "---",
    "",
    body,
    "",
  ].filter((l) => l !== null).join("\n");
  writeFileSync(join(dir, "goldens", name), fm);
}

test("readScope on a missing scope-dir: one finding, test 1, id writing-dna-scope-missing; scope is null", () => {
  const dir = join(tempDir("hs-dna-"), "does-not-exist");
  const { scope, goldens, findings } = readScope(dir);
  assert.equal(scope, null);
  assert.deepEqual(goldens, []);
  assert.ok(findings.some((x) => x.id === "writing-dna-scope-missing" && x.test === 1 && x.severity === "fail"));
});

test("readScope: scope.md missing a required field is one finding per field, test 1", () => {
  const dir = tempDir("hs-dna-");
  mkdirSync(join(dir, "goldens"), { recursive: true });
  writeFileSync(join(dir, "scope.md"), "---\nwriter: gary\nform: essay\n---\n");
  const { scope, findings } = readScope(dir);
  assert.equal(scope.writer, "gary");
  assert.equal(scope.audience, "");
  assert.ok(findings.some((x) => x.id === "writing-dna-scope-audience" && x.test === 1));
  assert.ok(findings.some((x) => x.id === "writing-dna-scope-purpose" && x.test === 1));
  assert.ok(!findings.some((x) => x.id === "writing-dna-scope-writer"));
});

test("readGoldens: an empty goldens/ folder (only README.md) is a finding, test 1, goldens-empty", () => {
  const dir = tempDir("hs-dna-");
  makeScope(dir);
  const { goldens, findings } = readGoldens(dir);
  assert.deepEqual(goldens, []);
  assert.ok(findings.some((x) => x.id === "writing-dna-goldens-empty" && x.test === 1));
});

test("readGoldens: a missing goldens/ folder is a finding, test 1, goldens-missing", () => {
  const dir = tempDir("hs-dna-");
  writeFileSync(join(dir, "scope.md"), scopeTemplate({ writer: "g", form: "e", audience: "a", purpose: "p" }));
  const { goldens, findings } = readGoldens(dir);
  assert.deepEqual(goldens, []);
  assert.ok(findings.some((x) => x.id === "writing-dna-goldens-missing" && x.test === 1));
});

test("readGoldens: a golden with no why, no approved_by, no source is three findings, tests 6/4/4", () => {
  const dir = tempDir("hs-dna-");
  makeScope(dir);
  writeFileSync(join(dir, "goldens", "bare.md"), "---\n---\n\nSome text.\n");
  const { goldens, findings } = readGoldens(dir);
  assert.equal(goldens.length, 1);
  assert.equal(goldens[0].path, "goldens/bare.md");
  assert.ok(findings.some((x) => x.id === "writing-dna-golden-why" && x.test === 6));
  assert.ok(findings.some((x) => x.id === "writing-dna-golden-approved-by" && x.test === 4));
  assert.ok(findings.some((x) => x.id === "writing-dna-golden-source" && x.test === 4));
});

test("readGoldens: approved_by starting with agent: is refused, test 4, distinct id from missing approved_by", () => {
  const dir = tempDir("hs-dna-");
  makeScope(dir);
  writeGolden(dir, "a.md", { approved_by: "agent:claude" });
  const { findings } = readGoldens(dir);
  assert.ok(findings.some((x) => x.id === "writing-dna-golden-approved-by-agent" && x.test === 4));
  assert.ok(!findings.some((x) => x.id === "writing-dna-golden-approved-by"));
});

test("readGoldens: approved_by is case-insensitively checked for the agent: prefix", () => {
  const dir = tempDir("hs-dna-");
  makeScope(dir);
  writeGolden(dir, "a.md", { approved_by: "Agent:GPT" });
  const { findings } = readGoldens(dir);
  assert.ok(findings.some((x) => x.id === "writing-dna-golden-approved-by-agent"));
});

test("readGoldens: an empty passage body is a finding, test 1, golden-empty", () => {
  const dir = tempDir("hs-dna-");
  makeScope(dir);
  writeFileSync(join(dir, "goldens", "a.md"), "---\nwhy: x\napproved_by: p\nsource: s\n---\n\n   \n");
  const { findings } = readGoldens(dir);
  assert.ok(findings.some((x) => x.id === "writing-dna-golden-empty" && x.test === 1));
});

test("readGoldens: README.md in goldens/ is never treated as a golden", () => {
  const dir = tempDir("hs-dna-");
  makeScope(dir);
  writeGolden(dir, "real.md");
  const { goldens, findings } = readGoldens(dir);
  assert.equal(goldens.length, 1);
  assert.equal(goldens[0].path, "goldens/real.md");
  assert.ok(!findings.some((x) => x.message.includes("README")));
});

test("readGoldens: a complete golden produces no findings and the exact returned shape", () => {
  const dir = tempDir("hs-dna-");
  makeScope(dir);
  writeGolden(dir, "opening.md", { why: "shows restraint", approved_by: "gary-sheng", source: "essay draft", approved_on: "2026-09-01", body: "The real passage." });
  const { goldens, findings } = readGoldens(dir);
  assert.deepEqual(findings, []);
  assert.equal(goldens.length, 1);
  assert.deepEqual(Object.keys(goldens[0]).sort(), ["approved_by", "approved_on", "path", "sha256", "source", "text", "why"].sort());
  assert.equal(goldens[0].why, "shows restraint");
  assert.equal(goldens[0].approved_by, "gary-sheng");
  assert.equal(goldens[0].source, "essay draft");
  assert.equal(goldens[0].approved_on, "2026-09-01");
  assert.equal(goldens[0].text, "The real passage.");
  assert.equal(goldens[0].sha256.length, 64);
});

test("readGoldens: goldens are sorted by filename, deterministically", () => {
  const dir = tempDir("hs-dna-");
  makeScope(dir);
  writeGolden(dir, "z.md");
  writeGolden(dir, "a.md");
  writeGolden(dir, "m.md");
  const { goldens } = readGoldens(dir);
  assert.deepEqual(goldens.map((g) => g.path), ["goldens/a.md", "goldens/m.md", "goldens/z.md"]);
});

test("readScope: a fully valid scope produces zero findings and the right scope object", () => {
  const dir = tempDir("hs-dna-");
  makeScope(dir, { writer: "gary-sheng", form: "essay", audience: "builders", purpose: "explain the idea" });
  writeGolden(dir, "opening.md");
  const { scope, goldens, findings } = readScope(dir);
  assert.deepEqual(findings, []);
  assert.deepEqual(scope, { writer: "gary-sheng", form: "essay", audience: "builders", purpose: "explain the idea", notes: "" });
  assert.equal(goldens.length, 1);
});

test("readScope: displayDir overrides the scope tag used in messages, both for scope.md and golden findings", () => {
  const dir = tempDir("hs-dna-");
  makeScope(dir);
  writeGolden(dir, "a.md", { why: "" });
  const { findings } = readScope(dir, { displayDir: "writing/essays/opinion" });
  assert.ok(findings.every((x) => x.message.includes("writing/essays/opinion")));
  assert.ok(!findings.some((x) => x.message.includes(dir)));
});
