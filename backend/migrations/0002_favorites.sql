-- Add is_favorite column to videos table
ALTER TABLE videos ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_videos_user_favorite ON videos(user_id, is_favorite);
