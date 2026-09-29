// The persona: a judge reads the draft as the persona block describes its speaker (who they are,
// their stance, what they may assert and what they will not say) against the claims ledger, the
// closed list of facts the draft may state, and reports every place the voice breaks. hyperspec
// writes the packet, checks every quoted span against the draft (src/judge.mjs's evidence rule) and
// derives the status: pass when there is no break.
//
// The claims are the texts of the ledger the claims station reads (writing.sources.ledger, through
// its readClaimsLedger), so both stations see the same claims. That file is neither the spec nor the
// draft, so the station names it in inputSources: a ledger changed after prepare makes the packet
// stale, not altered. With no ledger declared (writing.sources deferred) the claims are null, the
// instructions say facts cannot be checked against sources, and a break of kind unsourced_fact is
// an invalid verdict: an empty list would read as "no fact is sourced". A ledger
// declared but unreadable skips the station, for the same reason.

import { str } from "../placeholder.mjs";
import { readClaimsLedger } from "../stations/claims.mjs";

export const name = "persona";

// The four ways a persona breaks, a closed set, in the order the verdict schema lists them.
export const PERSONA_KINDS = Object.freeze(["stance", "assertion", "will_not_say", "unsourced_fact"]);

export const PERSONA_INSTRUCTIONS = [
  "Read inputs.draft as the speaker inputs.persona describes.",
  "Report every break as an entry in breaks: the passage as evidence, copied verbatim from inputs.draft, at least three whole words; its kind; and why.",
  "The kind is one of: stance (the voice leaves inputs.persona.stance), assertion (it asserts something outside inputs.persona.may_assert), will_not_say (it says something inputs.persona.will_not_say rules out), unsourced_fact (it states a fact that none of inputs.claims holds).",
  "When inputs.claims is null, no claims ledger is declared and facts cannot be checked against sources: do not report unsourced_fact.",
  "If the voice holds throughout, breaks is an empty list.",
  "Answer only in the verdict shape given in verdict_schema.",
].join(" ");

const isObject = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const texts = (v) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
const nonEmpty = (v) => typeof v === "string" && v.trim().length > 0;

// null when the persona applies: a written persona block whose check names a rubric, and a claims
// ledger that is either not declared or readable.
export function skipReason(spec) {
  const persona = spec.data?.writing?.persona;
  if (!isObject(persona)) return "writing.persona is not written (deferred)";
  if (!str(persona.check?.rubric)) return "writing.persona.check has no rubric";
  const ledger = readClaimsLedger(spec);
  if (ledger.missing) return ledgerSkip(ledger.path);
  return null;
}

const ledgerSkip = (path) => `writing.sources.ledger "${path}" cannot be read (run \`hyperspec check\` for details)`;

// The skip reason when the station skips because of its source file (the claims ledger cannot be
// read), else null: record calls such a packet stale rather than altered.
export function sourceSkip(spec) {
  const persona = spec.data?.writing?.persona;
  if (!isObject(persona) || !str(persona.check?.rubric)) return null;
  const ledger = readClaimsLedger(spec);
  return ledger.missing ? ledgerSkip(ledger.path) : null;
}

// The file besides the spec and the draft this station's inputs come from, or null when there is none.
export function inputSources(spec) {
  const path = readClaimsLedger(spec).path;
  return path ? `the claims ledger (${path})` : null;
}

// The packet's rubric (persona.check.rubric, verbatim), inputs and verdict schema. No answer key.
export function packet(spec, draft) {
  const p = spec.data.writing.persona;
  const ledger = readClaimsLedger(spec);
  return {
    rubric: p.check.rubric,
    inputs: {
      persona: {
        identity: str(p.identity),
        stance: str(p.stance),
        may_assert: texts(p.may_assert),
        will_not_say: texts(p.will_not_say),
      },
      claims: ledger.path ? ledger.lines.filter((l) => !l.problem).map((l) => l.text) : null,
      draft: draft.text,
    },
    verdict_schema: {
      type: "object",
      required: ["breaks"],
      properties: {
        breaks: {
          type: "array",
          description: "every place the persona breaks; empty when it holds",
          items: {
            type: "object",
            required: ["evidence", "kind", "why"],
            properties: {
              evidence: { type: "string", description: "the passage, copied verbatim from the draft, at least three words" },
              kind: { enum: ledger.path ? [...PERSONA_KINDS] : PERSONA_KINDS.filter((k) => k !== "unsourced_fact") },
              why: { type: "string" },
            },
          },
        },
      },
    },
    key: null,
  };
}

// Every problem with the verdict, as findings; every evidence span must be in the draft.
export function validate(verdict, pkt, t) {
  if (!isObject(verdict)) return [t.shape("the verdict is not a JSON object", "Write one object: { breaks }.")];
  if (!Array.isArray(verdict.breaks)) return [t.shape("breaks is missing or not a list", "Give breaks: one { evidence, kind, why } per break, or [] when the persona holds.")];
  const out = [];
  verdict.breaks.forEach((b, i) => {
    const at = `breaks[${i}]`;
    if (!isObject(b)) { out.push(t.shape(`${at} is not an object`, "Write each break as { evidence, kind, why }.")); return; }
    if (!PERSONA_KINDS.includes(b.kind)) {
      const shown = typeof b.kind === "string" ? `"${b.kind}"` : b.kind === undefined ? "(missing)" : JSON.stringify(b.kind);
      out.push(t.finding("judge-persona-kind-unknown", `${at}.kind ${shown} is not one of ${PERSONA_KINDS.join(", ")}`, `Set kind to one of ${PERSONA_KINDS.join(", ")}.`));
    } else if (b.kind === "unsourced_fact" && pkt.inputs.claims === null) {
      out.push(t.finding("judge-persona-no-ledger", `${at}.kind is unsourced_fact, but the spec declares no claims ledger, so no fact can be checked against sources`, "Drop this break, or report it as another kind if the voice breaks there too."));
    }
    if (!nonEmpty(b.why)) out.push(t.shape(`${at}.why is missing or empty`, "Say why, in a sentence."));
    out.push(...t.evidence(b.evidence, `${at}.evidence`));
  });
  return out;
}

// Passes when there is no break; each break is a failure at its passage's line.
export function derive(verdict, pkt, t) {
  const stance = pkt.inputs.persona.stance;
  const said = {
    stance: [`the persona leaves its stance (${stance})`, `Revise the passage so it speaks as a ${stance} throughout.`],
    assertion: ["the persona asserts what it may not", "Cut the assertion, or revise it into something persona.may_assert allows."],
    will_not_say: ["the persona says what it will not say", "Cut what persona.will_not_say rules out."],
    unsourced_fact: ["the persona states a fact the claims ledger does not hold", "Source the fact and add it to the claims ledger, or cut it."],
  };
  const findings = verdict.breaks.map((b) => {
    const [message, fix] = said[b.kind];
    return t.finding("judge-persona-break", `${message}: ${b.why.trim()}`, fix, t.lineOf(b.evidence));
  });
  return { status: findings.length ? "fail" : "pass", findings };
}
