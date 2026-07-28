import { execFile } from "node:child_process";
import { copyFile, mkdir, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { build } from "esbuild";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = resolve(packageRoot, "dist");
const entryPoint = resolve(packageRoot, "src/index.ts");
const packageJson = JSON.parse(
  await readFile(resolve(packageRoot, "package.json"), "utf8"),
);

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

const tscPath = require.resolve("typescript/bin/tsc");
await execFileAsync(process.execPath, [
  tscPath,
  "--project",
  resolve(packageRoot, "tsconfig.json"),
]);

const shared = {
  entryPoints: [entryPoint],
  bundle: true,
  target: ["es2018"],
  platform: "browser",
  loader: { ".css": "text" },
  legalComments: "eof",
  define: {
    __VIDEO_COMPARE_PLAYER_VERSION__: JSON.stringify(packageJson.version),
  },
};

await Promise.all([
  build({
    ...shared,
    format: "esm",
    outfile: resolve(distDir, "index.js"),
    sourcemap: true,
  }),
  build({
    ...shared,
    format: "cjs",
    outfile: resolve(distDir, "index.cjs"),
    sourcemap: true,
  }),
  build({
    ...shared,
    format: "iife",
    globalName: "VideoCompare",
    outfile: resolve(distDir, "index.global.min.js"),
    minify: true,
  }),
]);

await copyFile(
  resolve(packageRoot, "src/style.css"),
  resolve(distDir, "style.css"),
);
