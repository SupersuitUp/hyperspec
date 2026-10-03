import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tempDir } from "./tmp.mjs";
import { readSegments } from "../src/segments.mjs";
import { sha256 } from "../src/hash.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const run = (...a) => spawnSync(process.execPath, [join(ROOT, "bin", "hyperspec.mjs"), ...a], { encoding: "utf8" });

test("segments init writes header + unlabeled segments to <material>.segments.jsonl by default", () => {
  const d = tempDir("hs-cli-seg-");
  const material = join(d, "call.md");
  writeFileSync(material, "First thought.\n\nSecond thought, a bit longer.");

  const r = run("segments", "init", material, "--id", "m1");
  assert.equal(r.status, 0, r.stdout + r.stderr);

  const out = `${material}.segments.jsonl`;
  assert.ok(existsSync(out));
  assert.match(r.stdout, /^2 segments written to /);
  assert.match(r.stdout, /claim, story, quote, stance, question, aside, private/);
  assert.match(r.stdout, /hyperspec lint/);

  const lines = readFileSync(out, "utf8").trim().split("\n");
  const header = JSON.parse(lines[0]);
  assert.equal(header.material, "m1");
  assert.equal(header.path, material);
  assert.equal(header.sha256, sha256(readFileSync(material)));

  const segs = lines.slice(1).map((l) => JSON.parse(l));
  assert.equal(segs.length, 2);
  assert.deepEqual(segs.map((s) => s.label), ["unlabeled", "unlabeled"]);
  assert.deepEqual(segs.map((s) => s.id), ["s1", "s2"]);
});

test("segments init refuses to overwrite an existing segments file (exit 2), and leaves it untouched", () => {
  const d = tempDir("hs-cli-seg-");
  const material = join(d, "call.md");
  writeFileSync(material, "Some text.");
  const out = `${material}.segments.jsonl`;
  writeFileSync(out, "already here");

  const r = run("segments", "init", material, "--id", "m1");
  assert.equal(r.status, 2);
  assert.match(r.stderr, /refusing to overwrite/);
  assert.equal(readFileSync(out, "utf8"), "already here");
});

test("segments init exits 2 on a missing material, writing nothing", () => {
  const d = tempDir("hs-cli-seg-");
  const material = join(d, "nope.md");
  const r = run("segments", "init", material, "--id", "m1");
  assert.equal(r.status, 2);
  assert.match(r.stderr, /material not found/);
  assert.ok(!existsSync(`${material}.segments.jsonl`));
});

test("segments init needs --id (exit 2), and needs a material path (exit 2)", () => {
  const d = tempDir("hs-cli-seg-");
  const material = join(d, "call.md");
  writeFileSync(material, "Some text.");

  const r1 = run("segments", "init", material);
  assert.equal(r1.status, 2);
  assert.match(r1.stderr, /--id/);
  assert.ok(!existsSync(`${material}.segments.jsonl`));

  const r2 = run("segments", "init", "--id", "m1");
  assert.equal(r2.status, 2);
});

test("segments init --out writes to the given path instead of the default", () => {
  const d = tempDir("hs-cli-seg-");
  const material = join(d, "call.md");
  writeFileSync(material, "Some text.");
  const out = join(d, "custom.segments.jsonl");

  const r = run("segments", "init", material, "--id", "m1", "--out", out);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(existsSync(out));
  assert.ok(!existsSync(`${material}.segments.jsonl`));
});

test("segments init --by sentence splits on sentence boundaries instead of paragraphs", () => {
  const d = tempDir("hs-cli-seg-");
  const material = join(d, "call.md");
  writeFileSync(material, "First sentence. Second sentence. Third sentence.");

  const r = run("segments", "init", material, "--id", "m1", "--by", "sentence");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const lines = readFileSync(`${material}.segments.jsonl`, "utf8").trim().split("\n");
  const segs = lines.slice(1).map((l) => JSON.parse(l));
  assert.deepEqual(segs.map((s) => s.text), ["First sentence.", "Second sentence.", "Third sentence."]);
});

test("segments init rejects a --by outside paragraph/sentence (exit 2), writing nothing", () => {
  const d = tempDir("hs-cli-seg-");
  const material = join(d, "call.md");
  writeFileSync(material, "Some text.");
  const r = run("segments", "init", material, "--id", "m1", "--by", "word");
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--by must be paragraph or sentence/);
  assert.ok(!existsSync(`${material}.segments.jsonl`));
});

test("an unknown segments subcommand is a usage error (exit 2)", () => {
  const r = run("segments", "bogus");
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown segments subcommand/);
});

test("HELP documents segments init", () => {
  const r = run("--help");
  assert.match(r.stdout, /segments init/);
  assert.match(r.stdout, /paragraph\|sentence/);
});

// ---------------------------------------------------------------------------------------------
// Round trip through the real CLI binary: init, then readSegments reports only "still unlabeled"
// findings, proving the file the binary actually writes (not just the library function) is
// internally consistent.

test("round trip through the CLI: segments init then readSegments reports only 'still unlabeled' findings", () => {
  const d = tempDir("hs-cli-seg-roundtrip-");
  const material = join(d, "call.md");
  writeFileSync(material, "A brain dump line here.\n\nAnd a second paragraph with a bit more to say.\n\nA third and final one.");

  const r = run("segments", "init", material, "--id", "m1");
  assert.equal(r.status, 0, r.stdout + r.stderr);

  const result = readSegments(`${material}.segments.jsonl`, { materialPath: material, materialId: "m1" });
  const fails = result.findings.filter((x) => x.severity === "fail");
  assert.equal(fails.length, result.segments.length);
  for (const finding of fails) {
    assert.equal(finding.test, 1);
    assert.match(finding.message, /still unlabeled/);
  }
});

test("segments init --out into a folder that does not exist exits 2 with a plain message, and writes nothing", () => {
  const d = tempDir("hs-cli-seg-outdir-");
  const material = join(d, "call.md");
  writeFileSync(material, "First thought.\n");
  const out = join(d, "nope", "call.segments.jsonl");
  const r = run("segments", "init", material, "--id", "m1", "--out", out);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /folder does not exist/);
  assert.doesNotMatch(r.stderr, /\n\s+at /, "no stack trace");
  assert.ok(!existsSync(join(d, "nope")));
});

test("segments init on a material with nothing in it exits 2 with a plain message, and writes nothing", () => {
  const d = tempDir("hs-cli-seg-empty-");
  const material = join(d, "call.md");
  writeFileSync(material, "\n   \n");
  const r = run("segments", "init", material, "--id", "m1");
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /nothing to mark/);
  assert.ok(!existsSync(`${material}.segments.jsonl`));
});

test("HELP lists the new exit-2 cases for segments init", () => {
  const help = run("--help").stdout.replace(/\s+/g, " ");
  assert.match(help, /--out folder that does not exist/);
  assert.match(help, /material with nothing in it/);
});

// ---------------------------------------------------------------------------------------------
// --keep (0.9.1, issue #2): an edited material is re-marked without relabeling what did not change.
// A label is a fact about a stretch of text, so every segment whose trimmed text the old file has
// keeps its id, label and every other key; only new or changed text is left to label, and listed.

const segsOf = (file) => readFileSync(file, "utf8").trim().split("\n").slice(1).map((l) => JSON.parse(l));
// Mark `text` as m1 and label its segments from `labels` (an object per segment, merged in).
function marked(text, labels) {
  const d = tempDir("hs-cli-seg-keep-");
  const material = join(d, "outline.md");
  writeFileSync(material, text);
  const r = run("segments", "init", material, "--id", "m1");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const file = `${material}.segments.jsonl`;
  const [header, ...rest] = readFileSync(file, "utf8").trim().split("\n");
  writeFileSync(file, `${[header, ...rest.map((l, i) => JSON.stringify({ ...JSON.parse(l), ...labels[i] }))].join("\n")}\n`);
  return { d, material, file };
}
const THREE = "First, a stance.\n\nSecond, a claim.\n\nThird, an aside.";
const LABELS = [{ label: "stance" }, { label: "claim", own: true }, { label: "aside", note: "kept for context" }];

test("GUARD: --keep with the material unchanged carries every label, and lint then passes the file", () => {
  const { material, file } = marked(THREE, LABELS);
  writeFileSync(material, `${THREE}\n`); // a byte changed (the sha256 moved); no segment's text did
  assert.ok(readSegments(file, { materialPath: material, materialId: "m1" }).findings.some((f) => f.id === "writing-materials-stale"));

  const r = run("segments", "init", material, "--id", "m1", "--keep", file);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^3 segments written to .*, 3 labels carried from .*, 0 to label\./);
  assert.deepEqual(segsOf(file).map((s) => s.label), ["stance", "claim", "aside"]);
  assert.deepEqual(readSegments(file, { materialPath: material, materialId: "m1" }).findings, []);
});

test("GUARD: --keep leaves a changed segment unlabeled and lists it; the others keep their ids", () => {
  const { material, file } = marked(THREE, LABELS);
  writeFileSync(material, "First, a stance.\n\nSecond, a claim that grew.\n\nThird, an aside.");

  const r = run("segments", "init", material, "--id", "m1", "--keep", file);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /2 labels carried from .*, 1 to label:\n {2}s4 "Second, a claim that grew\."\n/);
  const segs = segsOf(file);
  assert.deepEqual(segs.map((s) => [s.id, s.label]), [["s1", "stance"], ["s4", "unlabeled"], ["s3", "aside"]]);
  assert.equal(segs[1].own, undefined, "a changed segment carries nothing from the old one");
  const fails = readSegments(file, { materialPath: material, materialId: "m1" }).findings;
  assert.deepEqual(fails.map((f) => f.message), ["material m1, segment s4: is still unlabeled"]);
});

test("GUARD: --keep carries every extra key a segment has, own included, with new offsets", () => {
  const { material, file } = marked(THREE, LABELS);
  writeFileSync(material, `Zeroth, new text.\n\n${THREE}`);

  const r = run("segments", "init", material, "--id", "m1", "--keep", file);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const segs = segsOf(file);
  assert.deepEqual(segs[0], { id: "s4", start: 0, end: 17, label: "unlabeled", text: "Zeroth, new text." });
  assert.deepEqual(segs[2], { id: "s2", start: 37, end: 53, label: "claim", own: true, text: "Second, a claim." });
  assert.equal(segs[3].note, "kept for context");
  assert.deepEqual(Object.keys(segs[3]), ["id", "start", "end", "label", "note", "text"]);
});

test("--keep matches text trimmed, and uses old segments with the same text each once, in order", () => {
  const { material, file } = marked("Same.\n\nSame.", [{ label: "stance" }, { label: "aside" }]);
  writeFileSync(material, "  Same.\n\nSame.\n\nSame.");
  const r = run("segments", "init", material, "--id", "m1", "--keep", file);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(segsOf(file).map((s) => [s.id, s.label]), [["s1", "stance"], ["s2", "aside"], ["s3", "unlabeled"]]);
});

test("GUARD: without --keep, or with --keep naming another file, an existing segments file is never overwritten", () => {
  const { d, material, file } = marked(THREE, LABELS);
  const before = readFileSync(file, "utf8");
  const other = join(d, "other.segments.jsonl");
  writeFileSync(other, before);
  const r = run("segments", "init", material, "--id", "m1", "--keep", other);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /refusing to overwrite .*--keep names a different file/);
  assert.equal(readFileSync(file, "utf8"), before);

  const fresh = join(d, "fresh.segments.jsonl");
  const r2 = run("segments", "init", material, "--id", "m1", "--keep", other, "--out", fresh);
  assert.equal(r2.status, 0, r2.stdout + r2.stderr);
  assert.deepEqual(segsOf(fresh).map((s) => s.label), ["stance", "claim", "aside"]);
});

test("--keep exits 2, writing nothing, for a file that is missing, broken, or marks another material", () => {
  const { d, material, file } = marked(THREE, LABELS);
  const out = join(d, "new.segments.jsonl");
  const missing = run("segments", "init", material, "--id", "m1", "--keep", join(d, "nope.jsonl"), "--out", out);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /--keep file not found/);

  const broken = join(d, "broken.jsonl");
  writeFileSync(broken, `${readFileSync(file, "utf8")}not json\n`);
  const r = run("segments", "init", material, "--id", "m1", "--keep", broken, "--out", out);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /line 5 is not a JSON object/);

  const r2 = run("segments", "init", material, "--id", "m2", "--keep", file, "--out", out);
  assert.equal(r2.status, 2);
  assert.match(r2.stderr, /marks material "m1", not "m2"/);
  assert.ok(!existsSync(out));
});

// ── segments label (0.10) ────────────────────────────────────────────────────────────────────
// Labeling by hand meant editing JSONL, and one real piece grew six throwaway labelers
// (letter BUILD-NOTES item 5). The verb sets labels and fields and touches nothing else.
function markedForLabel() {
  const d = tempDir("hs-cli-label-");
  const material = join(d, "notes.md");
  writeFileSync(material, "Heading line.\n\nA claim of mine.\n\nShe said this.\n\nA story.");
  assert.equal(run("segments", "init", material, "--id", "notes").status, 0);
  return { d, material, out: `${material}.segments.jsonl` };
}
const labelRows = (f) => readFileSync(f, "utf8").trim().split("\n").map((l) => JSON.parse(l));

test("segments label sets labels and fields, keeping every offset and text", () => {
  const { out } = markedForLabel();
  const before = labelRows(out);
  const r = run("segments", "label", out, "s1=aside", "s2=claim:own=true", "s3=quote:speaker=Gary Sheng", "s4=story:teller=gary-sheng");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /4 segments labeled/);
  const after = labelRows(out);
  assert.deepEqual(after[0], before[0], "the header is untouched");
  for (let i = 1; i < after.length; i++) {
    assert.equal(after[i].text, before[i].text);
    assert.equal(after[i].start, before[i].start);
    assert.equal(after[i].end, before[i].end);
  }
  assert.equal(after[1].label, "aside");
  assert.equal(after[2].label, "claim");
  assert.equal(after[2].own, true, "own=true is the boolean the format reads");
  assert.equal(after[3].speaker, "Gary Sheng");
  assert.equal(after[4].teller, "gary-sheng");
});

test("segments label takes a comma list of ids for one label", () => {
  const { out } = markedForLabel();
  assert.equal(run("segments", "label", out, "s1,s3,s4=aside").status, 0);
  assert.deepEqual(labelRows(out).slice(1).map((s) => s.label), ["aside", "unlabeled", "aside", "aside"]);
});

test("segments label refuses an unknown id or a label outside the closed set, writing nothing", () => {
  const { out } = markedForLabel();
  const before = readFileSync(out, "utf8");
  const a = run("segments", "label", out, "s1=aside", "s9=claim");
  assert.equal(a.status, 2);
  assert.match(a.stderr, /s9/);
  const b = run("segments", "label", out, "s1=opinion");
  assert.equal(b.status, 2);
  assert.match(b.stderr, /opinion/);
  const c = run("segments", "label", out, "s1");
  assert.equal(c.status, 2);
  assert.equal(readFileSync(out, "utf8"), before, "a refused call leaves the file byte for byte");
});

test("segments label lists what is still unlabeled", () => {
  const { out } = markedForLabel();
  const r = run("segments", "label", out, "s1=aside");
  assert.match(r.stdout, /3 still unlabeled: s2, s3, s4/);
});
