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
import { truncate } from "./stations/util.mjs";
import { JUDGES, JUDGE_NAMES } from "./judges/index.mjs";
import { MIN_EVIDENCE_WORDS, normalizeForEvidence, evidenceLocator, evidenceWords } from "./evidence.mjs";
import { addFindings } from "./triage.mjs";

export const PACKET_VERSION = "0.1";

const present = (v) => typeof v === "string" && v.trim().length > 0;

// ---- the evidence rule -------------------------------------------------------------------------
// Lives in src/evidence.mjs, shared with `triage`; re-exported here for the callers that import it
// from this module.
export { MIN_EVIDENCE_WORDS, normalizeForEvidence };

// The helpers a station's validate() and derive() receive, bound to one packet and one draft: every
// finding they build has the same shape as a `check` finding ({ station, id, severity, message,
// fix, line? }).
function toolsFor(stationName, draft) {
  const locator = evidenceLocator(draft.text);
  // The 1-based line of the first whole-word match of `span`, or -1.
  const locate = (span) => locator(span)?.line ?? -1;
  const finding = (id, message, fix, line) => ({ station: stationName, id, severity: "fail", message, fix, ...(typeof line === "number" && line > 0 ? { line } : {}) });
  return {
    finding,
    shape: (message, fix) => finding("judge-verdict-shape", message, fix),
    // [] when `value` is a non-empty span found in the draft, else the one finding saying why.
    evidence(value, where) {
      if (typeof value !== "string" || !value.trim()) {
        return [finding("judge-evidence-missing", `${where} is empty or not a string`, "Quote the span of the draft this judgment rests on, verbatim.")];
      }
      const words = evidenceWords(value);
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

// The message for files whose bytes no longer match the hashes a packet recorded. Nothing on disk
// can tell a file changed since prepare from a packet whose hash (or path) was edited, so it claims
// neither. `names` lists the files, e.g. ["the spec", "the draft"]. Shared with
// `learn record`.
export function hashMismatchMessage(names) {
  const one = names.length === 1;
  const what = one ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return `${what} ${one ? "does" : "do"} not match the ${one ? "hash" : "hashes"} the packet recorded: ${one ? "it" : "they"} changed since prepare, or the packet was edited`;
}

const packetJson = (packet) => `${JSON.stringify(packet, null, 2)}\n`;

// The packet one judge gets for this spec and draft, built the one way both commands build it:
// prepare writes it, and record rebuilds it to check the file it was handed. { packet, packetBytes,
// key }: key is the station's hidden answer key (null for a station with none), written by prepare
// to <station>.key.json for a person to read, and never read back as truth: record rebuilds it.
// specPathArg and the draft's path are the strings as given, so the bytes are deterministic.
// variant: for a station that writes one packet per variant (the panel, one per reader), the
// variant this packet is for; undefined for every other station.
export function buildPacket(judge, specPathArg, spec, draft, specSha, variant) {
  const parts = judge.packet(spec, draft, variant);
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
    const reason = judge.skipReason(spec, draft);
    if (reason) { skipped.push({ station: judge.name, reason }); continue; }
    // A station with variants (the panel) writes <station>-<variant>.packet.json for each.
    for (const variant of judge.variants ? judge.variants(spec) : [undefined]) {
      const base = variant ? `${judge.name}-${variant.id}` : judge.name;
      let built;
      try { built = buildPacket(judge, specPathArg, spec, draft, specSha, variant); }
      catch (e) {
        crashed.push({ station: judge.name, id: `judge-${judge.name}-crashed`, severity: "fail", message: withoutAbsolutePaths(e instanceof Error ? e.message : String(e)), fix: "Fix the station or file an issue; it should never throw." });
        continue;
      }
      files.push({ station: judge.name, ...(variant ? { reader: variant.id } : {}), path: join(outDirArg, `${base}.packet.json`), bytes: built.packetBytes });
      if (built.key) files.push({ station: judge.name, path: join(outDirArg, `${base}.key.json`), bytes: packetJson(built.key) });
    }
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
    written: files.map((f) => ({ station: f.station, ...(f.reader ? { reader: f.reader } : {}), path: f.path })),
    skipped,
    crashed,
    code: crashed.length ? 1 : 0,
  };
}

// ---- record ------------------------------------------------------------------------------------

// recordJudgment(packetPathArg, verdictPathArg): validates the verdict against its packet and, when
// it is valid, derives the station's status and appends one ledger line. Returns a usage result
// (exit 2), { invalid } (exit 1, nothing appended; a stale packet is { invalid, stale }, the shape
// `learn record` returns too), or the recorded result (exit 0 when the station passes, 1 when it
// fails).
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

  // A station with variants (the panel) names its variant in the packet; record rebuilds the packet
  // for that variant, so the name is checked like every other byte of it.
  const variantId = judge.variants ? judge.variantOf(packet) : undefined;
  const variant = judge.variants ? judge.variants(spec).find((v) => v.id === variantId) : undefined;
  const base = { packetPath: packetPathArg, verdictPath: verdictPathArg, station: judge.name, ...(judge.variants ? { reader: String(variantId ?? "") } : {}) };
  const t = toolsFor(judge.name, draft);

  // A verdict on bytes other than the ones the packet was prepared from judges nothing that exists.
  const specSha = sha256(readFileSync(resolve(packet.spec)));
  const draftChanged = draft.sha256 !== packet.draft_sha256;
  const specChanged = specSha !== packet.spec_sha256;
  if (draftChanged || specChanged) {
    const names = [specChanged && "the spec", draftChanged && "the draft"].filter(Boolean);
    return { ...base, ok: false, invalid: true, stale: true, findings: [t.finding("judge-stale", hashMismatchMessage(names), "Run judge prepare again (with --force) and judge the new packet.")], code: 1 };
  }

  // record never trusts the packet file: it rebuilds the packet (and any answer key) from the spec
  // and draft on disk, requires the file to be those exact bytes, and validates the verdict against
  // the rebuilt copy only. A packet edited after prepare (its conditions, its inputs, a hash made to
  // match a changed draft) is refused here.
  const skip = judge.skipReason(spec, draft);
  if (!skip && judge.variants && !variant) {
    return { ...base, ok: false, invalid: true, findings: [t.finding("judge-packet-altered", `${packetPathArg} is for a ${judge.name} reader this spec does not name (${String(variantId ?? "none")})`, `judge prepare writes a ${judge.name} packet only for each reader the spec names; record verdicts only on packets prepare writes, and never edit one.`)], code: 1 };
  }
  let rebuilt = null;
  if (!skip) {
    try { rebuilt = buildPacket(judge, packet.spec, spec, draft, specSha, variant); }
    catch (e) {
      return { ...base, ok: false, invalid: true, findings: [t.finding(`judge-${judge.name}-crashed`, withoutAbsolutePaths(e instanceof Error ? e.message : String(e)), "Fix the station or file an issue; it should never throw.")], code: 1 };
    }
  }
  // A station that reads files besides the spec and the draft (lineup reads the DNA
  // goldens) can go out of date with both hashes unchanged. When the file is a well-formed packet
  // that differs from the rebuilt one only in its inputs, that is reported as stale, naming those
  // files; the packet could also have been hand-edited there (its inputs, or a hash forged to match
  // an edited draft), and the message says so without claiming either hash is honest,
  // since nothing on disk can tell these apart. Anything else is an altered packet.
  //
  // A station can also stop applying because of those files (persona's claims ledger deleted,
  // lineup's goldens removed): its sourceSkip names that reason, and with the spec and draft hashes
  // matching the packet is stale for the same reason, the message saying the station no longer
  // applies and why. Any other skip (the spec changed under a forged hash, say) is an altered
  // packet. Neither message tells the user to judge a packet prepare will no longer write.
  const sources = judge.inputSources?.(spec) ?? null;
  const staleSources = (message, fix) => ({ ...base, ok: false, invalid: true, stale: true, findings: [t.finding("judge-stale", `${message}: ${sources} changed since the packet was prepared, or the packet was edited`, fix)], code: 1 });
  const sourceSkip = !rebuilt && sources ? judge.sourceSkip?.(spec, draft) ?? null : null;
  if (sourceSkip) {
    return staleSources(`${judge.name} no longer applies (${sourceSkip})`, `Restore ${sources} and record this verdict again; as they are now, judge prepare skips ${judge.name} for this spec and draft.`);
  }
  if (rebuilt && rebuilt.packetBytes !== packetText && sources && packetJson(packet) === packetText
      && JSON.stringify({ ...packet, inputs: null }) === JSON.stringify({ ...rebuilt.packet, inputs: null })) {
    return staleSources(`the packet's inputs no longer match what the spec, the draft and ${sources} produce now`, `Run judge prepare again (with --force) so the packet is built from the spec, the draft and ${sources} as they are now, and judge the new packet.`);
  }
  if (!rebuilt) {
    return { ...base, ok: false, invalid: true, findings: [t.finding("judge-packet-altered", `${packetPathArg} is for a station that does not apply to this spec and draft (${skip})`, `judge prepare writes no ${judge.name} packet for this spec and draft; record verdicts only on packets prepare writes, and never edit one.`)], code: 1 };
  }
  if (rebuilt.packetBytes !== packetText) {
    return { ...base, ok: false, invalid: true, findings: [t.finding("judge-packet-altered", `${packetPathArg} is not the packet judge prepare builds from the spec and draft on disk`, "Run judge prepare again (with --force) and judge the new packet; never edit a packet.")], code: 1 };
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

  // summary: an optional one-line result a station reports beside its status (attribution's
  // accuracy); printed after the status and carried in --json, never in the ledger line.
  const { status, findings, summary } = derived;

  // ---- ledger: the same truth rules as check: compared with the most recent earlier
  // judge line for the same station and draft path, through ledgerVerdict; two judge-only rules on
  // top are marked below.
  let ledgerPath = null;
  let ledgerWarning = null;
  let verdict = null;
  let verdictDetail = {};
  const ledger = openLedger(spec);
  if (ledger?.warning) ledgerWarning = ledger.warning;
  else if (ledger) {
    const draftKey = ledgerDraftKey(spec.dir, packet.draft);
    // packet_sha256: the hash of what the judge was shown, taken over the packet with its two paths
    // written as the ledger writes them (relative to the spec's folder), so the same packet
    // prepared from another folder, or as ./draft.md, hashes the same and a path's spelling can
    // never pass for a change.
    const packetSha = sha256(packetJson({ ...rebuilt.packet, spec: ledgerDraftKey(spec.dir, packet.spec), draft: draftKey }));
    // inputs_sha256: the hash of the packet's inputs alone, so a packet that changed can be told
    // apart as changed inputs (the files the station reads) or changed fixed text (a release that
    // rewords the instructions or the schema).
    const inputsSha = sha256(JSON.stringify(rebuilt.packet.inputs));
    const judgeLines = priorLines(ledger.priorText, "judge");
    // A panel reader's history is its own: the skeptic's line is compared with the skeptic's.
    const sameReader = (l) => !judge.variants || l.reader === variant.id;
    const prior = judgeLines.filter((l) => l.station === judge.name && sameReader(l) && l.draft === draftKey).at(-1);
    const last = prior ? { stations: { [prior.station]: prior.status }, draft_sha256: prior.draft_sha256, spec_sha256: prior.spec_sha256 } : undefined;
    // What changed since that line is judged by what the judge was shown: the packet. The draft
    // and the spec are named when their bytes changed. A packet that changed with both unchanged
    // was changed either in its inputs, by the files the station reads besides them (the DNA
    // scope, the claims ledger), which are named, or in its fixed text (hyperspec's instructions
    // or format), which is said. A line with no packet_sha256 (none is written without one) is
    // compared by the two hashes alone.
    let what = null;
    if (prior) {
      const draftChanged = prior.draft_sha256 !== draft.sha256;
      const specChanged = prior.spec_sha256 !== specSha;
      if (draftChanged || specChanged) what = draftChanged && specChanged ? "spec and draft" : specChanged ? "spec" : "draft";
      else if (typeof prior.packet_sha256 === "string" && prior.packet_sha256 !== packetSha) {
        what = prior.inputs_sha256 === inputsSha ? "the packet's fixed text (hyperspec's instructions or format)" : sources ?? "the packet's inputs";
      }
    }
    ({ verdict, detail: verdictDetail } = ledgerVerdict({
      last, statusNow: { [judge.name]: status }, draftSha: draft.sha256, specSha, noun: "judgment", what,
      // A judge can answer differently about an identical packet; that is not the work improving.
      unchangedImprovedReason: "the verdict changed; nothing the judge was shown changed",
    }));
    // one-shot means these bytes passed the first time they were judged, whatever the file was
    // called: bytes already judged under another path (a copy, a rename) never earn it.
    if (verdict === "one-shot") {
      const sameBytes = judgeLines.filter((l) => l.station === judge.name && sameReader(l) && l.draft_sha256 === draft.sha256).at(-1);
      if (sameBytes) { verdict = "not-improved"; verdictDetail = { reason: `these draft bytes were judged before as ${sameBytes.draft}: ${sameBytes.status}` }; }
    }
    const line = {
      at: new Date().toISOString(),
      kind: "judge",
      station: judge.name,
      ...(judge.variants ? { reader: variant.id } : {}),
      draft: draftKey,
      draft_sha256: draft.sha256,
      spec_sha256: specSha,
      packet_sha256: packetSha,
      inputs_sha256: inputsSha,
      status,
      verdict,
      ...verdictDetail,
    };
    appendFileSync(ledger.abs, `${JSON.stringify(line)}\n`);
    ledgerPath = ledger.decl;
  }

  // A station whose verdict yields findings to answer (the panel) hands them to the triage file,
  // beside the runs ledger, where `hyperspec triage` answers them and `check` holds them.
  let triage = null;
  let line = summary;
  if (derived.triage) {
    triage = addFindings(spec, derived.triage, { source: judge.name, reader: variant?.id ?? null, draftSha: draft.sha256, idPrefix: variant ? `${judge.name}-${variant.id}` : judge.name });
    if (triage.warning) ledgerWarning = ledgerWarning ?? triage.warning;
    else line = `${summary ? `${summary}; ` : ""}${triage.added} added to triage (${triage.decl})${triage.already ? `, ${triage.already} already there` : ""}`;
  }

  return { ...base, ok: true, status, ...(line ? { summary: line } : {}), findings, ...(triage && !triage.warning ? { triage: { path: triage.decl, added: triage.added, already: triage.already } } : {}), verdict, verdictDetail, ledgerPath, ledgerWarning, code: status === "pass" ? 0 : 1 };
}
