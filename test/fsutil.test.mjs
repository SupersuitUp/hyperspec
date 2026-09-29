import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tempDir } from "./tmp.mjs";
import { join } from "node:path";
import { insideDir, writeFileAtomic } from "../src/fsutil.mjs";

function tmp() {
  return tempDir("hs-fsutil-");
}

// ---- insideDir ----

test("insideDir: a plain relative child path is inside", () => {
  const dir = tmp();
  assert.equal(insideDir(dir, "essay.md"), true);
  assert.equal(insideDir(dir, join("materials", "call.md")), true);
});

test("insideDir: a `../` climb out of dir is refused", () => {
  const dir = tmp();
  assert.equal(insideDir(dir, "../outside.md"), false);
  assert.equal(insideDir(dir, join("..", "..", "outside.md")), false);
  // Even one that climbs out and back in some other way still isn't dir's own descendant.
  assert.equal(insideDir(dir, join("..", "sibling", "essay.md")), false);
});

test("insideDir: an absolute path pointing elsewhere is refused", () => {
  const dir = tmp();
  const elsewhere = tempDir("hs-fsutil-elsewhere-");
  assert.equal(insideDir(dir, join(elsewhere, "essay.md")), false);
});

test("insideDir: an absolute path that happens to already be inside dir is accepted", () => {
  const dir = tmp();
  assert.equal(insideDir(dir, join(dir, "essay.md")), true);
});

// ---- writeFileAtomic ----

test("writeFileAtomic: writes the file and leaves no .tmp-* file behind", () => {
  const dir = tmp();
  const path = join(dir, "essay.md");
  writeFileAtomic(path, "the final text");
  assert.equal(readFileSync(path, "utf8"), "the final text");
  const leftovers = readdirSync(dir).filter((f) => f.includes(".tmp-"));
  assert.deepEqual(leftovers, []);
});

test("writeFileAtomic: overwrites a pre-existing file at the same path (not content-addressed)", () => {
  const dir = tmp();
  const path = join(dir, "essay.md");
  writeFileSync(path, "old content");
  writeFileAtomic(path, "new content");
  assert.equal(readFileSync(path, "utf8"), "new content");
});

test("writeFileAtomic: a write failure throws and leaves no .tmp-* file behind", () => {
  const dir = tmp();
  // Target a path inside a directory that does not exist, so the temp-file write itself fails.
  const path = join(dir, "does-not-exist", "essay.md");
  assert.throws(() => writeFileAtomic(path, "text"));
  const leftovers = existsSync(dir) ? readdirSync(dir).filter((f) => f.includes(".tmp-")) : [];
  assert.deepEqual(leftovers, []);
});

test("writeFileAtomic: accepts a Buffer", () => {
  const dir = tmp();
  const path = join(dir, "essay.md");
  writeFileAtomic(path, Buffer.from("buffer bytes"));
  assert.equal(readFileSync(path, "utf8"), "buffer bytes");
});
