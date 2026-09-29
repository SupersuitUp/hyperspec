// `hyperspec judge prepare` and `hyperspec judge record`: judgment stations as packets. hyperspec
// never calls a model. For each judgment station, `prepare` writes a PACKET: everything a judge
// needs (the rubric from the spec, fixed instructions, the inputs, the exact verdict shape). An
// outside judge, a person or a model, fills a VERDICT file. `record` validates the verdict,
// including that every evidence span it cites really appears in the draft, derives the station's
// status deterministically, and appends one line to the spec's runs ledger, under the same truth
// rules `check` follows (src/ledger.mjs).
//
// This module is the commands' logic; bin/hyperspec.mjs owns argv parsing and printing, the split
// src/check.mjs keeps too. Each station lives in src/judges/ and is registered in its index.

import { appendFileSync, existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { sha256 } from "./hash.mjs";
import { writeFileAtomic } from "./fsutil.mjs";
import { readDraft } from "./draft.mjs";
import { loadWritingSpec, lintBlock, withoutAbsolutePaths } from "./check.mjs";
import { openLedger, priorLines, ledgerDraftKey, ledgerVerdict } from "./ledger.mjs";
import { lineAt, truncate } from "./stations/util.mjs";
import { JUDGES, JUDGE_NAMES } from "./judges/index.mjs";

export const PACKET_VERSION = "0.1";

const present = (v) => typeof v === "string" && v.trim().length > 0;

// ---- the evidence rule -------------------------------------------------------------------------
// A span of evidence counts as quoted from the draft when, after both are normalized, the draft
// contains it. Normalization collapses every run of whitespace (spaces, tabs, line breaks, CRLF) to
// one space and turns curly, low and angle quotation marks and apostrophes into their straight
// forms (primes are not quotation marks and are left alone), so a judge that reflows a quotation or
// types typographic quotes is still quoting; changing a single word is not.
//
// A span must also carry at least MIN_EVIDENCE_WORDS word tokens (runs of letters and digits), and
// match on word boundaries: a match may not start or end in the middle of a word. A one-letter or
// one-word "quotation" is found almost anywhere and so checks nothing.

export const MIN_EVIDENCE_WORDS = 3;
const WORD_CHAR = /[\p{L}\p{N}]/u;
const WORD_TOKENS = /[\p{L}\p{N}]+/gu;

const QUOTE_CHARS = new Map([
  ["\u2018", "'"], ["\u2019", "'"], ["\u201A", "'"], ["\u201B", "'"], ["\u2039", "'"], ["\u203A", "'"],
  ["\u201C", '"'], ["\u201D", '"'], ["\u201E", '"'], ["\u201F", '"'], ["\u00AB", '"'], ["\u00BB", '"'],
]);

// { norm, map }: the normalized text, and for each of its characters the offset in `text` it came
// from, so a match in the normalized text can be traced back to a line of the original.
export function normalizeForEvidence(text) {
  let norm = "";
  const map = [];
  let pendingSpace = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (/\s/.test(ch)) { if (norm && pendingSpace < 0) pendingSpace = i; continue; }
    if (pendingSpace >= 0) { norm += " "; map.push(pendingSpace); pendingSpace = -1; }
    norm += QUOTE_CHARS.get(ch) ?? ch;
    map.push(i);
  }
  return { norm, map };
}

// The helpers a station's validate() and derive() receive, bound to one packet and one draft: every
// finding they build has the same shape as a `check` finding ({ station, id, severity, message,
// fix, line? }).
function toolsFor(stationName, draft) {
  const { norm, map } = normalizeForEvidence(draft.text);
  // The 1-based line of the first whole-word match of `span`, or -1.
  const locate = (span) => {
    const needle = normalizeForEvidence(span).norm;
    if (!needle) return -1;
    const startsWord = WORD_CHAR.test(needle[0]);
    const endsWord = WORD_CHAR.test(needle[needle.length - 1]);
    for (let at = norm.indexOf(needle); at >= 0; at = norm.indexOf(needle, at + 1)) {
      const before = at > 0 ? norm[at - 1] : "";
      const after = norm[at + needle.length] ?? "";
      if (startsWord && before && WORD_CHAR.test(before)) continue;
      if (endsWord && after && WORD_CHAR.test(after)) continue;
      return lineAt(draft.text, map[at]);
    }
    return -1;
  };
  const finding = (id, message, fix, line) => ({ station: stationName, id, severity: "fail", message, fix, ...(typeof line === "number" && line > 0 ? { line } : {}) });
  return {
    finding,
    shape: (message, fix) => finding("judge-verdict-shape", message, fix),
    // [] when `value` is a non-empty span found in the draft, else the one finding saying why.
    evidence(value, where) {
      if (typeof value !== "string" || !value.trim()) {
        return [finding("judge-evidence-missing", `${where} is empty or not a string`, "Quote the span of the draft this judgment rests on, verbatim.")];
      }
      const words = (normalizeForEvidence(value).norm.match(WORD_TOKENS) ?? []).length;
      if (words < MIN_EVIDENCE_WORDS) {
        return [finding("judge-evidence-too-short", `${where} has ${words} word${words === 1 ? "" : "s"}, fewer than ${MIN_EVIDENCE_WORDS}: "${truncate(value, 80)}"`, `Quote the sentence or clause the judgment rests on, at least ${MIN_EVIDENCE_WORDS} words, verbatim.`)];
      }
      if (locate(value) < 0) {
        return [finding("judge-evidence-not-found", `${where} is not in the draft: "${truncate(value, 80)}"`, "Copy the evidence verbatim from the draft, whole words only; only whitespace and quote characters may differ.")];
      }
      return [];
    },
    // The 1-based draft line where a (valid) evidence span starts, or undefined.
    lineOf(span) {
      const line = typeof span === "string" ? locate(span) : -1;
      return line > 0 ? line : undefined;
    },
  };
}

const packetJson = (packet) => `${JSON.stringify(packet, null, 2)}\n`;

// The packet one judge gets for this spec and draft, built the one way both commands build it:
// prepare writes it, and record rebuilds it to check the file it was handed. { packet, packetBytes,
// key }: key is the station's hidden answer key (null for a station with none), written by prepare
// to <station>.key.json for a person to read, and never read back as truth: record rebuilds it.
// specPathArg and the draft's path are the strings as given, so the bytes are deterministic.
export function buildPacket(judge, specPathArg, spec, draft, specSha) {
  const parts = judge.packet(spec, draft);
  const packet = {
    hyperspec_judge: PACKET_VERSION,
    station: judge.name,
    spec: specPathArg,
    spec_sha256: specSha,
    draft: draft.path,
    draft_sha256: draft.sha256,
    rubric: parts.rubric,
    instructions: judge.instructions,
    inputs: parts.inputs,
    verdict_schema: parts.verdict_schema,
  };
  return { packet, packetBytes: packetJson(packet), key: parts.key ?? null };
}

// ---- prepare -----------------------------------------------------------------------------------

// prepareJudges(specPathArg, draftPathArg, outDirArg, { only, force }): writes one
// <station>.packet.json (plus <station>.key.json where a station has a hidden answer key) per
// applicable station into outDirArg. Paths are kept as given, so the same spec and draft produce
// byte-identical packets. Refuses (usage) to overwrite an existing file without force, naming every
// one, and writes nothing in that case.
export function prepareJudges(specPathArg, draftPathArg, outDirArg, { only, force = false } = {}) {
  if (!present(specPathArg)) return { usage: true, error: "judge prepare needs a spec path" };
  if (!present(draftPathArg)) return { usage: true, error: "judge prepare needs --draft <file>" };
  if (!present(outDirArg)) return { usage: true, error: "judge prepare needs --out <dir>" };

  const loaded = loadWritingSpec(specPathArg, "judge prepare");
  if (loaded.usage) return loaded;
  const { spec } = loaded;

  let judges = JUDGES;
  if (only && only.length) {
    const unknown = only.filter((n) => !JUDGE_NAMES.includes(n));
    if (unknown.length) {
      return { usage: true, error: `unknown judge${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}; known judges: ${JUDGE_NAMES.join(", ")}` };
    }
    judges = JUDGES.filter((j) => only.includes(j.name));
  }

  let outStat = null;
  try { outStat = statSync(resolve(outDirArg)); } catch { /* reported below */ }
  if (!outStat) return { usage: true, error: `--out folder does not exist: ${outDirArg}; create it first` };
  if (!outStat.isDirectory()) return { usage: true, error: `--out is not a folder: ${outDirArg}` };

  const blocked = lintBlock(spec, specPathArg);
  if (blocked) return blocked;

  const draft = readDraft(draftPathArg);
  if (!draft) return { usage: true, error: `cannot read draft: ${draftPathArg}` };
  const specSha = sha256(readFileSync(resolve(specPathArg)));

  const files = [];
  const skipped = [];
  const crashed = [];
  for (const judge of judges) {
    const reason = judge.skipReason(spec);
    if (reason) { skipped.push({ station: judge.name, reason }); continue; }
    let built;
    try { built = buildPacket(judge, specPathArg, spec, draft, specSha); }
    catch (e) {
      crashed.push({ station: judge.name, id: `judge-${judge.name}-crashed`, severity: "fail", message: withoutAbsolutePaths(e instanceof Error ? e.message : String(e)), fix: "Fix the station or file an issue; it should never throw." });
      continue;
    }
    files.push({ station: judge.name, path: join(outDirArg, `${judge.name}.packet.json`), bytes: built.packetBytes });
    if (built.key) files.push({ station: judge.name, path: join(outDirArg, `${judge.name}.key.json`), bytes: packetJson(built.key) });
  }

  const existing = files.filter((f) => existsSync(resolve(f.path))).map((f) => f.path);
  if (existing.length && !force) {
    return { usage: true, error: `refusing to overwrite ${existing.join(", ")}; pass --force to replace ${existing.length > 1 ? "them" : "it"}` };
  }
  for (const f of files) writeFileAtomic(resolve(f.path), f.bytes);

  return {
    ok: true,
    specPath: specPathArg,
    draftPath: draftPathArg,
    draftSha256: draft.sha256,
    written: files.map((f) => ({ station: f.station, path: f.path })),
    skipped,
    crashed,
    code: crashed.length ? 1 : 0,
  };
}

// ---- record ------------------------------------------------------------------------------------

// recordJudgment(packetPathArg, verdictPathArg): validates the verdict against its packet and, when
// it is valid, derives the station's status and appends one ledger line. Returns a usage result
// (exit 2), { stale } or { invalid } (exit 1, nothing appended), or the recorded result (exit 0 when
// the station passes, 1 when it fails).
export function recordJudgment(packetPathArg, verdictPathArg) {
  if (!present(packetPathArg)) return { usage: true, error: "judge record needs a packet path" };
  if (!present(verdictPathArg)) return { usage: true, error: "judge record needs --verdict <file>" };

  let packetText;
  try { packetText = readFileSync(resolve(packetPathArg), "utf8"); }
  catch { return { usage: true, error: `cannot read packet: ${packetPathArg}` }; }
  let packet;
  try { packet = JSON.parse(packetText); } catch { packet = null; }
  if (!packet || typeof packet !== "object" || packet.hyperspec_judge !== PACKET_VERSION || !present(packet.station) || !present(packet.spec) || !present(packet.draft)) {
    return { usage: true, error: `not a hyperspec judge packet: ${packetPathArg}` };
  }
  const judge = JUDGES.find((j) => j.name === packet.station);
  if (!judge) return { usage: true, error: `the packet names an unknown judge: ${packet.station}; known judges: ${JUDGE_NAMES.join(", ")}` };

  let verdictBuf;
  try { verdictBuf = readFileSync(resolve(verdictPathArg)); }
  catch { return { usage: true, error: `cannot read verdict: ${verdictPathArg}` }; }

  const loaded = loadWritingSpec(packet.spec, "judge record");
  if (loaded.usage) return { usage: true, error: `the packet's spec: ${loaded.error}` };
  const { spec } = loaded;
  const draft = readDraft(packet.draft);
  if (!draft) return { usage: true, error: `cannot read the packet's draft: ${packet.draft}` };

  const base = { packetPath: packetPathArg, verdictPath: verdictPathArg, station: judge.name };
  const t = toolsFor(judge.name, draft);

  // A verdict on bytes other than the ones the packet was prepared from judges nothing that exists.
  const specSha = sha256(readFileSync(resolve(packet.spec)));
  const draftChanged = draft.sha256 !== packet.draft_sha256;
  const specChanged = specSha !== packet.spec_sha256;
  if (draftChanged || specChanged) {
    const what = draftChanged && specChanged ? "the spec and the draft" : specChanged ? "the spec" : "the draft";
    return { ...base, ok: false, stale: true, findings: [t.finding("judge-stale", `${what} changed since the packet was prepared`, "Run judge prepare again (with --force) and judge the new packet.")], code: 1 };
  }

  // record never trusts the packet file: it rebuilds the packet (and any answer key) from the spec
  // and draft on disk, requires the file to be those exact bytes, and validates the verdict against
  // the rebuilt copy only. A packet edited after prepare (its conditions, its inputs, a hash made to
  // match a changed draft) is refused here.
  const skip = judge.skipReason(spec);
  let rebuilt = null;
  if (!skip) {
    try { rebuilt = buildPacket(judge, packet.spec, spec, draft, specSha); }
    catch (e) {
      return { ...base, ok: false, invalid: true, findings: [t.finding(`judge-${judge.name}-crashed`, withoutAbsolutePaths(e instanceof Error ? e.message : String(e)), "Fix the station or file an issue; it should never throw.")], code: 1 };
    }
  }
  if (!rebuilt || rebuilt.packetBytes !== packetText) {
    const why = rebuilt ? "is not the packet judge prepare builds from the spec and draft on disk" : `is for a station that does not apply to this spec (${skip})`;
    return { ...base, ok: false, invalid: true, findings: [t.finding("judge-packet-altered", `${packetPathArg} ${why}`, "Run judge prepare again (with --force) and judge the new packet; never edit a packet.")], code: 1 };
  }

  let verdictJson;
  try { verdictJson = JSON.parse(verdictBuf.toString("utf8").replace(/^﻿/, "")); }
  catch (e) {
    return { ...base, ok: false, invalid: true, findings: [t.finding("judge-verdict-not-json", `the verdict is not valid JSON (${e instanceof Error ? e.message : String(e)})`, "Write the verdict as one JSON object in the packet's verdict_schema shape.")], code: 1 };
  }

  let problems;
  let derived;
  try {
    problems = judge.validate(verdictJson, rebuilt.packet, t, rebuilt.key);
    if (!problems.length) derived = judge.derive(verdictJson, rebuilt.packet, t, rebuilt.key);
  } catch (e) {
    const crash = t.finding(`judge-${judge.name}-crashed`, withoutAbsolutePaths(e instanceof Error ? e.message : String(e)), "Fix the station or file an issue; it should never throw.");
    return { ...base, ok: false, invalid: true, findings: [crash], code: 1 };
  }
  if (problems.length) return { ...base, ok: false, invalid: true, findings: problems, code: 1 };

  const { status, findings } = derived;

  // ---- ledger: the same truth rules as check (ruling R1): compared with the most recent earlier
  // judge line for the same station and draft path, through ledgerVerdict; two judge-only rules on
  // top (R3, R5) are marked below.
  let ledgerPath = null;
  let ledgerWarning = null;
  let verdict = null;
  let verdictDetail = {};
  const ledger = openLedger(spec);
  if (ledger?.warning) ledgerWarning = ledger.warning;
  else if (ledger) {
    const draftKey = ledgerDraftKey(spec.dir, packet.draft);
    const judgeLines = priorLines(ledger.priorText, "judge");
    const prior = judgeLines.filter((l) => l.station === judge.name && l.draft === draftKey).at(-1);
    const last = prior ? { stations: { [prior.station]: prior.status }, draft_sha256: prior.draft_sha256, spec_sha256: prior.spec_sha256 } : undefined;
    ({ verdict, detail: verdictDetail } = ledgerVerdict({
      last, statusNow: { [judge.name]: status }, draftSha: draft.sha256, specSha,
      // A judge can answer differently about identical bytes; that is not the work improving.
      unchangedImprovedReason: "the verdict changed; draft and spec unchanged",
    }));
    // one-shot means these bytes passed the first time they were judged, whatever the file was
    // called: bytes already judged under another path (a copy, a rename) never earn it.
    if (verdict === "one-shot") {
      const sameBytes = judgeLines.filter((l) => l.station === judge.name && l.draft_sha256 === draft.sha256).at(-1);
      if (sameBytes) { verdict = "not-improved"; verdictDetail = { reason: `these draft bytes were judged before as ${sameBytes.draft}: ${sameBytes.status}` }; }
    }
    const line = {
      at: new Date().toISOString(),
      kind: "judge",
      station: judge.name,
      draft: draftKey,
      draft_sha256: draft.sha256,
      spec_sha256: specSha,
      status,
      verdict,
      ...verdictDetail,
    };
    appendFileSync(ledger.abs, `${JSON.stringify(line)}\n`);
    ledgerPath = ledger.decl;
  }

  return { ...base, ok: true, status, findings, verdict, verdictDetail, ledgerPath, ledgerWarning, code: status === "pass" ? 0 : 1 };
}
