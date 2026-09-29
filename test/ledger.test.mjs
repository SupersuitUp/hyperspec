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
  assert.deepEqual(ledgerVerdict({ ...args, unchangedImprovedReason: "the verdict changed; draft and spec unchanged" }), { verdict: "not-improved", detail: { reason: "the verdict changed; draft and spec unchanged" } });
  assert.deepEqual(ledgerVerdict({ ...args, draftSha: "d2", unchangedImprovedReason: "x" }), { verdict: "improved", detail: { change: "stations now pass: doctor" } });
});
