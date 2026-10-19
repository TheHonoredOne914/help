import Link from "next/link";
import { brand, navItems } from "@/config/brand";
import { AmbientToggle } from "./ambient-toggle";
import { Container } from "./ui";
import { Wordmark } from "./wordmark";

const legal = [
  { href: "/legal/offer", label: "Оферта (черновик)" },
  { href: "/legal/privacy", label: "Конфиденциальность (черновик)" },
  { href: "/legal/refunds", label: "Возвраты (черновик)" },
  { href: "/legal/contacts", label: "Контакты и реквизиты" },
];

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line bg-surface/40">
      <Container className="grid gap-10 py-12 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Wordmark />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">
            Подписка оформляется и обслуживается в Telegram-боте{" "}
            <a
              href={brand.telegramBot.url}
              className="text-fg underline decoration-accent underline-offset-4 hover:text-accent"
              target="_blank"
              rel="noopener noreferrer"
            >
              {brand.telegramBot.handle}
            </a>
            .
          </p>
        </div>
        <nav aria-label="Разделы сайта">
          <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-muted">Разделы</h2>
          <ul className="mt-3 space-y-1">
            {navItems.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="inline-flex min-h-9 items-center text-sm hover:text-accent">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Документы">
          <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-muted">Документы</h2>
          <ul className="mt-3 space-y-1">
            {legal.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="inline-flex min-h-9 items-center text-sm hover:text-accent">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Container>
      <Container className="flex flex-col gap-2 border-t border-line py-5 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>{brand.name}. Демонстрационная версия сайта.</p>
        <AmbientToggle />
      </Container>
    </footer>
  );
}
