// The writing profile's `hyperspec init --profile writing` skeleton.
//
// Design (fix round 1, per the design doc's Part 3 item 3, "the ten blocks above as a template
// with every field's check named"): every required writing block appears in full, in schema
// order, with every field present as a placeholder value — including dna, persona, audience and
// goal, which an earlier draft of this file omitted entirely on the theory that a decision alone
// was enough to stand in for the shape. That was wrong: an operator opening the file is owed the
// same inline shape for those four that materials/form/spine/sources already get, not a pointer
// to go read the schema elsewhere. The four still carry their own open decision (id
// writing-<block>, per the deferral rule in writing.mjs) alongside the placeholder content, naming
// the real question that has to be answered before the placeholder becomes real — the decision and
// the shape are not in tension: the block's own placeholder content already fails its field rules
// (closed-set values outside their set, paths that do not exist, lists one short of their
// minimum), so the decision never changes whether the spec passes, only what the operator is told
// to go decide.
//
// Every placeholder scalar in this file is the bare word "TODO". That is not decorative: `str()`
// in src/placeholder.mjs treats a value that IS the whole word todo/tbd/fixme/xxx/placeholder
// (case-insensitive) as blank, so every presence check on every one of these fields fails on its
// own, for free, without this file having to hand-pick which specific field to break per block.
// (Fix round 1, R6: an earlier version of this file relied on "TODO" happening to be a valid,
// non-empty string, which meant the one block whose checks are all presence-only — characters —
// lints completely clean the moment init writes it. Fixing the presence check itself, once, in
// src/placeholder.mjs, closes that for every field in every block, not just characters.)
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
// sources, characters. These four get an open decision in ADDITION to their placeholder block,
// because they are the ones that need real judgment before the placeholder means anything; every
// other required block gets only the placeholder.
const DECISION_BLOCKS = ["dna", "persona", "audience", "goal"];

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
  const decisions = DECISION_BLOCKS.map(deferredDecision).join("\n");
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
  next_action: answer the open decisions, then fill in every writing block below
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
  dna:
    writer: TODO
    scope:
      form: TODO
      audience: TODO
      purpose: TODO
    rules: TODO
    goldens:
      - path: goldens/TODO.md
        why: TODO
    check:
      rubric: TODO
    source: TODO
    author: TODO
  persona:
    identity: TODO
    stance: TODO
    may_assert:
      - TODO
    will_not_say:
      - TODO
    facts_from: TODO
    check:
      rubric: TODO
    source: TODO
    author: TODO
  audience:
    who: TODO
    funnel_now: TODO
    knows:
      - TODO
    believes_now: TODO
    wants: TODO
    reads_on: TODO
    reader: TODO
    check:
      station: TODO
      rubric: TODO
    source: TODO
    author: TODO
  goal:
    from: TODO
    to: TODO
    next_if_worked: TODO
    change:
      kind: TODO
      text: TODO
    conditions:
      - TODO
    check:
      rubric: TODO
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
