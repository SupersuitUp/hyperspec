import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tempDir } from "./tmp.mjs";
import { run } from "../src/stations/claims.mjs";

// A workspace with just a ledger file; the spec object points at it via writing.sources.ledger,
// resolved relative to spec.dir the same way every other writing path resolves.
function workspace(ledgerLines, sources = {}) {
  const dir = tempDir("hs-claims-");
  const ledgerPath = "claims.jsonl";
  writeFileSync(join(dir, ledgerPath), ledgerLines.map((l) => (typeof l === "string" ? l : JSON.stringify(l))).join("\n") + (ledgerLines.length ? "\n" : ""));
  return { dir, ledgerPath, spec: specWith(dir, { ledger: ledgerPath, ...sources }) };
}

function specWith(dir, sources) {
  return { dir, data: { writing: { sources } } };
}

// Mirrors src/check.mjs's own draft shape: this station never reads draft.lines at all, only
// draft.text, so lines here is inert and just kept for shape-fidelity with real callers.
function draftOf(text) {
  return { path: "draft.md", text, lines: text.split("\n") };
}

test("no writing.sources.ledger set at all: skip", () => {
  const result = run({ dir: tempDir("hs-claims-"), data: { writing: { sources: {} } } }, draftOf("Anything."));
  assert.equal(result.station, "claims");
  assert.equal(result.status, "skip");
  assert.match(result.reason, /writing\.sources\.ledger is not set/);
});

test("a missing ledger file fails the whole station", () => {
  const spec = specWith(tempDir("hs-claims-"), { ledger: "nope.jsonl" });
  const result = run(spec, draftOf("Anything."));
  assert.equal(result.status, "fail");
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].id, "station-claims-ledger-missing");
  assert.equal(result.findings[0].station, "claims");
  assert.match(result.findings[0].message, /"nope\.jsonl" does not exist or cannot be read/);
});

test("an empty ledger (no lines) passes with no findings", () => {
  const { spec } = workspace([]);
  const result = run(spec, draftOf("A hyperspec is a contract."));
  assert.equal(result.status, "pass");
  assert.deepEqual(result.findings, []);
});

test("a claim whose text appears verbatim and has a source passes", () => {
  const { spec } = workspace([{ text: "a hyperspec is a contract a linter can check", source: "spec.md" }]);
  const draft = draftOf("The claim is this: a hyperspec is a contract a linter can check, not a prompt.");
  const result = run(spec, draft);
  assert.equal(result.status, "pass");
  assert.deepEqual(result.findings, []);
});

test("a claim whose text does not appear in the draft is stale", () => {
  const { spec } = workspace([{ text: "a hyperspec is a contract", source: "spec.md" }]);
  const draft = draftOf("This draft never says that at all.");
  const result = run(spec, draft);
  assert.equal(result.status, "fail");
  const f = result.findings.find((x) => x.id === "station-claims-stale");
  assert.ok(f, "expected a station-claims-stale finding");
  assert.equal(f.severity, "fail");
  assert.match(f.message, /does not appear verbatim in the draft/);
});

test("text matching normalizes whitespace and quote characters, not case", () => {
  const { spec } = workspace([{ text: "a “hyperspec”   is   a contract", source: "spec.md" }]);
  const draft = draftOf('Somewhere in here: a "hyperspec" is a contract, said plainly.');
  const result = run(spec, draft);
  assert.equal(result.status, "pass", JSON.stringify(result.findings));
});

test("case is NOT normalized: a case mismatch is stale", () => {
  const { spec } = workspace([{ text: "A Hyperspec is a contract", source: "spec.md" }]);
  const draft = draftOf("a hyperspec is a contract, somewhere in this draft.");
  const result = run(spec, draft);
  assert.equal(result.status, "fail");
  assert.equal(result.findings[0].id, "station-claims-stale");
});

test("a claim with no source fails as unsourced", () => {
  const { spec } = workspace([{ text: "a hyperspec is a contract", source: "" }]);
  const draft = draftOf("Somewhere: a hyperspec is a contract, stated plainly.");
  const result = run(spec, draft);
  assert.equal(result.status, "fail");
  const f = result.findings.find((x) => x.id === "station-claims-unsourced");
  assert.ok(f, "expected a station-claims-unsourced finding");
  assert.equal(f.severity, "fail");
});

test("a placeholder source (TODO) counts as missing", () => {
  const { spec } = workspace([{ text: "a hyperspec is a contract", source: "TODO" }]);
  const draft = draftOf("Somewhere: a hyperspec is a contract, stated plainly.");
  const result = run(spec, draft);
  const f = result.findings.find((x) => x.id === "station-claims-unsourced");
  assert.ok(f, "expected a station-claims-unsourced finding for a placeholder source");
});

test("unsourced_claim: warn downgrades the unsourced finding to a warning and the station still passes", () => {
  const { spec } = workspace([{ text: "a hyperspec is a contract", source: "" }], { unsourced_claim: "warn" });
  const draft = draftOf("Somewhere: a hyperspec is a contract, stated plainly.");
  const result = run(spec, draft);
  assert.equal(result.status, "pass");
  const f = result.findings.find((x) => x.id === "station-claims-unsourced");
  assert.ok(f);
  assert.equal(f.severity, "warn");
});

test("unsourced_claim: warn does NOT downgrade a stale finding", () => {
  const { spec } = workspace([{ text: "a hyperspec is a contract", source: "" }], { unsourced_claim: "warn" });
  const draft = draftOf("This draft never says that.");
  const result = run(spec, draft);
  assert.equal(result.status, "fail");
  const stale = result.findings.find((x) => x.id === "station-claims-stale");
  assert.equal(stale.severity, "fail");
});

test("a malformed JSON line is its own finding naming the line number, and does not stop the rest", () => {
  const { spec } = workspace([
    JSON.stringify({ text: "a hyperspec is a contract", source: "spec.md" }),
    "{ not json",
    JSON.stringify({ text: "the ledger is the claim list", source: "spec.md" }),
  ]);
  const draft = draftOf("a hyperspec is a contract. the ledger is the claim list, stated plainly.");
  const result = run(spec, draft);
  assert.equal(result.status, "fail");
  const f = result.findings.find((x) => x.id === "station-claims-json-line-2");
  assert.ok(f, "expected station-claims-json-line-2");
  assert.match(f.message, /line 2 is not valid JSON/);
});

test("a ledger line that is valid JSON but not an object is its own finding", () => {
  const { spec } = workspace(["[1,2,3]"]);
  const result = run(spec, draftOf("Anything."));
  assert.equal(result.status, "fail");
  assert.equal(result.findings[0].id, "station-claims-json-line-1");
  assert.match(result.findings[0].message, /is not a JSON object/);
});

test("a ledger line with no text is its own finding", () => {
  const { spec } = workspace([{ source: "spec.md" }]);
  const result = run(spec, draftOf("Anything."));
  assert.equal(result.status, "fail");
  assert.equal(result.findings[0].id, "station-claims-json-line-1");
  assert.match(result.findings[0].message, /line 1 has no text/);
});

test("blank lines in the ledger are skipped, not treated as malformed", () => {
  const dir = tempDir("hs-claims-");
  writeFileSync(join(dir, "claims.jsonl"), `${JSON.stringify({ text: "a hyperspec is a contract", source: "spec.md" })}\n\n\n`);
  const spec = specWith(dir, { ledger: "claims.jsonl" });
  const result = run(spec, draftOf("a hyperspec is a contract, somewhere."));
  assert.equal(result.status, "pass");
  assert.deepEqual(result.findings, []);
});

test("CRLF draft: a claim's text still matches verbatim (whitespace normalized) across a CRLF line ending", () => {
  const { spec } = workspace([{ text: "a hyperspec is a contract a linter can check", source: "spec.md" }]);
  const draft = draftOf("The claim is this:\r\na hyperspec is a contract a linter can check.\r\n");
  const result = run(spec, draft);
  assert.equal(result.status, "pass", JSON.stringify(result.findings));
});

test("CRLF draft: a claim not present in a CRLF draft is still reported stale", () => {
  const { spec } = workspace([{ text: "a hyperspec is a contract", source: "spec.md" }]);
  const draft = draftOf("This draft\r\nnever says that\r\nat all.\r\n");
  const result = run(spec, draft);
  assert.equal(result.status, "fail");
  assert.equal(result.findings[0].id, "station-claims-stale");
});
