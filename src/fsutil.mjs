import { renameSync, unlinkSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { relative, resolve, sep } from "node:path";

// True when `target`, resolved against `dir`, stays inside `dir`. It refuses a `..`-escape and an
// absolute path pointing elsewhere. Both a relative `target` (including one that climbs out via
// `../`) and an already-absolute `target` are handled the same way, since `path.resolve(dir,
// target)` already treats an absolute second argument as overriding the first: either way, the
// resolved path is compared against `dir` by `path.relative`, and anything that needs a leading
// `..` segment to get there is outside.
export function insideDir(dir, target) {
  const dirAbs = resolve(dir);
  const targetAbs = resolve(dir, target);
  const rel = relative(dirAbs, targetAbs);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`));
}

// Writes `bytes` to `path` atomically: a temp file in the same directory, then a single
// renameSync (atomic on one filesystem) onto the final path. Same pattern as blobs.mjs's
// putBlob, minus putBlob's content-addressed dedup (this always writes/overwrites the given
// path; it isn't keyed by the bytes' own hash, so there's nothing to skip). Any failure along
// the way removes the temp file before rethrowing, so a crash mid-write never leaves the target
// path holding a partial write, and never leaves an orphaned temp file behind either.
export function writeFileAtomic(path, bytes) {
  const tmp = `${path}.tmp-${process.pid}-${randomBytes(6).toString("hex")}`;
  try {
    writeFileSync(tmp, bytes);
    renameSync(tmp, path);
  } catch (e) {
    try { unlinkSync(tmp); } catch { /* nothing to clean up */ }
    throw e;
  }
}
