---
hyperspec: "0.1"
title: The hyperspecification standard
kind: standard
decisions:
  - id: format
    state: decided
    value: a hyperspec is a markdown file with a YAML frontmatter block, versioned in git, living beside the work it specifies
    source: design doc, Part 1, "The shape on disk"
    author: gary-sheng
    chosen_by: human
  - id: yaml-reader
    state: decided
    value: hyperspec reads YAML only through parseSkillFile from @supersuit/superskill/yaml; it never carries a second parser
    source: Gary, 2026-09-28, "fix the yaml reader bro"
    author: gary-sheng
    chosen_by: human
  - id: exit-codes
    state: decided
    value: "0 every test passes and nothing is open; 1 at least one test fails; 3 every test passes but a decision is open; 2 usage or IO error"
    source: this plan
    author: agent:claude
    chosen_by: agent
requirements:
  - id: r1
    text: lint exits 0 only when all nine tests pass and nothing is open
    fails_when: a spec missing fails_when on any requirement exits 0
    check:
      station: test/rules.test.mjs and test/score.test.mjs
    source: design doc, Part 1, "What makes a spec a hyperspec"
    author: gary-sheng
  - id: r2
    text: every finding names a fix
    fails_when: a finding with an empty fix
    check:
      station: "test/rules.test.mjs, \"every finding names its test\""
    source: this plan
    author: agent:claude
rejects:
  - prose advice where a field could be checked
  - a second YAML parser
examples:
  - path: test/fixtures/valid/spec.md
    why: the smallest spec that passes all nine tests
resume:
  next_action: write the recipe standard as the first hyperspec made with this one (hyperspec init recipe.md)
feedback:
  issues: https://github.com/SupersuitUp/hyperspec/issues
  fork: MIT; fork it for your own purposes and say so in your SPEC
improvement:
  ledger: runs.jsonl
---

# The hyperspecification standard

A person writing for another person leaves most of the specification unsaid, because the other person fills the gaps from shared context. An agent has none of that context, so it fills every gap with the average, and the average is what reads as middling. Hyperspecification is writing down the gaps. It is a level of detail that would feel like overkill between two people and is exactly enough for an agent: every decision the agent would otherwise guess is either decided, delegated with the rule for deciding it, or marked open, so the work stops instead of guessing.

**Version 0.1.0** (2026-09-28)

## What makes a spec a hyperspec

A spec is a hyperspec when it passes these nine tests. Each one is checkable, which is itself the first test.

### 1. every decision is accounted for

The form of the work has a known list of decision points: for an essay, who it is for, what it argues, how it opens, how long it runs, what it refuses to say, and so on. Each one is decided, delegated with the rule the agent uses to decide it, or open. An open decision stops the work. Nothing is left to the average.

### 2. every requirement can fail

Each line is written so a specific observation could show it was not met. "Engaging" fails this test. "A reader who has never heard the term can say what it means after the first section" passes it.

### 3. every requirement names its check

Either a deterministic station (a lint, a schema, a source match) or a judgment station (a rubric a grader applies), and the check is written beside the requirement it belongs to.

### 4. every field says where it came from and who wrote it

Where: a brain dump line, an interview answer, a transcript, a prior piece. Who: a person or an agent, and which one, and whether a human explicitly chose it or an agent proposed it and nobody objected. Neither answer is bad on its own. Knowing which is what lets you debug: an agent that invented a detail, or a person who put in something wrong, both show up as a field with an author you can ask.

### 5. negative space is specified

What the work must not do is usually more specific than what it must do. A hyperspec lists its rejected poles under `rejects`.

### 6. examples outrank adjectives

Where a quality matters, the spec points at a real example of it instead of describing it. A model copies surface style from a description and misses the style an example carries.

### 7. a stranger can resume it

A different agent, with only the spec and the state beside it, can pick the work up mid-flight and know what to do next. The spec is the primary artifact, and the output is regenerable from it.

### 8. its adopters can push back on it

A spec receives issues and pull requests, like code. Anyone adopting it can say they are not happy with it, propose a change, and fork it for their own purposes. A spec nobody can argue with stops improving the day it ships.

### 9. it improves itself

Every run leaves a verdict: it went through clean, or it did not and the spec or the skill changed, or it did not and here is why nothing changed. A framework with no improvement loop is as good on its first run as it will ever be.

## The format (what `lint` reads)

A hyperspec is a markdown file with a YAML frontmatter block. This is the shape:

```yaml
---
hyperspec: "0.1"
title: What this specifies
kind: essay
decisions:
  - id: audience
    state: decided            # decided | delegated | open
    value: the operator, reading on a phone
    source: interview A2      # where it came from
    author: gary-sheng        # a person slug, or agent:<model>
    chosen_by: human          # human | agent
  - id: length
    state: delegated
    rule: as short as the claim chain allows, never over 1,200 words
    source: design doc, Part 2
    author: agent:claude
    chosen_by: agent
  - id: title
    state: open
    question: which of the three candidate titles?
    source: draft 2
    author: agent:claude
    chosen_by: agent
requirements:
  - id: r1
    text: a reader new to the term can say what it means after section one
    fails_when: the simulated reader cannot define the term after section one
    check:
      rubric: ask the simulated reader to define the term; pass only on a correct definition
    source: design doc, audience block
    author: gary-sheng
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
```

## The test-to-field map

The rules module is exactly this table.

| Test | Fails when |
|---|---|
| 1 every decision is accounted for | no `decisions`; a decision with no or duplicate `id`; `state` not decided, delegated or open; decided without `value`; delegated without `rule`; open without `question` |
| 2 every requirement can fail | no `requirements`; a requirement without `text` or without `fails_when`. A vague word in `fails_when` is a warning |
| 3 every requirement names its check | a requirement whose `check` has neither `station` nor `rubric` |
| 4 every field says where it came from and who wrote it | a decision or requirement without `source` or `author`; a decision whose `chosen_by` is not human or agent |
| 5 negative space is specified | `rejects` missing or empty |
| 6 examples outrank adjectives | `examples` missing or empty; an example without `path` or `why`; a relative `path` that does not exist |
| 7 a stranger can resume it | `resume.next_action` missing, or one that names no action (continue, follow up, tbd, todo, keep going, pick it back up, as discussed). "as discussed" in the body is a warning |
| 8 its adopters can push back on it | `feedback.issues` or `feedback.fork` missing |
| 9 it improves itself | `improvement.ledger` missing; if the ledger file exists, a line that is not JSON, a `verdict` outside one-shot, improved or not-improved, `improved` without `change`, `not-improved` without `reason` |

## Exit codes

`hyperspec lint` reports the worst result across every file it is given:

- **0** every test passes and nothing is open.
- **1** at least one test fails.
- **3** every test passes, but a decision is left open, so the work waits on that decision.
- **2** usage error, or the file could not be read.

## The improvement ledger

Every run of a skill that works from a hyperspec writes one line to the ledger named in `improvement.ledger`, one JSON object per line, with a `verdict`:

- **one-shot**: no intervention, nothing to learn.
- **improved**: the skill, the spec template, or a component library changed, and the line carries `change`, naming what changed.
- **not-improved**: nothing changed, and the line carries `reason`, a reason a later session can argue with, such as "the correction was about this piece only" or "the fix belongs to a shipped skill and was filed as an issue".

Silence is not a verdict. A run that learned nothing has to say so and why, and a ledger line with none of the three verdicts fails the ninth test.

## Why now

A human reader treats a thousand-line spec as a burden, so specs were written short and the gaps were filled from shared context. A model reads all of it at almost no cost and uses every line. Detail that would have been waste between two people is now the cheapest input there is. That is the whole reason hyperspecification exists now and could not have before: the reader changed, so the economics of writing everything down changed with it.
