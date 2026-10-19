# ORASAKA VPN — отчёт по сайту (demo)

Дата: 19.10.2026. Папка: `orasaka-site/` (в задании — `website/`; имя изменено по запросу владельца репозитория). Сайт не публиковался, VPS и бот не изменялись.

## Итерация 2 (19.10.2026)

Подробно — [`README_ORASAKA.md`](./README_ORASAKA.md) (аудит, готово, mock-и, что осталось) и [`API_CONTRACT.md`](./API_CONTRACT.md).

**Аудит перед началом:** ветка и PR #4 — ORASAKA, всё в `orasaka-site/`; сайт запускался, typecheck/lint/11 тестов/build — без ошибок; 13 страниц; баннеры main/devices/tariffs/support/connect; анимации hero, reveal, глитч, scanline, свечение, параллакс; ошибок вёрстки на 6 ширинах не было. Не хватало страниц «Устройства», FAQ, выбора способа оплаты, успеха/ошибки оплаты, продления, устройств, verify/webhook-слоя и DEMO-меток.

**Сделано:** анимированный hero с героиней ORASAKA; страницы `/devices`, `/faq`, `/checkout`, `/pay/mock/[id]`, `/payment/{success,error}`; кабинет (вход demo, продление, ссылка, устройства, история); адаптеры провайдеров + реестр + `PaymentService` (идемпотентность, HMAC + окно replay, дедупликация, обязательный re-fetch, сверка суммы); API-клиент по доменам с mock/live; DEMO-метки на всех mock-данных; 24 теста; E2E в Chrome без ошибок.

---

## Итерация 1

## Реализовано

- **Стек:** Next.js 16.4.2 (App Router, Cache Components), React 19.3, TypeScript strict, Tailwind CSS 4 (`@tailwindcss/postcss`), Motion 12 (`motion/react`), zod 4, Vitest 5. Node 22 (`.nvmrc`), npm + `package-lock.json`.
- **Маршруты:** `/` (hero, возможности, тарифы, устройства, 3 шага, FAQ, поддержка, footer), `/pricing`, `/connect` (вкладки платформ с клавиатурой), `/account`, `/checkout/[orderId]`, `/payment/return`, `/support`, `/legal/{offer,privacy,refunds,contacts}` (явные черновики с незаполненными реквизитами), 404.
- **Состояния загрузки:** skeleton, пусто («Тарифы уточняются»), ошибка + «Повторить», нет доступа. Статусы «не оплачен» / «оплачен, доступ готовится» / «доступ активен» различаются текстом и иконкой, не только цветом.
- **BFF:** `/api/plans`, `/api/me`, `/api/orders`, `/api/orders/[id]`; `OrasakaApiClient` с mock- и live-реализацией; проверка Origin для мутаций; `private, no-store`; security-заголовки; `robots: noindex`.
- **Платежи:** `PAYMENTS_MODE=disabled` по умолчанию; `PaymentProviderAdapter` + реестр (ЮKassa — pending integration, crypto — disabled). Тестовый mock-checkout только в demo и только при `PAYMENTS_MODE=mock`.
- **Анимации:** `MotionConfig reducedMotion="user"` + `useReducedMotion` + CSS `prefers-reduced-motion`; hero 600–700 мс, секции 350 мс, кнопки 150 мс; параллакс только `pointer: fine` и ≥1024 px; глитч очень редкий, без вспышек; кнопка остановки фоновой анимации, пауза при скрытой вкладке.
- **Доступность:** skip-link, видимый focus, `aria-current`, `aria-live` для статусов, нативный `<dialog>` (Escape, возврат фокуса), подписи полей, touch targets ≥ 44 px.

## Проверено локально

| Проверка | Результат |
|---|---|
| `npm run typecheck`, `npm run lint` | без ошибок и предупреждений |
| `npm test` (итерация 1) | 11/11: форматирование денег, отказ от float, монотонные статусы, идемпотентность, чужой заказ, одна выдача, отмена без выдачи, server-side snapshot цены |
| `npm run build` | успешно, 17 маршрутов (включая `icon.svg`) |
| Ширины 360/390/768/1024/1440/1920 × 10 маршрутов | нет горизонтального скролла, нет JS-ошибок (Chrome + Playwright) |
| Mock-поток (`DEMO_FIXTURES=test PAYMENTS_MODE=mock`) | двойной клик → 1 запрос/1 ключ; оплата → «доступ готовится» → «активен»; отмена через диалог; Escape + возврат фокуса; `/payment/return?status=success` не меняет статус |
| CSRF | POST без Origin и с чужим Origin → 403 |
| Клиентский bundle | нет имён серверных env и тестовых URL; sourcemaps не публикуются |
| Первый Tab | фокус на «Перейти к содержимому» |

Это лабораторные проверки на mock-данных; staging не проверялся. LCP/CLS/INP не измерялись на реальном устройстве; axe и 200% zoom вручную не прогонялись.

## Требуется контракт backend

См. `BACKEND_CHANGE_REQUEST.md`: OpenAPI, auth-flow сайта (canonical `user_id`), создание/отмена заказа с идемпотентностью, capabilities, статусы выдачи, платёжный сервис и webhook на стороне FastAPI.

## Требуется согласование перед запуском (блокеры)

1. Утверждённый логотип (сейчас текстовый знак, `logo: null`).
2. Утверждение hero (`main.jpg` — временный кандидат).
3. Актуальный API/auth-контракт и staging E2E с FastAPI и Remnawave.
4. Юридические документы и реквизиты; правовая оценка рекламы VPN, персональных данных, оферты, возвратов, фискализации.
5. Одобрение VPN-деятельности платёжными провайдерами (ЮKassa и др.); crypto — disabled до юридического заключения.
6. Исправленный `trial.jpg`, если он нужен.

## Не сделано в рамках задания

- Webhook-обработчик и реальные адаптеры провайдеров (по брифу принадлежат FastAPI).
- Sandbox ЮKassa (нет тестового магазина и ключей).
- Ссылки на магазины приложений (официальные адреса не проверены).
- Строгая CSP с nonce (заданы базовые security-заголовки).
- Playwright/axe как постоянный набор тестов в репозитории (проверки выполнены разово).
