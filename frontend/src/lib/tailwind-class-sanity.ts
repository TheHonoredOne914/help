import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/** Known corruption shapes from the shadcn → var(--token) token migration. */
export const MALFORMED_TAILWIND_PATTERNS: ReadonlyArray<{
  id: string;
  description: string;
  re: RegExp;
}> = [
  {
    id: "color-mix-trailing-digit",
    description: "Stray digit glued after a color-mix arbitrary value closing bracket (e.g. `)]0`)",
    re: /\[color-mix\([^\]]+\)\]\d/,
  },
  {
    id: "var-shadcn-suffix",
    description: "Shadcn token fragment glued after a var(--*) arbitrary value (e.g. `]-foreground`)",
    re: /\[var\(--[^)]+\)\]-(?:foreground|background|border|muted|accent|primary|secondary|destructive|card|popover|input|ring|sidebar)/,
  },
  {
    id: "color-mix-shadcn-suffix",
    description: "Shadcn token fragment glued after a color-mix arbitrary value",
    re: /\[color-mix\([^\]]+\)\]-(?:foreground|background|border|muted|accent|primary|secondary|destructive|card|popover|input|ring|sidebar)/,
  },
  {
    id: "var-trailing-alnum",
    description: "Identifier or digit immediately after var(--*) `]` without a valid `/opacity` modifier",
    re: /\[var\(--[^)]+\)\][a-zA-Z0-9]/,
  },
  {
    id: "color-mix-trailing-alnum",
    description: "Identifier or digit immediately after color-mix `]` without a valid `/opacity` modifier",
    re: /\[color-mix\([^\]]+\)\][a-zA-Z0-9]/,
  },
  {
    id: "color-mix-unescaped-space",
    description: "Unescaped space in Tailwind color-mix arbitrary value (use `in_srgb`, not `in srgb`)",
    re: /\[color-mix\(in srgb/,
  },
];

export interface MalformedTailwindMatch {
  file: string;
  line: number;
  patternId: string;
  excerpt: string;
}

export function scanSourceForMalformedTailwindClasses(
  rootDir: string,
  options?: { extensions?: readonly string[] },
): MalformedTailwindMatch[] {
  const extensions = options?.extensions ?? [".ts", ".tsx"];
  const matches: MalformedTailwindMatch[] = [];

  for (const filePath of collectSourceFiles(rootDir, extensions)) {
    const rel = relative(rootDir, filePath).replace(/\\/g, "/");
    const content = readFileSync(filePath, "utf8");
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of MALFORMED_TAILWIND_PATTERNS) {
        if (!pattern.re.test(line)) continue;
        pattern.re.lastIndex = 0;
        matches.push({
          file: rel,
          line: i + 1,
          patternId: pattern.id,
          excerpt: line.trim().slice(0, 160),
        });
      }
    }
  }

  return matches;
}

function collectSourceFiles(dir: string, extensions: readonly string[]): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === "dist") continue;
      files.push(...collectSourceFiles(path, extensions));
      continue;
    }
    if (extensions.some((ext) => entry.endsWith(ext))) {
      files.push(path);
    }
  }
  return files;
}
