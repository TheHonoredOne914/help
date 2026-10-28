export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function firstParam(value: string | string[] | undefined) {
  const v = Array.isArray(value) ? value[0] : value;
  return v && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : null;
}
