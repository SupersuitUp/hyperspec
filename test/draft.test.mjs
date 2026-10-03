import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tempDir } from "./tmp.mjs";
import { readDraft } from "../src/draft.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const run = (...a) => spawnSync(process.execPath, [join(ROOT, "bin", "hyperspec.mjs"), ...a], { encoding: "utf8" });

// What a reader never sees is not prose: a draft that is a markdown document with frontmatter
// (any document a person keeps) and a note to self in an HTML comment must grade the same as
// the prose alone. Blanked line for line, so every line number stays the file's own.
test("readDraft blanks a leading frontmatter block and every HTML comment, keeping line numbers", () => {
  const dir = tempDir("hs-draft-");
  const file = join(dir, "d.md");
  const raw = "---\ntitle: A piece\nstatus: draft\n---\n<!-- what I said I was trying to write:\nsomething long\n-->\n\n# Claim\n\nReal words here. <!-- inline aside --> More words.\n";
  writeFileSync(file, raw);
  const d = readDraft(file);
  assert.equal(d.lines.length, raw.split("\n").length, "same line count as the file");
  assert.equal(d.lines[8], "# Claim", "the heading keeps its line number");
  assert.doesNotMatch(d.text, /title: A piece/);
  assert.doesNotMatch(d.text, /trying to write|something long|inline aside/);
  assert.match(d.text, /Real words here\.\s+More words\./);
  assert.equal(d.sha256, readDraft(file).sha256);
});

test("a horizontal rule mid-document is not frontmatter", () => {
  const dir = tempDir("hs-draft-");
  const file = join(dir, "d.md");
  writeFileSync(file, "# Title\n\nOne.\n\n---\n\nTwo.\n\n---\n");
  assert.match(readDraft(file).text, /One\.[\s\S]*---[\s\S]*Two\./);
});

test("check counts no frontmatter or comment words toward length", () => {
  const dir = tempDir("hs-draft-check-");
  cpSync(join(ROOT, "test", "fixtures", "writing-valid"), dir, { recursive: true });
  writeFileSync(join(dir, "essay.claims.jsonl"), "");
  const filler = (n, p) => Array.from({ length: n }, (_, i) => `${p}${i}`).join(" ");
  // 3 headings + 3*199 = 600 words: exactly the minimum. Frontmatter and a comment of 400 words
  // would push a naive count to 1000+, over nothing, but the max is 1200, so make the prose
  // short instead: 3 + 3*150 = 453 words, which fails under 600 unless the hidden text counts.
  const body = `# Claim\n\n${filler(150, "c")}\n\n# Evidence\n\n${filler(150, "e")}\n\n# Close\n\n${filler(150, "l")}\n`;
  writeFileSync(join(dir, "draft.md"), `---\ntitle: x\n---\n<!-- ${filler(400, "h")} -->\n${body}`);
  const r = run("check", join(dir, "spec.md"), "--draft", join(dir, "draft.md"), "--only", "form", "--json");
  const out = JSON.parse(r.stdout);
  const form = out.stations.find((s) => s.station === "form");
  assert.equal(form.status, "fail", "453 words of prose is under the 600 minimum; hidden text must not rescue it");
});
