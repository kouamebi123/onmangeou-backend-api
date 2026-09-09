ALTER TABLE reviews ADD COLUMN delivery_score smallint CHECK (delivery_score BETWEEN 1 AND 5);
