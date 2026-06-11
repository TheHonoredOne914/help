import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const testRoot = join(root, "tests");
const allTests = collectTests(testRoot)
  .map((file) => `./${relative(root, file).replace(/\\/g, "/")}`)
  .sort();

const nodeTests = [];
const vitestTests = [];

for (const file of allTests) {
  const source = readFileSync(join(root, file), "utf8");
  if (/\bfrom\s+["']vitest["']/.test(source)) {
    vitestTests.push(file);
  } else {
    nodeTests.push(file);
  }
}

if (nodeTests.length === 0 && vitestTests.length === 0) {
  console.error("No backend tests found under backend/tests");
  process.exit(1);
}

if (nodeTests.length > 0) {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--test", "--test-concurrency=1", ...nodeTests],
    { stdio: "inherit", cwd: root },
  );
  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (vitestTests.length > 0) {
  const result = spawnSync(
    process.execPath,
    ["./node_modules/vitest/vitest.mjs", "run", ...vitestTests],
    { stdio: "inherit", cwd: root },
  );
  process.exit(result.status ?? 1);
}

process.exit(0);

function collectTests(dir) {
  const entries = readdirSync(dir);
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...collectTests(path));
      continue;
    }
    if (/\.test\.ts$/.test(entry)) {
      files.push(path);
    }
  }
  return files;
}
