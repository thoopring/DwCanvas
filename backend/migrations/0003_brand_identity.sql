-- Brand identity fields for user profile on slides
ALTER TABLE users ADD COLUMN display_name TEXT;
ALTER TABLE users ADD COLUMN handle TEXT;
ALTER TABLE users ADD COLUMN brand_color TEXT DEFAULT '#6366F1';
ALTER TABLE users ADD COLUMN default_template TEXT DEFAULT 'minimal_dark';
