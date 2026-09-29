// Station "claims" (hyperspec 0.6, build 6a task 2). Reads writing.sources.ledger, a JSONL file
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

export const name = "claims";

// Quote characters normalized to their straight ASCII form, then whitespace runs collapsed to a
// single space and the ends trimmed. "text matching is exact after normalizing whitespace and
// quote characters" (the build's own ruling): case is NOT normalized, so a claim's text must
// still match the draft's actual capitalization.
function normalize(text) {
  return String(text)
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(text, max) {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

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

  const ledgerAbs = resolve(spec?.dir || ".", ledgerPath);
  let raw;
  try {
    raw = readFileSync(ledgerAbs, "utf8");
  } catch {
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
  const ledgerLines = raw.split("\n").map((text, i) => ({ n: i + 1, text })).filter((l) => l.text.trim() !== "");

  for (const { n, text } of ledgerLines) {
    let obj;
    try {
      obj = JSON.parse(text);
    } catch {
      findings.push({
        station: name,
        id: `station-claims-json-line-${n}`,
        severity: "fail",
        message: `writing.sources.ledger "${ledgerPath}" line ${n} is not valid JSON`,
        fix: "Fix the JSON on that line.",
      });
      continue;
    }
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
      findings.push({
        station: name,
        id: `station-claims-json-line-${n}`,
        severity: "fail",
        message: `writing.sources.ledger "${ledgerPath}" line ${n} is not a JSON object`,
        fix: 'Each ledger line must be a JSON object: {"text": "...", "source": "..."}.',
      });
      continue;
    }

    const claimText = typeof obj.text === "string" ? obj.text : "";
    if (!claimText.trim()) {
      findings.push({
        station: name,
        id: `station-claims-json-line-${n}`,
        severity: "fail",
        message: `writing.sources.ledger "${ledgerPath}" line ${n} has no text`,
        fix: "Add text: the claim exactly as it appears in the draft.",
      });
      continue;
    }

    const tag = truncate(claimText, 80);

    if (!draftNorm.includes(normalize(claimText))) {
      findings.push({
        station: name,
        id: "station-claims-stale",
        severity: "fail",
        message: `ledger claim on line ${n}, "${tag}", does not appear verbatim in the draft`,
        fix: "Update the ledger's text to match the draft exactly, or remove the stale claim.",
      });
    }

    if (!str(obj.source)) {
      findings.push({
        station: name,
        id: "station-claims-unsourced",
        severity: unsourcedSeverity,
        message: `ledger claim on line ${n}, "${tag}", has no source (or it is a placeholder)`,
        fix: "Add a real source: to the claim, or remove it from the ledger.",
      });
    }
  }

  const status = findings.some((x) => x.severity === "fail") ? "fail" : "pass";
  return { station: name, status, findings };
}
