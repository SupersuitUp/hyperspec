import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFileSync, cpSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { tempDir } from "./tmp.mjs";

// `hyperspec ready` (0.10): has THIS draft, under THIS spec, been through the engine? Read from
// the runs ledger alone, never by rerunning anything, so a caller (a drafting loop, a per-audience
// renderer) can gate a handoff on it. The rules it holds:
//   - the latest full check of these exact draft and spec bytes passed;
//   - every required judge passed on these same bytes (every panel reader recorded);
//   - that check came AFTER the last of those judge lines, so panel findings were triaged and
//     held by check rather than recorded and ignored.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const run = (...a) => spawnSync(process.execPath, [join(ROOT, "bin", "hyperspec.mjs"), ...a], { encoding: "utf8" });
const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");
const filler = (n, p) => Array.from({ length: n }, (_, i) => `${p}${i}`).join(" ");

function ws() {
  const dir = tempDir("hs-ready-");
  cpSync(join(ROOT, "test", "fixtures", "writing-valid"), dir, { recursive: true });
  writeFileSync(join(dir, "essay.claims.jsonl"), "");
  writeFileSync(join(dir, "runs.jsonl"), "");
  const draft = join(dir, "draft.md");
  writeFileSync(draft, `# Claim\n\n${filler(250, "c")}\n\n# Evidence\n\n${filler(250, "e")}\n\n# Close\n\n${filler(250, "l")}\n`);
  return { dir, spec: join(dir, "spec.md"), draft, ledger: join(dir, "runs.jsonl") };
}
const judgeLine = (w, station, status = "pass", extra = {}) => appendFileSync(w.ledger, JSON.stringify({
  at: new Date().toISOString(), kind: "judge", station, draft: "draft.md",
  draft_sha256: sha(w.draft), spec_sha256: sha(w.spec), status, verdict: "one-shot", ...extra,
}) + "\n");
const panel = (w) => { for (const r of ["skeptic", "novice", "expert", "buyer"]) judgeLine(w, "panel", "pass", { reader: r }); };
const ready = (w, ...a) => run("ready", w.spec, "--draft", w.draft, "--json", ...a);

test("nothing run yet: not ready, and it says what is missing", () => {
  const w = ws();
  const r = ready(w, "--judges", "doctor,reader,panel");
  assert.equal(r.status, 1, r.stderr);
  const o = JSON.parse(r.stdout);
  assert.equal(o.ready, false);
  assert.ok(o.missing.some((m) => /check/.test(m)));
  assert.ok(o.missing.some((m) => /doctor/.test(m)));
  assert.ok(o.missing.some((m) => /panel.*buyer/.test(m)), "the audience's own reader is named");
});

test("check, then every judge, then check again: ready", () => {
  const w = ws();
  assert.equal(run("check", w.spec, "--draft", w.draft).status, 0);
  judgeLine(w, "doctor"); judgeLine(w, "reader"); panel(w);
  assert.equal(ready(w, "--judges", "doctor,reader,panel").status, 1, "the panel came after the last check");
  assert.equal(run("check", w.spec, "--draft", w.draft).status, 0);
  const r = ready(w, "--judges", "doctor,reader,panel");
  assert.equal(r.status, 0, r.stdout);
  assert.equal(JSON.parse(r.stdout).ready, true);
});

test("a failing judge, or one judged on other bytes, is not ready", () => {
  const w = ws();
  judgeLine(w, "doctor", "fail"); judgeLine(w, "reader"); panel(w);
  run("check", w.spec, "--draft", w.draft);
  let o = JSON.parse(ready(w, "--judges", "doctor,reader,panel").stdout);
  assert.equal(o.ready, false);
  assert.ok(o.missing.some((m) => /doctor.*fail/.test(m)), o.missing.join("; "));
  judgeLine(w, "doctor");
  run("check", w.spec, "--draft", w.draft);
  assert.equal(ready(w, "--judges", "doctor,reader,panel").status, 0);
  // The draft changes: every line was about other bytes.
  appendFileSync(w.draft, "\nOne more sentence.\n");
  o = JSON.parse(ready(w, "--judges", "doctor,reader,panel").stdout);
  assert.equal(o.ready, false);
});

test("a failing check is not ready, and a partial check does not count", () => {
  const w = ws();
  judgeLine(w, "doctor");
  run("check", w.spec, "--draft", w.draft, "--only", "form");
  const o = JSON.parse(ready(w, "--judges", "doctor").stdout);
  assert.equal(o.ready, false, "an --only run is partial");
});

test("with no --judges, every judge that applies to this spec and draft is required", () => {
  const w = ws();
  run("check", w.spec, "--draft", w.draft);
  const o = JSON.parse(ready(w).stdout);
  assert.deepEqual(o.judges, ["doctor", "lineup", "reader", "persona", "panel"], "lineup applies: the fixture has goldens and this draft has prose");
});

test("usage: a missing draft or an unknown judge is exit 2", () => {
  const w = ws();
  assert.equal(run("ready", w.spec).status, 2);
  assert.equal(run("ready", w.spec, "--draft", w.draft, "--judges", "oracle").status, 2);
});
