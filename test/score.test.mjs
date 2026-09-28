import { test } from "node:test";
import assert from "node:assert/strict";
import { score, exitCode } from "../src/score.mjs";

const fail = (n) => ({ test: n, id: "x", severity: "fail", message: "m", fix: "f" });
const warn = (n) => ({ ...fail(n), severity: "warn" });

test("no failures and nothing open is a pass, 9 of 9, exit 0", () => {
  const s = score([warn(2)], { decisions: [{ id: "a", state: "decided" }] });
  assert.equal(s.status, "pass"); assert.equal(s.passed, 9); assert.equal(exitCode(s.status), 0);
});

test("a failure is a fail whatever else is true, exit 1", () => {
  const s = score([fail(5), fail(5), fail(7)], { decisions: [{ id: "a", state: "open" }] });
  assert.equal(s.status, "fail"); assert.equal(s.passed, 7); assert.equal(exitCode(s.status), 1);
});

test("all nine pass with an open decision is blocked, exit 3, and names it", () => {
  const s = score([], { decisions: [{ id: "title", state: "open" }] });
  assert.equal(s.status, "blocked"); assert.deepEqual(s.open, ["title"]); assert.equal(exitCode(s.status), 3);
});
