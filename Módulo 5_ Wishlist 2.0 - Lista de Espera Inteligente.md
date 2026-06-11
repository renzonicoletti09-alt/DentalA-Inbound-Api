# Documento de Lista de Espera Inteligente

## Módulo 5: Wishlist 2.0 - Lista de Espera Inteligente (Smart Waitlist Queue)

**Propósito del Módulo**: Definir la lógica operativa de la Wishlist 2.0 para la asignación y remiendo de baches en la agenda. Utiliza un algoritmo de coincidencias en dos pasos (semana + turno), ráfagas asincrónicas orquestadas por cronjobs, y bloqueos simples en Redis (micro-locks).

---

## 1. Funcionamiento y Reglas de la Wishlist (Algoritmo LIFO Puro)

La wishlist gestiona a aquellos pacientes que desean adelantar su atención si se libera un espacio antes de su cita programada, ignorando el `session_status` del paciente (a menos que tenga `allow_outbound_campaigns = false`).

- **Trigger Único de Activación**: La wishlist se despierta exclusivamente mediante el webhook `appointment_cancelled` (o `slot_freed`) enviado por Easy!Appointments. n8n escucha este webhook, extrae el `dentist_id` del payload, y ejecuta el algoritmo.
- **Invitación al Opt-In**: El paciente recibe una invitación. Si acepta, se registran sus preferencias mediante un interrogatorio sencillo de solo 2 pasos: semana deseada (`desired_weeks`, ej: `'2026-W51'`) y turno (`time_preference`: Mañana/Tarde/Indiferente).
- **Algoritmo de Coincidencia Estricto (LIFO Puro)**: Al liberarse un bache, n8n filtra candidatos compatibles (hora compatible y semana contenida en `desired_weeks`). Los candidatos resultantes se ordenan de forma estricta por recencia de registro (`signup_timestamp DESC`, LIFO puro).

---

## 2. Protocolo de Ráfagas Asincrónicas con Cronjobs (Remiendo de Agenda)

Para evitar el uso ineficiente de nodos "Wait" en n8n, el proceso de remiendo de agenda opera con cronjobs asincrónicos, registrando el estado en la tabla `wishlist_batch_tracking`.

### 2.1. Lógica Temporal de Tiempos de Expiración
* **Baches con >4 horas de anticipación (Ráfagas Cron)**: 
  - Turno liberado -> n8n toma los 3 mejores candidatos LIFO, envía la oferta por WhatsApp, y el flujo se cierra. 
  - A los 60 minutos, un cronjob verifica en Easy!Appointments si el turno sigue libre. Si es así, envía ofertas a los siguientes 3 candidatos.
  - Esto se repite hasta un **máximo de 5 ráfagas**, o un timeout absoluto de 24 horas.
* **Broadcast (Entre 3 y 4 horas de anticipación)**: 
  - Se envía la oferta a los **15 candidatos LIFO más recientes** simultáneamente.
  - **Resolución de Colisiones (MVP)**: Si dos pacientes presionan aceptar a la vez, n8n llama a la API de Easy!Appointments secuencialmente. Easy!Appointments actúa como única fuente de verdad y rechazará el segundo agendamiento por solapamiento. Si EA rechaza, el bot notifica al perdedor que el turno ya fue tomado.
* **Baches críticos (≤3 horas de anticipación)**: 
  - No hay broadcast. 
  - Si **no hay secretaria** (fuera de `working_hours`): Se asigna el turno automáticamente al último candidato LIFO.
  - **Lógica de Salto**: Si ese último candidato ya fue notificado en las últimas 2 horas (revisando `last_offered_at`), el algoritmo salta al siguiente (máximo 3 saltos). Si no hay candidato fresco, no se asigna.

### 2.2. Penalización, Expulsión y Registro
- **Incremento de Ofertas**: Cada vez que se incluye a un paciente en una ráfaga, n8n actualiza `UPDATE wishlist SET offered_gaps_count = offered_gaps_count + 1`. 
- **Expulsión Automática**: Si `offered_gaps_count >= 3` y el paciente nunca aceptó, su estado cambia a `status = 'expired'`.
- **Notificación de Salida/Expulsión**: Cuando un paciente es expulsado (3 fallos) o pulsa el botón [Salir de la wishlist], n8n le envía este mensaje final:
  > *"Hola [nombre], has sido eliminado de la lista de espera. Si deseas volver a anotarte, escribe ‘ME INTERESA UNA LISTA DE ESPERA’."*
- **Registro en el Log de Mensajes**: Cada oferta enviada se guarda en la tabla `whatsapp_message_log` con `direction = 'outbound'` y `template_name = 'wishlist_offer'`.

### 2.3. Notificación de Ocupación Inmediata
Al reservar exitosamente un turno por wishlist, n8n marca en Redis: `SET wishlist:slot:occupied:{slot_id} "wishlist" EX 3600`. 
Si más tarde llega un webhook de Easy!Appointments avisando que ese mismo slot se ocupó (por otra vía), y esta clave no existe en Redis, n8n asume que lo tomó alguien más e informa a todos los candidatos que estaban pendientes de que el turno ya no está disponible.

---

## 3. Concurrencia (Resolución Nativa) y Sincronización

### 3.1. Delegación FCFS a Easy!Appointments
- Para simplificar la arquitectura del MVP, se elimina el uso de Redis para micro-locks (SETNX).
- Cuando varios pacientes responden "Aceptar Turno" en un escenario Broadcast (3-4 horas), n8n intenta agendarlos directamente vía la API de Easy!Appointments.
- **Ganador**: La primera petición exitosa en la API de EA bloquea el slot. El paciente recibe la confirmación.
- **Perdedor**: Las peticiones posteriores recibirán un error de solapamiento (409/400) desde EA. n8n captura el error y responde al paciente:
  > *"¡Hola [Nombre]! Lamentablemente, otro paciente acaba de confirmar la reserva de ese horario hace unos instantes. Si deseas buscar otros espacios disponibles, contacta por favor con la clínica."*

---

## 4. Mapa de Interacciones de este Módulo

### 4.1. Con Módulo 1 (Base de Datos)
- **Extracción de Candidatos**: Consulta `wishlist` filtrando por turno y semana, ordenando estrictamente de forma LIFO (`signup_timestamp DESC`).
- **Rastreo de Estado**: Persiste las ráfagas en la tabla `wishlist_batch_tracking` y actualiza `last_offered_at` en `wishlist`.
- **Auditoría**: Registra las plantillas enviadas en `whatsapp_message_log`.

### 4.2. Con Módulo 2 (Conectividad)
- **Locking Simple**: Usa el comando `SETNX` nativo de Redis para prevenir colisiones en los Broadcast.

### 4.3. Con Módulo 3 (Gateway Inbound)
- **Comandos**: El comando `/wishlist priorizar` se procesa en el Módulo 3.

### 4.4. Con Módulo 4 (FAQs y Agendamiento)
- **Webhook de Gatillo**: La wishlist se activa únicamente escuchando el webhook de turnos cancelados o liberados emitido por la API de Easy!Appointments gestionada en el Módulo 4.
- **Verificación Final**: Antes de asentar cualquier turno ganado en wishlist, se llama al endpoint de Easy!Appointments para re-validar que sigue libre.
