// Reading a draft the way every command that grades one reads it (`hyperspec check`, `hyperspec
// judge prepare` and `judge record`), so a station and a judge see the same text for the same file.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sha256 } from "./hash.mjs";

// 1-based line array: text.split("\n"), so array index i holds line i + 1. A trailing "\r" (a
// CRLF file) is stripped from every entry here, at the source, so every station that reads
// draft.lines sees a clean line ("# Claim", never "# Claim\r") without needing to know CRLF
// exists; the line COUNT and every 1-based line number are unaffected, since stripping a
// trailing byte from an entry never changes how many entries there are.
export function splitLines(text) {
  return text.split("\n").map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));
}

// { path, text, lines, sha256 } for the draft at draftPathArg (resolved against the working
// directory, recorded as given), or null when it cannot be read. One leading UTF-8 BOM is not part
// of the draft's text: stripped here, so a heading on line 1 is found and every offset and line
// number counts from the first real character. sha256 stays over the raw bytes.
export function readDraft(draftPathArg) {
  let buf;
  try { buf = readFileSync(resolve(draftPathArg)); } catch { return null; }
  const text = hideUnseen(buf.toString("utf8").replace(/^\uFEFF/, ""));
  return { path: draftPathArg, text, lines: splitLines(text), sha256: sha256(buf) };
}

// WHAT A READER NEVER SEES IS NOT PROSE (0.10). A leading YAML frontmatter block and every HTML
// comment are blanked line for line: their characters go and their line breaks stay, so every
// line number a finding names is still the file's own. A draft that is a kept document (a title,
// a status, a note to self about what it was meant to be) then grades exactly as its prose does:
// no hidden word counts toward length, is a term's first use, or needs a claim. Sequence drafts
// already blanked frontmatter per file (src/sequence-draft.mjs); this is the same rule for every
// draft. Offsets inside a line can move; evidence is matched by text, never by column.
export function hideUnseen(text) {
  const blank = (s) => s.replace(/[^\n]/g, "");
  return text
    .replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, blank)
    .replace(/<!--[\s\S]*?-->/g, blank);
}
