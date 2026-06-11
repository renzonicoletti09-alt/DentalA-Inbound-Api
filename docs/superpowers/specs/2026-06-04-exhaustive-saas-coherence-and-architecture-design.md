# Documento de Diseño Arquitectónico y Auditoría de Coherencia Global (SaaS Audit Report 3.0)

Este documento detalla el análisis de coherencia de negocio, viabilidad técnica de escala, y optimizaciones de los 8 módulos del ecosistema **DentalA** (analizados de forma estrictamente regresiva desde el Módulo 8 hasta el Módulo 1). Establece los gaps detectados y las mejoras transversales para la **Experiencia del Paciente (PX)**, **Experiencia del Doctor (DX)**, **Seguridad (SEC)** y **Onboarding/Despliegue (OB)**.

---

## 📈 Módulo 8: Ejecución Práctica, Herramientas y Optimización

### 1. Coherencia Técnica y de Negocio
*   **Análisis**: Este módulo centraliza los mecanismos de Double Memory (Redis -> Supabase) y Ruteo en LiteLLM. Es el motor operativo que sustenta la rapidez y economía del bot.
*   **Coherencia**: Es altamente coherente con la base de datos (Módulo 1) y los fallbacks de infraestructura (Módulo 7). Sin embargo, el "Deferred Sync" de 15 minutos en inactividad puede generar un *race condition* si el paciente interactúa durante la ventana de inactividad, forzando un cache miss o lectura de datos desactualizados en Supabase si se salta el TTL de Redis.

### 2. Viabilidad y Escala SaaS
*   **Escalabilidad**: Redis como caché y LiteLLM como gateway de balanceo y prompt caching son completamente viables. El Prompt Caching en Claude 4.6 Sonnet ahorra hasta un 90% en tokens de entrada.

### 3. Propuestas de Mejora
*   **PX (Experiencia del Paciente)**:
    *   *Continuidadconversacional*: En caso de cache miss tras el vencimiento del TTL de 24 horas en Redis, n8n debe realizar una consulta SELECT en Chatwoot/Supabase e inyectar de forma fluida el contexto resumido del paciente, evitando iniciar la charla con saludos impersonales.
*   **DX (Experiencia del Doctor)**:
    *   *Comando de ROI Rápido*: Implementar el comando `/roi` por WhatsApp para que el doctor consulte en cualquier momento el estado de horas de secretaría ahorradas y turnos recuperados sin esperar la compilación nocturna de las 20:00 h.
*   **SEC (Seguridad)**:
    *   *Hardening del Pooler de Conexiones*: Habilitar conexiones SSL/TLS forzadas para el rol limitado `n8n_app_user` en Supabase y limitar las conexiones simultáneas máximas en el pooler (Supavisor) para prevenir agotamiento de recursos del VPS.
*   **OB (Onboarding)**:
    *   *Bootstrap de Onboarding*: Unificar las variables de configuración en un archivo `.env.example` robusto y proveer un manual detallado de aprovisionamiento de Redis e instancias Docker.

---

## 📊 Módulo 7: Monitoreo, ROI y Fail-Safes de Infraestructura

### 1. Coherencia Técnica y de Negocio
*   **Análisis**: Define el monitoreo sintético (`test_synthetic_dentist`) y los protocolos de contingencia.
*   **Coherencia**: Es coherente con la priorización del goteo outbound (Módulo 6) y el override clínico (Módulo 3).

### 2. Viabilidad y Escala SaaS
*   **Escalabilidad**: Muy viable. El paciente sintético debe correr de forma aislada para evitar contaminación en el panel analítico. El fallback a Telegram es robusto y previene interrupciones si WhatsApp Cloud API experimenta caídas.

### 3. Propuestas de Mejora
*   **PX**:
    *   *Aislamiento Sintético*: Asegurar que el webhook de n8n no despache notificaciones humanas en Chatwoot ante las conversaciones creadas por el flujo de monitoreo cada 30 minutos, archivando el chat automáticamente.
*   **DX**:
    *   *Telegram Fallback Gate*: Validar que el bot de Telegram del dentista esté configurado con el Chat ID de origen estricto para evitar que un tercero inyecte comandos o lea alertas clínicas de forma cruzada.
*   **SEC**:
    *   *Asegurar pg_cron*: Bloquear el acceso a la extensión `pg_cron` en Supabase para que solo el superusuario ejecute las limpiezas de la wishlist y logs, y nunca el rol limitado de la aplicación.
*   **OB**:
    *   *Auto-monitoreo*: Aprovisionar de forma automatizada las credenciales del bot de Telegram en el registro de un nuevo dentista.

---

## ⚙️ Módulo 6: Automatizaciones Outbound y Ciclo de Vida del Paciente

### 1. Coherencia Técnica y de Negocio
*   **Análisis**: Regula la confirmación pre-cita "3-3-4", recuperación de inasistencias y el seguimiento postoperatorio.
*   **Coherencia**: Altamente coherente. Utiliza el campo `treatment_complexity` para adecuar los tiempos.

### 2. Viabilidad y Escala SaaS
*   **Escalabilidad**: Alta viabilidad comercial. Reducir la inasistencia mediante confirmación 3-3-4 incrementa la rentabilidad del SaaS directamente. Requiere un estricto control de aprobación de plantillas interactivas en la consola de Meta para evitar bloqueos por SPAM.

### 3. Propuestas de Mejora
*   **PX**:
    *   *Primeros Auxilios Postoperatorios*: Si el paciente reporta dolor o sangrado moderado a través del mensaje de seguimiento a las 24 horas, el bot debe emitir instantáneamente pautas de contención (ej. no escupir, aplicar frío local, reposo) en lo que el doctor es notificado.
*   **DX**:
    *   *Acción Rápida en Alertas*: Añadir botones interactivos de WhatsApp en la notificación de alerta enviada al celular del doctor para permitirle "Pausar bot" o "Marcar Urgencia Resuelta" en un clic.
*   **SEC**:
    *   *Storage RLS Privado*: Almacenar los archivos multimedia y fotos de diagnóstico enviados por pacientes en un bucket privado de Supabase Storage. Configurar políticas RLS basadas en `dentist_id` para evitar que URLs directas expongan fotos clínicas públicamente.
*   **OB**:
    *   *Consola Meta Pre-Aprobada*: Proveer plantillas de WhatsApp pre-aprobadas en la suite SaaS para acelerar la verificación comercial.

---

## 📅 Módulo 5: Wishlist 2.0 - Lista de Espera Inteligente

### 1. Coherencia Técnica y de Negocio
*   **Análisis**: Cubre baches concurrentes de agenda con lógica LIFO e FCFS.
*   **Coherencia**: Conecta directamente las cancelaciones con las ráfagas dinámicas.

### 2. Viabilidad y Escala SaaS
*   **Escalabilidad**: **Inviabilidad de RPA (Playwright) para Dentalink a escala**. Los clics simulados son frágiles ante cambios CSS de Dentalink, provocando desincronización constante y alertas de soporte diario. 
*   *Recomendación*: Proponer API oficial de Dentalink o la centralización de la agenda en DentalA para escala comercial.

### 3. Propuestas de Mejora
*   **PX**:
    *   *Penalización de Wishlist*: Si a un paciente se le ofrecen 3 baches consecutivos y los ignora o rechaza, cambiar su estado en la wishlist a `exited_inactive` para evitar saturarlo y no obstaculizar slots para otros.
    *   *Mensaje de Rechazo Empático*: Si el paciente pierde el turno en un broadcast FCFS, enviar un mensaje con botones directos para ingresar a su autogestión de turnos alternativos.
*   **DX**:
    *   *Google Calendar Conflict Resolution*: Si el dentista introduce un bloqueo manual en Google Calendar que colisiona con un paciente ya confirmado, n8n debe enviarle una alerta interactiva con opciones para reprogramar al paciente automáticamente.
*   **SEC**:
    *   *Locks Atómicos en Redis*: Usar scripts de transacciones atómicas (Lua) en Redis para asegurar la adquisición y liberación del lock de slots de agenda de forma inmutable.
*   **OB**:
    *   *Watch Google Calendar Auto-provisioning*: Automatizar el registro del push webhook de Google Calendar al configurar el perfil del dentista.

---

## 💬 Módulo 4: Motor Inbound - FAQs y Agendamiento Cuatrimodal

### 1. Coherencia Técnica y de Negocio
*   **Análisis**: RAG con Claude Sonnet, agenda dual, Luxon timezone conversion, y auto-pausa del bot.
*   **Coherencia**: Coherente con el RLS (Módulo 1) y los canales de Chatwoot (Módulo 2).

### 2. Viabilidad y Escala SaaS
*   **Escalabilidad**: El motor dual es sumamente robusto. Permite el despliegue inicial en Easy!Appointments y una migración progresiva a Supabase Native Scheduler sin afectar las integraciones ni los prompts de los LLMs.

### 3. Propuestas de Mejora
*   **PX**:
    *   *Refinamiento conversacional*: Si el paciente rechaza las 3 alternativas propuestas en el agendamiento por WhatsApp, habilitar un flujo de refinamiento conversacional en lugar de repetir la misma consulta genérica de disponibilidad.
    *   *Mensaje de Transferencia Humana*: Si el bot se pausa por desconocimiento de FAQ o precios, notificar de inmediato al paciente: *"Le he pasado tu consulta al Dr. Pérez/Asistente. Te responderemos por aquí a la brevedad."*
*   **DX**:
    *   *Validación en Override Clínico*: Si el doctor propone un turno manual en Chatwoot pero el horario ya está ocupado en la agenda, advertirle antes de enviar la oferta al paciente para sugerirle forzar un sobreturno o reprogramar al paciente actual.
*   **OB**:
    *   *Vectorización Inicial de FAQs*: Crear un script automatizado (`vectorize_faqs.js`) que tome un JSON de preguntas frecuentes de la clínica y cargue sus embeddings en Supabase de forma autónoma.

---

## 📞 Módulo 3: Motor Inbound - Triaje, Multimedia y Comandos

### 1. Coherencia Técnica y de Negocio
*   **Análisis**: Triaje, Call Rescue, Debounce de 3s en Redis, visión en multimedia, comandos de voz.
*   **Coherencia**: Conecta Whisper y Gemini Vision para hidratar la respuesta de la IA.

### 2. Viabilidad y Escala SaaS
*   **Escalabilidad**: **Bucle de Webhooks de Meta**. Ingestar webhooks directamente en n8n sin un proxy intermedio satura el servidor ante ráfagas. Se requiere una Ingestion Gateway ligera (Edge Functions o microservicio Fastify).

### 3. Propuestas de Mejora
*   **PX**:
    *   *Robustez en Call Rescue*: Ampliar la captura para llamadas de video e interceptar envíos de contactos o archivos no soportados, respondiendo de manera amigable por WhatsApp con instrucciones de uso.
*   **DX**:
    *   *Parseador de Dictados Clínicos*: Entrenar el prompt del parser para diferenciar de manera unívoca si el doctor desea agregar datos al historial existente del paciente o sobrescribirlo por completo al enviar su dictado de voz.
*   **SEC**:
    *   *Verificación de Firmas Webhook*: Validar obligatoriamente la firma digital de los webhooks de Meta (SHA-256) en la Edge Function de entrada para mitigar ataques de denegación de servicio (DoS) o suplantación de mensajes.
*   **OB**:
    *   *Petición Automatizada de BYON*: Script Node.js que conecte la bandeja Chatwoot y configure automáticamente los tokens de Meta mediante APIs directas.

---

## 🌐 Módulo 2: Conectividad, Gateway de IA y Relacionamiento

### 1. Coherencia Técnica y de Negocio
*   **Análisis**: VPS Hetzner, Coolify, Zero Trust, AES-256-GCM, psicología y directiva de audio (Whisper de entrada / Prohibición de TTS de salida).
*   **Coherencia**: Excelente fundamentación. La directiva anti-TTS protege la latencia (1.5-3s menos) y los márgenes de negocio.

### 2. Viabilidad y Escala SaaS
*   **Escalabilidad**: El ruteo dinámico con LiteLLM y SSL Full Strict son viables y seguros.

### 3. Propuestas de Mejora
*   **PX**:
    *   *Tono conversacional personalizado*: Habilitar una variable `personality_tone` en la base de datos por consultorio para modular el tono conversacional del bot de acuerdo a la estética de la clínica (ej. "infantil" para odontopediatras, "estético" para carillas).
*   **SEC**:
    *   *Derivación de Clave Simétrica AES*: Derivar la clave criptográfica de encriptación de datos de salud usando el `dentist_id` como sal y una clave maestra compartida en el `.env`, logrando un aislamiento criptográfico absoluto de la historia clínica.
*   **OB**:
    *   *Onboarding de Canales*: Proveer guías y scripts automatizados para el aprovisionamiento de túneles Cloudflare y perfiles DNS de dominio del consultorio.

---

## 🗄️ Módulo 1: Base de Datos y Hardening Estructural

### 1. Coherencia Técnica y de Negocio
*   **Análisis**: Esquema relacional, políticas RLS no-correlacionadas, privilegios del operador `n8n_app_user` (BYPASSRLS) y triggers de auditoría.
*   **Coherencia**: Hermético tras la Suite de Hardening 3.0.

### 2. Viabilidad y Escala SaaS
*   **Escalabilidad**: PostgreSQL RLS no-correlacionado garantiza evaluaciones $O(1)$ muy eficientes.

### 3. Propuestas de Mejora
*   **PX/DX**:
    *   *Historial Médico*: Integración de la tabla `patient_clinical_history` (completado y verificado en la Suite 3.0) para registrar el histórico de notas por cita y no sobrescribir la columna global.
*   **SEC**:
    *   *Optimización de Triggers*: Modificar el trigger de auditoría para que ignore los incrementos de la columna técnica `daily_token_usage` y evitar llenar el log de auditoría con logs innecesarios.
*   **OB**:
    *   *Control de Versiones de Esquemas*: Definir una carpeta estructurada de migraciones numeradas en el repositorio para el control de versiones de DDL en Supabase.
