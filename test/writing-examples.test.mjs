import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFileSync, cpSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { tempDir } from "./tmp.mjs";
import { loadSpec } from "../src/load.mjs";
import { readSegments, splitSegments } from "../src/segments.mjs";
import { readScope } from "../src/dna.mjs";
import { MATERIAL_LABELS } from "../src/labels.mjs";

// The two worked examples WRITING.md points at. They are the documentation's proof: each one has
// to lint clean, with every block complete and not one warning, exactly as shipped.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BIN = join(ROOT, "bin", "hyperspec.mjs");
const BASE = join(ROOT, "examples", "writing");
const EXAMPLES = ["essay.hyperspec.md", "story.hyperspec.md", "course.hyperspec.md"];

const lint = (args, cwd) => spawnSync(process.execPath, [BIN, "lint", ...args], { cwd, encoding: "utf8" });

for (const name of EXAMPLES) {
  test(`examples/writing/${name} passes 9/9 with every writing block complete`, () => {
    const r = lint([join(BASE, name)]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /: pass \(9\/9\)\n/);
    assert.ok(r.stdout.includes("  writing: 9/9 blocks complete\n"), r.stdout);
  });

  test(`examples/writing/${name} has zero findings, warnings included`, () => {
    const r = lint([join(BASE, name), "--json"]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const file = JSON.parse(r.stdout).files[0];
    assert.deepEqual(file.findings, []);
    assert.deepEqual(file.profile, { name: "writing", complete: 9, total: 9 });
  });
}

test("every example lints clean from a copy, the way an adopter would run them", () => {
  const d = tempDir("hs-writing-examples-");
  cpSync(BASE, d, { recursive: true });
  const r = lint(EXAMPLES, d);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout.match(/writing: 9\/9 blocks complete/g)?.length, EXAMPLES.length, r.stdout);
});

test("the story example is fiction with two characters whose golden lines never overlap", async () => {
  const { loadSpec } = await import("../src/load.mjs");
  const d = loadSpec(join(BASE, "story.hyperspec.md")).data;
  assert.equal(d.fiction, "true");
  const chars = d.writing.characters;
  assert.equal(chars.length, 2);
  const [a, b] = chars;
  // A line that is golden for one character and rejected for the other is fine (it is how the
  // voices are told apart); a line golden for both would mean the voices have blurred.
  assert.deepEqual(a.golden_lines.filter((l) => b.golden_lines.includes(l)), []);
  for (const c of chars) assert.ok(c.knowledge.length >= 2, `${c.id} has a knowledge timeline, not one entry`);
});

test("the essay example is not fiction and carries no characters", async () => {
  const { loadSpec } = await import("../src/load.mjs");
  const d = loadSpec(join(BASE, "essay.hyperspec.md")).data;
  assert.equal(d.fiction, "false");
  assert.equal(d.writing.characters, undefined);
});

test("the writing examples ship no personal path and no email", () => {
  const files = readdirSync(BASE, { recursive: true }).filter((f) => statSync(join(BASE, f)).isFile());
  assert.ok(files.length > 10, "the examples and every file they name are present");
  for (const f of files) {
    const text = readFileSync(join(BASE, f), "utf8");
    assert.ok(!/\/Users\/|\/home\/|[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/.test(text), `${f} holds a personal path or email`);
  }
});

test("a writing spec written with inline maps and a commented inline list lints the same as block style", () => {
  // Adopters copy the compact schema shape: `scope: { ... }`, `check: { ... }`, and a list with a
  // trailing comment. The reader has to see those as a map and a list, or a correct spec fails.
  const d = tempDir("hs-writing-inline-");
  cpSync(BASE, d, { recursive: true });
  const p = join(d, "essay.hyperspec.md");
  let t = readFileSync(p, "utf8");
  t = t.replace(/\n    scope:\n      form: (.+)\n      audience: (.+)\n      purpose: (.+)\n/, (_, f, a, pu) => `\n    scope: { form: ${f}, audience: ${a}, purpose: ${pu} }\n`);
  t = t.replace(/conditions: \[(.+)\]\n    check:\n      rubric: (.+)\n/, (_, c, r) => `conditions: [${c}]   # five to ten requirement ids\n    check: { rubric: "${r.replace(/"/g, '\\"')}" }\n`);
  assert.match(t, /scope: \{ form:/, "the dna scope was rewritten inline");
  assert.match(t, /# five to ten requirement ids\n    check: \{ rubric:/, "the goal list and check were rewritten inline");
  writeFileSync(p, t);
  const r = lint([p]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(r.stdout.includes("  writing: 9/9 blocks complete\n"), r.stdout);
});

// ---------------------------------------------------------------------------------------------
// Scoped writer DNA: the essay reads its voice from a scope folder (writing.dna.scope_dir), the
// story keeps its goldens inline, so between them the two examples show both paths.

const essayDna = () => loadSpec(join(BASE, "essay.hyperspec.md")).data.writing.dna;

test("the essay names a scope folder whose scope.md matches the spec, with at least three complete goldens", () => {
  const dna = essayDna();
  assert.equal(dna.scope_dir, "dna/essay-new-managers-teach");
  const { scope, goldens, findings } = readScope(join(BASE, dna.scope_dir), { displayDir: dna.scope_dir });
  assert.deepEqual(findings, []);
  assert.deepEqual(
    { writer: scope.writer, form: scope.form, audience: scope.audience, purpose: scope.purpose },
    { writer: dna.writer, ...dna.scope },
  );
  assert.ok(goldens.length >= 3, `${goldens.length} goldens`);
  for (const g of goldens) {
    for (const field of ["why", "approved_by", "source"]) assert.ok(g[field]?.trim(), `${g.path} has ${field}`);
    assert.doesNotMatch(g.approved_by, /^agent:/i, `${g.path} is approved by a person`);
  }
});

test("every golden the essay names lies inside its scope's goldens/, lists the whole scope, and carries the scope file's own why", () => {
  const dna = essayDna();
  const root = resolve(BASE, dna.scope_dir, "goldens") + sep;
  const { goldens } = readScope(join(BASE, dna.scope_dir));
  const byPath = new Map(goldens.map((g) => [join(dna.scope_dir, g.path).split(sep).join("/"), g]));
  for (const g of dna.goldens) {
    assert.ok(resolve(BASE, g.path).startsWith(root), `${g.path} is inside ${dna.scope_dir}/goldens/`);
    assert.equal(g.why, byPath.get(g.path)?.why, `${g.path}: the spec's why is the golden file's why`);
  }
  assert.deepEqual(dna.goldens.map((g) => g.path).sort(), [...byPath.keys()].sort(), "the spec lists every golden in the scope");
  // The top-level examples entry points into the scope too, never at a golden that no longer exists.
  const top = loadSpec(join(BASE, "essay.hyperspec.md")).data.examples;
  for (const e of top) assert.ok(resolve(BASE, e.path).startsWith(root), e.path);
});

test("the essay's features.json is current and is exactly what dna measure writes, so it was measured, not hand-written", () => {
  const dir = essayDna().scope_dir;
  const shipped = readFileSync(join(BASE, dir, "features.json"), "utf8");
  const recorded = JSON.parse(shipped).goldens;
  const current = readScope(join(BASE, dir)).goldens.map((g) => ({ path: g.path, sha256: g.sha256 }));
  assert.deepEqual(recorded, current);
  const d = tempDir("hs-writing-dna-measure-");
  cpSync(join(BASE, dir), d, { recursive: true });
  const r = spawnSync(process.execPath, [BIN, "dna", "measure", d], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(readFileSync(join(d, "features.json"), "utf8"), shipped);
});

test("the essay's scope_dir path is live: an edited golden makes lint fail on a stale features.json", () => {
  const d = tempDir("hs-writing-dna-stale-");
  cpSync(BASE, d, { recursive: true });
  const dir = essayDna().scope_dir;
  appendFileSync(join(d, dir, "goldens", "status.md"), "One more sentence nobody approved.\n");
  const r = lint([join(d, "essay.hyperspec.md"), "--json"]);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const ids = JSON.parse(r.stdout).files[0].findings.map((f) => f.id);
  assert.deepEqual(ids, ["writing-dna-features-stale"]);
});

test("the story keeps its goldens inline: no scope_dir, and no golden inside a scope folder", () => {
  const dna = loadSpec(join(BASE, "story.hyperspec.md")).data.writing.dna;
  assert.equal(dna.scope_dir, undefined);
  assert.ok(dna.goldens.length >= 1);
  for (const g of dna.goldens) assert.ok(!g.path.startsWith("dna/"), g.path);
});

// ---------------------------------------------------------------------------------------------
// Materials marking: both examples are marked the way an adopter would mark them, so between them
// they show every label in use, and every spine claim cites the segments that support it.

function markedMaterials() {
  const out = [];
  for (const name of EXAMPLES) {
    const d = loadSpec(join(BASE, name)).data;
    for (const it of d.writing.materials.items) {
      assert.ok(it.segments, `${name}: material ${it.id} names a segments file`);
      const r = readSegments(join(BASE, it.segments), { materialPath: join(BASE, it.path), materialId: it.id });
      out.push({ example: name, id: it.id, ...r });
    }
  }
  return out;
}

test("every material in every example is marked, and every segments file is valid on its own", () => {
  const all = markedMaterials();
  assert.equal(all.length, 7);
  for (const m of all) {
    assert.deepEqual(m.findings, [], `${m.example}: ${m.id}`);
    assert.equal(m.header.material, m.id);
    assert.ok(m.segments.length >= 2, `${m.example}: ${m.id} is split into more than one segment`);
  }
});

test("every example segments file keeps the spans segments init writes, so an adopter can reproduce the marking", () => {
  // Only the labels (and the fields they need) are hand work; the boundaries are the splitter's,
  // in paragraph mode or sentence mode. No example needs a hand split.
  for (const name of EXAMPLES) {
    const d = loadSpec(join(BASE, name)).data;
    for (const it of d.writing.materials.items) {
      const text = readFileSync(join(BASE, it.path), "utf8");
      const r = readSegments(join(BASE, it.segments), {});
      const spans = (segs) => segs.map((s) => `${s.start}-${s.end}`).join(",");
      const want = spans(r.segments);
      const modes = ["paragraph", "sentence"].filter((by) => spans(splitSegments(text, { by })) === want);
      assert.ok(modes.length > 0, `${name}: material ${it.id} matches neither splitter mode`);
    }
  }
});

test("between them, the two examples use every label, each with the field it needs", () => {
  const segs = markedMaterials().flatMap((m) => m.segments);
  const used = new Set(segs.map((s) => s.label));
  assert.deepEqual([...MATERIAL_LABELS].filter((l) => !used.has(l)), [], "every label appears at least once");
  assert.ok(segs.some((s) => s.label === "claim" && typeof s.source === "string" && s.source.trim()), "a claim with a source");
  assert.ok(segs.some((s) => s.label === "claim" && s.own === true && s.source === undefined), "a claim marked own");
  assert.ok(segs.some((s) => s.label === "story" && s.teller), "a story with a teller");
  assert.ok(segs.some((s) => s.label === "quote" && s.speaker), "a quote with a speaker");
  // A quote is words someone actually said, so its text carries the quotation marks it was
  // recorded in.
  for (const s of segs.filter((x) => x.label === "quote")) assert.match(s.text, /"[^"]+"/, s.id);
});

test("every spine claim in both examples cites segments, never a private or question segment", () => {
  for (const name of EXAMPLES) {
    const d = loadSpec(join(BASE, name)).data;
    const byMaterial = new Map(markedMaterials().filter((m) => m.example === name).map((m) => [m.id, m.segments]));
    for (const c of d.writing.spine.claims) {
      assert.ok(c.materials.length >= 1, `${name}: ${c.id}`);
      for (const ref of c.materials) {
        const [mid, sid] = ref.split("#");
        assert.ok(sid, `${name}: ${c.id} cites "${ref}", a whole material rather than a segment`);
        const seg = byMaterial.get(mid)?.find((s) => s.id === sid);
        assert.ok(seg, `${name}: ${c.id} cites "${ref}", which does not resolve`);
        assert.ok(!["private", "question"].includes(seg.label), `${name}: ${c.id} cites ${seg.label} segment "${ref}"`);
      }
    }
  }
});

test("npm pack ships every file under examples/, segments files and the essay's DNA scope included", () => {
  const r = spawnSync("npm", ["pack", "--dry-run", "--json"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const packed = new Set(JSON.parse(r.stdout)[0].files.map((f) => f.path));
  const shipped = readdirSync(join(ROOT, "examples"), { recursive: true })
    .filter((f) => statSync(join(ROOT, "examples", f)).isFile())
    .map((f) => join("examples", f).split("\\").join("/"));
  assert.ok(shipped.filter((f) => f.endsWith(".segments.jsonl")).length === 7, "seven segments files exist");
  const scope = "examples/writing/dna/essay-new-managers-teach";
  for (const f of ["scope.md", "features.json", "goldens/README.md", "goldens/opening.md", "goldens/status.md", "goldens/close.md"]) {
    assert.ok(packed.has(`${scope}/${f}`), `${scope}/${f} ships`);
  }
  assert.deepEqual(shipped.filter((f) => !packed.has(f)), []);
});
