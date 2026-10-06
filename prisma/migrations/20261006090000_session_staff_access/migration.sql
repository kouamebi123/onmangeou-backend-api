-- Preuve du code d'acces du personnel, portee par la session.
-- Les sessions existantes restent sans preuve : elles gardent leurs droits
-- ordinaires mais perdent les permissions de plateforme jusqu'a une nouvelle
-- connexion avec le code d'acces.
ALTER TABLE "sessions" ADD COLUMN "staff_access_verified_at" TIMESTAMPTZ(3);
