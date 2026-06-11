# Documento de Arquitectura de Base de Datos y Seguridad

## Módulo 1: Base de Datos y Hardening Estructural (Core DB & Security)

**Propósito del Módulo**: Definir la estructura relacional de los datos, las políticas de Row Level Security (RLS) para el aislamiento de datos por Dentista Particular, y los mecanismos de blindaje de acceso (roles limitados, prevención de inyección SQL y auditoría clínica) en Supabase (PostgreSQL).

---

## 1. Esquema Relacional de Base de Datos

El motor relacional central reside en **Supabase** y utiliza **PostgreSQL**. La base de datos garantiza la integridad de datos para múltiples odontólogos independientes utilizando el identificador único del dentista (`dentist_id`) como clave de tenant.

### Diagrama Entidad-Relación (ERD)

```mermaid
erDiagram
    DENTISTS {
        UUID dentist_id PK "ID del Dentista (User ID de Supabase Auth)"
        VARCHAR name "Nombre completo del Dentista"
        VARCHAR email "Email de contacto"
        VARCHAR specialty "Especialidad principal"
        VARCHAR address "Dirección física del consultorio"
        VARCHAR google_maps_url "Enlace de ubicación"
        VARCHAR google_calendar_id "ID de su Google Calendar"
        JSONB working_hours "Horarios de atención"
        VARCHAR timezone "Zona Horaria"
        VARCHAR language "Idioma por defecto del consultorio (I18n)"
        VARCHAR status "Estado: active | inactive"
        JSONB notification_preferences "Preferencias de alertas del Doctor (mute, resúmenes, criticidad)"
        JSONB campaign_preferences "Preferencias de campañas y promociones del SaaS"
        VARCHAR active_scheduling_engine "easyappointments"
        NUMERIC avg_consult_price "Promedio citas facturadas últimos 6 meses"
        VARCHAR whatsapp_number_1 "Número principal, obligatorio"
        VARCHAR whatsapp_number_2 "Número secundario, failover"
        TIMESTAMPTZ last_active_at "Última interacción inbound"
        TIMESTAMPTZ created_at "Fecha de registro"
    }
    DENTIST_STAFF {
        UUID user_id PK "ID de Auth de la Secretaria / Asistente"
        UUID dentist_id FK "Relación con DENTISTS"
        VARCHAR role "Rol: assistant | admin"
        TIMESTAMPTZ created_at "Fecha de registro"
    }
    PATIENTS {
        UUID dentist_id PK_FK "ID del Dentista - Parte de Clave Compuesta"
        VARCHAR patient_id PK "WhatsApp o ID de Voz - Parte de Clave Compuesta"
        VARCHAR name "Nombre completo"
        DATE date_of_birth "Fecha de nacimiento (para campañas automáticas)"
        VARCHAR origin_channel "Instagram, Facebook, WhatsApp, Referral"
        VARCHAR locale "Preferencia de idioma del paciente (I18n)"
        TIMESTAMPTZ created_at "Fecha de registro"
        TIMESTAMPTZ last_active_at "Última interacción"
        VARCHAR session_status "bot_active | bot_paused | doctor_active | away_mode | blocked_manual_review"
        TIMESTAMPTZ status_updated_at "Última actualización de estado"
        BOOLEAN send_care_documents "Permiso para enviar PDF de cuidados"
        BOOLEAN allow_outbound_campaigns "Permiso global para campañas Outbound"
        TEXT psychological_profile "phobias, family_notes, personal_interests (Cifrado AES, String Base64)"
        JSONB profile_references_log "Registro de datos de cercanía ya mencionados"
        TEXT clinical_notes "Indicaciones clínicas, cuidados (Cifrado estático AES-256-GCM, String Base64)"
        VARCHAR[] tags "Etiquetas: high_value, conflictivo, no_show_historico"
    }
    APPOINTMENTS {
        VARCHAR appointment_id PK "ID del turno (ID de Easy!Appointments en modo integrado, o UUID en modo nativo Supabase)"
        UUID dentist_id FK "Parte de Clave Foránea hacia PATIENTS"
        VARCHAR patient_id FK "Parte de Clave Foránea hacia PATIENTS"
        VARCHAR google_event_id "ID del evento en Google Calendar (ignorado en MVP)"
        TIMESTAMPTZ appointment_date_time "Fecha y hora programada"
        INTEGER duration_min "Múltiplos de 15 minutos"
        VARCHAR last_treatment_type "Tratamiento realizado hoy"
        VARCHAR next_treatment_type "Tratamiento planeado para la siguiente cita"
        VARCHAR treatment_complexity "baja | media | alta"
        INTEGER next_recommended_gap "Días sugeridos para retornar"
        TIMESTAMPTZ estimated_due_date "Fecha de próximo control sugerido"
        INTEGER reminders_count "Contador de recordatorios"
        VARCHAR status "pending | confirmed | cancelled | completed | no_show | pending_offline"
        VARCHAR preop_audio_note_url "Enlace a nota de voz preop"
        TEXT preop_instructions_text "Transcripción de IA de nota preop"
        TEXT doctor_notes "Anotaciones de la cita del día"
        TIMESTAMPTZ created_at "Fecha de creación"
    }
    WISHLIST {
        UUID wishlist_id PK "ID único de registro"
        UUID dentist_id FK "Parte de Clave Foránea hacia PATIENTS"
        VARCHAR patient_id FK "Parte de Clave Foránea hacia PATIENTS"
        VARCHAR[] desired_weeks "Array de semanas deseadas en formato YYYY-Www"
        VARCHAR time_preference "Mañana | Tarde | Indiferente"
        TIMESTAMPTZ signup_timestamp "Fecha de ingreso a la lista"
        INTEGER offered_gaps_count "Ofertas de bache enviadas"
        BOOLEAN is_staylist "Es Staylist de alta prioridad (Reservado para fase 2)"
        TIMESTAMPTZ last_offered_at "Última vez notificado de un bache"
        VARCHAR status "active | exited_success | expired | cancelled"
    }
    WISHLIST_BATCH_TRACKING {
        UUID id PK "ID único"
        UUID dentist_id FK "ID del dentista"
        VARCHAR slot_id "ID del slot de turno"
        JSONB candidates_notified "Array de patient_id"
        INTEGER batch_number "Número de ráfaga"
        VARCHAR status "pending | completed | cancelled | expired | failed"
        INTEGER notified_count "Cantidad notificados"
        TIMESTAMPTZ created_at "Fecha de creación"
    }
    WHATSAPP_MESSAGE_LOG {
        UUID id PK "ID único"
        UUID dentist_id FK "ID del dentista"
        VARCHAR patient_id FK "ID del paciente"
        VARCHAR direction "inbound | outbound"
        VARCHAR message_type "text | template | image | audio"
        VARCHAR template_name "Nombre de la plantilla"
        VARCHAR status "sent | delivered | read | failed"
        TEXT message_body "Cuerpo del mensaje"
        TIMESTAMPTZ created_at "Fecha de registro"
    }
    FAQ_TEXTUAL {
        UUID id PK "ID único"
        UUID dentist_id FK "ID del dentista"
        VARCHAR category "general | postop" "Categorización para el RAG"
        TEXT pregunta "Pregunta de la base de conocimientos"
        TEXT respuesta "Respuesta de la base de conocimientos"
        TEXT[] sinonimos_opcionales "Array de sinónimos"
        INTEGER sheet_row_id "Número de fila en Google Sheets"
        TIMESTAMPTZ created_at "Fecha de creación"
    }
    DENTIST_SCHEDULE_EXCEPTIONS {
        UUID exception_id PK "ID único de excepción"
        UUID dentist_id FK "Relación con DENTISTS"
        DATE exception_date "Fecha de la excepción (ej. feriado o vacaciones)"
        VARCHAR reason "Razón del cierre o cambio de horario"
        BOOLEAN is_closed "Indica si el consultorio estará totalmente cerrado"
        JSONB custom_hours "Horarios especiales alternativos si no está cerrado"
        TIMESTAMPTZ created_at "Fecha de registro"
    }
    TREATMENT_DOCUMENTS {
        UUID document_id PK "ID único del documento"
        UUID dentist_id FK "Relación con DENTISTS"
        VARCHAR treatment_type "Tratamiento: implante | ortodoncia | limpieza | etc"
        VARCHAR document_type "Tipo de PDF: pre_op | post_op"
        VARCHAR file_name "Nombre comercial/amigable del archivo"
        VARCHAR storage_path "Ruta del archivo en el bucket privado de Supabase Storage"
        TIMESTAMPTZ created_at "Fecha de subida"
    }
    KPIS_ANALYTICS {
        UUID kpi_id PK "ID único de KPI"
        UUID dentist_id FK "Relación con DENTISTS"
        DATE date "Fecha del KPI"
        VARCHAR kpi_name "Nombre de la métrica"
        NUMERIC kpi_value "Valor del KPI"
        JSONB metadata "Metadata adicional"
        TIMESTAMPTZ created_at "Fecha de creación"
    }
    ACCESS_LOGS_CLINICAL {
        UUID id PK "ID único"
        UUID user_id "ID de quien accede"
        VARCHAR patient_id "ID del paciente"
        VARCHAR ip_address "IP de origen"
        TIMESTAMPTZ accessed_at "Fecha del evento"
    }
    ACCESS_LOGS {
        UUID access_log_id PK "ID único"
        UUID user_id "ID de quien accede"
        UUID dentist_id "ID del consultorio consultado"
        VARCHAR patient_id "ID del paciente si aplica"
        VARCHAR action_type "READ_PATIENT | READ_CLINICAL | EXPORT_DATA | AUTH_LOGIN"
        VARCHAR resource_type "patients | clinical_notes | wishlist"
        VARCHAR ip_address "IP de origen"
        TIMESTAMPTZ created_at "Fecha del evento"
    }

    DENTISTS ||--o{ DENTIST_STAFF : "tiene"
    DENTISTS ||--o{ PATIENTS : "atiende"
    DENTISTS ||--o{ KPIS_ANALYTICS : "monitorea"
    DENTISTS ||--o{ TREATMENT_DOCUMENTS : "asocia"
    PATIENTS ||--o{ APPOINTMENTS : "reserva"
    PATIENTS ||--o{ WISHLIST : "se anota"
    PATIENTS ||--o{ WHATSAPP_MESSAGE_LOG : "interactua"
    DENTISTS ||--o{ FAQ_TEXTUAL : "posee"
    DENTISTS ||--o{ WISHLIST_BATCH_TRACKING : "rastrea"
    DENTISTS ||--o{ DENTIST_SCHEDULE_EXCEPTIONS : "registra"
```

El script SQL completo y oficial para la creación de estas tablas en producción se encuentra almacenado localmente en `create_scheduling_schema.sql`.

---

## 2. Hardening y Seguridad Estructural de Base de Datos

Para proteger la integridad de los datos de salud frente a accesos malintencionados y evitar fugas de información entre diferentes profesionales independientes:

### 2.1. Row Level Security (RLS) por Dentista y Supabase Storage Privado
- **Regla de Aislamiento Estricta**: Todas las tablas de negocio (`patients`, `appointments`, `wishlist`, `whatsapp_message_log`, `faq_textual`, `kpis_analytics`, `dentist_schedule_exceptions`, `treatment_documents`, `wishlist_batch_tracking`) tienen habilitadas políticas de RLS estructuradas en torno a la columna `dentist_id`.
- **Acceso Autorizado**: Un dentista puede leer/escribir solo sus propios registros (`auth.uid() = dentist_id`). Una secretaria/asistente puede leer/escribir registros asociados si su identificador de usuario de Supabase Auth está registrado en `dentist_staff`. La política RLS se evalúa mediante subconsultas no-correlacionadas para mantener el rendimiento.
- **Seguridad en Supabase Storage (Hardening de PDFs)**:
  * El bucket `treatment-documents` se configura como **Privado (No Público)**.
  * **Políticas RLS en Storage**: Las operaciones están restringidas al personal de la clínica.
  * **URL Firmada**: Para que el paciente vea el PDF, el backend llama a la API de Supabase Storage para generar una URL temporal con validez corta.

### 2.2. Creación y Restricción del Rol del Operador (`n8n_app_user`)
- **Implementación y Bypass RLS Justificado**: Se crea el rol de aplicación `n8n_app_user` con permisos acotados solo sobre las tablas necesarias (`patients`, `appointments`, `wishlist`, `faq_textual`, `whatsapp_message_log`, etc.).
  * *Bypass RLS*: Al rol `n8n_app_user` se le concede la bandera `BYPASSRLS`. Esto se justifica por agilidad en el MVP. **Regla de Oro (Seguridad):** Como n8n bypassea el RLS, TODO nodo de PostgreSQL en n8n debe incluir estrictamente la cláusula `WHERE dentist_id = $json.dentist_id` para garantizar el aislamiento multi-tenant a nivel de código.
  * *Mecanismo de Conexión*: n8n se conecta a Supabase mediante conexión PostgreSQL directa a través del puerto 5432 o 6543.

### 2.3. Cifrado Estático de Notas Clínicas
- **Cifrado AES-256-GCM Estático**: Las columnas `clinical_notes` y `psychological_profile` utilizan el tipo de dato `TEXT` para almacenar directamente el string en Base64/Hex resultante del cifrado.
- **Ejecución Nativa en n8n**: En lugar de depender de microservicios externos, el cifrado y descifrado AES-256-GCM se ejecuta nativamente dentro de n8n mediante Nodos de Código (Node.js `crypto` library), utilizando la clave estática inyectada como variable de entorno en n8n.
- **Consultas Parametrizadas**: Obligatorias en n8n para prevención de SQL Injection. Las columnas cifradas no pueden ser indexadas ni buscadas vía `LIKE` o `WHERE`.

### 2.4. Auditoría Clínica (HIPAA y GDPR)
- **Logs de Lecturas Sensibles (`access_logs_clinical`)**: Solo se registran lecturas explícitas de columnas como `clinical_notes` y `psychological_profile`.
- **Logs de Escritura/Acceso General (`access_logs`)**: Retenido para operaciones de auditoría y escritura.
- **Retención y Purga**: La tabla `access_logs_clinical` tiene retención de 90 días, y `access_logs` de 180 días. La purga se hace vía cron mensual a nivel de host (primer domingo).

### 2.5. Optimización de Búsqueda Textual (FAQ)
- **Búsqueda Textual**: Se utiliza la tabla `faq_textual` equipada con un índice GIN (`pg_trgm`) sobre `pregunta` y `sinonimos_opcionales`. Las búsquedas se realizan vía `ILIKE` o `tsvector`.

---

## 3. Guía de Modificaciones de Esquema en Producción (SaaS Live Customization)

### 3.1. Reglas de Modificación Segura de Tablas (DDL en Producción)
1. **Valores por Defecto Seguros (Safe Defaults)**: Columnas nuevas deben permitir `NULL` o tener valores por defecto.
2. **Preservación de RLS**: Las nuevas columnas heredan el RLS existente.
3. **Bypass de Caché PostgREST**: Recargar caché de la API tras usar `ALTER TABLE` vía `NOTIFY pgrst, 'reload schema';`.

### 3.2. Procedimiento de Migración sin Caídas en n8n
1. **Compatibilidad Hacia Atrás**: Añadir columna en Supabase y recargar esquema.
2. **Actualización de Nodes en n8n**: Refresh Fields.
3. **Manejo de Variables Robustas**: Validar propiedades en JS para prevenir `undefined`.

---

## 4. Mapa de Interacciones de este Módulo

### 4.1. Con Módulo 2 (Gateway de IA)
El backend procesa datos a través de los endpoints `/crypto` para descifrar `clinical_notes` y `psychological_profile` antes de ser consumidos por n8n e inyectados al contexto de Claude/ChatGPT (a través de LiteLLM).

### 4.2. Con Módulo 3 (Triaje y Comandos)
La inserción de datos de `whatsapp_message_log` rige las interacciones, controlando fallbacks tras errores de IA y actuando como la fuente central para medir mensajes y detener abusos de tokens.

### 4.3. Con Módulo 4 (Agendamiento y FAQs)
Las FAQs se resuelven utilizando índices GIN de `faq_textual`, importados desde Google Sheets. La disponibilidad y el motor central recaen ahora en **Easy!Appointments**; la BD transaccional almacena referencias del turno.

### 4.4. Con Módulo 5 (Wishlist 2.0)
El estado de las ráfagas y baches ofrecidos reside en `wishlist_batch_tracking`. La tabla `wishlist` aplica una lógica LIFO estricta, rastreando interacciones con `last_offered_at`.

### 4.5. Con Módulo 6 (Automatizaciones Outbound)
El embudo anti-dormidos utiliza `whatsapp_message_log` para calcular las interacciones recientes, sin depender de columnas estáticas complejas en `patients`, manteniendo la integridad basada en eventos.

### 4.6. Con Módulo 7 (Monitoreo)
El cálculo del ROI extrae los promedios desde `avg_consult_price` y consolida datos en `kpis_analytics`. El monitoreo sintético se hace solo con Mocks en n8n.

### 4.7. Con Módulo 8 (Ejecución Práctica)
Depuraciones de `access_logs` y `wishlist_batch_tracking` se gestionan mediante crons de sistema (host) en lugar del descartado `pg_cron`.
