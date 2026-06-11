# Documento de Operación Inbound - FAQs y Agenda

## Módulo 4: Motor Inbound - FAQs y Agendamiento Cuatrimodal (FAQs & Scheduling)

**Propósito del Módulo**: Definir la lógica de consultas de información clínica mediante búsqueda textual simple integrada con las indicaciones médicas del doctor, los protocolos conversacionales para la resolución de objeciones y cierres activos, y la implementación del motor de agendamiento cuatrimodal integrado con **Easy!Appointments** como motor de agenda transaccional del MVP.

---

## 1. Motor de FAQ Textual y Sincronización (Identidad de Marta)

Toda consulta del paciente sobre tratamientos, profesionales, precios o indicaciones post-consulta del doctor se procesa utilizando un sistema estricto y aséptico para evitar la improvisación conversacional y la complejidad de los vectores:

- **Búsqueda Textual desde Google Sheets**: 
  * El dentista comparte un Google Sheets con las columnas `pregunta`, `respuesta`, `sinónimos_opcionales`.
  * n8n realiza polling cada hora (OAuth) o utiliza un webhook para sincronizar la hoja con la tabla `faq_textual` mediante upsert por `(dentist_id, sheet_row_id)`.
  * La búsqueda se realiza en PostgreSQL mediante `ILIKE` o `tsvector` (`pg_trgm`).
  * Si el dentista rompe el formato de la hoja de cálculo, n8n envía una notificación de alerta al WhatsApp del doctor.
- **Indicaciones Médicas Personalizadas**: Si el paciente pregunta por su cuidado posquirúrgico (ej. *“¿Cómo tengo que tomar la pastilla?”*), n8n extrae y descifra el campo `patients.clinical_notes` de Supabase para responder.
- **Claude Sonnet 4.6 (FAQ - Tono Asistente Marta)**: Recibe el contexto textual recuperado y asume el rol de **Marta, la asistente de ~50 años**. Responde con respeto, calidez, y cierra de forma activa guiando al paciente.
- **Derivación Elegante por Desconocimiento**: Si Claude no encuentra la información en las FAQ textuales o notas, tiene prohibido alucinar. Deriva el chat a la secretaria y n8n pausa el bot (`session_status = 'bot_paused'`).

---

## 2. Motor de Agendamiento Cuatrimodal en Easy!Appointments

El sistema opera utilizando la API de **Easy!Appointments (EA)** como el motor de agenda central para el MVP.

### 2.1. Caídas de Easy!Appointments (Sin Modo Offline)
No existe modo offline en el MVP. Si la instancia de Easy!Appointments del dentista no responde o se cae, las operaciones de agendamiento y wishlist se pausan inmediatamente. n8n envía una alerta al administrador del SaaS y el paciente recibe el mensaje:
> *"Estamos con dificultades técnicas, por favor contacta directamente por teléfono."*

### 2.2. Las 4 Vías Sagradas de Agendamiento

**Vía 1: Autogestión por UI Nativa de Easy!Appointments**
- El bot envía el enlace de reserva nativo de la instancia de Easy!Appointments del dentista. El paciente reserva utilizando el front-end que ya provee EA.

**Vía 2: Agendamiento Conversacional Asistido por la IA**
- **ChatGPT 5.4 mini** interactúa estructuradamente:
  1. Identifica el tratamiento.
  2. Llama a la API de EA (`easyappointments_client.js: getFreeSlots`).
  3. Propone **los 3 horarios libres más convenientes**.
  4. Si el paciente confirma, se usa la API para asentar la cita.
  * **Nota de Ruteo (RAG Clínico):** Si durante la reserva el paciente realiza una consulta clínica post-operatoria o de dudas generales, n8n evalúa la intención y cambia dinámicamente el `task_type` a `faq`, haciendo que LiteLLM derive la siguiente respuesta a Claude Sonnet 4.6 (para acceder a `faq_textual`) antes de continuar con la reserva.
- **Control de Abuso**: Se limita dinámicamente mediante los prompts de abuso en el LLM y el historial general en `whatsapp_message_log` (máximo 20 mensajes por 24h).

**Vía 3: Dictado Clínico por Audio (Aprobación Interactiva)**
- El médico envía una nota de voz relatando la consulta.
- Whisper transcribe y estructura. Se envía un mensaje interactivo al doctor con:
  * **[Aprobar y Guardar]**: Escribe en `clinical_notes` y agenda vía API en EA.
  * **[Modificar]**: Correcciones manuales.

**Vía 4: Inserción Manual en la UI de Easy!Appointments**
- La secretaria registra citas manualmente en el panel de administración web de EA.
- El webhook de EA notifica a n8n para gatillar confirmaciones.



### 2.3. Alta Fricción de Cancelación
No existe un botón fácil o comando simple para que el paciente cancele. Toda cancelación debe pasar por el razonamiento del bot, que intentará disuadir o forzar la reprogramación inmediata.

### 2.4. Sniper de Baches
Si una cita se cancela, se notifica inmediatamente a la Wishlist 2.0 (Módulo 5) aprovechando el webhook de Easy!Appointments, buscando remendar el slot libre.

### 2.5. Failover de Números VIP por Clínica
Para alta disponibilidad del canal saliente (WhatsApp):
- Cada dentista puede tener hasta 2 números configurados (`whatsapp_number_1` y `whatsapp_number_2`).
- **Lógica de Failover**: Si el envío por `_1` falla por 2 intentos consecutivos, n8n cambia automáticamente al número `_2`. Tras 1 hora, vuelve a intentar con el `_1`.
- Si **ambos** fallan: se pausa todo el outbound (excepto el recordatorio 3-3-4 si es vital) y se alerta urgentemente al administrador del SaaS.

---

## 3. Jerarquía Estricta de Sincronización (Easy!Appointments Activo)

Para evitar bucles infinitos de actualizaciones:
1. **Easy!Appointments es la única fuente transaccional de verdad** para los turnos.
2. **Google Calendar actúa como reflejo pasivo**. Manejado nativamente por Easy!Appointments.

---

## 4. Estados de la Conversación, Activación y Desactivación Automática (Auto-Pause & Play)

### 4.1. Lógica de Desactivación Automática (Pausa del Bot)
El bot se apaga (`session_status = 'bot_paused'`) en Supabase en las siguientes circunstancias:
1. **Detección de Urgencia Clínica**: Si se detecta dolor severo, sangrado profuso o fiebre.
2. **Abuso o Enojo**: Si el LLM levanta el `abuse_flag` o detecta alta tensión en el paciente.
3. **Desconocimiento en FAQ**: Si Claude no tiene respuestas en `faq_textual`.
4. **Intervención Humana Manual**: En cuanto la secretaria envía un mensaje por Chatwoot.
5. **Límite de Mensajes Diarios**: Si el paciente supera los 20 mensajes en 24h, se bloquea la IA temporalmente para proteger costos.

### 4.2. Lógica de Reactivación Automática
El bot vuelve al estado de escucha activa (`session_status = 'bot_active'`) si:
1. Se resuelve la conversación en Chatwoot.
2. Expira la pausa tras 24 horas (excluyendo el bloqueo por límite de mensajes que es de 2 horas).
3. Comando manual `/activar`.

### 4.3. Enrutamiento de Alertas Críticas al Dentista
Cada vez que ocurre una **Desactivación Automática por Urgencia**, n8n envía un WhatsApp urgente (bypasseando silenciador) al celular del doctor o a su Telegram como fallback.

---

## 5. Mapa de Interacciones de este Módulo

### 5.1. Con Módulo 1 (Base de Datos)
- **Consultas RAG Textual**: Cruza el ID del consultorio con `faq_textual` usando búsquedas ILIKE / pg_trgm.
- **Estado Clínico**: Recupera las `clinical_notes` decriptadas desde el endpoint del backend.

### 5.2. Con Módulo 2 (Conectividad)
- **Motor de Agenda**: Interactúa estrictamente con `easyappointments_client.js` para los 4 modos de agendamiento. No se usa base de datos Supabase nativa para los slots.

### 5.3. Con Módulo 3 (Gateway Inbound)
- **Recepción**: Utiliza las validaciones de límite de mensajes de `whatsapp_message_log` para autorizar si se debe iniciar el RAG conversacional.

### 5.4. Con Módulo 5 (Wishlist 2.0)
- **Baches**: Al cancelar un turno vía API de EA, el webhook de EA dispara directamente el algoritmo LIFO de la Wishlist 2.0.

### 5.5. Con Módulo 6 (Campañas Outbound)
- **Failover VIP**: Módulo 4 aplica la lógica de switch entre `whatsapp_number_1` y `_2` para asegurar que las campañas outbound críticas y recordatorios lleguen al destino.
