// The lineup station: up to three goldens from the spec's DNA scope and one passage of the draft,
// shuffled by the draft's hash and labelled; the draft's label is kept out of the packet (it goes
// only to lineup.key.json, and record rebuilds it rather than reading that file). Passes when the
// judge picks a golden, i.e. could not tell the draft from the writer.

import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, cli, workspace, forStation, doctorVerdict, writeVerdict, ledgerLines, prepare, record, DRAFT } from "./judge-fixture.mjs";
import { tempDir } from "./tmp.mjs";
import { LINEUP_INSTRUCTIONS, proseParagraphs, pickPassage, reflow, seededShuffle, skipReason } from "../src/judges/lineup.mjs";

const PASSAGE = "A hyperspec is a contract a linter can check, not a prompt someone wrote once.";
const CLOSING = "A hyperspec is a contract you can check today, and a contract you can keep tomorrow.";
const OPENING = "A hyperspec is a contract a linter can check, not a prompt you hope holds.";

const json = (path) => JSON.parse(readFileSync(path, "utf8"));
function ready(opts) {
  const w = forStation(workspace(opts), "lineup");
  const r = prepare(w, "--only", "lineup");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return w;
}
// The label the key gives the draft, and a label that is a golden.
function labels(w) {
  const key = json(w.key);
  const golden = key.candidates.find((c) => c.source !== "draft").label;
  return { draft: key.draft_label, golden };
}
function recordJson(w, verdict) {
  writeVerdict(w.verdict, verdict);
  const r = record(w, "--json");
  return { r, j: JSON.parse(r.stdout) };
}
const ids = (findings) => findings.map((f) => f.id);

// Rewrites the fixture spec, asserting the edit took.
function editSpec(w, from, to) {
  const text = readFileSync(w.spec, "utf8");
  const edited = text.replace(from, to);
  assert.notEqual(edited, text);
  writeFileSync(w.spec, edited);
}

// Replaces the workspace's goldens with `files` ({ name: body }) and re-measures the scope, so the
// spec still lints clean.
function setGoldens(w, files) {
  const dir = join(w.dir, "dna-scope", "goldens");
  for (const f of readdirSync(dir)) rmSync(join(dir, f));
  for (const [file, body] of Object.entries(files)) {
    writeFileSync(join(dir, file), `---\nwhy: the move this passage teaches\napproved_by: example-author\nsource: notes\n---\n\n${body}\n`);
  }
  const m = cli(["dna", "measure", join(w.dir, "dna-scope")]);
  assert.equal(m.status, 0, m.stdout + m.stderr);
}
// No candidate carries a line break, so none can be told apart by how it was wrapped or split.
function assertOneLineEach(candidates) {
  for (const c of candidates) assert.ok(!/\s{2}|\n/.test(c.text), `${c.label} is not one reflowed line: ${JSON.stringify(c.text)}`);
}

// ---- which paragraph goes in ---------------------------------------------------------------------

test("prose paragraphs skip headings, lists, code fences, blockquotes, tables and breaks", () => {
  const text = [
    "---",
    "title: front matter",
    "---",
    "",
    "# Heading",
    "First prose paragraph,",
    "over two lines.",
    "",
    "- a list item",
    "- another",
    "",
    "1. numbered",
    "",
    "> a quotation",
    "> continued",
    "",
    "```",
    "code line",
    "",
    "more code",
    "```",
    "",
    "| a | b |",
    "",
    "***",
    "",
    "Second prose paragraph.",
    "Intro line:",
    "- mixed with a list",
    "",
    "    indented code",
    "",
    "<div>html</div>",
    "",
    "Third prose paragraph.  ",
  ].join("\n");
  assert.deepEqual(proseParagraphs(text), [
    { line: 6, text: "First prose paragraph,\nover two lines." },
    { line: 35, text: "Third prose paragraph." },
  ]);
});

test("prose paragraphs read CRLF drafts the same way", () => {
  assert.deepEqual(proseParagraphs("# H\r\n\r\nOne line here.\r\n"), [{ line: 3, text: "One line here." }]);
});

test("the passage is the paragraph closest to the goldens' median length; ties go to the earliest", () => {
  const p = (text, line) => ({ line, text });
  const paras = [p("x".repeat(10), 1), p("x".repeat(30), 3), p("x".repeat(50), 5), p("x".repeat(70), 7)];
  assert.equal(pickPassage(paras, [29, 31, 90]).line, 3, "odd count: the middle length, 31");
  assert.equal(pickPassage(paras, [40, 60]).line, 5, "even count: the mean of the two middle, 50");
  assert.equal(pickPassage(paras, [40]).line, 3, "30 and 50 are both 10 away from 40: the earlier wins");
  assert.equal(pickPassage([p("é".repeat(4), 1), p("e".repeat(9), 2)], [5]).line, 1, "length counts characters, not bytes");
  assert.equal(pickPassage(paras, [30], { exclude: new Set(["x".repeat(30)]) }).line, 1, "an excluded paragraph is never picked; 10 and 50 tie, the earlier wins");
  assert.equal(pickPassage([p("same", 1)], [4], { exclude: new Set(["same"]) }), null);
});

test("reflow puts a paragraph on one line", () => {
  assert.equal(reflow("  One line\nand   the\tnext,\r\nwrapped. "), "One line and the next, wrapped.");
});

test("the seeded shuffle is deterministic per hash and moves with it", () => {
  const items = ["a", "b", "c", "d"];
  const h1 = "0".repeat(63) + "1";
  assert.deepEqual(seededShuffle(items, h1), seededShuffle(items, h1));
  assert.deepEqual(items, ["a", "b", "c", "d"], "the input is not reordered in place");
  const orders = new Set();
  for (let i = 0; i < 16; i++) orders.add(seededShuffle(items, i.toString(16).padStart(8, "0") + "f".repeat(56)).join(""));
  assert.ok(orders.size > 4, `16 hashes gave only ${orders.size} orders`);
});

// ---- the packet and the key ----------------------------------------------------------------------

test("the lineup packet: the dna rubric verbatim, fixed instructions, the scope and labelled candidates", () => {
  const w = ready();
  const p = json(w.packet);
  assert.equal(p.station, "lineup");
  assert.equal(p.rubric, "blind lineup within this scope; a judge cannot pick the generated passage out from three goldens");
  assert.equal(p.instructions, LINEUP_INSTRUCTIONS);
  assert.deepEqual(Object.keys(p.inputs), ["scope", "candidates"]);
  assert.deepEqual(p.inputs.scope, { writer: "example-author", form: "essay", audience: "builders", purpose: "persuade" });
  assert.deepEqual(p.inputs.candidates.map((c) => c.label), ["A", "B", "C"]);
  for (const c of p.inputs.candidates) assert.deepEqual(Object.keys(c), ["label", "text"]);
  assert.deepEqual(p.inputs.candidates.map((c) => c.text).sort(), [CLOSING, OPENING, PASSAGE].sort());
  assert.deepEqual(p.verdict_schema.required, ["pick", "confidence", "reason"]);
  assert.deepEqual(p.verdict_schema.properties.pick.enum, ["A", "B", "C"]);
});

test("the draft's label is only in lineup.key.json, never in the packet", () => {
  const w = ready();
  assert.deepEqual(readdirSync(w.out).sort(), ["lineup.key.json", "lineup.packet.json"]);
  const key = json(w.key);
  const p = json(w.packet);
  assert.deepEqual(Object.keys(key), ["station", "draft_label", "draft_line", "candidates"]);
  assert.equal(key.station, "lineup");
  assert.equal(key.draft_line, 3);
  assert.equal(p.inputs.candidates.find((c) => c.label === key.draft_label).text, PASSAGE);
  assert.deepEqual(key.candidates.map((c) => c.source).sort(), ["draft", "goldens/closing.md", "goldens/opening.md"]);
  const packetText = readFileSync(w.packet, "utf8");
  for (const s of ["draft_label", "goldens/", "\"source\""]) assert.ok(!packetText.includes(s), s);
});

test("the same spec and draft give byte-identical packet and key; another draft can shuffle differently", () => {
  const w = ready();
  const packet = readFileSync(w.packet);
  const key = readFileSync(w.key);
  assert.equal(prepare(w, "--only", "lineup", "--force").status, 0);
  assert.ok(packet.equals(readFileSync(w.packet)));
  assert.ok(key.equals(readFileSync(w.key)));

  const seen = new Set();
  for (let i = 0; i < 10; i++) {
    const v = ready({ draft: DRAFT.replace("Read the schema section next.", `Read the schema section next, part ${i}.`) });
    seen.add(labels(v).draft);
  }
  assert.ok(seen.size > 1, "ten different drafts all put the draft under one label");
});

test("with four goldens only the first three by file name go in, labelled A to D", () => {
  const w = forStation(workspace(), "lineup");
  const goldens = join(w.dir, "dna-scope", "goldens");
  for (const [file, text] of [["a-first.md", "The first extra golden says one plain thing well."], ["zz-last.md", "The last golden is never read into the lineup at all."]]) {
    writeFileSync(join(goldens, file), `---\nwhy: a plain sentence\napproved_by: example-author\nsource: notes\n---\n\n${text}\n`);
  }
  assert.equal(cli(["dna", "measure", join(w.dir, "dna-scope")]).status, 0);
  const r = prepare(w, "--only", "lineup");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const p = json(w.packet);
  assert.deepEqual(p.inputs.candidates.map((c) => c.label), ["A", "B", "C", "D"]);
  assert.deepEqual(json(w.key).candidates.map((c) => c.source).sort(), ["draft", "goldens/a-first.md", "goldens/closing.md", "goldens/opening.md"]);
  assert.ok(!readFileSync(w.packet, "utf8").includes("never read into the lineup"));
});

test("goldens with several paragraphs, headings and lists each give ONE reflowed paragraph, the one nearest the median", () => {
  const w = forStation(workspace(), "lineup");
  setGoldens(w, {
    "opening.md": "# A heading the lineup never shows\n\nShort one.\n\nThis middle paragraph of the first golden is the one near the target length.\n\n- a list\n- that never goes in",
    "b.md": "The second golden opens with a paragraph that runs\nacross two hard-wrapped lines, close to the target.\n\nThen a much longer paragraph follows it, one that goes on and on well past the median length of every golden paragraph in the scope, so it loses.",
    "c.md": "> A quotation block is not prose.\n\nA third golden, one paragraph, about the same length as the rest.",
  });
  const r = prepare(w, "--only", "lineup");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const { candidates } = json(w.packet).inputs;
  assertOneLineEach(candidates);
  assert.deepEqual(candidates.map((c) => c.text).sort(), [
    PASSAGE,
    "A third golden, one paragraph, about the same length as the rest.",
    "The second golden opens with a paragraph that runs across two hard-wrapped lines, close to the target.",
    "This middle paragraph of the first golden is the one near the target length.",
  ].sort());
});

test("an unwrapped draft beside hard-wrapped goldens: every candidate is one line, as the judge sees it", () => {
  const w = forStation(workspace({ draft: "# Claim\n\nA hyperspec is a contract a linter can check, not a prompt someone wrote once, and that difference is the whole reason to write one.\n" }), "lineup");
  setGoldens(w, {
    "opening.md": "A hyperspec is a contract a linter can check,\nnot a prompt you hope holds; the linter says\nwhich promise broke and where.",
    "b.md": "Write the contract once, and every draft after\nit is graded against the same nine tests\nwithout anyone rereading the prompt.",
  });
  assert.equal(prepare(w, "--only", "lineup").status, 0);
  const { candidates } = json(w.packet).inputs;
  assert.equal(candidates.length, 3);
  assertOneLineEach(candidates);
});

test("a draft paragraph that is already a golden, word for word, never goes in the lineup", () => {
  const golden = "A hyperspec is a contract you can check today,\nand a contract you can keep tomorrow.";
  const w = forStation(workspace({ draft: DRAFT.replace(PASSAGE, "A hyperspec is a contract you can check today, and a contract you can keep tomorrow.") }), "lineup");
  setGoldens(w, { "closing.md": golden, "opening.md": OPENING });
  assert.equal(prepare(w, "--only", "lineup").status, 0);
  const key = json(w.key);
  const texts = json(w.packet).inputs.candidates.map((c) => c.text);
  assert.equal(new Set(texts).size, texts.length, "no two candidates are the same passage");
  assert.equal(key.draft_line, 7, "the golden-identical paragraph on line 3 was skipped");

  const only = forStation(workspace({ draft: `# Close\n\n${golden.replace("\n", " ")}\n` }), "lineup");
  setGoldens(only, { "closing.md": golden, "opening.md": OPENING });
  const r = prepare(only, "--only", "lineup");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^lineup: skip \(every prose paragraph of the draft is already a golden in the scope, word for word\)$/m);
  assert.deepEqual(readdirSync(only.out), []);
});

test("the shipped essay example gives four distinct one-line candidates", () => {
  const dir = tempDir("hs-lineup-example-");
  cpSync(join(ROOT, "examples", "writing"), dir, { recursive: true });
  mkdirSync(join(dir, "judge"));
  const r = cli(["judge", "prepare", "essay.hyperspec.md", "--draft", "essay/draft.md", "--out", "judge", "--only", "lineup"], { cwd: dir });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const { candidates } = json(join(dir, "judge", "lineup.packet.json")).inputs;
  assert.equal(candidates.length, 4);
  assertOneLineEach(candidates);
  assert.equal(new Set(candidates.map((c) => c.text)).size, 4, "no two candidates are identical");
});

// ---- when it applies -----------------------------------------------------------------------------

test("lineup is skipped when dna.scope_dir is not set", () => {
  const w = forStation(workspace(), "lineup");
  editSpec(w, "    scope_dir: dna-scope\n", "");
  const r = prepare(w, "--only", "lineup");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^lineup: skip \(writing\.dna\.scope_dir is not set\)$/m);
  assert.deepEqual(readdirSync(w.out), []);
});

test("lineup is skipped when the dna check has no rubric", () => {
  const w = forStation(workspace(), "lineup");
  editSpec(w, "      rubric: blind lineup within this scope; a judge cannot pick the generated passage out from three goldens", "      station: features against the scope");
  const r = prepare(w, "--only", "lineup");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /lineup: skip \(writing\.dna\.check has no rubric\)/);
  assert.deepEqual(readdirSync(w.out), []);
});

test("lineup is skipped when the draft has no prose paragraph", () => {
  const w = forStation(workspace({ draft: "# Claim\n\n- only a list\n- and nothing else\n" }), "lineup");
  const r = prepare(w, "--only", "lineup");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /lineup: skip \(the draft has no prose paragraph to put in the lineup\)/);
  assert.deepEqual(readdirSync(w.out), []);
});

test("lineup is skipped when the scope has no goldens (lint refuses that spec, so asked directly)", () => {
  const w = workspace();
  const spec = { dir: w.dir, data: { writing: { dna: { scope_dir: "empty-scope", check: { rubric: "a lineup" } } } } };
  assert.match(skipReason(spec, { text: DRAFT }), /writing\.dna\.scope_dir "empty-scope": its goldens cannot be read/);
  mkdirSync(join(w.dir, "empty-scope", "goldens"), { recursive: true });
  assert.equal(skipReason(spec, { text: DRAFT }), 'writing.dna.scope_dir "empty-scope" has no goldens');
  writeFileSync(join(w.dir, "empty-scope", "goldens", "list.md"), "---\nwhy: w\napproved_by: a\nsource: s\n---\n\n- only a list\n- of things\n");
  assert.equal(skipReason(spec, { text: DRAFT }), 'writing.dna.scope_dir "empty-scope" has no golden with a prose paragraph');
  assert.equal(skipReason({ dir: w.dir, data: { writing: {} } }, { text: DRAFT }), "writing.dna is not written (deferred)");
});

// ---- the verdict -----------------------------------------------------------------------------------

test("a pick that is a golden passes: the judge could not tell the draft from the writer", () => {
  const w = ready();
  const { r, j } = recordJson(w, { pick: labels(w).golden, confidence: 0.4, reason: "B is flatter than the others" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(j.status, "pass");
  assert.deepEqual(j.findings, []);
});

test("picking the draft fails, naming the label, the confidence and the reason, at the passage's line", () => {
  const w = ready();
  const { draft } = labels(w);
  const { r, j } = recordJson(w, { pick: draft, confidence: 0.9, reason: "the only one that says someone" });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.equal(j.status, "fail");
  assert.deepEqual(ids(j.findings), ["judge-lineup-picked"]);
  const f = j.findings[0];
  assert.equal(f.severity, "fail");
  assert.equal(f.line, 3);
  assert.ok(f.message.includes(`(${draft})`), f.message);
  assert.ok(f.message.includes("0.9"), f.message);
  assert.ok(f.message.includes("the only one that says someone"), f.message);
});

test("the verdict must pick a label in the lineup, with a confidence from 0 to 1 and a reason", () => {
  const w = ready();
  const bad = [
    [[], ["judge-verdict-shape"]],
    [{ pick: "D", confidence: 0.5, reason: "r" }, ["judge-lineup-pick-unknown"]],
    [{ pick: "a", confidence: 0.5, reason: "r" }, ["judge-lineup-pick-unknown"]],
    [{ pick: 1, confidence: 0.5, reason: "r" }, ["judge-verdict-shape"]],
    [{ pick: "A", confidence: 1.5, reason: "r" }, ["judge-verdict-shape"]],
    [{ pick: "A", confidence: -0.1, reason: "r" }, ["judge-verdict-shape"]],
    [{ pick: "A", confidence: "high", reason: "r" }, ["judge-verdict-shape"]],
    [{ pick: "A", confidence: 0.5 }, ["judge-verdict-shape"]],
    [{ pick: "A", confidence: 0.5, reason: "  " }, ["judge-verdict-shape"]],
  ];
  for (const [verdict, want] of bad) {
    const { r, j } = recordJson(w, verdict);
    assert.equal(r.status, 1, JSON.stringify(verdict));
    assert.equal(j.invalid, true, JSON.stringify(verdict));
    assert.deepEqual(ids(j.findings), want, JSON.stringify(verdict));
  }
  assert.deepEqual(ledgerLines(w.ledger).filter((l) => l.kind === "judge"), [], "an invalid verdict records nothing");
  for (const confidence of [0, 1]) assert.equal(recordJson(w, { pick: labels(w).golden, confidence, reason: "edge" }).r.status, 0);
});

test("record rebuilds the key: an edited lineup.key.json changes nothing", () => {
  const w = ready();
  const { draft, golden } = labels(w);
  const key = json(w.key);
  key.draft_label = golden;
  writeFileSync(w.key, `${JSON.stringify(key, null, 2)}\n`);
  const { r, j } = recordJson(w, { pick: draft, confidence: 0.7, reason: "it reads differently" });
  assert.equal(r.status, 1);
  assert.equal(j.status, "fail", "still the draft's real label");
});

test("a golden changed after prepare is stale, and the message names the goldens (R9)", () => {
  const w = ready();
  const opening = join(w.dir, "dna-scope", "goldens", "opening.md");
  writeFileSync(opening, readFileSync(opening, "utf8").replace("you hope holds", "you hope will hold"));
  writeVerdict(w.verdict, { pick: "A", confidence: 0.5, reason: "a guess" });
  const r = record(w);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^lineup: stale verdict, nothing recorded$/m);
  assert.ok(r.stdout.includes("fail [judge-stale] the packet's inputs no longer match what lineup builds now; the spec and the draft are unchanged, so the DNA scope's goldens (dna-scope/goldens) changed since the packet was prepared, or the packet was edited"), r.stdout);
  assert.ok(r.stdout.includes("fix: Run judge prepare again (with --force) so the packet reads the DNA scope's goldens (dna-scope/goldens) as they are now, and judge the new packet."), r.stdout);
  assert.deepEqual(ledgerLines(w.ledger).filter((l) => l.kind === "judge"), []);
});

test("candidates edited in the packet read the same as stale goldens; an edit outside inputs is altered", () => {
  const w = ready();
  const p = json(w.packet);
  p.inputs.candidates.pop();
  writeFileSync(w.packet, `${JSON.stringify(p, null, 2)}\n`);
  let { r, j } = recordJson(w, { pick: "A", confidence: 0.5, reason: "a guess" });
  assert.equal(r.status, 1);
  assert.equal(j.stale, true);
  assert.match(j.findings[0].message, /or the packet was edited/);

  const v = ready();
  const q = json(v.packet);
  q.rubric = "anything passes";
  writeFileSync(v.packet, `${JSON.stringify(q, null, 2)}\n`);
  ({ r, j } = recordJson(v, { pick: "A", confidence: 0.5, reason: "a guess" }));
  assert.equal(r.status, 1);
  assert.deepEqual(j.findings.map((f) => f.id), ["judge-packet-altered"]);

  const m = ready();
  const minified = json(m.packet);
  minified.inputs.candidates.pop();
  writeFileSync(m.packet, JSON.stringify(minified));
  ({ j } = recordJson(m, { pick: "A", confidence: 0.5, reason: "a guess" }));
  assert.deepEqual(j.findings.map((f) => f.id), ["judge-packet-altered"], "not a packet prepare wrote: altered");
});

// ---- the ledger ------------------------------------------------------------------------------------

test("lineup ledger lines: one-shot, then its own history, apart from the doctor's", () => {
  const w = ready();
  const doctor = forStation(w, "doctor");
  assert.equal(prepare(doctor, "--only", "doctor").status, 0);
  writeVerdict(doctor.verdict, doctorVerdict());
  assert.match(record(doctor).stdout, /^verdict: one-shot$/m, "the doctor judges this draft first");
  const { draft, golden } = labels(w);
  writeVerdict(w.verdict, { pick: golden, confidence: 0.3, reason: "all three read alike" });
  let r = record(w);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^lineup: pass$/m);
  assert.match(r.stdout, /^verdict: one-shot$/m);
  writeVerdict(w.verdict, { pick: draft, confidence: 0.8, reason: "one is stiffer" });
  r = record(w);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /verdict: not-improved \(failing stations: lineup\)/);
  const lines = ledgerLines(w.ledger).filter((l) => l.kind === "judge");
  assert.deepEqual(lines.map((l) => [l.station, l.status, l.verdict]), [["doctor", "pass", "one-shot"], ["lineup", "pass", "one-shot"], ["lineup", "fail", "not-improved"]]);
  assert.equal(lines[1].draft, "draft.md");
  assert.match(cli(["lint", w.spec]).stdout, /pass \(9\/9\)/);
});
