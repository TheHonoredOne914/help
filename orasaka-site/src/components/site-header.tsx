"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useId, useRef, useState } from "react";
import { brand, navItems } from "@/config/brand";
import { ExternalButton } from "./ui";
import { Wordmark } from "./wordmark";

export function SiteHeader() {
  return (
    <Suspense fallback={<HeaderBody pathname="" />}>
      <HeaderWithPath />
    </Suspense>
  );
}

function HeaderWithPath() {
  return <HeaderBody pathname={usePathname()} />;
}

function HeaderBody({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  const menuId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);

  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="min-w-0 shrink rounded-md py-2" aria-label={`${brand.name} — на главную`}>
          <Wordmark />
        </Link>

        <nav aria-label="Основная навигация" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {navItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className="relative inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-muted transition-colors duration-150 hover:text-fg aria-[current=page]:text-fg aria-[current=page]:after:absolute aria-[current=page]:after:inset-x-3 aria-[current=page]:after:bottom-1.5 aria-[current=page]:after:h-0.5 aria-[current=page]:after:bg-accent"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <span className="hidden sm:block">
            <ExternalButton href={brand.telegramBot.url} className="px-4 lg:px-5">
              Открыть бота
            </ExternalButton>
          </span>
          <button
            ref={toggleRef}
            type="button"
            className="inline-flex size-11 items-center justify-center rounded-md border border-line text-fg transition-colors hover:border-brand/70 aria-expanded:border-brand aria-expanded:text-accent lg:hidden"
            aria-expanded={open}
            aria-controls={menuId}
            onClick={() => setOpen((v) => !v)}
          >
            <span className="sr-only">{open ? "Закрыть меню" : "Открыть меню"}</span>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>

      <nav
        id={menuId}
        aria-label="Мобильная навигация"
        hidden={!open}
        className="mobile-menu relative overflow-hidden border-t border-brand/40 bg-bg/95 backdrop-blur-md lg:hidden"
      >
        <span aria-hidden="true" lang="ja" className="pointer-events-none absolute -right-2 top-2 select-none font-display text-6xl font-bold text-transparent [-webkit-text-stroke:1px_rgb(229_9_20/0.18)]">
          メニュー
        </span>
        <ul className="relative mx-auto max-w-7xl px-4 py-3 sm:px-6">
          {navItems.map((item, i) => (
            <li key={item.href} style={{ animationDelay: `${40 + i * 30}ms` }} className="mobile-menu-item border-b border-line/60 last-of-type:border-b-0">
              <Link
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                className="group flex min-h-13 items-center gap-4 rounded-md px-2 text-base font-medium text-muted transition-colors hover:text-fg aria-[current=page]:text-fg"
              >
                <span aria-hidden="true" className="font-mono text-xs text-brand/80 group-aria-[current=page]:text-accent">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="flex-1">{item.label}</span>
                <span aria-hidden="true" className="h-px w-4 bg-line transition-[width,background-color] group-hover:w-8 group-hover:bg-accent group-aria-[current=page]:w-8 group-aria-[current=page]:bg-accent" />
              </Link>
            </li>
          ))}
          <li className="mobile-menu-item pt-4" style={{ animationDelay: `${40 + navItems.length * 30}ms` }}>
            <ExternalButton href={brand.telegramBot.url} className="w-full">
              Открыть бота {brand.telegramBot.handle}
            </ExternalButton>
          </li>
        </ul>
      </nav>
    </header>
  );
}
