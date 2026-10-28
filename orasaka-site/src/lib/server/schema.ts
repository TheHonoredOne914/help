/** Applied by openStore. double_* is the isolated test double, not Remnawave and not the bot. */
export const SCHEMA_SQL = `-- Applied on open by src/lib/server/store.ts (node:sqlite).
-- Not a VPN user database. double_* rows are the isolated test double only.

create table site_account (
  id text primary key,
  email text unique,
  email_verified_at text,
  telegram_id text unique,
  vpn_user_ref text unique,
  created_at text not null
);

create table site_session (
  id_hash text primary key,
  account_id text not null references site_account (id),
  expires_at text not null
);

create table email_challenge (
  id text primary key,
  email text not null,
  code_mac text not null,
  expires_at text not null,
  attempts integer not null default 0,
  consumed_at text,
  sent_at text not null
);

create table email_send_log (
  id integer primary key,
  email text not null,
  ip text not null,
  sent_at text not null
);

create table dev_mailbox (
  email text primary key,
  code text not null,
  challenge_id text not null,
  sent_at text not null
);

create table site_order (
  id text primary key,
  account_id text not null references site_account (id),
  catalog_version text not null,
  plan_id text not null,
  term_months integer not null check (term_months > 0),
  amount_minor integer not null check (amount_minor > 0),
  currency text not null check (currency = 'RUB'),
  kind text not null check (kind in ('new', 'renewal')),
  status text not null check (
    status in ('awaiting_payment', 'paid', 'active', 'canceled', 'failed')
  ),
  idempotency_key text not null unique,
  created_at text not null
);

create table site_payment (
  id text primary key,
  order_id text not null unique references site_order (id),
  provider text not null,
  provider_payment_id text,
  idempotency_key text not null unique,
  amount_minor integer not null check (amount_minor > 0),
  currency text not null check (currency = 'RUB'),
  test integer,
  status text not null,
  checkout_url text,
  shop_id text not null,
  unique (provider, provider_payment_id)
);

create table fulfillment (
  order_id text primary key references site_order (id),
  status text not null check (status in ('pending', 'succeeded', 'failed')),
  attempts integer not null default 0,
  next_attempt_at text,
  vpn_user_ref text,
  last_error text,
  updated_at text not null
);

create table used_proof (
  hash text primary key,
  used_at text not null
);

create table login_attempt (
  id_hash text primary key,
  expires_at text not null,
  consumed_at text
);

create table double_vpn_user (
  ref text primary key,
  telegram_id text unique,
  expires_at text,
  term_months integer,
  connection_url text,
  username text
);

create table double_grant (
  order_id text primary key,
  ref text not null,
  granted_at text not null
);

create table double_control (
  id integer primary key check (id = 1),
  down integer not null
);

insert into double_control (id, down) values (1, 0);
`;
