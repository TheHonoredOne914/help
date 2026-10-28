"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useId, useRef, useState } from "react";
import { useClientReady } from "@/lib/use-client-ready";
import { LanguageSwitch } from "./language-switch";
import { useDict } from "./locale-provider";
import { ButtonLink } from "./ui";
import { Wordmark } from "./wordmark";

export function SiteHeader({ loggedIn = false }: { loggedIn?: boolean }) {
  return (
    <Suspense fallback={<HeaderBody pathname="" loggedIn={loggedIn} />}>
      <HeaderWithPath loggedIn={loggedIn} />
    </Suspense>
  );
}

function HeaderWithPath({ loggedIn }: { loggedIn: boolean }) {
  return <HeaderBody pathname={usePathname()} loggedIn={loggedIn} />;
}

function HeaderBody({ pathname, loggedIn }: { pathname: string; loggedIn: boolean }) {
  const dict = useDict();
  const [open, setOpen] = useState(false);
  const ready = useClientReady();
  const [lastPath, setLastPath] = useState(pathname);
  const menuId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const accountHref = loggedIn ? "/account" : "/login";
  const accountShort = loggedIn ? dict.header.account : dict.header.login;
  const accountLabel = loggedIn ? dict.header.accountLong : dict.header.loginLong;
  const links = [
    { href: "/features", label: dict.nav.features },
    { href: "/connect", label: dict.nav.connect },
    { href: "/servers", label: dict.nav.servers },
    { href: "/pricing", label: dict.nav.pricing },
    { href: "/how-it-works", label: dict.nav.how },
    { href: "/tools", label: dict.nav.tools },
  ];

  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    const close = () => setOpen(false);
    window.addEventListener("hashchange", close);
    window.addEventListener("popstate", close);
    return () => {
      window.removeEventListener("hashchange", close);
      window.removeEventListener("popstate", close);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const isActive = (href: string) => {
    if (href.includes("#")) return false;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <>
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#070707]/85 py-5 backdrop-blur-md">
      <div className="mx-auto flex h-[46px] max-w-[1120px] items-center gap-1 px-3 sm:gap-2 sm:px-6">
        <Link href="/" className="shrink-0 rounded-md py-2">
          <Wordmark />
          <span className="sr-only"> — {dict.a11y.home}</span>
        </Link>

        <nav aria-label={dict.a11y.main} className="hidden flex-1 justify-center lg:flex">
          <ul className="flex items-center gap-1">
            {links.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className="inline-flex min-h-11 items-center whitespace-nowrap rounded-lg px-1.5 font-mono text-[12.5px] text-[#9a9a9a] hover:text-white aria-[current=page]:text-white"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <Link
            href={accountHref}
            className="hidden min-h-11 items-center rounded-[14px] border-[1.5px] border-white/14 bg-white/[0.06] px-4 font-mono text-[13px] font-bold text-white sm:inline-flex"
          >
            {accountShort}
            <span className="sr-only">{accountLabel === accountShort ? "" : `. ${accountLabel}`}</span>
          </Link>
          <ButtonLink href="/pricing" size="header" className="!hidden lg:!inline-flex">
            {dict.header.start}
          </ButtonLink>
          <LanguageSwitch />
          <Link href={accountHref} className="inline-flex size-11 items-center justify-center rounded-[14px] bg-[linear-gradient(135deg,#e5231b,#8c0f0f,#ff4433)] text-white sm:hidden" aria-label={accountLabel}>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="8" r="3" />
              <path d="M5 19c1.5-3 3.8-4.5 7-4.5S17.5 16 19 19" />
            </svg>
          </Link>
          <button
            ref={toggleRef}
            type="button"
            className="inline-flex size-11 items-center justify-center rounded-[14px] border border-white/14 text-fg lg:hidden"
            aria-expanded={open}
            aria-controls={menuId}
            disabled={!ready}
            data-hydrated={ready ? "true" : undefined}
            onClick={() => setOpen((v) => !v)}
          >
            <span className="sr-only">{open ? dict.a11y.menuClose : dict.a11y.menuOpen}</span>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>
    </header>

      <nav
        id={menuId}
        aria-label={dict.a11y.mobile}
        hidden={!open}
        className="mobile-menu fixed inset-x-0 bottom-0 top-[86px] z-30 overflow-y-auto bg-[#070707] px-6 pb-8 pt-6 lg:hidden"
      >
        <p className="font-mono text-xs text-muted">{dict.header.prompt}</p>
        <ul className="mt-6">
          {links.map((item, i) => (
            <li key={item.href} className="mobile-menu-item border-b border-white/10">
              <Link href={item.href} aria-current={isActive(item.href) ? "page" : undefined} onClick={() => setOpen(false)} className="flex min-h-16 items-center gap-4 font-mono text-2xl font-bold">
                <span className="text-sm text-accent">{String(i + 1).padStart(2, "0")}</span>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-8 grid gap-3">
          <Link href={accountHref} onClick={() => setOpen(false)} className="inline-flex min-h-[42px] items-center justify-center rounded-[12px] border-[1.5px] border-white/14 font-mono text-[14px] font-bold">
            {accountShort}
          </Link>
          <ButtonLink href="/pricing" size="header" className="w-full" onClick={() => setOpen(false)}>
            {dict.header.start}
          </ButtonLink>
        </div>
      </nav>
    </>
  );
}
