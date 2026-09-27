import crypto from "crypto";

/**
 * Click.uz (Click Evolution) payment gateway helpers.
 * Docs: https://docs.click.uz/en/click-api-request/
 *
 * Env vars required:
 *   CLICK_SERVICE_ID
 *   CLICK_MERCHANT_ID
 *   CLICK_SECRET_KEY
 */

export const CLICK_SERVICE_ID = process.env.CLICK_SERVICE_ID ?? "";
export const CLICK_MERCHANT_ID = process.env.CLICK_MERCHANT_ID ?? "";
export const CLICK_SECRET_KEY = process.env.CLICK_SECRET_KEY ?? "";

/** Action codes Click sends in the `action` field */
export enum ClickAction {
  Prepare = 0,
  Complete = 1,
}

/** Standard Click error codes returned in the `error` field of every response */
export const ClickError = {
  SUCCESS: 0,
  SIGN_CHECK_FAILED: -1,
  INCORRECT_AMOUNT: -2,
  ACTION_NOT_FOUND: -3,
  ALREADY_PAID: -4,
  USER_NOT_FOUND: -5,
  TRANSACTION_NOT_FOUND: -6,
  FAILED_TO_UPDATE_USER: -7,
  BAD_REQUEST: -8,
  TRANSACTION_CANCELLED: -9,
} as const;

export type ClickErrorCode = (typeof ClickError)[keyof typeof ClickError];

export const ClickErrorNote: Record<number, string> = {
  [ClickError.SUCCESS]: "Success",
  [ClickError.SIGN_CHECK_FAILED]: "SIGN CHECK FAILED!",
  [ClickError.INCORRECT_AMOUNT]: "Incorrect parameter amount",
  [ClickError.ACTION_NOT_FOUND]: "Action not found",
  [ClickError.ALREADY_PAID]: "Already paid",
  [ClickError.USER_NOT_FOUND]: "User does not exist",
  [ClickError.TRANSACTION_NOT_FOUND]: "Transaction does not exist",
  [ClickError.FAILED_TO_UPDATE_USER]: "Failed to update user",
  [ClickError.BAD_REQUEST]: "Error in request from Click",
  [ClickError.TRANSACTION_CANCELLED]: "Transaction cancelled",
};

/** Raw shape of the x-www-form-urlencoded body Click POSTs to the callback URL */
export interface ClickCallbackParams {
  click_trans_id: string;
  service_id: string;
  click_paydoc_id?: string;
  merchant_trans_id: string;
  /** Present only on the Complete (action=1) call */
  merchant_prepare_id?: string;
  amount: string;
  action: string;
  error?: string;
  error_note?: string;
  sign_time: string;
  sign_string: string;
}

/**
 * Verifies the MD5 signature Click attaches to every callback.
 *
 * Prepare (action=0):
 *   md5(click_trans_id + service_id + SECRET_KEY + merchant_trans_id + amount + action + sign_time)
 *
 * Complete (action=1) also folds in merchant_prepare_id (the id we returned from Prepare):
 *   md5(click_trans_id + service_id + SECRET_KEY + merchant_trans_id + merchant_prepare_id + amount + action + sign_time)
 */
export function verifyClickSignature(params: ClickCallbackParams): boolean {
  const {
    click_trans_id,
    service_id,
    merchant_trans_id,
    merchant_prepare_id,
    amount,
    action,
    sign_time,
    sign_string,
  } = params;

  const isComplete = Number(action) === ClickAction.Complete;

  const raw = isComplete
    ? [
        click_trans_id,
        service_id,
        CLICK_SECRET_KEY,
        merchant_trans_id,
        merchant_prepare_id ?? "",
        amount,
        action,
        sign_time,
      ]
    : [click_trans_id, service_id, CLICK_SECRET_KEY, merchant_trans_id, amount, action, sign_time];

  const expected = crypto.createHash("md5").update(raw.join("")).digest("hex");
  return expected.toLowerCase() === (sign_string ?? "").toLowerCase();
}

/** Click sends amount as a decimal UZS string, e.g. "50000.00". We store balances in tiyin. */
export function clickAmountToTiyin(amount: string): number {
  return Math.round(parseFloat(amount) * 100);
}

export function tiyinToClickAmount(tiyin: number): string {
  return (tiyin / 100).toFixed(2);
}

/** Shapes a Click callback response, always including error/error_note. */
export function clickResponse(extra: Record<string, unknown>, error: ClickErrorCode = ClickError.SUCCESS, errorNote?: string) {
  return {
    ...extra,
    error,
    error_note: errorNote ?? ClickErrorNote[error] ?? "",
  };
}

export class ClickApiError extends Error {
  code: ClickErrorCode;
  constructor(code: ClickErrorCode, message?: string) {
    super(message ?? ClickErrorNote[code]);
    this.code = code;
  }
}