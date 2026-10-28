# ORASAKA VPN — v23 (payments integration)

Base: `orasaka-site-v22.zip`. No redesign. No VPS/DNS. No live money. No secrets in git or chat. Local branch `cursor/orasaka-payments-v23-340f`. Primary deliverable is the zip + this REPORT (PR optional).

## Done

### 1. Production term / renewal rules

`VPN_DURATION_RULE` now selects an agreed rule. Renewal base is always `max(current end, grant time)`.

| Rule | Profile | Math |
| --- | --- | --- |
| `calendar-months` | public and isolated | N UTC calendar months; day-of-month kept when the target month has it |
| `fixed-day-blocks` | public and isolated | N × 30 days |
| `test-30-day-blocks` | isolated only | N × 30 days; public refuses to boot with it |

`termsReady()` / `paymentsReady()` / `cryptoChargeReady()` unlock only when a real rule is configured for the current profile. Public does **not** unlock by switching to isolated. Public stays blocked when the rule is unset. Documented in `.env.example`, `DEPLOY.md`, `BACKEND_HANDOFF.md`, `openapi/vpn-v1.yaml` (1.2.0). No tax rates invented.

Shared math: `src/lib/vpn/duration-rule.ts`. The HTTP adapter sends the configured rule on `POST /v1/grants`. The local VPN stand implements all three rules.

### 2. Crypto Pay (kept from v22, still valid)

Atomic confirm (invoice + order + one fulfillment job). No duplicate invoice after a lost create (payload search with pagination). Strict hosts: test → `https://testnet-pay.crypt.bot/api`, live → `https://pay.crypt.bot/api`. Local HTTP stand only with `CRYPTOPAY_LOCAL_STAND=1` + isolated; public refuses the flag. Invoices: `fiat=RUB`, `accepted_assets=USDT` for catalog 200/500/900/1600. RUB catalog price and paid USDT stay separate in history.

**Crypto Pay testnet was not called.** `CRYPTOPAY_API_TOKEN` is absent in this environment. Only the local HTTP stand / unit mocks were used. The stand is labeled «Это тестовый стенд Crypto Pay, не боевое списание USDT».

### 3. YooKassa

Charging stays off until server env has `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY`, and `YOOKASSA_MODE=test|live`. No invented credentials. Official API base only: `https://api.yookassa.ru/v3`. A local HTTP stand needs `YOOKASSA_LOCAL_STAND=1` + isolated; public refuses that flag. Webhook `/api/payments/webhook/yookassa` stays 404 until `paymentsReady()`. Test/live mismatch on the remote payment is still rejected (`test_in_live` / `mode_mismatch`). Absent keys → charging off; tests and local stand still work.

### 4. Fulfillment

Paid order → one `fulfillment` row → VPN grant idempotent across webhook replay and `npm run fulfill` restart. Real VPN API bind points are documented in `BACKEND_HANDOFF.md` (`GET /v1/users…`, `POST /v1/grants`, subscription/purchases/devices, revoke). Without `VPN_BASE_URL` + `VPN_API_TOKEN` the adapter stays `unconfigured` / local stand only.

## Check / build

- `npm run check` — typecheck, lint, **117** tests passed (was 112 in v22).
- `npm run build` — production build succeeded.

## Screenshots

Under Project `media/`:

- `v23-hero-desktop.png`
- `v23-telegram-desktop.png`
- `v23-header-360.png`
- `v23-header-395.png`
- `v23-pricing-desktop.png`
- `v23-checkout-public.png` — public, charging off → Telegram CTA
- `v23-checkout-isolated-stand.png` — isolated + local YooKassa stand label

## Owner env vars still needed (names only — no values)

Set on the server only; leave empty in git:

| Var | Purpose |
| --- | --- |
| `VPN_DURATION_RULE` | `calendar-months` **or** `fixed-day-blocks` for public |
| `PAYMENTS_READY` | `1` when ready to allow the buy button with YooKassa |
| `YOOKASSA_SHOP_ID` | Test shop, then live shop |
| `YOOKASSA_SECRET_KEY` | Matching secret |
| `YOOKASSA_MODE` | `test` then `live` |
| `CRYPTOPAY_ENABLED` | `1` |
| `CRYPTOPAY_API_TOKEN` | Testnet app, then live app |
| `CRYPTOPAY_MODE` | `test` then `live` |
| `VPN_BASE_URL` | Live VPN contract base |
| `VPN_API_TOKEN` | Bearer for that API |
| `ORASAKA_DB_PATH` | Absolute path outside the release dir |
| `SITE_ORIGIN` | Public `https://…` for return URLs / Origin checks |
| `TRUST_PROXY` | `1` behind nginx that overwrites `X-Forwarded-For` |
| Telegram / mail vars | As in `.env.example` when enabling login/mail |

Optional local-only (never on public VPS): `YOOKASSA_LOCAL_STAND`, `CRYPTOPAY_LOCAL_STAND`, `VPN_DURATION_RULE=test-30-day-blocks`, `ORASAKA_PROFILE=isolated`.

Receipt / tax parameters are **not** in code — confirm with YooKassa and accounting before enabling fiscalization.

## Not done in this pass

- Real Crypto Pay testnet charge
- Real YooKassa test-shop charge
- Live VPN API against production
- VPS deploy, DNS, HTTPS webhook registration in provider cabinets
- Choosing which production rule (`calendar-months` vs `fixed-day-blocks`) the owner will keep — both work; set one in env
