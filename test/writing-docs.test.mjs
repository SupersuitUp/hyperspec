import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  // The schema names a scope folder, and its golden lives inside it, so the splice below also
  // proves the schema's dna block against the shipped scope (match, leak, features current).
  assert.match(schema, /^    scope_dir: dna\/essay-new-managers-teach /m, "the schema's dna block names the essay's scope folder");
  assert.match(schema, /^      - path: dna\/essay-new-managers-teach\/goldens\/opening\.md$/m, "the schema's golden lives in that scope");
  const essay = readFileSync(join(ROOT, "examples", "writing", "essay.hyperspec.md"), "utf8");
  // The essay's core frontmatter (decisions through improvement), then the schema block in place of
  // the essay's own profile and writing blocks.
  const core = essay.slice(0, essay.indexOf("\nwriting:\n") + 1).replace("profile: writing\n", "");
  const d = tempDir("hs-writing-doc-");
  cpSync(join(ROOT, "examples", "writing"), d, { recursive: true });
  const files = [
    ["materials/voice-memo.md", fence(marking(), "text")],
    ["materials/voice-memo.md.segments.jsonl", fence(marking(), "jsonl")],
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

// ------------------------------------------------------------------ Scoped DNA ----------------
// The "Scoped DNA" section describes the scope folder, dna init / dna measure, the features and
// every finding. These tests hold each of those to what the code does and what ships.

const scoped = () => doc.split("\n## Scoped DNA\n")[1].split("\n## ")[0];
const sub = (heading) => scoped().split(`\n### ${heading}\n`)[1].split("\n### ")[0];
const SCOPE = join(ROOT, "examples", "writing", "dna", "essay-new-managers-teach");

// The ids src/writing-fields.mjs raises for writing.dna.scope_dir and the spec's own
// writing.dna.scope, listed explicitly (they are
// built from idPrefix, so the structural collector below cannot read them), and each has to
// appear in that file verbatim, so one renamed or added without this list changing fails.
const WRITING_FIELDS_DNA_IDS = [
  ["writing-dna-scope-dir", 1, "`${idPrefix}-scope-dir`"],
  ["writing-dna-scope-<field>", 1, "`${idPrefix}-scope-form`"],
  ["writing-dna-scope-<field>", 1, "`${idPrefix}-scope-audience`"],
  ["writing-dna-scope-<field>", 1, "`${idPrefix}-scope-purpose`"],
  ["writing-dna-scope-mismatch-<field>", 1, "`${idPrefix}-scope-mismatch-${idSuffix}`"],
  ["writing-dna-golden-leak", 5, "`${idPrefix}-golden-leak`"],
  ["writing-dna-features-missing", 6, "`${idPrefix}-features-missing`"],
  ["writing-dna-features-stale", 6, "`${idPrefix}-features-stale`"],
];

test("the scoped DNA findings table lists every writing-dna- id src/dna.mjs and the scope_dir lint raise, under its test", () => {
  const norm = (id) => id.replace(/\$\{[^}]+\}|<[^>]+>/g, "*");
  const fromSource = new Set();
  const dnaSrc = readFileSync(join(ROOT, "src", "dna.mjs"), "utf8");
  const calls = [...dnaSrc.matchAll(/\bf\(/g)].length;
  const literal = [...dnaSrc.matchAll(/\bf\((\d), [`"]([^`"]+)[`"]/g)];
  assert.ok(calls > 0);
  assert.equal(literal.length, calls, "every f() call in src/dna.mjs passes its test and id as literals");
  for (const m of literal) {
    assert.match(m[2], /^writing-dna-/, `src/dna.mjs id ${m[2]} starts writing-dna-`);
    fromSource.add(`${norm(m[2])} ${m[1]}`);
  }
  const wfSrc = readFileSync(join(ROOT, "src", "writing-fields.mjs"), "utf8");
  for (const [id, t, literalInSource] of WRITING_FIELDS_DNA_IDS) {
    assert.ok(wfSrc.includes(`f(${t}, ${literalInSource}`), `src/writing-fields.mjs raises ${literalInSource} under test ${t}`);
    fromSource.add(`${norm(id)} ${t}`);
  }
  const fromDoc = new Set([...sub("Findings").matchAll(/^\| `([^`]+)` \| ([1-9]) \|/gm)].map((m) => `${norm(m[1])} ${m[2]}`));
  assert.deepEqual([...fromDoc].sort(), [...fromSource].sort());
});

test("the scoped DNA features table lists exactly the features measureFeatures returns, in order", async () => {
  const { measureFeatures } = await import("../src/dna.mjs");
  const keys = Object.keys(measureFeatures(["One sentence here. Another one."]));
  const rows = [...sub("What is measured").matchAll(/^\| `([a-z0-9_]+)` \|/gm)].map((m) => m[1]);
  assert.deepEqual(rows, keys);
});

test("the page's sample dna measure output is exactly what dna measure prints for the essay's scope", () => {
  // The bare ``` block (no language), read by walking every fence in order, since a regex for an
  // empty language would also match the closing fence of the bash block above it.
  const blocks = [...sub("Measuring a scope").matchAll(/```(\w*)\n([\s\S]*?)```/g)];
  const sample = blocks.find((m) => m[1] === "")[2];
  const d = tempDir("hs-writing-doc-dna-");
  cpSync(join(ROOT, "examples", "writing"), d, { recursive: true });
  const r = spawnSync(process.execPath, [join(ROOT, "bin", "hyperspec.mjs"), "dna", "measure", "dna/essay-new-managers-teach"], { cwd: d, encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(sample, r.stdout);
  assert.equal(readFileSync(join(d, "dna", "essay-new-managers-teach", "features.json"), "utf8"), readFileSync(join(SCOPE, "features.json"), "utf8"));
});

test("the page's sample golden is the shipped golden, byte for byte", () => {
  assert.equal(fence(sub("A golden"), "markdown"), readFileSync(join(SCOPE, "goldens", "opening.md"), "utf8"));
});

test("the page's dna init command writes the page's sample scope.md frontmatter, and it is the shipped scope's", () => {
  const section = sub("Starting a scope");
  const prefix = "npx @supersuit/hyperspec dna init ";
  const lines = fence(section, "bash").trim().split("\n");
  assert.deepEqual(lines.slice(0, -1), ["mkdir -p dna"], "the only other line makes the scope's parent folder");
  const cmd = lines.at(-1);
  assert.ok(cmd.startsWith(prefix), cmd);
  // Split the command line the way a shell would for this one: words, and "double quoted" words.
  const args = [...cmd.slice(prefix.length).matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2]);
  const d = tempDir("hs-writing-doc-dna-init-");
  mkdirSync(join(d, "dna"));
  const r = spawnSync(process.execPath, [join(ROOT, "bin", "hyperspec.mjs"), "dna", "init", ...args], { cwd: d, encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const frontmatter = (text) => text.match(/^---\n[\s\S]*?\n---\n/)[0];
  const sample = fence(sub("The scope folder"), "markdown");
  assert.equal(frontmatter(readFileSync(join(d, "dna", "essay-new-managers-teach", "scope.md"), "utf8")), sample);
  assert.equal(frontmatter(readFileSync(join(SCOPE, "scope.md"), "utf8")), sample);
});

test("the page's scope folder tree names every file the essay's scope ships", () => {
  const tree = fence(sub("The scope folder"), "text");
  const names = [...tree.matchAll(/^\s*([A-Za-z0-9_.-]+\/?)/gm)].map((m) => m[1]);
  const shipped = ["essay-new-managers-teach/", "scope.md", "goldens/", "README.md", "close.md", "opening.md", "status.md", "features.json"];
  assert.deepEqual(names.slice(1).sort(), shipped.slice(1).sort());
  assert.ok(tree.startsWith("dna/essay-new-managers-teach/\n"));
  for (const f of ["scope.md", "features.json", "goldens/README.md", "goldens/close.md", "goldens/opening.md", "goldens/status.md"]) {
    assert.ok(readFileSync(join(SCOPE, f), "utf8").length > 0, f);
  }
});

test("the page's spec sample is the essay example's own dna block, line for line", () => {
  const sample = fence(sub("Naming the scope in a spec"), "yaml").trimEnd().split("\n");
  const essay = readFileSync(join(ROOT, "examples", "writing", "essay.hyperspec.md"), "utf8").split("\n");
  let at = essay.indexOf(sample[0]);
  assert.ok(at >= 0, sample[0]);
  for (const line of sample) {
    const next = essay.indexOf(line, at);
    assert.ok(next >= at, `the essay carries, in order: ${line}`);
    at = next + 1;
  }
});

// ------------------------------------------------------------ Checking a draft -----------------
// The "Checking a draft" section describes `hyperspec check`: one subsection per station, each with
// a findings table. These tests hold the tables to the ids the stations raise, the order to the
// registry, and the samples to what the command prints and writes for the essay example.

const checking = () => doc.split("\n## Checking a draft\n")[1].split("\n## ")[0];
const checkingSubs = () => checking().split("\n### ").slice(1).map((s) => {
  const nl = s.indexOf("\n");
  return { heading: s.slice(0, nl), body: s.slice(nl + 1) };
});
const tableRows = (body) => [...body.matchAll(/^\| `([^`]+)` \| ([^|]+) \| ([^|]+) \|$/gm)].map((m) => ({ id: m[1], severity: m[2].trim(), meaning: m[3].trim() }));
const normId = (id) => id.replace(/\$\{[^}]+\}|<[^>]+>/g, "*");

// Every station finding id raised in src/stations/*.mjs and src/check.mjs, read structurally: an
// `id: "..."`, an id: `...` template, or a `let id = `...`` (a numbered duplicate suffix assigned
// later is the same finding, so it is not collected). Each comes with the severity written right
// after it, or null when the severity is a variable.
function stationIdsFromSource() {
  const files = readdirSync(join(ROOT, "src", "stations")).filter((f) => f.endsWith(".mjs") && !["index.mjs", "util.mjs"].includes(f)).map((f) => join("src", "stations", f));
  files.push(join("src", "check.mjs"));
  const out = new Map();
  for (const f of files) {
    const src = readFileSync(join(ROOT, f), "utf8");
    for (const m of src.matchAll(/(?:\bid:\s*|\blet id = )(?:"(station-[^"]+)"|`(station-[^`]+)`)/g)) {
      const id = normId(m[1] ?? m[2]);
      const sev = /severity:\s*(?:"(fail|warn)"|(\w+))/.exec(src.slice(m.index, m.index + 1000));
      out.set(id, sev?.[1] ?? null);
    }
  }
  return out;
}

test("the Checking a draft findings tables list exactly the ids the stations raise, with their severity", () => {
  const fromSource = stationIdsFromSource();
  assert.ok(fromSource.size >= 15, `collected ${fromSource.size} ids`);
  const rows = checkingSubs().flatMap((s) => tableRows(s.body));
  const fromDoc = new Map(rows.map((r) => [normId(r.id), r.severity]));
  assert.equal(fromDoc.size, rows.length, "no id is listed twice");
  assert.deepEqual([...fromDoc.keys()].sort(), [...fromSource.keys()].sort());
  for (const [id, sev] of fromSource) {
    const docSev = fromDoc.get(id);
    if (sev) assert.equal(docSev, sev, id);
    else assert.ok(/\bfail\b/.test(docSev) && /\bwarn\b/.test(docSev), `${id}: a severity set at run time is described as both: ${docSev}`);
  }
  for (const r of rows) assert.ok(r.meaning.length > 10, `${r.id} has a meaning`);
});

test("Checking a draft has one subsection per station, in the order check runs them, each holding only its own ids", async () => {
  const { STATION_NAMES } = await import("../src/stations/index.mjs");
  const subs = checkingSubs();
  assert.deepEqual(subs.map((s) => s.heading), [...STATION_NAMES, "Any station", "The runs ledger"]);
  for (const s of subs.filter((x) => STATION_NAMES.includes(x.heading))) {
    const rows = tableRows(s.body);
    assert.ok(rows.length >= 1, `${s.heading} has a findings table`);
    for (const r of rows) assert.ok(r.id.startsWith(`station-${s.heading}-`), `${r.id} is listed under ${s.heading}`);
  }
});

test("the page's sample check output is exactly what check prints for the essay example's draft", () => {
  // The bare ``` block (no language), found by walking every fence in order, since a regex for an
  // empty language would also match the closing fence of the bash block above it.
  const sample = [...checking().matchAll(/```(\w*)\n([\s\S]*?)```/g)].find((m) => m[1] === "")[2];
  const d = tempDir("hs-writing-doc-check-");
  cpSync(join(ROOT, "examples", "writing"), d, { recursive: true });
  const r = spawnSync(process.execPath, [join(ROOT, "bin", "hyperspec.mjs"), "check", "essay.hyperspec.md", "--draft", "essay/draft.md"], { cwd: d, encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(sample, r.stdout);
  assert.match(checking(), /^npx @supersuit\/hyperspec check essay\.hyperspec\.md --draft essay\/draft\.md$/m);
});

// ------------------------------------------------------------ Sequential works -----------------
// The "Sequential works" section declares a sequence, lists its keys and shows a check. These tests
// hold the declaration to the course example, the keys to what the station reads, and the sample
// run to what check prints.

const sequential = () => doc.split("\n## Sequential works\n")[1].split("\n## ")[0];
const seqSub = (heading) => sequential().split(`\n### ${heading}\n`)[1].split("\n### ")[0];

test("the Sequential works declaration is the course example's own sequence block, line for line", () => {
  const sample = fence(seqSub("Declaring a sequence"), "yaml").trimEnd();
  const course = readFileSync(join(ROOT, "examples", "writing", "course.hyperspec.md"), "utf8");
  assert.ok(course.includes(`${sample}\n`), sample);
});

test("the Sequential works key table lists every key the station reads, with the station's defaults", async () => {
  const { DEFAULTS } = await import("../src/stations/sequence.mjs");
  const rows = [...seqSub("Declaring a sequence").matchAll(/^\| `([a-z_]+)` \| ([^|]+) \|/gm)].map((m) => [m[1], m[2].trim()]);
  assert.deepEqual(rows.map((r) => r[0]), ["unit", "files", "sections", "terms_section", "outline", "knows", "teaser"]);
  // files is read where the draft is assembled; every other key by the station itself.
  const src = readFileSync(join(ROOT, "src", "stations", "sequence.mjs"), "utf8");
  const draftSrc = readFileSync(join(ROOT, "src", "sequence-draft.mjs"), "utf8");
  for (const [key] of rows) assert.ok(key === "files" ? draftSrc.includes("sequence?.files") : src.includes(`raw.${key}`), `the station reads ${key}`);
  const byKey = Object.fromEntries(rows);
  for (const key of ["unit", "terms_section", "teaser"]) assert.equal(byKey[key], `\`${DEFAULTS[key]}\``, key);
  const yaml = fence(seqSub("Declaring a sequence"), "yaml");
  for (const s of DEFAULTS.sections) assert.ok(yaml.includes(`        - ${s}\n`), `the declaration shows the default section ${s}`);
});

test("the Sequential works sample check output is exactly what check prints for the course example", () => {
  const section = seqSub("Checking a sequence");
  const sample = [...section.matchAll(/```(\w*)\n([\s\S]*?)```/g)].find((m) => m[1] === "")[2];
  assert.match(section, /^npx @supersuit\/hyperspec check course\.hyperspec\.md$/m);
  const d = tempDir("hs-writing-doc-seq-");
  cpSync(join(ROOT, "examples", "writing"), d, { recursive: true });
  const r = spawnSync(process.execPath, [join(ROOT, "bin", "hyperspec.mjs"), "check", "course.hyperspec.md"], { cwd: d, encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(sample, r.stdout);
});

test("the page's sample claims ledger line is a line of the essay's own ledger", () => {
  const sample = fence(checkingSubs().find((s) => s.heading === "claims").body, "jsonl").trim();
  const ledger = readFileSync(join(ROOT, "examples", "writing", "essay", "claims.jsonl"), "utf8").split("\n");
  assert.ok(ledger.includes(sample), sample);
});

test("the page's sample runs-ledger line has exactly the fields check writes, and every station", async () => {
  const { STATION_NAMES } = await import("../src/stations/index.mjs");
  const sample = JSON.parse(fence(checkingSubs().find((s) => s.heading === "The runs ledger").body, "json"));
  assert.deepEqual(Object.keys(sample), ["at", "kind", "draft", "draft_sha256", "spec_sha256", "stations", "verdict"]);
  assert.deepEqual(Object.keys(sample.stations), [...STATION_NAMES]);
  assert.equal(sample.kind, "check");
  const d = tempDir("hs-writing-doc-ledger-");
  cpSync(join(ROOT, "examples", "writing"), d, { recursive: true });
  spawnSync(process.execPath, [join(ROOT, "bin", "hyperspec.mjs"), "check", "essay.hyperspec.md", "--draft", sample.draft], { cwd: d, encoding: "utf8" });
  const written = JSON.parse(readFileSync(join(d, "essay", "runs.jsonl"), "utf8").trim().split("\n").at(-1));
  assert.deepEqual(Object.keys(written), Object.keys(sample));
  assert.deepEqual(written.stations, sample.stations);
  assert.equal(written.verdict, sample.verdict);
});

// ------------------------------------------------------------ Judging a draft ------------------
// The "Judging a draft" section describes `judge prepare` and `judge record`: one subsection per
// judgment station, each with a findings table. These tests hold the tables to the ids the judges
// raise and the kind each one is, the order to the registry, and every sample to what the commands
// print and write for the worked examples.

const section = (heading) => doc.split(`\n## ${heading}\n`)[1].split("\n## ")[0];
const subsOf = (heading) => section(heading).split("\n### ").slice(1).map((s) => {
  const nl = s.indexOf("\n");
  return { heading: s.slice(0, nl), body: s.slice(nl + 1) };
});
const judging = () => section("Judging a draft");
const learning = () => section("Learning from edits");
const bareBlocks = (text) => [...text.matchAll(/```(\w*)\n([\s\S]*?)```/g)].filter((m) => m[1] === "").map((m) => m[2]);
const bashLines = (text) => [...text.matchAll(/```bash\n([\s\S]*?)```/g)].flatMap((m) => m[1].trim().split("\n"));
const exampleCopy = (prefix) => {
  const d = tempDir(prefix);
  cpSync(join(ROOT, "examples", "writing"), d, { recursive: true });
  return d;
};
const run = (d, line) => {
  const prefix = "npx @supersuit/hyperspec ";
  assert.ok(line.startsWith(prefix), line);
  return spawnSync(process.execPath, [join(ROOT, "bin", "hyperspec.mjs"), ...line.slice(prefix.length).split(" ")], { cwd: d, encoding: "utf8" });
};

// Every judge finding id, with the kind the docs must give it: in a station file, an id raised
// before `export function derive` is a verdict problem (invalid), one raised in derive fails the
// station, or warns when a severity "warn" sits beside it; in src/judge.mjs, judge-stale is stale
// and every other id invalid.
function judgeIdsFromSource() {
  const out = new Map();
  const dir = join(ROOT, "src", "judges");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".mjs") && x !== "index.mjs")) {
    const src = readFileSync(join(dir, f), "utf8");
    const deriveAt = src.indexOf("export function derive(");
    assert.ok(deriveAt > 0, `${f} exports derive`);
    for (const m of src.matchAll(/"(judge-[a-z-]+)"/g)) {
      const kind = m.index < deriveAt ? "invalid" : /severity: "warn"/.test(src.slice(m.index, m.index + 400).split("\n").slice(0, 3).join("\n")) ? "warn" : "fail";
      out.set(m[1], kind);
    }
  }
  const core = readFileSync(join(ROOT, "src", "judge.mjs"), "utf8");
  for (const m of core.matchAll(/"(judge-[a-z-]+)"|`(judge-\$\{[^}]+\}-crashed)`/g)) {
    const id = normId(m[1] ?? m[2]);
    out.set(id, id === "judge-stale" ? "stale" : "invalid");
  }
  return out;
}

test("Judging a draft has its subsections in order, one per judgment station in the registry's order", async () => {
  const { JUDGE_NAMES } = await import("../src/judges/index.mjs");
  assert.deepEqual(subsOf("Judging a draft").map((s) => s.heading), ["The packet", "The evidence rule", "Recording a verdict", ...JUDGE_NAMES, "Any judgment station", "Judge lines in the runs ledger", "The worked examples"]);
});

test("the Judging a draft findings tables list exactly the ids the judges raise, with their kind, each under its own station", async () => {
  const { JUDGE_NAMES } = await import("../src/judges/index.mjs");
  const fromSource = judgeIdsFromSource();
  assert.ok(fromSource.size >= 25, `collected ${fromSource.size} ids`);
  const subs = subsOf("Judging a draft").filter((s) => [...JUDGE_NAMES, "Any judgment station"].includes(s.heading));
  const rows = subs.flatMap((s) => tableRows(s.body));
  const fromDoc = new Map(rows.map((r) => [normId(r.id), r.severity]));
  assert.equal(fromDoc.size, rows.length, "no id is listed twice");
  assert.deepEqual([...fromDoc.keys()].sort(), [...fromSource.keys()].sort());
  for (const [id, kind] of fromSource) assert.equal(fromDoc.get(id), kind, id);
  for (const r of rows) assert.ok(r.meaning.length > 10, `${r.id} has a meaning`);
  for (const s of subs.filter((x) => JUDGE_NAMES.includes(x.heading))) {
    const own = tableRows(s.body);
    assert.ok(own.length >= 1, `${s.heading} has a findings table`);
    for (const r of own) assert.ok(r.id.startsWith(`judge-${s.heading}-`), `${r.id} is listed under ${s.heading}`);
  }
});

test("the page's judge prepare sample is exactly what prepare prints for the essay, and writes the shipped packets", () => {
  const [cmd] = bashLines(judging());
  const d = exampleCopy("hs-doc-judge-prepare-");
  rmSync(join(d, "essay", "judge"), { recursive: true });
  mkdirSync(join(d, "essay", "judge"));
  const r = run(d, cmd);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(bareBlocks(judging())[0], r.stdout);
  for (const f of readdirSync(join(ROOT, "examples", "writing", "essay", "judge"))) {
    assert.equal(readFileSync(join(d, "essay", "judge", f), "utf8"), readFileSync(join(ROOT, "examples", "writing", "essay", "judge", f), "utf8"), f);
  }
});

test("the page's packet field table names every field of a real packet, and no other", () => {
  const body = subsOf("Judging a draft").find((s) => s.heading === "The packet").body;
  const fields = [...body.matchAll(/^\| (`[^|]+) \|/gm)].flatMap((m) => [...m[1].matchAll(/`([a-z_0-9]+)`/g)].map((x) => x[1]));
  for (const f of readdirSync(join(ROOT, "examples", "writing", "story", "judge"))) {
    const packet = JSON.parse(readFileSync(join(ROOT, "examples", "writing", "story", "judge", f), "utf8"));
    assert.deepEqual([...fields].sort(), Object.keys(packet).sort(), f);
  }
});

test("the page's judge record samples are exactly what record prints for the essay's lineup and the story's attribution samples", () => {
  const recording = subsOf("Judging a draft").find((s) => s.heading === "Recording a verdict").body;
  const d = exampleCopy("hs-doc-judge-record-");
  const r = run(d, bashLines(recording)[0]);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.equal(bareBlocks(recording)[0], r.stdout);
  const attribution = subsOf("Judging a draft").find((s) => s.heading === "attribution").body;
  const a = spawnSync(process.execPath, [join(ROOT, "bin", "hyperspec.mjs"), "judge", "record", "story/judge/attribution.packet.json", "--verdict", "story/sample-verdicts/attribution.verdict.json"], { cwd: d, encoding: "utf8" });
  assert.equal(a.status, 0, a.stdout + a.stderr);
  assert.equal(bareBlocks(attribution)[0], a.stdout);
});

test("the page's judge ledger line has exactly the fields record writes", () => {
  const body = subsOf("Judging a draft").find((s) => s.heading === "Judge lines in the runs ledger").body;
  const sample = JSON.parse(fence(body, "json"));
  const d = exampleCopy("hs-doc-judge-ledger-");
  spawnSync(process.execPath, [join(ROOT, "bin", "hyperspec.mjs"), "judge", "record", "essay/judge/lineup.packet.json", "--verdict", "essay/sample-verdicts/lineup.verdict.json"], { cwd: d, encoding: "utf8" });
  const written = JSON.parse(readFileSync(join(d, "essay", "runs.jsonl"), "utf8").trim().split("\n").at(-1));
  assert.deepEqual(Object.keys(sample), Object.keys(written));
  for (const k of ["kind", "station", "draft", "status", "verdict", "reason"]) assert.equal(sample[k], written[k], k);
});

test("the page's worked-examples table gives every sample verdict the status record derives", () => {
  const body = subsOf("Judging a draft").find((s) => s.heading === "The worked examples").body;
  const rows = [...body.matchAll(/^\| (essay|story) \| ([a-z]+) \| (pass|fail) \|/gm)].map((m) => ({ example: m[1], station: m[2], status: m[3] }));
  const packets = ["essay", "story"].flatMap((e) => readdirSync(join(ROOT, "examples", "writing", e, "judge")).map((f) => `${e}/${f.replace(".packet.json", "")}`));
  assert.deepEqual(rows.map((r) => `${r.example}/${r.station}`).sort(), packets.sort());
  const d = exampleCopy("hs-doc-judge-table-");
  for (const r of rows) {
    const res = spawnSync(process.execPath, [join(ROOT, "bin", "hyperspec.mjs"), "judge", "record", `${r.example}/judge/${r.station}.packet.json`, "--verdict", `${r.example}/sample-verdicts/${r.station}.verdict.json`, "--json"], { cwd: d, encoding: "utf8" });
    assert.equal(JSON.parse(res.stdout).status, r.status, `${r.example} ${r.station}`);
  }
});

// ------------------------------------------------------------ Learning from edits --------------

test("the page's learn samples are exactly what learn prepare and learn record print for the essay's pair", () => {
  const [prep, rec] = bashLines(learning());
  const [prepOut, recOut] = bareBlocks(learning());
  const d = exampleCopy("hs-doc-learn-");
  rmSync(join(d, "essay", "learn", "learn.packet.json"));
  const p = run(d, prep);
  assert.equal(p.status, 0, p.stdout + p.stderr);
  assert.equal(prepOut, p.stdout);
  const r = run(d, rec);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(recOut, r.stdout);
});

test("the page's next-move table is LEARN_MOVES, in block order", async () => {
  const { LEARN_MOVES, LEARN_BLOCKS } = await import("../src/learn.mjs");
  const body = subsOf("Learning from edits").find((s) => s.heading === "The tally and the next move").body;
  const rows = [...body.matchAll(/^\| `([a-z]+)` \| ([^|]+) \|$/gm)].map((m) => [m[1], m[2].trim()]);
  assert.deepEqual(rows, Object.entries(LEARN_MOVES));
  assert.deepEqual(rows.map(([b]) => b), LEARN_BLOCKS.filter((b) => b !== "none"));
});

test("the page's learn findings table lists exactly the ids learn raises, with their kind", () => {
  const src = readFileSync(join(ROOT, "src", "learn.mjs"), "utf8");
  const fromSource = new Map([...src.matchAll(/"(learn-[a-z-]+)"/g)].map((m) => [m[1], m[1] === "learn-stale" ? "stale" : "invalid"]));
  assert.ok(fromSource.size >= 10, `collected ${fromSource.size} ids`);
  const rows = subsOf("Learning from edits").flatMap((s) => tableRows(s.body)).filter((r) => r.id.startsWith("learn-"));
  assert.deepEqual(new Map(rows.map((r) => [r.id, r.severity])), fromSource);
});
