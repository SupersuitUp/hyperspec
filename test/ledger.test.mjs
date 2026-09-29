// src/ledger.mjs directly: the ledger target a spec declares, and the one verdict option only judge
// uses. The verdict rules themselves are exercised through check and judge in their own tests.

import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { openLedger, ledgerVerdict } from "../src/ledger.mjs";

const specWith = (ledger) => ({ dir: join("/tmp", "hs-ledger-spec"), data: ledger === undefined ? {} : { improvement: { ledger } } });

test("openLedger refuses a ledger path that escapes the spec's folder", () => {
  assert.deepEqual(openLedger(specWith("../outside.jsonl")), { warning: "improvement.ledger escapes the spec's directory; not appended" });
  assert.ok(openLedger(specWith("/etc/elsewhere.jsonl")).warning);
});

test("openLedger returns null with no ledger declared, and the declared path otherwise", () => {
  assert.equal(openLedger(specWith(undefined)), null);
  assert.equal(openLedger(specWith("  ")), null);
  const l = openLedger(specWith("runs.jsonl"));
  assert.equal(l.decl, "runs.jsonl");
  assert.equal(l.abs, join("/tmp", "hs-ledger-spec", "runs.jsonl"));
  assert.equal(l.priorText, "", "not written yet");
});

test("ledgerVerdict: a fail-to-pass flip with nothing changed is improved unless the caller requires a change", () => {
  const last = { stations: { doctor: "fail" }, draft_sha256: "d", spec_sha256: "s" };
  const args = { last, statusNow: { doctor: "pass" }, draftSha: "d", specSha: "s" };
  assert.deepEqual(ledgerVerdict(args), { verdict: "improved", detail: { change: "stations now pass: doctor" } });
  assert.deepEqual(ledgerVerdict({ ...args, unchangedImprovedReason: "the verdict changed; nothing the judge was shown changed" }), { verdict: "not-improved", detail: { reason: "the verdict changed; nothing the judge was shown changed" } });
  // A caller that requires a change names it in the improved line.
  assert.deepEqual(ledgerVerdict({ ...args, draftSha: "d2", unchangedImprovedReason: "x" }), { verdict: "improved", detail: { change: "draft changed; stations now pass: doctor" } });
});

test("ledgerVerdict: a caller's own account of what changed replaces the two hashes", () => {
  const last = { stations: { lineup: "fail" }, draft_sha256: "d", spec_sha256: "s" };
  const args = { last, statusNow: { lineup: "pass" }, draftSha: "d", specSha: "s", unchangedImprovedReason: "x", noun: "judgment" };
  assert.deepEqual(ledgerVerdict({ ...args, what: "the DNA scope (dna: scope.md and goldens)" }), { verdict: "improved", detail: { change: "the DNA scope (dna: scope.md and goldens) changed; stations now pass: lineup" } });
  assert.deepEqual(ledgerVerdict({ ...args, what: null }), { verdict: "not-improved", detail: { reason: "x" } });
  const passed = { ...last, stations: { lineup: "pass" } };
  assert.deepEqual(ledgerVerdict({ ...args, last: passed, what: "the claims ledger (claims.jsonl)" }), { verdict: "not-improved", detail: { reason: "the claims ledger (claims.jsonl) changed; every station still passes" } });
});

test("ledgerVerdict: the noun names what a line records, and check's wording is the default", () => {
  const last = { stations: { doctor: "pass" }, draft_sha256: "d", spec_sha256: "s" };
  const pass = { last, statusNow: { doctor: "pass" }, draftSha: "d", specSha: "s" };
  const fail = { last: { ...last, stations: { doctor: "fail" } }, statusNow: { doctor: "fail" }, draftSha: "d", specSha: "s" };
  assert.equal(ledgerVerdict(pass).detail.reason, "no change since the last passing check");
  assert.equal(ledgerVerdict(fail).detail.reason, "no change since the last check; still failing: doctor");
  assert.equal(ledgerVerdict({ ...pass, noun: "judgment" }).detail.reason, "no change since the last passing judgment");
  assert.equal(ledgerVerdict({ ...fail, noun: "judgment" }).detail.reason, "no change since the last judgment; still failing: doctor");
});
