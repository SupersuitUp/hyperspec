import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, cpSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tempDir } from "./tmp.mjs";
import { loadSpec } from "../src/load.mjs";
import { template } from "../src/template.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const run = (...a) => spawnSync(process.execPath, [join(ROOT, "bin", "hyperspec.mjs"), ...a], { encoding: "utf8" });
const WRITING_VALID_DIR = join(ROOT, "test", "fixtures", "writing-valid");
const WRITING_VALID = join(WRITING_VALID_DIR, "spec.md");

// ---------------------------------------------------------------------------------------------
// init with no --profile: byte-for-byte unchanged.

test("init with no --profile writes exactly what template() would, unaffected by the writing profile existing", () => {
  const p = join(tempDir("hs-init-"), "plain.md");
  assert.equal(run("init", p, "--title", "My piece", "--kind", "essay").status, 0);
  const written = readFileSync(p, "utf8");
  assert.equal(written, template({ title: "My piece", kind: "essay" }));
});

// ---------------------------------------------------------------------------------------------
// An unknown --profile is a usage error naming the known profiles.

test("init --profile <unknown> is a usage error (exit 2) naming the known profiles, and writes nothing", () => {
  const p = join(tempDir("hs-init-"), "spec.md");
  const r = run("init", p, "--profile", "screenplay");
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /unknown profile: screenplay/);
  assert.match(r.stderr, /writing/);
  assert.ok(!existsSync(p), "a rejected --profile must not write the file");
});

// ---------------------------------------------------------------------------------------------
// The skeleton itself: never lints as pass, and the test says exactly which result and why.
//
// Every required writing block (materials, dna, persona, audience, goal, form, spine, sources)
// appears inline, in schema order, with every field present as a placeholder — the bare word
// "TODO". str() in src/placeholder.mjs (fix round 1, R6) treats a value that IS the whole word
// todo/tbd/fixme/xxx/placeholder as blank, so every one of those fields fails its own presence
// check on its own; dna/persona/audience/goal additionally each carry an open decision naming the
// real judgment call the operator has to make, but that decision is not what makes the spec fail
// — the placeholder content already does, the same as materials/form/spine/sources.
// Two fields are real on purpose: the material item's segments: path (it names a segments file
// that does not exist yet, so the item fails as not marked) and the materials check.station.
//
// The skeleton always exits 1 (fail), never 3 (blocked): resume/feedback/rejects/examples/
// requirements are left exactly as template.mjs's own base skeleton leaves them (empty, or blank
// feedback strings), which already fails tests 2, 5, 6 and 8 regardless of the writing profile.
// score.mjs's own precedence (`failed.size ? "fail" : open.length ? "blocked" : "pass"`) means any
// fail finding anywhere wins over "blocked", so the four open decisions this skeleton adds
// (writing-dna, writing-persona, writing-audience, writing-goal) show up in the `open:` list on
// every run, but they never change the exit code by themselves.

test("init --profile writing writes a skeleton that lints fail (exit 1), never pass, with every block shown and four also carrying an open decision", () => {
  const p = join(tempDir("hs-init-writing-"), "spec.md");
  assert.equal(run("init", p, "--profile", "writing").status, 0);

  const r = run("lint", p);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /^\S+: fail \(\d\/9\), open: writing-dna, writing-persona, writing-audience, writing-goal$/m);
  assert.match(r.stdout, /^ {2}writing: 1\/9 blocks complete$/m);

  const out = JSON.parse(run("lint", p, "--json").stdout);
  const file = out.files[0];
  assert.equal(file.status, "fail");
  assert.deepEqual(file.open, ["writing-dna", "writing-persona", "writing-audience", "writing-goal"]);
  assert.deepEqual(file.profile, { name: "writing", complete: 1, total: 9 });

  // All eight required blocks are present (none produces a writing-<block>-missing finding),
  // and every one of them is genuinely broken (each produces at least one real, specific fail
  // finding), which is what makes writing: 1/9 correct: only characters (absent, not required
  // with no --fiction) is credited complete.
  const ids = out.files[0].findings.filter((f) => f.severity === "fail").map((f) => f.id);
  for (const b of ["materials", "dna", "persona", "audience", "goal", "form", "spine", "sources"]) {
    assert.ok(!ids.includes(`writing-${b}-missing`), `writing-${b}-missing must not fire: the block is present`);
    assert.ok(ids.some((id) => id.startsWith(`writing-${b}-`)), `writing-${b}- must have at least one real finding`);
  }
  // A sample of the specific, real rules each placeholder trips (not merely "something failed"):
  assert.ok(ids.includes("writing-materials-item-0-path-missing"), "materials path placeholder must not exist");
  assert.ok(ids.includes("writing-materials-segments-missing"), "the material's segments placeholder must not exist, so the item reads as not marked");
  assert.ok(!ids.includes("writing-materials-unmarked"), "the item carries a segments: field, so it is never reported as having none");
  assert.ok(ids.includes("writing-dna-writer"), "dna.writer placeholder must be blank");
  assert.ok(ids.includes("writing-persona-facts-from"), "persona.facts_from placeholder must fail closed-set");
  assert.ok(ids.includes("writing-audience-reader"), "audience.reader placeholder must fail closed-set");
  assert.ok(ids.includes("writing-goal-conditions-count"), "goal.conditions placeholder must be short of 5");
  assert.ok(ids.includes("writing-form-length-min") && ids.includes("writing-form-length-max"), "form.length placeholders must fail as non-numeric");
  assert.ok(ids.includes("writing-spine-claims-count"), "spine must have fewer than 3 claims");
  assert.ok(ids.includes("writing-sources-unsourced-claim"), "sources.unsourced_claim placeholder must fail closed-set");
});

test("the skeleton's dna block shows scope_dir: TODO like every other field, and it fails test 1 as writing-dna-scope-dir", () => {
  // Fix round 1, R2: scope_dir is optional, but a present placeholder value now fails on its own
  // (writing-dna-scope-dir, src/writing-fields.mjs), so it no longer needs the comment workaround
  // this test used to assert on. That check is what makes an uncommented `scope_dir: TODO` safe
  // to show at all: without it, str() would blank the placeholder to "absent" and a spec filled
  // in everywhere else would pass with the placeholder still sitting there.
  const p = join(tempDir("hs-init-writing-"), "spec.md");
  run("init", p, "--profile", "writing");
  const text = readFileSync(p, "utf8");
  const dnaBlock = text.slice(text.indexOf("\n  dna:\n"), text.indexOf("\n  persona:\n"));
  assert.match(dnaBlock, /^ {4}scope_dir: TODO$/m);
  assert.equal(loadSpec(p).data.writing.dna.scope_dir, "TODO");
  const ids = JSON.parse(run("lint", p, "--json").stdout).files[0].findings.map((f) => f.id);
  assert.ok(ids.includes("writing-dna-scope-dir"), JSON.stringify(ids));
  // Nothing further down the scope_dir path runs off a placeholder value: it is read as absent
  // by every check that gates on scopeDirRaw, so none of the scope-contents findings fire twice.
  assert.deepEqual(ids.filter((id) => /scope-mismatch|golden-leak|features-/.test(id)), []);
});

// ---------------------------------------------------------------------------------------------
// --form sets both the kind: line and writing.form.name; default is essay.

test("the skeleton's material placeholder names a segments file beside it, and its check is the marking station", () => {
  const p = join(tempDir("hs-init-writing-"), "spec.md");
  run("init", p, "--profile", "writing");
  const materials = loadSpec(p).data.writing.materials;
  assert.equal(materials.items[0].path, "materials/TODO.md");
  assert.equal(materials.items[0].segments, "materials/TODO.md.segments.jsonl");
  assert.equal(materials.check.station, "every segment of every material carries a label from the closed set, matches its source verbatim, and the markings are current");
});

test("--form sets both kind: and writing.form.name; the default is essay", () => {
  const p1 = join(tempDir("hs-init-writing-"), "spec.md");
  run("init", p1, "--profile", "writing");
  const s1 = loadSpec(p1);
  assert.equal(s1.data.kind, "essay");
  assert.equal(s1.data.writing.form.name, "essay");

  const p2 = join(tempDir("hs-init-writing-"), "spec.md");
  run("init", p2, "--profile", "writing", "--form", "short story");
  const s2 = loadSpec(p2);
  assert.equal(s2.data.kind, "short story");
  assert.equal(s2.data.writing.form.name, "short story");
});

// ---------------------------------------------------------------------------------------------
// --fiction: fiction: true, plus one character with every required field's shape shown — and,
// like every other block, genuinely broken (fix round 1, finding 1: an earlier draft filled every
// character field with the bare string "TODO" and it linted completely clean, since every check
// on a character is presence-only with no closed set to violate — the same "placeholder counts as
// present" defect class this repo had already fixed once for null/~. R6 closed it at the root,
// in str() itself, rather than special-casing this one block, so this is the design's own
// reading of the brief ("adds one character skeleton"), not a quotation of it.

test("--fiction sets fiction: true and adds one character whose placeholder shape is shown but genuinely fails, like every other block", () => {
  const p = join(tempDir("hs-init-writing-"), "spec.md");
  run("init", p, "--profile", "writing", "--fiction");
  const s = loadSpec(p);
  assert.equal(s.data.fiction, "true");
  assert.equal(s.data.writing.characters.length, 1);
  const c = s.data.writing.characters[0];
  assert.equal(c.id, "TODO");
  assert.deepEqual(c.speech.uses, ["TODO"]);
  assert.deepEqual(c.speech.never, ["TODO"]);
  for (const field of ["wants", "fears", "hides", "arc_state"]) assert.equal(c[field], "TODO");
  assert.equal(c.knowledge.length, 1);
  assert.equal(c.knowledge[0].by, "TODO");
  assert.equal(c.knowledge[0].knows, "TODO");
  assert.deepEqual(c.golden_lines, ["TODO"]);
  assert.deepEqual(c.rejected_lines, ["TODO"]);
  assert.equal(c.check.rubric, "TODO");
  assert.equal(c.source, "TODO");
  assert.equal(c.author, "TODO");

  // Present, but not clean: every required character field is a placeholder that str() now
  // treats as blank, so every one of characterFields()'s own checks fires, and the block is not
  // counted toward writing: k/9.
  const out = JSON.parse(run("lint", p, "--json").stdout);
  const ids = out.files[0].findings.filter((f) => f.severity === "fail").map((f) => f.id);
  const expectedCharIds = [
    "writing-characters-0-check", "writing-characters-0-source", "writing-characters-0-author",
    "writing-characters-0-knowledge-0-by", "writing-characters-0-knowledge-0-knows",
    "writing-characters-0-golden-lines", "writing-characters-0-rejected-lines",
    "writing-characters-0-speech-uses", "writing-characters-0-speech-never",
    "writing-characters-0-wants", "writing-characters-0-fears", "writing-characters-0-hides",
    "writing-characters-0-arc-state",
  ];
  for (const id of expectedCharIds) assert.ok(ids.includes(id), `${id} must fire`);
  assert.ok(!ids.includes("writing-characters-missing"), "the block is present, not missing");
  assert.equal(out.files[0].status, "fail");
  // Every one of the nine blocks is now present and broken: 0/9, not the 1/9 characters used to
  // get credited for free.
  assert.deepEqual(out.files[0].profile, { name: "writing", complete: 0, total: 9 });
});

// ---------------------------------------------------------------------------------------------
// Filling the skeleton's placeholders with the valid fixture's values lints 9/9: proof the
// skeleton has the right shape, no extra or missing keys, for EVERY required block (fix round 1,
// finding 2 widened this from materials/form/spine/sources to all eight).
//
// Two separate proofs, because one alone would be weak: (1) a direct per-block key-shape
// comparison against the fixture (the literal "no extra or missing keys" claim), and (2) an
// actual fill-and-lint: everything from decisions: onward in the skeleton (which is where the
// skeleton's OWN placeholder and open-decision content lives) is replaced by the fixture's
// already-proven-passing content, its files are materialized alongside, and the result is linted.

function dottedKeys(value, prefix = "") {
  if (Array.isArray(value)) {
    if (!value.length) return [prefix];
    return dottedKeys(value[0], prefix);
  }
  if (value !== null && typeof value === "object") {
    return Object.keys(value).flatMap((k) => dottedKeys(value[k], prefix ? `${prefix}.${k}` : k));
  }
  return [prefix];
}

test("the skeleton's eight required blocks each have exactly the fixture's keys: none extra, none missing", async (t) => {
  const p = join(tempDir("hs-init-writing-"), "spec.md");
  run("init", p, "--profile", "writing");
  const skeleton = loadSpec(p).data.writing;
  const fixture = loadSpec(WRITING_VALID).data.writing;
  for (const block of ["materials", "dna", "persona", "audience", "goal", "form", "spine", "sources"]) {
    await t.test(block, () => {
      // dna.scope_dir (0.5, optional) is a real `scope_dir: TODO` key on both sides since fix
      // round 1's R2 (src/writing-template.mjs, src/writing-fields.mjs's writing-dna-scope-dir
      // check), so no exception is needed here: every key on the fixture's side is expected on
      // the skeleton's side too, scope_dir included.
      assert.deepEqual(dottedKeys(skeleton[block]).sort(), dottedKeys(fixture[block]).sort(), block);
    });
  }
});

test("filling the writing skeleton's placeholders with the valid fixture's values lints pass (9/9), writing 9/9 blocks complete", () => {
  const d = tempDir("hs-init-writing-fill-");
  const p = join(d, "spec.md");
  run("init", p, "--profile", "writing");
  const skeletonText = readFileSync(p, "utf8");
  const fixtureText = readFileSync(WRITING_VALID, "utf8");

  // Everything from "decisions:" onward is where the skeleton's own open decisions and
  // placeholder content live; splicing in the fixture's already-passing content there (keeping
  // the skeleton's own header: hyperspec/title/kind/profile) is the fill.
  const skeletonHeader = skeletonText.slice(0, skeletonText.indexOf("decisions:"));
  const fixtureBody = fixtureText.slice(fixtureText.indexOf("decisions:"));
  writeFileSync(p, skeletonHeader + fixtureBody);

  // The fixture's writing.materials/dna-scope/examples files, so the filled spec's paths
  // resolve exactly as they do for the fixture itself.
  for (const name of ["materials", "dna-scope", "examples"]) {
    cpSync(join(WRITING_VALID_DIR, name), join(d, name), { recursive: true });
  }
  cpSync(join(WRITING_VALID_DIR, "WRITING-STYLE.md"), join(d, "WRITING-STYLE.md"));
  cpSync(join(WRITING_VALID_DIR, "runs.jsonl"), join(d, "runs.jsonl"));

  const r = run("lint", p);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /: pass \(9\/9\)$/m);
  assert.match(r.stdout, /^ {2}writing: 9\/9 blocks complete$/m);
});

// ---------------------------------------------------------------------------------------------
// HELP mentions the new flags, and says plainly that the skeleton never passes.

test("HELP documents --profile, --form, --fiction, and that the skeleton never passes until its placeholders and open decisions are replaced", () => {
  const r = run("--help");
  assert.match(r.stdout, /--profile writing/);
  assert.match(r.stdout, /--form/);
  assert.match(r.stdout, /--fiction/);
  assert.match(r.stdout, /never\s+passes/);
});
