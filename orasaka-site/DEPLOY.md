# Запуск ORASAKA site

Два профиля. `ORASAKA_PROFILE=public` (и пустое значение) — единственный для публичного VPS. `ORASAKA_PROFILE=isolated` — только локальный стенд. На публичный VPS isolated ставить нельзя: процесс не стартует с `MAIL_MODE=dev`, `VPN_MODE=double`, `SMTP_INSECURE=1`, с `TELEGRAM_OIDC_ISSUER`, отличным от пустого и `https://oauth.telegram.org`, или с `VPN_DURATION_RULE=test-30-day-blocks`.

Секреты создаются в окружении процесса и в архив не входят. Файл `.env` в репозиторий не класть. SQLite тоже.

`SITE_MODE` и `SITE_ORIGIN` читаются при `npm run build`. Для стенда ниже собирать с пустыми значениями: режим остаётся public, адрес возврата берётся из страницы, которую открыли в браузере.

## Публичный хост

Боевые правила срока: `VPN_DURATION_RULE=calendar-months` или `fixed-day-blocks`. Без одного из них `termsReady` ложен и кнопка покупки деньги не списывает. Тестовое правило `test-30-day-blocks` на public не ставить: процесс не стартует. Переключение профиля в isolated само по себе оплату не открывает.

```bash
cd orasaka-site
npm ci
npm run build
ORASAKA_PROFILE=public \
ORASAKA_DB_PATH=/var/lib/orasaka/site.sqlite \
TRUST_PROXY=1 \
npx next start -H 127.0.0.1 -p 3000
```

Порт приложения не публиковать. Перед ним nginx, и заголовок клиента нужно **заменять**, не дописывать:

```nginx
proxy_set_header X-Forwarded-For $remote_addr;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header Host $host;
```

`TRUST_PROXY=1` читает `X-Forwarded-For`, только если в нём один адрес. Пустой `TRUST_PROXY` заголовок игнорирует. Пока нет настоящих юридических текстов, сайт остаётся `noindex`.

Воркер на том же файле базы, тем же профилем:

```bash
ORASAKA_PROFILE=public ORASAKA_DB_PATH=/var/lib/orasaka/site.sqlite npm run fulfill
```

## Чистый локальный стенд

Это не боевой бот, не Remnawave и не магазин ЮKassa. База стенда — отдельный файл, не `/var/lib/orasaka/site.sqlite`. Четыре процесса. Секреты ниже генерируются на месте.

```bash
cd orasaka-site
npm ci
npm run build
export ORASAKA_CODE_SECRET="$(openssl rand -hex 24)"
export VPN_API_TOKEN="$(openssl rand -hex 24)"
export TELEGRAM_LOGIN_CLIENT_ID=10001
export TELEGRAM_LOGIN_CLIENT_SECRET="$(openssl rand -hex 24)"
export PAY_STAND_SECRET="$(openssl rand -hex 24)"
export ORASAKA_DB_PATH=/tmp/orasaka-stand.sqlite
rm -f "$ORASAKA_DB_PATH" "$ORASAKA_DB_PATH-wal" "$ORASAKA_DB_PATH-shm"
```

Терминал 1, VPN и OIDC стенда. Слушает только `127.0.0.1` и печатает свой URL. Запомните порт.

```bash
VPN_API_TOKEN="$VPN_API_TOKEN" \
TELEGRAM_LOGIN_CLIENT_ID="$TELEGRAM_LOGIN_CLIENT_ID" \
TELEGRAM_LOGIN_CLIENT_SECRET="$TELEGRAM_LOGIN_CLIENT_SECRET" \
PORT=3215 \
node --experimental-strip-types --import ./scripts/register-ts.mjs scripts/vpn-stand.mts
```

Терминал 2, платёжный HTTP. Это не `https://api.yookassa.ru`. Процесс печатает `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY` и `YOOKASSA_API_BASE`. Скопируйте их в окружение терминалов 3 и 4. Рестарт этого процесса стирает незавершённые платежи: старая страница оплаты отвечает, что платёж не найден.

```bash
PAY_STAND_SECRET="$PAY_STAND_SECRET" PORT=3315 \
node --experimental-strip-types --import ./scripts/register-ts.mjs scripts/pay-stand.mts
```

Терминал 3, сайт только на `127.0.0.1`. `VPN_DURATION_RULE=test-30-day-blocks` — тестовое правило этого стенда, не правило месяца для боя. Без него кнопка покупки не включается.

```bash
ORASAKA_PROFILE=isolated \
ORASAKA_DB_PATH="$ORASAKA_DB_PATH" \
MAIL_MODE=dev \
ORASAKA_CODE_SECRET="$ORASAKA_CODE_SECRET" \
VPN_BASE_URL=http://127.0.0.1:3215 \
VPN_API_TOKEN="$VPN_API_TOKEN" \
VPN_DURATION_RULE=test-30-day-blocks \
TELEGRAM_LOGIN_CLIENT_ID="$TELEGRAM_LOGIN_CLIENT_ID" \
TELEGRAM_LOGIN_CLIENT_SECRET="$TELEGRAM_LOGIN_CLIENT_SECRET" \
TELEGRAM_OIDC_ISSUER=http://127.0.0.1:3215 \
PAYMENTS_READY=1 \
YOOKASSA_SHOP_ID=<из терминала 2> \
YOOKASSA_SECRET_KEY=<из терминала 2> \
YOOKASSA_MODE=test \
YOOKASSA_API_BASE=http://127.0.0.1:3315/v3 \
YOOKASSA_LOCAL_STAND=1 \
npx next start -H 127.0.0.1 -p 3115
```


Терминал 4 — тот же набор переменных, что у сайта, и команда `npm run fulfill`. Её имеет смысл повторять после оплаты. Страница возврата тоже запрашивает платёж и выдаёт доступ, если правила срока заданы.

### Регистрация

1. Открыть `http://127.0.0.1:3115/login`.
2. Ввести email и нажать «Продолжить по email». `MAIL_MODE=dev` — локальный ящик, не SMTP. Код подставляется в поле. В лог он не пишется.
3. Подтвердить. Кабинет пустой. Повторный вход тем же адресом открывает тот же аккаунт.

### Покупка

1. Открыть `http://127.0.0.1:3115/pricing`. На публичных карточках кнопка «Купить» ведёт на `/checkout`. Сумма 200 / 500 / 900 / 1600 ₽ считается на сервере. Без готовой оплаты страница оформления не списывает деньги.
2. «Перейти к оплате», затем открыть ссылку страницы оплаты. Это страница стенда из терминала 2.
3. «Отметить оплаченным» возвращает браузер на сайт. Адрес возврата оплату не доказывает: статус читается со стенда ещё раз.
4. На статусе заказа будет «оплачен и выдан». В подписке виден новый срок. Повторный `npm run fulfill` и повторное уведомление срок не удлиняют.
5. Отмена: новое оформление и кнопка «Отменить платёж». Заказ становится отменённым, срок не меняется.
6. Рестарт оплаты: остановить терминал 2 и запустить ту же команду. Старый платёж пропадает. Новое оформление создаёт новый.

Кнопка входа через Telegram на этом запуске подписана как контрактный стенд. Это не действующий бот.

## База

`ORASAKA_DB_PATH` — абсолютный путь вне каталога релиза. У сайта и `npm run fulfill` путь один. Для стенда это `/tmp/orasaka-stand.sqlite`. Для public — свой файл, например `/var/lib/orasaka/site.sqlite`, каталог `0700` у пользователя сервиса.

Схема применяется при открытии (`src/lib/server/schema.ts`, копия `db/001_site_orders.sql`). Режим WAL. Пользователи VPN живут в памяти стенда, не в этом файле.

Оплата и постановка выдачи пишутся одной транзакцией. Закрытие выдачи — тоже. Если процесс умер между двумя старыми записями, следующий `npm run fulfill` дописывает отсутствующую задачу или закрывает заказ, у которого выдача уже успешна.

## Воркер

`npm run fulfill` сверяет открытые платежи, только когда оплата готова (флаг, ключи и правило срока), чинит разорванные локальные строки и выдаёт оплаченные заказы. Повтор не удлиняет уже выданный заказ. Ошибочную выдачу возвращает оператор:

```bash
npm run fulfill -- --requeue=<order id>
```

Успешную выдачу `--requeue` не трогает. Два параллельных запуска не должны удваивать срок: выдача идемпотентна по `order_id`, локальные записи сериализуются транзакцией.

Без согласованного правила срока платёж не создаётся. Если оплаченный заказ всё же остался без правила, выдача получает ошибку `duration_unconfigured`, а не вечную очередь. После появления правила её возвращает `--requeue`.

## Почта

Стенд: `MAIL_MODE=dev` и `ORASAKA_CODE_SECRET` не короче 16 символов. Код лежит в таблице `dev_mailbox` и показывается в форме входа. На public этот режим не стартует.

Боевая почта: `MAIL_MODE=smtp`, `SMTP_HOST`, `SMTP_PORT` (по умолчанию 587 и STARTTLS), `SMTP_FROM`, при необходимости `SMTP_USER` и `SMTP_PASS`. Порт 465 или `SMTP_SECURE=1` — неявный TLS. Проверка сертификата включена. `SMTP_INSECURE=1` на public не стартует. Код в лог не пишется. Лимиты: 5 писем в час на адрес, 20 на IP, повтор не чаще 30 секунд. Ответ не говорит, есть ли аккаунт.

## Telegram

Боевой вход — OIDC `https://oauth.telegram.org`, `TELEGRAM_LOGIN_CLIENT_ID` и `TELEGRAM_LOGIN_CLIENT_SECRET`. В Allowed URLs бота должен быть публичный origin сайта. Либо старый виджет: `TELEGRAM_BOT_TOKEN` и `TELEGRAM_BOT_USERNAME` вместе. Идентичность — числовой id.

`TELEGRAM_OIDC_ISSUER` пустой означает официальный issuer. На стенде это URL VPN-стенда. Public с другим issuer не стартует.

## VPN

`VPN_BASE_URL` и `VPN_API_TOKEN`. Таймаут `VPN_TIMEOUT_MS` (по умолчанию 4 секунды, границы 200–20000). Адаптер: `src/lib/vpn/http-adapter.ts`. Контракт: `openapi/vpn-v1.yaml` и `BACKEND_HANDOFF.md`. Это не Remnawave. `VPN_MODE=double` — только isolated и только старые тесты.

Подписка, история и устройства читаются отдельно. Ответ 404 у подписки не стирает историю и устройства, которые уже ответили 200. `order_id` в истории — общий id с заказом сайта. Пагинация истории использует найденный VPN-id, в том числе если пользователь найден по email.

## ЮKassa

На стенде `YOOKASSA_API_BASE` указывает на локальный процесс, `YOOKASSA_MODE=test`, и нужен `YOOKASSA_LOCAL_STAND=1` в isolated. Public с этим флагом не стартует. Боевой магазин — свои shop id и секрет, база только `https://api.yookassa.ru/v3`, и `VPN_DURATION_RULE=calendar-months` или `fixed-day-blocks`. Без ключей, без режима или без правила срока кнопка не списывает. Вебхук без готовой оплаты отвечает 404.

Сумму заказа считает сервер: `1m/3m/6m/12m` = 200/500/900/1600 ₽. Вебхук — повод перечитать платёж и сверить магазин, заказ, сумму, валюту и test-флаг. Чеки, реквизиты и автосписание не включены. Покупка в Telegram-боте остаётся.

## Обновление, копия, откат

Согласованная копия, пока сайт или воркер ещё пишут, делается через SQLite `VACUUM INTO` (`backupDatabase` в `src/lib/server/store.ts`). Отдельного метода backup в `node:sqlite` нет. `VACUUM INTO` собирает WAL в один файл.

Копировать файлы `db`, `-wal` и `-shm` можно только после остановки всех писателей: и `next start`, и `npm run fulfill`. Остановки одного воркера недостаточно. Копия только основного файла без остановки писателей может потерять последние записи.

1. Остановить сайт и воркер.
2. Сделать `VACUUM INTO` в новый файл вне каталога релиза либо, уже после остановки, скопировать все три файла.
3. Поставить новый релиз рядом. `ORASAKA_DB_PATH` не менять.
4. `npm ci && npm run build`, затем сайт и один прогон воркера.
5. Откат кода — предыдущий релиз и та же база.
6. Возврат старого файла базы после новых реальных оплат сам по себе небезопасен: заказы, которых нет в старом файле, локально пропадают. Их нужно заново сверить с платёжным провайдером (воркер перечитывает открытые платежи; уже выданные после снимка без этой сверки не восстановить из файла). Повторный `npm run fulfill` не должен удлинять заказ, который в восстановленной базе уже выдан.
