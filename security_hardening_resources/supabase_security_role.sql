-- ====================================================================
-- SCRIPT DE HARDENING DE BASE DE DATOS - ROL n8n Y RLS (DENTISTA)
-- ====================================================================

-- 1. CREACIÓN DEL ROL RESTRINGIDO n8n
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'n8n_app_user') THEN
        CREATE ROLE n8n_app_user WITH LOGIN PASSWORD '<DENTALA_SUPABASE_N8N_APP_USER_PASSWORD>';
    ELSE
        ALTER ROLE n8n_app_user WITH PASSWORD '<DENTALA_SUPABASE_N8N_APP_USER_PASSWORD>';
    END IF;
END
$$;

ALTER ROLE n8n_app_user WITH NOBYPASSRLS;

GRANT USAGE ON SCHEMA public TO n8n_app_user;
REVOKE ALL PRIVILEGES ON SCHEMA audit FROM public, n8n_app_user;

-- Permisos específicos en tablas
GRANT SELECT, INSERT, UPDATE ON TABLE public.dentists TO n8n_app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.dentist_staff TO n8n_app_user;
GRANT SELECT, INSERT, UPDATE ON TABLE public.patients TO n8n_app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.appointments TO n8n_app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.wishlist TO n8n_app_user;
GRANT SELECT, INSERT, UPDATE ON TABLE public.sub_profiles TO n8n_app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.dentist_schedule_exceptions TO n8n_app_user;
GRANT SELECT, INSERT, UPDATE ON TABLE public.kpis_analytics TO n8n_app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.faq_embeddings TO n8n_app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO n8n_app_user;

-- 2. FUNCIÓN DE CONTEXTO DE TENANT MULTI-TENANT (RESOLUCIÓN DE DENTISTA)
CREATE OR REPLACE FUNCTION public.get_current_tenant_id()
RETURNS UUID AS $$
DECLARE
    v_dentist_id UUID;
BEGIN
    -- 1. Si es el usuario de n8n, extraer de la variable de sesión local
    IF current_user = 'n8n_app_user' THEN
        RETURN NULLIF(current_setting('app.current_dentist_id', true), '')::uuid;
    END IF;

    -- 2. Si es un usuario autenticado por JWT (Supabase Auth / API REST)
    IF auth.role() = 'authenticated' THEN
        -- Intentar ver si el usuario es el doctor principal (propietario del tenant)
        SELECT dentist_id INTO v_dentist_id FROM public.dentists WHERE dentist_id = auth.uid();
        IF FOUND THEN
            RETURN v_dentist_id;
        END IF;

        -- Intentar ver si el usuario es un asistente/staff autorizado
        SELECT dentist_id INTO v_dentist_id FROM public.dentist_staff WHERE user_id = auth.uid();
        IF FOUND THEN
            RETURN v_dentist_id;
        END IF;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_current_tenant_id() TO n8n_app_user, authenticated;

-- 3. HABILITACIÓN DE RLS Y APLICACIÓN DE POLÍTICAS DE AISLAMIENTO

-- Dentistas
ALTER TABLE public.dentists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dentists FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Aislamiento multi-tenant en dentists" ON public.dentists;
CREATE POLICY "Aislamiento multi-tenant en dentists" ON public.dentists
    FOR ALL TO authenticated, n8n_app_user
    USING (dentist_id = public.get_current_tenant_id())
    WITH CHECK (dentist_id = public.get_current_tenant_id());

-- Staff
ALTER TABLE public.dentist_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dentist_staff FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Aislamiento multi-tenant en dentist_staff" ON public.dentist_staff;
CREATE POLICY "Aislamiento multi-tenant en dentist_staff" ON public.dentist_staff
    FOR ALL TO authenticated, n8n_app_user
    USING (dentist_id = public.get_current_tenant_id())
    WITH CHECK (dentist_id = public.get_current_tenant_id());

-- Pacientes
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Aislamiento multi-tenant en patients" ON public.patients;
CREATE POLICY "Aislamiento multi-tenant en patients" ON public.patients
    FOR ALL TO authenticated, n8n_app_user
    USING (dentist_id = public.get_current_tenant_id())
    WITH CHECK (dentist_id = public.get_current_tenant_id());

-- Subperfiles
ALTER TABLE public.sub_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sub_profiles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Aislamiento multi-tenant en sub_profiles" ON public.sub_profiles;
CREATE POLICY "Aislamiento multi-tenant en sub_profiles" ON public.sub_profiles
    FOR ALL TO authenticated, n8n_app_user
    USING (dentist_id = public.get_current_tenant_id())
    WITH CHECK (dentist_id = public.get_current_tenant_id());

-- Citas
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Aislamiento multi-tenant en appointments" ON public.appointments;
CREATE POLICY "Aislamiento multi-tenant en appointments" ON public.appointments
    FOR ALL TO authenticated, n8n_app_user
    USING (dentist_id = public.get_current_tenant_id())
    WITH CHECK (dentist_id = public.get_current_tenant_id());

-- Wishlist
ALTER TABLE public.wishlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlist FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Aislamiento multi-tenant en wishlist" ON public.wishlist;
CREATE POLICY "Aislamiento multi-tenant en wishlist" ON public.wishlist
    FOR ALL TO authenticated, n8n_app_user
    USING (dentist_id = public.get_current_tenant_id())
    WITH CHECK (dentist_id = public.get_current_tenant_id());

-- Excepciones de Horario
ALTER TABLE public.dentist_schedule_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dentist_schedule_exceptions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Aislamiento multi-tenant en dentist_schedule_exceptions" ON public.dentist_schedule_exceptions;
CREATE POLICY "Aislamiento multi-tenant en dentist_schedule_exceptions" ON public.dentist_schedule_exceptions
    FOR ALL TO authenticated, n8n_app_user
    USING (dentist_id = public.get_current_tenant_id())
    WITH CHECK (dentist_id = public.get_current_tenant_id());

-- Analíticas
ALTER TABLE public.kpis_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpis_analytics FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Aislamiento multi-tenant en kpis_analytics" ON public.kpis_analytics;
CREATE POLICY "Aislamiento multi-tenant en kpis_analytics" ON public.kpis_analytics
    FOR ALL TO authenticated, n8n_app_user
    USING (dentist_id = public.get_current_tenant_id())
    WITH CHECK (dentist_id = public.get_current_tenant_id());

-- FAQ Embeddings
ALTER TABLE public.faq_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faq_embeddings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Aislamiento multi-tenant en faq_embeddings" ON public.faq_embeddings;
CREATE POLICY "Aislamiento multi-tenant en faq_embeddings" ON public.faq_embeddings
    FOR ALL TO authenticated, n8n_app_user
    USING (dentist_id = public.get_current_tenant_id())
    WITH CHECK (dentist_id = public.get_current_tenant_id());


-- 4. FUNCIONES GLOBALES CON PRIVILEGIOS RESTRINGIDOS (SECURITY DEFINER)
-- Evitan el bypass global de RLS en n8n permitiendo solo queries agregadas de lectura controladas.

-- Crons de recordatorio diario
CREATE OR REPLACE FUNCTION public.get_global_upcoming_appointments(p_target_date DATE)
RETURNS TABLE (
    appointment_id VARCHAR,
    dentist_id UUID,
    patient_id VARCHAR,
    appointment_date_time TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT a.appointment_id, a.dentist_id, a.patient_id, a.appointment_date_time
    FROM public.appointments a
    WHERE a.status = 'pending'
      AND a.appointment_date_time::date = p_target_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_global_upcoming_appointments(DATE) TO n8n_app_user;

-- Crons de baches/wishlist
CREATE OR REPLACE FUNCTION public.get_global_active_wishlist()
RETURNS TABLE (
    wishlist_id UUID,
    dentist_id UUID,
    patient_id VARCHAR,
    time_preference VARCHAR,
    is_staylist BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT w.wishlist_id, w.dentist_id, w.patient_id, w.time_preference, w.is_staylist
    FROM public.wishlist w
    WHERE w.status = 'active';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_global_active_wishlist() TO n8n_app_user;

-- Notificar a PostgREST para recargar el esquema
NOTIFY pgrst, 'reload schema';

