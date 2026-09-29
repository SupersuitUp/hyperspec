// The station registry: every station `hyperspec check` knows about, in run order. Each entry's
// run is the pure function (spec, draft, ctx) -> { station, status, findings, reason? } that
// src/check.mjs calls; adding a station is adding one file plus one line here, which is the whole
// point of the registry existing rather than check.mjs importing each station by name itself.
//
// Build 6a ships this in three passes: form here in task 1; terms, claims, links in task 2;
// quotes, private, dna in task 3. The FINAL order (progress.md ruling R4) is the constraints
// numbering, form/terms/claims/quotes/private/dna/links, so `links` belongs LAST, not where task
// 2's own task split (terms, claims, links) would put it. Task 2 ships before task 3 exists,
// so `links` is temporarily the last entry below; TASK 3 MUST INSERT quotes/private/dna BETWEEN
// claims AND links, not after links, to land on the final order. This is a note for whoever lands
// task 3, not a decision made here.

import * as form from "./form.mjs";
import * as terms from "./terms.mjs";
import * as claims from "./claims.mjs";
import * as links from "./links.mjs";

export const STATIONS = Object.freeze([
  { name: form.name, run: form.run },
  { name: terms.name, run: terms.run },
  { name: claims.name, run: claims.run },
  // TASK 3: quotes, private, dna go here, between claims and links (see the header comment).
  { name: links.name, run: links.run },
]);

export const STATION_NAMES = Object.freeze(STATIONS.map((s) => s.name));
