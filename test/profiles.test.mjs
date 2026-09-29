import { test } from "node:test";
import assert from "node:assert/strict";
import { PROFILES, lintProfile, profileStatus } from "../src/profiles.mjs";

test("PROFILES currently knows exactly one profile, writing, with a lint and a status function", () => {
  assert.deepEqual(Object.keys(PROFILES), ["writing"]);
  assert.equal(typeof PROFILES.writing.lint, "function");
  assert.equal(typeof PROFILES.writing.status, "function");
});

test("lintProfile returns nothing for a spec with no profile: at all", () => {
  assert.deepEqual(lintProfile({ data: {} }), []);
  assert.deepEqual(lintProfile({ data: { title: "x" } }), []);
});

test("lintProfile warns (test 7) once, and only once, for a profile name it does not know", () => {
  const out = lintProfile({ data: { profile: "screenplay" } });
  assert.deepEqual(out.map((x) => [x.test, x.id, x.severity]), [[7, "unknown-profile", "warn"]]);
  assert.match(out[0].message, /"screenplay"/);
  assert.match(out[0].fix, /writing/);
});

test("lintProfile('writing') delegates to writing.mjs, and every finding it returns is tagged writing-", () => {
  const out = lintProfile({ data: { profile: "writing", fiction: "false" } });
  assert.ok(out.length > 0);
  assert.ok(out.every((x) => x.id.startsWith("writing-")));
});

test("profileStatus is undefined with no profile:, and undefined for an unknown profile", () => {
  assert.equal(profileStatus({}, []), undefined);
  assert.equal(profileStatus({ profile: "screenplay" }, []), undefined);
});

test("profileStatus('writing') names the profile and counts blocks off the findings given", () => {
  const data = { profile: "writing", fiction: "false" };
  const findings = PROFILES.writing.lint({ data });
  // All 8 required blocks are missing; characters is not required with fiction: false, so it
  // counts complete on its own, giving 1 of 9.
  assert.deepEqual(profileStatus(data, findings), { name: "writing", complete: 1, total: 9 });
});
