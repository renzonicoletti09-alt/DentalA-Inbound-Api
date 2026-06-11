-- ==============================================================================
-- DENTALA - MÓDULO 1: CORE DB & HARDENING ESTRUCTURAL
-- Generado para PostgreSQL (Supabase)
-- ==============================================================================

-- 1. EXTENSIONES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ==============================================================================
-- 2. ESQUEMA RELACIONAL (TABLAS)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.dentists (
    dentist_id UUID PRIMARY KEY, -- ID de Supabase Auth
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    specialty VARCHAR(100),
    address VARCHAR(255),
    google_maps_url VARCHAR(255),
    google_calendar_id VARCHAR(255),
    working_hours JSONB,
    timezone VARCHAR(50) DEFAULT 'UTC',
    language VARCHAR(10) DEFAULT 'es',
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    notification_preferences JSONB,
    campaign_preferences JSONB,
    active_scheduling_engine VARCHAR(50) DEFAULT 'easyappointments',
    avg_consult_price NUMERIC(10,2),
    whatsapp_number_1 VARCHAR(50),
    whatsapp_number_2 VARCHAR(50),
    last_active_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.dentist_staff (
    user_id UUID PRIMARY KEY,
    dentist_id UUID REFERENCES public.dentists(dentist_id) ON DELETE CASCADE,
    role VARCHAR(50) CHECK (role IN ('assistant', 'admin')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.patients (
    dentist_id UUID REFERENCES public.dentists(dentist_id) ON DELETE CASCADE,
    patient_id VARCHAR(100),
    name VARCHAR(255) NOT NULL,
    date_of_birth DATE,
    origin_channel VARCHAR(100),
    locale VARCHAR(10) DEFAULT 'es',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_active_at TIMESTAMPTZ,
    session_status VARCHAR(50) DEFAULT 'bot_active' CHECK (session_status IN ('bot_active', 'bot_paused', 'doctor_active', 'away_mode', 'blocked_manual_review')),
    status_updated_at TIMESTAMPTZ,
    send_care_documents BOOLEAN DEFAULT TRUE,
    allow_outbound_campaigns BOOLEAN DEFAULT TRUE,
    psychological_profile TEXT, -- Cifrado AES-256-GCM (String Base64/Hex)
    profile_references_log JSONB,
    clinical_notes TEXT, -- Cifrado estático AES-256-GCM (String Base64/Hex)
    tags VARCHAR[],
    PRIMARY KEY (dentist_id, patient_id)
);

CREATE TABLE IF NOT EXISTS public.appointments (
    appointment_id VARCHAR(100) PRIMARY KEY,
    dentist_id UUID NOT NULL,
    patient_id VARCHAR(100) NOT NULL,
    google_event_id VARCHAR(255),
    appointment_date_time TIMESTAMPTZ NOT NULL,
    duration_min INTEGER DEFAULT 15,
    last_treatment_type VARCHAR(255),
    next_treatment_type VARCHAR(255),
    treatment_complexity VARCHAR(50) CHECK (treatment_complexity IN ('baja', 'media', 'alta')),
    next_recommended_gap INTEGER,
    estimated_due_date TIMESTAMPTZ,
    reminders_count INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'no_show', 'pending_offline')),
    preop_audio_note_url VARCHAR(255),
    preop_instructions_text TEXT,
    doctor_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY (dentist_id, patient_id) REFERENCES public.patients(dentist_id, patient_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.wishlist (
    wishlist_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dentist_id UUID NOT NULL,
    patient_id VARCHAR(100) NOT NULL,
    desired_weeks VARCHAR[],
    time_preference VARCHAR(50),
    signup_timestamp TIMESTAMPTZ DEFAULT NOW(),
    offered_gaps_count INTEGER DEFAULT 0,
    is_staylist BOOLEAN DEFAULT FALSE,
    last_offered_at TIMESTAMPTZ,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'exited_success', 'expired', 'cancelled')),
    FOREIGN KEY (dentist_id, patient_id) REFERENCES public.patients(dentist_id, patient_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.wishlist_batch_tracking (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dentist_id UUID REFERENCES public.dentists(dentist_id) ON DELETE CASCADE,
    slot_id VARCHAR(100) NOT NULL,
    candidates_notified JSONB,
    batch_number INTEGER DEFAULT 1,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled', 'expired', 'failed')),
    notified_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.whatsapp_message_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dentist_id UUID NOT NULL,
    patient_id VARCHAR(100) NOT NULL,
    direction VARCHAR(50) CHECK (direction IN ('inbound', 'outbound')),
    message_type VARCHAR(50) CHECK (message_type IN ('text', 'template', 'image', 'audio')),
    template_name VARCHAR(255),
    status VARCHAR(50) CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
    message_body TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY (dentist_id, patient_id) REFERENCES public.patients(dentist_id, patient_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.faq_textual (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dentist_id UUID REFERENCES public.dentists(dentist_id) ON DELETE CASCADE,
    category VARCHAR(50) DEFAULT 'general' CHECK (category IN ('general', 'postop')),
    pregunta TEXT NOT NULL,
    respuesta TEXT NOT NULL,
    sinonimos_opcionales TEXT[],
    sheet_row_id INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(dentist_id, sheet_row_id)
);

CREATE TABLE IF NOT EXISTS public.dentist_schedule_exceptions (
    exception_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dentist_id UUID REFERENCES public.dentists(dentist_id) ON DELETE CASCADE,
    exception_date DATE NOT NULL,
    reason VARCHAR(255),
    is_closed BOOLEAN DEFAULT FALSE,
    custom_hours JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.treatment_documents (
    document_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dentist_id UUID REFERENCES public.dentists(dentist_id) ON DELETE CASCADE,
    treatment_type VARCHAR(100) NOT NULL,
    document_type VARCHAR(50) CHECK (document_type IN ('pre_op', 'post_op')),
    file_name VARCHAR(255),
    storage_path VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.kpis_analytics (
    kpi_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dentist_id UUID REFERENCES public.dentists(dentist_id) ON DELETE CASCADE,
    date DATE NOT NULL,
    kpi_name VARCHAR(100) NOT NULL,
    kpi_value NUMERIC(15,2) NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.access_logs_clinical (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID,
    patient_id VARCHAR(100),
    ip_address VARCHAR(45),
    accessed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.access_logs (
    access_log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID,
    dentist_id UUID,
    patient_id VARCHAR(100),
    action_type VARCHAR(50) CHECK (action_type IN ('READ_PATIENT', 'READ_CLINICAL', 'EXPORT_DATA', 'AUTH_LOGIN')),
    resource_type VARCHAR(50) CHECK (resource_type IN ('patients', 'clinical_notes', 'wishlist')),
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 3. ÍNDICES Y OPTIMIZACIÓN (BÚSQUEDA TEXTUAL GIN)
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_faq_textual_pregunta ON public.faq_textual USING GIN (pregunta gin_trgm_ops);
-- No se puede aplicar GIN trigrama directamente sobre ARRAY, usamos GIN estándar para array
CREATE INDEX IF NOT EXISTS idx_faq_textual_sinonimos ON public.faq_textual USING GIN (sinonimos_opcionales);
CREATE INDEX IF NOT EXISTS idx_wishlist_priority ON public.wishlist (signup_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_appointments_lookup ON public.appointments (dentist_id, patient_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_message_log_lookup ON public.whatsapp_message_log (dentist_id, patient_id, created_at DESC);

-- ==============================================================================
-- 4. HARDENING, ROL DE OPERADOR Y RLS
-- ==============================================================================

-- Creación de Rol Operador para n8n con Bypass de RLS (Para ejecución backend confiable)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'n8n_app_user') THEN
    CREATE ROLE n8n_app_user WITH NOLOGIN BYPASSRLS;
  END IF;
END
$$;

-- Otorgar permisos al rol
GRANT USAGE ON SCHEMA public TO n8n_app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO n8n_app_user;

-- Habilitar RLS en todas las tablas transaccionales de negocio
ALTER TABLE public.dentists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dentist_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlist_batch_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_message_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faq_textual ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dentist_schedule_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treatment_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpis_analytics ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS de Aislamiento Estricto (Tenant: dentist_id)
-- Un dentista autenticado puede acceder solo a su propia información
CREATE POLICY "Dentist access own records" ON public.dentists
    FOR ALL USING (auth.uid() = dentist_id);

CREATE POLICY "Dentist access own patients" ON public.patients
    FOR ALL USING (auth.uid() = dentist_id);

CREATE POLICY "Dentist access own appointments" ON public.appointments
    FOR ALL USING (auth.uid() = dentist_id);

-- (Las mismas políticas de validación se extenderían a las demás tablas)

-- ==============================================================================
-- 5. SUPABASE STORAGE (BUCKET PRIVADO)
-- ==============================================================================

-- Supabase requiere insertar el bucket en su esquema storage
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('treatment-documents', 'treatment-documents', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = false;

-- Política Storage: Solo lectura/escritura autenticada
CREATE POLICY "Restrict treatment docs access" ON storage.objects
    FOR ALL USING (bucket_id = 'treatment-documents' AND auth.role() = 'authenticated');
