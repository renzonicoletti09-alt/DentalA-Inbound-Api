# Documento de Monitoreo, ROI y Alta Disponibilidad

## Módulo 7: Monitoreo, ROI y Fail-Safes de Infraestructura (Ops & Resilience)

**Propósito del Módulo**: Definir la recolección de métricas de rendimiento comercial (ROI) asociadas a cada profesional mediante contadores simples, los procedimientos de monitoreo básico de salud, y los protocolos de contingencia para garantizar la disponibilidad del MVP.

---

## 1. Métrica Comercial y Reporte de ROI

Para demostrar el valor comercial de la automatización directamente al dentista, se elimina el fraccionamiento complejo y se utilizan **métricas simples** agregadas en `kpis_analytics`:

1. **Reporte Semanal Automático por WhatsApp**:
   - Envía un mensaje con el dinero recuperado: `turnos_recuperados × avg_consult_price`.
   - Incluye una línea educativa con el costo estimado de Meta: `mensajes_enviados_semana × $0.05`.
2. **KPI a Demanda por Chat**: El doctor puede pedir por chat el estado y el bot retorna 5 métricas:
   - Turnos agendados en el mes.
   - Turnos cancelados.
   - Turnos recuperados vía wishlist/sniper.
   - FAQs respondidas automáticamente (calculado desde `whatsapp_message_log`).
   - Tasa de asistencia a citas confirmadas.

---

## 2. Monitoreo Técnico de Salud de la Plataforma

- **Ping Básico de Salud (Mocks)**: Se usan Mocks en n8n o Uptime Kuma que ejecutan un ping HTTP básico cada 5 minutos a los endpoints principales.
- **Respuesta a Caídas**: Si el ping falla, n8n envía una alerta urgente al SysAdmin del SaaS y pausa temporalmente todas las campañas outbound promocionales, manteniendo activas únicamente las notificaciones logísticas críticas (3-3-4).
- **Auto-sanación de n8n**:
  - Límite RAM contenedor: `--memory=1.5g`. Si lo supera, Docker mata y reinicia.
  - Health check: `curl http://localhost:5678/healthz`.

---

## 3. Blindaje e Infraestructura de Emergencia (Fail-Safes)

Mecanismos de protección ante contingencias de red o caídas de proveedores:

- **Resiliencia LLM**: Si Claude Sonnet 4.6 experimenta un timeout de API, LiteLLM redirige la petición de inmediato a endpoints secundarios (ChatGPT 5.4 mini de respaldo), logrando que la conversación del paciente continúe de forma transparente.
- **Failover de WhatsApp (VIP)**: Gestionado por la lógica de Módulo 4 y 6, alternando automáticamente entre el número primario y secundario del consultorio ante bloqueos de Meta.
- **Disaster Recovery (DR)**: La recuperación ante desastres completos (pérdida de VPS o volúmenes de S3) dependerá de la intervención manual del SysAdmin de infraestructura.
- **WhatsApp Quality Gating**: Si la calificación del número de un consultorio desciende a "Amarillo" o "Rojo" en Meta, n8n suspende temporalmente las campañas outbound (CSAT, Embudo Anti-Dormidos), protegiendo la línea de un bloqueo completo.

### 3.1. Presupuesto de Latencia Simplificado
El tiempo total de respuesta desde que entra el webhook hasta que se emite la respuesta no debe exceder los **3 segundos**:
1. **Debounce e Ingesta**: 50 ms.
2. **Consultas a Redis**: 20 ms.
3. **Consulta SQL a Supabase**: 50 ms.
4. **LiteLLM Triage/FAQ**: 1500 ms.
5. **WhatsApp API Despacho**: 200 ms.

---

## 4. Mapa de Interacciones de este Módulo

### 4.1. Con Módulo 1 (Base de Datos)
- **KPIs Comerciales**: Registra y consolida las 5 métricas a demanda consultando directamente `whatsapp_message_log` y `appointments`.

### 4.2. Con Módulo 2 (Conectividad)
- **Fallback en AI Gateway**: En caso de latencia o HTTP 5xx en la API de Anthropic, LiteLLM re-enruta hacia ChatGPT de forma autónoma.
- **Ping de Monitoreo**: Módulo 7 monitorea el estado básico de conexión HTTP a la instancia de Easy!Appointments y Supabase.

### 4.3. Con Módulo 4 y 5 (Agenda y Wishlist)
- **Recuperación de Wishlist**: Módulo 5 envía la señal de incremento de éxito para la métrica comercial `turnos_recuperados` en Módulo 7.
- **Caída de Motor**: Si Módulo 7 detecta que Easy!Appointments está offline, dispara las alertas y bloquea las intenciones de reserva que maneja el Módulo 4.

### 4.4. Con Módulo 6 (Campañas Outbound)
- **Gating por Reputación**: Si la reputación de Meta cae a "Rojo", Módulo 7 inhabilita de inmediato el despachador de campañas comerciales y CSAT del Módulo 6.
