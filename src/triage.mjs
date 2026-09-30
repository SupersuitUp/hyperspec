// Triage (hyperspec 0.9): every finding a reader raised about a draft, answered, and every answer
// held to the draft as it is now. A panel verdict (src/judges/panel.mjs) and an outside review
// brought in with `triage import` both land here as findings; the operator, or their agent, answers
// each one with `triage answer`; `check`'s triage station fails while a finding is unanswered or
// an answer's evidence is no longer in the draft; `triage reply` turns the answers into a reply to
// the reviewer, which hyperspec prints and never sends.
//
// The file is triage.jsonl beside the spec's runs ledger (improvement.ledger), one finding per line:
//
//   { finding_id, source, reader, kind, text, evidence, draft_sha256, disposition, answer }
//
// source is "panel" or where an imported review came from; reader is the panel reader's id or the
// review's heading (null when it has none); kind is improve, missing, remove, or note for an
// imported item under no such label; evidence is the passage of the draft the finding is about (null
// when an imported item quotes none that is in the draft); draft_sha256 is the draft it was raised
// against. disposition is null until answered, then one of:
//
//   taken         the draft now does what the finding asked; answer.evidence quotes where
//   kept          the passage stays as it is on purpose; answer.reason says why
//   already-true  the draft already did it; answer.evidence quotes where
//   open          a decision for the operator; answer.reason may say what is to decide
//
// answer is { evidence?, reason?, draft_sha256, at }. Evidence follows src/evidence.mjs's rule, the
// one `judge record` holds a judge's quotes to.

import { existsSync, readFileSync } from "node:fs";
import { posix, resolve } from "node:path";
import { sha256 } from "./hash.mjs";
import { insideDir, writeFileAtomic } from "./fsutil.mjs";
import { evidenceLocator, evidenceProblem, evidenceWords, MIN_EVIDENCE_WORDS } from "./evidence.mjs";
import { maskCode, truncate } from "./stations/util.mjs";
import { str } from "./placeholder.mjs";
import { readDraft } from "./draft.mjs";
import { readSequenceDraft, sequenceFilesDecl } from "./sequence-draft.mjs";
import { loadSpec } from "./load.mjs";

export const TRIAGE_FILE = "triage.jsonl";
export const DISPOSITIONS = Object.freeze(["taken", "kept", "already-true", "open"]);
const KEY_ORDER = ["finding_id", "source", "reader", "kind", "text", "evidence", "draft_sha256", "disposition", "answer"];
const present = (v) => typeof v === "string" && v.trim().length > 0;
const isObject = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);

// The spec's triage file: { decl, abs }, decl the path relative to the spec's folder (what every
// message names), or { warning } when it would sit outside the spec's folder, or null when the spec
// declares no runs ledger to sit beside.
export function openTriage(spec) {
  const ledger = str(spec?.data?.improvement?.ledger);
  if (!ledger) return null;
  const decl = posix.join(posix.dirname(ledger.replace(/\\/g, "/")), TRIAGE_FILE);
  if (!insideDir(spec.dir, decl)) return { warning: "the triage file, beside improvement.ledger, would sit outside the spec's directory; not written" };
  return { decl, abs: resolve(spec.dir, decl) };
}

// { exists, entries }: every line of the file in order, each { item } (a finding) or { raw, line }
// (a line that is not one, kept so a rewrite never drops it).
export function readTriage(abs) {
  if (!existsSync(abs)) return { exists: false, entries: [] };
  const entries = [];
  readFileSync(abs, "utf8").split("\n").forEach((raw, i) => {
    if (!raw.trim()) return;
    let v = null;
    try { v = JSON.parse(raw); } catch { /* not JSON */ }
    if (isObject(v) && present(v.finding_id) && present(v.text)) entries.push({ item: v });
    else entries.push({ raw, line: i + 1 });
  });
  return { exists: true, entries };
}

const ordered = (item) => {
  const out = {};
  for (const k of KEY_ORDER) out[k] = item[k] ?? null;
  for (const k of Object.keys(item)) if (!(k in out)) out[k] = item[k];
  return out;
};

export function writeTriage(abs, entries) {
  writeFileAtomic(abs, entries.map((e) => (e.item ? JSON.stringify(ordered(e.item)) : e.raw)).join("\n") + (entries.length ? "\n" : ""));
}

// A finding's id: the prefix, then eight hex characters of a hash of what it says, so the same
// finding recorded twice is one finding.
export const findingId = (prefix, parts) => `${prefix}-${sha256(JSON.stringify(parts)).slice(0, 8)}`;

// Adds findings ({ kind, text, evidence }) to the spec's triage file, each once. Returns { decl,
// added, already } or { warning }.
export function addFindings(spec, found, { source, reader, draftSha, idPrefix }) {
  const t = openTriage(spec);
  if (!t) return { warning: "the spec declares no improvement.ledger, so there is no triage file to write" };
  if (t.warning) return t;
  const { entries } = readTriage(t.abs);
  const have = new Set(entries.filter((e) => e.item).map((e) => e.item.finding_id));
  let added = 0;
  let already = 0;
  for (const f of found) {
    const id = findingId(idPrefix, [source, reader, f.kind, f.text, f.evidence ?? null]);
    if (have.has(id)) { already++; continue; }
    have.add(id);
    entries.push({ item: { finding_id: id, source, reader: reader ?? null, kind: f.kind, text: f.text, evidence: f.evidence ?? null, draft_sha256: draftSha, disposition: null, answer: null } });
    added++;
  }
  if (added) writeTriage(t.abs, entries);
  return { decl: t.decl, added, already };
}

// The spec and the draft a triage command works against, found the way `check` finds them: --draft
// names one file, and without it a spec that lists writing.form.sequence.files is its files joined
// in reading order. { spec, draft } or { usage, error }.
export function triageContext(specPathArg, draftPathArg, command) {
  if (!present(specPathArg)) return { usage: true, error: `${command} needs a spec path` };
  // check.mjs's loadWritingSpec, inlined: check.mjs loads the station registry, which loads this
  // module's station, so importing it here would be a cycle.
  const spec = loadSpec(specPathArg);
  if (spec.error) return { usage: true, error: spec.error };
  if (str(spec.data?.profile) !== "writing") return { usage: true, error: `${command} needs a writing spec (profile: writing)` };
  if (present(draftPathArg)) {
    const draft = readDraft(draftPathArg);
    return draft ? { spec, draft } : { usage: true, error: `cannot read draft: ${draftPathArg}` };
  }
  if (!sequenceFilesDecl(spec).length) return { usage: true, error: `${command} needs --draft <file>` };
  const draft = readSequenceDraft(spec, specPathArg);
  return draft ? { spec, draft } : { usage: true, error: `writing.form.sequence.files matches no file: ${sequenceFilesDecl(spec).join(", ")}` };
}

// ---- the state of a triage file against a draft -------------------------------------------------

const who = (item) => (present(item.reader) ? item.reader : present(item.source) ? item.source : "a reader");
const label = (item) => `${item.finding_id} (${who(item)}, ${item.kind ?? "note"})`;

// Everything check's triage station and `triage status` report, from the file and the draft:
// { decl, exists, items, counts, findings, shared }. findings are station findings (station
// "triage"); shared lists the passages two or more readers raised findings about.
export function triageState(spec, draft) {
  const t = openTriage(spec);
  if (!t) return { skip: "the spec declares no improvement.ledger, so it has no triage file" };
  if (t.warning) return { skip: t.warning };
  const { exists, entries } = readTriage(t.abs);
  if (!exists) return { decl: t.decl, exists: false, skip: `no triage file at ${t.decl} yet; a recorded panel verdict or a triage import starts one` };

  const locate = evidenceLocator(draft.text);
  const findings = [];
  const finding = (id, severity, message, fix, line) => ({ station: "triage", id, severity, ...(line ? { line } : {}), message, fix });
  const items = entries.filter((e) => e.item).map((e) => e.item);
  const counts = { taken: 0, kept: 0, "already-true": 0, open: 0, unanswered: 0 };

  for (const e of entries.filter((x) => !x.item)) {
    findings.push(finding("station-triage-unreadable", "fail", `${t.decl} line ${e.line} is not a finding: not JSON, or no finding_id or text`, "Fix or remove the line; every line is one finding hyperspec wrote."));
  }
  for (const item of items) {
    const at = present(item.evidence) ? locate(item.evidence)?.line : undefined;
    const d = item.disposition;
    if (d === null || d === undefined || d === "") {
      counts.unanswered++;
      findings.push(finding("station-triage-untriaged", "fail", `${label(item)} is not answered: "${truncate(item.text, 80)}"`, `Answer it: hyperspec triage answer <spec> ${item.finding_id} taken|kept|already-true|open, with --evidence or --reason.`, at));
      continue;
    }
    if (!DISPOSITIONS.includes(d)) {
      findings.push(finding("station-triage-disposition", "fail", `${label(item)} has disposition "${truncate(String(d), 40)}", which is not taken, kept, already-true or open`, "Answer it again with triage answer."));
      continue;
    }
    counts[d]++;
    const answer = isObject(item.answer) ? item.answer : {};
    if (d === "taken" || d === "already-true") {
      const problem = evidenceProblem(locate, answer.evidence);
      if (problem === "missing" || problem === "too-short") {
        findings.push(finding("station-triage-evidence-missing", "fail", `${label(item)} is ${d}, and its answer quotes no passage of at least ${MIN_EVIDENCE_WORDS} words`, `Answer it again with --evidence: the passage of the draft that ${d === "taken" ? "now does" : "already did"} what it asked.`, at));
      } else if (problem === "not-found") {
        findings.push(finding("station-triage-evidence-not-found", "fail", `${label(item)} is ${d}, and its evidence is not in the draft: "${truncate(answer.evidence, 80)}"`, "The passage changed or went: answer the finding again, quoting the draft as it is now.", at));
      }
    }
    if (d === "kept" && !present(answer.reason)) {
      findings.push(finding("station-triage-reason-missing", "fail", `${label(item)} is kept, and its answer gives no reason`, "Answer it again with --reason: why the passage stays as it is.", at));
    }
    if (d === "open") {
      findings.push(finding("station-triage-open", "warn", `${label(item)} is open: "${truncate(item.text, 80)}"${present(answer.reason) ? ` (${truncate(answer.reason, 80)})` : ""}`, "A decision for the operator; answer it once it is made.", at));
    }
    // An answer that keeps a passage, or leaves it open, was about that passage: when the passage
    // is no longer in the draft, the answer is about a draft that is gone.
    if ((d === "kept" || d === "open") && present(item.evidence) && !at && present(answer.draft_sha256) && answer.draft_sha256 !== draft.sha256) {
      findings.push(finding("station-triage-stale", "warn", `${label(item)} was answered ${d} about a passage that is no longer in the draft: "${truncate(item.evidence, 80)}"`, "Read the answer again against the draft as it is now, and answer the finding again if it no longer holds."));
    }
  }
  return { decl: t.decl, exists: true, items, counts, findings, shared: sharedPassages(items, locate, draft.text) };
}

// The synthesis: every passage of the draft that findings from two or more readers point at, where
// two findings share a passage when their evidence overlaps in the draft. It groups by where, never
// by meaning: two readers who say the same thing about different passages are not grouped.
export function sharedPassages(items, locate, text) {
  const placed = items
    .filter((i) => present(i.evidence))
    .map((i) => ({ item: i, at: locate(i.evidence) }))
    .filter((x) => x.at)
    .sort((a, b) => a.at.start - b.at.start || a.at.end - b.at.end);
  const groups = [];
  for (const p of placed) {
    const g = groups.at(-1);
    if (g && p.at.start < g.end) { g.members.push(p); g.end = Math.max(g.end, p.at.end); }
    else groups.push({ start: p.at.start, end: p.at.end, line: p.at.line, members: [p] });
  }
  return groups
    .filter((g) => new Set(g.members.map((m) => `${m.item.source}\u0000${m.item.reader}`)).size >= 2)
    .map((g) => ({
      line: g.line,
      passage: truncate(text.slice(g.start, g.end).replace(/\s+/g, " "), 80),
      findings: g.members.map((m) => ({ finding_id: m.item.finding_id, reader: who(m.item), kind: m.item.kind, text: m.item.text })),
    }));
}

// ---- answering ----------------------------------------------------------------------------------

// Records one answer. Returns { usage, error } for a usage problem (exit 2), { invalid, findings }
// when the answer does not hold (exit 1, nothing written), or { ok, item } (exit 0).
export function answerFinding(spec, draft, findingIdArg, disposition, { evidence, reason } = {}) {
  if (!present(findingIdArg)) return { usage: true, error: "triage answer needs a finding id" };
  if (!DISPOSITIONS.includes(disposition)) return { usage: true, error: `triage answer needs a disposition: ${DISPOSITIONS.join(", ")}` };
  const t = openTriage(spec);
  if (!t || t.warning) return { usage: true, error: t?.warning ?? "the spec declares no improvement.ledger, so it has no triage file" };
  const { exists, entries } = readTriage(t.abs);
  if (!exists) return { usage: true, error: `no triage file yet: ${t.decl}` };
  const entry = entries.find((e) => e.item?.finding_id === findingIdArg);
  if (!entry) return { usage: true, error: `no finding ${findingIdArg} in ${t.decl}` };

  const refuse = (id, message, fix) => ({ invalid: true, findings: [{ station: "triage", id, severity: "fail", message, fix }], code: 1 });
  if (disposition === "taken" || disposition === "already-true") {
    const problem = evidenceProblem(evidenceLocator(draft.text), evidence);
    const where = disposition === "taken" ? "now does" : "already did";
    if (problem === "missing") return refuse("triage-evidence-missing", `a ${disposition} answer needs --evidence`, `Quote the passage of the draft that ${where} what the finding asked.`);
    if (problem === "too-short") return refuse("triage-evidence-too-short", `--evidence has ${evidenceWords(evidence)} words, fewer than ${MIN_EVIDENCE_WORDS}: "${truncate(evidence, 80)}"`, "Quote the sentence or clause itself, at least three words, verbatim.");
    if (problem === "not-found") return refuse("triage-evidence-not-found", `--evidence is not in the draft: "${truncate(evidence, 80)}"`, "Copy it verbatim from the draft as it is now, whole words only; only whitespace and quote characters may differ.");
  }
  if (disposition === "kept" && !present(reason)) return refuse("triage-reason-missing", "a kept answer needs --reason", "Say why the passage stays as it is.");

  const answer = {
    ...(present(evidence) ? { evidence } : {}),
    ...(present(reason) ? { reason: reason.trim() } : {}),
    draft_sha256: draft.sha256,
    at: new Date().toISOString(),
  };
  entry.item = { ...entry.item, disposition, answer };
  writeTriage(t.abs, entries);
  return { ok: true, path: t.decl, item: ordered(entry.item), code: 0 };
}

// ---- importing an outside review ----------------------------------------------------------------

const KIND_WORDS = new Map([["good", "good"], ["improve", "improve"], ["improvement", "improve"], ["improvements", "improve"], ["missing", "missing"], ["remove", "remove"]]);

// The kind a label names ("Good", "What to improve" does not; "Improve:" does), or null.
function kindOf(label) {
  const first = String(label).toLowerCase().replace(/[*_`#:]/g, " ").trim().split(/\s+/)[0] ?? "";
  return KIND_WORDS.get(first) ?? null;
}

const ATX = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t#]*$/;
const LIST = /^( {0,3})([-*+]|\d+[.)])[ \t]+(.*)$/;
const BOLD_LABEL = /^[ \t]*(?:\*\*([^*]+?)\*\*|__([^_]+?)__)[ \t]*:?[ \t]*(.*)$/;
const PLAIN_LABEL = /^[ \t]*([A-Za-z]+)[ \t]*:[ \t]*(.*)$/;

// A label at the start of `text`: bold ("**Improve:**", "**Missing**") or a plain word with a colon
// ("Remove: ..."), naming one of the four kinds. { kind, rest } or null.
function labelAt(text) {
  const b = BOLD_LABEL.exec(text);
  if (b && kindOf(b[1] ?? b[2])) return { kind: kindOf(b[1] ?? b[2]), rest: b[3].trim() };
  const p = PLAIN_LABEL.exec(text);
  if (p && kindOf(p[1])) return { kind: kindOf(p[1]), rest: p[2].trim() };
  return null;
}
const QUOTED = /"([^"\n]+)"|“([^“”\n]+)”/g;

// The findings in a review's text: [{ reader, kind, text, quotes }], plus how many "good" items were
// left out. See WRITING.md, Importing an outside review, for the reading rules.
export function parseReview(text) {
  const body = String(text).replace(/^﻿/, "").replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, (fm) => fm.replace(/[^\n]/g, ""));
  const lines = maskCode(body).split("\n").map((l) => l.replace(/\r$/, ""));
  const out = [];
  let praise = 0;
  let reader = null;
  let kind = null;
  let cur = null;
  const flush = () => {
    if (!cur) return;
    const t = cur.lines.join(" ").replace(/\s+/g, " ").trim();
    const { kind: k, blockquotes } = cur;
    cur = null;
    if (!t) return;
    if (k === "good") { praise++; return; }
    const quotes = [...t.matchAll(QUOTED)].map((m) => m[1] ?? m[2]).concat(blockquotes);
    out.push({ reader, kind: k ?? "note", text: t, quotes });
  };
  const start = (first, isList, k = kind) => { cur = { kind: k, isList, lines: [first], blockquotes: [] }; };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) {
      // A list item runs on across a blank line only into an indented continuation.
      const next = lines.slice(i + 1).find((l) => l.trim());
      if (!(cur?.isList && next && /^[ \t]{2,}\S/.test(next) && !LIST.test(next))) flush();
      continue;
    }
    const h = ATX.exec(line);
    if (h) {
      flush();
      const text = h[2].replace(/[*_`]/g, "").trim();
      const k = kindOf(text);
      if (k) kind = k;
      else { reader = text || null; kind = null; }
      continue;
    }
    const li = LIST.exec(line);
    const lab = li ? null : labelAt(line);
    if (lab) {
      // A label line sets the kind for what follows; text after it on the line is a finding.
      flush();
      kind = lab.kind;
      if (lab.rest) start(lab.rest, false);
      continue;
    }
    if (li) {
      flush();
      const inner = labelAt(li[3]);
      // "- Remove: ..." is one finding of that kind; the list's kind is unchanged.
      if (inner && inner.rest) start(inner.rest, true, inner.kind);
      else start(li[3], true);
      continue;
    }
    if (cur) {
      // A quotation block inside a finding is a passage it quotes.
      const bq = /^[ \t]*>[ \t]?(.*)$/.exec(line);
      if (bq) { cur.blockquotes.push(bq[1].replace(/^["“]|["”]$/g, "").trim()); cur.lines.push(bq[1].trim()); continue; }
      cur.lines.push(line.trim());
      continue;
    }
    // A paragraph under a kind is one finding; prose under no kind (an introduction) is not.
    if (kind) start(line.trim(), false);
  }
  flush();
  return { findings: out, praise };
}

// Brings an outside review in as findings. Returns { ok, path, source, added, already, praise,
// warnings } or { usage, error } / { invalid, findings } when the review holds no finding.
export function importReview(spec, draft, reviewText, source) {
  const t = openTriage(spec);
  if (!t || t.warning) return { usage: true, error: t?.warning ?? "the spec declares no improvement.ledger, so it has no triage file" };
  const { findings, praise } = parseReview(reviewText);
  if (!findings.length) {
    return { invalid: true, findings: [{ station: "triage", id: "triage-import-empty", severity: "fail", message: `the review holds no finding to answer${praise ? ` (only ${praise} item${praise === 1 ? "" : "s"} of praise)` : ""}`, fix: "Import a review whose points are list items or paragraphs under Improve, Missing or Remove, or under a reader's heading." }], code: 1 };
  }
  const locate = evidenceLocator(draft.text);
  const warnings = [];
  const found = findings.map((f) => {
    const quotes = f.quotes.filter((q) => evidenceWords(q) >= MIN_EVIDENCE_WORDS);
    const evidence = quotes.find((q) => locate(q)) ?? null;
    if (quotes.length && !evidence) {
      warnings.push({ station: "triage", id: "triage-import-quote-not-found", severity: "warn", message: `a finding quotes text that is not in the current draft: "${truncate(quotes[0], 80)}" (${truncate(f.text, 60)})`, fix: "The review may have read another copy of the draft. Check the finding against the draft as it is now before answering it." });
    }
    return { kind: f.kind, text: f.text, evidence, reader: f.reader };
  });
  // One addFindings call per reader, so each finding records its reader.
  let added = 0;
  let already = 0;
  const readers = [...new Set(found.map((f) => f.reader))];
  for (const reader of readers) {
    const r = addFindings(spec, found.filter((f) => f.reader === reader), { source, reader, draftSha: draft.sha256, idPrefix: "import" });
    if (r.warning) return { usage: true, error: r.warning };
    added += r.added;
    already += r.already;
  }
  return { ok: true, path: t.decl, source, added, already, praise, warnings, code: 0 };
}

// ---- the reply ----------------------------------------------------------------------------------

const SECTIONS = [
  ["taken", "Taken"],
  ["kept", "Kept as it is"],
  ["already-true", "Already in the draft"],
  ["open", "Still open"],
];

// The reply to the reviewer, as plain text: what was taken, what was kept and why, what was already
// there, what is still open, and anything not answered yet. source limits it to one review.
export function replyText(items, source) {
  const mine = items.filter((i) => !source || i.source === source);
  const line = (i) => {
    const a = isObject(i.answer) ? i.answer : {};
    const lead = `- ${present(i.reader) ? `${i.reader}: ` : ""}${i.text.trim()}`;
    if (i.disposition === "taken") return `${lead} Now in the draft: "${a.evidence}"`;
    if (i.disposition === "kept") return `${lead} Why: ${a.reason}`;
    if (i.disposition === "already-true") return `${lead} It is here: "${a.evidence}"`;
    if (i.disposition === "open") return `${lead}${present(a.reason) ? ` To decide: ${a.reason}` : ""}`;
    return lead;
  };
  const parts = ["Thank you for the review. Here is what happened to each point."];
  for (const [d, heading] of SECTIONS) {
    const these = mine.filter((i) => i.disposition === d);
    if (these.length) parts.push(`${heading}:\n${these.map(line).join("\n")}`);
  }
  const unanswered = mine.filter((i) => !DISPOSITIONS.includes(i.disposition));
  if (unanswered.length) parts.push(`Not answered yet:\n${unanswered.map(line).join("\n")}`);
  return { text: `${parts.join("\n\n")}\n`, count: mine.length, unanswered: unanswered.length };
}
