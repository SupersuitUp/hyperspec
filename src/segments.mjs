// Materials marking (build 4). hyperspec never calls a model: a material is split into candidate
// segments deterministically (splitSegments), an agent or a person labels each one by hand-editing
// the JSONL file `segments init` wrote, and this module reads that file back and checks it
// (readSegments). Labeling itself is judgment and stays outside this file entirely; everything
// here is either splitting (no judgment) or checking (closed rules, no model).
//
// Segments file format (JSONL, one JSON object per line): line 1 is a header
// {"material":"<id>","path":"<material path>","sha256":"<hex>"}; every later line is one segment
// {"id":"s1","start":0,"end":212,"label":"claim"|"story"|"quote"|"stance"|"question"|"aside"|
// "private"|"unlabeled", ...label fields, "text":"..."}. start/end are JS string indices (UTF-16
// code units, the same indices readFileSync(path, "utf8") hands back) into the material's text,
// end exclusive; text must equal source.slice(start, end) exactly.

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { sha256 } from "./hash.mjs";
import { MATERIAL_LABELS } from "./labels.mjs";

const f = (test, id, severity, message, fix) => ({ test, id, severity, message, fix });
const nonEmptyStr = (v) => typeof v === "string" && v.trim() !== "";
// R1: own counts as set when it is the JSON boolean true or the string "true"; anything else
// (false, "false", missing, any other value) is unset.
const ownIsSet = (obj) => obj?.own === true || obj?.own === "true";
// The SAME whitespace test the coverage check below uses (/\S/, JS's Unicode-aware class, which
// includes U+00A0 NBSP and the other Unicode space separators, not just the ASCII set). One
// definition shared by both: a gap the sentence splitter treats as pure separator and a gap the
// coverage check treats as "nothing to require a segment for" must never disagree, or a stretch
// of NBSP-only text could read as covered to one check and as real content to the other.
const isWhitespace = (ch) => /\s/.test(ch);

// -------------------------------------------------------------------------------------------
// splitSegments: deterministic, no judgment. Candidate segments only ("unlabeled"); a person or
// agent assigns real labels afterward by editing the JSONL file this feeds.

// A line's [start, contentEnd) span, contentEnd excluding that line's own terminator ("\n" or, for
// CRLF, "\r\n" — the \r is excluded from content the same way the \n is, so a blank CRLF line
// reads as blank, but the \r is never dropped from the original text itself: it simply falls
// outside every line's content span, same as \n does, and stays untouched wherever it sits inside
// a multi-line segment). The final line (no trailing "\n") has contentEnd === text.length.
function lineSpans(text) {
  const spans = [];
  let start = 0;
  while (start <= text.length) {
    const nl = text.indexOf("\n", start);
    if (nl === -1) { spans.push({ start, contentEnd: text.length }); break; }
    let contentEnd = nl;
    if (contentEnd > start && text[contentEnd - 1] === "\r") contentEnd -= 1;
    spans.push({ start, contentEnd });
    start = nl + 1;
  }
  return spans;
}

const isBlankLine = (content) => /^[ \t]*$/.test(content);

// Paragraphs: a maximal run of consecutive non-blank lines. The blank line(s) between two
// paragraphs, and their terminators, are never part of either paragraph's span — "whitespace
// between segments is left out of every segment." A multi-line paragraph keeps the single "\n" (or
// "\r\n") between its own lines, since that is internal to the paragraph, not a separator.
function splitParagraphs(text) {
  const lines = lineSpans(text);
  const out = [];
  let curStart = null;
  let curEnd = null;
  for (const line of lines) {
    const content = text.slice(line.start, line.contentEnd);
    if (isBlankLine(content)) {
      if (curStart !== null) { out.push({ start: curStart, end: curEnd }); curStart = null; }
      continue;
    }
    if (curStart === null) curStart = line.start;
    curEnd = line.contentEnd;
  }
  if (curStart !== null) out.push({ start: curStart, end: curEnd });
  return out;
}

// Sentences: split on ".", "?" or "!" followed by whitespace (or end of text), never while inside
// a quoted span (a run opened by '"' and not yet closed) on the SAME line — inQuote resets at
// every "\n" regardless of whether a quote is actually still open, so a stray unterminated quote
// can never suppress boundaries on a later line. Punctuation strictly INSIDE an open quote on the
// same line (the case this rule exists for, e.g. a title like "Wait." spoken mid-sentence) is
// never itself a boundary; the next real, unquoted terminator is.
//
// A terminal punctuation mark immediately followed by a closing '"' DOES still count as a
// boundary, and that "punctuation + closing quote" branch is reachable more often than "same
// line" alone suggests: because inQuote resets on every "\n", a quote opened on one line and
// closed with punctuation on a LATER line is, by the time that later line's punctuation is
// reached, read as not-currently-in-a-quote — so the branch fires there too, closing the segment
// right after the quote mark (`He said "long\nquote here." Next.` -> one segment ending after the
// closing quote, then "Next."). The same branch also fires on an orphan closing quote with no
// matching open one on its own line (`He was done." Next.` splits the same way); this is a
// side effect of the same rule rather than special-cased, and is deterministic either way.
//
// A line break followed by a list marker is also a boundary: optional spaces or tabs, then "-", "*",
// "+", or digits followed by "." or ")", then a space. Without this, a bullet that is entirely a
// quotation ending in `."` never meets an unquoted terminator (its punctuation sits inside the
// quote) and runs into the next bullet. A segment that opens on a list marker steps over the
// marker first, so a numbered item's own "1." or "2)" is never read as a sentence ending. A line
// that merely starts with a hyphenated word ("self-evident"), a decimal ("3.5") or a hyphen with
// no space after it ("-ish") is not a marker and does not split.
//
// Leading and trailing whitespace around the whole text, and the whitespace run between sentences,
// is left out of every segment, the same as splitParagraphs.
const LIST_MARKER = /[ \t]*(?:[-*+]|\d+[.)]) /y;

// If a list marker begins at `pos` (after optional spaces or tabs), the index just past the marker
// symbol (before its trailing space), else -1. Callers only ask at the start of a line.
function listMarkerEnd(text, pos) {
  LIST_MARKER.lastIndex = pos;
  return LIST_MARKER.test(text) ? LIST_MARKER.lastIndex - 1 : -1;
}

// True when `pos` sits at the start of a line once any leading spaces or tabs are skipped back over.
function atLineStart(text, pos) {
  let k = pos - 1;
  while (k >= 0 && (text[k] === " " || text[k] === "\t")) k--;
  return k < 0 || text[k] === "\n";
}

function splitSentences(text) {
  const n = text.length;
  const out = [];
  let inQuote = false;
  let i = 0;
  while (i < n && isWhitespace(text[i])) i++;
  let start = i;
  // A segment that opens on a list marker begins scanning past it, so "1." is not a terminator.
  const skipMarker = (pos) => (atLineStart(text, pos) ? Math.max(pos, listMarkerEnd(text, pos)) : pos);
  i = skipMarker(start);
  while (i < n) {
    const ch = text[i];
    if (ch === "\n") {
      inQuote = false;
      const markerEnd = listMarkerEnd(text, i + 1);
      if (markerEnd !== -1) {
        let end = i;
        while (end > start && isWhitespace(text[end - 1])) end--;
        if (end > start) out.push({ start, end });
        let k = i + 1;
        while (text[k] === " " || text[k] === "\t") k++;
        start = k;
        i = markerEnd;
        continue;
      }
      i++;
      continue;
    }
    if (ch === '"') { inQuote = !inQuote; i++; continue; }
    if (!inQuote && (ch === "." || ch === "?" || ch === "!")) {
      let j = i + 1;
      while (j < n && (text[j] === "." || text[j] === "?" || text[j] === "!")) j++;
      let end = j;
      if (j < n && text[j] === '"') { end = j + 1; inQuote = false; }
      if (end >= n || isWhitespace(text[end])) {
        out.push({ start, end });
        let k = end;
        while (k < n && isWhitespace(text[k])) k++;
        start = k;
        i = skipMarker(k);
        continue;
      }
    }
    i++;
  }
  if (start < n) {
    let end = n;
    while (end > start && isWhitespace(text[end - 1])) end--;
    if (end > start) out.push({ start, end });
  }
  return out;
}

// splitSegments(text, { by }): "paragraph" (default) or "sentence". Returns candidate segments,
// each { id: "s<n>", start, end, label: "unlabeled", text }, in document order, ids 1-based and
// dense. "unlabeled" is what this writes and is never a valid label in readSegments below.
export function splitSegments(text, { by = "paragraph" } = {}) {
  if (by !== "paragraph" && by !== "sentence") {
    throw new RangeError(`splitSegments: by must be "paragraph" or "sentence", got ${JSON.stringify(by)}`);
  }
  const spans = by === "sentence" ? splitSentences(text) : splitParagraphs(text);
  return spans.map((s, i) => ({ id: `s${i + 1}`, start: s.start, end: s.end, label: "unlabeled", text: text.slice(s.start, s.end) }));
}

// -------------------------------------------------------------------------------------------
// readSegments: parse + validate a marked-up segments file. Never throws on a bad or missing
// file; every failure mode becomes a finding in the lint shape (test, id, severity, message, fix),
// the same shape src/rules.mjs and src/writing-fields.mjs already use. readSegments never reads
// MATERIAL_LABELS' meaning into anything beyond the closed-set and per-label-field checks below;
// spine-ref resolution (m1#s3, and the private/question refusal) is build 4 task 2's job, in
// src/writing-fields.mjs, which calls this and then checks refs against the returned segments.
//
// materialPath is optional: without it, only the structural checks that need no material text run
// (header shape, labels, per-label fields, duplicate ids). With it, the material-text-dependent
// checks run too: verbatim text, coverage, overlap and staleness. materialId, when given, is
// compared against the header's own "material" field.
//
// R2: EVERY finding message names which material it is about (and the segment id, where one
// applies), so two materials that each have a broken "s1" never produce identical-looking
// findings. The finding `id` fields stay rule ids and may still repeat across materials (the same
// way core findings do); it is the message text this ruling is about. The material tag preferred,
// in order: the caller's own materialId, else the header's own "material" field (once parsed),
// else the segments file's own basename — the last resort covers the missing-file and
// unparsable-header cases, where neither of the first two is available yet.
export function readSegments(segmentsPath, { materialPath, materialId } = {}) {
  const findings = [];
  const fallbackTag = basename(segmentsPath);

  let raw;
  try {
    raw = readFileSync(segmentsPath, "utf8");
  } catch {
    const matTag = materialId ?? fallbackTag;
    findings.push(f(1, "writing-materials-segments-missing", "fail",
      `material ${matTag}: is not marked (segments file "${segmentsPath}" does not exist or cannot be read)`,
      `Run \`hyperspec segments init <material> --id <id>\` to write it, then label every segment.`));
    return { header: null, segments: [], findings };
  }

  const rawLines = raw.split("\n");
  const headerRaw = rawLines[0] ?? "";
  // Any line whose whole trimmed content is empty is skipped (a trailing blank line left by a
  // final "\n" is the common case, but a genuinely blank line mid-file is tolerated the same way
  // ordinary JSONL readers tolerate one); line 1 is the only line this reader treats as load-
  // bearing on its own, per the format.
  const segLines = rawLines.slice(1).map((text, i) => ({ n: i + 2, text })).filter((l) => l.text.trim() !== "");

  let header = null;
  try {
    const parsed = JSON.parse(headerRaw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) header = parsed;
    else throw new Error("header is not a JSON object");
  } catch {
    // header stays null; matTag below falls through materialId -> fallbackTag, since there is no
    // header.material to read yet.
  }

  // Computed once header parsing has settled, so every finding from here on (including the
  // header's own shape findings) can use it. header?.material is only trusted when it is a real,
  // non-empty string — a header that fails its own presence check contributes nothing here.
  const matTag = materialId ?? (header && nonEmptyStr(header.material) ? header.material : fallbackTag);
  const matPrefix = (segId) => (segId ? `material ${matTag}, segment ${segId}: ` : `material ${matTag}: `);

  if (!header) {
    findings.push(f(1, "writing-materials-header", "fail",
      `${matPrefix()}segments file "${segmentsPath}" line 1 is not a valid JSON header object`,
      `Fix line 1 to a JSON object: {"material":"<id>","path":"<material path>","sha256":"<hex>"}.`));
  } else {
    for (const key of ["material", "path", "sha256"]) {
      if (!nonEmptyStr(header[key])) {
        findings.push(f(1, "writing-materials-header", "fail",
          `${matPrefix()}segments file "${segmentsPath}" header has no ${key}`,
          `Add ${key}: to the header line (line 1).`));
      }
    }
    if (materialId !== undefined && nonEmptyStr(header.material) && header.material !== materialId) {
      findings.push(f(1, "writing-materials-header-material", "fail",
        `${matPrefix()}segments file "${segmentsPath}" header names material "${header.material}", not "${materialId}"`,
        `Set the header's material to "${materialId}", or point the item at the right segments file.`));
    }
  }

  const segments = [];
  const idsSeen = new Set();
  const idsReportedDup = new Set();

  for (const { n, text } of segLines) {
    let obj;
    try {
      obj = JSON.parse(text);
    } catch {
      findings.push(f(1, `writing-materials-json-line-${n}`, "fail",
        `${matPrefix()}segments file "${segmentsPath}" line ${n} is not valid JSON`,
        "Fix the JSON on that line."));
      continue;
    }
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
      findings.push(f(1, `writing-materials-json-line-${n}`, "fail",
        `${matPrefix()}segments file "${segmentsPath}" line ${n} is not a JSON object`,
        "Each segment line must be a JSON object."));
      continue;
    }
    segments.push(obj);

    const id = nonEmptyStr(obj.id) ? obj.id : "";
    const segTag = id || `line ${n}`;
    if (!id) {
      findings.push(f(1, `writing-materials-segment-id-${n}`, "fail", `${matPrefix()}segment on line ${n} has no id`, "Give it a short id, e.g. s1."));
    } else if (idsSeen.has(id)) {
      if (!idsReportedDup.has(id)) {
        findings.push(f(1, "writing-materials-segment-id", "fail", `${matPrefix(id)}segment id is used twice`, "Ids must be unique within the segments file; rename one."));
      }
      idsReportedDup.add(id);
    } else {
      idsSeen.add(id);
    }

    const label = typeof obj.label === "string" ? obj.label : "";
    if (!MATERIAL_LABELS.includes(label)) {
      findings.push(f(1, `writing-materials-label-${segTag}`, "fail",
        label === "unlabeled" || !label
          ? `${matPrefix(segTag)}is still unlabeled`
          : `${matPrefix(segTag)}label "${label}" is outside ${MATERIAL_LABELS.join(", ")}`,
        `Set label to one of: ${MATERIAL_LABELS.join(", ")}.`));
    } else if (label === "claim" && !(nonEmptyStr(obj.source) || ownIsSet(obj))) {
      findings.push(f(4, `writing-materials-claim-source-${segTag}`, "fail",
        `${matPrefix(segTag)}claim has no source and is not marked own`,
        `Add source: to segment "${segTag}", or set own: true if it is the author's own claim, said as such.`));
    } else if (label === "story" && !nonEmptyStr(obj.teller)) {
      findings.push(f(4, `writing-materials-story-teller-${segTag}`, "fail", `${matPrefix(segTag)}story has no teller`, `Add teller: to segment "${segTag}".`));
    } else if (label === "quote" && !nonEmptyStr(obj.speaker)) {
      findings.push(f(4, `writing-materials-quote-speaker-${segTag}`, "fail", `${matPrefix(segTag)}quote has no speaker`, `Add speaker: to segment "${segTag}".`));
    }
  }

  // Material-text-dependent checks: verbatim text, shape, overlap, coverage, staleness. Skipped
  // entirely when no materialPath is given (structural-only mode).
  if (materialPath) {
    let materialBuffer = null;
    try {
      materialBuffer = readFileSync(materialPath);
    } catch {
      findings.push(f(1, "writing-materials-material-missing", "fail",
        `${matPrefix()}the material file "${materialPath}" does not exist or cannot be read`,
        "Fix the material's path, or add the file."));
    }

    if (materialBuffer) {
      const materialText = materialBuffer.toString("utf8");

      if (header && nonEmptyStr(header.sha256)) {
        const current = sha256(materialBuffer);
        if (current !== header.sha256) {
          findings.push(f(4, "writing-materials-stale", "fail",
            `${matPrefix()}segments file "${segmentsPath}" was marked against a different version of "${materialPath}" (sha256 no longer matches)`,
            "Re-run `hyperspec segments init` (or otherwise re-mark) against the current material, and re-label every segment."));
        }
      }

      const valid = [];
      segments.forEach((obj, i) => {
        const id = nonEmptyStr(obj.id) ? obj.id : `#${i + 1}`;
        const { start, end } = obj;
        const shapeOk = Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end > start && end <= materialText.length;
        if (!shapeOk) {
          findings.push(f(1, `writing-materials-segment-shape-${id}`, "fail",
            `${matPrefix(id)}start/end are not valid offsets into the material`,
            "Set start and end to whole-number character offsets into the material, end greater than start and no greater than the material's length."));
          return;
        }
        const text = typeof obj.text === "string" ? obj.text : "";
        const expected = materialText.slice(start, end);
        if (text !== expected) {
          findings.push(f(4, `writing-materials-text-${id}`, "fail",
            `${matPrefix(id)}text does not match the material verbatim at [${start}, ${end})`,
            "Re-derive start/end/text from the material, or re-run hyperspec segments init."));
        }
        valid.push({ id, start, end });
      });

      valid.sort((a, b) => a.start - b.start);
      for (let i = 1; i < valid.length; i++) {
        if (valid[i].start < valid[i - 1].end) {
          findings.push(f(1, "writing-materials-overlap", "fail",
            `${matPrefix(valid[i].id)}overlaps segment "${valid[i - 1].id}"`,
            "Adjust start/end so segments never overlap."));
        }
      }

      let cursor = 0;
      const gaps = [];
      for (const seg of valid) {
        if (seg.start > cursor) gaps.push([cursor, seg.start]);
        cursor = Math.max(cursor, seg.end);
      }
      if (cursor < materialText.length) gaps.push([cursor, materialText.length]);
      const uncovered = gaps.some(([s, e]) => /\S/.test(materialText.slice(s, e)));
      if (uncovered) {
        findings.push(f(1, "writing-materials-coverage", "fail",
          `${matPrefix()}some of "${materialPath}" is not covered by any segment`,
          "Add a segment for every non-whitespace span, or extend an existing segment's start/end."));
      }
    }
  }

  return { header, segments, findings };
}
