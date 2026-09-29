# Changelog

## 0.5.0 (2026-09-29)

Scoped writer DNA. A writer does not have one voice: the same person writes differently for a
theology journal and a landing page. So a writer's voice is now kept per scope, a form, an
audience and a purpose, as a folder of goldens: real passages a person approved, each with a note
on the move it teaches and where it came from. A golden feeds only work that shares its scope, so
a passage that is right for one kind of writing never teaches its moves to another. hyperspec
measures each scope's style from its goldens (sentence and paragraph length, punctuation,
pronouns, signature words), counts and never judges, and still calls no model.

**No behavior change for existing specs.** Scoped DNA is opt-in through a new optional field,
`writing.dna.scope_dir`. A spec without it passes and fails exactly as it did in 0.4.0, and no
finding id changed: every id below is new.

- `hyperspec dna init <scope-dir> --writer W --form F --audience A --purpose P` writes a scope
  folder: `scope.md` (writer, form, audience, purpose, optional notes) and a `goldens/` folder
  holding a README on the golden file shape. It refuses to overwrite an existing `scope.md`, never
  replaces a `goldens/README.md` that is already there, and
  exits 2 with a plain message on a missing flag, a flag whose value is a placeholder, or a
  parent folder that does not exist. Paths print as you gave them.
- A golden is one `.md` file directly in `goldens/`, other than `README.md`: frontmatter `why`
  (the move it teaches), `approved_by` (a person; an approver starting `agent:` is refused,
  because golden means a human approved it) and `source` are required, `approved_on` is optional,
  and the body is the passage, verbatim. A `goldens/` folder that resolves outside its scope, such
  as a symlink to another scope's goldens, is refused under test 5, naming where it leads.
- `hyperspec dna measure <scope-dir> [--json]` checks every golden and writes
  `<scope-dir>/features.json`: the scope, each golden's path and SHA-256, and the features. If
  the scope or any golden fails a check it writes nothing and exits 1, so a hollow or borrowed
  golden is never measured in. The same goldens always produce the same bytes.
- The features: word count; sentence length in words (mean, median, 90th percentile); paragraph
  length in sentences and in words; per-1000-word rates of commas, semicolons, colons, em dashes,
  en dashes, exclamation marks, question marks, parentheses and quotation marks; contraction,
  first-person singular, first-person plural and second-person rates; mean word length; and up to
  15 signature words. Sentences and paragraphs are split the same way `segments init` splits
  them.
- With `writing.dna.scope_dir`, `lint` checks that `scope.md` matches the spec's writer, form,
  audience and purpose (test 1); that every golden the spec lists is one of the scope's goldens,
  after following any symlink, and never a passage in a subfolder, in `README.md` or in another
  kind of file (test 5); that every golden in the folder has its `why` (test 6), a person's
  approval and a source (test 4) and a passage (test 1); and that `features.json` is exactly what
  `dna measure` would write now (test 6). The stale finding names what differs: goldens added,
  removed or changed, a changed `scope.md` field, an unknown format version, or a number edited by
  hand. A `scope_dir` that is present but a placeholder fails test 1.
- New finding ids, all starting `writing-dna-`: `scope-dir`, `scope-missing`,
  `scope-file-<field>` (a scope's `scope.md` lacks writer, form, audience or purpose),
  `scope-mismatch-<field>`, `goldens-missing`, `goldens-empty`, `goldens-outside`,
  `golden-unreadable`, `golden-frontmatter`, `golden-empty`, `golden-approved-by`,
  `golden-approved-by-agent`, `golden-source`, `golden-leak`, `golden-why`, `features-missing` and
  `features-stale`. Every existing id is unchanged; in particular a spec whose own
  `writing.dna.scope` lacks a field still reports `writing-dna-scope-form` (and `-audience`,
  `-purpose`) as in 0.4.0. Every message names the scope folder as the spec wrote it and the
  golden by its path inside the folder, never a folder on your machine. WRITING.md lists every one
  with its test.
- `hyperspec init --profile writing` shows `scope_dir: TODO` in the `dna` block, which fails until
  it names a scope folder or is deleted.
- Two new exports from `@supersuit/hyperspec/writing`: `readScope`, which reads a scope folder
  and returns `{ scope, goldens, findings }` without throwing, and `measureFeatures`, which takes
  an array of passages and returns the features `dna measure` writes.
- The essay example takes its voice from a scope folder,
  `examples/writing/dna/essay-new-managers-teach/`, with three goldens and a measured
  `features.json`. Its two goldens moved there from `examples/writing/essay/goldens/`, and a third
  was added. The story example keeps its goldens in the spec with no scope folder, and still
  passes.
- WRITING.md gains a Scoped DNA section: why a writer's DNA is scoped, the folder shape, the
  golden file, both commands with their output, what each feature measures and what it is for,
  staleness, naming a scope in a spec, every finding with its test, and the exports. README and
  SPEC.md point at it.

## 0.4.0 (2026-09-29)

Marking materials. Before a writing spec can pass, every material it draws on (a brain dump, a
transcript, a set of interview notes) is split into segments, and each segment is labeled with
what a draft may use it as: a claim with its source, the author's own claim, a story with its
teller, a quote with its speaker, a stance, an open question, an aside, or something private.
The spine then cites segments rather than whole files, so every claim points at the exact words
behind it. hyperspec splits and checks; an agent or a person labels. It still calls no model.

**Behavior change for 0.3 writing specs:** a writing spec's materials must now be marked. A
material item with no `segments:` field fails test 1, so a writing spec that passed 0.3.0 fails
until each of its materials has a segments file, written with `hyperspec segments init` and
labeled. Specs with no profile are unaffected.

- `hyperspec segments init <material> --id <mid> [--out <file>] [--by paragraph|sentence]`
  writes `<material>.segments.jsonl`: a header naming the material, its path and the SHA-256 of
  its bytes, then one line per segment with character offsets, the verbatim text, and the label
  `unlabeled`. Paragraph mode is the default. It refuses to overwrite a file, and exits 2 with a
  plain message on a missing material, a material with nothing in it, an `--out` folder that
  does not exist, or an unknown `--by`.
- In sentence mode, a new line that opens on a list marker (`-`, `*`, `+`, or a number followed
  by `.` or `)`, then a space) starts a new segment, and a numbered item's own `1.` is not read
  as a sentence ending. A bullet that is entirely a quotation ending in `."` used to run into the
  next bullet; it now stands on its own. Paragraph mode is unchanged.
- Seven labels, a closed set: `claim` (needs `source`, or `own: true`), `story` (needs
  `teller`), `quote` (needs `speaker`), `stance`, `question`, `aside` and `private`. `unlabeled`
  is never accepted. A placeholder word (`TODO`, `n/a`, `tbd`, `...`, `???` and the rest) counts
  as missing in these fields, in the header, and in segment ids, as it does everywhere else in
  the linter.
- What `lint` checks on each segments file, under test 1: the file exists and parses, its header
  names the right material, every label is from the set, ids are unique, and segments never
  overlap and cover every character that is not whitespace (the finding quotes the first
  uncovered text and gives its offset), and the material has some text to mark. Under test 4: every segment's text
  matches the material word for word, each label carries the field it needs, and the material
  has not changed since it was marked (its SHA-256 still matches). A changed material fails as
  stale until it is marked again.
- A spine claim may cite `material#segment`. The segment must exist (test 4), and citing a
  `private` or `question` segment fails test 5. A bare material id still cites the whole
  material; `material#` with nothing after the `#` fails as an unknown segment.
- Every marking finding id starts `writing-materials-` or `writing-spine-`, and every message
  names the material, and the segment where there is one. Paths in messages read as the spec
  wrote them, never resolved to a folder on your machine, so `--json` output is the same
  everywhere. WRITING.md lists every finding with its test.
- A new export, `@supersuit/hyperspec/writing`, gives your own tools `MATERIAL_LABELS` and
  `readSegments`, the same parse-and-check lint runs. `readSegments` returns
  `{ header, segments, findings }` and never throws; `displayPath` and `materialDisplayPath` set
  how the files are named in its messages.
- `hyperspec init --profile writing` names a segments file for its placeholder material, and the
  materials check reads "every segment of every material carries a label from the closed set,
  matches its source verbatim, and the markings are current".
- Both writing examples ship with every material marked. Between them they use all seven labels,
  and every spine claim cites segments.
- WRITING.md gains a Marking materials section: the file format with a worked sample, the labels
  and what each needs, coverage, staleness (including a line-ending conversion, which changes the
  hash), citing segments, every finding with its test, and the import. README and SPEC.md point
  at it.
- The repository's `.gitattributes` keeps example materials and test fixtures LF on every
  checkout, so the hashes their segments files pin still match on a Windows clone.

## 0.3.0 (2026-09-29)

The writing profile. A piece of writing can now carry a hyperspec that names everything an
agent would otherwise fill with the average: what the piece is made from and how far each
source can be trusted, whose voice it is for this form, audience and purpose, who it speaks as,
who reads it, the one change it is for, what kind of thing it is, the claims it argues in order,
where every fact comes from, and in fiction how each character speaks and what they know by
each scene. `hyperspec lint` checks all of it under the same nine tests, and
`hyperspec init --profile writing` lays every block out for you to fill in.

**Behavior change for existing specs:** a placeholder now counts as missing, everywhere, in
specs with no profile too. A placeholder is a whole value, trimmed and in any case, of `todo`,
`tbd`, `fixme`, `xxx`, `placeholder`, `<placeholder>`, `n/a`, a run of dashes, a run of question
marks, or an ellipsis, optionally followed by a trailing `.`, `:` or `!`. A spec that passed
0.2.0 with `source: TODO` or `source: n/a` on a decision now fails that test. Real text that
starts with one of those, such as `TODO: write the opening`, still counts as present, and so
does `none`.

- `profile: writing` opts a spec in; its blocks live under a top-level `writing:` map:
  `materials`, `dna`, `persona`, `audience`, `goal`, `form`, `spine`, `sources`, and
  `characters`, which is required when `fiction: true`. Every block carries a `check`, a
  `source` and an `author`. The core format still applies in full.
- No tenth test. Every writing finding reports under one of the nine, with an id starting
  `writing-`, and the score stays out of nine. `lint` prints one more line,
  `writing: <k>/9 blocks complete`, and `--json` carries it as `profile` on each file.
- A missing block fails test 1 unless a decision with the id `writing-<block>` defers it:
  `open`, which blocks the spec like any open decision, or `delegated` with a `rule`. A
  deferred block does not count as complete.
- Progress is never stored: a `writing.progress` key fails test 7, because saved progress goes
  stale the first time a session dies mid-arc. Progress is read off the folder instead.
- Field rules for every block, each under the test it belongs to: closed sets for `fiction`
  (absent means false), `trust`, `reader`, `change.kind`, the shape of `persona.identity` and
  `unsourced_claim`; unique ids for materials, spine claims and characters; a length envelope
  of whole numbers of at least 1 (test 1); five to ten distinct `goal.conditions` naming real
  requirements, each listed once (test 2); spine claims that name real materials (test 4);
  `persona.facts_from: sources` and a non-empty `will_not_say` (test 5); a `why` on every
  golden, material and golden paths that exist, and golden and rejected lines for every
  character with no line in both (test 6). A repeated id counts once toward a minimum. A
  `stance` outside peer, mentor, witness and guide is a warning.
- A character needs speech rules (what they say and never say), wants, fears, what they hide,
  an arc state, a knowledge timeline, and golden and rejected lines. `relationships` and a
  pointer to a character `entity` file are optional.
- `hyperspec init <file> --profile writing [--title T] [--form F] [--fiction]` writes a
  skeleton with every required block in schema order, every field a placeholder, and open
  decisions for the four blocks that need your judgment first (dna, persona, audience, goal).
  It fails lint until the placeholders are replaced. `init` exits 2 with a plain message on a
  `--profile` with no value or one it does not know, `--fiction` or `--form` without
  `--profile writing`, `--kind` with it, and a folder that does not exist.
- `lint` warns under test 7 on a `profile` it does not know, and checks none of its rules. A
  name every object inherits, such as `constructor`, is an unknown profile like any other.
- WRITING.md documents the profile: the ten components, the schema with every field, the test
  mapping, the closed sets, the seven materials labels and what each may be used as, and
  deferral. It ships in the package.
- `examples/writing/` ships two complete specs, an essay and a two-character short story, with
  every file they name. Both pass with no findings, and a test keeps them that way.
- SPEC.md gains a Profiles section and states the placeholder words in its test-to-field map.
- The illustrative specs and recipe in SPEC.md and `examples/minimal.hyperspec.md` name a
  placeholder author, `example-author`, and a placeholder factory, `my-factory`.
- Requires `@supersuit/superskill` 0.2.2, whose YAML reader reads an inline map (`scope: { form: essay, purpose: persuade }`), a bare inline map as a list item, and an inline list followed by a comment. On 0.2.1 those came back as text, so a correct spec written in that compact style failed. A test lints the essay example rewritten in that style.

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
  child is written with those stages pending, and the command exits 3. A runner that prints
  no `VERDICT` line fails that stage. An added input that no stage reads is refused.
- `hyperspec compare <child-recipe> --doctor <command>` grades the child and its parent with
  one doctor against one spec, exits 1 on a regression naming the change as the suspect, and
  appends the result to the spec's improvement ledger. It refuses an output file that no
  longer matches its recipe, so a hand edit is never scored as the change's doing.
- A recorded hash must be 64 lowercase hex characters. Anything else names no blob, so a
  crafted recipe cannot point a read outside the store.
- `@supersuit/hyperspec/recipe` exports `startRecipe` and `approve`, which a factory calls as
  it runs to record inputs and stages and write the recipe.
- The package now declares `exports`, so `@supersuit/hyperspec/recipe` and
  `@supersuit/hyperspec/package.json` are the only paths you can import. Deep imports of
  `src/` files, which resolved in 0.1.0, no longer do.
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
