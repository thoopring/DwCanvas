import type { Env, User, VoiceProfile } from '../types';
import { extractVoiceProfile } from '../services/ai';

const MAX_SAMPLE_LEN = 2500;
const MIN_SAMPLE_LEN = 60;

function isPro(user: User): boolean {
  return user.plan === 'pro' && user.plan_status === 'active';
}

export async function handleVoiceGet(user: User, env: Env): Promise<Response> {
  if (!isPro(user)) {
    return Response.json({ error: 'pro_required', code: 'PRO_REQUIRED' }, { status: 403 });
  }

  let profile: VoiceProfile | null = null;
  let samples: string[] = [];
  try {
    if (user.voice_profile) profile = JSON.parse(user.voice_profile);
    if (user.voice_samples) samples = JSON.parse(user.voice_samples);
  } catch {
    // corrupt row — treat as empty
  }

  return Response.json({
    has_voice: !!profile,
    profile,
    samples,
    trained_at: user.voice_trained_at,
  });
}

export async function handleVoiceTrain(req: Request, user: User, env: Env): Promise<Response> {
  if (!isPro(user)) {
    return Response.json({ error: 'pro_required', code: 'PRO_REQUIRED' }, { status: 403 });
  }

  const body = await req.json() as { samples?: string[] };
  const raw = body.samples;
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 5) {
    return Response.json({ error: 'Provide 2-5 sample posts' }, { status: 400 });
  }

  const samples = raw
    .map(s => typeof s === 'string' ? s.trim().slice(0, MAX_SAMPLE_LEN) : '')
    .filter(s => s.length >= MIN_SAMPLE_LEN);

  if (samples.length < 2) {
    return Response.json({
      error: `Each sample needs at least ${MIN_SAMPLE_LEN} characters — paste longer posts`,
    }, { status: 400 });
  }

  try {
    const profile = await extractVoiceProfile(samples, env.ANTHROPIC_API_KEY);
    const now = Math.floor(Date.now() / 1000);

    await env.DB.prepare(
      'UPDATE users SET voice_profile = ?, voice_samples = ?, voice_trained_at = ? WHERE id = ?'
    ).bind(
      JSON.stringify(profile),
      JSON.stringify(samples),
      now,
      user.id,
    ).run();

    return Response.json({
      ok: true,
      profile,
      trained_at: now,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Voice training failed';
    const status = (err as { status?: number })?.status || 500;
    const code = (err as { code?: string })?.code || 'unknown';
    console.error('Voice train error:', message, 'code:', code);
    return Response.json({ error: message, code }, { status: status >= 400 ? status : 500 });
  }
}

export async function handleVoiceDelete(user: User, env: Env): Promise<Response> {
  if (!isPro(user)) {
    return Response.json({ error: 'pro_required', code: 'PRO_REQUIRED' }, { status: 403 });
  }

  await env.DB.prepare(
    'UPDATE users SET voice_profile = NULL, voice_samples = NULL, voice_trained_at = NULL WHERE id = ?'
  ).bind(user.id).run();

  return Response.json({ ok: true });
}
