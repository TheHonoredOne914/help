import type { Metadata } from "next";
import { AccountView } from "@/components/account-view";
import { Container, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Личный кабинет" };

export default function AccountPage() {
  return (
    <>
      <PageHeader
        eyebrow="Кабинет"
        title="Личный кабинет"
        lead="Подписка, продление, ссылка подключения, устройства и история покупок."
      />
      <Container className="py-14">
        <AccountView />
      </Container>
    </>
  );
}
