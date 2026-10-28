import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Lets `node --experimental-strip-types` import extensionless TypeScript. */
export async function resolve(specifier, context, next) {
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const url = new URL(specifier, context.parentURL);
    const file = fileURLToPath(url);
    if (!existsSync(file) && existsSync(`${file}.ts`)) return next(`${specifier}.ts`, context);
  }
  return next(specifier, context);
}
