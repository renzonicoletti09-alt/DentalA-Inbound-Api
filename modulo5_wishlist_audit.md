# Auditoría de Wishlist 2.0 y Remiendo de Agenda - Módulo 5

Hemos verificado e integrado con éxito el motor de Lista de Espera Inteligente (Wishlist 2.0) y su algoritmo de remiendo de agenda.

## Estructura de Componentes

### 1. Trigger de Activación
- **Archivo**: [services/wishlist_trigger_handler.js](file:///c:/Users/Renzo/OneDrive/Documentos/DentalA/services/wishlist_trigger_handler.js)
- **Lógica**: Se despierta exclusivamente mediante el webhook `appointment_cancelled` o `slot_freed` de Easy!Appointments. Otros eventos (como la creación de turnos) son ignorados para evitar bucles.

### 2. Algoritmo LIFO Estricto y Ráfagas Temporales
- **Archivo**: [services/wishlist_engine.js](file:///c:/Users/Renzo/OneDrive/Documentos/DentalA/services/wishlist_engine.js)
- **Implementación**:
  - Recupera los candidatos activos del doctor (`status = 'active'`) y los ordena en un orden LIFO estricto (`signup_timestamp DESC`).
  - **Estrategias Temporales**:
    - **Anticipación > 4 horas**: Envía la oferta a los **3 mejores candidatos LIFO** de forma paralela.
    - **Entre 3 y 4 horas**: Realiza un **Broadcast a los 15 candidatos más recientes**. La resolución de colisiones FCFS se delega directamente a Easy!Appointments.
    - **Anticipación ≤ 3 horas (Bache crítico)**: Asigna directamente al **primer candidato LIFO**. Si este ya recibió una oferta en las últimas 2 horas, se realiza un salto (máximo 3 saltos) para no saturar al paciente.
  - **Penalización**: Incrementa el contador de baches ofrecidos (`offered_gaps_count`). Si llega a 3, muta el estado a `status = 'expired'` y envía una notificación de expulsión por WhatsApp.

---

## Resultados de las Pruebas (TDD)

### 1. Pruebas Locales (Mock)
Ejecutando: `node test_wishlist_lifo.js`
- **Filtro de Eventos del Trigger**: ✅ OK (Ignora creaciones de citas)
- **Estrategia >4 horas (Batch 3)**: ✅ OK (Notifica a los 3 más recientes en orden LIFO)
- **Penalización por Expiración**: ✅ OK (Muta a `expired` tras 3 fallos)
- **Asignación Directa (≤3 horas)**: ✅ OK (Notifica a 1 solo candidato)
- **Regla de Salto (Cool-down)**: ✅ OK (Salta a pacientes notificados en menos de 2 horas)

### 2. Pruebas en Vivo (Integration)
Ejecutando: `node --env-file=.env inbound_microservice/test_wishlist_lifo.js`
- **Integración con DB y WhatsApp**: ✅ OK (Certifica que el motor interactúa correctamente con Supabase y envía los mensajes WhatsApp correspondientes).
- **Assertion**:
```
--- Prueba 2: Bache Crítico (≤3 hs) con Salto LIFO ---
[Wishlist Trigger] 🔔 Alerta de sistema: Slot liberado...
[Wishlist] Salto aplicado a paciente +59891111111 (notificado hace < 2hs)
[Wishlist] <=3 hs (CRÍTICO): Asignación directa al candidato LIFO tras 1 saltos.
Resultado Bache Crítico: { status: 'processed', candidates_notified: 1, strategy: 'direct_assign' }
✅ Asignación directa confirmada.
✅ ASSERT PASSED: LIFO estricto validado con salto temporal (Cool-down respetado).
```
