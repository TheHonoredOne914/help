# ORASAKA VPN — сайт (demo)

Самостоятельный сайт ORASAKA VPN: Next.js 16 (App Router, Cache Components) + TypeScript strict + Tailwind CSS 4 + Motion (`motion/react`).
Работает в **demo-режиме**: тестовые данные, оплата отключена, запросов к реальному backend нет.
Официальный канал — Telegram-бот [@orasakavpn_bot](https://t.me/orasakavpn_bot).

## Запуск

Требуется Node 22.12+ (см. `.nvmrc`), npm.

```bash
cd orasaka-site
npm ci
cp .env.example .env.local   # необязательно: значения по умолчанию = demo
npm run dev                   # http://localhost:3000
```

| Команда | Что делает |
|---|---|
| `npm run dev` | dev-сервер |
| `npm run build` / `npm start` | production-сборка и запуск |
| `npm run typecheck` | `next typegen` + `tsc --noEmit` |
| `npm run lint` | ESLint (next core-web-vitals + typescript) |
| `npm test` | Vitest: деньги, статусы заказа, идемпотентность, принадлежность заказа |
| `npm run check` | всё вышеперечисленное, кроме build |

## Режимы (`.env.example`)

| Переменная | По умолчанию | Значение |
|---|---|---|
| `SITE_MODE` | `demo` | `demo` — изолированные фикстуры; `live` — транспорт к `ORASAKA_API_URL` (маппинг ответов не реализован до сверки OpenAPI, возвращает `contract_unverified`) |
| `PAYMENTS_MODE` | `disabled` | `mock` включает тестовый in-memory checkout только в demo |
| `DEMO_FIXTURES` | пусто | `test` — показать TEST-тарифы; без него — «Тарифы уточняются» |
| `ENABLE_YOOKASSA`, `ENABLE_CRYPTO` | `false` | зарезервированы; в этой сборке всегда `false` |

Посмотреть весь тестовый поток оплаты: `DEMO_FIXTURES=test PAYMENTS_MODE=mock npm run dev` → «Тарифы» → «Оформить (тест)» → «Имитировать оплату».
Режим считывается при сборке/старте сервера; после смены переменных перезапустите `dev` или пересоберите.

## Структура

```
src/
  app/                  маршруты: /, /pricing, /connect, /account, /checkout/[orderId],
                        /payment/return, /support, /legal/*; BFF: /api/plans, /api/me, /api/orders[/id]
  components/           UI (hero, тарифы, кабинет, заказ, диалог, вкладки платформ…)
  config/brand.ts       название, бот, logo: null, hero-баннер (заменяется здесь)
  config/content.ts     тексты главной (только факты из материалов бота)
  lib/api/              нормализованный контракт (zod), OrasakaApiClient, mock и live-клиенты
  lib/payments/         PaymentProviderAdapter, реестр провайдеров (всё выключено)
  lib/server/           server-only env и BFF-хелперы (Origin-проверка, no-store)
public/banners/         оригиналы баннеров (без пересжатия); AVIF/WebP делает next/image
tests/                  unit-тесты
```

Замена hero: положите файл в `public/banners/` и поменяйте `brand.hero` в `src/config/brand.ts`.
Логотип: задайте `brand.logo` — шапка автоматически переключится с текстового знака на изображение.

См. также: `ASSET_USAGE.md`, `BACKEND_CHANGE_REQUEST.md`, `REPORT.md`.
