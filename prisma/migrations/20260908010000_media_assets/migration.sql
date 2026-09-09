CREATE TABLE media_assets (
  resource_key text PRIMARY KEY,
  owner_key text NOT NULL,
  storage_key text NOT NULL UNIQUE,
  thumbnail_key text NOT NULL UNIQUE,
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX media_assets_owner_idx ON media_assets(owner_key);
