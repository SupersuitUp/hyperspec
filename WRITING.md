# The writing profile

A hyperspec for a piece of writing. An essay, a chapter, a letter, a story: anything an agent
drafts and a person reads.

Writing is where the average does the most damage. Asked for "an essay on X", an agent fills
every gap you left with the most typical choice: the typical reader, the typical argument, the
typical voice. Each choice is reasonable and the sum reads like nobody in particular wrote it.
The writing profile names the gaps a piece of writing has, so each one is filled on purpose, by
someone you can name, and checked before a draft reaches you.

A profile adds rules for one kind of work without adding a test. Every writing finding reports
under one of the nine tests in [SPEC.md](SPEC.md), with an id that starts `writing-`, and the
score is still out of nine. Everything in the core format (decisions, requirements, rejects,
examples, resume, feedback, improvement) still applies and is still linted.

## Opting in

Add `profile: writing` at the top level of the frontmatter, and a `writing:` map holding the
blocks. `hyperspec lint` then prints one more line under the score:

```
essay.hyperspec.md: pass (9/9)
  writing: 9/9 blocks complete
```

A block counts as complete when it is present with no failing finding. `characters` also counts
as complete when the piece is not fiction, since nothing requires it. A block deferred to a
decision (see [Deferring a block](#deferring-a-block)) does not count as complete, because
nothing has been written in it yet. `--json` carries the same count on each file as
`"profile": { "name": "writing", "complete": 9, "total": 9 }`.

A `profile:` this linter does not know is a warning under test 7, naming the profile and saying
its rules were not checked.

## The ten components

These are the parts you cannot remove without the writing sliding back to the middle. Nine are
blocks under `writing:`. The tenth, progress, is deliberately never written down.

### 1. Materials: what goes in, and how it is marked

Brain dumps, transcripts, interview answers, notes, prior pieces, research. Each material
records who produced it, when it was captured, how, and how far it can be trusted: `raw` for
thinking out loud, `considered` for something someone has reviewed, `verified` for something
checked against its source. A brain dump is the most valuable input and the least structured, so
marking it is the step that turns thinking into something an agent can cite. Each material is
split into segments and each segment gets a label saying what it may be used as (see
[Materials labels](#materials-labels)).

### 2. Writer DNA: who is writing, and how they sound, for this purpose

A writer does not have one voice. The same person writes differently for a theology journal and
a landing page, so their DNA is scoped by **form, audience and purpose**, and the scope is the
whole design of this block.

- **Rules** are the one layer that applies everywhere: what the writer never does and always
  does. They live in your style rules file, and every piece in every scope points at it.
- **Goldens** are real passages the writer has marked as right, each filed under its scope. A
  golden feeds only work that shares that scope, so a sermon golden can never leak into a sales
  email.
- **Every golden carries a note on why it is golden.** A golden without its reason teaches the
  surface; the reason teaches the move.

DNA is proven by a blind lineup within its scope: a judge sees a generated passage beside real
goldens of the same kind and tries to pick it out. Every writer has their own DNA, and nobody's
scope feeds anybody else's.

### 3. Persona: who the piece speaks as

The identity the piece speaks as (the writer as themselves, a role, or a character), its stance
toward the reader, what it may assert, and what it will not say. Research on persona prompting
finds that a persona shapes voice and alignment and can cost accuracy
([PRISM](https://arxiv.org/html/2603.18507v1)), so here the persona governs voice and stance only.
**Facts come from marked sources, never from the persona.** That separation is a field,
`facts_from: sources`, and the linter refuses any other value.

The persona is recorded in the spec, where it belongs. The piece itself says nothing to the
reader about who is writing.

### 4. Audience: who is reading

A named person or a specified archetype: where they are on their path right now, which words
they already have, what they believe now, what they want, where they will read it (a phone in
ninety seconds, aloud, in print), and whether the reader is a person or another agent. Checked
by a term station (every word outside their vocabulary is defined on first use) and by a
simulated reader, a model playing that exact reader, which reports where it got lost and where
it would have stopped.

### 5. Goal: what the piece changes

The one step down the funnel: where this reader is now, where the piece moves them, and what
they do next if it worked. Then the change that step needs in them (a belief, an action or a
feeling), and five to ten requirements that would prove it happened, each written to be failable.
This is the block a grader works against, and the simulated reader is asked the one question that
matters: would you take the next step now?

### 6. Form: what kind of thing it is

Essay, chapter, wiki article, email, text, talk, letter, story. A form supplies its required
parts, its length envelope, and any extra checks it needs: a chapter checks continuity with the
chapters around it, a wiki article checks its links, a text message checks bubble length.

### 7. Spine: what it argues

The kind of argument (thesis, testimony, primer, letter, story; the set is open) and the claim
chain: the three to seven claims the piece has to land, in order, each pointing at the materials
that support it.

### 8. Sources and claims: what lets another agent pick it up

A claims ledger beside the piece: every factual claim in the draft points at a source and the
span in it, and every quote is matched word for word against its source. A writer's own brain
dump counts as a source for their opinions and their stories, never for an outside fact. By
default a claim with no source fails the check rather than passing with a warning.

### 9. Characters: everyone who speaks inside the work

The persona is who the piece speaks as. A character is someone who speaks inside it, and the
same rules apply one level down. Required when `fiction: true`. Each character carries:

- **Speech DNA**: the words they use, the ones they never would, and their rhythm.
- **Wants, fears, and the thing they hide**, because dialogue is someone trying to get something
  while hiding something.
- **What they know, and when.** A knowledge timeline by chapter or scene, so a character never
  says what they could not know yet. This is the most common way generated dialogue breaks a
  story, and it is fully checkable.
- **How they speak to each person that matters**, since speech shifts by relationship.
- **Arc state**: where they are in their change at this point in the work.
- **Golden lines and rejected lines**: real lines that sound exactly like them, and lines that
  sound close but wrong.

Checked by a blind attribution test (a judge sees a line with the speaker hidden and has to name
who said it), a knowledge-leak check against the timeline, and a consistency check against the
golden and rejected lines. If your characters already live as entities in a world database, the
optional `entity` field points at that record, so one record can say how a character looks and
how they speak.

### 10. Progress: where it is

Derived from disk, never stored. Which blocks are filled, which drafts exist, which checks
passed, what the last review said, and the next action are all things a second agent can read
off the folder itself. A saved progress field goes stale the first time a session dies mid-arc,
and from then on it lies to every agent that trusts it. So the linter refuses one: a
`writing.progress` key fails test 7, and `resume.next_action` stays the only thing the spec
says about what happens next.

## The schema

Every field below is required unless its comment says otherwise, and a required list needs at
least one entry. A path resolves relative to the spec file, the same way `examples` does, and a
path the linter checks must name a file that exists.

```yaml
profile: writing
fiction: false                       # true requires writing.characters
writing:
  materials:
    items:                           # at least one
      - id: voice-memo               # unique across items
        path: materials/voice-memo.md
        produced_by: example-author
        captured: "2026-09-12"
        how: voice memo, transcribed
        trust: raw                   # raw | considered | verified
    check:
      station: every segment of every material carries a label from the closed set
    source: capture step
    author: agent:claude
  dna:
    writer: example-author
    scope:
      form: essay
      audience: new managers
      purpose: teach
    rules: style-rules.md            # your style rules file, the always-on layer
    goldens:                         # at least one
      - path: goldens/opening.md
        why: one plain claim, then a second sentence that turns it into something to do
    check:
      rubric: blind lineup within this scope
    source: goldens marked on the review page
    author: example-author
  persona:
    identity: self                   # self | role:<name> | character:<id>
    stance: mentor                   # peer | mentor | witness | guide; anything else warns
    may_assert:
      - what the author did in their own first one-on-ones
    will_not_say:
      - the name of anyone on the author's team
    facts_from: sources              # must be exactly "sources"
    check:
      rubric: persona-consistency judge
    source: persona interview
    author: example-author
  audience:
    who: someone in their first three months of managing
    funnel_now: has a first one-on-one on the calendar this week
    knows:
      - one-on-one
      - report
    believes_now: a one-on-one is where a manager catches up on the work
    wants: a plan for the first meeting
    reads_on: a phone, in the ten minutes before the meeting
    reader: person                   # person | agent
    check:
      station: term check against knows
      rubric: simulated reader reports where it got lost
    source: audience interview
    author: example-author
  goal:
    from: plans to run the meeting from their own list
    to: hands the meeting to the report
    next_if_worked: copies the three questions into the invite
    change:
      kind: action                   # belief | action | feeling
      text: the reader asks the three questions and waits
    conditions:                      # 5 to 10 ids of top-level requirements
      - r1
      - r2
      - r3
      - r4
      - r5
    check:
      rubric: grade the draft against every condition
    source: goal interview
    author: example-author
  form:
    name: essay                      # open set
    length:
      min: 700
      max: 1100
      unit: words
    required_parts:
      - an opening that states the claim
      - the three questions
      - a close
    stations:                        # may be empty
      - the three questions render as a numbered list
    check:
      station: structure and length check
    source: form decision
    author: example-author
  spine:
    kind: primer                     # open set
    claims:                          # 3 to 7, in order
      - id: c1
        text: the first one-on-one is the one meeting the report should set the agenda for
        materials:                   # ids from materials.items; voice-memo#segment is accepted
          - voice-memo
      - id: c2
        text: status belongs in the tracker
        materials:
          - voice-memo
      - id: c3
        text: three questions are enough to hand the meeting over
        materials:
          - voice-memo
    check:
      rubric: each claim lands, in order, and nothing is argued outside the chain
    source: spine interview
    author: example-author
  sources:
    ledger: claims.jsonl             # need not exist before drafting
    unsourced_claim: fail            # fail | warn; warn is reported as a warning
    check:
      station: every factual claim points at a source span
    source: sourcing pass
    author: agent:claude
  characters:                        # required when fiction: true
    - id: ines
      entity: world/ines.json        # optional; if given, the file must exist
      speech:
        uses:
          - instructions in the imperative
        never:
          - an apology in words
        rhythm: short, flat sentences # optional
      wants: to leave the bakery in hands she trusts
      fears: that he will stay in a trade with no bakery to do it in
      hides: that she sold the bakery two weeks ago
      knowledge:                     # at least one; each entry needs by and knows
        - by: scene-1
          knows: the sale closes on Friday
      relationships:                 # optional
        - to: theo
          how: gives him instructions where another person would give praise
      arc_state: has let go of the bakery, and has not yet let go of him
      golden_lines:                  # at least one
        - Flour first. Then you can talk.
      rejected_lines:                # at least one
        - I'm so sorry I didn't tell you sooner.
      check:
        rubric: blind attribution test, knowledge-leak check, consistency against golden and rejected lines
      source: notes.md
      author: example-author
```

Every block, and every character, carries `check` (with `station:` for a deterministic check or
`rubric:` for what a grader applies, the same shape a requirement's check has), `source` and
`author`. `characters` is a list, so there each entry carries its own.

Write every map in block style, one key per line, as above. The YAML reader hyperspec uses reads
a flow list such as `[r1, r2]`, but it reads an inline map such as `{ station: ... }` as a plain
string, and a flow list followed by a comment on the same line as a string too.

A value that is only `TODO`, `TBD`, `FIXME`, `XXX` or `placeholder` counts as missing, here and
everywhere else in a hyperspec, so a scaffolded field cannot pass a presence check. Real text
that starts with one of those words, such as `TODO: write the opening`, counts as present.

## The test mapping

Each row lists what the writing profile adds to that test. The core conditions in
[SPEC.md](SPEC.md#the-test-to-field-map) still apply alongside them.

| Test | A writing spec fails it when |
|---|---|
| 1 every decision is accounted for | a required block is missing and not deferred; a required field is missing; a closed-set value is outside its set (`trust`, `reader`, `change.kind`, the shape of `identity`, `unsourced_claim`); `identity: character:<id>` names a character that is not in `writing.characters`; two materials share an id; `form.length.min` or `max` is not a number, or `min` is greater than `max`; `spine.claims` has fewer than three or more than seven claims; a character has no knowledge entry, or an entry lacks `by` or `knows`. A `stance` outside the four is a warning, and so is `unsourced_claim: warn` |
| 2 every requirement can fail | `goal.conditions` lists fewer than five or more than ten ids, or names an id that is not a top-level requirement |
| 3 every requirement names its check | a block or a character has no `check` with a `station` or a `rubric` |
| 4 every field says where it came from and who wrote it | a block or a character has no `source` or no `author`; a spine claim names no materials, or names a material id that is not in `materials.items` |
| 5 negative space is specified | `persona.will_not_say` is empty; `persona.facts_from` is anything other than `sources` |
| 6 examples outrank adjectives | a golden has no `why`; a material, `dna.rules`, golden or character `entity` path does not exist or is not a file; a character has no golden lines or no rejected lines |
| 7 a stranger can resume it | `writing.progress` exists. An unknown `profile:` is a warning |
| 8 its adopters can push back on it | nothing further; the core rule applies |
| 9 it improves itself | nothing further; the core rule applies |

## Closed sets

| Field | Allowed values |
|---|---|
| `materials.items[].trust` | `raw`, `considered`, `verified` |
| `persona.identity` | `self`, `role:<name>`, `character:<id>` |
| `persona.stance` | `peer`, `mentor`, `witness`, `guide`; any other value warns |
| `persona.facts_from` | `sources` |
| `audience.reader` | `person`, `agent` |
| `goal.change.kind` | `belief`, `action`, `feeling` |
| `sources.unsourced_claim` | `fail`, `warn` |
| `fiction` | `true`, `false` |

`form.name` and `spine.kind` are open: name the form and the kind of argument in your own words.

## Materials labels

Before a material is used, it is split into segments, and each segment gets one of seven labels.
The label decides what the segment may become in the draft.

| Label | Means | May be used as |
|---|---|---|
| `claim` | a statement of fact about the world | only with a source, or as the author's own claim said as such |
| `story` | something that happened, told by someone who was there | testimony, with the teller named |
| `quote` | words someone said, verbatim | quoted exactly, never paraphrased inside quotation marks |
| `stance` | an opinion or conviction | the author's position |
| `question` | something open | a prompt for the interview, never an assertion |
| `aside` | true but off the thread | held back unless the spine needs it |
| `private` | not for this audience | never used; kept for context |

The linter defines the set once, as `MATERIAL_LABELS` in `src/writing.mjs`. This release checks
the materials list itself; it does not yet read segment files or check their labels. A spine
claim may point at a segment as `m1#segment`, and today only the material id before the `#` is
checked.

## Deferring a block

A block can be deferred, never silently missing. A required block that is absent fails test 1
unless a decision with the id `writing-<block>` stands in for it:

```yaml
decisions:
  - id: writing-audience
    state: open
    question: who reads this, and what do they already believe?
    source: kickoff call
    author: agent:claude
    chosen_by: agent
```

- **`open`** defers the block to a question only a person can answer. The spec is blocked on it,
  exactly like any open decision: `lint` exits 3 once every test passes.
- **`delegated` with a `rule`** defers the block to a standing rule the agent follows. The spec
  can pass. A delegated decision with no `rule` defers nothing, so the missing block still fails.

Either way the deferred block does not count toward `writing: k/9 blocks complete`.

## Starting a writing spec

```bash
npx @supersuit/hyperspec init essay.hyperspec.md --profile writing --title "Your title" --form essay
npx @supersuit/hyperspec init story.hyperspec.md --profile writing --form "short story" --fiction
```

The skeleton shows every required block in schema order with every field present as a `TODO`
placeholder. `dna`, `persona`, `audience` and `goal` also carry an open decision whose question
says what you have to answer before the placeholder means anything. `--form` sets both `kind:`
and `writing.form.name`, and defaults to `essay`. `--fiction` sets `fiction: true` and adds one
character with the same treatment. The skeleton never passes: it lints `fail`, with
`writing: 1/9 blocks complete` (or `0/9` with `--fiction`), until the placeholders and the open
decisions are replaced with real content. A `--profile` this linter does not know exits 2.

## Worked examples

Two complete specs ship in [`examples/writing/`](examples/writing/), each with every file it
names:

- `essay.hyperspec.md`: an essay for new managers on running a first one-on-one. Three materials
  at three trust levels, scoped DNA with two annotated goldens, a four-claim spine.
- `story.hyperspec.md`: a short story, `fiction: true`, narrated by one of its two characters.
  Each character has speech rules, a knowledge timeline by scene, and golden and rejected lines
  in a voice you can tell apart from the other's.

Both lint `pass (9/9)` with `writing: 9/9 blocks complete` and no findings. A test runs them on
every release, so they cannot drift from the linter.

## What later versions add

This release is the schema and its lint. Later versions build on it in order: marking materials
(a brain dump or transcript in, labeled segments out, with the labels above enforced), scoped
DNA with annotated goldens filed by form, audience and purpose, and the stations themselves,
running the checks each block names and grading drafts against the goal.
