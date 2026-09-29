import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tempDir } from "./tmp.mjs";
import { loadSpec } from "../src/load.mjs";
import { lintSpec } from "../src/rules.mjs";
import { score } from "../src/score.mjs";
import { str } from "../src/placeholder.mjs";

// Each case here is a way a hollow spec used to pass 9/9 with writing 9/9, or a way init used to
// do something other than what was asked without saying so.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VALID = join(ROOT, "test", "fixtures", "writing-valid");
const run = (...a) => spawnSync(process.execPath, [join(ROOT, "bin", "hyperspec.mjs"), ...a], { encoding: "utf8" });

function variant(edit) {
  const d = tempDir("hs-harden-");
  cpSync(VALID, d, { recursive: true });
  const p = join(d, "spec.md");
  writeFileSync(p, edit(readFileSync(p, "utf8")));
  return loadSpec(p);
}
const fails = (s) => lintSpec(s).filter((x) => x.severity === "fail");
const pairs = (s) => fails(s).map((x) => [x.test, x.id]);
const has = (s, t, id) => pairs(s).some(([a, b]) => a === t && b === id);
const status = (s) => { const fs = lintSpec(s); return { ...score(fs, s.data), fs }; };

const character = (id, { golden = "a line only they say", rejected = "a line they would never say" } = {}) => [
  `    - id: ${id}`,
  "      speech:", "        uses:", "          - short declaratives", "        never:", "          - swears",
  "      wants: to be believed", "      fears: being forgotten", "      hides: the year it lost",
  "      knowledge:", "        - by: chapter-1", "          knows: something",
  "      arc_state: still deciding",
  "      golden_lines:", `        - ${golden}`,
  "      rejected_lines:", `        - ${rejected}`,
  "      check:", "        rubric: blind attribution test",
  "      source: story notes", "      author: example-author",
].join("\n");
const withCharacters = (t, chars, fiction = "true") =>
  t.replace("fiction: false", `  characters:\n${chars.join("\n")}\nfiction: ${fiction}`);

// ---------------------------------------------------------------- 1. fiction is a closed set

for (const v of ["True", "yes", "1", "TODO", "maybe"]) {
  test(`fiction: ${v} fails test 1, naming the value`, () => {
    const s = variant((t) => t.replace("fiction: false", `fiction: ${v}`));
    const f = fails(s).find((x) => x.id === "writing-fiction");
    assert.ok(f, JSON.stringify(pairs(s)));
    assert.equal(f.test, 1);
    if (v !== "TODO") assert.ok(f.message.includes(v), f.message);
  });
}

test("fiction absent means false: the essay still passes 9/9", () => {
  const s = variant((t) => t.replace("fiction: false\n", ""));
  const r = status(s);
  assert.equal(r.status, "pass", JSON.stringify(pairs(s)));
  assert.equal(r.profile.complete, 9);
});

test('fiction: "true" (quoted, padded) is true: a missing characters block then fails', () => {
  const s = variant((t) => t.replace("fiction: false", 'fiction: " true "'));
  assert.ok(has(s, 1, "writing-characters-missing"), JSON.stringify(pairs(s)));
  assert.ok(!pairs(s).some(([, id]) => id === "writing-fiction"));
});

// ---------------------------------------------------------------- 2. uniqueness and distinct counts

test("goal.conditions repeating one id fails test 2 as a duplicate and counts once toward 5 to 10", () => {
  const s = variant((t) => t.replace("conditions: [r1, r2, r3, r4, r5]", "conditions: [r1, r1, r1, r1, r1]"));
  assert.ok(has(s, 2, "writing-goal-conditions-duplicate"), JSON.stringify(pairs(s)));
  assert.ok(has(s, 2, "writing-goal-conditions-count"), JSON.stringify(pairs(s)));
});

test("goal.conditions with five distinct ids and one repeat fails the duplicate but not the count", () => {
  const s = variant((t) => t.replace("conditions: [r1, r2, r3, r4, r5]", "conditions: [r1, r2, r3, r4, r5, r5]"));
  assert.ok(has(s, 2, "writing-goal-conditions-duplicate"));
  assert.ok(!has(s, 2, "writing-goal-conditions-count"));
});

test("spine claims sharing an id fail test 1 and count once toward 3 to 7", () => {
  const s = variant((t) => t.replace("- id: c2", "- id: c1").replace("- id: c3", "- id: c1"));
  assert.ok(has(s, 1, "writing-spine-claim-id"), JSON.stringify(pairs(s)));
  assert.ok(has(s, 1, "writing-spine-claims-count"), JSON.stringify(pairs(s)));
  assert.equal(pairs(s).filter(([, id]) => id === "writing-spine-claim-id").length, 1, "one finding per repeated id");
});

test("two characters sharing an id fail test 1 under the characters block", () => {
  const s = variant((t) => withCharacters(t, [character("ann"), character("ann", { golden: "another line" })]));
  assert.ok(has(s, 1, "writing-characters-id"), JSON.stringify(pairs(s)));
  assert.ok(status(s).profile.complete < 9);
});

test("two materials sharing an id still fail test 1", () => {
  const s = variant((t) => t.replace(
    "        trust: raw\n",
    "        trust: raw\n      - id: m1\n        path: materials/call-2026-09-28.md\n        produced_by: gary-sheng\n        captured: \"2026-09-28\"\n        how: voice memo transcript\n        trust: raw\n",
  ));
  assert.ok(has(s, 1, "writing-materials-item-id"), JSON.stringify(pairs(s)));
});

// ---------------------------------------------------------------- 3. golden vs rejected

test("a character whose golden and rejected lines share a line fails test 6", () => {
  const s = variant((t) => withCharacters(t, [character("ann", { golden: "SAME LINE", rejected: "same line " })]));
  assert.ok(has(s, 6, "writing-characters-0-line-conflict"), JSON.stringify(pairs(s)));
});

test("a clean two-character spec passes, so the new rules do not fire on distinct ids and lines", () => {
  const s = variant((t) => withCharacters(t, [character("ann"), character("bo", { golden: "bo's own line", rejected: "a line bo would never say" })]));
  assert.equal(status(s).status, "pass", JSON.stringify(pairs(s)));
});

// ---------------------------------------------------------------- 4. profile lookup is own-property

for (const name of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
  test(`profile: ${name} is an unknown profile (a test 7 warning), never a crash`, () => {
    const s = variant((t) => t.replace("profile: writing", `profile: ${name}`));
    const fs = lintSpec(s);
    assert.ok(fs.some((x) => x.id === "unknown-profile" && x.severity === "warn" && x.test === 7), JSON.stringify(fs.map((x) => x.id)));
    assert.equal(score(fs, s.data).profile, undefined);
  });

  test(`init --profile ${name} exits 2 naming the known profiles, and writes nothing`, () => {
    const p = join(tempDir("hs-harden-init-"), "x.md");
    const r = run("init", p, "--profile", name);
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.match(r.stderr, /unknown profile/);
    assert.match(r.stderr, /writing/);
    assert.ok(!existsSync(p));
  });
}

// ---------------------------------------------------------------- 5. init refuses flags it cannot use

const initRefuses = (args, pattern) => {
  const p = join(tempDir("hs-harden-init-"), "x.md");
  const r = run("init", p, ...args);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, pattern);
  assert.doesNotMatch(r.stderr, /\n\s+at /, "no stack trace");
  assert.ok(!existsSync(p), "nothing written");
};

test("init --profile with no value exits 2", () => initRefuses(["--profile"], /--profile needs a value/));
test("init --profile followed by another flag exits 2", () => initRefuses(["--profile", "--fiction"], /--profile needs a value/));
test("init --fiction without --profile writing exits 2 naming --fiction", () => initRefuses(["--fiction"], /--fiction/));
test("init --form without --profile writing exits 2 naming --form", () => initRefuses(["--form", "essay"], /--form/));
test("init --profile writing --kind exits 2 and points at --form", () => initRefuses(["--profile", "writing", "--kind", "essay"], /--kind.*--form/));

test("init into a folder that does not exist exits 2 with a plain message", () => {
  const p = join(tempDir("hs-harden-init-"), "no-such-folder", "x.md");
  for (const args of [[], ["--profile", "writing"]]) {
    const r = run("init", p, ...args);
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.match(r.stderr, /does not exist/);
    assert.doesNotMatch(r.stderr, /\n\s+at |ENOENT/, "no stack trace");
  }
});

// ---------------------------------------------------------------- 6. form.length is a positive integer range

for (const [min, max, id] of [["0", "0", "writing-form-length-min"], ["-5", "-1", "writing-form-length-min"], ["600.5", "1200", "writing-form-length-min"], ["600", "0", "writing-form-length-max"], ["600", "1200.5", "writing-form-length-max"], ["1200", "600", "writing-form-length-range"]]) {
  test(`form.length min ${min}, max ${max} fails test 1 as ${id}`, () => {
    const s = variant((t) => t.replace("      min: 600\n      max: 1200\n", `      min: ${min}\n      max: ${max}\n`));
    assert.ok(has(s, 1, id), JSON.stringify(pairs(s)));
  });
}

test("form.length min 1, max 1 passes", () => {
  const s = variant((t) => t.replace("      min: 600\n      max: 1200\n", "      min: 1\n      max: 1\n"));
  assert.ok(!pairs(s).some(([, id]) => id.startsWith("writing-form-length")), JSON.stringify(pairs(s)));
});

// ---------------------------------------------------------------- 8. the widened placeholder rule

test("str() blanks the widened placeholder set, with optional trailing . : or !", () => {
  for (const v of ["TODO.", "tbd:", "FIXME!", "xxx...", "placeholder:", "<placeholder>.", "n/a", "N/A", "n/a.", "-", "---", "?", "???", "...", "…", "  ?  ", "todo:!"]) {
    assert.equal(str(v), "", JSON.stringify(v));
  }
});

test("str() keeps real text, including text that starts with a placeholder word or is a legitimate short value", () => {
  for (const v of ["TODO: write the opening", "none", "n/a for now, revisit in March", "- a list-looking line", "?why", "no", "0"]) {
    assert.equal(str(v), v.trim(), JSON.stringify(v));
  }
});

test("a writing field of n/a or ? fails like a missing one", () => {
  for (const v of ["n/a", "?", "...", "TODO."]) {
    const s = variant((t) => t.replace("    writer: example-author\n", `    writer: "${v}"\n`));
    assert.ok(has(s, 1, "writing-dna-writer"), `${v}: ${JSON.stringify(pairs(s))}`);
  }
});
