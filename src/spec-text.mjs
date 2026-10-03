// specText(data, body) (0.10): a hyperspec file's text from data, for a tool that BUILDS specs
// rather than a person typing one: a drafting loop filling a skeleton's mechanical blocks, a
// renderer writing one spec per audience. Writes the block-style YAML subset hyperspec reads
// (maps, lists of scalars, lists of maps, scalars), quoting every scalar the way init does
// (template.mjs's scalar), then READS IT BACK with the same reader lint uses and throws, naming
// the field, if any value came back different. A lossy spec is never handed over: hand-written
// YAML once lost everything after " #" and after a leading quoted phrase while lint passed
// (letter BUILD-NOTES item 1).
//
// Every scalar reads back as a string (the reader's own rule), so numbers and booleans are
// written plain and compared as text. null and nested lists have no form here and are refused.
import { parseSkillFile } from "@supersuit/superskill/yaml";
import { scalar } from "./template.mjs";

const isMap = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);

function emitScalar(v, at) {
  if (typeof v === "string") return scalar(v);
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "boolean") return String(v);
  throw new Error(`specText: ${at} is ${v === null ? "null" : typeof v}, which a hyperspec cannot hold; write a string or leave the key out`);
}

function emitMap(obj, indent, at) {
  const pad = " ".repeat(indent);
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    const here = at ? `${at}.${k}` : k;
    if (Array.isArray(v)) {
      if (!v.length) { out.push(`${pad}${k}: []`); continue; }
      out.push(`${pad}${k}:`);
      v.forEach((item, i) => out.push(...emitItem(item, indent + 2, `${here}[${i}]`)));
    } else if (isMap(v)) {
      if (!Object.keys(v).length) throw new Error(`specText: ${here} is an empty map, which reads back as nothing; leave the key out`);
      out.push(`${pad}${k}:`, ...emitMap(v, indent + 2, here));
    } else out.push(`${pad}${k}: ${emitScalar(v, here)}`);
  }
  return out;
}

function emitItem(item, indent, at) {
  const pad = " ".repeat(indent);
  if (Array.isArray(item)) throw new Error(`specText: ${at} is a list inside a list, which a hyperspec cannot hold`);
  if (!isMap(item)) return [`${pad}- ${emitScalar(item, at)}`];
  const lines = emitMap(item, indent + 2, at);
  if (!lines.length) throw new Error(`specText: ${at} is an empty map`);
  return [`${pad}- ${lines[0].slice(indent + 2)}`, ...lines.slice(1)];
}

// Scalars compared as the reader returns them: text.
const norm = (v) => (Array.isArray(v) ? v.map(norm) : isMap(v)
  ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, norm(x)]))
  : String(v));

function firstDiff(a, b, at = "") {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return at || "(root)";
    for (let i = 0; i < a.length; i++) { const d = firstDiff(a[i], b[i], `${at}[${i}]`); if (d) return d; }
    return null;
  }
  if (isMap(a) || isMap(b)) {
    if (!isMap(a) || !isMap(b)) return at || "(root)";
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const d = firstDiff(a[k], b[k], at ? `${at}.${k}` : k); if (d) return d; }
    return null;
  }
  return a === b ? null : at;
}

export function specText(data, body = "") {
  if (!isMap(data)) throw new Error("specText: data must be an object");
  const text = `---\n${emitMap(data, 0, "").join("\n")}\n---\n${body}`;
  const { data: readBack, error } = parseSkillFile(text);
  if (error) throw new Error(`specText: the reader refused the result: ${error}`);
  const diff = firstDiff(norm(data), readBack);
  if (diff) throw new Error(`specText: ${diff} does not read back as written; nothing returned`);
  return text;
}

// The reading half: a spec's text as lint reads it, { data, body, error }. With specText, a tool
// can read a skeleton (`hyperspec init --profile writing`), fill the blocks it knows, and write
// it back without a second YAML reader that disagrees with the linter.
export function parseSpecText(text) {
  return parseSkillFile(String(text ?? ""));
}
