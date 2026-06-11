const fs = require('fs');
const content = `version: '3.8'
services:
  mysql:
    image: 'mysql:8'
    environment:
      MYSQL_ROOT_PASSWORD: root_easy_appointments_secure_2026
      MYSQL_DATABASE: easyappointments
      MYSQL_USER: ea_user
      MYSQL_PASSWORD: ea_password_secure
    volumes:
      - 'ea_mysql_data:/var/lib/mysql'
  app:
    image: 'alextselegidis/easyappointments:latest'
    environment:
      BASE_URL: 'https://agenda.dental-a.com'
      DB_HOST: mysql
      DB_NAME: easyappointments
      DB_USERNAME: ea_user
      DB_PASSWORD: ea_password_secure
      SERVICE_FQDN_APP: 'https://agenda.dental-a.com'
    depends_on:
      - mysql
volumes:
  ea_mysql_data: null
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
