/** Provider chip background for model keys in pipeline UI. */
export function providerChipColor(key: string): string {
  const provider = key.includes("/") ? key.split("/")[0] : key.split("-")[0] ?? key;
  switch (provider) {
    case "nvidia":
      return "bg-[var(--status-success)] text-white";
    case "gemini":
      return "bg-[var(--navy)] text-white";
    case "ollama":
      return "bg-amber-600 text-white";
    case "openrouter":
    case "github":
    case "opencode":
      return "bg-[var(--slate)] text-white";
    default:
      return "bg-[var(--navy)] text-white";
  }
}

/** Tailwind bg class for live pipeline model chips. */
export function providerBgClass(key: string): string {
  const provider = key.split("/")[0];
  const colorMap: Record<string, string> = {
    nvidia: "bg-[var(--navy)]",
    gemini: "bg-[var(--navy)]",
    ollama: "bg-slate-500",
    openrouter: "bg-slate-500",
    opencode: "bg-slate-800",
  };
  return colorMap[provider] ?? "bg-[var(--navy)]";
}
