// Station "links" (hyperspec 0.6). Checks every Markdown link and
// every bare http(s):// URL in the draft: an absolute http/https URL must be well-formed (a real
// host), a mailto: link must carry an address, any other scheme fails outright, a link rooted at
// "/" is site-root-relative and warns rather than resolving locally (there is
// no site root here to resolve it against), and any other relative link must resolve to a file
// that actually exists, relative to the DRAFT's own directory (never the spec's). No network
// access, ever: well-formed means "the URL parses and names a host", not "the host answers".
//
// Three Markdown link forms are checked, all through the same checkUrl:
//   - inline: [text](url)
//   - reference, full or collapsed: [text][ref] / [ref][], resolved against a [ref]: url
//     definition elsewhere in the draft (label matching is case-insensitive and whitespace-
//     collapsed); a full or collapsed reference with no matching definition is its own
//     finding, station-links-undefined-reference, naming the label, since the second bracket
//     pair says a link was meant.
//   - shortcut reference: [ref] alone (no second bracket pair), checked only when a definition
//     for that label exists, once every inline link, reference definition and full/collapsed
//     reference has already been matched and masked out of the text. With no definition it is
//     ordinary text, as CommonMark renders it: [sic], a task-list [x], a footnote-style [1].
//
// Anchors: the "#fragment" part of any link is stripped before checking anything else, so
// "notes.md#section-two" is checked as "notes.md" (its target heading is never verified), and a
// link that is nothing but "#fragment" (empty path once the anchor is stripped) always resolves,
// since it points at the draft itself.
//
// Fenced code blocks and inline code spans are masked out (src/stations/util.mjs's maskCode)
// before ANY of the above runs, so a Markdown link or URL shown as illustrative syntax inside a
// fence or a `` `span` `` is never checked as a real, followable link.

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { lineAt, maskCode, maskRanges, truncate } from "./util.mjs";
import { sourceAt } from "../sequence-draft.mjs";

export const name = "links";

// Every "[text](url)" span in `text`, in document order: { start, end, url }. The url is the raw
// content between the parens, up to the first run of whitespace (a Markdown link may carry a
// `"title"` after the url, separated by whitespace; that title is not itself a link and is
// ignored here). `end` is the index just past the closing ")", used both to report a line number
// and to mask the span out before later scans, so the same URL is never counted twice.
const MD_LINK_RE = /\[([^\]]*)\]\(([^)]+)\)/g;

function markdownLinks(text) {
  const out = [];
  let m;
  MD_LINK_RE.lastIndex = 0;
  while ((m = MD_LINK_RE.exec(text))) {
    const inner = m[2].trim();
    const url = inner.split(/\s+/)[0];
    if (url) out.push({ start: m.index, end: m.index + m[0].length, url });
  }
  return out;
}

// A reference definition line: up to 3 spaces of indent, "[label]:", the URL, and an optional
// title in "quotes", 'quotes' or (parens). One definition per line, the common case; a multi-line
// definition (title on the following line) is not attempted.
const DEF_RE = /^[ \t]{0,3}\[([^\]]+)\]:[ \t]*(\S+)[ \t]*(?:"[^"]*"|'[^']*'|\([^)]*\))?[ \t]*$/gm;

const normalizeLabel = (label) => label.trim().toLowerCase().replace(/\s+/g, " ");

// Every reference definition in `text`: a Map from normalized label to { url }, plus the [start,
// end) span of each whole definition line, ready to mask out (so a definition's own "[label]:" is
// never later mistaken for a reference USE, and its URL is never also picked up by the bare-URL
// scan below). The FIRST definition for a given label wins on a duplicate, matching CommonMark.
function definitions(text) {
  const defs = new Map();
  const spans = [];
  let m;
  DEF_RE.lastIndex = 0;
  while ((m = DEF_RE.exec(text))) {
    const label = normalizeLabel(m[1]);
    if (!defs.has(label)) defs.set(label, { url: m[2] });
    spans.push({ start: m.index, end: m.index + m[0].length });
  }
  return { defs, spans };
}

// Every "[text][ref]" (full) or "[text][]" (collapsed, label = text) span, in document order:
// { start, end, label }. Run AFTER inline links and definitions are already masked out of `text`,
// so this can only match genuine two-bracket-pair reference syntax.
const FULL_REF_RE = /\[([^\]]*)\]\[([^\]]*)\]/g;

function fullReferences(text) {
  const out = [];
  let m;
  FULL_REF_RE.lastIndex = 0;
  while ((m = FULL_REF_RE.exec(text))) {
    const label = (m[2].trim() || m[1].trim());
    if (label) out.push({ start: m.index, end: m.index + m[0].length, label });
  }
  return out;
}

// Every remaining "[label]" span, in document order: { start, end, label }. Run AFTER inline
// links, definitions and full/collapsed references are already masked out, so whatever "[...]"
// is left is either a shortcut reference or ordinary bracketed prose. The caller keeps only the
// ones whose label has a definition: CommonMark renders an undefined "[label]" as plain text, so
// an editorial [sic], a task-list [x] or a footnote-style [1] is never a link.
const SHORTCUT_REF_RE = /\[([^\]]+)\]/g;

function shortcutReferences(text) {
  const out = [];
  let m;
  SHORTCUT_REF_RE.lastIndex = 0;
  while ((m = SHORTCUT_REF_RE.exec(text))) {
    const label = m[1].trim();
    if (label) out.push({ start: m.index, end: m.index + m[0].length, label });
  }
  return out;
}

// Every bare "http://" or "https://" URL left in `text` (after every other link form has been
// masked out of it), stopping at whitespace or a closing bracket/paren/angle-bracket that is more
// likely to be surrounding punctuation than part of the URL itself. The host part may be empty,
// so a bare "https://" is matched and fails as malformed rather than passing unseen.
const BARE_URL_RE = /https?:\/\/[^\s)>\]]*/g;

function bareUrls(text) {
  const out = [];
  let m;
  BARE_URL_RE.lastIndex = 0;
  while ((m = BARE_URL_RE.exec(text))) out.push({ start: m.index, end: m.index + m[0].length, url: m[0] });
  return out;
}

const SCHEME_RE = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;

// Classifies one URL, with its "#..." anchor already known to the caller as stripped: "http" (the
// scheme itself, lowercased, is on `scheme`), "mailto", "other-scheme" (anything else with a
// scheme prefix), or "relative" (no scheme prefix at all: a bare path, root-relative or relative).
function classify(withoutAnchor) {
  const m = SCHEME_RE.exec(withoutAnchor);
  if (!m) return { kind: "relative", path: withoutAnchor };
  const scheme = m[1].toLowerCase();
  if (scheme === "http" || scheme === "https") return { kind: "http", scheme };
  if (scheme === "mailto") return { kind: "mailto" };
  return { kind: "other-scheme", scheme };
}

// Why `url` is broken (or merely unresolvable locally), as one of "malformed-http",
// "malformed-mailto", "bad-scheme", "root-relative" or "broken-relative", or null when it is
// fine. draftDirAbs is the draft's own directory (resolved once by the caller), which every
// relative link resolves against, never the spec's directory.
function checkUrl(url, draftDirAbs) {
  const hashIdx = url.indexOf("#");
  const withoutAnchor = hashIdx === -1 ? url : url.slice(0, hashIdx);
  const c = classify(withoutAnchor);

  if (c.kind === "http") {
    try {
      const u = new URL(url);
      if (!u.hostname) return "malformed-http";
    } catch {
      return "malformed-http";
    }
    return null;
  }
  if (c.kind === "mailto") {
    const address = withoutAnchor.slice("mailto:".length).split("?")[0].trim();
    return address ? null : "malformed-mailto";
  }
  if (c.kind === "other-scheme") return "bad-scheme";

  // relative: an empty path (the link was nothing but "#fragment", or literally empty) always
  // resolves, since it points at the draft's own file, which exists by construction (check.mjs
  // only ever builds a draft object after successfully reading it).
  if (!c.path) return null;
  // A link rooted at "/" names a path from some site's root, which this station has no way to
  // resolve (there is no "site" here, only the draft's own folder), so it is neither a pass nor a
  // fail -- a warning, naming the fact that it cannot be checked locally.
  if (c.path.startsWith("/")) return "root-relative";
  const target = resolve(draftDirAbs, c.path);
  return existsSync(target) ? null : "broken-relative";
}

const REASON = {
  "malformed-http": {
    id: "station-links-malformed",
    severity: "fail",
    text: (url) => `link "${url}" is not a well-formed http/https URL (no host)`,
    fix: "Fix the URL to include a scheme (http:// or https://) and a real host.",
  },
  "malformed-mailto": {
    id: "station-links-malformed",
    severity: "fail",
    text: (url) => `link "${url}" is a mailto: link with no address`,
    fix: "Add a real address after mailto:, or remove the link.",
  },
  "bad-scheme": {
    id: "station-links-bad-scheme",
    severity: "fail",
    text: (url) => `link "${url}" uses a scheme that is not http, https or mailto`,
    fix: "Use an http(s):// URL, a mailto: link, or a path relative to the draft.",
  },
  "root-relative": {
    id: "station-links-root-relative",
    severity: "warn",
    text: (url) => `link "${url}" is site-root-relative and cannot be resolved against a file on disk`,
    fix: "Point the link at a path relative to the draft, or use a full URL, if it must be checked.",
  },
  "broken-relative": {
    id: "station-links-broken-relative",
    severity: "fail",
    text: (url) => `relative link "${url}" does not resolve to a file next to the draft`,
    fix: "Fix the path, or add the file the link points at.",
  },
};

function reasonFinding(reason, url, line) {
  const r = REASON[reason];
  return { station: name, id: r.id, severity: r.severity, line, message: r.text(truncate(url, 80)), fix: r.fix };
}

function undefinedReferenceFinding(label, line) {
  const shown = truncate(label, 80);
  return {
    station: name,
    id: "station-links-undefined-reference",
    severity: "fail",
    line,
    message: `reference "${shown}" has no matching "[${shown}]: url" definition`,
    fix: `Add a "[${shown}]: <url>" definition, or fix the reference to match a label that already has one.`,
  };
}

export function run(spec, draft) {
  const draftDirAbs = dirname(resolve(draft.path));
  // A draft assembled from a sequence's files (src/sequence-draft.mjs) resolves each relative link
  // beside the file that holds it.
  const dirAt = (line) => {
    const src = sourceAt(draft, line);
    return src ? dirname(resolve(src.at)) : draftDirAbs;
  };

  // Masking pipeline: code first, then each link form in turn, each pass working on the text the
  // previous pass left behind, so nothing is ever matched twice by a later, looser pattern (a
  // reference definition's own brackets are not a shortcut reference; the leftover "[text]" half
  // of a masked-out "[text][ref]" pair is not itself a shortcut reference; a URL already read as
  // part of a Markdown link is not also a bare URL). Every span carries its ORIGINAL start offset
  // throughout, since maskRanges never shifts anything, only blanks it, so draft.text and lineAt
  // stay valid for every one of them regardless of how many passes it survived.
  let working = maskCode(draft.text);

  const mdLinks = markdownLinks(working);
  working = maskRanges(working, mdLinks);

  const { defs, spans: defSpans } = definitions(working);
  working = maskRanges(working, defSpans);

  const fullRefs = fullReferences(working);
  working = maskRanges(working, fullRefs);

  const shortcutRefs = shortcutReferences(working).filter((r) => defs.has(normalizeLabel(r.label)));
  working = maskRanges(working, shortcutRefs);

  const bare = bareUrls(working);

  const entries = [];

  for (const { start, url } of [...mdLinks, ...bare]) {
    const line = lineAt(draft.text, start);
    const reason = checkUrl(url, dirAt(line));
    if (reason) entries.push({ start, finding: reasonFinding(reason, url, line) });
  }

  for (const { start, label } of [...fullRefs, ...shortcutRefs]) {
    const line = lineAt(draft.text, start);
    const def = defs.get(normalizeLabel(label));
    if (!def) {
      entries.push({ start, finding: undefinedReferenceFinding(label, line) });
      continue;
    }
    const reason = checkUrl(def.url, dirAt(line));
    if (reason) entries.push({ start, finding: reasonFinding(reason, def.url, line) });
  }

  entries.sort((a, b) => a.start - b.start);
  const findings = entries.map((e) => e.finding);
  const status = findings.some((f) => f.severity === "fail") ? "fail" : "pass";
  return { station: name, status, findings };
}
