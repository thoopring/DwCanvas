import type { Env, User } from '../types';

interface QuotaResult {
  ok: boolean;
  watermark: boolean;
  code?: 'TRIAL_USED' | 'QUOTA_EXCEEDED' | 'NO_SUBSCRIPTION';
}

function currentYYYYMM(): number {
  const d = new Date();
  return d.getFullYear() * 100 + (d.getMonth() + 1);
}

// Launch-period bypass — all users get unlimited access during soft launch
export async function canProcessWithEnv(user: User, db: D1Database, env: Env): Promise<QuotaResult> {
  if (env.FREE_LAUNCH === 'true') {
    return { ok: true, watermark: false };
  }
  return canProcess(user, db);
}

export async function canProcess(user: User, db: D1Database): Promise<QuotaResult> {
  // Pro: unlimited
  if (user.plan === 'pro' && user.plan_status === 'active') {
    return { ok: true, watermark: false };
  }

  // Creator: 30/month
  if (user.plan === 'creator' && user.plan_status === 'active') {
    const ym = currentYYYYMM();
    const row = await db
      .prepare('SELECT videos_used FROM usage_monthly WHERE user_id = ? AND yyyymm = ?')
      .bind(user.id, ym)
      .first<{ videos_used: number }>();
    const used = row?.videos_used ?? 0;
    if (used >= 30) {
      return { ok: false, watermark: false, code: 'QUOTA_EXCEEDED' };
    }
    return { ok: true, watermark: false };
  }

  // Free / trial
  if (user.trial_used) {
    return { ok: false, watermark: false, code: 'TRIAL_USED' };
  }
  return { ok: true, watermark: true };
}

export async function incrementUsage(userId: number, db: D1Database, isTrial: boolean): Promise<void> {
  const ym = currentYYYYMM();

  if (isTrial) {
    await db.prepare('UPDATE users SET trial_used = 1 WHERE id = ?').bind(userId).run();
  }

  // Upsert monthly usage
  await db.prepare(`
    INSERT INTO usage_monthly (user_id, yyyymm, videos_used)
    VALUES (?, ?, 1)
    ON CONFLICT (user_id, yyyymm)
    DO UPDATE SET videos_used = videos_used + 1
  `).bind(userId, ym).run();
}
