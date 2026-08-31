-- Tranche commerce : paiement sandbox, reservation, avis, caisse, stock, notifs.
-- Appliquee via SQL (prisma generate est bloque sous Node 24).

ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PENDING_PAYMENT';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'FAILED';
ALTER TYPE "OrderService" ADD VALUE IF NOT EXISTS 'DELIVERY';

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_method" VARCHAR(32) NOT NULL DEFAULT 'CASH';
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "paid_at" TIMESTAMPTZ(3);

CREATE TABLE IF NOT EXISTS "carts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "establishment_id" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "carts_user_id_key" ON "carts"("user_id");
CREATE INDEX IF NOT EXISTS "carts_establishment_id_idx" ON "carts"("establishment_id");

CREATE TABLE IF NOT EXISTS "cart_items" (
    "id" UUID NOT NULL,
    "cart_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "cart_items_cart_id_product_id_key" ON "cart_items"("cart_id", "product_id");

CREATE TABLE IF NOT EXISTS "payment_intents" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" VARCHAR(40) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'CREATED',
    "amount" BIGINT NOT NULL,
    "currency" VARCHAR(8) NOT NULL DEFAULT 'XOF',
    "provider_ref" VARCHAR(80),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_intents_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "payment_intents_order_id_idx" ON "payment_intents"("order_id");

CREATE TABLE IF NOT EXISTS "dining_tables" (
    "id" UUID NOT NULL,
    "establishment_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "seats" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dining_tables_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "dining_tables_establishment_id_idx" ON "dining_tables"("establishment_id");

CREATE TABLE IF NOT EXISTS "reservations" (
    "id" UUID NOT NULL,
    "public_ref" VARCHAR(16) NOT NULL,
    "organization_id" UUID NOT NULL,
    "establishment_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "table_id" UUID,
    "status" VARCHAR(24) NOT NULL DEFAULT 'REQUESTED',
    "party_size" INTEGER NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "customer_name" VARCHAR(160) NOT NULL,
    "customer_phone" VARCHAR(24) NOT NULL,
    "notes" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "reservations_public_ref_key" ON "reservations"("public_ref");
CREATE INDEX IF NOT EXISTS "reservations_establishment_id_starts_at_idx" ON "reservations"("establishment_id", "starts_at");
CREATE INDEX IF NOT EXISTS "reservations_user_id_idx" ON "reservations"("user_id");

CREATE TABLE IF NOT EXISTS "reviews" (
    "id" UUID NOT NULL,
    "establishment_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "order_id" UUID,
    "score" INTEGER NOT NULL,
    "body" VARCHAR(2000),
    "status" VARCHAR(24) NOT NULL DEFAULT 'PUBLISHED',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "reviews_order_id_key" ON "reviews"("order_id");
CREATE INDEX IF NOT EXISTS "reviews_establishment_id_idx" ON "reviews"("establishment_id");

CREATE TABLE IF NOT EXISTS "review_responses" (
    "id" UUID NOT NULL,
    "review_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "body" VARCHAR(1000) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "review_responses_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "review_responses_review_id_key" ON "review_responses"("review_id");

CREATE TABLE IF NOT EXISTS "restaurant_events" (
    "id" UUID NOT NULL,
    "establishment_id" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "body" VARCHAR(1000),
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "restaurant_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "restaurant_events_establishment_id_idx" ON "restaurant_events"("establishment_id", "starts_at");

CREATE TABLE IF NOT EXISTS "promotions" (
    "id" UUID NOT NULL,
    "establishment_id" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "body" VARCHAR(500),
    "discount_bps" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT TRUE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "coupons" (
    "id" UUID NOT NULL,
    "establishment_id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "discount_bps" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT TRUE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "coupons_establishment_id_code_key" ON "coupons"("establishment_id", "code");

CREATE TABLE IF NOT EXISTS "cash_sessions" (
    "id" UUID NOT NULL,
    "establishment_id" UUID NOT NULL,
    "opened_by" UUID NOT NULL,
    "opening_amount" BIGINT NOT NULL,
    "closing_amount" BIGINT,
    "status" VARCHAR(16) NOT NULL DEFAULT 'OPEN',
    "opened_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(3),
    CONSTRAINT "cash_sessions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "cash_sessions_establishment_id_status_idx" ON "cash_sessions"("establishment_id", "status");

CREATE TABLE IF NOT EXISTS "cash_movements" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "amount" BIGINT NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "expenses" (
    "id" UUID NOT NULL,
    "establishment_id" UUID NOT NULL,
    "amount" BIGINT NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "category" VARCHAR(80) NOT NULL DEFAULT 'DIVERS',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "customer_credits" (
    "id" UUID NOT NULL,
    "establishment_id" UUID NOT NULL,
    "customer_name" VARCHAR(160) NOT NULL,
    "amount" BIGINT NOT NULL,
    "note" VARCHAR(300),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "customer_credits_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "supplier_debts" (
    "id" UUID NOT NULL,
    "establishment_id" UUID NOT NULL,
    "supplier_name" VARCHAR(160) NOT NULL,
    "amount" BIGINT NOT NULL,
    "note" VARCHAR(300),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "supplier_debts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "inventory_items" (
    "id" UUID NOT NULL,
    "establishment_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "unit" VARCHAR(24) NOT NULL DEFAULT 'u',
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "inventory_items_establishment_id_idx" ON "inventory_items"("establishment_id");

CREATE TABLE IF NOT EXISTS "stock_movements" (
    "id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "body" VARCHAR(500) NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

CREATE TABLE IF NOT EXISTS "delivery_tasks" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'UNASSIGNED',
    "courier_name" VARCHAR(160),
    "address_text" VARCHAR(300),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "delivery_tasks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "delivery_tasks_order_id_key" ON "delivery_tasks"("order_id");

CREATE TABLE IF NOT EXISTS "support_tickets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "subject" VARCHAR(160) NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "carts" ADD CONSTRAINT "carts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "carts" ADD CONSTRAINT "carts_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "establishments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dining_tables" ADD CONSTRAINT "dining_tables_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "establishments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "establishments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "establishments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "review_responses" ADD CONSTRAINT "review_responses_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "restaurant_events" ADD CONSTRAINT "restaurant_events_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "establishments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "establishments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "establishments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
