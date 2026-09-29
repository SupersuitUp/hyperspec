// `hyperspec learn prepare` and `learn record`: the edits a person made between a factory's first
// draft and the draft they approved, packaged for an outside judge to classify by spec block,
// validated, tallied and recorded. learn never edits the spec.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cli, workspace, storyWorkspace, doctorVerdict, writeVerdict, ledgerLines, prepare as judgePrepare, record as judgeRecord } from "./judge-fixture.mjs";
import { diffSentences, DiffTooLarge, LEARN_BLOCKS, LEARN_MOVES } from "../src/learn.mjs";
import { BLOCKS } from "../src/writing.mjs";

const FIRST = [
  "# Claim",
  "",
  "A hyperspec is a contract a linter can check. It is not a prompt.",
  "",
  "# Evidence",
  "",
  "The nine tests run on every spec. Honestly, it is amazing.",
  "",
  "# Close",
  "",
  "Buy it now. Read the schema section next.",
  "",
].join("\n");

// The same draft as approved: two replacements, one deletion, one insertion, and one sentence only
// reflowed across a line break, which is no edit.
const APPROVED = [
  "# Claim",
  "",
  "A hyperspec is a contract a linter can check, not a prompt someone wrote once.",
  "",
  "# Evidence",
  "",
  "The nine tests run",
  "on every spec. Each one names what fails it.",
  "",
  "# Close",
  "",
  "Read the schema section next.",
  "",
  "Star the repo today.",
  "",
].join("\n");

const HUNKS = [
  { id: "E1", kind: "replaced", first: "A hyperspec is a contract a linter can check. It is not a prompt.", approved: "A hyperspec is a contract a linter can check, not a prompt someone wrote once.", sentences: 2 },
  { id: "E2", kind: "replaced", first: "Honestly, it is amazing.", approved: "Each one names what fails it.", sentences: 1 },
  { id: "E3", kind: "deleted", first: "Buy it now.", approved: null, sentences: 1 },
  { id: "E4", kind: "inserted", first: null, approved: "Star the repo today.", sentences: 1 },
];

const ESSAY_BLOCKS = ["materials", "dna", "persona", "audience", "goal", "form", "spine", "sources", "none"];

function learnWs({ first = FIRST, approved = APPROVED, story = false } = {}) {
  const w = story ? storyWorkspace({ prefix: "hs-learn-story-" }) : workspace({ prefix: "hs-learn-" });
  const out = join(w.dir, "learn");
  mkdirSync(out);
  writeFileSync(join(w.dir, "first.md"), first);
  writeFileSync(join(w.dir, "approved.md"), approved);
  return { ...w, first: join(w.dir, "first.md"), approved: join(w.dir, "approved.md"), out, packet: join(out, "learn.packet.json"), verdict: join(w.dir, "learn.verdict.json") };
}

const prepare = (w, ...extra) => cli(["learn", "prepare", w.spec, "--first", w.first, "--approved", w.approved, "--out", w.out, ...extra]);
const record = (w, ...extra) => cli(["learn", "record", w.packet, "--verdict", w.verdict, ...extra]);
const learnLines = (w) => ledgerLines(w.ledger).filter((l) => l.kind === "learn");
// The same workspace, pointed at the doctor's files for judge prepare and judge record.
const doctorOf = (w) => ({ ...w, out: join(w.dir, "judge"), packet: join(w.dir, "judge", "doctor.packet.json"), verdict: join(w.dir, "doctor.verdict.json") });

const VERDICT = () => ({
  edits: [
    { id: "E1", block: "dna", why: "the goldens never pair a claim with its contrast in one sentence" },
    { id: "E2", block: "persona", why: "a peer does not gush" },
    { id: "E3", block: "dna", why: "no golden sells" },
    { id: "E4", block: "none", why: "a late call by the editor" },
  ],
});

// ---- the diff ------------------------------------------------------------------------------------

test("diffSentences: LCS over sentence units; consecutive non-matching units form one hunk", () => {
  assert.deepEqual(diffSentences(FIRST, APPROVED), HUNKS);
});

test("diffSentences: identical and reflow-only drafts have no hunks", () => {
  assert.deepEqual(diffSentences(FIRST, FIRST), []);
  assert.deepEqual(diffSentences("One two.\nThree four.", "One\ntwo.   Three four."), []);
});

test("diffSentences: a hunk spanning several units of one paragraph carries them as written", () => {
  const h = diffSentences("Keep.\n\nA one.\nB two.\n\nEnd.", "Keep.\n\nEnd.");
  assert.deepEqual(h, [{ id: "E1", kind: "deleted", first: "A one.\nB two.", approved: null, sentences: 2 }]);
  const i = diffSentences("", "New one. New two.");
  assert.deepEqual(i, [{ id: "E1", kind: "inserted", first: null, approved: "New one. New two.", sentences: 2 }]);
});

// The reviewer's scenario (F1): four voice sentences rewritten in one paragraph, two jargon
// sentences replaced in the next.
const VOICE_FIRST = "# Voice\n\nThis is amazing. Truly epic. Game changer. Wow.\n\n# Terms\n\nWe ship weekly. We use CRDTs. It is fast. The ORM does it.\n";
const VOICE_APPROVED = "# Voice\n\nThis works. It is steady. It saves time. That is all.\n\n# Terms\n\nWe ship weekly. We use shared documents. It is fast. The database layer does it.\n";

test("diffSentences: a hunk never crosses a paragraph or a heading, and counts its sentences", () => {
  assert.deepEqual(diffSentences(VOICE_FIRST, VOICE_APPROVED), [
    { id: "E1", kind: "replaced", first: "This is amazing. Truly epic. Game changer. Wow.", approved: "This works. It is steady. It saves time. That is all.", sentences: 4 },
    { id: "E2", kind: "replaced", first: "We use CRDTs.", approved: "We use shared documents.", sentences: 1 },
    { id: "E3", kind: "replaced", first: "The ORM does it.", approved: "The database layer does it.", sentences: 1 },
  ]);
  assert.deepEqual(diffSentences("Para one ends here.\n\nPara two starts here. Stays.", "Para one ended here.\n\nPara two began here. Stays."), [
    { id: "E1", kind: "replaced", first: "Para one ends here.", approved: "Para one ended here.", sentences: 1 },
    { id: "E2", kind: "replaced", first: "Para two starts here.", approved: "Para two began here.", sentences: 1 },
  ]);
  assert.deepEqual(diffSentences("# Old heading\nFirst line changed.", "# New heading\nFirst line edited."), [
    { id: "E1", kind: "replaced", first: "# Old heading", approved: "# New heading", sentences: 1 },
    { id: "E2", kind: "replaced", first: "First line changed.", approved: "First line edited.", sentences: 1 },
  ]);
  // Paragraphs merged or split with no word changed are still no edit.
  assert.deepEqual(diffSentences("One here.\n\nTwo here.", "One here.\nTwo here."), []);
  assert.deepEqual(diffSentences("One here. Two here.", "One here.\n\nTwo here."), []);
});

test("diffSentences: a rewrap that moves a number or a bullet to the start of a line is no edit", () => {
  assert.deepEqual(diffSentences("It happened in the year 1984. Then more.", "It happened in the year\n1984. Then more."), []);
  const para = "Hiring slowed after March 3. We shipped 4 releases in Q2. Churn fell - slowly - all year.";
  assert.deepEqual(diffSentences(para, "Hiring slowed after March\n3. We shipped 4 releases in Q2. Churn fell\n- slowly - all year."), []);
  assert.deepEqual(diffSentences(para, "Hiring slowed after March 3. We shipped\n4. releases in Q2? No: 4 releases in Q2. Churn fell - slowly - all year.").length, 1, "a real edit still counts");
});

test("diffSentences: the common start and end are trimmed, and a span too large to diff is refused", () => {
  const same = Array.from({ length: 5000 }, (_, k) => `Sentence number ${k} is here.`);
  // An edit near the end leaves the common start to trim, one near the start the common end:
  // either way the table untrimmed (5001 x 5001) is past the limit.
  for (const k of [10, 4990]) {
    const edited = [...same];
    edited[k] = "One sentence changed.";
    assert.deepEqual(diffSentences(same.join(" "), edited.join(" ")), [{ id: "E1", kind: "replaced", first: `Sentence number ${k} is here.`, approved: "One sentence changed.", sentences: 1 }]);
  }
  const a = Array.from({ length: 3200 }, (_, k) => `Alpha ${k} line.`).join(" ");
  const b = Array.from({ length: 3200 }, (_, k) => `Beta ${k} line.`).join(" ");
  assert.throws(() => diffSentences(a, b), (e) => e instanceof DiffTooLarge && e.firstCount === 3200 && e.approvedCount === 3200 && /3200 sentences of the first draft against 3200 of the approved draft/.test(e.message));
});

test("the move table has an entry for every block, and none is never a move", () => {
  assert.deepEqual(LEARN_BLOCKS, [...BLOCKS, "none"]);
  for (const b of BLOCKS) assert.ok(typeof LEARN_MOVES[b] === "string" && LEARN_MOVES[b].length > 10, b);
  assert.equal(LEARN_MOVES.none, undefined);
  assert.equal(LEARN_MOVES.dna, "add a golden or a style rule");
  assert.equal(LEARN_MOVES.goal, "tighten a goal condition's fails_when");
});

// ---- prepare -------------------------------------------------------------------------------------

test("prepare writes learn.packet.json: fixed keys, hunks, the spec's blocks plus none", () => {
  const w = learnWs();
  const r = prepare(w);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout, `${w.packet}\n4 edits over 5 sentences: 2 replaced, 1 deleted, 1 inserted\n`);
  assert.deepEqual(readdirSync(w.out), ["learn.packet.json"]);
  const text = readFileSync(w.packet, "utf8");
  const p = JSON.parse(text);
  assert.equal(text, `${JSON.stringify(p, null, 2)}\n`);
  assert.deepEqual(Object.keys(p), ["hyperspec_learn", "spec", "spec_sha256", "first", "first_sha256", "approved", "approved_sha256", "blocks", "instructions", "hunks", "verdict_schema"]);
  assert.equal(p.hyperspec_learn, "0.1");
  assert.equal(p.spec, w.spec);
  assert.equal(p.first, w.first);
  assert.equal(p.approved, w.approved);
  for (const k of ["spec_sha256", "first_sha256", "approved_sha256"]) assert.match(p[k], /^[0-9a-f]{64}$/);
  assert.deepEqual(p.blocks, ESSAY_BLOCKS);
  assert.deepEqual(p.hunks, HUNKS);
  assert.match(p.instructions, /exactly once/);
  assert.deepEqual(p.verdict_schema.properties.edits.items.properties.id.enum, ["E1", "E2", "E3", "E4"]);
  assert.deepEqual(p.verdict_schema.properties.edits.items.properties.block.enum, ESSAY_BLOCKS);
});

test("a fiction spec lists characters among its blocks", () => {
  const w = learnWs({ story: true });
  const r = prepare(w);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(JSON.parse(readFileSync(w.packet, "utf8")).blocks, LEARN_BLOCKS);
});

test("prepare is byte-identical on rerun, and refuses to overwrite without --force", () => {
  const w = learnWs();
  prepare(w);
  const before = readFileSync(w.packet, "utf8");
  let r = prepare(w);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /refusing to overwrite .*learn\.packet\.json; pass --force/);
  r = prepare(w, "--force");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(readFileSync(w.packet, "utf8"), before);
});

test("identical drafts: the packet is written with no hunks and prepare says there is nothing to learn", () => {
  const w = learnWs({ approved: FIRST });
  const r = prepare(w);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /no edits: the first draft and the approved draft match; nothing to learn/);
  assert.deepEqual(JSON.parse(readFileSync(w.packet, "utf8")).hunks, []);
});

test("prepare usage errors are exit 2 and write nothing", () => {
  const w = learnWs();
  const cases = [
    [["learn", "prepare"], /learn prepare needs a spec path/],
    [["learn", "prepare", w.spec, "--approved", w.approved, "--out", w.out], /needs --first <draft>/],
    [["learn", "prepare", w.spec, "--first", w.first, "--out", w.out], /needs --approved <draft>/],
    [["learn", "prepare", w.spec, "--first", w.first, "--approved", w.approved], /needs --out <dir>/],
    [["learn", "prepare", w.spec, "--first", w.first, "--approved", w.approved, "--out", join(w.dir, "nope")], /--out folder does not exist/],
    [["learn", "prepare", w.spec, "--first", join(w.dir, "missing.md"), "--approved", w.approved, "--out", w.out], /cannot read the first draft: .*missing\.md/],
    [["learn", "prepare", w.spec, "--first", w.first, "--approved", join(w.dir, "missing.md"), "--out", w.out], /cannot read the approved draft: .*missing\.md/],
    [["learn", "prepare", w.spec, "--first", w.first, "--approved", w.approved, "--out", w.out, "--bogus"], /--bogus/],
  ];
  for (const [args, re] of cases) {
    const r = cli(args);
    assert.equal(r.status, 2, `${args.join(" ")}\n${r.stdout}${r.stderr}`);
    assert.match(r.stderr, re);
  }
  writeFileSync(join(w.dir, "plain.md"), "---\nhyperspec: \"0.1\"\ntitle: x\n---\n");
  const r = cli(["learn", "prepare", join(w.dir, "plain.md"), "--first", w.first, "--approved", w.approved, "--out", w.out]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /learn prepare needs a writing spec/);
  assert.deepEqual(readdirSync(w.out), []);
});

test("prepare refuses a spec that does not lint clean, with lint's code, and writes nothing", () => {
  const w = learnWs();
  const text = readFileSync(w.spec, "utf8");
  const broken = text.replace("rejects:\n  - hype words about AI\n  - a claim with no material behind it\n", "");
  assert.notEqual(broken, text);
  writeFileSync(w.spec, broken);
  const r = prepare(w);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /fail \(8\/9\)/);
  assert.match(r.stdout, /no packet written/);
  assert.deepEqual(readdirSync(w.out), []);
});

test("an unknown learn subcommand is exit 2", () => {
  const r = cli(["learn", "apply"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown learn subcommand: apply/);
});

// ---- record: a valid verdict ---------------------------------------------------------------------

test("record tallies the verdict, suggests the move for the top block, and appends one learn line", () => {
  const w = learnWs();
  prepare(w);
  const specBefore = readFileSync(w.spec, "utf8");
  writeVerdict(w.verdict, VERDICT());
  const r = record(w);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout, [
    "learn: 4 edits classified",
    "  dna 2 edits, 3 sentences",
    "  persona 1 edit, 1 sentence",
    "  none 1 edit, 1 sentence",
    "next move: dna, 3 of 5 sentences (2 of 4 edits): add a golden or a style rule",
    "verdict: not-improved (edits by block: dna 2 edits (3 sentences), persona 1 edit (1 sentence), none 1 edit (1 sentence); not yet applied to the spec)",
    "",
  ].join("\n"));
  const lines = ledgerLines(w.ledger);
  assert.equal(lines.length, 1);
  const line = lines[0];
  assert.deepEqual(Object.keys(line), ["at", "kind", "first", "first_sha256", "approved", "approved_sha256", "spec_sha256", "verdict", "reason", "tally"]);
  assert.equal(line.kind, "learn");
  assert.equal(line.first, "first.md", "relative to the spec's folder");
  assert.equal(line.approved, "approved.md");
  const p = JSON.parse(readFileSync(w.packet, "utf8"));
  assert.equal(line.first_sha256, p.first_sha256);
  assert.equal(line.approved_sha256, p.approved_sha256);
  assert.equal(line.spec_sha256, p.spec_sha256);
  assert.equal(line.verdict, "not-improved");
  assert.equal(line.reason, "edits by block: dna 2 edits (3 sentences), persona 1 edit (1 sentence), none 1 edit (1 sentence); not yet applied to the spec");
  assert.deepEqual(line.tally, { dna: { edits: 2, sentences: 3 }, persona: { edits: 1, sentences: 1 }, none: { edits: 1, sentences: 1 } });
  assert.equal(readFileSync(w.spec, "utf8"), specBefore, "learn never edits the spec");
});

test("record --json prints the tally and the suggestion", () => {
  const w = learnWs();
  prepare(w);
  writeVerdict(w.verdict, VERDICT());
  const r = record(w, "--json");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.edits, 4);
  assert.equal(j.sentences, 5);
  assert.deepEqual(j.tally, { dna: { edits: 2, sentences: 3 }, persona: { edits: 1, sentences: 1 }, none: { edits: 1, sentences: 1 } });
  assert.deepEqual(j.suggestion, { block: "dna", edits: 2, sentences: 3, move: "add a golden or a style rule" });
  assert.equal(j.verdict, "not-improved");
  assert.equal(j.ledgerPath, "runs.jsonl");
});

test("the move goes to the block with the most sentences, not the most edits (the voice/terms scenario)", () => {
  const w = learnWs({ first: VOICE_FIRST, approved: VOICE_APPROVED });
  prepare(w);
  writeVerdict(w.verdict, { edits: [
    { id: "E1", block: "dna", why: "the goldens never hype" },
    { id: "E2", block: "audience", why: "the reader does not know CRDTs" },
    { id: "E3", block: "audience", why: "the reader does not know ORM" },
  ] });
  const r = record(w);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^ {2}dna 1 edit, 4 sentences\n {2}audience 2 edits, 2 sentences\nnext move: dna, 4 of 6 sentences \(1 of 3 edits\): add a golden or a style rule$/m);
});

test("ties: most sentences, then most edits, then the block order, never the verdict's order", () => {
  const w = learnWs();
  prepare(w);
  // E1 is 2 sentences; E2, E3 and E4 are 1 each.
  writeVerdict(w.verdict, { edits: [
    { id: "E1", block: "goal", why: "the condition let it through" },
    { id: "E2", block: "audience", why: "a term the reader does not know" },
    { id: "E3", block: "audience", why: "reads on a phone" },
    { id: "E4", block: "spine", why: "out of order" },
  ] });
  let j = JSON.parse(record(w, "--json").stdout);
  assert.deepEqual(Object.keys(j.tally), ["audience", "goal", "spine"], "2 sentences each: audience has more edits");
  assert.deepEqual(j.suggestion, { block: "audience", edits: 2, sentences: 2, move: LEARN_MOVES.audience });
  writeVerdict(w.verdict, { edits: [
    { id: "E1", block: "none", why: "x" },
    { id: "E2", block: "spine", why: "x" },
    { id: "E3", block: "goal", why: "x" },
    { id: "E4", block: "persona", why: "x" },
  ] });
  j = JSON.parse(record(w, "--json").stdout);
  assert.deepEqual(Object.keys(j.tally), ["none", "persona", "goal", "spine"]);
  assert.equal(j.suggestion.block, "persona", "a full tie goes to the block order");
});

test("none is never suggested, even when it has the most edits", () => {
  const w = learnWs();
  prepare(w);
  writeVerdict(w.verdict, { edits: ["E1", "E2", "E3"].map((id) => ({ id, block: "none", why: "taste" })).concat([{ id: "E4", block: "sources", why: "no source for it" }]) });
  const r = record(w);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^ {2}none 3 edits, 4 sentences\n {2}sources 1 edit, 1 sentence\n/m);
  assert.match(r.stdout, /next move: sources, 1 of 5 sentences \(1 of 4 edits\): add or cite a source in the claims ledger/);
  assert.match(r.stdout, /not yet applied to the spec\)$/m);
});

test("every edit none: no block could have prevented any edit, and no move is suggested", () => {
  const w = learnWs();
  prepare(w);
  writeVerdict(w.verdict, { edits: ["E1", "E2", "E3", "E4"].map((id) => ({ id, block: "none", why: "taste" })) });
  const r = record(w, "--json");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.suggestion, null);
  assert.equal(j.next, "none; no block could have prevented any edit, so the spec has nothing to learn from this pair");
  assert.equal(learnLines(w)[0].reason, "edits by block: none 4 edits (5 sentences); no block could have prevented any edit, so the spec has nothing to learn from this pair");
});

test("identical drafts: record accepts { edits: [] } and says there was nothing to learn", () => {
  const w = learnWs({ approved: FIRST });
  prepare(w);
  writeVerdict(w.verdict, { edits: [] });
  const r = record(w);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /learn: 0 edits classified\nnext move: none; the first draft and the approved draft match, so there is nothing to learn/);
  const [line] = learnLines(w);
  assert.equal(line.reason, "no edits: the first draft and the approved draft match");
  assert.deepEqual(line.tally, {});
});

test("drafts too far apart to diff: prepare is a usage error naming both sentence counts", () => {
  const a = Array.from({ length: 3300 }, (_, k) => `Alpha ${k} line.`).join(" ");
  const b = Array.from({ length: 3100 }, (_, k) => `Beta ${k} line.`).join(" ");
  const w = learnWs({ first: a, approved: b });
  const r = prepare(w);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /3300 sentences of the first draft against 3100 of the approved draft/);
  assert.deepEqual(readdirSync(w.out), []);
});

// ---- record: an invalid verdict appends nothing --------------------------------------------------

function invalid(w, verdict, id, re) {
  writeVerdict(w.verdict, verdict);
  const r = record(w, "--json");
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.invalid, true);
  const ids = j.findings.map((f) => f.id);
  assert.ok(ids.includes(id), `${id} in ${ids.join(", ")}`);
  if (re) assert.match(j.findings.find((f) => f.id === id).message, re);
  assert.equal(learnLines(w).length, 0, "nothing appended");
  return j;
}

test("an invalid verdict is exit 1, names every problem, and appends nothing", () => {
  const w = learnWs();
  prepare(w);
  invalid(w, "{ not json", "learn-verdict-not-json");
  invalid(w, [], "learn-verdict-shape", /not a JSON object/);
  invalid(w, { edits: "E1" }, "learn-verdict-shape", /edits is missing or not a list/);
  invalid(w, { edits: [...VERDICT().edits, "E5"] }, "learn-verdict-shape", /edits\[4\] is not an object/);
  const drop = VERDICT(); drop.edits.pop();
  invalid(w, drop, "learn-edit-missing", /E4/);
  const dup = VERDICT(); dup.edits.push({ id: "E2", block: "dna", why: "again" });
  invalid(w, dup, "learn-edit-duplicate", /E2/);
  const unk = VERDICT(); unk.edits.push({ id: "E9", block: "dna", why: "x" });
  invalid(w, unk, "learn-edit-unknown", /E9/);
  const blk = VERDICT(); blk.edits[0].block = "voice";
  invalid(w, blk, "learn-block-unknown", /E1: block "voice" is not one of materials, dna, persona, audience, goal, form, spine, sources, characters, none/);
  const chars = VERDICT(); chars.edits[1].block = "characters";
  invalid(w, chars, "learn-block-absent", /E2: the spec has no characters block/);
  const why = VERDICT(); why.edits[2].why = "  ";
  invalid(w, why, "learn-why-missing", /E3/);
  const noId = VERDICT(); delete noId.edits[0].id;
  invalid(w, noId, "learn-verdict-shape", /edits\[0\]\.id/);
  const several = VERDICT(); several.edits[0].block = "voice"; several.edits[1].why = "";
  const j = invalid(w, several, "learn-block-unknown");
  assert.ok(j.findings.some((f) => f.id === "learn-why-missing"), "every problem named");
});

test("a verdict with a leading BOM is still JSON", () => {
  const w = learnWs();
  prepare(w);
  writeFileSync(w.verdict, `﻿${JSON.stringify(VERDICT())}`);
  const r = record(w);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("a file changed since prepare is stale: named, nothing appended, re-run prepare", () => {
  for (const [file, name] of [["approved", "the approved draft"], ["first", "the first draft"], ["spec", "the spec"]]) {
    const w = learnWs();
    prepare(w);
    writeFileSync(w[file], `${readFileSync(w[file], "utf8")}\n`);
    writeVerdict(w.verdict, VERDICT());
    const r = record(w, "--json");
    assert.equal(r.status, 1, r.stdout + r.stderr);
    const j = JSON.parse(r.stdout);
    assert.equal(j.stale, true);
    assert.equal(j.invalid, true);
    assert.equal(j.findings[0].id, "learn-stale");
    assert.equal(j.findings[0].message, `${name} does not match the hash the packet recorded: it changed since prepare, or the packet was edited`);
    assert.match(j.findings[0].fix, /learn prepare again/);
    assert.equal(learnLines(w).length, 0);
  }
  const w = learnWs();
  prepare(w);
  writeFileSync(w.first, `${FIRST}\n`);
  writeFileSync(w.approved, `${APPROVED}\n`);
  writeVerdict(w.verdict, VERDICT());
  const r = record(w);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /learn: stale packet, nothing recorded\n {2}fail \[learn-stale\] the first draft and the approved draft do not match the hashes the packet recorded: they changed since prepare, or the packet was edited/);
});

test("a forged hash with every file unchanged is reported without claiming the draft changed", () => {
  const w = learnWs();
  prepare(w);
  const p = JSON.parse(readFileSync(w.packet, "utf8"));
  p.first_sha256 = "0".repeat(64);
  writeFileSync(w.packet, `${JSON.stringify(p, null, 2)}\n`);
  writeVerdict(w.verdict, VERDICT());
  const j = JSON.parse(record(w, "--json").stdout);
  assert.equal(j.findings[0].id, "learn-stale");
  assert.equal(j.findings[0].message, "the first draft does not match the hash the packet recorded: it changed since prepare, or the packet was edited");
  assert.equal(learnLines(w).length, 0);
});

test("a packet edited after prepare is learn-packet-altered, validated against nothing", () => {
  const w = learnWs();
  prepare(w);
  const p = JSON.parse(readFileSync(w.packet, "utf8"));
  p.hunks = p.hunks.slice(0, 1);
  p.verdict_schema.properties.edits.items.properties.id.enum = ["E1"];
  writeFileSync(w.packet, `${JSON.stringify(p, null, 2)}\n`);
  writeVerdict(w.verdict, { edits: [{ id: "E1", block: "dna", why: "x" }] });
  let r = record(w, "--json");
  assert.equal(r.status, 1, r.stdout + r.stderr);
  let j = JSON.parse(r.stdout);
  assert.equal(j.findings[0].id, "learn-packet-altered");
  assert.match(j.findings[0].fix, /learn prepare again/);
  // A block added to the packet's list does not make it acceptable either.
  prepare(w, "--force");
  const q = JSON.parse(readFileSync(w.packet, "utf8"));
  q.blocks.splice(-1, 0, "characters");
  writeFileSync(w.packet, `${JSON.stringify(q, null, 2)}\n`);
  const chars = VERDICT(); chars.edits[0].block = "characters";
  writeVerdict(w.verdict, chars);
  r = record(w, "--json");
  j = JSON.parse(r.stdout);
  assert.equal(r.status, 1);
  assert.equal(j.findings[0].id, "learn-packet-altered");
  // Reformatted but equal JSON is still not the packet prepare wrote.
  prepare(w, "--force");
  writeFileSync(w.packet, JSON.stringify(JSON.parse(readFileSync(w.packet, "utf8"))));
  writeVerdict(w.verdict, VERDICT());
  r = record(w, "--json");
  assert.equal(r.status, 1);
  assert.equal(JSON.parse(r.stdout).findings[0].id, "learn-packet-altered");
  assert.equal(learnLines(w).length, 0);
});

test("record usage errors are exit 2", () => {
  const w = learnWs();
  prepare(w);
  writeVerdict(w.verdict, VERDICT());
  let r = cli(["learn", "record"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /learn record needs a packet path/);
  r = cli(["learn", "record", w.packet]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /learn record needs --verdict <file>/);
  r = cli(["learn", "record", w.packet, "--verdict", join(w.dir, "missing.json")]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /cannot read verdict/);
  r = cli(["learn", "record", join(w.out, "missing.json"), "--verdict", w.verdict, "--json"]);
  assert.equal(r.status, 2);
  assert.match(JSON.parse(r.stdout).error, /cannot read packet/);
  // A judge packet is not a learn packet.
  judgePrepare(doctorOf(w), "--only", "doctor");
  r = cli(["learn", "record", doctorOf(w).packet, "--verdict", w.verdict]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /not a hyperspec learn packet/);
  // A packet whose draft is gone.
  const p = JSON.parse(readFileSync(w.packet, "utf8"));
  p.first = join(w.dir, "gone.md");
  writeFileSync(w.packet, `${JSON.stringify(p, null, 2)}\n`);
  r = cli(["learn", "record", w.packet, "--verdict", w.verdict]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /cannot read the packet's first draft/);
  assert.equal(learnLines(w).length, 0);
});

// ---- the ledger ----------------------------------------------------------------------------------

test("learn lines leave check's and judge's verdict history alone", () => {
  const w = learnWs();
  writeFileSync(join(w.dir, "essay.claims.jsonl"), "");
  prepare(w);
  writeVerdict(w.verdict, VERDICT());
  record(w);
  record(w);
  let r = cli(["check", w.spec, "--draft", w.draft, "--json"]);
  let j = JSON.parse(r.stdout);
  assert.match(j.verdictDetail.reason, /^failing stations: /, "compared with no earlier check");
  const d = doctorOf(w);
  judgePrepare(d, "--only", "doctor");
  writeVerdict(d.verdict, doctorVerdict());
  r = judgeRecord(d, "--json");
  j = JSON.parse(r.stdout);
  assert.equal(j.verdict, "one-shot", "compared with no earlier judgment");
});

test("check and judge lines leave learn alone: the same verdict gets the same reason", () => {
  const w = learnWs();
  const d = doctorOf(w);
  judgePrepare(d, "--only", "doctor");
  writeVerdict(d.verdict, doctorVerdict());
  judgeRecord(d);
  cli(["check", w.spec, "--draft", w.draft]);
  prepare(w);
  writeVerdict(w.verdict, VERDICT());
  const r = record(w, "--json");
  assert.equal(JSON.parse(r.stdout).reason, "edits by block: dna 2 edits (3 sentences), persona 1 edit (1 sentence), none 1 edit (1 sentence); not yet applied to the spec");
  assert.deepEqual(ledgerLines(w.ledger).map((l) => l.kind), ["judge", "check", "learn"]);
});

test("the spec still lints 9/9 after many learn lines", () => {
  const w = learnWs();
  prepare(w);
  writeVerdict(w.verdict, VERDICT());
  for (let i = 0; i < 12; i++) record(w);
  assert.equal(learnLines(w).length, 12);
  const r = cli(["lint", w.spec]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /pass \(9\/9\)/);
});

test("learn record and prepare are in the help", () => {
  const r = cli(["--help"]);
  assert.match(r.stdout + r.stderr, /learn prepare <spec> --first <draft> --approved <draft> --out <dir>/);
  assert.match(r.stdout + r.stderr, /learn record <packet> --verdict <file>/);
  assert.ok(!existsSync(join(learnWs().dir, "learn", "learn.packet.json")));
});
