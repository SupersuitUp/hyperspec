# hyperspec

A hyperspec is a spec written for an agent: every decision is recorded with who made it and
where it came from, every requirement can fail in a named way, and every field is traced back
to its source. This package is the standard and its linter.

## 30 seconds

```bash
npx @supersuit/hyperspec lint spec.md
```

```
spec.md  9 of 9 pass
```

Nine tests run against the frontmatter: decisions, failable requirements, checked
requirements, provenance, rejects, examples, resumability, a place to push back, and an
improvement ledger. Every test is defined in [SPEC.md](SPEC.md).

## Commands

| Command | What it does |
|---|---|
| `hyperspec lint <file...> [--json]` | Score each hyperspec against the nine tests. |
| `hyperspec init <file> [--title T] [--kind K]` | Write a new hyperspec skeleton. Refuses to overwrite an existing file. |

## Exit codes

`hyperspec lint` exits 0 when every test passes and nothing is open, 1 when at least one
test fails, 2 on a usage or IO error, and 3 when every test passes but a decision is still
open (blocked).

## The format

A hyperspec is a markdown file with a YAML frontmatter block: `decisions`, `requirements`,
`rejects`, `examples`, `resume`, `feedback`, and `improvement`. The full field-by-field
standard, including what makes each of the nine tests fail, is in [SPEC.md](SPEC.md).

## Install

```bash
npm install @supersuit/hyperspec
```

Node 20 or later. One dependency, `@supersuit/superskill`, for the YAML reader.
