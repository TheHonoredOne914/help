export const USER_SYSTEM_PROMPT_MAX_CHARS = 4_000;

export function capUserSystemPrompt(raw: string): string {
  return raw.slice(0, USER_SYSTEM_PROMPT_MAX_CHARS);
}

/** Keep the desk mode the client sent. web_search is the public name for fast research. */
export function resolveRouteMode(mode: string): string {
  if (mode === "web_search") return "fast_research";
  return mode;
}
