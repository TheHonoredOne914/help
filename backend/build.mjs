import { spawn } from "node:child_process";
import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(artifactDir, "dist");

async function run(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn([command, ...args].join(" "), {
      cwd: artifactDir,
      stdio: "inherit",
      shell: true,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

async function buildAll() {
  await rm(distDir, { recursive: true, force: true });
  const tsc = process.platform === "win32" ? "npx.cmd" : "npx";
  await run(tsc, ["tsc", "-p", "tsconfig.json"]);
  await writeFile(
    path.join(distDir, "index.mjs"),
    [
      "import { createRequire } from 'node:module';",
      "globalThis.require = createRequire(import.meta.url);",
      "await import('./index.js');",
      "",
    ].join("\n"),
  );
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
