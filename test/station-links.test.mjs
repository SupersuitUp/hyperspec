import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tempDir } from "./tmp.mjs";
import { run } from "../src/stations/links.mjs";

// A real draft.md on disk (its directory is what every relative link resolves against), plus
// whatever sibling files the test wants to exist.
function draftIn(dir, text, { subpath = "draft.md" } = {}) {
  const p = join(dir, subpath);
  writeFileSync(p, text);
  return { path: p, text, lines: text.split("\n") };
}

test("a well-formed absolute https Markdown link passes", () => {
  const dir = tempDir("hs-links-");
  const draft = draftIn(dir, "See [the standard](https://example.com/spec) for details.");
  const result = run({ dir }, draft);
  assert.equal(result.station, "links");
  assert.equal(result.status, "pass");
  assert.deepEqual(result.findings, []);
});

test("a bare https URL (not inside a Markdown link) also passes", () => {
  const dir = tempDir("hs-links-");
  const draft = draftIn(dir, "See https://example.com/spec for details.");
  const result = run({ dir }, draft);
  assert.equal(result.status, "pass");
});

test("an http(s) URL with no host is malformed", () => {
  const dir = tempDir("hs-links-");
  const draft = draftIn(dir, "See [broken](https://) here.");
  const result = run({ dir }, draft);
  assert.equal(result.status, "fail");
  assert.equal(result.findings[0].id, "station-links-malformed");
  assert.match(result.findings[0].message, /not a well-formed http\/https URL/);
});

test("a non-http/https/mailto scheme fails as a bad scheme", () => {
  const dir = tempDir("hs-links-");
  const draft = draftIn(dir, "Grab it via [ftp](ftp://example.com/file.zip).");
  const result = run({ dir }, draft);
  assert.equal(result.status, "fail");
  assert.equal(result.findings[0].id, "station-links-bad-scheme");
  assert.match(result.findings[0].message, /scheme that is not http, https or mailto/);
});

test("a mailto: link with a real address passes", () => {
  const dir = tempDir("hs-links-");
  const draft = draftIn(dir, "Write to [us](mailto:hello@example.com) anytime.");
  const result = run({ dir }, draft);
  assert.equal(result.status, "pass");
});

test("a mailto: link with no address fails", () => {
  const dir = tempDir("hs-links-");
  const draft = draftIn(dir, "Write to [us](mailto:) anytime.");
  const result = run({ dir }, draft);
  assert.equal(result.status, "fail");
  assert.equal(result.findings[0].id, "station-links-malformed");
});

test("a relative link to a file that exists next to the draft passes", () => {
  const dir = tempDir("hs-links-");
  writeFileSync(join(dir, "notes.md"), "notes");
  const draft = draftIn(dir, "See [my notes](notes.md) for more.");
  const result = run({ dir }, draft);
  assert.equal(result.status, "pass");
});

test("a relative link with an anchor is checked with the anchor stripped", () => {
  const dir = tempDir("hs-links-");
  writeFileSync(join(dir, "notes.md"), "notes");
  const draft = draftIn(dir, "See [a section](notes.md#some-heading) for more.");
  const result = run({ dir }, draft);
  assert.equal(result.status, "pass");
});

test("a relative link to a file that does not exist fails, naming the link", () => {
  const dir = tempDir("hs-links-");
  const draft = draftIn(dir, "See [gone](missing.md) for more.");
  const result = run({ dir }, draft);
  assert.equal(result.status, "fail");
  assert.equal(result.findings[0].id, "station-links-broken-relative");
  assert.match(result.findings[0].message, /"missing\.md" does not resolve/);
});

test("a pure in-document anchor link (just #fragment) always resolves", () => {
  const dir = tempDir("hs-links-");
  const draft = draftIn(dir, "Jump to [the close](#close) below.");
  const result = run({ dir }, draft);
  assert.equal(result.status, "pass");
});

test("relative links resolve against the DRAFT's directory, not the spec's", () => {
  const draftDir = tempDir("hs-links-draft-");
  const specDir = tempDir("hs-links-spec-");
  writeFileSync(join(draftDir, "sibling.md"), "sibling");
  const draft = draftIn(draftDir, "See [sibling](sibling.md).");
  // The spec lives in a completely different directory that does NOT have sibling.md; the link
  // must still resolve, because it resolves against the draft's own folder.
  const result = run({ dir: specDir }, draft);
  assert.equal(result.status, "pass");
});

test("a broken relative link's message never contains an absolute path", () => {
  const dir = tempDir("hs-links-");
  const draft = draftIn(dir, "See [gone](missing.md) here.");
  const result = run({ dir }, draft);
  assert.equal(result.findings[0].message.includes(dir), false);
});

test("a Markdown link's URL is not also counted as a bare URL (no double finding)", () => {
  const dir = tempDir("hs-links-");
  const draft = draftIn(dir, "[broken](ftp://example.com/file)");
  const result = run({ dir }, draft);
  assert.equal(result.findings.length, 1);
});

test("multiple broken links each get their own finding with correct line numbers", () => {
  const dir = tempDir("hs-links-");
  const draft = draftIn(dir, "Line one.\nSee [gone](missing.md) here.\nAnd [also gone](also-missing.md) here.\n");
  const result = run({ dir }, draft);
  assert.equal(result.status, "fail");
  const lines = result.findings.map((f) => f.line).sort();
  assert.deepEqual(lines, [2, 3]);
});

test("a link with a title after the URL is still read as just the URL", () => {
  const dir = tempDir("hs-links-");
  const draft = draftIn(dir, 'See [the spec](https://example.com/spec "The Spec") for details.');
  const result = run({ dir }, draft);
  assert.equal(result.status, "pass");
});

test("CRLF draft: a broken relative link still reports the right 1-based line", () => {
  const dir = tempDir("hs-links-");
  const draft = draftIn(dir, "Line one.\r\nSee [gone](missing.md) here.\r\nLine three.\r\n");
  const result = run({ dir }, draft);
  assert.equal(result.status, "fail");
  assert.equal(result.findings[0].line, 2);
});

test("CRLF draft: a well-formed link still passes", () => {
  const dir = tempDir("hs-links-");
  const draft = draftIn(dir, "Line one.\r\nSee [the standard](https://example.com/spec) here.\r\n");
  const result = run({ dir }, draft);
  assert.equal(result.status, "pass");
});

// ---- fix round 1: reference-style links -------------------------------------------------------

test("a full reference link [text][ref] resolves against its [ref]: url definition and passes", () => {
  const dir = tempDir("hs-links-");
  const draft = draftIn(dir, "See [the spec][ref] for details.\n\n[ref]: https://example.com/spec\n");
  const result = run({ dir }, draft);
  assert.equal(result.status, "pass", JSON.stringify(result.findings));
});

test("a full reference link whose definition target is malformed fails through the same checkUrl", () => {
  const dir = tempDir("hs-links-");
  const draft = draftIn(dir, "See [the spec][ref] for details.\n\n[ref]: https://\n");
  const result = run({ dir }, draft);
  assert.equal(result.status, "fail");
  assert.equal(result.findings[0].id, "station-links-malformed");
});

test("a collapsed reference link [ref][] uses the text itself as the label", () => {
  const dir = tempDir("hs-links-");
  const draft = draftIn(dir, "See [the spec][] for details.\n\n[the spec]: https://example.com/spec\n");
  const result = run({ dir }, draft);
  assert.equal(result.status, "pass", JSON.stringify(result.findings));
});

test("a shortcut reference [ref] resolves against a definition of the same label", () => {
  const dir = tempDir("hs-links-");
  const draft = draftIn(dir, "See [the spec] for details.\n\n[the spec]: https://example.com/spec\n");
  const result = run({ dir }, draft);
  assert.equal(result.status, "pass", JSON.stringify(result.findings));
});

test("reference labels are matched case-insensitively and with whitespace collapsed", () => {
  const dir = tempDir("hs-links-");
  const draft = draftIn(dir, "See [The   Spec][REF] for details.\n\n[ref]: https://example.com/spec\n");
  const result = run({ dir }, draft);
  assert.equal(result.status, "pass", JSON.stringify(result.findings));
});

test("a reference with no matching definition fails as undefined, naming the label", () => {
  const dir = tempDir("hs-links-");
  const draft = draftIn(dir, "See [the spec][nope] for details.");
  const result = run({ dir }, draft);
  assert.equal(result.status, "fail");
  assert.equal(result.findings[0].id, "station-links-undefined-reference");
  assert.match(result.findings[0].message, /"nope" has no matching/);
});

test("a shortcut reference with no matching definition also fails as undefined", () => {
  const dir = tempDir("hs-links-");
  const draft = draftIn(dir, "See [some random note] here, never defined.");
  const result = run({ dir }, draft);
  assert.equal(result.status, "fail");
  assert.equal(result.findings[0].id, "station-links-undefined-reference");
});

test("a definition line's own URL is not also counted as a bare URL", () => {
  const dir = tempDir("hs-links-");
  const draft = draftIn(dir, "See [the spec][ref] for details.\n\n[ref]: https://example.com/spec\n");
  const result = run({ dir }, draft);
  assert.equal(result.findings.length, 0);
});

test("a full reference's leftover [text] half is not also matched as a shortcut reference", () => {
  const dir = tempDir("hs-links-");
  const draft = draftIn(dir, "See [the spec][ref] for details.\n\n[ref]: https://example.com/spec\n[the spec]: https://elsewhere.example.com\n");
  const result = run({ dir }, draft);
  // Only the one full-reference use should be checked; "[the spec]" appearing again is a second
  // definition line, not a second bracket to interpret as a shortcut reference.
  assert.equal(result.status, "pass", JSON.stringify(result.findings));
  assert.equal(result.findings.length, 0);
});

test("CRLF draft: a full reference link and its definition still resolve correctly", () => {
  const dir = tempDir("hs-links-");
  const draft = draftIn(dir, "See [the spec][ref] here.\r\n\r\n[ref]: https://example.com/spec\r\n");
  const result = run({ dir }, draft);
  assert.equal(result.status, "pass", JSON.stringify(result.findings));
});

// ---- fix round 1: code masking (fenced blocks and inline spans) -------------------------------

test("a Markdown link inside a fenced code block is illustrative syntax, never checked", () => {
  const dir = tempDir("hs-links-");
  const draft = draftIn(dir, "Some prose.\n\n```\nSee [broken](missing-example.md) for the shape.\n```\n\nMore prose.\n");
  const result = run({ dir }, draft);
  assert.equal(result.status, "pass", JSON.stringify(result.findings));
});

test("a malformed http URL inside a fenced code block is never checked", () => {
  const dir = tempDir("hs-links-");
  const draft = draftIn(dir, "```\nSee [broken](https://) here.\n```\n");
  const result = run({ dir }, draft);
  assert.equal(result.status, "pass");
});

test("a link inside an inline code span is never checked", () => {
  const dir = tempDir("hs-links-");
  const draft = draftIn(dir, "Write it as `[text](missing.md)` in your draft.");
  const result = run({ dir }, draft);
  assert.equal(result.status, "pass");
});

test("a real link OUTSIDE a code span, on the same draft, is still checked", () => {
  const dir = tempDir("hs-links-");
  const draft = draftIn(dir, "Write it as `[text](example.md)`, like [this real one](missing.md).");
  const result = run({ dir }, draft);
  assert.equal(result.status, "fail");
  assert.equal(result.findings.length, 1);
  assert.match(result.findings[0].message, /"missing\.md"/);
});

test("code masking preserves line numbers for content after a multi-line fenced block", () => {
  const dir = tempDir("hs-links-");
  const draft = draftIn(dir, "Line one.\n```\nSee [broken](missing-example.md) for the shape.\nAnother code line.\n```\nSee [gone](missing.md) on line six.\n");
  const result = run({ dir }, draft);
  assert.equal(result.status, "fail");
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].line, 6);
});

// ---- fix round 1: root-relative links warn (R3) ------------------------------------------------

test("a link rooted at / warns rather than passing or failing", () => {
  const dir = tempDir("hs-links-");
  const draft = draftIn(dir, "See [the image](/images/diagram.png) above.");
  const result = run({ dir }, draft);
  assert.equal(result.status, "pass"); // a warning alone never fails the station
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].id, "station-links-root-relative");
  assert.equal(result.findings[0].severity, "warn");
  assert.match(result.findings[0].message, /site-root-relative/);
});

test("a root-relative link never resolves against the filesystem root by accident", () => {
  const dir = tempDir("hs-links-");
  // If this were ever resolved via plain path.resolve semantics against the draft's directory, a
  // leading "/" would override the base entirely and check the real filesystem root; make sure
  // that never happens by asserting the finding is the warning, not a pass from an accidental
  // filesystem hit and not a broken-relative fail either.
  const draft = draftIn(dir, "See [it](/definitely-not-a-real-path-xyz123).");
  const result = run({ dir }, draft);
  assert.equal(result.findings[0].id, "station-links-root-relative");
});
