import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tempDir } from "./tmp.mjs";

// A sequential work checked while it is being written (0.12). What only a FINISHED work can clear
// (front matter written last, a length still under its minimum, a required part not started, a
// ledger line for a unit not written yet) is a warning under --in-progress, marked later: true.
// Everything else still fails, and the run is partial, so `ready` never counts it. Every run is
// against a copy of the shipped knots example, which builds on the course form's front matter.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const hs = (args, cwd) => spawnSync(process.execPath, [join(ROOT, "bin", "hyperspec.mjs"), ...args], { cwd, encoding: "utf8" });
const copy = () => { const d = tempDir("hs-in-progress-"); cpSync(join(ROOT, "examples", "writing"), d, { recursive: true }); return d; };
const edit = (d, f, fn) => writeFileSync(join(d, f), fn(readFileSync(join(d, f), "utf8")));
const check = (d, ...extra) => { const r = hs(["check", "knots.hyperspec.md", "--json", ...extra], d); return { code: r.status, out: JSON.parse(r.stdout) }; };
const find = (out, id) => out.stations.flatMap((s) => s.findings).find((f) => f.id === id);
const lastLine = (d) => JSON.parse(readFileSync(join(d, "knots", "runs.jsonl"), "utf8").trim().split("\n").at(-1));
const noFrontMatter = (t) => t.replace("## This course on one page\n", "");

test("front matter not written yet fails a check, and is a later warning in progress", () => {
  const d = copy();
  edit(d, "knots/course.md", noFrontMatter);
  const plain = check(d);
  assert.equal(plain.code, 1);
  assert.equal(find(plain.out, "station-sequence-front-matter-missing").severity, "fail");
  const now = check(d, "--in-progress");
  assert.equal(now.code, 0, JSON.stringify(now.out.stations.filter((s) => s.status === "fail")));
  const f = find(now.out, "station-sequence-front-matter-missing");
  assert.equal(f.severity, "warn");
  assert.equal(f.later, true);
  assert.equal(now.out.inProgress, true);
  assert.equal(now.out.partial, true);
});

test("an in-progress run is a partial ledger line, so ready never counts it", () => {
  const d = copy();
  edit(d, "knots/course.md", noFrontMatter);
  check(d, "--in-progress");
  const line = lastLine(d);
  assert.equal(line.partial, true);
  assert.equal(line.in_progress, true);
  assert.match(line.reason, /^in progress/);
  const r = hs(["ready", "knots.hyperspec.md", "--json"], d);
  assert.equal(r.status, 1);
  assert.ok(JSON.parse(r.stdout).missing.some((m) => /no full check/.test(m)), r.stdout);
});

test("a ledger line for a unit not written yet, and a required part not started, are later warnings", () => {
  const d = copy();
  writeFileSync(join(d, "knots", "claims.jsonl"), JSON.stringify({ text: "A sheet bend joins two ropes of different thickness.", source: "brief#s1", span: "Course brief" }) + "\n");
  edit(d, "knots/course.md", (t) => t.replace("# Two knots\n", ""));
  const plain = check(d);
  assert.equal(plain.code, 1);
  assert.equal(find(plain.out, "station-claims-stale").severity, "fail");
  assert.equal(find(plain.out, "station-form-required-part-two-knots").severity, "fail");
  const now = check(d, "--in-progress");
  assert.equal(now.code, 0, JSON.stringify(now.out.stations.filter((s) => s.status === "fail")));
  for (const id of ["station-claims-stale", "station-form-required-part-two-knots"]) {
    const f = find(now.out, id);
    assert.equal(f.severity, "warn", id);
    assert.equal(f.later, true, id);
  }
});

test("under its minimum is later; over its maximum is never later", () => {
  const d = copy();
  edit(d, "knots/course.md", (t) => t.slice(0, t.indexOf("## Lesson 2")));
  assert.equal(find(check(d).out, "station-form-length").severity, "fail");
  assert.equal(find(check(d, "--in-progress").out, "station-form-length").severity, "warn");
  const e = copy();
  edit(e, "knots/course.md", (t) => `${t}\n${Array.from({ length: 400 }, (_, i) => `word${i}`).join(" ")}\n`);
  const long = check(e, "--in-progress");
  assert.equal(long.code, 1);
  const f = find(long.out, "station-form-length");
  assert.equal(f.severity, "fail");
  assert.equal(f.later, undefined);
});

test("front matter out of order still fails in progress: only a missing page is later", () => {
  const d = copy();
  edit(d, "knots/course.md", (t) => {
    const page = t.slice(t.indexOf("## This course on one page"), t.indexOf("## Lesson 1"));
    return t.replace(page, "").replace("## Lesson 2", `${page}## Lesson 2`);
  });
  const now = check(d, "--in-progress");
  assert.equal(now.code, 1);
  assert.equal(find(now.out, "station-sequence-front-matter-order").severity, "fail");
});

test("without --in-progress nothing changes: the shipped example checks exactly as before", () => {
  const d = copy();
  const plain = check(d);
  assert.equal(plain.code, 0);
  assert.equal(plain.out.inProgress, false);
  assert.ok(plain.out.stations.flatMap((s) => s.findings).every((f) => f.later === undefined));
});
