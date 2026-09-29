// The sentence units `hyperspec learn` diffs: src/sentences.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { sentenceUnits, normalizeSentence } from "../src/sentences.mjs";

const texts = (t) => sentenceUnits(t).map((u) => u.text);

test("splits on . ! ? followed by whitespace", () => {
  assert.deepEqual(texts("One. Two! Three? Four"), ["One.", "Two!", "Three?", "Four"]);
});

test("a blank line ends a unit even without punctuation", () => {
  assert.deepEqual(texts("no stop here\n\nnext line."), ["no stop here", "next line."]);
});

test("a markdown heading is its own unit, even with text on the next line", () => {
  assert.deepEqual(texts("# Claim\n\nA hyperspec is a contract."), ["# Claim", "A hyperspec is a contract."]);
  assert.deepEqual(texts("## Title\nBody one. Body two."), ["## Title", "Body one.", "Body two."]);
});

test("each list item is its own unit, marker included", () => {
  assert.deepEqual(texts("- first item\n- second item\n1. third"), ["- first item", "- second item", "1. third"]);
});

test("common abbreviations do not end a sentence", () => {
  assert.deepEqual(texts("Ask Dr. Wu and Mr. Ruiz. Then stop."), ["Ask Dr. Wu and Mr. Ruiz.", "Then stop."]);
  assert.deepEqual(texts("Use a noun (e.g. a tool) here, i.e. not a verb. Done."), ["Use a noun (e.g. a tool) here, i.e. not a verb.", "Done."]);
});

test("punctuation inside a quotation is not a boundary", () => {
  assert.deepEqual(texts("\"Wait. Stop.\" she said. Then left."), ["\"Wait. Stop.\" she said.", "Then left."]);
});

test("a unit carries its text as written and its offsets into the source", () => {
  const src = "# H\n\nOne sentence\nwrapped here.  Two.\n";
  const units = sentenceUnits(src);
  assert.deepEqual(units.map((u) => u.text), ["# H", "One sentence\nwrapped here.", "Two."]);
  for (const u of units) assert.equal(src.slice(u.start, u.end), u.text);
});

test("CRLF text splits the same way", () => {
  assert.deepEqual(texts("# H\r\n\r\nOne. Two.\r\n"), ["# H", "One.", "Two."]);
});

test("normalizeSentence collapses whitespace for comparison only", () => {
  assert.equal(normalizeSentence("One sentence\n  wrapped here. "), "One sentence wrapped here.");
});

test("empty and whitespace-only text has no units", () => {
  assert.deepEqual(sentenceUnits(""), []);
  assert.deepEqual(sentenceUnits(" \n\n \t\n"), []);
});
