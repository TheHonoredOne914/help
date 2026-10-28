export type Platform = {
  id: string;
  name: string;
  steps: string[];
};

const importSteps = [
  "Откройте бота @orasakavpn_bot и перейдите в личный кабинет — там находится ссылка (ключ) подписки.",
  "Скопируйте ссылку подписки.",
  "В приложении добавьте подписку из буфера обмена (обычно кнопка «+» или «Импорт»).",
  "Выберите сервер из списка подписки и нажмите «Подключить». Названия пунктов меню могут отличаться в разных версиях приложения.",
];

/* Store links are intentionally omitted until official app URLs and backend compatibility are verified. */
export const platforms: Platform[] = [
  {
    id: "android",
    name: "Android",
    steps: ["Установите приложение Happ или V2RayTun из официального магазина приложений.", ...importSteps],
  },
  {
    id: "ios",
    name: "iOS",
    steps: ["Установите приложение Happ или V2RayTun из App Store.", ...importSteps],
  },
  {
    id: "windows",
    name: "Windows",
    steps: ["Установите Happ для Windows с официального сайта разработчика.", ...importSteps],
  },
  {
    id: "macos",
    name: "macOS",
    steps: ["Установите Happ для macOS из официального источника разработчика.", ...importSteps],
  },
  {
    id: "manual",
    name: "Ручной импорт",
    steps: [
      "Скопируйте ссылку подписки в кабинете бота.",
      "В любом совместимом клиенте с поддержкой VLESS Reality выберите добавление подписки по ссылке.",
      "Вставьте ссылку, обновите подписку и подключитесь.",
      "Никому не передавайте ссылку подписки — она даёт доступ к вашему тарифу.",
    ],
  },
];
