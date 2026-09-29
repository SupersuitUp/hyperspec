import { after } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Every temp directory a test file makes goes through here, and all of them are removed once that
// file's tests finish, so running the suite leaves nothing behind in the system temp folder.
const made = [];
after(() => {
  for (const dir of made.splice(0)) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* already gone */ }
  }
});

export function tempDir(prefix = "hs-") {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  made.push(dir);
  return dir;
}
