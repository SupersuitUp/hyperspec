// Station "triage" (hyperspec 0.9). Every finding a panel reader or an outside review raised about
// the draft, held to its answer: a finding nobody answered fails, an answer that says the draft now
// does it (taken) or already did (already-true) fails unless the passage it quotes is in the draft
// as it is now, and a kept answer fails without its reason. An open finding is a warning: it is a
// decision for the operator, and the draft can ship while it waits. So is an answer that kept a
// passage, or left it open, when that passage is no longer in the draft.
//
// The rules and the file live in src/triage.mjs, which `hyperspec triage status` reads too, so the
// station and the command can never disagree. With no triage file yet the station skips.

import { triageState } from "../triage.mjs";

export const name = "triage";

export function run(spec, draft) {
  const state = triageState(spec, draft);
  if (state.skip) return { station: name, status: "skip", findings: [], reason: state.skip };
  const status = state.findings.some((f) => f.severity === "fail") ? "fail" : "pass";
  return { station: name, status, findings: state.findings };
}
