import type { Env, User, VoiceProfile } from '../types';
import { canProcess, canProcessWithEnv, incrementUsage } from '../services/quota';
import { createVideo, updateVideo } from '../db/queries';
import { extractInsights, generateCarousel, generateHookVariants } from '../services/ai';

function getUserVoiceProfile(user: User): VoiceProfile | null {
  if (user.plan !== 'pro' || user.plan_status !== 'active') return null;
  if (!user.voice_profile) return null;
  try {
    return JSON.parse(user.voice_profile) as VoiceProfile;
  } catch {
    return null;
  }
}

// NEW: Generate hooks without consuming quota (preview step)
export async function handleGenerateHooks(req: Request, user: User, env: Env): Promise<Response> {
  const body = await req.json() as {
    title?: string;
    transcript?: { t: number; text: string }[];
  };

  if (!body.transcript?.length) {
    return Response.json({ error: 'transcript required' }, { status: 400 });
  }

  // Check quota BEFORE the preview — so we don't waste Claude calls
  const quota = await canProcessWithEnv(user, env.DB, env);
  if (!quota.ok) {
    return Response.json({
      error: 'quota_exceeded',
      code: quota.code,
      message: quota.code === 'TRIAL_USED'
        ? 'Free trial used. Upgrade to continue.'
        : 'Monthly quota exceeded.',
    }, { status: 402 });
  }

  try {
    const insights = await extractInsights(body.transcript, env.ANTHROPIC_API_KEY);
    const hooks = await generateHookVariants(insights, body.title || 'Video', env.ANTHROPIC_API_KEY);

    return Response.json({
      insights,
      hooks,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Hook generation failed';
    const status = (err as { status?: number })?.status || 500;
    const code = (err as { code?: string })?.code || 'unknown';
    const retryable = (err as { isRetryable?: boolean })?.isRetryable || false;
    return Response.json({ error: message, code, retryable }, { status: status >= 400 ? status : 500 });
  }
}

export async function handleProcessVideo(req: Request, user: User, env: Env): Promise<Response> {
  const body = await req.json() as {
    youtube_id?: string;
    title?: string;
    channel?: string;
    duration_sec?: number;
    persona?: string;
    transcript?: { t: number; text: string }[];
    insights?: any[]; // optional — from /api/generate-hooks to skip re-extraction
    chosen_hook?: string;
  };

  if (!body.youtube_id || !body.transcript?.length) {
    return Response.json({ error: 'youtube_id and transcript required' }, { status: 400 });
  }

  const quota = await canProcessWithEnv(user, env.DB, env);
  if (!quota.ok) {
    return Response.json({
      error: 'quota_exceeded',
      code: quota.code,
      message: quota.code === 'TRIAL_USED'
        ? 'Free trial used. Upgrade to continue.'
        : 'Monthly quota exceeded.',
    }, { status: 402 });
  }

  const videoId = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const now = Math.floor(Date.now() / 1000);
  const persona = body.persona || 'linkedin_hooked';

  await createVideo(env.DB, {
    id: videoId,
    user_id: user.id,
    youtube_id: body.youtube_id,
    title: body.title ?? null,
    channel: body.channel ?? null,
    duration_sec: body.duration_sec ?? null,
    thumbnail_url: null,
    created_at: now,
    status: 'processing',
    persona,
    watermarked: quota.watermark ? 1 : 0,
    is_favorite: 0,
  });

  const isTrial = user.plan === 'free' && !user.trial_used;
  await incrementUsage(user.id, env.DB, isTrial);

  try {
    // Use pre-extracted insights if provided (from /api/generate-hooks), otherwise extract
    const insights = body.insights || await extractInsights(body.transcript, env.ANTHROPIC_API_KEY);

    const carousel = await generateCarousel(
      insights,
      body.title || 'YouTube Video',
      persona,
      env.ANTHROPIC_API_KEY,
      body.chosen_hook,
      getUserVoiceProfile(user)
    );

    await updateVideo(env.DB, videoId, {
      status: 'ready',
      insights_json: JSON.stringify(insights),
      carousel_json: JSON.stringify(carousel),
    });

    return Response.json({
      video_id: videoId,
      status: 'ready',
      insights,
      carousel,
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Processing failed';
    const code = (err as { code?: string })?.code || 'unknown';
    const retryable = (err as { isRetryable?: boolean })?.isRetryable || false;
    console.error('Process error:', message, 'code:', code);
    await updateVideo(env.DB, videoId, { status: 'failed' });

    return Response.json({
      video_id: videoId,
      status: 'failed',
      error: message,
      code,
      retryable,
    }, { status: 500 });
  }
}
