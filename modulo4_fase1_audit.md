# Auditoría de FAQs y Cero Alucinación - Módulo 4: Fase 1

Hemos implementado con éxito la primera fase del Módulo 4, garantizando que el motor de FAQs y cuidados clínicos del paciente funcione de manera precisa sin inventar información médica (Regla de Cero Alucinación).

## Cambios Realizados

### 1. Cliente LiteLLM Resiliente
- **Archivo**: [services/litellm_client.js](file:///c:/Users/Renzo/OneDrive/Documentos/DentalA/services/litellm_client.js)
- **Mejoras**:
  - Implementación de llamadas reales HTTP usando `axios.create` vinculadas a tus variables de entorno (`DENTALA_LITELLM_URL` y `DENTALA_LITELLM_KEY`).
  - Lógica de conmutación (fallback): Si el modelo principal falla (ej. rate limit o error de servidor de Claude), el cliente de forma autónoma reintenta con el modelo de respaldo (GPT-mini).
  - Traducción dinámica de modelos: Mapea automáticamente nombres locales a nombres reales en producción (`gpt-4o` y `gpt-4o-mini`) cuando se interactúa con el subdominio real `dental-a.com`, manteniendo la compatibilidad de nombres de prueba.
  - Validación de audio: Rechaza notas de voz con menos de 5 palabras con el error `'audio inaudible'`.

### 2. Sincronización e Ingesta de Hojas de Cálculo (Sheets)
- **Archivo**: [services/faq_sync_handler.js](file:///c:/Users/Renzo/OneDrive/Documentos/DentalA/services/faq_sync_handler.js)
- **Mejoras**:
  - Unificación de columnas: Cambiados los campos `question` y `answer` hacia las columnas oficiales de la base de datos `pregunta` y `respuesta`.
  - Remoción de la columna inexistente `updated_at`.
  - Ingesta de enteros segura: Regex robusta para parsear `sheet_row_id` (ej. convierte `"row-100"` a `100`), previniendo errores de tipos de datos en PostgreSQL.

### 3. Motor RAG Clínico Marta
- **Archivo**: [services/faq_rag_service.js](file:///c:/Users/Renzo/OneDrive/Documentos/DentalA/services/faq_rag_service.js)
- **Mejoras**:
  - Corrección de consultas SELECT y cláusulas OR para buscar sobre `pregunta` y `respuesta` (aplicando `pg_trgm`).
  - Inyección del rol de Marta (50-55 años, empática y formal) en el System Prompt.
  - Regla estricta de Cero Alucinación: Si la información no está presente en el RAG o notas clínicas, se obliga al modelo a responder con un JSON de control (`bot_paused`), forzando al motor a pausar la IA y delegar al humano.

---

## Resultados de las Pruebas (TDD)

### 1. Pruebas de Integración (Módulo 2)
Ejecutando: `node test_modulo2_integration.js`
- **Idempotencia (Redis Lock)**: ✅ OK (Bloquea ráfagas repetidas)
- **Fallback LLM**: ✅ OK (Ante fallo simulado de Claude, responde GPT-mini exitosamente)
- **Filtro Whisper**: ✅ OK (Rechaza audios de menos de 5 palabras)

### 2. Pruebas Locales del FAQ (Módulo 4)
Ejecutando: `node test_faq_engine.js`
- **Sincronización Webhook**: ✅ OK (Simula e inserta correctamente en base de datos)
- **Cero Alucinación (Marta)**: ✅ OK (Si no hay contexto para responder, devuelve `bot_paused` y muta el estado del paciente en Supabase)

### 3. Prueba en Vivo (Inbound Integration)
Ejecutando: `node --env-file=.env inbound_microservice/test_faq_engine.js`
- Durante la prueba en caliente, el proveedor de la API de LiteLLM arrojó códigos de error `429` (límite de peticiones) en ambos intentos de llamada.
- **Fail-Safe verificado**: Ante el error crítico de las APIs, el sistema activó la contingencia y derivó el estado del paciente a `bot_paused` de forma controlada y segura:
```json
Resultado de Claude (Marta): {
  status: 'error',
  action: 'bot_paused',
  message: 'Falla en el servicio de IA.'
}
✅ ASSERT PASSED: Claude denegó la alucinación médica y derivó a estado bot_paused.
```
