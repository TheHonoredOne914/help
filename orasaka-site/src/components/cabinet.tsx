import type { CabinetView } from "@/lib/cabinet-view";
import { Card } from "./ui";
import { SubscriptionCard } from "./cabinet-sections";

/** Overview: the account and the current subscription. The other sections have their own routes. */
export function Cabinet({ view }: { view: CabinetView }) {
  return (
    <div className="grid gap-6">
      <Card className="cabinet-card">
        <h2 className="font-mono text-xl font-bold">Аккаунт</h2>
        <p className="mt-3 text-sm text-muted">{view.email ? `Email: ${view.email}` : "Email не указан"}</p>
        <p className="mt-1 text-sm text-muted">{view.telegramLinked ? "Telegram подключён" : "Telegram не подключён"}</p>
      </Card>
      <SubscriptionCard view={view} />
    </div>
  );
}
