import type { User, Video } from '../types';

export async function findUserByGoogleSub(db: D1Database, sub: string): Promise<User | null> {
  return db.prepare('SELECT * FROM users WHERE google_sub = ?').bind(sub).first<User>();
}

export async function createUser(
  db: D1Database,
  data: { google_sub: string; email: string; name?: string; picture?: string }
): Promise<User> {
  const now = Math.floor(Date.now() / 1000);
  await db.prepare(
    'INSERT INTO users (google_sub, email, name, picture, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(data.google_sub, data.email, data.name ?? null, data.picture ?? null, now).run();

  return (await findUserByGoogleSub(db, data.google_sub))!;
}

export async function getUserById(db: D1Database, id: number): Promise<User | null> {
  return db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<User>();
}

export async function updateUserPlan(
  db: D1Database,
  userId: number,
  data: {
    lemon_customer_id?: string;
    lemon_subscription_id?: string;
    lemon_variant_id?: string;
    plan?: string;
    plan_status?: string;
    current_period_end?: number;
  }
): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [];

  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) {
      sets.push(`${k} = ?`);
      vals.push(v);
    }
  }
  if (sets.length === 0) return;

  vals.push(userId);
  await db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
}

export async function createVideo(db: D1Database, video: Omit<Video, 'insights_json' | 'carousel_json' | 'zip_r2_key'>): Promise<void> {
  await db.prepare(`
    INSERT INTO videos (id, user_id, youtube_id, title, channel, duration_sec, thumbnail_url, created_at, status, persona, watermarked)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    video.id, video.user_id, video.youtube_id, video.title, video.channel,
    video.duration_sec, video.thumbnail_url, video.created_at, video.status,
    video.persona, video.watermarked
  ).run();
}

export async function getVideoById(db: D1Database, id: string): Promise<Video | null> {
  return db.prepare('SELECT * FROM videos WHERE id = ?').bind(id).first<Video>();
}

export async function updateVideo(db: D1Database, id: string, data: Partial<Video>): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [];

  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined && k !== 'id') {
      sets.push(`${k} = ?`);
      vals.push(v);
    }
  }
  if (sets.length === 0) return;

  vals.push(id);
  await db.prepare(`UPDATE videos SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
}

export async function listUserVideos(db: D1Database, userId: number, limit = 50): Promise<Video[]> {
  const { results } = await db.prepare(
    'SELECT * FROM videos WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
  ).bind(userId, limit).all<Video>();
  return results;
}
