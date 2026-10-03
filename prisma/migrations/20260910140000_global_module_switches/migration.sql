-- Global feature switches controlled by the platform administrator.
-- A disabled module stays configured/priced but cannot be exposed or enabled by merchants.

ALTER TABLE "module_prices"
  ADD COLUMN IF NOT EXISTS "enabled" BOOLEAN NOT NULL DEFAULT TRUE;
