export function template({ title = "Untitled", kind = "document" } = {}) {
  return `---
hyperspec: "0.1"
title: ${title}
kind: ${kind}
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

# ${title}
`;
}
