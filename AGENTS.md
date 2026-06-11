# Instrucciones Maestras para Agentes de IA (Meta-Skill)

Este archivo sirve como el "Cerebro Central" para cualquier Agente de IA (como Gemini, Claude, Cursor, Windsurf, etc.) que opere en el proyecto **DentalA**. Contiene el mapa completo de las capacidades instaladas (Skills) y los servidores de contexto (MCPs) para que sepas cuándo y cómo utilizarlos automáticamente.

Como Agente de IA, **debes leer e interiorizar este documento** antes de comenzar a trabajar en tareas complejas del proyecto.

---

## 🎯 0. Protocolo de Selección de Herramientas (Tool Selection Protocol)

> **REGLA DE ORO**: Antes de ejecutar cualquier tarea, **identifica y justifica** las herramientas que vas a usar. No empieces a escribir código o ejecutar comandos sin haber hecho este análisis primero.

### Proceso Obligatorio por Tarea

Para **cada tarea** que recibas, sigue este proceso de 3 pasos antes de ejecutar:

#### Paso 1 — Clasificar la tarea
Determina a qué categoría pertenece la tarea:

| Categoría | Señales en el mensaje del usuario | Herramientas prioritarias |
|-----------|-----------------------------------|---------------------------|
| 🗓️ Agenda / Citas | "turno", "reservar", "disponibilidad", "cita", "paciente" | Cliente API Easy!Appointments → `easyappointments_client.js` |
| 💬 Mensajes / CRM | "mensaje", "WhatsApp", "conversación", "paciente escribió" | `chatwoot-mcp-server` → skills: `chatwoot-mcp-guide`, `whatsapp-template-manager` |
| ⚙️ Automatización | "flujo", "workflow", "automatizar", "n8n", "trigger" | `n8n-mcp-server` → skills: `n8n-workflow-patterns`, `n8n-code-javascript`, `n8n-expression-syntax` |
| 🗄️ Base de Datos | "tabla", "SQL", "supabase", "consulta", "datos", "schema" | `supabase-mcp-server` → skills: `supabase`, `supabase-postgres-best-practices` |
| 🌐 Frontend / UI | "dashboard", "página", "componente", "diseño", "interfaz" | skills: `vercel-react-best-practices`, `frontend-design`, `modern-web-guidance` |
| 🏗️ Infraestructura | "servidor", "contenedor", "Coolify", "Hetzner", "DNS", "SSL" | `hetzner-mcp-server`, `cloudflare-mcp-server` → skills: `hetzner-mcp-guide`, `cloudflare-mcp-guide`, `coolify-mcp-guide` |
| 🤖 IA / LLM | "modelo", "prompt", "LiteLLM", "Gemini", "Claude" | skills: `litellm-proxy-guide` |
| 🔐 Seguridad | "API key", "credencial", "RLS", "firewall", "WAF" | skills: `supabase-postgres-best-practices`, `cloudflare-mcp-guide` |

#### Paso 2 — Justificar cada herramienta elegida
Para las herramientas que vayas a usar, explica brevemente:
- **¿Qué hace?** (1 línea de descripción funcional)
- **¿Por qué ahorra tiempo aquí?** (vs. hacerlo manual o con otra herramienta)
- **¿Cuándo NO usarla?** (límites claros para evitar errores)

**Ejemplo de razonamiento válido:**
```
Tarea: "Revisar si el paciente Juan tiene turno mañana"
→ Herramienta: Cliente API Easy!Appointments → getFreeSlots()
  ✅ ¿Qué hace? Consulta disponibilidad y citas en la base de datos
  ✅ ¿Por qué ahorra tiempo? Evita acceder a la base de datos o portal manualmente
  ❌ ¿Cuándo NO? Si necesitas cancelar la cita → usa cancelAppointment(), no getFreeSlots()
```

#### Paso 3 — Verificar credenciales antes de ejecutar
Siempre revisa el `.env` y `APIS_CONFIG.md` antes de llamar a cualquier MCP o cliente.
Si la credencial falta o tiene valor placeholder (`_here`, `_key_here`), **informa al usuario** en lugar de fallar silenciosamente.

---

### Tabla de Referencia Rápida: ¿Qué herramienta para qué?

| Si necesitas... | Usa esto | En lugar de... |
|-----------------|----------|----------------|
| Ver/crear reservas de turnos | Cliente API `easyappointments_client.js` | Acceder a la UI manualmente |
| Leer mensajes de pacientes | `chatwoot-mcp-server` | Pedir al usuario que copie el mensaje |
| Crear/modificar un workflow | `n8n-mcp-server` + skill `n8n-workflow-patterns` | Escribir JSON de workflow desde cero |
| Consultar tablas de la DB | `supabase-mcp-server` → `execute_sql` | Pedir al usuario una exportación CSV |
| Ver estado de contenedores | Script `coolify_client.js` o `hetzner-mcp-server` | Ingresar a Coolify UI manualmente |
| Automatizar UI / Clicks en Web | `playwright-mcp-server` | Usar "Computer Use" genérico o agentes visuales caros |
| Investigar código del proyecto | `grep_search` + `view_file` | Leer archivos uno por uno sin dirección |
| Probar conectividad | `node test_connections.js` | Hacer curl manual por cada servicio |
| Gestionar DNS/SSL | `cloudflare-mcp-server` | Entrar al panel de Cloudflare |

---

## 🔌 1. Servidores MCP (Model Context Protocol) Activos

El proyecto está conectado a múltiples plataformas a través de MCPs, lo que te permite ejecutar acciones en el mundo real o consultar bases de datos vivas. Cuando se te pida interactuar con estos servicios, **utiliza las herramientas de MCP automáticamente**.

| MCP Server | Uso Principal | Herramientas Clave que debes usar |
|------------|---------------|-----------------------------------|
| **Supabase** (`supabase-mcp-server`) | Gestión de Base de Datos y Backend | `execute_sql`, `list_tables`, `get_logs`, `list_edge_functions`. **Nota:** Está en modo `read-only` por seguridad. Úsalo para investigar la DB. |
| **n8n** (`n8n-mcp-server`) | Automatización de flujos de trabajo (Workflows) | Consultar documentación de nodos, validar flujos y buscar templates en la API local de n8n. |
| **Chatwoot** (`chatwoot-mcp-server`) | Soporte y CRM Multicanal (WhatsApp) | `chatwoot_list_conversations`, `chatwoot_create_message`. Úsalo para leer mensajes de pacientes o dejar notas internas. |
| **GitHub** (`github-mcp-server`) | Control de versiones y repositorios | Búsqueda de código, manejo de issues y PRs. |
| **Playwright RPA** (`playwright-mcp-server`) | Automatización UI Determínistica | `navigate`, `click`, `fill`. Úsalo para simular acciones en software web cerrado (como Dentalink) con máxima precisión y nulo divague. |
| **Hetzner** (`hetzner-mcp-server`) | Servidor VPS y hardware | Gestión de servidores, snapshots y reglas de firewall en el entorno autohospedado. |
| **Cloudflare** (`cloudflare-mcp-server`) | DNS, Seguridad WAF y Red | Gestión de dominios, caché, certificados SSL (Full Strict) y Cloudflare Tunnels (Zero Trust). |

---

## 🧠 2. Directorio de Skills (Procedimientos Especializados)

El proyecto cuenta con múltiples *Agent Skills* (ubicados en `.agents/skills/`). Estos contienen conocimientos técnicos precisos y buenas prácticas. **Tu deber es aplicar estas reglas de forma estricta** cuando trabajes en las áreas correspondientes.

### 🌐 Desarrollo Web y UI/UX
Cuando modifiques el Frontend, **aplica automáticamente** las reglas de estos skills:
- **`modern-web-guidance`**: Sigue las reglas de rendimiento (LCP < 2.5s, INP < 200ms) y usa CSS moderno (Grid, Container Queries, variables HSL/OKLCH).
- **`vercel-react-best-practices`**: En React/Next.js, prioriza Server Components. Evita prop-drilling. Usa `next/image` y `next/font`.
- **`frontend-design`** (Anthropic): No uses diseños "genéricos de IA". Mantén un sistema de espaciado estricto (4px, 8px, 16px...) y no uses negros puros (#000000).
- **`web-design-guidelines`** & **`web-quality-skills`**: Mantén contraste WCAG 2.2 AA (4.5:1). Usa siempre HTML semántico.

### ⚙️ Automatización e Infraestructura (n8n & Chatwoot & Supabase & Coolify)
Cuando crees flujos o integres plataformas:
- **`hetzner-mcp-guide`**: Prácticas para administrar el servidor VPS donde corre Coolify (RAM, CPU, Snapshots y Firewall).
- **`cloudflare-mcp-guide`**: Gestión de seguridad Edge, WAF, DNS y encriptación SSL estricta para proteger las APIs.
- **`n8n-worker-postgres`**: Sabe que la arquitectura es escalable (Queue Mode) con backend en PostgreSQL y Redis. Las integraciones deben ser eficientes.
- **`coolify-mcp-guide`**: Para gestionar la infraestructura de contenedores Docker autohospedados de n8n, Chatwoot y Redis.
- **`playwright-rpa-guide`**: Reglas de oro para automatizar software heredado/sin API (como Dentalink). Obliga a usar scripts de automatización robótica (RPA) con selectores estrictos para asegurar coste cero y nulas alucinaciones, prohibiendo explícitamente el uso de IA visual "Computer Use".
- **`chatwoot-mcp-guide`**: Usa este para entender cómo enrutar mensajes de pacientes (Chatwoot) hacia reservas de turnos (Easy!Appointments) usando Webhooks en n8n y el cliente de agenda nativa.
- **`redis-agent-skill`**: Para gestionar la concurrencia, TTL de 24h, búfer anti-fragmentación y locks de estado en Redis.
- **Skills de n8n** (`n8n-code-javascript`, `n8n-workflow-patterns`, `n8n-expression-syntax`, etc.): Patrones para el desarrollo de workflows y nodos de decisión.

### 🗄️ Backend y Base de Datos (Supabase & PostgreSQL)
- **`supabase-postgres-best-practices`**: Al escribir SQL para la base de datos central de Supabase, optimiza las consultas (índices, Row Level Security - RLS, control de conexiones en PostgreSQL).
- **`supabase-mcp-guide`**: Conoce los límites y capacidades de la API de Supabase para administrar las tablas de pacientes, citas y lista de espera.
- **`litellm-proxy-guide`**: Uso de LiteLLM como middleware unificado para enrutar llamadas a ChatGPT 5.4 y Claude Sonnet 4.6 con redundancia y control de costos.

### 💬 Comunicaciones
- **`whatsapp-template-manager`**: Para manejar la ventana conversacional de 24 horas y aprobación de plantillas en WhatsApp Business.

---

## 🤖 3. Directiva de Comportamiento Autónomo (Auto-Trigger)

1. **Reconocimiento de Contexto:** Si el usuario dice *"haz que el paciente reserve un turno"*, **no pidas instrucciones paso a paso**. Tú ya sabes que debes usar la API de Easy!Appointments (`createAppointment()`) y quizás conectarlo con Chatwoot.
2. **Desarrollo Frontend:** Si el usuario dice *"crea un dashboard"*, **aplica instantáneamente** las reglas de React, Vercel, y Frontend Design. No entregues código React obsoleto o sin diseño; usa Server Components y un sistema de colores estructurado.
3. **No repitas la documentación:** No le resumas al usuario lo que dicen los skills. Simplemente **ejecuta el trabajo** aplicando ese conocimiento.
4. **Si te falta conocimiento:** Ejecuta el tool `find-skills` para buscar en la web si necesitas una capacidad que no está instalada actualmente.
5. **Aprendizaje Activo de Errores e Input del Usuario:** Aprende de cada error de ejecución, fallo en comandos, respuesta HTTP fallida, error de lógica o de las correcciones que te indique el usuario. Adapta tu comportamiento y documenta las lecciones aprendidas si es oportuno para seguir creciendo como Agente.
6. **Flexibilidad e Intuición Técnica (Evitar Rigidez):** No seas rígido con la documentación o la bitácora si las cosas no funcionan. Si tu análisis e intuición te indican que alguna guía, instrucción previa o especificación está errónea o desactualizada, propón y prueba enfoques alternativos de manera experimental y segura.
7. **Selección de Herramientas Obligatoria:** Antes de ejecutar cualquier tarea, aplica el **Protocolo de Selección de Herramientas (Sección 0)**. No empieces a trabajar sin haber identificado y justificado las herramientas más eficientes para la tarea en cuestión.
8. **Mantenimiento y Coherencia de Módulos (Consistency Rule)**: Cada vez que se realice un cambio, hallazgo o diseño correctivo en la arquitectura, es obligatorio actualizar directamente los documentos individuales de los módulos afectados (`Módulo 1_...`, `Módulo 2_...`, etc.) para que permanezcan coherentes con la especificación general, alterando lo menos posible el código base del proyecto.
9. **Chequeo de Seguridad Focalizado (Focused Security Review)**: Inmediatamente después de asegurar la coherencia de cualquier modificación, el agente debe realizar un chequeo de seguridad super exhaustivo centrado estrictamente en los componentes y líneas de código modificados (sin necesidad de auditar todo el sistema desde cero), garantizando que no se comprometan el aislamiento de datos RLS, el cifrado clínico o las llaves de acceso.

*Firmado: El sistema (DentalA Architecture).*

---

## 🔒 4. Protocolo de Credenciales y Autocomprobación (Auto-Check)

Antes de solicitar cualquier URL, credencial o API Key al usuario, **tú como Agente debes verificar obligatoriamente si ya están almacenadas localmente**:

1.  **Comprobar archivo `.env`**: Lee el archivo [`.env`](file:///c:/Users/Renzo/OneDrive/Documentos/DentalA/.env) en la raíz del proyecto. Si una variable está configurada con un valor real, utilízala directamente.
2.  **Consultar Registro de APIs**: Revisa el archivo [`APIS_CONFIG.md`](file:///c:/Users/Renzo/OneDrive/Documentos/DentalA/APIS_CONFIG.md) para entender el mapa de endpoints, tokens y variables de la arquitectura.
3.  **Ejecutar Diagnóstico**: Corre el script unificado de conectividad para validar qué servicios responden antes de reportar fallos de comunicación:
    ```bash
    node --env-file=.env .agents/scripts/api_clients/test_connections.js
    ```

### Estado Actual de URLs y APIs Configuradas en `.env`:
*   **n8n (Orquestador)**: `https://n8n.dental-a.com/` — Container `running:healthy` ✅ API Key **activa**.
*   **Coolify (Infraestructura)**: `http://5.78.221.158:8000` — Token **activo**, 2 servidores administrados ✅
*   **Hetzner (VPS)**: IP `5.78.221.158` — Token configurado ✅
*   **Cloudflare (DNS/WAF)**: API Token (`cfat_...`) y Zone ID **activos** ✅
*   **Chatwoot (CRM)**: `https://chatwood.dental-a.com` — Container `running:unhealthy` ⚠️ API **activa** (token configurado) · Ver endpoints en [`APIS_CONFIG.md`](file:///c:/Users/Renzo/OneDrive/Documentos/DentalA/APIS_CONFIG.md).
*   **Supabase (PostgreSQL)**: `https://supabase.dental-a.com` — Container `running:healthy` ✅ API **activa** (anon key) · Ver endpoints en [`APIS_CONFIG.md`](file:///c:/Users/Renzo/OneDrive/Documentos/DentalA/APIS_CONFIG.md).
*   **LiteLLM (AI Gateway)**: `https://litellm.dental-a.com` — Container `running:unknown` ✅ API **activa** (Master key configurada y probada).
*   **Easy!Appointments**: Motor de agenda activo. `easyappointments_client.js` provisionado y funcionando.
*   **Vapi**: `https://api.vapi.ai` — **INACTIVO / DESCONTINUADO** (Canal de llamadas removido).
*   **Redis**: Redis corre **dentro del contenedor de n8n** en red interna Docker. No accesible desde `127.0.0.1` en local.

---

## 📚 5. Registro de Lecciones Aprendidas

> Este registro se actualiza automáticamente cuando el Agente encuentra errores, correcciones del usuario, o descubre comportamientos inesperados en la infraestructura.

| Fecha | Contexto | Error / Situación | Lección Aprendida |
|-------|----------|-------------------|-------------------|
| 2026-06-02 | Detección de URLs de producción | Las URLs de LiteLLM y Supabase no estaban documentadas | Antes de asumir que un servicio no existe, probar subdominios comunes (`litellm.`, `supabase.`, `db.`) contra el dominio base `dental-a.com`. |
| 2026-06-02 | Protocolos de credenciales | El agente pedía credenciales que ya estaban en `.env` | Siempre ejecutar `view_file .env` ANTES de pedir cualquier dato al usuario. Es obligatorio. |
| 2026-06-02 | Redis ECONNREFUSED | Redis no responde en `127.0.0.1:6379` | Redis corre **dentro del contenedor Docker de n8n** en la red interna de Docker (no expuesto al host ni localmente). El test local siempre fallará. Solo es accesible desde otros contenedores en la misma red Docker del servidor. Lección: no reportar esto como error — es el comportamiento esperado. |
| 2026-06-02 | URL de Chatwoot incorrecta | `chat.dental-a.com` no respondía (fetch failed) | La URL real de Chatwoot es `chatwood.dental-a.com` (con `d` al final). **Regla aprendida: siempre consultar los registros DNS de Cloudflare (`/dns_records`) como fuente de verdad antes de asumir que una URL es correcta.** El `.env` tenía un typo que se detectó comparando contra los 5 registros A/CNAME reales del DNS. |
| 2026-06-03 | Restauración de Volúmenes en Coolify | Coolify fuerza nombres expandidos de volumen (ej: ge1bsrb7whe1u5l8t4upsv2p_ge1bsrb7whe1u5l8t4upsv2p-n8n-data) al compilar y sobreescribe cualquier mapeo manual. | **No intente hackear el compose compiled ni la tabla de volumes de Coolify en caliente**. Es más seguro/robusto dejar que Coolify genere sus nombres y realizar un sync físico de datos directo (`cp -a`) entre los volúmenes originales y los nuevos con la suite detenida. |

