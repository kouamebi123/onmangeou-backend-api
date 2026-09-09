CREATE TABLE ad_campaigns (
 id uuid PRIMARY KEY, establishment_id uuid NOT NULL REFERENCES establishments(id),
 title varchar(120) NOT NULL, starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED','PAUSED')),
 impressions bigint NOT NULL DEFAULT 0, clicks bigint NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(), CHECK(ends_at>starts_at)
);
CREATE INDEX ad_campaigns_delivery_idx ON ad_campaigns(status,starts_at,ends_at);
CREATE INDEX ad_campaigns_establishment_idx ON ad_campaigns(establishment_id,created_at);
CREATE TABLE ad_views (
 id uuid PRIMARY KEY, campaign_id uuid NOT NULL REFERENCES ad_campaigns(id),
 expires_at timestamptz NOT NULL, seen boolean NOT NULL DEFAULT false, clicked boolean NOT NULL DEFAULT false
);
CREATE INDEX ad_views_expiry_idx ON ad_views(expires_at);
