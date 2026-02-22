-- =============================================================
-- The Cortex — bpmn_catalog table
-- =============================================================

CREATE TABLE IF NOT EXISTS bpmn_catalog (
    workflow_id  VARCHAR(64)  PRIMARY KEY,
    name         VARCHAR(256) NOT NULL,
    bpmn_payload JSONB        NOT NULL,
    is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Auto-update `updated_at` on every row modification
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bpmn_catalog_updated_at
    BEFORE UPDATE ON bpmn_catalog
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Index for quick active-workflow lookups
CREATE INDEX IF NOT EXISTS idx_bpmn_catalog_active
    ON bpmn_catalog (is_active)
    WHERE is_active = TRUE;
