---
hyperspec: "0.1"
title: Hand your first one-on-one to the person you manage
kind: essay
profile: writing
decisions:
  - id: kind
    state: decided
    value: an essay of 700 to 1,100 words for a newsletter read by people in their first year of managing
    source: essay/materials/voice-memo.md
    author: example-author
    chosen_by: human
  - id: agenda-card
    state: decided
    value: the essay ends on the three questions, written so a reader can copy them onto a card
    source: essay/materials/voice-memo.md, the three questions
    author: example-author
    chosen_by: human
  - id: publish-venue
    state: delegated
    rule: publish where the audience block's reads_on line says the reader already is, and nowhere else
    source: publishing checklist
    author: agent:claude
    chosen_by: agent
requirements:
  - id: r1
    text: the opening line tells the reader who sets the agenda of a first one-on-one
    fails_when: a reader shown only the first two sentences cannot say who should set the agenda
    check:
      rubric: show the simulated reader the first two sentences and ask who sets the agenda; pass only on "the report"
    source: essay/goldens/opening.md
    author: example-author
  - id: r2
    text: the three questions appear word for word as the voice memo states them
    fails_when: any of the three questions differs from essay/materials/voice-memo.md by a word
    check:
      station: verbatim match of each question against the voice memo
    source: essay/materials/voice-memo.md
    author: example-author
  - id: r3
    text: every survey figure in the draft matches the verified survey summary
    fails_when: a figure in the draft has no entry in the claims ledger pointing at essay/materials/team-survey.md, or differs from it
    check:
      station: every factual claim in the ledger points at a source span
    source: sourcing pass
    author: agent:claude
  - id: r4
    text: the draft argues only the four claims in the spine, in order
    fails_when: a paragraph advances a point that traces to none of c1 to c4, or c3 lands before c2
    check:
      rubric: map each paragraph to a spine claim; fail on any paragraph that maps to none or out of order
    source: spine interview
    author: example-author
  - id: r5
    text: the draft tells the reader what to do with silence in the meeting
    fails_when: the draft never says to wait after asking a question
    check:
      rubric: ask the simulated reader what to do after asking the first question; pass only on "wait"
    source: essay/materials/interview-notes.md
    author: example-author
  - id: r6
    text: the draft stays inside its length envelope
    fails_when: the word count is under 700 or over 1,100
    check:
      station: word count against form.length
    source: form decision
    author: example-author
rejects:
  - a list of more than three questions
  - advice to use the one-on-one for project status
  - any claim about what most managers do that the survey does not support
  - the walking one-on-one aside from the voice memo
examples:
  - path: essay/goldens/opening.md
    why: the claim lands in the first sentence, and the second sentence turns it into an instruction
resume:
  next_action: outline the four spine claims against the form's required parts, citing the segments each claim points at
feedback:
  issues: https://github.com/SupersuitUp/hyperspec/issues
  fork: MIT; fork it for your own purposes
improvement:
  ledger: essay/runs.jsonl
writing:
  materials:
    items:
      - id: voice-memo
        path: essay/materials/voice-memo.md
        segments: essay/materials/voice-memo.md.segments.jsonl
        produced_by: example-author
        captured: "2026-09-12"
        how: voice memo, transcribed
        trust: raw
      - id: interview
        path: essay/materials/interview-notes.md
        segments: essay/materials/interview-notes.md.segments.jsonl
        produced_by: example-author
        captured: "2026-09-15"
        how: notes taken during a call, reviewed by the person interviewed
        trust: considered
      - id: survey
        path: essay/materials/team-survey.md
        segments: essay/materials/team-survey.md.segments.jsonl
        produced_by: example-author
        captured: "2026-05-30"
        how: survey summary, figures checked against the raw export by a second person
        trust: verified
    check:
      station: every segment of every material carries a label from the closed set, matches its source verbatim, and the markings are current
    source: capture step
    author: agent:claude
  dna:
    writer: example-author
    scope:
      form: essay
      audience: new managers
      purpose: teach
    rules: style-rules.md
    goldens:
      - path: essay/goldens/opening.md
        why: one plain claim, then a second sentence that turns it into something to do
      - path: essay/goldens/close.md
        why: ends on an instruction and gives the reason for it in the same sentence
    check:
      rubric: blind lineup within this scope; a judge shown the generated opening beside the two goldens cannot pick it out
    source: goldens marked on the review page
    author: example-author
  persona:
    identity: self
    stance: mentor
    may_assert:
      - what the author did in their own first one-on-ones and what happened
      - the three questions the author uses now
    will_not_say:
      - a claim about what most managers do, beyond the survey's own figures
      - the name of anyone on the author's team
    facts_from: sources
    check:
      rubric: persona-consistency judge; the mentor stance holds, and no fact appears that is not in the claims ledger
    source: persona interview
    author: example-author
  audience:
    who: someone in their first three months of managing, who was promoted from the team they now lead
    funnel_now: has a first one-on-one with a new report on the calendar this week
    knows:
      - one-on-one
      - report
      - tracker
    believes_now: a one-on-one is where a manager catches up on how the work is going
    wants: a plan for the first meeting that will not waste either person's half hour
    reads_on: a phone, in the ten minutes before the meeting
    reader: person
    check:
      station: term check against knows; any other term is defined on first use
      rubric: simulated reader reports where it got lost and where it stopped reading
    source: audience interview
    author: example-author
  goal:
    from: plans to run the first one-on-one from their own list
    to: hands the first one-on-one to the report and asks the three questions
    next_if_worked: copies the three questions into their calendar invite
    change:
      kind: action
      text: the reader asks the three questions in their next one-on-one and waits after each
    conditions: [r1, r2, r3, r4, r5, r6]
    check:
      rubric: the doctor grades the draft against every condition; the simulated reader is asked whether it would copy the questions now
    source: goal interview
    author: example-author
  form:
    name: essay
    length:
      min: 700
      max: 1100
      unit: words
    required_parts:
      - an opening that states the claim
      - the story of the author's first one-on-one
      - the three questions
      - what to do with the answers
      - a close the reader can act on
    stations:
      - the three questions render as a numbered list
    check:
      station: structure and length check against required_parts and length
    source: form decision
    author: example-author
  spine:
    kind: primer
    claims:
      - id: c1
        text: the first one-on-one is the one meeting where the report should set the agenda
        materials: [voice-memo#s3, interview#s3]
      - id: c2
        text: status belongs in the tracker, and a one-on-one spent on it teaches the manager nothing new
        materials: [voice-memo#s2, voice-memo#s5, survey#s4]
      - id: c3
        text: three questions are enough to hand the meeting over
        materials: [voice-memo#s4]
      - id: c4
        text: the answer worth having comes after a silence the manager does not fill
        materials: [interview#s7, interview#s8]
    check:
      rubric: each claim lands, in order, and the draft argues nothing outside the chain
    source: spine interview
    author: example-author
  sources:
    ledger: essay/claims.jsonl
    unsourced_claim: fail
    check:
      station: every factual claim in the ledger points at a source span; every quote matches its source verbatim
    source: sourcing pass
    author: agent:claude
fiction: false
---

# Hand your first one-on-one to the person you manage

A worked example of the writing profile: an essay for new managers, specified before a word of
it is drafted. Every file this spec names ships beside it. `essay/claims.jsonl` does not exist
yet, because the claims ledger is written during drafting.
