import type { TelegramUi } from "@/lib/telegram-ui";
import { envGet } from "./env-get";
import { siteProfile } from "./profile";

export type TelegramMode = TelegramUi;

/** OIDC when BotFather issued a client id and secret. Legacy widget when the bot token and public username are set. */
export function telegramMode(): TelegramMode {
  if (siteProfile() === "isolated" && envGet("VPN_MODE") === "double" && envGet("ORASAKA_DOUBLE_SECRET")) return { kind: "double" };
  const clientId = envGet("TELEGRAM_LOGIN_CLIENT_ID");
  const clientSecret = envGet("TELEGRAM_LOGIN_CLIENT_SECRET");
  if (clientId && clientSecret && /^\d{1,20}$/.test(clientId)) return { kind: "oidc", clientId };
  const token = envGet("TELEGRAM_BOT_TOKEN");
  const username = envGet("TELEGRAM_BOT_USERNAME");
  if (token && username && /^[A-Za-z0-9_]{5,32}$/.test(username)) return { kind: "widget", botUsername: username };
  return { kind: "off" };
}

export function oidcConfigured(): { clientId: string; clientSecret: string } | null {
  const clientId = envGet("TELEGRAM_LOGIN_CLIENT_ID");
  const clientSecret = envGet("TELEGRAM_LOGIN_CLIENT_SECRET");
  if (!clientId || !clientSecret || !/^\d{1,20}$/.test(clientId)) return null;
  return { clientId, clientSecret };
}
