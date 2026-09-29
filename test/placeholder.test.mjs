import { test } from "node:test";
import assert from "node:assert/strict";
import { PLACEHOLDER, str } from "../src/placeholder.mjs";

// R6 (fix round 1, Task 4): a placeholder word never counts as present, wherever str() is used —
// src/rules.mjs (core), src/writing.mjs and src/writing-fields.mjs (the writing profile) all
// import this same function rather than keeping their own copy.

test("str() blanks null, ~, and the placeholder words, case-insensitively, whatever surrounding whitespace", () => {
  for (const v of ["null", "NULL", "Null", "~", "todo", "TODO", "ToDo", "  todo  ", "tbd", "TBD", "fixme", "FIXME", "xxx", "XXX", "placeholder", "PLACEHOLDER", "<placeholder>", "<PLACEHOLDER>"]) {
    assert.equal(str(v), "", JSON.stringify(v));
  }
});

test("str() only blanks the WHOLE trimmed value: a placeholder word as part of real text still counts as present", () => {
  for (const v of ["TODO: write the opening", "not yet, TBD next week", "a placeholder image, not the real one", "todoist", "xxxl", "Fixmeister"]) {
    assert.equal(str(v), v.trim(), JSON.stringify(v));
  }
});

test("str() still returns real, non-placeholder text unchanged (trimmed)", () => {
  assert.equal(str("  gary-sheng  "), "gary-sheng");
  assert.equal(str("essay"), "essay");
  assert.equal(str(""), "");
  assert.equal(str(undefined), "");
  assert.equal(str(42), "");
});

test("PLACEHOLDER is anchored (whole-string) and case-insensitive", () => {
  assert.ok(PLACEHOLDER.test("todo"));
  assert.ok(PLACEHOLDER.test("TODO"));
  assert.ok(!PLACEHOLDER.test("TODO: write the opening"));
  assert.ok(!PLACEHOLDER.test("not todo"));
});
