// The station registry: every station `hyperspec check` knows about, in run order. Each entry's
// run is the pure function (spec, draft, ctx) -> { station, status, findings, reason? } that
// src/check.mjs calls; adding a station is adding one file plus one line here, which is the whole
// point of the registry existing rather than check.mjs importing each station by name itself.
//
// Build 6a ships this in three passes: form here in task 1; terms, claims, links in task 2;
// quotes, private, dna in task 3. The array below grows by one entry per task; nothing about
// check.mjs or the CLI needs to change when it does.

import * as form from "./form.mjs";
import * as terms from "./terms.mjs";
import * as claims from "./claims.mjs";
import * as links from "./links.mjs";

export const STATIONS = Object.freeze([
  { name: form.name, run: form.run },
  { name: terms.name, run: terms.run },
  { name: claims.name, run: claims.run },
  { name: links.name, run: links.run },
]);

export const STATION_NAMES = Object.freeze(STATIONS.map((s) => s.name));
