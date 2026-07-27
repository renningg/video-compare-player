import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const esm = await import(resolve(packageRoot, "dist/index.js"));
const require = createRequire(import.meta.url);
const cjs = require(resolve(packageRoot, "dist/index.cjs"));

test("ESM and CommonJS expose the same public surface", () => {
  assert.equal(esm.VERSION, "0.1.0");
  assert.equal(cjs.VERSION, esm.VERSION);
  for (const name of [
    "VideoComparePlayer",
    "createVideoComparePlayer",
    "VideoPairSynchronizer",
    "createVideoSyncController",
    "VideoComparePlayerElement",
    "defineVideoComparePlayerElement",
    "DEFAULT_STYLES",
  ]) {
    assert.equal(typeof esm[name], typeof cjs[name], name);
  }
});

test("browser bundle creates the VideoCompare global without a DOM", async () => {
  const source = await readFile(
    resolve(packageRoot, "dist/index.global.js"),
    "utf8",
  );
  const context = vm.createContext({
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  });
  vm.runInContext(source, context);
  assert.equal(context.VideoCompare.VERSION, "0.1.0");
  assert.equal(
    typeof context.VideoCompare.createVideoComparePlayer,
    "function",
  );
  assert.equal(
    typeof context.VideoCompare.defineVideoComparePlayerElement,
    "function",
  );
});

test("published package has no runtime or peer dependencies", async () => {
  const packageJson = JSON.parse(
    await readFile(resolve(packageRoot, "package.json"), "utf8"),
  );
  assert.equal(packageJson.dependencies, undefined);
  assert.equal(packageJson.peerDependencies, undefined);
  assert.deepEqual(packageJson.sideEffects, ["./dist/style.css"]);
});
