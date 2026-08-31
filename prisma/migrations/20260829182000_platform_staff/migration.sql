-- Staff interne de la plateforme (specification section 31).
-- Chaque administrateur est nominatif : aucun compte partage.

CREATE TYPE "PlatformStaffRole" AS ENUM ('ADMIN', 'SUPPORT');

CREATE TABLE "platform_staff" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "PlatformStaffRole" NOT NULL,
    "granted_by_user_id" UUID,
    "granted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),
    "reason" VARCHAR(300),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "platform_staff_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_staff_user_id_key" ON "platform_staff"("user_id");
CREATE INDEX "platform_staff_role_revoked_at_idx" ON "platform_staff"("role", "revoked_at");

ALTER TABLE "platform_staff"
  ADD CONSTRAINT "platform_staff_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
