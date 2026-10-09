---
hyperspec: "0.1"
title: "A short course: the decisions every course in this library shares"
kind: form
profile: writing
decisions:
  - id: lesson-shape
    state: decided
    value: every lesson opens with what the reader can do after it and the terms it defines, and ends with one thing to do
    source: ../course/materials/brief.md, the paragraph on ending each lesson
    author: example-author
    chosen_by: human
  - id: one-page-first
    state: decided
    value: one page before the first lesson gives the whole course at a glance, for a reader deciding whether to start it
    source: form review, after two courses were read by people who stopped before Lesson 1
    author: example-author
    chosen_by: human
requirements:
  - id: front-page
    text: the course opens with its one-page summary, before the first lesson
    fails_when: the sequence station reports station-sequence-front-matter-missing or station-sequence-front-matter-order
    check:
      station: sequence station, front matter guard
    source: one-page-first decision
    author: example-author
  - id: sections
    text: every lesson carries its three sections
    fails_when: a lesson has no "After this lesson you can", "New terms" or "Try this" section
    check:
      station: sequence station, sections guard
    source: lesson-shape decision
    author: example-author
  - id: defined-before-use
    text: no lesson uses a term before the lesson that defines it
    fails_when: the sequence station reports a term used before it is defined
    check:
      station: sequence station, order guard
    source: lesson-shape decision
    author: example-author
  - id: defined-once
    text: every term is defined in exactly one lesson
    fails_when: the sequence station reports a term defined twice
    check:
      station: sequence station, defined-once guard
    source: lesson-shape decision
    author: example-author
rejects:
  - a lesson that leans on a word a later lesson defines
  - a summary page that needs a word the reader has not been taught, unless it says what the word means in the same sentence
examples:
  - path: ../course/goldens/lesson.md
    why: an instruction, then the reader's likely worry named plainly, then what to do next
resume:
  next_action: hold a second course to this form, and move each decision that course has to fight either into the form or out of it
feedback:
  issues: https://github.com/SupersuitUp/hyperspec/issues
  fork: MIT; fork it for your own purposes
improvement:
  ledger: runs.jsonl
writing:
  dna:
    rules: ../style-rules.md
    check:
      rubric: blind lineup within the course's own scope
    source: the library's style rules; each course marks its own goldens
    author: example-author
  persona:
    identity: self
    stance: guide
    may_assert:
      - what the author saw go wrong when teaching the subject
    will_not_say:
      - a step the author has not done with their own hands
    facts_from: sources
    check:
      rubric: persona-consistency judge
    source: persona interview
    author: example-author
  form:
    name: course
    stations:
      - the sequence station
    sequence:
      sections:
        - After this lesson you can
        - New terms
        - Try this
      terms_section: New terms
      front_matter:
        - This course on one page
    check:
      station: structure and length, then the sequence station
    source: form decision
    author: example-author
  sources:
    unsourced_claim: fail
    check:
      station: every factual claim in the ledger points at a source span
    source: sourcing pass
    author: agent:claude
fiction: false
---

# A short course

A worked example of a form spec: the decisions every course in this library shares, written once
and held to every course that names it. A course spec adds one line,
`form: forms/course.form.hyperspec.md`, and fills only what this file leaves open: its materials,
its readers and what it changes for them, its length and its files, its argument, and where its
claims are kept.

Every course opens with one page before Lesson 1 (`front_matter`), and every lesson carries the
same three sections. Lists accumulate, so a course adds its own requirements, rejects and
`may_assert` lines after these. A value set here is binding: a course that sets one differently
fails lint with `form-contradiction`.
