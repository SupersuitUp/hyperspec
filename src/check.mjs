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

// 1-based line array: text.split("\n"), so array index i holds line i + 1. A "\r\n" line ending
// leaves the "\r" on the end of the PREVIOUS line's entry (split only breaks on "\n"), which is
// fine: it is still one line break, and every 1-based line number a finding names still points
// at the right line.
function splitLines(text) {
  return text.split("\n");
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
  const results = stationsToRun.map((s) => s.run(spec, draft, ctx));
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

      // one-shot means never having gotten anything wrong on this piece: passing now, on a draft
      // whose exact bytes have never been checked before, AND with no failing attempt anywhere in
      // this path's own history either. That last clause is not in the one-line rule for one-shot
      // by itself, but it has to hold for "improved" to ever be reachable in its own most common
      // case (a draft edited after a failing check always has a fresh sha), so one-shot is read
      // here as the narrower of the two conditions and checked, and lost, first.
      if (passedNow && !sameShaBefore && priorSamePathFailing.length === 0) {
        verdict = "one-shot";
      } else if (passedNow && priorSamePathFailing.length > 0) {
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
        // passedNow, and this exact sha was already checked and already passed, with no failure
        // anywhere in this path's history: a repeat check of an already-clean, unchanged draft.
        // Neither one-shot (it was already checked before) nor improved (nothing was ever wrong),
        // so it falls to the closed vocabulary's only remaining bucket.
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
      ledgerPath = ledgerAbs;
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
