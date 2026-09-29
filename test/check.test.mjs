import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tempDir } from "./tmp.mjs";
import { runStation } from "../src/check.mjs";

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

// Every check() call below that is testing form/the ledger passes --only form explicitly. The
// station registry (src/stations/index.mjs) is shared with concurrent work on other stations
// this file does not own (terms, claims, links, ...), so a bare `check` with no --only would make
// these tests depend on the pass/fail of stations this fix round has nothing to do with (e.g. a
// claims station failing because the fixture's claims ledger file does not exist yet). --only
// form keeps every assertion here scoped to exactly what this file is responsible for.
const checkForm = (...a) => run("check", ...a, "--only", "form");

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
  const r = checkForm(spec, "--draft", draft);
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
  assert.equal(checkForm(spec, "--draft", draft).status, 0);
  const r = checkForm(spec, "--draft", draft);
  assert.equal(r.status, 0, r.stdout + r.stderr);

  const lines = ledgerLines(ledger);
  assert.equal(lines.length, 2);
  assert.equal(lines[1].verdict, "not-improved");
  assert.match(lines[1].reason, /draft unchanged since a prior check/);
});

test("a failing draft (too short) fails the form station, exit 1, ledger not-improved naming it", () => {
  const { spec, draft, ledger } = workspace();
  writeFileSync(draft, SHORT_DRAFT);
  const r = checkForm(spec, "--draft", draft);
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
  assert.equal(checkForm(spec, "--draft", draft).status, 1);

  writeFileSync(draft, PASSING_DRAFT);
  const r = checkForm(spec, "--draft", draft);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /verdict: improved/);

  const lines = ledgerLines(ledger);
  assert.equal(lines.length, 2);
  assert.equal(lines[1].verdict, "improved");
  assert.equal(lines[1].change, "stations now pass: form");
});

test("fail, fix (improved), then re-checking the SAME fixed draft settles to not-improved every time after, never improved again", () => {
  const { spec, draft, ledger } = workspace();

  writeFileSync(draft, SHORT_DRAFT);
  assert.equal(checkForm(spec, "--draft", draft).status, 1); // 1: fail

  writeFileSync(draft, PASSING_DRAFT);
  assert.equal(checkForm(spec, "--draft", draft).status, 0); // 2: improved

  const second = checkForm(spec, "--draft", draft); // 3: re-check, nothing edited
  assert.equal(second.status, 0, second.stdout + second.stderr);
  const third = checkForm(spec, "--draft", draft); // 4: re-check again, still nothing edited
  assert.equal(third.status, 0, third.stdout + third.stderr);

  const lines = ledgerLines(ledger);
  assert.equal(lines.length, 4);
  assert.equal(lines[0].verdict, "not-improved"); // the original failure
  assert.equal(lines[1].verdict, "improved"); // fixed
  assert.equal(lines[2].verdict, "not-improved"); // re-check of the SAME sha: not improved again
  assert.match(lines[2].reason, /draft unchanged since a prior check/);
  assert.equal(lines[3].verdict, "not-improved"); // and again
  assert.match(lines[3].reason, /draft unchanged since a prior check/);
});

test("--only form runs just that station, regardless of whatever else is registered", () => {
  const { spec, draft } = workspace();
  writeFileSync(draft, PASSING_DRAFT);
  const r = run("check", spec, "--draft", draft, "--only", "form");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^form: pass$/m);
});

test("--json prints one document with specPath, draftPath, stations and verdict, and ledgerPath is the path as the spec wrote it, never resolved to absolute", () => {
  const { spec, draft } = workspace();
  writeFileSync(draft, PASSING_DRAFT);
  const r = checkForm(spec, "--draft", draft, "--json");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.specPath, spec);
  assert.equal(out.draftPath, draft);
  assert.equal(out.stations.length, 1);
  assert.equal(out.stations[0].station, "form");
  assert.equal(out.stations[0].status, "pass");
  assert.equal(out.verdict, "one-shot");
  // spec.md declares improvement.ledger: runs.jsonl; that literal string, never spec.dir
  // resolved onto it.
  assert.equal(out.ledgerPath, "runs.jsonl");
});

test("a CRLF draft's headings are still found: form passes on a draft with \\r\\n line endings", () => {
  const { spec, draft } = workspace();
  const crlf = PASSING_DRAFT.replace(/\n/g, "\r\n");
  writeFileSync(draft, crlf);
  const r = checkForm(spec, "--draft", draft);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^form: pass$/m);
});

test("runStation: a station whose run() throws becomes one failing finding, never a crash", () => {
  const boom = { name: "boom", run: () => { throw new Error("kaboom"); } };
  const result = runStation(boom, {}, { path: "d.md", text: "", lines: [], sha256: "" }, {});
  assert.equal(result.station, "boom");
  assert.equal(result.status, "fail");
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].id, "station-boom-crashed");
  assert.equal(result.findings[0].severity, "fail");
  assert.match(result.findings[0].message, /kaboom/);
  // No stack trace leaked into the finding message.
  assert.equal(/at .*\(.*:\d+:\d+\)/.test(result.findings[0].message), false);
});

test("runStation: a station that throws a non-Error value still comes back as a finding, not a crash", () => {
  const boom = { name: "boom", run: () => { throw "just a string"; } };
  const result = runStation(boom, {}, { path: "d.md", text: "", lines: [], sha256: "" }, {});
  assert.equal(result.status, "fail");
  assert.equal(result.findings[0].message, "just a string");
});

test("runStation: a station that does not throw passes its own result straight through", () => {
  const fine = { name: "fine", run: () => ({ station: "fine", status: "pass", findings: [] }) };
  const result = runStation(fine, {}, { path: "d.md", text: "", lines: [], sha256: "" }, {});
  assert.deepEqual(result, { station: "fine", status: "pass", findings: [] });
});

test("appending check lines never breaks the spec's own lint test 9", () => {
  const { spec, draft } = workspace();
  writeFileSync(draft, SHORT_DRAFT);
  checkForm(spec, "--draft", draft);
  writeFileSync(draft, PASSING_DRAFT);
  checkForm(spec, "--draft", draft);
  checkForm(spec, "--draft", draft);
  const r = run("lint", spec);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /pass \(9\/9\)/);
});
