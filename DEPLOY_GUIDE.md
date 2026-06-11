# Guía de Despliegue Zero Trust (DentalA)

## 1. Configuración del Túnel Cloudflare
Para asegurar el acceso administrativo a n8n, Supabase Studio y Coolify, utilizamos Cloudflare Tunnels (Zero Trust).

### Instalación del Servicio
En el servidor VPS (Hetzner) corriendo Linux/Debian, ejecuta el comando de instalación del túnel que extrajimos previamente:

```bash
cloudflared service install eyJhIjoiYTgyYjJkOGE4MDk0YjFiODVlMGRjNjAxMzcwOTg4MGQiLCJ0IjoiYjgyNGYzMWQtODVjMi00ZTVkLTljOGYtMjYzZGFmZmYwNzE2IiwicyI6IlRYbFRkWEJsY2xObFkzSmxkRlIxYm01bGJGQmhjM04zYjNKa01USXpJUT09In0=
```

### Configuración en el Dashboard de Cloudflare
1. Enruta el tráfico del túnel `DentalA-Core` hacia los contenedores locales (por ejemplo, `http://localhost:5678` para n8n).
2. Configura las **Access Policies** (Reglas de Acceso) habilitando MFA o forzando autenticación mediante correos permitidos para restringir el acceso a los subdominios correspondientes.

## 2. Despliegue de Infraestructura
Asegúrate de configurar las variables de entorno detalladas en el archivo `.env.example` dentro del entorno de despliegue en Coolify.

El archivo `docker-compose.yml` incluye el límite estricto de memoria (`mem_limit: 1.5g`) para el contenedor de n8n con el fin de permitir la auto-sanación.
