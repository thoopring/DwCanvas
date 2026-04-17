import type { Env, User } from '../types';
import { listUserVideos, getVideoById, updateVideo } from '../db/queries';

export async function handleLibrary(user: User, env: Env): Promise<Response> {
  const videos = await listUserVideos(env.DB, user.id);

  return Response.json({
    videos: videos.map(v => {
      // Extract hook preview for quick display in library list
      let hookPreview: string | null = null;
      if (v.carousel_json) {
        try {
          const carousel = JSON.parse(v.carousel_json);
          hookPreview = carousel.hook || null;
        } catch {}
      }
      return {
        id: v.id,
        youtube_id: v.youtube_id,
        title: v.title,
        channel: v.channel,
        duration_sec: v.duration_sec,
        status: v.status,
        persona: v.persona,
        created_at: v.created_at,
        has_carousel: !!v.carousel_json,
        is_favorite: v.is_favorite === 1,
        hook_preview: hookPreview,
      };
    }),
  });
}

export async function handleGetVideo(videoId: string, user: User, env: Env): Promise<Response> {
  const video = await getVideoById(env.DB, videoId);
  if (!video || video.user_id !== user.id) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  return Response.json({
    ...video,
    is_favorite: video.is_favorite === 1,
    insights: video.insights_json ? JSON.parse(video.insights_json) : null,
    carousel: video.carousel_json ? JSON.parse(video.carousel_json) : null,
  });
}

export async function handleDeleteVideo(videoId: string, user: User, env: Env): Promise<Response> {
  const video = await getVideoById(env.DB, videoId);
  if (!video || video.user_id !== user.id) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  await env.DB.prepare('DELETE FROM videos WHERE id = ?').bind(videoId).run();
  return Response.json({ ok: true });
}

export async function handlePatchVideo(
  videoId: string,
  req: Request,
  user: User,
  env: Env
): Promise<Response> {
  const video = await getVideoById(env.DB, videoId);
  if (!video || video.user_id !== user.id) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const body = await req.json() as { is_favorite?: boolean };
  const updates: Partial<{ is_favorite: number }> = {};
  if (typeof body.is_favorite === 'boolean') {
    updates.is_favorite = body.is_favorite ? 1 : 0;
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  await updateVideo(env.DB, videoId, updates);
  return Response.json({ ok: true });
}
