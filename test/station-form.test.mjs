import { test } from "node:test";
import assert from "node:assert/strict";
import { run } from "../src/stations/form.mjs";

// A minimal spec, just deep enough for the form station to read writing.form off it.
function specWith(form) {
  return { data: { writing: { form } } };
}

function draftOf(text) {
  return { path: "draft.md", text, lines: text.split("\n"), sha256: "" };
}

const FORM = {
  name: "essay",
  length: { min: 10, max: 20, unit: "words" },
  required_parts: ["claim", "evidence", "close"],
};

const words = (n, prefix = "w") => Array.from({ length: n }, (_, i) => `${prefix}${i}`).join(" ");

test("passes: word count in range, every required part present as a heading", () => {
  const draft = draftOf(`# Claim\n\n${words(5)}\n\n# Evidence\n\n${words(5)}\n\n# Close\n\nDone.`);
  const result = run(specWith(FORM), draft);
  assert.equal(result.station, "form");
  assert.equal(result.status, "pass");
  assert.deepEqual(result.findings, []);
});

test("required part matches heading case-insensitively, any of 1-6 #s", () => {
  const draft = draftOf(`### claim\n\n${words(5)}\n\n###### EVIDENCE\n\n${words(5)}\n\n# ClOsE\n\nDone.`);
  const result = run(specWith(FORM), draft);
  assert.equal(result.status, "pass");
});

test("required part matches a leading 'part:' line, no heading needed", () => {
  const draft = draftOf(`Claim: ${words(4)}\nEvidence: ${words(4)}\nClose: ${words(4)}`);
  const result = run(specWith(FORM), draft);
  assert.equal(result.status, "pass");
});

test("a colon-line match is case-insensitive and ignores leading whitespace", () => {
  const draft = draftOf(`  CLAIM: ${words(4)}\nevidence: ${words(4)}\nClose: ${words(4)}`);
  const result = run(specWith(FORM), draft);
  assert.equal(result.status, "pass");
});

test("word count below min fails, naming the measured length and the range", () => {
  const draft = draftOf(`# Claim\n\n# Evidence\n\n# Close\n\ntoo short`);
  const result = run(specWith(FORM), draft);
  assert.equal(result.status, "fail");
  const f = result.findings.find((x) => x.id === "station-form-length");
  assert.ok(f, "expected a station-form-length finding");
  assert.equal(f.station, "form");
  assert.equal(f.severity, "fail");
  assert.match(f.message, /word count 5 is outside writing\.form\.length \(10 to 20 words\)/);
});

test("word count above max fails the same way", () => {
  const draft = draftOf(`# Claim\n\n# Evidence\n\n# Close\n\n${words(30)}`);
  const result = run(specWith(FORM), draft);
  const f = result.findings.find((x) => x.id === "station-form-length");
  assert.ok(f);
  assert.match(f.message, /word count 33 is outside writing\.form\.length \(10 to 20 words\)/);
});

test("a missing required part fails, naming the part, and does not stop the other checks", () => {
  const draft = draftOf(`# Claim\n\n${words(5)}\n\n# Close\n\n${words(5)}`);
  const result = run(specWith(FORM), draft);
  assert.equal(result.status, "fail");
  const f = result.findings.find((x) => x.id === "station-form-required-part-evidence");
  assert.ok(f, "expected a missing-part finding for evidence");
  assert.match(f.message, /required part "evidence" does not appear as a heading or a "evidence:" line/);
  // Length still measured and still in range: only the missing part fails.
  assert.equal(result.findings.some((x) => x.id === "station-form-length"), false);
});

test("every missing part gets its own finding", () => {
  const draft = draftOf(words(15));
  const result = run(specWith(FORM), draft);
  const ids = result.findings.map((x) => x.id).sort();
  assert.deepEqual(ids, [
    "station-form-required-part-claim",
    "station-form-required-part-close",
    "station-form-required-part-evidence",
  ]);
});

test("a heading with no leading whitespace only: an indented '#' line is not read as a heading", () => {
  const form = { ...FORM, required_parts: ["claim"] };
  const draft = draftOf(`  # Claim\n\n${words(15)}`);
  const result = run(specWith(form), draft);
  assert.equal(result.findings.some((x) => x.id === "station-form-required-part-claim"), true);
});

test("length.unit other than words: skip, with a reason naming the unit, no findings", () => {
  const form = { ...FORM, length: { min: 10, max: 20, unit: "characters" } };
  const draft = draftOf("anything at all");
  const result = run(specWith(form), draft);
  assert.equal(result.status, "skip");
  assert.equal(result.findings.length, 0);
  assert.equal(result.reason, "length unit characters is not measured yet");
});

test("length.unit missing entirely: skip, reason names it as (none)", () => {
  const form = { name: "essay", length: { min: 10, max: 20 }, required_parts: ["claim"] };
  const result = run(specWith(form), draftOf("x"));
  assert.equal(result.status, "skip");
  assert.equal(result.reason, "length unit (none) is not measured yet");
});

test("length.unit is matched case-insensitively and trimmed: 'Words', 'WORDS', ' words ' all measure length", () => {
  for (const unit of ["Words", "WORDS", " words ", "wOrDs"]) {
    const form = { ...FORM, length: { min: 10, max: 20, unit } };
    const draft = draftOf(`# Claim\n\n# Evidence\n\n# Close\n\n${words(2)}`);
    const result = run(specWith(form), draft);
    assert.equal(result.status, "fail", `unit "${unit}" should still measure length, not skip`);
    assert.ok(result.findings.some((x) => x.id === "station-form-length"), `unit "${unit}"`);
  }
});

test("two required parts that slug to the same id both still get a distinct finding", () => {
  const form = { ...FORM, required_parts: ["Close!", "close?"] };
  const draft = draftOf(words(15));
  const result = run(specWith(form), draft);
  const ids = result.findings.map((x) => x.id).sort();
  assert.deepEqual(ids, ["station-form-required-part-close", "station-form-required-part-close-2"]);
});
