import type { Env } from '../types';
import { verifyGoogleAccessToken } from '../auth/google';
import { signJWT } from '../auth/jwt';
import { findUserByGoogleSub, createUser } from '../db/queries';

export async function handleGoogleAuth(req: Request, env: Env): Promise<Response> {
  const body = await req.json() as { access_token?: string };
  if (!body.access_token) {
    return Response.json({ error: 'access_token required' }, { status: 400 });
  }

  const google = await verifyGoogleAccessToken(body.access_token);
  if (!google) {
    return Response.json({ error: 'Invalid Google token' }, { status: 401 });
  }

  // Find or create user
  let user = await findUserByGoogleSub(env.DB, google.sub);
  if (!user) {
    user = await createUser(env.DB, {
      google_sub: google.sub,
      email: google.email,
      name: google.name,
      picture: google.picture,
    });
  }

  // Issue JWT
  const token = await signJWT(
    { sub: user.google_sub, email: user.email, uid: user.id },
    env.JWT_SECRET
  );

  return Response.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      plan: user.plan,
      plan_status: user.plan_status,
      trial_used: user.trial_used,
    },
  });
}
