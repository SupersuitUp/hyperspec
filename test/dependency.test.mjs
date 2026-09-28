// test/dependency.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSkillFile } from "@supersuit/superskill/yaml";

// hyperspec reads YAML only through superskill's reader. This pins the one capability it
// needs that the reader did not have before 0.2.0: a list of maps.
test("the shared reader returns a list of maps", () => {
  const { data, error } = parseSkillFile("---\ndecisions:\n  - id: a\n    state: open\n---\nbody\n");
  assert.equal(error, undefined);
  assert.deepEqual(data.decisions, [{ id: "a", state: "open" }]);
});
