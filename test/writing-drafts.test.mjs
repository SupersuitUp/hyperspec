import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tempDir } from "./tmp.mjs";
import { sha256 } from "../src/hash.mjs";
import { STATION_NAMES } from "../src/stations/index.mjs";

// The two worked examples ship with a draft each, written to their spec. `hyperspec check` has to
// pass both with no failing station, exactly as shipped, so the examples show a spec AND a draft
// that meets it. Every run here is against a copy: check appends to the spec's runs ledger, and a
// test must never write into the repo's examples.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BIN = join(ROOT, "bin", "hyperspec.mjs");
const BASE = join(ROOT, "examples", "writing");

const EXAMPLES = [
  {
    spec: "essay.hyperspec.md",
    draft: "essay/draft.md",
    ledger: "essay/runs.jsonl",
    // The essay names a scope folder, so dna measures it; it tells the author's own story in the
    // first person against goldens written in the second, and dna reports that drift as a warning.
    stations: { form: "pass", terms: "pass", claims: "pass", quotes: "pass", private: "pass", dna: "pass", links: "pass" },
  },
  {
    spec: "story.hyperspec.md",
    draft: "story/draft.md",
    ledger: "story/runs.jsonl",
    // The story keeps its goldens inline, with no scope folder, so there is nothing to measure
    // against; it is fiction, so its invented dialogue is not held to the marked quotes.
    stations: { form: "pass", terms: "pass", claims: "pass", quotes: "skip", private: "pass", dna: "skip", links: "pass" },
  },
];

const hyperspec = (args, cwd) => spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: "utf8" });

function copyOfExamples() {
  const d = tempDir("hs-writing-drafts-");
  cpSync(BASE, d, { recursive: true });
  return d;
}

const lines = (text) => text.split("\n").filter((l) => l.trim());

for (const ex of EXAMPLES) {
  test(`check passes ${ex.draft} against ${ex.spec}: exit 0, no failing station, no failing finding`, () => {
    const shippedLedger = readFileSync(join(BASE, ex.ledger), "utf8");
    const d = copyOfExamples();
    const r = hyperspec(["check", ex.spec, "--draft", ex.draft, "--json"], d);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const out = JSON.parse(r.stdout);
    assert.deepEqual(out.stations.map((s) => s.station), [...STATION_NAMES], "every registered station ran, in order");
    for (const s of out.stations) {
      assert.ok(["pass", "skip"].includes(s.status), `${s.station}: ${s.status} ${JSON.stringify(s.findings)}`);
      assert.deepEqual(s.findings.filter((f) => f.severity === "fail"), [], s.station);
      if (s.status === "skip") assert.ok(s.reason?.trim(), `${s.station} skips with a reason`);
    }
    assert.deepEqual(Object.fromEntries(out.stations.map((s) => [s.station, s.status])), ex.stations);
    assert.deepEqual(out.failing, []);
    // The run wrote into the copy, never into the repo.
    assert.equal(readFileSync(join(BASE, ex.ledger), "utf8"), shippedLedger, `${ex.ledger} in the repo is untouched`);
  });

  test(`check on ${ex.draft} appends one well-formed line to the copy's ledger, and the spec still lints 9/9`, () => {
    const d = copyOfExamples();
    const before = lines(readFileSync(join(d, ex.ledger), "utf8"));
    const r = hyperspec(["check", ex.spec, "--draft", ex.draft], d);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const after = lines(readFileSync(join(d, ex.ledger), "utf8"));
    assert.equal(after.length, before.length + 1, "exactly one line appended");
    assert.deepEqual(after.slice(0, before.length), before, "earlier lines are left as they were");
    const line = JSON.parse(after.at(-1));
    const { at, kind, draft, draft_sha256, stations, verdict, ...rest } = line;
    assert.ok(!Number.isNaN(Date.parse(at)) && new Date(at).toISOString() === at, `at is an ISO timestamp: ${at}`);
    assert.equal(kind, "check");
    assert.equal(draft, ex.draft, "the draft is recorded as given, never as an absolute path");
    assert.equal(draft_sha256, sha256(readFileSync(join(d, ex.draft))));
    assert.deepEqual(stations, ex.stations);
    assert.ok(["one-shot", "improved", "not-improved"].includes(verdict), verdict);
    if (verdict === "improved") assert.ok(rest.change?.trim());
    if (verdict === "not-improved") assert.ok(rest.reason?.trim());
    // The shipped ledger holds no check of this draft yet, so a first check of the copy is a one-shot.
    if (!before.some((l) => JSON.parse(l).draft_sha256 === draft_sha256)) assert.equal(verdict, "one-shot");
    assert.match(r.stdout, new RegExp(`^verdict: ${verdict}`, "m"));
    const lint = hyperspec(["lint", ex.spec, "--json"], d);
    assert.equal(lint.status, 0, lint.stdout + lint.stderr);
    assert.deepEqual(JSON.parse(lint.stdout).files[0].findings, [], "the appended line keeps test 9 clean");
  });
}

test("both specs declare audience.terms, so the terms station checks each draft rather than skipping", async () => {
  const { loadSpec } = await import("../src/load.mjs");
  for (const ex of EXAMPLES) {
    const terms = loadSpec(join(BASE, ex.spec)).data.writing.audience.terms;
    assert.ok(Array.isArray(terms) && terms.length >= 2, ex.spec);
    const text = readFileSync(join(BASE, ex.draft), "utf8").toLowerCase();
    for (const t of terms) assert.ok(text.includes(t.toLowerCase()), `${ex.draft} uses "${t}"`);
  }
});

test("each draft carries every required part of its spec as a heading", async () => {
  const { loadSpec } = await import("../src/load.mjs");
  for (const ex of EXAMPLES) {
    const parts = loadSpec(join(BASE, ex.spec)).data.writing.form.required_parts;
    const headings = readFileSync(join(BASE, ex.draft), "utf8").split("\n").filter((l) => /^#{1,6} /.test(l)).map((l) => l.replace(/^#+ /, "").trim().toLowerCase());
    for (const p of parts) assert.ok(headings.includes(p.toLowerCase()), `${ex.draft} has a heading "${p}"`);
  }
});

test("every claims ledger line cites a segment that exists in a marked material, never a private one", async () => {
  const { loadSpec } = await import("../src/load.mjs");
  const { readSegments } = await import("../src/segments.mjs");
  for (const ex of EXAMPLES) {
    const w = loadSpec(join(BASE, ex.spec)).data.writing;
    const segs = new Map(w.materials.items.map((it) => [it.id, readSegments(join(BASE, it.segments), {}).segments]));
    const claims = lines(readFileSync(join(BASE, w.sources.ledger), "utf8")).map((l) => JSON.parse(l));
    assert.ok(claims.length >= 5, `${w.sources.ledger} lists the draft's claims`);
    for (const c of claims) {
      const [mid, sid] = c.source.split("#");
      const seg = segs.get(mid)?.find((s) => s.id === sid);
      assert.ok(seg, `${w.sources.ledger}: "${c.source}" resolves to a segment`);
      assert.notEqual(seg.label, "private", c.source);
      // The span is the source's own words, so a reader can find the claim's support without the segment id.
      assert.ok(seg.text.replace(/\s+/g, " ").includes(c.span), `${c.source}: span is the segment's own text`);
    }
  }
});

test("the story's dialogue is in quotation marks and quotes skips it as fiction, while the essay's quote is checked and attributed", () => {
  const d = copyOfExamples();
  const story = JSON.parse(hyperspec(["check", "story.hyperspec.md", "--draft", "story/draft.md", "--json", "--only", "quotes"], d).stdout).stations[0];
  assert.equal(story.status, "skip");
  assert.match(story.reason, /fiction/);
  assert.ok((readFileSync(join(BASE, "story", "draft.md"), "utf8").match(/"/g) ?? []).length >= 20, "the story has quoted dialogue to skip");
  // The essay names its quote's speaker by first name, so attribution is exercised, and passes.
  const essay = readFileSync(join(BASE, "essay", "draft.md"), "utf8");
  assert.match(essay, /Dana, the engineering manager I interviewed,\s+puts it in three short sentences: "Wait\./);
});

test("the essay's draft carries a relative link to a real file, so links checks something on the shipped example", () => {
  const essay = readFileSync(join(BASE, "essay", "draft.md"), "utf8");
  const links = [...essay.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]).filter((u) => !/^[a-z]+:/i.test(u));
  assert.ok(links.length >= 1);
  for (const l of links) assert.ok(statSync(join(BASE, "essay", l)).isFile(), l);
});
