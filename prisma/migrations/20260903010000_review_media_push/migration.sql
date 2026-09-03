CREATE TABLE review_photos (
  id uuid PRIMARY KEY, review_id uuid NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  storage_key text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX review_photos_review_idx ON review_photos(review_id);
CREATE TABLE review_reports (
  id uuid PRIMARY KEY, review_id uuid NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  reporter_user_id uuid NOT NULL REFERENCES users(id),
  reason text NOT NULL CHECK (reason IN ('SPAM','ABUSE','PRIVACY','MISLEADING','OTHER')),
  detail varchar(1000), status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','DISMISSED','ACTIONED')),
  resolution varchar(1000), resolved_by uuid REFERENCES users(id), resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(review_id, reporter_user_id)
);
CREATE INDEX review_reports_status_idx ON review_reports(status, created_at);

CREATE TABLE push_subscriptions (
  id uuid PRIMARY KEY, device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  application text NOT NULL CHECK(application IN ('CLIENT','MERCHANT')),
  organization_id uuid REFERENCES organizations(id), token varchar(512) NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(device_id, application)
);
ALTER TABLE notifications ADD COLUMN audience text NOT NULL DEFAULT 'CLIENT';
ALTER TABLE notifications ADD COLUMN organization_id uuid;
ALTER TABLE notifications ADD COLUMN establishment_id uuid;
ALTER TABLE notifications ADD COLUMN target_id uuid;
CREATE TABLE push_deliveries (
  id uuid PRIMARY KEY, notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'PENDING', attempts int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(), ticket_id text, sent_token text, error_code text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(notification_id, subscription_id)
);
CREATE INDEX push_deliveries_due_idx ON push_deliveries(status, next_attempt_at);

-- No historical backfill: only notifications created after migration are queued.
CREATE FUNCTION enqueue_notification_push() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO push_deliveries(id, notification_id, subscription_id)
  SELECT gen_random_uuid(), NEW.id, s.id FROM push_subscriptions s
  WHERE s.user_id=NEW.user_id AND s.enabled AND s.application=NEW.audience
    AND (NEW.audience='CLIENT' OR s.organization_id=NEW.organization_id)
    AND (NEW.kind NOT IN ('EVENT','PROMOTION','MARKETING') OR COALESCE
      ((SELECT c.granted AND c.revoked_at IS NULL FROM consents c WHERE c.user_id=NEW.user_id AND c.type='MARKETING' ORDER BY c.granted_at DESC,c.created_at DESC,c.id DESC LIMIT 1),false));
  RETURN NEW;
END $$;
CREATE TRIGGER notifications_push AFTER INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION enqueue_notification_push();

CREATE FUNCTION notify_commerce_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE customer uuid; label text; kind_value text;
BEGIN
  IF TG_OP='UPDATE' AND OLD.status=NEW.status THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME='orders' THEN
    customer := NEW.customer_user_id; label := 'Une commande a été mise à jour'; kind_value := 'ORDER';
  ELSE
    customer := NEW.user_id; label := 'Une réservation a été mise à jour'; kind_value := 'RESERVATION';
  END IF;
  IF customer IS NOT NULL THEN
    INSERT INTO notifications(id,user_id,title,body,kind,audience,target_id,created_at)
    VALUES(gen_random_uuid(),customer,'OnMangeOù',label || '. Ouvrez l’application pour consulter son suivi.',kind_value,'CLIENT',NEW.id,now());
  END IF;
  -- An unpaid draft is not yet an actionable restaurant order.
  IF TG_TABLE_NAME='orders' AND NEW.status='PENDING_PAYMENT' THEN RETURN NEW; END IF;
  INSERT INTO notifications(id,user_id,title,body,kind,audience,organization_id,establishment_id,target_id,created_at)
  SELECT gen_random_uuid(),m.user_id,'OnMangeOù Restaurant',label || '. Consultez votre espace restaurant.',kind_value,'MERCHANT',NEW.organization_id,NEW.establishment_id,NEW.id,now()
  FROM organization_members m JOIN member_establishments me ON me.member_id=m.id
  WHERE m.organization_id=NEW.organization_id AND m.status='ACTIVE' AND m.revoked_at IS NULL AND me.establishment_id=NEW.establishment_id
    AND EXISTS(SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=m.role_id AND p.code='orders.read');
  RETURN NEW;
END $$;
CREATE TRIGGER orders_notifications AFTER INSERT OR UPDATE OF status ON orders FOR EACH ROW EXECUTE FUNCTION notify_commerce_change();
CREATE TRIGGER reservations_notifications AFTER INSERT OR UPDATE OF status ON reservations FOR EACH ROW EXECUTE FUNCTION notify_commerce_change();
