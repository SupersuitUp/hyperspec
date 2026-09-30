// A work read in order often lives in several files (one per part, one per lesson). When a writing
// spec lists them as writing.form.sequence.files, `hyperspec check <spec>` needs no --draft: the
// draft is those files, joined in order. This module owns which files that is and how they join, so
// lint (every entry must match a file) and check (the draft) agree on one reading.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, posix, resolve } from "node:path";
import { sha256 } from "./hash.mjs";
import { str } from "./placeholder.mjs";
import { splitLines } from "./draft.mjs";

const list = (v) => (Array.isArray(v) ? v : []);
const byNumber = (a, b) => a.localeCompare(b, "en", { numeric: true });

// The declared entries, as written: writing.form.sequence.files, strings only.
export function sequenceFilesDecl(spec) {
  return list(spec?.data?.writing?.form?.sequence?.files).map(str).filter(Boolean);
}

// The files one entry names, relative to the spec's folder and written with "/": the entry itself
// when it has no "*", or every file in its folder whose name matches, sorted so part-2 comes before
// part-10. A "*" matches within a file name only; the folder part is taken literally. [] when
// nothing matches.
export function expandEntry(specDir, entry) {
  const clean = entry.replace(/\\/g, "/");
  const dir = posix.dirname(clean);
  const base = posix.basename(clean);
  const isFile = (rel) => { try { return statSync(resolve(specDir, rel)).isFile(); } catch { return false; } };
  if (!base.includes("*")) return isFile(clean) ? [clean] : [];
  const re = new RegExp(`^${base.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*")}$`);
  let names = [];
  try { names = readdirSync(resolve(specDir, dir)); } catch { return []; }
  return names.filter((n) => re.test(n)).sort(byNumber).map((n) => (dir === "." ? n : `${dir}/${n}`)).filter(isFile);
}

// Every file of the sequence in reading order, each once (at its first position).
export function sequenceFiles(specDir, entries) {
  const out = [];
  for (const e of entries) for (const f of expandEntry(specDir, e)) if (!out.includes(f)) out.push(f);
  return out;
}

// The draft `check` grades when the spec lists sequence files and no --draft is given:
// { path, text, lines, sha256, sources }, the same shape src/draft.mjs's readDraft returns plus
// sources, one per file: { file, at, startLine, lineCount }. file is the path relative to the spec
// (what a finding names); at resolves from the working directory (what a station opens, such as
// links resolving a relative link beside the file that holds it). Each file's YAML frontmatter is
// blanked line for line, so its metadata is not prose and its line numbers stay its own. sha256
// covers every file's name and bytes. path is the first file's. null when no file matches.
export function readSequenceDraft(spec, specPathArg) {
  const files = sequenceFiles(spec.dir, sequenceFilesDecl(spec));
  if (!files.length) return null;
  const parts = [];
  const hashed = [];
  const sources = [];
  let startLine = 1;
  for (const file of files) {
    const buf = readFileSync(resolve(spec.dir, file));
    hashed.push(Buffer.from(`${file}\n`), buf);
    let text = buf.toString("utf8").replace(/^\uFEFF/, "");
    text = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, (fm) => fm.replace(/[^\n]/g, ""));
    if (!text.endsWith("\n")) text += "\n";
    const lineCount = text.split("\n").length - 1;
    sources.push({ file, at: join(dirname(specPathArg), file), startLine, lineCount });
    parts.push(text);
    startLine += lineCount;
  }
  const text = parts.join("");
  return { path: sources[0].at, text, lines: splitLines(text), sha256: sha256(Buffer.concat(hashed)), sources };
}

// The source holding 1-based draft line `line`, or null.
export function sourceAt(draft, line) {
  return list(draft?.sources).find((s) => line >= s.startLine && line < s.startLine + s.lineCount) ?? null;
}
