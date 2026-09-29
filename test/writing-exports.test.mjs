import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tempDir } from "./tmp.mjs";

// The closed label vocabulary lives in one leaf module, src/labels.mjs, that imports nothing, so
// src/segments.mjs can read it without pulling src/writing.mjs (which imports writing-fields.mjs,
// which imports segments.mjs back). And the package exposes the writing profile's reading side as
// @supersuit/hyperspec/writing, for a tool that labels materials outside this package.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABELS = ["claim", "story", "quote", "stance", "question", "aside", "private"];
const src = (name) => readFileSync(join(ROOT, "src", name), "utf8");
const importsOf = (text) => [...text.matchAll(/^\s*(?:import|export)\b[^;]*?\bfrom\s+["']([^"']+)["']/gm)].map((m) => m[1]);

test("src/labels.mjs is a leaf: it exports the frozen closed set and imports nothing", async () => {
  const text = src("labels.mjs");
  assert.deepEqual(importsOf(text), []);
  assert.doesNotMatch(text, /\bimport\s*\(/);
  const { MATERIAL_LABELS } = await import("../src/labels.mjs");
  assert.deepEqual(MATERIAL_LABELS, LABELS);
  assert.ok(Object.isFrozen(MATERIAL_LABELS));
});

test("segments.mjs and writing.mjs read MATERIAL_LABELS from the leaf, and segments.mjs no longer imports writing.mjs", async () => {
  assert.ok(importsOf(src("segments.mjs")).includes("./labels.mjs"));
  assert.ok(!importsOf(src("segments.mjs")).includes("./writing.mjs"), "segments.mjs must not import writing.mjs (the import cycle)");
  assert.ok(importsOf(src("writing.mjs")).includes("./labels.mjs"));
  const leaf = (await import("../src/labels.mjs")).MATERIAL_LABELS;
  const viaWriting = (await import("../src/writing.mjs")).MATERIAL_LABELS;
  assert.equal(viaWriting, leaf, "writing.mjs re-exports the leaf's own array, not a copy");
});

test("src/segments.mjs imported first, in a fresh process, loads without error and checks against the closed set", () => {
  // A fresh process makes segments.mjs the entry into the module graph, which is the order the
  // old import cycle was fragile in. The fix text of an out-of-set label lists the labels it
  // checked against, so this proves which set segments.mjs actually sees.
  const d = tempDir("hs-labels-");
  const seg = join(d, "m.segments.jsonl");
  writeFileSync(seg, `{"material":"m1","path":"m.md","sha256":"x"}\n{"id":"s1","start":0,"end":1,"label":"bogus","text":"a"}\n`);
  const code = `
    const { readSegments } = await import(${JSON.stringify(join(ROOT, "src", "segments.mjs"))});
    const { findings } = readSegments(${JSON.stringify(seg)});
    console.log(JSON.stringify(findings.map((f) => f.fix)));
  `;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), [`Set label to one of: ${LABELS.join(", ")}.`]);
});

test("@supersuit/hyperspec/writing resolves through the package's self-reference and exposes MATERIAL_LABELS and readSegments", async () => {
  const mod = await import("@supersuit/hyperspec/writing");
  assert.deepEqual(Object.keys(mod).sort(), ["MATERIAL_LABELS", "readSegments"]);
  assert.equal(mod.MATERIAL_LABELS, (await import("../src/labels.mjs")).MATERIAL_LABELS);
  assert.equal(mod.readSegments, (await import("../src/segments.mjs")).readSegments);
});

test("package.json exports ./writing beside ./recipe and ./package.json", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  assert.deepEqual(pkg.exports, {
    "./recipe": "./src/writer.mjs",
    "./writing": "./src/writing-exports.mjs",
    "./package.json": "./package.json",
  });
});
