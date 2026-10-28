# Передача backend: предложенный контракт VPN

Эти маршруты **предложены сайтом**. Их нет в Remnawave и их нет у действующего бота. Вставка `VPN_BASE_URL` в прод не делает сайт совместимым с неизвестным API: адаптер проверяет эту форму ответа. Пока backend не реализует контракт или не будет сопоставлен с ним в одном адаптере (`src/lib/vpn/http-adapter.ts`), итог такой: сайт проверен на согласуемом контрактном стенде, реализация или сопоставление backend ещё нужны.

Машиночитаемая копия: `openapi/vpn-v1.yaml`, версия `1.2.0`.

Локальный стенд, не бот и не Remnawave:

```bash
cd orasaka-site
node --experimental-strip-types --import ./scripts/register-ts.mjs scripts/vpn-stand.mts
```

Он слушает `127.0.0.1` и печатает `vpn-stand http://127.0.0.1:<port>`. Авторизация сайта: `Authorization: Bearer <VPN_API_TOKEN>`. Стенд не читает SQLite сайта и не читает таблицы двойника.

`/control/*` и `/oidc/id-token` — только стенд. Сайт их не вызывает. Боевой IdP остаётся `https://oauth.telegram.org`.

## Операции

| Метод и путь | Зачем | Успех | Ошибка |
| --- | --- | --- | --- |
| `GET /v1/users?telegram_id=` или `email=` или `id=` | Найти пользователя. Логин и синхронизация только ищут, пользователя не создают. | `200 { user: { id, telegram_id, email } \| null }` | `401 forbidden`, обрыв сети, таймаут, не-JSON |
| `POST /v1/users` | Связать существующего или создать одного. Повтор того же Telegram id не создаёт второго. | `200 { user, created }` | `409 conflict` |
| `GET /v1/users/{id}/subscription` | Стабильный id, статус, `expires_at`, `term_months`, `limits.device_limit`, `connection.url` | `200` | `404` — подписки нет. Это не пустая история и не пустой список устройств |
| `GET /v1/users/{id}/purchases?cursor=` | История оплат, страница вперёд и назад | `200 { items, next_cursor, prev_cursor, boundary }` | `503` — ошибка только этого раздела. `order_id` в строке — id заказа сайта, если это та же оплата; `id` строки им не является. Валюта только `RUB`. `boundary: not_stored` значит истории нет |
| `GET /v1/users/{id}/devices` | Строки, лимит, последняя активность, отдельное поле `online`: `known` или `unknown` | `200` | `503`. `online: unknown` — это не ноль. `limit: null` — лимит владельцем не задан |
| `POST /v1/users/{id}/devices/{deviceId}/revoke` | Отзыв только своего устройства | `200 { ok: true }` | `404 not_found`, если устройство не этого пользователя |
| `POST /v1/grants` | Идемпотентная выдача или продление по `order_id` | `200 { ref, expires_at, term_months, connection_url, already_granted }` | `409 conflict` или `409 duration_unconfigured`. Повтор того же `order_id` срок не удлиняет |

## Правило срока

Тело выдачи содержит `duration_rule`. База продления всегда `max(текущее окончание, время выдачи)`. Стенд и сайт принимают:

| Значение | Где | Как считается |
| --- | --- | --- |
| `calendar-months` | public и isolated | N календарных месяцев UTC; день месяца сохраняется, если он есть в целевом месяце |
| `fixed-day-blocks` | public и isolated | N × 30 суток |
| `test-30-day-blocks` | только isolated | N × 30 суток; public с ним не стартует |

Сайт шлёт `duration_rule` из `VPN_DURATION_RULE` через `configuredDurationRule()`. Пустое или неизвестное значение → `duration_unconfigured`, срок не меняется, платёж не создаётся. Уже оплаченный заказ в этом состоянии помечается ошибкой выдачи, а не ждёт бесконечно. Переключение public→isolated само по себе оплату не открывает.

## Точки привязки к живому VPN API

Пока `VPN_API_TOKEN` и `VPN_BASE_URL` пусты, адаптер `unconfigured`: кабинет не рисует нули, выдача не идёт. Локальный стенд (`scripts/vpn-stand.mts`) — не боевой бот. Реальные вызовы сайта:

1. `GET /v1/users?telegram_id=` / `email=` / `id=` — логин и sync только ищут.
2. `POST /v1/grants` — одна идемпотентная выдача/продление на `order_id` после оплаты (webhook или `npm run fulfill`).
3. `GET /v1/users/{id}/subscription|purchases|devices` — кабинет.
4. `POST /v1/users/{id}/devices/{deviceId}/revoke` — отзыв устройства.

Повтор webhook и перезапуск воркера не создают вторую задачу выдачи и не удлиняют срок дважды: `fulfillment` одна строка на заказ, `grants` идемпотентны по `order_id`.

`limits.device_limit` в стенде `null`. Полей трафика и стран в контракте нет: владелец их не задал.

Ошибки различаются телом `{ "error": "not_found" | "conflict" | "down" | "forbidden" | "duration_unconfigured" }` и кодом HTTP. Таймаут и не-JSON сайт считает отдельными причинами и не подставляет пустую подписку.
