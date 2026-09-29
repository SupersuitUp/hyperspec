// The example factory: two inputs, three stages, and a recipe written beside the output.
// Run it with `node factory.mjs`. It writes essay.md and essay.md.recipe.json next to itself.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { startRecipe } from "@supersuit/hyperspec/recipe";
import { claims, draft, terms, verdict } from "./stages.mjs";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const read = (p) => readFileSync(here(p), "utf8");

const recipe = startRecipe({
  output: here("essay.md"),
  factory: { name: "example-essay", version: "1.0.0" },
  spec: here("essay.hyperspec.md"),
  clicker: "you",
});
recipe.input("call", here("materials/call.md"));
recipe.input("notes", here("materials/notes.md"));

const c = claims([read("materials/call.md")]);
recipe.stage({ id: "claims", reads: ["input:call"], output: c, verdict: verdict("claims", c) });
const t = terms([read("materials/notes.md")]);
recipe.stage({ id: "terms", reads: ["input:notes"], output: t, verdict: verdict("terms", t) });
const d = draft(c, t);
recipe.stage({ id: "draft", reads: ["stage:claims", "stage:terms"], output: d, verdict: verdict("draft", d) });

const { findings } = recipe.finish();
console.log("wrote essay.md and essay.md.recipe.json");
for (const f of findings) console.log(`${f.severity} [${f.field}] ${f.message}`);
