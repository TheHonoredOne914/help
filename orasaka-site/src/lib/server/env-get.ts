/** Dynamic lookup so Next does not inline the value at build time. */
export function envGet(name: string): string | undefined {
  const value = process.env[name];
  return value ? value : undefined;
}
