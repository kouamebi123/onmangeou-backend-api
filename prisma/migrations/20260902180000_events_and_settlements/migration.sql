ALTER TABLE restaurant_events ADD COLUMN cancelled_at TIMESTAMPTZ(3);
ALTER TABLE customer_credits ADD COLUMN due_at TIMESTAMPTZ(3);
ALTER TABLE supplier_debts ADD COLUMN due_at TIMESTAMPTZ(3);
CREATE TABLE ledger_settlements (
 id UUID PRIMARY KEY,
 credit_id UUID REFERENCES customer_credits(id),
 debt_id UUID REFERENCES supplier_debts(id),
 amount BIGINT NOT NULL CHECK (amount > 0),
 reference VARCHAR(160) NOT NULL,
 created_by UUID NOT NULL REFERENCES users(id),
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ((credit_id IS NULL) <> (debt_id IS NULL))
);
CREATE INDEX ledger_settlements_credit_idx ON ledger_settlements(credit_id);
CREATE INDEX ledger_settlements_debt_idx ON ledger_settlements(debt_id);
