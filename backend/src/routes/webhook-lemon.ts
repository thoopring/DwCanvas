import type { Env } from '../types';
import { updateUserPlan } from '../db/queries';

// Verify LemonSqueezy webhook signature (HMAC-SHA256)
async function verifySignature(body: string, signature: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  return hex === signature;
}

export async function handleLemonWebhook(req: Request, env: Env): Promise<Response> {
  const rawBody = await req.text();
  const signature = req.headers.get('X-Signature') || '';

  if (!await verifySignature(rawBody, signature, env.LEMONSQUEEZY_WEBHOOK_SECRET)) {
    return new Response('Invalid signature', { status: 401 });
  }

  const event = JSON.parse(rawBody) as {
    meta: { event_name: string; custom_data?: { user_id?: string } };
    data: {
      id: string;
      attributes: {
        customer_id: number;
        variant_id: number;
        status: string;
        renews_at: string | null;
        ends_at: string | null;
      };
    };
  };

  const eventName = event.meta.event_name;
  const attrs = event.data.attributes;
  const userId = event.meta.custom_data?.user_id ? parseInt(event.meta.custom_data.user_id) : null;

  if (!userId) {
    console.error('Webhook missing user_id in custom_data');
    return new Response('OK', { status: 200 });
  }

  // Idempotency — same event+subscription delivered twice should no-op
  const eventId = `${eventName}_${event.data.id}`;
  const existing = await env.DB.prepare('SELECT id FROM lemon_events WHERE id = ?').bind(eventId).first();
  if (existing) return new Response('OK', { status: 200 });
  await env.DB.prepare('INSERT INTO lemon_events (id, received_at) VALUES (?, ?)').bind(eventId, Math.floor(Date.now() / 1000)).run();

  const variantToPlan: Record<string, string> = {
    '1555013': 'creator',
    '1555017': 'pro',
  };

  const plan = variantToPlan[String(attrs.variant_id)] || 'creator';

  // Map LS status to our status
  const statusMap: Record<string, string> = {
    active: 'active',
    past_due: 'past_due',
    cancelled: 'canceled',
    expired: 'canceled',
    paused: 'canceled',
  };

  switch (eventName) {
    case 'subscription_created':
    case 'subscription_updated':
    case 'subscription_resumed':
      await updateUserPlan(env.DB, userId, {
        lemon_customer_id: String(attrs.customer_id),
        lemon_subscription_id: String(event.data.id),
        lemon_variant_id: String(attrs.variant_id),
        plan,
        plan_status: statusMap[attrs.status] || 'active',
        current_period_end: attrs.renews_at ? Math.floor(new Date(attrs.renews_at).getTime() / 1000) : undefined,
      });
      break;

    case 'subscription_cancelled':
    case 'subscription_expired':
      await updateUserPlan(env.DB, userId, {
        plan_status: 'canceled',
      });
      break;
  }

  return new Response('OK', { status: 200 });
}
