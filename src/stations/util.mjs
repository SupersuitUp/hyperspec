import { resolve } from "node:path";
import { str } from "../placeholder.mjs";
import { readSegments } from "../segments.mjs";

// Shared helpers for the deterministic stations (hyperspec 0.6). "One place this pattern is
// defined" (src/placeholder.mjs's own header comment), so a helper more than one station needs
// lives here rather than being copied station to station: lineAt, truncate, maskCode, maskRanges
// and markedSegments.

// The 1-based line containing character offset `pos` of `text`. Counts "\n" characters directly
// rather than reading draft.lines: draft.lines' own CRLF handling ("\r" left attached to the
// previous line's entry, or stripped, depending on how src/check.mjs built it) is none of any
// station's business, and counting "\n" occurrences gives the right line number either way, since
// every line, CRLF or not, still carries exactly one "\n".
export function lineAt(text, pos) {
  let line = 1;
  for (let i = 0; i < pos && i < text.length; i++) if (text[i] === "\n") line++;
  return line;
}

// Trims `text`, then truncates to at most `max` characters (an ellipsis replacing the last
// character when it is longer), matching the general finding-message rule that a quoted span of
// the draft is at most 80 characters. Trimming FIRST means a span with leading/trailing
// whitespace never wastes truncation budget on it.
export function truncate(text, max) {
  const t = String(text).trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

// `text` with every [start, end) range in `ranges` blanked out: every character in the range
// becomes a space, EXCEPT "\n", which is left alone. Preserving newlines (rather than blanking
// them too) is what keeps every character offset, and therefore every 1-based line number
// computed afterward, identical to `text` before masking, even when a masked range spans more
// than one line (a fenced code block, in particular): blanking a "\n" would merge two lines into
// one for every offset that comes after it, which is exactly the bug a single-line-only masker
// would not have caught. Used by every "mask X out before scanning for Y" step across the
// stations, so a masked-and-rescanned span can never be matched a second time.
export function maskRanges(text, ranges) {
  let out = text;
  for (const { start, end } of ranges) {
    const blanked = out.slice(start, end).replace(/[^\n]/g, " ");
    out = out.slice(0, start) + blanked + out.slice(end);
  }
  return out;
}

// A fenced code block: a line starting (after up to 3 spaces of indent) with 3 or more backticks
// or tildes, some content, then a line starting with at least as many of the SAME fence
// character. Non-greedy so back-to-back fences in one draft are matched as separate blocks
// rather than one block swallowing everything between the first open and the last close.
const FENCE_RE = /^[ \t]{0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^[ \t]{0,3}\1[ \t]*$/gm;

// An inline code span: a single backtick, a run of non-backtick, non-newline characters, a
// closing backtick. Does not attempt CommonMark's full rule for spans opened with a run of two or
// more backticks (rare in practice, and unneeded for the case this exists to fix: an inline
// `like this` mention of syntax that must not be read as prose).
const INLINE_CODE_RE = /`[^`\n]+`/g;

// `text` with every fenced code block and inline code span blanked out (offsets and line numbers
// preserved, see maskRanges above). Both `links` (a URL shown as example syntax inside a fence or
// a span is not a real, followable link) and `terms` (a term's only appearance inside `` `code`
// `` is not a prose use, and must not count toward "does this term appear/get defined") mask code
// out before doing anything else, so later masking passes (Markdown links, reference definitions,
// bare URLs, sentence splitting) never see inside a code span or fence.
export function maskCode(text) {
  const fenceRanges = [];
  FENCE_RE.lastIndex = 0;
  let m;
  while ((m = FENCE_RE.exec(text))) fenceRanges.push({ start: m.index, end: m.index + m[0].length });
  const withoutFences = maskRanges(text, fenceRanges);

  const inlineRanges = [];
  INLINE_CODE_RE.lastIndex = 0;
  let im;
  while ((im = INLINE_CODE_RE.exec(withoutFences))) inlineRanges.push({ start: im.index, end: im.index + im[0].length });
  return maskRanges(withoutFences, inlineRanges);
}

// Every marked material of the spec, as [{ material, segments }], in writing.materials.items
// order: an item with a segments: field whose file readSegments can read. The segments file
// resolves relative to spec.dir, the way every writing path does. readSegments' own findings are
// dropped here on purpose: lint reports them (test 1 and 4) and check only runs once lint passes,
// so a station reading materials only needs the segments themselves. quotes and private both
// read this, so it is cached on ctx (one read per check run, whichever station asks first); a
// caller that passes no ctx simply reads the files again.
export function markedSegments(spec, ctx) {
  if (ctx && ctx.markedSegments) return ctx.markedSegments;
  const items = spec?.data?.writing?.materials?.items;
  const out = [];
  for (const item of Array.isArray(items) ? items : []) {
    const segPath = str(item?.segments);
    if (!segPath) continue;
    const material = str(item?.id) || segPath;
    const { segments } = readSegments(resolve(spec?.dir || ".", segPath), { materialId: str(item?.id) || undefined });
    out.push({ material, segments: segments.filter((s) => s && typeof s === "object") });
  }
  if (ctx) ctx.markedSegments = out;
  return out;
}
