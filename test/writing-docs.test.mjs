import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tempDir } from "./tmp.mjs";
import { MATERIAL_LABELS, BLOCKS } from "../src/writing.mjs";

// WRITING.md is the public description of the writing profile. These tests hold it to what the
// linter actually does, so the page cannot promise a shape the reader will not parse or a rule the
// linter does not enforce.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const doc = readFileSync(join(ROOT, "WRITING.md"), "utf8");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

test("WRITING.md ships in the npm tarball, and so do the worked examples", () => {
  assert.ok(pkg.files.includes("WRITING.md"), "package.json files lists WRITING.md");
  assert.ok(pkg.files.some((f) => "examples/writing/essay.hyperspec.md".startsWith(f)), "examples/ ships");
});

// The "Marking materials" section's sample material (the ```text block) and its segments file
// (the ```jsonl block). They are the fixtures for the schema splice below, so the page cannot show
// a segments file the linter would refuse.
const marking = () => doc.split("\n## Marking materials\n")[1].split("\n## ")[0];
const fence = (section, lang) => section.match(new RegExp("```" + lang + "\\n([\\s\\S]*?)```"))[1];

test("the schema block, spliced into the essay example with the page's own sample material and segments file, lints with zero findings", () => {
  const schema = doc.split("\n## The schema\n")[1].match(/```yaml\n([\s\S]*?)```/)[1];
  assert.match(schema, /^        segments: materials\/voice-memo\.md\.segments\.jsonl/m, "the schema's material item names its segments file");
  const essay = readFileSync(join(ROOT, "examples", "writing", "essay.hyperspec.md"), "utf8");
  // The essay's core frontmatter (decisions through improvement), then the schema block in place of
  // the essay's own profile and writing blocks.
  const core = essay.slice(0, essay.indexOf("\nwriting:\n") + 1).replace("profile: writing\n", "");
  const d = tempDir("hs-writing-doc-");
  cpSync(join(ROOT, "examples", "writing"), d, { recursive: true });
  const files = [
    ["materials/voice-memo.md", fence(marking(), "text")],
    ["materials/voice-memo.md.segments.jsonl", fence(marking(), "jsonl")],
    ["goldens/opening.md", "golden\n"],
    ["world/ines.json", "{}\n"],
  ];
  for (const [p, text] of files) {
    mkdirSync(join(d, dirname(p)), { recursive: true });
    writeFileSync(join(d, p), text);
  }
  writeFileSync(join(d, "spec.md"), `${core}${schema}---\n\n# Schema\n`);
  const r = spawnSync(process.execPath, [join(ROOT, "bin", "hyperspec.mjs"), "lint", "spec.md", "--json"], { cwd: d, encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const file = JSON.parse(r.stdout).files[0];
  assert.deepEqual(file.findings, []);
  assert.deepEqual(file.profile, { name: "writing", complete: 9, total: 9 });
});

test("the page's sample segments file is exactly what segments init writes for the sample material, plus labels", () => {
  const d = tempDir("hs-writing-doc-init-");
  mkdirSync(join(d, "materials"));
  writeFileSync(join(d, "materials", "voice-memo.md"), fence(marking(), "text"));
  const r = spawnSync(process.execPath, [join(ROOT, "bin", "hyperspec.mjs"), "segments", "init", "materials/voice-memo.md", "--id", "voice-memo"], { cwd: d, encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const strip = (line) => {
    const o = JSON.parse(line);
    return JSON.stringify("label" in o ? { id: o.id, start: o.start, end: o.end, text: o.text } : o);
  };
  const lines = (text) => text.trim().split("\n").map(strip);
  assert.deepEqual(lines(fence(marking(), "jsonl")), lines(readFileSync(join(d, "materials", "voice-memo.md.segments.jsonl"), "utf8")));
});

test("the page's sample labels every quote with only the quoted words, and uses every field a label needs", () => {
  const segs = fence(marking(), "jsonl").trim().split("\n").slice(1).map((l) => JSON.parse(l));
  const quotes = segs.filter((x) => x.label === "quote");
  assert.ok(quotes.length > 0);
  for (const q of quotes) assert.match(q.text, /^"[^"]*"$/, `quote ${q.id} holds only a quotation: ${q.text}`);
});

// Every finding id src/segments.mjs raises, collected structurally: every call to its f() helper,
// and the test fails if any call does not pass its id as a literal the collector can read. The
// marking ids src/writing-fields.mjs raises are listed explicitly below, and each has to appear
// there verbatim, so one renamed or added without the list changing fails too.
const WRITING_FIELDS_MARKING_IDS = [
  ["writing-materials-unmarked", 1, '"writing-materials-unmarked"'],
  ["writing-spine-materials-segments-unresolvable-<material>", 4, "`${idPrefix}-materials-segments-unresolvable-${mid}`"],
  ["writing-spine-claim-<n>-materials-segment-unknown", 4, "`${idPrefix}-claim-${i}-materials-segment-unknown`"],
  ["writing-spine-claim-<n>-materials-segment-private", 5, "`${idPrefix}-claim-${i}-materials-segment-private`"],
  ["writing-spine-claim-<n>-materials-segment-question", 5, "`${idPrefix}-claim-${i}-materials-segment-question`"],
];

test("the findings table lists every materials-marking finding id the linter raises, under its test", () => {
  const norm = (id) => id.replace(/\$\{[^}]+\}|<[^>]+>/g, "*");
  const fromSource = new Set();
  const segSrc = readFileSync(join(ROOT, "src", "segments.mjs"), "utf8");
  const calls = [...segSrc.matchAll(/\bf\(/g)].length;
  const literal = [...segSrc.matchAll(/\bf\((\d), [`"]([^`"]+)[`"]/g)];
  assert.equal(literal.length, calls, "every f() call in src/segments.mjs passes its test and id as literals");
  for (const m of literal) fromSource.add(`${norm(m[2])} ${m[1]}`);
  const wfSrc = readFileSync(join(ROOT, "src", "writing-fields.mjs"), "utf8");
  for (const [id, t, literalInSource] of WRITING_FIELDS_MARKING_IDS) {
    assert.ok(wfSrc.includes(`f(${t}, ${literalInSource}`), `src/writing-fields.mjs raises ${literalInSource} under test ${t}`);
    fromSource.add(`${norm(id)} ${t}`);
  }
  const section = marking().split("\n### Findings\n")[1].split("\n### ")[0];
  const fromDoc = new Set([...section.matchAll(/^\| `([^`]+)` \| ([1-9]) \|/gm)].map((m) => `${norm(m[1])} ${m[2]}`));
  assert.deepEqual([...fromDoc].sort(), [...fromSource].sort());
});

test("the materials labels table lists exactly MATERIAL_LABELS, in order", () => {
  const section = marking().split("\n### The labels\n")[1].split("\n### ")[0];
  const labels = [...section.matchAll(/^\| `([a-z]+)` \|/gm)].map((m) => m[1]);
  assert.deepEqual(labels, [...MATERIAL_LABELS]);
});

test("the schema names every block the linter checks", () => {
  for (const b of BLOCKS) assert.match(doc, new RegExp(`^  ${b}:`, "m"), b);
});

test("WRITING.md names no personal path and no email", () => {
  assert.ok(!/\/Users\/|\/home\/|[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/.test(doc));
});

test("the test mapping table has one row for each of the nine tests", () => {
  const section = doc.split("\n## The test mapping\n")[1].split("\n## ")[0];
  const rows = [...section.matchAll(/^\| ([1-9]) /gm)].map((m) => Number(m[1]));
  assert.deepEqual(rows, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});
