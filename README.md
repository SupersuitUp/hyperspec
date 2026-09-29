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
| `hyperspec segments init <material> --id <mid> [--out F] [--by paragraph\|sentence]` | Split a material into segments to label. Refuses to overwrite an existing file. |
| `hyperspec dna init <scope-dir> --writer W --form F --audience A --purpose P` | Start a writer-DNA scope folder. Refuses to overwrite an existing `scope.md`. |
| `hyperspec dna measure <scope-dir>` | Check every golden in a scope and write its measured features. |
| `hyperspec check <spec> --draft <file> [--only a,b]` | Run a writing spec's deterministic stations against a draft. |
| `hyperspec recipe check <output-or-recipe>` | Check that a recipe records everything the standard asks for. |
| `hyperspec recipe approve <recipe> --by <slug>` | Record who approved the output. |
| `hyperspec reproduce <recipe> [--restore]` | Re-check every hash the recipe recorded. Never runs a model. |
| `hyperspec regenerate <recipe> --out <path> --clicker <slug> <one change> [--run cmd]` | Make a child recipe from a parent and one named change, rerunning only the stages it reaches. |
| `hyperspec compare <child-recipe> --doctor cmd` | Grade a child and its parent through one doctor against one spec. |

Every command except `init`, `segments init` and `dna init` takes `--json`. `hyperspec --help` prints every flag.

## Exit codes

`hyperspec lint` exits 0 when every test passes and nothing is open, 1 when at least one
test fails, 3 when every test passes but a decision is still open (blocked), and 2 on a usage
error or a file that cannot be read, has broken frontmatter, or is not a hyperspec.

`hyperspec check` exits 0 when every station it ran passed, 1 when one failed, and 2 on a usage
error, a draft that cannot be read, or a spec without `profile: writing`. A spec that is not ready to check against exits with lint's
own code, 1 or 3, and no station runs.

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
each rule reports under are in [WRITING.md](WRITING.md). Two complete specs that pass with
nothing to warn ship in `examples/writing/`: an essay for new managers, and a short story with
two characters whose voices a judge can tell apart. Each comes with a draft written to it.

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

Once a draft exists, `check` holds it to its spec with seven stations, none of which calls a
model or touches the network: `form` (length and required parts), `terms` (every word in the new
optional `writing.audience.terms` is defined where it first appears), `claims` (the claims
ledger still matches the draft, and every claim has a source), `quotes` (in nonfiction, every quotation of four
words or more is word for word in a marked quote), `private` (no run of eight words from a
private segment), `dna` (the draft's measured style beside its scope's, as warnings) and `links`
(well-formed, and relative links resolve).

```bash
npx @supersuit/hyperspec check essay.hyperspec.md --draft essay/draft.md
```

It lints the spec first, prints each station's pass, fail or skip, and appends one line to the
spec's runs ledger with a verdict. Both examples ship a draft that passes. What each station
checks and cannot check, and every finding, are in
[WRITING.md](WRITING.md#checking-a-draft).

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
