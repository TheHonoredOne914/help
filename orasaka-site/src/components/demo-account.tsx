import { cookies } from "next/headers";
import { connection } from "next/server";
import { Suspense } from "react";
import { AccountView } from "@/components/account-view";
import { Container, PageHeader } from "@/components/ui";
import { SESSION_COOKIE } from "@/lib/server/bff";
import { getRuntime } from "@/lib/server/runtime";

async function AccountWithSession() {
  await connection();
  const sessionId = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  const { client } = getRuntime();
  const res = await client.auth.getSession({ sessionId });
  return <AccountView initialSession={res.ok ? { data: res.data, source: client.source } : undefined} />;
}

export function DemoAccountPage() {
  return (
    <>
      <PageHeader
        eyebrow="Кабинет"
        title="Личный кабинет"
        lead="Подписка, продление, ссылка подключения, устройства и история покупок."
      />
      <Container className="py-14">
        <Suspense fallback={<AccountView />}>
          <AccountWithSession />
        </Suspense>
      </Container>
    </>
  );
}
