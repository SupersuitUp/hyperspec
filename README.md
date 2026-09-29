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
| `hyperspec recipe check <output-or-recipe>` | Check that a recipe records everything the standard asks for. |
| `hyperspec recipe approve <recipe> --by <slug>` | Record who approved the output. |
| `hyperspec reproduce <recipe> [--restore]` | Re-check every hash the recipe recorded. Never runs a model. |
| `hyperspec regenerate <recipe> --out <path> --clicker <slug> <one change> [--run cmd]` | Make a child recipe from a parent and one named change, rerunning only the stages it reaches. |
| `hyperspec compare <child-recipe> --doctor cmd` | Grade a child and its parent through one doctor against one spec. |

Every command except `init` takes `--json`. `hyperspec --help` prints every flag.

## Exit codes

`hyperspec lint` exits 0 when every test passes and nothing is open, 1 when at least one
test fails, 3 when every test passes but a decision is still open (blocked), and 2 on a usage
error or a file that cannot be read, has broken frontmatter, or is not a hyperspec.

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

## The format

A hyperspec is a markdown file with a YAML frontmatter block: `decisions`, `requirements`,
`rejects`, `examples`, `resume`, `feedback`, and `improvement`. The full field-by-field
standard, including what makes each of the nine tests fail, is in [SPEC.md](SPEC.md).

## Install

```bash
npm install @supersuit/hyperspec
```

Node 20 or later. One dependency, `@supersuit/superskill`, for the YAML reader.
