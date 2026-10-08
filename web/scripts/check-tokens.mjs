import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/* DESIGN.md 20.1.4: no raw colours or off-scale spacing in component styles.
   Tokens live in src/app/globals.css; everything else must reference them. */

const ROOT = new URL("../src", import.meta.url).pathname;
const ALLOWED = new Set(["0", "0.5", "1", "2", "3", "4", "5", "6", "8", "12", "16"]);
const SPACING_RE =
  /(?:^|[\s"'`])((?:p|m|gap|space|inset|top|bottom|left|right|my|mx|mt|mb|ml|mr|pt|pb|pl|pr|px|py)-(\d+(?:\.\d+)?))/g;
const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;
const FN_RE = /\b(?:rgb|rgba|hsl|hsla)\(/g;

let failures = 0;

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      walk(path);
      continue;
    }
    if (!/\.(tsx?|css)$/.test(entry)) continue;
    const text = readFileSync(path, "utf8");
    const rel = path.slice(ROOT.length + 1);
    if (rel !== "app/globals.css") {
      for (const m of text.matchAll(HEX_RE)) {
        console.error(`${rel}: raw colour ${m[0]}`);
        failures++;
      }
      if (FN_RE.test(text)) {
        console.error(`${rel}: raw colour function (rgb/hsl)`);
        failures++;
      }
    }
    if (/\.tsx$/.test(entry)) {
      for (const m of text.matchAll(SPACING_RE)) {
        if (!ALLOWED.has(m[2])) {
          console.error(`${rel}: off-scale spacing ${m[1]}`);
          failures++;
        }
      }
    }
  }
}

walk(ROOT);
if (failures) {
  console.error(`\n${failures} token violation(s). See docs/DESIGN.md section 4.`);
  process.exit(1);
}
console.log("Token check passed: no raw colours, all spacing on scale.");
