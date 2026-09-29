---
hyperspec: "0.1"
title: What a recipe is for
kind: essay
decisions:
  - id: audience
    state: decided
    value: someone who has never rerun a piece of work from its inputs
    source: materials/notes.md
    author: example-author
    chosen_by: human
  - id: shape
    state: decided
    value: the claims from the calls first, then the terms they lean on
    source: stages.mjs
    author: example-author
    chosen_by: human
requirements:
  - id: every-claim-spoken
    text: every claim is a line someone said on a call
    fails_when: the essay carries a claim that no call transcript contains
    check:
      station: stages.mjs claims() copies lines from the calls and never writes one
    source: materials/call.md
    author: example-author
  - id: more-claims-score-higher
    text: an essay built from more calls carries more claims
    fails_when: compare scores an essay with an added call no higher than its parent
    check:
      rubric: doctor.mjs counts the bullets under the Claims heading
    source: doctor.mjs
    author: example-author
rejects:
  - a claim nobody said on a call
examples:
  - path: materials/call.md
    why: the raw call every claim is copied from, word for word
resume:
  next_action: add the next call with hyperspec regenerate --add-input, then compare the two essays
feedback:
  issues: https://github.com/SupersuitUp/hyperspec/issues
  fork: MIT; fork it for your own purposes
improvement:
  ledger: runs.jsonl
---

# What a recipe is for

The example spec for `examples/recipe/`. The factory builds a short essay from call transcripts
and a set of notes, and writes a recipe beside it.
