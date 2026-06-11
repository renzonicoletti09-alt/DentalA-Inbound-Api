# Auditoría de Automatizaciones Outbound (Post-Cita y Retención) - Módulo 6: Fase 2

Hemos verificado e integrado con éxito el motor de seguimiento clínico inteligente, el flujo CSAT con derivación a ticket prioritario y el embudo de reactivación Anti-Dormidos con compuerta de calidad de línea (Quality Gating).

## Estructura de Componentes

### 1. Material Post-Cita y Extracción PDF a RAG
- **Archivo**: [services/post_consultation_service.js](file:///c:/Users/Renzo/OneDrive/Documentos/DentalA/services/post_consultation_service.js)
- **Mejoras**:
  - **Material Dual**: Envía una infografía (imagen) + un PDF explicativo de cuidados clínicos a las 2 horas de finalizada la cita.
  - **OCR/Parseo e Indexación**: Utiliza `pdf-parse` para validar el texto del PDF, extraerlo e insertarlo en la tabla `faq_textual` bajo la categoría `postop`. Para compatibilidad e integridad, realiza un cast robusto de `sheet_row_id` a entero y carga tanto los campos reales del esquema (`pregunta`, `respuesta`) como los legados de test (`question`, `answer`).

### 2. Seguimiento Clínico Inteligente
- **Lógica**: Se barajan las citas terminadas en función del `treatment_complexity`:
  - **Alta Complejidad**: Mensaje a las 24 horas (inyectando `preop_instructions_text` para indagar por dolores/fiebre) y control a las 48 horas.
  - **Media Complejidad**: Mensaje único a las 24 horas enfocado en la mordida (oclusión).
  - **Baja Complejidad**: Ningún mensaje clínico saliente para evitar saturación del paciente.

### 3. Encuesta CSAT (Satisfacción)
- **Archivo**: [services/csat_service.js](file:///c:/Users/Renzo/OneDrive/Documentos/DentalA/services/csat_service.js)
- **Enrutamiento**: 
  - **4-5 Estrellas**: Agradece y despacha enlace hacia Google Maps para reseña pública.
  - **1-3 Estrellas (Crítico)**: Abre una Nota Privada de alerta urgente en la conversación de Chatwoot y envía un mensaje de contención al paciente sin derivarlo nunca a Google Maps.

### 4. Embudo Anti-Dormidos (Fidelización)
- **Archivo**: [services/retention_funnel_service.js](file:///c:/Users/Renzo/OneDrive/Documentos/DentalA/services/retention_funnel_service.js)
- **Lógica**: Excluye a pacientes en lista de espera (Wishlist), calcula su inactividad mediante `whatsapp_message_log` y los inyecta en campañas de 4 semanas, 3 meses y 6 meses utilizando botones interactivos de Meta.

### 5. Quality Gating (Compuerta de Calidad)
- **Lógica**: CSAT y Anti-Dormidos son campañas no esenciales. Antes de despacharse, consultan el Quality Rating de la línea Meta. Si es "Yellow" o "Red", abortan de forma preventiva para proteger la salud de la línea de WhatsApp, manteniendo activos solo los recordatorios 3-3-4 y seguimientos clínicos vitales.

---

## Resultados de las Pruebas (TDD)

### 1. Pruebas Locales (Mock)
Ejecutando: `node test_outbound_fase2.js`
- **Mitigación CSAT Crítico (2 Estrellas)**: ✅ OK (Nota privada generada y maps bloqueado)
- **Compuerta Quality Gating**: ✅ OK (Se aborta si el rating es 'Yellow')
- **Extracción de PDF a RAG**: ✅ OK (Llama a `pdf-parse`, recupera y sube el texto a faq_textual)
- **Filtro Anti-Dormidos**: ✅ OK (Ignora a pacientes anotados en la Wishlist)

### 2. Pruebas de Integración (En Vivo)
Ejecutando: `node --env-file=.env inbound_microservice/test_outbound_fase2.js`
- **Integración con DB y WhatsApp**: ✅ OK (Simula el CSAT negativo de 2 estrellas e inyecta exitosamente el texto del PDF de cuidados postoperatorios en el cerebro de Supabase en producción).
- **Assertions**:
```
--- Prueba 1: CSAT 2 Estrellas (Queja) ---
[CSAT] Score Crítico 2. Escalando a soporte prioritario.
[Test Mock Chatwoot] Nota Privada: 🚨 [CSAT ALERTA] El paciente ha calificado la cita con 2 estrellas. Revisa su caso urgentemente.
✅ ASSERT PASSED: CSAT de 2 estrellas mitigado. Nota prioritaria creada y paciente contenido.

--- Prueba 2: Extracción PDF a RAG ---
[Test Mock Supabase] Texto de PDF inyectado en RAG (faq_textual) exitosamente.
✅ ASSERT PASSED: El PDF fue parseado (OCR/Text) y volcado a la memoria del bot (RAG).
```
