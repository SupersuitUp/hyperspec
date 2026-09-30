// `hyperspec check`: run every deterministic station against a draft, once the spec that
// declares them is itself lint-clean. This module is the command's logic, independent of the
// CLI's argv parsing and printing (bin/hyperspec.mjs owns those), the same split rules.mjs and
// score.mjs already keep for `lint`.
//
// A draft is never checked against a spec that is not ready to check anything against: the spec
// is linted first, and a spec that fails or is blocked runs no station at all, exiting with lint's
// own code (1 fail, 3 blocked) rather than a check-specific one. Passing lint's test 9 requires
// improvement.ledger to be a non-empty path (see
// src/rules.mjs), so by the time any station runs, the spec is guaranteed to declare one; the
// presence check and escape check in openLedger (src/ledger.mjs) exist anyway: defense in depth
// costs one branch and this file should never silently assume another file's invariant holds.

import { appendFileSync, readFileSync } from "node:fs";
import { basename, isAbsolute, relative, resolve } from "node:path";
import { loadSpec } from "./load.mjs";
import { lintSpec } from "./rules.mjs";
import { score, exitCode } from "./score.mjs";
import { sha256 } from "./hash.mjs";
import { readDraft } from "./draft.mjs";
import { openLedger, priorLines, ledgerDraftKey, ledgerVerdict } from "./ledger.mjs";
import { STATIONS, STATION_NAMES } from "./stations/index.mjs";
import { str } from "./placeholder.mjs";
import { readSequenceDraft, sequenceFilesDecl, sourceAt } from "./sequence-draft.mjs";

const present = (v) => typeof v === "string" && v.trim().length > 0;

// A crash message with every absolute path in it made relative to the working directory, or cut to
// "<path>/<file name>" when it lies outside it, so a station that hits a filesystem error never
// prints this machine's layout.
export function withoutAbsolutePaths(message) {
  return message.replace(/(?:[A-Za-z]:\\|\/)[^\s'"`,)]+/g, (p) => {
    if (!isAbsolute(p)) return p;
    const rel = relative(process.cwd(), p);
    return rel && !rel.startsWith("..") && !isAbsolute(rel) ? rel : `<path>/${basename(p)}`;
  });
}

// runStation(station, spec, draft, ctx): runs one station's run(spec, draft, ctx), converting a
// throw into a single failing finding rather than letting it crash the whole command. A station
// is pure and deterministic BY CONTRACT, but that contract is not enforced by the type system,
// and later stations (terms, claims, quotes, private, dna) read JSONL ledgers, segments files
// and regexes over untrusted draft text, which is a lot more surface for a bug to throw from
// than form's own narrow reading. A throw here must never crash the whole command (no raw stack
// trace, no half-finished --json, no skipped ledger line): every OTHER station and the ledger
// write still run normally, the same way lintSpec's own crash in bin/hyperspec.mjs's `lint`
// handler becomes a reported error rather than an uncaught exception. Exported (and taking the
// station object rather than reading STATIONS itself) so this exact wrapping is testable against
// a station built to throw, without needing one registered in the shared registry
// (src/stations/index.mjs), which this file does not own.
export function runStation(station, spec, draft, ctx) {
  try {
    return station.run(spec, draft, ctx);
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return {
      station: station.name,
      status: "fail",
      findings: [{
        station: station.name,
        id: `station-${station.name}-crashed`,
        severity: "fail",
        message: withoutAbsolutePaths(raw),
        fix: "Fix the station or file an issue; it should never throw.",
      }],
    };
  }
}

// The spec at specPathArg, loaded and required to carry the writing profile: { spec }, or a usage
// result naming the command. Every station and every judge reads the writing profile's blocks; a
// spec without it has nothing for them to read, and a run against it would fail quotations it has
// no materials for.
export function loadWritingSpec(specPathArg, command) {
  const spec = loadSpec(specPathArg);
  if (spec.error) return { usage: true, error: spec.error };
  if (str(spec.data?.profile) !== "writing") return { usage: true, error: `${command} needs a writing spec (profile: writing)` };
  return { spec };
}

// null when the spec lints clean; otherwise the result a command returns instead of grading
// anything, carrying lint's own exit code (1 fail, 3 blocked): a draft is never graded against a
// spec that is not ready.
export function lintBlock(spec, specPathArg) {
  const lintFindings = lintSpec(spec);
  const lintScore = score(lintFindings, spec.data);
  if (lintScore.status === "pass") return null;
  return {
    ok: false,
    lintBlocked: true,
    specPath: specPathArg,
    lintStatus: lintScore.status,
    lintScore,
    lintFindings,
    code: exitCode(lintScore.status),
  };
}

// A finding from a draft assembled out of a sequence's files names the file and its own line in
// it, rather than a line of the joined text nobody can open.
function locate(finding, draft) {
  const src = typeof finding.line === "number" ? sourceAt(draft, finding.line) : null;
  return src ? { ...finding, file: src.file, line: finding.line - src.startLine + 1 } : finding;
}

// runCheck(specPathArg, draftPathArg, { only }): specPathArg and draftPathArg are exactly what
// the CLI (or a caller) was given, never resolved, so every path this returns or writes to the
// ledger is displayed and recorded the way the operator typed it, not as an absolute path on this
// machine. only, when given, is an array of station names to run instead of every registered one.
//
// With no draftPathArg, a spec that lists writing.form.sequence.files is checked against those
// files, joined in reading order (src/sequence-draft.mjs); any other spec still needs --draft.
export function runCheck(specPathArg, draftPathArg, { only } = {}) {
  if (!present(specPathArg)) return { usage: true, error: "check needs a spec path" };
  const needsDraft = { usage: true, error: "check needs --draft <file>" };

  const loaded = loadWritingSpec(specPathArg, "check");
  if (!present(draftPathArg) && (loaded.usage || !sequenceFilesDecl(loaded.spec).length)) return needsDraft;
  if (loaded.usage) return loaded;
  const { spec } = loaded;
  const fromSequence = !present(draftPathArg);

  // --only: every name must be one this build's registry knows; unknown names are a usage error
  // (exit 2) rather than a silent no-op, and the run order always follows the registry, never the
  // order --only happened to name them in, so two operators running the same --only string in a
  // different order still see stations printed and ledgered identically.
  let stationsToRun = STATIONS;
  if (only && only.length) {
    const unknown = only.filter((n) => !STATION_NAMES.includes(n));
    if (unknown.length) {
      return { usage: true, error: `unknown station${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}; known stations: ${STATION_NAMES.join(", ") || "(none)"}` };
    }
    stationsToRun = STATIONS.filter((s) => only.includes(s.name));
  }

  const blocked = lintBlock(spec, specPathArg);
  if (blocked) return blocked;

  // BOM stripped, CRLF-clean lines, sha256 over the raw bytes: see src/draft.mjs. A sequence's
  // draft is its files joined; its ledger key is the files entry as the spec writes it, so the
  // history of the work stays one history as parts are added.
  const draft = fromSequence ? readSequenceDraft(spec, specPathArg) : readDraft(draftPathArg);
  const draftLabel = fromSequence ? sequenceFilesDecl(spec).join(", ") : draftPathArg;
  if (!draft) return { usage: true, error: fromSequence ? `writing.form.sequence.files matches no file: ${draftLabel}` : `cannot read draft: ${draftPathArg}` };

  const ctx = {};
  const results = stationsToRun.map((s) => runStation(s, spec, draft, ctx))
    .map((r) => (draft.sources ? { ...r, findings: r.findings.map((f) => locate(f, draft)) } : r));
  const failing = results.filter((r) => r.status === "fail").map((r) => r.station);
  const code = failing.length ? 1 : 0;

  // ---- ledger: one line of evidence per check, only when the spec declares one -----------------
  // A run with --only is partial: verdict not-improved, reason "partial run: <stations>",
  // partial: true. Later verdicts ignore partial lines, so a subset never claims (or uses up) the
  // verdict for the whole draft. A full run is compared with the most recent earlier FULL line for
  // the same draft path; which verdict that earns, and why each reason is true, is
  // ledgerVerdict's (src/ledger.mjs), shared with `judge record` so both follow one set of rules.
  let ledgerPath = null;
  let ledgerWarning = null;
  let verdict = null;
  let verdictDetail = {};
  const partial = Boolean(only && only.length);
  const ledger = openLedger(spec);
  if (ledger?.warning) ledgerWarning = ledger.warning;
  else if (ledger) {
    const draftKey = fromSequence ? draftLabel : ledgerDraftKey(spec.dir, draftPathArg);
    const specSha = sha256(readFileSync(resolve(specPathArg)));
    const statusNow = Object.fromEntries(results.map((r) => [r.station, r.status]));

    if (partial) {
      verdict = "not-improved";
      verdictDetail.reason = `partial run: ${results.map((r) => r.station).join(", ")}`;
    } else {
      const last = priorLines(ledger.priorText, "check").filter((l) => l.draft === draftKey && l.partial !== true).at(-1);
      ({ verdict, detail: verdictDetail } = ledgerVerdict({ last, statusNow, draftSha: draft.sha256, specSha }));
    }

    const line = {
      at: new Date().toISOString(),
      kind: "check",
      draft: draftKey,
      draft_sha256: draft.sha256,
      spec_sha256: specSha,
      stations: statusNow,
      ...(partial ? { partial: true } : {}),
      verdict,
      ...verdictDetail,
    };
    appendFileSync(ledger.abs, `${JSON.stringify(line)}\n`);
    // Reported exactly as the spec wrote it (improvement.ledger's own string), never resolved.
    ledgerPath = ledger.decl;
  }

  return {
    ok: true,
    specPath: specPathArg,
    draftPath: draftLabel,
    ...(fromSequence ? { files: draft.sources.map((x) => x.file) } : {}),
    draftSha256: draft.sha256,
    stations: results,
    failing,
    partial,
    verdict,
    verdictDetail,
    ledgerPath,
    ledgerWarning,
    code,
  };
}
