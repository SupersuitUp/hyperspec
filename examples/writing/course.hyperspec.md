---
hyperspec: "0.1"
title: "Bread from zero: a four-lesson course"
kind: course
profile: writing
decisions:
  - id: kind
    state: decided
    value: a course of four lessons in two parts, for someone who has never baked a loaf
    source: course/materials/brief.md
    author: example-author
    chosen_by: human
  - id: lesson-shape
    state: decided
    value: every lesson opens with what the reader can do after it and the terms it defines, and ends with one thing to do in a kitchen
    source: course/materials/brief.md, the paragraph on ending each lesson
    author: example-author
    chosen_by: human
  - id: part-files
    state: delegated
    rule: one file per part, named part-<n>.md, so a new part is picked up by the files pattern without editing the spec
    source: course layout
    author: agent:claude
    chosen_by: agent
requirements:
  - id: r1
    text: no lesson uses a term before the lesson that defines it
    fails_when: the sequence station reports a term used before it is defined
    check:
      station: sequence station, order guard
    source: course/materials/brief.md
    author: example-author
  - id: r2
    text: every term is defined in exactly one lesson
    fails_when: the sequence station reports a term defined twice
    check:
      station: sequence station, defined-once guard
    source: lesson-shape decision
    author: example-author
  - id: r3
    text: every lesson carries its three sections
    fails_when: a lesson has no "After this lesson you can", "New terms" or "Try this" section
    check:
      station: sequence station, sections guard
    source: lesson-shape decision
    author: example-author
  - id: r4
    text: each lesson defines the terms the outline promises for it
    fails_when: the outline promises a term in a lesson that does not define it
    check:
      station: sequence station, outline guard
    source: course/outline.md
    author: example-author
  - id: r5
    text: every Try this can be done in a home kitchen in one day, apart from the starter, which takes a week
    fails_when: a Try this needs equipment beyond a bowl, a scale, a jar, an oven and a heavy pot
    check:
      rubric: list what each Try this needs; fail on anything outside that list
    source: course/materials/brief.md
    author: example-author
rejects:
  - a recipe before the reader has the words to follow it
  - a term used before the lesson that defines it
examples:
  - path: course/goldens/lesson.md
    why: an instruction, then the reader's likely worry named plainly, then what to do next
resume:
  next_action: bake the course's two loaves from Lesson 3 and photograph their crumb for Lesson 4
feedback:
  issues: https://github.com/SupersuitUp/hyperspec/issues
  fork: MIT; fork it for your own purposes
improvement:
  ledger: course/runs.jsonl
writing:
  materials:
    items:
      - id: brief
        path: course/materials/brief.md
        segments: course/materials/brief.md.segments.jsonl
        produced_by: example-author
        captured: "2026-09-20"
        how: written after teaching the class twice
        trust: considered
    check:
      station: every segment of every material carries a label from the closed set, matches its source verbatim, and the markings are current
    source: capture step
    author: agent:claude
  dna:
    writer: example-author
    scope:
      form: course
      audience: first-time bakers
      purpose: teach
    rules: style-rules.md
    goldens:
      - path: course/goldens/lesson.md
        why: an instruction, then the reader's likely worry named plainly, then what to do next
    check:
      rubric: blind lineup within this scope
    source: goldens marked on the review page
    author: example-author
  persona:
    identity: self
    stance: guide
    may_assert:
      - what the author saw go wrong when teaching the class
    will_not_say:
      - a bake time or temperature for an oven the author has not used
    facts_from: sources
    check:
      rubric: persona-consistency judge
    source: persona interview
    author: example-author
  audience:
    who: someone who has never baked a loaf of bread
    funnel_now: has bought flour and has never used it for bread
    knows:
      - flour
      - oven
    believes_now: bread takes a recipe and a lot of skill
    wants: to bake one good loaf
    reads_on: a tablet propped up in the kitchen
    reader: person
    check:
      station: the sequence station defines every term before it is used
      rubric: simulated reader reports where it got lost
    source: audience interview
    author: example-author
  goal:
    from: has never baked bread
    to: bakes a loaf and reads its crumb
    next_if_worked: starts a starter the day they finish Lesson 2
    change:
      kind: action
      text: the reader bakes their first loaf
    conditions: [r1, r2, r3, r4, r5]
    check:
      rubric: the doctor grades the course against every condition
    source: goal interview
    author: example-author
  form:
    name: course
    length:
      min: 400
      max: 1500
      unit: words
    required_parts:
      - "Part 1: Dough"
      - "Part 2: The bake"
    stations:
      - the sequence station
    sequence:
      unit: Lesson
      files:
        - course/part-*.md
      sections:
        - After this lesson you can
        - New terms
        - Try this
      terms_section: New terms
      outline: course/outline.md
      teaser: Next,
    check:
      station: structure and length, then the sequence station
    source: form decision
    author: example-author
  spine:
    kind: primer
    claims:
      - id: c1
        text: a first-time baker needs four words before any recipe
        materials: [brief#s2]
      - id: c2
        text: the order is water and flour, then the rise, then shaping, then the oven
        materials: [brief#s3]
      - id: c3
        text: each lesson ends with something to do in a real kitchen
        materials: [brief#s4, brief#s5]
    check:
      rubric: each claim lands, in order
    source: spine interview
    author: example-author
  sources:
    ledger: course/claims.jsonl
    unsourced_claim: fail
    check:
      station: every factual claim in the ledger points at a source span
    source: sourcing pass
    author: agent:claude
fiction: false
---

# Bread from zero

A worked example of a sequential work: a course of four lessons in two parts, one file per part.
The spec lists the parts as `course/part-*.md`, so `check` needs no `--draft`: the parts, joined
in order, are the draft.

```bash
npx @supersuit/hyperspec check course.hyperspec.md
```

The `sequence` station holds the course to what a reader of Lesson 3 depends on: Lessons 1 and 2
defined every word it uses. The outline in `course/outline.md` promises the terms each lesson
defines, and the station checks the lessons keep that promise.
