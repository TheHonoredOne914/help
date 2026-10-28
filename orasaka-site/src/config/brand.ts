export type BrandImage = {
  src: string;
  width: number;
  height: number;
  alt: string;
};

export const brand = {
  name: "ORASAKA VPN",
  wordmark: { primary: "ORASAKA", secondary: "VPN", kana: "オラサカ" },
  // No approved logo file yet. The header keeps a 42px slot plus the ORASAKA VPN wordmark.
  logo: null as BrandImage | null,
  telegramBot: {
    handle: "@orasakavpn_bot",
    url: "https://t.me/orasakavpn_bot",
  },
  // Heroine: the left 552 px of banners/main.jpg (the part without baked-in lettering), unscaled.
  // A layered source (character on a transparent background) would replace this file 1:1.
  heroine: {
    src: "/brand/heroine-transparent-v1.png",
    width: 1024,
    height: 1536,
    alt: "Героиня ORASAKA: девушка с длинными чёрными волосами в чёрно-красной одежде",
  } satisfies BrandImage,
  // Head-and-shoulders crop of the same art (x 150–480, y 0–330 of main.jpg) for compact places.
  heroinePortrait: {
    src: "/brand/heroine-portrait.jpg",
    width: 330,
    height: 330,
    alt: "Героиня ORASAKA",
  } satisfies BrandImage,
  description:
    "VPN-подписка ORASAKA через Telegram-бота: протокол VLESS Reality, приложения Happ и V2RayTun, личный кабинет и поддержка в Telegram.",
} as const;

export const banners = {
  devices: { src: "/banners/devices.jpg", width: 1280, height: 720, alt: "" },
  instructions: { src: "/banners/instructions.jpg", width: 1280, height: 720, alt: "" },
  tariffs: { src: "/banners/tariffs.jpg", width: 1280, height: 720, alt: "" },
  support: { src: "/banners/support.jpg", width: 1280, height: 720, alt: "" },
  cabinet: { src: "/banners/cabinet.jpg", width: 1280, height: 720, alt: "" },
  connect: { src: "/banners/connect.jpg", width: 1280, height: 416, alt: "" },
} satisfies Record<string, BrandImage>;

export const headerNav = [
  { href: "/pricing", label: "Тарифы" },
  { href: "/connect", label: "Подключение" },
  { href: "/devices", label: "Устройства" },
  { href: "/faq", label: "FAQ" },
] as const;

export const navItems = [
  ...headerNav,
  { href: "/account", label: "Кабинет" },
  { href: "/support", label: "Поддержка" },
] as const;
