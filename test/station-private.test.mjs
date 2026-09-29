import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { run } from "../src/stations/private.mjs";
import { workspace, markMaterial, draftOf, crlf, cli } from "./station-fixture.mjs";
import { loadSpec } from "../src/load.mjs";

// m1, re-marked with a long private passage (s2), a short private one (s4, under 8 words), and
// non-private segments that may be repeated freely.
const PRIVATE_LONG = "The investor meeting went badly, and we don't mention the number they offered anywhere public.";
const MATERIAL = [
  { label: "aside", text: "Raw transcript, call, 2026-09-28." },
  { label: "private", text: PRIVATE_LONG },
  { label: "quote", speaker: "Wilson", text: "I stopped writing the weekly update by hand in August and never looked back." },
  { label: "private", text: "Her diagnosis came back Tuesday." },
];

const setup = () => workspace(MATERIAL, "hs-private-");

test("a draft that repeats no private run passes", () => {
  const { spec } = setup();
  const r = run(spec, draftOf("A hyperspec is a contract a linter can check.\n"));
  assert.equal(r.station, "private");
  assert.equal(r.status, "pass");
  assert.deepEqual(r.findings, []);
});

test("8 consecutive words of a private segment fail, naming material, segment, run and line", () => {
  const { spec } = setup();
  const r = run(spec, draftOf("# Claim\n\nIntro.\n\nHonestly, we don't mention the number they offered anywhere, ever.\n"));
  assert.equal(r.status, "fail");
  assert.equal(r.findings.length, 1);
  const f = r.findings[0];
  assert.equal(f.id, "station-private-leak");
  assert.equal(f.station, "private");
  assert.equal(f.severity, "fail");
  assert.equal(f.line, 5);
  assert.match(f.message, /material m1/);
  assert.match(f.message, /segment s2/);
  assert.match(f.message, /"we dont mention the number they offered anywhere"/);
});

test("7 consecutive words of a long private segment pass", () => {
  const { spec } = setup();
  const r = run(spec, draftOf("They said we don't mention the number they offered. Fine.\n"));
  assert.equal(r.status, "pass", JSON.stringify(r.findings));
});

test("matching ignores case, punctuation and whitespace", () => {
  const { spec } = setup();
  const r = run(spec, draftOf("THE INVESTOR -- meeting... went\n  badly; and we DON’T mention them.\n"));
  assert.equal(r.status, "fail");
  assert.match(r.findings[0].message, /"the investor meeting went badly and we dont mention"/);
});

test("the leaked run is reported whole (longest shared run), not as its first 8 words", () => {
  const { spec } = setup();
  const r = run(spec, draftOf(`${PRIVATE_LONG}\n`));
  assert.equal(r.findings.length, 1);
  assert.match(r.findings[0].message, /the investor meeting went badly and we dont mention the number/);
});

test("the leaked run is quoted at most 80 characters", () => {
  const { spec } = setup();
  const r = run(spec, draftOf(`${PRIVATE_LONG}\n`));
  const quoted = r.findings[0].message.match(/"([^"]*)"/)[1];
  assert.ok(quoted.length <= 80, quoted);
});

test("two separate leaked runs from one segment are two findings", () => {
  const { spec } = workspace([
    { label: "private", text: "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty" },
  ], "hs-private-");
  const r = run(spec, draftOf("one two three four five six seven eight. Unrelated words here. thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty.\n"));
  assert.equal(r.findings.length, 2);
  assert.ok(r.findings.every((f) => f.id === "station-private-leak"));
});

test("a private segment of 4 to 7 words fails only when it appears whole", () => {
  const { spec } = setup();
  const whole = run(spec, draftOf("I heard her diagnosis came back Tuesday, which was hard.\n"));
  assert.equal(whole.status, "fail");
  assert.match(whole.findings[0].message, /segment s4/);
  const part = run(spec, draftOf("Her diagnosis came back, eventually.\n"));
  assert.equal(part.status, "pass", JSON.stringify(part.findings));
});

// Ruling R6: a private segment under 4 words is not checked (it would fire on common words), and the
// station reports how many it skipped as ONE warning carrying the count and never the text.
test("a private segment under 4 words is skipped, reported as one warn finding with the count and no text", () => {
  const { spec } = workspace([
    { label: "aside", text: "Raw transcript, call, 2026-09-28." },
    { label: "private", text: "Yes, Tuesday." },
    { label: "private", text: "Call her mother." },
  ], "hs-private-");
  const r = run(spec, draftOf("Yes, Tuesday works. Call her mother about it.\n"));
  assert.equal(r.status, "pass", JSON.stringify(r.findings));
  assert.equal(r.findings.length, 1);
  const f = r.findings[0];
  assert.equal(f.id, "station-private-short-skipped");
  assert.equal(f.station, "private");
  assert.equal(f.severity, "warn");
  assert.match(f.message, /\b2\b/);
  assert.equal(f.line, undefined);
  for (const word of ["yes", "tuesday", "mother"]) assert.ok(!f.message.toLowerCase().includes(word), f.message);
});

test("a skipped short segment does not hide a real leak from another segment", () => {
  const { spec } = workspace([
    { label: "private", text: "Yes, Tuesday." },
    { label: "private", text: PRIVATE_LONG },
  ], "hs-private-");
  const r = run(spec, draftOf("we don't mention the number they offered anywhere public\n"));
  assert.equal(r.status, "fail");
  assert.deepEqual(r.findings.map((f) => f.id).sort(), ["station-private-leak", "station-private-short-skipped"]);
  assert.match(r.findings.find((f) => f.id === "station-private-short-skipped").message, /\b1\b/);
});

test("a private segment of exactly 4 words is checked whole", () => {
  const { spec } = workspace([{ label: "private", text: "Her diagnosis came back." }], "hs-private-");
  assert.equal(run(spec, draftOf("I heard her diagnosis came back today.\n")).status, "fail");
  assert.equal(run(spec, draftOf("Her diagnosis, eventually, came back.\n")).status, "pass");
});

test("a non-private segment may be repeated verbatim", () => {
  const { spec } = setup();
  const r = run(spec, draftOf("I stopped writing the weekly update by hand in August and never looked back.\n"));
  assert.equal(r.status, "pass", JSON.stringify(r.findings));
});

test("private text inside inline code or a fence is not a leak", () => {
  const { spec } = setup();
  const r = run(spec, draftOf("See `we don't mention the number they offered anywhere public` there.\n\n```\nthe investor meeting went badly and we don't mention\n```\n"));
  assert.equal(r.status, "pass", JSON.stringify(r.findings));
});

test("private segments in every marked material are checked", () => {
  const ws = setup();
  markMaterial(ws.dir, [{ label: "private", text: "the second material has a private line of its own here" }], { path: "materials/second.md", id: "m2" });
  const spec = loadSpec(ws.specPath);
  spec.data.writing.materials.items.push({ id: "m2", path: "materials/second.md", segments: "materials/second.md.segments.jsonl" });
  const r = run(spec, draftOf("Note: the second material has a private line of its own.\n"));
  assert.equal(r.status, "fail");
  assert.match(r.findings[0].message, /material m2, segment s1/);
});

test("CRLF: a leak reports the right line, and a clean draft passes", () => {
  const { spec } = setup();
  const bad = run(spec, draftOf(crlf("# Claim\n\nIntro.\n\nwe don't mention the number they offered anywhere public\n")));
  assert.equal(bad.status, "fail");
  assert.equal(bad.findings[0].line, 5);
  const ok = run(spec, draftOf(crlf("# Claim\n\nNothing private here at all.\n")));
  assert.equal(ok.status, "pass");
});

test("hyperspec check --only private runs the station on a lint-clean spec", () => {
  const ws = setup();
  writeFileSync(ws.draftPath, "we don't mention the number they offered anywhere public\n");
  const r = cli("check", ws.specPath, "--draft", ws.draftPath, "--only", "private");
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /private: fail/);
  assert.match(r.stdout, /station-private-leak/);
});
