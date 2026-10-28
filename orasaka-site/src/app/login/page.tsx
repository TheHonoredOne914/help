import { Suspense } from "react";
import { LoginScreen } from "@/components/login-screen";
import { envGet } from "@/lib/server/env-get";
import { getServerEnv } from "@/lib/server/env";
import { siteProfile } from "@/lib/server/profile";
import { telegramMode } from "@/lib/server/telegram-mode";
import type { TelegramUi } from "@/lib/telegram-ui";
import { connection } from "next/server";

export const metadata = { title: "Вход" };

async function LoginBody() {
  await connection();
  const publicSite = getServerEnv().siteMode === "public";
  const telegram: TelegramUi = publicSite ? telegramMode() : { kind: "off" };
  const devMailbox = publicSite && siteProfile() === "isolated" && envGet("MAIL_MODE") === "dev";
  const issuer = envGet("TELEGRAM_OIDC_ISSUER");
  const stand = Boolean(issuer && issuer !== "https://oauth.telegram.org");
  return <LoginScreen telegram={telegram} devMailbox={devMailbox} stand={stand} />;
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginBody />
    </Suspense>
  );
}
