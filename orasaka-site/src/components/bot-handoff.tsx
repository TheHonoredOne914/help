import type { Metadata } from "next";
import { Container, ExternalButton, PageHeader } from "@/components/ui";
import { brand } from "@/config/brand";
import { getServerEnv } from "@/lib/server/env";

/** Title follows the build mode. Public must not keep a DEMO or “payment confirmed” label. */
export function pageTitle(publicTitle: string, other: string): Metadata {
  return { title: getServerEnv().siteMode === "public" ? publicTitle : other };
}

/** Public replacement for a demo page: the action is a real link to the bot, not a redirect of an API. */
export function BotHandoff({
  eyebrow,
  title,
  lead,
  action,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  action: string;
}) {
  return (
    <>
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        lead={lead}
      />
      <Container className="py-14">
        <ExternalButton href={brand.telegramBot.url}>{action}</ExternalButton>
      </Container>
    </>
  );
}
