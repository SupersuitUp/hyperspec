---
hyperspec: "0.1"
title: A hyperspec is a contract, not a prompt
kind: essay
profile: writing
decisions:
  - id: kind
    state: decided
    value: essay, 600 to 1,200 words
    source: form decision, 2026-09-28
    author: gary-sheng
    chosen_by: human
  - id: publish-venue
    state: delegated
    rule: publish wherever the audience block's reads_on line says they already are
    source: publishing checklist
    author: agent:claude
    chosen_by: agent
requirements:
  - id: r1
    text: a reader who has read one hyperspec can say, in their own words, what makes a spec a hyperspec rather than a prompt
    fails_when: the simulated reader cannot restate the claim after reading the opening
    check:
      rubric: ask the simulated reader to restate the claim; pass only on a correct restatement
    source: goal interview
    author: gary-sheng
  - id: r2
    text: every claim in the draft traces to a source span in the claims ledger
    fails_when: a claim in the draft has no matching entry in the ledger, or a quote does not match its source verbatim
    check:
      station: every factual claim in the ledger points at a source span; every quote matches its source verbatim
    source: sourcing pass
    author: gary-sheng
  - id: r3
    text: the draft stays inside its declared length
    fails_when: the word count falls outside form.length.min to form.length.max
    check:
      station: word count against form.length
    source: form decision, 2026-09-28
    author: gary-sheng
  - id: r4
    text: the draft argues nothing outside its three claims
    fails_when: a paragraph advances a point that traces to none of c1, c2 or c3
    check:
      rubric: each claim lands, in order, and the draft argues nothing outside the chain
    source: spine interview
    author: gary-sheng
  - id: r5
    text: the persona never states a fact that is not in the claims ledger
    fails_when: a sentence in the draft states a fact with no matching ledger entry
    check:
      rubric: persona-consistency judge; no fact appears that is not in the claims ledger
    source: persona interview
    author: gary-sheng
rejects:
  - hype words about AI
  - a claim with no material behind it
examples:
  - path: examples/lede.md
    why: the claim lands in the first line and the second line earns it
resume:
  next_action: write the outline from the claim chain in spine.claims
feedback:
  issues: https://github.com/SupersuitUp/hyperspec/issues
  fork: MIT; fork it for your own purposes
improvement:
  ledger: runs.jsonl
writing:
  materials:
    items:
      - id: m1
        path: materials/call-2026-09-28.md
        segments: materials/call-2026-09-28.md.segments.jsonl
        produced_by: gary-sheng
        captured: "2026-09-28"
        how: voice memo transcript
        trust: raw
    check:
      station: every segment of every material carries a label from the closed set
    source: capture step
    author: agent:claude
  dna:
    writer: example-author
    scope_dir: dna-scope
    scope:
      form: essay
      audience: builders
      purpose: persuade
    rules: WRITING-STYLE.md
    goldens:
      - path: dna-scope/goldens/opening.md
        why: the claim lands in the first line and the second line earns it
    check:
      rubric: blind lineup within this scope; a judge cannot pick the generated passage out from three goldens
    source: writer onboarding notes
    author: gary-sheng
  persona:
    identity: self
    stance: peer
    may_assert:
      - what gary has shipped and measured himself
    will_not_say:
      - a claim about someone else's internal numbers
    facts_from: sources
    check:
      rubric: persona-consistency judge; stance and voice hold, no fact appears that is not in the claims ledger
    source: persona interview
    author: gary-sheng
  audience:
    who: an operator who has read one hyperspec and wants to know whether the next one is worth adopting
    funnel_now: reading the standard's README
    knows:
      - hyperspec
      - lint
    believes_now: a spec is a prompt someone wrote once
    wants: to know whether a writing spec is worth adopting
    reads_on: a phone, in ninety seconds
    reader: person
    check:
      station: term check against knows
      rubric: simulated reader reports where it got lost and where it stopped
    source: audience interview
    author: gary-sheng
  goal:
    from: believes a spec is a prompt someone wrote once
    to: believes a spec is a contract a linter can check
    next_if_worked: reads the schema section
    change:
      kind: belief
      text: a hyperspec is a contract, not a prompt
    conditions: [r1, r2, r3, r4, r5]
    check:
      rubric: the doctor grades the draft against every condition; the simulated reader is asked whether it would take the next step now
    source: goal interview
    author: gary-sheng
  form:
    name: essay
    length:
      min: 600
      max: 1200
      unit: words
    required_parts:
      - claim
      - evidence
      - close
    stations: []
    check:
      station: structure and length check against required_parts and length
    source: form decision, 2026-09-28
    author: gary-sheng
  spine:
    kind: thesis
    claims:
      - id: c1
        text: a hyperspec is a contract a linter can check, not a prompt someone wrote once
        materials: [m1]
      - id: c2
        text: the nine tests generalize to a profile without adding a tenth
        materials: [m1]
      - id: c3
        text: progress is derived from disk, never stored
        materials: [m1]
    check:
      rubric: each claim lands, in order, and the draft argues nothing outside the chain
    source: spine interview
    author: gary-sheng
  sources:
    ledger: essay.claims.jsonl
    unsourced_claim: fail
    check:
      station: every factual claim in the ledger points at a source span; every quote matches its source verbatim
    source: sourcing pass
    author: gary-sheng
fiction: false
---
# A hyperspec is a contract, not a prompt
