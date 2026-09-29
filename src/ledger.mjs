// The runs ledger, shared by every command that appends a verdict to a spec's improvement.ledger
// after grading a draft: `hyperspec check` (one line per run of the deterministic stations) and
// `hyperspec judge record` (one line per recorded judgment). Both follow the same truth rules, so
// the rules live here once: which file, how the draft is keyed, and which verdict a line earns.
//
// compare.mjs, the other ledger writer, grades recipes rather than drafts and keeps its own shape.

import { readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { insideDir } from "./fsutil.mjs";

const present = (v) => typeof v === "string" && v.trim().length > 0;

// The spec's ledger, ready to append to: { decl, abs, priorText }, where decl is improvement.ledger
// exactly as the spec wrote it (what a command reports) and priorText is the file's current text
// ("" when not written yet; the first run creates it). { warning } when the declared path leads
// outside the spec's folder, and null when the spec declares no ledger at all. Lint's test 9
// already requires a ledger before any draft is graded; the checks here are defense in depth.
export function openLedger(spec) {
  const decl = spec.data?.improvement?.ledger;
  if (!present(decl)) return null;
  if (!insideDir(spec.dir, decl)) return { warning: "improvement.ledger escapes the spec's directory; not appended" };
  const abs = resolve(spec.dir, decl);
  let priorText = "";
  try { priorText = readFileSync(abs, "utf8"); } catch { /* not written yet */ }
  return { decl, abs, priorText };
}

// Every well-formed line of the given kind already in the ledger, oldest first. A line that is not
// valid JSON, or not an object of that kind, is skipped: this is a read for verdict history, not a
// lint pass, and a malformed line is lint test 9's finding to report.
export function priorLines(text, kind) {
  return (text ?? "")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter((v) => v && typeof v === "object" && !Array.isArray(v) && v.kind === kind);
}

// The draft as the ledger records it: relative to the spec's folder, with forward slashes, so
// "./draft.md", "draft.md" and an absolute path are one history, and no absolute path lands in a
// ledger that is usually committed.
export function ledgerDraftKey(specDir, draftPathArg) {
  return relative(resolve(specDir), resolve(draftPathArg)).split(sep).join("/");
}

// The verdict a new line earns, compared with `last`, the most recent earlier line this one
// continues (the caller picks it: check uses the last full check of the same draft, judge the last
// judgment of the same station and draft). `last` is normalized to { stations, draft_sha256,
// spec_sha256 }, stations mapping each station name to its status then; statusNow maps each
// station run now to its status. "Changed" means the draft's bytes or the spec's bytes, unless the
// caller says more (what, below).
//
//   none, and every station passes              -> one-shot
//   none, and a station fails                   -> not-improved "failing stations: X"
//   it failed, every station passes now         -> improved "stations now pass: X", exactly the
//                                                  stations that failed then and pass now
//   it passed, nothing changed, passing         -> not-improved "no change since the last passing <noun>"
//   it passed, something changed, passing       -> not-improved "<what> changed; every station still passes"
//   failing now                                 -> not-improved "[<what> changed; |no change since
//                                                  the last <noun>; ]still failing: X" when every
//                                                  failing station also failed then, else
//                                                  "[<what> changed; ]failing stations: X"
//
// Returns { verdict, detail }, detail holding either change (improved) or reason (not-improved),
// or nothing (one-shot). Every reason is literally true of the two lines compared.
//
// noun: what a line records, in the reasons that say nothing changed ("no change since the last
// passing check"); a judge line passes "judgment". Default "check".
//
// what: the caller's own account of what changed since `last`, when the draft and spec hashes are
// not the whole of it (a judge's packet also reads the DNA goldens or the claims ledger); a string
// such as "draft" or "the claims ledger (claims.jsonl)", or null for nothing. Omitted, it is worked
// out from the two hashes.
//
// unchangedImprovedReason: a caller whose station can flip from fail to pass with nothing changed
// (a judge answering differently; check cannot, being deterministic over the same files) passes the
// reason to record instead: "improved" then requires something changed since the failing line, an
// unchanged flip is not-improved with this reason, and an improved line's change names what
// changed ("draft changed; stations now pass: doctor").
export function ledgerVerdict({ last, statusNow, draftSha, specSha, unchangedImprovedReason, noun = "check", what: whatGiven }) {
  const list = (names) => names.join(", ");
  const failing = Object.entries(statusNow).filter(([, st]) => st === "fail").map(([n]) => n);
  const passedNow = failing.length === 0;
  if (!last) {
    return passedNow
      ? { verdict: "one-shot", detail: {} }
      : { verdict: "not-improved", detail: { reason: `failing stations: ${list(failing)}` } };
  }
  const failedThen = Object.entries(last.stations ?? {}).filter(([, st]) => st === "fail").map(([n]) => n);
  const draftChanged = last.draft_sha256 !== draftSha;
  const specChanged = last.spec_sha256 !== specSha;
  const what = whatGiven !== undefined ? whatGiven
    : draftChanged && specChanged ? "spec and draft" : specChanged ? "spec" : draftChanged ? "draft" : null;

  if (passedNow && failedThen.length) {
    const nowPass = failedThen.filter((n) => statusNow[n] === "pass");
    if (nowPass.length && !what && unchangedImprovedReason) return { verdict: "not-improved", detail: { reason: unchangedImprovedReason } };
    if (nowPass.length) return { verdict: "improved", detail: { change: `${unchangedImprovedReason ? `${what} changed; ` : ""}stations now pass: ${list(nowPass)}` } };
    return { verdict: "not-improved", detail: { reason: `${what ? `${what} changed; ` : ""}stations that failed last time now skip: ${list(failedThen)}` } };
  }
  if (passedNow) {
    return { verdict: "not-improved", detail: { reason: what ? `${what} changed; every station still passes` : `no change since the last passing ${noun}` } };
  }
  const still = failing.every((n) => failedThen.includes(n));
  const prefix = what ? `${what} changed; ` : still ? `no change since the last ${noun}; ` : "";
  return { verdict: "not-improved", detail: { reason: `${prefix}${still ? "still failing" : "failing stations"}: ${list(failing)}` } };
}
