import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tempDir } from "./tmp.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const run = (...a) => spawnSync(process.execPath, [join(ROOT, "bin", "hyperspec.mjs"), ...a], { encoding: "utf8" });
const FIXTURE = join(ROOT, "test", "fixtures", "writing-valid");

// A copy of the writing-valid fixture in its own temp dir, so ledger appends and draft edits in
// one test never touch the checked-in fixture or bleed into another test.
function workspace() {
  const dir = tempDir("hs-check-");
  cpSync(FIXTURE, dir, { recursive: true });
  return { dir, spec: join(dir, "spec.md"), draft: join(dir, "draft.md"), ledger: join(dir, "runs.jsonl") };
}

// n tokens of filler ("c0 c1 c2 ..."), each token one word by the same word definition the
// station uses (a run of letters/digits), so the count below is exact.
const filler = (n, prefix) => Array.from({ length: n }, (_, i) => `${prefix}${i}`).join(" ");

// writing.form.length is 600-1200 words, required_parts is [claim, evidence, close]. 3 heading
// words (Claim, Evidence, Close) plus 3*n filler words.
function draftText(n) {
  return `# Claim\n\n${filler(n, "c")}\n\n# Evidence\n\n${filler(n, "e")}\n\n# Close\n\n${filler(n, "l")}\n`;
}
const PASSING_DRAFT = draftText(210); // 3 + 630 = 633 words, inside 600-1200
const SHORT_DRAFT = draftText(2); // 3 + 6 = 9 words, well under 600

function ledgerLines(path) {
  return readFileSync(path, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
}

test("a missing draft file is a usage error: exit 2, plain message", () => {
  const { spec } = workspace();
  const r = run("check", spec, "--draft", "/nope/missing-draft.md");
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /cannot read draft/);
  assert.equal(r.stdout, "");
});

test("an unknown --only station name is a usage error naming the known stations", () => {
  const { spec, draft } = workspace();
  writeFileSync(draft, PASSING_DRAFT);
  const r = run("check", spec, "--draft", draft, "--only", "form,nope");
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /unknown station: nope/);
  assert.match(r.stderr, /known stations: form/);
});

test("a spec that fails lint runs no station and exits with lint's own code (1)", () => {
  const { dir, spec, draft } = workspace();
  writeFileSync(draft, PASSING_DRAFT);
  const text = readFileSync(spec, "utf8");
  const broken = text.replace("rejects:\n  - hype words about AI\n  - a claim with no material behind it\n", "");
  assert.notEqual(broken, text, "the rejects block was not found to remove");
  writeFileSync(spec, broken);
  const r = run("check", spec, "--draft", draft);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /fail \(8\/9\)/);
  assert.match(r.stdout, /no stations run/);
  // Refused before the draft was even opened, so nothing was appended.
  assert.equal(ledgerLines(join(dir, "runs.jsonl")).length, 0);
});

test("a spec blocked on an open decision runs no station and exits 3", () => {
  const { spec, draft } = workspace();
  writeFileSync(draft, PASSING_DRAFT);
  const text = readFileSync(spec, "utf8");
  const blocked = text.replace(
    "state: delegated\n    rule: publish wherever the audience block's reads_on line says they already are\n",
    "state: open\n    question: where should this publish?\n",
  );
  assert.notEqual(blocked, text);
  writeFileSync(spec, blocked);
  const r = run("check", spec, "--draft", draft);
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.match(r.stdout, /blocked \(9\/9\)/);
});

test("a passing draft: form station passes, exit 0, and the ledger gets a one-shot line", () => {
  const { spec, draft, ledger } = workspace();
  writeFileSync(draft, PASSING_DRAFT);
  const r = run("check", spec, "--draft", draft);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^form: pass$/m);
  assert.match(r.stdout, /verdict: one-shot/);

  const lines = ledgerLines(ledger);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].kind, "check");
  assert.equal(lines[0].draft, draft);
  assert.equal(lines[0].stations.form, "pass");
  assert.equal(lines[0].verdict, "one-shot");
  assert.equal("change" in lines[0], false);
  assert.equal("reason" in lines[0], false);
});

test("checking the same unchanged draft again is not-improved (it was already checked)", () => {
  const { spec, draft, ledger } = workspace();
  writeFileSync(draft, PASSING_DRAFT);
  assert.equal(run("check", spec, "--draft", draft).status, 0);
  const r = run("check", spec, "--draft", draft);
  assert.equal(r.status, 0, r.stdout + r.stderr);

  const lines = ledgerLines(ledger);
  assert.equal(lines.length, 2);
  assert.equal(lines[1].verdict, "not-improved");
  assert.match(lines[1].reason, /draft unchanged since a prior check/);
});

test("a failing draft (too short) fails the form station, exit 1, ledger not-improved naming it", () => {
  const { spec, draft, ledger } = workspace();
  writeFileSync(draft, SHORT_DRAFT);
  const r = run("check", spec, "--draft", draft);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /^form: fail$/m);
  assert.match(r.stdout, /station-form-length/);
  assert.match(r.stdout, /word count 9 is outside writing\.form\.length \(600 to 1200 words\)/);

  const lines = ledgerLines(ledger);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].stations.form, "fail");
  assert.equal(lines[0].verdict, "not-improved");
  assert.equal(lines[0].reason, "failing stations: form");
});

test("fixing the draft after a failing check is improved, and names what now passes", () => {
  const { spec, draft, ledger } = workspace();
  writeFileSync(draft, SHORT_DRAFT);
  assert.equal(run("check", spec, "--draft", draft).status, 1);

  writeFileSync(draft, PASSING_DRAFT);
  const r = run("check", spec, "--draft", draft);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /verdict: improved/);

  const lines = ledgerLines(ledger);
  assert.equal(lines.length, 2);
  assert.equal(lines[1].verdict, "improved");
  assert.equal(lines[1].change, "stations now pass: form");
});

test("--only form runs just that station (the only one registered) and behaves the same as the default", () => {
  const { spec, draft } = workspace();
  writeFileSync(draft, PASSING_DRAFT);
  const r = run("check", spec, "--draft", draft, "--only", "form");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^form: pass$/m);
});

test("--json prints one document with specPath, draftPath, stations and verdict", () => {
  const { spec, draft } = workspace();
  writeFileSync(draft, PASSING_DRAFT);
  const r = run("check", spec, "--draft", draft, "--json");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.specPath, spec);
  assert.equal(out.draftPath, draft);
  assert.equal(out.stations.length, 1);
  assert.equal(out.stations[0].station, "form");
  assert.equal(out.stations[0].status, "pass");
  assert.equal(out.verdict, "one-shot");
});

test("appending check lines never breaks the spec's own lint test 9", () => {
  const { spec, draft } = workspace();
  writeFileSync(draft, SHORT_DRAFT);
  run("check", spec, "--draft", draft);
  writeFileSync(draft, PASSING_DRAFT);
  run("check", spec, "--draft", draft);
  run("check", spec, "--draft", draft);
  const r = run("lint", spec);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /pass \(9\/9\)/);
});
