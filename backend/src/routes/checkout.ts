import type { Env, User } from '../types';

// LemonSqueezy checkout URL generation
// User clicks "Upgrade" → we redirect to LS hosted checkout
export async function handleCheckout(req: Request, user: User, env: Env): Promise<Response> {
  const body = await req.json() as { plan?: 'creator' | 'pro' };
  const plan = body.plan || 'creator';

  const variantIds: Record<string, string> = {
    creator: '1531671',
    pro: '1531679',
  };

  const variantId = variantIds[plan];
  if (!variantId) {
    return Response.json({ error: 'Invalid plan' }, { status: 400 });
  }

  // Build LemonSqueezy checkout URL with prefilled customer info
  const checkoutUrl = new URL(`https://getcleanshot.lemonsqueezy.com/checkout/buy/${variantId}`);
  checkoutUrl.searchParams.set('checkout[email]', user.email);
  checkoutUrl.searchParams.set('checkout[name]', user.name || '');
  checkoutUrl.searchParams.set('checkout[custom][user_id]', String(user.id));

  return Response.json({ checkout_url: checkoutUrl.toString() });
}
