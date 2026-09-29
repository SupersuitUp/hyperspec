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
import { sha256 } from "./hash.mjs";
import { MATERIAL_LABELS } from "./writing.mjs";

const f = (test, id, severity, message, fix) => ({ test, id, severity, message, fix });
const nonEmptyStr = (v) => typeof v === "string" && v.trim() !== "";
// R1: own counts as set when it is the JSON boolean true or the string "true"; anything else
// (false, "false", missing, any other value) is unset.
const ownIsSet = (obj) => obj?.own === true || obj?.own === "true";
const isWhitespace = (ch) => ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\f" || ch === "\v";

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

// Sentences: split on ".", "?" or "!" followed by whitespace (or end of text), never inside a
// quoted span (a run opened and closed by '"') on one line — the quote-open state resets at every
// "\n", so a stray unterminated quote can never suppress the rest of the document's boundaries.
// A terminal punctuation mark immediately followed by a closing '"' still counts (the quote closes
// with it); punctuation strictly INSIDE an open quote (the case this rule exists for, e.g. a title
// like "Wait." spoken mid-sentence) is never a boundary — the next real, unquoted terminator is.
// Leading and trailing whitespace around the whole text, and the whitespace run between sentences,
// is left out of every segment, the same as splitParagraphs.
function splitSentences(text) {
  const n = text.length;
  const out = [];
  let inQuote = false;
  let i = 0;
  while (i < n && isWhitespace(text[i])) i++;
  let start = i;
  while (i < n) {
    const ch = text[i];
    if (ch === "\n") { inQuote = false; i++; continue; }
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
        i = k;
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
export function readSegments(segmentsPath, { materialPath, materialId } = {}) {
  const findings = [];

  let raw;
  try {
    raw = readFileSync(segmentsPath, "utf8");
  } catch {
    findings.push(f(1, "writing-materials-missing", "fail",
      `material is not marked: segments file "${segmentsPath}" does not exist or cannot be read`,
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
    findings.push(f(1, "writing-materials-header", "fail",
      `segments file "${segmentsPath}" line 1 is not a valid JSON header object`,
      `Fix line 1 to a JSON object: {"material":"<id>","path":"<material path>","sha256":"<hex>"}.`));
  }

  if (header) {
    for (const key of ["material", "path", "sha256"]) {
      if (!nonEmptyStr(header[key])) {
        findings.push(f(1, "writing-materials-header", "fail",
          `segments file "${segmentsPath}" header has no ${key}`,
          `Add ${key}: to the header line (line 1).`));
      }
    }
    if (materialId !== undefined && nonEmptyStr(header.material) && header.material !== materialId) {
      findings.push(f(1, "writing-materials-header-material", "fail",
        `segments file "${segmentsPath}" header names material "${header.material}", not "${materialId}"`,
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
        `segments file "${segmentsPath}" line ${n} is not valid JSON`,
        "Fix the JSON on that line."));
      continue;
    }
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
      findings.push(f(1, `writing-materials-json-line-${n}`, "fail",
        `segments file "${segmentsPath}" line ${n} is not a JSON object`,
        "Each segment line must be a JSON object."));
      continue;
    }
    segments.push(obj);

    const id = nonEmptyStr(obj.id) ? obj.id : "";
    const tag = id || `line ${n}`;
    if (!id) {
      findings.push(f(1, `writing-materials-segment-id-${n}`, "fail", `segment on line ${n} has no id`, "Give it a short id, e.g. s1."));
    } else if (idsSeen.has(id)) {
      if (!idsReportedDup.has(id)) {
        findings.push(f(1, "writing-materials-segment-id", "fail", `segment id "${id}" is used twice`, "Ids must be unique within the segments file; rename one."));
      }
      idsReportedDup.add(id);
    } else {
      idsSeen.add(id);
    }

    const label = typeof obj.label === "string" ? obj.label : "";
    if (!MATERIAL_LABELS.includes(label)) {
      findings.push(f(1, `writing-materials-label-${tag}`, "fail",
        label === "unlabeled" || !label
          ? `segment "${tag}" is still unlabeled`
          : `segment "${tag}" has label "${label}", outside ${MATERIAL_LABELS.join(", ")}`,
        `Set label to one of: ${MATERIAL_LABELS.join(", ")}.`));
    } else if (label === "claim" && !(nonEmptyStr(obj.source) || ownIsSet(obj))) {
      findings.push(f(4, `writing-materials-claim-source-${tag}`, "fail",
        `claim segment "${tag}" has no source and is not marked own`,
        `Add source: to segment "${tag}", or set own: true if it is the author's own claim, said as such.`));
    } else if (label === "story" && !nonEmptyStr(obj.teller)) {
      findings.push(f(4, `writing-materials-story-teller-${tag}`, "fail", `story segment "${tag}" has no teller`, `Add teller: to segment "${tag}".`));
    } else if (label === "quote" && !nonEmptyStr(obj.speaker)) {
      findings.push(f(4, `writing-materials-quote-speaker-${tag}`, "fail", `quote segment "${tag}" has no speaker`, `Add speaker: to segment "${tag}".`));
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
        `material "${materialPath}" does not exist or cannot be read`,
        "Fix the material's path, or add the file."));
    }

    if (materialBuffer) {
      const materialText = materialBuffer.toString("utf8");

      if (header && nonEmptyStr(header.sha256)) {
        const current = sha256(materialBuffer);
        if (current !== header.sha256) {
          findings.push(f(4, "writing-materials-stale", "fail",
            `segments file "${segmentsPath}" was marked against a different version of "${materialPath}" (sha256 no longer matches)`,
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
            `segment "${id}" has start/end that are not valid offsets into the material`,
            "Set start and end to whole-number character offsets into the material, end greater than start and no greater than the material's length."));
          return;
        }
        const text = typeof obj.text === "string" ? obj.text : "";
        const expected = materialText.slice(start, end);
        if (text !== expected) {
          findings.push(f(4, `writing-materials-text-${id}`, "fail",
            `segment "${id}" text does not match the material verbatim at [${start}, ${end})`,
            "Re-derive start/end/text from the material, or re-run hyperspec segments init."));
        }
        valid.push({ id, start, end });
      });

      valid.sort((a, b) => a.start - b.start);
      for (let i = 1; i < valid.length; i++) {
        if (valid[i].start < valid[i - 1].end) {
          findings.push(f(1, "writing-materials-overlap", "fail",
            `segment "${valid[i].id}" overlaps segment "${valid[i - 1].id}"`,
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
          `some of "${materialPath}" is not covered by any segment`,
          "Add a segment for every non-whitespace span, or extend an existing segment's start/end."));
      }
    }
  }

  return { header, segments, findings };
}
