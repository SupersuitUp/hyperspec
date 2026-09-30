// Triage (hyperspec 0.9): every finding answered, and every answer held to the draft as it is now.
// The station in check, and the four commands (status, answer, import, reply), read one file with
// one set of rules (src/triage.mjs). Each GUARD below is a case the rules exist to refuse.

import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cli, workspace, DRAFT } from "./judge-fixture.mjs";
import { ROOT } from "./station-fixture.mjs";
import { tempDir } from "./tmp.mjs";
import { run } from "../src/stations/triage.mjs";
import { parseReview, replyText, sharedPassages } from "../src/triage.mjs";
import { evidenceLocator } from "../src/evidence.mjs";
import { loadSpec } from "../src/load.mjs";

const finding = (id, fields = {}) => ({ finding_id: id, source: "panel", reader: "skeptic", kind: "improve", text: `finding ${id}`, evidence: "not a prompt someone wrote once", draft_sha256: "x", disposition: null, answer: null, ...fields });
const setupWith = (items, { draft = DRAFT, extra = "" } = {}) => {
  const w = workspace({ draft, prefix: "hs-triage-" });
  writeFileSync(join(w.dir, "triage.jsonl"), items.map((i) => JSON.stringify(i)).join("\n") + (items.length ? "\n" : "") + extra);
  return w;
};
const station = (w, draftText = readFileSync(w.draft, "utf8")) => run(loadSpec(w.spec), { path: "draft.md", text: draftText, lines: draftText.split("\n"), sha256: "now" });
const ids = (r) => r.findings.map((f) => `${f.severity} ${f.id}`);
const triageFile = (w) => readFileSync(join(w.dir, "triage.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const tri = (w, ...args) => cli(["triage", ...args], { cwd: w.dir });

// ---- the station ----------------------------------------------------------------------------------

test("with no triage file the station skips and says how one starts", () => {
  const w = workspace({ prefix: "hs-triage-" });
  const r = station(w);
  assert.equal(r.status, "skip");
  assert.equal(r.reason, "no triage file at triage.jsonl yet; a recorded panel verdict or a triage import starts one");
});

test("every finding answered, with evidence in the draft and reasons given, passes", () => {
  const w = setupWith([
    finding("a", { disposition: "taken", answer: { evidence: "Read the schema section next.", draft_sha256: "now" } }),
    finding("b", { disposition: "kept", answer: { reason: "the contrast is the point", draft_sha256: "now" } }),
    finding("c", { disposition: "already-true", answer: { evidence: "each one names what fails it", draft_sha256: "now" } }),
  ]);
  const r = station(w);
  assert.equal(r.status, "pass", JSON.stringify(r.findings));
  assert.deepEqual(r.findings, []);
});

test("GUARD: a finding nobody answered fails, at the line its evidence points to", () => {
  const r = station(setupWith([finding("a")]));
  assert.equal(r.status, "fail");
  assert.deepEqual(ids(r), ["fail station-triage-untriaged"]);
  assert.equal(r.findings[0].line, 3);
  assert.match(r.findings[0].message, /^a \(skeptic, improve\) is not answered: "finding a"/);
});

test("GUARD: a taken answer whose evidence is no longer in the draft fails", () => {
  const w = setupWith([finding("a", { disposition: "taken", answer: { evidence: "Read the schema section next.", draft_sha256: "old" } })]);
  assert.equal(station(w).status, "pass");
  const r = station(w, DRAFT.replace("Read the schema section next.", "Now read the schema."));
  assert.deepEqual(ids(r), ["fail station-triage-evidence-not-found"]);
});

test("GUARD: taken and already-true answers need evidence of at least three words", () => {
  const w = setupWith([
    finding("a", { disposition: "taken", answer: { draft_sha256: "now" } }),
    finding("b", { disposition: "already-true", answer: { evidence: "schema section", draft_sha256: "now" } }),
  ]);
  assert.deepEqual(ids(station(w)), ["fail station-triage-evidence-missing", "fail station-triage-evidence-missing"]);
});

test("GUARD: a kept answer with no reason fails", () => {
  assert.deepEqual(ids(station(setupWith([finding("a", { disposition: "kept", answer: { reason: " ", draft_sha256: "now" } })]))), ["fail station-triage-reason-missing"]);
});

test("GUARD: a disposition outside the four fails, and so does a line that is not a finding", () => {
  const w = setupWith([finding("a", { disposition: "maybe" })], { extra: "not json\n" });
  assert.deepEqual(ids(station(w)).sort(), ["fail station-triage-disposition", "fail station-triage-unreadable"]);
});

test("an open finding is a warning: the draft can pass while the decision waits", () => {
  const r = station(setupWith([finding("a", { disposition: "open", answer: { reason: "the author's call", draft_sha256: "now" } })]));
  assert.equal(r.status, "pass");
  assert.deepEqual(ids(r), ["warn station-triage-open"]);
  assert.match(r.findings[0].message, /\(the author's call\)$/);
});

test("stale: a kept answer about a passage that has since left the draft warns", () => {
  const w = setupWith([finding("a", { disposition: "kept", answer: { reason: "on purpose", draft_sha256: "old" } })]);
  assert.deepEqual(ids(station(w)), []);
  const r = station(w, DRAFT.replace("not a prompt someone wrote once", "not a prompt"));
  assert.equal(r.status, "pass");
  assert.deepEqual(ids(r), ["warn station-triage-stale"]);
});

// ---- check ----------------------------------------------------------------------------------------

test("check runs triage last, fails on an unanswered finding, and passes once it is answered", () => {
  const w = setupWith([finding("a")]);
  const r = cli(["check", w.spec, "--draft", w.draft, "--only", "triage", "--json"]);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.equal(JSON.parse(r.stdout).stations[0].findings[0].id, "station-triage-untriaged");
  const a = tri(w, "answer", "spec.md", "a", "kept", "--draft", "draft.md", "--reason", "the contrast is the point");
  assert.equal(a.status, 0, a.stdout + a.stderr);
  assert.equal(cli(["check", w.spec, "--draft", w.draft, "--only", "triage"]).status, 0);
});

// ---- triage answer ----------------------------------------------------------------------------------

test("answer writes the disposition and the answer, with the draft's hash and a time", () => {
  const w = setupWith([finding("a"), finding("b")]);
  const r = tri(w, "answer", "spec.md", "a", "taken", "--draft", "draft.md", "--evidence", "Read the schema\nsection next.");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout, "a: taken (triage.jsonl)\n");
  const [a, b] = triageFile(w);
  assert.equal(a.disposition, "taken");
  assert.deepEqual(Object.keys(a.answer), ["evidence", "draft_sha256", "at"]);
  assert.match(a.answer.draft_sha256, /^[0-9a-f]{64}$/);
  assert.equal(b.disposition, null, "the other finding is untouched");
});

test("GUARD: answer refuses evidence that is not in the draft, too short, or missing, and writes nothing", () => {
  const w = setupWith([finding("a")]);
  const before = readFileSync(join(w.dir, "triage.jsonl"), "utf8");
  const cases = [
    [["--evidence", "a sentence the draft never had"], "triage-evidence-not-found"],
    [["--evidence", "schema section"], "triage-evidence-too-short"],
    [[], "triage-evidence-missing"],
  ];
  for (const [flags, id] of cases) {
    const r = tri(w, "answer", "spec.md", "a", "already-true", "--draft", "draft.md", ...flags, "--json");
    assert.equal(r.status, 1, `${id}: ${r.stdout}`);
    assert.deepEqual(JSON.parse(r.stdout).findings.map((f) => f.id), [id]);
  }
  const k = tri(w, "answer", "spec.md", "a", "kept", "--draft", "draft.md");
  assert.equal(k.status, 1);
  assert.match(k.stdout, /\[triage-reason-missing\]/);
  assert.equal(readFileSync(join(w.dir, "triage.jsonl"), "utf8"), before);
});

test("answer usage: an unknown finding, an unknown disposition, no draft, no triage file are exit 2", () => {
  const w = setupWith([finding("a")]);
  assert.match(tri(w, "answer", "spec.md", "zzz", "open", "--draft", "draft.md").stderr, /no finding zzz in triage.jsonl/);
  assert.equal(tri(w, "answer", "spec.md", "a", "maybe", "--draft", "draft.md").status, 2);
  assert.match(tri(w, "answer", "spec.md", "a", "open").stderr, /triage answer needs --draft <file>/);
  const bare = workspace({ prefix: "hs-triage-" });
  assert.equal(cli(["triage", "answer", "spec.md", "a", "open", "--draft", "draft.md"], { cwd: bare.dir }).status, 2);
  assert.equal(tri(w, "nonsense", "spec.md").status, 2);
});

// ---- triage status and the synthesis ---------------------------------------------------------------

test("status counts every disposition and lists the passages two or more readers share", () => {
  const w = setupWith([
    finding("a"),
    finding("b", { reader: "novice", kind: "missing", evidence: "a prompt someone wrote" }),
    finding("c", { reader: "buyer", evidence: "Read the schema section next.", disposition: "open", answer: { draft_sha256: "now" } }),
  ]);
  const r = tri(w, "status", "spec.md", "--draft", "draft.md");
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.deepEqual(r.stdout.split("\n").slice(0, 5), [
    "triage.jsonl: 3 findings; 0 taken, 0 kept, 0 already true, 1 open, 2 not answered",
    "shared by two or more readers:",
    "  line 3: \"not a prompt someone wrote once\"",
    "    skeptic (improve): finding a",
    "    novice (missing): finding b",
  ]);
});

test("the synthesis groups by overlapping passage, never across two passages, and never one reader alone", () => {
  const locate = evidenceLocator(DRAFT);
  const items = [
    finding("a"),
    finding("b", { evidence: "someone wrote once" }),
    finding("c", { reader: "novice", evidence: "Read the schema section next." }),
  ];
  assert.deepEqual(sharedPassages(items, locate, DRAFT), [], "a and b overlap, but both are the skeptic's; c is elsewhere");
  const shared = sharedPassages([...items, finding("d", { reader: "expert", evidence: "a contract a linter can check, not a prompt" })], locate, DRAFT);
  assert.deepEqual(shared.map((g) => g.findings.map((f) => f.finding_id)), [["d", "a", "b"]]);
});

// ---- triage import ----------------------------------------------------------------------------------

const REVIEW = [
  "# Review of the draft",
  "",
  "Two readers read it.",
  "",
  "## The skeptic",
  "",
  "**Good:** the claim comes first.",
  "",
  "**Improve:**",
  "",
  "- The line \"not a prompt someone wrote once\" asserts more than it shows.",
  "- The close is abrupt.",
  "",
  "**Missing:**",
  "",
  "- An example before the schema:",
  "  > Read the schema section next.",
  "",
  "## The newcomer",
  "",
  "- Remove: the part that says \"every spec is a legal contract\".",
  "",
].join("\n");

test("parseReview reads readers from headings, kinds from labels, and leaves praise out", () => {
  const r = parseReview(REVIEW);
  assert.equal(r.praise, 1);
  assert.deepEqual(r.findings.map((f) => [f.reader, f.kind, f.text]), [
    ["The skeptic", "improve", "The line \"not a prompt someone wrote once\" asserts more than it shows."],
    ["The skeptic", "improve", "The close is abrupt."],
    ["The skeptic", "missing", "An example before the schema: Read the schema section next."],
    ["The newcomer", "remove", "the part that says \"every spec is a legal contract\"."],
  ]);
  assert.deepEqual(r.findings[2].quotes, ["Read the schema section next."]);
});

test("import adds each finding once, takes evidence from a quote found in the draft, and warns on one that is not", () => {
  const w = setupWith([]);
  writeFileSync(join(w.dir, "review.md"), REVIEW);
  const r = tri(w, "import", "spec.md", "review.md", "--draft", "draft.md", "--source", "an outside review");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout.split("\n")[0], "an outside review: 4 findings added to triage (triage.jsonl); 1 item of praise, not triaged");
  assert.match(r.stdout, /warn \[triage-import-quote-not-found\] a finding quotes text that is not in the current draft: "every spec is a legal contract"/);
  const lines = triageFile(w);
  assert.deepEqual(lines.map((l) => [l.source, l.reader, l.kind, l.evidence]), [
    ["an outside review", "The skeptic", "improve", "not a prompt someone wrote once"],
    ["an outside review", "The skeptic", "improve", null],
    ["an outside review", "The skeptic", "missing", "Read the schema section next."],
    ["an outside review", "The newcomer", "remove", null],
  ]);
  for (const l of lines) assert.match(l.finding_id, /^import-[0-9a-f]{8}$/);
  const again = tri(w, "import", "spec.md", "review.md", "--draft", "draft.md", "--source", "an outside review");
  assert.match(again.stdout, /0 findings added to triage \(triage\.jsonl\), 4 already there/);
});

test("GUARD: a review with nothing to answer imports nothing: exit 1", () => {
  const w = setupWith([]);
  writeFileSync(join(w.dir, "review.md"), "# Notes\n\n**Good:** all of it.\n");
  const r = tri(w, "import", "spec.md", "review.md", "--draft", "draft.md");
  assert.equal(r.status, 1);
  assert.match(r.stdout, /\[triage-import-empty\] the review holds no finding to answer \(only 1 item of praise\)/);
});

// ---- triage reply -----------------------------------------------------------------------------------

test("reply prints what was taken, kept, already there and open, one line each, and exits 0 when all are answered", () => {
  const w = setupWith([
    finding("a", { source: "a review", reader: null, text: "Show an example.", disposition: "taken", answer: { evidence: "Read the schema section next.", draft_sha256: "now" } }),
    finding("b", { source: "a review", reader: null, text: "Cut the contrast.", disposition: "kept", answer: { reason: "the contrast is the claim", draft_sha256: "now" } }),
    finding("c", { source: "a review", reader: null, text: "Say what fails.", disposition: "already-true", answer: { evidence: "each one names what fails it", draft_sha256: "now" } }),
    finding("d", { source: "a review", reader: null, text: "Who is it for?", disposition: "open", answer: { reason: "builders or leaders", draft_sha256: "now" } }),
    finding("e", { source: "panel", text: "Not from the review." }),
  ]);
  const r = tri(w, "reply", "spec.md", "--draft", "draft.md", "--source", "a review");
  assert.equal(r.stdout, [
    "Thank you for the review. Here is what happened to each point.",
    "",
    "Taken:",
    "- Show an example. Now in the draft: \"Read the schema section next.\"",
    "",
    "Kept as it is:",
    "- Cut the contrast. Why: the contrast is the claim",
    "",
    "Already in the draft:",
    "- Say what fails. It is here: \"each one names what fails it\"",
    "",
    "Still open:",
    "- Who is it for? To decide: builders or leaders",
    "",
  ].join("\n"));
  assert.equal(r.status, 1, "the panel's finding e is unanswered, so triage fails and the reply is not ready");
  assert.match(r.stderr, /not ready to send/);
});

test("GUARD: reply lists what is not answered yet, and exits 1 so it is not sent with a gap", () => {
  const items = [finding("a", { reader: null, text: "Show an example." })];
  const reply = replyText(items);
  assert.equal(reply.unanswered, 1);
  assert.match(reply.text, /Not answered yet:\n- Show an example\.\n$/);
  const w = setupWith(items);
  assert.equal(tri(w, "reply", "spec.md", "--draft", "draft.md").status, 1);
  const done = setupWith([finding("a", { disposition: "kept", answer: { reason: "on purpose", draft_sha256: "now" } })]);
  assert.equal(tri(done, "reply", "spec.md", "--draft", "draft.md").status, 0);
});

// ---- a sequential work ----------------------------------------------------------------------------

test("a sequence spec's triage reads its files with no --draft, and names the file and its line", () => {
  const d = tempDir("hs-triage-seq-");
  cpSync(join(ROOT, "examples", "writing"), d, { recursive: true });
  const item = finding("a", { evidence: "Seventy percent is a forgiving place to start." });
  writeFileSync(join(d, "course", "triage.jsonl"), `${JSON.stringify(item)}\n`);
  const r = cli(["triage", "status", "course.hyperspec.md"], { cwd: d });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const line = readFileSync(join(d, "course", "part-1.md"), "utf8").split("\n").findIndex((l) => l.includes("Seventy percent is a forgiving")) + 1;
  assert.ok(r.stdout.includes(`[station-triage-untriaged] a (skeptic, improve) is not answered: "finding a" (course/part-1.md line ${line})`), r.stdout);
  const c = cli(["check", "course.hyperspec.md", "--only", "triage", "--json"], { cwd: d });
  assert.deepEqual(JSON.parse(c.stdout).stations[0].findings.map((f) => [f.file, f.line]), [["course/part-1.md", line]]);
});
