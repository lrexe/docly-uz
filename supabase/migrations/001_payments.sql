-- 001_payments.sql
-- Колонки таблицы transactions, которые используют вебхуки Payme/Click,
-- и атомарная функция изменения баланса. Безопасно запускать повторно.

alter table transactions add column if not exists provider text;
alter table transactions add column if not exists provider_trans_id text;
alter table transactions add column if not exists amount_tiyin bigint;
alter table transactions add column if not exists state smallint;
alter table transactions add column if not exists reason smallint;
alter table transactions add column if not exists create_time bigint;
alter table transactions add column if not exists perform_time bigint;
alter table transactions add column if not exists cancel_time bigint;

create unique index if not exists transactions_provider_trans_uidx
  on transactions (provider, provider_trans_id);

create or replace function increment_user_balance(p_user_id uuid, p_amount_tiyin bigint)
returns void
language sql
security definer
as $$
  update users set balance = coalesce(balance, 0) + p_amount_tiyin where id = p_user_id;
$$;

revoke all on function increment_user_balance(uuid, bigint) from public, anon, authenticated;
