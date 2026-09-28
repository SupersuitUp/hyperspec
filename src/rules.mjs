import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const TESTS = Object.freeze([
  { n: 1, name: "every decision is accounted for" },
  { n: 2, name: "every requirement can fail" },
  { n: 3, name: "every requirement names its check" },
  { n: 4, name: "every field says where it came from and who wrote it" },
  { n: 5, name: "negative space is specified" },
  { n: 6, name: "examples outrank adjectives" },
  { n: 7, name: "a stranger can resume it" },
  { n: 8, name: "its adopters can push back on it" },
  { n: 9, name: "it improves itself" },
].map(Object.freeze));

const VAGUE = /\b(engaging|compelling|high[- ]quality|good|great|clear|clean|professional|polished|nice|strong|effective|appropriate|better|amazing|excellent|best|world[- ]class|seamless|intuitive|robust)\b/i;
// A no-action word fails only when it is the WHOLE next action: "continue drafting section two" names one.
const NO_ACTION = /^(continue|follow[- ]?up|tbd|todo|keep going|pick (this|it) (back )?up|n\/?a|none)\W*$/i;
// A pointer into a conversation the next reader cannot see, anywhere in the text.
const CONVERSATION = /\bas (we )?discussed\b|\bas mentioned (earlier|above)\b/i;
const list = (v) => (Array.isArray(v) ? v : []);
// A value that is only a YAML comment, or null / ~, is a placeholder: the reader hands it back as a
// string, and it must never count as present. Every presence check goes through str().
const PLACEHOLDER = /^(null|~|#.*)$/is;
const str = (v) => { const t = typeof v === "string" ? v.trim() : ""; return PLACEHOLDER.test(t) ? "" : t; };
const f = (test, id, severity, message, fix) => ({ test, id, severity, message, fix });

export function lintSpec(spec, { exists = existsSync } = {}) {
  const d = spec.data || {};
  const out = [];
  const here = (p) => resolve(spec.dir || ".", p);

  // 1 and 4, decisions
  const decisions = list(d.decisions);
  if (!decisions.length) out.push(f(1, "decisions", "fail", "no decisions are listed", "List every decision this kind of work has under decisions:, each decided, delegated or open."));
  const seen = new Set();
  decisions.forEach((x, i) => {
    const id = str(x?.id) || `#${i + 1}`;
    if (!str(x?.id)) out.push(f(1, "decision-id", "fail", `decision ${id} has no id`, "Give it a short id."));
    else if (seen.has(id)) out.push(f(1, "decision-id", "fail", `decision id "${id}" is used twice`, "Make every id unique."));
    seen.add(id);
    const st = str(x?.state);
    if (!["decided", "delegated", "open"].includes(st)) out.push(f(1, "decision-state", "fail", `decision "${id}" has state "${st || "(none)"}"`, "Set state to decided, delegated or open."));
    if (st === "decided" && !str(x.value)) out.push(f(1, "decided-value", "fail", `decision "${id}" is decided with no value`, "Write the value that was decided."));
    if (st === "delegated" && !str(x.rule)) out.push(f(1, "delegated-rule", "fail", `decision "${id}" is delegated with no rule`, "Write the rule the agent uses to decide it."));
    if (st === "open" && !str(x.question)) out.push(f(1, "open-question", "fail", `decision "${id}" is open with no question`, "Write the question that has to be answered."));
    if (!str(x?.source)) out.push(f(4, "decision-source", "fail", `decision "${id}" does not say where it came from`, "Add source: the brain dump line, interview answer, transcript or document."));
    if (!str(x?.author)) out.push(f(4, "decision-author", "fail", `decision "${id}" does not say who wrote it`, "Add author: a person slug, or agent:<model>."));
    if (!["human", "agent"].includes(str(x?.chosen_by))) out.push(f(4, "decision-chosen-by", "fail", `decision "${id}" does not say whether a human chose it`, "Add chosen_by: human or agent."));
  });

  // 2, 3 and 4, requirements
  const reqs = list(d.requirements);
  if (!reqs.length) out.push(f(2, "requirements", "fail", "no requirements are listed", "List what the finished work must meet under requirements:."));
  reqs.forEach((r, i) => {
    const id = str(r?.id) || `#${i + 1}`;
    if (!str(r?.text)) out.push(f(2, "requirement-text", "fail", `requirement "${id}" has no text`, "Write the requirement."));
    const fw = str(r?.fails_when);
    if (!fw) out.push(f(2, "fails-when", "fail", `requirement "${id}" does not say what would show it failed`, "Add fails_when: something a person or a check could observe."));
    else if (VAGUE.test(fw)) out.push(f(2, "fails-when-vague", "warn", `requirement "${id}": fails_when leans on "${fw.match(VAGUE)[0]}"`, "Replace the adjective with something observable."));
    const c = r?.check && typeof r.check === "object" ? r.check : {};
    if (!str(c.station) && !str(c.rubric)) out.push(f(3, "check", "fail", `requirement "${id}" names no check`, "Add check: with station: <a deterministic check> or rubric: <what a grader applies>."));
    if (!str(r?.source)) out.push(f(4, "requirement-source", "fail", `requirement "${id}" does not say where it came from`, "Add source:."));
    if (!str(r?.author)) out.push(f(4, "requirement-author", "fail", `requirement "${id}" does not say who wrote it`, "Add author:."));
  });

  // 5
  // rejects items are plain strings; a non-string item is named on its own rather than hidden
  // behind "nothing is rejected".
  const rejects = list(d.rejects);
  const notStrings = rejects.map((x, i) => (x != null && typeof x !== "string" ? i + 1 : 0)).filter(Boolean);
  notStrings.forEach((n) => out.push(f(5, "rejects-item", "fail", `rejects item ${n} is not a plain string`, "Write each rejected pole as one plain line of text.")));
  if (!notStrings.length && !rejects.some((x) => str(x))) out.push(f(5, "rejects", "fail", "nothing is rejected", "List what the work must not do under rejects:."));

  // 6
  const ex = list(d.examples);
  if (!ex.length) out.push(f(6, "examples", "fail", "no examples are given", "Point at a real example under examples:, with path and why."));
  ex.forEach((e, i) => {
    const p = str(e?.path);
    if (!p) out.push(f(6, "example-path", "fail", `example ${i + 1} has no path`, "Add path: to the example."));
    else if (!/^https?:\/\//.test(p) && !exists(here(p))) out.push(f(6, "example-missing", "fail", `example "${p}" does not exist`, "Fix the path, or add the example file."));
    if (!str(e?.why)) out.push(f(6, "example-why", "fail", `example ${p || i + 1} does not say why it is an example`, "Add why: what it shows that an adjective could not."));
  });

  // 7
  const next = str(d.resume?.next_action);
  if (!next) out.push(f(7, "next-action", "fail", "no resume.next_action", "Write the single concrete step that starts the next session."));
  else if (NO_ACTION.test(next)) out.push(f(7, "next-action-vague", "fail", `next action "${next}" names no action`, "Name the concrete step."));
  else if (CONVERSATION.test(next)) out.push(f(7, "next-action-vague", "fail", `next action "${next}" points into a conversation the next reader cannot see`, "State the step itself."));
  if (CONVERSATION.test(spec.body || "")) out.push(f(7, "conversation-pointer", "warn", "the body points into a conversation the next reader cannot see", "State the thing itself."));

  // 8
  if (!str(d.feedback?.issues)) out.push(f(8, "feedback-issues", "fail", "no feedback.issues", "Say where adopters file issues and pull requests."));
  if (!str(d.feedback?.fork)) out.push(f(8, "feedback-fork", "fail", "no feedback.fork", "Say whether and how it may be forked."));

  // 9
  const led = str(d.improvement?.ledger);
  if (!led) out.push(f(9, "ledger", "fail", "no improvement.ledger", "Name the file each run writes its verdict to."));
  else if (exists(here(led))) {
    readFileSync(here(led), "utf8").split("\n").filter((l) => l.trim()).forEach((line, i) => {
      let v; try { v = JSON.parse(line); } catch { out.push(f(9, "ledger-line", "fail", `${led} line ${i + 1} is not JSON`, "One JSON object per line.")); return; }
      if (!["one-shot", "improved", "not-improved"].includes(v.verdict)) out.push(f(9, "verdict", "fail", `${led} line ${i + 1}: verdict "${v.verdict}"`, "Use one-shot, improved or not-improved."));
      if (v.verdict === "improved" && !str(v.change)) out.push(f(9, "verdict-change", "fail", `${led} line ${i + 1}: improved, but no change named`, "Say what changed."));
      if (v.verdict === "not-improved" && !str(v.reason)) out.push(f(9, "verdict-reason", "fail", `${led} line ${i + 1}: not improved, and no reason`, "Say why nothing changed."));
    });
  }
  return out;
}
