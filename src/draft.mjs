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
  const text = buf.toString("utf8").replace(/^﻿/, "");
  return { path: draftPathArg, text, lines: splitLines(text), sha256: sha256(buf) };
}
