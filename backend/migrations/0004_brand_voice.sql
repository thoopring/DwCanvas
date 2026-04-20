-- Brand Voice (Pro tier differentiator)
-- voice_profile: extracted voice characteristics as JSON {directive, tone, pacing, signature_moves, avoid}
-- voice_samples: raw user-pasted sample posts as JSON array of strings
-- voice_trained_at: unix timestamp of last training
ALTER TABLE users ADD COLUMN voice_profile TEXT;
ALTER TABLE users ADD COLUMN voice_samples TEXT;
ALTER TABLE users ADD COLUMN voice_trained_at INTEGER;
