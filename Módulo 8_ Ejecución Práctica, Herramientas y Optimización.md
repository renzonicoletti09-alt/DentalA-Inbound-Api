# Documento de Ejecución Práctica y Optimización del Sistema

## Módulo 8: Ejecución Práctica, Herramientas y Optimización (Execution & Performance Blueprint)

**Propósito del Módulo**: Definir las directrices operativas para la ejecución práctica del sistema, los mecanismos de baja latencia y menor costo, y el marco de acción técnica de los Agentes de IA durante el desarrollo.

---

## 1. Ciclo de Vida de la Doble Memoria (Redis ➔ Supabase)

Para evitar la saturación de tokens, se implementa una arquitectura de memoria híbrida:
1. **Redis (Corto Plazo / Efímera)**: Guarda la sesión activa (`session:{dentist_id}:{patient_id}`) con un TTL de 24 horas y locks de agenda.
2. **Supabase (Largo Plazo / Persistente)**: Guarda el historial permanente. Si ocurre un *cache miss* en Redis, n8n re-hidrata la sesión extrayendo los últimos mensajes desde Supabase.

---

## 2. Ruteo de Modelos en LiteLLM y Optimización de Costos

El orquestador LiteLLM balancea velocidad y costo restringiéndose a los siguientes modelos autorizados:

| Tipo de Tarea | Modelo Autorizado | Justificación |
|---|---|---|
| **Triaje, Intenciones, Fallbacks, Copilot** | **ChatGPT 5.4 mini** | Rápido, bajísimo costo, excelente tolerancia al ruido para decisiones estructuradas. |
| **Respuesta a FAQs (RAG Textual) y Clínico** | **Claude Sonnet 4.6** | Razonamiento superior, menor tasa de alucinación para respuestas al paciente. |

*Nota: Se hace uso extensivo del Prompt Caching en Claude para abaratar los costos del RAG textual.*

---

## 3. Cifrado de Datos y Optimización de Base de Datos

### 3.1. Cifrado Estático
El cifrado estricto de notas clínicas y perfiles psicológicos (`clinical_notes`) opera de forma nativa mediante Nodos de Código en n8n utilizando la librería `crypto` de Node.js. Utiliza una llave simétrica estática (`DENTALA_ENCRYPTION_KEY`) definida en el archivo `.env` del contenedor de n8n.

### 3.2. RLS y Aislamiento
Las políticas de Row Level Security (RLS) se aplican de forma simple utilizando la inyección de token y validación estricta del `dentist_id` del consultorio, asegurando el aislamiento absoluto de los datos por inquilino. Todas las columnas sensibles como `clinical_notes` deben estar forzadas a cifrado AES-256-GCM.

### 3.3. Índices Base
Se mantienen los índices `idx_wishlist_priority` (búsqueda LIFO) e `idx_appointments_lookup`, dado que el RAG es estrictamente textual (`pg_trgm`).

### 3.4. Estandarización de Zonas Horarias (Regla UTC)
Para evitar deuda técnica en el manejo de fechas (ej. cronjobs y embudos):
- Toda la infraestructura (Servidores, PostgreSQL, n8n, Easy!Appointments) debe correr obligatoriamente en UTC absoluto.
- Todos los cálculos temporales en n8n (ej. `faltan 3 días`) se hacen en UTC.
- La conversión a la zona horaria local del dentista se aplica EXCLUSIVAMENTE en el último paso (renderizado visual del string) antes de enviar el mensaje de WhatsApp.

---

## 4. Estándar de Ejecución y Pruebas del Agente de IA (TDD)

Cada vez que el Agente reciba la instrucción de realizar un cambio en la base de datos o backend:
1. Validar entorno.
2. Modificar código.
3. Crear un script `verify_hardening.js` para probar las políticas RLS y el correcto funcionamiento (aislamiento de inquilinos).
4. Ejecutar pruebas.

---

## 5. Análisis de Viabilidad y Escalabilidad Tecnológica (MVP SaaS)

Para el MVP, se han establecido límites técnicos claros para no sobre-ingenierizar:

### 5.1. Motor de Agenda (MVP: Easy!Appointments API)
El sistema utiliza integraciones directas a través de las APIs de las instancias de **Easy!Appointments** provisionadas en Coolify.

### 5.2. Sincronización GCal
La sincronización hacia Google Calendar es resuelta pasiva y nativamente por Easy!Appointments.

### 5.3. Ingesta de Mensajería (Directa)
Los webhooks de Meta apuntan directamente a n8n, el cual realiza el debounce de ráfagas de mensajes utilizando lógica en Redis de forma interna.

---

## 6. Políticas de Retención de Datos y Privacidad

- **Limpieza Automática**: Se ejecuta un cron mensual en el host (primer domingo) que realiza un DELETE en `access_logs_clinical` (>90 días), `access_logs` (>180 días), `wishlist` expirada (>180 días) y `wishlist_batch_tracking` completada (>90 días).
- **Portabilidad de Datos Simplificada**: A pedido, el sistema genera un JSON simple con datos del paciente, citas, notas clínicas desencriptadas y perfil psicológico. Lo sube a Storage, genera URL firmada por 24h y lo envía por WhatsApp.
- **Costo Meta Educativo**: En el Onboarding, se le informa al dentista que Meta factura directamente (aprox $0.03-$0.08 por conversación), y en el reporte semanal se incluye el costo estimado.

---

## 7. Estrategia de Despliegue (CI/CD) y Secretos

### 7.1. Control de Versiones de Base de Datos
Las migraciones de Supabase se administran mediante `supabase db push`.

### 7.2. Versionado de Workflows en n8n
Los desarrolladores y agentes de IA deben exportar los flujos localmente en formato JSON y commitearlos al repositorio:
```bash
n8n export:workflow --all --output=n8n_workflows/
```

### 7.3. Secretos Estáticos
Las variables clave (API keys de Meta, tokens de Coolify, `DENTALA_ENCRYPTION_KEY`) residen estáticas en `.env` y el panel de Coolify, sin sistemas de rotación complejos.

---

## 8. Mapa de Interacciones de este Módulo

### 8.1. Con Módulo 1 (Base de Datos)
- Define el estándar de cifrado estático que interactúa con las columnas `clinical_notes`.
- Define las políticas de limpieza simplificadas por cron mensual del host.

### 8.2. Con Módulo 2 (Conectividad)
- Establece los 2 únicos modelos autorizados para LiteLLM.
- Soporta las fallas HTTP.

### 8.3. Con Módulos 4, 5 y 6 (Operación de Agenda)
- Confirma que Easy!Appointments es la fuente de verdad y el motor subyacente para las ráfagas de la Wishlist y recordatorios 3-3-4.
- Confirma el flujo de ingesta directo hacia n8n sin middlewares externos.
