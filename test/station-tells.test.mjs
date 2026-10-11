// Station "tells" (hyperspec 0.13): the mechanical tells of machine prose by word list. Every hit
// is a warning with its line and the matched text; writing.tells may allow words, fail categories,
// set the lists-of-three density threshold, or switch the station off.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { workspace, draftOf, cli } from "./station-fixture.mjs";
import { loadSpec } from "../src/load.mjs";
import { run, findTells, TELLS, CATEGORIES, DEFAULT_LISTS_OF_THREE_PER_1000, LISTS_OF_THREE_MIN } from "../src/stations/tells.mjs";

// The fixture spec with `yaml` added under writing:, loaded.
function specWith(yaml = "") {
  const w = workspace();
  if (yaml) writeFileSync(w.specPath, readFileSync(w.specPath, "utf8").replace("\nwriting:\n", `\nwriting:\n${yaml}`));
  return { ...w, spec: loadSpec(w.specPath) };
}
const filler = (n) => Array.from({ length: n }, (_, i) => `Plain sentence number ${i + 1} says one thing.`).join(" ");
const hitsOf = (r) => r.findings.map((f) => [f.id, f.severity, f.line]);

test("the lists live in one exported constant, and the four categories are fixed", () => {
  assert.deepEqual(CATEGORIES, ["ai-vocabulary", "contrast-pair", "overclaim", "lists-of-three"]);
  assert.ok(TELLS.ai_vocabulary.includes("delve") && TELLS.ai_vocabulary.includes("in today's fast-paced world"));
  assert.ok(TELLS.overclaim.includes("miracle") && TELLS.overclaim.includes("alien"));
  assert.ok(TELLS.contrast_pairs.length >= 4);
  assert.equal(DEFAULT_LISTS_OF_THREE_PER_1000, 3);
  assert.equal(LISTS_OF_THREE_MIN, 2);
});

test("a clean draft passes with no findings", () => {
  const { spec } = specWith();
  const r = run(spec, draftOf("# Title\n\nThe meeting starts on their topic.\n"));
  assert.deepEqual(r, { station: "tells", status: "pass", findings: [] });
});

test("AI vocabulary is a warning at its line, quoting the matched text, whole word and ignoring case", () => {
  const { spec } = specWith();
  const r = run(spec, draftOf("# Title\n\nWe Delve into it.\n\nIt was seamless. In today's fast-paced world, no.\nDelver and seamlessness are not tells.\n"));
  assert.equal(r.status, "pass");
  assert.deepEqual(hitsOf(r), [["station-tells-ai-vocabulary", "warn", 3], ["station-tells-ai-vocabulary", "warn", 5], ["station-tells-ai-vocabulary", "warn", 5]]);
  assert.match(r.findings[0].message, /^"Delve" is AI vocabulary/);
  assert.match(r.findings[2].message, /^"In today's fast-paced world" is AI vocabulary/);
});

test("\"testament\" is a tell only as \"a testament to\": the Old Testament is never flagged", () => {
  const { spec } = specWith();
  const r = run(spec, draftOf("The Old Testament says so.\nIt is a testament to her work.\n"));
  assert.deepEqual(hitsOf(r), [["station-tells-ai-vocabulary", "warn", 2]]);
  assert.match(r.findings[0].message, /"a testament to"/);
});

test("contrast pairs: not X, but Y; not only X but also Y; isn't just X, it's Y; it's not about X, it's about Y", () => {
  const { spec } = specWith();
  const text = [
    "This is not a tool, but a partner.",
    "It is not only fast but also cheap.",
    "It isn’t just a meeting, it’s the week.",
    "It's not about speed, it's about care.",
    "She did not stop. But he did.",
  ].join("\n");
  const r = run(spec, draftOf(`${text}\n`));
  assert.deepEqual(hitsOf(r), [1, 2, 3, 4].map((line) => ["station-tells-contrast-pair", "warn", line]));
  assert.match(r.findings[0].message, /^"not a tool, but" is a contrast pair/);
});

test("overclaim words are warnings: miracle, magical, alien-level", () => {
  const { spec } = specWith();
  const r = run(spec, draftOf("It felt like a miracle.\nA magical week.\nAlien-level technology.\n"));
  assert.deepEqual(hitsOf(r), [1, 2, 3].map((line) => ["station-tells-overclaim", "warn", line]));
  assert.match(r.findings[2].message, /^"Alien-level" overclaims/);
});

test("code is ignored: a tell inside a fence or an inline span is not prose", () => {
  const { spec } = specWith();
  const r = run(spec, draftOf("Use `delve` here.\n\n```\nmiracle\n```\n"));
  assert.deepEqual(r.findings, []);
});

test("lists of three are flagged only past the density threshold, every one with its line, the count and the rate", () => {
  const { spec } = specWith();
  // Two lists in about 30 words is far past 3 per 1,000: both are reported.
  const dense = run(spec, draftOf("We want red, green, and blue.\nThey sell apples, pears and plums.\nNothing else here today.\n"));
  assert.deepEqual(hitsOf(dense), [["station-tells-lists-of-three", "warn", 1], ["station-tells-lists-of-three", "warn", 2]]);
  assert.match(dense.findings[0].message, /^"red, green, and blue" is a list of three, one of 2 in \d+ words \(\d+\.\d per 1,000; the threshold is 3\)$/);
  // One list alone is never flagged, however short the draft.
  assert.deepEqual(run(spec, draftOf("We want red, green, and blue.\n")).findings, []);
  // Two lists in about 1,000 words is under the threshold.
  assert.deepEqual(run(spec, draftOf(`We want red, green, and blue. ${filler(70)} They sell apples, pears and plums. ${filler(70)}\n`)).findings, []);
  // A four-item list is not a list of three.
  assert.deepEqual(findTells("One, two, three, and four. Five, six, seven and eight.").filter((h) => h.category === "lists-of-three"), []);
});

test("writing.tells.lists_of_three_per_1000 sets the threshold", () => {
  const draft = draftOf(`We want red, green, and blue. ${filler(70)} They sell apples, pears and plums. ${filler(70)}\n`);
  const { spec } = specWith("  tells:\n    lists_of_three_per_1000: 1\n");
  assert.deepEqual(hitsOf(run(spec, draft)).map((h) => h[0]), ["station-tells-lists-of-three", "station-tells-lists-of-three"]);
});

test("writing.tells.allow skips a word or phrase, ignoring case", () => {
  const { spec } = specWith("  tells:\n    allow:\n      - Robust\n      - a testament to\n");
  const r = run(spec, draftOf("A robust test.\nIt is a Testament to her.\nWe delve.\n"));
  assert.deepEqual(hitsOf(r), [["station-tells-ai-vocabulary", "warn", 3]]);
});

test("writing.tells.fail_on turns a category's hits into failures, and only that category's", () => {
  const { spec } = specWith("  tells:\n    fail_on:\n      - overclaim\n");
  const r = run(spec, draftOf("A miracle.\nWe delve.\n"));
  assert.equal(r.status, "fail");
  assert.deepEqual(hitsOf(r), [["station-tells-overclaim", "fail", 1], ["station-tells-ai-vocabulary", "warn", 2]]);
});

test("writing.tells.off: true skips the station", () => {
  const { spec } = specWith("  tells:\n    off: true\n");
  assert.deepEqual(run(spec, draftOf("A miracle.\n")), { station: "tells", status: "skip", findings: [], reason: "writing.tells.off is true" });
});

test("check prints a tell as a warning under the station and exits 0", () => {
  const w = specWith();
  writeFileSync(w.draftPath, "We delve.\n");
  const r = cli("check", w.specPath, "--draft", w.draftPath, "--only", "tells");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^tells: pass\n  warn \[station-tells-ai-vocabulary\] "delve" is AI vocabulary/m);
});

test("lint: writing.tells must be usable", () => {
  const cases = [
    ["  tells: yes\n", "writing-tells"],
    ["  tells:\n    off: maybe\n", "writing-tells-off"],
    ["  tells:\n    allow: robust\n", "writing-tells-allow"],
    ["  tells:\n    fail_on:\n      - cliches\n", "writing-tells-fail-on"],
    ["  tells:\n    lists_of_three_per_1000: many\n", "writing-tells-lists-of-three"],
  ];
  for (const [yaml, id] of cases) {
    const w = specWith(yaml);
    const r = cli("lint", w.specPath, "--json");
    assert.equal(r.status, 1, `${id}: ${r.stdout}`);
    const found = JSON.parse(r.stdout).files[0].findings.map((f) => `${f.id} ${f.test}`);
    assert.ok(found.includes(`${id} 1`), `${id}: ${found.join(", ")}`);
  }
  const ok = specWith("  tells:\n    off: false\n    allow:\n      - robust\n    fail_on:\n      - overclaim\n      - contrast-pair\n    lists_of_three_per_1000: 2.5\n");
  assert.equal(cli("lint", ok.specPath).status, 0);
});
