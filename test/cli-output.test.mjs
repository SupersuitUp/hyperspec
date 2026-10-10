// Output that outgrows a pipe (0.12.1). A caller spawns the bin with piped stdout and parses its
// --json; Node writes a pipe asynchronously on macOS and some other platforms, so a command that
// printed and then exited at once used to lose everything past the first 64 KB. Every command
// prints through the same stdout, so these tests drive two of them past that size. The guard bites
// on macOS only: Linux writes pipes synchronously already, so there these pass with or without the
// fix.

import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { cli, workspace } from "./judge-fixture.mjs";

// 600 unanswered findings, each failing with its own message: well over 64 KB of JSON.
function bigTriage() {
  const w = workspace({ prefix: "hs-cli-output-" });
  const lines = Array.from({ length: 600 }, (_, i) => JSON.stringify({ finding_id: `f-${i}`, source: "panel", reader: "skeptic", kind: "improve", text: `finding number ${i} about the opening, long enough to fill the message the station prints`, evidence: "not a prompt someone wrote once", draft_sha256: "x", disposition: null, answer: null }));
  writeFileSync(join(w.dir, "triage.jsonl"), `${lines.join("\n")}\n`);
  return w;
}

test("check --json through a pipe arrives whole when it is larger than 64 KB", () => {
  const w = bigTriage();
  const r = cli(["check", w.spec, "--draft", w.draft, "--only", "triage", "--json"]);
  assert.equal(r.status, 1, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.ok(r.stdout.length > 65536, `only ${r.stdout.length} bytes: the fixture must outgrow a pipe`);
  assert.equal(out.stations[0].findings.length, 600);
  assert.equal(out.passed, false);
});

test("triage status --json through a pipe arrives whole when it is larger than 64 KB", () => {
  const w = bigTriage();
  const r = cli(["triage", "status", "spec.md", "--draft", "draft.md", "--json"], { cwd: w.dir });
  assert.equal(r.status, 1, r.stderr);
  assert.equal(JSON.parse(r.stdout).items.length, 600);
  assert.ok(r.stdout.length > 65536, `only ${r.stdout.length} bytes: the fixture must outgrow a pipe`);
});
