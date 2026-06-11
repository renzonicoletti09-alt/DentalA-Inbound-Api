# ====================================================================
# DIAGNÓSTICO NATIVO DE SEGURIDAD (SECURE-CHECK) — DENTALA
# ====================================================================
# Este script de PowerShell realiza un escaneo no invasivo de los puertos
# locales y la configuración del entorno para identificar vulnerabilidades.
# Diseñado para ejecutarse de forma nativa en Windows sin depender de Python.
#
# Uso: .\security_audit.ps1

Clear-Host
Write-Output "===================================================================="
Write-Output "         DENTALA — DIAGNÓSTICO AUTOMATIZADO DE SEGURIDAD            "
Write-Output "===================================================================="
Write-Output ""

# 1. FUNCIÓN PARA COMPROBAR EXPOSICIÓN DE PUERTOS
function Test-PortExposure ($Port, $Description) {
    $TcpClient = New-Object System.Net.Sockets.TcpClient
    $Connect = $TcpClient.BeginConnect("127.0.0.1", $Port, $null, $null)
    $Wait = $Connect.AsyncWaitHandle.WaitOne(300, $false)
    
    if ($Wait) {
        try {
            $TcpClient.EndConnect($Connect)
            Write-Host "[ALERTA] Puerto $Port ($Description) esta abierto en este equipo." -ForegroundColor Yellow
            Write-Host "         -> Asegurese de que el Firewall del VPS bloquee conexiones externas."
            $TcpClient.Close()
        } catch {
            $TcpClient.Close()
        }
    } else {
        Write-Host "[OK] Puerto $Port ($Description) cerrado o bloqueado localmente." -ForegroundColor Green
        $TcpClient.Close()
    }
}

# 2. AUDITAR VARIABLES DE ENTORNO DE n8n
function Audit-N8nEnvironment {
    Write-Output ""
    Write-Host "[+] Auditando configuracion de n8n..." -ForegroundColor Blue
    
    $PruneEnabled = [System.Environment]::GetEnvironmentVariable("EXECUTIONS_DATA_PRUNE", "User")
    if (-not $PruneEnabled) {
        $PruneEnabled = [System.Environment]::GetEnvironmentVariable("EXECUTIONS_DATA_PRUNE", "Machine")
    }
    
    $MaxAge = [System.Environment]::GetEnvironmentVariable("EXECUTIONS_DATA_MAX_AGE", "User")
    if (-not $MaxAge) {
        $MaxAge = [System.Environment]::GetEnvironmentVariable("EXECUTIONS_DATA_MAX_AGE", "Machine")
    }
    
    $DbUser = [System.Environment]::GetEnvironmentVariable("DB_POSTGRESDB_USER", "User")
    if (-not $DbUser) {
        $DbUser = [System.Environment]::GetEnvironmentVariable("DB_POSTGRESDB_USER", "Machine")
    }

    if ($PruneEnabled -eq "true") {
        Write-Host "  - [OK] EXECUTIONS_DATA_PRUNE esta habilitado." -ForegroundColor Green
    } else {
        Write-Host "  - [CRITICO] EXECUTIONS_DATA_PRUNE no esta activado en las variables del sistema." -ForegroundColor Red
        Write-Host "             -> Habilite esta variable para evitar acumulacion de logs."
    }

    if ($MaxAge) {
        Write-Host "  - [OK] EXECUTIONS_DATA_MAX_AGE esta configurado en: $MaxAge horas." -ForegroundColor Green
    } else {
        Write-Host "  - [AVISO] EXECUTIONS_DATA_MAX_AGE no esta definido. Los logs no se borraran automaticamente." -ForegroundColor Yellow
    }

    if ($DbUser -eq "postgres" -or $DbUser -eq "superuser") {
        Write-Host "  - [CRITICO] n8n se conecta usando privilegios de administrador '$DbUser'." -ForegroundColor Red
        Write-Host "             -> Configure un usuario limitado (ej. n8n_app_user)."
    } elseif ($DbUser) {
        Write-Host "  - [OK] n8n utiliza un usuario limitado: $DbUser." -ForegroundColor Green
    } else {
        Write-Host "  - [AVISO] Variable DB_POSTGRESDB_USER no detectada en las variables globales." -ForegroundColor Yellow
    }
}

# 3. AUDITAR AUTENTICACIÓN EN REDIS LOCAL
function Audit-RedisAuthentication {
    Write-Output ""
    Write-Host "[+] Evaluando autenticacion de Redis..." -ForegroundColor Blue
    
    $Port = 6379
    $Socket = New-Object System.Net.Sockets.TcpClient
    $Connect = $Socket.BeginConnect("127.0.0.1", $Port, $null, $null)
    $Wait = $Connect.AsyncWaitHandle.WaitOne(300, $false)
    
    if ($Wait) {
        try {
            $Socket.EndConnect($Connect)
            $Stream = $Socket.GetStream()
            $Writer = New-Object System.IO.StreamWriter($Stream)
            $Reader = New-Object System.IO.StreamReader($Stream)
            
            $Writer.WriteLine("PING")
            $Writer.Flush()
            
            $Response = $Reader.ReadLine()
            $Socket.Close()
            
            if ($Response -like "*NOAUTH*") {
                Write-Host "  - [OK] Redis local tiene autenticacion activa." -ForegroundColor Green
            } elseif ($Response -eq "+PONG") {
                Write-Host "  - [CRITICO] Redis local respondio PING sin contrasena." -ForegroundColor Red
            } else {
                Write-Host "  - [AVISO] Redis devolvio una respuesta inusual: $Response" -ForegroundColor Yellow
            }
        } catch {
            Write-Host "  - [OK] No se pudo establecer conexion interactiva con Redis." -ForegroundColor Green
            $Socket.Close()
        }
    } else {
        Write-Host "  - [OK] No se detecto instancia de Redis corriendo localmente." -ForegroundColor Green
        $Socket.Close()
    }
}

# Ejecutar diagnostico
Write-Host "[+] Analizando puertos expuestos..." -ForegroundColor Blue
Test-PortExposure 6379 "Redis"
Test-PortExposure 5432 "PostgreSQL / Supabase"
Test-PortExposure 8000 "Coolify Dashboard"
Test-PortExposure 3000 "Chatwoot UI"
Test-PortExposure 5678 "n8n Backend"

Audit-N8nEnvironment
Audit-RedisAuthentication

Write-Output ""
Write-Output "===================================================================="
Write-Output "                 DIAGNOSTICO COMPLETO FINALIZADO                    "
Write-Output "===================================================================="
Write-Output ""
