import type { Env, User } from './types';
import { verifyJWT } from './auth/jwt';
import { getUserById } from './db/queries';
import { handleGoogleAuth } from './routes/auth';
import { handleMe, handlePatchMe } from './routes/me';
import { handleProcessVideo, handleGenerateHooks } from './routes/process';
import { handleLibrary, handleGetVideo, handleDeleteVideo, handlePatchVideo } from './routes/library';
import { handleCheckout } from './routes/checkout';
import { handleLemonWebhook } from './routes/webhook-lemon';
import { handleVoiceGet, handleVoiceTrain, handleVoiceDelete } from './routes/voice';

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    // CORS headers for extension
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(req) });
    }

    try {
      const res = await route(req, env, path);
      // Add CORS to all responses
      for (const [k, v] of Object.entries(corsHeaders(req))) {
        res.headers.set(k, v);
      }
      return res;
    } catch (e) {
      console.error('Unhandled error:', e);
      const msg = e instanceof Error ? e.message : 'Internal error';
      return Response.json({ error: msg }, { status: 500, headers: corsHeaders(req) });
    }
  },
} satisfies ExportedHandler<Env>;

async function route(req: Request, env: Env, path: string): Promise<Response> {
  // --- Public routes ---
  if (path === '/api/auth/google' && req.method === 'POST') {
    return handleGoogleAuth(req, env);
  }
  if (path === '/api/webhooks/lemon' && req.method === 'POST') {
    return handleLemonWebhook(req, env);
  }
  if (path === '/api/health') {
    return Response.json({ ok: true, ts: Date.now() });
  }

  // Diagnostic: test Anthropic connection from Workers
  if (path === '/api/diagnose-ai' && req.method === 'GET') {
    try {
      const r = await fetch('https://gateway.ai.cloudflare.com/v1/4213ddb3b8d6827dfe187658ed929b54/cleanshot/anthropic/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'User-Agent': 'CleanShot/2.0 (+diagnostic)',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 20,
          messages: [{ role: 'user', content: 'Say hi in one word.' }],
        }),
      });
      const headers: Record<string, string> = {};
      r.headers.forEach((v, k) => { headers[k] = v; });
      const body = await r.text();
      return Response.json({
        status: r.status,
        ok: r.ok,
        headers,
        body: body.slice(0, 2000),
        apiKeyLen: env.ANTHROPIC_API_KEY?.length || 0,
        apiKeyPrefix: env.ANTHROPIC_API_KEY?.slice(0, 15) || '',
      });
    } catch (e: unknown) {
      return Response.json({ error: (e as Error).message }, { status: 500 });
    }
  }

  // --- Authenticated routes ---
  const user = await authenticate(req, env);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (path === '/api/me' && req.method === 'GET') {
    return handleMe(user, env);
  }
  if (path === '/api/me' && req.method === 'PATCH') {
    return handlePatchMe(req, user, env);
  }
  if (path === '/api/generate-hooks' && req.method === 'POST') {
    return handleGenerateHooks(req, user, env);
  }
  if (path === '/api/process-video' && req.method === 'POST') {
    return handleProcessVideo(req, user, env);
  }
  if (path === '/api/library' && req.method === 'GET') {
    return handleLibrary(user, env);
  }
  if (path === '/api/checkout' && req.method === 'POST') {
    return handleCheckout(req, user, env);
  }
  if (path === '/api/voice' && req.method === 'GET') {
    return handleVoiceGet(user, env);
  }
  if (path === '/api/voice/train' && req.method === 'POST') {
    return handleVoiceTrain(req, user, env);
  }
  if (path === '/api/voice' && req.method === 'DELETE') {
    return handleVoiceDelete(user, env);
  }

  // /api/videos/:id
  const videoMatch = path.match(/^\/api\/videos\/([a-zA-Z0-9]+)$/);
  if (videoMatch) {
    if (req.method === 'GET') return handleGetVideo(videoMatch[1], user, env);
    if (req.method === 'DELETE') return handleDeleteVideo(videoMatch[1], user, env);
    if (req.method === 'PATCH') return handlePatchVideo(videoMatch[1], req, user, env);
  }

  return Response.json({ error: 'Not found' }, { status: 404 });
}

async function authenticate(req: Request, env: Env): Promise<User | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);

  // Dev mode: auto-create/find user when JWT is invalid
  if (env.APP_ENV === 'development') {
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (payload) {
      return getUserById(env.DB, payload.uid);
    }
    // JWT invalid in dev mode — get email from header or create dev user
    const email = req.headers.get('X-Dev-Email') || 'dev@cleanshot.local';
    let user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<User>();
    if (!user) {
      const now = Math.floor(Date.now() / 1000);
      await env.DB.prepare(
        "INSERT INTO users (google_sub, email, name, created_at, plan, plan_status) VALUES (?, ?, ?, ?, 'creator', 'active')"
      ).bind('dev-' + email, email, 'Dev User', now).run();
      user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<User>();
    }
    return user;
  }

  const payload = await verifyJWT(token, env.JWT_SECRET);
  if (!payload) return null;

  return getUserById(env.DB, payload.uid);
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Dev-Email',
    'Access-Control-Max-Age': '86400',
  };
}
