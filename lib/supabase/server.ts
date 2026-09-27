// lib/supabase/server.ts
// Серверный Supabase-клиент для использования ИСКЛЮЧИТЕЛЬНО внутри Route Handlers
// (app/api/**/route.ts) и Server Components/Actions. Использует SERVICE ROLE ключ,
// который обходит Row Level Security — поэтому этот клиент НИКОГДА не должен
// импортироваться в клиентский ('use client') код или утекать в бандл браузера.
//
// Модель безопасности: авторизация пользователя происходит на уровне API route
// через validateTelegramInitData() ДО любого обращения к этому клиенту. Сам Supabase
// не знает о Telegram-пользователях — доверенной границей является наш backend.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
// Импортируйте типизацию, как только она будет сгенерирована из БД
// (`supabase gen types typescript --project-id <id> > types/database.ts`),
// и замените `Database = any` на `import type { Database } from '@/types/database'`.
type Database = any;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL не задан в переменных окружения');
}
if (!serviceRoleKey) {
  throw new Error(
    'SUPABASE_SERVICE_ROLE_KEY не задан в переменных окружения. ' +
      'Никогда не используйте anon key на сервере для операций, требующих обхода RLS.'
  );
}

// Синглтон: избегаем создания нового клиента (и нового пула соединений) на каждый
// вызов createServerSupabaseClient() в рамках одного serverless-инстанса/lambda.
let cachedClient: SupabaseClient<Database> | null = null;

/**
 * Возвращает серверный Supabase-клиент с правами service_role.
 * Использовать только внутри app/api/**\/route.ts после валидации initData.
 */
export function createServerSupabaseClient(): SupabaseClient<Database> {
  if (cachedClient) return cachedClient;

  cachedClient = createClient<Database>(supabaseUrl!, serviceRoleKey!, {
    auth: {
      // Service role клиенту не нужна персистентная сессия — каждый запрос независим.
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        'X-Client-Info': 'docly-uz-server',
      },
    },
  });

  return cachedClient;
}