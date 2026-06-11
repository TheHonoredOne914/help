#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const outputZip = path.join(projectRoot, "bestdel-dev-migration-pack.zip");
const stageRoot = path.join(projectRoot, "_bestdel_dev_migration_stage");
const stagedProject = path.join(stageRoot, "bestdel_fixed");

const excludedDirNames = new Set([
  "node_modules",
  ".npm-cache",
  "dist",
  "build",
  ".next",
  "coverage",
  ".turbo",
  ".cache",
  "cache",
  "caches",
  ".vite",
  ".parcel-cache",
  ".pytest_cache",
  ".svelte-kit",
  ".git",
  ".idea",
  ".vscode",
  "logs",
  "tmp",
  "temp",
  "__pycache__",
  "_bestdel_dev_migration_stage",
]);

const excludedFileNames = new Set([
  ".env",
  "bestdel-dev-migration-pack.zip",
  ".DS_Store",
  "Thumbs.db",
  "desktop.ini",
]);

const excludedExtensions = new Set([
  ".zip",
  ".tar",
  ".gz",
  ".rar",
  ".7z",
  ".log",
  ".db",
  ".sqlite",
]);

function shouldExclude(srcPath) {
  const name = path.basename(srcPath);
  const lowerName = name.toLowerCase();
  const relativePath = path.relative(projectRoot, srcPath).replace(/\\/g, "/").toLowerCase();
  if (excludedDirNames.has(name) || excludedDirNames.has(lowerName)) return true;
  if (lowerName.startsWith(".chrome-") || lowerName === ".blackbox" || lowerName === ".superpowers") return true;
  if (lowerName.startsWith("node_modules.partial_")) return true;
  if (excludedFileNames.has(name) || excludedFileNames.has(lowerName)) return true;
  if (/^backend\/data\/.*\.(db|sqlite|db-shm|db-wal)$/i.test(relativePath)) return true;
  if (lowerName.endsWith(".db-shm") || lowerName.endsWith(".db-wal")) return true;
  if (lowerName.endsWith(".tmp") || lowerName.endsWith(".temp")) return true;
  if (lowerName.endsWith(".tsbuildinfo")) return true;
  if (lowerName.startsWith("--exclude=")) return true;
  if (excludedExtensions.has(path.extname(lowerName))) return true;
  return false;
}

const excludedPaths = [];

function copyFiltered(src, dest) {
  if (shouldExclude(src)) {
    excludedPaths.push(path.relative(projectRoot, src) || ".");
    return;
  }
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyFiltered(path.join(src, entry), path.join(dest, entry));
    }
    return;
  }
  if (stat.isFile()) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function directorySizeBytes(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) total += directorySizeBytes(entryPath);
    if (entry.isFile()) total += fs.statSync(entryPath).size;
  }
  return total;
}

function countFiles(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) total += countFiles(entryPath);
    if (entry.isFile()) total += 1;
  }
  return total;
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd ?? process.cwd(),
    encoding: "utf8",
    stdio: options.stdio ?? "pipe",
    shell: false,
  });
}

function zipWithPowerShell() {
  const command = os.platform() === "win32" ? "powershell.exe" : "pwsh";
  const script = [
    "$ErrorActionPreference = 'Stop'",
    `Compress-Archive -Path ${JSON.stringify(path.join(stageRoot, "bestdel_fixed"))} -DestinationPath ${JSON.stringify(outputZip)} -Force`,
  ].join("; ");
  return run(command, ["-NoProfile", "-Command", script]);
}

function zipWithTar() {
  return run("tar", ["-a", "-c", "-f", outputZip, "-C", stageRoot, "bestdel_fixed"]);
}

function zipWithZipCli() {
  return run("zip", ["-r", outputZip, "bestdel_fixed"], { cwd: stageRoot, stdio: "inherit" });
}

const dryRun = process.argv.includes("--dry-run");

fs.rmSync(stageRoot, { recursive: true, force: true });
fs.rmSync(outputZip, { force: true });
fs.mkdirSync(stageRoot, { recursive: true });

copyFiltered(projectRoot, stagedProject);

const fileCount = countFiles(stagedProject);
const sizeBytes = directorySizeBytes(stagedProject);

if (dryRun) {
  console.log(JSON.stringify({
    dryRun: true,
    outputZip,
    fileCount,
    stagedSizeBytes: sizeBytes,
    excludedPaths: excludedPaths.slice(0, 200),
    excludedPathCount: excludedPaths.length,
  }, null, 2));
  fs.rmSync(stageRoot, { recursive: true, force: true });
  process.exit(0);
}

let zipResult = zipWithPowerShell();
if (zipResult.status !== 0) {
  zipResult = zipWithTar();
}
if (zipResult.status !== 0 && os.platform() !== "win32") {
  zipResult = zipWithZipCli();
}
if (zipResult.status !== 0) {
  console.error(zipResult.stderr || zipResult.stdout || "Failed to create zip archive.");
  process.exit(zipResult.status ?? 1);
}

const archiveSize = fs.statSync(outputZip).size;
if (archiveSize <= 0) {
  console.error("Created archive is empty.");
  process.exit(1);
}
fs.rmSync(stageRoot, { recursive: true, force: true });

console.log(JSON.stringify({
  outputZip,
  fileCount,
  stagedSizeBytes: sizeBytes,
  archiveSizeBytes: archiveSize,
  excludedPathCount: excludedPaths.length,
}, null, 2));
