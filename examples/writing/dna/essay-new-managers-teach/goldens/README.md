# Goldens

Each file in this folder except this one is a golden: a passage the writer marked as right,
filed under this scope.

Frontmatter:
- why (required): what makes it golden, the move it teaches.
- approved_by (required): a person slug. Golden means a human approved it; agent:* is refused.
- source (required): where the passage came from.
- approved_on (optional): a date.

The body is the passage, verbatim.

Run `hyperspec dna measure <scope-dir>` once every golden here has why, approved_by and source.
