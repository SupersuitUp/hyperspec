import { test } from "node:test";
import assert from "node:assert/strict";
import { run } from "../src/stations/terms.mjs";

function specWith(audience) {
  return { data: { writing: { audience } } };
}

// Mirrors src/check.mjs's own draft shape: lines is "\n"-split with any trailing "\r" stripped
// from each entry (a CRLF draft's line ending is 2 bytes; the "\r" is not part of this station's
// business, and its own line-counting below never reads draft.lines at all, only draft.text, so
// this station is correct whichever way check.mjs happens to build lines).
function draftOf(text) {
  return { path: "draft.md", text, lines: text.split("\n").map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l)) };
}

test("no terms list at all: skip, no findings", () => {
  const result = run(specWith({}), draftOf("Anything at all."));
  assert.equal(result.station, "terms");
  assert.equal(result.status, "skip");
  assert.deepEqual(result.findings, []);
  assert.match(result.reason, /writing\.audience\.terms is empty or not set/);
});

test("an empty terms list: skip, same reason", () => {
  const result = run(specWith({ terms: [] }), draftOf("Anything at all."));
  assert.equal(result.status, "skip");
});

test("a term defined with 'is' in the same sentence passes", () => {
  const draft = draftOf("A hyperspec is a contract a linter can check. It is not a prompt.");
  const result = run(specWith({ terms: ["hyperspec"] }), draft);
  assert.equal(result.status, "pass");
  assert.deepEqual(result.findings, []);
});

test("a term defined with 'means' passes", () => {
  const draft = draftOf("A golden means an approved passage. Nothing else about it matters here.");
  const result = run(specWith({ terms: ["golden"] }), draft);
  assert.equal(result.status, "pass");
});

test("a term defined with 'refers to' passes", () => {
  const draft = draftOf("The ledger refers to the JSONL file of claims. It lives beside the spec.");
  const result = run(specWith({ terms: ["ledger"] }), draft);
  assert.equal(result.status, "pass");
});

test("a term defined with a colon within a few words passes", () => {
  const draft = draftOf("Golden: an approved passage a draft is measured against. More text follows.");
  const result = run(specWith({ terms: ["golden"] }), draft);
  assert.equal(result.status, "pass");
});

test("a term immediately followed by a parenthetical passes", () => {
  const draft = draftOf("The station reads the ledger (the claims file) before anything else runs.");
  const result = run(specWith({ terms: ["ledger"] }), draft);
  assert.equal(result.status, "pass");
});

test("the definition may land in the NEXT sentence instead of the same one", () => {
  const draft = draftOf("This draft uses a scope. A scope means a writer, form, audience and purpose together.");
  const result = run(specWith({ terms: ["scope"] }), draft);
  assert.equal(result.status, "pass");
});

test("no definition anywhere nearby fails, naming the term and the line", () => {
  const draft = draftOf("Line one.\nThis draft simply mentions a hyperspec without further explanation.\nLine three is unrelated.");
  const result = run(specWith({ terms: ["hyperspec"] }), draft);
  assert.equal(result.status, "fail");
  const f = result.findings.find((x) => x.id === "station-terms-undefined-hyperspec");
  assert.ok(f, "expected a station-terms-undefined-hyperspec finding");
  assert.equal(f.station, "terms");
  assert.equal(f.severity, "fail");
  assert.equal(f.line, 2);
  assert.match(f.message, /term "hyperspec" is not defined at its first appearance/);
});

test("CRLF draft: an undefined term still reports the right 1-based line", () => {
  const draft = draftOf("Line one.\r\nThis draft simply mentions a hyperspec without further explanation.\r\nLine three is unrelated.\r\n");
  const result = run(specWith({ terms: ["hyperspec"] }), draft);
  assert.equal(result.status, "fail");
  const f = result.findings.find((x) => x.id === "station-terms-undefined-hyperspec");
  assert.ok(f, "expected a station-terms-undefined-hyperspec finding");
  assert.equal(f.line, 2);
});

test("CRLF draft: a definition on the same CRLF-terminated line still passes", () => {
  const draft = draftOf("A hyperspec is a contract a linter can check.\r\nA second line follows.\r\n");
  const result = run(specWith({ terms: ["hyperspec"] }), draft);
  assert.equal(result.status, "pass");
});

test("a term in audience.knows is never flagged, even with no definition", () => {
  const draft = draftOf("This draft just uses hyperspec with no definition at all.");
  const result = run(specWith({ terms: ["hyperspec"], knows: ["hyperspec"] }), draft);
  assert.equal(result.status, "pass");
  assert.deepEqual(result.findings, []);
});

test("knows matching is case-insensitive", () => {
  const draft = draftOf("This draft just uses Hyperspec with no definition at all.");
  const result = run(specWith({ terms: ["Hyperspec"], knows: ["hyperspec"] }), draft);
  assert.equal(result.status, "pass");
});

test("a term that never appears in the draft is not flagged", () => {
  const draft = draftOf("This draft never mentions the word at all.");
  const result = run(specWith({ terms: ["hyperspec"] }), draft);
  assert.equal(result.status, "pass");
  assert.deepEqual(result.findings, []);
});

test("matching is whole-word: 'AI' does not match inside another word", () => {
  const draft = draftOf("The word said contains no such term, and AI never appears in this draft body at all as its own word right here.");
  const result = run(specWith({ terms: ["AI"] }), draft);
  // "AI" does appear later as its own word with nothing defining it, so this should fail on that
  // real occurrence, never on "said".
  assert.equal(result.status, "fail");
  assert.equal(result.findings[0].message.includes('term "AI"'), true);
});

test("matching is case-insensitive for the term itself", () => {
  const draft = draftOf("hyperspec is a contract a linter can check.");
  const result = run(specWith({ terms: ["Hyperspec"] }), draft);
  assert.equal(result.status, "pass");
});

test("a multi-word term matches only as the exact phrase", () => {
  const draft = draftOf("A context window is the span of text a model can see at once.");
  const result = run(specWith({ terms: ["context window"] }), draft);
  assert.equal(result.status, "pass");
});

test("a definition 'is' more than 6 words after the term does not count", () => {
  const draft = draftOf("A hyperspec sits at the center of this whole essay and eventually is described. Nothing else says what it is nearby.");
  const result = run(specWith({ terms: ["hyperspec"] }), draft);
  assert.equal(result.status, "fail");
});

test("two undefined terms each get their own finding", () => {
  const draft = draftOf("A hyperspec and a golden both appear here with nothing explaining either one.");
  const result = run(specWith({ terms: ["hyperspec", "golden"] }), draft);
  const ids = result.findings.map((x) => x.id).sort();
  assert.deepEqual(ids, ["station-terms-undefined-golden", "station-terms-undefined-hyperspec"]);
});

// ---- fix round 1: code masking (R2's own known-item case) -------------------------------------

test("a term whose ONLY appearance is inside an inline code span never appears (skipped, no finding)", () => {
  // Before code masking, this mechanically satisfied the colon rule (the review's own example):
  // `ledger: check` reads as "ledger" immediately followed by a colon. Masked, "ledger" never
  // appears in prose at all, so there is nothing to define.
  const draft = draftOf("Run `ledger: check` before anything else.");
  const result = run(specWith({ terms: ["ledger"] }), draft);
  assert.equal(result.status, "pass");
  assert.deepEqual(result.findings, []);
});

test("a term appearing in a fenced code block is masked the same way", () => {
  const draft = draftOf("Before.\n```\nledger: check\n```\nAfter, with nothing else about it.");
  const result = run(specWith({ terms: ["ledger"] }), draft);
  assert.equal(result.status, "pass");
  assert.deepEqual(result.findings, []);
});

test("a term's REAL first appearance is in prose even when it also shows up in a code span first", () => {
  // The code span comes first in the text but is masked out, so the actual first appearance the
  // station reasons about is the prose one, which does define it.
  const draft = draftOf("See `hyperspec` for the syntax. A hyperspec is a contract a linter can check.");
  const result = run(specWith({ terms: ["hyperspec"] }), draft);
  assert.equal(result.status, "pass", JSON.stringify(result.findings));
});

test("a term whose only prose appearance is undefined still fails, even with an unrelated code span nearby", () => {
  const draft = draftOf("See `example syntax` here. This draft simply mentions a hyperspec without further explanation.");
  const result = run(specWith({ terms: ["hyperspec"] }), draft);
  assert.equal(result.status, "fail");
  assert.equal(result.findings[0].id, "station-terms-undefined-hyperspec");
});
