// lib/supabase/client.ts
// Браузерный Supabase-клиент (anon key, работает под Row Level Security).
// Безопасен для импорта из 'use client' компонентов.
// SERVICE ROLE ключ здесь использовать НЕЛЬЗЯ — он утечёт в бандл браузера.
// Для серверного кода см. lib/supabase/server.ts.

import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';

let browserClient: SupabaseClient | null = null;

export function createClient(): SupabaseClient {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY должны быть заданы');
  }

  browserClient = createSupabaseClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return browserClient;
}
