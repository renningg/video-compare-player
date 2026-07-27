import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { homedir, tmpdir } from "node:os";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const chromeCandidates = [
  process.env.CHROME_BIN,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  resolve(
    homedir(),
    "Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ),
  "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
].filter(Boolean);

const findChrome = async () => {
  for (const candidate of chromeCandidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Try the next explicit or conventional Chrome path.
    }
  }
  return undefined;
};

const chrome = await findChrome();
if (!chrome) {
  console.log(
    "SKIP browser fixture: Chrome was not found. Set CHROME_BIN or install Google Chrome in /Applications.",
  );
  process.exit(0);
}

try {
  await stat(resolve(packageRoot, "dist/index.js"));
  await stat(resolve(packageRoot, "dist/style.css"));
} catch {
  console.error("Browser fixture requires dist/. Run `npm run build` first.");
  process.exit(1);
}

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
]);

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    const pathname = decodeURIComponent(url.pathname);
    const relativePath =
      pathname === "/" ? "tests/browser/fixture.html" : pathname.slice(1);
    const filePath = resolve(packageRoot, relativePath);
    if (
      filePath !== packageRoot &&
      !filePath.startsWith(`${packageRoot}${sep}`)
    ) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    const body = await readFile(filePath);
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type":
        contentTypes.get(extname(filePath)) || "application/octet-stream",
    });
    response.end(body);
  } catch {
    response.writeHead(404).end("Not found");
  }
});

await new Promise((resolvePromise, rejectPromise) => {
  server.once("error", rejectPromise);
  server.listen(0, "127.0.0.1", resolvePromise);
});

const address = server.address();
if (!address || typeof address === "string") {
  server.close();
  throw new Error("Unable to determine the browser fixture server port.");
}

const profileDir = await mkdtemp(resolve(tmpdir(), "vcp-browser-test-"));
const fixtureUrl = `http://127.0.0.1:${address.port}/tests/browser/fixture.html`;

try {
  const { stdout, stderr } = await execFileAsync(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-default-apps",
      "--no-first-run",
      "--no-default-browser-check",
      "--autoplay-policy=no-user-gesture-required",
      `--user-data-dir=${profileDir}`,
      "--virtual-time-budget=5000",
      "--dump-dom",
      fixtureUrl,
    ],
    { timeout: 45_000, maxBuffer: 20 * 1024 * 1024 },
  );

  if (!stdout.includes('data-vcp-test-status="passed"')) {
    console.error("Browser fixture failed or did not finish.");
    if (stderr.trim()) console.error(stderr.trim());
    console.error(stdout);
    process.exitCode = 1;
  } else {
    console.log(`PASS browser fixture (${chrome})`);
  }
} catch (error) {
  console.error("Browser fixture launcher failed.");
  console.error(
    error instanceof Error ? error.stack || error.message : String(error),
  );
  process.exitCode = 1;
} finally {
  await new Promise((resolvePromise) => server.close(resolvePromise));
  await rm(profileDir, { recursive: true, force: true });
}
