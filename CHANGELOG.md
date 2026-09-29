# Changelog

## 0.2.0 (2026-09-28)

Recipes. Every output a factory makes can now carry a recipe beside it: what made it, from
what, and who approved it, with every input and every intermediate step kept as its exact
bytes. From a recipe you can check that an output is still exactly what was made, make it
again with one more ingredient while reusing every step that ingredient does not reach, and
grade the new output against the old one, so "the new one is better" is a number. hyperspec
calls no model to do any of this: the steps that need one are commands you supply.

- `hyperspec recipe check <output-or-recipe>` reports what a recipe is missing: the factory
  version, the spec hash and who wrote each of its fields, an input's hash, a stage's verdict,
  the clicker, the approver. `hyperspec recipe approve <recipe> --by <slug>` records the
  approver.
- `hyperspec reproduce <recipe> [--restore]` re-checks every recorded hash and names the
  first that fails. `--restore` rewrites the output from its stored bytes.
- `hyperspec regenerate <recipe> --out <path> --clicker <slug>` takes one change,
  `--add-input name=path [--reads stage]...`, `--swap-input name=path` or
  `--factory-version v`, reruns only the stages it reaches through `--run <runner>`, reuses
  the rest, and writes a child recipe naming its parent and the change. Without `--run` the
  child is written with those stages pending, and the command exits 3.
- `hyperspec compare <child-recipe> --doctor <command>` grades the child and its parent with
  one doctor against one spec, exits 1 on a regression naming the change as the suspect, and
  appends the result to the spec's improvement ledger.
- `@supersuit/hyperspec/recipe` exports `startRecipe` and `approve`, which a factory calls as
  it runs to record inputs and stages and write the recipe.
- `examples/recipe/` is a worked factory, runner and doctor. The README walks the full loop,
  and a test runs that walkthrough exactly as written, so the two cannot drift apart.
- SPEC.md gains a Recipes section: the recipe file, the stage key, the blob store, each
  command's contract, the runner and doctor contracts, and every exit code.
- `lint` fails an id used twice across decisions and requirements (test 1), and an example
  that is a folder or is the spec itself (test 6). It warns on a `hyperspec` version it does
  not know (test 7) and on a declared ledger that does not exist yet (test 9).
- `hyperspec init` quotes a title or kind that a YAML reader would read back differently.
- The README's exit-code sentence names every case that exits 2, matching SPEC.md.

## 0.1.0 (2026-09-28)

- The hyperspecification standard: a markdown file with a YAML frontmatter block, versioned
  in git, living beside the work it specifies.
- Nine tests: decisions, failable requirements, checked requirements, provenance, rejects,
  examples, resumability, a place to push back, and an improvement ledger.
- `hyperspec lint <file...> [--json]`, exiting 0 pass, 1 a test fails, 3 blocked on an open
  decision, 2 usage or IO error.
- `hyperspec init <file> [--title T] [--kind K]`, writing a new hyperspec skeleton and
  refusing to overwrite an existing file.
- Every finding names its test, a severity, a message and a fix.
- YAML read only through `parseSkillFile` from `@supersuit/superskill/yaml`.
- SPEC.md is itself a hyperspec and passes its own lint.
- A placeholder value never counts as present: a value that is only a YAML comment
  (`source: # TODO`), or `null`, or `~`, fails the test its field belongs to.
- `hyperspec lint` never skips a file that follows a stray flag such as `--kind`.
- The package ships `examples/minimal.hyperspec.md`, the smallest spec that passes all nine
  tests, and SPEC.md points at it, so the SPEC.md inside the package passes its own lint.
- Test 7 fails a `next_action` that is only a no-action word (`continue`, `tbd`, `n/a`, and
  the rest), so "continue drafting section two from the outline" passes; it also fails a
  `next_action` that says "as discussed" or "as mentioned earlier" or "above".
- Test 5 names a `rejects` item that is not a plain string, instead of reporting that
  nothing is rejected.
- SPEC.md describes exactly what `lint` enforces: decision completeness is the author's job,
  a vague `fails_when` is a warning, where `chosen_by` is checked, how example paths
  resolve, and that exit 2 covers a file that is not a hyperspec.
- A ledger can never crash the linter: a ledger path that is a directory or a device, or a
  file that cannot be read, fails test 9, and a ledger line that is valid JSON but not an
  object (such as `null`) is a bad line. A crash on one file is reported as that file's
  error and never stops the others or empties `--json`.
- The body scan for "as discussed" skips fenced code blocks and inline code, so a spec can
  quote the phrases it bans. SPEC.md lints with zero findings, warnings included.
- SPEC.md cites only sources a public reader can open, and its next action is to collect
  adopter issues on 0.1 and cut 0.2 from them.
- The README's sample output is exactly what `hyperspec lint` prints.
- Reads YAML through `@supersuit/superskill/yaml` 0.2.1, which now returns a comment-only value
  (`source: # TODO`) as an empty string itself. The placeholder rule no longer treats a leading
  `#` as empty; it only handles `null` and `~`, which the reader still keeps as those literal
  strings. A quoted value that starts with `#` (`source: "# literal"`) is real text and counts
  as present.
