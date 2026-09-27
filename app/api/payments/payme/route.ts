import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Payme (Paycom) Merchant API — https://developer.help.paycom.uz
 *
 * Expects a `transactions` table with (at minimum) the columns:
 *   id               uuid primary key default gen_random_uuid()
 *   provider         text            -- 'payme' | 'click'
 *   provider_trans_id text unique    -- Payme's `id` / Click's click_trans_id
 *   user_id          uuid references users(id)
 *   amount_tiyin     bigint          -- amount in tiyin (1 UZS = 100 tiyin)
 *   state            smallint        -- 1 pending, 2 performed, -1 cancelled (pending), -2 cancelled (performed)
 *   reason           smallint
 *   create_time      bigint          -- epoch ms
 *   perform_time     bigint
 *   cancel_time      bigint
 *   created_at       timestamptz default now()
 *
 * Env vars required:
 *   PAYME_MERCHANT_KEY   — test/prod key from Payme Business cabinet
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

const PAYME_MERCHANT_KEY = process.env.PAYME_MERCHANT_KEY ?? "";
const PENDING_TIMEOUT_MS = 12 * 60 * 60 * 1000; // 12h, per Payme spec

// Payme JSON-RPC error codes
const RpcError = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INSUFFICIENT_PRIVILEGE: -32504,
  SYSTEM_ERROR: -32400,
  INVALID_AMOUNT: -31001,
  TRANSACTION_NOT_FOUND: -31003,
  CANNOT_PERFORM_OPERATION: -31008,
  INVALID_ACCOUNT: -31050,
} as const;

function rpcError(id: unknown, code: number, ruMessage: string, uzMessage: string, enMessage: string, data?: string) {
  return NextResponse.json({
    jsonrpc: "2.0",
    id: id ?? null,
    error: {
      code,
      message: { ru: ruMessage, uz: uzMessage, en: enMessage },
      ...(data ? { data } : {}),
    },
  });
}

function rpcResult(id: unknown, result: Record<string, unknown>) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result });
}

function getSupabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

/** Validates the `Authorization: Basic base64(Paycom:KEY)` header Payme sends on every call. */
function isAuthorized(req: NextRequest): boolean {
  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Basic ")) return false;
  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf-8");
    const [login, key] = decoded.split(":");
    return login === "Paycom" && key === PAYME_MERCHANT_KEY && PAYME_MERCHANT_KEY.length > 0;
  } catch {
    return false;
  }
}

interface PaymeAccount {
  user_id?: string;
  [key: string]: unknown;
}

async function findUser(supabase: ReturnType<typeof getSupabaseAdmin>, account: PaymeAccount) {
  if (!account?.user_id) return null;
  const { data } = await supabase.from("users").select("id, balance").eq("id", account.user_id).maybeSingle();
  return data;
}

export async function POST(req: NextRequest) {
  let body: { method?: string; params?: Record<string, unknown>; id?: unknown };
  try {
    body = await req.json();
  } catch {
    return rpcError(null, RpcError.PARSE_ERROR, "Ошибка парсинга JSON", "JSON tahlil xatosi", "JSON parse error");
  }

  const { method, params = {}, id: rpcId } = body;

  if (!isAuthorized(req)) {
    return rpcError(
      rpcId,
      RpcError.INSUFFICIENT_PRIVILEGE,
      "Недостаточно привилегий для выполнения метода",
      "Metodni bajarish uchun huquqlar yetarli emas",
      "Insufficient privilege to perform this method"
    );
  }

  const supabase = getSupabaseAdmin();

  try {
    switch (method) {
      case "CheckPerformTransaction":
        return await handleCheckPerformTransaction(supabase, rpcId, params);
      case "CreateTransaction":
        return await handleCreateTransaction(supabase, rpcId, params);
      case "PerformTransaction":
        return await handlePerformTransaction(supabase, rpcId, params);
      case "CancelTransaction":
        return await handleCancelTransaction(supabase, rpcId, params);
      case "CheckTransaction":
        return await handleCheckTransaction(supabase, rpcId, params);
      default:
        return rpcError(rpcId, RpcError.METHOD_NOT_FOUND, "Метод не найден", "Metod topilmadi", "Method not found", String(method));
    }
  } catch (err) {
    console.error("[payme] unhandled error:", err);
    return rpcError(rpcId, RpcError.SYSTEM_ERROR, "Внутренняя ошибка сервера", "Serverda ichki xatolik", "Internal system error");
  }
}

// ---------------------------------------------------------------------------

async function handleCheckPerformTransaction(supabase: ReturnType<typeof getSupabaseAdmin>, rpcId: unknown, params: Record<string, unknown>) {
  const amount = Number(params.amount);
  const account = (params.account ?? {}) as PaymeAccount;

  if (!Number.isFinite(amount) || amount <= 0) {
    return rpcError(rpcId, RpcError.INVALID_AMOUNT, "Неверная сумма", "Noto'g'ri summa", "Invalid amount");
  }

  const user = await findUser(supabase, account);
  if (!user) {
    return rpcError(
      rpcId,
      RpcError.INVALID_ACCOUNT,
      "Пользователь не найден",
      "Foydalanuvchi topilmadi",
      "User not found",
      "user_id"
    );
  }

  return rpcResult(rpcId, { allow: true });
}

async function handleCreateTransaction(supabase: ReturnType<typeof getSupabaseAdmin>, rpcId: unknown, params: Record<string, unknown>) {
  const paymeId = String(params.id);
  const amount = Number(params.amount);
  const account = (params.account ?? {}) as PaymeAccount;

  const { data: existing } = await supabase
    .from("transactions")
    .select("*")
    .eq("provider", "payme")
    .eq("provider_trans_id", paymeId)
    .maybeSingle();

  if (existing) {
    if (existing.state !== 1) {
      return rpcError(rpcId, RpcError.CANNOT_PERFORM_OPERATION, "Невозможно выполнить операцию", "Amalni bajarib bo'lmaydi", "Unable to perform operation");
    }
    // Idempotent: Payme retried the same CreateTransaction call.
    return rpcResult(rpcId, { create_time: existing.create_time, transaction: existing.id, state: existing.state });
  }

  // Re-validate as CheckPerformTransaction would.
  if (!Number.isFinite(amount) || amount <= 0) {
    return rpcError(rpcId, RpcError.INVALID_AMOUNT, "Неверная сумма", "Noto'g'ri summa", "Invalid amount");
  }
  const user = await findUser(supabase, account);
  if (!user) {
    return rpcError(rpcId, RpcError.INVALID_ACCOUNT, "Пользователь не найден", "Foydalanuvchi topilmadi", "User not found", "user_id");
  }

  // Reject a second concurrent pending transaction for the same account (spec requires this).
  const { data: pending } = await supabase
    .from("transactions")
    .select("id, created_at")
    .eq("provider", "payme")
    .eq("user_id", user.id)
    .eq("state", 1)
    .maybeSingle();

  if (pending && Date.now() - new Date(pending.created_at).getTime() < PENDING_TIMEOUT_MS) {
    return rpcError(rpcId, RpcError.CANNOT_PERFORM_OPERATION, "Уже есть активная транзакция", "Faol tranzaksiya allaqachon mavjud", "A pending transaction already exists");
  }

  const createTime = Date.now();
  const { data: created, error } = await supabase
    .from("transactions")
    .insert({
      provider: "payme",
      provider_trans_id: paymeId,
      user_id: user.id,
      amount_tiyin: amount,
      state: 1,
      create_time: createTime,
    })
    .select()
    .single();

  if (error || !created) {
    console.error("[payme] CreateTransaction insert failed:", error);
    return rpcError(rpcId, RpcError.SYSTEM_ERROR, "Внутренняя ошибка сервера", "Serverda ichki xatolik", "Internal system error");
  }

  return rpcResult(rpcId, { create_time: createTime, transaction: created.id, state: 1 });
}

async function handlePerformTransaction(supabase: ReturnType<typeof getSupabaseAdmin>, rpcId: unknown, params: Record<string, unknown>) {
  const paymeId = String(params.id);
  const { data: tx } = await supabase.from("transactions").select("*").eq("provider", "payme").eq("provider_trans_id", paymeId).maybeSingle();

  if (!tx) {
    return rpcError(rpcId, RpcError.TRANSACTION_NOT_FOUND, "Транзакция не найдена", "Tranzaksiya topilmadi", "Transaction not found");
  }

  if (tx.state === 2) {
    // Idempotent replay.
    return rpcResult(rpcId, { transaction: tx.id, perform_time: tx.perform_time, state: 2 });
  }

  if (tx.state !== 1) {
    return rpcError(rpcId, RpcError.CANNOT_PERFORM_OPERATION, "Невозможно выполнить операцию", "Amalni bajarib bo'lmaydi", "Unable to perform operation");
  }

  if (Date.now() - Number(tx.create_time) > PENDING_TIMEOUT_MS) {
    const cancelTime = Date.now();
    await supabase.from("transactions").update({ state: -1, cancel_time: cancelTime, reason: 4 }).eq("id", tx.id);
    return rpcError(rpcId, RpcError.CANNOT_PERFORM_OPERATION, "Время ожидания истекло", "Kutish vaqti tugadi", "Transaction expired");
  }

  const performTime = Date.now();

  // Credit the user's balance atomically.
  const { error: creditError } = await supabase.rpc("increment_user_balance", {
    p_user_id: tx.user_id,
    p_amount_tiyin: tx.amount_tiyin,
  });
  if (creditError) {
    console.error("[payme] balance credit failed:", creditError);
    return rpcError(rpcId, RpcError.SYSTEM_ERROR, "Внутренняя ошибка сервера", "Serverda ichki xatolik", "Internal system error");
  }

  await supabase.from("transactions").update({ state: 2, perform_time: performTime }).eq("id", tx.id);

  return rpcResult(rpcId, { transaction: tx.id, perform_time: performTime, state: 2 });
}

async function handleCancelTransaction(supabase: ReturnType<typeof getSupabaseAdmin>, rpcId: unknown, params: Record<string, unknown>) {
  const paymeId = String(params.id);
  const reason = Number(params.reason ?? 0);

  const { data: tx } = await supabase.from("transactions").select("*").eq("provider", "payme").eq("provider_trans_id", paymeId).maybeSingle();

  if (!tx) {
    return rpcError(rpcId, RpcError.TRANSACTION_NOT_FOUND, "Транзакция не найдена", "Tranzaksiya topilmadi", "Transaction not found");
  }

  if (tx.state === -1 || tx.state === -2) {
    // Idempotent replay.
    return rpcResult(rpcId, { transaction: tx.id, cancel_time: tx.cancel_time, state: tx.state });
  }

  const cancelTime = Date.now();

  if (tx.state === 2) {
    // Was already performed — reverse the balance credit.
    const { error: debitError } = await supabase.rpc("increment_user_balance", {
      p_user_id: tx.user_id,
      p_amount_tiyin: -tx.amount_tiyin,
    });
    if (debitError) {
      console.error("[payme] balance reversal failed:", debitError);
      return rpcError(rpcId, RpcError.SYSTEM_ERROR, "Внутренняя ошибка сервера", "Serverda ichki xatolik", "Internal system error");
    }
    await supabase.from("transactions").update({ state: -2, cancel_time: cancelTime, reason }).eq("id", tx.id);
    return rpcResult(rpcId, { transaction: tx.id, cancel_time: cancelTime, state: -2 });
  }

  // state === 1: was never performed, nothing to reverse.
  await supabase.from("transactions").update({ state: -1, cancel_time: cancelTime, reason }).eq("id", tx.id);
  return rpcResult(rpcId, { transaction: tx.id, cancel_time: cancelTime, state: -1 });
}

async function handleCheckTransaction(supabase: ReturnType<typeof getSupabaseAdmin>, rpcId: unknown, params: Record<string, unknown>) {
  const paymeId = String(params.id);
  const { data: tx } = await supabase.from("transactions").select("*").eq("provider", "payme").eq("provider_trans_id", paymeId).maybeSingle();

  if (!tx) {
    return rpcError(rpcId, RpcError.TRANSACTION_NOT_FOUND, "Транзакция не найдена", "Tranzaksiya topilmadi", "Transaction not found");
  }

  return rpcResult(rpcId, {
    create_time: tx.create_time ?? 0,
    perform_time: tx.perform_time ?? 0,
    cancel_time: tx.cancel_time ?? 0,
    transaction: tx.id,
    state: tx.state,
    reason: tx.reason ?? null,
  });
}