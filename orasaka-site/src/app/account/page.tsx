import type { Metadata } from "next";
import { AccountView } from "@/components/account-view";
import { Container, PageHeader } from "@/components/ui";
import { getServerEnv } from "@/lib/server/env";

export const metadata: Metadata = { title: "Личный кабинет" };

export default function AccountPage() {
  return (
    <>
      <PageHeader
        eyebrow="Кабинет"
        title="Личный кабинет"
        lead="Срок подписки, выдача доступа, устройства и заказы — данные приходят с сервера подписок."
      />
      <Container className="py-14">
        <AccountView demo={getServerEnv().siteMode === "demo"} />
      </Container>
    </>
  );
}
