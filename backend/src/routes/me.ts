import type { Env, User } from '../types';

export async function handleMe(user: User, env: Env): Promise<Response> {
  const ym = new Date().getFullYear() * 100 + (new Date().getMonth() + 1);
  const usage = await env.DB
    .prepare('SELECT videos_used FROM usage_monthly WHERE user_id = ? AND yyyymm = ?')
    .bind(user.id, ym)
    .first<{ videos_used: number }>();

  return Response.json({
    id: user.id,
    email: user.email,
    name: user.name,
    picture: user.picture,
    plan: user.plan,
    plan_status: user.plan_status,
    trial_used: user.trial_used,
    current_period_end: user.current_period_end,
    display_name: user.display_name || user.name,
    handle: user.handle,
    brand_color: user.brand_color || '#6366F1',
    default_template: user.default_template || 'minimal_dark',
    usage: {
      month: ym,
      videos_used: usage?.videos_used ?? 0,
      limit: user.plan === 'creator' ? 30 : user.plan === 'pro' ? -1 : 1,
    },
  });
}

export async function handlePatchMe(req: Request, user: User, env: Env): Promise<Response> {
  const body = await req.json() as {
    display_name?: string;
    handle?: string;
    brand_color?: string;
    default_template?: string;
  };

  const updates: string[] = [];
  const vals: unknown[] = [];

  if (typeof body.display_name === 'string') {
    updates.push('display_name = ?'); vals.push(body.display_name.slice(0, 50));
  }
  if (typeof body.handle === 'string') {
    updates.push('handle = ?'); vals.push(body.handle.slice(0, 30));
  }
  if (typeof body.brand_color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(body.brand_color)) {
    updates.push('brand_color = ?'); vals.push(body.brand_color);
  }
  if (typeof body.default_template === 'string') {
    const allowed = ['minimal_dark', 'editorial_bold', 'clean_light'];
    if (allowed.includes(body.default_template)) {
      updates.push('default_template = ?'); vals.push(body.default_template);
    }
  }

  if (updates.length === 0) {
    return Response.json({ error: 'No valid fields' }, { status: 400 });
  }

  vals.push(user.id);
  await env.DB.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).bind(...vals).run();

  return Response.json({ ok: true });
}
