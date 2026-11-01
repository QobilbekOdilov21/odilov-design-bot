-- Track whether the comment button was attached to each channel post.
ALTER TABLE channel_posts ADD COLUMN button_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE channel_posts ADD COLUMN last_error TEXT;
