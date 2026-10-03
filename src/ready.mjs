// `hyperspec ready` (0.10): has this draft, under this spec, been through the engine?
//
// Answered from the runs ledger alone (improvement.ledger), never by running a station or a judge,
// so a caller can gate a handoff on it cheaply and deterministically: a drafting loop before it
// shows a person the draft, a per-audience renderer before a version may be sent. Every rule
// below is about the BYTES, the same hashes check and judge record write, so a draft or spec
// edited after it was graded is never ready on the strength of grades it no longer has.
//
//   1. the latest FULL check of these draft and spec bytes passed (a partial --only run proves
//      nothing about the stations it skipped);
//   2. every required judge has a line for these bytes and its latest says pass; the panel needs
//      one per reader, its buyer (the audience's own reader) included;
//   3. that check is later in the ledger than every one of those judge lines, so the panel's
//      findings went to triage and a check held every answer, instead of being recorded and left.
//
// Required judges: the caller's list, or every judgment station that applies to this spec and
// draft (src/judges/index.mjs skipReason is null).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadWritingSpec } from "./check.mjs";
import { readDraft } from "./draft.mjs";
import { readSequenceDraft, sequenceFilesDecl } from "./sequence-draft.mjs";
import { openLedger } from "./ledger.mjs";
import { sha256 } from "./hash.mjs";
import { JUDGES, JUDGE_NAMES } from "./judges/index.mjs";

const present = (v) => typeof v === "string" && v.trim().length > 0;

export function ready(specPathArg, draftPathArg, { judges } = {}) {
  const loaded = loadWritingSpec(specPathArg, "ready");
  if (loaded.usage) return { usage: true, error: loaded.error };
  const { spec } = loaded;
  const fromSequence = !present(draftPathArg);
  if (fromSequence && !sequenceFilesDecl(spec).length) return { usage: true, error: "ready needs --draft <file>" };
  if (judges) {
    const unknown = judges.filter((j) => !JUDGE_NAMES.includes(j));
    if (unknown.length) return { usage: true, error: `unknown judge${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}; known: ${JUDGE_NAMES.join(", ")}` };
  }
  const draft = fromSequence ? readSequenceDraft(spec, specPathArg) : readDraft(draftPathArg);
  if (!draft) return { usage: true, error: `cannot read draft: ${draftPathArg ?? "the sequence files"}` };
  const specSha = sha256(readFileSync(resolve(specPathArg)));

  const required = judges ?? JUDGES.filter((j) => j.skipReason(spec, draft) === null).map((j) => j.name);
  const ledger = openLedger(spec);
  const missing = [];
  if (!ledger || ledger.warning) {
    missing.push(ledger?.warning ?? "the spec declares no improvement.ledger, so nothing it was graded on is recorded");
    return { ok: true, ready: false, judges: required, missing, code: 1 };
  }
  const lines = ledger.priorText.split("\n").filter((l) => l.trim())
    .map((l, i) => { try { return { ...JSON.parse(l), _n: i }; } catch { return null; } })
    .filter((l) => l && l.draft_sha256 === draft.sha256 && l.spec_sha256 === specSha);

  const check = lines.filter((l) => l.kind === "check" && l.partial !== true).at(-1);
  if (!check) missing.push("no full check of this draft under this spec; run hyperspec check");
  else {
    const failing = Object.entries(check.stations ?? {}).filter(([, s]) => s === "fail").map(([n]) => n);
    if (failing.length) missing.push(`the last check failed: ${failing.join(", ")}`);
  }

  let lastJudge = -1;
  for (const name of required) {
    const judge = JUDGES.find((j) => j.name === name);
    const of = lines.filter((l) => l.kind === "judge" && l.station === name);
    const variants = judge.variants ? judge.variants(spec).map((v) => v.id) : [null];
    for (const v of variants) {
      const label = v ? `${name} (${v})` : name;
      const last = of.filter((l) => (v ? l.reader === v : true)).at(-1);
      if (!last) { missing.push(`${label} has not judged this draft under this spec`); continue; }
      lastJudge = Math.max(lastJudge, last._n);
      if (last.status !== "pass") missing.push(`${label} did not pass: ${last.status}`);
    }
  }
  if (check && lastJudge > check._n) missing.push("a judge recorded after the last check; run hyperspec check again so its findings are held");

  return { ok: true, ready: missing.length === 0, judges: required, missing, draft: draft.path, code: missing.length ? 1 : 0 };
}
