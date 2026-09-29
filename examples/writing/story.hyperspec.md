---
hyperspec: "0.1"
title: The Rye
kind: short story
profile: writing
decisions:
  - id: point-of-view
    state: decided
    value: first person, told by Theo, in the past tense
    source: story/materials/notes.md
    author: example-author
    chosen_by: human
  - id: time-span
    state: decided
    value: one morning, 3:40 to 7:00, in the four scenes of the scene list and in that order
    source: story/materials/scene-list.md
    author: example-author
    chosen_by: human
  - id: bakery-name
    state: delegated
    rule: the bakery is never named; it is always "the bakery" or "Ines's"
    source: editor's note on the scene list
    author: agent:claude
    chosen_by: agent
requirements:
  - id: r1
    text: the two voices cannot be confused
    fails_when: a judge shown ten lines of dialogue with the speaker hidden names the wrong speaker for more than one of them
    check:
      rubric: blind attribution test across both characters, ten lines drawn at random from the draft
    source: story/materials/notes.md
    author: example-author
  - id: r2
    text: no one says what they could not know yet
    fails_when: Theo mentions the sale before scene-3, or Ines mentions the school before scene-4
    check:
      station: knowledge-leak check of every line against each character's knowledge timeline
    source: story/materials/scene-list.md
    author: example-author
  - id: r3
    text: the bakery's process matches a real working morning
    fails_when: a proofing time, the tray turn, or the opening time differs from story/materials/bakery-visit.md
    check:
      station: every process detail in the claims ledger points at a span of the bakery visit notes
    source: story/materials/bakery-visit.md
    author: agent:claude
  - id: r4
    text: the story is the four scenes of the scene list, in order
    fails_when: the draft has more or fewer than four scenes, or they run out of the scene list's order
    check:
      station: structure check against story/materials/scene-list.md
    source: story/materials/scene-list.md
    author: example-author
  - id: r5
    text: the last line is about bread
    fails_when: the final sentence names a feeling, or does not mention bread, dough, flour or the starter
    check:
      rubric: read the final sentence; fail if it names an emotion or mentions none of bread, dough, flour or the starter
    source: story/materials/notes.md
    author: example-author
  - id: r6
    text: the story stays inside its length envelope
    fails_when: the word count is under 2,500 or over 4,000
    check:
      station: word count against form.length
    source: editor's brief
    author: example-author
rejects:
  - either character saying out loud that they love or will miss the other
  - a flashback outside the one morning
  - a scene where the oven noise is explained
  - an ending that tells the reader what the starter jar means
examples:
  - path: story/goldens/dialogue.md
    why: three short lines carry a ritual both characters know, without either of them naming it
resume:
  next_action: hand story/draft.md to the doctor for the rubric checks in r1 and r5, now that hyperspec check passes it
feedback:
  issues: https://github.com/SupersuitUp/hyperspec/issues
  fork: MIT; fork it for your own purposes
improvement:
  ledger: story/runs.jsonl
writing:
  materials:
    items:
      - id: notes
        path: story/materials/notes.md
        segments: story/materials/notes.md.segments.jsonl
        produced_by: example-author
        captured: "2026-08-20"
        how: typed notes
        trust: raw
      - id: bakery-visit
        path: story/materials/bakery-visit.md
        segments: story/materials/bakery-visit.md.segments.jsonl
        produced_by: example-author
        captured: "2026-08-28"
        how: notes taken on site, corrected by the bakery owner afterwards
        trust: considered
      - id: scene-list
        path: story/materials/scene-list.md
        segments: story/materials/scene-list.md.segments.jsonl
        produced_by: example-author
        captured: "2026-09-02"
        how: scene list agreed with the editor
        trust: considered
    check:
      station: every segment of every material carries a label from the closed set, matches its source verbatim, and the markings are current
    source: capture step
    author: agent:claude
  dna:
    writer: example-author
    scope:
      form: short story
      audience: literary magazine readers
      purpose: move
    rules: style-rules.md
    goldens:
      - path: story/goldens/opening.md
        why: the narrator's voice arrives through one concrete sound, and the sentence about the mixer tells you how he sees the world
      - path: story/goldens/dialogue.md
        why: the narration between lines says only what Theo notices, never what Ines feels
    check:
      rubric: blind lineup within this scope; a judge shown a generated passage beside the two goldens cannot pick it out
    source: goldens marked on the review page
    author: example-author
  persona:
    identity: character:theo
    stance: witness
    may_assert:
      - what Theo sees, hears and does in the bakery that morning
      - what Theo knows as of the current scene, per his knowledge timeline
    will_not_say:
      - what Ines is thinking or feeling
      - anything Theo does not know yet at that point in the morning
    facts_from: sources
    check:
      rubric: persona-consistency judge; Theo's narration stays a witness's, and no process detail appears that is not in the claims ledger
    source: persona interview
    author: example-author
  audience:
    who: readers of a quarterly literary magazine who read short fiction in print
    funnel_now: has turned to the story in the magazine without knowing the author
    knows:
      - bakery
      - apprentice
      - sourdough
    terms:
      - proof
      - starter
      - deck oven
    believes_now: nothing yet about this author or these two people
    wants: a story they can finish in one sitting and keep thinking about
    reads_on: print, in one sitting of about fifteen minutes
    reader: person
    check:
      station: term check against knows; proof, starter and deck oven are made plain by context on first use
      rubric: simulated reader reports where it got lost and where it stopped reading
    source: editor's brief
    author: example-author
  goal:
    from: has never read the author
    to: finishes the story and remembers the starter jar
    next_if_worked: looks for the author's other stories
    change:
      kind: feeling
      text: the reader feels the handover of the starter jar as the moment the two say what neither says aloud
    conditions: [r1, r2, r3, r4, r5, r6]
    check:
      rubric: the doctor grades the draft against every condition; the simulated reader is asked what the starter jar meant and whether it would look for the author's next story
    source: goal interview
    author: example-author
  form:
    name: short story
    length:
      min: 2500
      max: 4000
      unit: words
    required_parts:
      - "3:40"
      - "4:30"
      - "5:50"
      - "6:55"
    stations:
      - continuity against the scene list
      - knowledge-leak check, per character, per scene
    check:
      station: structure and length check against required_parts and length
    source: editor's brief
    author: example-author
  spine:
    kind: story
    claims:
      - id: c1
        text: each of them hides their news to protect the other, and the hiding is the thing they share
        materials: [notes#s2, scene-list#s10, scene-list#s12]
      - id: c2
        text: people who love each other at work say it through the work
        materials: [notes#s5, bakery-visit#s8, scene-list#s8]
      - id: c3
        text: a craft outlives the room it was practiced in
        materials: [notes#s5, scene-list#s13]
    check:
      rubric: each claim lands, in order, through what the characters do, and the story argues nothing outside the chain
    source: spine interview
    author: example-author
  sources:
    ledger: story/claims.jsonl
    unsourced_claim: fail
    check:
      station: every process detail in the ledger points at a source span; every quote matches its source verbatim
    source: sourcing pass
    author: agent:claude
  characters:
    - id: ines
      speech:
        uses:
          - instructions in the imperative
          - numbers, weights and times
          - first names, for customers
        never:
          - an apology in words
          - a sentence about her own feelings
          - a question she does not need answered
        rhythm: short, flat sentences, often without a subject; silence where another person would reassure
      wants: to leave the bakery in hands she trusts, without having to say that she is leaving it
      fears: that Theo will stay in a trade with no bakery to do it in, because of her
      hides: that she sold the bakery two weeks ago
      knowledge:
        - by: scene-1
          knows: the sale closes on Friday, and the new owners will not keep it a bakery
        - by: scene-4
          knows: Theo has a place at a baking school in another city and leaves in the autumn
      relationships:
        - to: theo
          how: gives him instructions where another person would give praise
        - to: customers
          how: warm and unhurried, asks after their families by name
      arc_state: has let go of the bakery, and has not yet let go of Theo
      golden_lines:
        - Flour first. Then you can talk.
        - Left side runs hot. Turn them at eight minutes.
        - Sold means sold. Shape the rye.
      rejected_lines:
        - I'm so sorry I didn't tell you sooner, Theo.
        - This place has been my whole life, you know?
        - Would you like to try the rye today?
      check:
        rubric: blind attribution test, knowledge-leak check against the timeline, consistency against golden and rejected lines
      source: story/materials/notes.md
      author: example-author
    - id: theo
      speech:
        uses:
          - questions he already knows the answer to
          - hedges such as "I mean" and "kind of"
          - a joke when he is nervous
        never:
          - a flat instruction
          - a word of baking jargon he has not heard Ines use first
        rhythm: long sentences that double back on themselves and end in a question
      wants: Ines to tell him he is ready, in words, once
      fears: that leaving for school is a betrayal of the person who taught him
      hides: that he has a place at a baking school in another city and leaves in the autumn
      knowledge:
        - by: scene-1
          knows: the oven has made the noise since March, and he leaves for school in the autumn
        - by: scene-3
          knows: the bakery is sold, and the new owners will not keep it a bakery
      relationships:
        - to: ines
          how: asks questions to keep her talking, and never interrupts her while she shapes
      arc_state: still acting the apprentice while privately already leaving
      golden_lines:
        - Okay but like, if the oven's made that noise since March, is it a noise, or is that just how the oven talks now?
        - I can do the rye. I mean, I think I can do the rye. I did it Tuesday, kind of.
        - So is that a yes, or is that the face you make when it's a yes?
      rejected_lines:
        - Shape the rye.
        - I have been accepted to a culinary program and will be leaving in the autumn.
        - Left side runs hot, turn them early.
      check:
        rubric: blind attribution test, knowledge-leak check against the timeline, consistency against golden and rejected lines
      source: story/materials/notes.md
      author: example-author
fiction: true
---

# The Rye

A worked example of the writing profile for fiction: a short story with two characters, each
specified well enough that an agent can write their dialogue and a judge can tell them apart.
Every file this spec names ships beside it. The draft is `story/draft.md`, and the claims ledger
written while drafting it is `story/claims.jsonl`: every process detail in the draft, pointed at
the bakery visit notes. The draft passes every deterministic station:

```bash
npx @supersuit/hyperspec check story.hyperspec.md --draft story/draft.md
```

The four required parts are the scene headings, one per scene of the scene list, in its order.
The dialogue carries no quotation marks. None of the story's materials holds a quote segment, and
the quotes station holds every quoted span of four words or more to a marked quote, so the
characters speak without them.
