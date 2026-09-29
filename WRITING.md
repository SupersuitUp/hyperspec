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
    next_if_worked: copies the three questions into the invite
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

Both lint `pass (9/9)` with `writing: 9/9 blocks complete` and no findings. A test runs them on
every release, so they cannot drift from the linter.

## What later versions add

This release is the schema, its lint, marked materials, and scoped DNA with measured features.
Later versions build on it in order. The first compares a draft against its scope: its features
beside the scope's features, and a blind lineup in which a judge sees a generated passage among
the scope's goldens and tries to pick it out. Then the stations themselves, running the checks
each block names and grading drafts against the goal.
