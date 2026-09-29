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
// The skeleton always exits 1 (fail), never 3 (blocked): resume/feedback/rejects/examples/
// requirements are left exactly as template.mjs's own base skeleton leaves them (empty, or
// blank feedback strings), which already fails tests 2, 5, 6 and 8 regardless of the writing
// profile. score.mjs's own precedence (`failed.size ? "fail" : open.length ? "blocked" : "pass"`)
// means any fail finding anywhere wins over "blocked", so the four open decisions this skeleton
// adds (writing-dna, writing-persona, writing-audience, writing-goal) show up in the `open:` list
// on every run, but they never change the exit code by themselves.

test("init --profile writing writes a skeleton that lints fail (exit 1), never pass, with the four writing blocks deferred to open decisions", () => {
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

  // Materials, form, spine and sources are present and visibly broken (not silently missing);
  // dna, persona, audience and goal are deferred, so neither produces a writing-<block>-missing
  // finding at all (the deferral working as designed, not merely an open decision sitting unused
  // beside a block that failed anyway).
  const ids = file.findings.filter((f) => f.severity === "fail").map((f) => f.id);
  for (const b of ["dna", "persona", "audience", "goal"]) {
    assert.ok(!ids.includes(`writing-${b}-missing`), `writing-${b}-missing must not fire: the block is deferred`);
  }
  assert.ok(ids.includes("writing-materials-item-0-trust"), "materials.trust placeholder must fail closed-set");
  assert.ok(ids.includes("writing-materials-item-0-path-missing"), "materials path placeholder must not exist");
  assert.ok(ids.includes("writing-form-length-min") && ids.includes("writing-form-length-max"), "form.length placeholders must fail as non-numeric");
  assert.ok(ids.includes("writing-spine-claims-count"), "spine must have fewer than 3 claims");
  assert.ok(ids.includes("writing-sources-unsourced-claim"), "sources.unsourced_claim placeholder must fail closed-set");
});

// ---------------------------------------------------------------------------------------------
// --form sets both the kind: line and writing.form.name; default is essay.

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
// --fiction: fiction: true, plus one character skeleton with every required field present.

test("--fiction sets fiction: true and adds one character with every required field present as a placeholder", () => {
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

  // Present and structurally complete: no writing-characters-0-* finding fires at all, matching
  // the brief's own phrasing ("every required character field present as a placeholder" — present,
  // not broken). Everything else in the skeleton still fails, so the spec is still fail overall.
  const out = JSON.parse(run("lint", p, "--json").stdout);
  const ids = out.files[0].findings.map((f) => f.id);
  assert.ok(!ids.some((id) => id.startsWith("writing-characters-0-")), ids.join(", "));
  assert.equal(out.files[0].status, "fail");
  assert.deepEqual(out.files[0].profile, { name: "writing", complete: 1, total: 9 });
});

// ---------------------------------------------------------------------------------------------
// Filling the skeleton's placeholders with the valid fixture's values lints 9/9: proof the
// skeleton has the right shape, no extra or missing keys.
//
// Two separate proofs, because one alone would be weak: (1) a direct per-block key-shape
// comparison against the fixture (the literal "no extra or missing keys" claim), and (2) an
// actual fill-and-lint: everything from decisions: onward in the skeleton (which is where the
// skeleton's OWN placeholder and deferred content lives) is replaced by the fixture's already-
// proven-passing content, its files are materialized alongside, and the result is linted.

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

test("the skeleton's materials, form, spine and sources blocks have exactly the fixture's keys: none extra, none missing", () => {
  const p = join(tempDir("hs-init-writing-"), "spec.md");
  run("init", p, "--profile", "writing");
  const skeleton = loadSpec(p).data.writing;
  const fixture = loadSpec(WRITING_VALID).data.writing;
  for (const block of ["materials", "form", "spine", "sources"]) {
    assert.deepEqual(dottedKeys(skeleton[block]).sort(), dottedKeys(fixture[block]).sort(), block);
  }
});

test("filling the writing skeleton's placeholders with the valid fixture's values lints pass (9/9), writing 9/9 blocks complete", () => {
  const d = tempDir("hs-init-writing-fill-");
  const p = join(d, "spec.md");
  run("init", p, "--profile", "writing");
  const skeletonText = readFileSync(p, "utf8");
  const fixtureText = readFileSync(WRITING_VALID, "utf8");

  // Everything from "decisions:" onward is where the skeleton's own deferred decisions and
  // placeholder content live; splicing in the fixture's already-passing content there (keeping
  // the skeleton's own header: hyperspec/title/kind/profile) is the fill.
  const skeletonHeader = skeletonText.slice(0, skeletonText.indexOf("decisions:"));
  const fixtureBody = fixtureText.slice(fixtureText.indexOf("decisions:"));
  writeFileSync(p, skeletonHeader + fixtureBody);

  // The fixture's writing.materials/dna/goldens/examples files, so the filled spec's paths
  // resolve exactly as they do for the fixture itself.
  for (const name of ["materials", "goldens", "examples"]) {
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
// HELP mentions the new flags.

test("HELP documents --profile, --form and --fiction", () => {
  const r = run("--help");
  assert.match(r.stdout, /--profile writing/);
  assert.match(r.stdout, /--form/);
  assert.match(r.stdout, /--fiction/);
});
