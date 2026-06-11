# Original User Request

## Initial Request — 2026-06-04T14:14:17Z

Build Módulo 3 (Motor Inbound - Triaje, Multimedia y Comandos) for the DentalA SaaS platform. The module must be implemented incrementally: coding a part, testing it against Módulo 1 and Módulo 2 components, combining it with previous parts, and validating before proceeding to the next part.

Working directory: c:/Users/Renzo/OneDrive/Documentos/DentalA
Integrity mode: development

## Requirements

### R1. Webhook Ingestion & Onboarding (Part 1)
Implement a robust webhook receiver that:
- Maps `inbox_id` to `dentist_id`.
- Identifies if the patient exists in Supabase; if not, performs onboarding (creates patient in `patients` with `session_status = 'bot_active'`).
- Detects unsupported WhatsApp calls (`messages[0].type = 'unsupported'` and error code `131050`) and fires a Call Rescue template response.

### R2. Redis Debouncing & Anti-Spam (Part 2)
Implement:
- Webhook debounce using Redis: accumulate ráfaga messages in a queue (`triage:queue:{dentist_id}:{patient_id}`) and block execution using a 3-second TTL lock.
- Rate limiting: block patients who send > 10 messages/minute for 2 hours (sets `blocked_until` in `patients`), with bypass for emergency keywords.

### R3. Voice Transcription & Visual Description Ingestion (Part 3)
Implement:
- Ogg/m4a audio ingestion: download Meta media files and transcribe them using Whisper via LiteLLM client.
- Dental photos ingestion: download Meta media files, generate clinical description using multimodal vision model, cache it, and inject description text into the triage classifier.
- Ignore or gently redirect stickers/GIFs depending on conversation state.

### R4. Doctor Voice Dictation Workflow (Part 4)
Implement:
- Clinical voice note dictation: transcribe doctor notes, extract clinical parameters (diagnoses, care, next appointment details) using LLM.
- Interactive WhatsApp confirmation cards (Aprobar/Modificar) sent to the doctor.
- Store pending state in Redis with 4-hour TTL, saving as drafts in Chatwoot notes if timeout expires.

### R5. Doctor Text Commands (Part 5)
Implement parsing for doctor commands: `/silencio`, `/alertas`, `/resumen`, `/estado`, `/bloquear`, `/cancelar`, `/buscar`, `/wishlist priorizar`, `/wishlist asignar`, `/activar`, `/desactivar`.
- Validate sender phone (must match doctor/admin staff). Validate PIN hash for critical operations.

### R6. Triage Routing, Sentiment Analysis & Locale Onboarding (Part 6)
Implement:
- Sentiment analysis: pause bot and alert doctor in Chatwoot if patient shows high frustration.
- Triage intentions classification (`BOOKING`, `FAQ`, `URGENCY`, `OTHER`) using LiteLLM client.
- Locale detection: run ONLY on first message, persist in `patients.locale`, and serve strings from local i18n file thereafter.

## Acceptance Criteria

### Verification & Performance
- [ ] Each part (1 to 6) must have a dedicated test script in `scratch/` (e.g., `test_m3_part1.js`, `test_m3_part2.js`, etc.) validating its logic and mock inputs.
- [ ] Test suites must combine and verify compatibility with Módulo 1 (database tables, audit logs, RLS) and Módulo 2 clients.
- [ ] A final E2E test script `scratch/test_m3_full.js` must verify the complete integrated Inbound engine under concurrent traffic, audio inputs, visual descriptions, and doctor commands.
- [ ] No API keys, passwords, or upstream keys should be hardcoded (all must read from `.env`).

## Follow-up — 2026-06-04T17:13:18-03:00

Auditar el estado del servidor de producción (Coolify, Cloudflare, Hetzner) y el código de los Módulos 1, 2 y 3, eliminando y limpiando por completo la infraestructura obsoleta de Easy!Appointments, refactorizando el código de producción para usar el programador nativo de Supabase, y validando la seguridad RLS multi-tenant.

Working directory: c:\Users\Renzo\OneDrive\Documentos\DentalA
Integrity mode: development

## Requirements

### R1. Remoción de Easy!Appointments en Coolify y Cloudflare
El equipo debe:
1. Conectarse a la API de Coolify (usando `coolify_client.js`) para detener y eliminar por completo el contenedor de Easy!Appointments (`easyappointments_uuid_coolify`).
2. Conectarse a la API de Cloudflare (usando las credenciales en `.env` y el token de Cloudflare) para eliminar el registro DNS CNAME/A asociado a `agenda.dental-a.com`.
3. Reportar el estado de salud final del servidor (uso de RAM y CPU).

### R2. Refactorización y Limpieza de Código (Módulos 2 y 3)
El equipo debe:
1. Buscar en el código activo (`services/` y `.agents/scripts/api_clients/`) cualquier referencia a `easyappointments_client.js` e importaciones relacionadas, eliminándolas de los flujos de ejecución.
2. Garantizar que la lógica de reservas y consultas de disponibilidad consuma única y exclusivamente a `supabase_scheduler_client.js`.
3. Ejecutar la suite de pruebas unitarias (`test_debounce_normalization.js`, `test_m3_part1.js`, y `test_m3_part2.js`) con las variables del entorno cargadas para verificar el correcto funcionamiento sin regresiones.

### R3. Hardening de Base de Datos y RLS (Módulo 1)
El equipo debe:
1. Validar que el rol de base de datos `n8n_app_user` en Supabase tenga deshabilitado el bypass de RLS (`rolbypassrls = false`).
2. Comprobar que las tablas críticas (`patients`, `appointments`, `wishlist`) tengan habilitado y activo el Row Level Security (RLS).

## Acceptance Criteria

### Limpieza de Servidor e Infraestructura
- [ ] El contenedor `easyappointments_uuid_coolify` ha sido removido exitosamente en Coolify.
- [ ] El subdominio `agenda.dental-a.com` ha sido eliminado de los registros DNS en Cloudflare.
- [ ] Se presenta el reporte final de consumo de memoria RAM y CPU del VPS Hetzner.

### Integridad del Código y Tests
- [ ] No existen referencias de importación a `easyappointments_client.js` en archivos `.js` activos dentro de la carpeta `services/`.
- [ ] La suite de pruebas de ingesta de mensajes y anti-spam (`test_debounce_normalization.js`, `test_m3_part1.js` y `test_m3_part2.js`) se ejecuta y completa al 100% de manera exitosa.

### Seguridad de Base de Datos
- [ ] El RLS de las tablas de negocio está activado y el rol `n8n_app_user` tiene la bandera `rolbypassrls` en false.
- [ ] Las consultas de prueba RLS demuestran aislamiento multi-tenant efectivo.
