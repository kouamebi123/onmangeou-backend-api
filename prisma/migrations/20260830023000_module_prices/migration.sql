-- Bareme d'abonnement : source unique = la base, saisie depuis le back-office.

CREATE TABLE IF NOT EXISTS "module_prices" (
    "module_code" VARCHAR(60) NOT NULL,
    "label" VARCHAR(80) NOT NULL DEFAULT '',
    "included" BOOLEAN NOT NULL DEFAULT FALSE,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "monthly_price_amount" BIGINT NOT NULL DEFAULT 0,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "module_prices_pkey" PRIMARY KEY ("module_code")
);

ALTER TABLE "module_prices" ADD COLUMN IF NOT EXISTS "label" VARCHAR(80) NOT NULL DEFAULT '';
ALTER TABLE "module_prices" ADD COLUMN IF NOT EXISTS "included" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "module_prices" ADD COLUMN IF NOT EXISTS "sort_order" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "module_prices" DROP CONSTRAINT IF EXISTS "module_prices_monthly_price_non_negative_check";
ALTER TABLE "module_prices"
  ADD CONSTRAINT "module_prices_monthly_price_non_negative_check"
  CHECK ("monthly_price_amount" >= 0);

CREATE TABLE IF NOT EXISTS "platform_billing" (
    "id" SMALLINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT FALSE,
    "notice" VARCHAR(500) NOT NULL DEFAULT '',
    "updated_by_user_id" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "platform_billing_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "platform_billing_singleton_check" CHECK ("id" = 1)
);

INSERT INTO "platform_billing" ("id", "currency", "published", "notice")
VALUES (1, 'XOF', FALSE, '')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "module_prices" ("module_code", "label", "included", "sort_order", "monthly_price_amount")
VALUES
  ('storefront.basic', 'Vitrine', TRUE, 10, 0),
  ('catalog.advanced', 'Catalogue avance', FALSE, 20, 0),
  ('orders.marketplace', 'Commandes en ligne', FALSE, 30, 0),
  ('orders.manual', 'Commandes de salle', FALSE, 40, 0),
  ('reservations.tables', 'Reservation de tables', FALSE, 50, 0),
  ('payments.online', 'Paiement en ligne', FALSE, 60, 0),
  ('cash.register', 'Caisse', FALSE, 70, 0),
  ('finance.expenses', 'Depenses', FALSE, 80, 0),
  ('finance.credits', 'Credits et dettes', FALSE, 90, 0),
  ('inventory.simple', 'Stock simple', FALSE, 100, 0),
  ('inventory.ingredients', 'Stock par ingredients', FALSE, 110, 0),
  ('delivery.internal', 'Livraison interne', FALSE, 120, 0),
  ('marketing.promotions', 'Promotions', FALSE, 130, 0),
  ('analytics.advanced', 'Statistiques avancees', FALSE, 140, 0),
  ('organization.multisite', 'Multi-etablissements', FALSE, 150, 0)
ON CONFLICT ("module_code") DO UPDATE SET
  label = EXCLUDED.label,
  included = EXCLUDED.included,
  sort_order = EXCLUDED.sort_order;
