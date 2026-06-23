import { cpSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { join, dirname } from "path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules/@coderline/alphatab/dist");

mkdirSync(join(root, "public/alphatab"), { recursive: true });
cpSync(join(src, "alphaTab.worker.mjs"), join(root, "public/alphatab/alphaTab.worker.mjs"));
// O worker faz `import "./alphaTab.core.mjs"` — precisa estar na mesma pasta, senão 404 silencioso.
cpSync(join(src, "alphaTab.core.mjs"), join(root, "public/alphatab/alphaTab.core.mjs"));

mkdirSync(join(root, "public/font"), { recursive: true });
cpSync(join(src, "font"), join(root, "public/font"), { recursive: true });

console.log("AlphaTab assets copied to public/");
