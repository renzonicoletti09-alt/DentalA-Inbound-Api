-- ====================================================================
-- SCRIPT DE AUDITORÍA CLÍNICA NATIVA EN SUPABASE (DENTISTA) - HARDENED
-- ====================================================================
CREATE SCHEMA IF NOT EXISTS audit;

-- Modernized table definition using IDENTITY and TEXT for flexibility
CREATE TABLE IF NOT EXISTS audit.clinical_audit_log (
    log_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    table_name TEXT NOT NULL,
    action TEXT NOT NULL,
    old_data JSONB,
    new_data JSONB,
    changed_by TEXT NOT NULL,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Optimize queries searching logs by table or user ordered by time (most common auditor paths)
CREATE INDEX IF NOT EXISTS idx_audit_table_name_changed_at 
    ON audit.clinical_audit_log(table_name, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_changed_by_changed_at 
    ON audit.clinical_audit_log(changed_by, changed_at DESC);

-- Secure schema but allow execution of triggers
REVOKE ALL ON SCHEMA audit FROM public, n8n_app_user;
REVOKE ALL ON ALL TABLES IN SCHEMA audit FROM public, n8n_app_user;

-- Grant USAGE to public/n8n_app_user so their writes don't crash when trigger executes,
-- but do NOT grant them read/write permissions on the clinical_audit_log table itself.
GRANT USAGE ON SCHEMA audit TO public, n8n_app_user;
GRANT USAGE ON SCHEMA audit TO postgres;
GRANT SELECT ON ALL TABLES IN SCHEMA audit TO postgres;

CREATE OR REPLACE FUNCTION audit.process_audit_log()
RETURNS TRIGGER AS $$
DECLARE
    v_changed_by TEXT;
BEGIN
    -- Resolve user identity:
    -- 1. Check for Supabase Auth JWT claims (email)
    -- 2. Fall back to Supabase Auth JWT claims (sub/UUID)
    -- 3. Fall back to current session DB user (e.g., n8n_app_user, postgres)
    v_changed_by := COALESCE(
        nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'email',
        nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub',
        session_user
    );

    IF (TG_OP = 'DELETE') THEN
        INSERT INTO audit.clinical_audit_log (table_name, action, old_data, new_data, changed_by)
        VALUES (TG_TABLE_NAME, TG_OP, to_jsonb(OLD), NULL, v_changed_by);
        RETURN OLD;
    ELSIF (TG_OP = 'UPDATE') THEN
        -- Optimization: Skip logging if no actual columns have changed values
        IF (OLD IS NOT DISTINCT FROM NEW) THEN
            RETURN NEW;
        END IF;
        INSERT INTO audit.clinical_audit_log (table_name, action, old_data, new_data, changed_by)
        VALUES (TG_TABLE_NAME, TG_OP, to_jsonb(OLD), to_jsonb(NEW), v_changed_by);
        RETURN NEW;
    ELSIF (TG_OP = 'INSERT') THEN
        INSERT INTO audit.clinical_audit_log (table_name, action, old_data, new_data, changed_by)
        VALUES (TG_TABLE_NAME, TG_OP, NULL, to_jsonb(NEW), v_changed_by);
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp, public, audit;

-- Triggers
DROP TRIGGER IF EXISTS tr_audit_patients ON public.patients;
CREATE TRIGGER tr_audit_patients
AFTER INSERT OR UPDATE OR DELETE ON public.patients
FOR EACH ROW EXECUTE FUNCTION audit.process_audit_log();

DROP TRIGGER IF EXISTS tr_audit_appointments ON public.appointments;
CREATE TRIGGER tr_audit_appointments
AFTER INSERT OR UPDATE OR DELETE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION audit.process_audit_log();

DROP TRIGGER IF EXISTS tr_audit_wishlist ON public.wishlist;
CREATE TRIGGER tr_audit_wishlist
AFTER INSERT OR UPDATE OR DELETE ON public.wishlist
FOR EACH ROW EXECUTE FUNCTION audit.process_audit_log();

DROP TRIGGER IF EXISTS tr_audit_sub_profiles ON public.sub_profiles;
CREATE TRIGGER tr_audit_sub_profiles
AFTER INSERT OR UPDATE OR DELETE ON public.sub_profiles
FOR EACH ROW EXECUTE FUNCTION audit.process_audit_log();

DROP TRIGGER IF EXISTS tr_audit_exceptions ON public.dentist_schedule_exceptions;
CREATE TRIGGER tr_audit_exceptions
AFTER INSERT OR UPDATE OR DELETE ON public.dentist_schedule_exceptions
FOR EACH ROW EXECUTE FUNCTION audit.process_audit_log();
