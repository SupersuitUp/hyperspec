import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { sha256 } from "./hash.mjs";

// Resolve the store root: the --store flag, then HYPERSPEC_STORE, then the
// nearest ancestor of `from` holding .hyperspec/ or .git, else from's own
// directory. `from` is normally the recipe's directory, but a file path
// works too (we walk up from its dirname).
export function storeRoot({ from, store } = {}) {
  if (store) return resolve(store);
  if (process.env.HYPERSPEC_STORE) return resolve(process.env.HYPERSPEC_STORE);
  let dir = resolve(from);
  try { if (statSync(dir).isFile()) dir = dirname(dir); } catch { /* from may not exist yet; treat it as a directory */ }
  let cur = dir;
  while (true) {
    if (existsSync(join(cur, ".hyperspec")) || existsSync(join(cur, ".git"))) return cur;
    const parent = dirname(cur);
    if (parent === cur) return dir; // hit the filesystem root: fall back to the starting directory
    cur = parent;
  }
}

export function blobPath(root, hex) {
  return join(root, ".hyperspec", "blobs", hex.slice(0, 2), hex);
}

// Writes only if the blob is absent; an existing blob is left untouched (never rewritten).
export function putBlob(root, bytes) {
  const hex = sha256(bytes);
  const path = blobPath(root, hex);
  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
  }
  return hex;
}

export function hasBlob(root, hex) {
  return existsSync(blobPath(root, hex));
}

export function getBlob(root, hex) {
  try { return readFileSync(blobPath(root, hex)); } catch { return null; }
}

// True when the blob exists and its bytes re-hash to hex (catches tampering).
export function verifyBlob(root, hex) {
  const bytes = getBlob(root, hex);
  return bytes !== null && sha256(bytes) === hex;
}
