---
hyperspec: "0.1"
title: The hyperspecification standard
kind: standard
decisions:
  - id: format
    state: decided
    value: a hyperspec is a markdown file with a YAML frontmatter block, versioned in git, living beside the work it specifies
    source: SPEC.md, section "The format (what `lint` reads)"
    author: gary-sheng
    chosen_by: human
  - id: yaml-reader
    state: decided
    value: hyperspec reads YAML only through parseSkillFile from @supersuit/superskill/yaml; it never carries a second parser
    source: "superskill 0.2.0 CHANGELOG: the reader gained nesting so standards in this family import it instead of writing a second parser"
    author: gary-sheng
    chosen_by: human
  - id: exit-codes
    state: decided
    value: "0 every test passes and nothing is open; 1 at least one test fails; 3 every test passes but a decision is open; 2 usage or IO error. The recipe commands use the same numbers, with 3 meaning a regeneration waits on a runner"
    source: SPEC.md, sections "Exit codes" and "Recipe exit codes", and README.md, section "Exit codes"
    author: agent:claude
    chosen_by: agent
  - id: recipe-verbs
    state: decided
    value: a recipe runs again three ways, reproduce (re-check every recorded hash), regenerate (one named change, rerunning only the stages it reaches) and compare (both outputs graded by one doctor against one spec)
    source: "the recipe standard: \"Every output can be reproduced, and regenerated with one more ingredient\""
    author: gary-sheng
    chosen_by: human
  - id: recipe-store
    state: decided
    value: a recipe records every input, the spec and every stage output by SHA-256 hash, and each distinct content is kept once in a store at .hyperspec/blobs/<first two hex characters>/<hash>
    source: SPEC.md, section "Recipes", "The blob store"
    author: agent:claude
    chosen_by: agent
  - id: no-model-calls
    state: decided
    value: hyperspec never calls a model; a runner command the caller supplies reruns stages, and a doctor command the caller supplies grades outputs
    source: SPEC.md, section "Recipes"
    author: agent:claude
    chosen_by: agent
  - id: profiles
    state: decided
    value: a profile adds rules for one kind of work under the nine tests; it never adds a tenth test, every finding it raises names one of the nine, and the score stays out of nine
    source: WRITING.md, section "The writing profile"
    author: agent:claude
    chosen_by: agent
requirements:
  - id: r1
    text: lint exits 0 only when all nine tests pass and nothing is open
    fails_when: a spec missing fails_when on any requirement exits 0
    check:
      station: test/rules.test.mjs and test/score.test.mjs
    source: SPEC.md, section "What makes a spec a hyperspec"
    author: gary-sheng
  - id: r2
    text: every finding names a fix
    fails_when: a finding with an empty fix
    check:
      station: "test/rules.test.mjs, \"every finding names its test\""
    source: CHANGELOG.md, 0.1.0, "every finding names its test, a severity, a message and a fix"
    author: agent:claude
  - id: r3
    text: reproduce runs no model and no command; it only re-hashes what the recipe recorded
    fails_when: reproduce reports success for a recipe whose recorded blob does not hash to its recorded value
    check:
      station: test/reproduce.test.mjs
    source: SPEC.md, section "Recipes", "reproduce"
    author: agent:claude
  - id: r4
    text: regenerate reuses every stage whose key is unchanged and records the parent and the change
    fails_when: a stage whose recomputed key equals its parent's recorded key is rerun, or a child recipe has no parent or no change
    check:
      station: test/regenerate.test.mjs
    source: SPEC.md, section "Recipes", "regenerate"
    author: agent:claude
  - id: r5
    text: compare flags a child that scores lower than its parent under the same doctor and spec
    fails_when: compare exits 0 when the child scores lower than its parent
    check:
      station: test/cli-recipe.test.mjs
    source: SPEC.md, section "Recipes", "compare"
    author: agent:claude
  - id: r6
    text: the README's recipe walkthrough runs exactly as written against the shipped example
    fails_when: a command in the README walkthrough exits non-zero, or prints something other than the output the README shows
    check:
      station: test/example-recipe.test.mjs
    source: README.md, section "Recipes"
    author: agent:claude
rejects:
  - prose advice where a field could be checked
  - a second YAML parser
  - a recipe that points at a path whose bytes can change
  - reproducing an output by running a model again and hoping it says the same words
examples:
  - path: examples/minimal.hyperspec.md
    why: the smallest spec that passes all nine tests
resume:
  next_action: collect adopter issues on 0.5, scoped DNA included, and cut 0.6 from them
feedback:
  issues: https://github.com/SupersuitUp/hyperspec/issues
  fork: MIT; fork it for your own purposes and say so in your SPEC
improvement:
  ledger: runs.jsonl
---

# The hyperspecification standard

A person writing for another person leaves most of the specification unsaid, because the other person fills the gaps from shared context. An agent has none of that context, so it fills every gap with the average, and the average is what reads as middling. Hyperspecification is writing down the gaps. It is a level of detail that would feel like overkill between two people and is exactly enough for an agent: every decision the agent would otherwise guess is either decided, delegated with the rule for deciding it, or marked open, so the work stops instead of guessing.

**Version 0.5.0** (2026-09-29)

## What makes a spec a hyperspec

A spec is a hyperspec when it passes these nine tests. Each one is checkable, which is itself the first test.

### 1. every decision is accounted for

The form of the work has a known list of decision points: for an essay, who it is for, what it argues, how it opens, how long it runs, what it refuses to say, and so on. Each one is decided, delegated with the rule the agent uses to decide it, or open. An open decision stops the work. Nothing is left to the average.

`lint` checks that at least one decision is listed and that each listed decision is well-formed. Whether the list covers every decision the form of the work has is the author's job, because the linter does not know the form's full list.

### 2. every requirement can fail

Each line is written so a specific observation could show it was not met, under `fails_when`. The observation is what makes a requirement failable. "A reader who has never heard the term can say what it means after the first section" is one. A vague word such as "engaging" in `fails_when` is reported as a warning, because it leans on an adjective where an observation should be.

### 3. every requirement names its check

Either a deterministic station (a lint, a schema, a source match) or a judgment station (a rubric a grader applies), and the check is written beside the requirement it belongs to.

### 4. every field says where it came from and who wrote it

Where: a brain dump line, an interview answer, a transcript, a prior piece. Who: a person or an agent, and which one, and whether a human explicitly chose it or an agent proposed it and nobody objected. `lint` checks `source`, `author` and `chosen_by` on every decision, and `source` and `author` on every requirement. Neither answer is bad on its own. Knowing which is what lets you debug: an agent that invented a detail, or a person who put in something wrong, both show up as a field with an author you can ask.

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

A hyperspec is a markdown file with a YAML frontmatter block. `hyperspec` names the version of this format the spec was written against; this linter knows `"0.1"`. This is the shape:

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
    author: example-author    # a person slug, or agent:<model>
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
    author: example-author
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

Each row lists every condition under which `hyperspec lint` fails that test. A warning never fails a test. A value that is only a YAML comment (`source: # TODO`), `null`, `~`, or a placeholder counts as missing. A placeholder is a whole value, trimmed and in any case, of `todo`, `tbd`, `fixme`, `xxx`, `placeholder`, `<placeholder>`, `n/a`, a run of dashes, a run of question marks, or an ellipsis, optionally followed by a trailing `.`, `:` or `!`. Real text that starts with one of those (`TODO: write the opening`) counts as present, and so do `none` and a quoted value that happens to start with `#` (`source: "# literal"`).

| Test | Fails when |
|---|---|
| 1 every decision is accounted for | no `decisions`; a decision with no or duplicate `id`; an `id` used by both a decision and a requirement, or by two requirements, since the two lists share one set of ids; `state` not decided, delegated or open; decided without `value`; delegated without `rule`; open without `question` |
| 2 every requirement can fail | no `requirements`; a requirement without `text` or without `fails_when`. A vague word in `fails_when` is a warning |
| 3 every requirement names its check | a requirement whose `check` has neither `station` nor `rubric` |
| 4 every field says where it came from and who wrote it | a decision or requirement without `source` or `author`; a decision whose `chosen_by` is not human or agent |
| 5 negative space is specified | `rejects` missing or empty; a `rejects` item that is not a plain string |
| 6 examples outrank adjectives | `examples` missing or empty; an example without `path` or `why`; a `path` that is not an http(s) URL and does not exist, is a folder, or is the spec itself, read relative to the spec or as an absolute path |
| 7 a stranger can resume it | `resume.next_action` missing; a `next_action` that is only a no-action word (`continue`, `follow up`, `tbd`, `todo`, `keep going`, `pick it back up`, `n/a`, `none`); a `next_action` that says `as discussed` or `as mentioned earlier` or `above`. Those pointers in the body are a warning, and so are a `hyperspec` version and a `profile` this linter does not know |
| 8 its adopters can push back on it | `feedback.issues` or `feedback.fork` missing |
| 9 it improves itself | `improvement.ledger` missing; a ledger path that exists and is not a readable file; if the ledger file exists, a line that is not a JSON object, a `verdict` outside one-shot, improved or not-improved, `improved` without `change`, `not-improved` without `reason`. A declared ledger that does not exist yet is a warning |

A profile adds its own conditions to these rows. The writing profile's are in [WRITING.md](WRITING.md#the-test-mapping), including the checks on each material's segments file: every material marked, every segment labeled from the closed set and matching its material word for word, the marking current (tests 1 and 4), and no spine claim citing a private or question segment (test 5). A writing spec that names a writer-DNA scope folder with `writing.dna.scope_dir` is also checked against it: the scope matches the spec (test 1), every golden has a person's approval and a source (test 4), no golden comes from outside the scope (test 5), and every golden has its why and the scope's measured features are current (test 6). `scope_dir` is optional, and without it nothing changes.

## Exit codes

`hyperspec lint` reports the worst result across every file it is given:

- **0** every test passes and nothing is open.
- **1** at least one test fails.
- **3** every test passes, but a decision is left open, so the work waits on that decision.
- **2** usage error; a file that could not be read; a file whose frontmatter is missing or broken; or a file that is not a hyperspec. A file is a hyperspec when its frontmatter has a `hyperspec` key.

## The improvement ledger

Every run of a skill that works from a hyperspec writes one line to the ledger named in `improvement.ledger`, one JSON object per line, with a `verdict`:

- **one-shot**: no intervention, nothing to learn.
- **improved**: the skill, the spec template, or a component library changed, and the line carries `change`, naming what changed.
- **not-improved**: nothing changed, and the line carries `reason`, a reason a later session can argue with, such as "the correction was about this piece only" or "the fix belongs to a shipped skill and was filed as an issue".

Silence is not a verdict. A run that learned nothing has to say so and why, and a ledger line with none of the three verdicts fails the ninth test.

## Profiles

A profile adds the rules for one kind of work on top of the nine tests. A spec opts in with a top-level `profile:` naming it. A profile never adds a tenth test: every finding it raises reports under one of the nine, with an id that starts with the profile's name, and the score stays out of nine. `lint` prints one more line for a profiled spec, how many of the profile's blocks are complete. A `profile` this linter does not know is a warning under test 7, and none of its rules are checked.

One profile ships: `writing`, for essays, chapters, letters, stories and anything else an agent drafts for a person to read. Its blocks, its fields, which test each rule reports under, `hyperspec init --profile writing`, marking materials with `hyperspec segments init`, and scoped writer DNA with `hyperspec dna init` and `hyperspec dna measure` are in [WRITING.md](WRITING.md).

## Recipes

A hyperspec says what the work must be. A recipe records what one output was made from, so the output can be checked, made again with one change, and graded against the version before it. hyperspec never calls a model. Every step that needs one is a command the caller supplies: a runner for stages and a doctor for grading.

### The recipe file

A recipe sits beside its output as `<output>.recipe.json`: JSON with a two-space indent and a trailing newline. Every path inside it is relative to the recipe file's own directory.

```json
{
  "recipe": "0.1",
  "created": "2026-09-28T18:00:00.000Z",
  "output": { "path": "essay.md", "sha256": "<hex>" },
  "factory": { "name": "my-factory", "version": "0.3.0" },
  "spec": { "path": "essay.hyperspec.md", "sha256": "<hex>", "authors": { "audience": "example-author", "length": "agent:claude" } },
  "inputs": [
    { "name": "call", "path": "materials/call.md", "sha256": "<hex>", "order": 1 }
  ],
  "stages": [
    {
      "id": "outline",
      "reads": ["input:call", "spec"],
      "model": { "name": "some-model", "temperature": 0.7 },
      "key": "<hex>",
      "output": { "sha256": "<hex>" },
      "verdict": { "station": "outline-has-claim-chain", "pass": true, "note": "" }
    }
  ],
  "clicker": "example-author",
  "approver": "example-author",
  "parent": null,
  "change": null
}
```

- `recipe` is the version of this schema, `"0.1"`.
- `output` is the final output's path and hash. It equals the last stage's output.
- `factory` names what made the output, and at which version.
- `spec` is the hyperspec the output was made from: its path, the hash of its bytes, and `authors`, which maps every decision and requirement id to that entry's `author`. Decisions and requirements share one set of ids, so the writer refuses a spec that uses an id twice, and `lint` fails it under test 1.
- `inputs` lists every input by name, path and hash, with `order` counting from 1 in the order each was taken in.
- `stages` lists every step in the order it ran. `model` holds the settings the stage ran with, and is left out when it had none. `verdict` is what the stage's station reported.
- `reads` names what a stage read: `input:<name>`, `stage:<id>` for an earlier stage, or `spec`. An empty `reads` means the stage read everything: every input in order, every earlier stage, then the spec. Such a stage reruns on every regeneration, and `recipe check` warns about it.
- `clicker` is who pressed go. `approver` is who approved the output, and stays `null` until someone does.
- `parent` and `change` are both `null` on a first recipe. On a regenerated one, `parent` is `{ "path", "sha256" }`, the parent recipe's path and the hash of its bytes, and `change` is one line naming what changed.

### The stage key

```
key = sha256(canonical({ reads, spec, factory, model }))
```

- `reads` is the list of `[ref, hash]` pairs in declared order, or in the everything order above for an empty `reads`. `input:<name>` resolves to that input's hash, `stage:<id>` to that stage's output hash, `spec` to the spec's hash.
- `spec` is the spec's hash, `factory` is the factory version, and `model` is the stage's model settings or `null`.
- Canonical JSON sorts keys at every depth, drops keys whose value is undefined, keeps array order, and carries no whitespace. Every hash is SHA-256, lowercase hex, over exact bytes.

A recorded hash is exactly 64 lowercase hex characters. Anything else names no blob: no path is ever built from it, `reproduce` fails the step that holds it, and `recipe check` fails it.

Two stages with the same key read the same bytes under the same spec, factory version and settings. A matching key is the only thing that lets `regenerate` reuse a stage.

### The blob store

Every input, the spec, and every stage output is kept once, by content, at `<root>/.hyperspec/blobs/<first two hex characters>/<hash>`, holding the exact bytes. A blob is written once, through a temporary file and a rename, and never overwritten. `<root>` is the `--store` flag, else the `HYPERSPEC_STORE` environment variable, else the nearest folder above the recipe holding `.hyperspec/` or `.git`, else the recipe's own folder.

This is what makes a recipe reproducible: a file edited next month does not change the bytes an old recipe points at.

### Writing a recipe

A factory records its recipe as it runs, through `@supersuit/hyperspec/recipe`:

- `startRecipe({ output, factory, spec, clicker, store })` loads the spec, stores its bytes, and fills `spec.authors`, recording `null` for an entry with no author. Paths resolve against the working directory.
- `input(name, path)` stores the file's bytes and records it. A repeated name is refused.
- `stage({ id, reads, model, output, verdict })` stores the output and computes the key. `model` and `verdict` are kept as JSON writes them, so the key is computed from exactly what the recipe file holds. An unknown read, a read of a later stage, and a repeated id are refused.
- `finish({ approver })` refuses a recipe with no stages. Otherwise it writes the output file from the last stage's blob, or checks that an output already on disk matches it, writes the recipe, and returns the completeness findings.
- `approve(recipePath, by)` sets the approver and returns the findings again.

`hyperspec recipe check <output-or-recipe>` runs the completeness check. It fails a recipe missing the factory name or version, the spec hash, `spec.authors`, the clicker or the approver; an input with no hash; any recorded hash that is not 64 lowercase hex characters; no stages; a stage with no verdict, a verdict whose `pass` is not true or false, or a stage still pending; a stored key that differs from the key recomputed from the recipe; a last stage whose output is not `output.sha256`; and a `parent` without a `change`, or the reverse. It warns on a stage that declares no reads, and on a spec id with no author, naming the id. It reads the recipe only: whether the blobs are still in the store is what `reproduce` checks. `hyperspec recipe approve <recipe> --by <slug>` records the approver.

### reproduce

`hyperspec reproduce <recipe> [--restore] [--store <dir>]` checks every hash the recipe recorded. It runs no model and no command. In order, it checks each input's blob, the spec's blob, each stage's output blob and the stage's key recomputed from the recipe, the final output's blob, and the output file on disk when there is one. It reports every step and names the first that fails. A pending stage fails.

`--restore` rewrites the output file from its blob, and only when that blob checks out. A recipe whose output path points outside its own folder is refused, and nothing is written there.

### regenerate

`hyperspec regenerate <recipe> --out <path> --clicker <slug>` takes exactly one change:

- `--add-input <name>=<path>` adds an input, and each `--reads <stage-id>` adds it to that stage's reads. `--reads` may be given more than once. A stage whose `reads` is empty already reads every input. An input that no stage would read is refused, since the child would be its parent with an unused input recorded.
- `--swap-input <name>=<path>` replaces an input. A file with the same bytes is refused, since swapping it would change nothing.
- `--factory-version <version>` names a factory version other than the parent's.

The child is the parent with that change applied. Each stage, in order, is reused only when two things hold: the key recomputed from the child's hashes equals the key the parent recorded, and the parent's recorded key matches the key recomputed from the parent's own record. A stage whose key differs reruns. A stage whose key matches but whose recorded output blob is missing or altered stops the regeneration, and nothing is written, since rerunning a stage whose key has not changed is exactly what regenerate must never do. With `--run <command>`, each stage is decided once everything it reads has run, so a stage whose upstream reran and came out byte for byte the same is still reused. Without `--run`, nothing runs: a stage that must rerun is written as pending, and every stage that reads it is pending too, with no key.

Nothing is written until the outcome is known. Then the new blobs, the child's output file, and `<out>.recipe.json` are written; while any stage is pending there is no output yet, so only the blobs and the recipe are. The output is written through a temporary file and read back against its hash. The child names its parent and the change, one line such as `added input call-2 (materials/call-2.md)`, `swapped input call to materials/call-v2.md`, or `factory 0.3.0 to 0.4.0`, which `--change <text>` replaces. Its approver is `null`. The parent recipe, its output and its blobs are only read. `--out` must not exist and must not be the parent's output, its folder must exist, and it is checked again just before anything is written.

**The runner contract.** hyperspec runs `/bin/sh -c <command>` once for each stage that must rerun.

- stdin is `{ "stage": "<id>", "reads": [{ "ref": "<ref>", "sha256": "<hex>", "path": "<file>" }], "model": <settings or null> }`. Each `path` is a temporary file holding that read's exact bytes, removed after the stage runs.
- stdout, byte for byte, is the stage's output.
- The last stderr line that begins `VERDICT ` carries the verdict as a JSON object whose `pass` is true or false. `station` defaults to `runner` and `note` to an empty string. With no such line, the verdict is `{ "station": "runner", "pass": false, "note": "runner reported no verdict" }`: silence is not a verdict, so a runner has to say something.
- A runner that exits non-zero, or a `VERDICT` line that is not such an object, stops the regeneration and names the stage, and nothing is written.
- A failing verdict from a stage that ran in this regeneration, including a runner that reported none, still produces a child, written in full, and the command exits 1 naming the stage.
- A reused stage keeps the verdict its parent recorded, and that verdict does not affect the exit code, even when it failed. Only the stages this regeneration ran are counted.

### compare

`hyperspec compare <child-recipe> --doctor <command> [--parent <recipe>] [--spec <file>]` grades the child's output and its parent's output with the same doctor command against the same spec. The parent defaults to the one the child names, and the spec to the child's spec. It warns when the parent recipe's bytes have changed since the child was made, and when the spec being graded against differs from the one the parent was made from; both outputs are still graded against that one file.

A score is attributed to a recipe, so the bytes graded must be the bytes the recipe records. Before the doctor runs, each output file is hashed against its recipe's `output.sha256`. A file that does not match, edited by hand or replaced since, is refused with `parent output does not match its recipe; run hyperspec reproduce --restore` (or `child`), and nothing is graded or appended to the ledger.

**The doctor contract.** hyperspec runs `/bin/sh -c <command>` once per output, with the same command both times. stdin is `{ "output": "<file>", "spec": "<file>" }`, both absolute paths. The last non-empty stdout line is a JSON object with a finite numeric `score` and an optional `notes`. Nothing from a recipe is placed into the command itself.

A child that scores lower than its parent has regressed. `compare` exits 1 and names the suspect, the child's `change`. When the spec declares `improvement.ledger`, `compare` appends one line to it, in the ledger's own vocabulary so the line passes the ninth test: `improved` with `change` when the child scores higher, and otherwise `not-improved` with a `reason` naming both scores, which begins `regression: ` when the child scored lower. The line also carries `kind: "compare"`, both recipe paths, both scores, and `regressed`. A ledger path outside the spec's folder is not written, and a warning says so.

### Recipe exit codes

The recipe commands use the same numbers as `lint`. Every one takes `--json`, which prints the result as one JSON document and keeps the same exit code.

| Command | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| `recipe check` | complete, warnings allowed | no recipe beside the path, or a check failed | a recipe that cannot be read or is not JSON | |
| `recipe approve` | approver recorded, remaining findings printed | | `--by` missing, or a recipe that cannot be read | |
| `reproduce` | every hash checks out | a check failed | a usage error, or a recipe that cannot be read | |
| `regenerate` | child written, and every stage that ran reported a passing verdict | a runner failed or a blob it needs is missing, and nothing was written; or the child was written with a failing verdict from a stage that ran | a usage error, such as no change or more than one, a missing `--out` or `--clicker`, an `--out` that exists, an unknown stage in `--reads`, an added input no stage reads, a parent or input that cannot be read | child written with stages waiting for a runner |
| `compare` | the child did not regress | the child regressed | a usage error, a recipe or spec that cannot be read, a child that names no parent when none is given, a missing output file or one that does not match its recipe, or a doctor that failed | |

### Known limits in 0.2

- A pending child cannot yet be finished in place. Rerunning `regenerate` with `--run` is refused because the child recipe exists; to produce the output, rerun `regenerate` on the parent with a runner and a new `--out`.
- Approve a recipe before regenerating from it. Approval rewrites the recipe's bytes, and a child records its parent's hash, so approving a parent after a child exists makes `compare` warn that the parent recipe changed.
- `reproduce`, `regenerate` and `compare` are commands, not yet library functions. `@supersuit/hyperspec/recipe` exports the writer (`startRecipe`, `approve`); a factory runs the other three through the `hyperspec` command.

## Why now

A human reader treats a thousand-line spec as a burden, so specs were written short and the gaps were filled from shared context. A model reads all of it at almost no cost and uses every line. Detail that would have been waste between two people is now the cheapest input there is. That is why hyperspecification exists now and could not have before: the reader changed, so the economics of writing everything down changed with it.
