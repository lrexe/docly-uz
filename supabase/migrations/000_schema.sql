-- 000_schema.sql — базовая схема Docly.uz (запускать ПЕРВЫМ). Безопасно запускать повторно.

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint unique not null,
  first_name text,
  last_name text,
  telegram_username text,
  language text not null default 'ru' check (language in ('ru','uz')),
  balance bigint not null default 0,              -- в тийинах (1 сум = 100 тийин)
  free_generations_left integer not null default 1,
  is_premium boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists document_templates (
  id uuid primary key default gen_random_uuid(),
  category text not null,                          -- rent | business | claims
  slug text unique,
  title_ru text not null,
  title_uz text not null,
  description_ru text,
  description_uz text,
  icon text,
  price_tiyin integer not null default 0,
  form_schema jsonb not null default '[]'::jsonb,
  base_template_ru text,
  base_template_uz text,
  llm_system_prompt text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists generated_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  template_id uuid references document_templates(id),
  language text not null default 'ru',
  input_data jsonb,
  status text not null default 'generating' check (status in ('generating','completed','failed')),
  generated_content text,
  error_message text,
  llm_model text,
  llm_tokens_used integer,
  pdf_url text,
  docx_url text,
  created_at timestamptz not null default now()
);
create index if not exists generated_documents_user_idx on generated_documents (user_id, created_at desc);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  provider text,
  provider_trans_id text,
  amount_tiyin bigint,
  state smallint,
  reason smallint,
  create_time bigint,
  perform_time bigint,
  cancel_time bigint,
  created_at timestamptz not null default now()
);

-- RLS включён без политик: доступ только через service_role с нашего сервера.
alter table users enable row level security;
alter table document_templates enable row level security;
alter table generated_documents enable row level security;
alter table transactions enable row level security;

-- Приватный bucket для PDF/DOCX
insert into storage.buckets (id, name, public) values ('documents', 'documents', false)
on conflict (id) do nothing;
