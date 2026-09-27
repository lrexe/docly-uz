import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  ClickAction,
  ClickError,
  ClickCallbackParams,
  clickAmountToTiyin,
  clickResponse,
  verifyClickSignature,
  CLICK_SERVICE_ID,
} from "@/lib/payments/click";

/**
 * Click.uz callback endpoint. Click POSTs `application/x-www-form-urlencoded`
 * to this single URL for both the Prepare (action=0) and Complete (action=1)
 * steps of a payment.
 *
 * Uses the same `transactions` table as Payme (see app/api/payments/payme/route.ts
 * for the expected schema). `merchant_trans_id` sent by Click is our `users.id` (uuid) —
 * the "Pay via Click" button on /billing encodes it into the payment URL.
 */

function getSupabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

async function parseClickBody(req: NextRequest): Promise<ClickCallbackParams> {
  const contentType = req.headers.get("content-type") ?? "";
  let entries: [string, string][];

  if (contentType.includes("application/json")) {
    const json = await req.json();
    entries = Object.entries(json).map(([k, v]) => [k, String(v)]);
  } else {
    const form = await req.formData();
    entries = Array.from(form.entries()).map(([k, v]) => [k, String(v)]);
  }

  return Object.fromEntries(entries) as unknown as ClickCallbackParams;
}

export async function POST(req: NextRequest) {
  const params = await parseClickBody(req);
  const supabase = getSupabaseAdmin();

  const action = Number(params.action);
  const clickTransId = params.click_trans_id;
  const merchantTransId = params.merchant_trans_id; // our users.id

  // 1. Verify the service_id matches ours.
  if (params.service_id !== CLICK_SERVICE_ID) {
    return NextResponse.json(
      clickResponse({ click_trans_id: clickTransId, merchant_trans_id: merchantTransId }, ClickError.BAD_REQUEST)
    );
  }

  // 2. Verify signature.
  if (!verifyClickSignature(params)) {
    return NextResponse.json(
      clickResponse({ click_trans_id: clickTransId, merchant_trans_id: merchantTransId }, ClickError.SIGN_CHECK_FAILED)
    );
  }

  // 3. Verify the user (account) exists.
  const { data: user } = await supabase.from("users").select("id, balance").eq("id", merchantTransId).maybeSingle();
  if (!user) {
    return NextResponse.json(
      clickResponse({ click_trans_id: clickTransId, merchant_trans_id: merchantTransId }, ClickError.USER_NOT_FOUND)
    );
  }

  const amountTiyin = clickAmountToTiyin(params.amount);
  if (!Number.isFinite(amountTiyin) || amountTiyin <= 0) {
    return NextResponse.json(
      clickResponse({ click_trans_id: clickTransId, merchant_trans_id: merchantTransId }, ClickError.INCORRECT_AMOUNT)
    );
  }

  if (action === ClickAction.Prepare) {
    return handlePrepare(supabase, params, user.id, amountTiyin);
  }
  if (action === ClickAction.Complete) {
    return handleComplete(supabase, params, user.id, amountTiyin);
  }

  return NextResponse.json(
    clickResponse({ click_trans_id: clickTransId, merchant_trans_id: merchantTransId }, ClickError.ACTION_NOT_FOUND)
  );
}

// ---------------------------------------------------------------------------

async function handlePrepare(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  params: ClickCallbackParams,
  userId: string,
  amountTiyin: number
) {
  const { click_trans_id, merchant_trans_id } = params;

  // Idempotency: Click may retry Prepare with the same click_trans_id.
  const { data: existing } = await supabase
    .from("transactions")
    .select("*")
    .eq("provider", "click")
    .eq("provider_trans_id", click_trans_id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      clickResponse({
        click_trans_id,
        merchant_trans_id,
        merchant_prepare_id: existing.id,
      })
    );
  }

  const { data: created, error } = await supabase
    .from("transactions")
    .insert({
      provider: "click",
      provider_trans_id: click_trans_id,
      user_id: userId,
      amount_tiyin: amountTiyin,
      state: 1, // pending, mirrors Payme's "created" state
      create_time: Date.now(),
    })
    .select()
    .single();

  if (error || !created) {
    console.error("[click] Prepare insert failed:", error);
    return NextResponse.json(clickResponse({ click_trans_id, merchant_trans_id }, ClickError.BAD_REQUEST));
  }

  return NextResponse.json(
    clickResponse({
      click_trans_id,
      merchant_trans_id,
      merchant_prepare_id: created.id,
    })
  );
}

async function handleComplete(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  params: ClickCallbackParams,
  userId: string,
  amountTiyin: number
) {
  const { click_trans_id, merchant_trans_id, merchant_prepare_id } = params;
  const clickReportedError = Number(params.error ?? 0);

  const { data: tx } = await supabase
    .from("transactions")
    .select("*")
    .eq("provider", "click")
    .eq("provider_trans_id", click_trans_id)
    .maybeSingle();

  if (!tx || tx.id !== merchant_prepare_id) {
    return NextResponse.json(clickResponse({ click_trans_id, merchant_trans_id }, ClickError.TRANSACTION_NOT_FOUND));
  }

  // Click reported a failure on their side (e.g. insufficient funds) — cancel our side too.
  if (clickReportedError < 0) {
    if (tx.state !== -1 && tx.state !== -2) {
      await supabase.from("transactions").update({ state: -1, cancel_time: Date.now(), reason: 3 }).eq("id", tx.id);
    }
    return NextResponse.json(
      clickResponse(
        { click_trans_id, merchant_trans_id, merchant_confirm_id: tx.id },
        ClickError.TRANSACTION_CANCELLED
      )
    );
  }

  if (tx.state === -1 || tx.state === -2) {
    return NextResponse.json(
      clickResponse({ click_trans_id, merchant_trans_id, merchant_confirm_id: tx.id }, ClickError.TRANSACTION_CANCELLED)
    );
  }

  if (tx.state === 2) {
    // Idempotent replay of an already-completed payment.
    return NextResponse.json(
      clickResponse({ click_trans_id, merchant_trans_id, merchant_confirm_id: tx.id }, ClickError.ALREADY_PAID)
    );
  }

  if (tx.amount_tiyin !== amountTiyin) {
    return NextResponse.json(clickResponse({ click_trans_id, merchant_trans_id }, ClickError.INCORRECT_AMOUNT));
  }

  const { error: creditError } = await supabase.rpc("increment_user_balance", {
    p_user_id: userId,
    p_amount_tiyin: tx.amount_tiyin,
  });

  if (creditError) {
    console.error("[click] balance credit failed:", creditError);
    return NextResponse.json(clickResponse({ click_trans_id, merchant_trans_id }, ClickError.FAILED_TO_UPDATE_USER));
  }

  await supabase.from("transactions").update({ state: 2, perform_time: Date.now() }).eq("id", tx.id);

  return NextResponse.json(
    clickResponse({
      click_trans_id,
      merchant_trans_id,
      merchant_confirm_id: tx.id,
    })
  );
}