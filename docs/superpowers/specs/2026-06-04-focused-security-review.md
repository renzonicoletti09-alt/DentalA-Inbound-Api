# 🛡️ DentalA - Reporte de Chequeo de Seguridad Focalizado (Focused Security Review)

Este documento detalla el análisis exhaustivo de seguridad de los componentes y líneas de código modificados en los módulos de DentalA durante la última iteración.

---

## 🔍 Resumen del Análisis de Amenazas y Mitigaciones

| Componente Modificado | Amenaza Identificada | Nivel de Riesgo | Mitigación Implementada / Propuesta |
|---|---|---|---|
| **Política RLS Compuesta** | Fuga de datos entre consultorios (Multi-tenancy). | **Alto** | Validación estricta con `auth.uid() = dentist_id` y subconsultas indexadas no-correlacionadas. |
| **Desencriptación Node.js (RAG)** | Exposición de historia clínica en texto plano. | **Medio** | Descifrado estrictamente en memoria (RAM) de Node.js por sesión de paciente. Clave simétrica `DENTALA_ENCRYPTION_KEY` oculta en `.env`. |
| **Webhook Easy!Appointments** | Suplantación de identidad en confirmación de citas (Spoofing). | **Alto** | **Mitigación**: Implementar cabecera `Authorization: Bearer $DENTALA_N8N_WEBHOOK_SECRET` y firmar el payload en PHP. |
| **Aprovisionamiento Onboarding** | Privilegios elevados en tokens de Coolify/Cloudflare. | **Medio** | **Mitigación**: Restringir tokens de Cloudflare únicamente a la zona `dental-a.com` con permisos CNAME. |
| **Redis Debounce Keys** | Inyección de llaves en Redis por números de teléfono. | **Bajo** | Sanitización regex del `patient_id` en el gateway para permitir solo dígitos numéricos (código de país + teléfono). |

---

## 🛠️ Detalles de Mitigación de Seguridad por Componente

### 1. Hardening de la Política RLS (Módulo 1 y Módulo 8)
*   **Vectores de Ataque Analizados**: Bypass de RLS mediante alteración de JWT o suplantación de staff.
*   **Análisis**: Supabase firma los JWT de Auth usando `DENTALA_SUPABASE_JWT_SECRET`. PostgreSQL valida la firma antes de exponer `auth.uid()`. Dado que la política compuesta utiliza la función segura de Supabase `auth.uid()`, es imposible para un atacante suplantar a otro odontólogo modificando la cabecera local, a menos que obtenga el secreto de firma JWT de la aplicación.
*   **Recomendación de Robustez**: Los índices sobre `dentist_staff(user_id)` deben ser únicos (`UNIQUE INDEX`) para evitar colisiones lógicas en la evaluación de la subconsulta del staff.

### 2. Autenticación del Webhook de Easy!Appointments (Módulo 4)
*   **Riesgo de Spoofing**: Al exponer un endpoint público de webhook en n8n para recibir notificaciones de agendamiento manual, un atacante podría enviar payloads HTTP POST simulando que un paciente agendó, lo cual activaría el envío de mensajes spam por WhatsApp.
*   **Código de Mitigación (Firma de Webhook en PHP - Easy!Appointments)**:
    ```php
    // En el controlador php de Easy!Appointments:
    $secret = getenv('DENTALA_N8N_WEBHOOK_SECRET');
    $payload = json_encode([...]);
    $signature = hash_hmac('sha256', $payload, $secret);

    $ch = curl_init("https://n8n.dental-a.com/webhook/appointments");
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'X-DentalA-Signature: ' . $signature
    ]);
    // ...
    ```
*   **Validación en n8n**: El nodo de entrada de n8n debe calcular el hash HMAC-SHA256 del cuerpo recibido con la variable local `DENTALA_N8N_WEBHOOK_SECRET` y compararlo con la cabecera `X-DentalA-Signature`. Si no coinciden, se rechaza la petición con un error `401 Unauthorized`.

### 3. Principio de Privilegio Mínimo en Onboarding (Módulo 6)
*   **Riesgo de Compromiso de Token**: El flujo automatizado de onboarding requiere interactuar con las APIs de Cloudflare y Coolify. Si se usa el token administrativo global de Cloudflare, un compromiso de la base de datos de n8n expondría todas las zonas DNS registradas en la cuenta del desarrollador.
*   **Mitigación**:
    1.  **Cloudflare**: Crear un API Token en la consola de Cloudflare con la plantilla "Editar zona DNS". Limitar el permiso a: *Zone: dental-a.com* y *DNS: Edit*. Esto impide que el token elimine el dominio, acceda a facturación o modifique reglas WAF globales.
    2.  **Coolify**: El token de Coolify se limita al proyecto específico de DentalA y no a todo el servidor host de manera general.

### 4. Sanitización de Parámetros en Redis Debounce (Módulo 3)
*   **Riesgo de Inyección de Llaves**: En el comando Redis `SET lock:triage:{dentist_id}:{patient_id}`, si el valor de `patient_id` se recibe de forma directa de los metadatos de WhatsApp, un payload malicioso podría inyectar caracteres especiales de control (como `\r\n` o delimitadores de Redis).
*   **Mitigación**: El proxy de ingesta (Edge Function) debe verificar que el número de teléfono cumpla con el formato E.164 internacional usando una expresión regular estricta:
    ```javascript
    const phoneRegex = /^[1-9]\d{1,14}$/;
    if (!phoneRegex.test(patient_id)) {
        throw new Error("Formato de ID de paciente no válido");
    }
    ```
    Esto elimina cualquier posibilidad de inyección de comandos o inyección de llaves de caché en Redis.
