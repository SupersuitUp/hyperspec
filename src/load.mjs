import { readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseSkillFile } from "@supersuit/superskill/yaml";
import { sha256 } from "./hash.mjs";
import { str } from "./placeholder.mjs";
import { isForm, mergeForm, rebase } from "./form-spec.mjs";

// One spec file, read and parsed, nothing merged into it.
function readSpec(abs, given) {
  let buf;
  try { buf = readFileSync(abs); } catch { return { path: abs, dir: dirname(abs), data: {}, body: "", error: `cannot read ${given}` }; }
  const { data, body, error } = parseSkillFile(buf.toString("utf8"));
  if (error) return { path: abs, dir: dirname(abs), data: {}, body, error, bytes: buf };
  if (!("hyperspec" in data)) return { path: abs, dir: dirname(abs), data, body, error: "not a hyperspec", bytes: buf };
  return { path: abs, dir: dirname(abs), data, body, bytes: buf };
}

const strip = ({ bytes, ...spec }) => spec;

export function loadSpec(path) {
  const spec = readSpec(resolve(path), path);
  if (spec.error || !("form" in spec.data)) return strip(spec);
  return withForm(strip(spec));
}

// A spec that names a form (form: <path>, src/form-spec.mjs), merged with it: data becomes the
// merged data, form is { path, sha256, spec } (the form as the spec names it, the hash of its
// bytes, and the form loaded on its own, which rules.mjs lints), and formFindings holds what lint
// reports about the form: one of form-missing, form-unreadable, form-not-a-form and form-nested
// when the form cannot be used (nothing is merged then, except under form-nested, where the form
// itself still merges and its own form is ignored), and every form-contradiction and
// form-id-collision the merge found. All report under test 1: the form holds this spec's
// decisions, so a form that cannot be read leaves them unaccounted for.
function withForm(spec) {
  const decl = spec.data.form;
  const formFindings = [];
  const out = { ...spec, formFindings };
  const f = (id, message, fix) => formFindings.push({ test: 1, id, severity: "fail", message, fix });
  if (!str(decl)) {
    f("form-missing", `form: is ${typeof decl === "string" ? `"${decl.trim()}", ` : ""}not a path to a form spec`, "Set form: to the form spec this work builds on, relative to this spec, or delete it.");
    return out;
  }
  if (isForm(spec.data)) {
    f("form-nested", "this spec is a form, and names a form of its own; a form builds on nothing", "Copy what this form needs from the other into it, and delete form:.");
    return out;
  }
  const shown = decl.trim();
  const abs = resolve(spec.dir, shown);
  let isFile = false;
  try { isFile = statSync(abs).isFile(); } catch { /* reported below */ }
  const form = isFile ? readSpec(abs, shown) : null;
  if (!form || form.error === `cannot read ${shown}`) {
    f("form-missing", `form "${shown}" does not exist or is not a file`, "Point form: at the form spec, relative to this spec.");
    return out;
  }
  if (form.error) {
    f("form-unreadable", `form "${shown}" cannot be read as a hyperspec (${form.error})`, "Fix the form's frontmatter, or point form: at a form spec.");
    return out;
  }
  if (!isForm(form.data)) {
    f("form-not-a-form", `form "${shown}" is kind "${str(form.data.kind) || "(none)"}", not form`, "Point form: at a spec whose kind is form, or set kind: form in that file if it is one.");
    return out;
  }
  if ("form" in form.data) f("form-nested", `form "${shown}" names a form of its own; one level only, so that one is ignored`, `Copy what ${shown} needs from the form it names into it, and delete its form:.`);
  const formSpec = "form" in form.data ? withForm(strip(form)) : strip(form);
  const merged = mergeForm(rebase(form.data, form.dir, spec.dir), spec.data, { formPath: shown });
  formFindings.push(...merged.findings);
  return { ...out, data: merged.data, form: { path: shown, sha256: sha256(form.bytes), spec: formSpec } };
}
