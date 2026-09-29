// Station "claims" (hyperspec 0.6). Reads writing.sources.ledger, a JSONL file
// where each line is one claim: { "text": <claim as it appears in the draft>, "source":
// <non-empty>, "span"?: <quote or locator> }. Two things are checked per line, and whether a
// sentence in the draft even IS a factual claim is never attempted here: that is judgment, and
// the ledger is the closed list of what counts as a claim. This station only checks that the
// ledger and the draft agree with each other:
//
//   - the claim's text still appears verbatim in the draft (normalized for whitespace and quote
//     characters, but not case) -- otherwise the ledger is stale (station-claims-stale);
//   - the claim carries a real, non-placeholder source -- otherwise it is unsourced
//     (station-claims-unsourced, downgraded to a warning when writing.sources.unsourced_claim is
//     "warn", the same closed-set field src/writing-fields.mjs already validates on the spec).
//
// The ledger path resolves relative to the spec (spec.dir), the same way every other path-bearing
// writing field does. A missing or unreadable ledger fails the whole station on its own
// (station-claims-ledger-missing); a malformed JSONL line (not JSON, not an object, or missing
// text) is its own finding naming the line number, and does not stop the rest of the file from
// being read.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { str } from "../placeholder.mjs";
import { lineAt, truncate } from "./util.mjs";

export const name = "claims";

// Quote characters normalized to their straight ASCII form, then whitespace runs collapsed to a
// single space and the ends trimmed. "text matching is exact after normalizing whitespace and
// quote characters": case is NOT normalized, so a claim's text must
// still match the draft's actual capitalization.
function normalize(text) {
  return String(text)
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

// Where a claim's text first appears in the original draft, under the same normalization the match
// uses (any whitespace run for a space, any quote character for a quote), or -1.
function firstOccurrence(text, claimText) {
  const body = [...normalize(claimText)].map((c) => (c === " " ? "\\s+" : c === "'" ? "['‘’‚‛]" : c === '"' ? '["“”„‟]' : c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).join("");
  const m = new RegExp(body).exec(text);
  return m ? m.index : -1;
}

// The claims ledger as the claims station reads it, shared with the persona judge
// (src/judges/persona.mjs), so both see the same claims. { path, missing, lines }: path is
// writing.sources.ledger as written (null when unset); missing is true when it is set but cannot be
// read; lines holds every non-blank line, 1-based as n, each either { n, text } (a claim with
// non-empty text; claim is the parsed object) or { n, problem } naming why it is not one.
export function readClaimsLedger(spec) {
  const ledgerPath = str(spec?.data?.writing?.sources?.ledger);
  if (!ledgerPath) return { path: null, missing: false, lines: [] };
  let raw;
  try {
    // A leading UTF-8 BOM (written by default by several Windows/Excel-adjacent editors) is not
    // valid JSON leading whitespace, so it must come off before line 1 is parsed, or a genuinely
    // well-formed first line reports as broken JSON for a reason that has nothing to do with its
    // content.
    raw = readFileSync(resolve(spec?.dir || ".", ledgerPath), "utf8").replace(/^\uFEFF/, "");
  } catch {
    return { path: ledgerPath, missing: true, lines: [] };
  }
  const lines = [];
  raw.split("\n").forEach((text, i) => {
    if (text.trim() === "") return;
    const n = i + 1;
    let obj;
    try { obj = JSON.parse(text); } catch { lines.push({ n, problem: "is not valid JSON" }); return; }
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) { lines.push({ n, problem: "is not a JSON object" }); return; }
    const claimText = typeof obj.text === "string" ? obj.text : "";
    if (!claimText.trim()) { lines.push({ n, problem: "has no text" }); return; }
    lines.push({ n, text: claimText, claim: obj });
  });
  return { path: ledgerPath, missing: false, lines };
}

const PROBLEM_FIX = {
  "is not valid JSON": "Fix the JSON on that line.",
  "is not a JSON object": 'Each ledger line must be a JSON object: {"text": "...", "source": "..."}.',
  "has no text": "Add text: the claim exactly as it appears in the draft.",
};

export function run(spec, draft) {
  const sources = spec?.data?.writing?.sources ?? {};
  const ledgerPath = str(sources.ledger);
  const unsourcedSeverity = str(sources.unsourced_claim) === "warn" ? "warn" : "fail";

  if (!ledgerPath) {
    // writing.sources.ledger is a required field (lint test 1), so by the time check runs (lint
    // already passed) a real spec always has one; this is defense in depth for a caller that
    // builds a spec object by hand and skips lint, mirroring how form.mjs treats its own inputs
    // as never fully trusted either.
    return { station: name, status: "skip", findings: [], reason: "writing.sources.ledger is not set" };
  }

  const ledger = readClaimsLedger(spec);
  if (ledger.missing) {
    return {
      station: name,
      status: "fail",
      findings: [{
        station: name,
        id: "station-claims-ledger-missing",
        severity: "fail",
        message: `writing.sources.ledger "${ledgerPath}" does not exist or cannot be read`,
        fix: `Create ${ledgerPath} as JSONL, one claim per line: {"text": "...", "source": "..."}.`,
      }],
    };
  }

  const findings = [];
  const draftNorm = normalize(draft.text);

  for (const { n, problem, text: claimText, claim: obj } of ledger.lines) {
    if (problem) {
      findings.push({
        station: name,
        id: `station-claims-json-line-${n}`,
        severity: "fail",
        message: `writing.sources.ledger "${ledgerPath}" line ${n} ${problem}`,
        fix: PROBLEM_FIX[problem],
      });
      continue;
    }

    const tag = truncate(claimText, 80);

    if (!draftNorm.includes(normalize(claimText))) {
      findings.push({
        station: name,
        id: "station-claims-stale",
        severity: "fail",
        message: `ledger line ${n}, "${tag}", does not appear verbatim in the draft`,
        fix: "Update the ledger's text to match the draft exactly, or remove the stale claim.",
      });
    }

    if (!str(obj.source)) {
      const at = firstOccurrence(draft.text, claimText);
      findings.push({
        station: name,
        id: "station-claims-unsourced",
        severity: unsourcedSeverity,
        ...(at >= 0 ? { line: lineAt(draft.text, at) } : {}),
        message: `ledger line ${n}, "${tag}", has no source (or it is a placeholder)`,
        fix: "Add a real source: to the claim, or remove it from the ledger.",
      });
    }
  }

  const status = findings.some((x) => x.severity === "fail") ? "fail" : "pass";
  return { station: name, status, findings };
}
