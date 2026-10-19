# ORASAKA VPN — API contract (сайт ↔ backend)

Документ для разработчика backend (Claude Code, проект бота / FastAPI / Remnawave). Состоит из двух частей:

- **Часть A — BFF сайта (реализовано).** Маршруты `orasaka-site/src/app/api/**`, которые вызывает браузер. Схемы — `src/lib/api/types.ts` (zod). Сейчас обслуживаются mock-слоем.
- **Часть B — Backend API (предложение, нужно реализовать в FastAPI).** То, что live-клиент сайта (`src/lib/api/live-client.ts`) будет вызывать на сервере. Пока каждый метод live-клиента возвращает `contract_unverified` — сайт ничего не отправляет в реальный backend.

> Статус части B: **черновик для согласования**. Реальный код FastAPI не просматривался; пути `/plans`, `/me/*` взяты из брифа как наблюдение. Цены, сроки, лимиты устройств и тексты условий сайт не придумывает — они должны приходить из backend.

---

## 0. Общие правила

| Правило | Значение |
|---|---|
| Транспорт | HTTPS, JSON (`application/json; charset=utf-8`), UTF-8 |
| Деньги | `{ "amountMinor": int ≥ 0, "currency": "RUB" \| "XTR" }` — RUB в копейках, XTR = целые Telegram Stars |
| Даты | ISO 8601 UTC, например `2026-10-19T12:00:00Z` |
| ID | строки `[A-Za-z0-9_-]{1,80}` |
| Кэш | все ответы с пользовательскими данными — `Cache-Control: private, no-store` |
| Источник данных | BFF добавляет `x-orasaka-source: mock \| live`; UI показывает метку `DEMO`, если `mock` |
| Секреты | только на сервере; в браузерный бандл не попадает ни одного ключа или URL backend |

### Ошибки

BFF → браузер: `{ "error": "<code>" }` с HTTP-статусом:

| code | HTTP | Когда |
|---|---|---|
| `bad_request` | 400 | невалидное тело / заголовок / ключ идемпотентности |
| `unauthorized` | 401 | нет или истекла сессия |
| `forbidden` | 403 | чужой Origin, неверная подпись webhook |
| `payments_disabled` | 403 | оплата на сайте выключена |
| `not_found` | 404 | нет объекта **или он принадлежит другому пользователю** (не различаем) |
| `conflict` | 409 | ключ идемпотентности переиспользован с другими параметрами; недопустимый переход статуса; продление без подписки |
| `method_unavailable` | 422 | способ оплаты выключен / не поддерживает валюту |
| `rate_limited` | 429 | лимит запросов |
| `contract_unverified` | 501 | live-интеграция ещё не согласована |
| `bad_response` | 502 | backend вернул ответ не по схеме |
| `verification_failed` | 502 | не удалось подтвердить платёж у провайдера или данные не совпали |
| `unavailable` / `backend_not_configured` | 503 | backend недоступен / не настроен |
| `timeout` | 504 | backend не ответил вовремя |

Backend → BFF (предложение): `{ "error": { "code": "<code>", "message": "<для логов>" } }`, коды из той же таблицы. BFF не показывает `message` пользователю — тексты на русском хранит сайт.

---

## Часть A. BFF сайта (браузер → Next.js), реализовано

Аутентификация браузера — HttpOnly cookie `orasaka_sid` (`Secure` в production, `SameSite=Lax`, `Path=/`). Каждый мутирующий запрос (POST/DELETE) проверяет заголовок `Origin` на совпадение с хостом → иначе `403 forbidden`. Тело запроса — только `application/json`, до 4 КБ.

| Маршрут | Метод | Auth | Запрос | Ответ 200 |
|---|---|---|---|---|
| `/api/auth/session` | GET | cookie (опц.) | — | `Session` |
| `/api/auth/telegram` | POST | Origin | данные Telegram Login (см. B.1) | `Session` *(сейчас 501)* |
| `/api/auth/demo-login` | POST | Origin | — | `{ok:true}` + cookie *(только demo, MOCK)* |
| `/api/auth/logout` | POST | Origin | — | `{ok:true}`, cookie удалена |
| `/api/plans` | GET | — | — | `{ plans: Plan[], capabilities: Capabilities }` |
| `/api/payments/methods` | GET | — | — | `{ mode: "disabled"\|"mock", methods: PaymentMethod[] }` |
| `/api/orders` | GET | сессия | — | `{ orders: Order[] }` (новые сверху) |
| `/api/orders` | POST | сессия + Origin + `Idempotency-Key` | `{ planId, paymentMethod }` | `{ order: Order, checkoutUrl: string\|null }` |
| `/api/orders/{id}` | GET | сессия, владелец | — | `Order` |
| `/api/orders/{id}` | POST | сессия + Origin, владелец | `{ action: "pay" }` | `{ order, checkoutUrl }` |
| | | | `{ action: "verify" }` | `Order` (после сверки с провайдером) |
| | | | `{ action: "cancel" }` | `Order` |
| `/api/subscription` | GET | сессия | — | `Subscription` |
| `/api/subscription/renew` | POST | сессия + Origin + `Idempotency-Key` | `{ planId, paymentMethod }` | `{ order, checkoutUrl }` (`order.kind = "renewal"`) |
| `/api/subscription/connection` | GET | сессия | — | `Connection` (404, если нет активной подписки) |
| `/api/devices` | GET | сессия | — | `{ limit, items: Device[] }` |
| `/api/devices/{id}` | DELETE | сессия + Origin, владелец | — | `{ limit, items }` |
| `/api/payments/webhook/{provider}` | POST | подпись провайдера | сырое тело ≤ 16 КБ | `{ ok:true, duplicate }` *(только mock-провайдер в demo)* |
| `/api/pay/mock/{paymentId}` | GET / POST | Origin | `{ outcome: "succeeded"\|"canceled" }` | *(MOCK-шлюз, только demo)* |
| `/api/demo/preset` | POST | сессия + Origin | `{ preset: "empty"\|"active"\|"provisioning" }` | *(MOCK, только demo)* |

`Idempotency-Key`: `[A-Za-z0-9-]{16,64}` (UUID v4), генерируется браузером один раз на выбор «тариф + способ + вид заказа» и переиспользуется при повторах/двойном клике.

### Схемы (zod → JSON)

```ts
Plan          = { id, title, durationMonths: int>0, prices: Money[≥1], conditions: string[], test: bool }
Capabilities  = { trial: bool, referral: bool, devices: bool, renewal: bool, topUp: false }
Session       = { authenticated: bool, user: { id, displayName } | null, demoLoginAvailable: bool }
Order         = { id, kind: "new"|"renewal", planId, planTitle, amount: Money,
                  status: OrderStatus, paymentMethod: string|null,
                  paymentStatus: "pending"|"succeeded"|"canceled"|"failed"|"expired"|null,
                  createdAt, expiresAt: string|null, test: bool }
OrderStatus   = "created"|"awaiting_payment"|"paid"|"provisioning_pending"|"active"
              | "cancelled"|"expired"|"failed"|"refund_pending"|"refunded"
Subscription  = { status: "none"|"active"|"expired", expiresAt: string|null, planTitle: string|null,
                  provisioning: "none"|"pending"|"ready"|"failed", test: bool }
Connection    = { url: string, test: bool }
Device        = { id, name, platform, lastSeenAt }
PaymentMethod = { id, label, description, status: "enabled"|"disabled"|"pending_integration"|"bot_only",
                  currencies: ("RUB"|"XTR")[], test: bool }
```

### Статусы заказа

Переходы монотонны (откат запрещён), см. `src/lib/order-status.ts`:

```
created → awaiting_payment → paid → provisioning_pending → active
                ↘ cancelled | expired | failed            active → refund_pending → refunded
```

- `paid` ≠ `active`: оплата подтверждена, доступ ещё выдаётся (Remnawave). UI говорит «платить повторно не нужно».
- Отменённый/неудачный **платёж** не закрывает **заказ**: заказ остаётся `awaiting_payment` и `paymentStatus = canceled|failed`, можно оплатить снова (новый платёж с новым ключом).
- Неоплаченный заказ истекает через `expiresAt` (в mock — 30 минут).

---

## Часть B. Backend API (Next.js server → FastAPI), предложение

База: `ORASAKA_API_URL` (только https; http — лишь для localhost), таймаут `ORASAKA_API_TIMEOUT_MS` (по умолчанию 8000 мс). GET-запросы live-клиент повторяет до 2 раз (backoff 300/600 мс) при временных ошибках и таймаутах; мутирующие запросы (ещё не реализованы) будут повторяться **только** с тем же `Idempotency-Key`.

### B.0 Аутентификация

1. **Сервис → сервис.** Каждый запрос сайта несёт `Authorization: Bearer <SITE_API_TOKEN>` (секрет в env сервера сайта и FastAPI; ротация без простоя — FastAPI принимает 2 активных токена).
2. **Пользователь.** После входа FastAPI выдаёт непрозрачный `sessionToken`. BFF хранит его на сервере, привязав к cookie `orasaka_sid`, и передаёт как `X-Orasaka-Session: <sessionToken>`. Все `/me/*` определяют пользователя **только** по этой сессии (canonical `user_id` тот же, что у бота). Никаких `userId` в теле/пути.
3. Сессия: TTL ≤ 30 дней, ротация при входе, отзыв при `logout`; FastAPI возвращает `401 unauthorized` для истёкшей/отозванной.

### B.1 Auth

| Endpoint | Запрос | Ответ |
|---|---|---|
| `POST /site/auth/telegram` | `{ id, first_name?, username?, photo_url?, auth_date, hash }` — данные Telegram Login Widget, как есть | `{ sessionToken, expiresAt, user: { id, displayName } }` |
| `POST /site/auth/logout` | — (сессия в заголовке) | `204` |
| `GET /site/auth/session` | — | `{ user: { id, displayName } }` или `401` |

Проверка Telegram Login **на FastAPI**: `secret = SHA256(bot_token)`, `hash == HMAC_SHA256(secret, data_check_string)` (поля, отсортированные по ключу, `key=value` через `\n`, без `hash`), сравнение constant-time; `auth_date` не старше 24 ч (рекомендуется 1 ч); один и тот же `hash` не принимается повторно (replay-кэш на TTL окна). Mini App `initData` — отдельный endpoint, не смешивать.

### B.2 Plans

`GET /plans` → `{ plans: Plan[], capabilities: Capabilities }` — формат как в части A. Цены и сроки — источник истины backend. Telegram Stars (`XTR`) отображаются, но оплачиваются только в боте.

### B.3 Orders (новая подписка)

`POST /me/orders`
Заголовки: `Idempotency-Key` (обязателен).
Тело: `{ "planId": "p_1m", "kind": "new", "paymentMethod": "yookassa" }`
Ответ `201` (или `200` при повторе): `Order`

Правила:
- Цена, валюта, срок и доступность тарифа вычисляются сервером и **фиксируются snapshot'ом** в заказе; сумму от клиента не принимаем.
- Ключ идемпотентности уникален в паре `(user_id, key)`, хранится ≥ 24 ч. Повтор с тем же ключом и теми же параметрами → тот же заказ; с другими (`planId`/`kind`) → `409 conflict`.
- `expiresAt` неоплаченного заказа задаёт сервер.

`GET /me/orders` → `{ orders: Order[] }`; `GET /me/orders/{id}` → `Order` (чужой → `404`).
`POST /me/orders/{id}/cancel` → `Order`; разрешено только из `created`/`awaiting_payment`, иначе `409`.

### B.4 Subscription и продление

`GET /me/subscription` → `Subscription`.

`POST /me/subscription/renew` — то же, что B.3, но `kind = "renewal"`. Без существующей подписки → `409 conflict`. При выдаче срок добавляется к `max(now, текущий expiresAt)`.

### B.5 VPN connection link

`GET /me/connection` → `{ url, test: false }` — ссылка подписки Remnawave. `404`, если подписки нет или доступ ещё не выдан. Ответ не логируется и не кэшируется (`no-store`).

### B.6 Devices

`GET /me/devices` → `{ limit, items: Device[] }` (`limit` — из тарифа/настроек).
`DELETE /me/devices/{id}` → `{ limit, items }`; чужое устройство → `404`. Отключение должно отзывать доступ в Remnawave.

### B.7 Payments

Платёжные провайдеры подключает **FastAPI**; сайт ничего не знает о ключах магазина. Интерфейс адаптера на стороне сайта — `src/lib/payments/types.ts` (`PaymentProviderAdapter`), реализации: `providers/mock-provider.ts` (работает только в demo), `providers/yookassa.ts` и `providers/crypto.ts` (всегда выключены, заглушки). Новый провайдер = новый адаптер + строка в `registry.ts`.

`GET /payments/methods` → `{ methods: [{ id, label, status, currencies }] }` — какие способы включены в backend (сайт показывает остальные как «Интеграция в работе / Отключено»).

`POST /me/orders/{id}/payments`
Заголовки: `Idempotency-Key` (ключ **платежа**, сайт генерирует и сохраняет до вызова провайдера).
Тело: `{ "method": "yookassa", "returnUrl": "https://<SITE_ORIGIN>/payment/return?orderId=<id>" }`
Ответ: `{ paymentId, providerPaymentId, status: "pending", checkoutUrl, expiresAt }`

- `returnUrl` проверяется по allowlist (`SITE_ORIGIN`); иначе `400`.
- Если по заказу уже есть платёж `pending` у того же провайдера — вернуть его (не создавать второй).
- Для ЮKassa: `POST /v3/payments` с заголовком `Idempotence-Key` = ключ платежа, `capture: true`, `confirmation.type = "redirect"`, `metadata.orderId`.

`POST /me/orders/{id}/verify` → `Order`. FastAPI **запрашивает статус у провайдера** (ЮKassa: `GET /v3/payments/{id}`), сверяет и применяет результат. Это вызывает страница возврата `/payment/return`; параметры URL возврата (`?status=success` и т. п.) никогда не являются подтверждением.

### B.8 Webhook / verify flow

```
Браузер ─► сайт /checkout ─► BFF POST /api/orders ─► FastAPI POST /me/orders (idempotent)
                                   └─► FastAPI POST /me/orders/{id}/payments ─► провайдер (Idempotence-Key)
Браузер ◄── checkoutUrl ── редирект на страницу провайдера ── оплата
Провайдер ─► FastAPI POST /payments/webhook/{provider}         (сайт в live webhooks не принимает)
Браузер ─► /payment/return?orderId= ─► BFF verify ─► FastAPI POST /me/orders/{id}/verify
                                                         └─► GET у провайдера, сверка, переход статуса
Браузер ─► /payment/success | /payment/error — оба перечитывают заказ с сервера
```

Обработка webhook на FastAPI (так же устроен mock в `payment-service.ts`):

1. Провайдер включён, иначе `404`.
2. Аутентичность: HMAC-подпись с окном времени (mock: `HMAC_SHA256(secret, "${timestamp}.${rawBody}")`, окно 5 мин, constant-time), либо — для ЮKassa, у которой нет подписи, — allowlist IP из документации ЮKassa **и** обязательный re-fetch.
3. Тело webhook — только подсказка: берём `providerPaymentId`, находим свой платёж и **перезапрашиваем** его у провайдера.
4. Сверка: `providerPaymentId`, `orderId` (metadata), `amount.amountMinor` и `currency` (с платежом **и** со snapshot заказа), магазин/окружение (`test` vs prod). Любое несовпадение → `verification_failed`, статус не меняется, событие логируется.
5. Только подтверждённый `succeeded` переводит заказ в `paid`. `canceled`/`failed`/`expired` меняют статус **платежа**, заказ остаётся оплачиваемым.
6. Дедупликация: уникальный ключ `provider:eventId` (или `provider:paymentId:status`), повтор → `200 { duplicate: true }` без побочных эффектов.
7. Выдача доступа (Remnawave) — ровно один раз на `orderId` (уникальный индекс / outbox). Если Remnawave недоступен — заказ `provisioning_pending`, повторы с backoff, reconciliation-джоба; повторная оплата не требуется.
8. Ответ провайдеру `200` быстро; тяжёлая работа — асинхронно.

### B.9 Тестовые сценарии, которые backend должен пройти

Повторяют `orasaka-site/tests/*.test.ts` (24 теста против mock):

- двойной `POST /me/orders` с одним ключом → один заказ; тот же ключ + другой план → 409;
- ключи идемпотентности изолированы между пользователями; чужой заказ → 404;
- повторный старт оплаты возвращает тот же платёж; отключённый провайдер → 422;
- `verify` до оплаты ничего не меняет;
- подписанный webhook → `active`; его повтор → `duplicate: true`, срок не продлевается дважды;
- изменённое тело, просроченный timestamp, отсутствие timestamp → 403;
- поддельный «succeeded» с верной подписью для неоплаченного платежа не меняет заказ (re-fetch);
- расхождение суммы → `verification_failed`, подписка не выдаётся;
- отмена платежа → заказ остаётся `awaiting_payment`, новый платёж создаётся;
- продление добавляет срок к текущему `expiresAt`;
- отмена заказа не выдаёт подписку; неоплаченный заказ истекает.
