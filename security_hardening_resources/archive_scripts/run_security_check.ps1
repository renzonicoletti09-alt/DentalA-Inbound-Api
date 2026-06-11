# ====================================================================
# SCRIPT DE AUTOMATIZACIÓN DE ESCANEO DE SEGURIDAD (DENTALA)
# ====================================================================
# Este script de PowerShell ejecuta el diagnóstico de seguridad en Python
# y escribe los resultados detallados en un archivo de log local.

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PythonScript = Join-Path $ScriptDir "security_audit.py"
$LogFile = Join-Path $ScriptDir "scan_results.log"

Write-Host "Iniciando escaneo de seguridad en DentalA..." -ForegroundColor Blue

# Ejecutar el script de Python y capturar salida
if (Test-Path $PythonScript) {
    python $PythonScript > $LogFile
    Write-Host "Escaneo completado. Resultados guardados en: $LogFile" -ForegroundColor Green
    
    # Comprobar si hay alertas críticas en el log
    $Content = Get-Content $LogFile -Raw
    if ($Content -match "CRÍTICO") {
        Write-Host "[!] ALERTA CRÍTICA: Se detectaron vulnerabilidades críticas en el sistema. Revise el archivo $LogFile de inmediato." -ForegroundColor Red
    } else {
        Write-Host "[+] Sistema saludable. No se detectaron vulnerabilidades críticas." -ForegroundColor Green
    }
} else {
    Write-Host "Error: No se encontró el script $PythonScript" -ForegroundColor Red
}
