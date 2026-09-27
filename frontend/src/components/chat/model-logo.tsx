import type { ReactNode } from "react";
import type { IconType } from "react-icons";
import {
  SiAlibabacloud,
  SiAnthropic,
  SiGithub,
  SiGooglegemini,
  SiMeta,
  SiMistralai,
  SiNvidia,
  SiOllama,
  SiOpenai,
} from "react-icons/si";
import { cn } from "@/lib/utils";
import { resolveModelBrandKey, type ModelBrandKey } from "./provider-model-display";

const SI_BRANDS: Partial<Record<ModelBrandKey, { Icon: IconType; color: string; label: string }>> = {
  openai: { Icon: SiOpenai, color: "#000000", label: "OpenAI" },
  anthropic: { Icon: SiAnthropic, color: "#191919", label: "Anthropic" },
  gemini: { Icon: SiGooglegemini, color: "#8E75B2", label: "Gemini" },
  meta: { Icon: SiMeta, color: "#0668E1", label: "Meta" },
  mistral: { Icon: SiMistralai, color: "#FA520F", label: "Mistral AI" },
  qwen: { Icon: SiAlibabacloud, color: "#FF6A00", label: "Qwen" },
  nvidia: { Icon: SiNvidia, color: "#76B900", label: "NVIDIA" },
  ollama: { Icon: SiOllama, color: "#000000", label: "Ollama" },
  github: { Icon: SiGithub, color: "#181717", label: "GitHub" },
};

function SvgMark({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <svg viewBox="0 0 24 24" className={className} role="img" aria-label={label}>
      <title>{label}</title>
      {children}
    </svg>
  );
}

function GroqMark({ className }: { className?: string }) {
  return (
    <SvgMark label="Groq" className={className}>
      <rect width="24" height="24" rx="6" fill="#F55036" />
      <path
        fill="#fff"
        d="M8.2 7.1h5.4c2.6 0 4.3 1.6 4.3 4.1 0 1.7-.8 3-2.1 3.7l2.4 3.1h-2.6l-2.1-2.8H10.4v2.8H8.2V7.1zm2.2 1.8v3.4h3.1c1.3 0 2.1-.7 2.1-1.7s-.8-1.7-2.1-1.7H10.4z"
      />
    </SvgMark>
  );
}

function DeepSeekMark({ className }: { className?: string }) {
  return (
    <SvgMark label="DeepSeek" className={className}>
      <path
        fill="#4D6BFE"
        d="M20.7 11.2c-.5-4.6-4.4-8.2-9.1-8.2-5.1 0-9.3 4.2-9.3 9.3 0 3.4 1.8 6.4 4.6 8.1-.4-.8-.6-1.6-.6-2.5 0-3.6 2.9-6.5 6.5-6.5.5 0 1 .1 1.4.2 1.4-2.5 3.9-4.2 6.8-4.6.2.7.3 1.5.3 2.3 0 .7-.1 1.3-.2 1.9h-.4zm-2.4 1.6c-2.6 0-4.8 1.9-5.3 4.3h-.2c-2.6 0-4.8-2.1-4.8-4.8S8.1 7.5 10.8 7.5c.9 0 1.7.2 2.4.6 1.1-1.6 2.9-2.7 5-2.7.4 1.5.2 3.1-.5 4.5-.4-.2-.9-.3-1.4-.3z"
      />
    </SvgMark>
  );
}

function CerebrasMark({ className }: { className?: string }) {
  return (
    <SvgMark label="Cerebras" className={className}>
      <path
        fill="#F15A29"
        d="M12 1.5C6.2 1.5 1.5 6.2 1.5 12S6.2 22.5 12 22.5 22.5 17.8 22.5 12 17.8 1.5 12 1.5zm0 3.2c4.1 0 7.3 3.2 7.3 7.3S16.1 19.3 12 19.3c-2.2 0-4.1-.9-5.5-2.4l2.3-2.1c.8.9 2 1.5 3.2 1.5 2.3 0 4.1-1.8 4.1-4.1S14.3 7.9 12 7.9c-1.3 0-2.4.6-3.2 1.5L6.5 7.3C7.9 5.8 9.8 4.7 12 4.7z"
      />
    </SvgMark>
  );
}

function OpenRouterMark({ className }: { className?: string }) {
  return (
    <SvgMark label="OpenRouter" className={className}>
      <path
        fill="#6566F1"
        d="M3.2 12 12 3.2 20.8 12 12 20.8 3.2 12zm8.8-5.2L6.8 12 12 17.2 17.2 12 12 6.8z"
      />
      <circle cx="12" cy="12" r="2.1" fill="#6566F1" />
    </SvgMark>
  );
}

function MoonshotMark({ className }: { className?: string }) {
  return (
    <SvgMark label="Moonshot" className={className}>
      <path
        fill="#1A1A1A"
        d="M13.2 3.1a9 9 0 1 0 7.6 14.6 7.2 7.2 0 0 1-7.6-14.6z"
      />
    </SvgMark>
  );
}

function MicrosoftMark({ className }: { className?: string }) {
  return (
    <SvgMark label="Microsoft" className={className}>
      <rect x="2" y="2" width="9.2" height="9.2" fill="#F25022" />
      <rect x="12.8" y="2" width="9.2" height="9.2" fill="#7FBA00" />
      <rect x="2" y="12.8" width="9.2" height="9.2" fill="#00A4EF" />
      <rect x="12.8" y="12.8" width="9.2" height="9.2" fill="#FFB900" />
    </SvgMark>
  );
}

function GenericMark({ className }: { className?: string }) {
  return (
    <SvgMark label="Model" className={className}>
      <circle cx="12" cy="6.5" r="2.2" fill="#334155" />
      <circle cx="6.8" cy="16.2" r="2.2" fill="#334155" />
      <circle cx="17.2" cy="16.2" r="2.2" fill="#334155" />
      <path d="M12 8.7v3.2M12 11.9 8.4 14.6M12 11.9l3.6 2.7" stroke="#334155" strokeWidth="1.6" fill="none" />
    </SvgMark>
  );
}

function OpenCodeMark({ className }: { className?: string }) {
  return (
    <SvgMark label="OpenCode" className={className}>
      <rect width="24" height="24" rx="6" fill="#111827" />
      <circle cx="12" cy="12" r="6.2" fill="none" stroke="#F4E7C5" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="2.2" fill="#F4E7C5" />
    </SvgMark>
  );
}

function BrandGlyph({ brand, className }: { brand: ModelBrandKey; className?: string }) {
  const si = SI_BRANDS[brand];
  if (si) {
    return <si.Icon className={className} color={si.color} title={si.label} aria-label={si.label} />;
  }
  if (brand === "groq") return <GroqMark className={className} />;
  if (brand === "deepseek") return <DeepSeekMark className={className} />;
  if (brand === "cerebras") return <CerebrasMark className={className} />;
  if (brand === "openrouter") return <OpenRouterMark className={className} />;
  if (brand === "opencode") return <OpenCodeMark className={className} />;
  if (brand === "moonshot") return <MoonshotMark className={className} />;
  if (brand === "microsoft") return <MicrosoftMark className={className} />;
  return <GenericMark className={className} />;
}

interface ModelLogoProps {
  id?: string;
  provider?: string;
  className?: string;
}

export function ModelLogo({ id, provider, className }: ModelLogoProps) {
  const brand = resolveModelBrandKey(id, provider);
  return (
    <span
      className={cn(
        "inline-flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white p-[3px] ring-1 ring-black/10",
        className,
      )}
      data-testid="model-logo"
      data-model-brand={brand}
      aria-hidden={false}
    >
      <BrandGlyph brand={brand} className="h-full w-full" />
    </span>
  );
}
