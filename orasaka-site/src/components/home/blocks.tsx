"use client";

import { brand } from "@/config/brand";
import { useDict } from "@/components/locale-provider";
import { PlatformIcon } from "@/components/platform-icon";
import { useScene } from "./use-scene";

const PLATFORMS = [
  { id: "android", icon: "android" },
  { id: "ios", icon: "apple" },
  { id: "windows", icon: "windows" },
  { id: "macos", icon: "monitor" },
] as const;

export function Platforms() {
  const d = useDict();
  const names = { android: d.connect.android, ios: d.connect.ios, windows: d.connect.windows, macos: d.connect.macos };
  return (
    <section data-scene="platforms" aria-labelledby="platforms-title" className="py-14">
      <div className="mx-auto box-border w-full max-w-[1120px] px-6">
        <h2 id="platforms-title" className="h2 h2-lg mx-auto text-center">{d.plat.title}</h2>
        <p className="mx-auto mt-4 max-w-[640px] text-center text-muted">{d.plat.lead}</p>
        <div className="relative mx-auto mt-8 max-w-[760px]">
          <div aria-hidden="true" className="absolute left-8 right-8 top-7 hidden h-px bg-white/15 sm:block" />
          <ul className="flex flex-wrap justify-center gap-8">
            {PLATFORMS.map((item) => (
              <li key={item.id} className="flex w-16 flex-col items-center gap-2">
                <a href={`/connect#${item.id}`} className="relative grid size-14 place-items-center rounded-2xl border border-[#e5231b]/50 text-accent">
                  <PlatformIcon name={item.icon} className="size-6" />
                  <span className="absolute right-1 top-1 size-1.5 rounded-full bg-[#3ddc84]" />
                  <span className="sr-only">{d.plat.open}</span>
                </a>
                <span className="text-center font-mono text-[11px]">{names[item.id]}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function Capabilities() {
  const d = useDict();
  const ref = useScene<HTMLElement>();
  return (
    <section ref={ref} id="capabilities" data-scene="capabilities" aria-labelledby="cap-title" className="px-6 py-16">
      <div className="mx-auto max-w-[1120px]">
        <h2 id="cap-title" className="h2 mx-auto text-center">{d.cap.title}</h2>
        <p className="mx-auto mt-4 max-w-[640px] text-center text-muted">{d.cap.lead}</p>
        <ul className="mt-8 grid gap-4 lg:grid-cols-3">
          {d.cap.items.map((item, index) => (
            <li key={item.title} data-cursor="card" className="scene-card rounded-[20px] border border-white/10 bg-white/[0.03] p-6">
              {index === 0 ? <RouteSketch /> : index === 1 ? <SlotSketch /> : <TermSketch />}
              <h3 className="mt-4 font-mono text-xl font-bold">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{item.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Threats() {
  const d = useDict();
  const ref = useScene<HTMLElement>();
  return (
    <section ref={ref} data-scene="threats" aria-labelledby="threat-title" className="py-[72px]">
      <div className="mx-auto box-border w-full max-w-[1120px] px-6">
        <p className="text-center font-mono text-xs text-muted">{d.threat.prompt}</p>
        <h2 id="threat-title" className="h2 mx-auto mt-3 text-center">{d.threat.title}</h2>
        <p className="mx-auto mt-4 max-w-[640px] text-center text-muted">{d.threat.lead}</p>
        <ul className="card-rail mt-8 grid gap-5 lg:grid-cols-3">
          {d.threat.cards.map((card, index) => (
            <li key={card.mark} data-cursor="card" className="threat-card rounded-[20px] border border-white/10 bg-white/[0.04] p-7">
              <div className="h-28">{index === 0 ? <LineChart /> : index === 1 ? <Timeline /> : <Donut />}</div>
              <p className="mt-3 font-mono text-[22px] font-extrabold text-[#ff4433]">{card.mark}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">{card.off}</p>
            </li>
          ))}
        </ul>
        {d.threat.note ? <p className="mx-auto mt-6 max-w-[720px] text-center text-[13px] text-muted">{d.threat.note}</p> : null}
      </div>
    </section>
  );
}

export function Visibility() {
  const d = useDict();
  const ref = useScene<HTMLElement>();
  return (
    <section ref={ref} id="visibility" data-scene="visibility" aria-labelledby="vis-title" className="py-[76px]">
      <div className="mx-auto box-border w-full max-w-[1120px] px-6">
        <p className="text-center font-mono text-xs text-muted">{d.vis.prompt}</p>
        <h2 id="vis-title" className="h2 mx-auto mt-3 text-center">{d.vis.title}</h2>
        <p className="mx-auto mt-4 max-w-[680px] text-center text-muted">{d.vis.lead}</p>
        <div className="infog mt-8">
          <Lane
            tone="off"
            label={d.vis.direct}
            badges={d.vis.badgesOff}
            nodes={[
              ["you", d.vis.device, d.vis.deviceSub],
              ["net", d.vis.provider, d.vis.nodes.providerDirect],
              ["site", d.vis.site, d.vis.nodes.siteDirect],
            ]}
          />
          <Lane
            tone="on"
            label={d.vis.vpn}
            badges={d.vis.badgesOn}
            nodes={[
              ["you", d.vis.device, d.vis.deviceSub],
              ["net", d.vis.provider, d.vis.nodes.providerVpn],
              ["srv", d.vis.server, d.vis.serverSub],
              ["site", d.vis.site, d.vis.nodes.siteVpn],
            ]}
          />
        </div>
        <p className="mt-4 text-sm leading-relaxed text-muted">{d.vis.note}</p>
      </div>
    </section>
  );
}

export function Advantages() {
  const d = useDict();
  const ref = useScene<HTMLElement>();
  return (
    <section ref={ref} data-scene="advantages" aria-labelledby="adv-title" className="px-6 py-16">
      <div className="mx-auto max-w-[1120px]">
        <h2 id="adv-title" className="h2 mx-auto text-center">{d.adv.title}</h2>
        <p className="mx-auto mt-4 max-w-[640px] text-center text-muted">{d.adv.lead}</p>
        <ul className="mt-8 grid gap-4 md:grid-cols-2">
          {d.adv.items.map((item, index) => (
            <li key={item.title} data-cursor="card" className="scene-card rounded-[20px] border border-white/10 bg-white/[0.03] p-6">
              {index === 0 ? <ServerScene badge={d.server.badge} demo={d.server.demo} /> : index === 1 ? <ScreenSwap /> : index === 2 ? <ShieldSketch /> : <FlowSketch />}
              <h3 className="mt-4 font-mono text-xl font-bold">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{item.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Scenarios() {
  const d = useDict();
  const ref = useScene<HTMLElement>();
  return (
    <section ref={ref} data-scene="scenarios" aria-labelledby="scen-title" className="px-6 py-16">
      <div className="mx-auto max-w-[1120px]">
        <h2 id="scen-title" className="h2 mx-auto text-center">{d.scen.title}</h2>
        <p className="mx-auto mt-4 max-w-[640px] text-center text-muted">{d.scen.lead}</p>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {d.scen.items.map((item, index) => (
            <li key={item.title} data-cursor="card" className="scene-card rounded-[20px] border border-white/10 bg-white/[0.03] p-6">
              {index === 0 ? <WifiSketch /> : index === 1 ? <MetaSketch /> : index === 2 ? <LoginSketch /> : <SupportSketch bot={brand.telegramBot.handle} />}
              <h3 className="mt-4 font-mono text-lg font-bold">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{item.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function TelegramBand() {
  const d = useDict();
  return (
    <section data-scene="telegram" aria-label={d.tg.title} className="px-6 pb-2">
      <div className="orasaka-tg-band">
        <span className="orasaka-tg-icon" aria-hidden="true">
          <svg viewBox="0 0 32 32" fill="none">
            <path d="M4 14.5 28 5l-5 23-8-8-5 4 1-9L25 8 13 17l9 8" fill="white" fillOpacity="0.95" />
          </svg>
        </span>
        <div className="orasaka-tg-copy">
          <h3>{d.tg.title}</h3>
          <p>{d.tg.text}</p>
        </div>
        <a className="orasaka-tg-button" href={brand.telegramBot.url}>
          {d.tg.cta}
        </a>
      </div>
    </section>
  );
}

function Lane({
  tone,
  label,
  badges,
  nodes,
}: {
  tone: "off" | "on";
  label: string;
  badges: readonly string[];
  nodes: readonly ["you" | "net" | "site" | "srv", string, string][];
}) {
  return (
    <div className={`infog-lane infog-lane--${tone}`}>
      <p className="infog-label"><span className={`dot ${tone}`} />{label}</p>
      <div className={`infog-flow ${nodes.length > 3 ? "four" : ""}`}>
        {nodes.map((node, index) => (
          <div key={`${tone}-${node[0]}`} className="contents">
            {index > 0 ? (
              <div className="infog-wire" aria-hidden="true">
                <span className="infog-badge">{badges[index - 1]}</span>
              </div>
            ) : null}
            <div className={`infog-node ${node[0] === "srv" ? "srv" : ""}`}>
              <i><NodeMark kind={node[0]} /></i>
              <div>
                <b>{node[1]}</b>
                <span>{node[2]}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NodeMark({ kind }: { kind: "you" | "net" | "site" | "srv" }) {
  if (kind === "srv") return <span className="font-mono text-sm font-extrabold">S</span>;
  if (kind === "you") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <rect x="7" y="2" width="10" height="20" rx="2.5" />
        <path d="M11 18h2" />
      </svg>
    );
  }
  if (kind === "net") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d="M12 22V10M8 22h8M6 8a8 8 0 0 1 12 0M3 5a12 12 0 0 1 18 0" />
        <circle cx="12" cy="10" r="1.6" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </svg>
  );
}

function LineChart() {
  const d = "M8 78 C 30 70, 50 74, 80 48 S 120 30, 150 18";
  return (
    <svg viewBox="0 0 160 90" className="h-full w-full" aria-hidden="true">
      <path d="M8 16 H152 M8 40 H152 M8 64 H152" stroke="rgb(255 255 255 / 0.08)" />
      <path d={`${d} L150 84 L8 84 Z`} fill="rgb(255 68 51 / 0.16)" />
      <path className="draw" d={d} stroke="#ff4433" strokeWidth="2.5" pathLength={1} />
      <circle cx="150" cy="18" r="3" fill="#fff" />
      <circle className="halo" cx="150" cy="18" r="6" fill="none" stroke="#ff4433" />
    </svg>
  );
}

function Timeline() {
  return (
    <div className="sweep-host">
    <svg viewBox="0 0 220 70" className="h-full w-full" aria-hidden="true">
      <line x1="10" y1="35" x2="210" y2="35" stroke="rgb(255 255 255 / 0.2)" />
      {Array.from({ length: 8 }, (_, i) => (
        <g key={i}>
          <circle cx={18 + i * 26} cy="35" r="4" fill="#ff4433" />
          <circle className="halo" cx={18 + i * 26} cy="35" r="7" fill="none" stroke="#ff4433" style={{ animationDelay: `${i * 0.9}s` }} />
        </g>
      ))}
    </svg>
    <span className="sweep" style={{ background: "#ff4433" }} />
    </div>
  );
}

function Donut() {
  return (
    <svg viewBox="0 0 120 90" className="mx-auto h-full" aria-hidden="true">
      <circle cx="60" cy="46" r="28" fill="none" stroke="rgb(255 255 255 / 0.12)" strokeWidth="8" />
      <circle className="arc" cx="60" cy="46" r="28" stroke="#ff4433" strokeWidth="8" pathLength={1} strokeDasharray="0.72 1" strokeLinecap="round" transform="rotate(-90 60 46)" />
      <circle cx="60" cy="18" r="3.5" fill="#fff" />
    </svg>
  );
}

function ServerScene({ badge, demo }: { badge: string; demo: string }) {
  return (
    <div className="relative h-28 overflow-hidden rounded-xl border border-[#72d99a]/30 bg-[#07110c]">
      <div aria-hidden="true" className="absolute inset-0 opacity-40" style={{ backgroundImage: "linear-gradient(rgb(114 217 154 / 0.18) 1px, transparent 1px), linear-gradient(90deg, rgb(114 217 154 / 0.18) 1px, transparent 1px)", backgroundSize: "16px 16px" }} />
      <div className="route-track absolute left-4 right-24 top-8" style={{ background: "#72d99a" }}>
        <span className="srv-in route-packet" style={{ background: "#d9ffe8" }} />
      </div>
      <div className="route-track absolute left-4 right-24 top-[4.5rem]" style={{ background: "rgb(114 217 154 / 0.35)" }}>
        <span className="srv-out route-packet" style={{ background: "#fff" }} />
      </div>
      <div className="srv-box absolute right-4 top-4 grid size-16 place-items-center rounded-xl border-2 border-[#72d99a] font-mono text-2xl font-extrabold text-[#72d99a]">
        <span className="srv-pulse absolute inset-0 rounded-xl border border-[#72d99a]" />
        S
      </div>
      <div className="absolute bottom-3 left-4 flex gap-2">
        {[0, 1, 2].map((i) => (
          <span key={i} className="led size-2.5 rounded-full bg-[#72d99a]" style={{ animationDelay: `${0.4 + i * 0.35}s` }} />
        ))}
      </div>
      {badge ? <p className="srv-badge absolute bottom-3 right-4 font-mono text-[11px] text-[#72d99a]">{badge}</p> : null}
      {demo ? <p className="absolute left-4 top-2 font-mono text-[10px] uppercase tracking-widest text-white/60">{demo}</p> : null}
    </div>
  );
}

function RouteSketch() {
  return (
    <svg viewBox="0 0 220 70" className="h-16 w-full" aria-hidden="true">
      <path className="draw" d="M16 36 H70 L90 18 H150 L170 36 H204" stroke="#ff4433" strokeWidth="2" pathLength={1} />
      {[16, 90, 170, 204].map((x) => <circle key={x} cx={x} cy={x === 90 ? 18 : 36} r="4" fill="#ff4433" />)}
    </svg>
  );
}
function SlotSketch() {
  return (
    <div className="flex h-16 items-end gap-2" aria-hidden="true">
      {[28, 44, 36].map((h, i) => (
        <span key={h} className="w-8 rounded-t-md bg-[#ff4433]/80" style={{ height: h, opacity: 0.45 + i * 0.2 }} />
      ))}
    </div>
  );
}
function TermSketch() {
  return (
    <div className="flex h-16 items-center gap-2 font-mono text-xs" aria-hidden="true">
      {["1", "3", "6", "12"].map((n) => (
        <span key={n} className={`grid size-10 place-items-center rounded-lg border ${n === "12" ? "border-[#e5231b] text-white" : "border-white/15 text-muted"}`}>{n}</span>
      ))}
    </div>
  );
}
function ScreenSwap() {
  return (
    <div className="relative h-16" aria-hidden="true">
      <div className="swap absolute left-0 top-0 grid h-14 w-24 place-items-center rounded-lg border border-white/20 font-mono text-xs">PHONE</div>
      <div className="swap absolute left-16 top-2 grid h-14 w-28 place-items-center rounded-lg border border-[#ff4433]/50 font-mono text-xs" style={{ animationDelay: "2.2s" }}>DESK</div>
    </div>
  );
}
function ShieldSketch() {
  return (
    <svg viewBox="0 0 80 70" className="h-16" aria-hidden="true">
      <path className="draw" d="M40 8 L66 18 V36 C66 52 40 64 40 64 C40 64 14 52 14 36 V18 Z" stroke="#ff4433" strokeWidth="2" pathLength={1} />
      <path d="M32 34 h16 M40 26 v16" stroke="#fff" strokeWidth="2" />
    </svg>
  );
}
function FlowSketch() {
  return (
    <div className="route-track h-16" aria-hidden="true" style={{ background: "linear-gradient(90deg,#ff4433,#72d99a)" }}>
      <span className="flow-dot route-packet top-6" style={{ background: "#fff" }} />
    </div>
  );
}
function WifiSketch() {
  return (
    <svg viewBox="0 0 80 50" className="h-12" aria-hidden="true">
      <path className="draw" d="M10 28c16-16 44-16 60 0M22 38c10-10 26-10 36 0" stroke="#ff4433" strokeWidth="2" pathLength={1} />
      <circle cx="40" cy="44" r="3" fill="#ff4433" />
    </svg>
  );
}
function MetaSketch() {
  return (
    <svg viewBox="0 0 120 40" className="h-12 w-full" aria-hidden="true">
      <path className="draw" d="M8 20 H112" stroke="#fff" strokeOpacity=".4" pathLength={1} />
      {[20, 48, 76, 104].map((x) => <rect key={x} x={x} y="12" width="10" height="16" fill="#ff4433" opacity="0.7" />)}
    </svg>
  );
}
function LoginSketch() {
  return (
    <div className="flex h-12 items-center gap-2" aria-hidden="true">
      <span className="h-8 w-20 rounded-md border border-white/20" />
      <span className="grid h-8 w-8 place-items-center rounded-md bg-[#e5231b] font-mono text-xs">→</span>
    </div>
  );
}
function SupportSketch({ bot }: { bot: string }) {
  return <p className="font-mono text-xs text-accent">{bot}</p>;
}

export function Traffic() {
  const d = useDict();
  const ref = useScene<HTMLElement>();
  return (
    <section ref={ref} id="capabilities" data-scene="traffic" aria-labelledby="traffic-title" className="py-[72px]">
      <div className="mx-auto box-border w-full max-w-[1120px] px-6">
        <p className="text-center font-mono text-xs text-muted">{d.traffic.prompt}</p>
        <h2 id="traffic-title" className="h2 mx-auto mt-3 text-center">{d.traffic.title}</h2>
        <p className="mx-auto mt-4 max-w-[640px] text-center text-muted">{d.traffic.lead}</p>
        <ul className="card-rail mt-8 grid gap-5 lg:grid-cols-3">
          {d.traffic.cards.map((card, index) => (
            <li key={card.title} className="fx-card rounded-[20px] border border-white/10 bg-white/[0.04] p-7">
              <FxIcon index={index} />
              <h3 className="mt-4 font-mono text-[17px] font-bold">{card.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{card.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function FxIcon({ index }: { index: number }) {
  const d = ["M5 16c4-7 10-7 14 0M8 16c2.2-3.6 5.8-3.6 8 0M12 16.5v.5", "M12 3l7 3v6c0 4.2-2.8 7.2-7 8-4.2-.8-7-3.8-7-8V6z", "M4 8h16M4 12h16M4 16h10"][index];
  return (
    <span className="fx-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path className="draw" d={d} pathLength={1} />
      </svg>
    </span>
  );
}

export function Reasons() {
  const d = useDict();
  const ref = useScene<HTMLElement>();
  return (
    <section ref={ref} id="why" data-scene="why" aria-labelledby="why-title" className="py-[76px]">
      <div className="mx-auto box-border w-full max-w-[1120px] px-6">
        <h2 id="why-title" className="h2 mx-auto text-center">{d.why.title}</h2>
        <p className="mx-auto mt-4 max-w-[640px] text-center text-muted">{d.why.lead}</p>
        <ul className="card-rail why-rail mt-8 grid gap-[18px] xl:grid-cols-4">
          {d.why.items.map((item, index) => (
            <li key={item.title} className="why-card rounded-[20px] border border-white/10 bg-white/[0.04] p-[26px]">
              {index === 0 ? <ServerScene badge={d.server.badge} demo={d.server.demo} /> : <p className="font-mono text-xs text-accent">0{index + 1}</p>}
              <h3 className="relative z-[1] mt-3 font-mono text-[15.5px] font-bold">{item.title}</h3>
              <p className="relative z-[1] mt-2 text-[13px] leading-relaxed text-muted">{item.text}</p>
              <p className="why-extra relative z-[1] text-[12.5px] leading-relaxed text-[#cfd3dc]">{item.extra}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function DataWorth() {
  const d = useDict();
  const ref = useScene<HTMLElement>();
  return (
    <section ref={ref} id="data-worth" data-scene="data" aria-labelledby="data-title" className="py-[76px]">
      <div className="mx-auto box-border w-full max-w-[1120px] px-6">
        <h2 id="data-title" className="h2 mx-auto text-center">{d.data.title}</h2>
        <p className="mx-auto mt-4 max-w-[640px] text-center text-muted">{d.data.lead}</p>
        <ul className="card-rail why-rail mt-8 grid gap-[18px] xl:grid-cols-4">
          {d.data.items.map((item) => (
            <li key={item.title} className="why-card rounded-[20px] border border-white/10 bg-white/[0.04] p-[26px]">
              <h3 className="relative z-[1] font-mono text-[15.5px] font-bold">{item.title}</h3>
              <p className="relative z-[1] mt-2 text-[13px] leading-relaxed text-muted">{item.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Protocols() {
  const d = useDict();
  const ref = useScene<HTMLElement>();
  return (
    <section ref={ref} data-scene="protocols" aria-labelledby="proto-title" className="py-[76px]">
      <div className="mx-auto box-border w-full max-w-[1120px] px-6">
        <h2 id="proto-title" className="h2 mx-auto text-center">{d.proto.title}</h2>
        <p className="mx-auto mt-4 max-w-[640px] text-center text-muted">{d.proto.lead}</p>
        <div className="mt-8 grid grid-cols-3 gap-8 px-6 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted">
          <span>{d.proto.colName}</span>
          <span>{d.proto.colText}</span>
          <span className="text-right">{d.proto.colStatus}</span>
        </div>
        <ul className="overflow-hidden rounded-[20px] border border-white/10 bg-white/[0.03] px-6">
          {[
            [d.tech.protocol, d.tech.protocolText],
            [d.tech.clients, d.tech.clientsText],
            [d.tech.manual, d.tech.manualText],
          ].map(([name, text]) => {
            const wip = /amnezia|автопереключ|auto-switch/i.test(name);
            return (
            <li key={name} className="proto-row grid gap-2 border-t border-white/10 py-[18px] first:border-t-0 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_auto] md:items-center md:gap-8">
              <h3 className="font-mono text-[28px] font-extrabold leading-[32px]">{name}</h3>
              <p className="text-[15px] text-muted">{text}</p>
              <p className={wip
                ? "w-fit rounded-full border border-white/20 px-2.5 py-1 font-mono text-[12px] text-muted md:justify-self-end"
                : "w-fit rounded-full border border-[#3ddc97]/50 bg-[#143024] px-2.5 py-1 font-mono text-[12px] text-[#3ddc97] md:justify-self-end"}>
                {wip ? d.proto.wip : d.proto.live}
              </p>
            </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
