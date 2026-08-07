import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pagesDir = resolve(packageRoot, "pages");
const distDir = resolve(packageRoot, "dist");
const examplesDir = resolve(packageRoot, "examples");

await rm(pagesDir, { recursive: true, force: true });
await mkdir(pagesDir, { recursive: true });
await cp(distDir, resolve(pagesDir, "dist"), { recursive: true });

for (const fileName of ["index.html", "custom-element.html"]) {
  const source = await readFile(resolve(examplesDir, fileName), "utf8");
  const rewritten = source.replaceAll("../dist/index.global.js", "./dist/index.global.min.js").replaceAll("../dist/", "./dist/");
  await writeFile(resolve(pagesDir, fileName), rewritten);
}

await writeFile(resolve(pagesDir, ".nojekyll"), "");
