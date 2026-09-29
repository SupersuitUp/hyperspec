// The writing profile's `hyperspec init --profile writing` skeleton.
//
// Design: four of the nine writing blocks (dna, persona, audience, goal) are the ones that need a
// real interview before a placeholder means anything, so this skeleton does not fake content for
// them at all. Instead it defers each one with its own open decision (id writing-<block>, per the
// deferral rule in writing.mjs), carrying the actual question the operator has to answer. The
// other required blocks that ARE mechanical enough to scaffold up front (materials, form, spine,
// sources, and characters when --fiction) are written out in full, with placeholder values chosen
// to fail their own field rules visibly (a closed-set field set to a value outside its set, a path
// that does not exist, a list one short of its minimum) — so `writing: k/9 blocks complete` reads
// honestly low the moment the file is written, not only once someone runs lint.
//
// characters is the one deliberate exception when --fiction is set: the schema's checks on a
// character are all presence checks (no closed set), so a character with every required field
// filled by a placeholder passes cleanly. That is the brief's own phrasing: "every required
// character field present as a placeholder", present rather than broken.
//
// init with no --profile never imports or calls this file: template.mjs's own template() is
// untouched, so a bare init is still byte-for-byte what it always was.
import { scalar } from "./template.mjs";

const DECISION_QUESTIONS = Object.freeze({
  dna: "whose voice is this, scoped to what form, audience and purpose, and which goldens define it?",
  persona: "who does the piece speak as, what may it assert, and what will it never say?",
  audience: "who reads this, what do they already believe, and what do they want when they arrive?",
  goal: "what belief, action or feeling should move, and which requirements would prove it did?",
});

// Schema order (writing.mjs's BLOCKS): materials, dna, persona, audience, goal, form, spine,
// sources, characters. dna/persona/audience/goal are the deferred four; this is the order the
// remaining decisions and the remaining blocks are written in.
const DEFERRED_BLOCKS = ["dna", "persona", "audience", "goal"];

function deferredDecision(block) {
  return `  - id: writing-${block}
    state: open
    question: ${scalar(DECISION_QUESTIONS[block])}
    source: hyperspec init --profile writing
    author: agent:hyperspec-init
    chosen_by: agent`;
}

const CHARACTER_BLOCK = `
  characters:
    - id: TODO
      speech:
        uses:
          - TODO
        never:
          - TODO
        rhythm: TODO
      wants: TODO
      fears: TODO
      hides: TODO
      knowledge:
        - by: TODO
          knows: TODO
      arc_state: TODO
      golden_lines:
        - TODO
      rejected_lines:
        - TODO
      check:
        rubric: TODO
      source: TODO
      author: TODO`;

export function writingTemplate({ title = "Untitled", form = "essay", fiction = false } = {}) {
  const heading = String(title).replace(/\s+/g, " ").trim();
  const kind = String(form || "essay");
  const decisions = DEFERRED_BLOCKS.map(deferredDecision).join("\n");
  const characters = fiction ? CHARACTER_BLOCK : "";

  return `---
hyperspec: "0.1"
title: ${scalar(String(title))}
kind: ${scalar(kind)}
profile: writing
decisions:
${decisions}
requirements: []
rejects: []
examples: []
resume:
  next_action: answer the open decisions, then fill in materials, form, spine and sources
feedback:
  issues: ""
  fork: ""
improvement:
  ledger: runs.jsonl
writing:
  materials:
    items:
      - id: m1
        path: materials/TODO.md
        produced_by: TODO
        captured: TODO
        how: TODO
        trust: TODO
    check:
      station: TODO
    source: TODO
    author: TODO
  form:
    name: ${scalar(kind)}
    length:
      min: TODO
      max: TODO
      unit: TODO
    required_parts:
      - TODO
    stations: []
    check:
      station: TODO
    source: TODO
    author: TODO
  spine:
    kind: TODO
    claims:
      - id: c1
        text: TODO
        materials: [m1]
    check:
      rubric: TODO
    source: TODO
    author: TODO
  sources:
    ledger: TODO.claims.jsonl
    unsourced_claim: TODO
    check:
      station: TODO
    source: TODO
    author: TODO${characters}
fiction: ${fiction ? "true" : "false"}
---

# ${heading}
`;
}
