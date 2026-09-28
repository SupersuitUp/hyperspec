# Changelog

## 0.1.0 (2026-09-28)

- The hyperspecification standard: a markdown file with a YAML frontmatter block, versioned
  in git, living beside the work it specifies.
- Nine tests: decisions, failable requirements, checked requirements, provenance, rejects,
  examples, resumability, a place to push back, and an improvement ledger.
- `hyperspec lint <file...> [--json]`, exiting 0 pass, 1 a test fails, 3 blocked on an open
  decision, 2 usage or IO error.
- `hyperspec init <file> [--title T] [--kind K]`, writing a new hyperspec skeleton and
  refusing to overwrite an existing file.
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
