import { LoginForm } from "@/components/login-form";
import type { TelegramUi } from "@/lib/telegram-ui";

export function LoginScreen({ telegram, devMailbox, stand = false }: { telegram: TelegramUi; devMailbox: boolean; stand?: boolean }) {
  return (
    <div className="px-6 py-16 sm:py-24">
      <LoginForm telegram={telegram} devMailbox={devMailbox} stand={stand} />
    </div>
  );
}
