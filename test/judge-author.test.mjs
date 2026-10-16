// The author station (0.15): its packet holds only the AUTHOR.md writing.persona.author_file names and
// the draft; its verdict is validated (every quoted passage must be in the draft); a valid verdict
// passes when the author is recognizable, with each passage that is not them a warning. The
// AUTHOR.md is an input source: changed after prepare means stale, never altered.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cli, workspace, forStation, writeVerdict, ledgerLines, prepare, record, DRAFT } from "./judge-fixture.mjs";
import { AUTHOR_INSTRUCTIONS, AUTHOR_RUBRIC } from "../src/judges/author.mjs";

const AUTHOR = "---\nname: Sam Rivera\nkind: self\n---\n\n# Sam Rivera\n\n## 1. Who is writing\n\nAn engineer who writes the way he talks to a friend across a table.\n";
const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const ids = (findings) => findings.map((f) => f.id);

// The fixture spec with persona.author_file pointing at AUTHOR.md beside it.
function withAuthor(w = workspace(), { path = "AUTHOR.md", text = AUTHOR } = {}) {
  const spec = readFileSync(w.spec, "utf8");
  const edited = spec.replace("    facts_from: sources\n", `    facts_from: sources\n    author_file: ${path}\n`);
  assert.notEqual(edited, spec);
  writeFileSync(w.spec, edited);
  if (text !== null) writeFileSync(join(w.dir, path), text);
  return forStation(w, "author");
}
function ready() {
  const w = withAuthor();
  const r = prepare(w, "--only", "author");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return w;
}
const verdict = (edit = (v) => v) => { const v = { recognizable: true, why: "it argues from what he shipped, plainly", not_them: [] }; return edit(v) ?? v; };
function recordJson(w, v) {
  writeVerdict(w.verdict, v);
  const r = record(w, "--json");
  return { r, j: JSON.parse(r.stdout) };
}

test("the author packet: the fixed rubric, fixed instructions, the AUTHOR.md and the draft, nothing else", () => {
  const w = ready();
  const p = json(w.packet);
  assert.equal(p.station, "author");
  assert.equal(p.rubric, AUTHOR_RUBRIC);
  assert.equal(p.instructions, AUTHOR_INSTRUCTIONS);
  for (const s of ["AUTHOR.md", "recognizable", "not_them", "verbatim", "verdict shape"]) assert.ok(p.instructions.includes(s), s);
  assert.deepEqual(Object.keys(p.inputs), ["author", "draft"], "blind: no rules, no persona fields, no claims");
  assert.equal(p.inputs.author, AUTHOR);
  assert.equal(p.inputs.draft, DRAFT);
  assert.deepEqual(p.verdict_schema.required, ["recognizable", "why", "not_them"]);
  assert.deepEqual(readdirSync(w.out), ["author.packet.json"], "the author has no key");
});

test("no persona.author_file: the author is skipped, and a full round is unchanged", () => {
  const w = forStation(workspace(), "author");
  const r = prepare(w, "--only", "author");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^author: skip \(writing\.persona\.author_file is not set\)$/m);
  assert.deepEqual(readdirSync(w.out), []);
});

test("lint refuses a persona.author_file that is missing or a folder, and passes a real file", () => {
  const missing = withAuthor(workspace(), { path: "nope/AUTHOR.md", text: null });
  const r = cli(["lint", missing.spec]);
  assert.notEqual(r.status, 0);
  assert.match(r.stdout, /persona\.author_file "nope\/AUTHOR\.md" does not exist/);
  const ok = withAuthor();
  const r2 = cli(["lint", ok.spec]);
  assert.equal(r2.status, 0, r2.stdout + r2.stderr);
});

test("recognizable with nothing off: pass, no findings, one judge line", () => {
  const w = ready();
  const { r, j } = recordJson(w, verdict());
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(j.status, "pass");
  assert.deepEqual(j.findings, []);
  assert.equal(ledgerLines(w.ledger).filter((l) => l.kind === "judge" && l.station === "author").length, 1);
});

test("a passage that is not them is a warning at its line; not recognizable fails", () => {
  const w = ready();
  const off = { evidence: "Read the schema section next.", why: "a generic close; he would tell you what he did next" };
  const { r, j } = recordJson(w, verdict((v) => ({ ...v, not_them: [off] })));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(j.status, "pass");
  assert.deepEqual(ids(j.findings), ["judge-author-not-them"]);
  assert.equal(j.findings[0].severity, "warn");
  const w2 = ready();
  const { j: j2 } = recordJson(w2, verdict((v) => ({ ...v, recognizable: false, why: "it reads like a manual" })));
  assert.equal(j2.status, "fail");
  assert.deepEqual(ids(j2.findings), ["judge-author-unrecognized"]);
});

test("the verdict's shape is checked, and every quoted passage must be in the draft", () => {
  const w = ready();
  const { r, j } = recordJson(w, { recognizable: "yes", not_them: [{ evidence: "words never written anywhere", why: "x" }] });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.equal(j.invalid, true);
  const msgs = j.findings.map((f) => f.message).join("\n");
  assert.match(msgs, /recognizable is missing or not true or false/);
  assert.match(msgs, /why is missing or empty/);
  assert.match(msgs, /not_them\[0\]\.evidence/);
});

test("an AUTHOR.md changed after prepare makes the packet stale, naming the file; deleted is stale too", () => {
  const w = ready();
  writeFileSync(join(w.dir, "AUTHOR.md"), `${AUTHOR}\nA new line.\n`);
  const { r, j } = recordJson(w, verdict());
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.equal(j.stale, true);
  assert.match(j.findings[0].message, /the author file \(AUTHOR\.md\) changed since the packet was prepared/);
  const w2 = ready();
  rmSync(join(w2.dir, "AUTHOR.md"));
  const { j: j2 } = recordJson(w2, verdict());
  assert.equal(j2.stale, true);
});
