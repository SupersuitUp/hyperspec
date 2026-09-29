---
hyperspec: "0.1"
title: What this specifies
kind: essay
decisions:
  - id: audience
    state: decided
    value: the operator, reading on a phone
    source: interview A2
    author: example-author
    chosen_by: human
  - id: length
    state: delegated
    rule: as short as the claim chain allows, never over 1,200 words
    source: design doc, Part 2
    author: agent:claude
    chosen_by: agent
requirements:
  - id: r1
    text: a reader new to the term can say what it means after section one
    fails_when: the simulated reader cannot define the term after section one
    check:
      rubric: ask the simulated reader to define the term; pass only on a correct definition
    source: design doc, audience block
    author: example-author
rejects:
  - hype words about AI
examples:
  - path: goldens/opening.md
    why: the claim lands in the first line and the second line earns it
resume:
  next_action: write the outline from the claim chain
feedback:
  issues: https://github.com/SupersuitUp/hyperspec/issues
  fork: MIT; fork it for your own purposes
improvement:
  ledger: runs.jsonl
---
# Body
