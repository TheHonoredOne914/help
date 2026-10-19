# ORASAKA VPN — сайт (demo)

Самостоятельный сайт ORASAKA VPN: Next.js 16 (App Router, Cache Components) + TypeScript strict + Tailwind CSS 4 + Motion (`motion/react`).
Работает в **demo-режиме**: тестовые данные, реальная оплата отключена, запросов к реальному backend нет. Состояние, mock-и и план — [`README_ORASAKA.md`](./README_ORASAKA.md); контракт backend — [`API_CONTRACT.md`](./API_CONTRACT.md).
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
| `npm test` | Vitest: деньги, статусы, идемпотентность, владелец заказа, платежи (подпись, replay, сверка суммы, продление) |
| `npm run check` | всё вышеперечисленное, кроме build |

## Режимы (`.env.example`)

| Переменная | По умолчанию | Значение |
|---|---|---|
| `SITE_MODE` | `demo` | `demo` — изолированные фикстуры; `live` — транспорт к `ORASAKA_API_URL` (маппинг ответов не реализован до сверки OpenAPI, возвращает `contract_unverified`) |
| `PAYMENTS_MODE` | `disabled` | `mock` включает тестовый in-memory checkout только в demo |
| `DEMO_FIXTURES` | пусто | `test` — показать TEST-тарифы; без него — «Тарифы уточняются» |
| `ENABLE_YOOKASSA`, `ENABLE_CRYPTO` | `false` | зарезервированы; в этой сборке всегда `false` |
| `SITE_ORIGIN` | пусто | публичный origin для `returnUrl` платежей; пусто — относительные URL (demo) |

Посмотреть весь тестовый поток оплаты: `DEMO_FIXTURES=test PAYMENTS_MODE=mock npm run dev` → «Кабинет» → «Войти в демо-кабинет» → «Тарифы» → «Оформить (демо)» → выбор способа → DEMO-шлюз «Оплатить (тест)».
Режим считывается при сборке/старте сервера; после смены переменных перезапустите `dev` или пересоберите.

## Структура

```
src/
  app/                  маршруты: /, /pricing, /connect, /devices, /faq, /account, /checkout,
                        /checkout/[orderId], /pay/mock/[id], /payment/{return,success,error},
                        /support, /legal/*; BFF: /api/** (см. API_CONTRACT.md)
  components/           UI (hero, тарифы, кабинет, заказ, диалог, вкладки платформ…)
  config/brand.ts       название, бот, logo: null, hero-баннер (заменяется здесь)
  config/content.ts     тексты главной (только факты из материалов бота)
  lib/api/              нормализованный контракт (zod), OrasakaApiClient, mock/ (MockDb, mock-клиент), live-клиент
  lib/payments/         адаптеры провайдеров, реестр, PaymentService (verify, webhook, идемпотентность)
  lib/server/           server-only env, runtime, BFF-хелперы (сессия, Origin, no-store), checkout
public/banners/         оригиналы баннеров (без пересжатия); AVIF/WebP делает next/image
tests/                  unit-тесты
```

Замена hero: положите файл в `public/banners/` и поменяйте `brand.hero` в `src/config/brand.ts`.
Логотип: задайте `brand.logo` — шапка автоматически переключится с текстового знака на изображение.

См. также: `README_ORASAKA.md`, `API_CONTRACT.md`, `ASSET_USAGE.md`, `REPORT.md`.
