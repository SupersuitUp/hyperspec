import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { tempDir } from "./tmp.mjs";
import { join } from "node:path";
import { loadSpec } from "../src/load.mjs";

const write = (text) => { const d = tempDir("hs-"); const p = join(d, "s.md"); writeFileSync(p, text); return p; };

test("a file with a hyperspec key loads with its data, body and folder", () => {
  const p = write('---\nhyperspec: "0.1"\ntitle: T\n---\n# Body\n');
  const s = loadSpec(p);
  assert.equal(s.error, undefined);
  assert.equal(s.data.title, "T");
  assert.match(s.body, /# Body/);
  assert.equal(s.dir, join(p, ".."));
});

test("frontmatter without the hyperspec key is refused, by name", () => {
  assert.equal(loadSpec(write("---\ntitle: T\n---\n")).error, "not a hyperspec");
});

test("a missing file is an error, never a throw", () => {
  assert.match(loadSpec("/nope/missing.md").error, /cannot read/);
});
