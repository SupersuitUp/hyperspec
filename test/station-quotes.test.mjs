import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { run } from "../src/stations/quotes.mjs";
import { workspace, markMaterial, draftOf, crlf, cli } from "./station-fixture.mjs";
import { loadSpec } from "../src/load.mjs";

// m1, re-marked: one quote by Gary Sheng (speaker as a slug), one quote by Wilson, one story, one
// private passage and one aside. Every station test below reads these through the spec, the same
// way `hyperspec check` does.
const MATERIAL = [
  { label: "aside", text: "Raw transcript, call, 2026-09-28." },
  { label: "quote", speaker: "gary-sheng", text: "A spec that a linter can check is a different object: it is a contract." },
  { label: "quote", speaker: "Wilson", text: "I stopped writing the weekly update by hand in August." },
  { label: "story", teller: "gary-sheng", text: "The draft drifted a paragraph at a time and nobody noticed until the ninth revision." },
  { label: "private", text: "Do not repeat this part about the investor meeting in anything public at all." },
];

const setup = () => workspace(MATERIAL, "hs-quotes-");

test("a draft with no quoted spans passes", () => {
  const { spec } = setup();
  const r = run(spec, draftOf("A hyperspec is a contract. Nothing is quoted here.\n"));
  assert.equal(r.station, "quotes");
  assert.equal(r.status, "pass");
  assert.deepEqual(r.findings, []);
});

test("a quoted span shorter than 4 words is not checked", () => {
  const { spec } = setup();
  const r = run(spec, draftOf('People call it "a prompt" or "the spec thing" all the time.\n'));
  assert.equal(r.status, "pass");
});

test("a 4+ word quote found in a quote segment passes", () => {
  const { spec } = setup();
  const r = run(spec, draftOf('The point: "A spec that a linter can check is a different object" and that is all.\n'));
  assert.equal(r.status, "pass", JSON.stringify(r.findings));
});

test("a 4+ word quote found in a story segment passes", () => {
  const { spec } = setup();
  const r = run(spec, draftOf('Put simply, "nobody noticed until the ninth revision" is the whole problem.\n'));
  assert.equal(r.status, "pass", JSON.stringify(r.findings));
});

test("an unmatched 4+ word quote fails, naming the span and its line", () => {
  const { spec } = setup();
  const r = run(spec, draftOf('# Claim\n\nThey said "a spec is just a very long prompt" once.\n'));
  assert.equal(r.status, "fail");
  assert.equal(r.findings.length, 1);
  const f = r.findings[0];
  assert.equal(f.id, "station-quotes-unmatched");
  assert.equal(f.station, "quotes");
  assert.equal(f.severity, "fail");
  assert.equal(f.line, 3);
  assert.match(f.message, /"a spec is just a very long prompt"/);
});

test("a quote that appears only in a private segment is still unmatched", () => {
  const { spec } = setup();
  const r = run(spec, draftOf('He said "the investor meeting in anything public" in passing.\n'));
  assert.equal(r.status, "fail");
  assert.equal(r.findings[0].id, "station-quotes-unmatched");
});

test("curly quotes around the span, and a curly apostrophe inside it, still match", () => {
  const { spec } = workspace([
    { label: "quote", speaker: "Wilson", text: "I don't write the weekly update by hand anymore." },
  ], "hs-quotes-");
  const r = run(spec, draftOf("He put it plainly: “I don’t write the weekly update by hand anymore.”\n"));
  assert.equal(r.status, "pass", JSON.stringify(r.findings));
});

test("whitespace inside the span is collapsed before matching (a quote wrapped across lines)", () => {
  const { spec } = setup();
  const r = run(spec, draftOf('The line was "A spec that a linter\ncan   check is a different object" all along.\n'));
  assert.equal(r.status, "pass", JSON.stringify(r.findings));
});

test("case is preserved: a quote whose capitalization differs from the source fails", () => {
  const { spec } = setup();
  const r = run(spec, draftOf('The point: "a spec that a linter can check is a different object" is it.\n'));
  assert.equal(r.status, "fail");
  assert.equal(r.findings[0].id, "station-quotes-unmatched");
});

test("a trailing comma or period inside the closing quote is not part of the match", () => {
  const { spec } = setup();
  const r = run(spec, draftOf('"The draft drifted a paragraph at a time," he said. Then: "nobody noticed until the ninth revision."\n'));
  assert.equal(r.status, "pass", JSON.stringify(r.findings));
});

test("a quote never spans a paragraph break", () => {
  const { spec } = setup();
  // Two stray quote marks in two paragraphs: no span is formed across the blank line, so there is
  // nothing to check.
  const r = run(spec, draftOf('He opened with "one thing that is not closed\n\nand this paragraph closes it" here.\n'));
  assert.equal(r.status, "pass", JSON.stringify(r.findings));
});

test("quotes inside inline code and fenced code are not checked", () => {
  const { spec } = setup();
  const text = 'Run `echo "this is not a real quote at all"` first.\n\n```\nsay "neither is this one here at all"\n```\n';
  const r = run(spec, draftOf(text));
  assert.equal(r.status, "pass", JSON.stringify(r.findings));
});

test("attributed to the right speaker (slug speaker matched as the words Gary Sheng) passes", () => {
  const { spec } = setup();
  const r = run(spec, draftOf('Gary Sheng put it this way: "A spec that a linter can check is a different object."\n'));
  assert.equal(r.status, "pass", JSON.stringify(r.findings));
});

// Ruling R8: a speaker is named when the sentence holds the full speaker value (hyphens read as
// spaces) OR the speaker's first word as a whole word, case-insensitive.
test("the speaker's first word alone attributes the quote (\"Gary said\" names gary-sheng)", () => {
  const { spec } = setup();
  const r = run(spec, draftOf('Gary said "A spec that a linter can check is a different object" once.\n'));
  assert.equal(r.status, "pass", JSON.stringify(r.findings));
});

test("the first word attributes case-insensitively, and a wrong first-word attribution is misattributed", () => {
  const { spec } = setup();
  const r = run(spec, draftOf('As GARY put it, "I stopped writing the weekly update by hand in August."\n'));
  assert.equal(r.status, "fail");
  assert.equal(r.findings[0].id, "station-quotes-misattributed");
  assert.match(r.findings[0].message, /gary-sheng/);
});

test("an unrelated name, or one that only starts with a speaker's first word, does not attribute", () => {
  const { spec } = setup();
  const tim = run(spec, draftOf('Tim said "I stopped writing the weekly update by hand in August" to me.\n'));
  assert.equal(tim.status, "pass", JSON.stringify(tim.findings));
  const garyson = run(spec, draftOf('Garyson said "I stopped writing the weekly update by hand in August" to me.\n'));
  assert.equal(garyson.status, "pass", JSON.stringify(garyson.findings));
});

test("the speaker name is matched case-insensitively", () => {
  const { spec } = setup();
  const r = run(spec, draftOf('As WILSON told me, "I stopped writing the weekly update by hand in August."\n'));
  assert.equal(r.status, "pass", JSON.stringify(r.findings));
});

test("attributed to the wrong speaker fails as misattributed, naming the speaker", () => {
  const { spec } = setup();
  const r = run(spec, draftOf('Wilson said "A spec that a linter can check is a different object" last week.\n'));
  assert.equal(r.status, "fail");
  assert.equal(r.findings.length, 1);
  assert.equal(r.findings[0].id, "station-quotes-misattributed");
  assert.match(r.findings[0].message, /Wilson/);
  assert.equal(r.findings[0].line, 1);
});

test("an attributed quote that matches only a story segment is misattributed", () => {
  const { spec } = setup();
  const r = run(spec, draftOf('Gary Sheng said "nobody noticed until the ninth revision" to me.\n'));
  assert.equal(r.status, "fail");
  assert.equal(r.findings[0].id, "station-quotes-misattributed");
});

test("attribution is read in the same sentence only", () => {
  const { spec } = setup();
  const r = run(spec, draftOf('Wilson was there. Someone said "A spec that a linter can check is a different object" later.\n'));
  assert.equal(r.status, "pass", JSON.stringify(r.findings));
});

test("a speaker name inside the quote itself is not an attribution", () => {
  const { spec } = workspace([
    { label: "quote", speaker: "Gary", text: "Ask Wilson how the weekly update gets written now." },
  ], "hs-quotes-");
  const r = run(spec, draftOf('Someone said "Ask Wilson how the weekly update gets written now" to me.\n'));
  assert.equal(r.status, "pass", JSON.stringify(r.findings));
});

test("a speaker name that is only part of a longer word is not an attribution", () => {
  const { spec } = setup();
  const r = run(spec, draftOf('The Wilsonian view: "A spec that a linter can check is a different object" holds.\n'));
  assert.equal(r.status, "pass", JSON.stringify(r.findings));
});

test("quotes are matched across every marked material, not only the first", () => {
  const ws = setup();
  markMaterial(ws.dir, [{ label: "quote", speaker: "Tim", text: "The second material has its own words in it." }], { path: "materials/second.md", id: "m2" });
  const spec = loadSpec(ws.specPath);
  spec.data.writing.materials.items.push({ id: "m2", path: "materials/second.md", segments: "materials/second.md.segments.jsonl" });
  const r = run(spec, draftOf('Tim said "The second material has its own words in it" once.\n'));
  assert.equal(r.status, "pass", JSON.stringify(r.findings));
});

test("a long unmatched span is quoted at most 80 characters in the message", () => {
  const { spec } = setup();
  const long = Array.from({ length: 30 }, (_, i) => `word${i}`).join(" ");
  const r = run(spec, draftOf(`He said "${long}" then left.\n`));
  assert.equal(r.status, "fail");
  const quoted = r.findings[0].message.match(/"([^"]*)"/)[1];
  assert.ok(quoted.length <= 80, quoted);
});

test("each failing span is its own finding", () => {
  const { spec } = setup();
  const r = run(spec, draftOf('First "one two three four five" and then "six seven eight nine ten" too.\n'));
  assert.equal(r.findings.length, 2);
  assert.ok(r.findings.every((f) => f.id === "station-quotes-unmatched"));
});

test("CRLF: a matching quote passes and an unmatched one reports the right line", () => {
  const { spec } = setup();
  const ok = run(spec, draftOf(crlf('# Claim\n\nGary Sheng said "A spec that a linter can check is a different object."\n')));
  assert.equal(ok.status, "pass", JSON.stringify(ok.findings));
  const bad = run(spec, draftOf(crlf('# Claim\n\nIntro line.\n\nThey said "a spec is just a very long prompt" once.\n')));
  assert.equal(bad.status, "fail");
  assert.equal(bad.findings[0].line, 5);
});

test("hyperspec check --only quotes runs the station on a lint-clean spec", () => {
  const ws = setup();
  writeFileSync(ws.draftPath, 'They said "a spec is just a very long prompt" once.\n');
  const r = cli("check", ws.specPath, "--draft", ws.draftPath, "--only", "quotes", "--json");
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const out = JSON.parse(r.stdout);
  const quotes = out.stations.find((s) => s.station === "quotes");
  assert.equal(quotes.status, "fail");
  assert.equal(quotes.findings[0].id, "station-quotes-unmatched");
  writeFileSync(ws.draftPath, 'Gary Sheng said "A spec that a linter can check is a different object."\n');
  const r2 = cli("check", ws.specPath, "--draft", join(ws.dir, "draft.md"), "--only", "quotes");
  assert.equal(r2.status, 0, r2.stdout + r2.stderr);
});

// A speaker's first word names the speaker alone only when it has 2 or more letters and is not a
// stopword; the full value still names it.
test("a speaker starting with \"the\" is not named by its first word, only by its full value", () => {
  const { spec } = workspace([
    { label: "quote", speaker: "the manager interviewed", text: "Wait. Count to five. The real answer is the second one." },
    { label: "story", teller: "example-author", text: "Then the report said the real answer was the second one, every time we met." },
  ], "hs-quotes-");
  // "the" appears in this sentence; before the guard it named the speaker and made a story quote misattributed.
  const story = run(spec, draftOf('In the end the report said "the real answer was the second one" to me.\n'));
  assert.equal(story.status, "pass", JSON.stringify(story.findings));
  const full = run(spec, draftOf('As the manager interviewed said, "the real answer was the second one" every time.\n'));
  assert.equal(full.status, "fail");
  assert.equal(full.findings[0].id, "station-quotes-misattributed");
});

test("the first-word guard: stopwords and one-letter words never name a speaker alone; names do", async () => {
  const { speakerPattern } = await import("../src/stations/quotes.mjs");
  assert.equal(speakerPattern("the manager interviewed").test("the report"), false);
  assert.equal(speakerPattern("the manager interviewed").test("The manager interviewed said"), true);
  assert.equal(speakerPattern("a manager").test("a report"), false);
  assert.equal(speakerPattern("j smith").test("j said"), false);
  assert.equal(speakerPattern("j smith").test("J Smith said"), true);
  assert.equal(speakerPattern("dana, an engineering manager").test("Dana said"), true);
  assert.equal(speakerPattern("gary-sheng").test("Gary said"), true);
});

test("fiction: true skips the station with its reason and checks nothing", () => {
  const { spec } = setup();
  spec.data.fiction = "true";
  const r = run(spec, draftOf('She said "this line is in no material anywhere at all" and left.\n'));
  assert.equal(r.status, "skip");
  assert.equal(r.reason, "fiction dialogue is checked by the character stations in a later release");
  assert.deepEqual(r.findings, []);
  spec.data.fiction = "false";
  assert.equal(run(spec, draftOf('She said "this line is in no material anywhere at all" and left.\n')).status, "fail", "fiction: false still checks");
});
