"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { LOCALE_OPTIONS } from "@/lib/i18n/locale";
import { useDict, useLocale } from "./locale-provider";

export function LanguageSwitch() {
  const locale = useLocale();
  const dict = useDict();
  const pathname = usePathname();
  const search = useSearchParams();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const current = LOCALE_OPTIONS.find((item) => item.id === locale) ?? LOCALE_OPTIONS[0];
  const returnTo = search.size ? `${pathname}?${search.toString()}` : pathname;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  function onMenuKey(event: React.KeyboardEvent<HTMLDivElement>) {
    const buttons = [...menuRef.current!.querySelectorAll<HTMLButtonElement>("button")];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const next =
      event.key === "ArrowDown" ? (index + 1) % buttons.length
      : event.key === "ArrowUp" ? (index - 1 + buttons.length) % buttons.length
      : event.key === "Home" ? 0
      : buttons.length - 1;
    buttons[next]?.focus();
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        className="inline-flex h-11 items-center gap-1.5 rounded-[14px] border border-white/14 px-2.5 font-mono text-[13px] font-bold"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={menuId}
        aria-label={dict.a11y.lang}
        onClick={() => setOpen((value) => !value)}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.5 2.8 3.8 5.8 3.8 9s-1.3 6.2-3.8 9c-2.5-2.8-3.8-5.8-3.8-9s1.3-6.2 3.8-9Z" />
        </svg>
        {current.code}
      </button>
      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="listbox"
          aria-label={dict.a11y.lang}
          className="lang-menu absolute right-0 z-50 mt-2 w-52 rounded-[14px] border border-white/14 bg-[#101010]/95 p-1 shadow-2xl"
          onKeyDown={onMenuKey}
        >
          {LOCALE_OPTIONS.map((option) => (
            <form
              key={option.id}
              method="post"
              action="/api/locale"
              onSubmit={(event) => {
                const input = event.currentTarget.querySelector<HTMLInputElement>("[name=returnTo]");
                if (input && location.hash) input.value = `${returnTo}${location.hash}`;
              }}
            >
              <input type="hidden" name="locale" value={option.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <button
                type="submit"
                role="option"
                aria-selected={option.id === locale}
                className={`flex min-h-11 w-full items-center gap-3 rounded-[10px] px-3 text-left text-sm ${option.id === locale ? "bg-white/10 text-white" : "text-muted hover:bg-white/5 hover:text-white"}`}
              >
                <span className="w-8 font-mono text-xs font-bold text-accent">{option.code}</span>
                <span>{option.name}</span>
              </button>
            </form>
          ))}
        </div>
      ) : null}
    </div>
  );
}
