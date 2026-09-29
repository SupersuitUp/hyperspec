import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
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

// A hash read from a recipe is a claim, and it becomes part of a filesystem path here. Anything
// but exactly 64 lowercase hex characters is refused before it touches the disk, so a crafted
// recipe cannot point a read at `../../somewhere`, a device, or a pipe that never closes.
const SHA256_HEX = /^[0-9a-f]{64}$/;
export function isSha256(hex) {
  return typeof hex === "string" && SHA256_HEX.test(hex);
}

export function blobPath(root, hex) {
  if (!isSha256(hex)) {
    const shown = typeof hex === "string" ? JSON.stringify(hex.length > 80 ? `${hex.slice(0, 80)}...` : hex) : String(hex);
    throw new Error(`not a SHA-256 hash (64 lowercase hex characters): ${shown}`);
  }
  return join(root, ".hyperspec", "blobs", hex.slice(0, 2), hex);
}

// Writes only if the blob is absent; an existing blob is left untouched (never rewritten).
// Atomic: bytes land in a temp file in the same directory first, then a single renameSync
// (atomic on one filesystem) puts them at the final path. A process killed mid-write leaves
// only the orphaned temp file, never a partially-written file sitting at the content-addressed
// path — the failure mode a plain writeFileSync(path, bytes) would otherwise leave behind, and
// which nothing short of an explicit verifyBlob would ever catch afterward.
export function putBlob(root, bytes) {
  const hex = sha256(bytes);
  const path = blobPath(root, hex);
  if (existsSync(path)) return hex;
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}-${randomBytes(6).toString("hex")}`;
  try {
    writeFileSync(tmp, bytes);
    if (existsSync(path)) { unlinkSync(tmp); return hex; } // another writer won the race; keep theirs
    renameSync(tmp, path);
  } catch (e) {
    try { unlinkSync(tmp); } catch { /* nothing to clean up */ }
    throw e;
  }
  return hex;
}

// A malformed hash names no blob, so hasBlob, getBlob and verifyBlob treat it as missing.
export function hasBlob(root, hex) {
  return isSha256(hex) && existsSync(blobPath(root, hex));
}

export function getBlob(root, hex) {
  if (!isSha256(hex)) return null;
  try { return readFileSync(blobPath(root, hex)); } catch { return null; }
}

// True when the blob exists and its bytes re-hash to hex (catches tampering).
export function verifyBlob(root, hex) {
  const bytes = getBlob(root, hex);
  return bytes !== null && sha256(bytes) === hex;
}
