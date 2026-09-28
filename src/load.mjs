import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseSkillFile } from "@supersuit/superskill/yaml";

export function loadSpec(path) {
  const abs = resolve(path);
  let text;
  try { text = readFileSync(abs, "utf8"); } catch { return { path: abs, dir: dirname(abs), data: {}, body: "", error: `cannot read ${path}` }; }
  const { data, body, error } = parseSkillFile(text);
  if (error) return { path: abs, dir: dirname(abs), data: {}, body, error };
  if (!("hyperspec" in data)) return { path: abs, dir: dirname(abs), data, body, error: "not a hyperspec" };
  return { path: abs, dir: dirname(abs), data, body };
}
