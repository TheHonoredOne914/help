# Запрос к владельцу backend (FastAPI ORASAKA VPN)

> **Устарело.** Актуальный контракт — [`API_CONTRACT.md`](./API_CONTRACT.md) (маршруты BFF, предлагаемые endpoints FastAPI, auth, ошибки, идемпотентность, webhook/verify). Документ ниже сохранён как история первой итерации (`/api/me`, `adapter.ts` удалены).

Статус: **предложение**. Реальный backend не просматривался; OpenAPI и код авторизации в пакете отсутствуют. Пути ниже взяты из статического наблюдения в брифе (`vpn_server/api.py`) и **не являются проверенным контрактом**. Бот и база не изменялись.

## 1. Что сайт ожидает от BFF (нормализованный контракт сайта)

Схемы — `src/lib/api/types.ts` (zod). Live-клиент должен отображать в них проверенные ответы FastAPI.

| BFF-маршрут сайта | Метод | Предполагаемый источник FastAPI | Auth | Ответ сайта |
|---|---|---|---|---|
| `/api/plans` | GET | `/plans`, `/trial-settings` | нет | `{ plans: Plan[], capabilities, checkout }` |
| `/api/me` | GET | `/me`, `/me/subscription`, `/me/connection`, `/me/devices`, `/me/orders` | сессия | `Account` |
| `/api/orders` | POST | (нет известного маршрута создания) | сессия + Origin + `Idempotency-Key` | `Order` |
| `/api/orders/{id}` | GET | `/me/orders/{order_id}` | сессия, проверка владельца | `Order` |
| `/api/orders/{id}` | POST `{action:"cancel"}` | (неизвестно) | сессия + Origin | `Order` |

Деньги — `{ amountMinor: int, currency: "RUB" | "XTR" }`. Статусы заказа — `created, awaiting_payment, paid, provisioning_pending, active, cancelled, expired, failed, refund_pending, refunded`.

## 2. Необходимо подтвердить / добавить

1. **OpenAPI-схема** и таблица endpoint/method/auth/request/response/errors для маршрутов выше.
2. **Авторизация сайта**, возвращающая тот же canonical `user_id`, что и бот. Предложение: Telegram Login Widget → серверная проверка подписи и `auth_date` (окно, защита от replay) → одноразовый обмен на сессию BFF (HttpOnly, Secure, SameSite=Lax, ротация). Mini App init data — отдельный flow, не смешивать.
3. **Создание заказа** `POST /orders { planId }` + заголовок идемпотентности; сервер рассчитывает цену/срок/доступность и фиксирует snapshot. Повтор с тем же ключом → тот же заказ; с тем же ключом и другим `planId` → 409.
4. **Capabilities**: `trial`, `referral`, `devices` (+лимит), `topUp` — явными флагами; сайт показывает функции только по ним.
5. **Статус выдачи доступа**: различать `paid` / `provisioning_pending` / `active`; недоступность Remnawave после оплаты → `provisioning_pending` с серверными повторами (outbox + backoff + reconciliation), одна операция выдачи на `orderId`.
6. **Платёжный сервис** (существующая интеграция ЮKassa после аудита): `createCheckout(orderId, amountMinor, currency, idempotencyKey, returnUrl из allowlist)` → `{ providerPaymentId, checkoutUrl, normalizedStatus, expiresAt }`. Интерфейс — `src/lib/payments/adapter.ts`. Webhook принимает только FastAPI: повторный запрос платежа через API ЮKassa, сверка суммы/валюты/магазина/заказа, уникальность `provider+payment_id`.
7. **Баланс/пополнение**: не реализовано на сайте. Если модель баланса в backend есть — описать её; иначе оплачивается конкретный заказ.
8. **Отмена заказа** — маршрут и правила (только `created`/`awaiting_payment`).

## 3. Что сайт уже делает на своей стороне

- Браузер общается только с same-origin BFF; Remnawave и FastAPI из браузера недоступны.
- Мутации проверяют заголовок `Origin`; личные ответы — `Cache-Control: private, no-store`.
- Live-транспорт (`src/lib/api/live-client.ts`): таймаут через `AbortSignal`, ограниченные повторы только для GET, маппинг 401/403/404/409/429/5xx. До сверки контракта методы возвращают `contract_unverified`.
- `ORASAKA_API_URL` принимается только `https:` (или `http://localhost`), из env сервера — не из запроса (защита от SSRF).
