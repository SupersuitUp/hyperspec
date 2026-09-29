// The writing profile's `hyperspec init --profile writing` skeleton.
//
// Every required writing block appears in full, in schema order, with every field present as a
// placeholder value. An operator opening the file is owed the shape of every block inline, not a
// pointer to go read the schema elsewhere. dna, persona, audience and goal also carry an open
// decision (id writing-<block>, the deferral id writing.mjs knows) naming the question that has
// to be answered before the placeholder means anything. The decision and the shape do not
// conflict: the placeholder content already fails its own field rules, so the decision never
// changes whether the spec passes, only what the operator is told to go decide.
//
// Every placeholder scalar in this file is the bare word "TODO". That is load-bearing: str() in
// src/placeholder.mjs treats a value that IS a placeholder word as blank, so every presence check
// on every field here fails on its own, without this file having to pick a field to break per
// block. Without that rule the character block, whose checks are all presence checks, would lint
// clean the moment init wrote it.
//
// Two values are not placeholders. The material item's segments: names the file `hyperspec
// segments init materials/TODO.md` would write, so it follows the path placeholder beside it and
// fails as a segments file that does not exist yet (every material must be marked). And the
// materials check.station is the marking station itself, since that check is the same for every
// writing spec: the linter enforces it, and there is nothing for the operator to decide there.
//
// dna.scope_dir is the one optional field shown, and it is now a real `scope_dir: TODO` like
// every other placeholder here (fix round 1, R2). It used to be shown as a comment: scope_dir is
// optional, so str() blanking a bare TODO reads as "absent", and before R2 a spec filled in
// everywhere else would have passed with the placeholder still sitting there. R2 closed that hole
// with its own check (writing-dna-scope-dir, src/writing-fields.mjs): a scope_dir key that is
// PRESENT with a placeholder-ish value now fails on its own, the same as every other field here,
// so the comment workaround is no longer needed and would only teach a different, non-uniform
// shape for one field.
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
        segments: materials/TODO.md.segments.jsonl
        produced_by: TODO
        captured: TODO
        how: TODO
        trust: TODO
    check:
      station: every segment of every material carries a label from the closed set, matches its source verbatim, and the markings are current
    source: TODO
    author: TODO
  dna:
    writer: TODO
    scope_dir: TODO
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
