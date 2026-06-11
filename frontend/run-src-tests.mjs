import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const testFiles = collectTests(join(process.cwd(), "src"))
  .map((file) => `./${relative(process.cwd(), file).replace(/\\/g, "/")}`)
  .sort();

if (testFiles.length === 0) {
  console.error("No source tests found under frontend/src");
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  ["--import", "../backend/node_modules/tsx/dist/loader.mjs", "--test", ...testFiles],
  { stdio: "inherit", cwd: process.cwd() },
);

process.exit(result.status ?? 1);

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
    if (/\.test\.tsx?$/.test(entry)) {
      files.push(path);
    }
  }
  return files;
}
