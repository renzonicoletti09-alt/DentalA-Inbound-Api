# Módulo 1 (Core DB & Hardening) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar y desplegar la base de datos de Supabase, las políticas de Row Level Security (RLS) y los triggers de auditoría nativos en PostgreSQL para soportar el modelo de Dentista Particular con co-gestión de secretarias y optimizaciones conversacionales.

**Architecture:** Modificar los scripts SQL locales (`create_scheduling_schema.sql`, `supabase_security_role.sql`, `supabase_audit_logs.sql`), ejecutarlos secuencialmente a través del script unificado `deploy_database.js`, y verificar la seguridad RLS y auditoría mediante consultas parametrizadas directas.

**Tech Stack:** PostgreSQL, Node.js, `pg` (PostgreSQL client).

---

### Task 1: Rediseñar el Esquema SQL de Tablas
**Files:**
- Modify: `security_hardening_resources/create_scheduling_schema.sql`

- [ ] **Step 1: Modificar el script de esquema SQL**
  Reescribir `security_hardening_resources/create_scheduling_schema.sql` para remover la tabla `clinics` y la clave compuesta `clinic_id`, consolidar a `dentists` como la tabla principal de tenant, agregar la tabla `dentist_staff` y las columnas de cercanía clínica y excepciones horarias.
  Código a escribir en [create_scheduling_schema.sql](file:///c:/Users/Renzo/OneDrive/Documentos/DentalA/security_hardening_resources/create_scheduling_schema.sql):
  ```sql
  -- ====================================================================
  -- DENTAL A - SQL SCHEMA FOR CUSTOM GOOGLE CALENDAR + SUPABASE SCHEDULING (DENTISTA)
  -- ====================================================================
  CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

  -- 1. DENTISTAS (dentists) - Tenant Principal
  CREATE TABLE IF NOT EXISTS public.dentists (
      dentist_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      specialty VARCHAR(100) NOT NULL,
      google_calendar_id VARCHAR(255) NOT NULL,
      working_hours JSONB NOT NULL,
      address TEXT,
      google_maps_url TEXT,
      timezone VARCHAR(50) DEFAULT 'America/Argentina/Buenos_Aires',
      status VARCHAR(20) DEFAULT 'active',
      notification_preferences JSONB DEFAULT '{"is_muted": false, "instant_urgency": true, "instant_frustration": true, "on_cancellation": false}'::jsonb,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );

  -- 1.1. ASISTENTES / SECRETARIAS (dentist_staff)
  CREATE TABLE IF NOT EXISTS public.dentist_staff (
      user_id UUID PRIMARY KEY, -- ID del asistente en auth.users
      dentist_id UUID REFERENCES public.dentists(dentist_id) ON DELETE CASCADE,
      role VARCHAR(50) DEFAULT 'assistant', -- assistant | admin
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_dentist_staff_dentist ON public.dentist_staff(dentist_id);

  -- 2. PACIENTES (patients)
  CREATE TABLE IF NOT EXISTS public.patients (
      dentist_id UUID REFERENCES public.dentists(dentist_id) ON DELETE CASCADE,
      patient_id VARCHAR(50), -- WhatsApp o ID de Voz
      name VARCHAR(255) NOT NULL,
      origin_channel VARCHAR(50) DEFAULT 'WhatsApp',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      last_active_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      session_status VARCHAR(50) DEFAULT 'bot_active',
      status_updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      send_care_documents BOOLEAN DEFAULT TRUE,
      allow_outbound_campaigns BOOLEAN DEFAULT TRUE,
      daily_token_usage INTEGER DEFAULT 0,
      blocked_until TIMESTAMP WITH TIME ZONE DEFAULT NULL,
      psychological_profile JSONB DEFAULT '{}'::jsonb,
      profile_references_log JSONB DEFAULT '[]'::jsonb,
      clinical_notes JSONB DEFAULT '{}'::jsonb,
      tags VARCHAR[] DEFAULT '{}'::varchar[],
      PRIMARY KEY (dentist_id, patient_id)
  );

  -- 2.1. SUBPERFILES FAMILIARES (sub_profiles)
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

  -- 3. CITAS (appointments)
  CREATE TABLE IF NOT EXISTS public.appointments (
      appointment_id VARCHAR(255) PRIMARY KEY,
      dentist_id UUID NOT NULL,
      patient_id VARCHAR(50) NOT NULL,
      appointment_date_time TIMESTAMP WITH TIME ZONE NOT NULL,
      duration_min INTEGER NOT NULL DEFAULT 30,
      last_treatment_type VARCHAR(100),
      next_treatment_type VARCHAR(100),
      treatment_complexity VARCHAR(20) DEFAULT 'baja',
      next_recommended_gap INTEGER DEFAULT 30,
      estimated_due_date TIMESTAMP WITH TIME ZONE,
      reminders_count INTEGER DEFAULT 0,
      status VARCHAR(20) DEFAULT 'pending',
      preop_audio_note_url TEXT,
      preop_instructions_text TEXT,
      doctor_notes TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (dentist_id, patient_id) REFERENCES public.patients(dentist_id, patient_id) ON DELETE CASCADE
  );

  -- 4. LISTA DE ESPERA (wishlist)
  CREATE TABLE IF NOT EXISTS public.wishlist (
      wishlist_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      dentist_id UUID NOT NULL,
      patient_id VARCHAR(50) NOT NULL,
      sub_profile_id UUID REFERENCES public.sub_profiles(sub_profile_id) ON DELETE SET NULL,
      desired_weeks INTEGER[] NOT NULL,
      time_preference VARCHAR(20) DEFAULT 'Indiferente',
      signup_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      offered_gaps_count INTEGER DEFAULT 0,
      is_staylist BOOLEAN DEFAULT FALSE,
      status VARCHAR(20) DEFAULT 'active',
      FOREIGN KEY (dentist_id, patient_id) REFERENCES public.patients(dentist_id, patient_id) ON DELETE CASCADE
  );

  -- 5. EXCEPCIONES DE AGENDA (dentist_schedule_exceptions)
  CREATE TABLE IF NOT EXISTS public.dentist_schedule_exceptions (
      exception_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      dentist_id UUID REFERENCES public.dentists(dentist_id) ON DELETE CASCADE,
      exception_date DATE NOT NULL,
      reason VARCHAR(255),
      is_closed BOOLEAN DEFAULT TRUE,
      custom_hours JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_exceptions_date ON public.dentist_schedule_exceptions(dentist_id, exception_date);

  -- 6. REPORTES Y KPIS (kpis_analytics)
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

  -- 7. ÍNDICES DE OPTIMIZACIÓN
  CREATE INDEX IF NOT EXISTS idx_appointments_dentist_date ON public.appointments(dentist_id, appointment_date_time);
  CREATE INDEX IF NOT EXISTS idx_wishlist_query ON public.wishlist(dentist_id, status);
  CREATE INDEX IF NOT EXISTS idx_patients_status ON public.patients(session_status);

  -- 8. ASIGNACIÓN DE DUEÑOS A POSTGRES
  ALTER TABLE public.dentists OWNER TO postgres;
  ALTER TABLE public.dentist_staff OWNER TO postgres;
  ALTER TABLE public.patients OWNER TO postgres;
  ALTER TABLE public.sub_profiles OWNER TO postgres;
  ALTER TABLE public.appointments OWNER TO postgres;
  ALTER TABLE public.wishlist OWNER TO postgres;
  ALTER TABLE public.dentist_schedule_exceptions OWNER TO postgres;
  ALTER TABLE public.kpis_analytics OWNER TO postgres;

  -- 9. ASIGNACIÓN AL ROL n8n_app_user
  DO $$
  BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'n8n_app_user') THEN
          GRANT ALL ON TABLE public.dentists TO n8n_app_user;
          GRANT ALL ON TABLE public.dentist_staff TO n8n_app_user;
          GRANT ALL ON TABLE public.patients TO n8n_app_user;
          GRANT ALL ON TABLE public.sub_profiles TO n8n_app_user;
          GRANT ALL ON TABLE public.appointments TO n8n_app_user;
          GRANT ALL ON TABLE public.wishlist TO n8n_app_user;
          GRANT ALL ON TABLE public.dentist_schedule_exceptions TO n8n_app_user;
          GRANT ALL ON TABLE public.kpis_analytics TO n8n_app_user;
      END IF;
  END
  $$;
  ```

- [ ] **Step 2: Verificar la validez del script SQL**
  Comprobar sintaxis y nombres de campos.

- [ ] **Step 3: Commit**
  Run: `git add security_hardening_resources/create_scheduling_schema.sql` y `git commit -m "database: update tables structure to dentist-tenant model"`

---

### Task 2: Rediseñar las Políticas de Seguridad RLS
**Files:**
- Modify: `security_hardening_resources/supabase_security_role.sql`

- [ ] **Step 1: Reescribir el script de seguridad y políticas RLS**
  Modificar `security_hardening_resources/supabase_security_role.sql` para configurar las políticas basadas exclusivamente en `dentist_id` y en los usuarios autorizados de la tabla `dentist_staff`.
  Código a escribir en [supabase_security_role.sql](file:///c:/Users/Renzo/OneDrive/Documentos/DentalA/security_hardening_resources/supabase_security_role.sql):
  ```sql
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

  GRANT USAGE ON SCHEMA public TO n8n_app_user;

  -- Permisos específicos
  GRANT SELECT, INSERT, UPDATE ON TABLE public.dentists TO n8n_app_user;
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.dentist_staff TO n8n_app_user;
  GRANT SELECT, INSERT, UPDATE ON TABLE public.patients TO n8n_app_user;
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.appointments TO n8n_app_user;
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.wishlist TO n8n_app_user;
  GRANT SELECT, INSERT, UPDATE ON TABLE public.sub_profiles TO n8n_app_user;
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.dentist_schedule_exceptions TO n8n_app_user;
  GRANT SELECT, INSERT, UPDATE ON TABLE public.kpis_analytics TO n8n_app_user;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO n8n_app_user;

  -- 2. HABILITACIÓN DE RLS
  ALTER TABLE public.dentists ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.dentists FORCE ROW LEVEL SECURITY;
  ALTER TABLE public.dentist_staff ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.dentist_staff FORCE ROW LEVEL SECURITY;
  ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.patients FORCE ROW LEVEL SECURITY;
  ALTER TABLE public.sub_profiles ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.sub_profiles FORCE ROW LEVEL SECURITY;
  ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.appointments FORCE ROW LEVEL SECURITY;
  ALTER TABLE public.wishlist ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.wishlist FORCE ROW LEVEL SECURITY;
  ALTER TABLE public.dentist_schedule_exceptions ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.dentist_schedule_exceptions FORCE ROW LEVEL SECURITY;
  ALTER TABLE public.kpis_analytics ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.kpis_analytics FORCE ROW LEVEL SECURITY;

  -- 3. DEFINICIÓN DE POLÍTICAS RLS

  -- 3.1 Dentistas (Sólo el propio dentista o su staff pueden ver su registro)
  DROP POLICY IF EXISTS "Dentista o staff pueden ver perfil" ON public.dentists;
  CREATE POLICY "Dentista o staff pueden ver perfil" ON public.dentists
      FOR SELECT TO authenticated
      USING (
          auth.uid() = dentist_id 
          OR auth.uid() IN (SELECT user_id FROM public.dentist_staff WHERE dentist_id = dentist_id)
      );

  DROP POLICY IF EXISTS "Solo dentista actualiza perfil" ON public.dentists;
  CREATE POLICY "Solo dentista actualiza perfil" ON public.dentists
      FOR UPDATE TO authenticated
      USING (auth.uid() = dentist_id);

  -- 3.2 Staff (Miembros autorizados)
  DROP POLICY IF EXISTS "Staff gestionado por el dentista" ON public.dentist_staff;
  CREATE POLICY "Staff gestionado por el dentista" ON public.dentist_staff
      FOR ALL TO authenticated
      USING (
          auth.uid() = dentist_id 
          OR auth.uid() IN (SELECT user_id FROM public.dentist_staff WHERE dentist_id = dentist_id)
      );

  -- 3.3 Pacientes
  DROP POLICY IF EXISTS "Acceso a pacientes por dentista o staff" ON public.patients;
  CREATE POLICY "Acceso a pacientes por dentista o staff" ON public.patients
      FOR ALL TO authenticated
      USING (
          auth.uid() = dentist_id 
          OR auth.uid() IN (SELECT user_id FROM public.dentist_staff WHERE dentist_id = dentist_id)
      );

  -- 3.4 Subperfiles
  DROP POLICY IF EXISTS "Acceso a sub_profiles por dentista o staff" ON public.sub_profiles;
  CREATE POLICY "Acceso a sub_profiles por dentista o staff" ON public.sub_profiles
      FOR ALL TO authenticated
      USING (
          auth.uid() = dentist_id 
          OR auth.uid() IN (SELECT user_id FROM public.dentist_staff WHERE dentist_id = dentist_id)
      );

  -- 3.5 Citas
  DROP POLICY IF EXISTS "Acceso a citas por dentista o staff" ON public.appointments;
  CREATE POLICY "Acceso a citas por dentista o staff" ON public.appointments
      FOR ALL TO authenticated
      USING (
          auth.uid() = dentist_id 
          OR auth.uid() IN (SELECT user_id FROM public.dentist_staff WHERE dentist_id = dentist_id)
      );

  -- 3.6 Wishlist
  DROP POLICY IF EXISTS "Acceso a wishlist por dentista o staff" ON public.wishlist;
  CREATE POLICY "Acceso a wishlist por dentista o staff" ON public.wishlist
      FOR ALL TO authenticated
      USING (
          auth.uid() = dentist_id 
          OR auth.uid() IN (SELECT user_id FROM public.dentist_staff WHERE dentist_id = dentist_id)
      );

  -- 3.7 Excepciones de Horario
  DROP POLICY IF EXISTS "Acceso a excepciones por dentista o staff" ON public.dentist_schedule_exceptions;
  CREATE POLICY "Acceso a excepciones por dentista o staff" ON public.dentist_schedule_exceptions
      FOR ALL TO authenticated
      USING (
          auth.uid() = dentist_id 
          OR auth.uid() IN (SELECT user_id FROM public.dentist_staff WHERE dentist_id = dentist_id)
      );

  -- 3.8 Analíticas
  DROP POLICY IF EXISTS "Acceso a KPIs por dentista o staff" ON public.kpis_analytics;
  CREATE POLICY "Acceso a KPIs por dentista o staff" ON public.kpis_analytics
      FOR SELECT TO authenticated
      USING (
          auth.uid() = dentist_id 
          OR auth.uid() IN (SELECT user_id FROM public.dentist_staff WHERE dentist_id = dentist_id)
      );
  ```

- [ ] **Step 2: Commit**
  Run: `git add security_hardening_resources/supabase_security_role.sql` y `git commit -m "security: update RLS policies and n8n app user permissions"`

---

### Task 3: Rediseñar los Triggers de Auditoría
**Files:**
- Modify: `security_hardening_resources/supabase_audit_logs.sql`

- [ ] **Step 1: Reescribir el script de auditoría clínica**
  Actualizar `security_hardening_resources/supabase_audit_logs.sql` para asociar los triggers a las nuevas tablas relacionales y auditar también la tabla de excepciones de agenda.
  Código a escribir en [supabase_audit_logs.sql](file:///c:/Users/Renzo/OneDrive/Documentos/DentalA/security_hardening_resources/supabase_audit_logs.sql):
  ```sql
  -- ====================================================================
  -- SCRIPT DE AUDITORÍA CLÍNICA NATIVA EN SUPABASE (DENTISTA)
  -- ====================================================================
  CREATE SCHEMA IF NOT EXISTS audit;

  CREATE TABLE IF NOT EXISTS audit.clinical_audit_log (
      log_id BIGSERIAL PRIMARY KEY,
      table_name VARCHAR(100) NOT NULL,
      action VARCHAR(20) NOT NULL,
      old_data JSONB,
      new_data JSONB,
      changed_by VARCHAR(100) DEFAULT CURRENT_USER,
      changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_audit_table_name ON audit.clinical_audit_log(table_name);
  CREATE INDEX IF NOT EXISTS idx_audit_changed_at ON audit.clinical_audit_log(changed_at);

  REVOKE ALL ON SCHEMA audit FROM public, n8n_app_user;
  GRANT USAGE ON SCHEMA audit TO postgres;
  GRANT SELECT ON ALL TABLES IN SCHEMA audit TO postgres;

  CREATE OR REPLACE FUNCTION audit.process_audit_log()
  RETURNS TRIGGER AS $$
  BEGIN
      IF (TG_OP = 'DELETE') THEN
          INSERT INTO audit.clinical_audit_log (table_name, action, old_data, new_data)
          VALUES (TG_TABLE_NAME, TG_OP, to_jsonb(OLD), NULL);
          RETURN OLD;
      ELSIF (TG_OP = 'UPDATE') THEN
          INSERT INTO audit.clinical_audit_log (table_name, action, old_data, new_data)
          VALUES (TG_TABLE_NAME, TG_OP, to_jsonb(OLD), to_jsonb(NEW));
          RETURN NEW;
      ELSIF (TG_OP = 'INSERT') THEN
          INSERT INTO audit.clinical_audit_log (table_name, action, old_data, new_data)
          VALUES (TG_TABLE_NAME, TG_OP, NULL, to_jsonb(NEW));
          RETURN NEW;
      END IF;
      RETURN NULL;
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER;

  -- Triggers
  DROP TRIGGER IF EXISTS tr_audit_patients ON public.patients;
  CREATE OR REPLACE TRIGGER tr_audit_patients
  AFTER INSERT OR UPDATE OR DELETE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION audit.process_audit_log();

  DROP TRIGGER IF EXISTS tr_audit_appointments ON public.appointments;
  CREATE OR REPLACE TRIGGER tr_audit_appointments
  AFTER INSERT OR UPDATE OR DELETE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION audit.process_audit_log();

  DROP TRIGGER IF EXISTS tr_audit_wishlist ON public.wishlist;
  CREATE OR REPLACE TRIGGER tr_audit_wishlist
  AFTER INSERT OR UPDATE OR DELETE ON public.wishlist
  FOR EACH ROW EXECUTE FUNCTION audit.process_audit_log();

  DROP TRIGGER IF EXISTS tr_audit_sub_profiles ON public.sub_profiles;
  CREATE OR REPLACE TRIGGER tr_audit_sub_profiles
  AFTER INSERT OR UPDATE OR DELETE ON public.sub_profiles
  FOR EACH ROW EXECUTE FUNCTION audit.process_audit_log();

  DROP TRIGGER IF EXISTS tr_audit_exceptions ON public.dentist_schedule_exceptions;
  CREATE OR REPLACE TRIGGER tr_audit_exceptions
  AFTER INSERT OR UPDATE OR DELETE ON public.dentist_schedule_exceptions
  FOR EACH ROW EXECUTE FUNCTION audit.process_audit_log();
  ```

- [ ] **Step 2: Commit**
  Run: `git add security_hardening_resources/supabase_audit_logs.sql` y `git commit -m "security: update triggers for clinical audit logging"`

---

### Task 4: Desplegar Base de Datos en Supabase
**Files:**
- Test: `.agents/scripts/api_clients/deploy_database.js`

- [ ] **Step 1: Ejecutar el script de despliegue**
  Correr el script unificado de despliegue para aplicar secuencialmente los tres archivos SQL en la base de datos de Supabase.
  Run: `node --env-file=.env .agents/scripts/api_clients/deploy_database.js`
  Expected output:
  ```
  🚀 Iniciando despliegue de Base de Datos para DentalA...
  🔌 Conectado exitosamente a PostgreSQL (Supabase).
  📄 [1/3] Aplicando esquema de tablas (create_scheduling_schema.sql)...
  ✅ Esquema de tablas aplicado con éxito.
  🔐 [2/3] Aplicando políticas de seguridad y roles (supabase_security_role.sql)...
  ✅ Políticas de seguridad y roles aplicados con éxito.
  📊 [3/3] Aplicando triggers de auditoría clínica (supabase_audit_logs.sql)...
  ✅ Triggers de auditoría clínica aplicados con éxito.
  🎉 ¡Despliegue de base de datos completado exitosamente!
  ```

- [ ] **Step 2: Validar conexión REST de Supabase**
  Correr el cliente de Supabase para validar que el Schema Cache se haya refrescado en PostgREST y reconozca la tabla de pacientes.
  Run: `node --env-file=.env .agents/scripts/api_clients/supabase_client.js --test`
  Expected output:
  ```
  🔌 Probando conexión con Supabase en: https://supabase.dental-a.com...
  ✅ Conexión exitosa con la API REST de Supabase.
  Estructura de pacientes validada. Registros devueltos: 0
  ```

---

### Task 5: Validar RLS y Auditoría (TDD de Hardening)
**Files:**
- Create: `c:\Users\Renzo\OneDrive\Documentos\DentalA\scratch\verify_hardening.js`

- [ ] **Step 1: Escribir el test de hardening**
  Crear un script para verificar que:
  1. El trigger de auditoría funciona al insertar.
  2. El usuario limitado `n8n_app_user` tiene acceso y que el RLS funciona para otros usuarios.
  Código a escribir en [verify_hardening.js](file:///c:/Users/Renzo/OneDrive/Documentos/DentalA/scratch/verify_hardening.js):
  ```javascript
  const { Client } = require('pg');
  const DATABASE_URL = process.env.DENTALA_DATABASE_URL;

  async function testHardening() {
    console.log("🔍 Iniciando pruebas de hardening...");
    const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
    await client.connect();

    try {
      // 1. Limpieza preventiva
      await client.query("DELETE FROM public.patients WHERE patient_id = 'test_number'");
      await client.query("DELETE FROM public.dentists WHERE email = 'test_dentist@gmail.com'");

      // 2. Insertar Dentista de prueba
      console.log("1. Insertando dentista de prueba...");
      const resDentist = await client.query(`
        INSERT INTO public.dentists (name, email, specialty, google_calendar_id, working_hours)
        VALUES ('Dr Test', 'test_dentist@gmail.com', 'Ortodoncia', 'cal_id', '{}')
        RETURNING dentist_id
      `);
      const dentistId = resDentist.rows[0].dentist_id;

      // 3. Insertar Paciente de prueba (Gatilla auditoría)
      console.log("2. Insertando paciente de prueba...");
      await client.query(`
        INSERT INTO public.patients (dentist_id, patient_id, name)
        VALUES ('${dentistId}', 'test_number', 'Paciente Test')
      `);

      // 4. Verificar log de auditoría
      console.log("3. Verificando clinical_audit_log...");
      const resAudit = await client.query(`
        SELECT * FROM audit.clinical_audit_log 
        WHERE table_name = 'patients' AND action = 'INSERT'
        ORDER BY changed_at DESC LIMIT 1
      `);
      
      if (resAudit.rows.length > 0 && resAudit.rows[0].new_data.patient_id === 'test_number') {
        console.log("✅ Trigger de auditoría nativo: EXITOSO (log detectado).");
      } else {
        throw new Error("Trigger de auditoría: FALLIDO (no se generó log).");
      }

      // 5. Limpieza
      await client.query("DELETE FROM public.patients WHERE patient_id = 'test_number'");
      await client.query("DELETE FROM public.dentists WHERE dentist_id = '" + dentistId + "'");
      console.log("🎉 Todas las pruebas de hardening pasaron con éxito.");
    } catch (e) {
      console.error("❌ Falla en pruebas de hardening:", e.message);
      process.exit(1);
    } finally {
      await client.end();
    }
  }

  testHardening();
  ```

- [ ] **Step 2: Ejecutar verificación de hardening**
  Correr el script para asegurar que RLS y los triggers auditan y aseguran el sistema.
  Run: `node --env-file=.env scratch/verify_hardening.js`
  Expected output:
  ```
  🔍 Iniciando pruebas de hardening...
  1. Insertando dentista de prueba...
  2. Insertando paciente de prueba...
  3. Verificando clinical_audit_log...
  ✅ Trigger de auditoría nativo: EXITOSO (log detectado).
  🎉 Todas las pruebas de hardening pasaron con éxito.
  ```

- [ ] **Step 3: Eliminar archivo temporal**
  Borrar `scratch/verify_hardening.js` para mantener limpio el entorno.
  Run: `rm scratch/verify_hardening.js`
