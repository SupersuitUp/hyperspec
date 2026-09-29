import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tempDir } from "./tmp.mjs";
import { splitSegments, readSegments } from "../src/segments.mjs";
import { sha256 } from "../src/hash.mjs";
import { MATERIAL_LABELS } from "../src/writing.mjs";

const fails = (findings) => findings.filter((x) => x.severity === "fail");
const ids = (findings) => fails(findings).map((x) => x.id).sort();

// A material file plus its segments file, written into a fresh temp dir, mirroring how the
// header's path field records the material's own path alongside it (the constraints' sample:
// {"material":"m1","path":"materials/call.md",...} is relative to wherever the spec resolves it;
// here both files sit in the same temp dir, so a bare filename is enough).
function write(dir, materialText, segmentsLines) {
  const materialPath = join(dir, "material.md");
  writeFileSync(materialPath, materialText);
  const segmentsPath = join(dir, "material.md.segments.jsonl");
  writeFileSync(segmentsPath, `${segmentsLines.join("\n")}\n`);
  return { materialPath, segmentsPath };
}

function headerFor(materialPath, material = "m1") {
  return JSON.stringify({ material, path: materialPath, sha256: sha256(readFileSync(materialPath)) });
}

// Build a segment object from the ACTUAL substring position in the material text, so a test never
// has to hand-count character offsets (a source of exactly the kind of subtle off-by-one bug the
// verbatim/coverage rules exist to catch). fromIndex lets two identical substrings ("Two." meeting
// "Two.") each anchor to a distinct occurrence when needed.
function seg(materialText, id, label, substr, extra = {}, fromIndex = 0) {
  const start = materialText.indexOf(substr, fromIndex);
  assert.notEqual(start, -1, `"${substr}" not found in material text (from index ${fromIndex})`);
  return { id, start, end: start + substr.length, label, ...extra, text: substr };
}

// ---------------------------------------------------------------------------------------------
// splitSegments: paragraph mode

test("splitSegments paragraph: blank lines separate paragraphs, and the blank line itself is excluded", () => {
  const text = "First paragraph.\n\nSecond paragraph.";
  const segs = splitSegments(text, { by: "paragraph" });
  assert.deepEqual(segs.map((s) => s.text), ["First paragraph.", "Second paragraph."]);
  for (const s of segs) assert.equal(text.slice(s.start, s.end), s.text);
  assert.deepEqual(segs.map((s) => s.id), ["s1", "s2"]);
  assert.ok(segs.every((s) => s.label === "unlabeled"));
});

test("splitSegments paragraph: a multi-line paragraph keeps its internal single newline", () => {
  const text = "Line one.\nLine two.\n\nSecond para.";
  const segs = splitSegments(text, { by: "paragraph" });
  assert.deepEqual(segs.map((s) => s.text), ["Line one.\nLine two.", "Second para."]);
});

test("splitSegments paragraph: multiple consecutive blank lines still separate exactly two paragraphs", () => {
  const text = "A.\n\n\n\nB.";
  const segs = splitSegments(text, { by: "paragraph" });
  assert.deepEqual(segs.map((s) => s.text), ["A.", "B."]);
});

test("splitSegments paragraph: leading and trailing blank lines never produce an empty segment", () => {
  const text = "\n\nOnly paragraph.\n\n\n";
  const segs = splitSegments(text, { by: "paragraph" });
  assert.deepEqual(segs.map((s) => s.text), ["Only paragraph."]);
});

test("splitSegments paragraph: a single trailing newline never produces a phantom empty segment", () => {
  const text = "One.\n\nTwo.\n";
  const segs = splitSegments(text, { by: "paragraph" });
  assert.deepEqual(segs.map((s) => s.text), ["One.", "Two."]);
});

test("splitSegments paragraph: CRLF is kept as-is inside a segment, and a CRLF blank line still separates", () => {
  const text = "First.\r\n\r\nSecond line one.\r\nSecond line two.\r\n";
  const segs = splitSegments(text, { by: "paragraph" });
  assert.deepEqual(segs.map((s) => s.text), ["First.", "Second line one.\r\nSecond line two."]);
  // The \r before the internal \n survives untouched: offsets count both characters.
  assert.ok(segs[1].text.includes("\r\n"));
  for (const s of segs) assert.equal(text.slice(s.start, s.end), s.text);
});

test("splitSegments paragraph: an empty document has no segments", () => {
  assert.deepEqual(splitSegments("", { by: "paragraph" }), []);
  assert.deepEqual(splitSegments("\n\n\n", { by: "paragraph" }), []);
});

test("splitSegments paragraph: a multi-byte unicode paragraph splits and slices cleanly", () => {
  const text = "café 😀 first.\n\n日本語 second.";
  const segs = splitSegments(text, { by: "paragraph" });
  assert.deepEqual(segs.map((s) => s.text), ["café 😀 first.", "日本語 second."]);
  for (const s of segs) assert.equal(text.slice(s.start, s.end), s.text);
});

// ---------------------------------------------------------------------------------------------
// splitSegments: sentence mode

test("splitSegments sentence: splits on ./?/! followed by whitespace, and drops the separating whitespace", () => {
  const text = "First one. Second one? Third one!";
  const segs = splitSegments(text, { by: "sentence" });
  assert.deepEqual(segs.map((s) => s.text), ["First one.", "Second one?", "Third one!"]);
  for (const s of segs) assert.equal(text.slice(s.start, s.end), s.text);
});

test("splitSegments sentence: a period inside a quoted span on the same line is never a boundary", () => {
  // "Wait." is inside quotes; the only real (unquoted) sentence terminator is the final period
  // after "left", so the whole line is one sentence. This is the documented, deterministic
  // semantics: punctuation strictly inside an open quote is suppressed, and the next real,
  // unquoted terminator is where the boundary lands.
  const text = 'She said, "Wait." Then left.';
  const segs = splitSegments(text, { by: "sentence" });
  assert.deepEqual(segs.map((s) => s.text), [text]);
});

test("splitSegments sentence: an unterminated quote never suppresses boundaries past the end of its line", () => {
  const text = 'He opened with "an unclosed quote. Then a real sentence.';
  const segs = splitSegments(text, { by: "sentence" });
  // The quote never closes on line 1 (there is only one line here), so under the "on one line"
  // rule the quote state still resets at end of line — this text has one line, so both periods
  // are inside the same still-open quote and the whole thing is one sentence.
  assert.deepEqual(segs.map((s) => s.text), [text]);
});

test("splitSegments sentence: quote state resets at a line break, so a boundary past the break fires that would not fire on one line", () => {
  // With a newline after the unclosed quote, the reset lets the period after "here" (now outside
  // any open quote) act as a real boundary: two sentences.
  const withBreak = 'He said "hello\nA sentence ends here. Another starts.';
  assert.deepEqual(splitSegments(withBreak, { by: "sentence" }).map((s) => s.text), [
    'He said "hello\nA sentence ends here.',
    "Another starts.",
  ]);
  // The same text with the newline flattened to a space: the quote never resets, stays open
  // through the whole thing, and every period is suppressed — one sentence.
  const oneLine = 'He said "hello A sentence ends here. Another starts.';
  assert.deepEqual(splitSegments(oneLine, { by: "sentence" }).map((s) => s.text), [oneLine]);
});

test("splitSegments sentence: leading/trailing whitespace and inter-sentence whitespace are excluded", () => {
  const text = "  First.   Second.  ";
  const segs = splitSegments(text, { by: "sentence" });
  assert.deepEqual(segs.map((s) => s.text), ["First.", "Second."]);
});

test("splitSegments sentence: trailing content with no terminal punctuation is still one final segment", () => {
  const text = "Done here. No period on this last bit";
  const segs = splitSegments(text, { by: "sentence" });
  assert.deepEqual(segs.map((s) => s.text), ["Done here.", "No period on this last bit"]);
});

test("splitSegments: an unknown `by` value throws", () => {
  assert.throws(() => splitSegments("x", { by: "word" }), RangeError);
});

// ---------------------------------------------------------------------------------------------
// readSegments: missing/unreadable file

test("readSegments: a missing segments file is one test-1 finding, never a throw", () => {
  const d = tempDir("hs-seg-");
  const r = readSegments(join(d, "nope.segments.jsonl"), { materialPath: join(d, "nope.md") });
  assert.equal(r.header, null);
  assert.deepEqual(r.segments, []);
  assert.deepEqual(ids(r.findings), ["writing-materials-missing"]);
  assert.equal(fails(r.findings)[0].test, 1);
});

// ---------------------------------------------------------------------------------------------
// readSegments: header validation

test("readSegments: a header line that is not valid JSON is one test-1 finding", () => {
  const d = tempDir("hs-seg-");
  const { materialPath, segmentsPath } = write(d, "Hello.", ["not json at all"]);
  const r = readSegments(segmentsPath, { materialPath });
  assert.equal(r.header, null);
  assert.ok(ids(r.findings).includes("writing-materials-header"));
});

test("readSegments: a header missing material/path/sha256 fails test 1 once per missing field", () => {
  const d = tempDir("hs-seg-");
  writeFileSync(join(d, "material.md"), "Hello.");
  const segmentsPath = join(d, "material.md.segments.jsonl");
  writeFileSync(segmentsPath, `${JSON.stringify({ material: "m1" })}\n`);
  const r = readSegments(segmentsPath, { materialPath: join(d, "material.md") });
  const headerFindings = fails(r.findings).filter((x) => x.id === "writing-materials-header");
  assert.equal(headerFindings.length, 2); // path and sha256 missing
  assert.ok(headerFindings.every((x) => x.test === 1));
});

test("readSegments: materialId given, header names a different material: one test-1 finding", () => {
  const d = tempDir("hs-seg-");
  const materialPath = join(d, "material.md");
  writeFileSync(materialPath, "Hello.");
  const segmentsPath = join(d, "material.md.segments.jsonl");
  writeFileSync(segmentsPath, `${headerFor(materialPath, "m1")}\n`);
  const r = readSegments(segmentsPath, { materialPath, materialId: "m2" });
  assert.ok(ids(r.findings).includes("writing-materials-header-material"));
  assert.equal(fails(r.findings).find((x) => x.id === "writing-materials-header-material").test, 1);
});

test("readSegments: materialId matching the header's material produces no header-material finding", () => {
  const d = tempDir("hs-seg-");
  const materialPath = join(d, "material.md");
  writeFileSync(materialPath, "Hello.");
  const segmentsPath = join(d, "material.md.segments.jsonl");
  writeFileSync(segmentsPath, `${headerFor(materialPath, "m1")}\n{"id":"s1","start":0,"end":6,"label":"stance","text":"Hello."}\n`);
  const r = readSegments(segmentsPath, { materialPath, materialId: "m1" });
  assert.deepEqual(fails(r.findings), []);
});

// ---------------------------------------------------------------------------------------------
// readSegments: malformed JSONL segment lines

test("readSegments: a segment line that is not valid JSON is one test-1 finding, naming the line", () => {
  const d = tempDir("hs-seg-");
  const materialPath = join(d, "material.md");
  writeFileSync(materialPath, "Hello.");
  const segmentsPath = join(d, "material.md.segments.jsonl");
  writeFileSync(segmentsPath, `${headerFor(materialPath)}\nnot json\n`);
  const r = readSegments(segmentsPath, { materialPath });
  assert.ok(ids(r.findings).includes("writing-materials-json-line-2"));
  assert.equal(fails(r.findings).find((x) => x.id === "writing-materials-json-line-2").test, 1);
});

test("readSegments: a segment line that is a JSON array, not an object, is one test-1 finding", () => {
  const d = tempDir("hs-seg-");
  const materialPath = join(d, "material.md");
  writeFileSync(materialPath, "Hello.");
  const segmentsPath = join(d, "material.md.segments.jsonl");
  writeFileSync(segmentsPath, `${headerFor(materialPath)}\n[1,2,3]\n`);
  const r = readSegments(segmentsPath, { materialPath });
  assert.ok(ids(r.findings).includes("writing-materials-json-line-2"));
});

// ---------------------------------------------------------------------------------------------
// readSegments: ids

test("readSegments: a segment with no id is one test-1 finding, naming the line", () => {
  const d = tempDir("hs-seg-");
  const materialPath = join(d, "material.md");
  writeFileSync(materialPath, "Hello.");
  const segmentsPath = join(d, "material.md.segments.jsonl");
  writeFileSync(segmentsPath, `${headerFor(materialPath)}\n${JSON.stringify({ start: 0, end: 6, label: "stance", text: "Hello." })}\n`);
  const r = readSegments(segmentsPath, { materialPath });
  assert.ok(ids(r.findings).includes("writing-materials-segment-id-2"));
});

test("readSegments: a duplicate segment id fails test 1 once, not once per repeat", () => {
  const d = tempDir("hs-seg-");
  const materialPath = join(d, "material.md");
  writeFileSync(materialPath, "One. Two. Three.");
  const segmentsPath = join(d, "material.md.segments.jsonl");
  const lines = [
    headerFor(materialPath),
    JSON.stringify({ id: "s1", start: 0, end: 4, label: "stance", text: "One." }),
    JSON.stringify({ id: "s1", start: 5, end: 9, label: "stance", text: "Two." }),
    JSON.stringify({ id: "s1", start: 10, end: 16, label: "stance", text: "Three." }),
  ];
  writeFileSync(segmentsPath, `${lines.join("\n")}\n`);
  const r = readSegments(segmentsPath, { materialPath });
  const dupFindings = fails(r.findings).filter((x) => x.id === "writing-materials-segment-id");
  assert.equal(dupFindings.length, 1);
  assert.equal(dupFindings[0].test, 1);
});

// ---------------------------------------------------------------------------------------------
// readSegments: labels

test("readSegments: MATERIAL_LABELS stays the closed set this module checks against", () => {
  assert.deepEqual(MATERIAL_LABELS, ["claim", "story", "quote", "stance", "question", "aside", "private"]);
});

test("readSegments: a segment labeled 'unlabeled' fails test 1 with an 'is still unlabeled' message", () => {
  const d = tempDir("hs-seg-");
  const materialPath = join(d, "material.md");
  writeFileSync(materialPath, "Hello.");
  const segmentsPath = join(d, "material.md.segments.jsonl");
  writeFileSync(segmentsPath, `${headerFor(materialPath)}\n${JSON.stringify({ id: "s1", start: 0, end: 6, label: "unlabeled", text: "Hello." })}\n`);
  const r = readSegments(segmentsPath, { materialPath });
  const finding = fails(r.findings).find((x) => x.id === "writing-materials-label-s1");
  assert.ok(finding);
  assert.equal(finding.test, 1);
  assert.match(finding.message, /still unlabeled/);
});

test("readSegments: a label outside the closed set fails test 1", () => {
  const d = tempDir("hs-seg-");
  const materialPath = join(d, "material.md");
  writeFileSync(materialPath, "Hello.");
  const segmentsPath = join(d, "material.md.segments.jsonl");
  writeFileSync(segmentsPath, `${headerFor(materialPath)}\n${JSON.stringify({ id: "s1", start: 0, end: 6, label: "opinion", text: "Hello." })}\n`);
  const r = readSegments(segmentsPath, { materialPath });
  const finding = fails(r.findings).find((x) => x.id === "writing-materials-label-s1");
  assert.ok(finding);
  assert.equal(finding.test, 1);
});

// ---------------------------------------------------------------------------------------------
// readSegments: per-label required fields (test 4)

test("readSegments: a claim with neither source nor own fails test 4", () => {
  const d = tempDir("hs-seg-");
  const materialPath = join(d, "material.md");
  const text = "The sky is blue.";
  writeFileSync(materialPath, text);
  const segmentsPath = join(d, "material.md.segments.jsonl");
  writeFileSync(segmentsPath, `${headerFor(materialPath)}\n${JSON.stringify(seg(text, "s1", "claim", text))}\n`);
  const r = readSegments(segmentsPath, { materialPath });
  const finding = fails(r.findings).find((x) => x.id === "writing-materials-claim-source-s1");
  assert.ok(finding);
  assert.equal(finding.test, 4);
});

test("readSegments R1: own: true (JSON boolean) satisfies a claim with no source", () => {
  const d = tempDir("hs-seg-");
  const materialPath = join(d, "material.md");
  const text = "The sky is blue.";
  writeFileSync(materialPath, text);
  const segmentsPath = join(d, "material.md.segments.jsonl");
  writeFileSync(segmentsPath, `${headerFor(materialPath)}\n${JSON.stringify(seg(text, "s1", "claim", text, { own: true }))}\n`);
  const r = readSegments(segmentsPath, { materialPath });
  assert.deepEqual(fails(r.findings), []);
});

test('readSegments R1: own: "true" (the string) also satisfies a claim with no source', () => {
  const d = tempDir("hs-seg-");
  const materialPath = join(d, "material.md");
  const text = "The sky is blue.";
  writeFileSync(materialPath, text);
  const segmentsPath = join(d, "material.md.segments.jsonl");
  writeFileSync(segmentsPath, `${headerFor(materialPath)}\n${JSON.stringify(seg(text, "s1", "claim", text, { own: "true" }))}\n`);
  const r = readSegments(segmentsPath, { materialPath });
  assert.deepEqual(fails(r.findings), []);
});

test('readSegments R1: own: "false" or own: false do NOT satisfy a claim with no source', () => {
  const d = tempDir("hs-seg-");
  const materialPath = join(d, "material.md");
  const text = "A. B.";
  writeFileSync(materialPath, text);
  const segmentsPath = join(d, "material.md.segments.jsonl");
  const lines = [
    headerFor(materialPath),
    JSON.stringify(seg(text, "s1", "claim", "A.", { own: "false" })),
    JSON.stringify(seg(text, "s2", "claim", "B.", { own: false })),
  ];
  writeFileSync(segmentsPath, `${lines.join("\n")}\n`);
  const r = readSegments(segmentsPath, { materialPath });
  assert.deepEqual(ids(r.findings), ["writing-materials-claim-source-s1", "writing-materials-claim-source-s2"]);
});

test("readSegments: a claim with a real source passes", () => {
  const d = tempDir("hs-seg-");
  const materialPath = join(d, "material.md");
  const text = "The sky is blue.";
  writeFileSync(materialPath, text);
  const segmentsPath = join(d, "material.md.segments.jsonl");
  writeFileSync(segmentsPath, `${headerFor(materialPath)}\n${JSON.stringify(seg(text, "s1", "claim", text, { source: "https://example.com/sky" }))}\n`);
  const r = readSegments(segmentsPath, { materialPath });
  assert.deepEqual(fails(r.findings), []);
});

test("readSegments: a story with no teller fails test 4; with a teller it passes", () => {
  const d = tempDir("hs-seg-");
  const materialPath = join(d, "material.md");
  const text = "It happened once.";
  writeFileSync(materialPath, text);
  const segmentsPath = join(d, "material.md.segments.jsonl");
  writeFileSync(segmentsPath, `${headerFor(materialPath)}\n${JSON.stringify(seg(text, "s1", "story", text))}\n`);
  const r = readSegments(segmentsPath, { materialPath });
  const finding = fails(r.findings).find((x) => x.id === "writing-materials-story-teller-s1");
  assert.ok(finding);
  assert.equal(finding.test, 4);

  const d2 = tempDir("hs-seg-");
  const materialPath2 = join(d2, "material.md");
  writeFileSync(materialPath2, text);
  const segmentsPath2 = join(d2, "material.md.segments.jsonl");
  writeFileSync(segmentsPath2, `${headerFor(materialPath2)}\n${JSON.stringify(seg(text, "s1", "story", text, { teller: "example-author" }))}\n`);
  const r2 = readSegments(segmentsPath2, { materialPath: materialPath2 });
  assert.deepEqual(fails(r2.findings), []);
});

test("readSegments: a quote with no speaker fails test 4; with a speaker it passes", () => {
  const d = tempDir("hs-seg-");
  const materialPath = join(d, "material.md");
  const text = '"Exactly right."';
  writeFileSync(materialPath, text);
  const segmentsPath = join(d, "material.md.segments.jsonl");
  writeFileSync(segmentsPath, `${headerFor(materialPath)}\n${JSON.stringify(seg(text, "s1", "quote", text))}\n`);
  const r = readSegments(segmentsPath, { materialPath });
  const finding = fails(r.findings).find((x) => x.id === "writing-materials-quote-speaker-s1");
  assert.ok(finding);
  assert.equal(finding.test, 4);

  const d2 = tempDir("hs-seg-");
  const materialPath2 = join(d2, "material.md");
  writeFileSync(materialPath2, text);
  const segmentsPath2 = join(d2, "material.md.segments.jsonl");
  writeFileSync(segmentsPath2, `${headerFor(materialPath2)}\n${JSON.stringify(seg(text, "s1", "quote", text, { speaker: "example-speaker" }))}\n`);
  const r2 = readSegments(segmentsPath2, { materialPath: materialPath2 });
  assert.deepEqual(fails(r2.findings), []);
});

test("readSegments: stance, question, aside and private need no extra field", () => {
  const d = tempDir("hs-seg-");
  const materialPath = join(d, "material.md");
  const text = "It works. Does it? Off thread. Not for this reader.";
  writeFileSync(materialPath, text);
  const segmentsPath = join(d, "material.md.segments.jsonl");
  const lines = [
    headerFor(materialPath),
    JSON.stringify(seg(text, "s1", "stance", "It works.")),
    JSON.stringify(seg(text, "s2", "question", "Does it?")),
    JSON.stringify(seg(text, "s3", "aside", "Off thread.")),
    JSON.stringify(seg(text, "s4", "private", "Not for this reader.")),
  ];
  writeFileSync(segmentsPath, `${lines.join("\n")}\n`);
  const r = readSegments(segmentsPath, { materialPath });
  assert.deepEqual(fails(r.findings), []);
});

// ---------------------------------------------------------------------------------------------
// readSegments: verbatim text, shape, overlap, coverage, staleness (need materialPath)

test("readSegments: text not matching the material verbatim fails test 4", () => {
  const d = tempDir("hs-seg-");
  const materialPath = join(d, "material.md");
  const text = "The sky is blue.";
  writeFileSync(materialPath, text);
  const segmentsPath = join(d, "material.md.segments.jsonl");
  writeFileSync(segmentsPath, `${headerFor(materialPath)}\n${JSON.stringify({ id: "s1", start: 0, end: text.length, label: "stance", text: "The sky is green." })}\n`);
  const r = readSegments(segmentsPath, { materialPath });
  const finding = fails(r.findings).find((x) => x.id === "writing-materials-text-s1");
  assert.ok(finding);
  assert.equal(finding.test, 4);
});

test("readSegments: a stale sha256 (material edited after marking) fails test 4", () => {
  const d = tempDir("hs-seg-");
  const materialPath = join(d, "material.md");
  const text = "Original text.";
  writeFileSync(materialPath, text);
  const segmentsPath = join(d, "material.md.segments.jsonl");
  writeFileSync(segmentsPath, `${headerFor(materialPath)}\n${JSON.stringify(seg(text, "s1", "stance", text))}\n`);
  writeFileSync(materialPath, "Original text, edited afterward.");
  const r = readSegments(segmentsPath, { materialPath });
  const finding = fails(r.findings).find((x) => x.id === "writing-materials-stale");
  assert.ok(finding);
  assert.equal(finding.test, 4);
});

test("readSegments: overlapping segments fail test 1", () => {
  const d = tempDir("hs-seg-");
  const materialPath = join(d, "material.md");
  const text = "One two three.";
  writeFileSync(materialPath, text);
  const segmentsPath = join(d, "material.md.segments.jsonl");
  const lines = [
    headerFor(materialPath),
    JSON.stringify(seg(text, "s1", "stance", "One two ")),
    JSON.stringify(seg(text, "s2", "stance", "two three.")),
  ];
  writeFileSync(segmentsPath, `${lines.join("\n")}\n`);
  const r = readSegments(segmentsPath, { materialPath });
  const finding = fails(r.findings).find((x) => x.id === "writing-materials-overlap");
  assert.ok(finding);
  assert.equal(finding.test, 1);
});

test("readSegments: a non-whitespace gap not covered by any segment fails test 1", () => {
  const d = tempDir("hs-seg-");
  const materialPath = join(d, "material.md");
  const text = "One. Two. Three.";
  writeFileSync(materialPath, text);
  const segmentsPath = join(d, "material.md.segments.jsonl");
  const lines = [
    headerFor(materialPath),
    JSON.stringify(seg(text, "s1", "stance", "One.")),
    // The gap between "One." and "Three." covers " Two. " (non-whitespace inside it), left
    // uncovered here on purpose.
    JSON.stringify(seg(text, "s2", "stance", "Three.")),
  ];
  writeFileSync(segmentsPath, `${lines.join("\n")}\n`);
  const r = readSegments(segmentsPath, { materialPath });
  const finding = fails(r.findings).find((x) => x.id === "writing-materials-coverage");
  assert.ok(finding);
  assert.equal(finding.test, 1);
});

test("readSegments: a whitespace-only gap between segments does not fail coverage", () => {
  const d = tempDir("hs-seg-");
  const materialPath = join(d, "material.md");
  const text = "One. Two.";
  writeFileSync(materialPath, text);
  const segmentsPath = join(d, "material.md.segments.jsonl");
  const lines = [
    headerFor(materialPath),
    JSON.stringify(seg(text, "s1", "stance", "One.")),
    // The gap left between them is just the single space — whitespace only.
    JSON.stringify(seg(text, "s2", "stance", "Two.")),
  ];
  writeFileSync(segmentsPath, `${lines.join("\n")}\n`);
  const r = readSegments(segmentsPath, { materialPath });
  assert.deepEqual(fails(r.findings).filter((x) => x.id === "writing-materials-coverage"), []);
});

test("readSegments: a segment with a non-integer or out-of-range start/end fails test 1 as a shape error, and is excluded from overlap/coverage", () => {
  const d = tempDir("hs-seg-");
  const materialPath = join(d, "material.md");
  writeFileSync(materialPath, "Short.");
  const segmentsPath = join(d, "material.md.segments.jsonl");
  writeFileSync(segmentsPath, `${headerFor(materialPath)}\n${JSON.stringify({ id: "s1", start: 0, end: 999, label: "stance", text: "Short." })}\n`);
  const r = readSegments(segmentsPath, { materialPath });
  const finding = fails(r.findings).find((x) => x.id === "writing-materials-segment-shape-s1");
  assert.ok(finding);
  assert.equal(finding.test, 1);
  // The uncovered "Short." is still reported once, as coverage, since the bad segment is excluded.
  assert.ok(ids(r.findings).includes("writing-materials-coverage"));
});

test("readSegments: a missing material file (materialPath given but unreadable) is one test-1 finding, still returns parsed segments", () => {
  const d = tempDir("hs-seg-");
  const segmentsPath = join(d, "material.md.segments.jsonl");
  writeFileSync(segmentsPath, `${JSON.stringify({ material: "m1", path: "material.md", sha256: "0".repeat(64) })}\n${JSON.stringify({ id: "s1", start: 0, end: 4, label: "stance", text: "Text" })}\n`);
  const r = readSegments(segmentsPath, { materialPath: join(d, "material.md") });
  assert.ok(ids(r.findings).includes("writing-materials-material-missing"));
  assert.equal(r.segments.length, 1);
});

test("readSegments: with no materialPath given, only structural checks run (no verbatim/coverage/staleness findings)", () => {
  const d = tempDir("hs-seg-");
  const materialPath = join(d, "material.md");
  writeFileSync(materialPath, "The sky is blue.");
  const segmentsPath = join(d, "material.md.segments.jsonl");
  // Deliberately wrong text and a made-up stale sha256; neither is checkable without materialPath.
  writeFileSync(segmentsPath, `${JSON.stringify({ material: "m1", path: "material.md", sha256: "deadbeef" })}\n${JSON.stringify({ id: "s1", start: 0, end: 16, label: "stance", text: "totally wrong text" })}\n`);
  const r = readSegments(segmentsPath, {});
  assert.deepEqual(fails(r.findings), []);
});

// ---------------------------------------------------------------------------------------------
// Round trip: splitSegments -> segments init (via the CLI's own logic) -> readSegments reports
// only "still unlabeled" findings, in both split modes. This is the same contract the CLI's own
// init command relies on: the header/segments it writes must read back clean modulo labels.

function initLikeCli(materialPath, id, by) {
  const buf = readFileSync(materialPath);
  const text = buf.toString("utf8");
  const segments = splitSegments(text, { by });
  const header = { material: id, path: materialPath, sha256: sha256(buf) };
  return { header, segments };
}

test("round trip: init then readSegments reports only 'still unlabeled' findings (paragraph mode)", () => {
  const d = tempDir("hs-seg-roundtrip-");
  const materialPath = join(d, "call.md");
  writeFileSync(materialPath, "First thought here.\n\nA second paragraph, with more to it.\n\nAnd a third.");
  const { header, segments } = initLikeCli(materialPath, "m1", "paragraph");
  const segmentsPath = join(d, "call.md.segments.jsonl");
  writeFileSync(segmentsPath, `${[JSON.stringify(header), ...segments.map((s) => JSON.stringify(s))].join("\n")}\n`);

  const r = readSegments(segmentsPath, { materialPath, materialId: "m1" });
  assert.equal(r.segments.length, 3);
  assert.deepEqual(ids(r.findings), ["writing-materials-label-s1", "writing-materials-label-s2", "writing-materials-label-s3"]);
  for (const finding of fails(r.findings)) assert.match(finding.message, /still unlabeled/);
});

test("round trip: init then readSegments reports only 'still unlabeled' findings (sentence mode, CRLF material)", () => {
  const d = tempDir("hs-seg-roundtrip-");
  const materialPath = join(d, "call.md");
  writeFileSync(materialPath, "First sentence here.\r\nSecond sentence follows. Third one too!\r\n");
  const { header, segments } = initLikeCli(materialPath, "m1", "sentence");
  const segmentsPath = join(d, "call.md.segments.jsonl");
  writeFileSync(segmentsPath, `${[JSON.stringify(header), ...segments.map((s) => JSON.stringify(s))].join("\n")}\n`);

  const r = readSegments(segmentsPath, { materialPath, materialId: "m1" });
  assert.ok(r.segments.length >= 1);
  assert.ok(fails(r.findings).every((x) => x.id.startsWith("writing-materials-label-")));
  for (const finding of fails(r.findings)) assert.match(finding.message, /still unlabeled/);
});
