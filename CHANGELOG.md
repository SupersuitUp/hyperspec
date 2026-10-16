# Changelog

## 0.15.0 (2026-10-16)

The author judge, and the reader judge reading a whole reader folder.

- **`author` judge** (`src/judges/author.mjs`): applies when `writing.persona.author_file` names an
  `AUTHOR.md` relative to the spec (`persona.author` stays the block's provenance). Its packet holds
  only that file and the draft, so the judge is blind to the rules, the persona fields and every
  other judge. The verdict is `{ recognizable, why, not_them: [{ evidence, why }] }`: fail when a
  reader who loves this author would not recognize them, each passage that is not them a warning.
  The file is an input source: changed after prepare is stale, never altered.
- **`writing.audience.reader_folder`**: a folder relative to the spec holding the reader's
  `READER.md`. The reader packet gains `inputs.reader_folder`, every `.md` in it as `{ path, text }`,
  `READER.md` first, and the instructions tell the judge to play that person. An input source, the
  same way. Which files go in it (the points of view a piece touches, the passages they cite) is the
  caller's choice.
- **Lint** refuses an `author_file` that is missing or not a file, and a `reader_folder` that is
  missing, a file, or has no `READER.md`. Both keys are optional; a spec without them judges exactly
  as in 0.14.

DETECTOR: Gary approved the author and reader folder design on 2026-10-15 as the one voice and
audience standard, and on 2026-10-16 asked whether superwrite should conform to it by default. The
design asks for a blind author judge (AUTHOR.md and the draft only) and a reader judge that plays
READER.md with the reader's points of view and their own words; hyperspec had neither, and since
`judge record` rebuilds every packet from the spec, no host could add them.

REMEDY: both as optional spec keys, so every host gets them by naming two paths.

Tests: `test/judge-author.test.mjs` (7): the blind packet, skip with no author_file, lint, pass,
warn and fail, verdict shape and evidence, stale on a changed or deleted AUTHOR.md.
`test/judge-reader.test.mjs` (+3): the folder in the packet in order, lint, stale on a changed pov.
Each seen red on 0.14.0. `judge.test.mjs`, the WRITING.md samples and the shipped reader packets
updated for the new skip line and instruction.

## 0.14.0 (2026-10-11)

- **`@supersuit/hyperspec/writing` exports the evidence rule and the editor's faults**:
  `evidenceLocator`, `evidenceProblem` and `MIN_EVIDENCE_WORDS` (src/evidence.mjs), and
  `EDITOR_FAULTS` and `FAULT_IDS` (src/judges/editor.mjs). superwrite's human slop review holds a
  person's mark to the same rule a judge's quote is held to (three words or more, verbatim, whole
  words) and the same eleven faults, and appends each mark to `writing.editor.examples`, so it needs
  both without copying either.

DETECTOR: the mandatory human review in superwrite needed to refuse a mark whose passage is not in
the draft, and the only implementation of that rule lived behind hyperspec's internal paths.

REMEDY: export it, with the fault set, from the package's public writing entry point.

Tests: `test/writing-exports.test.mjs` asserts the export list, that each export is the module's own
function or constant, and the rule as an outside tool uses it (found, too short, not found).

## 0.13.0 (2026-10-11)

An eighth judge, the editor, and a tells station that runs before it. Every judge so far asked
whether a draft is understood, in voice, persuasive or sourced; none asked whether a sentence is
well written, so a draft could pass all seven and still read like a machine wrote it, which is
what a book's fourth draft did.

- **The `editor` judge** (`src/judges/editor.mjs`, after `panel` in run order). It reads the draft
  as a senior editor at a top book publisher and business magazine would and marks every passage
  such an editor would mark. The verdict is `{ findings: [{ evidence, fault, why }], would_publish
  }`: evidence verbatim from the draft (the evidence rule every judge shares), the fault one of a
  closed set of eleven (`cliche`, `unnecessary-exposition`, `purple-prose`,
  `sentence-structure`, `lack-of-specificity`, `awkward-word-choice`, `tense-inconsistency`,
  `wrong-register`, `overclaim`, `machine-cadence`, `order`), and why. It flags and never rewrites:
  the verdict has no field for replacement text and the instructions forbid it. It passes when
  `would_publish` is true. Every finding is a warning (`judge-editor-mark`) and goes to the triage
  file with the fault as its kind, so `hyperspec triage` must answer it and `check` holds the
  answer; `judge-editor-would-not-publish` fails the station; a fault outside the eleven
  (`judge-editor-fault-unknown`) or a refusal to publish with nothing marked
  (`judge-editor-unmarked`) is an invalid verdict. It applies to every writing spec with a draft,
  unless `writing.editor.off: true`.
- **`writing.editor.examples`**: a JSONL file of human line edits, one `{ passage, fault, why,
  edited? }` per line, relative to the spec. Every usable line goes in the packet as calibration
  for what this house marks. The file is named in the station's `inputSources`, so a packet
  prepared before it changed is stale, and one prepared before it was deleted is stale too.
  `writing.editor.check.rubric` replaces the default rubric.
- **`judge_model`**, a new packet field carried only by a station that sets one: the editor's says
  to judge it on a different model family from the drafter's, since AI judges favor AI writing,
  their own most of all. hyperspec calls no model and cannot enforce it; it is written where the
  caller reads.
- **The `tells` station** (`src/stations/tells.mjs`, after `dna` in `check`'s order). A word list,
  no model: AI vocabulary (delve, tapestry, "a testament to", seamless, unlock, foster, pivotal,
  "in today's fast-paced world" and more), contrast pairs ("not X, but Y", "not only X but also
  Y", "isn't just X, it's Y", "it's not about X, it's about Y"), overclaiming words (miracle,
  magical, revolutionary, unprecedented, alien-level and more), and lists of three, flagged only
  when a draft has at least two and more than 3 per 1,000 words (about one a printed page; machine
  prose tends to put one in most paragraphs). Every hit is a warning with its line and the matched
  text. `writing.tells` sets `allow` (words or phrases never flagged), `fail_on` (categories that
  fail instead), `lists_of_three_per_1000` and `off`. Every list is one exported constant, `TELLS`.
- **Lint holds both keys**: `writing-editor`, `-off`, `-rubric`, `-examples` (test 1),
  `-examples-missing`, `-not-file` and `-examples-line` (test 6); `writing-tells`, `-off`,
  `-allow`, `-fail-on`, `-lists-of-three` (test 1).
- The essay example names three human line edits in `essay/editor-examples.jsonl`; both examples
  ship an editor packet and a sample verdict (the essay fails, three marks; the story passes).
  `ready` now requires the editor wherever it applies.

DETECTOR: Wilson's read of a book draft that passed every station and every judge and still read
flat; the four lines he marked were an aphorism, a list in no order a CEO would use, an accusation
of the reader, and an overclaim, and no judge had a field for any of them.

REMEDY: a judge whose only question is the editor's, with a closed fault set drawn from what
professional writers find in AI prose, plus a deterministic station for the tells a list can find,
so a model's attention is spent on judgment.

Tests: `test/judge-editor.test.mjs` (packet shape and default rubric, the rubric override, the
off switch, pass, fail with marks to triage, an unknown fault and non-verbatim evidence refused,
every shape rule, examples feeding the packet, a changed or deleted examples file stale, lint) and
`test/station-tells.test.mjs` (each category at its line, code ignored, the density threshold and
its override, allow, fail_on, off, the check output, lint). Each was mutation-checked: removing
the fault check, the fail_on switch, the density gate or the examples file's `inputSources` fails
a test.

## 0.12.1 (2026-10-09)

Three fixes a drafting loop found in its first acceptance run, where triage piled up to 143
findings over five rounds, a failing check read `ok: true`, and the piped `--json` of that check
arrived cut off.

- **An unanswered triage finding about a draft that is gone retires.** A finding raised against an
  earlier draft whose quoted passage is no longer in the current draft is now a warning,
  `station-triage-retired`, rather than `station-triage-untriaged`. A finding whose passage is
  still in the draft, one raised against the current draft, and one that quotes no passage still
  fail until answered; answered findings are held exactly as before. The station's result carries
  `retired`, the count; `check` prints it beside the station's status
  (`triage: pass (2 retired: ...)`), and `triage status` ends its first line `, <n> retired` and
  counts them in `counts.retired`, apart from `counts.unanswered`.
- **`check --json` carries `passed`, true exactly when the exit code is 0**, on a graded result, a
  lint-blocked one and a usage error alike. `ok` keeps its meaning, the draft was graded, so a
  check that ran and failed reads `ok: true, passed: false`. README and WRITING.md say which is
  which.
- **Output through a pipe is no longer cut at 64 KB.** Every command printed and then exited at
  once, and Node writes a pipe asynchronously on macOS and some other platforms (Linux writes pipes
  synchronously already), so a caller that spawned the bin with piped stdout
  and parsed its `--json` got invalid JSON once the output passed 64 KB (a real book's check
  does). The bin now makes stdout and stderr blocking before any command runs, so every command's
  output arrives whole.

## 0.12.0 (2026-10-09)

Two things a drafting loop needs from the engine, so the loop never re-implements them.

- **`hyperspec check --in-progress`**: a sequential work still being written. What only the finished
  work can clear (`station-sequence-front-matter-missing`, a `station-form-required-part-*` for a
  part not started, `station-form-length` under its minimum, `station-claims-stale` for a ledger
  line whose unit is not written yet) is a warning marked `later: true`. Front matter out of order,
  a work over its maximum and every other finding still fail. The ledger line is partial
  (`partial: true`, `in_progress: true`), so `ready` never counts it.
- **`loadSpec` is exported from `@supersuit/hyperspec/writing`**: one spec read the way every command
  reads it, merged with its form when it names one.

## 0.11.0 (2026-10-09)

Form specs: the decisions every work of a kind shares, written once and checked in every work. The
second book of a library was specified by hand-copying the first book's spec, and the second copy is
the moment to abstract.

- **A form is a hyperspec of `kind: form`, and a work builds on it with one top-level key,
  `form: <path>`**, relative to the work's spec. `loadSpec` merges the two, so `lint`, `check`,
  `judge`, `ready` and `learn` all read the merged spec and no station needs to know forms exist.
  The merge, whole: `decisions`, `requirements`, `rejects`, `examples`,
  `writing.persona.may_assert`, `writing.persona.will_not_say`, `writing.form.sequence.sections`,
  `writing.form.sequence.knows`, `writing.form.sequence.front_matter` and `writing.form.stations`
  accumulate, the form's entries first, an exact duplicate collapsing and an entry that reuses one of
  the form's ids refused; maps merge key by key; any other value is the form's, and the work fills
  only what the form leaves unset. `hyperspec`, `title`, `kind`, `resume`, `feedback` and
  `improvement` belong to each file and are never inherited. A path the form writes resolves against
  the form's folder. One level only. `src/form-spec.mjs` is the merge.
- **Seven lint findings, all under test 1**: `form-missing` (blank, or no file), `form-unreadable`
  (not a hyperspec), `form-not-a-form` (not `kind: form`), `form-nested` (a form that names a form),
  `form-fails` (the form fails its own lint, naming every failing id), `form-contradiction` (the work
  sets a value the form sets, to a different value, naming the field and both values) and
  `form-id-collision` (a work entry reuses an id the form uses).
- **A form lints like any spec, with two differences.** `materials`, `audience`, `goal` and `spine`,
  which only a work can fill, are not required of it, and a block it writes may leave fields to the
  work: a finding that a field's absence would produce is not one in a form. A value the form writes
  is held to its rule, and every block it writes still carries its own `check`, `source` and
  `author`.
- **The form's provenance is in every run.** `lint --json` names the form on the spec's report, and
  every line `check` and `judge record` append carries `form: { path, sha256 }`, so a run says which
  version of the form it was held to. A changed form is named in the next verdict (`form changed;
  every station still passes`), and `ready` counts only lines graded under the form as it is now.
- **`writing.form.sequence.front_matter`**: the headings a work opens with before its first unit, in
  order (a book on one page, then the book in five pages). The sequence station fails
  `station-sequence-front-matter-missing` for a heading the draft does not have, and
  `station-sequence-front-matter-order` for one out of order or after the first unit. Only a heading
  counts, in any case and at any level. Front matter is not a unit, so the order guard and the
  pointer warning never read it; whether a summary page explains a later term in the sentence that
  uses it stays a judgment for the doctor. Lint fails `writing-form-sequence-front-matter` for a
  `front_matter` that is not a list of real headings.
- **`hyperspec init <file> --form <form spec.md>`** writes the skeleton of a work on a form: it names
  the form, relative to the new file, and shows only what the form leaves for the work. A `--form`
  value that does not end in `.md` still sets the writing skeleton's kind.
- **A worked example**: `examples/writing/forms/course.form.hyperspec.md`, a form for short courses,
  and `examples/writing/knots.hyperspec.md`, a two-lesson course built on it, with its material
  marked and its one file passing every station. WRITING.md gains "Forms: decisions every work of a
  kind shares".

**Behavior change:** none for a spec with no `form:` key and no `front_matter`. A spec of
`kind: form` is now linted as a form.

## 0.10.0 (2026-10-02)

What a drafting loop and a per-audience renderer need to run on the engine without hand work
(build 7 wiring, from the letter's BUILD-NOTES).

- **A draft's frontmatter and HTML comments are not prose.** `check`, `judge` and `learn` read every
  draft through `readDraft`, which now blanks a leading YAML frontmatter block and every
  `<!-- ... -->` comment line for line (their characters go, their line breaks stay, so line
  numbers are the file's own). A kept document (a title, a status, a note to self about what it
  was meant to be) grades exactly as its prose does. Sequence drafts already blanked frontmatter;
  they now blank comments too. `hideUnseen` in `src/draft.mjs` is the rule.
- **`hyperspec segments label <segments-file> <ids>=<label>[:key=value]...`** labels segments in
  place: `s1,s4=aside`, `s3=quote:speaker=gary-sheng`, `s2=claim:own=true` (`own=true` is written as
  the boolean). Offsets and text never change. An unknown id, a label outside the closed set or a
  malformed assignment exits 2 with nothing written. It prints what is still unlabeled.
  `labelSegments` and `parseLabelAssignment` in `src/segments.mjs`.
- **`hyperspec ready <spec> [--draft <file>] [--judges a,b] [--json]`** answers whether this draft
  has been through the engine under this spec, from the runs ledger alone: the latest full check
  of these exact draft and spec bytes passed; every required judge (the list given, or every judge
  that applies) passed on the same bytes, each panel reader including the buyer; and that check
  came after the last of those judge lines, so the panel's findings were triaged and held. Exit 0
  ready, 1 not ready with each missing step listed, 2 usage.
- **`specText(data, body)` and `parseSpecText(text)`**, exported from `@supersuit/hyperspec/writing`, writes a spec's text
  from data and reads it back with the linter's own reader, throwing (and naming the field) when
  any value would not come back unchanged. For tools that build specs rather than people typing
  them.

**Behavior change:** a draft whose frontmatter or comments held words now counts fewer words, and a
term that first appeared in a comment now first appears in the prose. No finding id changed.

## 0.9.1 (2026-09-30)

Two fixes, each found by the first book written as a sequence.

- The sequence station no longer reads a word inside a longer defined term as a use of the shorter
  one. A book that defines "Thinking level" in Lesson 2 and "Level" in Lesson 22 failed
  `station-sequence-used-before-defined` and `station-sequence-quiz-used-before-defined` at every
  "thinking level" before Lesson 22. Before it looks for a term, the station now blanks every other
  defined term that contains it as a whole-word phrase, a trailing plural "s" included, in the order
  guard, the quiz order guard and quiz coverage. The shorter term on its own still counts, and the
  longer term no longer tests the shorter one in a quiz. `longerTerms` and `maskLonger` are exported
  from the station.
- `hyperspec segments init <material> --id <mid> --keep <old>` re-marks an edited material without
  relabeling what did not change (issue #2). Every segment whose text, trimmed, a segment in `<old>`
  has keeps that segment's id, label and every other key (`own`, `source`, `teller`, `speaker`, and
  anything added by hand), with new offsets; the rest start `unlabeled` with the next unused
  `s<n>` id, and the command lists them. The id is carried so the spine's citations keep pointing
  at the same words. `--keep` may name the file being written, so a material is re-marked in place;
  otherwise an existing file is still never overwritten. It exits 2 for a `--keep` file that cannot
  be read, has a line that is not a JSON object, or marks another material. `carrySegments` in
  `src/segments.mjs` is the logic.

**Behavior change:** a sequential work that defines a term inside a longer one may now pass where
0.9.0 failed it, and a quiz whose only question on a shorter term used it inside the longer term now
fails `station-sequence-quiz-untested` for that term. No finding id changed.

## 0.9.0 (2026-09-29)

The pressure test a draft gets before it ships is now part of the run, and so is answering it.
Several readers reading a draft through their own lenses, and someone deciding what to do about
each thing they said, was done by hand twice, once for a letter and once for a book outline, and
both times the review read a stale, truncated copy and none of its readers was the person the
piece was for. The `panel` judge fixes both by construction, and `hyperspec triage` holds every
finding, the panel's or an outside review's, to an answer that `check` keeps true against the draft.

- The `panel` judgment station, the seventh, run last. One packet per reader,
  `panel-<reader>.packet.json`: the readers the new optional `writing.panel` lists (`id`, `who`,
  `knows`, `lens`), or by default a `skeptic`, a `novice` and an `expert`, and always the audience's
  own reader, added last as `buyer`. It applies when the reader station does (a written audience
  with a rubric). The verdict is `{ good, improve, missing, remove }`, every item `{ evidence, note }`
  under the evidence rule, so a review of any copy but the current draft is refused. The panel
  never fails a draft: improve, missing and remove items are warnings (`judge-panel-improve`,
  `-missing`, `-remove`) and go to the triage file. A panel ledger line carries `reader`, and each
  reader's history is its own. Lint refuses a panel that is not a list of readers, a reader with no
  id, who or lens, an id that is not a slug, used twice or `buyer`, and a hollow `knows`
  (`writing-panel`, `-reader`, `-id`, `-id-duplicate`, `-buyer`, `-who`, `-lens`, `-knows`, test 1).
- `triage.jsonl`, beside the runs ledger: one finding per line, `{ finding_id, source, reader, kind,
  text, evidence, draft_sha256, disposition, answer }`, each once (the id hashes what it says).
- The `triage` station, run last in `check`: fails on an unanswered finding
  (`station-triage-untriaged`), a `taken` or `already-true` answer whose evidence is missing or not
  in the draft (`-evidence-missing`, `-evidence-not-found`), a `kept` answer with no reason
  (`-reason-missing`), a disposition outside the four (`-disposition`) or a line that is not a
  finding (`-unreadable`); warns on an `open` finding (`-open`) and on a kept or open answer about a
  passage that has left the draft (`-stale`). With no triage file it skips.
- `hyperspec triage status` (the counts, the station's rules, and the synthesis: every passage two
  or more readers raised findings about), `triage answer` (refuses with `triage-evidence-missing`,
  `-too-short`, `-not-found` or `triage-reason-missing`, writing nothing), `triage import` (an
  outside review in markdown or plain text as findings: headings name readers, Good, Improve,
  Missing and Remove labels set the kind, praise is counted and not triaged, and a quote the draft
  does not hold warns, `triage-import-quote-not-found`; `triage-import-empty` when there is nothing
  to answer) and `triage reply` (a plain-text reply to the reviewer; it never sends, and exits 1
  while a finding is unanswered).
- The quotes station reads the new optional `writing.quotes.examples`: `true` reads a quoted span
  whose sentence names no known speaker as an example phrasing, not a quotation; a list exempts
  exactly those phrasings. A quotation that names its speaker is checked either way. Lint refuses
  any other value (`writing-quotes`, `writing-quotes-examples`, test 1).
- The sequence station gains the quiz rules, on when the new `writing.form.sequence.quiz` names the
  quiz heading: every defined term tested by some question (a simple plural counts), no question
  using a term defined after the unit it is tagged with, every question tagged, every answer one of
  its options (`station-sequence-quiz-missing`, `-untagged`, `-answer`, `-used-before-defined`,
  `-untested`). Promoted from the checker the first book written this way used, with its question
  shape. A hollow `quiz` fails lint (`writing-form-sequence-quiz`, test 1).
- The evidence rule moved to `src/evidence.mjs`, shared by `judge record` and `triage`; `judge.mjs`
  re-exports what it exported.
- The worked examples: the essay and the story ship four panel packets each, with a hand-filled
  sample verdict per reader; the course carries a quiz at the end of each part and `quiz: Check
  yourself`.

**Behavior change:** `check` runs nine stations, so `--json` and the ledger's `stations` carry
`triage` (as `skip` for every spec without a triage file). `judge prepare` writes the four panel
packets for every spec whose audience has a rubric, where 0.8 wrote none; `--only` still limits it.
No other finding id changed.

## 0.8.0 (2026-09-29)

A work read in order can now be checked as one. Every station so far held ONE piece to its spec; a
course, a primer or a textbook makes promises ACROSS its pieces (Lesson 5 is written for someone who
has read Lessons 1 to 4 and nothing else), and nothing checked them. Declare `writing.form.sequence`
and the new `sequence` station does, deterministically, on every `check`. Promoted from a checker
written for one book, so every sequential work gets it by construction.

- `writing.form.sequence`, optional, every key optional: `unit` (the heading word, default
  `Lesson`), `files` (the work's files in reading order; a `*` in a file name matches, sorted by
  number), `sections` (default "After this lesson you can", "New terms", "Try this"),
  `terms_section` (default "New terms"), `outline` (numbered items promising `*Terms: a, b.*`),
  `knows` (words a lesson may use before one defines them, beside `audience.knows`) and `teaser`
  (default "Next,": a closing line naming what is coming). Lint refuses a key that is present and
  hollow under test 1, and a `files` entry matching nothing or an `outline` that is not a file under
  test 6.
- The `sequence` station, run last: every unit carries its sections; every term is defined in
  exactly one unit; no unit uses a term before the unit that defines it (code, the unit's own terms
  section and its closing teaser are not uses, and a `(from Lesson N)` reminder defines nothing);
  each unit defines what the outline promises, for the units the draft holds; unit numbers increase;
  a pointer to a later unit is a warning. Findings: `station-sequence-no-units`, `-numbering`,
  `-missing-section`, `-defined-twice`, `-used-before-defined`, `-outline-unreadable`,
  `-outline-unkept` (fail) and `-forward-pointer` (warn). A spec with no `sequence` skips it.
- `hyperspec check <spec>` needs no `--draft` when the spec lists `sequence.files`: the files,
  joined in order with each one's frontmatter blanked, are the draft, and every station reads them.
  A finding names the file and its own line (`(course/part-1.md line 25)`; `file` and `line` in
  `--json`), a relative link resolves beside the file that holds it, and the ledger keys the run by
  the `files` entry as written, so the work keeps one history as parts are added. `--draft` still
  names one file, which may hold every lesson.
- A third worked example, `examples/writing/course.hyperspec.md`: four lessons in two part files
  with an outline, passing every station with two forward-pointer warnings.

**Behavior change:** `check` runs eight stations, so `--json` and the ledger's `stations` carry
`sequence` (as `skip` for every spec without a sequence). No other station, finding id or schema
field changed, and a 0.7 ledger's verdicts read as they did.

## 0.7.0 (2026-09-29)

A spec can now have its judgments made and recorded. `check` covers what a function of the spec
and the draft can decide; the rest of a spec's checks are rubrics, and until this release nothing
ran them. hyperspec still calls no model. `hyperspec judge prepare` writes one packet per judgment
station, holding the rubric, fixed instructions, the inputs and the exact shape of the answer, for
an outside judge to fill: your agent, any model, or a person. `hyperspec judge record` checks the
verdict, derives the station's status from it by a fixed rule, and records it in the runs ledger.
Every passage a judge quotes must be in the draft, and the two blind tests are scored
against answer keys the judge never sees. `hyperspec learn` works from the other end: given the
first draft a factory wrote and the draft a person approved, it lists the edits, has a judge name
the spec block that should have prevented each one, and names one next move.

**No behavior change for lint or check.** Every 0.6.0 test passes unchanged, no finding id changed,
and no schema field was added. The runs ledger gains two kinds of line, `judge` and `learn`; check
reads only its own, so a 0.6 ledger's check verdicts are exactly what they were, and the new lines
keep lint's test 9 passing.

- `hyperspec judge prepare <spec> --draft <file> --out <dir> [--only a,b] [--force] [--json]`
  lints the spec first, as `check` does, then writes `<station>.packet.json` for each station that
  applies, in the order `doctor, lineup, reader, persona, attribution, knowledge`, and prints a
  skip line with the reason for each that does not. Packets keep the paths as given and are
  byte-identical for the same files. It refuses to overwrite any file without `--force`, naming
  each. Exit 0 written, 1 a station crashed, 2 usage, or lint's own 1 or 3.
- The two blind tests write an answer key beside their packets, `lineup.key.json` and
  `attribution.key.json`, for a person to read. Hand a judge only the `*.packet.json` files, and
  each of the two blind packets to its own fresh context, with no access to the draft and apart
  from the other packets, which carry it: their
  instructions say to decide from the packet's inputs alone and open no file it names, but a judge
  that can open the draft can always cheat. `record` never reads a key: it builds it again.
- `hyperspec judge record <packet> --verdict <file> [--json]` hashes the spec and the draft again
  and rebuilds the packet from them and from the files the station reads (the DNA goldens, the
  claims ledger). A file that changed makes the packet stale (`judge-stale`), and a packet that is
  not those exact bytes is refused (`judge-packet-altered`); either way nothing is recorded. A
  stale packet has `learn record`'s shape, `{ "invalid": true, "stale": true }` with `--json` and
  "stale packet, nothing recorded" on the terminal. It must run in the folder `prepare` ran in. Then the verdict is validated, every problem named. Exit
  0 the station passed, 1 it failed or the verdict was refused, 2 usage.
- The evidence rule: every span a verdict cites is at least three words and appears in the draft,
  on whole words, after whitespace runs become one space and curly, low and angle quotation marks
  and apostrophes become straight ones (primes do not).
- Six stations. `doctor`: every goal condition, and whether the reader would take
  `goal.next_if_worked` now. `lineup`: the draft's paragraph nearest the goldens' median length
  beside up to three goldens' paragraphs, each reflowed to one line and shuffled with a seed
  derived from the draft's full text, which the packet does not carry, so the packet cannot reveal
  the order (a draft that is one paragraph and nothing else skips, since its hash would name its
  candidate); it passes when the judge picks a golden, which a random pick does three times in four.
  `reader`: where the audience's reader got lost (warnings) or stopped, and whether they would
  take their own next step. `persona`: every break of stance, assertion, `will_not_say` or an
  unsourced fact, against the claims ledger's texts (`null` with no ledger, and then no
  unsourced fact may be reported). `attribution`, fiction only: the speaker of each dialogue line
  whose speech tag names one, scored per speaker and averaged, passing at 80 percent; a line whose
  speaker is in doubt (a split quote joins only across exactly one speech tag, and the part after
  any longer narration is left out), or that repeats a golden or rejected line, is left out and
  counted, so the key is never wrong (the worked story tests 19 of its 36 lines). `knowledge`, fiction only: every
  place a character knows something before their timeline gives it to them.
- Judge ledger lines carry `packet_sha256`, the hash of what the judge was shown, and
  `inputs_sha256`, the hash of its inputs, and follow check's rules against the last judge line
  for the same station and draft, saying `judgment` where check says `check` ("no change since the
  last passing judgment"), with three more: what changed is judged by the packet, naming the
  draft, the spec, the file the station reads besides them when the inputs changed (the DNA scope,
  the claims ledger), or the packet's fixed text when only that changed, so adding the golden or
  the claims a failing station asked for and passing is improved; one-shot needs draft bytes never judged by that
  station under any name; and improved needs the packet to have changed, since a judge answering
  differently about the same packet is not the work improving ("the verdict changed; nothing the
  judge was shown changed").
- `hyperspec learn prepare <spec> --first <draft> --approved <draft> --out <dir> [--force]`
  splits both drafts into sentence units (a paragraph's opening heading, each list item and each
  sentence, with common abbreviations and lower-case continuations joined), diffs them, and
  writes `learn.packet.json` with every edit as a hunk (`deleted`, `inserted` or `replaced`, with
  both texts and a sentence count). A hunk never crosses a paragraph or a heading, and reflowed
  text is no edit. Past 10,000,000 comparisons after the common start and end are set aside, it is
  a usage error.
- `hyperspec learn record <packet> --verdict <file>` checks that every hunk is classified once by a
  block the spec has written, or `none`, counts edits and sentences per block, and names one move
  for the block with the most sentences, from a fixed table (`dna`: add a golden or a style rule).
  It appends a `learn` line to the runs ledger, always `not-improved` since the spec has not
  changed yet, and never edits the spec.
- The worked examples ship their packets (`essay/judge/`, `story/judge/`), with no key, and one
  sample verdict per packet (`*/sample-verdicts/`), filled in by hand and marked `sample`. Two
  of them fail, honestly: the essay's lineup (the draft's passage is the only one resting on a
  figure) and the story's persona (three process details no claim holds). The essay's goal now
  names the card its draft ends on as the reader's next step (`goal.next_if_worked`, matching the
  spec's `agenda-card` decision), so its doctor sample passes. The essay adds a learn pair in `essay/learn/` and a sample verdict whose
  tally sends the next move to `dna`. A test holds every packet to what `prepare` writes and records
  every sample.
- WRITING.md gains "Judging a draft" and "Learning from edits": the commands and exit codes, the
  packet, the evidence rule, what `record` refuses, each station's rules and findings table (held
  by a test to the ids the code raises and their kind), the ledger rules, the samples and what they
  found, sentence units, the diff, the tally and its move table. The quotes station's section
  now points at `attribution` for fiction's dialogue.

## 0.6.0 (2026-09-29)

A spec can now check a draft. Until this release hyperspec could tell you whether a writing spec
was ready; it could not tell you whether the piece written from it met the spec. `hyperspec
check` runs seven deterministic stations against a draft: the length and required parts, the
terms the reader needs defined, the claims ledger, quotations, private material, the writer's
measured style, and links. None of them calls a model or touches the network, so the same draft
and spec always give the same answer. Each run leaves one line in the spec's runs ledger saying
whether the draft passed first time, improved, or did not, and why.

**No behavior change for lint.** Every spec without `writing.audience.terms` passes and fails
exactly as it did in 0.5.0, and no lint finding id changed. That field is the one schema
addition, and it is optional.

- `hyperspec check <spec> --draft <file> [--json] [--only a,b]` needs a writing spec
  (`profile: writing`) and lints it first: a spec that fails lint, or is blocked on an open
  decision, runs no station and exits with lint's code. Then it runs every station in a fixed
  order, `form, terms, claims, quotes, private, dna, links`, and prints each one's `pass`, `fail`
  with findings, or `skip` with the reason. Warnings print under their station and never fail it.
  Exit 0 when every station that ran passed, 1 when one failed, 2 on usage (no spec, no
  `--draft`, an unreadable draft, a spec without the writing profile, an `--only` that names no
  known station); under `--json` a usage error is one document, `{ spec, draft, error }`.
  `--only` runs a subset, still in the fixed order. A finding names the draft line it points at
  where there is one, quotes at most 80 characters of the draft, and never prints an absolute
  path. A byte order mark at the start of the draft is ignored. A station that throws becomes one
  failing finding, `station-<name>-crashed`, and the rest still run.
- `form`: word count against `writing.form.length` (only `unit: words` is measured; another unit
  skips the station), and every `required_parts` entry present as an ATX heading of that text
  (indented up to three spaces, closing `#`s allowed), or as a line starting `part:`, outside
  code blocks.
- `terms`: every term in the new optional `writing.audience.terms`, other than those in `knows`,
  is defined at its first appearance: in that sentence or the next, the term followed within six
  words by `is`, `means`, `refers to` or a colon, or by a parenthesis. A mechanical proxy for a
  definition, and documented as one. No `terms` list: skip.
- `claims`: every claim in the JSONL ledger at `writing.sources.ledger` (`text`, `source`,
  optional `span`) still appears in the draft word for word, and has a real source; unsourced
  claims warn instead under `unsourced_claim: warn`, and point at the draft line where the claim
  appears. A missing ledger fails. The ledger is the list of claims: the station does not decide
  what counts as one.
- `quotes`: every double-quoted span of four words or more appears word for word in a `quote` or
  `story` segment of a marked material, never a private one; when the sentence names a quote
  segment's speaker, by the full name or by its first word (when that word has two or more
  letters and is not a common function word such as "the"), the span must come from that
  speaker. A spec with `fiction: true` skips the station, since a character's dialogue is
  invented rather than quoted.
- `private`: no run of eight words from a `private` segment appears in the draft. Segments of four
  to seven words are checked whole; shorter ones are counted in one warning and never quoted.
- `dna`: with a current `writing.dna.scope_dir`, the draft is measured the way goldens are and
  each feature compared with the scope's, from v ÷ 1.5 to the larger of v × 1.5 and v + 5; drift,
  and an em dash where the scope has none (pointing at the first one), are warnings. No scope
  folder: skip.
- `links`: inline, reference and bare links are well-formed http, https or mailto (a bare
  `https://` with no host fails); relative links resolve to a file beside the draft; a `/` link
  warns, since there is no site root to resolve it against; a full or collapsed reference needs
  its definition. A bare `[label]` is a link only when its label is defined, so `[sic]`, `[x]` and
  `[1]` are text. No network access.
- The runs ledger: each check appends `{ at, kind: "check", draft, draft_sha256, spec_sha256,
  stations, verdict }` to `improvement.ledger`, with `draft` relative to the spec's folder. A run
  with `--only` adds `partial: true`, is `not-improved` with the reason `partial run: <stations>`,
  and is ignored by later verdicts. A full run is compared with the last full line for the same
  draft: `one-shot` when there is none and every station passes; `improved` when that line failed
  and every station passes now, with `change` naming exactly the stations that failed then and
  pass now; otherwise `not-improved`, with a `reason` that says which case it is, such as "no
  change since the last passing check" or "spec changed; failing stations: terms". The lines keep
  lint's test 9 passing.
- New optional field `writing.audience.terms`: a list of real strings when present (test 1,
  `writing-audience-terms`, naming a scalar that is not a list, an empty list, and each entry that
  is not a string, is empty or is a placeholder). Absent, nothing changes.
- The worked examples each ship a draft that passes every station, with its claims ledger:
  `examples/writing/essay/draft.md` and `examples/writing/story/draft.md`. Both specs now list
  `audience.terms`, and their `required_parts` are the drafts' headings. The essay's interview
  quotes now name their speaker `dana, an engineering manager`, and the essay links the survey
  summary it cites. A test runs `check` on both. WRITING.md gains "Checking a draft": each station, what it cannot check, a findings table
  per station held by a test to the ids the stations raise, and the ledger line.

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
