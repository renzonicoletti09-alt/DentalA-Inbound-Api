-- ====================================================================
-- DENTAL A - SQL SCHEMA FOR DENTIST PARTICULAR MODEL (SUPABASE & GOOGLE CALENDAR)
-- ====================================================================

-- Habilitar extensión UUID si no existe
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- --------------------------------------------------------------------
-- 1. DENTISTAS (dentists) - Tenant Principal del consultorio
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dentists (
    dentist_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    specialty VARCHAR(100) NOT NULL,
    address VARCHAR(255),
    google_maps_url VARCHAR(255),
    google_calendar_id VARCHAR(255) NOT NULL, -- ID del Google Calendar principal del dentista
    phone VARCHAR(30) DEFAULT NULL, -- Teléfono de WhatsApp del doctor (para comandos de dictado)
    telegram_chat_id VARCHAR(50) DEFAULT NULL, -- ID de Telegram del doctor (para alertas críticas de fallback)
    working_hours JSONB NOT NULL DEFAULT '{}'::jsonb, -- Horarios de atención
    timezone VARCHAR(50) DEFAULT 'America/Argentina/Buenos_Aires',
    language VARCHAR(10) DEFAULT 'es', -- Idioma por defecto del consultorio/dentista para Whisper e IA
    status VARCHAR(20) DEFAULT 'active', -- active | inactive
    notification_preferences JSONB DEFAULT '{}'::jsonb, -- Preferencias de alertas del Doctor (mute, resúmenes, criticidad)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- --------------------------------------------------------------------
-- 2. DENTIST STAFF (dentist_staff) - Asistentes / Secretarias
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dentist_staff (
    user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), -- ID de Auth de la Secretaria / Asistente
    dentist_id UUID REFERENCES public.dentists(dentist_id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'assistant', -- assistant | admin
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_dentist_staff_dentist ON public.dentist_staff(dentist_id);

-- --------------------------------------------------------------------
-- 3. PACIENTES (patients) - Identificados por clave compuesta (dentist_id, patient_id)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.patients (
    dentist_id UUID REFERENCES public.dentists(dentist_id) ON DELETE CASCADE,
    patient_id VARCHAR(50), -- WhatsApp en formato E.164 o ID de Voz
    name VARCHAR(255) NOT NULL,
    origin_channel VARCHAR(50) DEFAULT 'WhatsApp',
    chatwoot_contact_id VARCHAR(50) DEFAULT NULL, -- ID del contacto en Chatwoot
    chatwoot_conversation_id VARCHAR(50) DEFAULT NULL, -- ID de la conversación activa en Chatwoot
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_active_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    session_status VARCHAR(50) DEFAULT 'bot_active', -- bot_active | bot_paused | doctor_active | away_mode
    status_updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    send_care_documents BOOLEAN DEFAULT TRUE,
    allow_outbound_campaigns BOOLEAN DEFAULT TRUE,
    daily_token_usage INTEGER DEFAULT 0,
    blocked_until TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    locale VARCHAR(10) DEFAULT 'es', -- Preferencia de idioma del paciente para las comunicaciones
    psychological_profile JSONB DEFAULT '{}'::jsonb, -- Datos personales de cercanía (phobias, personal_interests, etc.)
    profile_references_log JSONB DEFAULT '[]'::jsonb, -- Historial de referencias personales mencionadas
    clinical_notes JSONB DEFAULT '{}'::jsonb, -- Indicaciones médicas y medicamentos del Doctor
    tags VARCHAR(50)[] DEFAULT '{}'::VARCHAR(50)[], -- Etiquetas (ej. high_value, conflictivo, no_show_historico)
    PRIMARY KEY (dentist_id, patient_id)
);
CREATE INDEX IF NOT EXISTS idx_patients_status ON public.patients(session_status);

-- --------------------------------------------------------------------
-- 4. SUBPERFILES FAMILIARES (sub_profiles)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sub_profiles (
    sub_profile_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dentist_id UUID NOT NULL,
    patient_id VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_active_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (dentist_id, patient_id) REFERENCES public.patients(dentist_id, patient_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sub_profiles_patient ON public.sub_profiles(dentist_id, patient_id);

-- --------------------------------------------------------------------
-- 5. CITAS (appointments)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.appointments (
    appointment_id VARCHAR(255) PRIMARY KEY, -- ID del turno en Easy!Appointments (Origen de verdad)
    dentist_id UUID NOT NULL,
    patient_id VARCHAR(50) NOT NULL,
    google_event_id VARCHAR(255) DEFAULT NULL, -- ID del evento en Google Calendar del dentista
    appointment_date_time TIMESTAMP WITH TIME ZONE NOT NULL,
    duration_min INTEGER NOT NULL DEFAULT 30, -- Múltiplos de 15 minutos
    last_treatment_type VARCHAR(255), -- Tratamiento realizado hoy
    next_treatment_type VARCHAR(255), -- Tratamiento planeado para la siguiente cita
    treatment_complexity VARCHAR(20) DEFAULT 'baja', -- baja | media | alta
    next_recommended_gap INTEGER DEFAULT 30, -- Días sugeridos para control
    estimated_due_date TIMESTAMP WITH TIME ZONE, -- Fecha estimada de próximo control
    reminders_count INTEGER DEFAULT 0, -- Contador de recordatorios
    status VARCHAR(20) DEFAULT 'pending', -- pending | confirmed | cancelled | completed | pending_offline
    preop_audio_note_url TEXT, -- Enlace audio instrucciones
    preop_instructions_text TEXT, -- Transcripción de audio
    doctor_notes TEXT, -- Notas clínicas/observaciones del Doctor para esta cita
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (dentist_id, patient_id) REFERENCES public.patients(dentist_id, patient_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_appointments_dentist_date ON public.appointments(dentist_id, appointment_date_time);
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON public.appointments(dentist_id, patient_id);

-- --------------------------------------------------------------------
-- 6. LISTA DE ESPERA (wishlist)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wishlist (
    wishlist_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dentist_id UUID NOT NULL,
    patient_id VARCHAR(50) NOT NULL,
    sub_profile_id UUID REFERENCES public.sub_profiles(sub_profile_id) ON DELETE SET NULL,
    desired_weeks INTEGER[] NOT NULL, -- Array de semanas deseadas del año
    time_preference VARCHAR(20) DEFAULT 'Indiferente', -- Mañana | Tarde | Indiferente
    signup_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    offered_gaps_count INTEGER DEFAULT 0, -- Ofertas de bache enviadas
    is_staylist BOOLEAN DEFAULT FALSE, -- Staylist de prioridad
    status VARCHAR(20) DEFAULT 'active', -- active | exited_success | expired | cancelled
    FOREIGN KEY (dentist_id, patient_id) REFERENCES public.patients(dentist_id, patient_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_wishlist_query ON public.wishlist(dentist_id, status);
CREATE INDEX IF NOT EXISTS idx_patients_patient_id ON public.patients(patient_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_patient ON public.wishlist(dentist_id, patient_id);
ALTER TABLE public.wishlist ADD COLUMN IF NOT EXISTS sub_profile_id UUID REFERENCES public.sub_profiles(sub_profile_id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_wishlist_sub_profile ON public.wishlist(sub_profile_id);

-- --------------------------------------------------------------------
-- 7. EXCEPCIONES DE HORARIO (dentist_schedule_exceptions)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dentist_schedule_exceptions (
    exception_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dentist_id UUID REFERENCES public.dentists(dentist_id) ON DELETE CASCADE,
    exception_date DATE NOT NULL, -- Fecha de la excepción (ej. feriado o vacaciones)
    reason VARCHAR(255), -- Razón del cierre o cambio de horario
    is_closed BOOLEAN DEFAULT TRUE, -- Indica si el consultorio estará cerrado todo el día
    custom_hours JSONB DEFAULT '{}'::jsonb, -- Horarios alternativos si no está cerrado
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_dentist_schedule_exceptions_query ON public.dentist_schedule_exceptions(dentist_id, exception_date);

-- --------------------------------------------------------------------
-- 8. REPORTES Y KPIS DE RENDIMIENTO (kpis_analytics)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kpis_analytics (
    kpi_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dentist_id UUID REFERENCES public.dentists(dentist_id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    kpi_name VARCHAR(100) NOT NULL,
    kpi_value NUMERIC DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_kpis_analytics_query ON public.kpis_analytics(dentist_id, date);

-- --------------------------------------------------------------------
-- 9. FAQ EMBEDDINGS (faq_embeddings) - Para RAG (Búsqueda Semántica)
-- --------------------------------------------------------------------
-- Habilitar extensión vector para pgvector en Supabase
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.faq_embeddings (
    faq_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dentist_id UUID REFERENCES public.dentists(dentist_id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    embedding vector(1536), -- Dimensiones para embeddings de OpenAI o Gemini
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_faq_embeddings_dentist ON public.faq_embeddings(dentist_id);

-- Índice HNSW optimizado para búsquedas vectoriales por distancia de coseno
CREATE INDEX IF NOT EXISTS idx_faq_embeddings_vector ON public.faq_embeddings USING hnsw (embedding vector_cosine_ops);

-- Asegurar que las columnas SaaS existan en entornos donde las tablas ya fueron creadas previamente
ALTER TABLE public.dentists ADD COLUMN IF NOT EXISTS language VARCHAR(10) DEFAULT 'es';
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS locale VARCHAR(10) DEFAULT 'es';

-- --------------------------------------------------------------------
-- 10. ASIGNACIÓN DE PROPIETARIOS (Hardening)
-- --------------------------------------------------------------------
ALTER TABLE public.dentists OWNER TO postgres;
ALTER TABLE public.dentist_staff OWNER TO postgres;
ALTER TABLE public.patients OWNER TO postgres;
ALTER TABLE public.sub_profiles OWNER TO postgres;
ALTER TABLE public.appointments OWNER TO postgres;
ALTER TABLE public.wishlist OWNER TO postgres;
ALTER TABLE public.dentist_schedule_exceptions OWNER TO postgres;
ALTER TABLE public.kpis_analytics OWNER TO postgres;
ALTER TABLE public.faq_embeddings OWNER TO postgres;

-- Conceder permisos necesarios al rol n8n_app_user (si existe en la DB)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'n8n_app_user') THEN
        GRANT SELECT, INSERT, UPDATE ON TABLE public.dentists TO n8n_app_user;
        GRANT SELECT, INSERT, UPDATE ON TABLE public.dentist_staff TO n8n_app_user;
        GRANT SELECT, INSERT, UPDATE ON TABLE public.patients TO n8n_app_user;
        GRANT SELECT, INSERT, UPDATE ON TABLE public.sub_profiles TO n8n_app_user;
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.appointments TO n8n_app_user;
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.wishlist TO n8n_app_user;
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.dentist_schedule_exceptions TO n8n_app_user;
        GRANT SELECT, INSERT, UPDATE ON TABLE public.kpis_analytics TO n8n_app_user;
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.faq_embeddings TO n8n_app_user;
    END IF;
END
$$;

-- Notificar a PostgREST para recargar la caché del esquema de forma inmediata
NOTIFY pgrst, 'reload schema';
