# Documento de Automatización Outbound y Ciclo de Vida

## Módulo 6: Automatizaciones Outbound y Ciclo de Vida del Paciente (Outbound Funnels)

**Propósito del Módulo**: Definir la lógica temporal, secuencias cronológicas y contenidos de las comunicaciones proactivas salientes (Outbound) con los pacientes en los ciclos previos, durante y posteriores a su consulta odontológica, además de los embudos de rescate de leads, el embudo anti-dormidos y las reglas de enrutamiento de notificaciones al profesional.

---

## 1. Estructura de Datos para Control Clínico

Para el seguimiento de campañas Outbound, n8n opera de forma aislada por dentista iterando sobre las filas activas en Supabase para obtener:
- `treatment_complexity`: Clasificación de la invasividad del tratamiento (`baja | media | alta`).
- `next_recommended_gap`: Días sugeridos por el dentista para el próximo control.
- `estimated_due_date`: Fecha estimada del próximo control.
- `send_care_documents`: Bandera que controla si el paciente desea recibir PDFs con indicaciones.

---

## 2. El Sistema "3-3-4" de Asistencia con Doble Confirmación de Marta (Pre-Cita)

Diseñado para reducir el ausentismo a niveles mínimos mediante una secuencia de contactos de WhatsApp:
- **Aviso de Organización (3 Semanas Antes)**: Recordatorio preventivo de fecha y hora.
- **Confirmación Estricta (3 Días Antes - 72h)**: Mensaje interactivo con botones **[Confirmar Asistencia]** y **[Necesito Reprogramar]**. 
- **Confirmación Estricta (3 Días Antes - 72h)**: Mensaje interactivo con botones **[Confirmar Asistencia]** y **[Necesito Reprogramar]**.
  - *Inyección de Nota Preoperatoria*: Si el odontólogo grabó un audio con instrucciones, n8n lo adjunta.
- **Doble Confirmación Inteligente (2 Días Antes - 48h)**: Si el paciente no ha respondido, el sistema dispara un segundo contacto firmado por Marta apelando a la preparación del material de forma cálida.
- **Logística y Fricción Cero (4 Horas Antes)**: Envío automático de mapa de ubicación de Google Maps del consultorio. No se solicita confirmación.

### 2.1. Copilot Conversacional del Doctor (Briefing de Empatía Pre-Cita)
Para elevar la experiencia clínica, n8n ejecuta un cron cada 10 minutos que identifica citas próximas en exactamente 10 minutos:
1. El wrapper descifra en memoria los campos `psychological_profile` y `clinical_notes`.
2. ChatGPT 5.4 mini genera un micro-briefing ejecutivo de 3 viñetas.
3. n8n inserta una nota interna en Chatwoot (disparando notificación al doctor).

---

## 3. Recuperación de Inasistencias (No-Show Recovery)

Si el paciente no se presenta a su cita (marcado como `no_show` o cancelado en Supabase/Easy!Appointments):
1. A las 2 horas de gracia, n8n verifica que `allow_outbound_campaigns = true`.
2. Dispara un mensaje automático por WhatsApp con tono cálido, comprensivo y de contención invitándolo a reprogramar, derivándolo al bot conversacional.

---

## 4. Embudos de Rescate de Conversaciones Inconclusas

### 4.1. Rescate de Agendamiento Abandonado (4 Horas)
Si un paciente inicia la selección de turnos en el chat y no concreta en **4 horas**, n8n envía un recordatorio amable por WhatsApp preguntando si necesita ayuda para completar la reserva.

### 4.2. Seguimiento de Dudas sin concretar (2 Horas)
Si un paciente consulta precios o FAQs y el chat queda en silencio durante **2 horas**, n8n despierta la interacción proactivamente ofreciendo un turno de evaluación diagnóstica.

---

## 5. Embudo Anti-Dormidos (Prevención de Pérdida de Leads)

## 5. Embudo Anti-Dormidos (Prevención de Pérdida de Leads)

Se aplica un embudo anti-dormidos de 3 toques altamente focalizado. La etapa se calcula en tiempo real contando las interacciones en la tabla `whatsapp_message_log` (sin usar variables estáticas en la tabla pacientes). Se excluyen pacientes que estén actualmente en la Wishlist.

**Entrada al Embudo**: Pacientes sin registros inbound o reconversiones outbound en la tabla `whatsapp_message_log` durante las últimas 4 semanas.
**Ciclos (basados en `estimated_due_date` o fecha de última cita)**:
- **Ciclo 1**: Inicia a las 4 semanas. Son 3 mensajes con un intervalo fijo de 7 días entre sí (uno por semana).
- **Ciclo 2**: Inicia a los 3 meses de la última interacción. 3 mensajes (uno por semana).
- **Ciclo 3**: Último mensaje de contacto, a los 6 meses.
**Estructura de los Mensajes**:
Todos los mensajes proactivos utilizan plantillas de Meta homologadas, ofreciendo 3 botones:
1. **[Agendar]**
2. **[No avisar más]** (Aplica opt-out de marketing).
3. **[Paso por hoy]**. Si en el Ciclo 3 el paciente presiona "Paso por hoy", se lo etiqueta como `dormido_critico` y cesa la comunicación proactiva.

---

## 6. Cuidados Post-Consulta y Material Dual (Imagen + PDF Indexado)

## 6. Cuidados Post-Consulta y Material Dual (Imagen + PDF Indexado)

Los archivos se entregan mediante una URL directa en el Storage utilizando un nombre ofuscado con un UUID.

**Material Post-Cita Dual**:
Para los cuidados postoperatorios, el sistema entrega contenido en formato dual:
1. **Infografía (Imagen)**: Se envía directamente por WhatsApp sin procesamiento para una lectura visual rápida.
2. **PDF Extenso**: Debe contener texto seleccionable. Al subirse, n8n verifica con `pdf-parse`; si no tiene texto seleccionable, se rechaza. El texto extraído se guarda automáticamente en la tabla `faq_textual` bajo el tipo `'postop'`, permitiendo al LLM responder dudas futuras sobre esos cuidados.

### 6.1. Secuencias de Seguimiento Clínico y Tiempos por Complejidad
* **Alta Complejidad (Cirugías, Implantes)**:
  * **Post-Cita (2 Horas)**: Envío automático del material dual (Infografía + PDF).
  * **Seguimiento Clínico 24 Horas**: Contacto hiper-personalizado inyectando las notas dictadas por el doctor (`preop_instructions_text`) para verificar inflamación o síntomas.
  * **Seguimiento Clínico 48 Horas**: Segundo contacto enfocado en avance postoperatorio.
* **Media Complejidad (Endodoncias, Coronas)**:
  * **Post-Cita (2 Horas)**: Envío del material dual.
  * **Seguimiento Clínico 24 Horas**: Un único contacto proactivo de Marta enfocado en verificar la oclusión (mordida). Si está bien, finaliza.
* **Baja Complejidad (Limpiezas, Blanqueamientos)**:
  * **Post-Cita (2 Horas)**: Envío del material dual.
  * **Seguimiento Clínico**: Se programan cero (0) mensajes de control clínico conversacionales para no fatigar al paciente.

---

## 7. Encuesta de Satisfacción (CSAT)

A las **48 horas** de una consulta (y al finalizar los seguimientos clínicos si los hubiera), n8n envía una encuesta privada del 1 al 5:
- **4 o 5**: El bot agradece e invita a dejar reseña en Google Maps (sin ofrecer regalos).
- **1 a 3**: El bot solicita detalles con empatía y abre un ticket prioritario en Chatwoot para intervención del dentista.

---

## 8. Gestión de Contingencia

Si el motor de agenda central (Easy!Appointments) experimenta caídas, n8n pausa temporalmente los outbound promocionales para evitar generar intención de reserva hacia un motor inoperativo, manteniendo activos solo los seguimientos post-operatorios críticos (3-3-4 y clínicas de alta complejidad).

---

## 9. SaaS Gating y Prevención de Spam en WhatsApp

- **Aislamiento de Canales (BYON)**: Cada inquilino conecta su propio número de WhatsApp Business API a Chatwoot.
- **Plantillas Homologadas (Sub-workflow Central)**: Toda comunicación fuera de 24h debe usar Plantillas de Meta. Para evitar hardcodear variables y nombres de plantillas en decenas de nodos, se utiliza un único **Sub-workflow de n8n ("Despachador de Plantillas")**. Los flujos principales llaman a este sub-workflow pasando variables abstractas, centralizando el mantenimiento de plantillas en un solo lugar.
- **Quality Gating**: Si la calificación de Meta de un consultorio baja a "Amarillo" o "Rojo", n8n suspende las campañas outbound del embudo anti-dormidos y CSAT, priorizando estrictamente las confirmaciones 3-3-4 logísticas y seguimientos clínicos.

### 9.1. Automatización de Onboarding (SaaS Provisioning)
El onboarding de nuevos odontólogos incluye el provisionamiento automatizado vía Coolify API para levantar su contenedor de Easy!Appointments, generar la base de datos, horarios base (en <15 min) e inyectar el webhook maestro de EA apuntando al entorno de n8n, dejando el SaaS listo para operar de forma inmediata.

### 9.2. Importación y Migración
n8n provee un flujo para parsear archivos CSV, normalizar los pacientes e insertarlos en Supabase, emitiendo luego un mensaje de bienvenida a la plataforma mediante plantilla interactiva.

---

## 10. Mapa de Interacciones de este Módulo

### 10.1. Con Módulo 1 (Base de Datos)
- Consulta `patients.allow_outbound_campaigns`. 
- El embudo anti-dormidos se basa exclusivamente en las métricas de `whatsapp_message_log` (fechas de última interacción y conteo) y `appointments.estimated_due_date`.
- Los textos PDF procesados se indexan en `faq_textual`.

### 10.2. Con Módulo 2 (Conectividad)
- Despacha los mensajes a través de `chatwoot_client.js`. 
- Usa `litellm_client.js` para generar el Copilot de 10 minutos.

### 10.3. Con Módulo 3 (Motor Inbound - Triaje)
- Si un paciente reporta dolor severo en el seguimiento postoperatorio, se etiqueta como urgencia, cambiando a `bot_paused` y bypassando silencios.

### 10.4. Con Módulo 4 (Agendamiento)
- Si el paciente presiona "Necesito Reprogramar" en el 3-3-4, el sistema cancela en Easy!Appointments y entra al flujo de triaje conversacional del Módulo 4.
- El embudo de No-Show se dispara gracias a los cambios de estado notificados desde EA.

### 10.5. Con Módulo 5 (Wishlist 2.0)
- Promociona la lista de espera al final de las confirmaciones, y actúa como motor de envío para las ráfagas asincrónicas (cronjobs de 90m, 15m y broadcast FCFS) administradas por la Wishlist.
