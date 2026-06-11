# Auditoría de Agendamiento y Failover - Módulo 4: Fase 2

Hemos auditado y verificado con éxito el motor de agendamiento conversacional, la política de Cero Modo Offline y el sistema de Failover VIP de WhatsApp saliente.

## Estructura de Componentes

### 1. Motor de Agendamiento Conversacional
- **Archivo**: [services/scheduling_engine_service.js](file:///c:/Users/Renzo/OneDrive/Documentos/DentalA/services/scheduling_engine_service.js)
- **Reglas**:
  - **Triage rápido**: Utiliza `gpt-4o-mini` (ruteado mediante el gateway de LiteLLM) para identificar la intención conversacional del paciente (`faq` frente a `scheduling`).
  - **RAG Intercalado**: Si se detecta una duda clínica durante la interacción de agendamiento, se suspende la reserva de forma temporal para derivar la consulta a Claude (`faq_rag_service.js`) y, tras responder, se retoma activamente el flujo de agendamiento.
  - **Selección Acotada**: Extrae la disponibilidad real del motor transaccional **Easy!Appointments** y propone estrictamente los **3 horarios más convenientes** (filtrados por `slice(0, 3)`), reduciendo la fricción cognitiva del paciente.
  - **Detección de Cancelaciones**: Monitorea si el mensaje incluye intenciones de cancelación para emitir la alerta correspondiente y gatillar el motor de Wishlist (Módulo 5).

### 2. Cero Modo Offline (Tolerancia a Caídas)
- **Regla**: Dado que Easy!Appointments actúa como la única fuente transaccional de verdad, el sistema tiene estrictamente prohibido registrar turnos o agendamientos en una base de datos local si la API de Easy!Appointments no responde (HTTP 500 o caída de red).
- **Contingencia**: En caso de error, el flujo aborta el proceso de reserva y responde: *"Estamos con dificultades técnicas, por favor contacta directamente por teléfono."*, asegurando la integridad transaccional.

### 3. Failover VIP (Alta Disponibilidad Outbound)
- **Archivo**: [services/whatsapp_failover_service.js](file:///c:/Users/Renzo/OneDrive/Documentos/DentalA/services/whatsapp_failover_service.js)
- **Lógica**:
  - **Intento 1 y 2**: Despacha a través del número principal (`whatsapp_number_1`).
  - **Rotación Automática**: Si ocurren 2 fallos consecutivos en el número principal, el servicio redirige la salida al número secundario (`whatsapp_number_2`).
  - **Alerta SysAdmin**: Si ambos números de WhatsApp fallan, se suspende el outbound para evitar bloqueos y se dispara una alerta crítica al SysAdmin.

---

## Resultados de las Pruebas (TDD)

### 1. Pruebas Locales (Mock)
Ejecutando: `node test_scheduling_engine.js`
- **RAG Intercalado**: ✅ OK (Resuelve la duda clínica en medio de la reserva y retoma el agendamiento)
- **Filtrado de Horarios**: ✅ OK (Ofrece exactamente las 3 opciones de slots convenientes)
- **Cero Modo Offline**: ✅ OK (Si se corta EA, aborta el agendamiento local y responde dificultades técnicas)
- **Failover VIP (1 -> 2)**: ✅ OK (Si falla el Inbox 1, redirige al Inbox 2)
- **Failover Extremo**: ✅ OK (Si fallan ambos, detiene y alerta al administrador)
- **Snipe de Wishlist**: ✅ OK (Notifica baches al cancelar turnos)

### 2. Pruebas de Integración (En Vivo)
Ejecutando: `node --env-file=.env inbound_microservice/test_scheduling_engine.js`
- **Tolerancia a Caídas**: ✅ OK (El test simuló una caída HTTP 500 del backend de Easy!Appointments y certificó que el bot bloqueó cualquier registro local, respondiendo con el mensaje correcto de dificultades técnicas).
- **Assertion**:
```json
Resultado del Engine de Agenda: {
  status: 'error_offline',
  reply: 'Estamos con dificultades técnicas, por favor contacta directamente por teléfono.'
}
✅ ASSERT PASSED: El sistema bloqueó el guardado local y emitió el mensaje de dificultades técnicas correcto.
```
