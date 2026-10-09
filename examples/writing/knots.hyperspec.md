---
hyperspec: "0.1"
title: "Two knots: a course built on a form"
kind: course
form: forms/course.form.hyperspec.md
decisions:
  - id: two-knots
    state: decided
    value: two lessons in one file, the reef knot and then the bowline, for someone who has never tied a knot on purpose
    source: knots/materials/brief.md
    author: example-author
    chosen_by: human
requirements:
  - id: one-rope
    text: every Try this needs one rope and nothing else, a chair leg aside
    fails_when: a Try this asks for anything besides a rope and something to tie it around
    check:
      rubric: list what each Try this needs; fail on anything but a rope and a fixed point
    source: knots/materials/brief.md
    author: example-author
rejects:
  - a knot taught from a picture alone, with no words for the parts of the rope
resume:
  next_action: tie both knots from the course's own words with a rope in hand, and rewrite any step that needed a picture
feedback:
  issues: https://github.com/SupersuitUp/hyperspec/issues
  fork: MIT; fork it for your own purposes
improvement:
  ledger: knots/runs.jsonl
writing:
  materials:
    items:
      - id: brief
        path: knots/materials/brief.md
        segments: knots/materials/brief.md.segments.jsonl
        produced_by: example-author
        captured: "2026-10-09"
        how: written after teaching two friends to sail
        trust: considered
    check:
      station: every segment of every material carries a label from the closed set, matches its source verbatim, and the markings are current
    source: capture step
    author: agent:claude
  dna:
    writer: example-author
    scope:
      form: course
      audience: people new to rope
      purpose: teach
    goldens:
      - path: knots/goldens/lesson.md
        why: the step, then the mistake a beginner makes on it, then how to put it right
  persona:
    may_assert:
      - which knot the author reaches for on a boat, and why
  audience:
    who: someone who has never tied a knot on purpose
    funnel_now: has a length of rope and two knots to learn before a sailing trip
    knows:
      - rope
      - loop
    believes_now: knots are a matter of memorizing pictures
    wants: two knots they can tie without looking
    reads_on: a phone, with a rope in the other hand
    reader: person
    check:
      station: the sequence station defines every term before it is used
      rubric: simulated reader reports where it got lost
    source: audience interview
    author: example-author
  goal:
    from: ties a granny knot and hopes
    to: ties a reef knot and a bowline, and can tell each is right
    next_if_worked: ties a bowline around their own waist before the trip
    change:
      kind: action
      text: the reader ties both knots without looking at a picture
    conditions: [front-page, sections, defined-before-use, defined-once, one-rope]
    check:
      rubric: the doctor grades the course against every condition
    source: goal interview
    author: example-author
  form:
    length:
      min: 300
      max: 700
      unit: words
    required_parts:
      - Two knots
    sequence:
      files:
        - knots/course.md
  spine:
    kind: primer
    claims:
      - id: c1
        text: a beginner needs the names of the parts of the rope before any knot
        materials: [brief#s2]
      - id: c2
        text: the join comes first, then the loop
        materials: [brief#s3]
      - id: c3
        text: each lesson ends with the knot tied without looking
        materials: [brief#s4, brief#s5]
    check:
      rubric: each claim lands, in order
    source: spine interview
    author: example-author
  sources:
    ledger: knots/claims.jsonl
---

# Two knots

A worked example of a work built on a form. `form:` names
`forms/course.form.hyperspec.md`, and every command reads this spec merged with it: the form's
decisions, requirements and rejects come first and this spec's are added after them, the form's
persona, lesson shape and one-page front matter apply here unchanged, and this spec fills what
the form leaves open. It writes no `profile:` and no `fiction:`, because the form sets both.

```bash
npx @supersuit/hyperspec check knots.hyperspec.md
```
