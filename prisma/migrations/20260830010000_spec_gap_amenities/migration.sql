ALTER TABLE "establishments"
  ADD COLUMN IF NOT EXISTS "has_terrace" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "has_air_conditioning" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "accessible" BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "scheduled_for" TIMESTAMPTZ(3);

CREATE TABLE IF NOT EXISTS "user_addresses" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "line" VARCHAR(300) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_addresses_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "user_addresses_user_id_idx" ON "user_addresses"("user_id");
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_addresses_user_id_fkey'
  ) THEN
    ALTER TABLE "user_addresses"
      ADD CONSTRAINT "user_addresses_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "reviews"
  ADD COLUMN IF NOT EXISTS "photo_url" VARCHAR(1024);
