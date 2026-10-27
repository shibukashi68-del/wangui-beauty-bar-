CREATE TABLE IF NOT EXISTS owner_videos (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  object_path text NOT NULL UNIQUE,
  url text NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100),
  caption text NOT NULL DEFAULT '' CHECK (char_length(caption) <= 300),
  category text NOT NULL CHECK (char_length(category) BETWEEN 1 AND 80),
  dept text NOT NULL CHECK (dept IN ('wigs-hair', 'makeup', 'nails', 'brows-lashes')),
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

CREATE INDEX IF NOT EXISTS owner_videos_published_created_idx
  ON owner_videos (published, created_at DESC);
