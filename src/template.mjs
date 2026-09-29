// A scalar left unquoted only when every YAML reader reads it back as the same text: it starts
// with a letter or digit, holds only letters, digits, spaces and plain punctuation, and is not a
// word YAML turns into null, a boolean or a number. Anything else is written as a JSON string,
// which is also a valid YAML double-quoted scalar.
const PLAIN = /^[A-Za-z0-9][A-Za-z0-9 _.,'()/-]*$/;
const RESOLVES = /^(null|~|true|false|yes|no|on|off|y|n|[-+]?(\d[\d_]*)?\.?\d+([eE][-+]?\d+)?|0x[0-9a-f]+|0o[0-7]+|\.inf|\.nan)$/i;
// Exported so any other init-time template (writing-template.mjs's writingTemplate, and whatever
// profile templates come after it) quotes titles, kinds and other free-text scalars the same way,
// rather than re-deriving this regex pair.
export const scalar = (v) => (PLAIN.test(v) && !/\s$/.test(v) && !RESOLVES.test(v) ? v : JSON.stringify(v));

export function template({ title = "Untitled", kind = "document" } = {}) {
  const heading = String(title).replace(/\s+/g, " ").trim();
  return `---
hyperspec: "0.1"
title: ${scalar(String(title))}
kind: ${scalar(String(kind))}
decisions:
  - id: audience
    state: open
    question: who reads this, and where are they on their path before they read it?
    source: hyperspec init
    author: agent:hyperspec-init
    chosen_by: agent
requirements: []
rejects: []
examples: []
resume:
  next_action: answer the open decisions, then list the requirements with fails_when and a check for each
feedback:
  issues: ""
  fork: ""
improvement:
  ledger: runs.jsonl
---

# ${heading}
`;
}
