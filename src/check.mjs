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
// presence check and escape check below exist anyway, for the same reason compare.mjs (the other
// ledger writer) keeps its own copy: defense in depth costs one branch and this file should never
// silently assume another file's invariant holds.

import { appendFileSync, readFileSync } from "node:fs";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { loadSpec } from "./load.mjs";
import { lintSpec } from "./rules.mjs";
import { score, exitCode } from "./score.mjs";
import { sha256 } from "./hash.mjs";
import { insideDir } from "./fsutil.mjs";
import { STATIONS, STATION_NAMES } from "./stations/index.mjs";
import { str } from "./placeholder.mjs";

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

// A crash message with every absolute path in it made relative to the working directory, or cut to
// "<path>/<file name>" when it lies outside it, so a station that hits a filesystem error never
// prints this machine's layout.
function withoutAbsolutePaths(message) {
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

// runCheck(specPathArg, draftPathArg, { only }): specPathArg and draftPathArg are exactly what
// the CLI (or a caller) was given, never resolved, so every path this returns or writes to the
// ledger is displayed and recorded the way the operator typed it, not as an absolute path on this
// machine. only, when given, is an array of station names to run instead of every registered one.
export function runCheck(specPathArg, draftPathArg, { only } = {}) {
  if (!present(specPathArg)) return { usage: true, error: "check needs a spec path" };
  if (!present(draftPathArg)) return { usage: true, error: "check needs --draft <file>" };

  const spec = loadSpec(specPathArg);
  if (spec.error) return { usage: true, error: spec.error };
  // Every station reads the writing profile's blocks; a spec without it has nothing for them to
  // read, and a run against it would fail quotations it has no materials for.
  if (str(spec.data?.profile) !== "writing") return { usage: true, error: "check needs a writing spec (profile: writing)" };

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
  // One leading UTF-8 BOM is not part of the draft's text: stripped here, so a heading on line 1
  // is found and every offset and line number counts from the first real character. sha256 stays
  // over the raw bytes.
  const text = draftBuf.toString("utf8").replace(/^\uFEFF/, "");
  const draft = { path: draftPathArg, text, lines: splitLines(text), sha256: sha256(draftBuf) };

  const ctx = {};
  const results = stationsToRun.map((s) => runStation(s, spec, draft, ctx));
  const failing = results.filter((r) => r.status === "fail").map((r) => r.station);
  const code = failing.length ? 1 : 0;

  // ---- ledger: one line of evidence per check, only when the spec declares one -----------------
  // What a line says, and why each reason is true:
  //   - A run with --only is partial: verdict not-improved, reason "partial run: <stations>",
  //     partial: true. Later verdicts ignore partial lines, so a subset never claims (or uses up)
  //     the verdict for the whole draft.
  //   - A full run compares with the most recent earlier FULL line for the same draft path (the
  //     path relative to the spec's folder). "Changed" means the draft's bytes (draft_sha256) or
  //     the spec's bytes (spec_sha256); files the spec names are not hashed.
  //       none, and every station passes              -> one-shot
  //       none, and a station fails                   -> not-improved "failing stations: X"
  //       it failed, every station passes now         -> improved "stations now pass: X", exactly
  //                                                      the stations that failed then and pass now
  //       it passed, nothing changed, passing         -> not-improved "no change since the last passing check"
  //       it passed, something changed, passing       -> not-improved "<what> changed; every station still passes"
  //       failing now                                  -> not-improved "[<what> changed; |no change since
  //                                                      the last check; ]still failing: X" when every
  //                                                      failing station also failed then, else
  //                                                      "[<what> changed; ]failing stations: X"
  let ledgerPath = null;
  let ledgerWarning = null;
  let verdict = null;
  let verdictDetail = {};
  const partial = Boolean(only && only.length);
  const ledgerDecl = spec.data?.improvement?.ledger;
  if (present(ledgerDecl)) {
    if (!insideDir(spec.dir, ledgerDecl)) {
      ledgerWarning = "improvement.ledger escapes the spec's directory; not appended";
    } else {
      const ledgerAbs = resolve(spec.dir, ledgerDecl);
      let priorText = "";
      try { priorText = readFileSync(ledgerAbs, "utf8"); } catch { /* not written yet; a first check creates it */ }

      // The draft as the ledger records it: relative to the spec's folder, with forward slashes, so
      // "./draft.md", "draft.md" and an absolute path are one history, and no absolute path lands
      // in a ledger that is usually committed.
      const draftKey = relative(resolve(spec.dir), resolve(draftPathArg)).split(sep).join("/");
      const specSha = sha256(readFileSync(resolve(specPathArg)));
      const statusNow = Object.fromEntries(results.map((r) => [r.station, r.status]));
      const list = (names) => names.join(", ");

      if (partial) {
        verdict = "not-improved";
        verdictDetail.reason = `partial run: ${list(results.map((r) => r.station))}`;
      } else {
        const last = priorCheckLines(priorText).filter((l) => l.draft === draftKey && l.partial !== true).at(-1);
        const failedThen = last ? Object.entries(last.stations ?? {}).filter(([, st]) => st === "fail").map(([n]) => n) : [];
        const draftChanged = Boolean(last) && last.draft_sha256 !== draft.sha256;
        const specChanged = Boolean(last) && last.spec_sha256 !== specSha;
        const what = draftChanged && specChanged ? "spec and draft" : specChanged ? "spec" : draftChanged ? "draft" : null;
        const passedNow = failing.length === 0;

        if (!last) {
          if (passedNow) verdict = "one-shot";
          else { verdict = "not-improved"; verdictDetail.reason = `failing stations: ${list(failing)}`; }
        } else if (passedNow && failedThen.length) {
          const nowPass = failedThen.filter((n) => statusNow[n] === "pass");
          if (nowPass.length) { verdict = "improved"; verdictDetail.change = `stations now pass: ${list(nowPass)}`; }
          else { verdict = "not-improved"; verdictDetail.reason = `${what ? `${what} changed; ` : ""}stations that failed last time now skip: ${list(failedThen)}`; }
        } else if (passedNow) {
          verdict = "not-improved";
          verdictDetail.reason = what ? `${what} changed; every station still passes` : "no change since the last passing check";
        } else {
          verdict = "not-improved";
          const still = failing.every((n) => failedThen.includes(n));
          const prefix = what ? `${what} changed; ` : still ? "no change since the last check; " : "";
          verdictDetail.reason = `${prefix}${still ? "still failing" : "failing stations"}: ${list(failing)}`;
        }
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
      appendFileSync(ledgerAbs, `${JSON.stringify(line)}\n`);
      // Reported exactly as the spec wrote it (improvement.ledger's own string), never resolved.
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
    partial,
    verdict,
    verdictDetail,
    ledgerPath,
    ledgerWarning,
    code,
  };
}
