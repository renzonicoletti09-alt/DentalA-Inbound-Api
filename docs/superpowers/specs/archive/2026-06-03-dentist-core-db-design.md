# Especificación de Diseño: Módulo 1 - Base de Datos, Hardening y Memoria (Dentista Particular)

**Fecha**: 2026-06-03  
**Estado**: En Revisión  
**Contexto**: DentalA - Sistema de Automatización y CRM para Dentistas Particulares  

---

## 1. Propósito del Diseño
Este documento define la base de datos central en Supabase (PostgreSQL), el esquema de aislamiento (Multi-tenant) a nivel de Dentista Particular, la seguridad de accesos restringidos para automatizaciones, los triggers de auditoría clínica nativos, y la arquitectura de **Doble Memoria** (corto/largo plazo) con atenuación de repetición. 

Además, define la infraestructura de base de datos y Redis necesaria para soportar las funcionalidades de **Mando de Voz y Texto del Dentista (Auto-Dictado y Gestión de Alertas)**, los **Embudos de Rescate de Agendamiento Abandonado / Chats Fríos**, las **Ráfagas Dinámicas por cercanía de cancelación**, la **Reactivación Semestral de Pacientes Dormidos** y el **Rescate de Intentos de Llamada de WhatsApp API**.

---

## 2. Cambios de Modelo: Clínica vs. Dentista Particular
En lugar de una estructura jerárquica con múltiples clínicas y odontólogos, el sistema asume que **cada Dentista es su propio tenant principal**. 
* **Dentista Propietario**: Tiene el rol principal y es dueño de los datos. Se autentica en Supabase y Chatwoot.
* **Secretaria / Asistente**: Tiene acceso autorizado bajo el identificador del Dentista, permitiendo la co-gestión de pacientes y agenda.
* **Aislamiento**: Todo registro de paciente, cita, reporte y lista de espera se asocia directamente a la columna `dentist_id`.

---

## 3. Esquema Relacional de Base de Datos

El esquema se implementará en el esquema público de **PostgreSQL (Supabase)**.

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
        VARCHAR status "Estado: active | inactive"
        JSONB notification_preferences "Preferencias de alertas del Doctor (mute, resúmenes, criticidad)"
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
        VARCHAR origin_channel "Canal de origen"
        TIMESTAMPTZ created_at "Fecha de registro"
        TIMESTAMPTZ last_active_at "Última interacción"
        VARCHAR session_status "Estado: bot_active | bot_paused | doctor_active | away_mode"
        TIMESTAMPTZ status_updated_at "Última actualización de estado"
        BOOLEAN send_care_documents "Permiso enviar PDFs"
        BOOLEAN allow_outbound_campaigns "Permiso campañas salientes"
        INTEGER daily_token_usage "Consumo de tokens"
        TIMESTAMPTZ blocked_until "Bloqueo anti-spam"
        JSONB psychological_profile "Datos personales de cercanía"
        JSONB profile_references_log "Historial de datos personales mencionados"
        JSONB clinical_notes "Indicaciones médicas y medicamentos del Doctor"
        VARCHAR[] tags "Etiquetas del paciente (ej. high_value, conflictivo, no_show_historico)"
    }
    SUB_PROFILES {
        UUID sub_profile_id PK "ID de subperfil familiar"
        UUID dentist_id FK "Parte de Clave Foránea hacia PATIENTS"
        VARCHAR patient_id FK "Parte de Clave Foránea hacia PATIENTS"
        VARCHAR name "Nombre del familiar"
        TIMESTAMPTZ created_at "Fecha de registro"
        TIMESTAMPTZ last_active_at "Última interacción"
    }
    APPOINTMENTS {
        VARCHAR appointment_id PK "ID de Google Calendar"
        UUID dentist_id FK "Parte de Clave Foránea hacia PATIENTS"
        VARCHAR patient_id FK "Parte de Clave Foránea hacia PATIENTS"
        TIMESTAMPTZ appointment_date_time "Fecha y hora"
        INTEGER duration_min "Múltiplos de 15 minutos"
        VARCHAR last_treatment_type "Tratamiento realizado hoy"
        VARCHAR next_treatment_type "Tratamiento planeado para la siguiente cita"
        VARCHAR treatment_complexity "baja | media | alta"
        INTEGER next_recommended_gap "Días sugeridos para control"
        TIMESTAMPTZ estimated_due_date "Fecha estimada de próximo control"
        INTEGER reminders_count "Contador de recordatorios"
        VARCHAR status "pending | confirmed | cancelled | completed"
        VARCHAR preop_audio_note_url "Enlace audio instrucciones"
        TEXT preop_instructions_text "Transcripción de audio"
        TEXT doctor_notes "Notas clínicas/observaciones del Doctor para esta cita"
        TIMESTAMPTZ created_at "Fecha de creación"
    }
    WISHLIST {
        UUID wishlist_id PK "ID de registro de lista de espera"
        UUID dentist_id FK "Parte de Clave Foránea hacia PATIENTS"
        VARCHAR patient_id FK "Parte de Clave Foránea hacia PATIENTS"
        UUID sub_profile_id FK "Relación con SUB_PROFILES"
        INTEGER[] desired_weeks "Semanas deseadas"
        VARCHAR time_preference "Mañana | Tarde | Indiferente"
        TIMESTAMPTZ signup_timestamp "Fecha de ingreso"
        INTEGER offered_gaps_count "Ofertas enviadas"
        BOOLEAN is_staylist "Staylist prioridad"
        VARCHAR status "active | exited_success | expired | cancelled"
    }
    DENTIST_SCHEDULE_EXCEPTIONS {
        UUID exception_id PK "ID único de excepción"
        UUID dentist_id FK "Relación con DENTISTS"
        DATE exception_date "Fecha de la excepción (ej. feriado o vacaciones)"
        VARCHAR reason "Razón del cierre o cambio de horario"
        BOOLEAN is_closed "Indica si el consultorio estará cerrado todo el día"
        JSONB custom_hours "Horarios alternativos si no está cerrado (ej. solo mañana)"
        TIMESTAMPTZ created_at "Fecha"
    }
    KPIS_ANALYTICS {
        UUID kpi_id PK "ID de KPI"
        UUID dentist_id FK "Relación con DENTISTS"
        DATE date "Fecha"
        VARCHAR kpi_name "Nombre del KPI"
        NUMERIC kpi_value "Valor del KPI"
        JSONB metadata "Metadata de KPI"
        TIMESTAMPTZ created_at "Fecha de registro"
    }
```

---

## 4. Hardening y Seguridad Estructural de Datos

### 4.1. Conexión de Automatizaciones (`n8n_app_user`)
N8n se conectará a PostgreSQL utilizando un usuario restringido creado a nivel de motor. Este usuario no cuenta con privilegios administrativos:
* Se le retiran los permisos sobre el esquema `audit`.
* Se le otorgan permisos exclusivamente para realizar operaciones transaccionales de datos (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) en las tablas de negocio de `public`.

### 4.2. Políticas de Row Level Security (RLS)
El aislamiento de datos se garantiza mediante políticas de RLS asociadas al `dentist_id`:
* **Dentista**: Puede leer, insertar, actualizar y borrar registros donde su `auth.uid() = dentist_id`.
* **Asistente (Staff)**: Puede leer e interactuar con los datos si su `auth.uid()` se encuentra registrado en la tabla `dentist_staff` vinculado al `dentist_id` del registro consultado.
* **Políticas Habilitadas**: Habilitadas y forzadas (`FORCE ROW LEVEL SECURITY`) en todas las tablas del esquema público.

---

## 5. Diseño del Sistema de Doble Memoria

Para garantizar una UX premium que recuerde detalles pero atenué la repetición artificial de datos, implementamos el flujo de memoria en n8n:

### 5.1. Memoria de Corto Plazo (Contexto Inmediato)
* **Almacenamiento**: Redis (TTL de 24 horas).
* **Contenido**: El historial de chats de las últimas 10-15 interacciones. Permite que la IA mantenga el hilo conductor de la conversación activa.

### 5.2. Memoria de Largo Plazo (Ficha Psicológica y Clínica)
* **Almacenamiento**: Columnas `psychological_profile` y `clinical_notes` de la tabla `patients`.
* **Contenido**: 
  * `psychological_profile` (Datos informales): `{"phobias": "miedo al torno", "personal_interests": "viajó a España en mayo 2026"}`.
  * `clinical_notes` (Datos formales dictados): `{"medication": "Amoxicilina 500mg cada 8 horas", "recommendations": "Evitar comer alimentos sólidos del lado derecho por 24 horas"}`.
* **Acceso Conversacional**: Si el paciente pregunta por WhatsApp *"¿Cómo me dijo el doctor que tomara el medicamento?"*, la IA (Claude 4.6 Sonnet) recupera el campo `clinical_notes` y responde con precisión clínica y tono empático.

### 5.3. Atenuación de Repetición (profile_references_log)
* **Almacenamiento**: Columna `profile_references_log` de la tabla `patients`.
* **Regla de Inyección**: 
  Cuando n8n lee la ficha de cercanía del paciente para inyectarla en el prompt del LLM, evalúa el historial. Si un detalle personal fue mencionado en los últimos 30 días, n8n **lo omite** en los datos contextuales enviados al LLM de FAQ o agendamiento.
* **Directiva de Prompt**:
  Se añade la regla del sistema:
  > *"Utiliza los detalles de la memoria de largo plazo únicamente si el paciente los saca a colación o si se prestan de manera 100% natural en el hilo de la conversación. No fuerces temas y nunca repitas un detalle personal si ya se ha hablado de él recientemente."*

---

## 6. Arquitectura de Soporte para Automatizaciones Futuras

El esquema relacional diseñado anteriormente cuenta con la flexibilidad necesaria para soportar los flujos operacionales que se implementarán en los módulos posteriores:

### 6.1. Mando de Voz y Texto del Dentista (Auto-Dictado y Gestión de Alertas)
* **Ubicación de Lógica**: Módulo 3 (Procesamiento Inbound) y Módulo 4 (Agendamiento).
* **Bypass de Identificación**: n8n verifica si el remitente del WhatsApp es el celular del doctor. Si es así, salta el triaje del paciente y entra al flujo de dictado.
* **Desambiguación de Nombres**: Si el doctor dice "Juan" y hay múltiples "Juan" en Supabase, n8n responde al celular del doctor con botones interactivos: *"¿Te refieres a Juan Pérez o Juan Gómez?"*. Tras confirmarse la identidad y parámetros, crea la cita en Easy!Appointments e inyecta las notas en `clinical_notes` y `appointments`.
* **Gestión de Notificaciones (Mute)**:
  * El doctor puede enviar comandos de texto como `/silencio` o `/mute` en su chat de WhatsApp para cambiar `"is_muted": true` en la tabla `dentists`.
  * n8n encolará alertas menores (citas agendadas, CSAT disconforme, cancelaciones habituales) en Redis para enviarle un resumen consolidated al final de la jornada.
  * Alertas críticas de salud de pacientes o urgencias médicas reales **bypassean el silencio** y se notifican en tiempo real para seguridad del paciente.
  * El comando `/resumen` gatilla el envío del digest de Redis de forma instantánea. `/alertas` reactiva las notificaciones en tiempo real.

### 6.2. Embudos de Rescate de Conversaciones y Agendamientos Abandonados
* **Rescate de Agendamiento Abandonado (4 Horas)**: Si un paciente inicia la selección de turnos en el chat y no concreta la reserva en 4 horas, Redis expira la sesión y n8n le envía un recordatorio amable por si quiere completarlo.
* **Seguimiento de Chats Fríos (2 Horas)**: Si un paciente consulta precios o FAQs y deja de responder durante 2 horas, n8n despierta la interacción ofreciéndole agendar un turno de evaluación diagnóstica.

### 6.3. Ráfagas Dinámicas por cercanía de cancelación (Lista de Espera)
* **Ubicación de Lógica**: Módulo 5 (Wishlist).
* **Lógica**: Si la cita cancelada es para dentro de menos de 24 horas, la expiración de la ráfaga de 3 pacientes se reduce de 90 a **15 minutos**. Si es menor a 4 horas, se envía un **Broadcast FCFS** (el primero que responda gana el turno) a los 5 mejores candidatos para evitar perder facturación clínica.

### 6.4. Reactivación Semestral de Pacientes en Estado "Dormido Crítico"
* **Ubicación de Lógica**: Módulo 6 (Automatizaciones Outbound).
* **Lógica**: Para no perder el contacto comercial de por vida con pacientes inactivos, el sistema les envía un saludo automatizado de cumpleaños y un toque informativo clínico de valor una vez cada 6 meses (180 días), evitando saturarlos.

### 6.5. Rescate de Intentos de Llamada de WhatsApp API
* **Ubicación de Lógica**: Módulo 3 (Inbound).
* **Lógica**: Como la API no recibe llamadas de voz, n8n intercepta los webhooks de intento de llamada fallido del paciente y le envía de inmediato un WhatsApp aclaratorio: *"Esta línea no recibe llamadas de voz tradicionales por políticas de WhatsApp API, pero estamos totalmente activos para chatear. Si es una urgencia responde con 'URGENCIA'. Si deseas agendar responde 'AGENDAR' o haz click en [Link]"*.

---

## 7. Auditoría Clínica
Toda alteración de los registros de pacientes y citas dispara un trigger nativo de base de datos que escribe en la tabla `audit.clinical_audit_log`. 

---

## 8. Plan de Verificación Técnica

### Pruebas Automatizadas
1. **Verificación de tablas**: Ejecutar el script `supabase_client.js` para asegurar que el caché del esquema REST reconozca las tablas bajo el nuevo enfoque.
2. **Pruebas de RLS**: Intentar realizar consultas a registros de otro `dentist_id` utilizando tokens limitados de autenticación para comprobar que PostgreSQL bloquea la lectura.
3. **Prueba de trigger**: Realizar una inserción en `patients` y validar que se genere de inmediato una fila en `audit.clinical_audit_log`.
4. **Verificación de logs en n8n**: Testear el script de conexión anti-spam y los locks de Redis.
