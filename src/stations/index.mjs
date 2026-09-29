// The station registry: every station `hyperspec check` knows about, in run order. Each entry's
// run is the pure function (spec, draft, ctx) -> { station, status, findings, reason? } that
// src/check.mjs calls; adding a station is adding one file plus one line here, which is the whole
// point of the registry existing rather than check.mjs importing each station by name itself.
//
// Build 6a shipped this in three passes (form; terms, claims, links; quotes, private, dna), and the
// order below is the final one (progress.md ruling R4), the constraints numbering:
// form, terms, claims, quotes, private, dna, links. quotes and private share ctx (util.mjs's
// markedSegments caches the spec's marked materials there), so a check run reads them once.

import * as form from "./form.mjs";
import * as terms from "./terms.mjs";
import * as claims from "./claims.mjs";
import * as quotes from "./quotes.mjs";
import * as privateStation from "./private.mjs";
import * as dna from "./dna.mjs";
import * as links from "./links.mjs";

export const STATIONS = Object.freeze([
  { name: form.name, run: form.run },
  { name: terms.name, run: terms.run },
  { name: claims.name, run: claims.run },
  { name: quotes.name, run: quotes.run },
  { name: privateStation.name, run: privateStation.run },
  { name: dna.name, run: dna.run },
  { name: links.name, run: links.run },
]);

export const STATION_NAMES = Object.freeze(STATIONS.map((s) => s.name));
