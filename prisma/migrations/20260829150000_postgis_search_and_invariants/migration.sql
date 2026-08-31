-- OnMangeOu - objets PostgreSQL non exprimables dans le schema Prisma.
--
-- Reference : specification technique maitre, sections 8.1, 8.3, 15.1 et 15.3.
-- SQL brut explicitement autorise pour PostGIS (section 5.1).
--
-- ATTENTION MAINTENANCE : Prisma ignore les declencheurs, index d'expression et
-- contraintes CHECK definis ici. Toute migration generee ensuite par
-- `prisma migrate dev` doit etre relue pour verifier qu'elle ne supprime aucun de
-- ces objets. Le script `pnpm prisma:status` et la CI verifient l'absence de derive.

-- ---------------------------------------------------------------------------
-- 1. Geolocalisation : maintien automatique de la colonne geography
-- ---------------------------------------------------------------------------
-- `latitude` et `longitude` sont la source autorale saisie par le restaurant.
-- `location` est derivee, jamais ecrite par l'application : elle sert uniquement
-- aux filtres ST_DWithin et au tri par proximite via l'operateur KNN.

CREATE OR REPLACE FUNCTION onmangeou_sync_establishment_location()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.location := ST_SetSRID(ST_MakePoint(NEW.longitude::double precision, NEW.latitude::double precision), 4326)::geography;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_establishments_sync_location
  BEFORE INSERT OR UPDATE OF latitude, longitude
  ON "establishments"
  FOR EACH ROW
  EXECUTE FUNCTION onmangeou_sync_establishment_location();

-- Backfill des lignes existantes (aucune lors de la premiere application).
UPDATE "establishments"
SET latitude = latitude
WHERE location IS NULL;

-- Index GiST obligatoire pour ST_DWithin et le tri KNN (section 15.1).
CREATE INDEX "establishments_location_gist_idx"
  ON "establishments"
  USING GIST ("location");

-- ---------------------------------------------------------------------------
-- 2. Recherche textuelle locale (section 15.3)
-- ---------------------------------------------------------------------------
-- `unaccent` n'est pas immutable par defaut : une fonction wrapper immutable est
-- requise pour l'utiliser dans un index d'expression.

CREATE OR REPLACE FUNCTION onmangeou_normalize_text(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
AS $$
  SELECT lower(public.unaccent('public.unaccent', input));
$$;

CREATE INDEX "establishments_name_trgm_idx"
  ON "establishments"
  USING GIN (onmangeou_normalize_text("name") gin_trgm_ops);

CREATE INDEX "establishments_district_trgm_idx"
  ON "establishments"
  USING GIN (onmangeou_normalize_text(COALESCE("district", '')) gin_trgm_ops);

CREATE INDEX "products_name_trgm_idx"
  ON "products"
  USING GIN (onmangeou_normalize_text("name") gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 3. Invariants metier appliques en base (section 8.1)
-- ---------------------------------------------------------------------------
-- Les regles sont deja verifiees dans les services de domaine. Elles sont
-- doublees ici pour qu'aucun acces direct ni bug applicatif ne puisse creer
-- une donnee incoherente.

-- Coordonnees dans les bornes WGS84.
ALTER TABLE "establishments"
  ADD CONSTRAINT "establishments_latitude_range_check"
  CHECK ("latitude" >= -90 AND "latitude" <= 90);

ALTER TABLE "establishments"
  ADD CONSTRAINT "establishments_longitude_range_check"
  CHECK ("longitude" >= -180 AND "longitude" <= 180);

-- Montants en FCFA entiers, jamais negatifs (section 13.3).
ALTER TABLE "products"
  ADD CONSTRAINT "products_base_price_non_negative_check"
  CHECK ("base_price_amount" >= 0);

ALTER TABLE "options"
  ADD CONSTRAINT "options_price_delta_non_negative_check"
  CHECK ("price_delta_amount" >= 0);

ALTER TABLE "restaurant_services"
  ADD CONSTRAINT "restaurant_services_minimum_order_non_negative_check"
  CHECK ("minimum_order_amount" IS NULL OR "minimum_order_amount" >= 0);

ALTER TABLE "organization_members"
  ADD CONSTRAINT "organization_members_refund_limit_non_negative_check"
  CHECK ("refund_limit_amount" IS NULL OR "refund_limit_amount" >= 0);

ALTER TABLE "subscription_plans"
  ADD CONSTRAINT "subscription_plans_monthly_price_non_negative_check"
  CHECK ("monthly_price_amount" >= 0);

ALTER TABLE "price_history"
  ADD CONSTRAINT "price_history_new_amount_non_negative_check"
  CHECK ("new_amount" >= 0);

-- Devise verrouillee sur XOF pour le marche initial (section 13.3).
ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_currency_check"
  CHECK ("currency" = 'XOF');

-- Horaires exprimes en minutes depuis minuit local. La borne haute autorise un
-- service qui franchit minuit (fermeture au-dela de 1440).
ALTER TABLE "establishment_hours"
  ADD CONSTRAINT "establishment_hours_range_check"
  CHECK (
    "opens_at_minutes" >= 0
    AND "opens_at_minutes" < 1440
    AND "closes_at_minutes" > "opens_at_minutes"
    AND "closes_at_minutes" <= 2880
  );

ALTER TABLE "menu_schedules"
  ADD CONSTRAINT "menu_schedules_range_check"
  CHECK (
    "start_at_minutes" >= 0
    AND "start_at_minutes" < 1440
    AND "end_at_minutes" > "start_at_minutes"
    AND "end_at_minutes" <= 2880
  );

-- Un groupe d'options a des bornes de selection coherentes.
ALTER TABLE "option_groups"
  ADD CONSTRAINT "option_groups_selection_bounds_check"
  CHECK (
    "min_selections" >= 0
    AND ("max_selections" IS NULL OR "max_selections" >= "min_selections")
    AND ("selection_type" <> 'SINGLE' OR "max_selections" IS NULL OR "max_selections" = 1)
  );

-- Une tentative d'OTP ne depasse jamais son plafond (section 21).
ALTER TABLE "otp_challenges"
  ADD CONSTRAINT "otp_challenges_attempts_check"
  CHECK ("attempts" >= 0 AND "attempts" <= "max_attempts");

-- Une periode d'abonnement est toujours orientee dans le temps.
ALTER TABLE "subscriptions"
  ADD CONSTRAINT "subscriptions_period_order_check"
  CHECK ("current_period_end" > "current_period_start");

ALTER TABLE "module_entitlements"
  ADD CONSTRAINT "module_entitlements_period_order_check"
  CHECK ("effective_until" IS NULL OR "effective_until" > "effective_from");

-- ---------------------------------------------------------------------------
-- 4. Journal d'audit append-only (sections 22.1 et 31)
-- ---------------------------------------------------------------------------
-- Aucune suppression ni modification n'est possible, meme via un acces direct
-- avec le role applicatif. La suppression d'audit est explicitement interdite.

CREATE OR REPLACE FUNCTION onmangeou_reject_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Le journal d''audit est append-only : % interdit sur %', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER trg_audit_logs_no_update
  BEFORE UPDATE OR DELETE
  ON "audit_logs"
  FOR EACH ROW
  EXECUTE FUNCTION onmangeou_reject_audit_mutation();

-- L'historique de prix est egalement append-only (section 8.1).
CREATE TRIGGER trg_price_history_no_update
  BEFORE UPDATE OR DELETE
  ON "price_history"
  FOR EACH ROW
  EXECUTE FUNCTION onmangeou_reject_audit_mutation();

-- ---------------------------------------------------------------------------
-- 5. Isolation multi-tenant verifiee en base (section 4.4)
-- ---------------------------------------------------------------------------
-- Un produit, un menu ou un droit de module ne peut pas pointer vers un
-- etablissement appartenant a une autre organisation. La clef composite rend
-- l'incoherence impossible plutot que seulement improbable.

CREATE UNIQUE INDEX "establishments_id_organization_id_key"
  ON "establishments" ("id", "organization_id");

ALTER TABLE "menus"
  ADD CONSTRAINT "menus_establishment_tenant_fkey"
  FOREIGN KEY ("establishment_id", "organization_id")
  REFERENCES "establishments" ("id", "organization_id")
  ON DELETE CASCADE;

ALTER TABLE "products"
  ADD CONSTRAINT "products_establishment_tenant_fkey"
  FOREIGN KEY ("establishment_id", "organization_id")
  REFERENCES "establishments" ("id", "organization_id")
  ON DELETE CASCADE;

ALTER TABLE "module_entitlements"
  ADD CONSTRAINT "module_entitlements_establishment_tenant_fkey"
  FOREIGN KEY ("establishment_id", "organization_id")
  REFERENCES "establishments" ("id", "organization_id")
  ON DELETE CASCADE;

ALTER TABLE "verification_cases"
  ADD CONSTRAINT "verification_cases_establishment_tenant_fkey"
  FOREIGN KEY ("establishment_id", "organization_id")
  REFERENCES "establishments" ("id", "organization_id")
  ON DELETE CASCADE;
