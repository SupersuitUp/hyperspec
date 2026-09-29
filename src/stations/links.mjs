// Station "links" (hyperspec 0.6, build 6a task 2). Checks every Markdown link ("[text](url)")
// and every bare http(s):// URL in the draft: an absolute http/https URL must be well-formed (a
// real host), a mailto: link must carry an address, any other scheme fails outright, and a
// relative link must resolve to a file that actually exists, relative to the DRAFT's own
// directory (never the spec's). No network access, ever: well-formed means "the URL parses and
// names a host", not "the host answers".
//
// Anchors: the "#fragment" part of any link is stripped before checking anything else, so
// "notes.md#section-two" is checked as "notes.md" (its target heading is never verified), and a
// link that is nothing but "#fragment" (empty path once the anchor is stripped) always resolves,
// since it points at the draft itself.

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const name = "links";

// Every "[text](url)" span in `text`, in document order: { start, end, url }. The url is the raw
// content between the parens, up to the first run of whitespace (a Markdown link may carry a
// `"title"` after the url, separated by whitespace; that title is not itself a link and is
// ignored here). `end` is the index just past the closing ")", used both to report a line number
// and to mask the span out before the bare-URL scan below, so the same URL is never counted twice.
const MD_LINK_RE = /\[([^\]]*)\]\(([^)]+)\)/g;

function markdownLinks(text) {
  const out = [];
  let m;
  while ((m = MD_LINK_RE.exec(text))) {
    const inner = m[2].trim();
    const url = inner.split(/\s+/)[0];
    if (url) out.push({ start: m.index, end: m.index + m[0].length, url });
  }
  return out;
}

// `text` with every [start, end) range in `ranges` overwritten with spaces of the same length, so
// character offsets (and therefore line numbers) of whatever is scanned afterward stay identical
// to the original text, while the masked spans can never be matched again.
function mask(text, ranges) {
  let out = text;
  for (const { start, end } of ranges) out = out.slice(0, start) + " ".repeat(end - start) + out.slice(end);
  return out;
}

// Every bare "http://" or "https://" URL left in `text` (after Markdown links have been masked
// out of it), stopping at whitespace or a closing bracket/paren/angle-bracket that is more likely
// to be surrounding punctuation than part of the URL itself.
const BARE_URL_RE = /https?:\/\/[^\s)>\]]+/g;

function bareUrls(text) {
  const out = [];
  let m;
  while ((m = BARE_URL_RE.exec(text))) out.push({ start: m.index, end: m.index + m[0].length, url: m[0] });
  return out;
}

// The 1-based line containing character offset `pos` of `text`, counting "\n" characters directly
// rather than reading draft.lines (whose own CRLF handling is not this station's business; every
// line, CRLF or not, still carries exactly one "\n").
function lineAt(text, pos) {
  let line = 1;
  for (let i = 0; i < pos && i < text.length; i++) if (text[i] === "\n") line++;
  return line;
}

const SCHEME_RE = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;

// Classifies one URL, with its "#..." anchor already known to the caller as stripped: "http" (the
// scheme itself, lowercased, is on `scheme`), "mailto", "other-scheme" (anything else with a
// scheme prefix), or "relative" (no scheme prefix at all: a bare path, absolute or relative).
function classify(withoutAnchor) {
  const m = SCHEME_RE.exec(withoutAnchor);
  if (!m) return { kind: "relative", path: withoutAnchor };
  const scheme = m[1].toLowerCase();
  if (scheme === "http" || scheme === "https") return { kind: "http", scheme };
  if (scheme === "mailto") return { kind: "mailto" };
  return { kind: "other-scheme", scheme };
}

// Why `url` is broken, as one of "malformed-http", "bad-scheme" or "broken-relative", or null when
// it is fine. draftDirAbs is the draft's own directory (resolved once by the caller), which every
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
  const target = resolve(draftDirAbs, c.path);
  return existsSync(target) ? null : "broken-relative";
}

const REASON = {
  "malformed-http": {
    id: "station-links-malformed",
    text: (url) => `link "${url}" is not a well-formed http/https URL (no host)`,
    fix: "Fix the URL to include a scheme (http:// or https://) and a real host.",
  },
  "malformed-mailto": {
    id: "station-links-malformed",
    text: (url) => `link "${url}" is a mailto: link with no address`,
    fix: "Add a real address after mailto:, or remove the link.",
  },
  "bad-scheme": {
    id: "station-links-bad-scheme",
    text: (url) => `link "${url}" uses a scheme that is not http, https or mailto`,
    fix: "Use an http(s):// URL, a mailto: link, or a path relative to the draft.",
  },
  "broken-relative": {
    id: "station-links-broken-relative",
    text: (url) => `relative link "${url}" does not resolve to a file next to the draft`,
    fix: "Fix the path, or add the file the link points at.",
  },
};

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function run(spec, draft) {
  const mdLinks = markdownLinks(draft.text);
  const masked = mask(draft.text, mdLinks);
  const bare = bareUrls(masked);
  const all = [...mdLinks, ...bare].sort((a, b) => a.start - b.start);

  const draftDirAbs = dirname(resolve(draft.path));
  const findings = [];
  for (const { start, url } of all) {
    const reason = checkUrl(url, draftDirAbs);
    if (!reason) continue;
    const r = REASON[reason];
    findings.push({
      station: name,
      id: r.id,
      severity: "fail",
      line: lineAt(draft.text, start),
      message: r.text(truncate(url, 80)),
      fix: r.fix,
    });
  }

  return { station: name, status: findings.length ? "fail" : "pass", findings };
}
