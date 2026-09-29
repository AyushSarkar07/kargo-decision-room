import { NextResponse } from "next/server";
import { Resend } from "resend";
import { applyDeliveryEvent } from "@/lib/email";

// Delivery confirmations from Resend. Signature-verified; no session (called by Resend).
export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook not configured" }, { status: 404 });
  const payload = await req.text();
  try {
    const event = new Resend(process.env.RESEND_API_KEY).webhooks.verify({
      payload,
      headers: {
        id: req.headers.get("svix-id") ?? "",
        timestamp: req.headers.get("svix-timestamp") ?? "",
        signature: req.headers.get("svix-signature") ?? "",
      },
      webhookSecret: secret,
    }) as {
      type: string;
      data?: { email_id?: string };
    };
    if (event.data?.email_id) await applyDeliveryEvent(event.type, event.data.email_id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
}
