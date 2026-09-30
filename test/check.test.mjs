import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tempDir } from "./tmp.mjs";
import { createHash } from "node:crypto";
import { runStation } from "../src/check.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const run = (...a) => spawnSync(process.execPath, [join(ROOT, "bin", "hyperspec.mjs"), ...a], { encoding: "utf8" });
const FIXTURE = join(ROOT, "test", "fixtures", "writing-valid");

// A copy of the writing-valid fixture in its own temp dir, so ledger appends and draft edits in
// one test never touch the checked-in fixture or bleed into another test.
function workspace() {
  const dir = tempDir("hs-check-");
  cpSync(FIXTURE, dir, { recursive: true });
  // An empty claims ledger (the fixture's draft makes no claims), so a FULL check of a passing
  // draft passes every station and the ledger tests below can use real, non-partial runs.
  writeFileSync(join(dir, "essay.claims.jsonl"), "");
  return { dir, spec: join(dir, "spec.md"), draft: join(dir, "draft.md"), ledger: join(dir, "runs.jsonl") };
}

// A partial check: form only. It prints form's result, and its ledger line is partial, so the
// ledger tests use checkAll below.
const checkForm = (...a) => run("check", ...a, "--only", "form");
// A full check: every registered station, the only kind of run that writes a verdict other than
// not-improved and the only kind later verdicts read.
const checkAll = (...a) => run("check", ...a);

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

// ---- the runs ledger (full runs, partial runs, and every verdict reason) -------------------------

// The spec with one more audience term; TERM_DRAFT uses it without defining it, so only a SPEC
// change moves the terms station between pass and fail.
const TERM_DRAFT = `${PASSING_DRAFT}\nWe keep a zorblax near the door.\n`;
// The spec starts with a terms list the draft never uses (terms runs and passes); addTerm puts
// zorblax on it, and the returned function puts the spec back byte for byte.
function withTerms(spec) {
  const text = readFileSync(spec, "utf8");
  const next = text.replace("    reader: person\n", "    reader: person\n    terms:\n      - widget\n");
  assert.notEqual(next, text);
  writeFileSync(spec, next);
}
function addTerm(spec) {
  const text = readFileSync(spec, "utf8");
  const next = text.replace("      - widget\n", "      - widget\n      - zorblax\n");
  assert.notEqual(next, text);
  writeFileSync(spec, next);
  return () => writeFileSync(spec, text);
}
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");

test("a passing full check: exit 0, and the ledger gets a one-shot line with the draft and spec hashes", () => {
  const { spec, draft, ledger } = workspace();
  writeFileSync(draft, PASSING_DRAFT);
  const r = checkAll(spec, "--draft", draft);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^form: pass$/m);
  assert.match(r.stdout, /verdict: one-shot/);
  const lines = ledgerLines(ledger);
  assert.equal(lines.length, 1);
  assert.deepEqual(Object.keys(lines[0]), ["at", "kind", "draft", "draft_sha256", "spec_sha256", "stations", "verdict"]);
  assert.equal(lines[0].kind, "check");
  assert.equal(lines[0].draft_sha256, sha(draft));
  assert.equal(lines[0].spec_sha256, sha(spec));
  assert.equal(lines[0].stations.form, "pass");
  assert.equal(lines[0].verdict, "one-shot");
});

test("the ledger records the draft relative to the spec's folder, however it was given", () => {
  const { dir, spec, draft, ledger } = workspace();
  writeFileSync(draft, PASSING_DRAFT);
  assert.equal(checkAll(spec, "--draft", draft).status, 0); // absolute
  assert.equal(spawnSync(process.execPath, [join(ROOT, "bin", "hyperspec.mjs"), "check", "spec.md", "--draft", "./draft.md"], { cwd: dir, encoding: "utf8" }).status, 0);
  const lines = ledgerLines(ledger);
  assert.deepEqual(lines.map((l) => l.draft), ["draft.md", "draft.md"]);
  // One history: the second spelling is a repeat of the first, not a fresh one-shot.
  assert.equal(lines[1].reason, "no change since the last passing check");
});

test("re-checking an unchanged draft against an unchanged spec: no change since the last passing check", () => {
  const { spec, draft, ledger } = workspace();
  writeFileSync(draft, PASSING_DRAFT);
  assert.equal(checkAll(spec, "--draft", draft).status, 0);
  assert.equal(checkAll(spec, "--draft", draft).status, 0);
  const lines = ledgerLines(ledger);
  assert.equal(lines[1].verdict, "not-improved");
  assert.equal(lines[1].reason, "no change since the last passing check");
});

test("a failing first check is not-improved naming the failing stations", () => {
  const { spec, draft, ledger } = workspace();
  writeFileSync(draft, SHORT_DRAFT);
  const r = checkAll(spec, "--draft", draft);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /station-form-length/);
  assert.match(r.stdout, /word count 9 is outside writing\.form\.length \(600 to 1200 words\)/);
  const [line] = ledgerLines(ledger);
  assert.equal(line.stations.form, "fail");
  assert.equal(line.verdict, "not-improved");
  assert.equal(line.reason, "failing stations: form");
});

test("fixing the draft after a failing check is improved, naming exactly what failed then and passes now", () => {
  const { spec, draft, ledger } = workspace();
  writeFileSync(draft, SHORT_DRAFT);
  assert.equal(checkAll(spec, "--draft", draft).status, 1);
  writeFileSync(draft, PASSING_DRAFT);
  const r = checkAll(spec, "--draft", draft);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /verdict: improved \(stations now pass: form\)/);
  assert.equal(ledgerLines(ledger)[1].change, "stations now pass: form");
});

test("improved settles: after a fix, re-checks and later harmless edits are not-improved, never improved again", () => {
  const { spec, draft, ledger } = workspace();
  writeFileSync(draft, PASSING_DRAFT);
  checkAll(spec, "--draft", draft); // one-shot
  writeFileSync(draft, SHORT_DRAFT);
  checkAll(spec, "--draft", draft); // fails
  writeFileSync(draft, PASSING_DRAFT);
  checkAll(spec, "--draft", draft); // improved
  checkAll(spec, "--draft", draft); // unchanged
  writeFileSync(draft, `${PASSING_DRAFT}\nOne more harmless line.\n`);
  checkAll(spec, "--draft", draft); // edited, still passing
  const lines = ledgerLines(ledger);
  assert.deepEqual(lines.map((l) => l.verdict), ["one-shot", "not-improved", "improved", "not-improved", "not-improved"]);
  assert.equal(lines[1].reason, "draft changed; failing stations: form");
  assert.equal(lines[2].change, "stations now pass: form");
  assert.equal(lines[3].reason, "no change since the last passing check");
  assert.equal(lines[4].reason, "draft changed; every station still passes");
});

test("a failing draft checked again unchanged, then edited and still failing: each reason says which", () => {
  const { spec, draft, ledger } = workspace();
  writeFileSync(draft, SHORT_DRAFT);
  checkAll(spec, "--draft", draft);
  checkAll(spec, "--draft", draft);
  writeFileSync(draft, `${SHORT_DRAFT}more words\n`);
  checkAll(spec, "--draft", draft);
  const lines = ledgerLines(ledger);
  assert.deepEqual(lines.map((l) => l.reason), [
    "failing stations: form",
    "no change since the last check; still failing: form",
    "draft changed; still failing: form",
  ]);
});

test("a spec-only change is named as one: the same draft fails after a spec edit and improves after the revert", () => {
  const { spec, draft, ledger } = workspace();
  withTerms(spec);
  writeFileSync(draft, TERM_DRAFT);
  assert.equal(checkAll(spec, "--draft", draft).status, 0); // one-shot
  const revert = addTerm(spec);
  assert.equal(checkAll(spec, "--draft", draft).status, 1); // the spec now asks for a definition
  assert.equal(checkAll(spec, "--draft", draft).status, 1); // unchanged, still failing
  revert();
  assert.equal(checkAll(spec, "--draft", draft).status, 0); // the same draft passes again
  checkAll(spec, "--draft", draft); // unchanged
  const lines = ledgerLines(ledger);
  assert.deepEqual(lines.map((l) => l.verdict), ["one-shot", "not-improved", "not-improved", "improved", "not-improved"]);
  assert.equal(lines[1].reason, "spec changed; failing stations: terms");
  assert.notEqual(lines[1].spec_sha256, lines[0].spec_sha256);
  assert.equal(lines[1].draft_sha256, lines[0].draft_sha256);
  assert.equal(lines[2].reason, "no change since the last check; still failing: terms");
  assert.equal(lines[3].change, "stations now pass: terms");
  assert.equal(lines[4].reason, "no change since the last passing check");
});

test("a failing station that the spec then stops running is named as skipped, not as passing", () => {
  const { spec, draft, ledger } = workspace();
  const original = readFileSync(spec, "utf8");
  writeFileSync(draft, TERM_DRAFT);
  withTerms(spec);
  addTerm(spec);
  assert.equal(checkAll(spec, "--draft", draft).status, 1);
  writeFileSync(spec, original); // no terms list at all: terms skips
  assert.equal(checkAll(spec, "--draft", draft).status, 0);
  const lines = ledgerLines(ledger);
  assert.equal(lines[1].verdict, "not-improved");
  assert.equal(lines[1].reason, "spec changed; stations that failed last time now skip: terms");
});

test("a spec and draft changed together, still passing, says both changed", () => {
  const { spec, draft, ledger } = workspace();
  writeFileSync(draft, PASSING_DRAFT);
  checkAll(spec, "--draft", draft);
  writeFileSync(spec, readFileSync(spec, "utf8").replace("reads_on: a phone, in ninety seconds", "reads_on: a phone, in two minutes"));
  writeFileSync(draft, `${PASSING_DRAFT}\nAnother line.\n`);
  checkAll(spec, "--draft", draft);
  assert.equal(ledgerLines(ledger)[1].reason, "spec and draft changed; every station still passes");
});

test("an --only run is partial: not-improved with its stations named, and ignored by later verdicts", () => {
  const { spec, draft, ledger } = workspace();
  writeFileSync(draft, PASSING_DRAFT);
  const partial = checkForm(spec, "--draft", draft);
  assert.equal(partial.status, 0, partial.stdout + partial.stderr);
  assert.match(partial.stdout, /verdict: not-improved \(partial run: form\)/);
  checkAll(spec, "--draft", draft); // the first FULL check is still the one-shot
  writeFileSync(draft, SHORT_DRAFT);
  checkAll(spec, "--draft", draft); // full failure
  writeFileSync(draft, PASSING_DRAFT);
  run("check", spec, "--draft", draft, "--only", "form,terms"); // partial pass: not history
  checkAll(spec, "--draft", draft); // compared with the full failure, not the partial pass
  const lines = ledgerLines(ledger);
  assert.equal(lines[0].partial, true);
  assert.equal(lines[0].verdict, "not-improved");
  assert.equal(lines[0].reason, "partial run: form");
  assert.deepEqual(lines[0].stations, { form: "pass" });
  assert.equal(lines[1].verdict, "one-shot");
  assert.equal("partial" in lines[1], false);
  assert.equal(lines[3].reason, "partial run: form, terms");
  assert.equal(lines[4].verdict, "improved");
  assert.equal(lines[4].change, "stations now pass: form");
});

test("a spec without the writing profile is refused: exit 2, nothing appended", () => {
  const dir = tempDir("hs-check-minimal-");
  cpSync(join(ROOT, "examples"), dir, { recursive: true });
  writeFileSync(join(dir, "d.md"), "Some text.\n");
  const before = readFileSync(join(dir, "runs.jsonl"), "utf8");
  const r = spawnSync(process.execPath, [join(ROOT, "bin", "hyperspec.mjs"), "check", "minimal.hyperspec.md", "--draft", "d.md"], { cwd: dir, encoding: "utf8" });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /^check needs a writing spec \(profile: writing\)$/m);
  assert.equal(readFileSync(join(dir, "runs.jsonl"), "utf8"), before);
});

test("a UTF-8 BOM on the draft is stripped: a required heading on line 1 is found", () => {
  const { spec, draft } = workspace();
  writeFileSync(draft, `﻿${PASSING_DRAFT}`);
  const r = checkForm(spec, "--draft", draft);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^form: pass$/m);
});

test("--json usage errors are one JSON document with the spec, the draft and the error; exit 2", () => {
  const { spec } = workspace();
  const r = run("check", spec, "--draft", "missing.md", "--json");
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), { spec, draft: "missing.md", error: "cannot read draft: missing.md" });
});

test("--only that names no station is a usage error", () => {
  const { spec, draft } = workspace();
  writeFileSync(draft, PASSING_DRAFT);
  const r = run("check", spec, "--draft", draft, "--only", ",");
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /--only names no station/);
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
  const r = checkAll(spec, "--draft", draft, "--json");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.specPath, spec);
  assert.equal(out.draftPath, draft);
  assert.equal(out.stations.length, 9);
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

test("runStation: a crash message never carries an absolute path", () => {
  const missing = join(tempDir("hs-check-crash-"), "nowhere", "missing.jsonl");
  const boom = { name: "boom", run: () => readFileSync(missing) };
  const result = runStation(boom, {}, { path: "d.md", text: "", lines: [], sha256: "" }, {});
  assert.equal(result.findings[0].id, "station-boom-crashed");
  assert.match(result.findings[0].message, /^ENOENT/);
  assert.match(result.findings[0].message, /missing\.jsonl/);
  assert.equal(result.findings[0].message.includes(missing), false, result.findings[0].message);
  assert.doesNotMatch(result.findings[0].message, /'\//);
});

test("runStation: a station that does not throw passes its own result straight through", () => {
  const fine = { name: "fine", run: () => ({ station: "fine", status: "pass", findings: [] }) };
  const result = runStation(fine, {}, { path: "d.md", text: "", lines: [], sha256: "" }, {});
  assert.deepEqual(result, { station: "fine", status: "pass", findings: [] });
});

test("appending check lines never breaks the spec's own lint test 9", () => {
  const { spec, draft } = workspace();
  writeFileSync(draft, SHORT_DRAFT);
  checkAll(spec, "--draft", draft);
  writeFileSync(draft, PASSING_DRAFT);
  checkAll(spec, "--draft", draft);
  checkAll(spec, "--draft", draft);
  checkForm(spec, "--draft", draft);
  const r = run("lint", spec);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /pass \(9\/9\)/);
});
