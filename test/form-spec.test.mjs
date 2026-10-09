import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFileSync, cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tempDir } from "./tmp.mjs";
import { loadSpec } from "../src/load.mjs";
import { lintSpec } from "../src/rules.mjs";
import { score } from "../src/score.mjs";
import { sha256 } from "../src/hash.mjs";
import { specText } from "../src/spec-text.mjs";

// A form spec (0.11): the decisions true of every work of one kind, written once as a hyperspec of
// its own (kind: form), which a work builds on with one key, form: <path>. loadSpec merges the two,
// so every command reads the merged spec and no station needs to know forms exist. These tests hold
// the merge to its contract (lists accumulate with the form's entries first, maps merge key by key,
// a scalar is the form's or filled by the work, never both ways), the findings for every way a form
// can be unusable, the form's own lint, and the form's provenance in the runs ledger.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BIN = join(ROOT, "bin", "hyperspec.mjs");
const cli = (args, cwd) => spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: "utf8" });

const decision = (id, value = "one") => ({ id, state: "decided", value, source: "brief", author: "example-author", chosen_by: "human" });
const requirement = (id) => ({ id, text: `requirement ${id}`, fails_when: `a reader reports ${id} broken`, check: { station: `station ${id}` }, source: "brief", author: "example-author" });
// A plain spec (no profile), complete on its own: every core test passes.
const core = (over = {}) => ({
  hyperspec: "0.1",
  title: "A note",
  kind: "note",
  decisions: [decision("d1")],
  requirements: [requirement("r1")],
  rejects: ["one"],
  examples: [{ path: "ex.md", why: "it shows the shape a note takes" }],
  resume: { next_action: "write the next note" },
  feedback: { issues: "the tracker", fork: "MIT" },
  improvement: { ledger: "runs.jsonl" },
  ...over,
});
const formOf = (over = {}) => core({ title: "A form for notes", kind: "form", resume: { next_action: "hold a second note to this form" }, feedback: { issues: "the form's tracker", fork: "MIT" }, improvement: { ledger: "form-runs.jsonl" }, ...over });
// A work that names the form and carries only its own decisions, requirement and rejects.
const workOf = (over = {}) => ({
  hyperspec: "0.1",
  title: "One note",
  kind: "note",
  form: "form.md",
  decisions: [decision("d2")],
  requirements: [requirement("r2")],
  rejects: ["two"],
  resume: { next_action: "send the note" },
  feedback: { issues: "the tracker", fork: "MIT" },
  improvement: { ledger: "runs.jsonl" },
  ...over,
});

// A folder holding the form (at formAt, with an example and a ledger beside it) and the work at
// work.md. form may be data or raw text. Returns the loaded work and its lint.
function setup({ form = formOf(), work = workOf(), formAt = "form.md" } = {}) {
  const dir = tempDir("hs-form-");
  const formDir = dirname(join(dir, formAt));
  mkdirSync(formDir, { recursive: true });
  for (const d of new Set([dir, formDir])) {
    writeFileSync(join(d, "ex.md"), "An example note.\n");
    writeFileSync(join(d, "runs.jsonl"), "");
    writeFileSync(join(d, "form-runs.jsonl"), "");
  }
  if (form !== null) writeFileSync(join(dir, formAt), typeof form === "string" ? form : specText(form, "\n# The form\n"));
  writeFileSync(join(dir, "work.md"), specText(work, "\n# The work\n"));
  const spec = loadSpec(join(dir, "work.md"));
  const findings = lintSpec(spec);
  return { dir, spec, findings, ids: findings.filter((x) => x.severity === "fail").map((x) => x.id) };
}

// ---------------------------------------------------------------------------------------------
// The merge.

test("a work with form: loads merged: the form's decisions, requirements and rejects first, then the work's, and lint passes", () => {
  const { spec, findings } = setup();
  assert.equal(spec.error, undefined);
  assert.deepEqual(spec.data.decisions.map((d) => d.id), ["d1", "d2"]);
  assert.deepEqual(spec.data.requirements.map((r) => r.id), ["r1", "r2"]);
  assert.deepEqual(spec.data.rejects, ["one", "two"]);
  assert.deepEqual(spec.data.examples.map((e) => e.path), ["ex.md"], "the work inherits the form's example");
  assert.deepEqual(findings, []);
  assert.equal(score(findings, spec.data).status, "pass");
});

test("an exact duplicate of a form entry collapses, in every accumulating list", () => {
  const { spec, findings } = setup({ work: workOf({ decisions: [decision("d2"), decision("d1")], requirements: [requirement("r1"), requirement("r2")], rejects: ["one", "two"], examples: [{ path: "ex.md", why: "it shows the shape a note takes" }] }) });
  assert.deepEqual(spec.data.decisions.map((d) => d.id), ["d1", "d2"]);
  assert.deepEqual(spec.data.requirements.map((r) => r.id), ["r1", "r2"]);
  assert.deepEqual(spec.data.rejects, ["one", "two"]);
  assert.equal(spec.data.examples.length, 1);
  assert.deepEqual(findings, []);
});

test("the writing lists accumulate too, the form's entries first, duplicates collapsed", () => {
  const form = formOf({ writing: { persona: { may_assert: ["a"], will_not_say: ["x"] }, form: { stations: ["s1"], sequence: { sections: ["A", "B"], knows: ["k1"], front_matter: ["F1"] } } } });
  const work = workOf({ writing: { persona: { may_assert: ["b", "a"], will_not_say: ["y"] }, form: { stations: ["s2", "s1"], sequence: { sections: ["C"], knows: ["k2"], front_matter: ["F2"], files: ["part-*.md"] } } } });
  const w = setup({ form, work }).spec.data.writing;
  assert.deepEqual(w.persona.may_assert, ["a", "b"]);
  assert.deepEqual(w.persona.will_not_say, ["x", "y"]);
  assert.deepEqual(w.form.stations, ["s1", "s2"]);
  assert.deepEqual(w.form.sequence.sections, ["A", "B", "C"]);
  assert.deepEqual(w.form.sequence.knows, ["k1", "k2"]);
  assert.deepEqual(w.form.sequence.front_matter, ["F1", "F2"]);
  assert.deepEqual(w.form.sequence.files, ["part-*.md"], "a key only the work sets is the work's");
});

test("an entry reusing an id the form uses is refused as form-id-collision, a decision or a requirement", () => {
  const changed = setup({ work: workOf({ decisions: [decision("d2"), decision("d1", "two")] }) });
  const f = changed.findings.find((x) => x.id === "form-id-collision");
  assert.ok(f, JSON.stringify(changed.findings));
  assert.equal(f.test, 1);
  assert.equal(f.severity, "fail");
  assert.match(f.message, /decision "d1"/);
  assert.match(f.message, /form\.md/);
  assert.deepEqual(changed.spec.data.decisions.find((d) => d.id === "d1").value, "one", "the form's entry stands");
  const crossed = setup({ work: workOf({ requirements: [requirement("r2"), requirement("d1")] }) });
  assert.ok(crossed.ids.includes("form-id-collision"), "one namespace: a requirement cannot take a form decision's id");
});

test("a scalar the work sets differently is form-contradiction, naming the field and both values, and the form's value stands", () => {
  const form = formOf({ writing: { sources: { unsourced_claim: "fail" } } });
  const work = workOf({ writing: { sources: { unsourced_claim: "warn", ledger: "claims.jsonl" } } });
  const { spec, findings } = setup({ form, work });
  const f = findings.find((x) => x.id === "form-contradiction");
  assert.ok(f, JSON.stringify(findings));
  assert.equal(f.test, 1);
  assert.equal(f.severity, "fail");
  assert.match(f.message, /writing\.sources\.unsourced_claim/);
  assert.match(f.message, /"fail"/);
  assert.match(f.message, /"warn"/);
  assert.equal(spec.data.writing.sources.unsourced_claim, "fail");
});

test("the work fills a scalar the form leaves unset, and maps merge key by key", () => {
  const form = formOf({ writing: { sources: { unsourced_claim: "fail" } } });
  const work = workOf({ writing: { sources: { ledger: "claims.jsonl" } } });
  const { spec, findings } = setup({ form, work });
  assert.deepEqual(spec.data.writing.sources, { unsourced_claim: "fail", ledger: "claims.jsonl" });
  assert.deepEqual(findings, []);
});

test("the same value written in both is no contradiction, and a list outside the accumulating ones is one value", () => {
  const form = formOf({ writing: { form: { required_parts: ["Opening", "Close"], name: "note" } } });
  const same = setup({ form, work: workOf({ writing: { form: { name: "note" } } }) });
  assert.deepEqual(same.ids, []);
  assert.deepEqual(same.spec.data.writing.form.required_parts, ["Opening", "Close"], "inherited whole");
  const other = setup({ form, work: workOf({ writing: { form: { required_parts: ["Opening"] } } }) });
  const f = other.findings.find((x) => x.id === "form-contradiction");
  assert.ok(f, JSON.stringify(other.findings));
  assert.match(f.message, /writing\.form\.required_parts/);
});

test("the form's own keys are never inherited: title, kind, resume, feedback and improvement are the work's", () => {
  const { spec, ids } = setup();
  assert.equal(spec.data.title, "One note");
  assert.equal(spec.data.kind, "note");
  assert.equal(spec.data.resume.next_action, "send the note");
  assert.equal(spec.data.improvement.ledger, "runs.jsonl");
  assert.deepEqual(ids, [], "no contradiction on a key that belongs to each file");
  const bare = setup({ work: workOf({ resume: undefined }) });
  assert.ok(bare.ids.includes("next-action"), "a work with no resume does not borrow the form's");
});

test("a path the form writes resolves against the form's folder, so a form can live anywhere", () => {
  const form = formOf({ writing: { dna: { rules: "../rules.md" } } });
  const { dir, spec, findings } = setup({ form, work: workOf({ form: "forms/form.md" }), formAt: "forms/form.md" });
  assert.deepEqual(spec.data.examples.map((e) => e.path), ["forms/ex.md"]);
  assert.equal(spec.data.writing.dna.rules, "rules.md");
  assert.deepEqual(findings, [], "the form's example is found from the work's folder");
  assert.equal(spec.dir, dir, "every other path still resolves against the work");
});

// ---------------------------------------------------------------------------------------------
// A form that cannot be used, each with its own finding.

test("a form file that does not exist is form-missing, and nothing is merged", () => {
  const { spec, findings } = setup({ form: null });
  const f = findings.find((x) => x.id === "form-missing");
  assert.ok(f, JSON.stringify(findings));
  assert.equal(f.test, 1);
  assert.match(f.message, /form\.md/);
  assert.deepEqual(spec.data.decisions.map((d) => d.id), ["d2"]);
  assert.equal(spec.form, undefined);
});

test("a form: that is blank or a placeholder is form-missing", () => {
  assert.ok(setup({ work: workOf({ form: "TODO" }) }).ids.includes("form-missing"));
});

test("a file that cannot be read as a hyperspec is form-unreadable", () => {
  const { ids } = setup({ form: "# just notes, no frontmatter\n" });
  assert.ok(ids.includes("form-unreadable"), ids.join(", "));
});

test("a hyperspec that is not kind: form is form-not-a-form, naming its kind", () => {
  const { findings } = setup({ form: core({ kind: "note" }) });
  const f = findings.find((x) => x.id === "form-not-a-form");
  assert.ok(f, JSON.stringify(findings));
  assert.match(f.message, /"note"/);
});

test("a form that fails its own lint is form-fails, naming what fails, so the form is fixed rather than every work", () => {
  const { findings } = setup({ form: formOf({ rejects: [] }) });
  const f = findings.find((x) => x.id === "form-fails");
  assert.ok(f, JSON.stringify(findings));
  assert.equal(f.test, 1);
  assert.match(f.message, /form\.md/);
  assert.match(f.message, /rejects/);
  assert.match(f.fix, /hyperspec lint form\.md/);
});

test("a form that names a form is form-nested: one level only", () => {
  const { dir, findings, spec } = setup({ form: formOf({ form: "other.md" }) });
  assert.deepEqual(findings.filter((x) => x.id === "form-nested").length, 1, JSON.stringify(findings));
  assert.ok(!findings.some((x) => x.id === "form-fails"), "the nesting is reported once, as itself");
  assert.deepEqual(spec.data.decisions.map((d) => d.id), ["d1", "d2"], "the form itself still merges");
  const direct = lintSpec(loadSpec(join(dir, "form.md")));
  assert.ok(direct.some((x) => x.id === "form-nested"), "linted on its own, the form says so too");
});

// ---------------------------------------------------------------------------------------------
// A form linted on its own.

test("the example form lints pass on its own, with no materials, spine, goal or audience", () => {
  const r = cli(["lint", join(ROOT, "examples", "writing", "forms", "course.form.hyperspec.md"), "--json"]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const file = JSON.parse(r.stdout).files[0];
  assert.deepEqual(file.findings, []);
  assert.deepEqual(file.profile, { name: "writing", complete: 9, total: 9 });
});

test("a form's block may leave fields to the work, and still owes its own check, source and author", () => {
  const block = { unsourced_claim: "fail", check: { station: "every claim points at a source" }, source: "sourcing pass", author: "example-author" };
  const formSpec = (sources) => formOf({
    profile: "writing",
    decisions: [decision("d1"), { id: "writing-dna", state: "delegated", rule: "each work marks its own goldens", source: "brief", author: "example-author", chosen_by: "human" }],
    writing: {
      persona: { identity: "self", stance: "guide", will_not_say: ["a guess"], facts_from: "sources", check: { rubric: "persona judge" }, source: "interview", author: "example-author" },
      form: { name: "note", check: { station: "structure" }, source: "form decision", author: "example-author" },
      sources,
    },
  });
  const lintForm = (data) => {
    const dir = tempDir("hs-form-own-");
    writeFileSync(join(dir, "ex.md"), "x\n");
    writeFileSync(join(dir, "form-runs.jsonl"), "");
    writeFileSync(join(dir, "form.md"), specText(data, "\n# Form\n"));
    return lintSpec(loadSpec(join(dir, "form.md")));
  };
  const clean = lintForm(formSpec(block));
  assert.deepEqual(clean, [], "sources.ledger, persona.may_assert, form.length and required_parts are the work's to fill");
  const unowned = lintForm(formSpec({ unsourced_claim: "fail" })).map((x) => x.id);
  for (const id of ["writing-sources-check", "writing-sources-source", "writing-sources-author"]) assert.ok(unowned.includes(id), `${id}: ${unowned.join(", ")}`);
  const wrong = lintForm(formSpec({ ...block, unsourced_claim: "sometimes" })).map((x) => x.id);
  assert.ok(wrong.includes("writing-sources-unsourced-claim"), "a value the form does set is held to its closed set");
  const noPersona = formSpec(block);
  delete noPersona.writing.persona;
  assert.ok(lintForm(noPersona).some((x) => x.id === "writing-persona-missing"), "persona is a form's to write or defer");
});

// ---------------------------------------------------------------------------------------------
// The example work, end to end: lint, check, the ledger's provenance, and ready.

const copy = () => {
  const d = tempDir("hs-form-example-");
  cpSync(join(ROOT, "examples", "writing"), d, { recursive: true });
  return d;
};

test("the example work lints pass 9/9 against the merged spec, with its form named in --json", () => {
  const d = copy();
  const r = cli(["lint", "knots.hyperspec.md", "--json"], d);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const file = JSON.parse(r.stdout).files[0];
  assert.deepEqual(file.findings, []);
  assert.deepEqual(file.profile, { name: "writing", complete: 9, total: 9 });
  assert.deepEqual(file.form, { path: "forms/course.form.hyperspec.md", sha256: sha256(readFileSync(join(d, "forms", "course.form.hyperspec.md"))) });
});

test("check holds the example work to the merged spec, and its ledger line carries the form's path and sha256", () => {
  const d = copy();
  const r = cli(["check", "knots.hyperspec.md", "--json"], d);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.stations.find((s) => s.station === "sequence").status, "pass", JSON.stringify(out.stations));
  assert.equal(out.stations.find((s) => s.station === "form").status, "pass");
  const line = JSON.parse(readFileSync(join(d, "knots", "runs.jsonl"), "utf8").trim());
  assert.deepEqual(Object.keys(line), ["at", "kind", "draft", "draft_sha256", "spec_sha256", "form", "stations", "verdict"]);
  assert.deepEqual(line.form, { path: "forms/course.form.hyperspec.md", sha256: sha256(readFileSync(join(d, "forms", "course.form.hyperspec.md"))) });
  assert.equal(line.verdict, "one-shot");
});

test("a changed form is named in the next check's verdict, even when the work's own spec did not change", () => {
  const d = copy();
  assert.equal(cli(["check", "knots.hyperspec.md"], d).status, 0);
  appendFileSync(join(d, "forms", "course.form.hyperspec.md"), "\nOne more sentence about the form.\n");
  const r = cli(["check", "knots.hyperspec.md", "--json"], d);
  assert.equal(r.status, 0, r.stdout);
  const lines = readFileSync(join(d, "knots", "runs.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(lines[1].spec_sha256, lines[0].spec_sha256);
  assert.notEqual(lines[1].form.sha256, lines[0].form.sha256);
  assert.equal(lines[1].verdict, "not-improved");
  assert.equal(lines[1].reason, "form changed; every station still passes");
});

test("ready reads the form's bytes too: a check under the old form does not count once the form changes", () => {
  const d = copy();
  assert.equal(cli(["check", "knots.hyperspec.md"], d).status, 0);
  const before = JSON.parse(cli(["ready", "knots.hyperspec.md", "--json"], d).stdout);
  assert.ok(!before.missing.some((m) => /no full check/.test(m)), before.missing.join("\n"));
  appendFileSync(join(d, "forms", "course.form.hyperspec.md"), "\nOne more sentence about the form.\n");
  const after = JSON.parse(cli(["ready", "knots.hyperspec.md", "--json"], d).stdout);
  assert.ok(after.missing.some((m) => /no full check/.test(m)), after.missing.join("\n"));
});

test("a work whose merged spec breaks a station fails check like any other: the form's front matter is enforced", () => {
  const d = copy();
  const draft = join(d, "knots", "course.md");
  writeFileSync(draft, readFileSync(draft, "utf8").replace("## This course on one page\n", "## About this course\n"));
  const r = cli(["check", "knots.hyperspec.md"], d);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /fail \[station-sequence-front-matter-missing\]/);
});
