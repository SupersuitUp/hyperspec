# hyperspec

A hyperspec is a spec written for an agent: every decision is recorded with who made it and
where it came from, every requirement can fail in a named way, and every field is traced back
to its source. This package is the standard and its linter.

## 30 seconds

```bash
npx @supersuit/hyperspec lint spec.md
```

```
spec.md: pass (9/9)
```

Nine tests run against the frontmatter: decisions, failable requirements, checked
requirements, provenance, rejects, examples, resumability, a place to push back, and an
improvement ledger. Every test is defined in [SPEC.md](SPEC.md).

## Commands

| Command | What it does |
|---|---|
| `hyperspec lint <file...> [--json]` | Score each hyperspec against the nine tests. |
| `hyperspec init <file> [--title T] [--kind K]` | Write a new hyperspec skeleton. Refuses to overwrite an existing file. |
| `hyperspec init <file> --profile writing [--title T] [--form F] [--fiction]` | Write a writing-spec skeleton, every block shown with placeholders. |
| `hyperspec segments init <material> --id <mid> [--out F] [--by paragraph\|sentence] [--keep OLD]` | Split a material into segments to label. With `--keep`, re-mark an edited material: every segment whose text is unchanged keeps its id and labels, and only the rest are listed to label. Refuses to overwrite an existing file unless `--keep` names it. |
| `hyperspec segments label <segments-file> <ids>=<label>[:key=value]...` | Label segments in place (`s1,s4=aside`, `s3=quote:speaker=gary-sheng`, `s2=claim:own=true`); offsets and text never change. Refuses an unknown id or label with nothing written. |
| `hyperspec dna init <scope-dir> --writer W --form F --audience A --purpose P` | Start a writer-DNA scope folder. Refuses to overwrite an existing `scope.md`. |
| `hyperspec dna measure <scope-dir>` | Check every golden in a scope and write its measured features. |
| `hyperspec check <spec> [--draft <file>] [--only a,b]` | Run a writing spec's deterministic stations against a draft, or, for a sequential work, against its files in reading order. |
| `hyperspec ready <spec> --draft <file> [--judges a,b]` | Has this draft been through the engine? From the runs ledger only: a passing full check of these exact bytes, every required judge passing on them (each panel reader, the buyer included), and the check after the last judge so triage was held. Exit 0 ready, 1 not ready with each missing step listed. |
| `hyperspec judge prepare <spec> --draft <file> --out <dir> [--only a,b] [--force]` | Write one packet per judgment station, for an outside judge to fill. |
| `hyperspec judge record <packet> --verdict <file>` | Check a judge's verdict against its packet, derive the station's status, and record it. |
| `hyperspec triage status <spec> [--draft <file>]` | Count every finding's answer, list the passages two or more readers share, and hold every answer to the draft. |
| `hyperspec triage answer <spec> <finding> taken\|kept\|already-true\|open [--evidence S] [--reason S] [--draft <file>]` | Answer one finding: evidence from the draft for taken and already-true, a reason for kept. |
| `hyperspec triage import <spec> <review> [--source S] [--draft <file>]` | Bring an outside review in as findings to answer. |
| `hyperspec triage reply <spec> [--source S] [--draft <file>]` | Print a plain-text reply to the reviewer from the answers. Never sends anything. |
| `hyperspec learn prepare <spec> --first <draft> --approved <draft> --out <dir> [--force]` | Write the edits between a first draft and the approved one, for a judge to classify by spec block. |
| `hyperspec learn record <packet> --verdict <file>` | Count the classified edits by block and name one next move. |
| `hyperspec recipe check <output-or-recipe>` | Check that a recipe records everything the standard asks for. |
| `hyperspec recipe approve <recipe> --by <slug>` | Record who approved the output. |
| `hyperspec reproduce <recipe> [--restore]` | Re-check every hash the recipe recorded. Never runs a model. |
| `hyperspec regenerate <recipe> --out <path> --clicker <slug> <one change> [--run cmd]` | Make a child recipe from a parent and one named change, rerunning only the stages it reaches. |
| `hyperspec compare <child-recipe> --doctor cmd` | Grade a child and its parent through one doctor against one spec. |

Every command except `init`, `segments init`, `segments label` and `dna init` takes `--json`. `hyperspec --help` prints every flag.

## Exit codes

`hyperspec lint` exits 0 when every test passes and nothing is open, 1 when at least one
test fails, 3 when every test passes but a decision is still open (blocked), and 2 on a usage
error or a file that cannot be read, has broken frontmatter, or is not a hyperspec.

`hyperspec check` exits 0 when every station it ran passed, 1 when one failed, and 2 on a usage
error, a draft that cannot be read, or a spec without `profile: writing`. A spec that is not ready to check against exits with lint's
own code, 1 or 3, and no station runs.

`hyperspec judge record` exits 0 when the station passed and 1 when it failed or the verdict was
refused (invalid, or its packet stale or edited), and `hyperspec learn record` 0 when it recorded
and 1 when it refused. `judge prepare` and `learn prepare` exit 0 when they wrote their packets and
with lint's own code when the spec is not ready, and `judge prepare` exits 1 when a station could
not build its packet. All four exit 2 on a usage error.

`hyperspec triage status` exits 0 when every finding is answered and every answer holds against
the draft, and 1 when not; `triage answer` 0 when it wrote the answer and 1 when it refused it;
`triage import` 0 when it imported and 1 when the review holds nothing to answer; `triage reply` 0
when the reply is ready to send and 1 when a finding is still unanswered. All four exit 2 on a
usage error.

The recipe commands use the same numbers: 0 ok, 1 a check failed or the child regressed, 2
usage or unreadable input, 3 pending, when `regenerate` has stages waiting for a runner.
`regenerate` also exits 1 when a stage it ran reported a failing verdict, or none. A stage it
reused keeps its parent's verdict and does not change the exit code.

## Recipes

A hyperspec says what the work must be. A recipe says what one piece of work was made from.
Every output a factory makes can carry one beside it, `<output>.recipe.json`: the factory and
its version, the spec and who wrote each of its fields, every input by path and SHA-256 hash,
every stage with what it read and its verdict, and who pressed go and who approved. Inputs and
stage outputs are kept by content in `.hyperspec/blobs/`, so a file edited next month cannot
change what an old recipe reproduces.

A recipe runs again three ways. `reproduce` re-checks every recorded hash and never runs a
model. `regenerate` takes one named change, reruns only the stages that change reaches, and
reuses the rest. The runner you give it prints each stage's output and a `VERDICT` line; a
runner that prints no verdict fails the stage. `compare` grades the new output and its parent
through the same doctor against the same spec, so a claim that the new one is better is a
number. It grades only the bytes each recipe records, and refuses an output edited since.

### 30 seconds

The package ships a worked example in `examples/recipe/`: a factory with two inputs and three
stages, a runner and a doctor, all plain text transforms with no model in them.

```bash
cp -r node_modules/@supersuit/hyperspec/examples/recipe recipe-demo
cd recipe-demo
node factory.mjs
npx hyperspec recipe approve essay.md.recipe.json --by you
npx hyperspec reproduce essay.md.recipe.json
npx hyperspec regenerate essay.md.recipe.json --out essay-2.md --clicker you --add-input call-2=materials/call-2.md --reads claims --run "node runner.mjs"
npx hyperspec compare essay-2.md.recipe.json --doctor "node doctor.mjs"
```

The second call reaches the `claims` stage and the `draft` that reads it, so `terms` is reused.
The child carries two more claims, and the comparison lands in the spec's ledger:

```
  claims: rerun
  terms: reuse
  draft: rerun
child scored 5 vs parent 3 (delta 2)
```

A factory writes its recipe with the writer API:

```js
import { startRecipe } from "@supersuit/hyperspec/recipe";

const recipe = startRecipe({
  output: "essay.md",
  factory: { name: "my-factory", version: "1.0.0" },
  spec: "essay.hyperspec.md",
  clicker: "you",
});
recipe.input("call", "materials/call.md");
recipe.stage({ id: "claims", reads: ["input:call"], output: claimsText, verdict: { station: "claims-not-empty", pass: true, note: "" } });
recipe.finish();
```

The schema, the stage key, the runner and doctor contracts, and every exit code are in
[SPEC.md](SPEC.md#recipes).

## Writing specs

A piece of writing gets its own profile. Add `profile: writing` to a hyperspec and it gains nine
blocks that name what an agent would otherwise fill with the average: the materials it draws on
and how far each can be trusted, the writer's voice scoped to this form, audience and purpose,
who the piece speaks as, who reads it and what they already know, the one change the piece is
for, its form, the claims it argues in order, where every fact comes from, and in fiction every
character who speaks. Findings still report under the nine tests, and `lint` adds one line:

```
essay.hyperspec.md: pass (9/9)
  writing: 9/9 blocks complete
```

Start one with every block laid out and waiting:

```bash
npx @supersuit/hyperspec init essay.hyperspec.md --profile writing --title "Your title"
npx @supersuit/hyperspec init story.hyperspec.md --profile writing --form "short story" --fiction
```

The skeleton fails until every placeholder is real and its four open questions (whose voice,
who speaks, who reads, what changes) are answered. The blocks, every field, and which test
each rule reports under are in [WRITING.md](WRITING.md). Three complete specs that pass with
nothing to warn ship in `examples/writing/`: an essay for new managers, a short story with
two characters whose voices a judge can tell apart, and a four-lesson course. Each comes with a
draft written to it.

### Marking materials

Every material a writing spec draws on is marked before the spec can pass: split into segments,
and each segment labeled with what it may be used as (claim, story, quote, stance, question,
aside, private). hyperspec does the splitting and the checking; an agent or a person does the
labeling.

```bash
npx @supersuit/hyperspec segments init materials/voice-memo.md --id voice-memo
npx @supersuit/hyperspec lint essay.hyperspec.md
```

The first writes `materials/voice-memo.md.segments.jsonl`, every segment `unlabeled`. Name that
file as `segments:` on the material item, label every segment, and `lint` checks that each label
is from the set and carries what it needs, that each segment matches the material word for word,
that the material has not changed since, and that no spine claim cites a private or question
segment. The file format, the labels, and every finding are in
[WRITING.md](WRITING.md#marking-materials). A tool of your own can run the same check with
`import { readSegments } from "@supersuit/hyperspec/writing"`.

### Scoped DNA

A writer sounds different in a theology essay and on a landing page, so a writer's voice is kept
per scope (a form, an audience and a purpose), and each scope is a folder of goldens. A golden is a real
passage a person approved, with a note on the move it teaches and where it came from, and it
feeds only work that shares its scope.

```bash
mkdir -p dna
npx @supersuit/hyperspec dna init dna/essay-new-managers-teach --writer example-author --form essay --audience "new managers" --purpose teach
npx @supersuit/hyperspec dna measure dna/essay-new-managers-teach
```

`dna init` writes `scope.md` and a `goldens/` folder holding only a README. Add one file per
golden, then `dna measure` checks each golden and writes `features.json`: sentence and paragraph length, punctuation,
pronouns and signature words, measured and never judged. Name the folder in a spec as
`writing.dna.scope_dir` and `lint` checks that the scope matches the spec, that no golden comes
from another scope, and that the measurements are current. Without `scope_dir`, a spec lints as
it did in 0.4. The folder shape, every feature, and every finding are in
[WRITING.md](WRITING.md#scoped-dna); `readScope` and `measureFeatures` are exported from
`@supersuit/hyperspec/writing`.

### Checking a draft

Once a draft exists, `check` holds it to its spec with nine stations, none of which calls a
model or touches the network: `form` (length and required parts), `terms` (every word in the new
optional `writing.audience.terms` is defined where it first appears), `claims` (the claims
ledger still matches the draft, and every claim has a source), `quotes` (in nonfiction, every quotation of four
words or more is word for word in a marked quote; `writing.quotes.examples` marks example
phrasings such as "write the update for Dana" as examples rather than quotations), `private` (no run of eight words from a
private segment), `dna` (the draft's measured style beside its scope's, as warnings), `links`
(well-formed, and relative links resolve), `sequence` (for a work read in order; see below) and
`triage` (every reader's finding answered, and every answer held to the draft; see below).

```bash
npx @supersuit/hyperspec check essay.hyperspec.md --draft essay/draft.md
```

It lints the spec first, prints each station's pass, fail or skip, and appends one line to the
spec's runs ledger with a verdict. Every example ships a draft that passes. What each station
checks and cannot check, and every finding, are in
[WRITING.md](WRITING.md#checking-a-draft).

### Sequential works

A course, a primer or a textbook promises something no single piece can check: Lesson 5 uses only
words Lessons 1 to 4 defined. Add `sequence:` to `writing.form` and the `sequence` station checks
it across the whole work: every lesson carries its sections ("After this lesson you can", "New
terms", "Try this" by default), every term is defined in exactly one lesson, no lesson uses a term
before the lesson that defines it (code, the part's closing teaser and words the reader already
knows are exempt), each lesson defines the terms the outline promises, and a pointer to a later
lesson is a warning. Name the quiz heading as `quiz:` and every quiz is held to it too: every
defined term tested by some question, no question using a term from a lesson after the one it is
tagged with, and every answer one of its question's options. List the work's files and `check`
needs no `--draft`:

```yaml
    sequence:
      files:
        - course/part-*.md
      outline: course/outline.md
```

```bash
npx @supersuit/hyperspec check course.hyperspec.md
```

The parts are read in order, a finding names the part and its line, and a new part matching the
pattern is picked up without touching the spec. Every key, how a lesson is read, and every finding
are in [WRITING.md](WRITING.md#sequential-works).

### Judging a draft and learning from edits

The rest of a spec's checks are judgments: whether each goal condition holds, where a reader gets
lost, whether a passage can be told from the writer's goldens, whether the persona holds, and in
fiction whether the characters' voices can be told apart and whether anyone knows something too
early. hyperspec never calls a model. `judge prepare` writes a packet per station for an outside
judge, your agent, any model or a person, and `judge record` checks the verdict (every quoted
passage must be in the draft, and the blind tests are scored against keys the judge never
sees), derives the station's status, and records it in the runs ledger.

```bash
npx @supersuit/hyperspec judge prepare essay.hyperspec.md --draft essay/draft.md --out essay/judge
npx @supersuit/hyperspec judge record essay/judge/doctor.packet.json --verdict doctor.verdict.json
```

Hand the judge the `*.packet.json` files only: the answer keys are written beside them. Give the
two blind packets (`lineup`, `attribution`) to a judge in a fresh context with no access to the
draft, such as a new conversation, never to an agent working in the draft's folder: a judge that
can open the draft can always find the answer, whatever the packet tells it. Give each blind
packet its own context, apart from the other packets too, since those carry the draft. `learn`
closes the loop from the other end. Given the first draft a factory wrote and the draft a person
approved, `learn prepare` lists the edits, a judge names the spec block that should have prevented
each, and `learn record` counts them by block and names one next move, such as "add a golden or a
style rule". It never edits the spec. Both examples ship their packets and hand-filled sample
verdicts. The packet shapes, every station's rules and findings, and the learn tally are in
[WRITING.md](WRITING.md#judging-a-draft).

### A reader panel, and answering what it found

A draft gets pressure-tested before it ships: several readers read it, each through their own
lens, and say what works, what to improve, what is missing and what to remove. The `panel` judge
makes that part of the run. It writes one packet per reader, the ones `writing.panel` lists or by
default a skeptic, a newcomer and an expert, and always the audience's own reader as `buyer`,
since a panel that never includes the person the piece is for tests everything but that. Every
item a reader lists quotes the draft word for word, so a review of a stale copy is refused.

Each thing a reader would change becomes a finding in `triage.jsonl`, beside the runs ledger, and
so does each point of an outside review brought in with `triage import`. Every finding gets one
answer: `taken` (with the passage of the draft that now does it), `kept` (with the reason),
`already-true` (with the passage that already did it) or `open` (a decision for you). `check` fails
while a finding is unanswered or an answer's passage is no longer in the draft, and warns on an
open one. `triage reply` turns the answers into a plain-text reply to the reviewer, for you to send.

```bash
npx @supersuit/hyperspec judge record story/judge/panel-skeptic.packet.json --verdict story/sample-verdicts/panel-skeptic.verdict.json
npx @supersuit/hyperspec triage status story.hyperspec.md --draft story/draft.md
npx @supersuit/hyperspec triage answer story.hyperspec.md panel-skeptic-aeb09835 open --draft story/draft.md --reason "the author's call"
npx @supersuit/hyperspec triage reply story.hyperspec.md --draft story/draft.md
```

The triage file, every answer's rule, how a review is read, and every finding are in
[WRITING.md](WRITING.md#triage-1).

## The format

A hyperspec is a markdown file with a YAML frontmatter block: `decisions`, `requirements`,
`rejects`, `examples`, `resume`, `feedback`, and `improvement`, plus an optional `profile`.
The full field-by-field standard, including what makes each of the nine tests fail, is in
[SPEC.md](SPEC.md).

## Install

```bash
npm install @supersuit/hyperspec
```

Node 20 or later. One dependency, `@supersuit/superskill`, for the YAML reader.
