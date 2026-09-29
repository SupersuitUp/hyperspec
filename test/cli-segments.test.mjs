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
