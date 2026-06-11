const fs = require('fs');
const content = `version: '3.8'
services:
  ea-mysql:
    image: 'mysql:8.0'
    environment:
      MYSQL_ROOT_PASSWORD: root_easy_appointments_secure_2026
      MYSQL_DATABASE: easyappointments
      MYSQL_USER: ea_user
      MYSQL_PASSWORD: ea_password_secure
    volumes:
      - 'ea_mysql_data_2:/var/lib/mysql'
    networks:
      - coolify
  ea-app:
    image: 'alextselegidis/easyappointments:latest'
    environment:
      BASE_URL: 'https://agenda.dental-a.com'
      DB_HOST: ea-mysql
      DB_NAME: easyappointments
      DB_USERNAME: ea_user
      DB_PASSWORD: ea_password_secure
      DEBUG_MODE: 'true'
    labels:
      - traefik.enable=true
      - traefik.http.routers.ea-app.rule=Host(\`agenda.dental-a.com\`)
      - traefik.http.routers.ea-app.entrypoints=https
      - traefik.http.routers.ea-app.tls=true
      - traefik.http.routers.ea-app.tls.certresolver=letsencrypt
      - traefik.http.services.ea-app.loadbalancer.server.port=80
    networks:
      - coolify
    depends_on:
      - ea-mysql
volumes:
  ea_mysql_data_2: null
networks:
  coolify:
    external: true
`;

fetch('http://5.78.221.158:8000/api/v1/services/u9n9qep5s6m6mj94k3yilza7', { 
  method: 'PATCH', 
  headers: { 
    'Authorization': 'Bearer 1|jpsZE1bXv5gmXTS3Kqi0PBgw6P9jBChbUCldEpcE221a5e39', 
    'Content-Type': 'application/json' 
  }, 
  body: JSON.stringify({ 
    docker_compose_raw: Buffer.from(content).toString('base64') 
  }) 
})
.then(r => r.json())
.then(console.log)
.catch(console.error);
