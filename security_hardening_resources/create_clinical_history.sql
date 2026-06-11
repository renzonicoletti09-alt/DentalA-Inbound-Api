-- ====================================================================
-- DENTAL A - SQL SCHEMA FOR PATIENT CLINICAL HISTORY (HISTORIAL MÉDICO NATIVO)
-- ====================================================================

-- 1. Creación de la Tabla de Historial Clínico
CREATE TABLE IF NOT EXISTS public.patient_clinical_history (
    history_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dentist_id UUID NOT NULL,
    patient_id VARCHAR(50) NOT NULL,
    appointment_id VARCHAR(255) REFERENCES public.appointments(appointment_id) ON DELETE SET NULL,
    treatment_notes TEXT NOT NULL,
    prescriptions JSONB DEFAULT '[]'::jsonb, -- Array de medicamentos/recetas emitidos
    created_by UUID NOT NULL, -- UUID de Supabase Auth del Doctor o del Staff que registra la nota
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (dentist_id, patient_id) REFERENCES public.patients(dentist_id, patient_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_patient_clinical_history_query 
    ON public.patient_clinical_history(dentist_id, patient_id, created_at DESC);

-- Asignar propietario a postgres para consistencia
ALTER TABLE public.patient_clinical_history OWNER TO postgres;

-- 2. Conceder permisos al rol restringido n8n_app_user
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'n8n_app_user') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.patient_clinical_history TO n8n_app_user;
    END IF;
END
$$;

-- 3. Habilitar Row Level Security (RLS)
ALTER TABLE public.patient_clinical_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_clinical_history FORCE ROW LEVEL SECURITY;

-- 4. Definición de Políticas RLS por Rol
DROP POLICY IF EXISTS "Dentistas gestionan historial" ON public.patient_clinical_history;
DROP POLICY IF EXISTS "Staff lee historial" ON public.patient_clinical_history;
DROP POLICY IF EXISTS "Staff inserta historial" ON public.patient_clinical_history;

-- Dentistas tienen acceso absoluto de lectura/escritura/borrado
CREATE POLICY "Dentistas gestionan historial" ON public.patient_clinical_history
    FOR ALL TO authenticated
    USING (auth.uid() = dentist_id)
    WITH CHECK (auth.uid() = dentist_id);

-- Staff (Secretarias/Asistentes) puede leer el historial clínico
CREATE POLICY "Staff lee historial" ON public.patient_clinical_history
    FOR SELECT TO authenticated
    USING (dentist_id = (SELECT dentist_id FROM public.dentist_staff WHERE user_id = auth.uid()));


-- 5. Trigger de Auditoría Clínica Inmutable
DROP TRIGGER IF EXISTS tr_audit_clinical_history ON public.patient_clinical_history;
CREATE TRIGGER tr_audit_clinical_history
AFTER INSERT OR UPDATE OR DELETE ON public.patient_clinical_history
FOR EACH ROW EXECUTE FUNCTION audit.process_audit_log();

-- Notificar a PostgREST para recargar la caché del esquema de forma inmediata
NOTIFY pgrst, 'reload schema';
