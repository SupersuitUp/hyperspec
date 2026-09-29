// `hyperspec check`: run every deterministic station against a draft, once the spec that
// declares them is itself lint-clean. This module is the command's logic, independent of the
// CLI's argv parsing and printing (bin/hyperspec.mjs owns those), the same split rules.mjs and
// score.mjs already keep for `lint`.
//
// A draft is checked against a spec that is not ready to check anything against: the spec is
// linted first, and a spec that fails or is blocked runs no station at all, exiting with lint's
// own code (1 fail, 3 blocked) rather than a check-specific one. Passing lint's test 9 requires
// writing.improvement... no, requires improvement.ledger to be a non-empty path (see
// src/rules.mjs), so by the time any station runs, the spec is guaranteed to declare one; the
// presence check and escape check below exist anyway, for the same reason compare.mjs (the other
// ledger writer) keeps its own copy: defense in depth costs one branch and this file should never
// silently assume another file's invariant holds.

import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadSpec } from "./load.mjs";
import { lintSpec } from "./rules.mjs";
import { score, exitCode } from "./score.mjs";
import { sha256 } from "./hash.mjs";
import { insideDir } from "./fsutil.mjs";
import { STATIONS, STATION_NAMES } from "./stations/index.mjs";

const present = (v) => typeof v === "string" && v.trim().length > 0;

// 1-based line array: text.split("\n"), so array index i holds line i + 1. A trailing "\r" (a
// CRLF file) is stripped from every entry here, at the source, so every station that reads
// draft.lines sees a clean line ("# Claim", never "# Claim\r") without needing to know CRLF
// exists; the line COUNT and every 1-based line number are unaffected, since stripping a
// trailing byte from an entry never changes how many entries there are.
function splitLines(text) {
  return text.split("\n").map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));
}

// Every well-formed kind: "check" line already in the ledger, in file order (oldest first). A
// line that is not valid JSON, or not a kind: "check" object, is silently skipped here: this is a
// read for verdict history, not a lint pass. A malformed ledger line is rules.mjs's test 9's
// finding to report, not this function's to crash on.
function priorCheckLines(text) {
  return (text ?? "")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter((v) => v && typeof v === "object" && !Array.isArray(v) && v.kind === "check");
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
    return {
      station: station.name,
      status: "fail",
      findings: [{
        station: station.name,
        id: `station-${station.name}-crashed`,
        severity: "fail",
        message: e?.message ?? String(e),
        fix: "Fix the station or file an issue; it should never throw.",
      }],
    };
  }
}

// runCheck(specPathArg, draftPathArg, { only }): specPathArg and draftPathArg are exactly what
// the CLI (or a caller) was given, never resolved, so every path this returns or writes to the
// ledger is displayed and recorded the way the operator typed it, not as an absolute path on this
// machine. only, when given, is an array of station names to run instead of every registered one.
export function runCheck(specPathArg, draftPathArg, { only } = {}) {
  if (!present(specPathArg)) return { usage: true, error: "check needs a spec path" };
  if (!present(draftPathArg)) return { usage: true, error: "check needs --draft <file>" };

  const spec = loadSpec(specPathArg);
  if (spec.error) return { usage: true, error: spec.error };

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

  const lintFindings = lintSpec(spec);
  const lintScore = score(lintFindings, spec.data);
  if (lintScore.status !== "pass") {
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

  let draftBuf;
  try { draftBuf = readFileSync(resolve(draftPathArg)); }
  catch { return { usage: true, error: `cannot read draft: ${draftPathArg}` }; }
  const text = draftBuf.toString("utf8");
  const draft = { path: draftPathArg, text, lines: splitLines(text), sha256: sha256(draftBuf) };

  const ctx = {};
  const results = stationsToRun.map((s) => runStation(s, spec, draft, ctx));
  const failing = results.filter((r) => r.status === "fail").map((r) => r.station);
  const code = failing.length ? 1 : 0;

  // ---- ledger: one line of evidence per check, only when the spec declares one -----------------
  let ledgerPath = null;
  let ledgerWarning = null;
  let verdict = null;
  let verdictDetail = {};
  const ledgerDecl = spec.data?.improvement?.ledger;
  if (present(ledgerDecl)) {
    if (!insideDir(spec.dir, ledgerDecl)) {
      ledgerWarning = "improvement.ledger escapes the spec's directory; not appended";
    } else {
      const ledgerAbs = resolve(spec.dir, ledgerDecl);
      let priorText = "";
      try { priorText = readFileSync(ledgerAbs, "utf8"); } catch { /* not written yet; a first check creates it */ }
      const prior = priorCheckLines(priorText);

      const passedNow = failing.length === 0;
      const sameShaBefore = prior.some((l) => l.draft_sha256 === draft.sha256);
      // Every prior check of THIS draft path (any sha: the spec, not just the draft, can be what
      // changed between two checks) whose stations map recorded at least one failure.
      const priorSamePathFailing = prior.filter((l) => l.draft === draft.path && Object.values(l.stations ?? {}).includes("fail"));

      // Both one-shot and improved require !sameShaBefore: an already-checked, byte-identical
      // draft is a REPEAT of a verdict already recorded, never a fresh one, whether or not that
      // earlier history ever failed. Without this guard on "improved" too, a draft that failed
      // once, was fixed once, and is then re-checked unchanged forever (exactly the common
      // "confirm nothing regressed" workflow) would report "improved" on every single re-check,
      // since priorSamePathFailing never empties out. The two verdicts differ only in whether
      // this path's history ever failed:
      //   - one-shot: passing now, this exact sha never checked before, AND no failing attempt
      //     anywhere in this path's history either (nothing was ever wrong).
      //   - improved: passing now, this exact sha never checked before, but an earlier line for
      //     this path DID fail (something was wrong and this fresh draft fixes it).
      // A repeat check of a sha already on record (pass or fail, improved or not) always falls
      // through to the final else below, regardless of this path's failure history.
      if (passedNow && !sameShaBefore && priorSamePathFailing.length === 0) {
        verdict = "one-shot";
      } else if (passedNow && !sameShaBefore && priorSamePathFailing.length > 0) {
        verdict = "improved";
        // The most recently written prior failing line for this path is the one this pass
        // actually follows; its own failing station names are what "now pass" describes.
        const last = priorSamePathFailing[priorSamePathFailing.length - 1];
        const namesThen = Object.entries(last.stations ?? {}).filter(([, st]) => st === "fail").map(([n]) => n);
        verdictDetail.change = `stations now pass: ${namesThen.join(", ") || "(none recorded)"}`;
      } else if (!passedNow) {
        verdict = "not-improved";
        verdictDetail.reason = `failing stations: ${failing.join(", ")}`;
      } else {
        // passedNow, and sameShaBefore: this exact draft was already checked, whatever this
        // path's wider history looks like. A repeat check of a draft already on record, changed
        // or not since, reports nothing new, so it falls to the closed vocabulary's only
        // remaining bucket rather than re-claiming one-shot or improved a second time.
        verdict = "not-improved";
        verdictDetail.reason = "draft unchanged since a prior check that already passed";
      }

      const stationsMap = {};
      for (const r of results) stationsMap[r.station] = r.status;
      const line = {
        at: new Date().toISOString(),
        kind: "check",
        draft: draft.path,
        draft_sha256: draft.sha256,
        stations: stationsMap,
        verdict,
        ...verdictDetail,
      };
      appendFileSync(ledgerAbs, `${JSON.stringify(line)}\n`);
      // Reported exactly as the spec wrote it (improvement.ledger's own string), never resolved:
      // every other path this command returns or prints is echoed as given, and the ledger's
      // declared path already IS relative to spec.dir, so there is nothing to re-relativize.
      ledgerPath = ledgerDecl;
    }
  }

  return {
    ok: true,
    specPath: specPathArg,
    draftPath: draftPathArg,
    draftSha256: draft.sha256,
    stations: results,
    failing,
    verdict,
    verdictDetail,
    ledgerPath,
    ledgerWarning,
    code,
  };
}
