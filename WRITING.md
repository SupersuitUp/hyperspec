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
[Marking materials](#marking-materials)).

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
- **Features** are measured per scope from its goldens: sentence and paragraph length,
  punctuation habits, pronouns, signature words. Two scopes of one writer measure differently,
  and each keeps its own numbers.

A scope is a folder on disk, and [Scoped DNA](#scoped-dna) covers it: its shape, the golden file,
what is measured, and how a spec names it. A later release proves DNA with a blind lineup within
its scope: a judge sees a generated passage beside real goldens of the same kind and tries to
pick it out. Every writer has their own DNA, and nobody's scope feeds anybody else's.

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
chain: the three to seven claims the piece has to land, in order, each pointing at the marked
segments that support it.

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
fiction: false                       # optional, true or false; absent means false. true requires writing.characters
writing:
  materials:
    items:                           # at least one
      - id: voice-memo               # unique across items
        path: materials/voice-memo.md
        segments: materials/voice-memo.md.segments.jsonl   # written by hyperspec segments init, then labeled
        produced_by: example-author
        captured: "2026-09-12"
        how: voice memo, transcribed
        trust: raw                   # raw | considered | verified
    check:
      station: every segment of every material carries a label from the closed set, matches its source verbatim, and the markings are current
    source: capture step
    author: agent:claude
  dna:
    writer: example-author
    scope_dir: dna/essay-new-managers-teach   # optional; a scope folder (see Scoped DNA), and every golden below then lives in its goldens/
    scope:
      form: essay
      audience: new managers
      purpose: teach
    rules: style-rules.md            # your style rules file, the always-on layer
    goldens:                         # at least one
      - path: dna/essay-new-managers-teach/goldens/opening.md
        why: one plain claim in the first sentence, then two short sentences that turn it into something to do
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
    terms:                           # optional: terms the piece uses that the reader may not know
      - skip-level
    check:
      station: term check against knows
      rubric: simulated reader reports where it got lost
    source: audience interview
    author: example-author
  goal:
    from: plans to run the meeting from their own list
    to: hands the meeting to the report
    next_if_worked: writes the three questions on a card
    change:
      kind: action                   # belief | action | feeling
      text: the reader asks the three questions and waits
    conditions:                      # 5 to 10 distinct ids of top-level requirements, each once
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
    length:                          # whole numbers, at least 1, min no more than max
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
    claims:                          # 3 to 7, in order, each with its own id
      - id: c1
        text: the first one-on-one is the one meeting the report should set the agenda for
        materials:                   # material#segment cites one segment; never a private or question one
          - voice-memo#s3
      - id: c2
        text: status belongs in the tracker
        materials:                   # a bare material id cites the whole material
          - voice-memo
      - id: c3
        text: three questions are enough to hand the meeting over
        materials:
          - voice-memo#s2
          - voice-memo#s5
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
  characters:                        # required when fiction: true; ids unique
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
      rejected_lines:                # at least one, and none of them also golden
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

A placeholder counts as missing, here and everywhere else in a hyperspec, so a scaffolded field
cannot pass a presence check. A placeholder is a whole value, trimmed and in any case, of `todo`,
`tbd`, `fixme`, `xxx`, `placeholder`, `<placeholder>`, `n/a`, a run of dashes, a run of question
marks, or an ellipsis, optionally followed by a trailing `.`, `:` or `!`. Real text that starts
with one of those, such as `TODO: write the opening`, counts as present, and so does `none`.

`audience.terms` is checked by the `terms` station in `hyperspec check`, and that check is a
**mechanical proxy, not an understanding of meaning**: it looks for a definition-SHAPED phrase
near the term's first appearance (the word `is`, `means`, `refers to`, a colon within a few words,
or an immediate parenthetical), not for whether that phrase defines the term. A sentence
like "A hyperspec is mentioned here" reads as a definition of "hyperspec" by this rule, because
`is` immediately follows the word, even though nothing about the term is explained. This is
deliberate and known, not a bug to fix later in this station: reading for meaning is a judgment
call, and hyperspec's deterministic stations do not make judgment calls. A later release adds a
simulated-reader station that reads for meaning instead of shape; `terms` stays the fast,
mechanical first pass.

## The test mapping

Each row lists what the writing profile adds to that test. The core conditions in
[SPEC.md](SPEC.md#the-test-to-field-map) still apply alongside them.

| Test | A writing spec fails it when |
|---|---|
| 1 every decision is accounted for | a required block is missing and not deferred; a required field is missing; a closed-set value is outside its set (`trust`, `reader`, `change.kind`, the shape of `identity`, `unsourced_claim`); `identity: character:<id>` names a character that is not in `writing.characters`; `fiction` is present and is anything other than `true` or `false`; two materials, two spine claims or two characters share an id; `form.length.min` or `max` is not a whole number of at least 1, or `min` is greater than `max`; `spine.claims` has fewer than three or more than seven distinct claims; a character has no knowledge entry, or an entry lacks `by` or `knows`; a material has no text, or no `segments` field, or its segments file is missing, malformed, labels a segment outside the seven (`unlabeled` included), repeats a segment id, or has segments that overlap or leave text uncovered; `dna.scope_dir` is present and is a placeholder; with `dna.scope_dir`, its `scope.md` is missing, unreadable or lacks a field, its writer, form, audience or purpose differs from the spec's, or its `goldens/` folder is missing or empty, or holds a golden that cannot be read, whose frontmatter never closes, or that has no passage; `audience.terms`, when present, holds a non-string entry or has no real entries at all. A `stance` outside the four is a warning, and so is `unsourced_claim: warn` |
| 2 every requirement can fail | `goal.conditions` lists fewer than five or more than ten distinct ids, lists an id twice, or names an id that is not a top-level requirement |
| 3 every requirement names its check | a block or a character has no `check` with a `station` or a `rubric` |
| 4 every field says where it came from and who wrote it | a block or a character has no `source` or no `author`; a spine claim names no materials, or names a material id that is not in `materials.items`, or a segment that is not in that material's segments file; a segment's text does not match its material word for word; a material changed after it was marked; a claim segment has no `source` and no `own`, a story no `teller`, a quote no `speaker`; with `dna.scope_dir`, a golden in the scope has no `approved_by`, an approver that starts `agent:`, or no `source` |
| 5 negative space is specified | `persona.will_not_say` is empty; `persona.facts_from` is anything other than `sources`; a spine claim cites a `private` or a `question` segment; with `dna.scope_dir`, a golden the spec lists is not one of the scope's goldens (it lives outside the scope's `goldens/` folder, is a symlink that resolves outside it, or sits in a subfolder, is `README.md` or is not a `.md` file), or the scope's `goldens/` folder resolves outside the scope |
| 6 examples outrank adjectives | a golden has no `why`; a material, `dna.rules`, golden or character `entity` path does not exist or is not a file; a character has no golden lines or no rejected lines, or has the same line in both (compared trimmed and case-folded); with `dna.scope_dir`, a golden in the scope has no `why`, or the scope's `features.json` is missing or is not what `dna measure` would write now |
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
| `fiction` | `true`, `false`; absent means `false` |

`form.name` and `spine.kind` are open: name the form and the kind of argument in your own words.

## Marking materials

A brain dump mixes things a draft may use with things it may not: a checked fact, an opinion, a
story from the author's own week, a line said in confidence. Marking tells them apart before an
agent drafts anything. Each material is split into segments, each segment gets one label saying
what it may be used as, and the spine cites segments, so every claim in the piece points at the
exact words that support it.

hyperspec never decides a label. `segments init` splits a material the same way every time, an
agent or a person labels each segment by editing the file it wrote, and `lint` checks everything
a rule can check: every segment carries a label from the closed set and the field that label
needs, matches its material word for word, and was marked against the material as it reads now.

A material item with no `segments` field fails test 1. Marking comes before specifying, so a
writing spec cannot pass until every material it draws on is marked.

### Marking a material

```bash
npx @supersuit/hyperspec segments init materials/voice-memo.md --id voice-memo
```

`hyperspec segments init <material> --id <mid> [--out <file>] [--by paragraph|sentence]` writes
`<material>.segments.jsonl`, or the path `--out` names. `--by paragraph`, the default, makes one
segment per paragraph. `--by sentence` makes one per sentence, and a new line that opens on a list
marker (`-`, `*`, `+`, `1.` or `1)`, then a space) also starts a segment, so each bullet in a set
of notes stands on its own. Every segment starts as `unlabeled`, which lint never accepts. `init`
refuses to overwrite a file that exists, and exits 2 on a material that does not exist or a
`--by` it does not know, a material with nothing in it, and an `--out` folder that does not
exist.

Then name the file on the material item, as `segments:` beside `path:`, and label every segment.
You may also move a boundary by hand, splitting one segment in two or joining two, as long as
the rules under [Coverage](#coverage) still hold.

### The segments file

JSON Lines: one object per line. Line 1 is a header, and every later line is one segment. For this
material, `materials/voice-memo.md`:

```text
Voice memo, recorded on a walk. Raw thinking.

My first one-on-one as a manager was a disaster. I ran it from my own list.

The first one-on-one is the one meeting the report should set the agenda for.

My first manager said this to me in my second week, and I wrote it down.

"Ask what they want to talk about, then stop talking."
```

`segments init` writes five segments, and once they are labeled the file reads:

```jsonl
{"material":"voice-memo","path":"materials/voice-memo.md","sha256":"66c62b995a6f29c72f2a9a20c6b27deaef5d9b195bb6bab96336c06f9a8f2bfc"}
{"id":"s1","start":0,"end":45,"label":"aside","text":"Voice memo, recorded on a walk. Raw thinking."}
{"id":"s2","start":47,"end":122,"label":"story","teller":"example-author","text":"My first one-on-one as a manager was a disaster. I ran it from my own list."}
{"id":"s3","start":124,"end":201,"label":"claim","own":true,"text":"The first one-on-one is the one meeting the report should set the agenda for."}
{"id":"s4","start":203,"end":275,"label":"story","teller":"example-author","text":"My first manager said this to me in my second week, and I wrote it down."}
{"id":"s5","start":277,"end":331,"label":"quote","speaker":"the author's first manager","text":"\"Ask what they want to talk about, then stop talking.\""}
```

The author's framing, s4, is a segment of its own, so the quote, s5, holds only the manager's
words, which is all a `quote` may hold.

- **Header.** `material` is the item's id and must match it. `path` records the material path
  given to `segments init`; lint reads the material from the item's own `path`. `sha256` is the
  SHA-256 of the material file's bytes when it was marked.
- **`id`** is unique within the file. `init` writes `s1`, `s2` and so on; any id works, and it is
  what the spine cites.
- **`start` and `end`** are character offsets into the material's text read as UTF-8, counted as
  JavaScript string indices (UTF-16 code units), with `end` exclusive.
- **`text`** is exactly the material's characters from `start` to `end`.
- **`label`**, plus the one field some labels need (below). Those fields are strings, except `own`.

### The labels

| Label | Means | May be used as | Needs |
|---|---|---|---|
| `claim` | a statement of fact about the world | only with a source, or as the author's own claim said as such | `source`, non-empty, or `own: true` |
| `story` | something that happened, told by someone who was there | testimony, with the teller named | `teller` |
| `quote` | words someone said, verbatim | quoted exactly, never paraphrased inside quotation marks | `speaker` |
| `stance` | an opinion or conviction | the author's position | nothing more |
| `question` | something open | a prompt for the interview, never an assertion | nothing more |
| `aside` | true but off the thread | held back unless the spine needs it | nothing more |
| `private` | not for this audience | never used; kept for context | nothing more |

`own` counts when it is `true` or the string `"true"`. Any other value, `false` included, leaves
it unset, and a claim with no `source` then fails. A placeholder word such as `TODO`, `n/a` or
`???` counts as missing here as it does everywhere in a hyperspec (see [The schema](#the-schema)),
so `source: "TODO"` fails like no source at all. The same holds for the header's fields and for
segment ids.

### Coverage

Taken in order of `start`, whatever order the lines are in, segments never overlap, and between
them they cover every character of the material that is not whitespace. Whitespace between
segments may be left out, which is what `init` does. Segment ids are unique within a file. When
text is left uncovered, the finding gives the offset of the first uncovered stretch and quotes up
to 60 characters of it. A material with no text that is not whitespace has nothing to mark and
fails test 1.

### When a material changes

The header's `sha256` pins the material as it was when it was marked. If the material changes,
lint fails the segments file as stale (test 4), because its offsets and labels describe text that
is no longer there. Mark it again: run `segments init` with `--out` to a new file, point the
material item at it, and label every segment, carrying labels over from the old file wherever the
text did not change.

The hash is over the file's bytes, so a change nobody would call an edit still counts. Converting
line endings is the common one: a material marked with LF endings reads as stale once an editor
or a checkout setting rewrites it with CRLF. Mark a material in the line endings it will be kept
in, and if it lives in git, pin them with a `.gitattributes` line such as
`materials/** text eol=lf`.

### Citing segments in the spine

A spine claim cites a segment as `<material>#<segment>`, such as `voice-memo#s3`. The segment has
to exist in that material's segments file (test 4). A `private` segment is never used and a
`question` is never an assertion, so a claim citing either fails test 5. A bare material id, such
as `voice-memo`, still cites the whole material; `voice-memo#`, with nothing after the `#`, is not
a bare id and fails as an unknown segment. When a claim cites a segment of a material whose
segments cannot be read at all (the material is not marked, its file is missing, or the file
holds no segments), lint says so once for that material rather than once per citation.

### Findings

Every marking finding fails the test in its row. `<segment>` is the segment's id, or its
position when it has none; `<line>` is a line number in the segments file; `<n>` is the claim's
position in `spine.claims`, counting from 0. Every message names the material, and the segment
where there is one, and prints paths as the spec wrote them, so the output is the same on every
machine.

| Id | Test | Fails when |
|---|---|---|
| `writing-materials-unmarked` | 1 | a material item has no `segments` field |
| `writing-materials-segments-missing` | 1 | the segments file does not exist or cannot be read |
| `writing-materials-material-missing` | 1 | the material file cannot be read. Lint reports a missing material path under test 6 instead, so this comes only from `readSegments` |
| `writing-materials-empty` | 1 | the material has no text that is not whitespace |
| `writing-materials-header` | 1 | line 1 is not a JSON object, or has no `material`, `path` or `sha256` |
| `writing-materials-header-material` | 1 | the header names a different material from the item |
| `writing-materials-json-line-<line>` | 1 | a segment line is not a JSON object |
| `writing-materials-segment-id-<line>` | 1 | a segment has no id |
| `writing-materials-segment-id` | 1 | two segments share an id |
| `writing-materials-label-<segment>` | 1 | a label outside the seven, `unlabeled` included |
| `writing-materials-segment-shape-<segment>` | 1 | `start` and `end` are not whole numbers with `start` at least 0, `end` greater than `start`, and `end` no further than the material's length |
| `writing-materials-overlap` | 1 | two segments overlap |
| `writing-materials-coverage` | 1 | text that is not whitespace lies outside every segment |
| `writing-materials-text-<segment>` | 4 | `text` is not the material's characters from `start` to `end` |
| `writing-materials-stale` | 4 | the material's SHA-256 no longer matches the header |
| `writing-materials-claim-source-<segment>` | 4 | a claim has no `source` and no `own` |
| `writing-materials-story-teller-<segment>` | 4 | a story has no `teller` |
| `writing-materials-quote-speaker-<segment>` | 4 | a quote has no `speaker` |
| `writing-spine-materials-segments-unresolvable-<material>` | 4 | a claim cites a segment of a material whose segments cannot be read |
| `writing-spine-claim-<n>-materials-segment-unknown` | 4 | a claim cites a segment that is not in the file |
| `writing-spine-claim-<n>-materials-segment-private` | 5 | a claim cites a `private` segment |
| `writing-spine-claim-<n>-materials-segment-question` | 5 | a claim cites a `question` segment |

### Reading segments from your own tool

A tool that labels materials, such as an agent's capture step or an editor, can import the label
set and the same parse-and-check lint runs:

```js
import { MATERIAL_LABELS, readSegments } from "@supersuit/hyperspec/writing";

const { header, segments, findings } = readSegments("materials/voice-memo.md.segments.jsonl", {
  materialPath: "materials/voice-memo.md",
  materialId: "voice-memo",
});
```

`readSegments` never throws. It returns the parsed header (or `null`), every segment line that
parsed as a JSON object, and findings in the shape lint reports: `test`, `id`, `severity`,
`message` and `fix`. Without `materialPath` it runs only the checks that need no material text
(the header, ids, labels and label fields); with it, it also checks verbatim text, coverage,
overlap and staleness. `materialId`, when given, has to match the header's `material`.
Two more options, `displayPath` and `materialDisplayPath`, set how the two files are named in
messages (lint passes the paths as the spec wrote them); by default the paths are printed as
given. `MATERIAL_LABELS` is the seven labels, in the order of the table above.

## Scoped DNA

A writer does not have one voice, so hyperspec does not keep one. A writer's DNA is kept per
**scope**, a form, an audience and a purpose together, and each scope is a folder holding its own
goldens and its own measurements.

The reason is a leak. A passage can be exactly right for one kind of writing and wrong for
another. The short, warm sentences that make a text message land read as thin in a theology
essay, and the long, qualified sentences that make the essay careful read as evasive on a landing
page. Pool every golden a writer has into one set and an agent learns the moves of each kind of
writing and carries them into the others. Filed by scope, a golden feeds only work that shares
its scope, so the moves it teaches stay where they are right. Retrieval is by scope, never by
"best writing overall".

Scoped DNA is optional in this release. A spec that names no scope folder lints exactly as it did
in 0.4.

### The scope folder

```text
dna/essay-new-managers-teach/
  scope.md             writer, form, audience, purpose, optional notes
  goldens/
    README.md          the golden file shape; never read as a golden
    close.md           one golden per file
    opening.md
    status.md
  features.json        written by dna measure, never by hand
```

`scope.md` carries the scope in its frontmatter; its body is free text for people:

```markdown
---
writer: example-author
form: essay
audience: new managers
purpose: teach
---
```

`writer`, `form`, `audience` and `purpose` are required, and `notes` is optional. Name the folder
after its scope so a person can tell scopes apart at a glance. hyperspec reads the scope from
`scope.md`, never from the folder's name.

`goldens/` must be a real folder inside the scope. A `goldens/` that resolves somewhere else, such
as a symlink to another scope's goldens, would carry that scope's passages into this one under
this scope's name, so `dna measure` refuses it and lint fails it under test 5, both naming where it
leads. A whole scope folder reached through a symlink is fine, because `scope.md` travels with
it.

### A golden

A golden is a real passage the writer marked as right, one per file in `goldens/`. Every `.md`
file directly in `goldens/` is a golden except `README.md`, which is for notes to people and is
never read as a golden. A subfolder, a file with another extension, and a symlink sitting in the
folder are not read either. This is the essay example's opening:

```markdown
---
why: one plain claim in the first sentence, then two short sentences that turn it into something to do
approved_by: example-author
source: first draft of this essay's opening paragraph, marked golden on the review page
approved_on: "2026-09-18"
---

Your first one-on-one with a new report is the only meeting on your calendar where they should
set the agenda. Everything else you run. This one you hand over.
```

- **`why`** (required) names the move the passage teaches. A golden without its reason teaches
  the surface: an agent copies its length, its words and its rhythm. The reason teaches the move,
  which carries over to a passage that shares none of those.
- **`approved_by`** (required) is the person who approved it, as a slug. Golden means a human
  approved it, so an approver that starts `agent:` is refused. An agent may propose a golden;
  only a person makes one.
- **`source`** (required) says where the passage came from: a draft, an earlier piece, a review
  page. It lets someone check that the passage is real and find the context it was written in.
- **`approved_on`** (optional) is the date it was approved.
- **The body** is the passage, verbatim. Whitespace before and after it is dropped, and nothing
  inside it is changed.

A placeholder counts as missing in every one of these fields, as it does everywhere in a
hyperspec (see [The schema](#the-schema)).

### Starting a scope

```bash
mkdir -p dna
npx @supersuit/hyperspec dna init dna/essay-new-managers-teach --writer example-author --form essay --audience "new managers" --purpose teach
```

`hyperspec dna init <scope-dir> --writer W --form F --audience A --purpose P` writes `scope.md`
and a `goldens/` folder holding only a README on the golden file shape. All four flags are
required. It refuses to overwrite an existing `scope.md`, never replaces a `goldens/README.md`
that is already there, and exits 2 with a plain message on a missing flag, a flag whose value is a
placeholder, or a scope folder whose parent folder does not exist. Then add one file per golden.

### Measuring a scope

```bash
npx @supersuit/hyperspec dna measure dna/essay-new-managers-teach
```

```
dna/essay-new-managers-teach: measured 3 goldens
  word_count 118, sentence length mean 13.111 median 15 p90 25
  signature words: first, report, tracker
wrote dna/essay-new-managers-teach/features.json
```

`hyperspec dna measure <scope-dir> [--json]` reads every golden, checks each one's own fields, and
writes `<scope-dir>/features.json`. If the scope or any golden fails a check (no `why`, an agent
approver, no passage, a `goldens/` folder that resolves outside the scope), it prints the findings,
writes nothing and exits 1, so a hollow or borrowed golden is never measured into the DNA. It exits 0 when it wrote the file and 2 on a usage error. `--json`
prints the same result as JSON. The same goldens always produce the same bytes.

`features.json` holds `dna` (the version of this format, `"0.1"`), `scope` (the four fields from
`scope.md`), `goldens` (each golden's path inside the folder and the SHA-256 of its file, sorted
by path) and `features`.

### What is measured

Every feature is a count or a ratio computed from the goldens' text. None of them is a judgment:
a number says how the writer writes in this scope, never whether the writing is good, and
hyperspec calls no model to get it. Words are pooled across every golden in the scope, so their
order changes nothing. Paragraphs and sentences are split exactly as `segments init` splits them,
so the two never disagree about where a boundary falls. A word is a run of letters, digits and
apostrophes, lowercased. Every number is rounded to three decimal places, and a rate is per 1000
words.

| Feature | What it counts | What it is for |
|---|---|---|
| `word_count` | words across every golden | how much text the other numbers rest on; a scope of a few dozen words measures loosely |
| `sentence_length` | words per sentence: `mean`, `median` and `p90` (nearest rank) | the writer's usual sentence, and how long their long ones run, which a mean hides |
| `paragraph_length` | per paragraph, the mean number of sentences (`mean_sentences`) and of words (`mean_words`) | how much the writer puts in one block before a break |
| `rates_per_1000_words` | commas, semicolons, colons, em dashes, en dashes, exclamation marks, question marks, parentheses (each one counted) and double quotation marks, straight or curly | punctuation habits, which carry much of how a voice sounds |
| `contraction_rate` | words with an apostrophe between two letters | how conversational the writer is in this scope |
| `first_person_singular_rate` | I, me, my, mine, myself | how much the writer speaks as themselves |
| `first_person_plural_rate` | we, us, our, ours, ourselves | how much the writer speaks as a group, or alongside the reader |
| `second_person_rate` | you, your, yours, yourself, yourselves | how directly the writer addresses the reader |
| `mean_word_length` | characters per word | plain words or long ones |
| `signature_words` | up to 15 words of four or more letters that are not common function words and appear at least twice, most frequent first, ties in alphabetical order | the vocabulary the writer returns to in this scope |

### When the scope changes

`features.json` is current only when it is exactly what `dna measure` would write from the scope
as it reads now: the same goldens, pinned by the SHA-256 of each file; the same four fields as
`scope.md`; the format version `"0.1"`; and the same numbers. Add a golden, remove one, change any
byte of one (its passage or its frontmatter), edit `scope.md`, or edit a number by hand, and lint
fails the scope as stale under test 6. The finding names what differs: each golden added, removed
or changed, each scope field that changed, an unknown version, or each feature whose number no
longer matches a fresh measurement. Run `dna measure` again. The hash is over bytes, so a
line-ending conversion counts as a change, as it does for a segments file (see
[When a material changes](#when-a-material-changes)).

### Naming the scope in a spec

`writing.dna.scope_dir` points a writing spec at its scope folder, relative to the spec like every
other path. The essay example's `dna` block:

```yaml
  dna:
    writer: example-author
    scope_dir: dna/essay-new-managers-teach
    scope:
      form: essay
      audience: new managers
      purpose: teach
    rules: style-rules.md
    goldens:
      - path: dna/essay-new-managers-teach/goldens/opening.md
        why: one plain claim in the first sentence, then two short sentences that turn it into something to do
```

`scope_dir` is optional. Without it, `dna` lints exactly as it did in 0.4: each golden the spec
lists needs a path to a file and a `why`, and no scope folder is read. With it, lint also checks
that:

- `scope.md`'s writer equals `dna.writer`, and its form, audience and purpose equal `dna.scope`,
  compared trimmed and ignoring case (test 1);
- every golden the spec lists is one of the scope's goldens: after following any symlink, a `.md`
  file directly in the scope's own `goldens/` folder, other than `README.md` (test 5). A golden
  from another scope is a leak, the exact thing a scope exists to prevent, and so is a passage in
  a subfolder, in `README.md` or in another kind of file, which would feed the spec without ever
  being checked or measured;
- every golden in the folder, listed in the spec or not, has a `why` (test 6), an `approved_by`
  that names a person and a `source` (test 4), and a passage (test 1);
- `features.json` exists and is current, as [When the scope changes](#when-the-scope-changes)
  defines it (test 6).

The spec still gives each golden it lists a `why`, as in 0.4; the essay example keeps it the same
as the golden file's own. A `scope_dir` that is present but a placeholder, such as `TODO`, fails
test 1 on its own, so a skeleton cannot pass by leaving it unfilled.

### Findings

Every scoped-DNA finding id starts `writing-dna-` and fails the test in its row. Messages name the
scope folder as the spec wrote it (or as it was given to `dna measure`) and each golden by its
path inside the folder, so the output is the same on every machine. `<field>` is `writer`,
`form`, `audience` or `purpose`.

| Id | Test | Fails when |
|---|---|---|
| `writing-dna-scope-dir` | 1 | `writing.dna.scope_dir` is present and is a placeholder |
| `writing-dna-scope-<field>` | 1 | the spec's own `writing.dna.scope` has no `form`, `audience` or `purpose` (this check runs with or without `scope_dir`, and is the id 0.4 used) |
| `writing-dna-scope-missing` | 1 | `scope.md` does not exist, cannot be read, or its frontmatter does not parse |
| `writing-dna-scope-file-<field>` | 1 | `scope.md` has no such field |
| `writing-dna-scope-mismatch-<field>` | 1 | `scope.md` and the spec disagree on that field |
| `writing-dna-goldens-missing` | 1 | the `goldens/` folder does not exist or cannot be read |
| `writing-dna-goldens-empty` | 1 | `goldens/` holds no golden |
| `writing-dna-goldens-outside` | 5 | `goldens/` resolves to a folder outside the scope, such as a symlink to another scope's goldens |
| `writing-dna-golden-unreadable` | 1 | a golden file cannot be read |
| `writing-dna-golden-frontmatter` | 1 | a golden's frontmatter opens with `---` and never closes |
| `writing-dna-golden-empty` | 1 | a golden has no passage |
| `writing-dna-golden-approved-by` | 4 | a golden has no `approved_by` |
| `writing-dna-golden-approved-by-agent` | 4 | a golden's `approved_by` starts `agent:`, in any case |
| `writing-dna-golden-source` | 4 | a golden has no `source` |
| `writing-dna-golden-leak` | 5 | a golden the spec lists is not one of the scope's goldens: it lives outside the scope's `goldens/` folder, is a symlink that resolves outside it, or sits in a subfolder, is `README.md` or is not a `.md` file |
| `writing-dna-golden-why` | 6 | a golden has no `why` |
| `writing-dna-features-missing` | 6 | the scope has no `features.json`, or it is not valid JSON |
| `writing-dna-features-stale` | 6 | `features.json` is not what `dna measure` would write now: a golden was added, removed or changed, `scope.md` changed, the version is unknown, or a number differs from a fresh measurement |

`dna measure` raises the ids that come from the folder alone: every row except `scope-dir`,
`scope-<field>`, `scope-mismatch-<field>`, `golden-leak` and the two `features-` rows, which
need a spec to compare against. Lint raises all of them.

### Reading a scope from your own tool

A tool of your own, such as a review page that files goldens, can read a scope and measure it the
way `dna measure` does:

```js
import { readScope, measureFeatures } from "@supersuit/hyperspec/writing";

const { scope, goldens, findings } = readScope("dna/essay-new-managers-teach");
const features = measureFeatures(goldens.map((g) => g.text));
```

`readScope` never throws for a folder path, whatever is or is not in the folder. It returns the scope's four fields and `notes` (or `null` when
`scope.md` cannot be read at all), every golden it could read, with its `path`, `why`,
`approved_by`, `source`, `approved_on`, `text` and `sha256`, and findings in the shape lint
reports. `displayDir` sets how the folder is named in messages. `measureFeatures` takes an array
of passages and returns the `features` object `dna measure` writes. It reads no file and returns
the same object for the same passages.

### The worked example

The essay in [`examples/writing/`](examples/writing/) takes its voice from
`dna/essay-new-managers-teach/`: three goldens, each with its `why`, a person's approval and its
source, and a `features.json` that `dna measure` wrote. A test measures the folder again on every
release and requires the same bytes, so the example cannot drift from the tool. The short story
beside it lists its goldens in the spec with no scope folder, the 0.4 shape, which still passes.

## Checking a draft

Once a spec lints clean and a draft exists, `check` runs the spec's deterministic stations
against the draft:

```bash
npx @supersuit/hyperspec check essay.hyperspec.md --draft essay/draft.md
```

It lints the spec first. A spec that fails lint, or is blocked on an open decision, runs no
station and exits with lint's own code, because a draft cannot be checked against a spec that is
not ready. Then it runs seven stations in a fixed order and prints one line for each: `pass`,
`fail` with its findings, or `skip` with the reason. A warning prints under its station and never
fails it. This is the essay example's draft:

```
form: pass
terms: pass
claims: pass
quotes: pass
private: pass
dna: pass
  warn [station-dna-drift] first_person_singular_rate is 22.892 in the draft; the scope's goldens measure 0, band 0 to 5
    fix: Bring first_person_singular_rate back inside the band, or, if the scope no longer describes this writer, re-measure it with better goldens.
links: pass
verdict: one-shot
```

`--only form,terms` runs just those stations, still in the fixed order, and its ledger line is
marked partial (see [The runs ledger](#the-runs-ledger)). `--json` prints the whole result, every
finding included; a spec that is not ready prints lint's result with `lintBlocked: true` instead,
and a usage error prints `{ "spec", "draft", "error" }`. A finding names the draft line it points
at where there is one, quotes at most 80 characters of the draft, and never prints an absolute
path. A UTF-8 byte order mark at the start of the draft is ignored.

Exit codes: **0** every station that ran passed (a skip or a warning does not fail it); **1** a
station failed; **2** usage: no spec path, no `--draft`, a draft that cannot be read, a spec
without `profile: writing`, or an `--only` that names no known station; and lint's own **1** or
**3** when the spec is not ready.

Every station is a plain function of the spec and the draft. None of them calls a model, and none
of them touches the network. What each one checks, and what it cannot:

### form

Counts the draft's words, by the same word definition `dna measure` uses, against
`form.length`. Only `unit: words` is measured; any other unit skips the whole station rather than
checking half of it. Every `required_parts` entry must appear as an ATX heading (`#` to
`######`, indented at most three spaces, closing `#`s allowed) whose text equals the part,
ignoring case, or as a line that starts with the part and a colon, for the fields a form fills in
place (`To:`, `Subject:`). An underlined (Setext) heading does not count, and neither does
anything inside a code block. It cannot tell whether the section under a heading does what the
part is for, so write `required_parts` as the headings the piece will carry,
as both examples do.

| Id | Severity | Meaning |
|---|---|---|
| `station-form-length` | fail | the word count is outside `form.length`; the message gives the count and the range |
| `station-form-required-part-<part>` | fail | a required part appears as neither a heading nor a `part:` line |

### terms

Reads the optional `audience.terms`: the words the piece uses that its reader may not know. For
each term not also in `audience.knows`, it finds the term's first appearance (whole word, ignoring
case) and looks for a definition in that sentence or the next: the term followed within six words
by `is`, `means` or `refers to`, a colon among those words, or a parenthesis right after the term.
This is a mechanical proxy for a definition, not a reading of one: "A hyperspec is mentioned here"
passes. A term the draft never uses is not flagged, code blocks and inline code are ignored, and
with no `terms` list the station skips.

| Id | Severity | Meaning |
|---|---|---|
| `station-terms-undefined-<term>` | fail | the term's first appearance has no definition in that sentence or the next |

### claims

Reads the claims ledger at `sources.ledger`: JSONL, one claim per line, each with the claim's
`text` exactly as the draft says it, a `source`, and optionally a `span`, the words in the source
that support it. The examples cite a segment as the source, the same `material#segment` form the
spine uses:

```jsonl
{"text":"11 of 41 said at least one of their one-on-ones in the last quarter was mostly project status.","source":"survey#s4","span":"11 of 41 said at least one of their one-on-ones in the last quarter was mostly project status."}
```

Every claim's text must still appear in the draft word for word, with whitespace and quote
characters normalized and case kept; otherwise the ledger is stale. Every claim needs a real
source; one without fails, or warns under `unsourced_claim: warn`. A missing ledger fails. The
station does not decide what counts as a factual claim: the ledger is the list of claims, so a
factual sentence left out of it passes unseen. Nor does it read the source to see whether it says
what the claim says.

| Id | Severity | Meaning |
|---|---|---|
| `station-claims-ledger-missing` | fail | the ledger file does not exist or cannot be read |
| `station-claims-json-line-<n>` | fail | ledger line n is not JSON, not an object, or has no `text` |
| `station-claims-stale` | fail | the claim on a ledger line no longer appears in the draft |
| `station-claims-unsourced` | fail, or warn under `unsourced_claim: warn` | the claim on a ledger line has no source, or only a placeholder; points at the draft line where the claim appears |

### quotes

Every span in double quotation marks, straight or curly, of four words or more must appear word
for word in a `quote` or `story` segment of a marked material. Quote characters and whitespace
are normalized, case is kept, and a comma or period just inside the closing mark is dropped,
because that punctuation is the writer's; a `?` or `!` is kept, because adding one changes what
was said. Shorter spans are not checked, since two or three quoted words are as often a title as
a quotation. A private segment is never a source for a quote. When the sentence around a quote
names a speaker, the quote must come from a quote segment with that `speaker`. A speaker is named
by the full `speaker` value, hyphens read as spaces, or by its first word, so `maria-lopez` is
named by "Maria Lopez" and by "Maria". The first word alone counts only when it has two or more
letters and is not a common function word such as "the", so a speaker recorded as "the manager
interviewed" is named only by all three words. Attribution needs a declared speaker: a name that
is no segment's `speaker` attributes nothing, so start a `speaker` with the person's name, as
the essay example does with `dana, an engineering manager`. A spec with `fiction: true` skips
the station: a character's dialogue is invented rather than quoted from a material. The
`attribution` judge tests it against each character's own lines instead (see
[Judging a draft](#judging-a-draft)).

| Id | Severity | Meaning |
|---|---|---|
| `station-quotes-unmatched` | fail | a quoted span is in no quote or story segment |
| `station-quotes-misattributed` | fail | the sentence names a speaker, and the span is in no quote segment by that speaker |

### private

No run of eight or more consecutive words from any `private` segment may appear in the draft,
compared by words with case and punctuation ignored. A private segment of four to seven words is
checked whole. One under four words is not checked, because two or three words match ordinary
prose; the station reports how many it skipped, as one warning that never quotes them. It cannot
catch a paraphrase, or a leak shorter than the run.

| Id | Severity | Meaning |
|---|---|---|
| `station-private-leak` | fail | the draft repeats a run from a private segment; names the material, the segment and the run |
| `station-private-short-skipped` | warn | private segments under four words were not checked; gives the count |

### dna

Runs when `dna.scope_dir` is set and its `features.json` is current. It measures the draft the
way `dna measure` measures goldens and compares the sentence length mean, both paragraph length
means, every per-1000-word punctuation rate, and the contraction and person rates with the
scope's. For a scope value v, a draft value outside v ÷ 1.5 to the larger of v × 1.5 and v + 5 is
reported with both values. An em dash in a draft whose scope has none is its own finding,
pointing at the first one. Both
are warnings and the station never fails: it measures, and whether a draft sounds like its writer
is a judgment. The essay's warning is an example of what to read: its goldens are instructions in
the second person, and the essay tells the author's own story in the first. With no `scope_dir`,
or a `features.json` that is missing or stale, the station skips and says which.

| Id | Severity | Meaning |
|---|---|---|
| `station-dna-drift` | warn | a feature is outside its band; gives the draft's value, the scope's and the band |
| `station-dna-em-dash` | warn | the draft uses em dashes and the scope's goldens use none |

### links

Every Markdown link (inline, reference, collapsed and shortcut) and every bare URL. An `http` or
`https` URL must parse and name a host, a `mailto:` link must carry an address, and any other
scheme fails. A relative link must resolve to a file, relative to the draft's own folder; the
part after `#` is not checked. A link that starts with `/` is relative to a site root the station
cannot see, so it warns. A full or collapsed reference, `[text][label]` or `[label][]`, needs a
definition for its label. A bare `[label]` is a link only when that label has a definition;
otherwise it is ordinary text, as Markdown renders it, so an editorial `[sic]`, a task list's
`[x]` and a numbered note `[1]` pass. Code blocks and inline code are ignored. It never touches
the network, so it cannot tell you a URL is live.

| Id | Severity | Meaning |
|---|---|---|
| `station-links-malformed` | fail | an http or https URL with no host (a bare `https://` included), or a `mailto:` with no address |
| `station-links-bad-scheme` | fail | a scheme other than http, https or mailto |
| `station-links-broken-relative` | fail | a relative link names no file beside the draft |
| `station-links-root-relative` | warn | a link starting with `/`, which cannot be resolved without the site |
| `station-links-undefined-reference` | fail | a full or collapsed reference link whose label has no definition |

### Any station

| Id | Severity | Meaning |
|---|---|---|
| `station-<name>-crashed` | fail | the station threw; the message is the error's, with any absolute path shortened; the other stations and the ledger line still run |

### The runs ledger

Each `check` appends one line to the spec's `improvement.ledger`, the same file lint's test 9
reads:

```json
{"at":"2026-09-29T13:21:37.330Z","kind":"check","draft":"essay/draft.md","draft_sha256":"<sha256 of the draft>","spec_sha256":"<sha256 of the spec>","stations":{"form":"pass","terms":"pass","claims":"pass","quotes":"pass","private":"pass","dna":"pass","links":"pass"},"verdict":"one-shot"}
```

`draft` is the draft's path relative to the spec's folder, however you spelled it, so one draft
has one history. `draft_sha256` and `spec_sha256` hash the two files' bytes; the files the spec
names (materials, the claims ledger, a scope folder) are not hashed, so "changed" below means the
draft or the spec. `stations` holds each station's status.

A run with `--only` is partial: its line carries `partial: true`, its verdict is `not-improved`
with the reason `partial run: <stations>`, and later verdicts ignore it, so a subset never claims
the verdict for the whole draft. A full run is compared with the most recent earlier full line for
the same draft:

- **one-shot**: there is none, and every station passes.
- **improved**: that line failed and every station passes now; `change` names exactly the
  stations that failed then and pass now.
- **not-improved** otherwise, with a `reason` that says which case it is: `failing stations: ...`
  on a first check that fails; `no change since the last passing check`; `draft changed; every
  station still passes` (or `spec changed`, or `spec and draft changed`); `still failing: ...`,
  after `no change since the last check;` or after what changed, when every failing station failed
  last time too; `failing stations: ...` after what changed when a station fails that passed last
  time; and `stations that failed last time now skip: ...` when a spec change stopped them running.

A ledger path that leads outside the spec's folder is not written, and `check` prints a warning.

## Judging a draft

`check` runs the stations that are plain functions of the spec and the draft. The rest of a
spec's checks are rubrics: whether the doctor would pass each goal condition, whether a reader
would get lost, whether the voice can be told from the writer's own. Those are judgments, and
hyperspec calls no model, so it does not make them. It makes them checkable instead. For each
judgment station, `judge prepare` writes a packet: the rubric from the spec, fixed
instructions, the inputs the judge reads, and the exact shape of the answer. An outside judge
(your agent, any model, or a person) fills in a verdict. `judge record` validates it, derives
the station's status from it by a fixed rule, and records it in the runs ledger. The judge
decides; hyperspec checks that every passage the judge quotes is in the draft, scores
every blind test against an answer key the judge never saw, and keeps the record.

```bash
npx @supersuit/hyperspec judge prepare essay.hyperspec.md --draft essay/draft.md --out essay/judge
```

```
essay/judge/doctor.packet.json
essay/judge/lineup.packet.json
essay/judge/lineup.key.json
essay/judge/reader.packet.json
essay/judge/persona.packet.json
attribution: skip (the spec is not fiction; attribution applies only with fiction: true)
knowledge: skip (the spec is not fiction; knowledge applies only with fiction: true)
```

Like `check`, it lints the spec first: a spec that fails lint, or is blocked on an open
decision, gets no packet, and `prepare` exits with lint's own code. Then it writes one
`<station>.packet.json` for each station that applies, in a fixed order (`doctor, lineup,
reader, persona, attribution, knowledge`), and prints a `skip` line with the reason for each
that does not. `--only doctor,reader` prepares just those. The `--out` folder must already
exist. `prepare` refuses to overwrite any file it would write, naming every one, and then writes
nothing; `--force` replaces them. The worked examples ship the packets this writes, so add
`--force` to write them again there. The same spec and draft, with the same goldens and claims
ledger, always give byte-identical packets. A station that throws while building its packet
prints `no packet` with a `judge-<name>-crashed` finding; the other packets are still written,
and `prepare` exits 1.

**Hand the judge only the `*.packet.json` files, never the `--out` folder.** Two stations are
blind tests with a right answer. `lineup` writes which candidate is the draft's to
`lineup.key.json`, and `attribution` writes each line's true speaker to
`attribution.key.json`, both beside the packets, for a person to read. A judge who can see them
is not judging. `record` never reads either file as truth: it builds the key again from the spec
and the draft, so an edited key changes nothing.

**Give the two blind packets to a judge in a fresh context with no access to the draft.** Every
packet names its spec and its draft by path, and a judge that can open files can open those: the
draft's own text shows which lineup passage is the draft's, and its speech tags give every
attribution answer. Both stations' instructions tell the judge to decide from the packet's inputs
alone and open no file the packet names, and a judge with file access can still ignore that, so
the instruction is not a guarantee. Paste the packet into a new conversation, or hand it to a
person who has not read the draft, rather than to an agent working in the folder the draft is in.
The other four packets carry the draft in their inputs and hide nothing, which is why each blind
packet goes to its own context, apart from the other packets as well as from the folder: a judge
that has read the doctor, reader or persona packet has read the draft.

Exit codes for `prepare`: **0** written; **1** a station crashed; **2** usage: no spec path, no
`--draft`, no `--out`, an `--out` that is missing or not a folder, a draft that cannot be read, a
spec without `profile: writing`, an `--only` that names no known judge, or a file that exists
without `--force`; and lint's own **1** or **3** when the spec is not ready. `--json` prints the
result, and a usage error prints `{ "spec", "draft", "out", "error" }`.

### The packet

Every packet is JSON with these fields, in this order:

| Field | Holds |
|---|---|
| `hyperspec_judge` | the packet format's version, `"0.1"` |
| `station` | the station's name |
| `spec`, `draft` | the paths exactly as `prepare` was given them |
| `spec_sha256`, `draft_sha256` | the SHA-256 of each file's bytes |
| `rubric` | the `check.rubric` of the block the station reads, verbatim |
| `instructions` | fixed text for the station, the same for every spec |
| `inputs` | what the judge reads; each station below lists its own |
| `verdict_schema` | the verdict's exact shape, as a small JSON Schema |

A station that needs a rubric skips when its block has none, and a station whose block is
deferred to a decision skips too. The paths are kept as given so the packet is the same on every
machine, which means **`record` must run in the folder `prepare` ran in**. Run from anywhere else,
it cannot find the spec and exits 2.

### The evidence rule

Every verdict field that cites the draft (the doctor's `evidence`, the reader's `lost_at` and
`stopped_at`, the persona's `breaks`, the knowledge `leaks`) is a span copied from the draft. A
span counts only when:

- it has at least three words, where a word is a run of letters and digits (so "It's" is two);
- it is in the draft after both are normalized: every run of whitespace, line breaks included,
  becomes one space, and curly, low and angle quotation marks and apostrophes
  (`‘ ’ ‚ ‛ “ ” „ ‟ ‹ › « »`) become straight ones. Primes (`′ ″`) are not quotation marks and
  are left alone, case is kept, and nothing else changes, so a changed word is not a quotation;
- it matches whole words: a span that starts or ends with a letter or digit may not start or end
  inside a word of the draft.

A span that fails makes the verdict invalid (`judge-evidence-missing`, `-too-short` or
`-not-found`), and nothing is recorded. The lineup and attribution verdicts carry no evidence:
they are blind tests, scored against their keys.

### Recording a verdict

```bash
npx @supersuit/hyperspec judge record essay/judge/lineup.packet.json --verdict essay/sample-verdicts/lineup.verdict.json
```

```
lineup: fail
  fail [judge-lineup-picked] the judge picked the draft's passage (D) out of 4 candidates with confidence 0.6: D is the only passage that rests on a survey figure, and it opens by pointing at something outside itself (the survey); A, B and C each turn one claim into an instruction in the second person, with no numbers. (line 32)
    fix: Revise this passage toward the goldens' voice, where the reason points; if the goldens do not cover this kind of passage, add one that does. Then prepare and judge again.
verdict: not-improved (failing stations: lineup)
```

`record` trusts nothing in the packet file. First it hashes the spec and the draft again; if
either no longer matches the hash the packet recorded, the verdict is stale (`judge-stale`,
"the draft does not match the hash the packet recorded: it changed since prepare, or the packet
was edited"). Then it rebuilds the packet from the spec, the draft and the station's other
inputs on disk (the DNA scope, its `scope.md` and goldens, for `lineup`; the claims ledger for
`persona`) and
requires the file to be exactly those bytes:

- a packet whose inputs no longer match what those other files produce is stale, and the message
  names them. Nothing on disk can tell a changed golden from a hand-edited packet, so it says
  "changed since the packet was prepared, or the packet was edited" and claims neither;
- a station that no longer applies because of those files (the claims ledger deleted, say) is
  stale in the same way, and says why it no longer applies;
- anything else (an edited condition, a reformatted file, a hash made to match a changed draft, a
  station that no longer applies for another reason) is `judge-packet-altered`.

Either way nothing is recorded. A stale packet prints `<station>: stale packet, nothing
recorded`, as `learn record` does, and with `--json` both commands mark it `"invalid": true,
"stale": true`, so a script can test `invalid` alone. The fix is to run `judge prepare` again
with `--force` and judge the new packet, or, for a station that no longer applies, to restore
the file it reads. Only then is the verdict read: it must be JSON (one leading
byte order mark is ignored), in the shape the packet gives, with every evidence span found.
Every problem is named, and an invalid verdict records nothing. The validator ignores fields it
does not know, so a verdict can carry a note of its own; the worked examples' sample verdicts
each carry one, `sample`, saying what they are.

A valid verdict gives the station's status, its findings (a warning prints under the status and
never fails it), and for `attribution` one summary line. Then one line goes to the runs ledger.

Exit codes for `record`: **0** the station passed; **1** it failed, or the verdict is invalid,
or the packet is stale or altered; **2** usage: no packet path, no `--verdict`, a packet or verdict
file that cannot be read, a file that is not a judge packet or names an unknown judge, or a
packet whose spec (which must carry `profile: writing`) or draft cannot be read. `--json` prints
the result, and a usage error prints `{ "packet", "verdict", "error" }`.

In the tables below, **fail** fails the station, **warn** is printed and never fails it,
**invalid** refuses the verdict, and **stale** refuses the packet; an invalid or stale verdict
records nothing.

### doctor

Grades the draft against every goal condition, and asks whether the reader would take the next
step now. Applies when `writing.goal` is written and its check has a rubric. Inputs: `goal`
(`from`, `to`, `next_if_worked`, and `change` with its `kind` and `text`), `conditions` (each
condition id with its requirement's `text` and `fails_when`) and the `draft`. The verdict is
`{ conditions: [{ id, pass, evidence, note }], would_take_next_step, evidence }`: every condition
id exactly once, `pass` and `would_take_next_step` true or false, a `note` on every condition
(one that fails must say why), and the top-level `evidence` for the passage that decided the next
step. It passes when every condition passes and the reader would take the next step.

| Id | Kind | Meaning |
|---|---|---|
| `judge-doctor-condition` | fail | a condition fails; gives the judge's note, at its evidence's line |
| `judge-doctor-next-step` | fail | the reader would not take `goal.next_if_worked` now |
| `judge-doctor-condition-missing` | invalid | a condition in the packet has no entry |
| `judge-doctor-condition-unknown` | invalid | the verdict grades an id that is not a condition in the packet |
| `judge-doctor-condition-duplicate` | invalid | a condition is graded more than once |

### lineup

A blind test of voice. Applies when `writing.dna` names a `scope_dir` whose goldens can be read
and its check has a rubric, at least one golden has a prose paragraph, and the draft has a prose
paragraph that is not already a golden's. A draft that is one paragraph and nothing else is
skipped: its candidate would be the whole file, and the packet's `draft_sha256` would identify it. A prose paragraph is a run of non-blank lines that are
all plain text: headings and code fences end one, and a block holding a list item, a quotation, a
table row, a thematic break or HTML is left out whole, as is indented code.

Every candidate is one prose paragraph reflowed onto a single line, so none can be told by its
formatting. The target length is the median, in characters, of every prose paragraph of every
golden in the scope. The first three goldens by file name that have one each give their
paragraph closest to that length, and the draft gives its paragraph closest to it, skipping any
that is word for word a golden's; ties go to the earliest. The candidates are shuffled with a
seed derived from the draft's full text (the SHA-256 of `hyperspec lineup seed`, a line break, and
the text), which the packet does not carry, so the packet cannot reveal the order: not even its
`draft_sha256`, which is a different hash. The same draft always gets the same labels, labeled A
to D. Inputs: `scope` (the scope's `writer`, `form`, `audience` and `purpose`) and `candidates`,
each `{ label, text }`; no path and no source. `lineup.key.json` records the draft's label, the
draft line its paragraph starts on, and where every candidate came from.

The verdict is `{ pick, confidence, reason }`: a label, a number from 0 to 1, and what decided it.
It passes when the pick is not the draft's passage: the judge could not tell. A judge who picks at
random also passes, three times in four with four candidates, so one lineup is weak evidence of a
voice. A failing lineup is the stronger signal, and its reason says where to look.

| Id | Kind | Meaning |
|---|---|---|
| `judge-lineup-picked` | fail | the judge picked the draft's passage; gives its confidence and reason, at the paragraph's line |
| `judge-lineup-pick-unknown` | invalid | the pick is not one of the lineup's labels |

### reader

Reads the draft as the audience block's reader. Applies when `writing.audience` is written and its
check has a rubric. Inputs: `audience` (`who`, `funnel_now`, `knows`, `terms`, `believes_now`,
`wants`, `reads_on`, `reader`) and the `draft`. The verdict is `{ lost_at: [{ evidence, why }],
stopped_at, would_take_next_step, next_step }`, where `stopped_at` is `{ evidence, why }` or
`null` when the reader read to the end, and must be present either way. The reader names its own
next step: it is not shown `goal.next_if_worked`, so a reader that would act and a doctor that
says the reader would not take the spec's next step can both be right. In the essay example they
agree: both name the card. It passes when the reader read to the end and would take its next step
now.

| Id | Kind | Meaning |
|---|---|---|
| `judge-reader-lost` | warn | the reader got lost here, and why |
| `judge-reader-stopped` | fail | the reader stopped reading here, and why |
| `judge-reader-next-step` | fail | the reader would not take its next step now |

### persona

Reads the draft as the persona block's speaker, against the claims ledger. Applies when
`writing.persona` is written and its check has a rubric, and the claims ledger, if
`sources.ledger` names one, can be read. Inputs: `persona` (`identity`, `stance`, `may_assert`,
`will_not_say`), `claims` (the text of every well-formed line of the claims ledger, in order) and
the `draft`. With no ledger declared, `claims` is `null`: facts cannot be checked against
sources, so the instructions say not to report one, the schema leaves that kind out, and a break
of that kind is invalid. The verdict is `{ breaks: [{ evidence, kind, why }] }`, where `kind` is
`stance` (the voice leaves its stance), `assertion` (it asserts something outside `may_assert`),
`will_not_say` or `unsourced_fact` (a fact no claim holds). It passes when there is no break.

| Id | Kind | Meaning |
|---|---|---|
| `judge-persona-break` | fail | the voice breaks here; the message names the kind and gives the judge's why |
| `judge-persona-kind-unknown` | invalid | a break's kind is not one of the four |
| `judge-persona-no-ledger` | invalid | a break is `unsourced_fact`, and the spec declares no claims ledger |

### attribution

Fiction only: a blind test of whether the characters' voices can be told apart. The packet holds
the draft's dialogue lines with the narration and the speaker removed, and each speaking
character's `speech` block, `golden_lines` and `rejected_lines`; it carries no draft. The judge
names a speaker for every line, and `record` scores the answers against the true speakers, which
only `attribution.key.json` holds. Applies when `fiction: true`, at least two characters have a
speech block and one of them has a check rubric, and the draft has attributable lines from at
least two speakers.

A dialogue line is a double-quoted span, straight or curly, inside one paragraph, outside code. A
quote split by a speech tag (`"Twenty minutes," Ines said, "then we fold it."`) is one line when
its first part ends in a comma and the narration between the parts is exactly one tag and its
comma, nothing else. Narration that holds anything more joins nothing: in `"Leave it there," Ines
said, and Theo muttered, "No chance at all."` the first part is Ines's, and the second is left
out, since a second speaker brought in by a beat, a pronoun or a verb off the list cannot be read
mechanically. The second part is left out whatever ends that narration, even another tag (`Ines
said, and Theo said,`), and so is the second part of `"Twenty minutes," Ines said, wiping her
hands, "then we fold it."`. A line's speaker comes only from a speech tag:
narration in the same paragraph directly after the closing mark (`"...," Ines said`) or directly
before the opening mark, ending in a comma or colon (`Ines said, "..."`). A tag is a subject and
one of the verbs said, asked, told, replied, called, whispered, shouted, answered, added and went
on, or their present tense (says, asks, goes on). The subject is:

- a character's id, or its `name` if it has one: whole words, any case, and an id's words may be
  joined by a space, a hyphen or an underscore, so `old-man` is named by "old man";
- "I", when `persona.identity` is `character:<id>`: the narrator speaks;
- "she" or "he", when exactly two characters have speech blocks and one of them narrates: the
  other one speaks. After a quote the pronoun must be lower case.

The verb may come first ("said Ines") only for said, replied, whispered, shouted and went on (and
their present tense), since "Ines told Theo" names the person spoken to. Anything else leaves the
line out, and every doubt does: no tag, a possessive ("Ines's") or an action beat ("Theo nodded"),
a subject that is not a character with a speech block, tags that name two different speakers, or a
line of three words or more that repeats, or is part of, a golden or rejected line, which would
give its speaker away. So does the second quote in
`"Not a bakery," she said. "They want the room."`, since no tag sits against it. The key is never wrong, and recall pays for it: the worked
story has 36 dialogue lines, and 19 of them are in the test, 10 by Ines and 9 by Theo. The packet
counts the lines left out, and the key lists each with its reason.

Inputs: `characters`, `lines` (each `{ id, text }`, numbered L1 up in draft order, whitespace
reflowed) and `excluded`, the count left out. The verdict is `{ lines: [{ id, speaker }] }`,
every line id exactly once, a speaker by id or name, in any case. Accuracy is taken per speaker
and averaged, so naming one character for every line cannot pass: the station passes when that
mean is 80 percent or more, compared exactly, with percentages rounded down. This is the worked
story's sample:

```
attribution: pass
  accuracy per speaker: ines 10/10 (100%), theo 9/9 (100%); mean 100%, passing at 80%; 17 dialogue lines left out (8 repeating a golden or rejected line, 9 with no speech tag)
verdict: one-shot
```

| Id | Kind | Meaning |
|---|---|---|
| `judge-attribution-accuracy` | fail | the mean accuracy over speakers is under 80%; gives each speaker's |
| `judge-attribution-miss` | warn | a line was given to the wrong character, at its draft line |
| `judge-attribution-speaker-unknown` | invalid | a speaker is not a character in the packet |
| `judge-attribution-line-missing` | invalid | a line in the packet has no answer |
| `judge-attribution-line-unknown` | invalid | the verdict answers an id that is not a line in the packet |
| `judge-attribution-line-duplicate` | invalid | a line is answered more than once |

### knowledge

Fiction only: whether anyone knows something before their timeline gives it to them. Applies when
`fiction: true` and at least one character has a knowledge timeline (an entry with both `by` and
`knows`) and one of those characters has a check rubric. Inputs: `characters` (each with its
`knowledge` entries) and the `draft`. The verdict is `{ leaks: [{ character, evidence,
knows_too_early }] }`, and it passes when there is no leak.

hyperspec does not read the draft's structure: `by` goes into the packet as the spec wrote it,
and the judge maps it onto the draft. The worked story's timelines say `scene-1` to `scene-4`,
and its draft's four headings are times, 3:40 to 6:55, in the scene list's order, so a judge maps
them by order. Write `by` as something a reader of the draft can find.

| Id | Kind | Meaning |
|---|---|---|
| `judge-knowledge-leak` | fail | a character knows something too early, at its evidence's line |
| `judge-knowledge-character-unknown` | invalid | a leak names a character with no timeline in the packet |

### Any judgment station

| Id | Kind | Meaning |
|---|---|---|
| `judge-verdict-not-json` | invalid | the verdict file is not JSON |
| `judge-verdict-shape` | invalid | a field is missing, of the wrong type or out of range, or a required note, reason or why is empty |
| `judge-evidence-missing` | invalid | an evidence field is empty or not a string |
| `judge-evidence-too-short` | invalid | an evidence span has fewer than three words |
| `judge-evidence-not-found` | invalid | an evidence span is not in the draft, word for word |
| `judge-stale` | stale | the spec, the draft, or a file the station reads changed since the packet was prepared, or the packet was edited |
| `judge-packet-altered` | invalid | the packet is not the one `prepare` builds from the files on disk |
| `judge-<name>-crashed` | invalid | the station threw; at `prepare` its packet is not written, at `record` nothing is recorded |

### Judge lines in the runs ledger

Each recorded verdict appends one line to the spec's `improvement.ledger`:

```json
{"at":"2026-09-29T16:27:36.883Z","kind":"judge","station":"lineup","draft":"essay/draft.md","draft_sha256":"<sha256 of the draft>","spec_sha256":"<sha256 of the spec>","packet_sha256":"<sha256 of the packet>","inputs_sha256":"<sha256 of its inputs>","status":"fail","verdict":"not-improved","reason":"failing stations: lineup"}
```

`draft` is relative to the spec's folder, as in a check line. `packet_sha256` is the SHA-256 of
the packet the judge was shown, taken with its two paths written as the ledger writes them
(relative to the spec's folder), so the same packet prepared from another folder, or as
`./draft.md`, hashes the same. `inputs_sha256` is the SHA-256 of the packet's `inputs` alone. The
verdict follows the same rules as a check line, compared with
the most recent earlier judge line for the same station and the same draft, with three more:

- **What changed** is judged by the packet. The draft or the spec is named when its bytes
  changed. When neither did and the packet's inputs did, the files the station reads besides them
  are named: `the DNA scope (<scope_dir>: scope.md and goldens)` for `lineup`, `the claims ledger
  (<path>)` for `persona`. When only the rest of the packet changed, which a later hyperspec
  release can do by rewording a station's instructions, the reason says `the packet's fixed text
  (hyperspec's instructions or format) changed`. So adding the golden a failing lineup asked for, or the claims a
  failing persona asked for, and passing on the new packet is `improved`, "the DNA scope
  (dna/essay-new-managers-teach: scope.md and goldens) changed; stations now pass: lineup". An
  improved judge line always names what changed, "draft changed; stations now pass: doctor".
- **one-shot** also needs these draft bytes never to have been judged by this station before,
  under any name. A copy or a rename of a judged draft gets `not-improved`, with the reason
  "these draft bytes were judged before as <path>: <status>".
- **improved** also needs the packet to have changed since the failing line. A judge can answer
  differently about an identical packet, and that is not the work improving: the verdict is
  `not-improved`, "the verdict changed; nothing the judge was shown changed".

Otherwise the reasons are check's, with `judgment` where check says `check`: `failing stations:
doctor`, `no change since the last passing judgment`, `no change since the last judgment; still
failing: doctor`, or `draft changed; every station still passes`. Check and judge each read only
their own lines, and learn reads none, so judging a draft never changes what `check` says about
it, or the reverse. Judge lines keep lint's test 9 passing, as check lines do.

### The worked examples

Both examples ship the packets `prepare` writes for their drafts, in `essay/judge/` and
`story/judge/`, with no key beside them, and one sample verdict per packet in
`essay/sample-verdicts/` and `story/sample-verdicts/`. The samples were filled in by hand, as
one careful judge would, to show the shape and what `record` does with it; each says so in its
`sample` field. Another judge may answer differently. A test records every sample on a fresh
copy on every release.

| Example | Station | Sample | What the judge found |
|---|---|---|---|
| essay | doctor | pass | every condition holds, and the reader would write the three questions on a card, the goal's next step and the draft's close |
| essay | lineup | fail | the draft's passage is the only one resting on a survey figure; the goldens hold no numbers, so they do not cover this kind of passage |
| essay | reader | pass | read to the end, lost nowhere; the reader's own next step is the card |
| essay | persona | pass | the mentor stance holds, and every figure is in the claims ledger |
| story | doctor | pass | every condition holds, and a reader would look for the author's other stories |
| story | reader | pass | read to the end; lost for a moment at "proving cabinet" and "peel", two warnings |
| story | persona | fail | three process details (the deck oven's heat-up time, the rolls' bake time, how the starter is fed) are in no claim, and the rubric allows none outside the ledger |
| story | attribution | pass | all 19 lines named right by voice alone |
| story | knowledge | pass | neither character knows anything early |

Both examples pass every station of `check`. Each failure here is something no deterministic
station can see.

## Learning from edits

A factory writes a first draft, and a person edits it into the draft they approve. Every edit is
something the spec did not say, or did not say well enough. `learn prepare` diffs the two drafts
sentence by sentence and writes a packet of the edits; an outside judge names, for each edit, the
one block of the spec that would have prevented it; `learn record` validates that verdict, counts
the edits by block, and names one next move for the block with the most. It never edits the spec:
the move is a suggestion for whoever keeps it.

```bash
npx @supersuit/hyperspec learn prepare essay.hyperspec.md --first essay/learn/first-draft.md --approved essay/draft.md --out essay/learn
npx @supersuit/hyperspec learn record essay/learn/learn.packet.json --verdict essay/sample-verdicts/learn.verdict.json
```

```
essay/learn/learn.packet.json
5 edits over 8 sentences: 3 replaced, 2 deleted
```

```
learn: 5 edits classified
  dna 2 edits, 4 sentences
  materials 1 edit, 2 sentences
  persona 1 edit, 1 sentence
  none 1 edit, 1 sentence
next move: dna, 4 of 8 sentences (2 of 5 edits): add a golden or a style rule
verdict: not-improved (edits by block: dna 2 edits (4 sentences), materials 1 edit (2 sentences), persona 1 edit (1 sentence), none 1 edit (1 sentence); not yet applied to the spec)
```

`prepare` lints the spec first, exactly as `judge prepare` does, then writes
`<out>/learn.packet.json` and prints how many edits it found, or `no edits: the first draft and the
approved draft match; nothing to learn`. The rules on `--out`, `--force` and the paths are the
judge's: the folder must exist, an existing packet needs `--force`, and `record` runs in the
folder `prepare` ran in. The essay example ships this pair and its packet in `essay/learn/`, so
add `--force` to write the packet again there.

Exit codes: `prepare` **0** written, **2** usage (no spec path, `--first`, `--approved` or
`--out`, a folder that is missing, a draft that cannot be read, a spec without `profile: writing`,
a packet that exists without `--force`, or drafts too large to diff), and lint's own **1** or
**3** when the spec is not ready; `record` **0** recorded, **1** the verdict is invalid or the
packet stale or altered (nothing recorded), **2** usage.

### Sentence units

The drafts are compared one unit at a time, and a unit is one sentence, one heading, or one list
item:

- A blank line always ends a unit. When the first line of a paragraph is a Markdown heading, that
  line is a unit of its own; a later line that starts with `#` is a hard wrap in the text, and is
  read as text.
- Other lines are split into sentences at `.`, `!` or `?` followed by whitespace, never inside a
  quotation that opens and closes on one line (straight or curly), so a quoted passage of several
  sentences on one line is one unit. Each list item starts a unit.
- A unit that ends in a common abbreviation (Mr., Mrs., Ms., Dr., Prof., Sr., Jr., St., vs., cf.,
  e.g., i.e.) or a single capital initial ("J.") runs on into the next, and so does a unit
  followed by one that starts with a lower-case letter ("the U.S. economy").

### The edits

Units are compared with their whitespace collapsed and matched by a longest common subsequence.
Every run of unmatched units is one edit, a hunk: `deleted` (only in the first draft), `inserted`
(only in the approved one) or `replaced`. A hunk never crosses a paragraph break or a heading, so
a paragraph rewritten from end to end is one hunk and a change in two paragraphs is two. A hunk's
texts are the drafts' own words from its first unit to its last, and its `sentences` is the
larger of its two unit counts. A run that reads the same once whitespace is collapsed is a
reflow, not an edit, so rewrapping lines, or joining or splitting paragraphs without changing a
word, makes no hunk. The drafts' common start and end are set aside first; if what is left would
need more than 10,000,000 comparisons, `prepare` stops with a usage error naming both sentence
counts. Learn from a chapter or a scene at a time.

### The learn packet

`{ "hyperspec_learn": "0.1", "spec", "spec_sha256", "first", "first_sha256", "approved",
"approved_sha256", "blocks", "instructions", "hunks", "verdict_schema" }`. `blocks` lists the
writing blocks the spec has written, in schema order, then `none`; a deferred block is not
listed. Each hunk is `{ id, kind, first, approved, sentences }`, with ids E1 up, and `null` on
the side that has no text. The packet carries no draft beyond its hunks: the instructions tell
the judge to read the spec at its path. A learn packet has no answer key.

The verdict is `{ edits: [{ id, block, why }] }`: every hunk id exactly once, a `block` from the
packet's `blocks`, and a `why` saying what that block should have said. `none` means no block of
the spec could have prevented the edit, a typo say. As with a judge packet, `record` hashes the
spec and both drafts again, rebuilds the packet, and requires the file to be exactly those bytes
before it reads the verdict.

### The tally and the next move

The tally counts, for each block the verdict names, its edits and the sentences they touched.
Blocks are ordered by sentences, then edits, then the order of the table below with `none` last,
and the next move goes to the first block that is not `none`, so a paragraph rewritten from end to
end weighs as the sentences it rewrote. There is one move per block:

| Block | Next move |
|---|---|
| `materials` | mark or add the material the edit drew on |
| `dna` | add a golden or a style rule |
| `persona` | tighten the persona's stance, may_assert or will_not_say |
| `audience` | extend the audience's knows or terms |
| `goal` | tighten a goal condition's fails_when |
| `form` | adjust the form block's length or shape |
| `spine` | restate the spine's claim or its order |
| `sources` | add or cite a source in the claims ledger |
| `characters` | extend a character's speech or knowledge |

When every edit is `none`, the move is `none`: no block could have prevented any edit, so the spec
has nothing to learn from the pair.

`record` appends one line to the runs ledger, `{ at, kind: "learn", first, first_sha256,
approved, approved_sha256, spec_sha256, verdict, reason, tally }`, with both drafts' paths
relative to the spec's folder. Its verdict is always `not-improved`: the spec has not changed yet,
and the reason gives the counts by block. Learn reads no earlier line, and check and judge ignore
learn lines.

| Id | Kind | Meaning |
|---|---|---|
| `learn-verdict-not-json` | invalid | the verdict file is not JSON |
| `learn-verdict-shape` | invalid | the verdict is not `{ edits: [...] }`, or an entry is not an object with an id |
| `learn-edit-unknown` | invalid | an id is not a hunk in the packet |
| `learn-edit-duplicate` | invalid | a hunk is classified more than once |
| `learn-edit-missing` | invalid | a hunk is not classified |
| `learn-block-unknown` | invalid | a block is not one of the nine blocks or `none` |
| `learn-block-absent` | invalid | a block is one the spec has not written |
| `learn-why-missing` | invalid | a why is empty or not a string |
| `learn-stale` | stale | the spec or a draft no longer matches the hash the packet recorded: it changed since prepare, or the packet was edited |
| `learn-packet-altered` | invalid | the packet is not the one `prepare` builds from the files on disk |

The essay example's pair is a first draft that differs from `essay/draft.md` by five edits: a
paragraph of hedged advice and a hedged sentence, where the approved draft gives instructions; a
claim about what most managers do; the walking aside from the voice memo; and a typo. The sample
verdict puts the two hedges on `dna`, since no golden or style rule shows advice given flat, and
the tally sends the next move there.

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
and `writing.form.name`, and defaults to `essay`. The material item names
`materials/TODO.md.segments.jsonl`, the file `segments init` writes for `materials/TODO.md`, so
materials keeps failing until a real material is marked. `dna` shows `scope_dir: TODO`, which
fails until it names a scope folder (see [Scoped DNA](#scoped-dna)) or is deleted, since the
field is optional. `--fiction` sets `fiction: true` and adds one character with the same
treatment. The skeleton never passes: it lints `fail`, with
`writing: 1/9 blocks complete` (or `0/9` with `--fiction`), until the placeholders and the open
decisions are replaced with real content.

`init` refuses, with exit 2 and a plain message, anything it would otherwise have to ignore:
`--profile` with no value or one this linter does not know, `--fiction` or `--form` without
`--profile writing`, `--kind` with it (the form sets the kind), and a file in a folder that does
not exist.

## Worked examples

Two complete specs ship in [`examples/writing/`](examples/writing/), each with every file it
names:

- `essay.hyperspec.md`: an essay for new managers on running a first one-on-one. Three materials
  at three trust levels, its voice from the scope folder `dna/essay-new-managers-teach/` with three
  annotated goldens and their measured features, a four-claim spine.
- `story.hyperspec.md`: a short story, `fiction: true`, narrated by one of its two characters.
  Each character has speech rules, a knowledge timeline by scene, and golden and rejected lines
  in a voice you can tell apart from the other's.

Every material in both is marked. Between them the two examples use all seven labels, each with
the field it needs, and every spine claim cites the segments that support it. Each segments file
keeps the boundaries `segments init` wrote, in paragraph mode for prose and sentence mode for
bulleted notes, so you can re-run it and compare.

Both lint `pass (9/9)` with `writing: 9/9 blocks complete` and no findings. Each also ships a
draft written to it, `essay/draft.md` and `story/draft.md`, with its claims ledger beside it, and
both drafts pass every station of `check`: the essay with one dna warning, described under
[dna](#dna), and the story with dna skipped, since it names no scope folder, and quotes skipped,
since it is fiction. A test lints both
specs and checks both drafts on every release, so they cannot drift from the tool.

Each also ships the packets `judge prepare` writes for its draft, in `essay/judge/` and
`story/judge/`, and one sample verdict per packet in `essay/sample-verdicts/` and
`story/sample-verdicts/`, filled in by hand and marked as samples; what each found is under
[The worked examples](#the-worked-examples). The essay adds a learn pair in `essay/learn/`: a
first draft, the packet `learn prepare` writes comparing it with `essay/draft.md`, and a sample
learn verdict (see [Learning from edits](#learning-from-edits)). A test checks that every packet
is what `prepare` writes now and records every sample.

## What later versions add

This release is the schema, its lint, marked materials, scoped DNA, `check` with seven
deterministic stations, six judgment stations written as packets for an outside judge, and learn.
Next: lineups over several passages of one draft, so that one lucky pick carries less weight, and
a learn step that reads the runs ledger across drafts for the stations that keep failing and the
changes that made them pass, beside what one pair of drafts shows.
