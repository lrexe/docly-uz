// lib/payments/payme.ts
// Хелперы для интеграции с Payme (Paycom) Merchant API: JSON-RPC 2.0 протокол.
// Документация: https://developer.help.paycom.uz/
//
// Payme шлёт все запросы на один эндпоинт (app/api/payments/payme/route.ts) методом POST
// с телом { method, params, id } и авторизацией через HTTP Basic Auth, где
// login = "Paycom", password = Merchant Key (секрет из личного кабинета Payme).
//
// ВАЖНО: Payme всегда ожидает HTTP 200, даже для ошибок — код ошибки передаётся
// внутри JSON-RPC объекта `error`, а не через HTTP-статус.

/**
 * Состояния транзакции в терминах Payme (используются в CheckTransaction/CreateTransaction
 * и т.д.). Хранятся у нас в `transactions.raw_payload.payme_state`.
 */
export const PAYME_TRANSACTION_STATE = {
  CREATED: 1, // транзакция создана, ожидает подтверждения (PerformTransaction)
  COMPLETED: 2, // успешно проведена
  CANCELLED: -1, // отменена ДО подтверждения
  CANCELLED_AFTER_COMPLETE: -2, // отменена ПОСЛЕ подтверждения (возврат)
} as const;

/**
 * Коды ошибок JSON-RPC для Payme. Первые несколько — стандартные коды из спецификации
 * Payme; ORDER_NOT_FOUND и ORDER_ALREADY_HAS_TRANSACTION — кастомные коды в диапазоне,
 * зарезервированном протоколом под ошибки, специфичные для конкретного мерчанта
 * (обычно используется диапазон -31050..-31099).
 */
export const PAYME_ERROR = {
  PARSE_ERROR: -32700,
  METHOD_NOT_FOUND: -32601,
  INSUFFICIENT_PRIVILEGE: -32504, // неверный Basic Auth (login/merchant key)
  INVALID_AMOUNT: -31001,
  TRANSACTION_NOT_FOUND: -31003,
  UNABLE_TO_CANCEL: -31007,
  UNABLE_TO_PERFORM: -31008, // неверное состояние транзакции для этой операции
  ORDER_NOT_FOUND: -31050, // кастомный: order_id из account не найден в БД
  ORDER_ALREADY_HAS_TRANSACTION: -31051, // кастомный: заказ уже привязан к другой транзакции Payme
} as const;

export interface PaymeRpcRequest<TParams = Record<string, unknown>> {
  method: string;
  params: TParams;
  id: number | string | null;
}

export interface PaymeCheckPerformParams {
  amount: number; // в тийинах
  account: { order_id: string };
}

export interface PaymeCreateTransactionParams {
  id: string; // ID транзакции на стороне Payme
  time: number; // unix ms, предложенное Payme время создания
  amount: number;
  account: { order_id: string };
}

export interface PaymeTransactionIdParams {
  id: string; // ID транзакции на стороне Payme
}

export interface PaymeCancelTransactionParams extends PaymeTransactionIdParams {
  reason: number;
}

/**
 * Проверяет HTTP Basic Auth заголовок против Merchant Key из личного кабинета Payme.
 * Ожидаемый формат: `Authorization: Basic base64("Paycom:<merchant_key>")`.
 */
export function validatePaymeAuth(authorizationHeader: string | null, merchantKey: string): boolean {
  if (!authorizationHeader?.startsWith('Basic ')) return false;

  try {
    const decoded = Buffer.from(authorizationHeader.slice(6), 'base64').toString('utf-8');
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex === -1) return false;

    const login = decoded.slice(0, separatorIndex);
    const password = decoded.slice(separatorIndex + 1);

    return login === 'Paycom' && password === merchantKey;
  } catch {
    return false;
  }
}

/** Формирует успешный JSON-RPC 2.0 ответ. */
export function buildPaymeResult(id: number | string | null, result: Record<string, unknown>) {
  return { jsonrpc: '2.0', id, result };
}

/** Формирует JSON-RPC 2.0 ответ с ошибкой (структура `error` соответствует спецификации Payme). */
export function buildPaymeError(
  id: number | string | null,
  code: number,
  message: string,
  data?: Record<string, unknown>
) {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message: { ru: message, uz: message, en: message },
      ...(data ? { data } : {}),
    },
  };
}