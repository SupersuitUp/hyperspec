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

// score() gains profile: { name, complete, total } only when data.profile names a profile this
// linter knows; a missing or unknown profile leaves the key off entirely.
test("no profile: at all, score() carries no profile key", () => {
  assert.equal(score([], {}).profile, undefined);
});

test("an unknown profile, score() carries no profile key (its rules were never checked, nothing to count)", () => {
  assert.equal(score([], { profile: "screenplay" }).profile, undefined);
});

test("profile: writing with a complete writing map (fiction false), score() names it 9/9", () => {
  const data = { profile: "writing", fiction: "false", writing: {
    materials: { items: [{ id: "m1" }] },
    ...Object.fromEntries(["dna", "persona", "audience", "goal", "form", "spine", "sources"].map((b) => [b, { a: 1 }])),
  } };
  assert.deepEqual(score([], data).profile, { name: "writing", complete: 9, total: 9 });
});

test("profile: writing with one broken block, score() counts it out of 9", () => {
  // Only materials and characters have any standing: materials is present but broken (its own
  // check finding fails it), and characters is not required with fiction: false, so it is the
  // only block credited; everything else is simply absent.
  const data = { profile: "writing", fiction: "false", writing: { materials: { a: 1 } } };
  const findings = [{ test: 3, id: "writing-materials-check", severity: "fail", message: "m", fix: "f" }];
  assert.deepEqual(score(findings, data).profile, { name: "writing", complete: 1, total: 9 });
});
