// The judge registry: every judgment station `hyperspec judge` knows about, in run order. Each
// entry carries name, instructions (fixed text for the packet), skipReason(spec),
// packet(spec, draft), validate(verdict, packet, t) and derive(verdict, packet, t); see
// src/judge.mjs for the framework that calls them. Adding a judge is one file plus one line here.

import * as doctor from "./doctor.mjs";

export const JUDGES = Object.freeze([
  { name: doctor.name, instructions: doctor.DOCTOR_INSTRUCTIONS, skipReason: doctor.skipReason, packet: doctor.packet, validate: doctor.validate, derive: doctor.derive },
]);

export const JUDGE_NAMES = Object.freeze(JUDGES.map((j) => j.name));
