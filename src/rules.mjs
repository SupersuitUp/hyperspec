import { readFileSync, statSync } from "node:fs";
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
// The body scan reads prose only: fenced code blocks (``` or ~~~, closed by the same fence or the end
// of the file) and inline code spans (a run of N backticks closed by a run of N) are removed first, so a
// spec can quote the phrases it bans. Tables are prose and are still scanned.
const FENCE = /^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^ {0,3}\1[`~]*[ \t]*$|(?![\s\S]))/gm;
const INLINE_CODE = /(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g;
const prose = (body) => String(body || "").replace(FENCE, "").replace(INLINE_CODE, "");
const list = (v) => (Array.isArray(v) ? v : []);
// A value that is only null or ~ is a placeholder: the reader (@supersuit/superskill/yaml) keeps
// these as the literal strings "null" and "~" rather than resolving them to YAML's own null, so
// they must never count as present. A value that is only a YAML comment (source: # TODO) is
// handled upstream since superskill 0.2.1: the reader returns "" for it, same as any other blank
// scalar, so it already fails str()'s own emptiness check and needs no rule here. A QUOTED value
// that happens to start with "#" (source: "# literal") is real text and must count as present.
// Every presence check goes through str().
const PLACEHOLDER = /^(null|~)$/is;
const str = (v) => { const t = typeof v === "string" ? v.trim() : ""; return PLACEHOLDER.test(t) ? "" : t; };
const f = (test, id, severity, message, fix) => ({ test, id, severity, message, fix });
// The versions of the format this linter knows. A spec naming any other may follow rules it
// cannot check, so it is warned about rather than failed.
export const KNOWN_VERSIONS = Object.freeze(["0.1"]);
// "file", "other" (a directory or a device), or null when nothing is there.
const kind = (p) => { try { return statSync(p).isFile() ? "file" : "other"; } catch { return null; } };
const UNIQUE_IDS = "Ids must be unique across decisions and requirements; rename one.";

export function lintSpec(spec) {
  const d = spec.data || {};
  const out = [];
  const here = (p) => resolve(spec.dir || ".", p);

  // The format version. Not one of the nine tests: a stranger resuming the spec (test 7) needs to
  // know which standard it was written against, so an unknown one is a warning there.
  const version = str(d.hyperspec);
  if (!KNOWN_VERSIONS.includes(version)) out.push(f(7, "hyperspec-version", "warn", `hyperspec version "${version}" is not one this linter knows (${KNOWN_VERSIONS.join(", ")})`, "Set hyperspec: to a version this linter knows, or upgrade @supersuit/hyperspec."));

  // 1 and 4, decisions
  const decisions = list(d.decisions);
  if (!decisions.length) out.push(f(1, "decisions", "fail", "no decisions are listed", "List every decision this kind of work has under decisions:, each decided, delegated or open."));
  const seen = new Set();
  decisions.forEach((x, i) => {
    const id = str(x?.id) || `#${i + 1}`;
    if (!str(x?.id)) out.push(f(1, "decision-id", "fail", `decision ${id} has no id`, "Give it a short id."));
    else if (seen.has(id)) out.push(f(1, "decision-id", "fail", `decision id "${id}" is used twice`, UNIQUE_IDS));
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
  // One id namespace across decisions and requirements: a recipe maps every id to its author, so
  // a shared id would silently lose one of them. Reported under test 1.
  const decisionIds = new Set(decisions.map((x) => str(x?.id)).filter(Boolean));
  const reqSeen = new Set();
  reqs.forEach((r, i) => {
    const id = str(r?.id) || `#${i + 1}`;
    if (str(r?.id)) {
      if (reqSeen.has(id)) out.push(f(1, "requirement-id", "fail", `requirement id "${id}" is used twice`, UNIQUE_IDS));
      else if (decisionIds.has(id)) out.push(f(1, "requirement-id", "fail", `id "${id}" is used by a decision and a requirement`, UNIQUE_IDS));
      reqSeen.add(id);
    }
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
    else if (!/^https?:\/\//.test(p)) {
      const k = kind(here(p));
      if (!k) out.push(f(6, "example-missing", "fail", `example "${p}" does not exist`, "Fix the path, or add the example file."));
      else if (k !== "file") out.push(f(6, "example-not-file", "fail", `example "${p}" is not a file`, "Point path: at one example file, not a folder."));
      else if (spec.path && here(p) === resolve(spec.path)) out.push(f(6, "example-self", "fail", `example "${p}" is this spec itself`, "Point at a real example of the work, not the spec that describes it."));
    }
    if (!str(e?.why)) out.push(f(6, "example-why", "fail", `example ${p || i + 1} does not say why it is an example`, "Add why: what it shows that an adjective could not."));
  });

  // 7
  const next = str(d.resume?.next_action);
  if (!next) out.push(f(7, "next-action", "fail", "no resume.next_action", "Write the single concrete step that starts the next session."));
  else if (NO_ACTION.test(next)) out.push(f(7, "next-action-vague", "fail", `next action "${next}" names no action`, "Name the concrete step."));
  else if (CONVERSATION.test(next)) out.push(f(7, "next-action-vague", "fail", `next action "${next}" points into a conversation the next reader cannot see`, "State the step itself."));
  if (CONVERSATION.test(prose(spec.body))) out.push(f(7, "conversation-pointer", "warn", "the body points into a conversation the next reader cannot see", "State the thing itself."));

  // 8
  if (!str(d.feedback?.issues)) out.push(f(8, "feedback-issues", "fail", "no feedback.issues", "Say where adopters file issues and pull requests."));
  if (!str(d.feedback?.fork)) out.push(f(8, "feedback-fork", "fail", "no feedback.fork", "Say whether and how it may be forked."));

  // 9
  const led = str(d.improvement?.ledger);
  if (!led) out.push(f(9, "ledger", "fail", "no improvement.ledger", "Name the file each run writes its verdict to."));
  else {
    // A declared ledger not yet written is a warning: the first run may create it. One that
    // exists must be a readable file.
    let st = null;
    try { st = statSync(here(led)); } catch { /* not written yet */ }
    let text = null;
    if (!st) out.push(f(9, "ledger-missing", "warn", `ledger ${led} does not exist yet`, "Create it as an empty file, so the first run has somewhere to write its verdict."));
    else if (!st.isFile()) out.push(f(9, "ledger-not-file", "fail", `ledger path ${led} is not a file`, "Point improvement.ledger at a file, one JSON object per line."));
    else if (st) {
      try { text = readFileSync(here(led), "utf8"); } catch (e) { out.push(f(9, "ledger-unreadable", "fail", `ledger ${led} cannot be read (${e.code || e.message})`, "Make the ledger file readable.")); }
    }
    (text ?? "").split("\n").filter((l) => l.trim()).forEach((line, i) => {
      let v; try { v = JSON.parse(line); } catch { v = undefined; }
      if (!v || typeof v !== "object" || Array.isArray(v)) { out.push(f(9, "ledger-line", "fail", `${led} line ${i + 1} is not a JSON object`, "One JSON object per line.")); return; }
      if (!["one-shot", "improved", "not-improved"].includes(v.verdict)) out.push(f(9, "verdict", "fail", `${led} line ${i + 1}: verdict "${v.verdict}"`, "Use one-shot, improved or not-improved."));
      if (v.verdict === "improved" && !str(v.change)) out.push(f(9, "verdict-change", "fail", `${led} line ${i + 1}: improved, but no change named`, "Say what changed."));
      if (v.verdict === "not-improved" && !str(v.reason)) out.push(f(9, "verdict-reason", "fail", `${led} line ${i + 1}: not improved, and no reason`, "Say why nothing changed."));
    });
  }
  return out;
}
