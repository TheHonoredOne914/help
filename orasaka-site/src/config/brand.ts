export type BrandImage = {
  src: string;
  width: number;
  height: number;
  alt: string;
};

export const brand = {
  name: "ORASAKA VPN",
  wordmark: { primary: "ORASAKA", secondary: "VPN", kana: "オラサカ" },
  // No approved standalone logo exists yet; the header renders the HTML wordmark while this is null.
  logo: null as BrandImage | null,
  telegramBot: {
    handle: "@orasakavpn_bot",
    url: "https://t.me/orasakavpn_bot",
  },
  // Temporary hero candidate; not a confirmed final choice. Swap src/size/alt here.
  hero: {
    src: "/banners/main.jpg",
    width: 1280,
    height: 720,
    alt: "Баннер ORASAKA VPN: героиня в неоновом ночном городе и надпись «VPN-подписка в Telegram»",
  } satisfies BrandImage,
  description:
    "VPN-подписка ORASAKA через Telegram-бота: протокол VLESS Reality, приложения Happ и V2RayTun, личный кабинет и поддержка в Telegram.",
} as const;

export const banners = {
  devices: { src: "/banners/devices.jpg", width: 1280, height: 720, alt: "" },
  tariffs: { src: "/banners/tariffs.jpg", width: 1280, height: 720, alt: "" },
  support: { src: "/banners/support.jpg", width: 1280, height: 720, alt: "" },
  connect: { src: "/banners/connect.jpg", width: 1280, height: 416, alt: "" },
} satisfies Record<string, BrandImage>;

export const navItems = [
  { href: "/pricing", label: "Тарифы" },
  { href: "/connect", label: "Подключение" },
  { href: "/account", label: "Кабинет" },
  { href: "/support", label: "Поддержка" },
] as const;
