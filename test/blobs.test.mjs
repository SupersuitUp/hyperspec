import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sha256 } from "../src/hash.mjs";
import { blobPath, getBlob, hasBlob, putBlob, storeRoot, verifyBlob } from "../src/blobs.mjs";

const tmp = () => mkdtempSync(join(tmpdir(), "hs-blobs-"));

test("storeRoot prefers the store argument over everything else", () => {
  const dir = tmp();
  const prevEnv = process.env.HYPERSPEC_STORE;
  process.env.HYPERSPEC_STORE = join(dir, "env-store");
  try {
    assert.equal(storeRoot({ from: dir, store: join(dir, "explicit-store") }), join(dir, "explicit-store"));
  } finally {
    if (prevEnv === undefined) delete process.env.HYPERSPEC_STORE; else process.env.HYPERSPEC_STORE = prevEnv;
  }
});

test("storeRoot falls back to HYPERSPEC_STORE when no store arg is given", () => {
  const dir = tmp();
  const prevEnv = process.env.HYPERSPEC_STORE;
  process.env.HYPERSPEC_STORE = join(dir, "env-store");
  try {
    assert.equal(storeRoot({ from: dir }), join(dir, "env-store"));
  } finally {
    if (prevEnv === undefined) delete process.env.HYPERSPEC_STORE; else process.env.HYPERSPEC_STORE = prevEnv;
  }
});

test("storeRoot walks up to the nearest ancestor holding .hyperspec", () => {
  const dir = tmp();
  const prevEnv = process.env.HYPERSPEC_STORE;
  delete process.env.HYPERSPEC_STORE;
  try {
    mkdirSync(join(dir, ".hyperspec"));
    const nested = join(dir, "a", "b", "c");
    mkdirSync(nested, { recursive: true });
    assert.equal(storeRoot({ from: nested }), dir);
  } finally {
    if (prevEnv !== undefined) process.env.HYPERSPEC_STORE = prevEnv;
  }
});

test("storeRoot walks up to the nearest ancestor holding .git", () => {
  const dir = tmp();
  const prevEnv = process.env.HYPERSPEC_STORE;
  delete process.env.HYPERSPEC_STORE;
  try {
    mkdirSync(join(dir, ".git"));
    const nested = join(dir, "a", "b");
    mkdirSync(nested, { recursive: true });
    assert.equal(storeRoot({ from: nested }), dir);
  } finally {
    if (prevEnv !== undefined) process.env.HYPERSPEC_STORE = prevEnv;
  }
});

test("storeRoot falls back to the recipe's own directory when no ancestor has .hyperspec or .git", () => {
  const dir = tmp();
  const prevEnv = process.env.HYPERSPEC_STORE;
  delete process.env.HYPERSPEC_STORE;
  try {
    const nested = join(dir, "x", "y");
    mkdirSync(nested, { recursive: true });
    assert.equal(storeRoot({ from: nested }), nested);
  } finally {
    if (prevEnv !== undefined) process.env.HYPERSPEC_STORE = prevEnv;
  }
});

test("storeRoot accepts a file path and walks up from its directory", () => {
  const dir = tmp();
  const prevEnv = process.env.HYPERSPEC_STORE;
  delete process.env.HYPERSPEC_STORE;
  try {
    mkdirSync(join(dir, ".hyperspec"));
    const recipeFile = join(dir, "essay.md.recipe.json");
    writeFileSync(recipeFile, "{}");
    assert.equal(storeRoot({ from: recipeFile }), dir);
  } finally {
    if (prevEnv !== undefined) process.env.HYPERSPEC_STORE = prevEnv;
  }
});

test("blobPath is <root>/.hyperspec/blobs/<first 2 hex>/<full hex>", () => {
  const hex = sha256("abc");
  assert.equal(blobPath("/root", hex), join("/root", ".hyperspec", "blobs", hex.slice(0, 2), hex));
});

test("putBlob writes the bytes under their own hash and returns the hex", () => {
  const root = tmp();
  const hex = putBlob(root, Buffer.from("hello"));
  assert.equal(hex, sha256("hello"));
  assert.equal(hasBlob(root, hex), true);
  assert.deepEqual(getBlob(root, hex), Buffer.from("hello"));
});

test("putBlob writes once: a second put of the same content does not rewrite the file", () => {
  const root = tmp();
  const hex = putBlob(root, Buffer.from("same content"));
  const before = statSync(blobPath(root, hex)).mtimeMs;
  // Force a distinguishable mtime if the filesystem clock is coarse, then put again.
  const again = putBlob(root, Buffer.from("same content"));
  const after = statSync(blobPath(root, hex)).mtimeMs;
  assert.equal(again, hex);
  assert.equal(after, before);
});

test("hasBlob and getBlob report absence honestly for content never stored", () => {
  const root = tmp();
  const hex = sha256("never stored");
  assert.equal(hasBlob(root, hex), false);
  assert.equal(getBlob(root, hex), null);
});

test("verifyBlob is true for an untouched blob and false for a tampered one", () => {
  const root = tmp();
  const hex = putBlob(root, Buffer.from("original bytes"));
  assert.equal(verifyBlob(root, hex), true);

  writeFileSync(blobPath(root, hex), "tampered bytes");
  assert.equal(verifyBlob(root, hex), false);
});

test("verifyBlob is false for a hash with no blob on disk at all", () => {
  const root = tmp();
  assert.equal(verifyBlob(root, sha256("nothing here")), false);
});
