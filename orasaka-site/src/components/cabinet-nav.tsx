import { dictionary } from "@/lib/i18n/dictionaries";
import { getLocale } from "@/lib/i18n/get-locale";

export async function CabinetNav({ current }: { current: string }) {
  const c = dictionary(await getLocale()).cabinet;
  const links = [
    ["/account", c.overview],
    ["/account/subscriptions", c.subs],
    ["/account/orders", c.orders],
    ["/account/devices", c.devices],
    ["/account/settings", c.settings],
  ] as const;
  return (
    <nav aria-label={c.nav} className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:rounded-[18px] lg:border lg:border-white/10 lg:bg-white/[0.04] lg:p-2">
      {links.map(([href, label]) => (
        <a
          key={href}
          href={href}
          aria-current={current === href ? "page" : undefined}
          className={`shrink-0 rounded-xl border px-4 py-3 font-mono text-sm lg:border-l-2 ${current === href ? "border-accent text-fg lg:border-y-transparent lg:border-r-transparent lg:bg-white/[0.06]" : "border-white/10 text-muted lg:border-transparent"}`}
        >
          {label}
        </a>
      ))}
    </nav>
  );
}
