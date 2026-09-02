ALTER TABLE coupons ADD COLUMN expires_at TIMESTAMPTZ(3);
ALTER TABLE coupons ADD COLUMN minimum_amount BIGINT NOT NULL DEFAULT 0 CHECK (minimum_amount >= 0);
ALTER TABLE orders ADD COLUMN coupon_code VARCHAR(40);
ALTER TABLE orders ADD COLUMN discount_amount BIGINT NOT NULL DEFAULT 0 CHECK (discount_amount >= 0);
