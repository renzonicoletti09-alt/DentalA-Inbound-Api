#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
====================================================================
DIAGNÓSTICO AUTOMATIZADO DE SEGURIDAD (SECURE-CHECK) — DENTALA
====================================================================
Este script escanea la configuración local del sistema (puertos expuestos,
variables de entorno de Docker, presencia de autenticación y redundancia)
para auditar el nivel de seguridad del entorno autohospedado en Coolify.

Es NO INVASIVO y no realiza cambios. Solo genera un informe de brechas.
Uso: python security_audit.py
"""

import socket
import os
import sys

# Códigos de color para terminales
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
BLUE = "\033[94m"
RESET = "\033[0m"

print(f"{BLUE}===================================================================={RESET}")
print(f"{BLUE}         DENTALA — INFORME DE DIAGNÓSTICO DE SEGURIDAD              {RESET}")
print(f"{BLUE}===================================================================={RESET}\n")

# 1. FUNCIÓN PARA COMPROBAR PUERTOS ABIERTOS EN LOCALHOST VS EXTERNO
def check_port_exposure(port, description):
    # Probar si el puerto está abierto localmente
    local_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    local_socket.settimeout(0.5)
    local_result = local_socket.connect_ex(('127.0.0.1', port))
    local_socket.close()

    # Probar si el puerto está abierto externamente (0.0.0.0 o IP pública)
    # Nota: Hacemos una prueba básica en localhost; el administrador debe verificar las reglas del VPS.
    if local_result == 0:
        print(f"[{YELLOW}AVISO{RESET}] Puerto {port} ({description}) está abierto en el host.")
        print(f"      -> Asegúrate de que el Firewall (ej. Hetzner Firewall) bloquee el tráfico externo a este puerto.")
        return True
    else:
        print(f"[{GREEN}OK{RESET}] Puerto {port} ({description}) no está expuesto directamente en localhost.")
        return False

# 2. AUDITAR VARIABLES DE ENTORNO EN UN ARCHIVO .env O SIMILAR SI EXISTIERA
def audit_n8n_env():
    print(f"\n{BLUE}[+] Auditando Variables de Hardening de n8n...{RESET}")
    # Comprobar si se definen variables seguras en el entorno del sistema actual
    prune_enabled = os.environ.get("EXECUTIONS_DATA_PRUNE")
    max_age = os.environ.get("EXECUTIONS_DATA_MAX_AGE")
    db_user = os.environ.get("DB_POSTGRESDB_USER")

    warnings = 0
    
    if prune_enabled != "true":
        print(f"  - [{RED}CRÍTICO{RESET}] EXECUTIONS_DATA_PRUNE no está configurado como 'true' en este entorno.")
        warnings += 1
    else:
        print(f"  - [{GREEN}OK{RESET}] EXECUTIONS_DATA_PRUNE está configurado como 'true'.")

    if not max_age:
        print(f"  - [{YELLOW}ADVERTENCIA{RESET}] EXECUTIONS_DATA_MAX_AGE no está definido. Los logs podrían acumularse.")
        warnings += 1
    else:
        print(f"  - [{GREEN}OK{RESET}] EXECUTIONS_DATA_MAX_AGE está configurado en: {max_age} horas.")

    if db_user == "postgres" or db_user == "superuser":
        print(f"  - [{RED}CRÍTICO{RESET}] n8n está configurado para conectarse como usuario administrador '{db_user}'.")
        warnings += 1
    elif db_user:
        print(f"  - [{GREEN}OK{RESET}] n8n se conecta usando un usuario limitado: {db_user}.")
    else:
        print(f"  - [{YELLOW}AVISO{RESET}] No se detectó la variable DB_POSTGRESDB_USER en el entorno local.")

    return warnings

# 3. COMPROBAR REDIS LOCAL
def audit_redis():
    print(f"\n{BLUE}[+] Comprobando Conexión Segura a Redis...{RESET}")
    # Intentar conectar a un Redis local estándar
    try:
        r_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        r_socket.settimeout(0.5)
        conn = r_socket.connect_ex(('127.0.0.1', 6379))
        if conn == 0:
            # Enviar comando PING
            r_socket.sendall(b"PING\n")
            response = r_socket.recv(1024).decode('utf-8', errors='ignore')
            r_socket.close()
            
            if "NOAUTH" in response:
                print(f"  - [{GREEN}OK{RESET}] Redis local requiere autenticación (NOAUTH recibido).")
            elif "PONG" in response:
                print(f"  - [{RED}CRÍTICO{RESET}] Redis local responde PING sin contraseña. ¡Fuga potencial de datos!")
            else:
                print(f"  - [{YELLOW}AVISO{RESET}] Conexión establecida pero la respuesta es inusual: {response.strip()}")
        else:
            print(f"  - [{GREEN}OK{RESET}] No se detectó instancia de Redis escuchando en localhost:6379.")
    except Exception as e:
        print(f"  - [AVISO] No se pudo verificar la instancia Redis local: {e}")

# 4. EJECUTAR DIAGNÓSTICO
print(f"{BLUE}[+] Escaneando exposición de puertos en el host...{RESET}")
check_port_exposure(6379, "Redis")
check_port_exposure(5432, "PostgreSQL / Supabase")
check_port_exposure(8000, "Coolify Dashboard")

audit_n8n_env()
audit_redis()

print(f"\n{BLUE}===================================================================={RESET}")
print(f"                   FIN DEL DIAGNÓSTICO DE SEGURIDAD                 ")
print(f" Consúltese el manual walkthrough.md y security_review.md para      ")
print(f" aplicar las soluciones definitivas de mitigación en tu servidor.  ")
print(f"{BLUE}===================================================================={RESET}")
