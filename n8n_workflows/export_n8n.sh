#!/bin/bash
echo "==============================================="
echo "  Backup Automático de Flujos Visuales de n8n"
echo "==============================================="

# Este script utiliza la CLI de n8n para extraer todos los flujos en crudo (JSON)
# y guardarlos en esta carpeta para subirlos al repositorio.

# 1. Asegurar que estamos dentro del contenedor o tenemos acceso al comando n8n
if ! command -v n8n &> /dev/null
then
    echo "❌ Error: La CLI de n8n no está instalada en este entorno."
    echo "Si estás usando Docker, ejecuta este script desde dentro del contenedor:"
    echo "docker exec -it n8n-dentala /bin/sh"
    exit 1
fi

echo "Exportando flujos a ./n8n_workflows/backup_workflows.json..."
n8n export:workflow --backup --output=backup_workflows.json

echo "Exportando credenciales (encriptadas) a ./n8n_workflows/backup_credentials.json..."
n8n export:credentials --backup --output=backup_credentials.json

echo "✅ Backup completado. No olvides commitear estos JSONs a tu repositorio seguro."
