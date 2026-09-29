import { test } from "node:test";
import assert from "node:assert/strict";
import { lineAt, maskCode, maskRanges, truncate } from "../src/stations/util.mjs";

test("lineAt: position 0 is always line 1", () => {
  assert.equal(lineAt("anything", 0), 1);
});

test("lineAt: counts newlines before the offset", () => {
  const text = "one\ntwo\nthree\nfour";
  assert.equal(lineAt(text, 0), 1);
  assert.equal(lineAt(text, 4), 2); // start of "two"
  assert.equal(lineAt(text, 8), 3); // start of "three"
  assert.equal(lineAt(text, text.length), 4);
});

test("lineAt: works the same across a CRLF line ending (the \\r never shifts the count)", () => {
  const text = "one\r\ntwo\r\nthree";
  assert.equal(lineAt(text, 0), 1);
  assert.equal(lineAt(text, 5), 2); // start of "two"
  assert.equal(lineAt(text, 10), 3); // start of "three"
});

test("truncate: trims before measuring length", () => {
  assert.equal(truncate("   short   ", 80), "short");
});

test("truncate: leaves a short string untouched (after trim)", () => {
  assert.equal(truncate("hello", 10), "hello");
});

test("truncate: cuts a long string to max chars with a trailing ellipsis", () => {
  const s = "x".repeat(100);
  const t = truncate(s, 10);
  assert.equal(t.length, 10);
  assert.equal(t.endsWith("…"), true);
  assert.equal(t.slice(0, 9), "x".repeat(9));
});

test("maskRanges: blanks the given span with spaces, same length", () => {
  const out = maskRanges("hello world", [{ start: 0, end: 5 }]);
  assert.equal(out, "      world");
  assert.equal(out.length, "hello world".length);
});

test("maskRanges: multiple ranges are all blanked, offsets outside them untouched", () => {
  const out = maskRanges("aaa bbb ccc", [{ start: 0, end: 3 }, { start: 8, end: 11 }]);
  assert.equal(out, "    bbb    ");
});

test("maskRanges: a newline inside a masked range is preserved, not blanked", () => {
  const text = "before\nmask me\nafter";
  const start = text.indexOf("mask me");
  const end = start + "mask me".length;
  const out = maskRanges(text, [{ start, end }]);
  assert.equal(out, "before\n       \nafter");
  // Line count is unchanged: the "\n" on either side of the masked span still splits it into
  // three lines, so any offset AFTER the masked range still reports the same line number it
  // would against the original text.
  assert.equal(out.split("\n").length, text.split("\n").length);
});

test("maskCode: a fenced code block is blanked out entirely, newlines preserved", () => {
  const text = "before\n```\ncode line one\ncode line two\n```\nafter";
  const out = maskCode(text);
  assert.equal(out.includes("code line"), false);
  assert.equal(out.includes("before"), true);
  assert.equal(out.includes("after"), true);
  assert.equal(out.split("\n").length, text.split("\n").length);
});

test("maskCode: an inline code span is blanked out, surrounding prose untouched", () => {
  const text = "Write it as `example here` in your draft.";
  const out = maskCode(text);
  assert.equal(out.includes("example here"), false);
  assert.equal(out.startsWith("Write it as "), true);
  assert.equal(out.endsWith(" in your draft."), true);
  assert.equal(out.length, text.length);
});

test("maskCode: prose outside any fence or span is untouched", () => {
  const text = "Just plain prose with no code at all.";
  assert.equal(maskCode(text), text);
});

test("maskCode: a fence and an inline span in the same draft are both masked", () => {
  const text = "See `inline` and:\n```\nfenced\n```\ndone.";
  const out = maskCode(text);
  assert.equal(out.includes("inline"), false);
  assert.equal(out.includes("fenced"), false);
  assert.equal(out.includes("See"), true);
  assert.equal(out.includes("done."), true);
});

test("maskCode: a tilde fence is masked the same way as a backtick fence", () => {
  const text = "before\n~~~\ntilde code\n~~~\nafter";
  const out = maskCode(text);
  assert.equal(out.includes("tilde code"), false);
  assert.equal(out.includes("before"), true);
  assert.equal(out.includes("after"), true);
});

test("maskCode: two separate fenced blocks are each masked, prose between them survives", () => {
  const text = "```\nfirst\n```\nmiddle prose\n```\nsecond\n```\n";
  const out = maskCode(text);
  assert.equal(out.includes("first"), false);
  assert.equal(out.includes("second"), false);
  assert.equal(out.includes("middle prose"), true);
});
